import type { Server } from "socket.io";

let io: Server | null = null;

export const quizRoom = (quizId: string) => `quiz:${quizId}`;
export const adminRoom = (quizId: string) => `admin:${quizId}`;

export const setIO = (instance: Server) => {
  io = instance;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO not initialized");
  }
  return io;
};

const getRoomCount = (room: string) => {
  if (!io) {
    return 0;
  }
  return io.sockets.adapter.rooms.get(room)?.size ?? 0;
};

export const emitPlayersCount = (quizId: string) => {
  if (!io) {
    return;
  }
  const room = quizRoom(quizId);
  const count = getRoomCount(room);
  io.to(room).volatile.emit("players:count", { count });
  io.to(adminRoom(quizId)).volatile.emit("players:count", { count });
};
