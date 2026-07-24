import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  densite?: number;
  description?: string;
  location?: string;
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
    status?: "pending" | "active" | "inactive" | "archived";
    isActive?: boolean;
    hasInviteToken?: boolean;
  };
  poulailler: Poulailler;
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
  contratSignePdfUrl?: string;
  contratSigneDate?: string;
  etapes?: {
    dossierValide?: boolean;
    contratSigne?: boolean;
    esp32Installe?: boolean;
    invitationEnvoyee?: boolean;
  };
  esp32NbCouverts: number;
  esp32NbTotal: number;
}

interface EditAmount {
  total: string;
  advance: string;
  saving: boolean;
  dirty: boolean;
}

type FilterStatus =
  | "TOUS"
  | "EN_ATTENTE"
  | "AVANCE_PAYEE"
  | "TERMINE"
  | "ANNULE";

// ─── Normalisation MongoDB ─────────────────────────────────────────────────────

function resolveOid(val: unknown): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (typeof obj.$oid === "string") return obj.$oid;
    if (typeof obj.toString === "function") return obj.toString();
  }
  return String(val ?? "");
}

function resolveContractNumber(raw: Record<string, unknown>): string {
  if (
    raw.contractNumber &&
    typeof raw.contractNumber === "string" &&
    raw.contractNumber.trim() !== ""
  ) {
    return raw.contractNumber as string;
  }
  const id = resolveOid(raw._id);
  return `SP-${id.slice(-6).toUpperCase()}`;
}

function normalizePoulailler(p: unknown): Poulailler {
  if (!p || typeof p !== "object")
    return { _id: "", name: "—", type: "autre", animalCount: 0 };
  const raw = p as Record<string, unknown>;
  return {
    ...(raw as Poulailler),
    _id: resolveOid(raw._id),
  };
}

function isPoulaillerValid(p: Poulailler): boolean {
  return !!p && !!p._id && p._id !== "" && p.name !== "—" && p.name !== "";
}

function normalizeDossier(raw: Record<string, unknown>): Dossier {
  const eleveurRaw = (raw.eleveur ?? {}) as Record<string, unknown>;
  const poulaillerRaw = raw.poulailler as Record<string, unknown> | undefined;

  let tousPoulaillers: Poulailler[] | undefined;
  if (Array.isArray(raw.tousPoulaillers)) {
    tousPoulaillers = (raw.tousPoulaillers as unknown[]).map(
      normalizePoulailler,
    );
  }

  if (!tousPoulaillers || tousPoulaillers.length === 0) {
    if (poulaillerRaw) {
      const normalizedPoulailler = normalizePoulailler(poulaillerRaw);
      if (isPoulaillerValid(normalizedPoulailler)) {
        tousPoulaillers = [normalizedPoulailler];
      }
    }
  }

  const nbTotal =
    typeof raw.esp32NbTotal === "number"
      ? raw.esp32NbTotal
      : (tousPoulaillers?.filter(isPoulaillerValid).length ?? 0);

  const nbCouverts =
    typeof raw.esp32NbCouverts === "number" ? raw.esp32NbCouverts : 0;

  return {
    ...(raw as unknown as Dossier),
    _id: resolveOid(raw._id),
    contractNumber: resolveContractNumber(raw),
    eleveur: {
      ...(eleveurRaw as Dossier["eleveur"]),
      _id: resolveOid(eleveurRaw._id),
      // ✅ préserver hasInviteToken tel que renvoyé par le backend
      hasInviteToken: !!eleveurRaw.hasInviteToken,
    },
    poulailler: poulaillerRaw
      ? normalizePoulailler(poulaillerRaw)
      : { _id: "", name: "—", type: "autre", animalCount: 0 },
    tousPoulaillers,
    esp32NbCouverts: nbCouverts,
    esp32NbTotal: nbTotal,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const POULAILLER_VIDE: Poulailler = {
  _id: "",
  name: "—",
  type: "autre",
  animalCount: 0,
  surface: 0,
};

const TYPE_LABEL: Record<string, string> = {
  chair: "Poulet de chair",
  ponte: "Poule pondeuse",
  dinde: "Dinde",
  autre: "Autre",
};

function getDensite(p: Poulailler): number {
  if (typeof p.densite === "number" && p.densite > 0) return p.densite;
  const surface = p.surface ?? 0;
  return surface > 0 ? (p.animalCount ?? 0) / surface : 0;
}

function densiteStyle(density: number) {
  if (density > 15)
    return { bg: "#fef2f2", color: "#be123c", label: "Critique" };
  if (density > 10) return { bg: "#fffbeb", color: "#b45309", label: "Élevée" };
  return { bg: "#f0fdf4", color: "#065f46", label: "Optimale" };
}

function makeEditAmount(d: Dossier): EditAmount {
  return {
    total: String(d.totalAmount ?? 0),
    advance: String(d.advanceAmount ?? 0),
    saving: false,
    dirty: false,
  };
}

function isEleveurActive(dossier: Dossier): boolean {
  if (dossier.etapes?.invitationEnvoyee) return true;
  if (dossier.eleveur?.hasInviteToken) return true;
  if (dossier.eleveur?.status === "active") return true;
  if (dossier.eleveur?.isActive === true) return true;
  return false;
}

function getPoulaillers(dossier: Dossier): Poulailler[] {
  if (dossier.tousPoulaillers && Array.isArray(dossier.tousPoulaillers)) {
    const valid = dossier.tousPoulaillers.filter(isPoulaillerValid);
    if (valid.length > 0) return valid;
  }
  if (dossier.poulailler && isPoulaillerValid(dossier.poulailler)) {
    return [dossier.poulailler];
  }
  return [];
}

// ─── Tooltips ─────────────────────────────────────────────────────────────────

function getInvitationTooltip(done: boolean, clickable: boolean): string {
  if (done)
    return "✓ Invitation envoyée — l'éleveur peut maintenant se connecter";
  if (clickable) return "Cliquer pour envoyer l'invitation à l'éleveur";
  return "Étapes précédentes requises avant l'envoi de l'invitation";
}

function getEsp32Tooltip(
  done: boolean,
  clickable: boolean,
  dossier: Dossier,
): string {
  if (done) return "✓ Tous les modules ESP32 sont installés";
  const total = dossier.esp32NbTotal;
  const couverts = dossier.esp32NbCouverts;
  const manquants = Math.max(0, total - couverts);
  if (total === 0) return "Aucun poulailler actif trouvé";
  if (!clickable) return "Étapes précédentes requises avant l'installation";
  if (manquants === 0)
    return "Tous les poulaillers sont couverts (recalcul en cours…)";
  if (manquants === 1)
    return `⚠ 1 poulailler sur ${total} n'a pas encore de module ESP32 associé — cliquer pour aller à la page modules`;
  return `⚠ ${manquants} poulaillers sur ${total} n'ont pas encore de module ESP32 associé — cliquer pour aller à la page modules`;
}

// ─── Badge invitation ─────────────────────────────────────────────────────────

function InvitationBadge({ dossier }: { dossier: Dossier }) {
  const marqueEnvoyee = !!dossier.etapes?.invitationEnvoyee;
  const tokenPresent = !!dossier.eleveur?.hasInviteToken;
  const isPending = dossier.eleveur?.status === "pending";

  // CAS 1 : admin a explicitement marqué "Invitation envoyée" dans le BPMN
  if (marqueEnvoyee) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginTop: 5,
          padding: "2px 8px",
          borderRadius: 6,
          background: "rgba(5,150,105,0.09)",
          border: "1px solid rgba(5,150,105,0.2)",
          fontSize: 9.5,
          fontWeight: 700,
          color: "#059669",
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
          mark_email_read
        </span>
        Invitation envoyée
      </div>
    );
  }

  // CAS 2 : token présent = invitation envoyée via la page Utilisateurs,
  // l'éleveur n'a pas encore activé son compte
  if (tokenPresent) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginTop: 5,
          padding: "2px 8px",
          borderRadius: 6,
          background: "rgba(37,99,235,0.09)",
          border: "1px solid rgba(37,99,235,0.2)",
          fontSize: 9.5,
          fontWeight: 700,
          color: "#2563eb",
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
          forward_to_inbox
        </span>
        Email envoyé
      </div>
    );
  }

  // CAS 3 : compte pending sans token = créé mais pas encore invité
  if (isPending) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginTop: 5,
          padding: "2px 8px",
          borderRadius: 6,
          background: "rgba(245,158,11,0.09)",
          border: "1px solid rgba(245,158,11,0.25)",
          fontSize: 9.5,
          fontWeight: 700,
          color: "#d97706",
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
          schedule_send
        </span>
        En attente
      </div>
    );
  }

  // CAS 4 : jamais invité
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        marginTop: 5,
        padding: "2px 8px",
        borderRadius: 6,
        background: "#f1f5f9",
        border: "1px solid #e2e8f0",
        fontSize: 9.5,
        fontWeight: 700,
        color: "#94a3b8",
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
        person_off
      </span>
      Non invité
    </div>
  );
}

// ─── Barre de progression BPMN ────────────────────────────────────────────────

const ETAPES_BPMN = [
  { key: "inscription", label: "Reçu", icon: "inbox" },
  { key: "dossierValide", label: "Validé", icon: "fact_check" },
  { key: "contratSigne", label: "Signé", icon: "draw" },
  { key: "esp32Installe", label: "Installé", icon: "developer_board" },
  { key: "invitationEnvoyee", label: "Invitation", icon: "mark_email_read" },
] as const;

function ProgressBPMN({
  dossier,
  onEtapeChange,
  loadingEtape,
}: {
  dossier: Dossier;
  onEtapeChange: (etape: keyof NonNullable<Dossier["etapes"]>) => void;
  loadingEtape: string | null;
}) {
  const isAnnule = dossier.status === "ANNULE";
  const isReadOnly = isAnnule || dossier.status === "TERMINE";
  const etapes = dossier.etapes ?? {};

  const isDone = (key: string): boolean => {
    if (key === "inscription") return true;
    if (key === "dossierValide")
      return !!etapes.dossierValide || dossier.status === "TERMINE";
    if (key === "invitationEnvoyee")
      return !!etapes.invitationEnvoyee || !!dossier.eleveur?.hasInviteToken;
    if (key === "esp32Installe") {
      if (etapes.esp32Installe) return true;
      const total = dossier.esp32NbTotal;
      const couverts = dossier.esp32NbCouverts;
      return total > 0 && couverts >= total;
    }
    return !!etapes[key as keyof typeof etapes];
  };

  const isClickable = (idx: number): boolean => {
    if (isReadOnly || idx === 0) return false;
    const prevKey = ETAPES_BPMN[idx - 1].key;
    return isDone(prevKey);
  };

  return (
    <div style={{ display: "flex", alignItems: "flex-start", width: "100%" }}>
      {ETAPES_BPMN.map((e, idx) => {
        const done = isDone(e.key);
        const clickable = isClickable(idx);
        const isCurrent = !done && clickable;
        const isLast = idx === ETAPES_BPMN.length - 1;
        const isLoading = loadingEtape === e.key;
        const isEsp32 = e.key === "esp32Installe";
        const doneColor = "#059669";

        const tooltip = isEsp32
          ? getEsp32Tooltip(done, clickable, dossier)
          : e.key === "invitationEnvoyee"
            ? getInvitationTooltip(done, clickable)
            : done
              ? `✓ ${e.label}`
              : clickable
                ? `Valider : ${e.label}`
                : "Étapes précédentes requises";

        const esp32SubLabel =
          isEsp32 && !done && dossier.esp32NbTotal > 0
            ? `${dossier.esp32NbCouverts}/${dossier.esp32NbTotal}`
            : null;

        return (
          <div
            key={e.key}
            style={{
              display: "flex",
              alignItems: "center",
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
              }}
            >
              <button
                disabled={!clickable || done || isLoading}
                onClick={() =>
                  e.key !== "inscription" &&
                  onEtapeChange(e.key as keyof NonNullable<Dossier["etapes"]>)
                }
                title={tooltip}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: "2px solid transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: clickable && !done ? "pointer" : "default",
                  transition: "all 0.2s",
                  background: isAnnule
                    ? "rgba(239,68,68,0.12)"
                    : done
                      ? doneColor
                      : isCurrent
                        ? "rgba(245,158,11,0.12)"
                        : "rgba(100,116,139,0.08)",
                  borderColor: isAnnule
                    ? "#ef4444"
                    : done
                      ? doneColor
                      : isCurrent
                        ? "#f59e0b"
                        : "transparent",
                  color: isAnnule
                    ? "#ef4444"
                    : done
                      ? "#fff"
                      : isCurrent
                        ? "#f59e0b"
                        : "#94a3b8",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 11 }}
                >
                  {isLoading
                    ? "progress_activity"
                    : done && !isAnnule
                      ? "check"
                      : e.icon}
                </span>
              </button>

              <span
                style={{
                  fontSize: 8,
                  textAlign: "center",
                  lineHeight: 1.2,
                  maxWidth: 52,
                  fontWeight: 600,
                  color: isAnnule
                    ? "#ef4444"
                    : done
                      ? doneColor
                      : isCurrent
                        ? "#f59e0b"
                        : "#94a3b8",
                }}
              >
                {e.label}
              </span>

              {esp32SubLabel && (
                <span
                  title={tooltip}
                  style={{
                    fontSize: 7,
                    fontWeight: 700,
                    textAlign: "center",
                    lineHeight: 1.1,
                    maxWidth: 52,
                    marginTop: -2,
                    padding: "1px 5px",
                    borderRadius: 10,
                    background: isCurrent
                      ? "rgba(245,158,11,0.12)"
                      : "rgba(100,116,139,0.08)",
                    color: isCurrent ? "#f59e0b" : "#94a3b8",
                  }}
                >
                  {esp32SubLabel}
                </span>
              )}
            </div>

            {!isLast && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  margin: "0 2px",
                  marginBottom: 18,
                  borderRadius: 2,
                  background: done
                    ? doneColor
                    : isAnnule
                      ? "rgba(239,68,68,0.2)"
                      : "rgba(100,116,139,0.12)",
                  transition: "background 0.3s",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Composants modales ───────────────────────────────────────────────────────

function ModalShell({
  grad,
  icon,
  title,
  subtitle,
  onClose,
  children,
}: {
  grad: string;
  icon: string;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(10,18,32,0.65)",
        backdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          width: "100%",
          maxWidth: 480,
          overflow: "hidden",
          animation: "modalIn 0.22s cubic-bezier(0.34,1.56,0.64,1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.88) translateY(10px); } to { opacity:1; transform:none; } }`}</style>
        <div
          style={{
            background: grad,
            padding: "20px 22px",
            display: "flex",
            alignItems: "center",
            gap: 13,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              background: "rgba(255,255,255,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ color: "#fff", fontSize: 20 }}
            >
              {icon}
            </span>
          </div>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>
              {title}
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.65)",
                fontSize: 11,
                marginTop: 2,
              }}
            >
              {subtitle}
            </div>
          </div>
        </div>
        <div style={{ padding: "20px 22px 22px" }}>{children}</div>
      </div>
    </div>
  );
}

function InfoBox({
  color,
  icon,
  children,
}: {
  color: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: `${color}12`,
        border: `1px solid ${color}30`,
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        gap: 9,
        marginBottom: 14,
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ color, fontSize: 16, flexShrink: 0, marginTop: 1 }}
      >
        {icon}
      </span>
      <div style={{ fontSize: 11.5, color, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

function RecapFinancier({
  dossier,
  showSolde,
}: {
  dossier: Dossier;
  showSolde?: boolean;
}) {
  const total = dossier.totalAmount ?? 0;
  const advance = dossier.advanceAmount ?? 0;
  const reste = dossier.remainedAmount ?? Math.max(0, total - advance);

  return (
    <div
      style={{
        background: "#f8fafc",
        borderRadius: 10,
        padding: "13px 15px",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "1.2px",
          fontWeight: 700,
          color: "#94a3b8",
          marginBottom: 9,
        }}
      >
        Récapitulatif financier
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          marginBottom: 7,
        }}
      >
        <span style={{ color: "#94a3b8" }}>Montant total</span>
        <span style={{ fontWeight: 700 }}>
          {total.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DT
        </span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          marginBottom: showSolde ? 7 : 0,
        }}
      >
        <span style={{ color: "#94a3b8" }}>Avance perçue</span>
        <span style={{ fontWeight: 700, color: "#059669" }}>
          {advance.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DT
        </span>
      </div>
      {showSolde && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            borderTop: "1px solid #e2e8f0",
            paddingTop: 7,
          }}
        >
          <span style={{ color: "#94a3b8" }}>Solde restant</span>
          <span
            style={{
              fontWeight: 700,
              color: reste > 0 ? "#dc2626" : "#059669",
            }}
          >
            {reste.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DT
          </span>
        </div>
      )}
    </div>
  );
}

function ModalFooter({
  onClose,
  onConfirm,
  confirmLabel,
  confirmColor,
  loading,
  disabled,
}: {
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmColor: string;
  loading: boolean;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 9 }}>
      <button
        onClick={onClose}
        style={{
          flex: 1,
          padding: "10px",
          borderRadius: 10,
          border: "1px solid #e2e8f0",
          background: "#fff",
          color: "#64748b",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Annuler
      </button>
      <button
        onClick={onConfirm}
        disabled={loading || disabled}
        style={{
          flex: 1,
          padding: "10px",
          borderRadius: 10,
          border: "none",
          background: confirmColor,
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          cursor: loading || disabled ? "not-allowed" : "pointer",
          opacity: loading || disabled ? 0.6 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {loading && (
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 14, animation: "spin 1s linear infinite" }}
          >
            progress_activity
          </span>
        )}
        {confirmLabel}
      </button>
    </div>
  );
}

// ── Modales spécifiques ───────────────────────────────────────────────────────

function ModalValidation({
  dossier,
  onConfirm,
  onClose,
}: {
  dossier: Dossier;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const nom = `${dossier.eleveur?.firstName} ${dossier.eleveur?.lastName}`;
  return (
    <ModalShell
      grad="linear-gradient(135deg,#059669,#047857)"
      icon="verified"
      title="Valider le dossier"
      subtitle={`${nom} · ${dossier.contractNumber}`}
      onClose={onClose}
    >
      <InfoBox color="#059669" icon="info">
        Cette action va <strong>activer le dossier</strong> et préparer l'accès
        mobile de l'éleveur.
      </InfoBox>
      <RecapFinancier dossier={dossier} />
      <ModalFooter
        onClose={onClose}
        onConfirm={async () => {
          setLoading(true);
          try {
            await onConfirm();
          } finally {
            setLoading(false);
          }
        }}
        confirmLabel="Confirmer la validation"
        confirmColor="#059669"
        loading={loading}
      />
    </ModalShell>
  );
}

function ModalContratSigne({
  dossier,
  onConfirm,
  onClose,
}: {
  dossier: Dossier;
  onConfirm: (f: File | null) => Promise<void>;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const nom = `${dossier.eleveur?.firstName} ${dossier.eleveur?.lastName}`;
  return (
    <ModalShell
      grad="linear-gradient(135deg,#2563eb,#1d4ed8)"
      icon="draw"
      title="Contrat signé"
      subtitle={`${nom} · ${dossier.contractNumber}`}
      onClose={onClose}
    >
      <InfoBox color="#2563eb" icon="info">
        Confirmez la signature en présentiel. Joignez le scan si disponible
        (optionnel).
      </InfoBox>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: "1.5px dashed #cbd5e1",
          borderRadius: 9,
          padding: "11px 13px",
          fontSize: 12,
          color: "#64748b",
          cursor: "pointer",
          marginBottom: 14,
        }}
        htmlFor="ctr-file"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
          upload_file
        </span>
        {file ? file.name : "Choisir un fichier (PDF, JPG, PNG)"}
      </label>
      <input
        type="file"
        id="ctr-file"
        accept=".pdf,.jpg,.jpeg,.png"
        style={{ display: "none" }}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <ModalFooter
        onClose={onClose}
        onConfirm={async () => {
          setLoading(true);
          try {
            await onConfirm(file);
          } finally {
            setLoading(false);
          }
        }}
        confirmLabel="Confirmer la signature"
        confirmColor="#2563eb"
        loading={loading}
      />
    </ModalShell>
  );
}

function ModalCloture({
  dossier,
  onConfirm,
  onClose,
}: {
  dossier: Dossier;
  onConfirm: (m: string) => Promise<void>;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [motif, setMotif] = useState("");
  const nom = `${dossier.eleveur?.firstName} ${dossier.eleveur?.lastName}`;
  return (
    <ModalShell
      grad="linear-gradient(135deg,#334155,#1e293b)"
      icon="lock"
      title="Clôturer le dossier"
      subtitle={`${nom} · ${dossier.contractNumber}`}
      onClose={onClose}
    >
      <InfoBox color="#d97706" icon="warning">
        Action <strong>irréversible</strong>. La clôture désactivera l'accès
        mobile de l'éleveur et marquera le dossier comme TERMINÉ.
      </InfoBox>
      <RecapFinancier dossier={dossier} showSolde />
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#475569",
          marginBottom: 6,
        }}
      >
        Motif de clôture <span style={{ color: "#dc2626" }}>*</span>
      </div>
      <textarea
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
        rows={3}
        placeholder="Ex : Installation terminée, matériel livré et validé…"
        style={{
          width: "100%",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 9,
          padding: "10px 13px",
          fontSize: 12,
          color: "#0f172a",
          resize: "none",
          outline: "none",
          marginBottom: 14,
          fontFamily: "inherit",
        }}
      />
      <ModalFooter
        onClose={onClose}
        onConfirm={async () => {
          if (!motif.trim()) return;
          setLoading(true);
          try {
            await onConfirm(motif.trim());
          } finally {
            setLoading(false);
          }
        }}
        confirmLabel="Confirmer la clôture"
        confirmColor="#334155"
        loading={loading}
        disabled={!motif.trim()}
      />
    </ModalShell>
  );
}

function ModalAnnulation({
  dossier,
  onConfirm,
  onClose,
}: {
  dossier: Dossier;
  onConfirm: (m: string) => Promise<void>;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [motif, setMotif] = useState("");
  const nom = `${dossier.eleveur?.firstName} ${dossier.eleveur?.lastName}`;
  const avancePercue = dossier.status === "AVANCE_PAYEE";
  return (
    <ModalShell
      grad="linear-gradient(135deg,#e11d48,#be123c)"
      icon="cancel"
      title="Annuler le dossier"
      subtitle={`${nom} · ${dossier.contractNumber}`}
      onClose={onClose}
    >
      {avancePercue ? (
        <InfoBox color="#dc2626" icon="payments">
          Avance déjà perçue (
          <strong>{dossier.advanceAmount?.toLocaleString("fr-FR")} DT</strong>
          ). L'annulation devra être régularisée manuellement.
        </InfoBox>
      ) : (
        <InfoBox color="#d97706" icon="info">
          Aucune avance perçue. Le dossier sera retiré du flux de traitement.
        </InfoBox>
      )}
      <RecapFinancier dossier={dossier} showSolde />
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#475569",
          marginBottom: 6,
        }}
      >
        Motif d'annulation <span style={{ color: "#dc2626" }}>*</span>
      </div>
      <textarea
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
        rows={3}
        placeholder="Ex : Client désisté, projet abandonné, doublon…"
        style={{
          width: "100%",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 9,
          padding: "10px 13px",
          fontSize: 12,
          color: "#0f172a",
          resize: "none",
          outline: "none",
          marginBottom: 14,
          fontFamily: "inherit",
        }}
      />
      <ModalFooter
        onClose={onClose}
        onConfirm={async () => {
          if (!motif.trim()) return;
          setLoading(true);
          try {
            await onConfirm(motif.trim());
          } finally {
            setLoading(false);
          }
        }}
        confirmLabel="Confirmer l'annulation"
        confirmColor="#e11d48"
        loading={loading}
        disabled={!motif.trim()}
      />
    </ModalShell>
  );
}

function ModalSuppression({
  dossier,
  onConfirm,
  onClose,
}: {
  dossier: Dossier;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const nom = `${dossier.eleveur?.firstName} ${dossier.eleveur?.lastName}`;
  return (
    <ModalShell
      grad="linear-gradient(135deg,#dc2626,#b91c1c)"
      icon="delete_forever"
      title="Supprimer le dossier"
      subtitle={`${nom} · ${dossier.contractNumber}`}
      onClose={onClose}
    >
      <InfoBox color="#dc2626" icon="report">
        Suppression <strong>définitive</strong> du dossier{" "}
        <strong>{dossier.contractNumber}</strong>. Aucune récupération possible.
      </InfoBox>
      <ModalFooter
        onClose={onClose}
        onConfirm={async () => {
          setLoading(true);
          try {
            await onConfirm();
          } finally {
            setLoading(false);
          }
        }}
        confirmLabel="Supprimer définitivement"
        confirmColor="#dc2626"
        loading={loading}
      />
    </ModalShell>
  );
}

function ModalInstaller({
  dossier,
  onGoToModules,
  onClose,
}: {
  dossier: Dossier;
  onGoToModules: () => void;
  onClose: () => void;
}) {
  const total = dossier.esp32NbTotal;
  const couverts = dossier.esp32NbCouverts;
  const manquants = Math.max(0, total - couverts);

  return (
    <ModalShell
      grad="linear-gradient(135deg,#059669,#047857)"
      icon="developer_board"
      title="Accéder à la page modules"
      subtitle="Étape : ESP32 installé"
      onClose={onClose}
    >
      {total > 0 && (
        <div
          style={{
            background:
              manquants === 0
                ? "rgba(5,150,105,0.07)"
                : "rgba(245,158,11,0.07)",
            border: `1px solid ${manquants === 0 ? "rgba(5,150,105,0.2)" : "rgba(245,158,11,0.25)"}`,
            borderRadius: 10,
            padding: "11px 14px",
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 20,
              color: manquants === 0 ? "#059669" : "#d97706",
              flexShrink: 0,
            }}
          >
            {manquants === 0 ? "check_circle" : "warning"}
          </span>
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: manquants === 0 ? "#059669" : "#92400e",
              }}
            >
              {manquants === 0
                ? "Tous les poulaillers sont couverts"
                : manquants === 1
                  ? `1 poulailler sur ${total} n'a pas de module ESP32`
                  : `${manquants} poulaillers sur ${total} n'ont pas de module ESP32`}
            </div>
            <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 2 }}>
              {couverts} module{couverts > 1 ? "s" : ""} associé
              {couverts > 1 ? "s" : ""} · {total} poulailler
              {total > 1 ? "s" : ""} au total
            </div>
            <div
              style={{
                marginTop: 7,
                height: 5,
                background: "rgba(0,0,0,0.08)",
                borderRadius: 10,
                overflow: "hidden",
                width: 180,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${total > 0 ? Math.round((couverts / total) * 100) : 0}%`,
                  background:
                    manquants === 0
                      ? "linear-gradient(90deg,#059669,#34d399)"
                      : "linear-gradient(90deg,#d97706,#fbbf24)",
                  borderRadius: 10,
                  transition: "width 0.4s",
                }}
              />
            </div>
          </div>
        </div>
      )}
      <InfoBox color="#059669" icon="info">
        Cette étape nécessite la configuration du module <strong>ESP32</strong>.
        Vous allez être redirigé vers la page de gestion des modules.
      </InfoBox>
      {[
        {
          label: "Associer le module ESP32",
          sub: "Lier l'appareil au poulailler concerné",
        },
        {
          label: "Vérifier la connexion réseau",
          sub: "Wi-Fi et transmission de données",
        },
        {
          label: "Marquer l'installation terminée",
          sub: "Depuis la page modules, valider l'étape",
        },
      ].map((s, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            background: "#f8fafc",
            borderRadius: 9,
            padding: "9px 12px",
            marginBottom: 5,
          }}
        >
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "rgba(5,150,105,0.1)",
              color: "#059669",
              fontSize: 9,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {i + 1}
          </span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
              {s.sub}
            </div>
          </div>
        </div>
      ))}
      <div style={{ height: 14 }} />
      <div style={{ display: "flex", gap: 9 }}>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: "#fff",
            color: "#64748b",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Annuler
        </button>
        <button
          onClick={onGoToModules}
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 10,
            border: "none",
            background: "#059669",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
            arrow_forward
          </span>
          Aller aux modules
        </button>
      </div>
    </ModalShell>
  );
}

// ─── ModalActiver ─────────────────────────────────────────────────────────────

function ModalActiver({
  dossier,
  onConfirm,
  onGoToUsers,
  onClose,
}: {
  dossier: Dossier;
  onConfirm: () => Promise<void>;
  onGoToUsers: () => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const nom = `${dossier.eleveur?.firstName} ${dossier.eleveur?.lastName}`;

  const steps = [
    {
      num: "1",
      title: "Envoyer l'invitation email",
      desc: `Rendez-vous sur la page Utilisateurs → ligne de ${dossier.eleveur?.firstName} → bouton « Renvoyer l'invitation »`,
      color: "#2563eb",
      done: false,
      icon: null,
    },
    {
      num: "2",
      title: "L'éleveur reçoit son accès",
      desc: "Il clique sur le lien reçu par email et crée son accès sécurisé à l'application mobile",
      color: "#2563eb",
      done: false,
      icon: null,
    },
    {
      num: "✓",
      title: "Invitation marquée comme envoyée",
      desc: "L'étape « Invitation » passera au vert dès confirmation de l'envoi",
      color: "#059669",
      done: true,
      icon: "check",
    },
  ];

  return (
    <ModalShell
      grad="linear-gradient(135deg,#059669,#047857)"
      icon="mark_email_read"
      title="Envoyer l'invitation éleveur"
      subtitle={`${nom} · ${dossier.contractNumber}`}
      onClose={onClose}
    >
      <InfoBox color="#059669" icon="info">
        L'invitation envoie un email à l'éleveur pour qu'il puisse{" "}
        <strong>accéder à l'application mobile</strong>. L'étape passera au vert
        dès que vous confirmez l'envoi.
      </InfoBox>
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "1.2px",
          fontWeight: 700,
          color: "#94a3b8",
          marginBottom: 8,
        }}
      >
        Processus d'invitation
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginBottom: 14,
        }}
      >
        {steps.map((s, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              background: s.done ? "rgba(5,150,105,0.04)" : "#f8fafc",
              borderRadius: 9,
              padding: "10px 13px",
              border: s.done
                ? "1px solid rgba(5,150,105,0.18)"
                : "1px solid #f1f5f9",
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: s.color,
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              {s.icon ? (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 13 }}
                >
                  {s.icon}
                </span>
              ) : (
                s.num
              )}
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: s.done ? "#059669" : "#0f172a",
                }}
              >
                {s.title}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: "#64748b",
                  marginTop: 3,
                  lineHeight: 1.5,
                }}
              >
                {s.desc}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          background: "rgba(5,150,105,0.05)",
          border: "1px solid rgba(5,150,105,0.2)",
          borderRadius: 9,
          padding: "10px 13px",
          display: "flex",
          alignItems: "flex-start",
          gap: 9,
          marginBottom: 18,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            color: "#059669",
            fontSize: 15,
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          info
        </span>
        <div style={{ fontSize: 11, color: "#065f46", lineHeight: 1.5 }}>
          L'invitation s'envoie depuis la page{" "}
          <button
            onClick={onGoToUsers}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "#059669",
              fontWeight: 700,
              fontSize: 11,
              textDecoration: "underline",
              fontFamily: "inherit",
            }}
          >
            Utilisateurs
          </button>{" "}
          — bouton{" "}
          <strong style={{ color: "#065f46" }}>
            « Renvoyer l'invitation »
          </strong>{" "}
          sur la ligne de cet éleveur.
        </div>
      </div>
      <div style={{ display: "flex", gap: 7 }}>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: "9px 10px",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: "#fff",
            color: "#64748b",
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Annuler
        </button>
        <button
          onClick={onGoToUsers}
          style={{
            flex: 1.4,
            padding: "9px 10px",
            borderRadius: 10,
            background: "#f0fdf4",
            color: "#059669",
            fontSize: 11.5,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            fontFamily: "inherit",
            border: "1px solid rgba(5,150,105,0.25)",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            open_in_new
          </span>
          Utilisateurs
        </button>
        <button
          onClick={async () => {
            setLoading(true);
            try {
              await onConfirm();
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          style={{
            flex: 1.6,
            padding: "9px 10px",
            borderRadius: 10,
            border: "none",
            background: "#059669",
            color: "#fff",
            fontSize: 11.5,
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            fontFamily: "inherit",
          }}
        >
          {loading ? (
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 13, animation: "spin 1s linear infinite" }}
            >
              progress_activity
            </span>
          ) : (
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 13 }}
            >
              mark_email_read
            </span>
          )}
          {loading ? "En cours…" : "Marquer envoyée"}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, type }: { msg: string; type: "ok" | "err" }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 26,
        right: 26,
        zIndex: 200,
        background: type === "err" ? "#7f1d1d" : "#0f172a",
        color: "#fff",
        borderRadius: 11,
        padding: "11px 16px",
        fontSize: 12.5,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: 7,
        boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
        animation: "toastIn 0.28s cubic-bezier(0.34,1.56,0.64,1)",
      }}
    >
      <style>{`
        @keyframes toastIn { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
        {type === "err" ? "error" : "check_circle"}
      </span>
      {msg}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
  EN_ATTENTE: {
    label: "En attente",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.25)",
  },
  AVANCE_PAYEE: {
    label: "Validé",
    color: "#059669",
    bg: "rgba(5,150,105,0.1)",
    border: "rgba(5,150,105,0.25)",
  },
  TERMINE: {
    label: "Terminé",
    color: "#64748b",
    bg: "rgba(100,116,139,0.1)",
    border: "rgba(100,116,139,0.25)",
  },
  ANNULE: {
    label: "Annulé",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.25)",
  },
} as const;

function StatusBadge({ status }: { status: Dossier["status"] }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.EN_ATTENTE;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px 4px 7px",
        borderRadius: 100,
        fontSize: 10.5,
        fontWeight: 700,
        color: c.color,
        background: c.bg,
        border: `1px solid ${c.border}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: c.color,
          flexShrink: 0,
        }}
      />
      {c.label}
    </span>
  );
}

// ─── Skeleton loading ─────────────────────────────────────────────────────────

function SkeletonRow() {
  const box = (w: string, h = "12px") => (
    <div
      style={{
        width: w,
        height: h,
        background: "#e2e8f0",
        borderRadius: 6,
        marginBottom: 6,
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    />
  );
  return (
    <tr>
      {[1, 2, 3, 4, 5].map((i) => (
        <td
          key={i}
          style={{ padding: "16px 18px", borderBottom: "1px solid #f1f5f9" }}
        >
          {box("70%")} {box("50%")} {box("40%")}
        </td>
      ))}
    </tr>
  );
}

// ─── Helper style boutons ─────────────────────────────────────────────────────

function btnStyle(
  variant: "outline" | "green" | "blue" | "slate" | "rose" | "red",
  disabled = false,
): React.CSSProperties {
  const base: React.CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: "7px 10px",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    border: "none",
    marginBottom: 4,
    transition: "all 0.12s",
    fontFamily: "inherit",
    opacity: disabled ? 0.38 : 1,
  };
  const map: Record<string, React.CSSProperties> = {
    outline: {
      background: "#fff",
      border: "1px solid #e2e8f0",
      color: "#64748b",
    },
    green: { background: "#059669", color: "#fff" },
    blue: { background: "#2563eb", color: "#fff" },
    slate: { background: "#334155", color: "#fff" },
    rose: { background: "#e11d48", color: "#fff" },
    red: { background: "#dc2626", color: "#fff" },
  };
  return { ...base, ...map[variant] };
}

// ─── Fetch dossiers ───────────────────────────────────────────────────────────

async function fetchDossiers(): Promise<Dossier[]> {
  const { data } = await dossiersAPI.getAll();
  if (!data?.success) throw new Error(data?.message ?? "Réponse invalide");
  const raw: unknown[] = Array.isArray(data.data) ? data.data : [];
  return raw
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .map(normalizeDossier)
    .filter((d) => !!d._id);
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Dossiers() {
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("TOUS");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [loadingEtapes, setLoadingEtapes] = useState<
    Record<string, string | null>
  >({});
  const [editAmounts, setEditAmounts] = useState<Record<string, EditAmount>>(
    {},
  );

  const [mValidation, setMValidation] = useState<Dossier | null>(null);
  const [mContratSigne, setMContratSigne] = useState<Dossier | null>(null);
  const [mCloture, setMCloture] = useState<Dossier | null>(null);
  const [mAnnulation, setMAnnulation] = useState<Dossier | null>(null);
  const [mSuppression, setMSuppression] = useState<Dossier | null>(null);
  const [mInstaller, setMInstaller] = useState<Dossier | null>(null);
  const [mActiver, setMActiver] = useState<Dossier | null>(null);
  const [mPrint, setMPrint] = useState<Dossier | null>(null);

  const [toast, setToast] = useState<{
    msg: string;
    type: "ok" | "err";
  } | null>(null);

  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const loadDossiers = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      else setRefreshing(true);
      setError(null);
      const list = await fetchDossiers();
      setDossiers(list);
      setEditAmounts((prev) => {
        const next: Record<string, EditAmount> = {};
        list.forEach((d) => {
          next[d._id] = prev[d._id]?.dirty ? prev[d._id] : makeEditAmount(d);
        });
        return next;
      });
    } catch {
      setError(
        "Impossible de charger les dossiers. Vérifiez la connexion au serveur.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDossiers(true);
  }, [loadDossiers]);

  const hiddenAt = useRef<number | null>(null);
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else {
        const elapsed = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
        if (elapsed >= 3000) loadDossiers(false);
        hiddenAt.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [loadDossiers]);

  const patchDossier = useCallback((id: string, patch: Partial<Dossier>) => {
    setDossiers((prev) =>
      prev.map((d) => {
        if (d._id !== id) return d;
        const updated = { ...d, ...patch };
        if (
          patch.totalAmount !== undefined ||
          patch.advanceAmount !== undefined
        ) {
          setEditAmounts((ea) => ({ ...ea, [id]: makeEditAmount(updated) }));
        }
        return updated;
      }),
    );
  }, []);

  const removeDossier = useCallback((id: string) => {
    setDossiers((prev) => prev.filter((d) => d._id !== id));
    setEditAmounts((ea) => {
      const copy = { ...ea };
      delete copy[id];
      return copy;
    });
  }, []);

  const filtered = useMemo(
    () =>
      dossiers.filter((d) => {
        if (filter !== "TOUS" && d.status !== filter) return false;
        if (search) {
          const q = search.toLowerCase();
          return `${d.eleveur?.firstName} ${d.eleveur?.lastName} ${d.contractNumber} ${d.eleveur?.email} ${d.eleveur?.phone}`
            .toLowerCase()
            .includes(q);
        }
        return true;
      }),
    [dossiers, filter, search],
  );

  const counts = useMemo(
    () => ({
      TOUS: dossiers.length,
      EN_ATTENTE: dossiers.filter((d) => d.status === "EN_ATTENTE").length,
      AVANCE_PAYEE: dossiers.filter((d) => d.status === "AVANCE_PAYEE").length,
      TERMINE: dossiers.filter((d) => d.status === "TERMINE").length,
      ANNULE: dossiers.filter((d) => d.status === "ANNULE").length,
    }),
    [dossiers],
  );

  const stats = useMemo(
    () => ({
      totalAmount: dossiers.reduce((s, d) => s + (d.totalAmount || 0), 0),
      totalAdvance: dossiers.reduce((s, d) => s + (d.advanceAmount || 0), 0),
      totalReste: dossiers.reduce((s, d) => s + (d.remainedAmount || 0), 0),
    }),
    [dossiers],
  );

  const recouvrement =
    stats.totalAmount > 0
      ? Math.round((stats.totalAdvance / stats.totalAmount) * 100)
      : 0;

  const handleValidate = async () => {
    if (!mValidation) return;
    try {
      const { data } = await dossiersAPI.validate(mValidation._id);
      if (data?.success) {
        patchDossier(mValidation._id, {
          status: "AVANCE_PAYEE",
          etapes: { ...mValidation.etapes, dossierValide: true },
        });
        setMValidation(null);
        showToast("Dossier validé avec succès ✓");
      } else {
        showToast(data?.message ?? "Validation échouée", "err");
      }
    } catch (err: any) {
      showToast(
        err?.response?.data?.message ?? "Erreur lors de la validation",
        "err",
      );
    }
  };

  const handleEtapeChange = async (
    dossierId: string,
    etape: keyof NonNullable<Dossier["etapes"]>,
  ) => {
    const dossier = dossiers.find((d) => d._id === dossierId);
    if (!dossier) return;
    if (etape === "contratSigne") {
      setMContratSigne(dossier);
      return;
    }
    if (etape === "esp32Installe") {
      setMInstaller(dossier);
      return;
    }
    if (etape === "invitationEnvoyee") {
      setMActiver(dossier);
      return;
    }
    setLoadingEtapes((p) => ({ ...p, [dossierId]: etape }));
    try {
      const { data } = await dossiersAPI.updateEtape!(dossierId, {
        etape,
        valeur: true,
      });
      if (data?.success) {
        patchDossier(dossierId, {
          etapes: { ...dossier.etapes, [etape]: true },
        });
        showToast("Étape mise à jour ✓");
      } else {
        showToast(data?.message ?? "Mise à jour échouée", "err");
      }
    } catch (err: any) {
      showToast(
        err?.response?.data?.message ?? "Erreur lors de la mise à jour",
        "err",
      );
    } finally {
      setLoadingEtapes((p) => ({ ...p, [dossierId]: null }));
    }
  };

  const handleActiver = async () => {
    if (!mActiver) return;
    try {
      const { data } = await dossiersAPI.updateEtape!(mActiver._id, {
        etape: "invitationEnvoyee",
        valeur: true,
      });
      if (data?.success) {
        patchDossier(mActiver._id, {
          etapes: { ...mActiver.etapes, invitationEnvoyee: true },
        });
        setMActiver(null);
        showToast("Invitation marquée comme envoyée ✓");
      } else {
        showToast(data?.message ?? "Mise à jour échouée", "err");
      }
    } catch (err: any) {
      showToast(
        err?.response?.data?.message ?? "Erreur lors de la mise à jour",
        "err",
      );
    }
  };

  const handleContratSigne = async (file: File | null) => {
    if (!mContratSigne) return;
    try {
      const formData = new FormData();
      if (file) formData.append("contratSignePdf", file);
      const { data } = await dossiersAPI.marquerContratSigne!(
        mContratSigne._id,
        formData,
      );
      if (data?.success) {
        patchDossier(mContratSigne._id, data.data as Partial<Dossier>);
        setMContratSigne(null);
        showToast("Contrat marqué comme signé ✓");
      } else {
        showToast(data?.message ?? "Erreur signature contrat", "err");
      }
    } catch (err: any) {
      showToast(
        err?.response?.data?.message ?? "Erreur lors de la signature",
        "err",
      );
    }
  };

  const handleCloture = async (motif: string) => {
    if (!mCloture) return;
    try {
      const { data } = await dossiersAPI.clore!(mCloture._id, {
        motifCloture: motif,
      });
      if (data?.success) {
        patchDossier(mCloture._id, {
          status: "TERMINE",
          motifCloture: motif,
          dateCloture: new Date().toISOString(),
        });
        setMCloture(null);
        showToast("Dossier clôturé ✓");
      } else {
        showToast(data?.message ?? "Clôture échouée", "err");
      }
    } catch (err: any) {
      showToast(
        err?.response?.data?.message ?? "Erreur lors de la clôture",
        "err",
      );
    }
  };

  const handleAnnulation = async (motif: string) => {
    if (!mAnnulation) return;
    try {
      const { data } = await dossiersAPI.annuler(mAnnulation._id, {
        motifAnnulation: motif,
      });
      if (data?.success) {
        patchDossier(mAnnulation._id, {
          status: "ANNULE",
          motifAnnulation: motif,
          dateAnnulation: new Date().toISOString(),
          avanceDejaPercueALAnnulation: data.avanceDejaPercue,
        });
        setMAnnulation(null);
        showToast("Dossier annulé");
      } else {
        showToast(data?.message ?? "Annulation échouée", "err");
      }
    } catch (err: any) {
      showToast(
        err?.response?.data?.message ?? "Erreur lors de l'annulation",
        "err",
      );
    }
  };

  const handleSuppression = async () => {
    if (!mSuppression) return;
    try {
      const { data } = await dossiersAPI.delete!(mSuppression._id);
      if (data?.success) {
        removeDossier(mSuppression._id);
        if (expandedId === mSuppression._id) setExpandedId(null);
        setMSuppression(null);
        showToast("Dossier supprimé définitivement");
      } else {
        showToast(data?.message ?? "Suppression échouée", "err");
      }
    } catch (err: any) {
      showToast(
        err?.response?.data?.message ?? "Erreur lors de la suppression",
        "err",
      );
    }
  };

  const handleSaveAmounts = async (id: string) => {
    const ea = editAmounts[id];
    if (!ea) return;
    const total = parseFloat(ea.total);
    const advance = parseFloat(ea.advance);
    if (isNaN(total) || total < 0) {
      showToast("Montant total invalide", "err");
      return;
    }
    if (isNaN(advance) || advance < 0) {
      showToast("Montant d'avance invalide", "err");
      return;
    }
    if (advance > total) {
      showToast("L'avance ne peut pas dépasser le montant total", "err");
      return;
    }
    setEditAmounts((p) => ({ ...p, [id]: { ...p[id], saving: true } }));
    try {
      const { data } = await dossiersAPI.updateAmounts!(id, {
        totalAmount: total,
        advanceAmount: advance,
      });
      if (data?.success) {
        patchDossier(id, {
          totalAmount: total,
          advanceAmount: advance,
          remainedAmount: Math.max(0, total - advance),
        });
        showToast("Montants enregistrés ✓");
      } else {
        showToast(data?.message ?? "Sauvegarde échouée", "err");
        setEditAmounts((p) => ({ ...p, [id]: { ...p[id], saving: false } }));
      }
    } catch (err: any) {
      showToast(
        err?.response?.data?.message ?? "Erreur lors de la sauvegarde",
        "err",
      );
      setEditAmounts((p) => ({ ...p, [id]: { ...p[id], saving: false } }));
    }
  };

  const exportCSV = () => {
    const rows = filtered.map((d) =>
      [
        d._id.slice(-6),
        d.contractNumber,
        `${d.eleveur?.firstName} ${d.eleveur?.lastName}`,
        d.eleveur?.email ?? "",
        d.status,
        d.totalAmount ?? 0,
        d.advanceAmount ?? 0,
        d.remainedAmount ?? 0,
      ].join(","),
    );
    const blob = new Blob(
      [
        ["ID,Contrat,Éleveur,Email,Statut,Total,Avance,Reste", ...rows].join(
          "\n",
        ),
      ],
      { type: "text/csv" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dossiers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const expandedDossier = dossiers.find((d) => d._id === expandedId) ?? null;

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#f8fafc",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        color: "#0f172a",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,300,0,0');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes modalIn { from { opacity:0; transform:scale(0.88) translateY(10px); } to { opacity:1; transform:none; } }
        @keyframes toastIn { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        .row-hover:hover { background: rgba(5,150,105,0.025) !important; }
      `}</style>

      <Sidebar />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Header />

        <main style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {/* ── En-tête ── */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 22,
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: 21,
                  fontWeight: 800,
                  letterSpacing: "-0.5px",
                  margin: 0,
                }}
              >
                Gestion des Dossiers
              </h1>
              <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                Contrats · Paiements · Activations — {filtered.length} dossier
                {filtered.length !== 1 ? "s" : ""} affiché
                {filtered.length !== 1 ? "s" : ""}
                {refreshing && (
                  <span style={{ marginLeft: 8, color: "#059669" }}>
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: 12,
                        verticalAlign: "middle",
                        animation: "spin 1s linear infinite",
                      }}
                    >
                      progress_activity
                    </span>{" "}
                    Actualisation…
                  </span>
                )}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => loadDossiers(false)}
                disabled={refreshing}
                title="Actualiser les données"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 9,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#059669",
                  cursor: refreshing ? "not-allowed" : "pointer",
                  opacity: refreshing ? 0.6 : 1,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 16,
                    animation: refreshing ? "spin 1s linear infinite" : "none",
                  }}
                >
                  refresh
                </span>
                Actualiser
              </button>
              <button
                onClick={exportCSV}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 15px",
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 9,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#475569",
                  cursor: "pointer",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16 }}
                >
                  download
                </span>
                Exporter CSV
              </button>
            </div>
          </div>

          {/* ── KPI bar ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 12,
              marginBottom: 18,
            }}
          >
            {[
              {
                label: "Total",
                value: counts.TOUS,
                color: "#64748b",
                icon: "folder_special",
                acc: "linear-gradient(90deg,#475569,#94a3b8)",
              },
              {
                label: "En attente",
                value: counts.EN_ATTENTE,
                color: "#d97706",
                icon: "schedule",
                acc: "linear-gradient(90deg,#d97706,#f59e0b)",
              },
              {
                label: "Validés",
                value: counts.AVANCE_PAYEE,
                color: "#059669",
                icon: "verified",
                acc: "linear-gradient(90deg,#059669,#34d399)",
              },
              {
                label: "Terminés",
                value: counts.TERMINE,
                color: "#334155",
                icon: "lock",
                acc: "linear-gradient(90deg,#334155,#64748b)",
              },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: "#fff",
                  border: "1px solid #f1f5f9",
                  borderRadius: 12,
                  padding: "16px 18px",
                  position: "relative",
                  overflow: "hidden",
                  boxShadow:
                    "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 3,
                    background: s.acc,
                    borderRadius: "12px 12px 0 0",
                  }}
                />
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: `${s.color}14`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 10,
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 17, color: s.color }}
                  >
                    {s.icon}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    letterSpacing: "-1px",
                    lineHeight: 1,
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: "#94a3b8",
                    marginTop: 3,
                    fontWeight: 500,
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* ── Barre financière globale ── */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #f1f5f9",
              borderRadius: 12,
              padding: "14px 20px",
              marginBottom: 18,
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>
                Taux de recouvrement ·{" "}
                {stats.totalAdvance.toLocaleString("fr-FR")} DT perçus /{" "}
                {stats.totalAmount.toLocaleString("fr-FR")} DT contractés
              </span>
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  fontFamily: "'JetBrains Mono', monospace",
                  color:
                    recouvrement >= 70
                      ? "#059669"
                      : recouvrement >= 40
                        ? "#d97706"
                        : "#dc2626",
                }}
              >
                {recouvrement}
                <span
                  style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}
                >
                  {" "}
                  %
                </span>
              </span>
            </div>
            <div
              style={{
                height: 7,
                background: "#f1f5f9",
                borderRadius: 20,
                overflow: "hidden",
                border: "1px solid #e2e8f0",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${recouvrement}%`,
                  background: "linear-gradient(90deg,#059669,#34d399)",
                  borderRadius: 20,
                  transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              {[
                {
                  label: "Total contracté",
                  value: stats.totalAmount,
                  color: "#0f172a",
                },
                {
                  label: "Total perçu (avances)",
                  value: stats.totalAdvance,
                  color: "#059669",
                },
                {
                  label: "Total restant dû",
                  value: stats.totalReste,
                  color: "#dc2626",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.8px",
                    }}
                  >
                    {item.label}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: item.color,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {item.value.toLocaleString("fr-FR", {
                      minimumFractionDigits: 2,
                    })}{" "}
                    DT
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Filtres ── */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 18,
              flexWrap: "wrap",
            }}
          >
            {(
              [
                { key: "TOUS", label: "Tous", icon: "folder" },
                { key: "EN_ATTENTE", label: "En attente", icon: "schedule" },
                { key: "AVANCE_PAYEE", label: "Validés", icon: "verified" },
                { key: "TERMINE", label: "Terminés", icon: "lock" },
                { key: "ANNULE", label: "Annulés", icon: "cancel" },
              ] as { key: FilterStatus; label: string; icon: string }[]
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setFilter(f.key);
                  setExpandedId(null);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 14px",
                  borderRadius: 100,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  border:
                    filter === f.key
                      ? "1px solid #0f172a"
                      : "1px solid #e2e8f0",
                  background: filter === f.key ? "#0f172a" : "#fff",
                  color: filter === f.key ? "#fff" : "#64748b",
                  transition: "all 0.13s",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14 }}
                >
                  {f.icon}
                </span>
                {f.label}
                <span
                  style={{
                    padding: "1px 6px",
                    borderRadius: 10,
                    fontSize: 10,
                    fontWeight: 700,
                    background:
                      filter === f.key ? "rgba(255,255,255,0.2)" : "#f1f5f9",
                    color: filter === f.key ? "#fff" : "#94a3b8",
                  }}
                >
                  {counts[f.key]}
                </span>
              </button>
            ))}
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 9,
                padding: "0 12px",
                height: 34,
                minWidth: 260,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16, color: "#94a3b8" }}
              >
                search
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher éleveur, contrat…"
                style={{
                  flex: 1,
                  border: "none",
                  background: "transparent",
                  fontSize: 12.5,
                  color: "#0f172a",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    color: "#94a3b8",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 15 }}
                  >
                    close
                  </span>
                </button>
              )}
            </div>
          </div>

          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: "12px 16px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 10,
                fontSize: 13,
                color: "#dc2626",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 18 }}
              >
                error
              </span>
              {error}
              <button
                onClick={() => loadDossiers(true)}
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#dc2626",
                  background: "none",
                  border: "1px solid #fecaca",
                  borderRadius: 7,
                  padding: "4px 10px",
                  cursor: "pointer",
                }}
              >
                Réessayer
              </button>
            </div>
          )}

          {/* ── Tableau ── */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #f1f5f9",
              borderRadius: 12,
              boxShadow:
                "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 18px",
                fontSize: 11,
                color: "#94a3b8",
                fontWeight: 500,
                borderBottom: "1px solid #f1f5f9",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 14 }}
              >
                table_rows
              </span>
              {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
              {search && (
                <span style={{ color: "#059669" }}>
                  · filtrés par "{search}"
                </span>
              )}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {[
                      "Éleveur",
                      "Bâtiments",
                      "Finances (DT)",
                      "Statut & Progression",
                      "Actions",
                    ].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          padding: "11px 18px",
                          textAlign: "left",
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.9px",
                          color: "#94a3b8",
                          borderBottom: "1px solid #f1f5f9",
                          whiteSpace: "nowrap",
                          ...(i === 2
                            ? { width: 230 }
                            : i === 3
                              ? { width: 250 }
                              : i === 4
                                ? { width: 148 }
                                : {}),
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <SkeletonRow key={i} />
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        style={{ padding: "60px 24px", textAlign: "center" }}
                      >
                        <span
                          className="material-symbols-outlined"
                          style={{
                            fontSize: 52,
                            color: "#e2e8f0",
                            display: "block",
                            marginBottom: 10,
                          }}
                        >
                          folder_open
                        </span>
                        <p style={{ fontSize: 13, color: "#94a3b8" }}>
                          Aucun dossier trouvé
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filtered
                      .filter((d) => d?._id)
                      .map((d) => {
                        const ea = editAmounts[d._id] ?? makeEditAmount(d);
                        const resteEdition = Math.max(
                          0,
                          (parseFloat(ea.total) || 0) -
                            (parseFloat(ea.advance) || 0),
                        );
                        const poulaillers = getPoulaillers(d);
                        const isRO =
                          d.status === "TERMINE" || d.status === "ANNULE";

                        return (
                          <tr
                            key={d._id}
                            className="row-hover"
                            style={{
                              borderBottom: "1px solid #f1f5f9",
                              transition: "background 0.12s",
                              opacity: isRO ? 0.7 : 1,
                              background:
                                expandedId === d._id
                                  ? "rgba(5,150,105,0.03)"
                                  : "",
                            }}
                          >
                            {/* ── Éleveur ── */}
                            <td
                              style={{
                                padding: "14px 18px",
                                verticalAlign: "top",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: 10,
                                }}
                              >
                                <div
                                  style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: "50%",
                                    flexShrink: 0,
                                    background: "#059669",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "#fff",
                                  }}
                                >
                                  {(
                                    d.eleveur?.firstName?.[0] ?? ""
                                  ).toUpperCase()}
                                  {(
                                    d.eleveur?.lastName?.[0] ?? ""
                                  ).toUpperCase()}
                                </div>
                                <div>
                                  <div
                                    style={{ fontSize: 13, fontWeight: 700 }}
                                  >
                                    {d.eleveur?.firstName} {d.eleveur?.lastName}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 11.5,
                                      color: "#475569",
                                      marginTop: 2,
                                    }}
                                  >
                                    {d.eleveur?.phone ?? "—"}
                                  </div>
                                  <div
                                    style={{ fontSize: 11, color: "#94a3b8" }}
                                  >
                                    {d.eleveur?.email ?? "—"}
                                  </div>
                                  <div
                                    style={{
                                      display: "inline-block",
                                      marginTop: 6,
                                      background: "rgba(5,150,105,0.09)",
                                      color: "#059669",
                                      fontSize: 9.5,
                                      fontWeight: 700,
                                      padding: "2px 8px",
                                      borderRadius: 6,
                                      fontFamily: "'JetBrains Mono', monospace",
                                    }}
                                  >
                                    {d.contractNumber}
                                  </div>
                                  <div style={{ display: "block" }}>
                                    <InvitationBadge dossier={d} />
                                  </div>
                                  {d.status === "TERMINE" && d.dateCloture && (
                                    <div
                                      style={{
                                        marginTop: 6,
                                        background: "#f1f5f9",
                                        borderRadius: 7,
                                        padding: "5px 8px",
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: 9,
                                          color: "#94a3b8",
                                          fontWeight: 700,
                                          textTransform: "uppercase",
                                          letterSpacing: "0.8px",
                                        }}
                                      >
                                        Clôturé le
                                      </div>
                                      <div
                                        style={{
                                          fontSize: 10.5,
                                          fontWeight: 600,
                                        }}
                                      >
                                        {new Date(
                                          d.dateCloture,
                                        ).toLocaleDateString("fr-FR", {
                                          day: "2-digit",
                                          month: "short",
                                          year: "numeric",
                                        })}
                                      </div>
                                      {d.motifCloture && (
                                        <div
                                          style={{
                                            fontSize: 10,
                                            color: "#64748b",
                                            fontStyle: "italic",
                                            marginTop: 2,
                                          }}
                                        >
                                          "{d.motifCloture}"
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {d.status === "ANNULE" &&
                                    d.dateAnnulation && (
                                      <div
                                        style={{
                                          marginTop: 6,
                                          background: "rgba(239,68,68,0.06)",
                                          border:
                                            "1px solid rgba(239,68,68,0.15)",
                                          borderRadius: 7,
                                          padding: "5px 8px",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize: 9,
                                            color: "#ef4444",
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                          }}
                                        >
                                          Annulé le
                                        </div>
                                        <div
                                          style={{
                                            fontSize: 10.5,
                                            fontWeight: 600,
                                            color: "#dc2626",
                                          }}
                                        >
                                          {new Date(
                                            d.dateAnnulation,
                                          ).toLocaleDateString("fr-FR", {
                                            day: "2-digit",
                                            month: "short",
                                            year: "numeric",
                                          })}
                                        </div>
                                        {d.motifAnnulation && (
                                          <div
                                            style={{
                                              fontSize: 10,
                                              color: "#ef4444",
                                              fontStyle: "italic",
                                              marginTop: 2,
                                            }}
                                          >
                                            "{d.motifAnnulation}"
                                          </div>
                                        )}
                                        {d.avanceDejaPercueALAnnulation && (
                                          <div
                                            style={{
                                              fontSize: 9,
                                              color: "#dc2626",
                                              fontWeight: 700,
                                              marginTop: 3,
                                            }}
                                          >
                                            ⚠ Avance à régulariser
                                          </div>
                                        )}
                                      </div>
                                    )}
                                </div>
                              </div>
                            </td>

                            {/* ── Bâtiments ── */}
                            <td
                              style={{
                                padding: "14px 18px",
                                verticalAlign: "top",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  marginBottom: 8,
                                }}
                              >
                                <span
                                  className="material-symbols-outlined"
                                  style={{ fontSize: 15, color: "#059669" }}
                                >
                                  warehouse
                                </span>
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: "#059669",
                                    background: "rgba(5,150,105,0.09)",
                                    padding: "2px 8px",
                                    borderRadius: 6,
                                  }}
                                >
                                  {poulaillers.length} bâtiment
                                  {poulaillers.length > 1 ? "s" : ""}
                                </span>
                              </div>
                              {poulaillers
                                .slice(0, 2)
                                .map((p: Poulailler, idx: number) => {
                                  const safe = p ?? POULAILLER_VIDE;
                                  const density = getDensite(safe);
                                  const ds = densiteStyle(density);
                                  return (
                                    <div
                                      key={safe._id || idx}
                                      style={{
                                        background: "#f8fafc",
                                        border: "1px solid #f1f5f9",
                                        borderRadius: 8,
                                        padding: "7px 10px",
                                        marginBottom: 4,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 8,
                                      }}
                                    >
                                      <div>
                                        <div
                                          style={{
                                            fontSize: 11.5,
                                            fontWeight: 700,
                                          }}
                                        >
                                          {safe.name}
                                        </div>
                                        <div
                                          style={{
                                            fontSize: 10,
                                            color: "#94a3b8",
                                          }}
                                        >
                                          {(
                                            safe.animalCount ?? 0
                                          ).toLocaleString("fr-FR")}{" "}
                                          têtes
                                          {safe.surface
                                            ? ` · ${safe.surface}m²`
                                            : ""}
                                        </div>
                                      </div>
                                      {density > 0 && (
                                        <div
                                          style={{
                                            fontSize: 9,
                                            fontWeight: 700,
                                            padding: "2px 7px",
                                            borderRadius: 20,
                                            background: ds.bg,
                                            color: ds.color,
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          {density.toFixed(1)}/m²
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              {poulaillers.length > 2 && (
                                <button
                                  onClick={() =>
                                    setExpandedId(
                                      expandedId === d._id ? null : d._id,
                                    )
                                  }
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: "#059669",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: "4px 0",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 3,
                                  }}
                                >
                                  <span
                                    className="material-symbols-outlined"
                                    style={{ fontSize: 13 }}
                                  >
                                    {expandedId === d._id
                                      ? "expand_less"
                                      : "expand_more"}
                                  </span>
                                  +{poulaillers.length - 2} de plus
                                </button>
                              )}
                            </td>

                            {/* ── Finances ── */}
                            <td
                              style={{
                                padding: "14px 18px",
                                verticalAlign: "top",
                              }}
                            >
                              {(["total", "advance"] as const).map((k) => (
                                <div
                                  key={k}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    marginBottom: 5,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 10.5,
                                      fontWeight: 600,
                                      width: 48,
                                      flexShrink: 0,
                                      color:
                                        k === "advance" ? "#059669" : "#94a3b8",
                                    }}
                                  >
                                    {k === "total" ? "Total" : "Avance"}
                                  </span>
                                  <div
                                    style={{ position: "relative", flex: 1 }}
                                  >
                                    <input
                                      type="number"
                                      value={ea[k]}
                                      disabled={isRO}
                                      onChange={(e) =>
                                        setEditAmounts((p) => ({
                                          ...p,
                                          [d._id]: {
                                            ...p[d._id],
                                            [k]: e.target.value,
                                            dirty: true,
                                          },
                                        }))
                                      }
                                      style={{
                                        width: "100%",
                                        background:
                                          k === "advance"
                                            ? "rgba(5,150,105,0.05)"
                                            : "#f8fafc",
                                        border: `1px solid ${k === "advance" ? "rgba(5,150,105,0.2)" : "#e2e8f0"}`,
                                        borderRadius: 7,
                                        padding: "6px 26px 6px 9px",
                                        fontSize: 11.5,
                                        fontWeight: 600,
                                        color:
                                          k === "advance"
                                            ? "#059669"
                                            : "#0f172a",
                                        outline: "none",
                                        fontFamily: "inherit",
                                        opacity: isRO ? 0.6 : 1,
                                      }}
                                    />
                                    <span
                                      style={{
                                        position: "absolute",
                                        right: 7,
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        fontSize: 9,
                                        fontWeight: 700,
                                        color:
                                          k === "advance"
                                            ? "#059669"
                                            : "#94a3b8",
                                      }}
                                    >
                                      DT
                                    </span>
                                  </div>
                                </div>
                              ))}
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  marginBottom: 5,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 10.5,
                                    fontWeight: 600,
                                    width: 48,
                                    flexShrink: 0,
                                    color: "#dc2626",
                                  }}
                                >
                                  Reste
                                </span>
                                <div
                                  style={{
                                    flex: 1,
                                    background: "rgba(220,38,38,0.05)",
                                    border: "1px solid rgba(220,38,38,0.15)",
                                    borderRadius: 7,
                                    padding: "6px 9px",
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    color:
                                      resteEdition > 0 ? "#dc2626" : "#059669",
                                    textAlign: "right",
                                  }}
                                >
                                  {resteEdition.toLocaleString("fr-FR", {
                                    minimumFractionDigits: 2,
                                  })}{" "}
                                  DT
                                </div>
                              </div>
                              {ea.dirty && !isRO && (
                                <div
                                  style={{
                                    fontSize: 9,
                                    color: "#d97706",
                                    fontWeight: 600,
                                    marginBottom: 4,
                                    textAlign: "center",
                                  }}
                                >
                                  ● Modifications non sauvegardées
                                </div>
                              )}
                              {!isRO && (
                                <button
                                  onClick={() => handleSaveAmounts(d._id)}
                                  disabled={ea.saving}
                                  style={{
                                    width: "100%",
                                    padding: 7,
                                    border: "none",
                                    borderRadius: 8,
                                    cursor: ea.saving
                                      ? "not-allowed"
                                      : "pointer",
                                    background: ea.dirty
                                      ? "#059669"
                                      : "#94a3b8",
                                    color: "#fff",
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 5,
                                    marginTop: 3,
                                    opacity: ea.saving ? 0.7 : 1,
                                    transition: "background 0.2s",
                                  }}
                                >
                                  <span
                                    className="material-symbols-outlined"
                                    style={{
                                      fontSize: 13,
                                      animation: ea.saving
                                        ? "spin 1s linear infinite"
                                        : "none",
                                    }}
                                  >
                                    {ea.saving ? "progress_activity" : "save"}
                                  </span>
                                  {ea.saving
                                    ? "Enregistrement…"
                                    : "Enregistrer"}
                                </button>
                              )}
                            </td>

                            {/* ── Statut & Progression ── */}
                            <td
                              style={{
                                padding: "14px 18px",
                                verticalAlign: "top",
                              }}
                            >
                              <StatusBadge status={d.status} />
                              <div
                                style={{
                                  fontSize: 10,
                                  color: "#94a3b8",
                                  margin: "5px 0 10px",
                                }}
                              >
                                {new Date(d.createdAt).toLocaleDateString(
                                  "fr-FR",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )}
                              </div>
                              <ProgressBPMN
                                dossier={d}
                                onEtapeChange={(etape) =>
                                  handleEtapeChange(d._id, etape)
                                }
                                loadingEtape={loadingEtapes[d._id] ?? null}
                              />
                            </td>

                            {/* ── Actions ── */}
                            <td
                              style={{
                                padding: "14px 18px",
                                verticalAlign: "top",
                              }}
                            >
                              {poulaillers.length > 2 && (
                                <button
                                  onClick={() =>
                                    setExpandedId(
                                      expandedId === d._id ? null : d._id,
                                    )
                                  }
                                  style={btnStyle("outline")}
                                >
                                  <span
                                    className="material-symbols-outlined"
                                    style={{ fontSize: 13 }}
                                  >
                                    expand_content
                                  </span>
                                  Détails
                                </button>
                              )}
                              {(d.status === "AVANCE_PAYEE" ||
                                d.status === "TERMINE") && (
                                <button
                                  onClick={() => setMPrint(d)}
                                  style={btnStyle("outline")}
                                >
                                  <span
                                    className="material-symbols-outlined"
                                    style={{ fontSize: 13 }}
                                  >
                                    print
                                  </span>
                                  Contrat
                                </button>
                              )}
                              {d.status === "EN_ATTENTE" && (
                                <button
                                  onClick={() => setMValidation(d)}
                                  style={btnStyle("green")}
                                >
                                  <span
                                    className="material-symbols-outlined"
                                    style={{ fontSize: 13 }}
                                  >
                                    verified
                                  </span>
                                  Valider
                                </button>
                              )}
                              {d.status === "AVANCE_PAYEE" &&
                                !d.etapes?.contratSigne && (
                                  <button
                                    onClick={() => setMContratSigne(d)}
                                    style={btnStyle("blue")}
                                  >
                                    <span
                                      className="material-symbols-outlined"
                                      style={{ fontSize: 13 }}
                                    >
                                      draw
                                    </span>
                                    Contrat signé
                                  </button>
                                )}
                              {d.status === "AVANCE_PAYEE" && (
                                <button
                                  onClick={() => setMCloture(d)}
                                  style={btnStyle("slate")}
                                >
                                  <span
                                    className="material-symbols-outlined"
                                    style={{ fontSize: 13 }}
                                  >
                                    lock
                                  </span>
                                  Clôturer
                                </button>
                              )}
                              {(d.status === "EN_ATTENTE" ||
                                d.status === "AVANCE_PAYEE") && (
                                <button
                                  onClick={() => setMAnnulation(d)}
                                  style={btnStyle("rose")}
                                >
                                  <span
                                    className="material-symbols-outlined"
                                    style={{ fontSize: 13 }}
                                  >
                                    cancel
                                  </span>
                                  Annuler
                                </button>
                              )}
                              {(d.status === "EN_ATTENTE" ||
                                d.status === "ANNULE") && (
                                <button
                                  onClick={() => setMSuppression(d)}
                                  style={btnStyle("red")}
                                >
                                  <span
                                    className="material-symbols-outlined"
                                    style={{ fontSize: 13 }}
                                  >
                                    delete_forever
                                  </span>
                                  Supprimer
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Panneau détail poulaillers ── */}
          {expandedDossier &&
            (() => {
              const pls = getPoulaillers(expandedDossier);
              return (
                <div
                  style={{
                    marginTop: 14,
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    overflow: "hidden",
                    animation: "modalIn 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      background: "linear-gradient(135deg,#059669,#047857)",
                      padding: "16px 22px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}
                      >
                        Tous les bâtiments —{" "}
                        {expandedDossier.eleveur?.firstName}{" "}
                        {expandedDossier.eleveur?.lastName}
                      </div>
                      <div
                        style={{
                          color: "rgba(255,255,255,0.65)",
                          fontSize: 11,
                          marginTop: 2,
                        }}
                      >
                        {pls.length} bâtiment{pls.length > 1 ? "s" : ""} ·{" "}
                        {expandedDossier.contractNumber}
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedId(null)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.18)",
                        border: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: "#fff",
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 15 }}
                      >
                        close
                      </span>
                    </button>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4,1fr)",
                      padding: "18px 22px",
                      borderBottom: "1px solid #f1f5f9",
                      gap: 12,
                    }}
                  >
                    {[
                      {
                        label: "Email",
                        val: expandedDossier.eleveur?.email ?? "—",
                      },
                      {
                        label: "Téléphone",
                        val: expandedDossier.eleveur?.phone ?? "—",
                      },
                      {
                        label: "Adresse",
                        val: expandedDossier.eleveur?.adresse ?? "—",
                      },
                      {
                        label: "Inscription",
                        val: new Date(
                          expandedDossier.createdAt,
                        ).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        }),
                      },
                    ].map((item) => (
                      <div key={item.label}>
                        <div
                          style={{
                            fontSize: 9,
                            textTransform: "uppercase",
                            letterSpacing: "1px",
                            color: "#94a3b8",
                            fontWeight: 700,
                            marginBottom: 3,
                          }}
                        >
                          {item.label}
                        </div>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {item.val}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3,1fr)",
                      padding: "14px 22px",
                      borderBottom: "1px solid #f1f5f9",
                      gap: 12,
                      background: "#f8fafc",
                    }}
                  >
                    {[
                      {
                        label: "Montant total",
                        value: expandedDossier.totalAmount ?? 0,
                        color: "#0f172a",
                      },
                      {
                        label: "Avance perçue",
                        value: expandedDossier.advanceAmount ?? 0,
                        color: "#059669",
                      },
                      {
                        label: "Reste dû",
                        value: expandedDossier.remainedAmount ?? 0,
                        color: "#dc2626",
                      },
                    ].map((item) => (
                      <div key={item.label} style={{ textAlign: "center" }}>
                        <div
                          style={{
                            fontSize: 9,
                            color: "#94a3b8",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.8px",
                            marginBottom: 4,
                          }}
                        >
                          {item.label}
                        </div>
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 800,
                            color: item.color,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {item.value.toLocaleString("fr-FR", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          DT
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4,1fr)",
                      gap: 12,
                      padding: "18px 22px",
                    }}
                  >
                    {pls.map((p: Poulailler, idx: number) => {
                      const density = getDensite(p);
                      const ds = densiteStyle(density);
                      return (
                        <div
                          key={p._id || idx}
                          style={{
                            background: "#f8fafc",
                            border: "1px solid #f1f5f9",
                            borderRadius: 10,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              padding: "10px 13px",
                              background:
                                "linear-gradient(135deg,#059669,#047857)",
                            }}
                          >
                            <div
                              style={{
                                color: "#fff",
                                fontWeight: 700,
                                fontSize: 13,
                              }}
                            >
                              {p.name}
                            </div>
                            <div
                              style={{
                                color: "rgba(255,255,255,0.6)",
                                fontSize: 10,
                              }}
                            >
                              Bâtiment #{idx + 1} · {TYPE_LABEL[p.type] ?? "—"}
                            </div>
                          </div>
                          <div style={{ padding: "12px 13px" }}>
                            {[
                              {
                                l: "Volailles",
                                v: `${(p.animalCount ?? 0).toLocaleString("fr-FR")} têtes`,
                              },
                              {
                                l: "Surface",
                                v:
                                  p.surface && p.surface > 0
                                    ? `${p.surface} m²`
                                    : "—",
                              },
                            ].map((row) => (
                              <div
                                key={row.l}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  marginBottom: 7,
                                }}
                              >
                                <span
                                  style={{ fontSize: 10, color: "#94a3b8" }}
                                >
                                  {row.l}
                                </span>
                                <span style={{ fontSize: 11, fontWeight: 700 }}>
                                  {row.v}
                                </span>
                              </div>
                            ))}
                            {density > 0 && (
                              <div
                                style={{
                                  marginTop: 8,
                                  padding: "5px 9px",
                                  borderRadius: 7,
                                  background: ds.bg,
                                  display: "flex",
                                  justifyContent: "space-between",
                                }}
                              >
                                <span
                                  style={{ fontSize: 10, color: "#94a3b8" }}
                                >
                                  Densité
                                </span>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: ds.color,
                                  }}
                                >
                                  {density.toFixed(2)}/m² · {ds.label}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
        </main>
      </div>

      {/* ── Modales ── */}
      {mValidation && (
        <ModalValidation
          dossier={mValidation}
          onConfirm={handleValidate}
          onClose={() => setMValidation(null)}
        />
      )}
      {mContratSigne && (
        <ModalContratSigne
          dossier={mContratSigne}
          onConfirm={handleContratSigne}
          onClose={() => setMContratSigne(null)}
        />
      )}
      {mCloture && (
        <ModalCloture
          dossier={mCloture}
          onConfirm={handleCloture}
          onClose={() => setMCloture(null)}
        />
      )}
      {mAnnulation && (
        <ModalAnnulation
          dossier={mAnnulation}
          onConfirm={handleAnnulation}
          onClose={() => setMAnnulation(null)}
        />
      )}
      {mSuppression && (
        <ModalSuppression
          dossier={mSuppression}
          onConfirm={handleSuppression}
          onClose={() => setMSuppression(null)}
        />
      )}
      {mInstaller && (
        <ModalInstaller
          dossier={mInstaller}
          onGoToModules={() => {
            setMInstaller(null);
            window.location.href = "/modules";
          }}
          onClose={() => setMInstaller(null)}
        />
      )}
      {mActiver && (
        <ModalActiver
          dossier={mActiver}
          onConfirm={handleActiver}
          onGoToUsers={() => {
            setMActiver(null);
            window.location.href = "/utilisateurs";
          }}
          onClose={() => setMActiver(null)}
        />
      )}
      {mPrint && (
        <ContratPrint dossier={mPrint} onClose={() => setMPrint(null)} />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
