import rateLimit from "express-rate-limit";

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
});

export const answerLimiter = rateLimit({
  windowMs: 1_000,
  max: 1,
  keyGenerator: (req) => req.visitor?.id ?? req.ip ?? "unknown",
});
