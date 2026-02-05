import { io, type Socket } from "socket.io-client";

const socketUrl =
  import.meta.env.VITE_WS_URL ??
  import.meta.env.VITE_API_URL ??
  window.location.origin;

export type SocketStatus =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "disconnected"
  | "error";

let socketStatus: SocketStatus = "disconnected";
const statusSubscribers = new Set<(status: SocketStatus) => void>();

export const getSocketStatus = () => socketStatus;
export const subscribeSocketStatus = (listener: (status: SocketStatus) => void) => {
  statusSubscribers.add(listener);
  return () => {
    statusSubscribers.delete(listener);
  };
};

const setSocketStatus = (status: SocketStatus) => {
  socketStatus = status;
  statusSubscribers.forEach((listener) => listener(status));
};

const shouldForcePolling = () => {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
    deviceMemory?: number;
    hardwareConcurrency?: number;
  };
  if (nav.connection?.saveData) {
    return true;
  }
  if (nav.connection?.effectiveType?.includes("2g")) {
    return true;
  }
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) {
    return true;
  }
  if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4) {
    return true;
  }
  if (typeof window.devicePixelRatio === "number" && window.devicePixelRatio <= 1.5) {
    return true;
  }
  return false;
};

let socket: Socket | null = null;
let usageCount = 0;

export const getSocket = () => {
  if (!socket) {
    const forcePolling = shouldForcePolling();
    const transports = forcePolling ? ["polling"] : ["websocket", "polling"];
    socket = io(socketUrl, {
      autoConnect: false,
      transports,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
      timeout: 30000,
      closeOnBeforeunload: false,
    });
    if (forcePolling) {
      console.info("[socket] forcing polling transport on low-end device");
    }
    socket.on("connect", () => {
      setSocketStatus("connected");
      console.info("[socket] connected", socket?.id);
    });
    socket.on("disconnect", (reason) => {
      setSocketStatus("disconnected");
      console.warn("[socket] disconnected", reason);
    });
    socket.on("connect_error", (error) => {
      setSocketStatus("error");
      console.warn("[socket] connect_error", error?.message ?? error);
    });
    socket.io.on("reconnect_attempt", (attempt) => {
      setSocketStatus("reconnecting");
      console.info("[socket] reconnect_attempt", attempt);
    });
    socket.io.on("reconnect", (attempt) => {
      setSocketStatus("connected");
      console.info("[socket] reconnect", attempt);
    });
    socket.io.on("reconnect_error", (error) => {
      setSocketStatus("error");
      console.warn("[socket] reconnect_error", error?.message ?? error);
    });
    socket.io.on("reconnect_failed", () => {
      setSocketStatus("disconnected");
      console.warn("[socket] reconnect_failed");
    });
  }
  return socket;
};

export const connectSocket = () => {
  const instance = getSocket();
  usageCount += 1;
  if (!instance.connected) {
    setSocketStatus(usageCount > 1 ? "reconnecting" : "connecting");
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
