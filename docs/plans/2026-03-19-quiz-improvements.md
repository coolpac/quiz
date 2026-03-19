# Quiz Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve Max bot (remove mini-app button, show active quizzes via deep links), add quiz activation toggle in admin panel, show active quizzes on HomeView, ensure quality admin statistics display.

**Architecture:** Server-side changes add new endpoints and modify Max bot handler. Frontend adds active quizzes section on HomeView and toggle controls in AdminDashboard. Max bot uses deep links (`https://max.ru/botname?start=quizId`) with `bot_started` payload to open specific quizzes.

**Tech Stack:** Node.js/Express/Prisma (backend), React/Tailwind/Framer Motion (frontend), Max Bot API (platform-api.max.ru)

---

### Task 1: Max Bot — Remove Mini-App Buttons

**Files:**
- Modify: `server/src/max-bot/handler.ts`

**Step 1: Remove link buttons from /start handler**

In `handleMessage`, for the `/start` command, remove the first button row (`type: "link"` to APP_URL). Keep only callback buttons:

```typescript
// In handleMessage, /start command — replace buttons array:
buttons: [
  [
    {
      type: "callback",
      text: "🎮 Активные квизы",
      payload: "active_quizzes",
    },
  ],
  [
    {
      type: "callback",
      text: "📖 Помощь",
      payload: "help",
    },
    {
      type: "callback",
      text: "🏆 Рейтинг",
      payload: "leaderboard",
    },
  ],
],
```

**Step 2: Remove link button from /play handler**

Replace the `/play` handler to show active quizzes instead of a link:

```typescript
if (text === "/play") {
  await sendActiveQuizzes(client, chatId);
  return;
}
```

**Step 3: Remove link button from bot_started handler**

In `handleBotStarted`, remove the link button. Also handle deep link payload (quizId):

```typescript
async function handleBotStarted(client: MaxBotClient, update: MaxUpdate): Promise<void> {
  const chatId = update.chat_id;
  const userName = update.user?.name || "друг";
  if (!chatId) return;

  // Handle deep link with quiz ID
  const payload = update.payload;
  if (payload) {
    await sendQuizInfo(client, chatId, payload);
    return;
  }

  await client.sendMessage(
    chatId,
    `👋 **Привет, ${userName}!**\n\n` +
      "Я бот **Киберслон** — квиз-платформа.\n\n" +
      "🎯 Отправь /play чтобы увидеть активные квизы!",
    {
      format: "markdown",
      buttons: [
        [
          {
            type: "callback",
            text: "🎮 Активные квизы",
            payload: "active_quizzes",
          },
        ],
      ],
    }
  );
}
```

**Step 4: Remove link button from leaderboard callback**

In `handleCallback`, leaderboard case — remove the link button, just show text:

```typescript
case "leaderboard":
  await client.sendMessage(
    chatId,
    "🏆 **Рейтинг**\n\n" +
      "Рейтинг доступен внутри каждого квиза.\nОтправь /play чтобы выбрать квиз!",
    { format: "markdown" }
  );
  break;
```

**Step 5: Build and verify no TypeScript errors**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

---

### Task 2: Max Bot — Active Quizzes & Deep Links

**Files:**
- Modify: `server/src/max-bot/handler.ts`

**Step 1: Add prisma import and active quizzes helper**

Add at the top of handler.ts:

```typescript
import { prisma } from "../lib/prisma";
```

Add helper function to fetch and send active quizzes:

```typescript
async function sendActiveQuizzes(client: MaxBotClient, chatId: number): Promise<void> {
  const now = new Date();
  const quizzes = await prisma.quiz.findMany({
    where: { isActive: true, isPublic: true, expiresAt: { gt: now } },
    include: { _count: { select: { questions: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (quizzes.length === 0) {
    await client.sendMessage(
      chatId,
      "😔 Сейчас нет активных квизов.\n\nПопробуй позже!",
      { format: "markdown" }
    );
    return;
  }

  const MAX_BOT_USERNAME = process.env.MAX_BOT_USERNAME || "";
  const lines = quizzes.map(
    (q, i) => `${i + 1}. **${q.title}** — ${q.category}, ${q._count.questions} вопросов`
  );

  const buttons: InlineButton[][] = quizzes.map((q) => [
    {
      type: "callback" as const,
      text: `🎮 ${q.title}`,
      payload: `quiz:${q.id}`,
    },
  ]);

  await client.sendMessage(
    chatId,
    `🎯 **Активные квизы (${quizzes.length}):**\n\n${lines.join("\n")}`,
    { format: "markdown", buttons }
  );
}
```

**Step 2: Add quiz info helper for deep links**

```typescript
async function sendQuizInfo(client: MaxBotClient, chatId: number, quizId: string): Promise<void> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { _count: { select: { questions: true, attempts: { where: { isFirstAttempt: true } } } } },
  });

  if (!quiz || !quiz.isActive || quiz.expiresAt < new Date()) {
    await client.sendMessage(chatId, "😔 Этот квиз больше не активен.", { format: "markdown" });
    return;
  }

  await client.sendMessage(
    chatId,
    `🎯 **${quiz.title}**\n\n` +
      `📂 Категория: ${quiz.category}\n` +
      `❓ Вопросов: ${quiz._count.questions}\n` +
      `👥 Играло: ${quiz._count.attempts}\n` +
      `⏱ Время на вопрос: ${quiz.timePerQuestion} сек`,
    {
      format: "markdown",
      buttons: [
        [
          {
            type: "link",
            text: "🎮 Играть",
            url: `${APP_URL}?quizId=${quiz.id}`,
          },
        ],
      ],
    }
  );
}
```

**Step 3: Handle quiz callback in handleCallback**

Add new case in the switch:

```typescript
default:
  if (cb.payload.startsWith("quiz:")) {
    const quizId = cb.payload.slice(5);
    await sendQuizInfo(client, chatId, quizId);
  } else {
    console.log("[Max bot] unknown callback:", cb.payload);
  }
```

**Step 4: Handle active_quizzes callback**

Add case before default:

```typescript
case "active_quizzes":
  await sendActiveQuizzes(client, chatId);
  break;
```

**Step 5: Build and verify**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

---

### Task 3: Backend — Active Quizzes Endpoint

**Files:**
- Modify: `server/src/routes/quiz.ts`

**Step 1: Add GET /active endpoint**

Add before the `router.get("/:id"` route (important — must come before parameterized route):

```typescript
router.get("/active", async (_req, res) => {
  const now = new Date();
  const quizzes = await prisma.quiz.findMany({
    where: { isActive: true, isPublic: true, expiresAt: { gt: now } },
    include: {
      _count: {
        select: {
          questions: true,
          attempts: { where: { isFirstAttempt: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  res.json({
    quizzes: quizzes.map((quiz) => ({
      id: quiz.id,
      title: quiz.title,
      category: quiz.category,
      difficulty: quiz.difficulty,
      questionsCount: quiz._count.questions,
      playersCount: quiz._count.attempts,
      timePerQuestion: quiz.timePerQuestion,
    })),
  });
});
```

Note: This endpoint does NOT require auth (public listing of active quizzes).

**Step 2: Build and verify**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

---

### Task 4: Backend — Toggle Quiz Active Endpoint

**Files:**
- Modify: `server/src/routes/quiz.ts`

**Step 1: Add PATCH /:id/toggle-active endpoint**

Add after the PUT route:

```typescript
router.patch("/:id/toggle-active", adminOnly, async (req, res) => {
  const id = getRouteId(req.params.id);
  const visitor = req.visitor;

  if (!id) {
    res.status(400).json({ error: "Quiz id is required" });
    return;
  }

  if (!visitor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    select: { creatorId: true, isActive: true },
  });

  if (!quiz) {
    res.status(404).json({ error: "Quiz not found" });
    return;
  }

  if (quiz.creatorId !== visitor.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const updated = await prisma.quiz.update({
    where: { id },
    data: { isActive: !quiz.isActive },
    select: { isActive: true },
  });

  res.json({ isActive: updated.isActive });
});
```

**Step 2: Build and verify**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

---

### Task 5: Frontend — API Client Updates

**Files:**
- Modify: `src/api.ts`

**Step 1: Add getActiveQuizzes method**

```typescript
async getActiveQuizzes() {
  const response = await fetch(`${baseUrl}/api/quiz/active`);

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<{
    quizzes: Array<{
      id: string;
      title: string;
      category: string;
      difficulty: string;
      questionsCount: number;
      playersCount: number;
      timePerQuestion: number;
    }>;
  }>;
},
```

**Step 2: Add toggleQuizActive method**

```typescript
async toggleQuizActive(quizId: string) {
  const response = await fetch(`${baseUrl}/api/quiz/${quizId}/toggle-active`, {
    method: "PATCH",
    headers: buildHeaders(true),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<{ isActive: boolean }>;
},
```

**Step 3: Verify TypeScript**

Run: `cd /Users/who/Квиз/telegram-quiz-app && npx tsc --noEmit`
Expected: No errors

---

### Task 6: Frontend — HomeView Active Quizzes

**Files:**
- Modify: `src/views/HomeView.tsx`

**Step 1: Convert to stateful component and add active quizzes**

Convert HomeView from arrow-function component to one that fetches active quizzes on mount. Add a section between the hero and feature cards showing active quiz cards. Each card shows title, category, difficulty badge, question count, and player count. Clicking navigates to that quiz.

Props change: add `onPlayQuiz: (quizId: string) => void` callback.

The active quizzes section should:
- Fetch from `api.getActiveQuizzes()` on mount
- Show loading skeleton while fetching
- Show "Нет активных квизов" if empty
- Show scrollable horizontal list of quiz cards
- Each card: title, category tag, "{N} вопросов", "{N} игроков"
- Clicking a card calls `onPlayQuiz(quizId)`

**Step 2: Update App.tsx to pass onPlayQuiz**

Add handler in App.tsx that sets quizId and navigates to quiz view:

```typescript
// In App.tsx, add state setter for quizId:
const [quizId, setQuizId] = useState<string | null>(initialQuizId ?? null);

// Add onPlayQuiz handler to HomeView:
<HomeView
  onStart={() => { ... }}
  onAdmin={() => setView("admin")}
  onCreate={() => setView("create")}
  isAdmin={isAdmin}
  hasQuizId={Boolean(quizId)}
  onPlayQuiz={(id) => {
    setQuizId(id);
    setView("quiz");
  }}
/>
```

Note: `quizId` is currently a `const` from `useState`. Change to include setter.

**Step 3: Verify build**

Run: `cd /Users/who/Квиз/telegram-quiz-app && npx tsc --noEmit`

---

### Task 7: Frontend — Admin Dashboard Toggle

**Files:**
- Modify: `src/views/AdminDashboard.tsx`

**Step 1: Import Power/PowerOff icon**

Add to lucide-react imports:

```typescript
import { ..., Power, ... } from "lucide-react";
```

**Step 2: Add toggle button to quiz cards**

In the quizzes tab, each quiz card (around line 889-999), add a toggle button in the button group. Place it before the "Редактировать" button:

```tsx
<Button
  size="sm"
  variant="glass"
  className={cn(
    "w-full",
    quiz.isActive
      ? "text-orange-400 hover:text-orange-500 hover:bg-orange-500/10 border-orange-500/20"
      : "text-green-400 hover:text-green-500 hover:bg-green-500/10 border-green-500/20"
  )}
  onClick={async () => {
    hapticSelection();
    try {
      const result = await api.toggleQuizActive(quiz.id);
      pushToast(
        result.isActive ? "Квиз активирован" : "Квиз деактивирован",
        "success"
      );
      void refreshMyQuizzes();
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Не удалось изменить статус";
      pushToast(message, "error");
    }
  }}
>
  <Power size={14} className="mr-1" />
  {quiz.isActive ? "Деактивировать" : "Активировать"}
</Button>
```

**Step 3: Update quiz card badge to show isActive status**

Change the badge to show both expiry AND active status:

```tsx
<Badge variant={quiz.isExpired ? "default" : quiz.isActive ? "success" : "warning"}>
  {quiz.isExpired ? "Expired" : quiz.isActive ? "Live" : "Inactive"}
</Badge>
```

Check if Badge has a "warning" variant. If not, use "default" for inactive.

**Step 4: Dim inactive quiz cards**

Add opacity class to inactive quiz cards:

```tsx
<motion.div
  key={quiz.id}
  whileHover={{ y: -5 }}
  className={cn(
    "p-4 sm:p-8 rounded-2xl sm:rounded-[2.5rem] bg-white/5 border border-white/10 hover:border-primary/30 transition-all relative overflow-hidden group",
    !quiz.isActive && !quiz.isExpired && "opacity-60"
  )}
>
```

**Step 5: Verify build**

Run: `cd /Users/who/Квиз/telegram-quiz-app && npx tsc --noEmit`

---

### Task 8: Build & Deploy

**Step 1: Full build check**

Run: `cd /Users/who/Квиз/telegram-quiz-app && cd server && npx tsc --noEmit && cd .. && npx tsc --noEmit`

**Step 2: Deploy to server**

SSH to server and rebuild:
```bash
ssh multiserver "cd /opt/quiz/repo && git pull && docker compose -f docker-compose.prod.yml up -d --build"
```

**Step 3: Verify Max bot webhook**

Test Max bot by sending /start, /play, and checking deep links work.
