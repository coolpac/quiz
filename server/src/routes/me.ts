import { Router } from "express";
import { validateTelegramInitData } from "../middleware/auth";
import { getTelegramAvatarUrl } from "../services/telegramAvatar";

const router = Router();

router.use(validateTelegramInitData);

router.get("/", async (req, res) => {
  const visitor = req.visitor;
  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const avatarUrl = await getTelegramAvatarUrl(visitor.telegramId);
  res.json({
    isAdmin: Boolean(req.isAdmin),
    avatarUrl: avatarUrl ?? null,
    firstName: visitor.firstName,
    username: visitor.username,
  });
});

export default router;
