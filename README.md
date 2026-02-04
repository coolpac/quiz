# Quiz Mini App

Telegram quiz mini app with real‑time stats, live leaderboard, and admin dashboard.

## Stack
- Frontend: React 19, Vite 7, Tailwind 4, Framer Motion 12, Socket.IO client
- Backend: Node.js, Express 5, Prisma 7 (PostgreSQL), Socket.IO 4, grammy
- Realtime: Socket.IO rooms + throttled emits
- Persistence: PostgreSQL + Redis Streams for zero‑loss answer ingestion

## Project Structure
```
server/                 # backend
src/                    # frontend
```

## Env
```
APP_URL=
BOT_TOKEN=
BOT_USERNAME=
DATABASE_URL=
REDIS_URL=
ADMIN_IDS=123456789,987654321
```

## Backend
```
cd server
npm install
npm run dev
```

### Answers Consumer (Redis Streams)
Producer is part of API, consumer is a separate process:
```
cd server
npm run consume:answers
```

### Health
Admin‑only health endpoint:
```
GET /api/health/consumer
```

### PM2
```
cd server
pm2 start ecosystem.config.cjs
pm2 save
```

### systemd (consumer)
Example service: `server/deploy/quiz-consumer.service`
```
sudo cp server/deploy/quiz-consumer.service /etc/systemd/system/quiz-consumer.service
sudo systemctl daemon-reload
sudo systemctl enable --now quiz-consumer
```

## Frontend
```
npm install
npm run dev
```

## Docker Deploy
```
cp server/.env.example server/.env
cp .env.example .env
```

Build + run:
```
docker compose -f docker-compose.prod.yml up -d --build
```

### HTTPS (nginx + certbot on host)
This expects the web container on port 8080.
```
DOMAIN=annaivaschenko.ru EMAIL=admin@annaivaschenko.ru bash deploy/ssl.sh
```

### Server bootstrap + update scripts
Bootstrap Docker on server:
```
DEPLOY_HOST=81.200.153.155 DEPLOY_USER=root ./deploy/bootstrap.sh
```

Sync and deploy updates:
```
DEPLOY_HOST=81.200.153.155 DEPLOY_USER=root ./deploy/update.sh
```
