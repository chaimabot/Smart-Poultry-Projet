import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Format date française
const formatDate = (date) => {
  if (!date) return "N/A";
  const d = new Date(date);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Format période
const formatPeriode = (period) => {
  const periodMap = {
    "24h": "Dernières 24 heures",
    "7d": "7 derniers jours",
    "30d": "30 derniers jours",
    "90d": "90 derniers jours",
  };
  return periodMap[period] || period;
};

// Générer le PDF du rapport global
export const generateGlobalReportPDF = (report, period) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // En-tête
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("RAPPORT GLOBAL - SMART POULTRY", pageWidth / 2, 20, {
    align: "center",
  });

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Période: ${formatPeriode(period)}`, pageWidth / 2, 28, {
    align: "center",
  });
  doc.text(`Date de génération: ${formatDate(new Date())}`, pageWidth / 2, 34, {
    align: "center",
  });

  // Ligne de séparation
  doc.setDrawColor(0);
  doc.line(20, 40, pageWidth - 20, 40);

  let yPos = 50;

  // Section Poulaillers
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("POULAILLERS", 20, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  autoTable(doc, {
    startY: yPos,
    head: [["Indicateur", "Valeur"]],
    body: [
      ["Total des poulaillers", report.poulaillers.total.toString()],
      ["Poulaillers actifs", report.poulaillers.actifs.toString()],
      ["Taux d'activité", `${report.poulaillers.pourcentageActifs}%`],
    ],
    theme: "plain",
    styles: {
      fontSize: 10,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: "bold",
    },
  });

  yPos = doc.lastAutoTable.finalY + 15;

  // Section Éleveurs
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("ÉLEVEURS", 20, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [["Indicateur", "Valeur"]],
    body: [
      ["Total des élevés", report.eleveurs.total.toString()],
      ["Éleveurs actifs", report.eleveurs.actifs.toString()],
      [
        "Taux d'activité",
        `${report.eleveurs.total > 0 ? Math.round((report.eleveurs.actifs / report.eleveurs.total) * 100) : 0}%`,
      ],
    ],
    theme: "plain",
    styles: {
      fontSize: 10,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: "bold",
    },
  });

  yPos = doc.lastAutoTable.finalY + 15;

  // Section Modules
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("MODULES", 20, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [["Indicateur", "Valeur"]],
    body: [
      ["Total des modules", report.modules.total.toString()],
      ["Modules connectés", report.modules.connectes.toString()],
      ["Taux de connexion", report.modules.tauxConnexion],
    ],
    theme: "plain",
    styles: {
      fontSize: 10,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: "bold",
    },
  });

  yPos = doc.lastAutoTable.finalY + 15;

  // Section Alertes
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("ALERTES", 20, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [["Indicateur", "Valeur"]],
    body: [
      ["Total des alertes", report.alertes.total.toString()],
      ["Alertes critiques", report.alertes.critiques.toString()],
      ["Avertissements", report.alertes.warnings.toString()],
      ["Alertes résolues", report.alertes.resolues.toString()],
      [
        "Taux de résolution",
        `${report.alertes.total > 0 ? Math.round((report.alertes.resolues / report.alertes.total) * 100) : 0}%`,
      ],
    ],
    theme: "plain",
    styles: {
      fontSize: 10,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: "bold",
    },
  });

  yPos = doc.lastAutoTable.finalY + 15;

  // Section Commandes
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("COMMANDES", 20, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [["Indicateur", "Valeur"]],
    body: [
      ["Total des commandes", report.commandes.total.toString()],
      ["Commandes exécutées", report.commandes.executees.toString()],
      ["Commandes échouées", report.commandes.echouees.toString()],
      ["Taux de réussite", `${report.commandes.tauxReussite}%`],
    ],
    theme: "plain",
    styles: {
      fontSize: 10,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: "bold",
    },
  });

  // Pied de page
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Page ${i} sur ${pageCount} - Smart Poultry - Rapport généré le ${formatDate(new Date())}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" },
    );
  }

  // Sauvegarde
  doc.save(
    `rapport-smart-poultry-${period}-${new Date().toISOString().split("T")[0]}.pdf`,
  );
};

// Générer le PDF du rapport alertes
export const generateAlertesReportPDF = (report, period) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // En-tête
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("RAPPORT DES ALERTES - SMART POULTRY", pageWidth / 2, 20, {
    align: "center",
  });

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Période: ${formatPeriode(period)}`, pageWidth / 2, 28, {
    align: "center",
  });
  doc.text(`Date de génération: ${formatDate(new Date())}`, pageWidth / 2, 34, {
    align: "center",
  });

  doc.setDrawColor(0);
  doc.line(20, 40, pageWidth - 20, 40);

  let yPos = 50;

  // Tableau par paramètre
  if (report.parParametre && report.parParametre.length > 0) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("ALERTES PAR PARAMÈTRE", 20, yPos);
    yPos += 8;

    autoTable(doc, {
      startY: yPos,
      head: [["Paramètre", "Total", "Critiques", "Avertissements"]],
      body: report.parParametre.map((p) => [
        p.parameter || "N/A",
        p.total.toString(),
        p.critiques.toString(),
        p.warnings.toString(),
      ]),
      theme: "plain",
      styles: {
        fontSize: 10,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: "bold",
      },
    });

    yPos = doc.lastAutoTable.finalY + 15;
  }

  // Tableau par poulailler
  if (report.parPoulailler && report.parPoulailler.length > 0) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("ALERTES PAR POULAILLER", 20, yPos);
    yPos += 8;

    autoTable(doc, {
      startY: yPos,
      head: [["Poulailler", "Total", "Critiques"]],
      body: report.parPoulailler.map((p) => [
        p.poulaillerName || "N/A",
        p.count.toString(),
        p.critical.toString(),
      ]),
      theme: "plain",
      styles: {
        fontSize: 10,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: "bold",
      },
    });
  }

  // Pied de page
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(
      `Page ${i} sur ${pageCount} - Smart Poultry - Rapport généré le ${formatDate(new Date())}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" },
    );
  }

  doc.save(
    `rapport-alertes-smart-poultry-${period}-${new Date().toISOString().split("T")[0]}.pdf`,
  );
};

// Générer le PDF du rapport modules
export const generateModulesReportPDF = (report, period) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // En-tête
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("RAPPORT DES MODULES - SMART POULTRY", pageWidth / 2, 20, {
    align: "center",
  });

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Période: ${formatPeriode(period)}`, pageWidth / 2, 28, {
    align: "center",
  });
  doc.text(`Date de génération: ${formatDate(new Date())}`, pageWidth / 2, 34, {
    align: "center",
  });

  doc.setDrawColor(0);
  doc.line(20, 40, pageWidth - 20, 40);

  let yPos = 50;

  // Statistiques globales
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("STATISTIQUES GLOBALES", 20, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [["Indicateur", "Valeur"]],
    body: [
      ["Total des modules", report.total.toString()],
      ["Modules connectés", report.connectes.toString()],
      ["Modules déconnectés", report.deconnectes.toString()],
      ["Taux de connexion", `${report.tauxConnexion}%`],
    ],
    theme: "plain",
    styles: {
      fontSize: 10,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: "bold",
    },
  });

  yPos = doc.lastAutoTable.finalY + 15;

  // Liste des modules
  if (report.modules && report.modules.length > 0) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("LISTE DES MODULES", 20, yPos);
    yPos += 8;

    autoTable(doc, {
      startY: yPos,
      head: [["Module", "Type", "Poulailler", "Statut", "Dernière connexion"]],
      body: report.modules.map((m) => [
        m.name || "N/A",
        m.type || "N/A",
        m.poulailler || "Non associé",
        m.status || "unknown",
        m.lastPing ? new Date(m.lastPing).toLocaleDateString("fr-FR") : "N/A",
      ]),
      theme: "plain",
      styles: {
        fontSize: 9,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: "bold",
      },
    });
  }

  // Pied de page
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(
      `Page ${i} sur ${pageCount} - Smart Poultry - Rapport généré le ${formatDate(new Date())}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" },
    );
  }

  doc.save(
    `rapport-modules-smart-poultry-${period}-${new Date().toISOString().split("T")[0]}.pdf`,
  );
};
