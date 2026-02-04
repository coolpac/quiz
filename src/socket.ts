import { io, type Socket } from "socket.io-client";

const socketUrl =
  import.meta.env.VITE_WS_URL ??
  import.meta.env.VITE_API_URL ??
  window.location.origin;

let socket: Socket | null = null;
let usageCount = 0;

export const getSocket = () => {
  if (!socket) {
    socket = io(socketUrl, {
      autoConnect: false,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 20000,
    });
  }
  return socket;
};

export const connectSocket = () => {
  const instance = getSocket();
  usageCount += 1;
  if (!instance.connected) {
    instance.connect();
  }
  return instance;
};

export const releaseSocket = () => {
  usageCount = Math.max(usageCount - 1, 0);
  if (usageCount === 0 && socket?.connected) {
    socket.disconnect();
  }
};
