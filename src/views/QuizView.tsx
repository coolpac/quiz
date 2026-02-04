import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
  Timer,
  Trophy,
  XCircle,
} from "lucide-react";
import { closeMiniApp } from "@telegram-apps/sdk";
import { api } from "../api";
import { connectSocket, releaseSocket } from "../socket";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/cn";
import { useToast, type ToastVariant } from "../components/Toast";
import type { LiveFeedItem, QuizData, QuizResults } from "../types/quiz";

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
  const [liveFeed, setLiveFeed] = useState<LiveFeedItem[]>([]);
  const [playersCount, setPlayersCount] = useState<number | null>(null);
  const [isFirstAttempt, setIsFirstAttempt] = useState(true);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const currentQRef = useRef(0);
  const isActiveRef = useRef(true);
  const lastSocketToastRef = useRef<string | null>(null);
  const autoSkipTimerRef = useRef<number | null>(null);
  const completingRef = useRef(false);
  const { pushToast } = useToast();

  useEffect(() => {
    isActiveRef.current = true;
    return () => {
      isActiveRef.current = false;
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

      setQuiz(data.quiz);
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

  const completeAndFinish = React.useCallback(
    async (finalScore: number, finalCorrectCount: number) => {
      if (!quiz) {
        return;
      }
      if (completingRef.current) {
        return;
      }
      completingRef.current = true;
      try {
        const completeData = await api.completeQuiz(quiz.id);
        onFinish({
          score: finalScore,
          correctCount: finalCorrectCount,
          totalQuestions: quiz.questions.length,
          isFirstAttempt: completeData.isFirstAttempt ?? isFirstAttempt,
          quizId: quiz.id,
        });
      } catch {
        onFinish({
          score: finalScore,
          correctCount: finalCorrectCount,
          totalQuestions: quiz.questions.length,
          isFirstAttempt,
          quizId: quiz.id,
        });
      }
    },
    [isFirstAttempt, onFinish, quiz],
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

    const handleConnect = () => {
      showSocketToast("Соединение восстановлено", "success");
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
      showSocketToast(
        "Соединение потеряно. Идет переподключение...",
        "warning",
      );
    };

    const handleConnectError = () => {
      showSocketToast("Не удалось подключиться к серверу", "error");
    };

    const handleReconnectAttempt = () => {
      showSocketToast("Переподключение...", "warning");
    };

    const handleReconnectFailed = () => {
      showSocketToast("Не удалось восстановить соединение", "error");
    };

    const handlePlayerAnswered = (payload: {
      playerName: string;
      action: "correct" | "wrong";
      questionIndex: number;
      timestamp: string | Date;
    }) => {
      setLiveFeed((prev) => {
        const nextItem: LiveFeedItem = {
          playerName: payload.playerName,
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
    socket.on("players:count", handlePlayersCount);
    socket.on("quiz:expired", handleQuizExpired);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);
    socket.io.on("reconnect_failed", handleReconnectFailed);

    return () => {
      socket.off("player:answered", handlePlayerAnswered);
      socket.off("players:answered_batch", handlePlayerAnsweredBatch);
      socket.off("stats:updated", handleStatsUpdated);
      socket.off("leaderboard:updated", handleLeaderboardUpdated);
      socket.off("players:count", handlePlayersCount);
      socket.off("quiz:expired", handleQuizExpired);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
      socket.io.off("reconnect_failed", handleReconnectFailed);
      releaseSocket();
    };
  }, [quiz?.id, pushToast, refreshLeaderboard]);

  useEffect(() => {
    if (!quiz) {
      return;
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
  }, [currentQ, quiz]);

  const question = quiz?.questions[currentQ];
  useEffect(() => {
    currentQRef.current = currentQ;
  }, [currentQ]);
  const rankProgress =
    rankInfo && rankInfo.totalPlayers > 0
      ? Math.max(
          5,
          Math.round(
            ((rankInfo.totalPlayers - rankInfo.rank + 1) /
              rankInfo.totalPlayers) *
              100,
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
          return;
        }
        setApiError(null);
        setLastFailedAnswer(null);
      } catch {
        setSubError(true);
        setApiError("Не удалось проверить подписку");
        setLastFailedAnswer(index);
        pushToast("Не удалось проверить подписку", "error");
        return;
      } finally {
        setIsCheckingSub(false);
        setCheckingIndex(null);
      }
    }

    try {
      const response = await api.submitAnswer(
        quiz.id,
        currentQ,
        index,
        timeLeft,
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
      const nextScore = score + answerScore;
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

      setTimeout(async () => {
        if (currentQ < quiz.questions.length - 1) {
          setCurrentQ((q) => q + 1);
          setSelected(null);
          setShowStats(false);
        } else {
          await completeAndFinish(nextScore, nextCorrectCount);
        }
      }, 3000);
    } catch {
      setApiError("Не удалось отправить ответ. Попробуйте снова.");
      setLastFailedAnswer(index);
      pushToast("Не удалось отправить ответ. Попробуйте снова.", "error");
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
            Откройте квиз по ссылке бота
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
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4 md:p-8 bg-background overflow-y-auto">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start py-8">
        <div className="lg:col-span-8 space-y-6 order-1">
          <div className="flex justify-between items-end px-2">
            <div className="space-y-1">
              <div className="text-primary font-black text-4xl md:text-5xl">
                0{currentQ + 1}
              </div>
              <div className="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-50 text-foreground">
                Вопрос из 0{quiz.questions.length}
              </div>
            </div>
            {!question.requiresSubscription && (
              <div className="flex flex-col items-end gap-2">
                <div
                  className={cn(
                    "text-2xl md:text-3xl font-black font-mono px-4 py-2 rounded-2xl border-2 transition-colors",
                    timeLeft < 5
                      ? "border-red-500 text-red-500 animate-pulse"
                      : "border-primary/20 text-primary",
                  )}
                >
                  {timeLeft}s
                </div>
              </div>
            )}
          </div>

          <div className="relative p-6 md:p-12 rounded-[2rem] md:rounded-[2.5rem] bg-card/60 dark:bg-slate-900/70 border border-black/5 dark:border-white/10 dark:shadow-2xl backdrop-blur-lg overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none" />

            <h2 className="text-2xl md:text-4xl font-bold leading-tight mb-8 md:mb-12 relative z-10 text-foreground dark:text-white">
              {question.question}
            </h2>

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
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 shrink-0" />
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
                  {rankInfo ? `#${rankInfo.rank}` : "—"}
                  <span className="text-sm opacity-40">
                    {rankInfo ? ` из ${rankInfo.totalPlayers}` : " из —"}
                  </span>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 text-foreground mt-1">
                  Игроков в сети: {playersCount ?? "—"}
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
        </div>
      </div>
    </div>
  );
};

export default QuizView;
