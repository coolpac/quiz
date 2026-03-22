import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ExternalLink,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Timer,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";
import { closeMiniApp } from "@telegram-apps/sdk";
import { api } from "../api";
import { connectSocket, getSocket, releaseSocket } from "../socket";
import { Button } from "../components/ui/Button";
import SocketStatusBadge from "../components/SocketStatusBadge";
import { cn } from "../lib/cn";
import { useToast, type ToastVariant } from "../components/Toast";
import { hapticImpact, hapticNotify, hapticSelection, closePlatformApp } from "../lib/telegramUi";
import type { LiveFeedItem, QuizData, QuizResults } from "../types/quiz";

const teamColors = [
  "bg-red-500/20 border-red-500/30 text-red-400",
  "bg-blue-500/20 border-blue-500/30 text-blue-400",
  "bg-green-500/20 border-green-500/30 text-green-400",
  "bg-yellow-500/20 border-yellow-500/30 text-yellow-400",
  "bg-purple-500/20 border-purple-500/30 text-purple-400",
  "bg-pink-500/20 border-pink-500/30 text-pink-400",
  "bg-cyan-500/20 border-cyan-500/30 text-cyan-400",
  "bg-orange-500/20 border-orange-500/30 text-orange-400",
];

type QuizViewProps = {
  quizId?: string | null;
  openedFromStartParam?: boolean;
  onFinish: (results: QuizResults) => void;
};

const QuizView = ({ quizId, onFinish, openedFromStartParam }: QuizViewProps) => {
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checkingIndex, setCheckingIndex] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [score, setScore] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showShake, setShowShake] = useState(false);
  const [lastExplanation, setLastExplanation] = useState<string | null>(null);
  const [usedPowerUps, setUsedPowerUps] = useState<Set<string>>(new Set());
  const [activePowerUp, setActivePowerUp] = useState<string | null>(null);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [isCheckingSub, setIsCheckingSub] = useState(false);
  const [subError, setSubError] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastFailedAnswer, setLastFailedAnswer] = useState<number | null>(null);
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [stats, setStats] = useState<number[]>([0, 0, 0, 0]);
  const [rankInfo, setRankInfo] = useState<{
    rank: number;
    totalPlayers: number;
  } | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [liveFeed, setLiveFeed] = useState<LiveFeedItem[]>([]);
  const [playersCount, setPlayersCount] = useState<number | null>(null);
  const [isFirstAttempt, setIsFirstAttempt] = useState(true);
  const [teamIndex, setTeamIndex] = useState<number | null>(null);
  const [wordInput, setWordInput] = useState("");
  const [wordCounts, setWordCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [canStart, setCanStart] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [showQuestionFade, setShowQuestionFade] = useState(false);
  const currentQRef = useRef(0);
  const isActiveRef = useRef(true);
  const lastSocketToastRef = useRef<string | null>(null);
  const autoSkipTimerRef = useRef<number | null>(null);
  const answerTimeoutRef = useRef<number | null>(null);
  const completingRef = useRef(false);
  const questionScrollRef = useRef<HTMLHeadingElement | null>(null);
  const { pushToast } = useToast();

  useEffect(() => {
    isActiveRef.current = true;
    return () => {
      isActiveRef.current = false;
      if (answerTimeoutRef.current) {
        window.clearTimeout(answerTimeoutRef.current);
        answerTimeoutRef.current = null;
      }
    };
  }, []);

  const fetchQuiz = React.useCallback(async () => {
    if (!quizId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setExpired(false);
    setLoadError(null);

    try {
      const data = await api.getQuiz(quizId);
      if (!isActiveRef.current) {
        return;
      }

      if (data?.expired) {
        setExpired(true);
        setLoading(false);
        return;
      }

      let processedQuiz = data.quiz;
      if (processedQuiz.shuffleQuestions) {
        const shuffled = [...processedQuiz.questions];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        processedQuiz = { ...processedQuiz, questions: shuffled };
      }
      if (processedQuiz.shuffleOptions) {
        processedQuiz = {
          ...processedQuiz,
          questions: processedQuiz.questions.map((q: any) => {
            const options = [...(q.options as string[])];
            const correctOption = options[q.correctIndex];
            for (let i = options.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [options[i], options[j]] = [options[j], options[i]];
            }
            return { ...q, options, correctIndex: options.indexOf(correctOption) };
          }),
        };
      }
      setQuiz(processedQuiz);
      setCanStart((processedQuiz as { canStart?: boolean })?.canStart !== false);
      setIsFirstAttempt(Boolean(data.isFirstAttempt));
      setCurrentQ(0);
      setSelected(null);
      setScore(0);
      setCorrectCount(0);
      setShowStats(false);
      setStats([0, 0, 0, 0]);
      setLiveFeed([]);
      setPlayersCount(null);
      setApiError(null);
      setAttemptId(null);
      setLastFailedAnswer(null);
      setTimeLeft(data.quiz?.timePerQuestion ?? 15);
      setLoading(false);
    } catch {
      if (!isActiveRef.current) {
        return;
      }
      setLoadError("Не удалось загрузить квиз");
      setLoading(false);
      pushToast("Не удалось загрузить квиз", "error");
    }
  }, [quizId, pushToast]);

  useEffect(() => {
    fetchQuiz();
  }, [fetchQuiz]);

  const refreshLeaderboard = React.useCallback(async () => {
    if (!quiz?.id) {
      return;
    }
    try {
      const data = await api.getLeaderboard(quiz.id);
      setRankInfo({ rank: data.myRank, totalPlayers: data.totalPlayers });
    } catch {
      setRankInfo(null);
    }
  }, [quiz?.id]);

  useEffect(() => {
    refreshLeaderboard();
  }, [refreshLeaderboard]);

  useEffect(() => {
    if (!quiz?.id || !canStart) {
      return;
    }
    let cancelled = false;
    api
      .startAttempt(quiz.id)
      .then((data) => {
        if (cancelled || !isActiveRef.current) {
          return;
        }
        if (typeof data?.attemptId === "string" && data.attemptId.trim()) {
          setAttemptId(data.attemptId);
        } else {
          setAttemptId(null);
        }
        if (typeof data?.isFirstAttempt === "boolean") {
          setIsFirstAttempt(data.isFirstAttempt);
        }
        if (typeof data?.teamIndex === "number") {
          setTeamIndex(data.teamIndex);
        }
      })
      .catch(() => {
        if (cancelled || !isActiveRef.current) {
          return;
        }
        setAttemptId(null);
        setApiError("Не удалось начать попытку");
        pushToast("Не удалось начать попытку", "error");
      })
      .finally(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [quiz?.id, canStart, pushToast]);

  const completeAndFinish = React.useCallback(
    async (finalScore: number, finalCorrectCount: number) => {
      if (!quiz) {
        return;
      }
      if (completingRef.current) {
        return;
      }
      completingRef.current = true;
      if (!attemptId) {
        onFinish({
          score: finalScore,
          correctCount: finalCorrectCount,
          totalQuestions: quiz.questions.filter((item) => item.options.length > 0)
            .length,
          isFirstAttempt,
          quizId: quiz.id,
          answersReview: [],
          enablePodium: quiz.enablePodium ?? true,
        });
        return;
      }
      const scoredQuestions = quiz.questions.filter(
        (item) => item.options.length > 0,
      );
      try {
        const completeData = await api.completeQuiz(quiz.id, attemptId);
        onFinish({
          score: finalScore,
          correctCount: finalCorrectCount,
          totalQuestions: scoredQuestions.length,
          isFirstAttempt: completeData.isFirstAttempt ?? isFirstAttempt,
          quizId: quiz.id,
          previousCorrectCount: completeData.previousCorrectCount ?? undefined,
          previousTotalQuestions: completeData.previousTotalQuestions ?? undefined,
          answersReview: completeData.answersReview ?? [],
          enablePodium: quiz.enablePodium ?? true,
        });
      } catch {
        onFinish({
          score: finalScore,
          correctCount: finalCorrectCount,
          totalQuestions: scoredQuestions.length,
          isFirstAttempt,
          quizId: quiz.id,
          answersReview: [],
          enablePodium: quiz.enablePodium ?? true,
        });
      }
    },
    [attemptId, isFirstAttempt, onFinish, quiz],
  );

  useEffect(() => {
    if (!quiz?.id) {
      return;
    }

    const socket = connectSocket();

    socket.emit("quiz:join", { quizId: quiz.id });

    const showSocketToast = (message: string, variant: ToastVariant) => {
      if (lastSocketToastRef.current === message) {
        return;
      }
      lastSocketToastRef.current = message;
      pushToast(message, variant);
    };

    let disconnectToastTimer: number | null = null;
    let shouldShowRestoreToast = false;

    const clearDisconnectToast = () => {
      if (disconnectToastTimer === null) {
        return;
      }
      window.clearTimeout(disconnectToastTimer);
      disconnectToastTimer = null;
    };

    const handleConnect = () => {
      clearDisconnectToast();
      if (shouldShowRestoreToast) {
        showSocketToast("Соединение восстановлено", "success");
        shouldShowRestoreToast = false;
      }
      socket.emit("quiz:join", { quizId: quiz.id });
      refreshLeaderboard();
      api
        .getStats(quiz.id)
        .then((data) => {
          const currentStats = data.questions?.find(
            (entry: { questionIndex: number; stats: number[] }) =>
              entry.questionIndex === currentQRef.current,
          );
          if (currentStats) {
            setStats(currentStats.stats ?? [0, 0, 0, 0]);
          }
        })
        .catch(() => undefined);
    };

    const handleDisconnect = () => {
      clearDisconnectToast();
      disconnectToastTimer = window.setTimeout(() => {
        if (socket.connected) {
          return;
        }
        shouldShowRestoreToast = true;
        showSocketToast("Соединение потеряно. Идет переподключение...", "warning");
      }, 1200);
    };

    const handleConnectError = () => {
      clearDisconnectToast();
      showSocketToast("Не удалось подключиться к серверу", "error");
    };

    const handleReconnectFailed = () => {
      clearDisconnectToast();
      showSocketToast("Не удалось восстановить соединение", "error");
    };

    const handlePlayerAnswered = (payload: {
      playerName: string;
      avatarUrl?: string | null;
      action: "correct" | "wrong";
      questionIndex: number;
      timestamp: string | Date;
    }) => {
      setLiveFeed((prev) => {
        const nextItem: LiveFeedItem = {
          playerName: payload.playerName,
          avatarUrl: payload.avatarUrl ?? null,
          action: payload.action,
          questionIndex: payload.questionIndex,
          timestamp: new Date(payload.timestamp),
        };
        return [nextItem, ...prev].slice(0, 6);
      });
    };

    const handlePlayerAnsweredBatch = (
      payload: Array<{
        playerName: string;
        avatarUrl?: string | null;
        action: "correct" | "wrong";
        questionIndex: number;
        timestamp: string | Date;
      }>,
    ) => {
      if (!Array.isArray(payload) || payload.length === 0) {
        return;
      }
      setLiveFeed((prev) => {
        const items = payload.map((entry) => ({
          playerName: entry.playerName,
          avatarUrl: entry.avatarUrl ?? null,
          action: entry.action,
          questionIndex: entry.questionIndex,
          timestamp: new Date(entry.timestamp),
        }));
        return [...items.reverse(), ...prev].slice(0, 6);
      });
    };

    const handleStatsUpdated = (payload: {
      questionIndex: number;
      stats: number[];
    }) => {
      if (payload.questionIndex === currentQRef.current) {
        setStats(payload.stats ?? [0, 0, 0, 0]);
      }
    };

    const handleLeaderboardUpdated = (payload: {
      rank: number;
      totalPlayers: number;
    }) => {
      setRankInfo({ rank: payload.rank, totalPlayers: payload.totalPlayers });
    };

    const handlePlayersCount = (payload: { count: number }) => {
      setPlayersCount(payload.count);
    };

    const handleQuizExpired = () => {
      setExpired(true);
      setTimeLeft(0);
      setSelected(null);
      setShowStats(false);
      setApiError(null);
      showSocketToast("Квиз завершен", "warning");
    };

    socket.on("player:answered", handlePlayerAnswered);
    socket.on("players:answered_batch", handlePlayerAnsweredBatch);
    socket.on("stats:updated", handleStatsUpdated);
    socket.on("leaderboard:updated", handleLeaderboardUpdated);
    const handleQuizStarted = () => {
      setCanStart(true);
    };

    socket.on("players:count", handlePlayersCount);
    const handleWordCloudWord = (payload: { questionIndex: number; word: string }) => {
      if (payload.questionIndex === currentQRef.current) {
        setWordCounts((prev) => ({
          ...prev,
          [payload.word]: (prev[payload.word] || 0) + 1,
        }));
      }
    };

    socket.on("wordcloud:word", handleWordCloudWord);
    socket.on("quiz:started", handleQuizStarted);
    socket.on("quiz:expired", handleQuizExpired);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.io.on("reconnect_failed", handleReconnectFailed);

    return () => {
      clearDisconnectToast();
      socket.off("player:answered", handlePlayerAnswered);
      socket.off("players:answered_batch", handlePlayerAnsweredBatch);
      socket.off("stats:updated", handleStatsUpdated);
      socket.off("leaderboard:updated", handleLeaderboardUpdated);
      socket.off("players:count", handlePlayersCount);
      socket.off("wordcloud:word", handleWordCloudWord);
      socket.off("quiz:started", handleQuizStarted);
      socket.off("quiz:expired", handleQuizExpired);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.io.off("reconnect_failed", handleReconnectFailed);
      releaseSocket();
    };
  }, [quiz?.id, pushToast, refreshLeaderboard]);

  useEffect(() => {
    if (!quiz) {
      return;
    }
    if (answerTimeoutRef.current) {
      window.clearTimeout(answerTimeoutRef.current);
      answerTimeoutRef.current = null;
    }
    setTimeLeft(quiz.timePerQuestion);
    setSelected(null);
    setShowStats(false);
    setStats([0, 0, 0, 0]);
    setCorrectIndex(null);
    setSubError(false);
    setApiError(null);
    setLastFailedAnswer(null);
    setTimedOut(false);
    setLastExplanation(null);
    setWordInput("");
    setWordCounts({});
  }, [currentQ, quiz]);

  const question = quiz?.questions[currentQ];
  const questionText = question?.question ?? "";
  const questionLength = questionText.length;
  const questionSizeClass =
    questionLength > 220
      ? "text-base md:text-2xl"
      : questionLength > 140
        ? "text-lg md:text-3xl"
        : "text-xl md:text-4xl";
  const questionLeadingClass =
    questionLength > 160 ? "leading-relaxed" : "leading-snug";
  const isSubscriptionGate = Boolean(
    question?.requiresSubscription && question.options.length === 0,
  );

  const updateQuestionFade = React.useCallback(() => {
    const el = questionScrollRef.current;
    if (!el) {
      setShowQuestionFade(false);
      return;
    }
    const hasOverflow = el.scrollHeight > el.clientHeight + 1;
    if (!hasOverflow) {
      setShowQuestionFade(false);
      return;
    }
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    setShowQuestionFade(!atBottom);
  }, []);

  useEffect(() => {
    const el = questionScrollRef.current;
    if (!el) {
      setShowQuestionFade(false);
      return;
    }
    el.scrollTop = 0;
    const raf = window.requestAnimationFrame(() => {
      updateQuestionFade();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [currentQ, questionText, updateQuestionFade]);
  useEffect(() => {
    currentQRef.current = currentQ;
  }, [currentQ]);
  const effectiveTotal = Math.max(
    rankInfo?.totalPlayers ?? 0,
    playersCount ?? 0,
  );
  const rankProgress =
    rankInfo && effectiveTotal > 0
      ? Math.max(
          5,
          Math.round(
            ((effectiveTotal - rankInfo.rank + 1) / effectiveTotal) * 100,
          ),
        )
      : 0;

  useEffect(() => {
    if (!quiz || !question) {
      return;
    }
    if (timeLeft <= 0) {
      return;
    }
    if (selected !== null || question.requiresSubscription) {
      return;
    }
    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, selected, question, quiz]);

  useEffect(() => {
    if (!quiz || !question) {
      return;
    }
    if (selected !== null) {
      return;
    }
    if (question.requiresSubscription) {
      return;
    }
    if (timeLeft > 0) {
      return;
    }
    if (autoSkipTimerRef.current) {
      return;
    }

    if (!timedOut) {
      hapticImpact("rigid");
    }
    setTimedOut(true);
    autoSkipTimerRef.current = window.setTimeout(() => {
      autoSkipTimerRef.current = null;
      if (currentQ < quiz.questions.length - 1) {
        setCurrentQ((q) => q + 1);
      } else {
        void completeAndFinish(score, correctCount);
      }
    }, 1000);

    return () => {
      if (autoSkipTimerRef.current) {
        window.clearTimeout(autoSkipTimerRef.current);
        autoSkipTimerRef.current = null;
      }
    };
  }, [
    timeLeft,
    quiz,
    question,
    selected,
    currentQ,
    score,
    correctCount,
    completeAndFinish,
  ]);

  const handleAnswer = async (index: number) => {
    if (!quiz || !question || selected !== null) {
      return;
    }
    setTimedOut(false);
    hapticSelection();

    if (question.requiresSubscription) {
      setIsCheckingSub(true);
      setCheckingIndex(index);
      setSubError(false);

      try {
        const result = await api.checkSubscription(quiz.id);
        if (!result?.subscribed) {
          setSubError(true);
          setApiError("Подписка не найдена. Попробуйте снова.");
          setLastFailedAnswer(index);
          pushToast("Подписка не найдена. Попробуйте снова.", "warning");
          hapticNotify("warning");
          return;
        }
        setApiError(null);
        setLastFailedAnswer(null);
      } catch {
        setSubError(true);
        setApiError("Не удалось проверить подписку");
        setLastFailedAnswer(index);
        pushToast("Не удалось проверить подписку", "error");
        hapticNotify("error");
        return;
      } finally {
        setIsCheckingSub(false);
        setCheckingIndex(null);
      }
    }

    if (!attemptId) {
      setApiError("Не удалось начать попытку. Попробуйте снова.");
      setLastFailedAnswer(index);
      pushToast("Не удалось начать попытку. Попробуйте снова.", "error");
      hapticNotify("error");
      return;
    }

    try {
      const response = await api.submitAnswer(
        quiz.id,
        currentQ,
        index,
        timeLeft,
        attemptId,
      );

      setSelected(index);
      setShowStats(true);
      setStats(response.stats ?? [0, 0, 0, 0]);
      setCorrectIndex(
        Number.isFinite(response.correctIndex)
          ? Number(response.correctIndex)
          : null,
      );
      setApiError(null);
      setLastFailedAnswer(null);
      if (typeof response.isFirstAttempt === "boolean") {
        setIsFirstAttempt(response.isFirstAttempt);
      }

      const answerScore = Number(response.score) || 0;
      const isCorrect = Boolean(response.isCorrect);

      // Apply 2x power-up
      const finalScore = activePowerUp === "double" ? answerScore * 2 : answerScore;

      // Track streak
      if (isCorrect) {
        setStreak(prev => prev + 1);
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 1000);
      } else {
        if (activePowerUp !== "shield") {
          setStreak(0);
        }
        setShowShake(true);
        setTimeout(() => setShowShake(false), 500);
      }

      // Show explanation
      if (response.explanation) {
        setLastExplanation(response.explanation);
      }

      setActivePowerUp(null);

      hapticNotify(isCorrect ? "success" : "error");
      const nextScore = score + finalScore;
      const nextCorrectCount = correctCount + (isCorrect ? 1 : 0);

      setScore(nextScore);
      setCorrectCount(nextCorrectCount);

      api
        .getLeaderboard(quiz.id)
        .then((data) => {
          setRankInfo({ rank: data.myRank, totalPlayers: data.totalPlayers });
        })
        .catch(() => {
          setRankInfo(null);
        });

      if (answerTimeoutRef.current) {
        window.clearTimeout(answerTimeoutRef.current);
      }
      answerTimeoutRef.current = window.setTimeout(async () => {
        if (!isActiveRef.current) {
          return;
        }
        if (currentQ < quiz.questions.length - 1) {
          setCurrentQ((q) => q + 1);
          setSelected(null);
          setShowStats(false);
          setLastExplanation(null);
        } else {
          await completeAndFinish(nextScore, nextCorrectCount);
        }
      }, 3000);
    } catch {
      setApiError("Не удалось отправить ответ. Попробуйте снова.");
      setLastFailedAnswer(index);
      pushToast("Не удалось отправить ответ. Попробуйте снова.", "error");
      hapticNotify("error");
    }
  };

  const handleSubscriptionGate = async () => {
    if (!quiz || !question || !isSubscriptionGate || isCheckingSub) {
      return;
    }
    hapticSelection();
    setTimedOut(false);
    setIsCheckingSub(true);
    setCheckingIndex(null);
    setSubError(false);
    setApiError(null);
    setLastFailedAnswer(null);

    try {
      const result = await api.checkSubscription(quiz.id);
      if (!result?.subscribed) {
        setSubError(true);
        setApiError("Подписка не найдена. Попробуйте снова.");
        pushToast("Подписка не найдена. Попробуйте снова.", "warning");
        hapticNotify("warning");
        return;
      }
      hapticNotify("success");
      setApiError(null);
      if (currentQ < quiz.questions.length - 1) {
        setCurrentQ((q) => q + 1);
      } else {
        await completeAndFinish(score, correctCount);
      }
    } catch {
      setSubError(true);
      setApiError("Не удалось проверить подписку");
      pushToast("Не удалось проверить подписку", "error");
      hapticNotify("error");
    } finally {
      setIsCheckingSub(false);
      setCheckingIndex(null);
    }
  };

  const retryAnswer = () => {
    if (lastFailedAnswer === null) {
      return;
    }
    handleAnswer(lastFailedAnswer);
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center p-6 bg-background">
        <div className="p-8 rounded-[2.5rem] bg-card/60 dark:bg-slate-900/70 border border-black/5 dark:border-white/10 backdrop-blur-lg text-center space-y-3">
          <div className="text-lg font-black">Загрузка квиза...</div>
          <div className="text-xs text-muted-foreground font-medium">
            Подготавливаем вопросы
          </div>
        </div>
      </div>
    );
  }

  if (!quizId) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center p-6 bg-background">
        <div className="p-8 rounded-[2.5rem] bg-card/60 dark:bg-slate-900/70 border border-black/5 dark:border-white/10 backdrop-blur-lg text-center space-y-3">
          <div className="text-lg font-black">Квиз не выбран</div>
          <div className="text-xs text-muted-foreground font-medium">
            Откройте квиз по ссылке
          </div>
        </div>
      </div>
    );
  }

  if (expired) {
    if (openedFromStartParam) {
      return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md">
          <div className="w-full max-w-md p-10 rounded-[2.5rem] bg-card/80 dark:bg-slate-900/80 border border-white/10 text-center space-y-6 shadow-2xl">
            <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Timer size={40} />
            </div>
            <div className="space-y-2">
              <h3 className="text-3xl font-black">Квиз завершен</h3>
              <p className="text-sm text-muted-foreground font-medium">
                Этот квиз больше не доступен
              </p>
            </div>
            <Button
              onClick={() => {
                if (closeMiniApp.isAvailable()) {
                  closeMiniApp();
                } else {
                  closePlatformApp();
                }
              }}
              className="w-full py-6 text-lg"
            >
              Закрыть
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center p-6 bg-background">
        <div className="p-10 rounded-[2.5rem] bg-card/60 dark:bg-slate-900/70 border border-black/5 dark:border-white/10 backdrop-blur-lg text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Timer size={32} />
          </div>
          <div className="space-y-2">
            <h3 className="text-3xl font-black">Квиз завершен</h3>
            <p className="text-sm text-muted-foreground font-medium">
              Этот квиз больше не доступен
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center p-6 bg-background">
        <div className="p-8 rounded-[2.5rem] bg-card/60 dark:bg-slate-900/70 border border-black/5 dark:border-white/10 backdrop-blur-lg text-center space-y-4">
          <div className="text-lg font-black">{loadError}</div>
          <div className="text-xs text-muted-foreground font-medium">
            Попробуйте перезагрузить страницу
          </div>
          <Button onClick={fetchQuiz} variant="glass" className="w-full">
            <RotateCcw className="mr-2 w-4 h-4" /> Повторить
          </Button>
        </div>
      </div>
    );
  }

  if (quiz && !canStart) {
    const effectivePlayers = Math.max(playersCount ?? 0, rankInfo?.totalPlayers ?? 0);
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center p-6 bg-background overflow-hidden relative">
        <div className="absolute inset-0 fx-blob bg-primary/5 blur-[100px] pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative w-full max-w-md p-8 md:p-12 rounded-[2.5rem] bg-card/60 dark:bg-slate-900/70 border border-black/5 dark:border-white/10 backdrop-blur-xl shadow-2xl text-center space-y-8"
        >
          <div className="flex justify-center">
            <motion.div
              animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-primary/15 flex items-center justify-center"
            >
              <Loader2 className="w-12 h-12 md:w-14 md:h-14 text-primary animate-spin" />
            </motion.div>
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl md:text-3xl font-black text-foreground">
              Ожидание ведущего
            </h2>
            <p className="text-sm md:text-base text-muted-foreground font-medium">
              Ведущий скоро запустит квиз. Все участники стартуют одновременно.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-transparent">
            <Users className="w-5 h-5 text-primary" />
            <span className="text-lg font-black text-foreground">
              {effectivePlayers > 0 ? effectivePlayers : "—"} участников
            </span>
          </div>
          <div className="flex gap-2 justify-center">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-primary/60"
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  if (!quiz || !question) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center p-6 bg-background">
        <div className="p-8 rounded-[2.5rem] bg-card/60 dark:bg-slate-900/70 border border-black/5 dark:border-white/10 backdrop-blur-lg text-center space-y-3">
          <div className="text-lg font-black">Квиз не найден</div>
          <div className="text-xs text-muted-foreground font-medium">
            Проверьте ссылку и попробуйте снова
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fx-scroll h-[100dvh] w-full flex items-start justify-start p-4 md:p-8 bg-background overflow-y-auto overscroll-y-contain">
      <AnimatePresence>
        {showConfetti && (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <motion.div
                key={i}
                initial={{ y: 0, x: 0, scale: 1 }}
                animate={{
                  y: -200 - Math.random() * 200,
                  x: (Math.random() - 0.5) * 300,
                  scale: 0,
                  rotate: Math.random() * 360,
                }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="absolute w-3 h-3 rounded-full"
                style={{ backgroundColor: ["#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7"][i % 6] }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start py-8">
        <div className="lg:col-span-8 space-y-6 order-1">
          <div className="flex justify-between items-end px-2">
            <div className="space-y-1 flex items-center gap-3">
              <div>
                <div className="text-primary font-black text-4xl md:text-5xl">
                  0{currentQ + 1}
                </div>
                <div className="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-50 text-foreground">
                  Вопрос из 0{quiz.questions.length}
                </div>
              </div>
              {teamIndex !== null && (
                <div className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold border",
                  teamColors[teamIndex % teamColors.length]
                )}>
                  Команда {teamIndex + 1}
                </div>
              )}
            </div>
            {!question.requiresSubscription && (
              <div className="flex items-end">
                <SocketStatusBadge />
              </div>
            )}
          </div>

          <div className="fx-backdrop relative p-6 md:p-12 rounded-[2rem] md:rounded-[2.5rem] bg-card/60 dark:bg-slate-900/70 border border-black/5 dark:border-white/10 dark:shadow-2xl backdrop-blur-lg overflow-hidden shadow-2xl">
            <div className="fx-blob absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none" />

            <div className="mb-6 md:mb-10 relative z-10 space-y-4">
              {!question.requiresSubscription && (
                <div className="flex items-center justify-between gap-4">
                  <div className="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-40 text-foreground">
                    Время на вопрос
                  </div>
                  <div
                    className={cn(
                      "shrink-0 w-fit text-xl md:text-3xl font-black font-mono px-4 py-2 rounded-xl md:rounded-2xl border-2 transition-colors",
                      timeLeft < 5
                        ? "border-red-500 text-red-500 animate-pulse"
                        : "border-primary/20 text-primary",
                    )}
                  >
                    {timeLeft}s
                  </div>
                  {quiz?.enableStreaks && streak >= 2 && (
                    <motion.div
                      key={`streak-${streak}`}
                      initial={{ scale: 0, rotate: -10 }}
                      animate={{ scale: 1, rotate: 0 }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/20 border border-orange-500/30"
                    >
                      <span className="text-lg">🔥</span>
                      <span className="text-orange-400 font-black text-sm">{streak}x</span>
                    </motion.div>
                  )}
                </div>
              )}
              <div className="relative">
                <h2
                  ref={questionScrollRef}
                  onScroll={updateQuestionFade}
                  className={cn(
                    questionSizeClass,
                    questionLeadingClass,
                    "font-bold text-foreground dark:text-white break-words hyphens-auto text-pretty max-h-[45vh] md:max-h-none overflow-y-auto pr-2",
                  )}
                >
                  {question.question}
                </h2>
                {showQuestionFade && (
                  <div className="pointer-events-none absolute bottom-0 left-0 right-2 h-6 bg-gradient-to-t from-background/60 to-transparent md:hidden" />
                )}
              </div>
            </div>

            {timedOut && (
              <div className="mb-6 px-4 py-2 rounded-xl bg-red-500/10 text-red-500 text-sm font-bold text-center">
                Время вышло — переходим дальше
              </div>
            )}

            {question.requiresSubscription && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 p-6 rounded-2xl bg-primary/5 border border-primary/20 flex flex-col items-center text-center gap-4 relative z-10"
              >
                <div className="p-4 rounded-full bg-primary/10 text-primary">
                  <ShieldCheck size={40} className="animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-black text-xl">Проверка подписки</h4>
                  <p className="text-sm text-muted-foreground font-medium">
                    Чтобы открыть этот вопрос и продолжить игру, подпишитесь на
                    наш официальный канал.
                  </p>
                </div>
                <a
                  href={question.channelUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-primary text-white font-bold hover:brightness-110 transition-all shadow-lg shadow-primary/20"
                >
                  Перейти в канал <ExternalLink size={18} />
                </a>
                {isSubscriptionGate && (
                  <Button
                    variant="glass"
                    onClick={handleSubscriptionGate}
                    disabled={isCheckingSub}
                    className="w-full"
                  >
                    {isCheckingSub ? (
                      <RotateCcw className="mr-2 w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="mr-2 w-4 h-4" />
                    )}
                    Проверить подписку и продолжить
                  </Button>
                )}
                {subError && (
                  <p className="text-xs font-bold text-red-500 flex items-center gap-1">
                    <XCircle size={14} /> Вы еще не подписались! Попробуйте снова
                    через 5 сек.
                  </p>
                )}
              </motion.div>
            )}

            {question.media && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-8 rounded-2xl overflow-hidden border border-white/10 shadow-2xl relative group"
              >
                {question.media.type === "image" ? (
                  <img
                    src={question.media.url}
                    alt="Question"
                    loading="lazy"
                    decoding="async"
                    className="w-full h-48 md:h-64 object-cover"
                  />
                ) : (
                  <video
                    src={question.media.url}
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-48 md:h-64 object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </motion.div>
            )}

            {quiz?.enablePowerUps && selected === null && (
              <div className="flex justify-center gap-3 mb-4">
                {[
                  { id: "double", icon: "⭐", label: "2x", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
                  { id: "freeze", icon: "❄️", label: "+5с", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
                  { id: "shield", icon: "🛡️", label: "Щит", color: "text-green-400 bg-green-500/10 border-green-500/20" },
                ]
                  .filter((p) => !usedPowerUps.has(p.id))
                  .map((p) => (
                    <motion.button
                      key={p.id}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        if (p.id === "freeze" && activePowerUp !== p.id) {
                          setTimeLeft((t) => t + 5);
                        }
                        setActivePowerUp(activePowerUp === p.id ? null : p.id);
                        if (p.id !== activePowerUp) {
                          setUsedPowerUps(prev => new Set(prev).add(p.id));
                        }
                      }}
                      className={`flex flex-col items-center gap-1 p-3 rounded-2xl border transition-all ${p.color} ${
                        activePowerUp === p.id ? "ring-2 ring-primary scale-105" : ""
                      }`}
                    >
                      <span className="text-xl">{p.icon}</span>
                      <span className="text-[10px] font-bold">{p.label}</span>
                    </motion.button>
                  ))}
              </div>
            )}

            {question.questionType === "word_cloud" ? (
              <div className="space-y-4 relative z-10">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={wordInput}
                    onChange={(e) => setWordInput(e.target.value.slice(0, 30))}
                    placeholder="Введите слово..."
                    className="flex-1 p-3 rounded-xl bg-white/5 border border-white/10 text-sm outline-none focus:border-primary/50 text-foreground"
                    maxLength={30}
                  />
                  <Button
                    onClick={() => {
                      if (wordInput.trim() && quiz) {
                        const sock = getSocket();
                        sock.emit("wordcloud:submit", {
                          quizId: quiz.id,
                          questionIndex: currentQ,
                          word: wordInput.trim(),
                        });
                        setWordInput("");
                      }
                    }}
                    disabled={!wordInput.trim()}
                    size="sm"
                  >
                    Отправить
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 justify-center p-4 rounded-2xl bg-white/5 border border-white/10 min-h-[120px]">
                  {Object.entries(wordCounts).map(([word, count]) => (
                    <span
                      key={word}
                      className="text-primary font-bold transition-all"
                      style={{ fontSize: `${Math.min(12 + count * 4, 32)}px` }}
                    >
                      {word}
                    </span>
                  ))}
                  {Object.keys(wordCounts).length === 0 && (
                    <span className="text-xs text-muted-foreground font-medium">
                      Слова появятся здесь
                    </span>
                  )}
                </div>
              </div>
            ) : question.options.length > 0 ? (
              <motion.div animate={showShake ? { x: [-8, 8, -8, 8, 0] } : {}} transition={{ duration: 0.4 }}>
              {question.questionType === "true_false" ? (
                <div className="grid grid-cols-2 gap-4 relative z-10">
                  {(question.options as string[]).slice(0, 2).map((option, idx) => {
                    const isSelected = selected === idx;
                    const isCorrectOption =
                      showStats && correctIndex !== null && idx === correctIndex;

                    return (
                      <motion.button
                        key={idx}
                        whileTap={{ scale: 0.95 }}
                        onClick={() =>
                          selected === null && !isCheckingSub && handleAnswer(idx)
                        }
                        disabled={selected !== null}
                        className={cn(
                          "p-6 rounded-2xl text-lg font-black transition-all border-2",
                          selected === null
                            ? idx === 0
                              ? "bg-green-500/10 border-green-500/30 hover:border-green-500/60 text-green-400"
                              : "bg-red-500/10 border-red-500/30 hover:border-red-500/60 text-red-400"
                            : isCorrectOption
                              ? "bg-green-500/20 border-green-500"
                              : isSelected
                                ? "bg-red-500/20 border-red-500"
                                : "opacity-40",
                        )}
                      >
                        {option}
                      </motion.button>
                    );
                  })}
                </div>
              ) : (
              <div className="grid gap-3 md:gap-4 relative z-10">
                {question.options.map((opt, idx) => {
                  const isSelected = selected === idx;
                  const isCorrect =
                    showStats && correctIndex !== null && idx === correctIndex;
                  const stat = stats[idx] ?? 0;
                  const widthValue = showStats ? stat : 0;

                  return (
                    <button
                      key={idx}
                      onClick={() =>
                        selected === null && !isCheckingSub && handleAnswer(idx)
                      }
                      className={cn(
                        "group relative p-4 md:p-6 rounded-xl md:rounded-2xl text-left transition-all duration-500 overflow-hidden border-2",
                        selected === null
                          ? "bg-black/5 dark:bg-gradient-to-r dark:from-slate-800/85 dark:to-slate-900/85 border-transparent dark:border-white/25 hover:border-primary/50 hover:bg-black/10 dark:hover:from-slate-700/90 dark:hover:to-slate-900/90 dark:hover:border-primary/70 dark:ring-1 dark:ring-white/20 dark:shadow-[0_10px_25px_rgba(0,0,0,0.6)]"
                          : isCorrect
                            ? "bg-green-500/20 border-green-500/50 text-green-600 dark:text-green-400"
                            : isSelected
                              ? "bg-red-500/20 border-red-500/50 text-red-600 dark:text-red-400"
                              : "bg-black/5 dark:bg-slate-800/70 border-transparent dark:border-white/15 opacity-50",
                      )}
                    >
                      <div
                        className={cn(
                          "absolute inset-y-0 left-0 opacity-10 dark:opacity-30 transition-[width] duration-500",
                          isCorrect ? "bg-green-500" : "bg-primary",
                        )}
                        style={{ width: `${widthValue}%` }}
                      />

                      <div className="flex justify-between items-center relative z-10">
                        <div className="flex items-center gap-3 md:gap-4">
                          <span
                            className={cn(
                              "w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center font-black text-xs md:text-sm border-2 transition-colors",
                              selected === null
                                ? "border-black/10 dark:border-white/30 group-hover:border-primary/50 dark:bg-white/10"
                                : "border-current",
                            )}
                          >
                            {isCheckingSub && checkingIndex === idx ? (
                              <RotateCcw className="animate-spin" size={16} />
                            ) : (
                              String.fromCharCode(65 + idx)
                            )}
                          </span>
                          <span className="text-base md:text-lg font-bold text-foreground dark:text-white">
                            {opt}
                          </span>
                        </div>

                        {showStats && (
                          <span className="font-black text-lg md:text-xl opacity-80 text-foreground dark:text-white">
                            {stat}%
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              )}
              </motion.div>
            ) : null}

            <AnimatePresence>
              {lastExplanation && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-3 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20"
                >
                  <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1">Объяснение</div>
                  <div className="text-sm text-white/80">{lastExplanation}</div>
                </motion.div>
              )}
            </AnimatePresence>

            {apiError && lastFailedAnswer !== null && selected === null && (
              <div className="mt-6 flex items-center justify-center">
                <Button variant="glass" onClick={retryAnswer} className="w-full">
                  <RotateCcw className="mr-2 w-4 h-4" /> Повторить отправку ответа
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6 order-2 lg:order-2">
          {!quiz?.selfPaced && (
          <div className="p-6 rounded-[2rem] bg-card/50 dark:bg-white/5 border border-black/5 dark:border-white/10 backdrop-blur-md">
            <h3 className="text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-2 text-foreground">
              <Activity size={16} className="text-primary" /> Прямой эфир
            </h3>
            <div className="space-y-4">
              {liveFeed.length === 0 && (
                <div className="p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-transparent text-xs text-muted-foreground font-medium">
                  События появятся после подключения к live-ленте
                </div>
              )}
              {liveFeed.map((item, i) => {
                const isCorrect = item.action === "correct";
                const actionText = isCorrect ? "ответил верно!" : "ошибся :(";
                return (
                  <div
                    key={`${item.playerName}-${item.timestamp}-${i}`}
                    className="flex items-start gap-3 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-transparent"
                  >
                    {item.avatarUrl ? (
                      <img
                        src={item.avatarUrl}
                        alt={item.playerName}
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 shrink-0" />
                    )}
                    <div className="text-sm">
                      <span className="font-bold block text-foreground">
                        {item.playerName}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-medium",
                          isCorrect
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400",
                        )}
                      >
                        {actionText}
                      </span>
                    </div>
                    <span className="ml-auto text-[10px] font-bold opacity-30 uppercase text-foreground">
                      {item.questionIndex + 1}в
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {!quiz?.selfPaced && (
          <div className="p-6 rounded-[2rem] bg-gradient-to-br from-primary/10 to-purple-600/10 dark:from-primary/20 dark:to-purple-600/20 border border-primary/20 backdrop-blur-md">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 rounded-2xl bg-primary text-white shadow-lg shadow-primary/40">
                <Trophy size={24} />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest opacity-60 text-foreground">
                  Ваш рейтинг
                </div>
                <div className="text-2xl font-black text-foreground">
                  {effectiveTotal > 0 && rankInfo
                    ? `#${rankInfo.rank}`
                    : "—"}
                  <span className="text-sm opacity-40">
                    {effectiveTotal > 0 ? ` из ${effectiveTotal}` : " из —"}
                  </span>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 text-foreground mt-1">
                  Участников: {effectiveTotal > 0 ? effectiveTotal : "—"}
                </div>
              </div>
            </div>
            <div className="h-2 w-full bg-black/10 dark:bg-black/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                style={{ width: `${rankProgress}%` }}
              />
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuizView;
