import { Bot, GrammyError, InlineKeyboard, webhookCallback } from "grammy";
import { prisma } from "./lib/prisma";

const botToken = process.env.BOT_TOKEN;
const appUrl = process.env.APP_URL ?? "";
const adminIds = (process.env.ADMIN_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export const bot = botToken ? new Bot(botToken) : null;

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

if (bot) {

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
    const keyboard = new InlineKeyboard()
      .webApp("Создать квиз", appUrl)
      .row()
      .text("🎮 Активные квизы", "active_quizzes")
      .row()
      .text("📖 Помощь", "help");
    await ctx.reply("Добро пожаловать! Вы можете создать квиз.", {
      reply_markup: keyboard,
    });
  } else {
    const keyboard = new InlineKeyboard()
      .text("🎮 Активные квизы", "active_quizzes")
      .row()
      .text("📖 Помощь", "help");
    await ctx.reply(
      "Добро пожаловать в Quiz! Перейдите по ссылке квиза чтобы начать игру.",
      { reply_markup: keyboard },
    );
  }
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    "📖 <b>Как пользоваться:</b>\n\n" +
    "1️⃣ Нажми <b>Играть</b> для начала квиза\n" +
    "2️⃣ Выбери тему и сложность\n" +
    "3️⃣ Отвечай на вопросы и набирай очки!\n\n" +
    "<b>Возможности:</b>\n" +
    "• 🎮 Играть в квизы по разным темам\n" +
    "• 📝 Создавать свои квизы\n" +
    "• 🏆 Соревноваться с друзьями\n" +
    "• 📊 Отслеживать прогресс\n\n" +
    "<b>Команды:</b>\n" +
    "• /start — Главное меню\n" +
    "• /help — Эта справка\n" +
    "• /play — Активные квизы",
    { parse_mode: "HTML" },
  );
});

bot.command("play", async (ctx) => {
  await sendActiveQuizzesTg(ctx);
});

bot.callbackQuery("active_quizzes", async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendActiveQuizzesTg(ctx);
});

bot.callbackQuery("help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "📖 <b>Как пользоваться:</b>\n\n" +
    "1️⃣ Нажми <b>Играть</b> для начала квиза\n" +
    "2️⃣ Выбери тему и сложность\n" +
    "3️⃣ Отвечай на вопросы и набирай очки!\n\n" +
    "<b>Возможности:</b>\n" +
    "• 🎮 Играть в квизы по разным темам\n" +
    "• 📝 Создавать свои квизы\n" +
    "• 🏆 Соревноваться с друзьями\n" +
    "• 📊 Отслеживать прогресс\n\n" +
    "<b>Команды:</b>\n" +
    "• /start — Главное меню\n" +
    "• /help — Эта справка\n" +
    "• /play — Активные квизы",
    { parse_mode: "HTML" },
  );
});

async function sendActiveQuizzesTg(ctx: { reply: (text: string, options?: Record<string, unknown>) => Promise<unknown> }): Promise<void> {
  const now = new Date();
  const quizzes = await prisma.quiz.findMany({
    where: { isActive: true, isPublic: true, expiresAt: { gt: now } },
    include: { _count: { select: { questions: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (quizzes.length === 0) {
    await ctx.reply("😔 Сейчас нет активных квизов.\n\nПопробуй позже!");
    return;
  }

  const botUsername = process.env.BOT_USERNAME ?? "";
  const keyboard = new InlineKeyboard();
  for (const q of quizzes) {
    keyboard
      .url(
        `🎯 ${q.title} (${q._count.questions} вопр.)`,
        `https://t.me/${botUsername}?start=${q.id}`,
      )
      .row();
  }

  await ctx.reply(
    `📋 <b>Активные квизы (${quizzes.length}):</b>`,
    {
      parse_mode: "HTML",
      reply_markup: keyboard,
    },
  );
}

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

} // end if (bot)

export const telegramWebhook = bot ? webhookCallback(bot, "express") : null;
