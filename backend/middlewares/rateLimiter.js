/**
 * 🚦 PER-USER RATE LIMITING
 * Limits requests per authenticated user (not just IP)
 * Prevents single user from hogging the API
 */

const rateLimit = require("express-rate-limit");
const RedisStore = require("rate-limit-redis");

// ============================================================================
// SIMPLE IN-MEMORY STORE (Development / Small deployments)
// ============================================================================

const perUserLimiter = rateLimit({
  // ✅ Use user ID as key instead of IP
  keyGenerator: (req, res) => {
    if (req.user && req.user.id) {
      return `user:${req.user.id}`; // Per-user limit
    }
    return req.ip; // Fallback to IP for unauthenticated
  },
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per user per 15 minutes
  message: "❌ Too many requests from this account. Please try again later.",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req, res) => {
    // Skip rate limiting for admins
    return req.user && req.user.role === "admin";
  },
});

// ============================================================================
// STRICTER LIMIT FOR AUTH ENDPOINTS (Login/Register)
// ============================================================================

const authLimiter = rateLimit({
  keyGenerator: (req, res) => req.ip, // By IP for auth
  windowMs: 15 * 60 * 1000,
  max: 5, // Only 5 attempts per IP per 15 minutes
  message: "❌ Too many login attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// VERY STRICT LIMIT FOR SENSITIVE OPERATIONS (Delete, Admin actions)
// ============================================================================

const criticalLimiter = rateLimit({
  keyGenerator: (req, res) => {
    if (req.user && req.user.id) {
      return `critical:${req.user.id}`;
    }
    return `critical:${req.ip}`;
  },
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 sensitive operations per hour
  message: "❌ Too many sensitive operations. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// REDIS-BACKED STORE (Production with Redis)
// ============================================================================

// Uncomment if Redis is available
/*
const redis = require('redis');
const client = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
});

const redisLimiter = rateLimit({
  store: new RedisStore({
    client: client,
    prefix: 'rl:', // Redis key prefix
  }),
  keyGenerator: (req, res) => {
    if (req.user && req.user.id) {
      return `user:${req.user.id}`;
    }
    return req.ip;
  },
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: '❌ Too many requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
*/

module.exports = {
  perUserLimiter,
  authLimiter,
  criticalLimiter,
};
