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

const getWebApp = () =>
  (
    window as typeof window & {
      Telegram?: {
        WebApp?: WebApp;
      };
    }
  ).Telegram?.WebApp;

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
  const webApp = getWebApp();
  if (!webApp) {
    if (initAttempts < MAX_INIT_ATTEMPTS) {
      initAttempts += 1;
      window.setTimeout(initTelegramUi, INIT_RETRY_DELAY_MS);
    }
    return;
  }
  if (uiInitialized) {
    return;
  }
  uiInitialized = true;
  webApp.ready?.();
  webApp.expand?.();
  postTelegramEvent("web_app_expand");
  webApp.enableClosingConfirmation?.();
  postTelegramEvent("web_app_setup_closing_behavior", { need_confirmation: true });
  webApp.disableVerticalSwipes?.();
  postTelegramEvent("web_app_setup_swipe_behavior", { allow_vertical_swipe: false });
  const attemptFullscreen = () => {
    if (!webApp.requestFullscreen) {
      postTelegramEvent("web_app_request_fullscreen");
      return;
    }
    try {
      webApp.requestFullscreen();
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
  const haptics = getWebApp()?.HapticFeedback;
  if (!haptics?.impactOccurred) {
    postTelegramEvent("web_app_trigger_haptic_feedback", {
      type: "impact",
      impact_style: style,
    });
    return;
  }
  haptics?.impactOccurred?.(style);
};

export const hapticNotify = (type: "success" | "error" | "warning") => {
  const haptics = getWebApp()?.HapticFeedback;
  if (!haptics?.notificationOccurred) {
    postTelegramEvent("web_app_trigger_haptic_feedback", {
      type: "notification",
      notification_type: type,
    });
    return;
  }
  haptics?.notificationOccurred?.(type);
};

export const hapticSelection = () => {
  const haptics = getWebApp()?.HapticFeedback;
  if (!haptics?.selectionChanged) {
    postTelegramEvent("web_app_trigger_haptic_feedback", {
      type: "selection_change",
    });
    return;
  }
  haptics?.selectionChanged?.();
};
