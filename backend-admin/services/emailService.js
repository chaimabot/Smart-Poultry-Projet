// services/emailService.js
const nodemailer = require("nodemailer");

// Vérifier si les credentials email sont configurés
const hasEmailCredentials = process.env.SMTP_USER && process.env.SMTP_PASS;

let transporter;

// Initialiser le transporter
async function getTransporter() {
  if (transporter) return transporter;

  if (hasEmailCredentials) {
    // Utiliser SMTP configuré (Gmail ou autre)
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    console.log(
      "[EMAIL] Utilisation de SMTP:",
      process.env.SMTP_HOST || "smtp.gmail.com",
    );
  } else {
    console.error(
      "[EMAIL] Credentials SMTP non configurés. Les emails ne seront pas envoyés.",
    );
    throw new Error("SMTP credentials not configured");
  }

  return transporter;
}

exports.sendInviteEmail = async (email, token, firstName, role = "eleveur") => {
  try {
    const transport = await getTransporter();
    const resetLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/definir-mot-de-passe/${token}`;

    const roleLabel = role === "admin" ? "administrateur" : "éleveur";
    const accountType =
      role === "admin" ? "compte administrateur" : "compte élèveur";

    const mailOptions = {
      from: `"Smart Poultry Admin" <${process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@smartpoultry.com"}>`,
      to: email,
      subject:
        role === "admin"
          ? "Activez votre compte Administrateur Smart Poultry"
          : "Activez votre compte Smart Poultry",
      html: `
        <h2>Bonjour${firstName ? " " + firstName : ""},</h2>
        <p>Un ${accountType} a été créé pour vous sur Smart Poultry.</p>
        <p>Cliquez sur le lien ci-dessous pour définir votre mot de passe et activer votre compte :</p>
        <p style="margin: 20px 0;">
          <a href="${resetLink}" style="background:#0066cc; color:white; padding:12px 24px; text-decoration:none; border-radius:6px;">
            Définir mon mot de passe
          </a>
        </p>
        <p>Ce lien est valide pendant 7 jours.</p>
        <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
        <p>À bientôt,<br>L'équipe Smart Poultry</p>
      `,
    };

    const info = await transport.sendMail(mailOptions);

    console.log(
      "[EMAIL] Email envoyé à:",
      email,
      "- Message ID:",
      info.messageId,
      "- Role:",
      role,
    );

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("[EMAIL ERROR]", error);
    throw error;
  }
};

exports.sendInvitationEmail = async ({ email, firstName, role, resetLink }) => {
  try {
    const transport = await getTransporter();

    const mailOptions = {
      from: `"Smart Poultry Admin" <${process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@smartpoultry.com"}>`,
      to: email,
      subject: `Création de votre compte ${role} - Smart Poultry`,
      html: `
        <h2>Bonjour ${firstName},</h2>
        <p>Un compte administrateur a été créé pour vous sur Smart Poultry.</p>
        <p>Cliquez sur le lien ci-dessous pour définir votre mot de passe et activer votre compte :</p>
        <p style="margin: 20px 0;">
          <a href="${resetLink}" style="background:#0066cc; color:white; padding:12px 24px; text-decoration:none; border-radius:6px;">
            Définir mon mot de passe
          </a>
        </p>
        <p>Ce lien est valide pendant 24 heures.</p>
        <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
        <p>À bientôt,<br>L'équipe Smart Poultry</p>
      `,
    };

    const info = await transport.sendMail(mailOptions);

    console.log(
      "[EMAIL] Email envoyé à:",
      email,
      "- Message ID:",
      info.messageId,
    );

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("[EMAIL ERROR]", error);
    throw error;
  }
};
