// Smart Poultry — Schéma Mongoose pour les analyses IA

"use strict";

const mongoose = require("mongoose");

// ─── Sous-schéma : Comptage ───────────────────────────────────────────────────
const ComptageSchema = new mongoose.Schema(
  {
    estimation: { type: Number, default: null },
    fiabilite: {
      type: String,
      enum: ["faible", "moyenne", "bonne", null],
      default: null,
    },
    note: { type: String, default: null },
  },
  { _id: false },
);

// ─── Sous-schéma : Maladie suspectée ─────────────────────────────────────────
const MaladieSchema = new mongoose.Schema(
  {
    suspicion: { type: Boolean, default: false },
    maladie_probable: { type: String, default: null },
    signes_observes: { type: [String], default: [] },
    urgence_veterinaire: { type: Boolean, default: false },
    confiance: {
      type: String,
      enum: ["faible", "moyenne", "élevée", null],
      default: "faible",
    },
  },
  { _id: false },
);

// ─── Sous-schéma : Détections visuelles ──────────────────────────────────────
const DetectionsSchema = new mongoose.Schema(
  {
    mortalityDetected: { type: Boolean, default: null },
    behaviorNormal: { type: Boolean, default: null },
    predateurDetecte: { type: Boolean, default: null },
    nombreMorts: { type: Number, default: null },
  },
  { _id: false },
);

// ─── Sous-schéma : Résultat principal ────────────────────────────────────────
const ResultSchema = new mongoose.Schema(
  {
    healthScore: { type: Number, min: 0, max: 100, default: null },
    urgencyLevel: {
      type: String,
      enum: ["normal", "attention", "critique", "inconnu"],
      default: "inconnu",
    },
    confidence: { type: Number, min: 0, max: 100, default: null },
    diagnostic: { type: String, default: "" },
    stade_croissance: {
      type: String,
      enum: ["J1-J14", "J14-J28", "J28-J42", "adulte", "indéterminé"],
      default: "indéterminé",
    },
    comptage: { type: ComptageSchema, default: () => ({}) },
    maladie_suspectee: { type: MaladieSchema, default: () => ({}) },
    detections: { type: DetectionsSchema, default: () => ({}) },
    advices: { type: [String], default: [] },
    sensors: { type: Object, default: {} },
    imageAvailable: { type: Boolean, default: false },
    imageUsable: { type: Boolean, default: false },
  },
  { _id: false },
);

// ─── Schéma principal ─────────────────────────────────────────────────────────
const AiAnalysisSchema = new mongoose.Schema(
  {
    poultryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poulailler",
      required: true,
      index: true,
    },
    triggeredBy: {
      type: String,
      enum: ["esp32-auto", "manual", "cron-auto", "unknown"],
      default: "unknown",
    },
    sensors: { type: Object, default: {} },
    result: { type: ResultSchema, default: () => ({}) },
    imageQuality: { type: Object, default: {} },
    image: {
      url: { type: String, default: null },
      thumbnailUrl: { type: String, default: null },
      publicId: { type: String, default: null },
    },
    cameraMac: { type: String, default: null },
  },
  { timestamps: true },
);

// Index pour les requêtes fréquentes
AiAnalysisSchema.index({ poultryId: 1, createdAt: -1 });

module.exports = mongoose.model("AiAnalysis", AiAnalysisSchema);
