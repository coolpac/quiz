import { Router } from "express";
import { prisma } from "../lib/prisma";
import { validateTelegramInitData } from "../middleware/auth";
import { adminOnly } from "../middleware/adminOnly";
import { answerLimiter } from "../middleware/rateLimit";
import {
  enqueueAnswer,
  flushNow,
  flushQuizNow,
  hasBufferedAnswer,
} from "../services/answerBuffer";
import {
  getCachedQuestion,
  clearQuizQuestions,
  getQuizQuestions,
  primeQuizQuestions,
} from "../services/questionsCache";
import { ValidationError, createQuiz, updateQuiz } from "../services/quiz";
import { checkSubscription } from "../services/subscription";
import { getTelegramAvatarUrl } from "../services/telegramAvatar";
import {
  clearLeaderboardCache,
  getLeaderboardUpdate,
  getLeaderboardView,
  recordLeaderboardAttempt,
} from "../services/leaderboard";
import { scheduleQuizExpiry } from "../services/quizLifecycle";
import {
  emitAnswerEvents,
  getQuizStats,
  primeQuizStatsCache,
} from "../services/stats";
import { clearQuizCache, getStats, recordAnswer } from "../services/statsCache";
import { markLeaderboardDirty } from "../services/socketThrottle";
import { adminRoom, getIO, quizRoom } from "../socketState";

const router = Router();

router.use(validateTelegramInitData);

const getRouteId = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value ?? null;
};

router.post("/", adminOnly, async (req, res) => {
  try {
    const visitor = req.visitor;
    if (!visitor) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const botUsername = process.env.BOT_USERNAME;
    if (!botUsername) {
      res.status(500).json({ error: "BOT_USERNAME is not configured" });
      return;
    }

    const quiz = await createQuiz({ ...req.body, creatorId: visitor.id });
    // Используем формат /start {quizId} для автоматической отправки команды боту
    // Это гарантирует, что бот получит команду /start и отправит кнопку
    const deepLink = `https://t.me/${botUsername}?start=${quiz.id}`;
    res.json({ id: quiz.id, deepLink, adminToken: quiz.adminToken });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: "Failed to create quiz" });
  }
});

router.get("/my", adminOnly, async (req, res) => {
  const visitor = req.visitor;
  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const botUsername = process.env.BOT_USERNAME ?? "";
  const now = new Date();

  const quizzes = await prisma.quiz.findMany({
    where: { creatorId: visitor.id },
    include: {
      _count: { select: { questions: true, attempts: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    quizzes: quizzes.map((quiz) => ({
      id: quiz.id,
      title: quiz.title,
      category: quiz.category,
      questionsCount: quiz._count.questions,
      attemptsCount: quiz._count.attempts,
      createdAt: quiz.createdAt,
      expiresAt: quiz.expiresAt,
      isActive: quiz.isActive,
      isExpired: quiz.expiresAt < now,
      adminToken: quiz.adminToken,
      deepLink: botUsername
        ? `https://t.me/${botUsername}?start=${quiz.id}`
        : null,
    })),
  });
});

router.get("/:id", async (req, res) => {
  const id = getRouteId(req.params.id);
  const visitor = req.visitor;

  if (!id) {
    res.status(400).json({ error: "Quiz id is required" });
    return;
  }

  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  if (!quiz) {
    res.status(404).json({ error: "Quiz not found" });
    return;
  }

  if (quiz.expiresAt < new Date()) {
    clearQuizQuestions(quiz.id);
    clearQuizCache(quiz.id);
    clearLeaderboardCache(quiz.id);
    res.status(410).json({ expired: true, message: "Квиз завершен" });
    return;
  }

  primeQuizQuestions(quiz.id, quiz.questions);
  scheduleQuizExpiry(quiz.id, quiz.expiresAt);
  await primeQuizStatsCache(quiz.id, quiz.questions);

  const firstAttempt = await prisma.quizAttempt.findFirst({
    where: { visitorId: visitor.id, quizId: id, isFirstAttempt: true },
  });

  const questions = quiz.questions.map((question) => ({
    id: question.id,
    question: question.text,
    options: question.options as string[],
    media: question.mediaUrl
      ? { type: question.mediaType, url: question.mediaUrl }
      : undefined,
    requiresSubscription: question.requiresSubscription,
    channelUrl: question.requiresSubscription ? quiz.channelUrl ?? undefined : undefined,
  }));

  res.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      category: quiz.category,
      difficulty: quiz.difficulty,
      timePerQuestion: quiz.timePerQuestion,
      isPublic: quiz.isPublic,
      channelUrl: quiz.channelUrl,
      questions,
    },
    isFirstAttempt: !firstAttempt,
  });
});

router.post("/:id/start", async (req, res) => {
  const id = getRouteId(req.params.id);
  const visitor = req.visitor;

  if (!id) {
    res.status(400).json({ error: "Quiz id is required" });
    return;
  }

  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    select: { expiresAt: true },
  });
  if (!quiz) {
    res.status(404).json({ error: "Quiz not found" });
    return;
  }
  if (quiz.expiresAt < new Date()) {
    res.status(410).json({ expired: true, message: "Квиз завершен" });
    return;
  }

  const existingAttempt = await prisma.quizAttempt.findFirst({
    where: {
      quizId: id,
      visitorId: visitor.id,
      completedAt: { equals: null },
    },
    orderBy: { startedAt: "desc" },
  });
  if (existingAttempt) {
    res.json({
      attemptId: existingAttempt.id,
      isFirstAttempt: existingAttempt.isFirstAttempt,
    });
    return;
  }

  const firstAttempt = await prisma.quizAttempt.findFirst({
    where: { quizId: id, visitorId: visitor.id, isFirstAttempt: true },
  });

  const attempt = await prisma.quizAttempt.create({
    data: {
      visitorId: visitor.id,
      quizId: id,
      isFirstAttempt: !firstAttempt,
      totalScore: 0,
      correctCount: 0,
      totalQuestions: 0,
    },
    select: { id: true, isFirstAttempt: true },
  });

  res.json({ attemptId: attempt.id, isFirstAttempt: attempt.isFirstAttempt });
});

router.post("/:id/answer", answerLimiter, async (req, res) => {
  const id = getRouteId(req.params.id);
  const visitor = req.visitor;

  if (!id) {
    res.status(400).json({ error: "Quiz id is required" });
    return;
  }

  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { questionIndex, answerIndex, timeLeft, attemptId } = req.body as {
    questionIndex: number;
    answerIndex: number;
    timeLeft: number;
    attemptId?: string;
  };

  const parsedQuestionIndex = Number(questionIndex);
  const parsedAnswerIndex = Number(answerIndex);
  const parsedTimeLeft = Number(timeLeft);
  const parsedAttemptId = typeof attemptId === "string" ? attemptId.trim() : "";

  if (!parsedAttemptId) {
    res.status(400).json({ error: "Attempt id is required" });
    return;
  }

  if (!Number.isInteger(parsedQuestionIndex) || parsedQuestionIndex < 0) {
    res.status(400).json({ error: "Invalid question index" });
    return;
  }
  if (!Number.isInteger(parsedAnswerIndex) || parsedAnswerIndex < 0) {
    res.status(400).json({ error: "Invalid answer index" });
    return;
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    select: { expiresAt: true },
  });
  if (!quiz) {
    res.status(404).json({ error: "Quiz not found" });
    return;
  }
  if (quiz.expiresAt < new Date()) {
    res.status(410).json({ expired: true, message: "Квиз завершен" });
    return;
  }

  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: parsedAttemptId },
    select: {
      id: true,
      visitorId: true,
      quizId: true,
      isFirstAttempt: true,
      completedAt: true,
    },
  });
  if (!attempt || attempt.quizId !== id || attempt.visitorId !== visitor.id) {
    res.status(404).json({ error: "Attempt not found" });
    return;
  }
  if (attempt.completedAt) {
    res.status(409).json({ error: "Attempt already completed" });
    return;
  }

  const questions = await getQuizQuestions(id);
  if (parsedQuestionIndex >= questions.length) {
    res.status(404).json({ error: "Question not found" });
    return;
  }
  await primeQuizStatsCache(id, questions);
  const question = getCachedQuestion(id, parsedQuestionIndex);

  if (!question) {
    res.status(404).json({ error: "Question not found" });
    return;
  }
  const options = Array.isArray(question.options) ? question.options : [];
  if (parsedAnswerIndex < 0 || parsedAnswerIndex >= options.length) {
    res.status(400).json({ error: "Invalid answer index" });
    return;
  }

  const existing = await prisma.answer.findFirst({
    where: {
      attemptId: { equals: attempt.id },
      questionId: question.id,
    },
  });
  if (existing || hasBufferedAnswer(attempt.id, question.id)) {
    res.status(409).json({ error: "Already answered" });
    return;
  }

  const isCorrect = parsedAnswerIndex === question.correctIndex;
  const safeTimeLeft = Math.max(0, parsedTimeLeft || 0);
  const score = isCorrect ? 100 + safeTimeLeft * 10 : 0;

  const enqueued = await enqueueAnswer({
    attemptId: attempt.id,
    visitorId: visitor.id,
    questionId: question.id,
    quizId: id,
    answerIndex: parsedAnswerIndex,
    isCorrect,
    timeLeft: safeTimeLeft,
    score,
  });
  if (!enqueued) {
    res.status(409).json({ error: "Already answered" });
    return;
  }

  if (attempt.isFirstAttempt) {
    recordAnswer(id, parsedQuestionIndex, parsedAnswerIndex);
  }
  const stats = getStats(id, parsedQuestionIndex);

  if (attempt.isFirstAttempt) {
    const playerName = visitor.username ? `@${visitor.username}` : visitor.firstName;
    const avatarUrl = await getTelegramAvatarUrl(visitor.telegramId);
    emitAnswerEvents({
      quizId: id,
      questionIndex: parsedQuestionIndex,
      answerIndex: parsedAnswerIndex,
      isCorrect,
      score,
      visitorId: visitor.id,
      playerName,
      avatarUrl,
    });
  }

  res.json({
    isCorrect,
    correctIndex: question.correctIndex,
    score,
    stats,
    isFirstAttempt: attempt.isFirstAttempt,
  });
});

router.post("/:id/complete", async (req, res) => {
  const id = getRouteId(req.params.id);
  const visitor = req.visitor;

  if (!id) {
    res.status(400).json({ error: "Quiz id is required" });
    return;
  }

  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { attemptId } = req.body as { attemptId?: string };
  const parsedAttemptId = typeof attemptId === "string" ? attemptId.trim() : "";
  if (!parsedAttemptId) {
    res.status(400).json({ error: "Attempt id is required" });
    return;
  }

  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: parsedAttemptId },
    select: {
      id: true,
      visitorId: true,
      quizId: true,
      isFirstAttempt: true,
      completedAt: true,
    },
  });
  if (!attempt || attempt.quizId !== id || attempt.visitorId !== visitor.id) {
    res.status(404).json({ error: "Attempt not found" });
    return;
  }
  if (attempt.completedAt) {
    res.status(409).json({ error: "Attempt already completed" });
    return;
  }

  await flushQuizNow(id);

  const [scoreSum, correctCount, questions] = await Promise.all([
    prisma.answer.aggregate({
      where: { attemptId: { equals: attempt.id } },
      _sum: { score: true },
    }),
    prisma.answer.count({
      where: { attemptId: { equals: attempt.id }, isCorrect: true },
    }),
    prisma.question.findMany({
      where: { quizId: id },
      select: { options: true },
    }),
  ]);
  const totalQuestions = questions.filter(
    (question) => Array.isArray(question.options) && question.options.length > 0,
  ).length;

  const totalScore = scoreSum._sum?.score ?? 0;
  const updatedAttempt = await prisma.quizAttempt.update({
    where: { id: attempt.id },
    data: {
      totalScore,
      correctCount,
      totalQuestions,
      completedAt: new Date(),
    },
    select: { completedAt: true },
  });

  if (attempt.isFirstAttempt) {
    const playerName = visitor.username ? `@${visitor.username}` : visitor.firstName;
    const completedAt = updatedAttempt.completedAt ?? new Date();
    recordLeaderboardAttempt(id, {
      visitorId: visitor.id,
      name: playerName,
      score: totalScore,
      completedAt,
    });
    markLeaderboardDirty(id, visitor.id);
  }

  const [leaderboard, firstAttempt] = await Promise.all([
    getLeaderboardUpdate(id, visitor.id),
    attempt.isFirstAttempt
      ? Promise.resolve(null)
      : prisma.quizAttempt.findFirst({
          where: { quizId: id, visitorId: visitor.id, isFirstAttempt: true },
          select: { correctCount: true, totalQuestions: true },
        }),
  ]);

  res.json({
    isFirstAttempt: attempt.isFirstAttempt,
    rank: leaderboard.rank,
    totalPlayers: leaderboard.totalPlayers,
    previousCorrectCount: firstAttempt?.correctCount ?? null,
    previousTotalQuestions: firstAttempt?.totalQuestions ?? null,
  });
});

router.get("/:id/leaderboard", async (req, res) => {
  const id = getRouteId(req.params.id);
  const visitor = req.visitor;

  if (!id) {
    res.status(400).json({ error: "Quiz id is required" });
    return;
  }

  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const leaderboard = await getLeaderboardView(id, visitor.id, 50);
  res.json(leaderboard);
});

router.post("/:id/check-subscription", async (req, res) => {
  const id = getRouteId(req.params.id);
  const visitor = req.visitor;

  if (!id) {
    res.status(400).json({ error: "Quiz id is required" });
    return;
  }

  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    select: { channelUrl: true },
  });
  if (!quiz) {
    res.status(404).json({ error: "Quiz not found" });
    return;
  }

  let channelId: string | null = null;
  const channelUrl = quiz?.channelUrl?.trim();
  if (channelUrl) {
    if (channelUrl.startsWith("@")) {
      channelId = channelUrl;
    } else {
      const match = channelUrl.match(/t\.me\/([^/?]+)/);
      if (match) {
        channelId = `@${match[1]}`;
      } else {
        res.status(400).json({ error: "Invalid channel URL" });
        return;
      }
    }
  }
  if (!channelId && !process.env.CHANNEL_ID) {
    res.status(400).json({ error: "Channel is not configured" });
    return;
  }

  const [result, avatarUrl] = await Promise.all([
    checkSubscription(visitor.telegramId, channelId),
    getTelegramAvatarUrl(visitor.telegramId),
  ]);
  const playerName = visitor.username ? `@${visitor.username}` : visitor.firstName;

  try {
    getIO()
      .to(adminRoom(id))
      .emit("admin:subscription", {
        playerName,
        avatarUrl,
        status: result.subscribed ? "success" : "failed",
        timestamp: new Date(),
      });
  } catch {
    // Socket not initialized
  }

  res.json({ subscribed: result.subscribed });
});

router.post("/:id/reset", adminOnly, async (req, res) => {
  const id = getRouteId(req.params.id);
  const visitor = req.visitor;

  if (!id) {
    res.status(400).json({ error: "Quiz id is required" });
    return;
  }

  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    select: { creatorId: true },
  });

  if (!quiz) {
    res.status(404).json({ error: "Quiz not found" });
    return;
  }

  if (quiz.creatorId !== visitor.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await flushQuizNow(id);

  await prisma.$transaction(async (tx) => {
    await tx.answer.deleteMany({
      where: { quizId: id },
    });
    await tx.quizAttempt.deleteMany({
      where: { quizId: id },
    });
  });

  clearLeaderboardCache(id);
  clearQuizCache(id);
  clearQuizQuestions(id);

  const io = getIO();
  io.to(quizRoom(id)).emit("quiz:reset");

  res.json({ success: true });
});

router.put("/:id", adminOnly, async (req, res) => {
  const id = getRouteId(req.params.id);
  const visitor = req.visitor;

  if (!id) {
    res.status(400).json({ error: "Quiz id is required" });
    return;
  }

  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const quiz = await updateQuiz(id, visitor.id, {
      ...req.body,
      creatorId: visitor.id,
    });
    res.json({ id: quiz.id, adminToken: quiz.adminToken });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: "Failed to update quiz" });
  }
});

router.delete("/:id", adminOnly, async (req, res) => {
  const id = getRouteId(req.params.id);
  const visitor = req.visitor;

  if (!id) {
    res.status(400).json({ error: "Quiz id is required" });
    return;
  }

  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    select: { creatorId: true },
  });

  if (!quiz) {
    res.status(404).json({ error: "Quiz not found" });
    return;
  }

  if (quiz.creatorId !== visitor.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await flushQuizNow(id);

  await prisma.$transaction(async (tx) => {
    await tx.answer.deleteMany({
      where: { quizId: id },
    });
    await tx.quizAttempt.deleteMany({
      where: { quizId: id },
    });
    await tx.question.deleteMany({
      where: { quizId: id },
    });
    await tx.quiz.delete({
      where: { id },
    });
  });

  clearLeaderboardCache(id);
  clearQuizCache(id);
  clearQuizQuestions(id);

  const io = getIO();
  io.to(quizRoom(id)).emit("quiz:deleted");
  io.in(quizRoom(id)).disconnectSockets(true);

  res.json({ success: true });
});

router.get("/:id/stats", async (req, res) => {
  const id = getRouteId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Quiz id is required" });
    return;
  }
  const stats = await getQuizStats(id);
  res.json({ questions: stats });
});

export default router;
