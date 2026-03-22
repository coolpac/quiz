import { motion } from "framer-motion";
import ElephantMascot from "./ElephantMascot";

interface LoadingScreenProps {
  progress?: number;
  message?: string;
}

export default function LoadingScreen({
  progress = 0,
  message = "Загрузка...",
}: LoadingScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <ElephantMascot size={256} animated glow shadow />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="mt-8 flex w-64 flex-col items-center gap-4 relative z-20"
      >
        <div className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
          {message}
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary border border-border">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {Math.round(progress)}%
        </div>
      </motion.div>
    </div>
  );
}
