/**
 * Kahoot-style scoring: faster answer = more points.
 * Max 1000 (instant), Min 500 (at deadline), 0 if wrong.
 */
export const calculateScore = (
  isCorrect: boolean,
  responseTimeMs: number,
  questionTimerMs: number,
): number => {
  if (!isCorrect) return 0;
  const ratio = Math.min(responseTimeMs / questionTimerMs, 1);
  return Math.round(1000 * (1 - ratio / 2));
};

/**
 * Streak bonus: consecutive correct answers earn bonus points.
 */
export const calculateStreakBonus = (streakCount: number): number => {
  if (streakCount < 2) return 0;
  if (streakCount === 2) return 100;
  if (streakCount === 3) return 200;
  if (streakCount === 4) return 300;
  return 500;
};
