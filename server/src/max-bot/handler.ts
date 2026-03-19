/**
 * Max Bot update handler for Киберслон Quiz platform.
 */

import { MaxBotClient, type MaxUpdate } from "./client";
import { prisma } from "../lib/prisma";

const APP_URL = process.env.MAX_APP_URL || process.env.APP_URL || "https://cyberquiz.ru";

let _client: MaxBotClient | null = null;

export function getMaxBotClient(): MaxBotClient {
  if (_client) return _client;
  const token = process.env.MAX_BOT_TOKEN;
  if (!token) throw new Error("MAX_BOT_TOKEN not configured");
  _client = new MaxBotClient(token);
  return _client;
}

/**
 * Process a single webhook update from Max.
 */
export async function handleMaxUpdate(update: MaxUpdate): Promise<void> {
  const client = getMaxBotClient();

  try {
    switch (update.update_type) {
      case "message_created":
        await handleMessage(client, update);
        break;

      case "message_callback":
        await handleCallback(client, update);
        break;

      case "bot_started":
        await handleBotStarted(client, update);
        break;

      default:
        console.log("[Max bot] unhandled update type:", update.update_type);
    }
  } catch (err) {
    console.error("[Max bot] handler error:", update.update_type, err instanceof Error ? err.message : String(err));
  }
}

/**
 * Handle incoming text messages.
 */
async function handleMessage(client: MaxBotClient, update: MaxUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.body?.text) return;

  const chatId = msg.recipient.chat_id;
  const text = msg.body.text.trim();
  const userName = msg.sender.name || "друг";

  if (text === "/start") {
    await client.sendMessage(
      chatId,
      `👋 **Привет, ${userName}!**\n\n` +
        "Я бот **Киберслон** — квиз-платформа для создания викторин и квизов.\n\n" +
        "🎯 Создавай квизы, делись с друзьями и соревнуйся!\n\n" +
        "Команды:\n" +
        "• /start — Начало\n" +
        "• /help — Помощь\n" +
        "• /play — Играть",
      {
        format: "markdown",
        buttons: [
          [
            {
              type: "callback",
              text: "🎮 Активные квизы",
              payload: "active_quizzes",
            },
          ],
          [
            {
              type: "callback",
              text: "📖 Помощь",
              payload: "help",
            },
            {
              type: "callback",
              text: "🏆 Рейтинг",
              payload: "leaderboard",
            },
          ],
        ],
      }
    );
    return;
  }

  if (text === "/help") {
    await sendHelpMessage(client, chatId);
    return;
  }

  if (text === "/play") {
    await sendActiveQuizzes(client, chatId);
    return;
  }

  // Fallback
  await client.sendMessage(
    chatId,
    "🎯 Используй /play чтобы начать квиз или /help для помощи.",
    { format: "markdown" }
  );
}

/**
 * Handle callback button presses.
 */
async function handleCallback(client: MaxBotClient, update: MaxUpdate): Promise<void> {
  const cb = update.callback;
  if (!cb) return;

  const chatId = cb.message?.recipient?.chat_id;
  if (!chatId) return;

  await client.answerCallback(cb.callback_id);

  // Handle quiz:{quizId} pattern
  if (cb.payload.startsWith("quiz:")) {
    const quizId = cb.payload.slice(5);
    await sendQuizInfo(client, chatId, quizId);
    return;
  }

  switch (cb.payload) {
    case "help":
      await sendHelpMessage(client, chatId);
      break;

    case "active_quizzes":
      await sendActiveQuizzes(client, chatId);
      break;

    case "leaderboard":
      await client.sendMessage(
        chatId,
        "🏆 **Рейтинг**\n\n" +
          "Открой приложение чтобы увидеть полный рейтинг игроков!",
        {
          format: "markdown",
          buttons: [
            [
              {
                type: "open_app",
                text: "🏆 Смотреть рейтинг",
                url: APP_URL,
              },
            ],
          ],
        }
      );
      break;

    default:
      console.log("[Max bot] unknown callback:", cb.payload);
  }
}

/**
 * Handle bot_started event.
 * Supports deep links: https://max.ru/botname?start=quizId
 */
async function handleBotStarted(client: MaxBotClient, update: MaxUpdate): Promise<void> {
  const chatId = update.chat_id;
  const userName = update.user?.name || "друг";

  if (!chatId) return;

  // Deep link support: payload contains quizId
  if (update.payload) {
    const quizId = update.payload;
    await sendQuizInfo(client, chatId, quizId);
    return;
  }

  await client.sendMessage(
    chatId,
    `👋 **Привет, ${userName}!**\n\n` +
      "Я бот **Киберслон** — квиз-платформа.\n\n" +
      "🎯 Нажми кнопку чтобы начать играть!",
    {
      format: "markdown",
      buttons: [
        [
          {
            type: "callback",
            text: "🎮 Активные квизы",
            payload: "active_quizzes",
          },
        ],
      ],
    }
  );
}

/**
 * Send a list of active public quizzes as callback buttons.
 */
async function sendActiveQuizzes(client: MaxBotClient, chatId: number): Promise<void> {
  const now = new Date();
  const quizzes = await prisma.quiz.findMany({
    where: { isActive: true, isPublic: true, expiresAt: { gt: now } },
    include: { _count: { select: { questions: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (quizzes.length === 0) {
    await client.sendMessage(
      chatId,
      "😔 Сейчас нет активных квизов.\n\nЗагляни позже или создай свой!",
      {
        buttons: [
          [
            {
              type: "open_app",
              text: "➕ Создать квиз",
              url: APP_URL,
            },
          ],
        ],
      }
    );
    return;
  }

  const buttons = quizzes.map((quiz) => [
    {
      type: "callback" as const,
      text: `🎯 ${quiz.title} (${quiz._count.questions} вопр.)`,
      payload: `quiz:${quiz.id}`,
    },
  ]);

  await client.sendMessage(
    chatId,
    `📋 **Активные квизы** (${quizzes.length}):\n\nВыбери квиз чтобы узнать подробности:`,
    {
      format: "markdown",
      buttons,
    }
  );
}

/**
 * Show quiz details and an open_app button to play.
 */
async function sendQuizInfo(client: MaxBotClient, chatId: number, quizId: string): Promise<void> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      _count: { select: { questions: true, attempts: { where: { isFirstAttempt: true } } } },
    },
  });

  if (!quiz) {
    await client.sendMessage(chatId, "❌ Квиз не найден или был удалён.", {
      buttons: [
        [
          {
            type: "callback",
            text: "📋 Активные квизы",
            payload: "active_quizzes",
          },
        ],
      ],
    });
    return;
  }

  const categoryText = quiz.category ? `\n📁 Категория: **${quiz.category}**` : "";

  await client.sendMessage(
    chatId,
    `🎯 **${quiz.title}**\n` +
      categoryText +
      `\n❓ Вопросов: **${quiz._count.questions}**` +
      `\n👥 Игроков: **${quiz._count.attempts}**`,
    {
      format: "markdown",
      buttons: [
        [
          {
            type: "open_app",
            text: "🎮 Играть",
            url: `${APP_URL}?quizId=${quizId}`,
          },
        ],
        [
          {
            type: "callback",
            text: "📋 Все квизы",
            payload: "active_quizzes",
          },
        ],
      ],
    }
  );
}

async function sendHelpMessage(client: MaxBotClient, chatId: number): Promise<void> {
  await client.sendMessage(
    chatId,
    "📖 **Как пользоваться:**\n\n" +
      "1️⃣ Нажми **Играть** для начала квиза\n" +
      "2️⃣ Выбери тему и сложность\n" +
      "3️⃣ Отвечай на вопросы и набирай очки!\n\n" +
      "**Возможности:**\n" +
      "• 🎮 Играть в квизы по разным темам\n" +
      "• 📝 Создавать свои квизы\n" +
      "• 🏆 Соревноваться с друзьями\n" +
      "• 📊 Отслеживать прогресс\n\n" +
      "**Команды:**\n" +
      "• /start — Главное меню\n" +
      "• /help — Эта справка\n" +
      "• /play — Начать игру",
    { format: "markdown" }
  );
}
