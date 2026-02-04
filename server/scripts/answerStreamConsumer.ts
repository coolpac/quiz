import { prisma } from "../src/lib/prisma";
import {
  getConsumerHeartbeatTtl,
  getRedisClient,
  getStreamLength,
  isRedisEnabled,
  listStreamKeys,
  parseAnswerMessages,
  readStreamBatch,
  deleteStreamEntries,
  removeEmptyStream,
  setConsumerHeartbeat,
  writeAnswers,
} from "../src/services/answerStream";

const POLL_INTERVAL_MS = Number(process.env.ANSWER_STREAM_POLL_MS ?? 500);
const BATCH_SIZE = Number(process.env.ANSWER_STREAM_BATCH_SIZE ?? 500);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const computeBacklogTotal = async () => {
  const keys = await listStreamKeys();
  let total = 0;
  for (const key of keys) {
    total += await getStreamLength(key);
  }
  return total;
};

const processStream = async (streamKey: string) => {
  let entries = await readStreamBatch(streamKey, BATCH_SIZE);
  let processed = 0;
  while (entries.length > 0) {
    const answers = parseAnswerMessages(entries);
    await writeAnswers(answers);
    await deleteStreamEntries(
      streamKey,
      entries.map((entry) => entry.id),
    );
    processed += entries.length;
    entries = await readStreamBatch(streamKey, BATCH_SIZE);
  }
  await removeEmptyStream(streamKey);
  return processed;
};

const main = async () => {
  if (!isRedisEnabled()) {
    throw new Error("REDIS_URL is not configured");
  }
  await getRedisClient();

  console.info("[consumer] started");
  let lastBacklog = 0;
  let growthStreak = 0;
  const alertThreshold = Number(process.env.ANSWER_BACKLOG_GROW_THRESHOLD ?? 3);

  while (true) {
    const keys = await listStreamKeys();
    let processed = 0;
    for (const key of keys) {
      processed += await processStream(key);
    }
    const backlogTotal = await computeBacklogTotal();
    if (backlogTotal > lastBacklog) {
      growthStreak += 1;
    } else {
      growthStreak = 0;
    }
    const alert = backlogTotal > 0 && growthStreak >= alertThreshold;
    if (alert) {
      console.warn(
        `[consumer] backlog growing (current ${backlogTotal}, previous ${lastBacklog})`,
      );
    }
    await setConsumerHeartbeat({
      ts: Date.now(),
      backlog: backlogTotal,
      alert,
      streak: growthStreak,
    });
    lastBacklog = backlogTotal;
    if (processed === 0) {
      await sleep(POLL_INTERVAL_MS);
    } else {
      await sleep(Math.min(POLL_INTERVAL_MS, 100));
    }
  }
};

main()
  .catch((error) => {
    console.error("[consumer] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
