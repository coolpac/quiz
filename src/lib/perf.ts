type PerfMetric = {
  name: string;
  value: number;
  unit: "ms" | "score";
};

const TELEGRAM_UA_PATTERN = /(telegram|tgwebview)/i;

export const isTelegramWebView = () => {
  if (typeof window === "undefined") {
    return false;
  }
  const tg = (window as typeof window & { Telegram?: { WebApp?: unknown } }).Telegram;
  if (tg?.WebApp) {
    return true;
  }
  return TELEGRAM_UA_PATTERN.test(navigator.userAgent ?? "");
};

export const initWebPerf = () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  if (!isTelegramWebView()) {
    return;
  }
  const global = window as typeof window & { __quizPerf?: { metrics: PerfMetric[] } };
  if (global.__quizPerf) {
    return;
  }
  global.__quizPerf = { metrics: [] };

  const logged = new Set<string>();
  const logMetric = (name: string, value: number, unit: PerfMetric["unit"]) => {
    if (logged.has(name)) {
      return;
    }
    logged.add(name);
    const rounded = unit === "score" ? Number(value.toFixed(3)) : Math.round(value);
    global.__quizPerf?.metrics.push({ name, value: rounded, unit });
    console.info(`[perf] ${name}: ${rounded}${unit === "ms" ? "ms" : ""}`);
  };

  const logMetricUpdate = (name: string, value: number, unit: PerfMetric["unit"]) => {
    const rounded = unit === "score" ? Number(value.toFixed(3)) : Math.round(value);
    global.__quizPerf?.metrics.push({ name, value: rounded, unit });
    console.info(`[perf] ${name}: ${rounded}${unit === "ms" ? "ms" : ""}`);
  };

  const navEntry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (navEntry?.responseStart) {
    logMetric("TTFB", navEntry.responseStart, "ms");
  } else {
    const timing = performance.timing;
    if (timing?.responseStart && timing.requestStart) {
      logMetric("TTFB", timing.responseStart - timing.requestStart, "ms");
    }
  }

  if ("PerformanceObserver" in window) {
    try {
      const paintObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.name === "first-contentful-paint") {
            logMetric("FCP", entry.startTime, "ms");
          }
        });
      });
      paintObserver.observe({ type: "paint", buffered: true });
    } catch {
      // Ignore unsupported paint observer
    }
  }

  let lcpValue = 0;
  let clsValue = 0;
  let inpValue = 0;
  let lcpObserver: PerformanceObserver | null = null;
  let clsObserver: PerformanceObserver | null = null;
  let inpObserver: PerformanceObserver | null = null;

  if ("PerformanceObserver" in window) {
    try {
      lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          lcpValue = lastEntry.startTime;
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      lcpObserver = null;
    }

    try {
      clsObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const layoutShift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          if (!layoutShift.hadRecentInput) {
            clsValue += layoutShift.value ?? 0;
          }
        });
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch {
      clsObserver = null;
    }

    try {
      inpObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const duration = entry.duration ?? 0;
          if (duration > inpValue) {
            inpValue = duration;
          }
        });
      });
      inpObserver.observe({
        type: "event",
        buffered: true,
      });
    } catch {
      inpObserver = null;
    }
  }

  const flush = () => {
    if (lcpValue > 0) {
      logMetric("LCP", lcpValue, "ms");
    }
    if (clsValue > 0) {
      logMetric("CLS", clsValue, "score");
    }
    if (inpValue > 0) {
      logMetric("INP", inpValue, "ms");
    }
    lcpObserver?.disconnect();
    clsObserver?.disconnect();
    inpObserver?.disconnect();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flush();
    }
  });
  window.addEventListener("pagehide", flush);

  window.setTimeout(() => {
    if (!logged.has("TTFB")) {
      logMetricUpdate("TTFB", performance.now(), "ms");
    }
  }, 0);
};
