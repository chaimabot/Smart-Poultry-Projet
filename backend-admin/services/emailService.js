// services/emailService.js
const nodemailer = require("nodemailer");

const hasEmailCredentials = process.env.SMTP_USER && process.env.SMTP_PASS;

const FRONTEND_URL = "https://smart-poultry-reset.vercel.app";

let transporter;

async function getTransporter() {
  if (transporter) return transporter;

  if (hasEmailCredentials) {
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

    const resetLink = `${FRONTEND_URL}/definir-mot-de-passe/${token}`;

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
      "- Link:",
      resetLink,
    );
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("[EMAIL ERROR]", error);
    throw error;
  }
};

exports.sendCredentialsEmail = async (email, resetToken, firstName) => {
  try {
    const transport = await getTransporter();

    const resetLink = `${FRONTEND_URL}/definir-mot-de-passe/${resetToken}`;

    const mailOptions = {
      from: `"Smart Poultry Admin" <${process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@smartpoultry.com"}>`,
      to: email,
      subject: "Vos coordonnées de connexion - Smart Poultry",
      html: `
        <h2>Bonjour${firstName ? " " + firstName : ""},</h2>
        <p>Voici vos coordonnées de connexion à la plateforme Smart Poultry :</p>
        <ul>
          <li><strong>Email :</strong> ${email}</li>
          <li><strong>Mot de passe :</strong> Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe</li>
        </ul>
        <p style="margin: 20px 0;">
          <a href="${resetLink}" style="background:#0066cc; color:white; padding:12px 24px; text-decoration:none; border-radius:6px;">
            Réinitialiser mon mot de passe
          </a>
        </p>
        <p>Ce lien est valide pendant 24 heures.</p>
        <p>À bientôt,<br>L'équipe Smart Poultry</p>
      `,
    };

    const info = await transport.sendMail(mailOptions);
    console.log(
      "[EMAIL] Coordonnées envoyées à:",
      email,
      "- Message ID:",
      info.messageId,
      "- Link:",
      resetLink,
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
