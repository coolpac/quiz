import { prisma } from "../lib/prisma";

type LeaderboardEntry = {
  visitorId: string;
  name: string;
  score: number;
  completedAt: Date;
};

type LeaderboardCache = {
  byVisitor: Map<string, LeaderboardEntry>;
  sorted: LeaderboardEntry[];
  dirty: boolean;
};

const cache = new Map<string, LeaderboardCache>();

const getDisplayName = (visitor: { firstName: string; username: string | null }) =>
  visitor.username ? `@${visitor.username}` : visitor.firstName;

const getCache = (quizId: string) => {
  const existing = cache.get(quizId);
  if (existing) {
    return existing;
  }
  const created: LeaderboardCache = {
    byVisitor: new Map(),
    sorted: [],
    dirty: false,
  };
  cache.set(quizId, created);
  return created;
};

const sortEntries = (entries: LeaderboardEntry[]) =>
  entries.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.completedAt.getTime() - b.completedAt.getTime();
  });

export const clearLeaderboardCache = (quizId: string) => {
  cache.delete(quizId);
};

export const primeLeaderboardCache = async (quizId: string) => {
  const existing = cache.get(quizId);
  if (existing && existing.byVisitor.size > 0) {
    return;
  }

  const attempts = await prisma.quizAttempt.findMany({
    where: { quizId, isFirstAttempt: true },
    include: { visitor: true },
    orderBy: [{ totalScore: "desc" }, { completedAt: "asc" }],
  });

  const byVisitor = new Map<string, LeaderboardEntry>();
  const sorted = attempts.map((attempt) => {
    const entry = {
      visitorId: attempt.visitorId,
      name: getDisplayName(attempt.visitor),
      score: attempt.totalScore,
      completedAt: attempt.completedAt,
    };
    byVisitor.set(attempt.visitorId, entry);
    return entry;
  });

  cache.set(quizId, {
    byVisitor,
    sorted,
    dirty: false,
  });
};

const getSortedEntries = async (quizId: string) => {
  await primeLeaderboardCache(quizId);
  const leaderboard = getCache(quizId);
  if (leaderboard.dirty) {
    leaderboard.sorted = sortEntries(Array.from(leaderboard.byVisitor.values()));
    leaderboard.dirty = false;
  }
  return leaderboard.sorted;
};

export const recordLeaderboardAttempt = (quizId: string, entry: LeaderboardEntry) => {
  const leaderboard = getCache(quizId);
  leaderboard.byVisitor.set(entry.visitorId, entry);
  leaderboard.dirty = true;
};

export const getLeaderboardUpdate = async (quizId: string, visitorId: string) => {
  const entries = await getSortedEntries(quizId);
  const totalPlayers = entries.length;
  const ranks = new Map<string, number>();
  entries.forEach((attempt, index) => {
    ranks.set(attempt.visitorId, index + 1);
  });

  const topPlayers = entries.slice(0, 10).map((attempt, index) => ({
    name: attempt.name,
    score: attempt.score,
    rank: index + 1,
  }));

  const rank = ranks.get(visitorId) ?? totalPlayers + 1;

  return { rank, totalPlayers, topPlayers };
};

export const getLeaderboardView = async (
  quizId: string,
  visitorId: string,
  limit = 50,
) => {
  const entries = await getSortedEntries(quizId);
  const totalPlayers = entries.length;
  const rankIndex = entries.findIndex((entry) => entry.visitorId === visitorId);
  const myRank = rankIndex >= 0 ? rankIndex + 1 : totalPlayers + 1;

  const players = entries.slice(0, limit).map((entry, index) => ({
    name: entry.name,
    score: entry.score,
    rank: index + 1,
  }));

  return { players, myRank, totalPlayers };
};
