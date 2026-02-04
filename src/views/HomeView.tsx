import { motion } from "framer-motion";
import {
  ChevronRight,
  Plus,
  Settings,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/cn";

type HomeViewProps = {
  onStart: () => void;
  onAdmin: () => void;
  onCreate: () => void;
  isAdmin: boolean;
};

const HomeView = ({ onStart, onAdmin, onCreate, isAdmin }: HomeViewProps) => (
  <div className="flex flex-col items-center justify-center min-h-[100dvh] w-full max-w-7xl mx-auto p-6 relative overflow-hidden">
    <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 dark:bg-primary/30 rounded-full blur-[120px] animate-pulse pointer-events-none" />
    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 dark:bg-purple-600/20 rounded-full blur-[150px] pointer-events-none" />

    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center space-y-8 z-10 w-full max-w-2xl"
    >
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 backdrop-blur-md shadow-2xl">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
        </span>
        <span className="text-sm font-bold tracking-wide uppercase opacity-80 text-foreground">
          1,429 Игроков в сети
        </span>
      </div>

      <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.85] text-foreground">
        QUIZ
        <br />
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-purple-400 to-pink-500">
          EVOLUTION
        </span>
      </h1>

      <p className="text-lg md:text-xl text-muted-foreground max-w-lg mx-auto font-medium leading-relaxed px-4">
        Первое в мире квиз-приложение с голосованием в реальном времени и
        нейро-дизайном.
      </p>

      <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4 px-4">
        <Button
          onClick={onStart}
          size="lg"
          className="group px-10 bg-gradient-to-r from-primary to-purple-600 w-full sm:w-auto"
        >
          Играть сейчас{" "}
          <ChevronRight className="ml-2 group-hover:translate-x-1 transition-transform" />
        </Button>
        {isAdmin && (
          <div className="flex gap-4 w-full sm:w-auto">
            <Button
              onClick={onCreate}
              variant="glass"
              size="lg"
              className="text-foreground flex-1 sm:flex-none"
            >
              <Plus className="mr-2 w-5 h-5" /> Создать
            </Button>
            <Button
              onClick={onAdmin}
              variant="glass"
              size="lg"
              className="text-foreground flex-1 sm:flex-none"
            >
              <Settings className="mr-2 w-5 h-5" /> Админ
            </Button>
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

export default HomeView;
