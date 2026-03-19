# Подготовка к нагрузочному тесту (100+ пользователей)

## Симптомы прошлого теста
- ~100–120 участников
- Таблица лидеров появилась через ~10 минут
- В админке почти ничего не видно
- «Не удалось зафиксировать ответ, попробуйте снова» — многие не могли ответить
- Сервер eventually упал

---

## Карта возможных причин

| Симптом | Вероятная причина | Файл/место |
|--------|--------------------|------------|
| «Не удалось зафиксировать ответ» | 503 от API при перегрузке Redis/очереди | `quiz.ts:384`, `answerBuffer.ts` |
| Ответы не проходят | Consumer не успевает, backlog в Redis Stream растёт | `consumer.ts`, `answerStream.ts` |
| Лидерборд 10 минут | Тяжёлые запросы к БД, перегрузка пула соединений | `leaderboard.ts`, `getInProgressEntries` |
| Админка пустая/не грузится | `groupBy(visitorId)` по всем попыткам + много запросов | `stats.ts:44` |
| Падение сервера | OOM (512M), event loop блокируется долгими запросами | `docker-compose.prod.yml` |

---

## Чеклист перед тестом

### 1. Мониторинг (чтобы сразу видеть причины)

**Добавить в `.env` или env сервера:**
```bash
# Для consumer — видеть backlog в логах
ANSWER_BACKLOG_GROW_THRESHOLD=1   # warn при первом росте

# Логирование для отладки (опционально)
# DEBUG=*
```

**Полезные команды во время теста:**
```bash
# Список stream-ключей и их длина (redis-cli в контейнере redis)
docker exec quiz-redis-1 redis-cli SMEMBERS quiz:answer_streams
docker exec quiz-redis-1 redis-cli XLEN quiz:answers:QUIZ_ID

# Использование памяти контейнеров
docker stats quiz-api-1 quiz-consumer-1 --no-stream

# Активные соединения к Postgres
docker exec quiz-db-1 psql -U quiz -d quiz -c "SELECT count(*) FROM pg_stat_activity;"
```

### 2. Улучшения кода (по приоритету)

**Уже внедрено:**
- Оптимизация админ-дашборда: `groupBy(visitorId)` заменён на `COUNT(DISTINCT)` — одна быстрая выборка вместо тяжёлого groupBy.
- Оптимизация лидерборда: `getInProgressEntries` теперь один SQL с GROUP BY вместо N+1 загрузки answers.
- Socket.IO: `bufferutil` и `utf-8-validate` (опциональные нативные аддоны для ws) — ускорение WebSocket.
- Socket.IO: `rawSocket.request = null` — экономия ~1–2 KB памяти на соединение.
- Socket.IO: **Redis Adapter** — при `REDIS_URL` включается автоматически. Позволяет масштабироваться на 2+ инстанса API: все инстансы синхронизируют комнаты через Redis Pub/Sub. **Важно:** при нескольких инстансах нужны sticky sessions (session affinity) на load balancer, иначе Socket.IO даст HTTP 400.
- `answerBuffer` в `socketThrottle` ограничен до 300 событий на квиз (FIFO при переполнении).
- `flushLeaderboard` параллельно обрабатывает несколько квизов (`Promise.all`).
- docker-compose: API 768M, consumer 384M, Redis 256M; consumer env: POLL_MS=200, BATCH_SIZE=1000.

#### A. Ускорить consumer (уже в docker-compose, можно тюнить)
```bash
ANSWER_STREAM_POLL_MS=200      # чаще проверять
ANSWER_STREAM_BATCH_SIZE=1000  # больший batch (если Postgres тянет)
```

#### B. Лидерборд — известная особенность
- `leaderboardVisitor` хранит одного visitor на квиз → все в room получают `rank` последнего ответившего. Для персонализации нужна привязка socket ↔ visitorId при `quiz:join`.

#### C. Redis — проверка backlog (используй redis-cli в контейнере)
- В docker-compose уже 256mb. При росте стримов — следить через `redis-cli INFO memory`.

### 3. Тестовый сценарий (чтобы воспроизвести и проверить)

1. **Перед тестом:** перезапустить всё, очистить старые данные (или использовать тестовый квиз).
2. **Во время теста:** смотреть:
   - `docker stats` — память API и consumer
   - `docker logs quiz-api-1 -f` — 503, ошибки Redis
   - `docker logs quiz-consumer-1 -f` — `[consumer] backlog growing`
3. **После теста:** сохранить логи:
   ```bash
   docker logs quiz-api-1 --tail=5000 > api.log
   docker logs quiz-consumer-1 --tail=1000 > consumer.log
   docker logs quiz-db-1 --tail=500 > db.log
   ```

### 4. Резервный план (если опять начнёт падать)

- Временно увеличить `ANSWER_STREAM_BATCH_SIZE` и `ANSWER_STREAM_POLL_MS` (обработка быстрее).
- Упростить лидерборд: показывать только top 15 без in-progress при высокой нагрузке.
- Отключить загрузку аватарок Telegram (уже есть таймаут, но при проблемах с сетью — дополнительная нагрузка).
- Добавить rate limit на `POST /answer` (чтобы не добить сервер пиковыми запросами).

---

## Как масштабируются топовые квиз-приложения (HQ Trivia, Kahoot, Mentimeter, Wooclap)

Источники: [Trembit](https://trembit.com/blog/hq-trivia-software-architecture/), [Ably](https://ably.com/topic/multiplayer-quiz-app-architecture), [Google Cloud Kahoot](https://cloud.google.com/customers/kahoot), [Medium C10M](https://medium.com/@anilgeit/solving-the-c10m-problem-for-a-real-time-trivia-platform-with-microservices-aws-java-8-and-node-js-4eb1297d5f53).

### Масштабы

| Приложение | Одновременных пользователей | Особенности |
|------------|-----------------------------|-------------|
| HQ Trivia | 600K средний, 1.7M пик (Super Bowl) | Пики 2× в день, ~10 сек на ответ — все отвечают почти одновременно |
| Kahoot | Миллионы, 8 млрд участников всего | 200+ микросервисов, GKE, Cloud Pub/Sub |
| Mentimeter | 0 → 70K+ за секунды, цель 150K+ | Быстрый рост в начале сессии |
| Wooclap | 500K+ учителей, десятки тысяч сообщений на класс | Burst-нагрузка при ответах |

### Главные архитектурные подходы

**1. Ответы — не напрямую в БД**  
БД физически не успевает принять миллионы записей за 10 секунд. Стандартный подход:

- Redis / in-memory кэш между клиентами и PostgreSQL
- Буферизация и батчирование записей
- Очереди (Kafka, Redis Streams) для асинхронной записи в БД

*У нас: Redis Stream + consumer — тот же паттерн.*

**2. Разделение слоёв**  
- Node.js — WebSocket-соединения (легковесные, событийные)
- Java/Netty или отдельные воркеры — тяжёлая обработка и валидация
- Kafka — распределение событий по микросервисам

**3. Managed realtime (Ably, Pub/Sub)**  
Kahoot, Mentimeter, Wooclap используют внешние сервисы:

- Ably Realtime, Google Pub/Sub
- Гарантированная доставка, восстановление после разрывов
- Нет необходимости разворачивать свою Pub/Sub-инфраструктуру

**4. Горизонтальное масштабирование**  
- Load balancer + несколько инстансов API
- Redis Adapter у Socket.IO — синхронизация комнат между инстансами
- Kubernetes / auto-scaling для пиков

**5. Edge / CDN**  
- Данные ближе к пользователю
- Важно для видео (HQ Trivia) и низкой latency

**6. Оптимизация ОС (C10M)**  
Для миллионов соединений:

- `ulimit -n` — увеличить лимит дескрипторов
- `net.core.somaxconn`, `tcp_fin_timeout` — настройки ядра
- `net.core.netdev_max_backlog` — длина очереди

### Что можно взять для нашего квиза

| Шаг | Сложность | Эффект |
|-----|-----------|--------|
| Redis Adapter для Socket.IO | Средняя | Горизонтальное масштабирование API |
| Внешний Pub/Sub (Ably) | Высокая | Масштаб без своей инфраструктуры |
| PgBouncer перед Postgres | Низкая | Снижение нагрузки на БД за счёт pooling |
| 2–3 реплики API за load balancer | Низкая | Резерв и распределение нагрузки |
| Тюнинг Linux (ulimit, sysctl) | Низкая | Больше соединений на инстанс |

### Вывод

Наш стек (Redis Stream + consumer, буферизация ответов, оптимизация запросов) идёт в ту же сторону, что и у крупных сервисов. Главное отличие — они добавляют **горизонтальное масштабирование** (несколько API + Redis Adapter) и при росте до тысяч+ пользователей — managed realtime (Ably/Pub/Sub). Для 100–500 пользователей обычно достаточно текущей архитектуры и внесённых оптимизаций.

---

## Что проверить после внедрения фиксов

- [ ] Consumer успевает обрабатывать поток при 100 одновременных ответах
- [ ] Backlog Redis Stream не растёт бесконечно
- [ ] Лидерборд обновляется за разумное время (< 30 сек)
- [ ] Админ-дашборд грузится за < 5 сек
- [ ] Нет 503 при обычной нагрузке
- [ ] Память API/consumer стабильна, нет OOM
