import { useRef } from "react";

interface Poulailler {
  _id?: string;
  name: string;
  animalCount: number;
  surface?: number;
  description?: string;
  location?: string;
}

interface Dossier {
  _id: string;
  eleveur: {
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
    description?: string;
    location?: string;
  };
  tousPoulaillers?: Poulailler[];
  totalAmount: number;
  advanceAmount: number;
  remainedAmount: number;
  status: "EN_ATTENTE" | "AVANCE_PAYEE" | "TERMINE";
  contractNumber: string;
  createdAt: string;
  dateCloture?: string;
  motifCloture?: string;
}

interface ContratPrintProps {
  dossier: Dossier;
  onClose: () => void;
}

// ───────────────────────────────────────────────────────────── Helpers ─────────────────────────────────────────────────────────────

function parseSurface(description?: string): number {
  if (!description) return 0;
  const m = description.match(/Surface:\s*([\d.]+)m²/);
  return m ? parseFloat(m[1]) : 0;
}

// ───────────────────────────────────────────────────────────── Component ─────────────────────────────────────────────────────────────

export default function ContratPrint({ dossier, onClose }: ContratPrintProps) {
  const printRef = useRef<HTMLDivElement>(null);

  // Utiliser tous les poulaillers si disponibles, sinon fallback sur le poulailler principal
  const poulaillers: Poulailler[] =
    dossier.tousPoulaillers && dossier.tousPoulaillers.length > 0
      ? dossier.tousPoulaillers
      : [dossier.poulailler];

  const totalVolailles = poulaillers.reduce(
    (s, p) => s + (p.animalCount ?? 0),
    0,
  );
  const totalSurface = poulaillers.reduce(
    (s, p) => s + (p.surface ?? parseSurface(p.description)),
    0,
  );
  const densiteGlobale =
    totalSurface > 0 ? (totalVolailles / totalSurface).toFixed(2) : "—";

  const dateContrat = new Date(dossier.createdAt).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const dateCloture = dossier.dateCloture
    ? new Date(dossier.dateCloture).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : null;

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <title>Contrat SmartPoultry</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Inter', sans-serif;
            color: #1a1a1a;
            background: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page { size: A4; margin: 0; }
          @media print { body { -webkit-print-color-adjust: exact; } }

          .page {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            background: white;
            position: relative;
            overflow: hidden;
          }
          .geo-top-right {
            position: absolute; top: 0; right: 0;
            width: 160px; height: 160px;
            background: #00361a; opacity: 0.06;
            clip-path: polygon(100% 0, 100% 100%, 0 0);
          }
          .geo-bottom-left {
            position: absolute; bottom: 0; left: 0;
            width: 120px; height: 120px;
            background: #00361a; opacity: 0.05;
            clip-path: polygon(0 100%, 100% 100%, 0 0);
          }

          /* ── Header ── */
          .header {
            background: linear-gradient(135deg, #00361a 0%, #1a4d2e 100%);
            padding: 32px 40px 24px;
            display: flex; justify-content: space-between; align-items: flex-end;
          }
          .header-logo { color: white; }
          .header-logo h1 { font-family: 'DM Serif Display', serif; font-size: 26px; letter-spacing: -0.5px; margin-bottom: 4px; }
          .header-logo p { color: #9dd3aa; font-size: 10px; }
          .header-ref { text-align: right; color: white; }
          .header-ref .ref-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.15em; color: #9dd3aa; margin-bottom: 4px; }
          .header-ref .ref-num { font-family: 'DM Serif Display', serif; font-size: 17px; letter-spacing: 1px; }
          .header-ref .ref-date { font-size: 10px; color: #9dd3aa; margin-top: 2px; }

          /* ── Status banner ── */
          .status-banner {
            padding: 9px 40px;
            display: flex; align-items: center; gap: 10px;
            font-size: 11px; font-weight: 600;
          }
          .status-banner.avance { background: #e7f5ec; border-left: 4px solid #00361a; color: #00361a; }
          .status-banner.termine { background: #f1f5f9; border-left: 4px solid #475569; color: #334155; }
          .status-check {
            width: 18px; height: 18px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            color: white; font-size: 10px; flex-shrink: 0;
          }
          .status-check.avance { background: #00361a; }
          .status-check.termine { background: #475569; }

          /* ── Corps ── */
          .body { padding: 24px 40px 20px; }

          .contract-title { text-align: center; margin-bottom: 22px; }
          .contract-title h2 { font-family: 'DM Serif Display', serif; font-size: 20px; color: #00361a; }
          .contract-title p { font-size: 10px; color: #717971; margin-top: 4px; }

          /* ── Sections ── */
          .section { margin-bottom: 18px; }
          .section-header {
            display: flex; align-items: center; gap: 10px;
            margin-bottom: 10px; padding-bottom: 5px;
            border-bottom: 1.5px solid #e1e3e4;
          }
          .section-num {
            width: 20px; height: 20px; border-radius: 50%;
            background: #00361a; color: white;
            font-size: 9px; font-weight: 700;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
          }
          .section-title { font-family: 'DM Serif Display', serif; font-size: 13px; color: #00361a; }

          /* ── Info grid ── */
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 24px; }
          .info-row { display: flex; flex-direction: column; padding: 5px 0; border-bottom: 1px solid #f3f4f5; }
          .info-row.full { grid-column: 1 / -1; }
          .info-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.1em; color: #717971; margin-bottom: 1px; }
          .info-value { font-size: 11px; font-weight: 500; color: #1a1a1a; }

          /* ── Poulaillers grid ── */
          .poulaillers-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
            gap: 10px;
            margin-bottom: 10px;
          }
          .poulailler-card {
            border: 1px solid #e1e3e4;
            border-radius: 8px;
            overflow: hidden;
          }
          .poulailler-header {
            background: linear-gradient(135deg, #00361a, #1a4d2e);
            padding: 8px 12px;
          }
          .poulailler-header .p-name { color: white; font-size: 11px; font-weight: 700; }
          .poulailler-header .p-num { color: #9dd3aa; font-size: 9px; }
          .poulailler-body { padding: 8px 12px; background: #fafafa; }
          .p-row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #f3f4f5; font-size: 10px; }
          .p-row:last-child { border-bottom: none; }
          .p-row .p-label { color: #717971; }
          .p-row .p-value { font-weight: 600; color: #1a1a1a; }
          .density-pill {
            display: inline-block;
            font-size: 8px; font-weight: 700;
            padding: 2px 6px; border-radius: 99px;
            margin-top: 4px;
          }

          /* ── Totaux poulaillers ── */
          .poulaillers-totaux {
            display: flex; gap: 16px; flex-wrap: wrap;
            background: #e7f5ec; border-radius: 8px;
            padding: 8px 14px; margin-top: 6px;
            font-size: 10px; color: #00361a;
          }
          .totaux-item { display: flex; flex-direction: column; }
          .totaux-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; color: #1a4d2e; opacity: 0.8; }
          .totaux-value { font-weight: 700; font-size: 13px; }

          /* ── Finance box ── */
          .finance-box {
            background: #f8f9fa; border-radius: 10px;
            padding: 14px; display: grid; grid-template-columns: 1fr 1fr 1fr;
            gap: 12px; text-align: center;
          }
          .finance-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.1em; color: #717971; margin-bottom: 3px; }
          .finance-value { font-size: 16px; font-weight: 700; }
          .finance-total { color: #191c1d; }
          .finance-avance { color: #00361a; }
          .finance-reste { color: #ba1a1a; }

          /* ── Density indicator ── */
          .density-box {
            display: inline-flex; align-items: center; gap: 6px;
            color: white; border-radius: 6px;
            padding: 6px 12px; font-size: 10px; font-weight: 600; margin-top: 6px;
          }

          /* ── Engagements ── */
          .engagement-list { padding: 0; list-style: none; }
          .engagement-list li {
            display: flex; gap: 8px; padding: 4px 0;
            font-size: 10px; color: #414942;
            border-bottom: 1px solid #f3f4f5;
          }
          .engagement-list li:last-child { border-bottom: none; }
          .eng-bullet {
            width: 13px; height: 13px; border-radius: 50%;
            background: #e7f5ec; color: #00361a;
            font-size: 7px; font-weight: 700;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; margin-top: 1px;
          }

          /* ── Clôture block ── */
          .cloture-block {
            background: #f1f5f9; border: 1px solid #cbd5e1;
            border-radius: 8px; padding: 10px 14px; margin-bottom: 14px;
          }
          .cloture-block .c-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; font-weight: 700; }
          .cloture-block .c-date { font-size: 11px; font-weight: 600; color: #334155; margin-top: 2px; }
          .cloture-block .c-motif { font-size: 10px; color: #64748b; margin-top: 4px; font-style: italic; }

          /* ── Signatures ── */
          .signatures {
            display: grid; grid-template-columns: 1fr 1fr;
            gap: 32px; margin-top: 22px; padding-top: 16px;
            border-top: 1.5px solid #e1e3e4;
          }
          .sig-party { font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: #717971; margin-bottom: 4px; font-weight: 600; }
          .sig-name { font-size: 12px; font-weight: 600; color: #00361a; margin-bottom: 3px; }
          .sig-detail { font-size: 9px; color: #717971; margin-bottom: 44px; }
          .sig-line { border-top: 1px solid #414942; padding-top: 3px; font-size: 8px; color: #717971; }

          /* ── Footer ── */
          .footer {
            background: #f3f4f5; padding: 12px 40px;
            display: flex; justify-content: space-between; align-items: center;
            margin-top: 18px;
          }
          .footer p { font-size: 8.5px; color: #717971; line-height: 1.5; }
          .footer .doc-mention { font-size: 9px; color: #9dd3aa; background: #00361a; padding: 3px 9px; border-radius: 4px; white-space: nowrap; }

          /* ── Watermark ── */
          .watermark {
            position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -50%) rotate(-35deg);
            font-family: 'DM Serif Display', serif;
            font-size: 72px; color: #00361a; opacity: 0.04;
            pointer-events: none; white-space: nowrap; z-index: 0;
          }
          .content-wrap { position: relative; z-index: 1; }
        </style>
      </head>
      <body>
        ${content}
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() { window.close(); };
          };
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const nomComplet =
    `${dossier.eleveur?.firstName ?? ""} ${dossier.eleveur?.lastName ?? ""}`.trim() ||
    "—";
  const isAvancePaye = dossier.status === "AVANCE_PAYEE";
  const isTermine = dossier.status === "TERMINE";

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
          {/* Modal header */}
          <div
            className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
            style={{
              background: "linear-gradient(135deg,#00361a,#1a4d2e)",
              color: "white",
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  color: "#9dd3aa",
                  marginBottom: 2,
                }}
              >
                Contrat officiel
              </p>
              <h2 style={{ fontWeight: 800, fontSize: 15 }}>
                {nomComplet} — {dossier.contractNumber}
              </h2>
              <p style={{ fontSize: 11, color: "#9dd3aa", marginTop: 2 }}>
                {poulaillers.length} bâtiment{poulaillers.length > 1 ? "s" : ""}{" "}
                · {totalVolailles.toLocaleString("fr-FR")} têtes ·{" "}
                {totalSurface} m²
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all active:scale-95"
                style={{ background: "white", color: "#00361a" }}
              >
                <span className="material-symbols-outlined text-base">
                  print
                </span>
                Imprimer (2 ex.)
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg transition hover:bg-white/20"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>

          {/* Scrollable preview */}
          <div className="flex-1 overflow-y-auto bg-slate-100 p-6">
            <div
              ref={printRef}
              style={{
                width: "100%",
                maxWidth: 794,
                margin: "0 auto",
                background: "white",
                boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
                borderRadius: 4,
              }}
            >
              {/* ── CONTRAT HTML ── */}
              <div className="page">
                <div className="geo-top-right" />
                <div className="geo-bottom-left" />
                <div className="watermark">SMARTPOULTRY</div>

                <div className="content-wrap">
                  {/* Header */}
                  <div className="header">
                    <div className="header-logo">
                      <h1>SmartPoultry</h1>
                      <p>Precision IoT for the Living Laboratory</p>
                      <p
                        style={{ marginTop: 6, fontSize: 9, color: "#c8e6cc" }}
                      >
                        contact@smartpoultry.tn · +216 58 644 199
                      </p>
                    </div>
                    <div className="header-ref">
                      <div className="ref-label">N° Contrat</div>
                      <div className="ref-num">{dossier.contractNumber}</div>
                      <div className="ref-date">Émis le {dateContrat}</div>
                      {isTermine && dateCloture && (
                        <div
                          className="ref-date"
                          style={{ marginTop: 4, color: "#94a3b8" }}
                        >
                          Clôturé le {dateCloture}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status banner */}
                  {isAvancePaye && (
                    <div className="status-banner avance">
                      <div className="status-check avance">✓</div>
                      <span>
                        AVANCE REÇUE — Dossier technique validé par SmartPoultry
                      </span>
                    </div>
                  )}
                  {isTermine && (
                    <div className="status-banner termine">
                      <div className="status-check termine">✓</div>
                      <span>
                        DOSSIER CLÔTURÉ — Installation terminée et soldée
                      </span>
                    </div>
                  )}

                  {/* Body */}
                  <div className="body">
                    <div className="contract-title">
                      <h2>CONTRAT D'INSTALLATION IoT</h2>
                      <p>
                        Conclu entre SmartPoultry (Prestataire) et l'éleveur
                        désigné ci-dessous (Client)
                      </p>
                    </div>

                    {/* Bloc clôture si TERMINE */}
                    {isTermine && (
                      <div className="cloture-block">
                        <div className="c-label">Informations de clôture</div>
                        {dateCloture && (
                          <div className="c-date">
                            Date de clôture : {dateCloture}
                          </div>
                        )}
                        {dossier.motifCloture && (
                          <div className="c-motif">
                            Motif : {dossier.motifCloture}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Section 1 — Éleveur */}
                    <div className="section">
                      <div className="section-header">
                        <div className="section-num">1</div>
                        <div className="section-title">
                          Informations de l'éleveur
                        </div>
                      </div>
                      <div className="info-grid">
                        <div className="info-row">
                          <span className="info-label">Nom complet</span>
                          <span className="info-value">{nomComplet}</span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Téléphone</span>
                          <span className="info-value">
                            {dossier.eleveur?.phone || "—"}
                          </span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Email</span>
                          <span className="info-value">
                            {dossier.eleveur?.email || "—"}
                          </span>
                        </div>
                        {dossier.eleveur?.adresse && (
                          <div className="info-row">
                            <span className="info-label">Adresse</span>
                            <span className="info-value">
                              {dossier.eleveur.adresse}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Section 2 — Tous les poulaillers */}
                    <div className="section">
                      <div className="section-header">
                        <div className="section-num">2</div>
                        <div className="section-title">
                          Exploitation avicole — {poulaillers.length} bâtiment
                          {poulaillers.length > 1 ? "s" : ""}
                        </div>
                      </div>

                      <div className="poulaillers-grid">
                        {poulaillers.map((p, idx) => {
                          const surface =
                            p.surface ?? parseSurface(p.description);
                          const density =
                            surface > 0 ? p.animalCount / surface : 0;
                          const densityColor =
                            density > 15
                              ? {
                                  bg: "#fef2f2",
                                  color: "#7f1d1d",
                                  label: "Critique",
                                }
                              : density > 10
                                ? {
                                    bg: "#fffbeb",
                                    color: "#92400e",
                                    label: "Élevée",
                                  }
                                : {
                                    bg: "#f0fdf4",
                                    color: "#00361a",
                                    label: "Optimale",
                                  };

                          return (
                            <div key={p._id ?? idx} className="poulailler-card">
                              <div className="poulailler-header">
                                <div className="p-name">{p.name}</div>
                                <div className="p-num">Bâtiment #{idx + 1}</div>
                              </div>
                              <div className="poulailler-body">
                                <div className="p-row">
                                  <span className="p-label">Type</span>\n                                  <span className="p-value">—</span>
                                </div>
                                <div className="p-row">
                                  <span className="p-label">Volailles</span>
                                  <span className="p-value">
                                    {(p.animalCount ?? 0).toLocaleString(
                                      "fr-FR",
                                    )}{" "}
                                    têtes
                                  </span>
                                </div>
                                <div className="p-row">
                                  <span className="p-label">Surface</span>
                                  <span className="p-value">
                                    {surface > 0 ? `${surface} m²` : "—"}
                                  </span>
                                </div>
                                {p.location && (
                                  <div className="p-row">
                                    <span className="p-label">Adresse</span>
                                    <span
                                      className="p-value"
                                      style={{
                                        maxWidth: 120,
                                        textAlign: "right",
                                      }}
                                    >
                                      {p.location}
                                    </span>
                                  </div>
                                )}
                                {density > 0 && (
                                  <div style={{ paddingTop: 4 }}>
                                    <span
                                      className="density-pill"
                                      style={{
                                        background: densityColor.bg,
                                        color: densityColor.color,
                                      }}
                                    >
                                      {density.toFixed(2)}/m² —{" "}
                                      {densityColor.label}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Totaux */}
                      <div className="poulaillers-totaux">
                        <div className="totaux-item">
                          <span className="totaux-label">Total bâtiments</span>
                          <span className="totaux-value">
                            {poulaillers.length}
                          </span>
                        </div>
                        <div className="totaux-item">
                          <span className="totaux-label">Total volailles</span>
                          <span className="totaux-value">
                            {totalVolailles.toLocaleString("fr-FR")} têtes
                          </span>
                        </div>
                        <div className="totaux-item">
                          <span className="totaux-label">Surface totale</span>
                          <span className="totaux-value">
                            {totalSurface} m²
                          </span>
                        </div>
                        <div className="totaux-item">
                          <span className="totaux-label">Densité globale</span>
                          <span className="totaux-value">
                            {densiteGlobale} /m²
                          </span>
                        </div>
                      </div>

                      {/* Indicateur densité globale */}
                      {densiteGlobale !== "—" && (
                        <div
                          className="density-box"
                          style={{
                            background:
                              parseFloat(densiteGlobale) > 15
                                ? "#7f1d1d"
                                : parseFloat(densiteGlobale) > 10
                                  ? "#92400e"
                                  : "#00361a",
                            marginTop: 8,
                          }}
                        >
                          <span>
                            {parseFloat(densiteGlobale) <= 10
                              ? "✓ Densité globale optimale"
                              : parseFloat(densiteGlobale) <= 15
                                ? "⚠ Densité globale élevée — surveillance renforcée"
                                : "✗ Densité globale critique — hors normes"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Section 3 — Finances */}
                    <div className="section">
                      <div className="section-header">
                        <div className="section-num">3</div>
                        <div className="section-title">
                          Conditions financières
                        </div>
                      </div>
                      <div className="finance-box">
                        <div>
                          <div className="finance-label">Montant total</div>
                          <div className="finance-value finance-total">
                            {dossier.totalAmount?.toLocaleString("fr-FR") ?? 0}{" "}
                            <span style={{ fontSize: 11 }}>DT</span>
                          </div>
                        </div>
                        <div>
                          <div className="finance-label">Avance versée</div>
                          <div className="finance-value finance-avance">
                            {dossier.advanceAmount?.toLocaleString("fr-FR") ??
                              0}{" "}
                            <span style={{ fontSize: 11 }}>DT</span>
                          </div>
                        </div>
                        <div>
                          <div className="finance-label">Solde restant</div>
                          <div className="finance-value finance-reste">
                            {dossier.remainedAmount?.toLocaleString("fr-FR") ??
                              0}{" "}
                            <span style={{ fontSize: 11 }}>DT</span>
                          </div>
                        </div>
                      </div>
                      <p
                        style={{
                          fontSize: 8.5,
                          color: "#717971",
                          marginTop: 6,
                        }}
                      >
                        * Le solde restant sera dû à la livraison et
                        installation complète du matériel IoT.
                      </p>
                    </div>

                    {/* Section 4 — Engagements */}
                    <div className="section">
                      <div className="section-header">
                        <div className="section-num">4</div>
                        <div className="section-title">
                          Engagements des parties
                        </div>
                      </div>
                      <ul className="engagement-list">
                        {[
                          "SmartPoultry s'engage à installer les équipements IoT (capteurs température, humidité, qualité d'air) dans les délais convenus après validation.",
                          `L'éleveur s'engage à fournir un accès complet aux ${poulaillers.length} bâtiment${poulaillers.length > 1 ? "s" : ""} et à régler le solde restant à la livraison du matériel.`,
                          "La garantie matérielle est de 12 mois à compter de la date d'installation. Les mises à jour logicielles sont incluses et gratuites.",
                          "L'accès à l'application mobile SmartPoultry est activé dès la signature du présent contrat et le versement de l'avance.",
                          "En cas de résiliation par l'éleveur avant installation, l'avance versée sera retenue à titre d'indemnité forfaitaire.",
                        ].map((eng, i) => (
                          <li key={i}>
                            <div className="eng-bullet">✓</div>
                            <span>{eng}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Signatures */}
                    <div className="signatures">
                      <div>
                        <div className="sig-party">
                          Pour SmartPoultry (Prestataire)
                        </div>
                        <div className="sig-name">Chaima Bounawara</div>
                        <div className="sig-detail">
                          Responsable Projet · SmartPoultry
                        </div>
                        <div className="sig-line">
                          Date et signature / Cachet
                        </div>
                      </div>
                      <div>
                        <div className="sig-party">L'éleveur (Client)</div>
                        <div className="sig-name">{nomComplet}</div>
                        <div className="sig-detail">
                          {dossier.eleveur?.phone || ""}
                        </div>
                        <div className="sig-line">
                          Date et signature / Cachet
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="footer">
                    <p>
                      SmartPoultry — Rue de l'Indépendance, Immeuble Horizon,
                      2013 Ben Arous, Tunisie
                      <br />
                      contact@smartpoultry.tn · +216 58 644 199 ·
                      www.smartpoultry.tn
                    </p>
                    <div className="doc-mention">2 exemplaires originaux</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="px-6 py-3 border-t bg-slate-50 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
            <span>
              📄 Contrat A4 · {poulaillers.length} bâtiment
              {poulaillers.length > 1 ? "s" : ""} ·{" "}
              {totalVolailles.toLocaleString("fr-FR")} têtes · 2 exemplaires
            </span>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-white text-xs transition active:scale-95"
              style={{ background: "#00361a" }}
            >
              <span className="material-symbols-outlined text-sm">print</span>
              Lancer l'impression
            </button>
          </div>
        </div>
      </div>
    </>
  );
}