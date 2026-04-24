import { useState, useEffect } from "react";
import { dossiersAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";
import ContratPrint from "../../components/ContratPrint";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Poulailler {
  _id: string;
  name: string;
  type: "chair" | "ponte" | "dinde" | "autre";
  animalCount: number;
  surface?: number;
  description: string;
  location: string;
}

interface Dossier {
  _id: string;
  eleveur: {
    _id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    adresse?: string;
  };
  poulailler: {
    name: string;
    animalCount: number;
    surface: number;
    type?: string;
    description?: string;
    location?: string;
  };
  tousPoulaillers?: Poulailler[];
  totalAmount: number;
  advanceAmount: number;
  remainedAmount: number;
  status: "EN_ATTENTE" | "AVANCE_PAYEE" | "TERMINE" | "ANNULE";
  contractNumber: string;
  createdAt: string;
  dateCloture?: string;
  motifCloture?: string;
  dateAnnulation?: string;
  motifAnnulation?: string;
  avanceDejaPercueALAnnulation?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSurface(description?: string): number {
  if (!description) return 0;
  const m = description.match(/Surface:\s*([\d.]+)m²/);
  return m ? parseFloat(m[1]) : 0;
}

const typeLabel: Record<string, string> = {
  chair: "Poulet de chair",
  ponte: "Poule pondeuse",
  dinde: "Dinde",
  autre: "Autre",
};

function densiteBadgeStyle(density: number) {
  if (density > 15)
    return { bg: "#fef2f2", color: "#ba1a1a", label: "Critique" };
  if (density > 10) return { bg: "#fffbeb", color: "#b45309", label: "Élevée" };
  return { bg: "#f0fdf4", color: "#00361a", label: "Optimale" };
}

// ─── Types de filtre ──────────────────────────────────────────────────────────

type FilterStatus =
  | "TOUS"
  | "EN_ATTENTE"
  | "AVANCE_PAYEE"
  | "TERMINE"
  | "ANNULE";

// ─── Modale de Clôture ────────────────────────────────────────────────────────

interface ClotureModalProps {
  dossier: Dossier;
  onConfirm: (motif: string) => Promise<void>;
  onClose: () => void;
}

function ClotureModal({ dossier, onConfirm, onClose }: ClotureModalProps) {
  const [motif, setMotif] = useState("");
  const [loading, setLoading] = useState(false);
  const nomComplet =
    `${dossier.eleveur?.firstName ?? ""} ${dossier.eleveur?.lastName ?? ""}`.trim();

  const handleSubmit = async () => {
    if (!motif.trim()) {
      alert("Veuillez saisir un motif de clôture.");
      return;
    }
    setLoading(true);
    try {
      await onConfirm(motif.trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-slate-700 to-slate-900 px-6 py-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-amber-400 text-xl">
            lock
          </span>
          <div>
            <h2 className="text-white font-bold text-sm">
              Clôturer le dossier
            </h2>
            <p className="text-slate-300 text-xs mt-0.5">
              {nomComplet} — {dossier.contractNumber}
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
            <span className="material-symbols-outlined text-amber-600 text-base flex-shrink-0 mt-0.5">
              warning
            </span>
            <div className="text-xs text-amber-800">
              <p className="font-bold mb-1">Action irréversible</p>
              <p>
                La clôture marquera ce dossier comme <strong>TERMINÉ</strong> et
                désactivera l'accès mobile de l'éleveur. Cette opération ne peut
                pas être annulée.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl p-4 space-y-2">
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wide mb-2">
              Récapitulatif financier
            </p>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Montant total</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {dossier.totalAmount?.toLocaleString("fr-FR", {
                  minimumFractionDigits: 2,
                })}{" "}
                DT
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Avance perçue</span>
              <span className="font-bold text-emerald-700">
                {dossier.advanceAmount?.toLocaleString("fr-FR", {
                  minimumFractionDigits: 2,
                })}{" "}
                DT
              </span>
            </div>
            <div className="flex justify-between text-xs border-t border-slate-200 dark:border-slate-700 pt-2 mt-1">
              <span className="text-slate-500">Solde à encaisser</span>
              <span
                className={`font-bold ${dossier.remainedAmount > 0 ? "text-rose-600" : "text-emerald-700"}`}
              >
                {dossier.remainedAmount?.toLocaleString("fr-FR", {
                  minimumFractionDigits: 2,
                })}{" "}
                DT
              </span>
            </div>
            {dossier.remainedAmount > 0 && (
              <p className="text-[10px] text-rose-500 mt-1">
                ⚠ Un solde reste dû. Assurez-vous que le paiement a été reçu
                avant de clôturer.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Motif de clôture <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={3}
              placeholder="Ex : Installation terminée, matériel livré et validé par l'éleveur."
              className="w-full bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 resize-none transition"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !motif.trim()}
              className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center gap-2 active:scale-95"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">
                    progress_activity
                  </span>
                  Clôture…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">
                    lock
                  </span>
                  Confirmer la clôture
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modale d'Annulation ──────────────────────────────────────────────────────

interface AnnulationModalProps {
  dossier: Dossier;
  onConfirm: (motif: string) => Promise<void>;
  onClose: () => void;
}

function AnnulationModal({
  dossier,
  onConfirm,
  onClose,
}: AnnulationModalProps) {
  const [motif, setMotif] = useState("");
  const [loading, setLoading] = useState(false);
  const nomComplet =
    `${dossier.eleveur?.firstName ?? ""} ${dossier.eleveur?.lastName ?? ""}`.trim();
  const avancePercue = dossier.status === "AVANCE_PAYEE";

  const handleSubmit = async () => {
    if (!motif.trim()) {
      alert("Veuillez saisir un motif d'annulation.");
      return;
    }
    setLoading(true);
    try {
      await onConfirm(motif.trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-rose-700 to-rose-900 px-6 py-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-rose-200 text-xl">
            cancel
          </span>
          <div>
            <h2 className="text-white font-bold text-sm">Annuler le dossier</h2>
            <p className="text-rose-200 text-xs mt-0.5">
              {nomComplet} — {dossier.contractNumber}
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {avancePercue ? (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3">
              <span className="material-symbols-outlined text-rose-600 text-base flex-shrink-0 mt-0.5">
                payments
              </span>
              <div className="text-xs text-rose-800">
                <p className="font-bold mb-1">
                  Avance déjà perçue — régularisation requise
                </p>
                <p>
                  Ce dossier est en statut <strong>AVANCE PAYÉE</strong>.
                  L'annulation désactivera l'accès mobile de l'éleveur mais{" "}
                  <strong>
                    l'avance de {dossier.advanceAmount?.toLocaleString("fr-FR")}{" "}
                    DT devra être régularisée manuellement
                  </strong>{" "}
                  (remboursement ou avoir).
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
              <span className="material-symbols-outlined text-amber-600 text-base flex-shrink-0 mt-0.5">
                info
              </span>
              <div className="text-xs text-amber-800">
                <p className="font-bold mb-1">Dossier en attente</p>
                <p>
                  Aucune avance n'a été perçue. L'annulation supprimera
                  simplement ce dossier du flux de traitement.
                </p>
              </div>
            </div>
          )}

          <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl p-4 space-y-2">
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wide mb-2">
              Récapitulatif financier
            </p>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Montant total</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {dossier.totalAmount?.toLocaleString("fr-FR", {
                  minimumFractionDigits: 2,
                })}{" "}
                DT
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Avance perçue</span>
              <span
                className={`font-bold ${avancePercue ? "text-rose-600" : "text-slate-400"}`}
              >
                {dossier.advanceAmount?.toLocaleString("fr-FR", {
                  minimumFractionDigits: 2,
                })}{" "}
                DT
                {avancePercue && " ⚠ à régulariser"}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Motif d'annulation <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={3}
              placeholder="Ex : Client désisté, projet abandonné, doublon de dossier…"
              className="w-full bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200 resize-none transition"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              Retour
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !motif.trim()}
              className="flex-1 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center gap-2 active:scale-95"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">
                    progress_activity
                  </span>
                  Annulation…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">
                    cancel
                  </span>
                  Confirmer l'annulation
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modale de Suppression ────────────────────────────────────────────────────

interface SuppressionModalProps {
  dossier: Dossier;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

function SuppressionModal({
  dossier,
  onConfirm,
  onClose,
}: SuppressionModalProps) {
  const [loading, setLoading] = useState(false);
  const nomComplet =
    `${dossier.eleveur?.firstName ?? ""} ${dossier.eleveur?.lastName ?? ""}`.trim();

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-red-700 to-red-900 px-6 py-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-red-200 text-xl">
            delete_forever
          </span>
          <div>
            <h2 className="text-white font-bold text-sm">
              Supprimer le dossier
            </h2>
            <p className="text-red-200 text-xs mt-0.5">
              {nomComplet} — {dossier.contractNumber}
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
            <span className="material-symbols-outlined text-red-600 text-base flex-shrink-0 mt-0.5">
              report
            </span>
            <div className="text-xs text-red-800">
              <p className="font-bold mb-1">Suppression définitive</p>
              <p>
                Cette action supprimera <strong>définitivement</strong> le
                dossier <strong>{dossier.contractNumber}</strong> de la base de
                données. Aucune récupération ne sera possible.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl p-4 space-y-1.5">
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wide mb-2">
              Dossier concerné
            </p>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Éleveur</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {nomComplet}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Contrat</span>
              <span className="font-mono font-bold text-emerald-700">
                {dossier.contractNumber}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Statut</span>
              <span
                className={`font-bold ${dossier.status === "ANNULE" ? "text-rose-600" : "text-slate-600"}`}
              >
                {dossier.status === "ANNULE" ? "Annulé" : "Terminé"}
              </span>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 py-2 rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center gap-2 active:scale-95"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">
                    progress_activity
                  </span>
                  Suppression…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">
                    delete_forever
                  </span>
                  Supprimer définitivement
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function Dossiers() {
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dossierImpression, setDossierImpression] = useState<Dossier | null>(
    null,
  );
  const [dossierCloture, setDossierCloture] = useState<Dossier | null>(null);
  const [dossierAnnulation, setDossierAnnulation] = useState<Dossier | null>(
    null,
  );
  const [dossierSuppression, setDossierSuppression] = useState<Dossier | null>(
    null,
  );

  // Filtre actif
  const [activeFilter, setActiveFilter] = useState<FilterStatus>("TOUS");

  const [detailId, setDetailId] = useState<string | null>(null);
  const detailDossier = dossiers.find((d) => d._id === detailId) ?? null;

  const [editAmounts, setEditAmounts] = useState<
    Record<string, { total: string; advance: string; saving: boolean }>
  >({});

  // ── Chargement ───────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const response = await dossiersAPI.getAll();
        if (response.data?.success) {
          const data: Dossier[] =
            response.data.data?.filter((d: Dossier) => d && d._id) ?? [];
          setDossiers(data);
          const init: typeof editAmounts = {};
          data.forEach((d) => {
            init[d._id] = {
              total: d.totalAmount?.toString() ?? "0",
              advance: d.advanceAmount?.toString() ?? "0",
              saving: false,
            };
          });
          setEditAmounts(init);
        }
      } catch {
        setError("Impossible de charger les dossiers.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Dossiers filtrés ─────────────────────────────────────────────────────────
  const dossiersFiltres = dossiers.filter((d) => {
    if (activeFilter === "TOUS") return true;
    return d.status === activeFilter;
  });

  // Comptages pour badges
  const counts = {
    TOUS: dossiers.length,
    EN_ATTENTE: dossiers.filter((d) => d.status === "EN_ATTENTE").length,
    AVANCE_PAYEE: dossiers.filter((d) => d.status === "AVANCE_PAYEE").length,
    TERMINE: dossiers.filter((d) => d.status === "TERMINE").length,
    ANNULE: dossiers.filter((d) => d.status === "ANNULE").length,
  };

  // ── Valider dossier ──────────────────────────────────────────────────────────
  const handleValidate = async (id: string) => {
    if (
      !window.confirm(
        "Valider ce dossier et activer l'accès mobile de l'éleveur ?",
      )
    )
      return;
    try {
      const response = await dossiersAPI.validate(id);
      if (response.data.success) {
        setDossiers((prev) =>
          prev.map((d) =>
            d._id === id ? { ...d, status: "AVANCE_PAYEE" } : d,
          ),
        );
      }
    } catch {
      alert("Erreur lors de la validation.");
    }
  };

  // ── Clôturer dossier ─────────────────────────────────────────────────────────
  const handleCloture = async (motif: string) => {
    if (!dossierCloture) return;
    try {
      const response = await dossiersAPI.clore?.(dossierCloture._id, {
        motifCloture: motif,
      });
      if (response?.data?.success) {
        setDossiers((prev) =>
          prev.map((d) =>
            d._id === dossierCloture._id
              ? {
                  ...d,
                  status: "TERMINE",
                  dateCloture: new Date().toISOString(),
                  motifCloture: motif,
                }
              : d,
          ),
        );
        setDossierCloture(null);
      }
    } catch {
      alert("Erreur lors de la clôture du dossier.");
    }
  };

  // ── Annuler dossier ──────────────────────────────────────────────────────────
  const handleAnnulation = async (motif: string) => {
    if (!dossierAnnulation) return;
    try {
      const response = await dossiersAPI.annuler(dossierAnnulation._id, {
        motifAnnulation: motif,
      });
      if (response?.data?.success) {
        setDossiers((prev) =>
          prev.map((d) =>
            d._id === dossierAnnulation._id
              ? {
                  ...d,
                  status: "ANNULE",
                  dateAnnulation: new Date().toISOString(),
                  motifAnnulation: motif,
                  avanceDejaPercueALAnnulation: response.data.avanceDejaPercue,
                }
              : d,
          ),
        );
        setDossierAnnulation(null);
      }
    } catch {
      alert("Erreur lors de l'annulation du dossier.");
    }
  };

  // ── Supprimer dossier ────────────────────────────────────────────────────────
  const handleSuppression = async () => {
    if (!dossierSuppression) return;
    try {
      const response = await dossiersAPI.delete?.(dossierSuppression._id);
      if (response?.data?.success) {
        setDossiers((prev) =>
          prev.filter((d) => d._id !== dossierSuppression._id),
        );
        // Fermer le panneau détail si c'était ce dossier
        if (detailId === dossierSuppression._id) setDetailId(null);
        setDossierSuppression(null);
      }
    } catch {
      alert("Erreur lors de la suppression du dossier.");
    }
  };

  // ── Sauvegarder montants ─────────────────────────────────────────────────────
  const handleSaveAmounts = async (id: string) => {
    const ea = editAmounts[id];
    if (!ea) return;
    const total = parseFloat(ea.total) || 0;
    const advance = parseFloat(ea.advance) || 0;
    if (advance > total) {
      alert("L'avance ne peut pas dépasser le montant total.");
      return;
    }
    setEditAmounts((prev) => ({
      ...prev,
      [id]: { ...prev[id], saving: true },
    }));
    try {
      await dossiersAPI.updateAmounts?.(id, {
        totalAmount: total,
        advanceAmount: advance,
      });
      const remained = total - advance;
      setDossiers((prev) =>
        prev.map((d) =>
          d._id === id
            ? {
                ...d,
                totalAmount: total,
                advanceAmount: advance,
                remainedAmount: remained,
              }
            : d,
        ),
      );
    } catch {
      alert("Erreur lors de la sauvegarde des montants.");
    } finally {
      setEditAmounts((prev) => ({
        ...prev,
        [id]: { ...prev[id], saving: false },
      }));
    }
  };

  // ── Badge statut ──────────────────────────────────────────────────────────────
  const statutBadge = (status: Dossier["status"]) => {
    const map = {
      EN_ATTENTE: {
        cls: "bg-amber-100 text-amber-700 border border-amber-200",
        label: "En attente",
        icon: "schedule",
      },
      AVANCE_PAYEE: {
        cls: "bg-emerald-100 text-emerald-700 border border-emerald-200",
        label: "Avance payée",
        icon: "verified",
      },
      TERMINE: {
        cls: "bg-slate-200 text-slate-600 border border-slate-300",
        label: "Terminé",
        icon: "lock",
      },
      ANNULE: {
        cls: "bg-rose-100 text-rose-600 border border-rose-200",
        label: "Annulé",
        icon: "cancel",
      },
    };
    const s = map[status] ?? map.EN_ATTENTE;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${s.cls}`}
      >
        <span className="material-symbols-outlined text-[11px]">{s.icon}</span>
        {s.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-700" />
      </div>
    );
  }

  // ─── Configuration des filtres ────────────────────────────────────────────────
  const filters: {
    key: FilterStatus;
    label: string;
    icon: string;
    activeClass: string;
    inactiveClass: string;
  }[] = [
    {
      key: "TOUS",
      label: "Tous",
      icon: "folder",
      activeClass: "bg-slate-800 text-white border-slate-800",
      inactiveClass:
        "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
    },
    {
      key: "EN_ATTENTE",
      label: "En attente",
      icon: "schedule",
      activeClass: "bg-amber-500 text-white border-amber-500",
      inactiveClass:
        "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
    },
    {
      key: "AVANCE_PAYEE",
      label: "Actifs",
      icon: "verified",
      activeClass: "bg-emerald-700 text-white border-emerald-700",
      inactiveClass:
        "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    },
    {
      key: "TERMINE",
      label: "Clôturés",
      icon: "lock",
      activeClass: "bg-slate-600 text-white border-slate-600",
      inactiveClass:
        "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
    },
    {
      key: "ANNULE",
      label: "Annulés",
      icon: "cancel",
      activeClass: "bg-rose-600 text-white border-rose-600",
      inactiveClass:
        "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100",
    },
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto p-6">
          {/* ── En-tête ── */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">Gestion des Dossiers</h1>
              <p className="text-slate-500 text-sm">
                Contrats, paiements et activations éleveurs
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold px-3 py-2 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                {counts.EN_ATTENTE} en attente
              </div>
              <div className="hidden sm:flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-2 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {counts.AVANCE_PAYEE} actifs
              </div>
              <div className="hidden sm:flex items-center gap-2 bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold px-3 py-2 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                {counts.TERMINE} clôturés
              </div>
              <div className="hidden sm:flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-3 py-2 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                {counts.ANNULE} annulés
              </div>
            </div>
          </div>

          {/* ── Barre de filtres ── */}
          <div className="flex flex-wrap gap-2 mb-6">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setActiveFilter(f.key);
                  setDetailId(null); // Fermer le panneau détail lors du changement de filtre
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all active:scale-95 ${
                  activeFilter === f.key ? f.activeClass : f.inactiveClass
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {f.icon}
                </span>
                {f.label}
                <span
                  className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    activeFilter === f.key
                      ? "bg-white/20 text-white"
                      : "bg-white/70 text-slate-600"
                  }`}
                >
                  {counts[f.key]}
                </span>
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              {error}
            </div>
          )}

          {/* ── Tableau principal ── */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-5 py-4 text-xs font-bold uppercase text-slate-500">
                      Éleveur
                    </th>
                    <th className="px-5 py-4 text-xs font-bold uppercase text-slate-500">
                      Poulaillers
                    </th>
                    <th className="px-5 py-4 text-xs font-bold uppercase text-slate-500 w-72">
                      Finances (DT)
                    </th>
                    <th className="px-5 py-4 text-xs font-bold uppercase text-slate-500">
                      Statut
                    </th>
                    <th className="px-5 py-4 text-xs font-bold uppercase text-slate-500 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {dossiersFiltres
                    .filter((d) => d?._id)
                    .map((d) => {
                      const ea = editAmounts[d._id];
                      const totalVal = parseFloat(ea?.total ?? "0") || 0;
                      const advVal = parseFloat(ea?.advance ?? "0") || 0;
                      const resteVal = totalVal - advVal;
                      const poulaillers = d.tousPoulaillers ?? [
                        d.poulailler as any,
                      ];
                      const isTermine = d.status === "TERMINE";
                      const isAnnule = d.status === "ANNULE";
                      const isReadOnly = isTermine || isAnnule;

                      // Bouton détails actif seulement si plusieurs poulaillers
                      const hasMultiplePoulaillers = poulaillers.length > 1;

                      return (
                        <tr
                          key={d._id}
                          className={`hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition-colors ${
                            detailId === d._id
                              ? "bg-emerald-50/40 dark:bg-emerald-900/10"
                              : ""
                          } ${isReadOnly ? "opacity-70" : ""}`}
                        >
                          {/* ── Éleveur ── */}
                          <td className="px-5 py-4">
                            <div className="font-semibold text-sm">
                              {d.eleveur?.firstName ?? "Inconnu"}{" "}
                              {d.eleveur?.lastName ?? ""}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {d.eleveur?.phone ?? "—"}
                            </div>
                            <div className="text-xs text-slate-400">
                              {d.eleveur?.email ?? "—"}
                            </div>
                            <div className="text-[10px] text-emerald-700 font-mono mt-1 bg-emerald-50 inline-block px-1.5 py-0.5 rounded">
                              {d.contractNumber}
                            </div>
                            {d.eleveur?.adresse && (
                              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[11px]">
                                  location_on
                                </span>
                                {d.eleveur.adresse}
                              </div>
                            )}

                            {isTermine && d.dateCloture && (
                              <div className="mt-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg px-2 py-1.5">
                                <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wide">
                                  Clôturé le
                                </p>
                                <p className="text-[10px] text-slate-600 dark:text-slate-300 font-semibold">
                                  {new Date(d.dateCloture).toLocaleDateString(
                                    "fr-FR",
                                    {
                                      day: "2-digit",
                                      month: "long",
                                      year: "numeric",
                                    },
                                  )}
                                </p>
                                {d.motifCloture && (
                                  <p className="text-[10px] text-slate-500 italic mt-0.5 line-clamp-2">
                                    "{d.motifCloture}"
                                  </p>
                                )}
                              </div>
                            )}

                            {isAnnule && d.dateAnnulation && (
                              <div className="mt-1.5 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 rounded-lg px-2 py-1.5">
                                <p className="text-[9px] text-rose-400 uppercase font-bold tracking-wide">
                                  Annulé le
                                </p>
                                <p className="text-[10px] text-rose-600 dark:text-rose-300 font-semibold">
                                  {new Date(
                                    d.dateAnnulation,
                                  ).toLocaleDateString("fr-FR", {
                                    day: "2-digit",
                                    month: "long",
                                    year: "numeric",
                                  })}
                                </p>
                                {d.motifAnnulation && (
                                  <p className="text-[10px] text-rose-500 italic mt-0.5 line-clamp-2">
                                    "{d.motifAnnulation}"
                                  </p>
                                )}
                                {d.avanceDejaPercueALAnnulation && (
                                  <p className="text-[9px] text-rose-600 font-bold mt-1">
                                    ⚠ Avance à régulariser
                                  </p>
                                )}
                              </div>
                            )}
                          </td>

                          {/* ── Poulaillers ── */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1.5 mb-2">
                              <span className="material-symbols-outlined text-emerald-700 text-sm">
                                warehouse
                              </span>
                              <span className="text-xs font-bold text-emerald-700">
                                {poulaillers.length} bâtiment
                                {poulaillers.length > 1 ? "s" : ""}
                              </span>
                            </div>
                            <div className="space-y-1.5 max-w-[220px]">
                              {poulaillers
                                .slice(0, 3)
                                .map((p: any, idx: number) => {
                                  const surface =
                                    p.surface ?? parseSurface(p.description);
                                  const density =
                                    surface > 0 ? p.animalCount / surface : 0;
                                  const ds = densiteBadgeStyle(density);
                                  return (
                                    <div
                                      key={p._id ?? idx}
                                      className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg px-2 py-1.5"
                                    >
                                      <div className="min-w-0">
                                        <div className="text-xs font-semibold text-slate-700 truncate">
                                          {p.name}
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                          {p.animalCount?.toLocaleString(
                                            "fr-FR",
                                          )}{" "}
                                          têtes · {surface}m²
                                        </div>
                                        {(p.type || p.description) && (
                                          <div className="text-[10px] text-slate-400">
                                            {typeLabel[p.type] ?? p.type ?? "—"}
                                          </div>
                                        )}
                                      </div>
                                      {density > 0 && (
                                        <div
                                          className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                          style={{
                                            background: ds.bg,
                                            color: ds.color,
                                          }}
                                        >
                                          {density.toFixed(1)}/m²
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              {poulaillers.length > 3 && (
                                <button
                                  onClick={() =>
                                    setDetailId(
                                      detailId === d._id ? null : d._id,
                                    )
                                  }
                                  className="text-[10px] text-emerald-600 font-semibold hover:underline"
                                >
                                  +{poulaillers.length - 3} autres → voir tout
                                </button>
                              )}
                            </div>
                            <div className="mt-2 text-[10px] text-slate-500 flex gap-3">
                              <span>
                                Total:{" "}
                                <strong className="text-slate-700">
                                  {poulaillers
                                    .reduce(
                                      (s: number, p: any) =>
                                        s + (p.animalCount ?? 0),
                                      0,
                                    )
                                    .toLocaleString("fr-FR")}
                                </strong>{" "}
                                têtes
                              </span>
                              <span>
                                Surface:{" "}
                                <strong className="text-slate-700">
                                  {poulaillers
                                    .reduce(
                                      (s: number, p: any) =>
                                        s +
                                        (p.surface ??
                                          parseSurface(p.description)),
                                      0,
                                    )
                                    .toLocaleString("fr-FR")}
                                </strong>{" "}
                                m²
                              </span>
                            </div>
                          </td>

                          {/* ── Finances ── */}
                          <td className="px-5 py-4">
                            <div className="space-y-2 w-64">
                              <div className="flex items-center gap-2">
                                <label className="text-[10px] text-slate-400 w-14 flex-shrink-0">
                                  Total
                                </label>
                                <div className="relative flex-1">
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={ea?.total ?? ""}
                                    disabled={isReadOnly}
                                    onChange={(e) =>
                                      setEditAmounts((prev) => ({
                                        ...prev,
                                        [d._id]: {
                                          ...prev[d._id],
                                          total: e.target.value,
                                        },
                                      }))
                                    }
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 transition pr-8 disabled:opacity-60 disabled:cursor-not-allowed"
                                    placeholder="0.00"
                                  />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-bold">
                                    DT
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-[10px] text-emerald-600 w-14 flex-shrink-0 font-semibold">
                                  Avance
                                </label>
                                <div className="relative flex-1">
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={ea?.advance ?? ""}
                                    disabled={isReadOnly}
                                    onChange={(e) =>
                                      setEditAmounts((prev) => ({
                                        ...prev,
                                        [d._id]: {
                                          ...prev[d._id],
                                          advance: e.target.value,
                                        },
                                      }))
                                    }
                                    className="w-full bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 transition pr-8 disabled:opacity-60 disabled:cursor-not-allowed"
                                    placeholder="0.00"
                                  />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-emerald-500 font-bold">
                                    DT
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-[10px] text-rose-500 w-14 flex-shrink-0 font-semibold">
                                  Reste
                                </label>
                                <div
                                  className={`flex-1 bg-rose-50 border rounded-lg px-3 py-1.5 text-xs font-bold text-right ${
                                    resteVal < 0
                                      ? "border-red-300 text-red-600"
                                      : "border-rose-200 text-rose-600"
                                  }`}
                                >
                                  {resteVal < 0 ? "⚠ " : ""}
                                  {resteVal.toLocaleString("fr-FR", {
                                    minimumFractionDigits: 2,
                                  })}{" "}
                                  DT
                                </div>
                              </div>
                              {!isReadOnly && (
                                <button
                                  onClick={() => handleSaveAmounts(d._id)}
                                  disabled={ea?.saving}
                                  className="w-full flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition active:scale-95"
                                >
                                  {ea?.saving ? (
                                    <>
                                      <span className="material-symbols-outlined text-xs animate-spin">
                                        progress_activity
                                      </span>
                                      Sauvegarde…
                                    </>
                                  ) : (
                                    <>
                                      <span className="material-symbols-outlined text-xs">
                                        save
                                      </span>
                                      Enregistrer montants
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </td>

                          {/* ── Statut ── */}
                          <td className="px-5 py-4">
                            <div className="space-y-2">
                              {statutBadge(d.status)}
                              <div className="text-[10px] text-slate-400 mt-1">
                                {new Date(d.createdAt).toLocaleDateString(
                                  "fr-FR",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )}
                              </div>
                            </div>
                          </td>

                          {/* ── Actions ── */}
                          <td className="px-5 py-4 text-right">
                            <div className="flex flex-col items-end gap-2">
                              {/* Détails — visible uniquement si plusieurs poulaillers */}
                              {hasMultiplePoulaillers && (
                                <button
                                  onClick={() =>
                                    setDetailId(
                                      detailId === d._id ? null : d._id,
                                    )
                                  }
                                  title="Voir tous les poulaillers"
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all active:scale-95 ${
                                    detailId === d._id
                                      ? "bg-emerald-700 text-white border-emerald-700"
                                      : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    expand_content
                                  </span>
                                  <span className="hidden sm:inline">
                                    Détails
                                  </span>
                                </button>
                              )}

                              {/* Imprimer */}
                              <button
                                onClick={() => setDossierImpression(d)}
                                title="Imprimer le contrat officiel"
                                disabled={d.status === "EN_ATTENTE" || isAnnule}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                              >
                                <span className="material-symbols-outlined text-sm">
                                  print
                                </span>
                                <span className="hidden sm:inline">
                                  Contrat
                                </span>
                              </button>

                              {/* Valider */}
                              {d.status === "EN_ATTENTE" && (
                                <button
                                  onClick={() => handleValidate(d._id)}
                                  className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition active:scale-95"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    verified
                                  </span>
                                  <span>Valider</span>
                                </button>
                              )}

                              {/* Clôturer */}
                              {d.status === "AVANCE_PAYEE" && (
                                <button
                                  onClick={() => setDossierCloture(d)}
                                  title="Clôturer définitivement le dossier"
                                  className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition active:scale-95"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    lock
                                  </span>
                                  <span>Clôturer</span>
                                </button>
                              )}

                              {/* Annuler — disponible pour EN_ATTENTE et AVANCE_PAYEE uniquement */}
                              {(d.status === "EN_ATTENTE" ||
                                d.status === "AVANCE_PAYEE") && (
                                <button
                                  onClick={() => setDossierAnnulation(d)}
                                  title="Annuler ce dossier"
                                  className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition active:scale-95"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    cancel
                                  </span>
                                  <span>Annuler</span>
                                </button>
                              )}

                              {/* Supprimer — disponible uniquement pour TERMINE et ANNULE */}
                              {(isTermine || isAnnule) && (
                                <button
                                  onClick={() => setDossierSuppression(d)}
                                  title="Supprimer définitivement ce dossier"
                                  className="flex items-center gap-1.5 bg-red-700 hover:bg-red-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition active:scale-95"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    delete_forever
                                  </span>
                                  <span className="hidden sm:inline">
                                    Supprimer
                                  </span>
                                </button>
                              )}

                              {/* Badges lecture seule */}
                              {isTermine && (
                                <span className="flex items-center gap-1 text-[10px] text-slate-400 italic px-2">
                                  <span className="material-symbols-outlined text-[11px]">
                                    lock
                                  </span>
                                  Clôturé
                                </span>
                              )}
                              {isAnnule && (
                                <span className="flex items-center gap-1 text-[10px] text-rose-400 italic px-2">
                                  <span className="material-symbols-outlined text-[11px]">
                                    cancel
                                  </span>
                                  Annulé
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                  {dossiersFiltres.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center">
                        <span className="material-symbols-outlined text-4xl text-slate-300 block mb-3">
                          folder_open
                        </span>
                        <p className="text-slate-500 font-medium">
                          {activeFilter === "TOUS"
                            ? "Aucun dossier trouvé."
                            : `Aucun dossier avec le statut "${filters.find((f) => f.key === activeFilter)?.label}".`}
                        </p>
                        {activeFilter !== "TOUS" && (
                          <button
                            onClick={() => setActiveFilter("TOUS")}
                            className="mt-3 text-xs text-emerald-600 font-semibold hover:underline"
                          >
                            Voir tous les dossiers
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Panneau détail poulaillers ── */}
          {detailDossier && (
            <div className="mt-4 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-xl shadow-sm overflow-hidden animate-in slide-in-from-top-2 duration-200">
              <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 px-6 py-4 flex justify-between items-center">
                <div>
                  <h2 className="text-white font-bold text-sm">
                    Tous les poulaillers — {detailDossier.eleveur?.firstName}{" "}
                    {detailDossier.eleveur?.lastName}
                  </h2>
                  <p className="text-emerald-200 text-xs mt-0.5">
                    {
                      (
                        detailDossier.tousPoulaillers ?? [
                          detailDossier.poulailler as any,
                        ]
                      ).length
                    }{" "}
                    bâtiments enregistrés · {detailDossier.contractNumber}
                  </p>
                </div>
                <button
                  onClick={() => setDetailId(null)}
                  className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-1.5 transition"
                >
                  <span className="material-symbols-outlined text-sm">
                    close
                  </span>
                </button>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 pb-5 border-b border-slate-100 dark:border-slate-700">
                  <InfoCell
                    label="Email"
                    value={detailDossier.eleveur?.email ?? "—"}
                    icon="mail"
                  />
                  <InfoCell
                    label="Téléphone"
                    value={detailDossier.eleveur?.phone ?? "—"}
                    icon="call"
                  />
                  <InfoCell
                    label="Adresse"
                    value={detailDossier.eleveur?.adresse ?? "—"}
                    icon="location_on"
                  />
                  <InfoCell
                    label="Inscription"
                    value={new Date(detailDossier.createdAt).toLocaleDateString(
                      "fr-FR",
                      {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      },
                    )}
                    icon="calendar_today"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {(
                    detailDossier.tousPoulaillers ?? [
                      detailDossier.poulailler as any,
                    ]
                  ).map((p: any, idx: number) => {
                    const surface = p.surface ?? parseSurface(p.description);
                    const density = surface > 0 ? p.animalCount / surface : 0;
                    const ds = densiteBadgeStyle(density);
                    const emoji = [
                      "🐔",
                      "🏠",
                      "🌾",
                      "⚡",
                      "🔬",
                      "🌿",
                      "💡",
                      "🏗️",
                    ][idx % 8];
                    return (
                      <div
                        key={p._id ?? idx}
                        className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
                      >
                        <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-700 to-emerald-900">
                          <span className="text-lg">{emoji}</span>
                          <div className="min-w-0">
                            <p className="text-white font-bold text-sm truncate">
                              {p.name}
                            </p>
                            <p className="text-emerald-200 text-[10px]">
                              Bâtiment #{idx + 1}
                            </p>
                          </div>
                        </div>
                        <div className="p-4 space-y-2">
                          <DetailRow
                            label="Type"
                            value={typeLabel[p.type] ?? p.type ?? "—"}
                          />
                          <DetailRow
                            label="Volailles"
                            value={
                              (p.animalCount ?? 0).toLocaleString("fr-FR") +
                              " têtes"
                            }
                          />
                          <DetailRow
                            label="Surface"
                            value={surface > 0 ? `${surface} m²` : "—"}
                          />
                          {p.location && (
                            <DetailRow label="Adresse" value={p.location} />
                          )}
                          {density > 0 && (
                            <div className="flex justify-between items-center pt-1">
                              <span className="text-[10px] text-slate-500">
                                Densité
                              </span>
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{ background: ds.bg, color: ds.color }}
                              >
                                {density.toFixed(2)} /m² — {ds.label}
                              </span>
                            </div>
                          )}
                          {p.description && (
                            <p className="text-[10px] text-slate-400 border-t border-slate-200 dark:border-slate-700 pt-2 mt-1">
                              {p.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Modal Contrat ── */}
      {dossierImpression && (
        <ContratPrint
          dossier={dossierImpression}
          onClose={() => setDossierImpression(null)}
        />
      )}

      {/* ── Modal Clôture ── */}
      {dossierCloture && (
        <ClotureModal
          dossier={dossierCloture}
          onConfirm={handleCloture}
          onClose={() => setDossierCloture(null)}
        />
      )}

      {/* ── Modal Annulation ── */}
      {dossierAnnulation && (
        <AnnulationModal
          dossier={dossierAnnulation}
          onConfirm={handleAnnulation}
          onClose={() => setDossierAnnulation(null)}
        />
      )}

      {/* ── Modal Suppression ── */}
      {dossierSuppression && (
        <SuppressionModal
          dossier={dossierSuppression}
          onConfirm={handleSuppression}
          onClose={() => setDossierSuppression(null)}
        />
      )}
    </div>
  );
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function InfoCell({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="material-symbols-outlined text-emerald-600 text-base mt-0.5">
        {icon}
      </span>
      <div>
        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">
          {label}
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-200 font-medium">
          {value}
        </p>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-[10px] text-slate-400 flex-shrink-0">{label}</span>
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 text-right">
        {value}
      </span>
    </div>
  );
}
