import { Bot, GrammyError, InlineKeyboard, webhookCallback } from "grammy";
import { prisma } from "./lib/prisma";

const botToken = process.env.BOT_TOKEN;
const appUrl = process.env.APP_URL ?? "";
const adminIds = (process.env.ADMIN_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

if (!botToken) {
  throw new Error("BOT_TOKEN is not configured");
}

export const bot = new Bot(botToken);

const extractStartParam = (text?: string) => {
  if (!text) {
    return "";
  }
  const rest = text.replace(/^\/start(@\w+)?\s*/i, "").trim();
  if (!rest) {
    return "";
  }
  const startAppMatch = rest.match(/startapp=([^\s&]+)/i);
  return startAppMatch ? startAppMatch[1] : rest;
};

bot.command("start", async (ctx) => {
  // Получаем параметр из команды /start {param}
  // Также поддерживаем формат /start startapp=...
  const startParam =
    (typeof ctx.match === "string" && ctx.match.trim()) ||
    extractStartParam(ctx.message?.text);

  if (startParam) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: startParam },
      include: { questions: true },
    });

    if (!quiz || quiz.expiresAt < new Date()) {
      await ctx.reply("Этот квиз уже завершен.");
      return;
    }

    const keyboard = new InlineKeyboard().webApp(
      "🎮 Открыть квиз",
      `${appUrl}?quizId=${quiz.id}`,
    );

    await ctx.reply(
      `🎮 ${quiz.title}\n\n📋 ${quiz.questions.length} вопросов\n⏱ ${quiz.timePerQuestion}с на ответ\n\nНажмите кнопку ниже, чтобы начать:`,
      { reply_markup: keyboard },
    );
    return;
  }

  const isAdmin = adminIds.includes(ctx.from?.id?.toString() ?? "");
  if (isAdmin) {
    const keyboard = new InlineKeyboard().webApp("Создать квиз", appUrl);
    await ctx.reply("Добро пожаловать! Вы можете создать квиз.", {
      reply_markup: keyboard,
    });
  } else {
    await ctx.reply(
      "Добро пожаловать в Quiz! Перейдите по ссылке квиза чтобы начать игру.",
    );
  }
});

// Тихо игнорируем, когда пользователь заблокировал бота — это нормальное поведение
bot.catch((err) => {
  const e = err.error;
  if (e instanceof GrammyError) {
    const desc = (e.description ?? "").toLowerCase();
    if (e.error_code === 403 && desc.includes("blocked")) {
      return; // Не логируем — пользователь сам заблокировал
    }
    if (e.error_code === 403 && desc.includes("user is deactivated")) {
      return;
    }
  }
  console.error("Bot error:", e);
});

export const telegramWebhook = webhookCallback(bot, "express");
