import React from "react";
import { cn } from "../../lib/cn";

export type BadgeVariant = "success" | "warning" | "default";

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const BadgeComponent = ({ children, className, variant = "default" }: BadgeProps) => (
  <span
    className={cn(
      "px-3 py-1 rounded-full text-xs font-bold",
      variant === "success" &&
        "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20",
      variant === "warning" &&
        "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20",
      variant === "default" && "bg-secondary text-secondary-foreground",
      className,
    )}
  >
    {children}
  </span>
);

export const Badge = React.memo(BadgeComponent);
