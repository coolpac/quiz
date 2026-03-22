import { motion } from "framer-motion";

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
      {/* Контейнер для слона */}
      <motion.div
        className="relative w-64 h-64 flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {/* 
          Используем картинку как маску. 
          Это позволит закрасить слона в фирменный цвет приложения (primary)
          и сделать красивую анимацию "заполнения" или "блика",
          так как статичная картинка не может физически перебирать ногами.
        */}
        <div 
          className="w-full h-full bg-muted/30 relative overflow-hidden"
          style={{
            WebkitMaskImage: 'url(/elephant_transparent.png)',
            WebkitMaskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskImage: 'url(/elephant_transparent.png)',
            maskSize: 'contain',
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
          }}
        >
          {/* Базовый цвет слона (полупрозрачный основной цвет) */}
          <div className="absolute inset-0 bg-primary/20" />

          {/* Анимация волны/блика, проходящей по слону */}
          <motion.div
            className="absolute top-0 bottom-0 w-[200%] bg-gradient-to-r from-transparent via-primary to-transparent opacity-80"
            animate={{
              x: ['-100%', '100%'],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          
          {/* Заполнение слона снизу вверх в зависимости от прогресса */}
          <motion.div 
            className="absolute bottom-0 left-0 right-0 bg-primary"
            initial={{ height: '0%' }}
            animate={{ height: `${progress}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </div>
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
        <div className="font-mono text-xs text-muted-foreground">{Math.round(progress)}%</div>
      </motion.div>
    </div>
  );
}
