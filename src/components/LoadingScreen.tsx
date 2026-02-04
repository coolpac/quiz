import React from "react";
import { Loader2 } from "lucide-react";

interface LoadingScreenProps {
  progress?: number;
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  progress, 
  message = "Подготовка квиза..." 
}) => {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse delay-700" />
      
      <div className="relative flex flex-col items-center max-w-xs w-full px-6">
        {/* Logo or Icon Container */}
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse" />
          <div className="relative bg-card border border-primary/20 p-5 rounded-3xl shadow-2xl">
            <Loader2 className="w-10 h-10 text-primary animate-spin" strokeWidth={2.5} />
          </div>
        </div>

        {/* Text Content */}
        <div className="text-center mb-8 space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-foreground animate-in fade-in slide-in-from-bottom-4 duration-700">
            Квиз
          </h2>
          <p className="text-muted-foreground text-sm font-medium animate-in fade-in slide-in-from-bottom-2 duration-1000 delay-200">
            {message}
          </p>
        </div>

        {/* Progress Bar Container */}
        {typeof progress === "number" && (
          <div className="w-full space-y-3">
            <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-500 ease-out shadow-[0_0_12px_rgba(var(--primary),0.5)]"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              <span>Загрузка</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="absolute bottom-12 text-[10px] font-medium text-muted-foreground/40 uppercase tracking-[0.2em]">
        Powered by Telegram Quiz App
      </div>
    </div>
  );
};

export default LoadingScreen;
