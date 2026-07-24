"use strict";

const mongoose = require("mongoose");
const AiAnalysis = require("../models/AiAnalysis");

// ============================================================================
// HELPERS
// ============================================================================

function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizeUrgencyFilter(value) {
  if (!value) return null;
  const v = value.toString().toLowerCase();
  const allowed = ["normal", "attention", "critique", "inconnu"];
  return allowed.includes(v) ? v : null;
}

function normalizeTriggeredBy(value) {
  if (!value) return null;
  const v = value.toString().toLowerCase();
  const allowed = ["esp32-auto", "manual", "cron-auto", "unknown"];
  return allowed.includes(v) ? v : null;
}

// ✅ Convertit une string en ObjectId, retourne null si invalide
function toObjectId(value) {
  if (!value) return null;
  try {
    return new mongoose.Types.ObjectId(value.toString());
  } catch {
    return null;
  }
}

// ============================================================================
// CONTROLLER
// ============================================================================

exports.getAnalysesIA = async (req, res) => {
  try {
    const poulaillerId = toObjectId(req.query.poulailler); // ✅ cast ObjectId
    const urgency = normalizeUrgencyFilter(req.query.urgency);
    const triggeredBy = normalizeTriggeredBy(req.query.triggeredBy);

    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 20);
    const skip = (page - 1) * limit;

    // ── Filtre principal ──────────────────────────────────────────────────────
    const match = {};
    if (poulaillerId) match.poultryId = poulaillerId; // ✅ ObjectId, pas string
    if (urgency) match["result.urgencyLevel"] = urgency;
    if (triggeredBy) match.triggeredBy = triggeredBy;

    // ── Pipeline de base (lookup poulailler + owner) ───────────────────────
    const pipelineBase = [
      { $match: match },
      {
        $lookup: {
          from: "poulaillers",
          localField: "poultryId",
          foreignField: "_id",
          as: "poulaillerDoc",
        },
      },
      {
        $unwind: {
          path: "$poulaillerDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "poulaillerDoc.owner",
          foreignField: "_id",
          as: "ownerDoc",
        },
      },
      {
        $unwind: {
          path: "$ownerDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      { $sort: { createdAt: -1 } },
    ];

    // ── Pipeline page + count en parallèle ────────────────────────────────
    const pipelineForPage = [
      ...pipelineBase,
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          id: "$_id",
          poultryId: 1,
          triggeredBy: 1,
          createdAt: 1,
          result: 1,
          sensors: 1,
          cameraMac: 1,
          image: 1,
          poulailler: {
            _id: "$poulaillerDoc._id",
            name: "$poulaillerDoc.name",
            codeUnique: "$poulaillerDoc.uniqueCode",
            location: "$poulaillerDoc.location",
            owner: {
              firstName: "$ownerDoc.firstName",
              lastName: "$ownerDoc.lastName",
            },
          },
        },
      },
    ];

    const pipelineForCount = [...pipelineBase, { $count: "total" }];

    const [pageDocs, countDocs] = await Promise.all([
      AiAnalysis.aggregate(pipelineForPage),
      AiAnalysis.aggregate(pipelineForCount),
    ]);

    const total = countDocs?.[0]?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / limit));

    // ── Mapping vers le format attendu par le frontend ─────────────────────
    const analyses = pageDocs.map((d) => {
      const poulaillerFront = d.poulailler?._id
        ? {
            id: d.poulailler._id,
            name: d.poulailler.name ?? null,
            codeUnique: d.poulailler.codeUnique ?? null,
            location: d.poulailler.location ?? null,
            owner: d.poulailler.owner?.firstName
              ? {
                  firstName: d.poulailler.owner.firstName,
                  lastName: d.poulailler.owner.lastName,
                }
              : null,
          }
        : null;

      return {
        id: d.id,
        poulailler: poulaillerFront,
        triggeredBy: d.triggeredBy ?? "unknown",
        createdAt: d.createdAt,
        result: {
          healthScore: d.result?.healthScore ?? null,
          urgencyLevel: d.result?.urgencyLevel ?? "inconnu",
          confidence: d.result?.confidence ?? null,
          diagnostic: d.result?.diagnostic ?? null,
          stade_croissance: d.result?.stade_croissance ?? "indéterminé",
          advices: Array.isArray(d.result?.advices) ? d.result.advices : [],
          comptage: d.result?.comptage ?? null,
          maladie_suspectee: d.result?.maladie_suspectee ?? null,
          detections: d.result?.detections ?? null,
          imageAvailable: Boolean(d.image?.url),
          imageUsable: d.result?.imageUsable ?? false,
        },
        image: d.image?.url
          ? { url: d.image.url, thumbnailUrl: d.image.thumbnailUrl ?? null }
          : null,
        sensors: d.sensors ?? {},
        cameraMac: d.cameraMac ?? null,
      };
    });

    // ── KPIs sur l'ensemble du filtre (pas seulement la page) ─────────────
    const kpiPipeline = [
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          critique: {
            $sum: {
              $cond: [{ $eq: ["$result.urgencyLevel", "critique"] }, 1, 0],
            },
          },
          attention: {
            $sum: {
              $cond: [{ $eq: ["$result.urgencyLevel", "attention"] }, 1, 0],
            },
          },
          avgHealthScore: {
            $avg: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$result.healthScore", null] },
                    { $gt: ["$result.healthScore", -1] },
                  ],
                },
                "$result.healthScore",
                null,
              ],
            },
          },
        },
      },
    ];

    const kpiDocs = await AiAnalysis.aggregate(kpiPipeline);
    const kpi = kpiDocs?.[0] ?? {
      total: 0,
      critique: 0,
      attention: 0,
      avgHealthScore: null,
    };

    return res.json({
      success: true,
      data: analyses,
      kpis: {
        total: kpi.total ?? 0,
        critique: kpi.critique ?? 0,
        attention: kpi.attention ?? 0,
        avgHealthScore:
          kpi.avgHealthScore != null && Number.isFinite(kpi.avgHealthScore)
            ? Math.round(kpi.avgHealthScore)
            : null,
      },
      pagination: {
        page,
        limit,
        total,
        pages,
      },
    });
  } catch (err) {
    console.error("[getAnalysesIA ERROR]", err);
    return res.status(500).json({
      success: false,
      error: "Erreur lors du chargement des analyses IA",
    });
  }
};
