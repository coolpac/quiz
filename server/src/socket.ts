import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { prisma } from "./lib/prisma";
import { ensureQuizExpiry } from "./services/quizLifecycle";
import { markPlayersCountDirty } from "./services/socketThrottle";
import { adminRoom, quizRoom, setIO } from "./socketState";

export const initSocket = async (server: HttpServer) => {
  const appOrigins = (process.env.APP_URL ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const appOrigin =
    appOrigins.length > 0
      ? appOrigins
      : process.env.NODE_ENV === "production"
        ? false
        : true;

  const redisUrl = process.env.REDIS_URL;
  let adapter: ReturnType<typeof createAdapter> | undefined;

  if (redisUrl) {
    try {
      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();
      pubClient.on("error", (err) => console.error("[socket] Redis pub:", err.message));
      subClient.on("error", (err) => console.error("[socket] Redis sub:", err.message));
      await Promise.all([pubClient.connect(), subClient.connect()]);
      adapter = createAdapter(pubClient, subClient);
      console.log("[socket] Redis adapter enabled (horizontal scaling ready)");
    } catch (err) {
      console.warn("[socket] Redis adapter init failed, using in-memory adapter:", err);
    }
  }

  const serverOpts = {
    ...(adapter && { adapter }),
    cors: { origin: appOrigin },
    pingInterval: 25000,
    pingTimeout: 60000,
    transports: ["websocket", "polling"],
    perMessageDeflate: false,
    maxHttpBufferSize: 1e5,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
  };
  const io = new Server(server, serverOpts as Partial<import("socket.io").ServerOptions>);
  setIO(io);

  // Экономия памяти: не держим ссылку на первый HTTP request (~1–2 KB на соединение)
  io.engine.on("connection", (rawSocket) => {
    (rawSocket as { request?: unknown }).request = null;
  });

  io.on("connection", (socket) => {
    socket.on("quiz:join", ({ quizId }: { quizId: string }) => {
      if (!quizId) {
        return;
      }
      socket.join(quizRoom(quizId));
      markPlayersCountDirty(quizId);
      void ensureQuizExpiry(quizId);
    });

    socket.on(
      "admin:join",
      async ({ quizId, adminToken }: { quizId: string; adminToken?: string }) => {
        if (!quizId || !adminToken) {
          socket.emit("admin:error", { error: "Unauthorized" });
          return;
        }
        try {
          const quiz = await prisma.quiz.findUnique({
            where: { id: quizId },
            select: { adminToken: true },
          });
          if (!quiz || quiz.adminToken !== adminToken) {
            socket.emit("admin:error", { error: "Unauthorized" });
            return;
          }
          socket.join(adminRoom(quizId));
        } catch {
          socket.emit("admin:error", { error: "Unauthorized" });
        }
      },
    );

    socket.on("wordcloud:submit", (payload: { quizId: string; questionIndex: number; word: string }) => {
      if (!payload.word || typeof payload.word !== "string" || payload.word.length > 30) return;
      if (!payload.quizId || typeof payload.questionIndex !== "number") return;
      const word = payload.word.trim().toLowerCase();
      if (!word) return;
      io.to(quizRoom(payload.quizId)).emit("wordcloud:word", {
        questionIndex: payload.questionIndex,
        word,
      });
      io.to(adminRoom(payload.quizId)).emit("wordcloud:word", {
        questionIndex: payload.questionIndex,
        word,
      });
    });

    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (!room.startsWith("quiz:")) {
          continue;
        }
        const quizId = room.split(":")[1];
        markPlayersCountDirty(quizId);
      }
    });
  });

  return io;
};
