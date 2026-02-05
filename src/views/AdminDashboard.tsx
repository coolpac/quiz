import { useCallback, useEffect, useMemo, useState } from "react";
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
  Menu,
  Pencil,
  PieChart,
  Play,
  Plus,
  QrCode,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../api";
import { connectSocket, releaseSocket } from "../socket";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/Toast";
import { cn } from "../lib/cn";
import { hapticSelection } from "../lib/telegramUi";
import type {
  AdminAnswerItem,
  LeaderboardPlayer,
  QuizData,
  SubscriptionLogItem,
} from "../types/quiz";

type AdminDashboardProps = {
  onExit: () => void;
  onCreateQuiz: (quizId?: string | null) => void;
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
      avatarUrl?: string | null;
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
          avatarUrl: payload.avatarUrl ?? null,
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
      avatarUrl?: string | null;
      status: "success" | "failed";
      timestamp: string | Date;
    }) => {
      setSubLog((prev) => {
        const nextItem: SubscriptionLogItem = {
          playerName: payload.playerName,
          avatarUrl: payload.avatarUrl ?? null,
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
      <div className="admin-shell min-h-screen bg-background text-foreground flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-2xl p-6 sm:p-10 rounded-2xl sm:rounded-[2.5rem] bg-white/5 border border-white/10 space-y-6">
          <div className="space-y-2">
            <h3 className="text-2xl sm:text-3xl font-black">
              Выберите квиз для мониторинга
            </h3>
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
                  onClick={() => {
                    hapticSelection();
                    setSelectedQuizId(quiz.id);
                  }}
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
          <Button
            onClick={() => {
              hapticSelection();
              onCreateQuiz(null);
            }}
            className="w-full py-4 sm:py-6 text-base sm:text-lg"
          >
            Создать новый квиз
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell min-h-screen bg-background text-foreground flex overflow-x-hidden relative">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar (Desktop & Mobile) */}
      <div
        className={cn(
          "fx-backdrop fixed md:relative inset-y-0 left-0 z-[101] w-72 md:w-64 border-r border-white/10 flex flex-col p-6 gap-8 bg-black/90 md:bg-black/20 backdrop-blur-xl transition-transform duration-300 md:translate-x-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center font-black shadow-lg shadow-primary/20">
              S
            </div>
            <span className="font-black text-xl">
              SUPER<span className="text-primary">ADMIN</span>
            </span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-2 md:hidden text-white/50 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 w-full space-y-2 overflow-y-auto custom-scrollbar">
          {[
            { id: "dashboard", icon: LayoutDashboard, label: "Дашборд" },
            { id: "quizzes", icon: List, label: "Квизы" },
            { id: "live", icon: Eye, label: "Live Монитор" },
            { id: "analytics", icon: PieChart, label: "Аналитика" },
            { id: "settings", icon: Settings, label: "Настройки" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                hapticSelection();
                setActiveTab(item.id);
                setIsMobileMenuOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-2xl transition-all group relative overflow-hidden",
                activeTab === item.id
                  ? "bg-primary text-white shadow-lg shadow-primary/20"
                  : "hover:bg-white/5 text-white/50 hover:text-white",
              )}
            >
              <item.icon size={20} />
              <span className="font-bold">{item.label}</span>
              {item.id === "live" && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 bg-red-500 rounded-full animate-ping" />
              )}
            </button>
          ))}
        </nav>

        <button
          onClick={() => {
            hapticSelection();
            onExit();
          }}
          className="w-full flex items-center gap-4 p-4 rounded-2xl text-red-500 hover:bg-red-500/10 transition-all"
        >
          <LogOut size={20} />
          <span className="font-bold">Выйти</span>
        </button>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 md:h-24 border-b border-white/10 px-4 md:px-8 flex items-center justify-between backdrop-blur-md bg-black/50 sticky top-0 z-50">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                hapticSelection();
                setIsMobileMenuOpen(true);
              }}
              className="p-2 md:hidden text-white/70 hover:text-white bg-white/5 rounded-xl"
            >
              <Menu size={24} />
            </button>
            <div className="space-y-0.5">
              <h2 className="text-lg md:text-2xl font-black truncate max-w-[150px] sm:max-w-none">
                {activeTab === "dashboard" && "Обзор"}
                {activeTab === "live" && "Live"}
                {activeTab === "quizzes" && "Квизы"}
              </h2>
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest hidden sm:block">
                {formattedDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-6">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-bold">Admin</span>
              <span className="text-[10px] text-primary font-bold uppercase tracking-widest">
                Online
              </span>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-gradient-to-br from-primary to-purple-600 border border-white/10 p-0.5">
              <div className="w-full h-full rounded-[0.6rem] md:rounded-[0.9rem] bg-black overflow-hidden">
                <img
                  src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
                  alt="avatar"
                />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8">
          <div className="p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] bg-white/5 border border-white/10 space-y-4">
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
                className="px-4 sm:px-6"
                onClick={() => {
                  hapticSelection();
                  void refreshMyQuizzes();
                }}
              >
                Обновить
              </Button>
            </div>
          </div>

          <div className="p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] bg-white/5 border border-white/10 space-y-4">
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
              <Button
                onClick={() => {
                  hapticSelection();
                  saveAdminToken();
                }}
                className="px-6"
              >
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
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                  {[
                    {
                      label: "Игр",
                      val: dashboardStats?.totalGames ?? "—",
                      icon: Play,
                      color: "text-blue-400",
                    },
                    {
                      label: "Квизов",
                      val: dashboardStats?.activeQuizzes ?? "—",
                      icon: Activity,
                      color: "text-green-400",
                      live: true,
                    },
                    {
                      label: "Игроков",
                      val: dashboardStats?.totalPlayers ?? "—",
                      icon: Users,
                      color: "text-purple-400",
                    },
                    // TODO: implement revenue aggregation
                    { label: "Выручка", val: "—", icon: Trophy, color: "text-orange-400" },
                  ].map((stat, i) => (
                    <div
                      key={i}
                      className="p-4 md:p-6 rounded-2xl md:rounded-[2rem] bg-white/5 border border-white/10 hover:border-primary/30 transition-all group relative overflow-hidden"
                    >
                      <div
                        className={cn(
                          "p-2 md:p-4 rounded-xl md:rounded-2xl bg-white/5 w-fit mb-2 md:mb-4 group-hover:scale-110 transition-transform",
                          stat.color,
                        )}
                      >
                        <stat.icon size={20} className="md:w-6 md:h-6" />
                      </div>
                      <div className="text-[10px] md:text-sm font-bold text-white/50 uppercase tracking-widest mb-1">
                        {stat.label}
                      </div>
                      <div className="text-xl md:text-3xl font-black">{stat.val}</div>
                      {stat.live && (
                        <div className="absolute top-4 right-4 md:top-6 md:right-6 flex h-1.5 w-1.5 md:h-2 md:w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 md:h-2 md:w-2 bg-green-500" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                  <div className="lg:col-span-2 p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] bg-white/5 border border-white/10">
                    <div className="flex justify-between items-center mb-6 md:mb-8">
                      <h3 className="text-lg md:text-xl font-black">Активность</h3>
                      <div className="flex gap-2">
                        <div className="px-2 py-1 rounded-lg bg-primary/20 text-primary text-[10px] font-bold">
                          Users
                        </div>
                        <div className="px-2 py-1 rounded-lg bg-white/5 text-white/50 text-[10px] font-bold">
                          Games
                        </div>
                      </div>
                    </div>
                    <div className="h-48 md:h-64 flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-white/30 text-center">
                      {/* TODO: implement activity chart data */}
                      График активности<br/>скоро появится
                    </div>
                  </div>

                  <div className="p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] bg-white/5 border border-white/10 flex flex-col">
                    <h3 className="text-lg md:text-xl font-black mb-6">Топ квизов</h3>
                    <div className="space-y-3 flex-1">
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
                              className="p-3 md:p-4 rounded-xl md:rounded-2xl bg-white/5 border border-white/10"
                            >
                              <div className="font-bold text-sm md:text-base truncate">{quiz.title}</div>
                              <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                                {quiz.plays} игр • {quiz.questionsCount} вопр.
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
                      size="sm"
                      className="w-full mt-6 bg-white/5 hover:bg-white/10 text-white border border-white/10"
                      onClick={() => {
                        hapticSelection();
                        setActiveTab("quizzes");
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
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <h3 className="text-xl md:text-2xl font-black">Управление квизами</h3>
                  <Button
                    size="sm"
                    className="w-full sm:w-auto bg-primary hover:bg-primary/90"
                    onClick={() => {
                      hapticSelection();
                      onCreateQuiz(null);
                    }}
                  >
                    <Plus className="mr-2 w-5 h-5" /> Новый квиз
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-3 md:gap-4 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group"
                    onClick={() => {
                      hapticSelection();
                      onCreateQuiz(null);
                    }}
                  >
                    <div className="p-3 md:p-4 rounded-xl md:rounded-2xl bg-white/5 text-white/40 group-hover:text-primary group-hover:scale-110 transition-all">
                      <Plus size={24} className="md:w-8 md:h-8" />
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-base md:text-lg">Создать с нуля</div>
                      <p className="text-xs md:text-sm text-white/40 font-medium">
                        Используйте мощный конструктор
                      </p>
                    </div>
                  </motion.div>

                  {myQuizzes.length === 0 && (
                    <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest text-white/30 text-center">
                      Нет данных
                    </div>
                  )}
                  {myQuizzes.map((quiz) => (
                    <motion.div
                      key={quiz.id}
                      whileHover={{ y: -5 }}
                      className="p-4 sm:p-8 rounded-2xl sm:rounded-[2.5rem] bg-white/5 border border-white/10 hover:border-primary/30 transition-all relative overflow-hidden group"
                    >
                      <div className="absolute top-0 right-0 p-4 sm:p-6">
                        <Badge variant={quiz.isExpired ? "default" : "success"}>
                          {quiz.isExpired ? "Expired" : "Live"}
                        </Badge>
                      </div>
                      <div className="space-y-4">
                        <div className="p-2 sm:p-3 rounded-xl bg-primary/10 text-primary w-fit">
                          <LayoutDashboard size={20} />
                        </div>
                        <div>
                          <h4 className="text-lg sm:text-xl font-black group-hover:text-primary transition-colors">
                            {quiz.title}
                          </h4>
                          <div className="flex flex-wrap gap-3 mt-2 text-[10px] sm:text-sm text-white/40 font-bold uppercase tracking-widest">
                            <span>{quiz.questionsCount} вопросов</span>
                            <span>{quiz.attemptsCount} игр</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 pt-4">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="glass"
                              className="flex-1"
                              onClick={() => {
                                hapticSelection();
                                onCreateQuiz(quiz.id);
                              }}
                            >
                              <Pencil size={14} className="mr-1" /> Редактировать
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 gap-2"
                              onClick={() => {
                                hapticSelection();
                                setShowQR(quiz.id);
                              }}
                            >
                              <QrCode size={14} /> Ссылка
                            </Button>
                          </div>
                          <Button
                            size="sm"
                            variant="glass"
                            className="w-full"
                            onClick={async () => {
                              hapticSelection();
                              if (
                                !confirm(
                                  "Перезапустить квиз? Все результаты и лидерборд будут сброшены, но вопросы останутся.",
                                )
                              ) {
                                return;
                              }
                              try {
                                await api.resetQuiz(quiz.id);
                                pushToast("Квиз перезапущен", "success");
                                void refreshMyQuizzes();
                              } catch (error) {
                                const message =
                                  error instanceof Error && error.message
                                    ? error.message
                                    : "Не удалось перезапустить квиз";
                                pushToast(message, "error");
                              }
                            }}
                          >
                            <RotateCcw size={14} className="mr-1" /> Перезапустить
                          </Button>
                          <Button
                            size="sm"
                            variant="glass"
                            className="w-full text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/20"
                            onClick={async () => {
                              hapticSelection();
                              if (
                                !confirm(
                                  `Удалить квиз "${quiz.title}"? Это действие нельзя отменить. Все данные (вопросы, результаты, лидерборд) будут удалены навсегда.`,
                                )
                              ) {
                                return;
                              }
                              try {
                                await api.deleteQuiz(quiz.id);
                                pushToast("Квиз удален", "success");
                                void refreshMyQuizzes();
                                if (selectedQuizId === quiz.id) {
                                  setSelectedQuizId(null);
                                }
                              } catch (error) {
                                const message =
                                  error instanceof Error && error.message
                                    ? error.message
                                    : "Не удалось удалить квиз";
                                pushToast(message, "error");
                              }
                            }}
                          >
                            <Trash2 size={14} className="mr-1" /> Удалить квиз
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
                      onClick={() => {
                        hapticSelection();
                        setShowQR(null);
                      }}
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
                            onClick={() => {
                              hapticSelection();
                              setShowQR(null);
                            }}
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
                                  hapticSelection();
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
                <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
                  <div className="flex-1 p-4 md:p-6 rounded-2xl md:rounded-3xl bg-primary/10 border border-primary/20 backdrop-blur-md flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">
                        Текущий квиз
                      </div>
                      <div className="text-base md:text-xl font-black truncate">
                        {adminQuiz?.title ?? "—"}
                      </div>
                    </div>
                    <div className="p-2 md:p-3 rounded-xl md:rounded-2xl bg-primary text-white shrink-0 ml-3">
                      <Play size={18} className="md:w-5 md:h-5" />
                    </div>
                  </div>
                  <div className="flex-1 p-4 md:p-6 rounded-2xl md:rounded-3xl bg-white/5 border border-white/10 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">
                        Участников
                      </div>
                      <div className="text-base md:text-xl font-black">
                        {livePlayers}{" "}
                        <span className="text-green-400 text-xs ml-2 animate-pulse">● LIVE</span>
                      </div>
                    </div>
                    <div className="p-2 md:p-3 rounded-xl md:rounded-2xl bg-white/5 text-white shrink-0 ml-3">
                      <Users size={18} className="md:w-5 md:h-5" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
                  <div className="lg:col-span-8 space-y-6">
                    <div className="p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] bg-white/5 border border-white/10">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 md:mb-8">
                        <h3 className="text-lg md:text-xl font-black flex items-center gap-3">
                          <BarChart3 className="text-primary" /> Ответы
                        </h3>
                        <Badge variant="default" className="text-[10px]">
                          Вопрос{" "}
                          {adminQuiz ? adminActiveQuestionIndex + 1 : "—"}/
                          {adminQuiz?.questions.length ?? "—"}
                        </Badge>
                      </div>

                      <div className="space-y-6 md:space-y-8">
                        {!adminCurrentQuestion && (
                          <div className="p-6 rounded-2xl bg-white/5 border border-white/5 text-[10px] font-bold uppercase tracking-widest text-white/30 text-center">
                            Ожидание данных...
                          </div>
                        )}
                        {adminCurrentQuestion && (
                          <div className="space-y-4 md:space-y-6">
                            <p className="text-base md:text-lg font-bold leading-tight">
                              {adminCurrentQuestion.question}
                            </p>
                            <div className="space-y-3 md:space-y-4">
                              {adminCurrentQuestion.options.map((opt, i) => {
                                const value = adminQuestionStats[i] ?? 0;
                                return (
                                  <div key={i} className="space-y-1.5 md:space-y-2">
                                    <div className="flex justify-between text-xs md:text-sm font-bold">
                                      <span className="text-white/60 truncate mr-4">{opt}</span>
                                      <span className="shrink-0">{value}%</span>
                                    </div>
                                    <div className="h-2 md:h-3 w-full bg-white/5 rounded-full overflow-hidden">
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

                        <div className="space-y-3 pt-4 border-t border-white/5">
                          <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                            Последние ответы
                          </div>
                          {adminAnswers.length === 0 && (
                            <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-[10px] font-bold uppercase tracking-widest text-white/30 text-center">
                              Нет ответов
                            </div>
                          )}
                          <div className="space-y-2">
                            {adminAnswers.map((item, index) => (
                              <motion.div
                                key={`${item.playerName}-${item.timestamp}-${index}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center justify-between p-3 md:p-4 rounded-xl md:rounded-2xl bg-white/5 border border-white/5"
                              >
                                <div className="flex items-center gap-3 md:gap-4 min-w-0">
                                  {item.avatarUrl ? (
                                    <img
                                      src={item.avatarUrl}
                                      alt={item.playerName}
                                      className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover shrink-0"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-primary to-purple-500 shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <div className="font-bold text-xs md:text-sm truncate">
                                      {item.playerName}
                                    </div>
                                    <div className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-white/40">
                                      Вопр. {item.questionIndex + 1}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0 ml-3">
                                  <div
                                    className={cn(
                                      "text-[10px] md:text-xs font-black uppercase",
                                      item.isCorrect ? "text-green-400" : "text-red-400",
                                    )}
                                  >
                                    {item.isCorrect ? `+${item.score}` : "0"}
                                  </div>
                                  <div className="text-[9px] font-bold opacity-30">
                                    {item.timestamp.toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </div>
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
                              {log.avatarUrl ? (
                                <img
                                  src={log.avatarUrl}
                                  alt={log.playerName}
                                  className="w-10 h-10 rounded-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-[#229ED9]/10 flex items-center justify-center text-[#229ED9]">
                                  <Users size={18} />
                                </div>
                              )}
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
                    <div className="p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] bg-gradient-to-b from-white/10 to-transparent border border-white/10 sticky top-4">
                      <h3 className="text-lg md:text-xl font-black mb-6 md:mb-8 flex items-center gap-3">
                        <Crown className="text-yellow-500" /> Live Топ
                      </h3>
                      <div className="space-y-3 md:space-y-4">
                        {adminTopPlayers.length === 0 && (
                          <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-[10px] font-bold uppercase tracking-widest text-white/30 text-center">
                            Нет игроков
                          </div>
                        )}
                        {adminTopPlayers.map((player, i) => (
                          <motion.div
                            layout
                            key={`${player.name}-${player.rank}`}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl md:rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all"
                          >
                            <div
                              className={cn(
                                "w-7 h-7 md:w-8 md:h-8 rounded-lg md:rounded-xl flex items-center justify-center font-black text-[10px] md:text-xs shrink-0",
                                i === 0 ? "bg-yellow-500 text-black" : "bg-white/10",
                              )}
                            >
                              {player.rank}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-xs md:text-sm truncate">{player.name}</div>
                              <div className="text-[9px] font-black text-green-400 uppercase">
                                {i === 0 ? "Leader" : "Top"}
                              </div>
                            </div>
                            <div className="font-black text-xs md:text-sm shrink-0 ml-2">{player.score}</div>
                          </motion.div>
                        ))}
                      </div>
                      <Button
                        variant="glass"
                        size="sm"
                        className="w-full mt-6 md:mt-8"
                        onClick={() => {
                          pushToast("Полный список скоро", "info");
                        }}
                      >
                        Весь список
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
