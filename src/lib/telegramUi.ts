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
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  disableVerticalSwipes?: () => void;
  ready?: () => void;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
};

const getTelegramWebApp = () =>
  (
    window as typeof window & {
      Telegram?: {
        WebApp?: WebApp;
      };
    }
  ).Telegram?.WebApp;

const getMaxWebApp = () => window.WebApp;

/** Returns true when running inside Max (not Telegram). */
export const isMaxPlatform = (): boolean => {
  const maxApp = getMaxWebApp();
  const tgApp = getTelegramWebApp();
  return !!(maxApp?.initData) && !tgApp?.ready;
};

let uiInitialized = false;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 20;
const INIT_RETRY_DELAY_MS = 250;

const postTelegramEvent = (eventType: string, eventData?: Record<string, unknown>) => {
  const payload = JSON.stringify({ eventType, eventData });
  if (
    (window as typeof window & { TelegramWebviewProxy?: { postEvent?: (e: string, d: string) => void } })
      .TelegramWebviewProxy?.postEvent
  ) {
    (
      window as typeof window & { TelegramWebviewProxy?: { postEvent?: (e: string, d: string) => void } }
    ).TelegramWebviewProxy?.postEvent?.(eventType, JSON.stringify(eventData ?? {}));
    return;
  }
  if ((window as typeof window & { external?: { notify?: (data: string) => void } }).external?.notify) {
    (window as typeof window & { external?: { notify?: (data: string) => void } }).external?.notify?.(
      payload,
    );
    return;
  }
  window.parent?.postMessage?.(payload, "https://web.telegram.org");
};

export const initTelegramUi = () => {
  if (uiInitialized) {
    return;
  }

  const maxApp = getMaxWebApp();
  const tgApp = getTelegramWebApp();

  // If running inside Max
  if (maxApp?.initData && !tgApp?.ready) {
    uiInitialized = true;
    try { maxApp.ready(); } catch { /* ignore */ }
    try { maxApp.enableClosingConfirmation(); } catch { /* ignore */ }
    // expand/fullscreen/disableVerticalSwipes do NOT exist in Max — skip silently
    return;
  }

  // Telegram path
  if (!tgApp) {
    if (initAttempts < MAX_INIT_ATTEMPTS) {
      initAttempts += 1;
      window.setTimeout(initTelegramUi, INIT_RETRY_DELAY_MS);
    }
    return;
  }

  uiInitialized = true;
  tgApp.ready?.();
  tgApp.expand?.();
  postTelegramEvent("web_app_expand");
  tgApp.enableClosingConfirmation?.();
  postTelegramEvent("web_app_setup_closing_behavior", { need_confirmation: true });
  tgApp.disableVerticalSwipes?.();
  postTelegramEvent("web_app_setup_swipe_behavior", { allow_vertical_swipe: false });
  const attemptFullscreen = () => {
    if (!tgApp.requestFullscreen) {
      postTelegramEvent("web_app_request_fullscreen");
      return;
    }
    try {
      tgApp.requestFullscreen();
    } catch {
      // ignore unsupported fullscreen attempts
      postTelegramEvent("web_app_request_fullscreen");
    }
  };

  // Try immediately and once after first user interaction.
  window.setTimeout(attemptFullscreen, 200);
  const onFirstInteraction = () => {
    attemptFullscreen();
    window.removeEventListener("pointerdown", onFirstInteraction);
  };
  window.addEventListener("pointerdown", onFirstInteraction, { once: true });
};

export const hapticImpact = (
  style: "light" | "medium" | "heavy" | "rigid" | "soft" = "light",
) => {
  try {
    // Try Telegram first
    const tgHaptics = getTelegramWebApp()?.HapticFeedback;
    if (tgHaptics?.impactOccurred) {
      tgHaptics.impactOccurred(style);
      return;
    }
    // Max fallback
    const maxApp = getMaxWebApp();
    if (maxApp?.HapticFeedback?.impactOccurred) {
      maxApp.HapticFeedback.impactOccurred(style);
      return;
    }
    // Raw postMessage fallback for Telegram
    postTelegramEvent("web_app_trigger_haptic_feedback", {
      type: "impact",
      impact_style: style,
    });
  } catch { /* ignore */ }
};

export const hapticNotify = (type: "success" | "error" | "warning") => {
  try {
    const tgHaptics = getTelegramWebApp()?.HapticFeedback;
    if (tgHaptics?.notificationOccurred) {
      tgHaptics.notificationOccurred(type);
      return;
    }
    const maxApp = getMaxWebApp();
    if (maxApp?.HapticFeedback?.notificationOccurred) {
      maxApp.HapticFeedback.notificationOccurred(type);
      return;
    }
    postTelegramEvent("web_app_trigger_haptic_feedback", {
      type: "notification",
      notification_type: type,
    });
  } catch { /* ignore */ }
};

export const hapticSelection = () => {
  try {
    const tgHaptics = getTelegramWebApp()?.HapticFeedback;
    if (tgHaptics?.selectionChanged) {
      tgHaptics.selectionChanged();
      return;
    }
    const maxApp = getMaxWebApp();
    if (maxApp?.HapticFeedback?.selectionChanged) {
      maxApp.HapticFeedback.selectionChanged();
      return;
    }
    postTelegramEvent("web_app_trigger_haptic_feedback", {
      type: "selection_change",
    });
  } catch { /* ignore */ }
};

/** Close the mini app (works on both Telegram and Max). */
export const closePlatformApp = () => {
  try {
    const maxApp = getMaxWebApp();
    if (maxApp?.close) {
      maxApp.close();
      return;
    }
  } catch { /* ignore */ }
};

/** Share a link (works on both Telegram and Max). Returns true if handled. */
export const sharePlatformURL = (url: string, text?: string): boolean => {
  try {
    const maxApp = getMaxWebApp();
    if (maxApp?.shareContent) {
      maxApp.shareContent(text ?? "", url);
      return true;
    }
  } catch { /* ignore */ }
  return false;
};
