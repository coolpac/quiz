import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  HelpCircle,
  Plus,
  Search,
  Settings,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/cn";
import { hapticSelection } from "../lib/telegramUi";
import { api } from "../api";

type ActiveQuiz = {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  questionsCount: number;
  playersCount: number;
  timePerQuestion: number;
};

type HomeViewProps = {
  onStart: () => void;
  onAdmin: () => void;
  onCreate: () => void;
  onPlayQuiz: (quizId: string) => void;
  isAdmin: boolean;
  hasQuizId?: boolean;
};

const difficultyColor: Record<string, string> = {
  easy: "bg-green-500/20 text-green-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  hard: "bg-red-500/20 text-red-400",
};

const HomeView = ({ onStart, onAdmin, onCreate, onPlayQuiz, isAdmin, hasQuizId }: HomeViewProps) => {
  const [quizzes, setQuizzes] = useState<ActiveQuiz[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "popular">("newest");
  const [recentQuizzes, setRecentQuizzes] = useState<string[]>([]);
  const [showQuizList, setShowQuizList] = useState(false);

  const categories = useMemo(() => {
    const cats = [...new Set(quizzes.map(q => q.category))];
    return cats.sort();
  }, [quizzes]);

  const filteredQuizzes = useMemo(() => {
    let result = quizzes;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(quiz => quiz.title.toLowerCase().includes(q) || quiz.category.toLowerCase().includes(q));
    }
    if (selectedCategory) {
      result = result.filter(quiz => quiz.category === selectedCategory);
    }
    if (sortBy === "popular") {
      result = [...result].sort((a, b) => b.playersCount - a.playersCount);
    }
    return result;
  }, [quizzes, search, selectedCategory, sortBy]);

  const loadQuizzes = () => {
    setLoading(true);
    api
      .getActiveQuizzes()
      .then((data) => setQuizzes(data.quizzes ?? []))
      .catch(() => setQuizzes([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/stats/online`)
      .then((r) => r.json())
      .then((data) => setOnlineCount(data.count ?? null))
      .catch(() => setOnlineCount(null));
  }, []);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("recentQuizzes") || "[]") as string[];
      setRecentQuizzes(stored.slice(0, 5));
    } catch { setRecentQuizzes([]); }
  }, []);

  const handlePlayClick = () => {
    hapticSelection();
    if (hasQuizId) {
      onStart();
    } else {
      loadQuizzes();
      setShowQuizList(true);
    }
  };

  const handlePlayQuiz = (quizId: string) => {
    hapticSelection();
    try {
      const stored = JSON.parse(localStorage.getItem("recentQuizzes") || "[]") as string[];
      const updated = [quizId, ...stored.filter(id => id !== quizId)].slice(0, 10);
      localStorage.setItem("recentQuizzes", JSON.stringify(updated));
    } catch {}
    onPlayQuiz(quizId);
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-[100dvh] w-full max-w-7xl mx-auto px-6 py-10 relative">
      <div className="fx-blob absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 dark:bg-primary/30 rounded-full blur-[120px] animate-pulse pointer-events-none" />
      <div className="fx-blob absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 dark:bg-purple-600/20 rounded-full blur-[150px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-8 z-10 w-full max-w-2xl mt-6"
      >
        <div className="fx-backdrop inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 backdrop-blur-md shadow-2xl">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
          <span className="text-sm font-bold tracking-wide uppercase opacity-80 text-foreground">
            {onlineCount !== null ? `${onlineCount.toLocaleString("ru-RU")} Игроков в сети` : "Онлайн"}
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative mx-auto"
        >
          <div className="absolute inset-0 bg-primary/20 blur-[60px] rounded-full pointer-events-none scale-75" />
          <img
            src="/elephant-hero.png"
            alt="Кибер Слон"
            className="relative w-28 h-28 md:w-52 md:h-52 object-contain mx-auto drop-shadow-2xl"
            draggable={false}
          />
        </motion.div>

        <h1 className="text-5xl md:text-8xl font-black tracking-tighter leading-[0.85] text-foreground">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-purple-400 to-pink-500">
            Кибер Слон
          </span>
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-lg mx-auto font-medium leading-relaxed px-4">
          Быстрые квизы и живые результаты в каждом вопросе.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4 px-4">
          <div className="flex flex-col items-center gap-2 w-full sm:w-auto">
            <Button
              onClick={handlePlayClick}
              size="lg"
              className="group px-10 bg-gradient-to-r from-primary to-purple-600 w-full sm:w-auto"
            >
              Играть сейчас{" "}
              <ChevronRight className="ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            {!hasQuizId && (
              <p className="text-xs text-muted-foreground font-medium text-center px-2">
                Перейдите по ссылке квиза, чтобы начать игру
              </p>
            )}
          </div>
          {isAdmin && (
            <div className="flex gap-4 w-full sm:w-auto">
              <Button
                onClick={() => {
                  hapticSelection();
                  onCreate();
                }}
                variant="glass"
                size="lg"
                className="text-foreground flex-1 sm:flex-none"
              >
                <Plus className="mr-2 w-5 h-5" /> Создать
              </Button>
              <Button
                onClick={() => {
                  hapticSelection();
                  onAdmin();
                }}
                variant="glass"
                size="lg"
                className="text-foreground flex-1 sm:flex-none"
              >
                <Settings className="mr-2 w-5 h-5" /> Админ
              </Button>
            </div>
          )}
        </div>

        {/* Active quizzes modal */}
        <AnimatePresence>
          {showQuizList && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md"
              onClick={() => setShowQuizList(false)}
            >
              <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="w-full max-w-lg max-h-[85dvh] bg-background border border-white/10 rounded-t-[2rem] sm:rounded-[2rem] p-6 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-black text-foreground">Активные квизы</h2>
                  <button
                    onClick={() => setShowQuizList(false)}
                    className="p-2 hover:bg-white/5 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 opacity-40" />
                  </button>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск квиза..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm focus:border-primary/50 outline-none transition-colors placeholder:text-white/30"
                  />
                </div>

                {/* Category pills + sort */}
                <div className="flex items-center gap-2 mt-3 overflow-x-auto scrollbar-none pb-1">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold shrink-0 transition-all border",
                      !selectedCategory ? "bg-primary/20 border-primary/40 text-primary" : "bg-white/5 border-white/10 text-white/40"
                    )}
                  >
                    Все
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                      className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold shrink-0 transition-all border",
                        selectedCategory === cat ? "bg-primary/20 border-primary/40 text-primary" : "bg-white/5 border-white/10 text-white/40"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                  <div className="ml-auto shrink-0">
                    <button
                      onClick={() => setSortBy(sortBy === "newest" ? "popular" : "newest")}
                      className="px-3 py-1 rounded-full text-[10px] font-bold bg-white/5 border border-white/10 text-white/40 hover:text-white/60 transition-colors"
                    >
                      {sortBy === "newest" ? "Новые" : "Популярные"}
                    </button>
                  </div>
                </div>

                {/* Quiz list */}
                <div className="mt-4 space-y-3">
                  {loading ? (
                    [0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="p-4 rounded-2xl bg-white/5 border border-white/10 animate-pulse"
                      >
                        <div className="h-4 w-3/4 rounded bg-white/10" />
                        <div className="flex gap-2 mt-3">
                          <div className="h-4 w-14 rounded-lg bg-white/10" />
                          <div className="h-4 w-12 rounded-lg bg-white/10" />
                        </div>
                      </div>
                    ))
                  ) : filteredQuizzes.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 rounded-2xl bg-white/5 border border-white/10">
                      <HelpCircle className="w-8 h-8 text-white/20" />
                      <p className="text-sm text-white/40 font-medium">
                        {quizzes.length > 0 ? "Ничего не найдено" : "Нет активных квизов"}
                      </p>
                    </div>
                  ) : (
                    filteredQuizzes.map((quiz, i) => (
                      <motion.button
                        key={quiz.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => handlePlayQuiz(quiz.id)}
                        className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-primary/40 transition-all text-left"
                      >
                        <div className="text-sm font-black truncate text-foreground">{quiz.title}</div>
                        <div className="flex gap-2 mt-2">
                          <span className="px-2 py-0.5 rounded-lg bg-primary/20 text-primary text-[10px] font-bold">
                            {quiz.category}
                          </span>
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-lg text-[10px] font-bold",
                              difficultyColor[quiz.difficulty] ?? "bg-white/10 text-white/60",
                            )}
                          >
                            {quiz.difficulty}
                          </span>
                        </div>
                        <div className="flex justify-between mt-3 text-[10px] font-bold uppercase tracking-widest text-white/40">
                          <span>{quiz.questionsCount} вопр. · ⏱ {quiz.timePerQuestion}с</span>
                          <span>{quiz.playersCount} игр.</span>
                        </div>
                      </motion.button>
                    ))
                  )}
                </div>

                {/* Recent quizzes */}
                {recentQuizzes.length > 0 && quizzes.some(q => recentQuizzes.includes(q.id)) && (
                  <div className="mt-6 pt-4 border-t border-white/10">
                    <h3 className="text-sm font-bold text-white/50 uppercase tracking-widest">Недавно сыграно</h3>
                    <div className="flex gap-3 mt-2 overflow-x-auto scrollbar-none pb-1">
                      {recentQuizzes
                        .map(id => quizzes.find(q => q.id === id))
                        .filter(Boolean)
                        .map((quiz) => (
                          <button
                            key={quiz!.id}
                            onClick={() => handlePlayQuiz(quiz!.id)}
                            className="min-w-[150px] p-3 rounded-xl bg-white/5 border border-white/10 hover:border-primary/30 text-left shrink-0 transition-all"
                          >
                            <div className="text-xs font-bold truncate">{quiz!.title}</div>
                            <div className="text-[10px] text-white/40 mt-1">{quiz!.category}</div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-3 gap-4 md:gap-8 pt-12 max-w-md mx-auto px-4">
          {[
            { icon: Zap, label: "Fast", color: "text-yellow-500 dark:text-yellow-400" },
            { icon: Users, label: "Live", color: "text-blue-500 dark:text-blue-400" },
            { icon: Trophy, label: "Win", color: "text-orange-500 dark:text-orange-400" },
          ].map((item, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 w-full aspect-square flex items-center justify-center",
                  item.color,
                )}
              >
                <item.icon className="w-6 h-6 md:w-8 md:h-8" />
              </div>
              <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-50 text-foreground">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default HomeView;
