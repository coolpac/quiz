import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { prisma } from "./lib/prisma";
import { ensureQuizExpiry } from "./services/quizLifecycle";
import { markPlayersCountDirty } from "./services/socketThrottle";
import { adminRoom, quizRoom, setIO } from "./socketState";

export const initSocket = (server: HttpServer) => {
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
  const io = new Server(server, {
    cors: {
      origin: appOrigin,
    },
    pingInterval: 25000,
    pingTimeout: 60000,
    transports: ["websocket", "polling"],
    perMessageDeflate: false,
    maxHttpBufferSize: 1e5,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
  });
  setIO(io);

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
