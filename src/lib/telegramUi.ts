type WebAppHaptics = {
  impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  notificationOccurred?: (type: "success" | "error" | "warning") => void;
  selectionChanged?: () => void;
};

type WebApp = {
  HapticFeedback?: WebAppHaptics;
  colorScheme?: "light" | "dark";
  expand?: () => void;
  requestFullscreen?: () => void;
  ready?: () => void;
};

const getWebApp = () =>
  (
    window as typeof window & {
      Telegram?: {
        WebApp?: WebApp;
      };
    }
  ).Telegram?.WebApp;

export const initTelegramUi = () => {
  const webApp = getWebApp();
  if (!webApp) {
    return;
  }
  webApp.ready?.();
  webApp.expand?.();
  webApp.requestFullscreen?.();
};

export const hapticImpact = (
  style: "light" | "medium" | "heavy" | "rigid" | "soft" = "light",
) => {
  const haptics = getWebApp()?.HapticFeedback;
  haptics?.impactOccurred?.(style);
};

export const hapticNotify = (type: "success" | "error" | "warning") => {
  const haptics = getWebApp()?.HapticFeedback;
  haptics?.notificationOccurred?.(type);
};

export const hapticSelection = () => {
  const haptics = getWebApp()?.HapticFeedback;
  haptics?.selectionChanged?.();
};
