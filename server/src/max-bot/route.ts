/**
 * Express router for Max Bot webhook.
 */

import { Router, type Request, type Response } from "express";
import { handleMaxUpdate } from "./handler";

export const maxWebhookRouter = Router();

/** POST /webhook/max — receive updates from Max platform */
maxWebhookRouter.post("/", (req: Request, res: Response) => {
  try {
    const update = req.body;

    console.log("[Max webhook]", update.update_type, "from", update.message?.sender?.name || update.user?.name || "unknown");

    // Fire and forget — respond 200 immediately
    handleMaxUpdate(update).catch((err) => {
      console.error("[Max webhook] async error:", err instanceof Error ? err.message : String(err));
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("[Max webhook] parse error:", err instanceof Error ? err.message : String(err));
    res.status(400).json({ error: "Invalid payload" });
  }
});

/** GET /webhook/max — health check */
maxWebhookRouter.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", bot: "max-quiz" });
});
