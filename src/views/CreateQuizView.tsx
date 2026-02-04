import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Copy,
  Eye,
  Image as ImageIcon,
  Lock,
  Plus,
  Send,
  Timer,
  Trash2,
  XCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../api";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/Toast";
import { cn } from "../lib/cn";

type QuestionDraft = {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  requiresSubscription: boolean;
  mediaUrl?: string;
  mediaType?: "image" | "video";
};

const DEFAULT_OPTIONS = ["", "", "", ""];
const DRAFT_KEY = "quiz_draft";

const createQuestionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createEmptyQuestion = (): QuestionDraft => ({
  id: createQuestionId(),
  text: "",
  options: [...DEFAULT_OPTIONS],
  correctIndex: 0,
  requiresSubscription: false,
});

type CreateQuizViewProps = {
  onExit: () => void;
};

const CreateQuizView = ({ onExit }: CreateQuizViewProps) => {
  const [step, setStep] = useState(1);
  const [quizName, setQuizName] = useState("");
  const [category, setCategory] = useState("");
  const [timePerQuestion, setTimePerQuestion] = useState(15);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    "medium",
  );
  const [isPublic, setIsPublic] = useState(true);
  const [channelUrl, setChannelUrl] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    createEmptyQuestion(),
  ]);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [isPublished, setIsPublished] = useState(false);
  const [quizUrl, setQuizUrl] = useState("");
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [createdQuizId, setCreatedQuizId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState<{
    draft: {
      quizName: string;
      category: string;
      difficulty: "easy" | "medium" | "hard";
      timePerQuestion: number;
      isPublic: boolean;
      channelUrl?: string;
      questions: QuestionDraft[];
    };
  } | null>(null);
  const { pushToast } = useToast();

  const activeQuestion = useMemo(
    () => questions[activeQuestionIndex] ?? createEmptyQuestion(),
    [questions, activeQuestionIndex],
  );

  const needsChannelUrl = useMemo(
    () => questions.some((question) => question.requiresSubscription),
    [questions],
  );

  const updateActiveQuestion = (updater: (draft: QuestionDraft) => QuestionDraft) =>
    setQuestions((prev) =>
      prev.map((item, index) =>
        index === activeQuestionIndex ? updater(item) : item,
      ),
    );

  const handleAddQuestion = () => {
    const nextQuestion = createEmptyQuestion();
    setQuestions((prev) => {
      const next = [...prev, nextQuestion];
      setActiveQuestionIndex(next.length - 1);
      return next;
    });
  };

  const handleRemoveQuestion = () => {
    setQuestions((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      const next = prev.filter((_, index) => index !== activeQuestionIndex);
      const nextIndex = Math.min(activeQuestionIndex, next.length - 1);
      setActiveQuestionIndex(nextIndex);
      return next;
    });
  };

  const inferMediaType = (value: string) => {
    if (!value) {
      return undefined;
    }
    return /\.(mp4|webm)(\?|#|$)/i.test(value) ? "video" : "image";
  };

  const validationError = useMemo(() => {
    if (quizName.trim().length < 2) {
      return "Введите название квиза";
    }
    if (!category.trim()) {
      return "Выберите категорию";
    }
    for (let i = 0; i < questions.length; i += 1) {
      const question = questions[i];
      if (!question.text.trim() || question.text.trim().length < 3) {
        return `Вопрос ${i + 1} пуст`;
      }
      const nonEmptyOptions = question.options.filter((opt) => opt.trim());
      if (nonEmptyOptions.length < 2) {
        return `Вопрос ${i + 1}: минимум 2 варианта`;
      }
      if (
        question.correctIndex < 0 ||
        question.correctIndex >= question.options.length ||
        !question.options[question.correctIndex]?.trim()
      ) {
        return `Вопрос ${i + 1}: выберите правильный вариант`;
      }
    }
    if (needsChannelUrl) {
      const trimmed = channelUrl.trim();
      if (!trimmed.startsWith("https://t.me/")) {
        return "Укажите ссылку на канал в формате https://t.me/...";
      }
    }
    return null;
  }, [category, channelUrl, needsChannelUrl, questions, quizName]);

  const handlePublish = async () => {
    if (isPublishing) {
      return;
    }
    if (validationError) {
      pushToast(validationError, "warning");
      return;
    }
    setIsPublishing(true);

    try {
      const payload = {
        title: quizName,
        category,
        difficulty,
        timePerQuestion,
        isPublic,
        channelUrl: channelUrl.trim() ? channelUrl.trim() : null,
        questions: questions.map((question, index) => {
          const filteredOptions = question.options
            .map((opt) => opt.trim())
            .filter((opt) => opt.length > 0);
          const correctText = question.options[question.correctIndex]?.trim() ?? "";
          const newCorrectIndex = filteredOptions.indexOf(correctText);
          return {
            text: question.text.trim(),
            options: filteredOptions,
            correctIndex: newCorrectIndex >= 0 ? newCorrectIndex : 0,
            requiresSubscription: question.requiresSubscription,
            mediaUrl: question.mediaUrl,
            mediaType: question.mediaType,
            order: index,
          };
        }),
      };

      const response = await api.createQuiz(payload);
      setQuizUrl(response.deepLink);
      setAdminToken(response.adminToken ?? null);
      setCreatedQuizId(response.id ?? null);
      try {
        if (response.id && response.adminToken) {
          window.localStorage.setItem(
            `adminToken:${response.id}`,
            response.adminToken,
          );
        }
      } catch {
        // ignore storage failures
      }
      setDraftPrompt(null);
      setIsPublished(true);
      try {
        window.dispatchEvent(new Event("myQuizzesUpdated"));
      } catch {
        // ignore event dispatch failures
      }
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore storage failures
      }
    } catch {
      setIsPublished(false);
    } finally {
      setIsPublishing(false);
    }
  };

  const copyToClipboard = () => {
    if (!quizUrl) {
      return;
    }
    navigator.clipboard.writeText(quizUrl);
  };

  const copyAdminToken = () => {
    if (!adminToken) {
      return;
    }
    navigator.clipboard.writeText(adminToken);
  };

  const restoreDraft = () => {
    if (!draftPrompt) {
      return;
    }
    const draft = draftPrompt.draft;
    setQuizName(draft.quizName);
    setCategory(draft.category);
    setDifficulty(draft.difficulty);
    setTimePerQuestion(draft.timePerQuestion);
    setIsPublic(draft.isPublic);
    setChannelUrl(draft.channelUrl ?? "");
    setQuestions(
      draft.questions.map((question) => ({
        ...question,
        id: question.id ?? createQuestionId(),
        options: question.options?.length ? question.options : [...DEFAULT_OPTIONS],
      })),
    );
    setActiveQuestionIndex(0);
    setDraftPrompt(null);
    pushToast("Черновик восстановлен", "success");
  };

  const discardDraft = () => {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore storage failures
    }
    setDraftPrompt(null);
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        quizName?: string;
        category?: string;
        difficulty?: "easy" | "medium" | "hard";
        timePerQuestion?: number;
        isPublic?: boolean;
        channelUrl?: string;
        questions?: QuestionDraft[];
      };
      if (parsed?.questions && parsed.questions.length > 0) {
        setDraftPrompt({
          draft: {
            quizName: parsed.quizName ?? "",
            category: parsed.category ?? "",
            difficulty: parsed.difficulty ?? "medium",
            timePerQuestion: parsed.timePerQuestion ?? 15,
            isPublic: parsed.isPublic ?? true,
            channelUrl: parsed.channelUrl ?? "",
            questions: parsed.questions.map((question) => ({
              ...question,
              id: question.id ?? createQuestionId(),
              options: question.options?.length ? question.options : [...DEFAULT_OPTIONS],
            })),
          },
        });
      }
    } catch {
      // ignore draft parsing failures
    }
  }, []);

  useEffect(() => {
    if (isPublished) {
      return;
    }
    try {
      const payload = {
        quizName,
        category,
        difficulty,
        timePerQuestion,
        isPublic,
        channelUrl,
        questions,
      };
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch {
      // ignore draft save failures
    }
  }, [category, channelUrl, difficulty, isPublic, isPublished, questions, quizName, timePerQuestion]);

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <header className="h-20 border-b border-black/5 dark:border-white/10 px-6 flex items-center justify-between backdrop-blur-md bg-background/50 z-20">
        <div className="flex items-center gap-4">
          <button
            onClick={onExit}
            className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors"
          >
            <XCircle className="w-6 h-6 opacity-50" />
          </button>
          <h2 className="text-xl font-black tracking-tight">Создание квиза</h2>
        </div>
        {!isPublished && (
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                step >= 1 ? "bg-primary" : "bg-black/10 dark:bg-white/10",
              )}
            />
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                step >= 2 ? "bg-primary" : "bg-black/10 dark:bg-white/10",
              )}
            />
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                step >= 3 ? "bg-primary" : "bg-black/10 dark:bg-white/10",
              )}
            />
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto p-6 relative z-10">
        {draftPrompt && (
          <div className="fixed top-6 right-6 z-[250] max-w-sm p-4 rounded-2xl bg-primary/10 border border-primary/30 backdrop-blur-md shadow-lg space-y-3">
            <div className="text-sm font-bold text-primary">
              Восстановить черновик?
            </div>
            <div className="text-xs text-muted-foreground font-medium">
              Найден незавершенный квиз. Продолжить с сохраненной версии?
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={restoreDraft} className="flex-1">
                Восстановить
              </Button>
              <Button
                size="sm"
                variant="glass"
                onClick={discardDraft}
                className="flex-1"
              >
                Сбросить
              </Button>
            </div>
          </div>
        )}
        <div className="max-w-2xl mx-auto space-y-12 py-8">
          <AnimatePresence mode="wait">
            {isPublished ? (
              <motion.div
                key="published"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center text-center space-y-8 py-12"
              >
                <div className="w-24 h-24 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center mb-4">
                  <CheckCircle2 size={48} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-4xl font-black">Квиз опубликован!</h3>
                  <p className="text-muted-foreground font-medium">
                    Ваш квиз готов к игре. Поделитесь ссылкой с игроками.
                  </p>
                </div>

                <div className="w-full max-w-md space-y-6">
                  <div className="p-8 rounded-[2.5rem] bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 shadow-2xl relative group overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative z-10 flex flex-col items-center gap-6">
                      <div className="p-4 bg-white rounded-3xl shadow-inner shadow-black/5">
                        <QRCodeSVG
                          value={quizUrl}
                          size={200}
                          level="H"
                          includeMargin={false}
                          imageSettings={{
                            src: "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
                            x: undefined,
                            y: undefined,
                            height: 40,
                            width: 40,
                            excavate: true,
                          }}
                        />
                      </div>
                      <div className="text-[10px] font-black uppercase tracking-widest opacity-40">
                        Отсканируйте для входа
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10">
                      <div className="flex-1 truncate font-bold text-sm opacity-60 text-left">
                        {quizUrl}
                      </div>
                      <button
                        onClick={copyToClipboard}
                        className="p-2 hover:bg-primary/10 hover:text-primary rounded-xl transition-all"
                      >
                        <Copy size={18} />
                      </button>
                    </div>
                    {adminToken && (
                      <div className="flex items-center gap-2 p-4 rounded-2xl bg-primary/5 border border-primary/20">
                        <div className="flex-1 truncate font-bold text-sm text-primary text-left">
                          Admin token: {adminToken}
                        </div>
                        <button
                          onClick={copyAdminToken}
                          className="p-2 hover:bg-primary/10 hover:text-primary rounded-xl transition-all"
                        >
                          <Copy size={18} />
                        </button>
                      </div>
                    )}
                    {createdQuizId && adminToken && (
                      <div className="text-[10px] font-bold uppercase tracking-widest opacity-50 text-left">
                        Сохранено в браузере для квиза {createdQuizId}
                      </div>
                    )}
                    <Button onClick={onExit} className="w-full py-6 text-lg">
                      Вернуться в админку
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : (
              step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8"
                >
                  <div className="space-y-2">
                    <h3 className="text-3xl font-black">С чего начнем?</h3>
                    <p className="text-muted-foreground font-medium">
                      Дайте вашему квизу крутое название и выберите категорию.
                    </p>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-3">
                      <label className="text-xs font-black uppercase tracking-widest opacity-50 ml-1">
                        Название квиза
                      </label>
                      <input
                        type="text"
                        placeholder="Напр: Битва Титанов JS"
                        className="w-full p-6 rounded-[1.5rem] bg-black/5 dark:bg-white/5 border-2 border-transparent focus:border-primary/50 focus:bg-transparent transition-all outline-none text-xl font-bold"
                        value={quizName}
                        onChange={(e) => setQuizName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-xs font-black uppercase tracking-widest opacity-50 ml-1">
                        Категория
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {["IT", "Кино", "Музыка", "Спорт", "Наука", "Игры"].map(
                          (cat) => {
                            const isActive = category === cat;
                            return (
                              <button
                                key={cat}
                                onClick={() => setCategory(cat)}
                                className={cn(
                                  "p-4 rounded-2xl bg-black/5 dark:bg-white/5 border-2 font-bold transition-all",
                                  isActive
                                    ? "border-primary/70 text-primary"
                                    : "border-transparent hover:border-primary/30",
                                )}
                              >
                                {cat}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={() => setStep(2)}
                    className="w-full py-8 text-xl bg-gradient-to-r from-primary to-purple-600"
                    disabled={!quizName || !category}
                  >
                    Далее <ArrowRight className="ml-2 w-6 h-6" />
                  </Button>
                </motion.div>
              )
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="space-y-2">
                  <h3 className="text-3xl font-black">Настройки игры</h3>
                  <p className="text-muted-foreground font-medium">
                    Настройте правила для участников.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="p-6 rounded-[2rem] bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                          <Timer size={24} />
                        </div>
                        <div>
                          <div className="font-bold text-lg">Время на ответ</div>
                          <div className="text-xs text-muted-foreground font-medium uppercase tracking-widest">
                            Секунд на каждый вопрос
                          </div>
                        </div>
                      </div>
                      <div className="text-2xl font-black text-primary">
                        {timePerQuestion}s
                      </div>
                    </div>
                    <div className="px-2">
                      <input
                        type="range"
                        className="w-full h-2 bg-black/10 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                        min="5"
                        max="60"
                        step="5"
                        value={timePerQuestion}
                        onChange={(e) => setTimePerQuestion(Number(e.target.value))}
                      />
                      <div className="flex justify-between mt-2 text-[10px] font-black opacity-30 uppercase tracking-tighter">
                        <span>5s</span>
                        <span>15s</span>
                        <span>30s</span>
                        <span>45s</span>
                        <span>60s</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-6 rounded-[2rem] bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 space-y-4">
                      <div className="flex items-center gap-3">
                        <Activity size={20} className="text-orange-500" />
                        <span className="font-bold">Сложность</span>
                      </div>
                      <div className="flex gap-2">
                        {[
                          { label: "Easy", value: "easy" },
                          { label: "Mid", value: "medium" },
                          { label: "Hard", value: "hard" },
                        ].map((item) => (
                          <button
                            key={item.value}
                            onClick={() =>
                              setDifficulty(item.value as "easy" | "medium" | "hard")
                            }
                            className={cn(
                              "flex-1 py-2 rounded-xl text-xs font-black uppercase transition-all border-2",
                              difficulty === item.value
                                ? "bg-primary border-primary text-white"
                                : "bg-black/5 dark:bg-white/5 border-transparent opacity-50",
                            )}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-6 rounded-[2rem] bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 space-y-4">
                      <div className="flex items-center gap-3">
                        <Eye size={20} className="text-blue-500" />
                        <span className="font-bold">Приватность</span>
                      </div>
                      <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 p-1 rounded-xl">
                        <button
                          onClick={() => setIsPublic(true)}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-[10px] font-black uppercase",
                            isPublic
                              ? "bg-white dark:bg-white/10 shadow-sm"
                              : "opacity-40",
                          )}
                        >
                          Public
                        </button>
                        <button
                          onClick={() => setIsPublic(false)}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-[10px] font-black uppercase",
                            !isPublic
                              ? "bg-white dark:bg-white/10 shadow-sm"
                              : "opacity-40",
                          )}
                        >
                          Private
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {[
                      {
                        label: "Показывать Live-статистику",
                        desc: "Игроки видят ответы других в реальном времени",
                        active: true,
                      },
                      {
                        label: "Музыкальное сопровождение",
                        desc: "Эпичные треки во время битвы",
                        active: false,
                      },
                    ].map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-5 rounded-[1.5rem] bg-black/5 dark:bg-white/5 border border-transparent hover:border-primary/20 transition-all group"
                      >
                        <div className="space-y-1">
                          <div className="font-bold text-sm group-hover:text-primary transition-colors flex items-center gap-2">
                            {item.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-medium">
                            {item.desc}
                          </div>
                        </div>
                        <div
                          className={cn(
                            "w-12 h-6 rounded-full relative transition-all p-1 cursor-pointer",
                            item.active
                              ? "bg-primary"
                              : "bg-black/20 dark:bg-white/10",
                          )}
                        >
                          <div
                            className={cn(
                              "w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                              item.active ? "translate-x-6" : "translate-x-0",
                            )}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button
                    onClick={() => setStep(1)}
                    variant="glass"
                    className="flex-1 py-8 text-xl"
                  >
                    Назад
                  </Button>
                  <Button
                    onClick={() => setStep(3)}
                    className="flex-[2] py-8 text-xl bg-gradient-to-r from-primary to-purple-600 shadow-lg shadow-primary/20"
                  >
                    Создать вопросы
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                <div className="space-y-2">
                  <h3 className="text-3xl font-black">Вопросы</h3>
                  <p className="text-muted-foreground font-medium">
                    Добавьте вопросы и варианты ответов.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {questions.map((_, index) => (
                    <button
                      key={questions[index]?.id ?? index}
                      onClick={() => setActiveQuestionIndex(index)}
                      className={cn(
                        "w-10 h-10 rounded-xl text-xs font-black uppercase transition-all border",
                        index === activeQuestionIndex
                          ? "bg-primary text-white border-primary/50"
                          : "bg-black/5 dark:bg-white/5 border-transparent opacity-70 hover:opacity-100",
                      )}
                    >
                      {index + 1}
                    </button>
                  ))}
                  <button
                    onClick={handleAddQuestion}
                    className="w-10 h-10 rounded-xl text-xs font-black uppercase transition-all border border-dashed border-primary/40 text-primary hover:bg-primary/10 flex items-center justify-center"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div className="p-8 rounded-[2rem] bg-card/60 dark:bg-slate-900/70 border border-black/5 dark:border-white/10 backdrop-blur-lg space-y-8 relative overflow-hidden">
                  {questions.length > 1 && (
                    <button
                      onClick={handleRemoveQuestion}
                      className="absolute top-0 right-0 m-4 p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}

                  <div className="space-y-3">
                    <label className="text-xs font-black uppercase tracking-widest opacity-50 ml-1">
                      URL медиа (опционально)
                    </label>
                    <div className="flex items-center gap-3 p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                      <ImageIcon className="w-5 h-5 text-white/30" />
                      <input
                        type="text"
                        placeholder="https://... (jpg/png/mp4/webm)"
                        value={activeQuestion.mediaUrl ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          updateActiveQuestion((draft) => ({
                            ...draft,
                            mediaUrl: value ? value : undefined,
                            mediaType: inferMediaType(value),
                          }));
                        }}
                        className="flex-1 bg-transparent outline-none font-bold text-sm"
                      />
                    </div>
                    {activeQuestion.mediaUrl && (
                      <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                        {activeQuestion.mediaType === "video" ? (
                          <video
                            src={activeQuestion.mediaUrl}
                            controls
                            preload="metadata"
                            className="w-full h-48 md:h-64 object-cover"
                          />
                        ) : (
                          <img
                            src={activeQuestion.mediaUrl}
                            alt="Preview"
                            loading="lazy"
                            decoding="async"
                            className="w-full h-48 md:h-64 object-cover"
                          />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black uppercase tracking-widest opacity-50">
                        Вопрос {activeQuestionIndex + 1}
                      </label>
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase text-[#229ED9]">
                        <Send size={12} /> TG Lock Off
                      </div>
                    </div>
                    <textarea
                      placeholder="Введите ваш вопрос..."
                      className="w-full p-4 rounded-xl bg-black/5 dark:bg-white/5 border-2 border-transparent focus:border-primary/50 outline-none font-bold resize-none h-32"
                      value={activeQuestion.text}
                      onChange={(e) =>
                        updateActiveQuestion((draft) => ({
                          ...draft,
                          text: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-3">
                    {activeQuestion.options.map((opt, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveQuestion((draft) => ({
                              ...draft,
                              correctIndex: index,
                            }))
                          }
                          className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs border-2 transition-all",
                            index === activeQuestion.correctIndex
                              ? "bg-green-500 border-green-500 text-white"
                              : "border-black/10 dark:border-white/10 opacity-50",
                          )}
                        >
                          {String.fromCharCode(65 + index)}
                        </button>
                        <input
                          type="text"
                          placeholder={`Вариант ${index + 1}`}
                          className="flex-1 p-4 rounded-xl bg-black/5 dark:bg-white/5 border-2 border-transparent focus:border-primary/50 outline-none font-bold"
                          value={opt}
                          onChange={(e) =>
                            updateActiveQuestion((draft) => ({
                              ...draft,
                              options: draft.options.map((item, idx) =>
                                idx === index ? e.target.value : item,
                              ),
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-white/5">
                    <button
                      onClick={() =>
                        updateActiveQuestion((draft) => ({
                          ...draft,
                          requiresSubscription: !draft.requiresSubscription,
                        }))
                      }
                      className="w-full flex items-center justify-between p-4 rounded-xl bg-[#229ED9]/5 border border-[#229ED9]/20 hover:bg-[#229ED9]/10 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-[#229ED9]/20 text-[#229ED9]">
                          <Lock size={16} />
                        </div>
                        <div className="text-left">
                          <div className="text-xs font-black uppercase tracking-tight text-[#229ED9]">
                            Обязательная подписка
                          </div>
                          <div className="text-[10px] font-medium opacity-50">
                            Заблокировать этот вопрос до подписки
                          </div>
                        </div>
                      </div>
                      <div
                        className={cn(
                          "w-10 h-5 rounded-full p-1 relative transition-all",
                          activeQuestion.requiresSubscription
                            ? "bg-[#229ED9]"
                            : "bg-black/20 dark:bg-white/10",
                        )}
                      >
                        <div
                          className={cn(
                            "w-3 h-3 bg-white rounded-full transition-all",
                            activeQuestion.requiresSubscription
                              ? "translate-x-5"
                              : "translate-x-0",
                          )}
                        />
                      </div>
                    </button>
                  </div>
                  {needsChannelUrl && (
                    <div className="space-y-3 p-5 rounded-[1.5rem] bg-[#229ED9]/5 border border-[#229ED9]/20">
                      <label className="text-xs font-black uppercase tracking-widest text-[#229ED9]">
                        URL канала для проверки подписки
                      </label>
                      <input
                        type="text"
                        placeholder="https://t.me/your_channel"
                        value={channelUrl}
                        onChange={(e) => setChannelUrl(e.target.value)}
                        className="w-full p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-[#229ED9]/20 outline-none font-bold"
                      />
                    </div>
                  )}
                </div>

                <Button
                  variant="glass"
                  className="w-full border-dashed border-2 py-6"
                  onClick={handleAddQuestion}
                >
                  <Plus className="mr-2" /> Добавить вопрос
                </Button>

                <div className="flex gap-4 pt-4">
                  <Button
                    onClick={() => setStep(2)}
                    variant="glass"
                    className="flex-1 py-8 text-xl"
                  >
                    Назад
                  </Button>
                  <Button
                    onClick={handlePublish}
                  disabled={isPublishing || Boolean(validationError)}
                    className="flex-[2] py-8 text-xl bg-gradient-to-r from-green-500 to-emerald-600 shadow-lg shadow-green-500/20"
                  >
                    {isPublishing ? "Публикуем..." : "Опубликовать"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default CreateQuizView;
