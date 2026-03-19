import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// ~30 req/player × 500 players behind same NAT (зал, корпоративная сеть)
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 18_000,
});

export const answerLimiter = rateLimit({
  windowMs: 3_000,
  max: 10,
  keyGenerator: (req) => {
    if (req.visitor?.id) {
      return req.visitor.id;
    }
    const ip =
      req.ip ?? req.connection?.remoteAddress ?? req.socket?.remoteAddress ?? "";
    return ipKeyGenerator(ip || "unknown");
  },
});
