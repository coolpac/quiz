import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
});

export const answerLimiter = rateLimit({
  windowMs: 1_000,
  max: 1,
  keyGenerator: (req) => {
    if (req.visitor?.id) {
      return req.visitor.id;
    }
    const ip =
      req.ip ?? req.connection?.remoteAddress ?? req.socket?.remoteAddress ?? "";
    return ipKeyGenerator(ip || "unknown");
  },
});
