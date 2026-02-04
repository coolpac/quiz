import { prisma } from "../lib/prisma";
import type { Question } from "@prisma/client";

type QuizQuestionsCache = {
  ordered: Question[];
  byOrder: Map<number, Question>;
};

const cache = new Map<string, QuizQuestionsCache>();

export const primeQuizQuestions = (quizId: string, questions: Question[]) => {
  const ordered = [...questions].sort((a, b) => a.order - b.order);
  const byOrder = new Map<number, Question>();
  ordered.forEach((question) => {
    byOrder.set(question.order, question);
  });
  cache.set(quizId, { ordered, byOrder });
};

export const getCachedQuestion = (quizId: string, questionOrder: number) =>
  cache.get(quizId)?.byOrder.get(questionOrder) ?? null;

export const getQuizQuestions = async (quizId: string) => {
  const existing = cache.get(quizId);
  if (existing) {
    return existing.ordered;
  }

  const questions = await prisma.question.findMany({
    where: { quizId },
    orderBy: { order: "asc" },
  });
  primeQuizQuestions(quizId, questions);
  return cache.get(quizId)?.ordered ?? [];
};

export const getQuestionCount = (quizId: string) =>
  cache.get(quizId)?.ordered.length ?? 0;

export const clearQuizQuestions = (quizId: string) => {
  cache.delete(quizId);
};
