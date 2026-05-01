const User = require("../models/User");
const Poulailler = require("../models/Poulailler");
const Dossier = require("../models/Dossier");
const jwt = require("jsonwebtoken");
const Joi = require("joi");
const crypto = require("crypto");

// ─────────────────────────────────────────────────────────────
// SCHEMAS JOI
// ─────────────────────────────────────────────────────────────

const poulaillerSchema = Joi.object({
  nom: Joi.string().trim().required(),
  nb_volailles: Joi.number().min(1).required(),
  surface: Joi.number().min(1).required(),
  densite: Joi.number().min(0).optional(),
  adresse: Joi.string().trim().optional().allow(""),
  remarques: Joi.string().trim().optional().allow(""),
});

const registerSchema = Joi.object({
  firstName: Joi.string().trim().required(),
  lastName: Joi.string().trim().required(),
  email: Joi.string().email().lowercase().required(),
  phone: Joi.string().required(),
  adresse: Joi.string().required(),
  poulaillers: Joi.array().items(poulaillerSchema).min(1).max(20).required(),
  nb_volailles: Joi.number().optional(),
  surface: Joi.number().optional(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });

const genererMotDePasseTemporaire = () => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const special = "@#!$";
  const pick = (str, n) =>
    Array.from({ length: n }, () => str[crypto.randomInt(str.length)]).join("");
  const raw = pick(upper, 3) + pick(digits, 3) + pick(special, 2);
  return raw
    .split("")
    .sort(() => crypto.randomInt(3) - 1)
    .join("");
};

// ─────────────────────────────────────────────────────────────
// @desc    Inscription publique (éleveur) + N poulaillers + 1 dossier
// @route   POST /api/auth/register
// @access  Public
// ─────────────────────────────────────────────────────────────
exports.register = async (req, res) => {
  const { error, value } = registerSchema.validate(req.body, {
    abortEarly: false,
  });
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details.map((d) => d.message).join(" | "),
    });
  }

  const { firstName, lastName, email, phone, adresse, poulaillers } = value;

  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "Cet utilisateur existe déjà",
      });
    }

    const motDePasseTemporaire = genererMotDePasseTemporaire();

    // ✅ FIX 1: Suppression de status:"pending" — champ absent du userSchema
    // Le compte reste inactif via isActive:true (valeur par défaut),
    // la logique "pending" est gérée côté dossier (status:"EN_ATTENTE")
    const user = await User.create({
      firstName,
      lastName,
      email,
      password: motDePasseTemporaire,
      phone,
      role: "eleveur",
      isActive: false, // inactif jusqu'à validation admin
    });

    // ✅ FIX 2: Utilisation des champs corrects du poulaillerSchema
    // Suppression de "location" et "description" (inexistants)
    // Ajout de "surface", "densite", "address", "remarque"
    const poulaillersDocs = await Promise.all(
      poulaillers.map((p) => {
        const densiteCalc = parseFloat((p.nb_volailles / p.surface).toFixed(2));
        return Poulailler.create({
          owner: user._id,
          name: p.nom,
          animalCount: p.nb_volailles,
          surface: p.surface,
          densite: densiteCalc,
          address: p.adresse || adresse,
          remarque: p.remarques || null,
        });
      }),
    );

    const totalVolailles = poulaillers.reduce(
      (sum, p) => sum + p.nb_volailles,
      0,
    );
    const totalSurface = poulaillers.reduce((sum, p) => sum + p.surface, 0);

    const year = new Date().getFullYear();
    const randomHex = crypto.randomBytes(2).toString("hex").toUpperCase();
    const autoContractNumber = `SP-${year}-${randomHex}`;

    // ✅ FIX 3: Suppression de motDePasseTemporaire — champ absent du dossierSchema
    // Le mot de passe temporaire est retourné dans la réponse pour usage admin
    const dossier = await Dossier.create({
      eleveur: user._id,
      poulailler: poulaillersDocs[0]._id,
      contractNumber: autoContractNumber,
      totalAmount: 0,
      status: "EN_ATTENTE",
    });

    return res.status(201).json({
      success: true,
      message:
        "Demande d'inscription reçue. En attente de validation par l'administrateur.",
      data: {
        user: { id: user._id, firstName, lastName, email },
        poulaillers: poulaillersDocs.map((doc, i) => ({
          id: doc._id,
          nom: doc.name,
          nb_volailles: poulaillers[i].nb_volailles,
          surface: poulaillers[i].surface,
          densite: doc.densite,
        })),
        totalVolailles,
        totalSurface,
        nbPoulaillers: poulaillersDocs.length,
        dossierId: dossier._id,
        contractNumber: autoContractNumber,
        // Exposé ici pour que l'admin puisse le noter/envoyer manuellement
        motDePasseTemporaire,
      },
    });
  } catch (err) {
    console.error("[register]", err);
    res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la création du compte",
      error: err.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// @desc    Connexion
// @route   POST /api/auth/login
// @access  Public
// ─────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  const { error } = loginSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.matchPassword(password))) {
      return res
        .status(401)
        .json({ success: false, error: "Identifiants invalides" });
    }

    // ✅ FIX 4: Remplacement de status:"pending" par isActive:false
    // car userSchema n'a pas de champ "status", il a "isActive" (Boolean)
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error:
          "Votre compte est en attente de validation par l'administrateur.",
      });
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ─────────────────────────────────────────────────────────────
// @desc    Validation du dossier par l'admin
// @route   PATCH /api/dossiers/:id/valider
// @access  Admin
// ─────────────────────────────────────────────────────────────
exports.validerDossier = async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id)
      .populate("eleveur")
      .populate("poulailler");

    if (!dossier) {
      return res
        .status(404)
        .json({ success: false, message: "Dossier introuvable." });
    }
    if (dossier.status !== "EN_ATTENTE") {
      return res
        .status(400)
        .json({ success: false, message: "Ce dossier est déjà traité." });
    }

    const user = dossier.eleveur;

    // ✅ FIX 5: motDePasseTemporaire n'existe plus dans le dossier
    // Il doit être passé dans le body par l'admin (récupéré depuis la réponse register)
    // OU regénéré ici et sauvegardé sur le user
    const motDePasse = req.body.motDePasseTemporaire;
    if (!motDePasse) {
      return res.status(400).json({
        success: false,
        message:
          "motDePasseTemporaire requis dans le body pour valider le dossier.",
      });
    }

    const tousPoulaillers = await Poulailler.find({ owner: user._id });

    // ✅ FIX 6: Activation via isActive:true (pas status:"active")
    user.isActive = true;
    await user.save();

    dossier.status = "AVANCE_PAYEE";
    dossier.dateValidation = new Date();
    dossier.validatedBy = req.user?._id || null;
    await dossier.save();

    // ✅ FIX 7: Colonne email — utilise "address" au lieu de "description"
    // car poulaillerSchema n'a pas de champ "description"
    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });

      const lignesPoulaillers = tousPoulaillers
        .map(
          (p, i) => `
          <tr style="border-bottom:1px solid #e1e3e4">
            <td style="padding:8px 12px;font-weight:600">${i + 1}. ${p.name}</td>
            <td style="padding:8px 12px;text-align:center">${
              p.animalCount?.toLocaleString("fr-FR") ?? "—"
            }</td>
            <td style="padding:8px 12px;text-align:center">${
              p.surface != null ? `${p.surface} m²` : "—"
            }</td>
            <td style="padding:8px 12px;text-align:center">${
              p.densite != null ? `${p.densite} sujets/m²` : "—"
            }</td>
          </tr>`,
        )
        .join("");

      await transporter.sendMail({
        from: `"SmartPoultry" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: "✅ Votre dossier SmartPoultry est validé",
        html: `
          <div style="font-family:Inter,sans-serif;max-width:600px;margin:auto">
            <h2 style="color:#00361a">Bonjour ${user.firstName},</h2>
            <p>Votre compte SmartPoultry est maintenant <strong>actif</strong>.</p>
            <p><strong>Email :</strong> ${user.email}<br/>
               <strong>Mot de passe temporaire :</strong>
               <code style="background:#f0fff4;padding:2px 6px;border-radius:4px">${motDePasse}</code>
            </p>
            <p>Pensez à changer ce mot de passe à votre première connexion.</p>
            <h3 style="color:#00361a;margin-top:24px">
              Vos poulaillers connectés (${tousPoulaillers.length})
            </h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="background:#00361a;color:white">
                  <th style="padding:8px 12px;text-align:left">Bâtiment</th>
                  <th style="padding:8px 12px">Volailles</th>
                  <th style="padding:8px 12px">Surface</th>
                  <th style="padding:8px 12px">Densité</th>
                </tr>
              </thead>
              <tbody>${lignesPoulaillers}</tbody>
            </table>
            <p style="margin-top:24px;color:#717971;font-size:12px">
              SmartPoultry — Precision IoT for the Living Laboratory
            </p>
          </div>`,
      });
    } catch (mailErr) {
      console.warn("[SMTP] Email non envoyé :", mailErr.message);
    }

    return res.json({
      success: true,
      message: `Dossier validé. Email envoyé à ${user.email}.`,
      motDePasseTemporaire: motDePasse,
      data: {
        userId: user._id,
        dossierId: dossier._id,
        nbPoulaillers: tousPoulaillers.length,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// @desc    Récupérer tous les poulaillers d'un éleveur
// @route   GET /api/auth/me/poulaillers
// @access  Privé (éleveur connecté)
// ─────────────────────────────────────────────────────────────
exports.getMesPoulaillers = async (req, res) => {
  try {
    const poulaillers = await Poulailler.find({ owner: req.user.id }).sort({
      createdAt: 1,
    });
    res.status(200).json({
      success: true,
      count: poulaillers.length,
      poulaillers,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ─────────────────────────────────────────────────────────────
// @desc    Ajouter un poulailler à un éleveur existant
// @route   POST /api/auth/me/poulaillers
// @access  Privé (éleveur connecté)
// ─────────────────────────────────────────────────────────────
exports.ajouterPoulailler = async (req, res) => {
  const { error, value } = poulaillerSchema.validate(req.body, {
    abortEarly: false,
  });
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details.map((d) => d.message).join(" | "),
    });
  }

  try {
    const compteActuel = await Poulailler.countDocuments({
      owner: req.user.id,
    });
    if (compteActuel >= 20) {
      return res.status(400).json({
        success: false,
        message:
          "Limite atteinte : un éleveur ne peut pas dépasser 20 poulaillers.",
      });
    }

    const densiteCalc = parseFloat(
      (value.nb_volailles / value.surface).toFixed(2),
    );

    // ✅ FIX 8: Même correction que register — champs corrects du poulaillerSchema
    const poulailler = await Poulailler.create({
      owner: req.user.id,
      name: value.nom,
      animalCount: value.nb_volailles,
      surface: value.surface,
      densite: densiteCalc,
      address: value.adresse || null,
      remarque: value.remarques || null,
    });

    res.status(201).json({
      success: true,
      message: "Poulailler ajouté avec succès.",
      poulailler,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ─────────────────────────────────────────────────────────────
// AUTRES ROUTES
// ─────────────────────────────────────────────────────────────

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

exports.updateDetails = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.user.id, req.body, {
      new: true,
      runValidators: true,
    });
    res.status(200).json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("+password");
    if (!(await user.matchPassword(req.body.currentPassword))) {
      return res
        .status(401)
        .json({ success: false, error: "Mot de passe actuel incorrect" });
    }
    user.password = req.body.newPassword;
    await user.save();
    res.status(200).json({ success: true, message: "Mot de passe mis à jour" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};
