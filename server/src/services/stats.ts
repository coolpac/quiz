import { prisma } from "../lib/prisma";
import { adminRoom, getIO } from "../socketState";
import { getQuizQuestions } from "./questionsCache";
import {
  getStats,
  getTotalAnswers,
  hasQuizCache,
  initQuizCache,
  recordAnswer,
} from "./statsCache";
import { markStatsDirty, queuePlayerAnswered } from "./socketThrottle";

export const primeQuizStatsCache = async (
  quizId: string,
  questions?: Array<{ id: string; order: number }>,
) => {
  if (hasQuizCache(quizId)) {
    return;
  }

  const quizQuestions = questions ?? (await getQuizQuestions(quizId));
  if (quizQuestions.length === 0) {
    initQuizCache(quizId, 0);
    return;
  }

  const maxOrder = Math.max(...quizQuestions.map((question) => question.order));
  initQuizCache(quizId, Math.max(quizQuestions.length, maxOrder + 1));

  const orderById = new Map(
    quizQuestions.map((question) => [question.id, question.order]),
  );
  const grouped = await prisma.answer.groupBy({
    by: ["questionId", "answerIndex"],
    where: { quizId },
    _count: { answerIndex: true },
  });

  grouped.forEach((entry) => {
    const order = orderById.get(entry.questionId);
    if (order === undefined) {
      return;
    }
    recordAnswer(quizId, order, entry.answerIndex, entry._count.answerIndex);
  });
};

export const emitAnswerEvents = (params: {
  quizId: string;
  questionIndex: number;
  answerIndex: number;
  isCorrect: boolean;
  score: number;
  visitorId: string;
  playerName: string;
}) => {
  const io = getIO();
  const timestamp = new Date();
  const action = params.isCorrect ? "correct" : "wrong";

  queuePlayerAnswered(params.quizId, {
    playerName: params.playerName,
    action,
    questionIndex: params.questionIndex,
    timestamp,
  });

  markStatsDirty(params.quizId, params.questionIndex);
  io.to(adminRoom(params.quizId)).emit("admin:answer", {
    playerName: params.playerName,
    questionIndex: params.questionIndex,
    answerIndex: params.answerIndex,
    isCorrect: params.isCorrect,
    score: params.score,
    timestamp,
  });
};

export const getQuizStats = async (quizId: string) => {
  const questions = await getQuizQuestions(quizId);
  await primeQuizStatsCache(quizId, questions);

  return questions.map((question) => ({
    questionIndex: question.order,
    stats: getStats(quizId, question.order),
    totalAnswers: getTotalAnswers(quizId, question.order),
  }));
};
