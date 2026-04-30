const perUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
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
