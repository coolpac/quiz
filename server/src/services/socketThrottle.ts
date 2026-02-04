import { adminRoom, emitPlayersCount, getIO, quizRoom } from "../socketState";
import { getLeaderboardUpdate } from "./leaderboard";
import { getStats } from "./statsCache";

type PlayerAnsweredEvent = {
  playerName: string;
  avatarUrl?: string | null;
  action: "correct" | "wrong";
  questionIndex: number;
  timestamp: Date;
};

const dirtyStats = new Map<string, Set<number>>();
const answerBuffer = new Map<string, PlayerAnsweredEvent[]>();
const leaderboardDirty = new Set<string>();
const leaderboardVisitor = new Map<string, string>();
const countDirty = new Set<string>();

const safeIO = () => {
  try {
    return getIO();
  } catch {
    return null;
  }
};

const flushStats = () => {
  const io = safeIO();
  if (!io) {
    return;
  }

  const entries = Array.from(dirtyStats.entries());
  dirtyStats.clear();

  entries.forEach(([quizId, questionSet]) => {
    questionSet.forEach((questionIndex) => {
      const stats = getStats(quizId, questionIndex);
      io.to(quizRoom(quizId)).emit("stats:updated", {
        questionIndex,
        stats,
      });
      io.to(adminRoom(quizId)).emit("stats:updated", {
        questionIndex,
        stats,
      });
    });
  });
};

const flushPlayerAnswered = () => {
  const io = safeIO();
  if (!io) {
    return;
  }

  const entries = Array.from(answerBuffer.entries());
  answerBuffer.clear();

  entries.forEach(([quizId, events]) => {
    if (events.length === 0) {
      return;
    }
    io.to(quizRoom(quizId)).volatile.emit("players:answered_batch", events);
  });
};

const flushLeaderboard = async () => {
  const io = safeIO();
  if (!io) {
    return;
  }

  const quizIds = Array.from(leaderboardDirty.values());
  leaderboardDirty.clear();

  for (const quizId of quizIds) {
    const visitorId = leaderboardVisitor.get(quizId);
    if (!visitorId) {
      continue;
    }
    const leaderboard = await getLeaderboardUpdate(quizId, visitorId);
    io.to(quizRoom(quizId)).emit("leaderboard:updated", leaderboard);
    io.to(adminRoom(quizId)).emit("leaderboard:updated", leaderboard);
  }
};

const flushPlayersCount = () => {
  const io = safeIO();
  if (!io) {
    return;
  }

  const quizIds = Array.from(countDirty.values());
  countDirty.clear();
  quizIds.forEach((quizId) => emitPlayersCount(quizId));
};

setInterval(flushStats, 500);
setInterval(flushPlayerAnswered, 300);
setInterval(() => {
  void flushLeaderboard();
}, 2000);
setInterval(flushPlayersCount, 3000);

export const markStatsDirty = (quizId: string, questionIndex: number) => {
  const existing = dirtyStats.get(quizId) ?? new Set<number>();
  existing.add(questionIndex);
  dirtyStats.set(quizId, existing);
};

export const queuePlayerAnswered = (quizId: string, payload: PlayerAnsweredEvent) => {
  const existing = answerBuffer.get(quizId) ?? [];
  existing.push(payload);
  answerBuffer.set(quizId, existing);
};

export const markLeaderboardDirty = (quizId: string, visitorId: string) => {
  leaderboardDirty.add(quizId);
  leaderboardVisitor.set(quizId, visitorId);
};

export const markPlayersCountDirty = (quizId: string) => {
  countDirty.add(quizId);
};
