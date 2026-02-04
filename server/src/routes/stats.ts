import { Router } from "express";
import { prisma } from "../lib/prisma";
import { validateTelegramInitData } from "../middleware/auth";
import { adminOnly } from "../middleware/adminOnly";
import { getBacklogMetrics } from "../services/answerBuffer";

const router = Router();

router.use(validateTelegramInitData);

router.get("/dashboard", adminOnly, async (req, res) => {
  const visitor = req.visitor;
  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const now = new Date();

  const [totalGames, activeQuizzes, playerGroups, topQuizzes, backlog] =
    await Promise.all([
    prisma.quizAttempt.count({
      where: { quiz: { creatorId: visitor.id } },
    }),
    prisma.quiz.count({
      where: { creatorId: visitor.id, expiresAt: { gt: now } },
    }),
    prisma.quizAttempt.groupBy({
      by: ["visitorId"],
      where: { quiz: { creatorId: visitor.id } },
    }),
    prisma.quiz.findMany({
      where: { creatorId: visitor.id },
      include: { _count: { select: { attempts: true, questions: true } } },
      orderBy: { attempts: { _count: "desc" } },
      take: 5,
    }),
    getBacklogMetrics(),
  ]);

  res.json({
    totalGames,
    activeQuizzes,
    totalPlayers: playerGroups.length,
    backlog,
    topQuizzes: topQuizzes.map((quiz) => ({
      title: quiz.title,
      plays: quiz._count.attempts,
      questionsCount: quiz._count.questions,
    })),
  });
});

export default router;
