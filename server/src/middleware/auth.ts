import crypto from "crypto";
import { prisma } from "../lib/prisma";
import type { Request, Response, NextFunction } from "express";

const getInitData = (req: Request) => {
  const headerInitData =
    (req.headers["x-telegram-init-data"] as string | undefined) ??
    (req.headers["x-telegram-initdata"] as string | undefined);

  if (headerInitData) {
    return headerInitData;
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith("twa ")) {
    return authHeader.slice(4).trim();
  }

  if (typeof req.body?.initData === "string") {
    return req.body.initData;
  }

  if (typeof req.query?.initData === "string") {
    return req.query.initData;
  }

  return null;
};

const validateInitData = (initData: string, botToken: string) => {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    return null;
  }

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  if (calculatedHash !== hash) {
    return null;
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    return null;
  }

  try {
    const user = JSON.parse(userRaw) as {
      id: number;
      first_name: string;
      username?: string;
    };
    return user;
  } catch {
    return null;
  }
};

export const validateTelegramInitData = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminIds = (process.env.ADMIN_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    res.status(500).json({ error: "BOT_TOKEN is not configured" });
    return;
  }

  const initData = getInitData(req);
  if (!initData) {
    res.status(401).json({ error: "Missing initData" });
    return;
  }

  const user = validateInitData(initData, botToken);
  if (!user) {
    res.status(401).json({ error: "Invalid initData" });
    return;
  }

  const telegramId = BigInt(user.id);
  const firstName = user.first_name ?? "Player";
  const username = user.username ?? null;

  const visitor = await prisma.visitor.upsert({
    where: { telegramId },
    update: { firstName, username },
    create: { telegramId, firstName, username },
  });

  req.visitor = visitor;
  req.isAdmin = adminIds.includes(telegramId.toString());
  next();
};
