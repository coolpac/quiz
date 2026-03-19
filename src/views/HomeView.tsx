import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronRight,
  HelpCircle,
  Plus,
  Settings,
  Trophy,
  Users,
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getActiveQuizzes()
      .then((data) => setQuizzes(data.quizzes ?? []))
      .catch(() => setQuizzes([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fx-scroll flex flex-col items-center justify-start md:justify-center min-h-[100dvh] w-full max-w-7xl mx-auto px-6 py-10 relative overflow-x-hidden overflow-y-auto overscroll-y-contain">
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
            1,429 Игроков в сети
          </span>
        </div>

        <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.85] text-foreground">
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
              onClick={() => {
                hapticSelection();
                onStart();
              }}
              size="lg"
              className="group px-10 bg-gradient-to-r from-primary to-purple-600 w-full sm:w-auto"
            >
              Играть сейчас{" "}
              <ChevronRight className="ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            {!hasQuizId && (
              <p className="text-xs text-muted-foreground font-medium text-center px-2">
                Перейдите по ссылке квиза от бота, чтобы начать игру
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

        {/* Active quizzes section */}
        <div className="w-full pt-4 text-left">
          <h2 className="text-xl font-black text-foreground px-1">Активные квизы</h2>
          <p className="text-xs text-muted-foreground font-medium mt-1 px-1">
            Выберите квиз и начните играть
          </p>

          {loading ? (
            <div className="flex gap-4 mt-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none md:grid md:grid-cols-3 md:overflow-x-visible">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="min-w-[200px] p-4 rounded-2xl bg-white/5 border border-white/10 animate-pulse snap-start"
                >
                  <div className="h-4 w-3/4 rounded bg-white/10" />
                  <div className="flex gap-2 mt-3">
                    <div className="h-4 w-14 rounded-lg bg-white/10" />
                    <div className="h-4 w-12 rounded-lg bg-white/10" />
                  </div>
                  <div className="flex justify-between mt-4">
                    <div className="h-3 w-16 rounded bg-white/10" />
                    <div className="h-3 w-12 rounded bg-white/10" />
                  </div>
                </div>
              ))}
            </div>
          ) : quizzes.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-2 py-8 rounded-2xl bg-white/5 border border-white/10">
              <HelpCircle className="w-8 h-8 text-white/20" />
              <p className="text-sm text-white/40 font-medium">Нет активных квизов</p>
            </div>
          ) : (
            <div className="flex gap-4 mt-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none md:grid md:grid-cols-3 md:overflow-x-visible">
              {quizzes.map((quiz, i) => (
                <motion.button
                  key={quiz.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  onClick={() => {
                    hapticSelection();
                    onPlayQuiz(quiz.id);
                  }}
                  className="min-w-[200px] p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-primary/40 transition-all text-left snap-start"
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
                    <span>{quiz.questionsCount} вопр.</span>
                    <span>{quiz.playersCount} игр.</span>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>

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
