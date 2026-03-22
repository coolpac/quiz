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
  const avatarUrl = await getTelegramAvatarUrl(visitor.telegramId, req.platform);
  const response = {
    isAdmin: Boolean(req.isAdmin),
    avatarUrl: avatarUrl ?? null,
    firstName: visitor.firstName,
    username: visitor.username,
  };
  console.log(`[/api/me] platform=${req.platform} user_id=${visitor.telegramId} isAdmin=${response.isAdmin}`);
  res.json(response);
});

export default router;
