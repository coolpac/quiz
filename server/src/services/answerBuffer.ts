import type { Prisma } from "@prisma/client";
import {
  addAnswerToStream,
  deleteStreamEntries,
  getRedisClient,
  getStreamLength,
  isRedisEnabled,
  listStreamKeys,
  parseAnswerMessages,
  parseQuizId,
  readStreamBatch,
  removeEmptyStream,
  streamKeyForQuiz,
  writeAnswers,
} from "./answerStream";

type BufferedAnswer = Prisma.AnswerCreateManyInput;

const buffer: BufferedAnswer[] = [];
const bufferKeys = new Set<string>();
let flushing = false;
let flushPromise: Promise<void> | null = null;

const DEDUPE_PREFIX = process.env.ANSWER_DEDUPE_PREFIX ?? "quiz:answer:dedupe:";
const DEDUPE_TTL_SECONDS = Number(process.env.ANSWER_DEDUPE_TTL_SECONDS ?? 21600);

const keyFor = (visitorId: string, questionId: string) =>
  `${visitorId}:${questionId}`;

const dedupeKeyFor = (visitorId: string, questionId: string) =>
  `${DEDUPE_PREFIX}${visitorId}:${questionId}`;

const flushBuffer = async () => {
  if (flushing || buffer.length === 0) {
    return flushPromise ?? Promise.resolve();
  }

  flushing = true;
  const batch = buffer.splice(0, buffer.length);
  const batchKeys = batch.map((item) => keyFor(item.visitorId, item.questionId));

  const promise = writeAnswers(batch)
    .then(() => {
      batchKeys.forEach((key) => bufferKeys.delete(key));
    })
    .catch((error) => {
      buffer.unshift(...batch);
      console.error("Failed to flush answer batch", error);
    })
    .finally(() => {
      flushing = false;
      if (flushPromise === promise) {
        flushPromise = null;
      }
    });

  flushPromise = promise;
  return promise;
};

export const hasBufferedAnswer = (visitorId: string, questionId: string) =>
  bufferKeys.has(keyFor(visitorId, questionId));

export const enqueueAnswer = async (data: BufferedAnswer) => {
  const key = keyFor(data.visitorId, data.questionId);
  if (bufferKeys.has(key)) {
    return false;
  }

  if (isRedisEnabled()) {
    try {
      const redis = await getRedisClient();
      if (!redis) {
        throw new Error("Redis not available");
      }
      const dedupeKey = dedupeKeyFor(data.visitorId, data.questionId);
      const dedupe = await redis.set(dedupeKey, "1", {
        NX: true,
        EX: DEDUPE_TTL_SECONDS,
      });
      if (!dedupe) {
        return false;
      }
      await addAnswerToStream(data);
      bufferKeys.add(key);
      return true;
    } catch (error) {
      console.error("[redis] failed to enqueue answer", error);
      return false;
    }
  }

  buffer.push(data);
  bufferKeys.add(key);
  return true;
};

const drainStream = async (streamKey: string) => {
  let entries = await readStreamBatch(streamKey, 500);
  while (entries.length > 0) {
    const answers = parseAnswerMessages(entries);
    await writeAnswers(answers);
    await deleteStreamEntries(
      streamKey,
      entries.map((entry) => entry.id),
    );
    answers.forEach((answer) => {
      bufferKeys.delete(keyFor(answer.visitorId, answer.questionId));
    });
    entries = await readStreamBatch(streamKey, 500);
  }
  await removeEmptyStream(streamKey);
};

export const flushQuizNow = async (quizId: string) => {
  if (isRedisEnabled()) {
    const streamKey = streamKeyForQuiz(quizId);
    await drainStream(streamKey);
    return;
  }

  if (flushPromise) {
    await flushPromise;
  }
  if (buffer.length > 0) {
    await flushBuffer();
  }
};

export const flushNow = async () => {
  if (isRedisEnabled()) {
    const keys = await listStreamKeys();
    for (const key of keys) {
      await drainStream(key);
    }
    return;
  }

  if (flushPromise) {
    await flushPromise;
  }
  if (buffer.length > 0) {
    await flushBuffer();
  }
};

export const getBacklogMetrics = async () => {
  if (!isRedisEnabled()) {
    return { total: buffer.length, perQuiz: {} as Record<string, number> };
  }
  const keys = await listStreamKeys();
  const perQuiz: Record<string, number> = {};
  let total = 0;
  for (const key of keys) {
    const length = await getStreamLength(key);
    if (length === 0) {
      await removeEmptyStream(key);
      continue;
    }
    total += length;
    perQuiz[parseQuizId(key)] = length;
  }
  return { total, perQuiz };
};

if (!isRedisEnabled()) {
  setInterval(() => {
    void flushBuffer();
  }, 500);
}
