import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { env } from "../../config/env";

export const orgRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Scope rate limit per organization when authenticated, fallback to IP
    return req.organization?.id ?? ipKeyGenerator(req.ip ?? "");
  },
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests, please try again later.",
      details: [],
    },
  },
  skip: (req) => req.path === "/health" || req.path === "/ready",
});
