import { prisma } from "../src/lib/prisma";

const fallbackCreatorId = process.env.BACKFILL_CREATOR_ID ?? "";

const resolveFallbackCreator = async () => {
  if (!fallbackCreatorId) {
    return null;
  }
  const visitor = await prisma.visitor.findUnique({
    where: { id: fallbackCreatorId },
    select: { id: true },
  });
  if (!visitor) {
    throw new Error(
      "BACKFILL_CREATOR_ID is set but visitor was not found in database",
    );
  }
  return visitor.id;
};

const backfillCreators = async () => {
  const fallbackId = await resolveFallbackCreator();
  const quizzes = await prisma.quiz.findMany({
    where: { creatorId: null },
    select: { id: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const quiz of quizzes) {
    let creatorId: string | null = null;

    const attempt = await prisma.quizAttempt.findFirst({
      where: { quizId: quiz.id },
      orderBy: { completedAt: "asc" },
      select: { visitorId: true },
    });
    if (attempt?.visitorId) {
      creatorId = attempt.visitorId;
    }

    if (!creatorId) {
      const answer = await prisma.answer.findFirst({
        where: { quizId: quiz.id },
        orderBy: { answeredAt: "asc" },
        select: { visitorId: true },
      });
      if (answer?.visitorId) {
        creatorId = answer.visitorId;
      }
    }

    if (!creatorId && fallbackId) {
      creatorId = fallbackId;
    }

    if (!creatorId) {
      skipped += 1;
      continue;
    }

    await prisma.quiz.update({
      where: { id: quiz.id },
      data: { creatorId },
    });
    updated += 1;
  }

  console.info(
    `[backfill] creatorId updated for ${updated} quizzes; skipped ${skipped}`,
  );
};

const main = async () => {
  try {
    await backfillCreators();
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error("[backfill] failed:", error);
  process.exitCode = 1;
});
