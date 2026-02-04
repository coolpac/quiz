import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import compression from "compression";
import quizRoutes from "./routes/quiz";
import meRoutes from "./routes/me";
import statsRoutes from "./routes/stats";
import healthRoutes from "./routes/health";
import { initSocket } from "./socket";
import { telegramWebhook } from "./bot";
import { apiLimiter } from "./middleware/rateLimit";
import { flushNow } from "./services/answerBuffer";
import { prisma } from "./lib/prisma";

const app = express();
const appOrigin = process.env.APP_URL || "*";
app.use(
  cors({
    origin: appOrigin,
    credentials: Boolean(process.env.APP_URL),
  }),
);
app.use(compression());
app.use(express.json({ limit: "1mb" }));

app.use("/api", apiLimiter);
app.use("/api/me", meRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/health", healthRoutes);
app.use("/webhook/telegram", telegramWebhook);

const server = http.createServer(app);
initSocket(server);

const port = Number(process.env.PORT) || 3001;
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

const shutdown = (signal: string) => {
  console.log(`[shutdown] received ${signal}, flushing buffers...`);
  Promise.resolve()
    .then(() => flushNow())
    .catch((error) => {
      console.error("[shutdown] failed to flush answers", error);
    })
    .finally(async () => {
      try {
        await prisma.$disconnect();
      } catch (error) {
        console.error("[shutdown] failed to disconnect prisma", error);
      }
      server.close(() => {
        process.exit(0);
      });
      setTimeout(() => {
        process.exit(1);
      }, 10000).unref();
    });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
