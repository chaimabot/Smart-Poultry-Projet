// context/NotificationsContext.js - FIXED ✅ Compatible AlertController
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  getPoultries,
  getAlerts,
  markAlertAsRead,
  deleteReadAlerts,
  deleteAlertsByIds,
} from "../services/poultry";

const NotificationsContext = createContext();

export function NotificationsProvider({ children }) {
  const [poulaillers, setPoulaillers] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Guard contre les appels simultanés
  const isFetchingRef = useRef(false);

  // ── Normaliser une alerte depuis le modèle Mongoose ───────────────────────
  // Modèle : { poulailler: ObjectId|PopulatedObj, severity: "info"|"warn"|"danger" }
  const normalizeAlert = useCallback((alert, fallbackPoultryId) => {
    // poulailler peut être :
    // 1. ObjectId string : "507f1f77bcf86cd799439011"
    // 2. Objet populé   : { _id: "507f...", name: "Poulailler A" }
    // 3. null/undefined : fallback sur le poulailler parent
    const raw = alert.poulailler;
    let poulaillerId;
    if (raw && typeof raw === "object" && raw._id) {
      poulaillerId = String(raw._id);
    } else if (raw) {
      poulaillerId = String(raw);
    } else {
      poulaillerId = String(fallbackPoultryId);
    }

    // severity validée : "info" | "warn" | "danger"
    const VALID_SEVERITIES = ["info", "warn", "danger"];
    const severity = VALID_SEVERITIES.includes(alert.severity)
      ? alert.severity
      : "info";

    return {
      ...alert,
      _id: String(alert._id),
      poulailler: poulaillerId,
      severity,
      read: Boolean(alert.read),
      createdAt: alert.createdAt || new Date().toISOString(),
      // Champs du formatAlert du controller
      parameter: alert.parameter || null,
      value: alert.value ?? null,
      threshold: alert.threshold ?? null,
      direction: alert.direction || null,
      sensorLabel: alert.sensorLabel || null,
      sensorUnit: alert.sensorUnit || null,
    };
  }, []);

  // ── Fetch principal ───────────────────────────────────────────────────────
  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        // 1. Charger tous les poulaillers
        const poultriesRes = await getPoultries();
        const poultryList = Array.isArray(poultriesRes)
          ? poultriesRes
          : Array.isArray(poultriesRes?.data)
            ? poultriesRes.data
            : [];

        setPoulaillers(poultryList);

        if (poultryList.length === 0) {
          setAlerts([]);
          return;
        }

        // 2. Charger alertes de TOUS les poulaillers en parallèle
        // GET /api/alerts/poulailler/:id
        const alertsResults = await Promise.allSettled(
          poultryList.map((p) => getAlerts(String(p._id))),
        );

        const allAlerts = [];

        alertsResults.forEach((result, index) => {
          const poultry = poultryList[index];

          if (result.status === "fulfilled") {
            // Le controller retourne : { success, count, total, data: [...] }
            const res = result.value;
            const data = Array.isArray(res?.data)
              ? res.data
              : Array.isArray(res)
                ? res
                : [];

            data.forEach((alert) => {
              allAlerts.push(normalizeAlert(alert, poultry._id));
            });
          } else {
            console.warn(
              `⚠️ Alertes non chargées pour "${poultry?.name}":`,
              result.reason?.message || result.reason,
            );
          }
        });

        // 3. Dédupliquer par _id
        const seen = new Set();
        const uniqueAlerts = allAlerts.filter((a) => {
          if (seen.has(a._id)) return false;
          seen.add(a._id);
          return true;
        });

        // 4. Trier : non lues + critiques en premier, puis par date
        uniqueAlerts.sort((a, b) => {
          // Non lues avant lues
          if (a.read !== b.read) return a.read ? 1 : -1;
          // Severity : danger > warn > info
          const sevOrder = { danger: 0, warn: 1, info: 2 };
          const sevDiff =
            (sevOrder[a.severity] ?? 2) - (sevOrder[b.severity] ?? 2);
          if (sevDiff !== 0) return sevDiff;
          // Date décroissante
          return new Date(b.createdAt) - new Date(a.createdAt);
        });

        setAlerts(uniqueAlerts);
      } catch (err) {
        console.error("NotificationsContext fetchData error:", err);
        setError(
          err?.response?.data?.error ||
            err?.response?.data?.message ||
            err?.message ||
            "Erreur de chargement des alertes",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
        isFetchingRef.current = false;
      }
    },
    [normalizeAlert],
  );

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Marquer une alerte comme lue ─────────────────────────────────────────
  // PATCH /api/alerts/:id/read
  const markRead = useCallback(async (alertId) => {
    const id = String(alertId);
    // Optimistic update
    setAlerts((prev) =>
      prev.map((a) => (a._id === id ? { ...a, read: true } : a)),
    );
    try {
      await markAlertAsRead(id);
    } catch (err) {
      console.error("markRead error:", err);
      // Rollback
      setAlerts((prev) =>
        prev.map((a) => (a._id === id ? { ...a, read: false } : a)),
      );
      throw err;
    }
  }, []);

  // ── Marquer toutes comme lues ────────────────────────────────────────────
  // PATCH /api/alerts/:id/read × N (pas d'endpoint bulk dans le controller)
  const markAllRead = useCallback(
    async (poulaillerId) => {
      const targets = alerts.filter((a) => {
        if (a.read) return false;
        if (!poulaillerId || poulaillerId === "all") return true;
        return a.poulailler === String(poulaillerId);
      });

      if (!targets.length) return;

      const ids = new Set(targets.map((a) => a._id));
      // Optimistic update
      setAlerts((prev) =>
        prev.map((a) => (ids.has(a._id) ? { ...a, read: true } : a)),
      );

      try {
        await Promise.all(targets.map((a) => markAlertAsRead(a._id)));
      } catch (err) {
        console.error("markAllRead error:", err);
        // Rollback
        setAlerts((prev) =>
          prev.map((a) => (ids.has(a._id) ? { ...a, read: false } : a)),
        );
        throw err;
      }
    },
    [alerts],
  );

  // ── Supprimer une alerte ─────────────────────────────────────────────────
  // Stratégie : marquer comme lue → DELETE /api/alerts?poultryId=...
  // Le backend DELETE supprime TOUTES les lues du poulailler
  const deleteAlert = useCallback(
    async (alertId) => {
      const id = String(alertId);
      const target = alerts.find((a) => a._id === id);
      if (!target) return;

      // Optimistic : retirer de la liste locale
      setAlerts((prev) => prev.filter((a) => a._id !== id));

      try {
        // 1. Marquer comme lue via API
        await markAlertAsRead(id);
        // 2. Supprimer les lues de ce poulailler via API
        await deleteReadAlerts(target.poulailler);
      } catch (err) {
        console.error("deleteAlert error:", err);
        // Rollback : remettre l'alerte
        if (target) {
          setAlerts((prev) =>
            [...prev, target].sort(
              (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
            ),
          );
        }
        throw err;
      }
    },
    [alerts],
  );

  // ── Supprimer plusieurs alertes ──────────────────────────────────────────
  // Stratégie : marquer toutes comme lues → DELETE par poulailler
  const deleteAlerts = useCallback(
    async (alertIds) => {
      const idsSet = new Set(alertIds.map(String));
      const targets = alerts.filter((a) => idsSet.has(a._id));
      if (!targets.length) return;

      // Optimistic : retirer de la liste locale
      setAlerts((prev) => prev.filter((a) => !idsSet.has(a._id)));

      try {
        // Grouper par poulailler pour optimiser les appels API
        const byPoultry = {};
        targets.forEach((a) => {
          if (!byPoultry[a.poulailler]) byPoultry[a.poulailler] = [];
          byPoultry[a.poulailler].push(a._id);
        });

        // Pour chaque poulailler : marquer comme lues puis supprimer
        await Promise.all(
          Object.entries(byPoultry).map(async ([poulaillerId, ids]) => {
            await Promise.all(ids.map((id) => markAlertAsRead(id)));
            await deleteReadAlerts(poulaillerId);
          }),
        );
      } catch (err) {
        console.error("deleteAlerts error:", err);
        // Rollback
        setAlerts((prev) =>
          [...prev, ...targets].sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
          ),
        );
        throw err;
      }
    },
    [alerts],
  );

  // ── Supprimer toutes les alertes lues ────────────────────────────────────
  // DELETE /api/alerts?poultryId=... pour chaque poulailler
  const deleteAllRead = useCallback(
    async (poulaillerId) => {
      const targets = alerts.filter((a) => {
        if (!a.read) return false;
        if (!poulaillerId || poulaillerId === "all") return true;
        return a.poulailler === String(poulaillerId);
      });

      if (!targets.length) return;

      const idsSet = new Set(targets.map((a) => a._id));
      // Optimistic update
      setAlerts((prev) => prev.filter((a) => !idsSet.has(a._id)));

      try {
        if (!poulaillerId || poulaillerId === "all") {
          // Supprimer les lues pour chaque poulailler
          const poultryIds = [...new Set(targets.map((a) => a.poulailler))];
          await Promise.all(poultryIds.map((pid) => deleteReadAlerts(pid)));
        } else {
          await deleteReadAlerts(poulaillerId);
        }
      } catch (err) {
        console.error("deleteAllRead error:", err);
        // Rollback
        setAlerts((prev) =>
          [...prev, ...targets].sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
          ),
        );
        throw err;
      }
    },
    [alerts],
  );

  return (
    <NotificationsContext.Provider
      value={{
        poulaillers,
        alerts,
        loading,
        error,
        refreshing,
        fetchData: () => fetchData(true),
        markRead,
        markAllRead,
        deleteAlert,
        deleteAlerts,
        deleteAllRead,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationsProvider",
    );
  }
  return context;
};
