import { prisma } from "../lib/prisma";
import type { Prisma } from "@prisma/client";
import { createClient, type RedisClientType } from "redis";

export type BufferedAnswer = Prisma.AnswerCreateManyInput;
export type StreamEntry = {
  id: string;
  message: Record<string, string>;
};

const redisUrl = process.env.REDIS_URL;
const STREAM_PREFIX = process.env.ANSWER_STREAM_PREFIX ?? "quiz:answers:";
const STREAM_SET_KEY = process.env.ANSWER_STREAM_SET_KEY ?? "quiz:answer_streams";
const HEARTBEAT_KEY =
  process.env.ANSWER_CONSUMER_HEARTBEAT_KEY ?? "quiz:answer_consumer:heartbeat";
const HEARTBEAT_TTL_SECONDS = Number(
  process.env.ANSWER_CONSUMER_HEARTBEAT_TTL_SECONDS ?? 20,
);

export type ConsumerHeartbeat = {
  ts: number;
  backlog: number;
  alert: boolean;
  streak: number;
};

let redis: RedisClientType | null = null;
let initPromise: Promise<void> | null = null;

export const isRedisEnabled = () => Boolean(redisUrl);

export const streamKeyForQuiz = (quizId: string) => `${STREAM_PREFIX}${quizId}`;

export const parseQuizId = (streamKey: string) =>
  streamKey.startsWith(STREAM_PREFIX) ? streamKey.slice(STREAM_PREFIX.length) : streamKey;

export const getRedisClient = async () => {
  if (!redisUrl) {
    return null;
  }
  if (!initPromise) {
    initPromise = (async () => {
      redis = createClient({ url: redisUrl });
      redis.on("error", (error) => {
        console.error("[redis] error", error);
      });
      await redis.connect();
    })();
  }
  await initPromise;
  return redis;
};

export const addAnswerToStream = async (data: BufferedAnswer) => {
  const client = await getRedisClient();
  if (!client) {
    throw new Error("Redis is not configured");
  }
  const streamKey = streamKeyForQuiz(data.quizId);
  await client.xAdd(streamKey, "*", {
    visitorId: data.visitorId,
    questionId: data.questionId,
    quizId: data.quizId,
    answerIndex: String(data.answerIndex),
    isCorrect: data.isCorrect ? "1" : "0",
    timeLeft: String(data.timeLeft),
    score: String(data.score),
  });
  await client.sAdd(STREAM_SET_KEY, streamKey);
};

export const listStreamKeys = async () => {
  const client = await getRedisClient();
  if (!client) {
    return [] as string[];
  }
  return client.sMembers(STREAM_SET_KEY);
};

export const readStreamBatch = async (streamKey: string, count = 200) => {
  const client = await getRedisClient();
  if (!client) {
    return [] as StreamEntry[];
  }
  const entries = (await client.xRange(streamKey, "-", "+", { COUNT: count })) as
    | StreamEntry[]
    | undefined;
  return entries ?? [];
};

export const deleteStreamEntries = async (streamKey: string, ids: string[]) => {
  if (ids.length === 0) {
    return;
  }
  const client = await getRedisClient();
  if (!client) {
    return;
  }
  await client.xDel(streamKey, ids);
};

export const getStreamLength = async (streamKey: string) => {
  const client = await getRedisClient();
  if (!client) {
    return 0;
  }
  return client.xLen(streamKey);
};

export const removeEmptyStream = async (streamKey: string) => {
  const client = await getRedisClient();
  if (!client) {
    return;
  }
  const length = await client.xLen(streamKey);
  if (length === 0) {
    await client.sRem(STREAM_SET_KEY, streamKey);
  }
};

export const parseAnswerMessages = (messages: StreamEntry[]): BufferedAnswer[] => {
  const parseNumber = (value?: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return messages.map((entry) => ({
    visitorId: entry.message.visitorId,
    questionId: entry.message.questionId,
    quizId: entry.message.quizId,
    answerIndex: parseNumber(entry.message.answerIndex),
    isCorrect: entry.message.isCorrect === "1" || entry.message.isCorrect === "true",
    timeLeft: parseNumber(entry.message.timeLeft),
    score: parseNumber(entry.message.score),
  }));
};

export const writeAnswers = async (answers: BufferedAnswer[]) => {
  if (answers.length === 0) {
    return;
  }
  await prisma.answer.createMany({
    data: answers,
    skipDuplicates: true,
  });
};

export const setConsumerHeartbeat = async (payload: ConsumerHeartbeat) => {
  const client = await getRedisClient();
  if (!client) {
    return;
  }
  await client.set(HEARTBEAT_KEY, JSON.stringify(payload), {
    EX: HEARTBEAT_TTL_SECONDS,
  });
};

export const getConsumerHeartbeat = async () => {
  const client = await getRedisClient();
  if (!client) {
    return null;
  }
  const raw = await client.get(HEARTBEAT_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ConsumerHeartbeat;
  } catch {
    return null;
  }
};

export const getConsumerHeartbeatTtl = () => HEARTBEAT_TTL_SECONDS;
