import { prisma } from "../lib/prisma";
import { getIO, quizRoom } from "../socketState";
import { clearLeaderboardCache } from "./leaderboard";
import { clearQuizQuestions } from "./questionsCache";
import { clearQuizCache } from "./statsCache";

const cleanupTimers = new Map<string, NodeJS.Timeout>();
const expiryTimers = new Map<string, NodeJS.Timeout>();
const cleanupDelayMs = 30 * 60 * 1000;

const clearTimers = (quizId: string) => {
  const expiryTimer = expiryTimers.get(quizId);
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimers.delete(quizId);
  }
  const cleanupTimer = cleanupTimers.get(quizId);
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimers.delete(quizId);
  }
};

const clearQuizState = (quizId: string) => {
  clearQuizQuestions(quizId);
  clearQuizCache(quizId);
  clearLeaderboardCache(quizId);
  clearTimers(quizId);
};

export const scheduleQuizExpiry = (quizId: string, expiresAt: Date) => {
  if (expiryTimers.has(quizId) || cleanupTimers.has(quizId)) {
    return;
  }

  const msUntilExpiry = expiresAt.getTime() - Date.now();
  const msUntilCleanup = msUntilExpiry + cleanupDelayMs;

  const expireNow = () => {
    try {
      const io = getIO();
      io.to(quizRoom(quizId)).emit("quiz:expired");
      io.in(quizRoom(quizId)).disconnectSockets(true);
    } catch {
      // Socket server not initialized
    }
  };

  if (msUntilExpiry > 0) {
    const expiryTimer = setTimeout(expireNow, msUntilExpiry);
    expiryTimers.set(quizId, expiryTimer);
  } else {
    expireNow();
  }

  if (msUntilCleanup > 0) {
    const cleanupTimer = setTimeout(() => {
      clearQuizState(quizId);
    }, msUntilCleanup);
    cleanupTimers.set(quizId, cleanupTimer);
  } else {
    clearQuizState(quizId);
  }
};

export const ensureQuizExpiry = async (quizId: string) => {
  if (expiryTimers.has(quizId) || cleanupTimers.has(quizId)) {
    return;
  }
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { expiresAt: true },
  });
  if (!quiz) {
    return;
  }
  scheduleQuizExpiry(quizId, quiz.expiresAt);
};
