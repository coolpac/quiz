export type QuizStatsCache = {
  counts: number[][];
  totals: number[];
};

const DEFAULT_OPTIONS_COUNT = 4;
const cache = new Map<string, QuizStatsCache>();

const ensureQuestionSlot = (state: QuizStatsCache, questionOrder: number) => {
  if (state.counts.length <= questionOrder) {
    for (let index = state.counts.length; index <= questionOrder; index += 1) {
      state.counts[index] = new Array(DEFAULT_OPTIONS_COUNT).fill(0);
      state.totals[index] = 0;
    }
  }

  if (!state.counts[questionOrder]) {
    state.counts[questionOrder] = new Array(DEFAULT_OPTIONS_COUNT).fill(0);
  }
  if (typeof state.totals[questionOrder] !== "number") {
    state.totals[questionOrder] = 0;
  }
};

const ensureAnswerSlot = (row: number[], answerIndex: number) => {
  if (row.length <= answerIndex) {
    const missing = answerIndex - row.length + 1;
    row.push(...new Array(missing).fill(0));
  }
};

export const initQuizCache = (quizId: string, questionCount: number) => {
  const count = Math.max(0, questionCount);
  cache.set(quizId, {
    counts: Array.from({ length: count }, () =>
      new Array(DEFAULT_OPTIONS_COUNT).fill(0),
    ),
    totals: new Array(count).fill(0),
  });
};

export const hasQuizCache = (quizId: string) => cache.has(quizId);

export const recordAnswer = (
  quizId: string,
  questionOrder: number,
  answerIndex: number,
  increment = 1,
) => {
  let state = cache.get(quizId);
  if (!state) {
    initQuizCache(quizId, questionOrder + 1);
    state = cache.get(quizId);
  }
  if (!state) {
    return;
  }

  ensureQuestionSlot(state, questionOrder);
  const row = state.counts[questionOrder];
  ensureAnswerSlot(row, answerIndex);

  row[answerIndex] += increment;
  state.totals[questionOrder] += increment;
};

export const getStats = (quizId: string, questionOrder: number) => {
  const state = cache.get(quizId);
  if (!state) {
    return new Array(DEFAULT_OPTIONS_COUNT).fill(0);
  }

  const row = state.counts[questionOrder];
  const total = state.totals[questionOrder] ?? 0;
  const length = row?.length ?? DEFAULT_OPTIONS_COUNT;

  return Array.from({ length }, (_, index) => {
    const count = row?.[index] ?? 0;
    if (total === 0) {
      return 0;
    }
    return Math.round((count / total) * 100);
  });
};

export const getTotalAnswers = (quizId: string, questionOrder: number) =>
  cache.get(quizId)?.totals[questionOrder] ?? 0;

export const clearQuizCache = (quizId: string) => {
  cache.delete(quizId);
};
