# Quiz V2 Phase 1: Scoring, Streaks, Explanations, Power-ups, Podium, Results

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform quiz gameplay from basic to premium — Kahoot-style scoring, streaks, power-ups, explanations, podium ceremony, and detailed results with mistake review.

**Architecture:** New scoring formula replaces old `100 + timeLeft*10`. Streak/power-up state tracked client-side per attempt. New Quiz model fields control feature toggles. Server returns richer data on `/complete`. Frontend renders new gamification UI components.

**Tech Stack:** Prisma (schema changes), Express (route changes), React + Framer Motion (UI), Tailwind CSS

---

### Task 1: Schema — Add quiz settings + question explanation

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Add new fields to Quiz model**

After `startedByAdminAt DateTime?` (line 24), add:

```prisma
  enableStreaks       Boolean  @default(true)
  enablePowerUps      Boolean  @default(false)
  enableExplanations  Boolean  @default(true)
  enablePodium        Boolean  @default(true)
  shuffleQuestions    Boolean  @default(false)
  shuffleOptions      Boolean  @default(false)
  enableTeams         Boolean  @default(false)
  teamCount           Int      @default(2)
  selfPaced           Boolean  @default(false)
```

**Step 2: Add explanation field to Question model**

After `order Int` (line 42), add:

```prisma
  questionType  String   @default("multiple_choice")
  explanation   String?
```

**Step 3: Push schema to database**

Run: `cd server && npx prisma db push`
Expected: Schema synced

**Step 4: Generate Prisma client**

Run: `cd server && npx prisma generate`

**Step 5: Type-check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```
git add server/prisma/schema.prisma
git commit -m "feat: add quiz settings and question explanation to schema"
```

---

### Task 2: Backend — New scoring formula + streak bonus

**Files:**
- Create: `server/src/services/scoring.ts`
- Modify: `server/src/routes/quiz.ts` (answer route, ~line 402-404)

**Step 1: Create scoring service**

Create `server/src/services/scoring.ts`:

```typescript
/**
 * Kahoot-style scoring: faster answer = more points.
 * Max 1000 (instant), Min 500 (at deadline), 0 if wrong.
 */
export const calculateScore = (
  isCorrect: boolean,
  responseTimeMs: number,
  questionTimerMs: number,
): number => {
  if (!isCorrect) return 0;
  const ratio = Math.min(responseTimeMs / questionTimerMs, 1);
  return Math.round(1000 * (1 - ratio / 2));
};

/**
 * Streak bonus: consecutive correct answers earn bonus points.
 * 2 in a row = +100, 3 = +200, 4 = +300, 5+ = +500 (capped)
 */
export const calculateStreakBonus = (streakCount: number): number => {
  if (streakCount < 2) return 0;
  if (streakCount === 2) return 100;
  if (streakCount === 3) return 200;
  if (streakCount === 4) return 300;
  return 500;
};
```

**Step 2: Update answer route scoring**

In `server/src/routes/quiz.ts`, replace the scoring lines (~line 402-404):

Old:
```typescript
const isCorrect = parsedAnswerIndex === question.correctIndex;
const safeTimeLeft = Math.max(0, parsedTimeLeft || 0);
const score = isCorrect ? 100 + safeTimeLeft * 10 : 0;
```

New:
```typescript
const isCorrect = parsedAnswerIndex === question.correctIndex;
const safeTimeLeft = Math.max(0, parsedTimeLeft || 0);
// timeLeft is in seconds, questionTimer is in seconds
// responseTime = questionTimer - timeLeft
const quiz_settings = await prisma.quiz.findUnique({
  where: { id },
  select: { timePerQuestion: true },
});
const questionTimerSec = quiz_settings?.timePerQuestion ?? 15;
const responseTimeSec = questionTimerSec - safeTimeLeft;
const score = calculateScore(isCorrect, responseTimeSec * 1000, questionTimerSec * 1000);
```

Add import at top:
```typescript
import { calculateScore } from "../services/scoring";
```

**Step 3: Update answer response to include explanation**

In the response JSON (~line 449-455), add explanation:

```typescript
res.json({
  isCorrect,
  correctIndex: question.correctIndex,
  score,
  stats,
  isFirstAttempt: attempt.isFirstAttempt,
  explanation: question.explanation ?? null,
});
```

**Step 4: Type-check and verify**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```
git add server/src/services/scoring.ts server/src/routes/quiz.ts
git commit -m "feat: Kahoot-style scoring formula + streak bonus calculator"
```

---

### Task 3: Backend — Enhanced /complete response with answer review

**Files:**
- Modify: `server/src/routes/quiz.ts` (complete route, ~line 458-558)

**Step 1: Return per-question answers on completion**

In the complete route, after `const totalScore = scoreSum._sum?.score ?? 0;` (~line 517), add query to fetch player's answers with question data:

```typescript
const playerAnswers = await prisma.answer.findMany({
  where: { attemptId: attempt.id },
  include: {
    question: {
      select: {
        text: true,
        options: true,
        correctIndex: true,
        explanation: true,
        order: true,
        questionType: true,
      },
    },
  },
  orderBy: { answeredAt: "asc" },
});

const answersReview = playerAnswers.map((a) => ({
  questionIndex: a.question.order,
  questionText: a.question.text,
  options: a.question.options as string[],
  playerAnswer: a.answerIndex,
  correctAnswer: a.question.correctIndex,
  isCorrect: a.isCorrect,
  score: a.score,
  timeLeft: a.timeLeft,
  explanation: a.question.explanation,
}));
```

**Step 2: Add to response**

In the final `res.json(...)`, add `answersReview`:

```typescript
res.json({
  isFirstAttempt: attempt.isFirstAttempt,
  rank: leaderboard.rank,
  totalPlayers: leaderboard.totalPlayers,
  previousCorrectCount: firstAttempt?.correctCount ?? null,
  previousTotalQuestions: firstAttempt?.totalQuestions ?? null,
  answersReview,
});
```

**Step 3: Type-check**

Run: `cd server && npx tsc --noEmit`

**Step 4: Commit**

```
git add server/src/routes/quiz.ts
git commit -m "feat: return per-question answer review on quiz completion"
```

---

### Task 4: Backend — Quiz settings in create/update + GET response

**Files:**
- Modify: `server/src/services/quiz.ts`
- Modify: `server/src/routes/quiz.ts` (GET /:id route)

**Step 1: Update CreateQuizInput type and createQuiz**

In `server/src/services/quiz.ts`, add to `CreateQuizInput`:

```typescript
enableStreaks?: boolean;
enablePowerUps?: boolean;
enableExplanations?: boolean;
enablePodium?: boolean;
shuffleQuestions?: boolean;
shuffleOptions?: boolean;
enableTeams?: boolean;
teamCount?: number;
selfPaced?: boolean;
```

In `createQuiz`, add to `prisma.quiz.create` data:

```typescript
enableStreaks: input.enableStreaks ?? true,
enablePowerUps: input.enablePowerUps ?? false,
enableExplanations: input.enableExplanations ?? true,
enablePodium: input.enablePodium ?? true,
shuffleQuestions: input.shuffleQuestions ?? false,
shuffleOptions: input.shuffleOptions ?? false,
enableTeams: input.enableTeams ?? false,
teamCount: input.teamCount ?? 2,
selfPaced: input.selfPaced ?? false,
```

Also update `questions.create` to include:

```typescript
explanation: question.explanation ?? null,
questionType: question.questionType ?? "multiple_choice",
```

And add to `CreateQuestionInput`:

```typescript
explanation?: string;
questionType?: string;
```

Do the same for `updateQuiz`.

**Step 2: Add settings to GET /:id response**

In the GET route response (~line 170-184), add quiz settings:

```typescript
res.json({
  quiz: {
    ...existing fields...,
    enableStreaks: quiz.enableStreaks,
    enablePowerUps: quiz.enablePowerUps,
    enableExplanations: quiz.enableExplanations,
    enablePodium: quiz.enablePodium,
    shuffleQuestions: quiz.shuffleQuestions,
    shuffleOptions: quiz.shuffleOptions,
    enableTeams: quiz.enableTeams,
    teamCount: quiz.teamCount,
    selfPaced: quiz.selfPaced,
    questions: questions.map(q => ({
      ...existing fields...,
      explanation: q.explanation,
      questionType: q.questionType,
    })),
  },
  isFirstAttempt: !firstAttempt,
});
```

**Step 3: Type-check**

Run: `cd server && npx tsc --noEmit`

**Step 4: Commit**

```
git add server/src/services/quiz.ts server/src/routes/quiz.ts
git commit -m "feat: quiz settings in create/update/get endpoints"
```

---

### Task 5: Frontend — Streak counter + visual feedback in QuizView

**Files:**
- Modify: `src/views/QuizView.tsx`

**Step 1: Add streak state**

Add new state variables (near existing score/correctCount state, ~line 35):

```typescript
const [streak, setStreak] = useState(0);
const [showStreakAnim, setShowStreakAnim] = useState(false);
const [showConfetti, setShowConfetti] = useState(false);
const [showShake, setShowShake] = useState(false);
const [lastExplanation, setLastExplanation] = useState<string | null>(null);
const [usedPowerUps, setUsedPowerUps] = useState<Set<string>>(new Set());
const [activePowerUp, setActivePowerUp] = useState<string | null>(null);
```

**Step 2: Update handleAnswer to track streak + show explanation**

In `handleAnswer` (~line 611-618), after receiving response:

```typescript
const answerScore = Number(response.score) || 0;
const isCorrect = Boolean(response.isCorrect);

// Apply 2x power-up
const finalScore = activePowerUp === "double" ? answerScore * 2 : answerScore;

// Track streak
if (isCorrect) {
  const newStreak = streak + 1;
  setStreak(newStreak);
  if (newStreak >= 2 && quiz?.enableStreaks) {
    setShowStreakAnim(true);
    setTimeout(() => setShowStreakAnim(false), 1500);
  }
  setShowConfetti(true);
  setTimeout(() => setShowConfetti(false), 1000);
} else {
  if (activePowerUp !== "shield") {
    setStreak(0);
  }
  setShowShake(true);
  setTimeout(() => setShowShake(false), 500);
}

// Show explanation
if (response.explanation && quiz?.enableExplanations) {
  setLastExplanation(response.explanation);
}

setActivePowerUp(null);
const nextScore = score + finalScore;
```

**Step 3: Add streak counter UI**

After the timer display, add streak counter:

```tsx
{quiz?.enableStreaks && streak >= 2 && (
  <motion.div
    initial={{ scale: 0 }}
    animate={{ scale: 1 }}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/20 border border-orange-500/30"
  >
    <span className="text-orange-400 text-lg">🔥</span>
    <span className="text-orange-400 font-black text-sm">{streak}x STREAK</span>
  </motion.div>
)}
```

**Step 4: Add confetti and shake animations**

Wrap answer buttons area with shake animation:

```tsx
<motion.div animate={showShake ? { x: [-10, 10, -10, 10, 0] } : {}} transition={{ duration: 0.4 }}>
  {/* existing answer buttons */}
</motion.div>
```

Add confetti overlay (simple particles with framer-motion):

```tsx
<AnimatePresence>
  {showConfetti && (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
      className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
    >
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ y: 0, x: 0, scale: 1 }}
          animate={{
            y: -200 - Math.random() * 200,
            x: (Math.random() - 0.5) * 300,
            scale: 0,
            rotate: Math.random() * 360,
          }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute w-3 h-3 rounded-full"
          style={{
            backgroundColor: ["#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7"][i % 6],
          }}
        />
      ))}
    </motion.div>
  )}
</AnimatePresence>
```

**Step 5: Add explanation card**

After answer feedback, show explanation if available:

```tsx
<AnimatePresence>
  {lastExplanation && (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mt-3 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20"
    >
      <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1">Объяснение</div>
      <div className="text-sm text-white/80">{lastExplanation}</div>
    </motion.div>
  )}
</AnimatePresence>
```

Clear explanation on next question advance.

**Step 6: Add power-ups UI**

Below the answer buttons, show power-up icons when enabled:

```tsx
{quiz?.enablePowerUps && selected === null && (
  <div className="flex justify-center gap-4 mt-4">
    {[
      { id: "double", icon: "⭐", label: "2x", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
      { id: "freeze", icon: "❄️", label: "+5с", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
      { id: "shield", icon: "🛡️", label: "Щит", color: "text-green-400 bg-green-500/10 border-green-500/20" },
    ]
      .filter((p) => !usedPowerUps.has(p.id))
      .map((p) => (
        <motion.button
          key={p.id}
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            hapticSelection();
            setActivePowerUp(activePowerUp === p.id ? null : p.id);
            setUsedPowerUps((prev) => new Set(prev).add(p.id));
          }}
          className={cn(
            "flex flex-col items-center gap-1 p-3 rounded-2xl border transition-all",
            p.color,
            activePowerUp === p.id && "ring-2 ring-primary scale-105"
          )}
        >
          <span className="text-xl">{p.icon}</span>
          <span className="text-[10px] font-bold">{p.label}</span>
        </motion.button>
      ))}
  </div>
)}
```

Handle freeze power-up: when activated, add 5 seconds to the current timer state.

**Step 7: Type-check**

Run: `cd /Users/who/Квиз/telegram-quiz-app && npx tsc --noEmit`

**Step 8: Commit**

```
git add src/views/QuizView.tsx
git commit -m "feat: streaks, confetti, shake, explanations, power-ups UI"
```

---

### Task 6: Frontend — Podium + Enhanced ResultView

**Files:**
- Modify: `src/views/ResultView.tsx`
- Modify: `src/types/quiz.ts`

**Step 1: Update QuizResults type**

In `src/types/quiz.ts`, add to `QuizResults`:

```typescript
answersReview?: Array<{
  questionIndex: number;
  questionText: string;
  options: string[];
  playerAnswer: number;
  correctAnswer: number;
  isCorrect: boolean;
  score: number;
  timeLeft: number;
  explanation?: string | null;
}>;
enablePodium?: boolean;
```

**Step 2: Add Podium component to ResultView**

Before the existing score display, add podium section:

```tsx
{/* Podium TOP-3 */}
{results.enablePodium && leaderboard.length >= 3 && (
  <motion.div
    initial={{ opacity: 0, y: 40 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.3 }}
    className="flex items-end justify-center gap-3 mb-8 h-48"
  >
    {/* 2nd place */}
    <div className="flex flex-col items-center">
      <div className="text-sm font-bold truncate max-w-[80px]">{leaderboard[1]?.name}</div>
      <div className="text-xs text-white/50">{leaderboard[1]?.score}</div>
      <motion.div
        initial={{ height: 0 }}
        animate={{ height: 100 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="w-20 bg-gradient-to-t from-gray-500/30 to-gray-400/20 rounded-t-xl flex items-start justify-center pt-2"
      >
        <span className="text-2xl">🥈</span>
      </motion.div>
    </div>
    {/* 1st place */}
    <div className="flex flex-col items-center">
      <div className="text-sm font-bold truncate max-w-[80px]">{leaderboard[0]?.name}</div>
      <div className="text-xs text-white/50">{leaderboard[0]?.score}</div>
      <motion.div
        initial={{ height: 0 }}
        animate={{ height: 140 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="w-24 bg-gradient-to-t from-yellow-500/30 to-yellow-400/20 rounded-t-xl flex items-start justify-center pt-2"
      >
        <span className="text-3xl">🥇</span>
      </motion.div>
    </div>
    {/* 3rd place */}
    <div className="flex flex-col items-center">
      <div className="text-sm font-bold truncate max-w-[80px]">{leaderboard[2]?.name}</div>
      <div className="text-xs text-white/50">{leaderboard[2]?.score}</div>
      <motion.div
        initial={{ height: 0 }}
        animate={{ height: 70 }}
        transition={{ delay: 0.8, duration: 0.4 }}
        className="w-20 bg-gradient-to-t from-orange-700/30 to-orange-600/20 rounded-t-xl flex items-start justify-center pt-2"
      >
        <span className="text-2xl">🥉</span>
      </motion.div>
    </div>
  </motion.div>
)}
```

**Step 3: Add "Review Mistakes" section**

After the leaderboard section, add collapsible mistake review:

```tsx
{results.answersReview && results.answersReview.length > 0 && (
  <div className="mt-8 space-y-3">
    <h3 className="text-lg font-black">Разбор ответов</h3>
    {results.answersReview.map((a, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.05 }}
        className={cn(
          "p-4 rounded-2xl border",
          a.isCorrect
            ? "bg-green-500/5 border-green-500/20"
            : "bg-red-500/5 border-red-500/20"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-bold">{a.questionText}</div>
          <span className="text-lg shrink-0">{a.isCorrect ? "✅" : "❌"}</span>
        </div>
        {!a.isCorrect && (
          <div className="mt-2 text-xs space-y-1">
            <div className="text-red-400">Ваш ответ: {a.options[a.playerAnswer]}</div>
            <div className="text-green-400">Правильный: {a.options[a.correctAnswer]}</div>
          </div>
        )}
        {a.explanation && (
          <div className="mt-2 text-xs text-blue-400/80 italic">{a.explanation}</div>
        )}
        <div className="mt-1 text-[10px] text-white/30 font-bold">+{a.score} очков</div>
      </motion.div>
    ))}
  </div>
)}
```

**Step 4: Update completeAndFinish in QuizView**

Pass `answersReview` and `enablePodium` from the completion response to `onFinish`:

```typescript
onFinish({
  score: finalScore,
  correctCount: finalCorrectCount,
  totalQuestions: totalQ,
  isFirstAttempt: Boolean(response.isFirstAttempt),
  quizId: quizId ?? "",
  previousCorrectCount: response.previousCorrectCount,
  previousTotalQuestions: response.previousTotalQuestions,
  answersReview: response.answersReview ?? [],
  enablePodium: quiz?.enablePodium ?? true,
});
```

**Step 5: Type-check + build**

Run: `cd /Users/who/Квиз/telegram-quiz-app && npx tsc --noEmit && npx vite build`

**Step 6: Commit**

```
git add src/views/ResultView.tsx src/views/QuizView.tsx src/types/quiz.ts
git commit -m "feat: podium TOP-3, answer review with explanations in results"
```

---

### Task 7: Frontend — Quiz settings in CreateQuizView

**Files:**
- Modify: `src/views/CreateQuizView.tsx`

**Step 1: Add explanation field to QuestionDraft**

```typescript
type QuestionDraft = {
  ...existing fields...
  explanation: string;
  questionType: string;
};
```

Update `createEmptyQuestion` to include `explanation: ""` and `questionType: "multiple_choice"`.

**Step 2: Add settings state**

Add state variables for quiz settings:

```typescript
const [enableStreaks, setEnableStreaks] = useState(true);
const [enablePowerUps, setEnablePowerUps] = useState(false);
const [enableExplanations, setEnableExplanations] = useState(true);
const [enablePodium, setEnablePodium] = useState(true);
const [shuffleQuestions, setShuffleQuestions] = useState(false);
const [shuffleOptions, setShuffleOptions] = useState(false);
```

**Step 3: Add settings UI in Step 1 (quiz metadata)**

After existing settings (isPublic, waitForAdminStart), add a "Геймификация" section:

```tsx
<div className="space-y-3">
  <h4 className="text-sm font-bold uppercase tracking-widest text-white/50">Геймификация</h4>
  {[
    { label: "Стрики", desc: "Бонус за серию правильных ответов", value: enableStreaks, set: setEnableStreaks },
    { label: "Power-ups", desc: "Усиления: 2x очки, заморозка, щит", value: enablePowerUps, set: setEnablePowerUps },
    { label: "Объяснения", desc: "Пояснение после каждого ответа", value: enableExplanations, set: setEnableExplanations },
    { label: "Подиум ТОП-3", desc: "Церемония победителей в конце", value: enablePodium, set: setEnablePodium },
    { label: "Шаффл вопросов", desc: "Случайный порядок вопросов", value: shuffleQuestions, set: setShuffleQuestions },
    { label: "Шаффл ответов", desc: "Случайный порядок вариантов", value: shuffleOptions, set: setShuffleOptions },
  ].map((s) => (
    <label key={s.label} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
      <div>
        <div className="text-sm font-bold">{s.label}</div>
        <div className="text-[10px] text-white/40">{s.desc}</div>
      </div>
      <input
        type="checkbox"
        checked={s.value}
        onChange={() => s.set(!s.value)}
        className="w-5 h-5 accent-primary"
      />
    </label>
  ))}
</div>
```

**Step 4: Add explanation textarea in question editor**

After the correct answer selector, add:

```tsx
{enableExplanations && (
  <div className="mt-3">
    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Объяснение (необязательно)</label>
    <textarea
      value={activeQuestion.explanation}
      onChange={(e) => updateQuestion(activeQuestionIndex, { explanation: e.target.value })}
      placeholder="Почему этот ответ правильный..."
      className="w-full mt-1 p-3 rounded-xl bg-white/5 border border-white/10 text-sm resize-none"
      rows={2}
    />
  </div>
)}
```

**Step 5: Pass settings to API on publish**

In the publish handler, add settings to the API call:

```typescript
const result = await api.createQuiz({
  ...existing fields...,
  enableStreaks,
  enablePowerUps,
  enableExplanations,
  enablePodium,
  shuffleQuestions,
  shuffleOptions,
  questions: questions.map((q, index) => ({
    ...existing fields...,
    explanation: q.explanation || undefined,
    questionType: q.questionType,
  })),
});
```

**Step 6: Update api.ts createQuiz/updateQuiz types**

Add new fields to the `createQuiz` and `updateQuiz` data types in `src/api.ts`.

**Step 7: Type-check + build**

Run: `cd /Users/who/Квиз/telegram-quiz-app && npx tsc --noEmit && npx vite build`

**Step 8: Commit**

```
git add src/views/CreateQuizView.tsx src/api.ts
git commit -m "feat: quiz gamification settings + explanation field in editor"
```

---

### Task 8: Fix hardcoded online counter + Admin CSV export

**Files:**
- Modify: `src/views/HomeView.tsx` (online counter)
- Modify: `server/src/routes/stats.ts` (add global online count)
- Modify: `src/views/AdminDashboard.tsx` (CSV export button)
- Modify: `server/src/routes/quiz.ts` (add CSV export endpoint)

**Step 1: Add global player count API**

In `server/src/routes/stats.ts`, add endpoint before `router.use(validateTelegramInitData)` or use a public route:

Create it via the socket state module — track total connected players:

```typescript
// In server/src/socketState.ts — add:
let globalPlayerCount = 0;
export const getGlobalPlayerCount = () => globalPlayerCount;
export const setGlobalPlayerCount = (count: number) => { globalPlayerCount = count; };
```

Update socket.ts `connection`/`disconnect` handlers to track count.

Add endpoint in stats router (before auth middleware):
```typescript
router.get("/online", (_req, res) => {
  res.json({ count: getGlobalPlayerCount() });
});
```

**Step 2: Fix HomeView online counter**

Replace hardcoded "1,429" with real count fetched from `/api/stats/online`.

**Step 3: Add CSV export endpoint**

In `server/src/routes/quiz.ts`, add:
```
GET /:id/export-csv (adminOnly)
```
Returns CSV with columns: Player, Score, Accuracy, Time, Per-question answers.

**Step 4: Add export button in AdminDashboard**

In the active quiz monitoring section, add "Экспорт CSV" button.

**Step 5: Type-check + build**

**Step 6: Commit**

```
git commit -m "feat: real online counter, CSV export for quiz results"
```

---

### Task 9: Deploy Phase 1

**Step 1: Full build check**

Run: `cd /Users/who/Квиз/telegram-quiz-app && cd server && npx tsc --noEmit && cd .. && npx tsc --noEmit && npx vite build`

**Step 2: Push and deploy**

```bash
git push
ssh multiserver "cd /opt/quiz/repo && git pull && docker compose -f docker-compose.prod.yml up -d --build"
```

**Step 3: Verify health**

```bash
ssh multiserver "curl -s localhost:8080/api/health/ping"
ssh multiserver "curl -s localhost:8080/api/quiz/active"
```
