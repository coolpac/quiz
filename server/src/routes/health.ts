import { Router } from "express";
import { validateTelegramInitData } from "../middleware/auth";
import { adminOnly } from "../middleware/adminOnly";
import {
  getConsumerHeartbeat,
  getConsumerHeartbeatTtl,
  isRedisEnabled,
} from "../services/answerStream";
import { getBacklogMetrics } from "../services/answerBuffer";

const router = Router();

router.use(validateTelegramInitData);
router.use(adminOnly);

router.get("/consumer", async (_req, res) => {
  if (!isRedisEnabled()) {
    res.json({
      healthy: false,
      error: "redis_disabled",
    });
    return;
  }

  const [heartbeat, backlog] = await Promise.all([
    getConsumerHeartbeat(),
    getBacklogMetrics(),
  ]);
  const now = Date.now();
  const ttlMs = getConsumerHeartbeatTtl() * 1000;
  const lastSeenAt = heartbeat?.ts ?? null;
  const ageMs = lastSeenAt ? now - lastSeenAt : null;
  const healthy = Boolean(lastSeenAt && ageMs !== null && ageMs < ttlMs);

  res.json({
    healthy,
    lastSeenAt,
    ageMs,
    backlog,
    alert: heartbeat?.alert ?? false,
    streak: heartbeat?.streak ?? 0,
  });
});

export default router;
