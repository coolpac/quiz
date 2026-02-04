export type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  media?: { type: "image" | "video"; url: string };
  requiresSubscription?: boolean;
  channelUrl?: string;
};

export type QuizData = {
  id: string;
  title: string;
  timePerQuestion: number;
  questions: QuizQuestion[];
};

export type QuizResults = {
  score: number;
  correctCount: number;
  totalQuestions: number;
  isFirstAttempt: boolean;
  quizId: string;
};

export type LeaderboardPlayer = {
  name: string;
  score: number;
  rank: number;
};

export type LiveFeedItem = {
  playerName: string;
  action: "correct" | "wrong";
  questionIndex: number;
  timestamp: Date;
};

export type SubscriptionLogItem = {
  playerName: string;
  status: "success" | "failed";
  timestamp: Date;
};

export type AdminAnswerItem = {
  playerName: string;
  questionIndex: number;
  answerIndex: number;
  isCorrect: boolean;
  score: number;
  timestamp: Date;
};
