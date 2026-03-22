import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Crown,
  Info,
  RotateCcw,
  Share2,
  Star,
  TrendingUp,
} from "lucide-react";
import { shareURL } from "@telegram-apps/sdk";
import { api } from "../api";
import { connectSocket, releaseSocket } from "../socket";
import { Badge } from "../components/ui/Badge";
import SocketStatusBadge from "../components/SocketStatusBadge";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/cn";
import { useToast, type ToastVariant } from "../components/Toast";
import { hapticSelection, sharePlatformURL } from "../lib/telegramUi";
import type { LeaderboardPlayer, QuizResults } from "../types/quiz";

type LeaderboardItemProps = {
  player: LeaderboardPlayer;
  isMe: boolean;
};

const LeaderboardItem = React.memo(({ player, isMe }: LeaderboardItemProps) => (
  <div
    className={cn(
      "flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl md:rounded-2xl transition-all",
      isMe
        ? "bg-primary/10 border border-primary/20"
        : "bg-black/5 dark:bg-white/5 border border-transparent",
    )}
  >
    <div
      className={cn(
        "w-7 h-7 md:w-8 md:h-8 rounded-lg md:rounded-xl flex items-center justify-center font-black text-[10px] md:text-xs",
        isMe ? "bg-primary text-white" : "bg-black/10 dark:bg-white/10",
      )}
    >
      {player.rank}
    </div>
    <div className="flex-1 min-w-0">
      <div className={cn("font-bold text-xs md:text-sm truncate", isMe && "text-primary")}>
        {player.name}
      </div>
      <div className="text-[8px] md:text-[10px] font-bold uppercase opacity-40">
        {player.inProgress ? "В процессе" : "Top Player"}
      </div>
    </div>
    <div className="font-black text-xs md:text-sm">
      {player.inProgress ? `${player.score}…` : player.score}
    </div>
  </div>
));

type ResultViewProps = {
  results: QuizResults;
  onRestart: () => void;
};

const ResultView = ({ results, onRestart }: ResultViewProps) => {
  const {
    score,
    correctCount,
    totalQuestions,
    isFirstAttempt,
    quizId,
    previousCorrectCount,
    previousTotalQuestions,
  } = results;
  const [leaderboard, setLeaderboard] = useState<{
    players: LeaderboardPlayer[];
    myRank: number;
    totalPlayers: number;
  }>({ players: [], myRank: 0, totalPlayers: 0 });
  const [playersOnline, setPlayersOnline] = useState<number | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const lastSocketToastRef = useRef<string | null>(null);
  const { pushToast } = useToast();
  const percentage = totalQuestions
    ? Math.round((correctCount / totalQuestions) * 100)
    : 0;

  const previousPercentage =
    previousTotalQuestions != null &&
    previousTotalQuestions > 0 &&
    previousCorrectCount != null
      ? Math.round((previousCorrectCount / previousTotalQuestions) * 100)
      : null;

  const progressDelta =
    previousPercentage != null ? percentage - previousPercentage : null;

  const progressHeights = useMemo(() => [40, 60, 45, 90, 65, 80, 100], []);

  const refreshLeaderboard = React.useCallback(async () => {
    if (!quizId) {
      return;
    }
    try {
      const data = await api.getLeaderboard(quizId);
      setLeaderboard({
        players: data.players ?? [],
        myRank: data.myRank ?? 0,
        totalPlayers: data.totalPlayers ?? 0,
      });
      setResultError(null);
    } catch {
      setLeaderboard({ players: [], myRank: 0, totalPlayers: 0 });
      setResultError("Не удалось загрузить таблицу лидеров");
      pushToast("Не удалось загрузить таблицу лидеров", "error");
    }
  }, [quizId, pushToast]);

  useEffect(() => {
    refreshLeaderboard();
  }, [refreshLeaderboard]);

  useEffect(() => {
    if (!quizId) {
      return;
    }

    const socket = connectSocket();

    socket.emit("quiz:join", { quizId });

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
      socket.emit("quiz:join", { quizId });
      refreshLeaderboard();
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

    const handleLeaderboardUpdated = (payload: {
      rank: number;
      totalPlayers: number;
      topPlayers?: LeaderboardPlayer[];
    }) => {
      setLeaderboard((prev) => ({
        players: payload.topPlayers ?? prev.players,
        myRank: payload.rank ?? prev.myRank,
        totalPlayers: payload.totalPlayers ?? prev.totalPlayers,
      }));
    };

    const handlePlayersCount = (payload: { count: number }) => {
      setPlayersOnline(payload.count);
    };

    socket.on("leaderboard:updated", handleLeaderboardUpdated);
    socket.on("players:count", handlePlayersCount);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.io.on("reconnect_failed", handleReconnectFailed);

    return () => {
      clearDisconnectToast();
      socket.off("leaderboard:updated", handleLeaderboardUpdated);
      socket.off("players:count", handlePlayersCount);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.io.off("reconnect_failed", handleReconnectFailed);
      releaseSocket();
    };
  }, [quizId, pushToast, refreshLeaderboard]);

  return (
    <div className="fx-scroll h-[100dvh] w-full flex items-start justify-start p-4 md:p-8 bg-background relative overflow-x-hidden overflow-y-auto overscroll-y-contain">
      <div className="fx-blob absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-primary/20 dark:bg-primary/30 rounded-full blur-[120px] animate-pulse pointer-events-none" />
      <div className="fx-blob absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-5xl z-10 py-12 mx-auto"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-center">
          <div className="lg:col-span-7">
            <div className="fx-backdrop relative p-6 md:p-12 rounded-[2.5rem] md:rounded-[3rem] bg-card/60 dark:bg-slate-900/80 border border-black/5 dark:border-white/10 backdrop-blur-lg shadow-2xl overflow-hidden">
              <div className="absolute top-0 right-0 p-6 md:p-8">
                <Crown className="w-10 h-10 md:w-12 md:h-12 text-yellow-500 opacity-20 rotate-12" />
              </div>

              <div className="space-y-6 md:space-y-8 relative z-10">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Badge
                      variant="success"
                      className="px-4 py-1.5 text-[10px] md:text-sm uppercase tracking-widest"
                    >
                      Тест завершен
                    </Badge>
                    <SocketStatusBadge className="shrink-0" />
                  </div>
                  <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-foreground dark:text-white leading-tight">
                    Твой <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-purple-400 to-pink-500">
                      Результат
                    </span>
                  </h2>
                </div>

                {!isFirstAttempt && (
                  <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-primary/20 text-primary">
                      <Info size={18} />
                    </div>
                    <div className="text-xs md:text-sm font-bold text-foreground">
                      Повторное прохождение — результат не учитывается в рейтинге
                    </div>
                  </div>
                )}

                {results.enablePodium && leaderboard.players.length >= 3 && (
                  <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex items-end justify-center gap-3 mb-8 h-48"
                  >
                    {/* 2nd place — left */}
                    <div className="flex flex-col items-center">
                      <div className="text-xs font-bold truncate max-w-[70px] text-white/70">{leaderboard.players[1]?.name}</div>
                      <div className="text-[10px] text-white/40 font-bold">{leaderboard.players[1]?.score}</div>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 100 }}
                        transition={{ delay: 0.6, duration: 0.5 }}
                        className="w-20 bg-gradient-to-t from-gray-500/20 to-gray-400/10 rounded-t-xl flex items-start justify-center pt-3 border-t border-x border-white/10"
                      >
                        <span className="text-2xl">🥈</span>
                      </motion.div>
                    </div>
                    {/* 1st place — center */}
                    <div className="flex flex-col items-center">
                      <div className="text-sm font-black truncate max-w-[80px]">{leaderboard.players[0]?.name}</div>
                      <div className="text-[10px] text-white/50 font-bold">{leaderboard.players[0]?.score}</div>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 140 }}
                        transition={{ delay: 0.4, duration: 0.6 }}
                        className="w-24 bg-gradient-to-t from-yellow-500/20 to-yellow-400/10 rounded-t-xl flex items-start justify-center pt-3 border-t border-x border-yellow-500/20"
                      >
                        <span className="text-3xl">🥇</span>
                      </motion.div>
                    </div>
                    {/* 3rd place — right */}
                    <div className="flex flex-col items-center">
                      <div className="text-xs font-bold truncate max-w-[70px] text-white/70">{leaderboard.players[2]?.name}</div>
                      <div className="text-[10px] text-white/40 font-bold">{leaderboard.players[2]?.score}</div>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 70 }}
                        transition={{ delay: 0.8, duration: 0.4 }}
                        className="w-20 bg-gradient-to-t from-orange-700/20 to-orange-600/10 rounded-t-xl flex items-start justify-center pt-3 border-t border-x border-orange-500/20"
                      >
                        <span className="text-2xl">🥉</span>
                      </motion.div>
                    </div>
                  </motion.div>
                )}

                <div className="flex items-end gap-3 md:gap-4">
                  <div className="text-7xl md:text-8xl font-black tracking-tighter text-primary">
                    {score}
                  </div>
                  <div className="text-sm md:text-xl font-bold opacity-40 mb-3 md:mb-4 uppercase tracking-widest">
                    Очков
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  <div className="p-4 md:p-6 rounded-2xl md:rounded-3xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                    <div className="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-40 mb-2">
                      Верных ответов
                    </div>
                    <div className="text-2xl md:text-3xl font-black text-foreground dark:text-white">
                      {correctCount}{" "}
                      <span className="text-sm md:text-lg opacity-30">
                        / {totalQuestions}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 md:p-6 rounded-2xl md:rounded-3xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                    <div className="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-40 mb-2">
                      Точность
                    </div>
                    <div className="text-2xl md:text-3xl font-black text-foreground dark:text-white">
                      {percentage}%
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 md:gap-4 pt-4">
                  <Button
                    onClick={() => {
                      hapticSelection();
                      onRestart();
                    }}
                    size="lg"
                    className="flex-1 bg-gradient-to-r from-primary to-purple-600 w-full"
                  >
                    <RotateCcw className="mr-2 w-5 h-5" /> Еще раз
                  </Button>
                  <Button
                    variant="glass"
                    size="lg"
                    className="flex-1 text-foreground dark:text-white w-full"
                    onClick={() => {
                      hapticSelection();
                      const shareLink = quizId
                        ? `${window.location.origin}?quizId=${quizId}`
                        : window.location.href;
                      // Try Max first, then Telegram
                      if (!sharePlatformURL(shareLink, "Присоединяйся к квизу!")) {
                        if (shareURL.isAvailable()) {
                          shareURL(shareLink, "Присоединяйся к квизу!");
                        }
                      }
                    }}
                  >
                    <Share2 className="mr-2 w-5 h-5" /> Поделиться
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] bg-card/40 dark:bg-white/5 border border-black/5 dark:border-white/10 backdrop-blur-md">
              <h3 className="text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-2 text-foreground dark:text-white">
                <Star size={16} className="text-yellow-500" /> Таблица лидеров
              </h3>
              {leaderboard.totalPlayers > 0 && (
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-40 text-foreground dark:text-white mb-4">
                  Всего игроков: {leaderboard.totalPlayers} · Онлайн:{" "}
                  {playersOnline ?? "—"}
                </div>
              )}
              {resultError && (
                <div className="mb-4">
                  <Button
                    variant="glass"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      hapticSelection();
                      refreshLeaderboard();
                    }}
                  >
                    <RotateCcw className="mr-2 w-4 h-4" /> Обновить таблицу
                  </Button>
                </div>
              )}

              <div className="space-y-2 md:space-y-3">
                {leaderboard.players.length === 0 && (
                  <div className="p-4 rounded-xl md:rounded-2xl bg-black/5 dark:bg-white/5 border border-transparent text-xs text-muted-foreground font-medium">
                    Данные появятся после завершения квиза
                  </div>
                )}
                {leaderboard.players.map((player) => {
                  const isMe =
                    leaderboard.myRank === player.rank && player.rank !== 0;
                  return (
                    <LeaderboardItem
                      key={player.rank}
                      player={player}
                      isMe={isMe}
                    />
                  );
                })}
              </div>
            </div>

            <div className="p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] bg-gradient-to-br from-indigo-500/10 to-purple-600/10 border border-indigo-500/20 backdrop-blur-md">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 rounded-2xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/40">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 text-foreground dark:text-white">
                    Прогресс
                  </div>
                  <div
                    className={cn(
                      "text-lg md:text-xl font-black",
                      progressDelta != null && progressDelta > 0 && "text-green-600 dark:text-green-400",
                      progressDelta != null && progressDelta < 0 && "text-red-600 dark:text-red-400",
                      (progressDelta == null || progressDelta === 0) && "text-foreground dark:text-white",
                    )}
                  >
                    {progressDelta != null
                      ? progressDelta > 0
                        ? `+${progressDelta}% к прошлому разу`
                        : progressDelta < 0
                          ? `${progressDelta}% к прошлому разу`
                          : "Как в прошлый раз"
                      : "Пройди ещё раз — покажем прогресс"}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 h-8 items-end">
                {progressHeights.map((height, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-indigo-500/20 rounded-t-sm relative"
                  >
                    <div
                      className={cn(
                        "absolute bottom-0 inset-x-0 rounded-t-sm transition-[height] duration-500",
                        i === progressHeights.length - 1
                          ? "bg-indigo-500"
                          : "bg-indigo-500/40",
                      )}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {results.answersReview && results.answersReview.length > 0 && (
          <div className="mt-8 space-y-3 w-full max-w-lg mx-auto">
            <h3 className="text-lg font-black text-center">Разбор ответов</h3>
            {results.answersReview.map((a, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className={cn(
                  "p-4 rounded-2xl border text-left",
                  a.isCorrect
                    ? "bg-green-500/5 border-green-500/20"
                    : "bg-red-500/5 border-red-500/20"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-bold">{a.questionText}</div>
                  <span className="text-lg shrink-0">{a.isCorrect ? "✅" : "❌"}</span>
                </div>
                {!a.isCorrect && (
                  <div className="mt-2 text-xs space-y-1">
                    <div className="text-red-400">Ваш ответ: {a.options[a.playerAnswer]}</div>
                    <div className="text-green-400">Правильный: {a.options[a.correctAnswer]}</div>
                  </div>
                )}
                {a.explanation && (
                  <div className="mt-2 text-xs text-blue-400/80 italic">{a.explanation}</div>
                )}
                <div className="mt-1 text-[10px] text-white/30 font-bold">+{a.score} очков</div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ResultView;
