import React from "react";
import { cn } from "../../lib/cn";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "glass"
  | "danger";

type ButtonSize = "sm" | "default" | "lg" | "icon";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const ButtonComponent = ({
  children,
  variant = "primary",
  size = "default",
  className,
  ...props
}: ButtonProps) => {
  const variants = {
    primary:
      "bg-primary text-primary-foreground hover:brightness-110 shadow-[0_0_20px_rgba(var(--primary),0.3)]",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    outline:
      "border-2 border-primary/20 bg-transparent hover:bg-primary/10 text-primary",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    glass:
      "bg-black/5 dark:bg-white/5 backdrop-blur-md border border-black/5 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 transition-all",
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  };

  const sizes = {
    sm: "h-9 px-4 text-xs",
    default: "h-12 px-6 py-3",
    lg: "h-14 px-8 text-lg",
    icon: "h-12 w-12 p-0",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-2xl font-bold transition-all duration-300 focus:outline-none active:scale-[0.98]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
};

export const Button = React.memo(ButtonComponent);
