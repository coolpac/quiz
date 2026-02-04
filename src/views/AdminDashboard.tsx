import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  BarChart3,
  Copy,
  Crown,
  Eye,
  ExternalLink,
  LayoutDashboard,
  List,
  LogOut,
  PieChart,
  Play,
  Plus,
  QrCode,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../api";
import { connectSocket, releaseSocket } from "../socket";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/Toast";
import { cn } from "../lib/cn";
import type {
  AdminAnswerItem,
  LeaderboardPlayer,
  QuizData,
  SubscriptionLogItem,
} from "../types/quiz";

type AdminDashboardProps = {
  onExit: () => void;
  onCreateQuiz: () => void;
  quizId?: string | null;
};

type MyQuizItem = {
  id: string;
  title: string;
  category: string;
  questionsCount: number;
  attemptsCount: number;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
  isExpired: boolean;
  deepLink?: string | null;
  adminToken?: string | null;
};

type DashboardStats = {
  totalGames: number;
  activeQuizzes: number;
  totalPlayers: number;
  topQuizzes: Array<{
    title: string;
    plays: number;
    questionsCount: number;
  }>;
};

const AdminDashboard = ({ onExit, onCreateQuiz, quizId }: AdminDashboardProps) => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [livePlayers, setLivePlayers] = useState(0);
  const [showQR, setShowQR] = useState<string | null>(null);
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(quizId ?? null);
  const [myQuizzes, setMyQuizzes] = useState<MyQuizItem[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [subLog, setSubLog] = useState<SubscriptionLogItem[]>([]);
  const [adminAnswers, setAdminAnswers] = useState<AdminAnswerItem[]>([]);
  const [adminTopPlayers, setAdminTopPlayers] = useState<LeaderboardPlayer[]>([]);
  const [adminQuiz, setAdminQuiz] = useState<QuizData | null>(null);
  const [adminStatsByQuestion, setAdminStatsByQuestion] = useState<
    Record<number, number[]>
  >({});
  const [adminActiveQuestionIndex, setAdminActiveQuestionIndex] = useState(0);
  const [adminToken, setAdminToken] = useState("");
  const [adminTokenInput, setAdminTokenInput] = useState("");
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const { pushToast } = useToast();

  const adminCurrentQuestion = adminQuiz?.questions[adminActiveQuestionIndex];
  const adminQuestionStats =
    adminStatsByQuestion[adminActiveQuestionIndex] ?? [0, 0, 0, 0];
  const activeQuizMeta = useMemo(
    () => myQuizzes.find((quiz) => quiz.id === selectedQuizId) ?? null,
    [myQuizzes, selectedQuizId],
  );

  useEffect(() => {
    if (quizId) {
      setSelectedQuizId(quizId);
    }
  }, [quizId]);

  const refreshMyQuizzes = useCallback(() => {
    setLoadingQuizzes(true);
    return api
      .getMyQuizzes()
      .then((data) => {
        setMyQuizzes(data.quizzes ?? []);
      })
      .catch(() => {
        setMyQuizzes([]);
      })
      .finally(() => {
        setLoadingQuizzes(false);
      });
  }, []);

  useEffect(() => {
    void refreshMyQuizzes();
  }, [refreshMyQuizzes]);

  useEffect(() => {
    const handleRefresh = () => {
      void refreshMyQuizzes();
    };
    window.addEventListener("myQuizzesUpdated", handleRefresh as EventListener);
    return () => {
      window.removeEventListener("myQuizzesUpdated", handleRefresh as EventListener);
    };
  }, [refreshMyQuizzes]);

  useEffect(() => {
    if (!selectedQuizId) {
      setAdminToken("");
      setAdminTokenInput("");
      return;
    }
    try {
      const stored =
        window.localStorage.getItem(`adminToken:${selectedQuizId}`) ?? "";
      const fallback = activeQuizMeta?.adminToken ?? "";
      const next = stored || fallback;
      setAdminToken(next);
      setAdminTokenInput(next);
    } catch {
      setAdminToken("");
      setAdminTokenInput("");
    }
  }, [activeQuizMeta, selectedQuizId]);

  useEffect(() => {
    setAdminAnswers([]);
    setAdminTopPlayers([]);
    setAdminStatsByQuestion({});
    setAdminActiveQuestionIndex(0);
    setLivePlayers(0);
    setAdminQuiz(null);
    setAdminAuthError(null);
  }, [selectedQuizId]);

  const saveAdminToken = () => {
    const next = adminTokenInput.trim();
    setAdminToken(next);
    setAdminAuthError(null);
    if (!selectedQuizId) {
      return;
    }
    try {
      if (next) {
        window.localStorage.setItem(`adminToken:${selectedQuizId}`, next);
      } else {
        window.localStorage.removeItem(`adminToken:${selectedQuizId}`);
      }
    } catch {
      // ignore storage failures
    }
  };

  useEffect(() => {
    if (!selectedQuizId) {
      return;
    }

    api
      .getQuiz(selectedQuizId)
      .then((data) => {
        if (data?.quiz) {
          setAdminQuiz(data.quiz);
        }
      })
      .catch(() => {
        setAdminQuiz(null);
      });

    api
      .getStats(selectedQuizId)
      .then((data) => {
        const map: Record<number, number[]> = {};
        (data?.questions ?? []).forEach(
          (entry: { questionIndex: number; stats: number[] }) => {
            map[entry.questionIndex] = entry.stats ?? [0, 0, 0, 0];
          },
        );
        setAdminStatsByQuestion(map);
      })
      .catch(() => {
        setAdminStatsByQuestion({});
      });

    api
      .getLeaderboard(selectedQuizId)
      .then((data) => {
        setAdminTopPlayers(data.players ?? []);
      })
      .catch(() => {
        setAdminTopPlayers([]);
      });

    const socket = connectSocket();

    if (adminToken) {
      socket.emit("admin:join", { quizId: selectedQuizId, adminToken });
    }

    const handlePlayersCount = (payload: { count: number }) => {
      setLivePlayers(payload.count);
    };

    const handleAdminAnswer = (payload: {
      playerName: string;
      questionIndex: number;
      answerIndex: number;
      isCorrect: boolean;
      score: number;
      timestamp: string | Date;
    }) => {
      setAdminActiveQuestionIndex(payload.questionIndex);
      setAdminAnswers((prev) => {
        const nextItem: AdminAnswerItem = {
          playerName: payload.playerName,
          questionIndex: payload.questionIndex,
          answerIndex: payload.answerIndex,
          isCorrect: payload.isCorrect,
          score: payload.score,
          timestamp: new Date(payload.timestamp),
        };
        return [nextItem, ...prev].slice(0, 8);
      });
    };

    const handleStatsUpdated = (payload: {
      questionIndex: number;
      stats: number[];
    }) => {
      setAdminActiveQuestionIndex(payload.questionIndex);
      setAdminStatsByQuestion((prev) => ({
        ...prev,
        [payload.questionIndex]: payload.stats ?? [0, 0, 0, 0],
      }));
    };

    const handleSubscription = (payload: {
      playerName: string;
      status: "success" | "failed";
      timestamp: string | Date;
    }) => {
      setSubLog((prev) => {
        const nextItem: SubscriptionLogItem = {
          playerName: payload.playerName,
          status: payload.status,
          timestamp: new Date(payload.timestamp),
        };
        return [nextItem, ...prev].slice(0, 8);
      });
    };

    const handleAdminError = (payload: { error?: string }) => {
      if (payload?.error) {
        setAdminAuthError(payload.error);
      } else {
        setAdminAuthError("Неверный admin token");
      }
    };

    socket.on("players:count", handlePlayersCount);
    socket.on("admin:answer", handleAdminAnswer);
    socket.on("admin:subscription", handleSubscription);
    socket.on("stats:updated", handleStatsUpdated);
    socket.on("leaderboard:updated", (payload: { topPlayers?: LeaderboardPlayer[] }) => {
      setAdminTopPlayers(payload.topPlayers ?? []);
    });
    socket.on("admin:error", handleAdminError);

    return () => {
      socket.off("players:count", handlePlayersCount);
      socket.off("admin:answer", handleAdminAnswer);
      socket.off("admin:subscription", handleSubscription);
      socket.off("stats:updated", handleStatsUpdated);
      socket.off("leaderboard:updated");
      socket.off("admin:error", handleAdminError);
      releaseSocket();
    };
  }, [adminToken, selectedQuizId]);

  useEffect(() => {
    if (activeTab !== "dashboard") {
      return;
    }
    setDashboardLoading(true);
    api
      .getDashboardStats()
      .then((data) => {
        setDashboardStats(data);
      })
      .catch(() => {
        setDashboardStats(null);
      })
      .finally(() => {
        setDashboardLoading(false);
      });
  }, [activeTab]);

  const formattedDate = useMemo(
    () =>
      new Date().toLocaleDateString("ru-RU", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    [],
  );

  const qrQuiz = useMemo(
    () => myQuizzes.find((quiz) => quiz.id === showQR) ?? null,
    [myQuizzes, showQR],
  );

  if (!selectedQuizId) {
    return (
      <div className="admin-shell min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="w-full max-w-2xl p-10 rounded-[2.5rem] bg-white/5 border border-white/10 space-y-6">
          <div className="space-y-2">
            <h3 className="text-3xl font-black">Выберите квиз для мониторинга</h3>
            <p className="text-sm text-white/50 font-medium">
              Найдите квиз из списка и подключитесь к live-данным.
            </p>
          </div>
          {loadingQuizzes ? (
            <div className="p-6 rounded-2xl bg-white/5 text-xs font-bold uppercase tracking-widest text-white/30 text-center">
              Загрузка...
            </div>
          ) : myQuizzes.length === 0 ? (
            <div className="p-6 rounded-2xl bg-white/5 text-xs font-bold uppercase tracking-widest text-white/30 text-center">
              Нет созданных квизов
            </div>
          ) : (
            <div className="space-y-3">
              {myQuizzes.map((quiz) => (
                <button
                  key={quiz.id}
                  onClick={() => setSelectedQuizId(quiz.id)}
                  className="w-full p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-primary/40 transition-all text-left"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-black">{quiz.title}</div>
                      <div className="text-xs text-white/40 font-bold uppercase tracking-widest">
                        {quiz.category} • {quiz.questionsCount} вопросов
                      </div>
                    </div>
                    <Badge variant={quiz.isExpired ? "default" : "success"}>
                      {quiz.isExpired ? "Expired" : "Live"}
                    </Badge>
                  </div>
                  <div className="mt-3 text-[10px] font-bold uppercase tracking-widest text-white/40">
                    Создан:{" "}
                    {new Date(quiz.createdAt).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "long",
                    })}
                  </div>
                </button>
              ))}
            </div>
          )}
          <Button onClick={onCreateQuiz} className="w-full py-6 text-lg">
            Создать новый квиз
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell min-h-screen bg-background text-foreground flex overflow-hidden">
      <div className="w-20 md:w-64 border-r border-white/10 flex flex-col items-center md:items-start p-6 gap-8 bg-black/20 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center font-black shadow-lg shadow-primary/20">
            S
          </div>
          <span className="font-black text-xl hidden md:block">
            SUPER<span className="text-primary">ADMIN</span>
          </span>
        </div>

        <nav className="flex-1 w-full space-y-2">
          {[
            { id: "dashboard", icon: LayoutDashboard, label: "Дашборд" },
            { id: "quizzes", icon: List, label: "Квизы" },
            { id: "live", icon: Eye, label: "Live Монитор" },
            { id: "analytics", icon: PieChart, label: "Аналитика" },
            { id: "settings", icon: Settings, label: "Настройки" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-2xl transition-all group relative overflow-hidden",
                activeTab === item.id
                  ? "bg-primary text-white shadow-lg shadow-primary/20"
                  : "hover:bg-black/5 dark:hover:bg-white/5 text-white/50 hover:text-foreground dark:hover:text-white",
              )}
            >
              <item.icon size={20} />
              <span className="font-bold hidden md:block">{item.label}</span>
              {item.id === "live" && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 bg-red-500 rounded-full animate-ping hidden md:block" />
              )}
            </button>
          ))}
        </nav>

        <button
          onClick={onExit}
          className="w-full flex items-center gap-4 p-4 rounded-2xl text-red-500 hover:bg-red-500/10 transition-all"
        >
          <LogOut size={20} />
          <span className="font-bold hidden md:block">Выйти</span>
        </button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-24 border-b border-white/10 px-8 flex items-center justify-between backdrop-blur-md bg-black/50">
          <div className="space-y-1">
            <h2 className="text-2xl font-black">
              {activeTab === "dashboard" && "Обзор системы"}
              {activeTab === "live" && "Live Мониторинг"}
              {activeTab === "quizzes" && "Управление квизами"}
            </h2>
            <p className="text-xs font-bold text-white/30 uppercase tracking-widest">
              {formattedDate}
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-bold">Администратор</span>
              <span className="text-xs text-primary font-bold uppercase tracking-widest">
                Online
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-purple-600 border-2 border-white/10 p-0.5">
              <div className="w-full h-full rounded-[0.9rem] bg-black overflow-hidden">
                <img
                  src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
                  alt="avatar"
                />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-8 space-y-8">
          <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 space-y-4">
            <div className="text-xs font-black uppercase tracking-widest text-white/40">
              Квиз
            </div>
            <div className="text-sm font-bold">
              {activeQuizMeta?.title ?? "Выберите квиз для мониторинга"}
            </div>
            <div className="flex flex-col md:flex-row gap-3">
              <select
                value={selectedQuizId ?? ""}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next) {
                    setSelectedQuizId(next);
                  }
                }}
                className="flex-1 p-3 rounded-xl bg-black/40 border border-white/10 focus:border-primary outline-none font-bold text-sm"
              >
                <option value="">Выберите квиз</option>
                {myQuizzes.map((quiz) => (
                  <option key={quiz.id} value={quiz.id}>
                    {quiz.title}
                  </option>
                ))}
              </select>
              <Button
                variant="glass"
                className="px-6"
                onClick={() => {
                  void refreshMyQuizzes();
                }}
              >
                Обновить
              </Button>
            </div>
          </div>

          <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 space-y-4">
            <div className="text-xs font-black uppercase tracking-widest text-white/40">
              Admin Token
            </div>
            <div className="text-sm font-bold">
              {adminToken ? "Токен сохранен" : "Введите токен для live-данных"}
            </div>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                value={adminTokenInput}
                onChange={(e) => setAdminTokenInput(e.target.value)}
                placeholder="Admin token"
                className="flex-1 p-3 rounded-xl bg-black/40 border border-white/10 focus:border-primary outline-none font-bold text-sm"
              />
              <Button onClick={saveAdminToken} className="px-6">
                Сохранить
              </Button>
            </div>
            {adminAuthError && (
              <div className="text-xs font-bold text-red-400">{adminAuthError}</div>
            )}
          </div>
          <AnimatePresence mode="wait">
            {activeTab === "dashboard" && (
              <motion.div
                key="dash"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    {
                      label: "Всего игр",
                      val: dashboardStats?.totalGames ?? "—",
                      icon: Play,
                      color: "text-blue-400",
                    },
                    {
                      label: "Активных квизов",
                      val: dashboardStats?.activeQuizzes ?? "—",
                      icon: Activity,
                      color: "text-green-400",
                      live: true,
                    },
                    {
                      label: "Игроков всего",
                      val: dashboardStats?.totalPlayers ?? "—",
                      icon: Users,
                      color: "text-purple-400",
                    },
                    // TODO: implement revenue aggregation
                    { label: "Выручка", val: "—", icon: Trophy, color: "text-orange-400" },
                  ].map((stat, i) => (
                    <div
                      key={i}
                      className="p-6 rounded-[2rem] bg-white/5 border border-white/10 hover:border-primary/30 transition-all group relative overflow-hidden"
                    >
                      <div
                        className={cn(
                          "p-4 rounded-2xl bg-white/5 w-fit mb-4 group-hover:scale-110 transition-transform",
                          stat.color,
                        )}
                      >
                        <stat.icon size={24} />
                      </div>
                      <div className="text-sm font-bold text-white/50 uppercase tracking-widest mb-1">
                        {stat.label}
                      </div>
                      <div className="text-3xl font-black">{stat.val}</div>
                      {stat.live && (
                        <div className="absolute top-6 right-6 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 p-8 rounded-[2.5rem] bg-white/5 border border-white/10">
                    <div className="flex justify-between items-center mb-8">
                      <h3 className="text-xl font-black">Активность за 24ч</h3>
                      <div className="flex gap-2">
                        <div className="px-3 py-1 rounded-lg bg-primary/20 text-primary text-xs font-bold">
                          Users
                        </div>
                        <div className="px-3 py-1 rounded-lg bg-white/5 text-white/50 text-xs font-bold">
                          Games
                        </div>
                      </div>
                    </div>
                    <div className="h-64 flex items-center justify-center text-xs font-bold uppercase tracking-widest text-white/30">
                      {/* TODO: implement activity chart data */}
                      Нет данных
                    </div>
                  </div>

                  <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 flex flex-col">
                    <h3 className="text-xl font-black mb-6">Топ квизов</h3>
                    <div className="space-y-4 flex-1">
                      {dashboardLoading && (
                        <div className="p-4 rounded-2xl bg-white/5 text-xs font-bold uppercase tracking-widest text-white/30 text-center">
                          Загрузка...
                        </div>
                      )}
                      {!dashboardLoading &&
                        (dashboardStats?.topQuizzes?.length ? (
                          dashboardStats.topQuizzes.map((quiz, index) => (
                            <div
                              key={`${quiz.title}-${index}`}
                              className="p-4 rounded-2xl bg-white/5 border border-white/10"
                            >
                              <div className="font-bold">{quiz.title}</div>
                              <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                                {quiz.plays} игр • {quiz.questionsCount} вопросов
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-4 rounded-2xl bg-white/5 text-xs font-bold uppercase tracking-widest text-white/30 text-center">
                            Нет данных
                          </div>
                        ))}
                    </div>
                    <Button
                      className="w-full mt-6 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-foreground dark:text-white border border-black/10 dark:border-white/10"
                      onClick={() => {
                        // TODO: implement quizzes list
                        pushToast("Список квизов скоро", "info");
                      }}
                    >
                      Все квизы
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "quizzes" && (
              <motion.div
                key="quizzes"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black">Управление квизами</h3>
                  <Button
                    className="bg-primary hover:bg-primary/90"
                    onClick={onCreateQuiz}
                  >
                    <Plus className="mr-2 w-5 h-5" /> Новый квиз
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    className="p-8 rounded-[2.5rem] border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-4 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group"
                    onClick={onCreateQuiz}
                  >
                    <div className="p-4 rounded-2xl bg-white/5 text-white/40 group-hover:text-primary group-hover:scale-110 transition-all">
                      <Plus size={32} />
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-lg">Создать с нуля</div>
                      <p className="text-sm text-white/40 font-medium">
                        Используйте мощный конструктор
                      </p>
                    </div>
                  </motion.div>

                  {myQuizzes.length === 0 && (
                    <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest text-white/30 text-center">
                      Нет данных
                    </div>
                  )}
                  {myQuizzes.map((quiz, i) => (
                    <motion.div
                      key={quiz.id}
                      whileHover={{ y: -5 }}
                      className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 hover:border-primary/30 transition-all relative overflow-hidden group"
                    >
                      <div className="absolute top-0 right-0 p-6">
                        <Badge variant={quiz.isExpired ? "default" : "success"}>
                          {quiz.isExpired ? "Expired" : "Live"}
                        </Badge>
                      </div>
                      <div className="space-y-4">
                        <div className="p-3 rounded-xl bg-primary/10 text-primary w-fit">
                          <LayoutDashboard size={24} />
                        </div>
                        <div>
                          <h4 className="text-xl font-black group-hover:text-primary transition-colors">
                            {quiz.title}
                          </h4>
                          <div className="flex gap-4 mt-2 text-sm text-white/40 font-bold uppercase tracking-widest">
                            <span>{quiz.questionsCount} вопросов</span>
                            <span>{quiz.attemptsCount} игр</span>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-4">
                          <Button
                            size="sm"
                            variant="glass"
                            className="flex-1"
                            onClick={() => {
                              // TODO: implement quiz editing
                              pushToast("Редактирование скоро", "info");
                            }}
                          >
                            Редактировать
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-2"
                            onClick={() => setShowQR(quiz.id)}
                          >
                            <QrCode size={14} /> Ссылка
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <AnimatePresence>
                  {showQR && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
                      onClick={() => setShowQR(null)}
                    >
                      <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        className="w-full max-w-sm bg-[#111] border border-white/10 rounded-[3rem] p-8 space-y-8 relative overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="absolute top-0 right-0 p-6">
                          <button
                            onClick={() => setShowQR(null)}
                            className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
                          >
                            <XCircle className="w-6 h-6 opacity-30" />
                          </button>
                        </div>

                        <div className="text-center space-y-2">
                          <h4 className="text-2xl font-black">
                            {qrQuiz?.title ?? "Квиз"}
                          </h4>
                          <p className="text-white/40 text-sm font-medium">
                            Поделитесь квизом с игроками
                          </p>
                        </div>

                        <div className="flex flex-col items-center gap-6">
                          <div className="p-6 bg-white rounded-[2.5rem] shadow-2xl shadow-primary/20">
                            <QRCodeSVG
                              value={qrQuiz?.deepLink ?? ""}
                              size={200}
                              level="H"
                            />
                          </div>

                          <div className="w-full space-y-3">
                            <div className="flex items-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/10">
                              <div className="flex-1 truncate font-bold text-xs text-white/40">
                                {qrQuiz?.deepLink ?? "—"}
                              </div>
                              <button
                                className="p-2 hover:bg-primary/10 hover:text-primary rounded-xl transition-all"
                                onClick={() => {
                                  // TODO: implement link copy feedback
                                  if (qrQuiz?.deepLink) {
                                    navigator.clipboard.writeText(qrQuiz.deepLink);
                                    pushToast("Ссылка скопирована", "success");
                                  }
                                }}
                              >
                                <Copy size={16} />
                              </button>
                            </div>
                            <Button
                              className="w-full py-6 text-lg gap-2"
                              onClick={() => {
                                if (qrQuiz?.deepLink) {
                                  window.open(qrQuiz.deepLink, "_blank");
                                }
                              }}
                            >
                              <ExternalLink size={20} /> Открыть в TG
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-primary/10 to-purple-600/10 border border-primary/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Sparkles size={120} className="text-primary" />
                  </div>
                  <div className="flex flex-col md:flex-row gap-8 items-center relative z-10">
                    <div className="flex-1 space-y-4 text-center md:text-left">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary text-[10px] font-black uppercase tracking-widest">
                        AI Powered
                      </div>
                      <h3 className="text-3xl font-black">
                        AI Генератор Квизов
                      </h3>
                      <p className="text-white/60 font-medium max-w-md">
                        Просто введите тему, и наш ИИ создаст готовый квиз с
                        вопросами и вариантами ответов за считанные секунды.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-4 pt-2">
                        <input
                          type="text"
                          placeholder="Тема: Современная архитектура..."
                          className="flex-1 max-w-xs p-4 rounded-xl bg-black/40 border border-white/10 focus:border-primary outline-none font-bold transition-all"
                        />
                        <Button
                          className="bg-white text-black hover:bg-white/90 px-8"
                          onClick={() => {
                            // TODO: implement AI quiz generator
                            pushToast("AI генератор скоро", "info");
                          }}
                        >
                          Сгенерировать
                        </Button>
                      </div>
                    </div>
                    <div className="w-48 h-48 rounded-3xl bg-primary/20 flex items-center justify-center relative group">
                      <Sparkles className="w-24 h-24 text-primary animate-pulse group-hover:scale-110 transition-transform" />
                      <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "live" && (
              <motion.div
                key="live"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="space-y-8"
              >
                <div className="flex flex-wrap gap-4">
                  <div className="flex-1 min-w-[200px] p-6 rounded-3xl bg-primary/10 border border-primary/20 backdrop-blur-md flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-primary uppercase tracking-widest mb-1">
                        Текущий квиз
                      </div>
                      <div className="text-xl font-black">
                        {adminQuiz?.title ?? "—"}
                      </div>
                    </div>
                    <div className="p-3 rounded-2xl bg-primary text-white">
                      <Play size={20} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-[200px] p-6 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white/40 uppercase tracking-widest mb-1">
                        Участников
                      </div>
                      <div className="text-xl font-black">
                        {livePlayers}{" "}
                        <span className="text-green-400 text-sm ml-2">● LIVE</span>
                      </div>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/5 text-white">
                      <Users size={20} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-8 space-y-6">
                    <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10">
                      <div className="flex justify-between items-center mb-8">
                        <h3 className="text-xl font-black flex items-center gap-3">
                          <BarChart3 className="text-primary" /> Ответы по вопросам
                        </h3>
                        <Badge variant="default">
                          Вопрос{" "}
                          {adminQuiz ? adminActiveQuestionIndex + 1 : "—"}/
                          {adminQuiz?.questions.length ?? "—"}
                        </Badge>
                      </div>

                      <div className="space-y-8">
                        {!adminCurrentQuestion && (
                          <div className="p-6 rounded-2xl bg-white/5 border border-white/5 text-xs font-bold uppercase tracking-widest text-white/30 text-center">
                            Нет данных
                          </div>
                        )}
                        {adminCurrentQuestion && (
                          <div className="space-y-6">
                            <p className="text-lg font-bold">
                              {adminCurrentQuestion.question}
                            </p>
                            <div className="space-y-4">
                              {adminCurrentQuestion.options.map((opt, i) => {
                                const value = adminQuestionStats[i] ?? 0;
                                return (
                                  <div key={i} className="space-y-2">
                                    <div className="flex justify-between text-sm font-bold">
                                      <span className="text-white/60">{opt}</span>
                                      <span>{value}%</span>
                                    </div>
                                    <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-primary/70 transition-[width] duration-500"
                                        style={{ width: `${value}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="space-y-3">
                          <div className="text-xs font-black uppercase tracking-widest text-white/40">
                            Последние ответы
                          </div>
                          {adminAnswers.length === 0 && (
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-xs font-bold uppercase tracking-widest text-white/30 text-center">
                              Нет данных
                            </div>
                          )}
                          {adminAnswers.map((item, index) => (
                            <motion.div
                              key={`${item.playerName}-${item.timestamp}-${index}`}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5"
                            >
                              <div className="flex items-center gap-4">
                                <div
                                  className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs",
                                    item.isCorrect
                                      ? "bg-green-500/20 text-green-400"
                                      : "bg-red-500/20 text-red-400",
                                  )}
                                >
                                  {String.fromCharCode(65 + item.answerIndex)}
                                </div>
                                <div>
                                  <div className="font-bold text-sm">
                                    {item.playerName}
                                  </div>
                                  <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                                    Вопрос {item.questionIndex + 1}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-xs font-bold opacity-40">
                                  {item.timestamp.toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </div>
                                <div
                                  className={cn(
                                    "text-[10px] font-black uppercase",
                                    item.isCorrect ? "text-green-400" : "text-red-400",
                                  )}
                                >
                                  {item.isCorrect ? `+${item.score}` : "0"}
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10">
                      <h3 className="text-xl font-black mb-6 flex items-center gap-3">
                        <ShieldCheck className="text-[#229ED9]" /> Лог подписок (TG)
                      </h3>
                      <div className="space-y-3">
                        {subLog.length === 0 && (
                          <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-xs font-bold uppercase tracking-widest text-white/30 text-center">
                            Нет данных
                          </div>
                        )}
                        {subLog.map((log, i) => (
                          <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={i}
                            className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-[#229ED9]/10 flex items-center justify-center text-[#229ED9]">
                                <Users size={18} />
                              </div>
                              <div>
                                <div className="font-bold text-sm">{log.playerName}</div>
                                <div
                                  className={cn(
                                    "text-[10px] font-black uppercase tracking-widest",
                                    log.status === "success"
                                      ? "text-green-400"
                                      : "text-red-400",
                                  )}
                                >
                                  {log.status === "success"
                                    ? "Подписка подтверждена"
                                    : "Подписка не найдена"}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-bold opacity-40">
                                {log.timestamp.toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                              <div className="text-[10px] font-black uppercase text-[#229ED9]">
                                Bot API Check
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-4">
                    <div className="p-8 rounded-[2.5rem] bg-gradient-to-b from-white/10 to-transparent border border-white/10 sticky top-0">
                      <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                        <Crown className="text-yellow-500" /> Live Топ
                      </h3>
                      <div className="space-y-4">
                        {adminTopPlayers.length === 0 && (
                          <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-xs font-bold uppercase tracking-widest text-white/30 text-center">
                            Нет данных
                          </div>
                        )}
                        {adminTopPlayers.map((player, i) => (
                          <motion.div
                            layout
                            key={`${player.name}-${player.rank}`}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-4 p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                          >
                            <div
                              className={cn(
                                "w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs",
                                i === 0 ? "bg-yellow-500 text-black" : "bg-white/10",
                              )}
                            >
                              {player.rank}
                            </div>
                            <div className="flex-1">
                              <div className="font-bold text-sm">{player.name}</div>
                              <div className="text-[10px] font-black text-green-400">
                                TOP
                              </div>
                            </div>
                            <div className="font-black text-sm">{player.score}</div>
                          </motion.div>
                        ))}
                      </div>
                      <Button
                        variant="glass"
                        className="w-full mt-8"
                        onClick={() => {
                          // TODO: implement full leaderboard view
                          pushToast("Полный список скоро", "info");
                        }}
                      >
                        Полный список
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {(activeTab === "analytics" || activeTab === "settings") && (
              <motion.div
                key="soon"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex items-center justify-center h-64"
              >
                <div className="text-center space-y-2">
                  <Sparkles className="w-12 h-12 text-primary/40 mx-auto" />
                  {/* TODO: implement analytics and settings */}
                  <div className="text-lg font-black opacity-40">Скоро</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
