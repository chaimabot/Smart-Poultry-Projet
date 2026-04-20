const rateLimit = require("express-rate-limit");

const perUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ On retire 'defaultKeys' et on utilise 'default: false' pour désactiver les alertes
  validate: { default: false },
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10,
  message: "Trop de tentatives de connexion, réessayez plus tard.",
  validate: { default: false },
});

const criticalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  validate: { default: false },
});

module.exports = { perUserLimiter, authLimiter, criticalLimiter };
