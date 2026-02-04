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
  input.questions.forEach((question, index) => {
    const text = question.text.trim();
    if (text.length < 3) {
      throw new ValidationError(`Вопрос ${index + 1} пуст`);
    }
    const options = question.options.map((option) => option.trim());
    if (options.length < 2 || options.length > 4) {
      throw new ValidationError(
        `Вопрос ${index + 1}: нужно от 2 до 4 вариантов`,
      );
    }
    if (options.some((option) => option.length === 0)) {
      throw new ValidationError(`Вопрос ${index + 1}: варианты не должны быть пустыми`);
    }
    if (question.correctIndex < 0 || question.correctIndex >= options.length) {
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
        create: input.questions.map((question) => ({
          text: question.text.trim(),
          options: question.options.map((option) => option.trim()),
          correctIndex: question.correctIndex,
          mediaUrl: question.mediaUrl ?? null,
          mediaType: question.mediaType ?? null,
          requiresSubscription: question.requiresSubscription ?? false,
          order: question.order,
        })),
      },
    },
    include: {
      questions: true,
    },
  });

  return quiz;
};
