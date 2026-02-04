import { Suspense, lazy, useEffect, useState } from "react";
import "./index.css";
import { api } from "./api";
import HomeView from "./views/HomeView";
import QuizView from "./views/QuizView";
import { ToastProvider } from "./components/Toast";
import type { QuizResults } from "./types/quiz";
import LoadingScreen from "./components/LoadingScreen";

const AdminDashboard = lazy(() => import("./views/AdminDashboard"));
const CreateQuizView = lazy(() => import("./views/CreateQuizView"));
const ResultView = lazy(() => import("./views/ResultView"));

const LoadingSpinner = () => <LoadingScreen progress={100} message="Загрузка модуля..." />;

function App({
  initialQuizId,
  startedFromParam,
}: {
  initialQuizId?: string;
  startedFromParam?: boolean;
}) {
  const [view, setView] = useState<"home" | "quiz" | "result" | "admin" | "create">(
    initialQuizId ? "quiz" : "home",
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [quizId] = useState<string | null>(initialQuizId ?? null);
  const [results, setResults] = useState<QuizResults>({
    score: 0,
    correctCount: 0,
    totalQuestions: 0,
    isFirstAttempt: true,
    quizId: initialQuizId ?? "",
  });
  const [appLoading, setAppLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    // Имитация плавной загрузки для лучшего UX
    const interval = setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev >= 95) {
          clearInterval(interval);
          return 95;
        }
        return prev + Math.random() * 15;
      });
    }, 200);

    Promise.all([
      api.getMe().then((data) => {
        setIsAdmin(Boolean(data?.isAdmin));
      }),
      // Минимальное время отображения для предотвращения мерцания
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ])
      .then(() => {
        setLoadingProgress(100);
        setTimeout(() => setAppLoading(false), 400);
      })
      .catch(() => {
        setIsAdmin(false);
        setLoadingProgress(100);
        setTimeout(() => setAppLoading(false), 400);
      })
      .finally(() => {
        clearInterval(interval);
      });
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const telegram = (
      window as typeof window & {
        Telegram?: {
          WebApp?: {
            colorScheme?: "light" | "dark";
            onEvent?: (event: string, handler: () => void) => void;
            offEvent?: (event: string, handler: () => void) => void;
          };
        };
      }
    ).Telegram?.WebApp;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");

    const applyTheme = (isDark: boolean) => {
      html.classList.toggle("dark", isDark);
    };

    const applyPreferredTheme = () => {
      if (telegram?.colorScheme) {
        applyTheme(telegram.colorScheme === "dark");
        return;
      }
      applyTheme(media?.matches ?? false);
    };

    applyPreferredTheme();

    const handleMediaChange = (event: MediaQueryListEvent) => {
      if (!telegram?.colorScheme) {
        applyTheme(event.matches);
      }
    };

    const handleTelegramTheme = () => applyPreferredTheme();

    if (media?.addEventListener) {
      media.addEventListener("change", handleMediaChange);
    } else {
      media?.addListener?.(handleMediaChange);
    }
    telegram?.onEvent?.("themeChanged", handleTelegramTheme);

    return () => {
      if (media?.removeEventListener) {
        media.removeEventListener("change", handleMediaChange);
      } else {
        media?.removeListener?.(handleMediaChange);
      }
      telegram?.offEvent?.("themeChanged", handleTelegramTheme);
    };
  }, []);

  useEffect(() => {
    if (!isAdmin && (view === "admin" || view === "create")) {
      setView("home");
    }
  }, [isAdmin, view]);

  if (appLoading) {
    return <LoadingScreen progress={loadingProgress} />;
  }

  return (
    <ToastProvider>
      <div className="min-h-screen w-full bg-background text-foreground font-sans selection:bg-primary/30 overflow-x-hidden">
        <Suspense fallback={<LoadingSpinner />}>
          {view === "home" && (
            <HomeView
              onStart={() => setView("quiz")}
              onAdmin={() => setView("admin")}
              onCreate={() => setView("create")}
              isAdmin={isAdmin}
            />
          )}
          {view === "quiz" && (
            <QuizView
              quizId={quizId}
              openedFromStartParam={Boolean(startedFromParam)}
              onFinish={(res: QuizResults) => {
                setResults(res);
                setView("result");
              }}
            />
          )}
          {view === "result" && (
            <ResultView results={results} onRestart={() => setView("home")} />
          )}
          {view === "admin" && isAdmin && (
            <AdminDashboard
              onExit={() => setView("home")}
              onCreateQuiz={() => setView("create")}
              quizId={quizId}
            />
          )}
          {view === "create" && isAdmin && <CreateQuizView onExit={() => setView("home")} />}
        </Suspense>
      </div>
    </ToastProvider>
  );
}

export default App;
