import { prisma } from "../lib/prisma";

export type CreateQuestionInput = {
  text: string;
  options: string[];
  correctIndex: number;
  mediaUrl?: string;
  mediaType?: string;
  requiresSubscription?: boolean;
  order: number;
};

export type CreateQuizInput = {
  creatorId: string;
  title: string;
  category: string;
  difficulty?: string;
  timePerQuestion?: number;
  isPublic?: boolean;
  channelUrl?: string | null;
  questions: CreateQuestionInput[];
};

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const validateQuizInput = (input: CreateQuizInput) => {
  const title = input.title.trim();
  if (title.length < 2 || title.length > 200) {
    throw new ValidationError("Название квиза должно быть от 2 до 200 символов");
  }
  if (!input.questions.length || input.questions.length > 50) {
    throw new ValidationError("Количество вопросов должно быть от 1 до 50");
  }
  const hasSubscriptionQuestions = input.questions.some(
    (q) => q.requiresSubscription,
  );
  if (hasSubscriptionQuestions) {
    const channelUrl = input.channelUrl?.trim();
    const hasChannelId = Boolean(process.env.CHANNEL_ID);
    if (!channelUrl && !hasChannelId) {
      throw new ValidationError(
        "Для вопросов с подпиской укажите ссылку на канал или настройте CHANNEL_ID на сервере",
      );
    }
    if (channelUrl) {
      const isValidFormat =
        channelUrl.startsWith("https://t.me/") || channelUrl.startsWith("@");
      if (!isValidFormat) {
        throw new ValidationError(
          "Ссылка на канал должна быть в формате https://t.me/... или @channelname",
        );
      }
    }
  }
  input.questions.forEach((question, index) => {
    const text = question.text.trim();
    if (text.length < 3) {
      throw new ValidationError(`Вопрос ${index + 1} пуст`);
    }
    const trimmedOptions = question.options.map((option) => option.trim());
    const options = trimmedOptions.filter((option) => option.length > 0);
    const isSubscriptionGate =
      question.requiresSubscription && options.length === 0;
    if (!isSubscriptionGate && (options.length < 2 || options.length > 4)) {
      throw new ValidationError(
        `Вопрос ${index + 1}: нужно от 2 до 4 вариантов`,
      );
    }
    if (!isSubscriptionGate && (question.correctIndex < 0 || question.correctIndex >= options.length)) {
      throw new ValidationError(`Вопрос ${index + 1}: неверный правильный ответ`);
    }
  });
};

export const createQuiz = async (input: CreateQuizInput) => {
  validateQuizInput(input);
  const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const quiz = await prisma.quiz.create({
    data: {
      creatorId: input.creatorId,
      title: input.title,
      category: input.category,
      difficulty: input.difficulty ?? "medium",
      timePerQuestion: input.timePerQuestion ?? 15,
      isPublic: input.isPublic ?? true,
      channelUrl: input.channelUrl ?? null,
      expiresAt,
      questions: {
        create: input.questions.map((question) => {
          const options = question.options
            .map((option) => option.trim())
            .filter((option) => option.length > 0);
          const correctIndex = options.length === 0 ? 0 : question.correctIndex;
          return {
            text: question.text.trim(),
            options,
            correctIndex,
            mediaUrl: question.mediaUrl ?? null,
            mediaType: question.mediaType ?? null,
            requiresSubscription: question.requiresSubscription ?? false,
            order: question.order,
          };
        }),
      },
    },
    include: {
      questions: true,
    },
  });

  return quiz;
};

export const updateQuiz = async (
  quizId: string,
  creatorId: string,
  input: CreateQuizInput,
) => {
  const existing = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { creatorId: true },
  });

  if (!existing) {
    throw new ValidationError("Квиз не найден");
  }

  if (existing.creatorId !== creatorId) {
    throw new ValidationError("Нет доступа к редактированию этого квиза");
  }

  validateQuizInput(input);

  await prisma.$transaction(async (tx) => {
    await tx.question.deleteMany({
      where: { quizId },
    });

    await tx.quiz.update({
      where: { id: quizId },
      data: {
        title: input.title,
        category: input.category,
        difficulty: input.difficulty ?? "medium",
        timePerQuestion: input.timePerQuestion ?? 15,
        isPublic: input.isPublic ?? true,
        channelUrl: input.channelUrl ?? null,
        questions: {
          create: input.questions.map((question) => {
            const options = question.options
              .map((option) => option.trim())
              .filter((option) => option.length > 0);
            const correctIndex = options.length === 0 ? 0 : question.correctIndex;
            return {
              text: question.text.trim(),
              options,
              correctIndex,
              mediaUrl: question.mediaUrl ?? null,
              mediaType: question.mediaType ?? null,
              requiresSubscription: question.requiresSubscription ?? false,
              order: question.order,
            };
          }),
        },
      },
    });
  });

  const updated = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  if (!updated) {
    throw new ValidationError("Не удалось обновить квиз");
  }

  return updated;
};
