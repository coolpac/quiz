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
  const creatorFilter = { creatorId: visitor.id };

  const [
    completedGames,
    totalAttempts,
    totalQuizzes,
    activeQuizzes,
    totalPlayersResult,
    topQuizzes,
    backlog,
  ] = await Promise.all([
    prisma.quizAttempt.count({
      where: {
        quiz: creatorFilter,
        isFirstAttempt: true,
        completedAt: { not: null },
      },
    }),
    prisma.quizAttempt.count({
      where: { quiz: creatorFilter, isFirstAttempt: true },
    }),
    prisma.quiz.count({
      where: creatorFilter,
    }),
    prisma.quiz.count({
      where: { ...creatorFilter, isActive: true, expiresAt: { gt: now } },
    }),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT qa."visitorId") as count
      FROM "QuizAttempt" qa
      INNER JOIN "Quiz" q ON q.id = qa."quizId"
      WHERE q."creatorId" = ${visitor.id}
    `,
    prisma.quiz.findMany({
      where: creatorFilter,
      include: {
        _count: {
          select: {
            attempts: { where: { isFirstAttempt: true } },
            questions: true,
          },
        },
      },
      orderBy: { attempts: { _count: "desc" } },
      take: 5,
    }),
    getBacklogMetrics(),
  ]);

  const totalPlayers = Number(totalPlayersResult[0]?.count ?? 0);

  res.json({
    totalGames: completedGames,
    totalAttempts,
    totalQuizzes,
    activeQuizzes,
    totalPlayers,
    backlog,
    topQuizzes: topQuizzes.map((quiz) => ({
      title: quiz.title,
      plays: quiz._count.attempts,
      questionsCount: quiz._count.questions,
    })),
  });
});

export default router;
