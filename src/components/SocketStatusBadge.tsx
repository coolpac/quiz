import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { getSocketStatus, subscribeSocketStatus, type SocketStatus } from "../socket";

const STATUS_LABELS: Record<SocketStatus, string> = {
  connected: "Онлайн",
  connecting: "Подключение",
  reconnecting: "Переподключение",
  disconnected: "Оффлайн",
  error: "Ошибка сети",
};

const STATUS_STYLES: Record<SocketStatus, string> = {
  connected: "bg-green-500/15 text-green-600 border-green-500/30",
  connecting: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  reconnecting: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  disconnected: "bg-red-500/15 text-red-600 border-red-500/30",
  error: "bg-red-500/15 text-red-600 border-red-500/30",
};

const DOT_STYLES: Record<SocketStatus, string> = {
  connected: "bg-green-500",
  connecting: "bg-yellow-500 animate-pulse",
  reconnecting: "bg-yellow-500 animate-pulse",
  disconnected: "bg-red-500",
  error: "bg-red-500",
};

type SocketStatusBadgeProps = {
  className?: string;
};

const SocketStatusBadge = ({ className }: SocketStatusBadgeProps) => {
  const [status, setStatus] = useState<SocketStatus>(getSocketStatus());

  useEffect(() => subscribeSocketStatus(setStatus), []);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] uppercase tracking-widest font-black",
        STATUS_STYLES[status],
        className,
      )}
    >
      <span className={cn("w-2 h-2 rounded-full", DOT_STYLES[status])} />
      {STATUS_LABELS[status]}
    </div>
  );
};

export default SocketStatusBadge;
