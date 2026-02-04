import { Router } from "express";
import { validateTelegramInitData } from "../middleware/auth";

const router = Router();

router.use(validateTelegramInitData);

router.get("/", async (req, res) => {
  res.json({ isAdmin: Boolean(req.isAdmin) });
});

export default router;
