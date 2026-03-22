/**
 * Max Bot update handler for Киберслон Quiz platform.
 */

import { MaxBotClient, type MaxUpdate } from "./client";
import { prisma } from "../lib/prisma";

const APP_URL = process.env.MAX_APP_URL || process.env.APP_URL || "https://cyberquiz.ru";

const isMaxAdmin = (userId: number): boolean => {
  const adminIds = (process.env.ADMIN_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return adminIds.includes(String(userId));
};

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
    // Gracefully ignore expected errors (user blocked bot, deactivated, etc.)
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("403") || msg.includes("blocked") || msg.includes("deactivated")) {
      return;
    }
    console.error("[Max bot] handler error:", update.update_type, msg);
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

  // Support /start <quizId> text command (like Telegram)
  if (text === "/start" || text.startsWith("/start ")) {
    const startParam = text.replace(/^\/start\s*/i, "").trim();
    if (startParam) {
      await sendQuizInfo(client, chatId, startParam);
      return;
    }

    const isAdmin = isMaxAdmin(msg.sender.user_id);
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
              type: "open_app" as const,
              text: "🚀 Открыть приложение",
              url: APP_URL,
            },
          ],
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
          ...(isAdmin ? [[{
            type: "open_app" as const,
            text: "⚙️ Админ-панель",
            url: APP_URL,
          }]] : []),
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

  if (text === "/chatid") {
    await client.sendMessage(
      chatId,
      `📋 **ID этого чата:** \`${chatId}\`\n\n` +
        "Используйте этот ID при создании квиза для проверки подписки на Max канал.",
      { format: "markdown" }
    );
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

  const isAdmin = update.user ? isMaxAdmin(update.user.user_id) : false;

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
            type: "open_app" as const,
            text: "🚀 Открыть приложение",
            url: APP_URL,
          },
        ],
        [
          {
            type: "callback",
            text: "🎮 Активные квизы",
            payload: "active_quizzes",
          },
        ],
        ...(isAdmin ? [[{
          type: "open_app" as const,
          text: "⚙️ Админ-панель",
          url: APP_URL,
        }]] : []),
      ],
    }
  );
}

/**
 * Send a list of active public quizzes as link buttons (1-tap, like Telegram).
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
      "😔 Сейчас нет активных квизов.\n\nЗагляни позже!",
    );
    return;
  }

  const maxBotUsername = getMaxBotUsername();

  const buttons = quizzes.map((quiz) => [
    maxBotUsername
      ? {
          type: "link" as const,
          text: `🎯 ${quiz.title} (${quiz._count.questions} вопр.)`,
          url: `https://max.ru/${maxBotUsername}?start=${quiz.id}`,
        }
      : {
          type: "callback" as const,
          text: `🎯 ${quiz.title} (${quiz._count.questions} вопр.)`,
          payload: `quiz:${quiz.id}`,
        },
  ]);

  await client.sendMessage(
    chatId,
    `📋 **Активные квизы** (${quizzes.length}):\n\nВыбери квиз чтобы начать:`,
    {
      format: "markdown",
      buttons,
    }
  );
}

/**
 * Show quiz details and an open_app button to play.
 * Includes expiry check (like Telegram bot).
 */
async function sendQuizInfo(client: MaxBotClient, chatId: number, quizId: string): Promise<void> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      _count: { select: { questions: true, attempts: { where: { isFirstAttempt: true } } } },
    },
  });

  if (!quiz || quiz.expiresAt < new Date()) {
    await client.sendMessage(chatId, "❌ Квиз не найден или уже завершен.", {
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
      `\n⏱ ${quiz.timePerQuestion}с на ответ` +
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

/** Cache of link → numeric chat_id mappings */
const _chatIdCache = new Map<string, string>();

/**
 * Resolve a Max channel identifier (link, username, or numeric ID) to a numeric chat_id.
 * Uses GET /chats to find matching channel by link.
 */
export async function resolveMaxChatId(input: string): Promise<string | null> {
  const trimmed = input.replace(/^@/, "").trim();
  if (!trimmed) return null;

  // Already numeric — return as-is
  if (/^-?\d+$/.test(trimmed)) return trimmed;

  // Check cache
  const cached = _chatIdCache.get(trimmed);
  if (cached) return cached;

  try {
    const client = getMaxBotClient();
    const { chats } = await client.getChats();

    for (const chat of chats) {
      const linkSuffix = chat.link?.replace(/^https?:\/\/max\.ru\//, "");
      if (linkSuffix === trimmed || chat.title === trimmed) {
        const id = chat.chat_id.toString();
        _chatIdCache.set(trimmed, id);
        return id;
      }
    }
  } catch (err) {
    console.error("[Max bot] Failed to resolve chat ID:", err instanceof Error ? err.message : String(err));
  }

  return null;
}

/** Resolved Max bot username, populated at startup via GET /me */
let _maxBotUsername: string | null = null;

export function getMaxBotUsername(): string {
  return _maxBotUsername ?? process.env.MAX_BOT_USERNAME ?? "";
}

/**
 * Setup Max bot on server startup: update bot info and register webhook.
 */
export async function setupMaxBot(): Promise<void> {
  const token = process.env.MAX_BOT_TOKEN;
  const appUrl = process.env.APP_URL || process.env.MAX_APP_URL;
  if (!token || !appUrl) return;

  const client = getMaxBotClient();

  // Auto-detect bot username via GET /me
  try {
    const me = await client.getMe();
    if (me.username) {
      _maxBotUsername = me.username;
      console.log("[Max bot] Username resolved:", _maxBotUsername);
    }
  } catch (err) {
    console.error("[Max bot] Failed to get bot info:", err instanceof Error ? err.message : String(err));
  }

  // Set bot commands and description
  try {
    await client.editBotInfo({
      name: "Киберслон",
      description: "Квиз-платформа Киберслон — создавай викторины и соревнуйся!",
      commands: [
        { name: "start", description: "Главное меню" },
        { name: "help", description: "Помощь" },
        { name: "play", description: "Активные квизы" },
      ],
    });
    console.log("[Max bot] Bot info updated");
  } catch (err) {
    console.error("[Max bot] Failed to update bot info:", err instanceof Error ? err.message : String(err));
  }

  // Auto-register webhook
  const webhookUrl = `${appUrl}/webhook/max`;
  try {
    const current = await client.getSubscription() as { url?: string };
    if (current?.url !== webhookUrl) {
      await client.subscribe(webhookUrl);
      console.log("[Max bot] Webhook registered:", webhookUrl);
    } else {
      console.log("[Max bot] Webhook already set:", webhookUrl);
    }
  } catch (err) {
    console.error("[Max bot] Failed to setup webhook:", err instanceof Error ? err.message : String(err));
  }
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
