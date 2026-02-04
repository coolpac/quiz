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
import { ValidationError, createQuiz } from "../services/quiz";
import { checkSubscription } from "../services/subscription";
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
import { adminRoom, getIO } from "../socketState";

const router = Router();

router.use(validateTelegramInitData);

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
    const deepLink = `https://t.me/${botUsername}/quiz?startapp=${quiz.id}`;
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
        ? `https://t.me/${botUsername}/quiz?startapp=${quiz.id}`
        : null,
    })),
  });
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const visitor = req.visitor;

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
      timePerQuestion: quiz.timePerQuestion,
      questions,
    },
    isFirstAttempt: !firstAttempt,
  });
});

router.post("/:id/answer", answerLimiter, async (req, res) => {
  const { id } = req.params;
  const visitor = req.visitor;

  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { questionIndex, answerIndex, timeLeft } = req.body as {
    questionIndex: number;
    answerIndex: number;
    timeLeft: number;
  };

  const questions = await getQuizQuestions(id);
  await primeQuizStatsCache(id, questions);
  const question = getCachedQuestion(id, questionIndex);

  if (!question) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  const existing = await prisma.answer.findUnique({
    where: {
      visitorId_questionId: {
        visitorId: visitor.id,
        questionId: question.id,
      },
    },
  });
  if (existing || hasBufferedAnswer(visitor.id, question.id)) {
    res.status(409).json({ error: "Already answered" });
    return;
  }

  const isCorrect = answerIndex === question.correctIndex;
  const safeTimeLeft = Math.max(0, Number(timeLeft) || 0);
  const score = isCorrect ? 100 + safeTimeLeft * 10 : 0;

  const enqueued = await enqueueAnswer({
    visitorId: visitor.id,
    questionId: question.id,
    quizId: id,
    answerIndex,
    isCorrect,
    timeLeft: safeTimeLeft,
    score,
  });
  if (!enqueued) {
    res.status(409).json({ error: "Already answered" });
    return;
  }

  recordAnswer(id, questionIndex, answerIndex);
  const stats = getStats(id, questionIndex);

  const playerName = visitor.username ? `@${visitor.username}` : visitor.firstName;
  emitAnswerEvents({
    quizId: id,
    questionIndex,
    answerIndex,
    isCorrect,
    score,
    visitorId: visitor.id,
    playerName,
  });

  res.json({
    isCorrect,
    correctIndex: question.correctIndex,
    score,
    stats,
  });
});

router.post("/:id/complete", async (req, res) => {
  const { id } = req.params;
  const visitor = req.visitor;

  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const existingAttempt = await prisma.quizAttempt.findFirst({
    where: { quizId: id, visitorId: visitor.id },
  });
  if (existingAttempt) {
    const leaderboard = await getLeaderboardUpdate(id, visitor.id);
    res.json({
      isFirstAttempt: false,
      rank: leaderboard.rank,
      totalPlayers: leaderboard.totalPlayers,
    });
    return;
  }

  await flushQuizNow(id);

  const [scoreSum, correctCount, totalQuestions] = await Promise.all([
    prisma.answer.aggregate({
      where: { quizId: id, visitorId: visitor.id },
      _sum: { score: true },
    }),
    prisma.answer.count({
      where: { quizId: id, visitorId: visitor.id, isCorrect: true },
    }),
    prisma.question.count({ where: { quizId: id } }),
  ]);

  const isFirstAttempt = !(await prisma.quizAttempt.findFirst({
    where: { quizId: id, visitorId: visitor.id, isFirstAttempt: true },
  }));

  const attempt = await prisma.quizAttempt.create({
    data: {
      visitorId: visitor.id,
      quizId: id,
      totalScore: scoreSum._sum.score ?? 0,
      correctCount,
      totalQuestions,
      isFirstAttempt,
    },
    select: { completedAt: true },
  });

  const playerName = visitor.username ? `@${visitor.username}` : visitor.firstName;
  recordLeaderboardAttempt(id, {
    visitorId: visitor.id,
    name: playerName,
    score: scoreSum._sum.score ?? 0,
    completedAt: attempt.completedAt,
  });
  markLeaderboardDirty(id, visitor.id);

  const leaderboard = await getLeaderboardUpdate(id, visitor.id);

  res.json({
    isFirstAttempt,
    rank: leaderboard.rank,
    totalPlayers: leaderboard.totalPlayers,
  });
});

router.get("/:id/leaderboard", async (req, res) => {
  const { id } = req.params;
  const visitor = req.visitor;

  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const leaderboard = await getLeaderboardView(id, visitor.id, 50);
  res.json(leaderboard);
});

router.post("/:id/check-subscription", async (req, res) => {
  const { id } = req.params;
  const visitor = req.visitor;

  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    select: { channelUrl: true },
  });
  let channelId: string | null = null;
  const channelUrl = quiz?.channelUrl?.trim();
  if (channelUrl) {
    if (channelUrl.startsWith("@")) {
      channelId = channelUrl;
    } else {
      const match = channelUrl.match(/t\.me\/([^/?]+)/);
      if (match) {
        channelId = `@${match[1]}`;
      }
    }
  }

  const result = await checkSubscription(visitor.telegramId, channelId);
  const playerName = visitor.username ? `@${visitor.username}` : visitor.firstName;

  try {
    getIO()
      .to(adminRoom(id))
      .emit("admin:subscription", {
        playerName,
        status: result.subscribed ? "success" : "failed",
        timestamp: new Date(),
      });
  } catch {
    // Socket not initialized
  }

  res.json({ subscribed: result.subscribed });
});

router.get("/:id/stats", async (req, res) => {
  const { id } = req.params;
  const stats = await getQuizStats(id);
  res.json({ questions: stats });
});

export default router;
