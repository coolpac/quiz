export type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  correctIndex?: number;
  media?: { type: "image" | "video"; url: string };
  requiresSubscription?: boolean;
  channelUrl?: string;
  questionType?: string;
};

export type QuizData = {
  id: string;
  title: string;
  timePerQuestion: number;
  waitForAdminStart?: boolean;
  canStart?: boolean;
  enableStreaks?: boolean;
  enablePowerUps?: boolean;
  enableExplanations?: boolean;
  enablePodium?: boolean;
  questions: QuizQuestion[];
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  selfPaced?: boolean;
  enableTeams?: boolean;
  teamCount?: number;
};

export type QuizResults = {
  score: number;
  correctCount: number;
  totalQuestions: number;
  isFirstAttempt: boolean;
  quizId: string;
  /** При повторном прохождении — результат первой попытки для сравнения */
  previousCorrectCount?: number | null;
  previousTotalQuestions?: number | null;
  answersReview?: Array<{
    questionIndex: number;
    questionText: string;
    options: string[];
    playerAnswer: number;
    correctAnswer: number;
    isCorrect: boolean;
    score: number;
    timeLeft: number;
    explanation?: string | null;
  }>;
  enablePodium?: boolean;
};

export type LeaderboardPlayer = {
  name: string;
  score: number;
  rank: number;
  inProgress?: boolean;
};

export type LiveFeedItem = {
  playerName: string;
  avatarUrl?: string | null;
  action: "correct" | "wrong";
  questionIndex: number;
  timestamp: Date;
};

export type SubscriptionLogItem = {
  playerName: string;
  avatarUrl?: string | null;
  status: "success" | "failed";
  timestamp: Date;
};

export type AdminAnswerItem = {
  playerName: string;
  avatarUrl?: string | null;
  questionIndex: number;
  answerIndex: number;
  isCorrect: boolean;
  score: number;
  timestamp: Date;
};
