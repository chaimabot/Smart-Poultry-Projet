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
// Ajoutez cette nouvelle fonction après sendInvitationEmail

/**
 * @desc    Envoyer les identifiants à un nouvel administrateur (email + mot de passe direct)
 */
exports.sendAdminCredentialsEmail = async (
  email,
  temporaryPassword,
  firstName,
) => {
  try {
    const transport = await getTransporter();

    const loginLink = `${FRONTEND_URL}/login`;

    const mailOptions = {
      from: `"Smart Poultry Admin" <${process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@smartpoultry.com"}>`,
      to: email,
      subject: " Votre compte administrateur Smart Poultry a été créé",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;"> Bienvenue en tant qu'Administrateur</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px;">Bonjour <strong>${firstName || "Administrateur"}</strong>,</p>
            
            <p>Votre compte administrateur a été créé avec succès sur la plateforme <strong>Smart Poultry</strong>.</p>
            
            <div style="background: white; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <h3 style="margin-top: 0; color: #667eea;"> Vos identifiants de connexion</h3>
              
              <div style="margin: 15px 0;">
                <span style="font-weight: bold; color: #667eea; display: block; margin-bottom: 5px;"> Adresse email :</span>
                <div style="background: #f3f4f6; padding: 12px; border-radius: 5px; font-family: 'Courier New', monospace; font-size: 14px; word-break: break-all; border: 1px solid #e5e7eb;">
                  ${email}
                </div>
              </div>
              
              <div style="margin: 15px 0;">
                <span style="font-weight: bold; color: #667eea; display: block; margin-bottom: 5px;"> Mot de passe temporaire :</span>
                <div style="background: #f3f4f6; padding: 12px; border-radius: 5px; font-family: 'Courier New', monospace; font-size: 14px; word-break: break-all; border: 1px solid #e5e7eb;">
                  ${temporaryPassword}
                </div>
              </div>
            </div>
            
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 5px;">
              <strong style="color: #f59e0b;"> Important :</strong> Pour des raisons de sécurité, nous vous recommandons fortement de modifier votre mot de passe dès votre première connexion.
            </div>
            

            
            <div style="margin-top: 30px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <h4 style="margin-top: 0; color: #667eea;"> Vos privilèges administrateur :</h4>
              <ul style="color: #4b5563; line-height: 1.8; padding-left: 20px;">
                <li> Gestion complète des utilisateurs</li>
                <li> Administration des élevages et poulaillers</li>
                <li> Accès aux statistiques globales</li>
                <li> Configuration du système</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px;">
              <p>Cet email contient des informations confidentielles.<br>
              </p>
              <p style="margin-top: 15px;">
                <strong>Smart Poultry</strong><br>
                © ${new Date().getFullYear()} 
              </p>
            </div>
          </div>
        </div>
      `,
      text: `
Bienvenue en tant qu'Administrateur

Bonjour ${firstName || "Administrateur"},

Votre compte administrateur a été créé avec succès sur Smart Poultry.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOS IDENTIFIANTS DE CONNEXION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Email : ${email}
 Mot de passe temporaire : ${temporaryPassword}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 IMPORTANT : Veuillez modifier votre mot de passe dès votre première connexion.

 Connectez-vous ici : ${loginLink}



Cet email contient des informations confidentielles.

—
Smart Poultry
© ${new Date().getFullYear()} - Tous droits réservés
      `,
    };

    const info = await transport.sendMail(mailOptions);
    console.log(
      "[EMAIL] Identifiants admin envoyés à:",
      email,
      "- Message ID:",
      info.messageId,
    );
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("[EMAIL ERROR sendAdminCredentialsEmail]", error);
    throw error;
  }
};
