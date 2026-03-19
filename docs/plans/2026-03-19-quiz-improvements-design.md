# Quiz Improvements Design

## 1. Max Bot: Remove Mini-App Button

Remove all `link`-type buttons pointing to `APP_URL` from the Max bot handler. Keep callback buttons (Help, Leaderboard). Commands `/start`, `/play`, and `bot_started` event will show text-only messages with command instructions.

**Files:** `server/src/max-bot/handler.ts`

## 2. HomeView: Show Active Quizzes

Add a new API endpoint `GET /api/quiz/active` returning public quizzes where `isActive=true` and `expiresAt > now`. On HomeView, add a section "Активные квизы" showing quiz cards (title, category, difficulty, question count). Clicking a card opens the quiz.

**Files:**
- `server/src/routes/quiz.ts` — new `/active` endpoint
- `src/views/HomeView.tsx` — active quizzes section
- `src/api.ts` — new `getActiveQuizzes()` method

## 3. Admin Panel: Quiz Activation Toggle

Add `PATCH /api/quiz/:id/toggle-active` endpoint (admin-only) that toggles the `isActive` boolean. In AdminDashboard quiz list, add a toggle button per quiz. Inactive quizzes shown with muted styling.

**Files:**
- `server/src/routes/quiz.ts` — new `PATCH /:id/toggle-active` endpoint
- `src/views/AdminDashboard.tsx` — toggle button in quiz cards
- `src/api.ts` — new `toggleQuizActive()` method

## 4. Statistics Bug Fix (DONE)

Fixed 4 bugs in statistics:
- `completedGames` now counts only first attempts (was counting retries)
- `totalAttempts` now counts only first attempts
- `activeQuizzes` now checks `isActive: true` (was ignoring the flag)
- `topQuizzes.plays` and quiz list `attemptsCount` now count only first attempts (was counting retries + incomplete)
