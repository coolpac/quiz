# Quiz V2 — Premium Features Design

## Goal
Transform the quiz platform from a functional MVP (55% of top-tier) into a premium-grade product matching Kahoot/Quizizz quality. All new gamification features are per-quiz settings that admins toggle on/off.

## Architecture
All new features build on existing stack (React + Express + Prisma + Socket.IO). New Quiz model fields control feature toggles. Frontend detects enabled features and renders accordingly. Scoring logic moves to a shared module.

---

## 1. Gamification: Streaks + Speed Bonus

**Scoring formula (Kahoot-style):**
`score = 1000 * (1 - (responseTime / questionTimer) / 2)` — instant = 1000, deadline = 500

**Streaks:**
- 2 correct in a row = +100 bonus
- 3 = +200, 4 = +300, 5+ = +500 (capped)
- Visual fire counter with animation on QuizView
- Streak resets on wrong answer (unless Shield power-up active)

**Visual feedback:**
- Confetti burst on correct answer (framer-motion particles)
- Shake animation on wrong answer
- Streak counter with flame icon, grows with streak level

**Quiz setting:** `enableStreaks: Boolean @default(true)`

## 2. Power-Ups

3 power-ups, each usable once per quiz:

| Power-Up | Icon | Effect |
|----------|------|--------|
| 2x Points | Stars | Doubles score for current question |
| Time Freeze | Snowflake | Adds +5 seconds to timer |
| Streak Shield | Shield | Preserves streak on next wrong answer |

**UX:** 3 circular icons at bottom of QuizView. Tap before answering to activate. Used power-up grays out. State tracked client-side per attempt.

**Quiz setting:** `enablePowerUps: Boolean @default(false)`

## 3. Explanations After Answer

**New field on Question model:** `explanation: String?`

After answering, if explanation exists, shows a dismissible card below the answer with the explanation text. Auto-dismisses when next question loads.

**Quiz setting:** `enableExplanations: Boolean @default(true)`

## 4. Podium TOP-3

Animated ceremony after quiz completion:
- 3 podium blocks rise with animation (gold/silver/bronze)
- Player avatars + names + scores on each
- Confetti for 1st place
- Transitions to full leaderboard below

**Quiz setting:** `enablePodium: Boolean @default(true)`

## 5. Question Types: True/False

New question type alongside existing multiple choice:
- `questionType: String @default("multiple_choice")` — values: `multiple_choice`, `true_false`
- True/False renders as 2 large buttons instead of 4 options
- Options array stores `["Правда", "Ложь"]` with correctIndex 0 or 1
- CreateQuizView: type selector per question

## 6. Shuffle

- `shuffleQuestions: Boolean @default(false)` — randomize question order per player
- `shuffleOptions: Boolean @default(false)` — randomize answer option order per question

Shuffle applied client-side on quiz load using seeded random (visitorId + quizId as seed for reproducible order per player).

## 7. Enhanced Results & Leaderboard

**ResultView improvements:**
- Podium TOP-3 at top (if enabled)
- Full leaderboard with scroll (current player highlighted)
- "Review Mistakes" section: each wrong answer shown with correct answer + explanation
- Stats card: accuracy %, avg response time, streak record, rank

**Answer review data:** Server returns per-question results on `/complete` — `answers: [{questionIndex, playerAnswer, correctAnswer, isCorrect, explanation, timeSpent}]`

## 8. Admin Dashboard Improvements

**Fix hardcoded online count:** Replace "1,429 Игроков в сети" with real count from Socket.IO player tracking.

**Dashboard stats additions:**
- Average accuracy across all quizzes
- Most difficult questions (< 35% correct)
- Average completion rate (started vs completed)

**Per-quiz monitoring additions:**
- Per-question accuracy heatmap (green > 70%, yellow 35-70%, red < 35%)
- Average response time per question
- Drop-off chart: % of players who completed each question
- Export results to CSV (player, score, accuracy, per-question answers)

## 9. Team Mode

**Quiz settings:** `enableTeams: Boolean @default(false)`, `teamCount: Int @default(2)` (2-8)

**Auto-assignment:** Round-robin on `quiz:join` — player assigned to team with fewest members. Teams get color labels (Red, Blue, Green, Yellow, Purple, Orange, Cyan, Pink).

**Scoring:** Team score = sum of member scores. Team leaderboard shown alongside individual.

**Socket events:** New `team:score_updated` event. Team badge shown on player's QuizView.

**DB:** New `QuizTeam` model + `teamId` on QuizAttempt.

## 10. Self-Paced Mode

**Quiz setting:** `selfPaced: Boolean @default(false)`

When enabled:
- No synchronized start — each player begins independently
- Per-question timer still applies
- No live feed of other players' answers during play (prevents cheating)
- Leaderboard visible only after completion
- Admin sees individual progress (who's on which question)

## 11. HomeView Enhancements

- Category filter buttons (from existing quiz categories)
- Search by quiz title
- Sort: newest / most popular / ending soon
- "Recently Played" section (from localStorage)

## 12. Word Cloud Question Type

New question type `word_cloud`:
- Players submit 1-3 words (short text input)
- Words aggregated in real-time via Socket.IO
- Most popular words appear largest
- No scoring — engagement tool
- Displayed as animated cloud using CSS grid + font-size scaling

---

## Quiz Settings Summary (new fields on Quiz model)

```
enableStreaks      Boolean @default(true)
enablePowerUps    Boolean @default(false)
enableExplanations Boolean @default(true)
enablePodium      Boolean @default(true)
shuffleQuestions  Boolean @default(false)
shuffleOptions    Boolean @default(false)
enableTeams       Boolean @default(false)
teamCount         Int     @default(2)
selfPaced         Boolean @default(false)
```

## Question Model Additions

```
questionType   String  @default("multiple_choice")  // multiple_choice, true_false, word_cloud
explanation    String?
```

## Implementation Priority Order

1. Scoring formula + streaks + visual feedback (foundation)
2. Explanations + enhanced results with mistake review
3. Power-ups
4. Podium TOP-3
5. True/False questions + shuffle
6. Admin dashboard improvements + CSV export
7. HomeView enhancements (search, filter, sort)
8. Team mode
9. Self-paced mode
10. Word Cloud
