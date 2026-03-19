import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { init, retrieveLaunchParams, retrieveRawInitData } from '@telegram-apps/sdk-react';
import './index.css';
import App from './App.tsx';
import { setTelegramInitData, setPlatform } from './api';
import { initWebPerf } from './lib/perf';
import { initTelegramUi } from './lib/telegramUi';

type LaunchData = {
  quizId?: string;
  initDataRaw?: string;
  startedFromParam: boolean;
  platform: "telegram" | "max";
};

const getMaxInitData = (): { initData?: string; startParam?: string } => {
  try {
    const webApp = (window as any).WebApp;
    if (webApp?.initData) {
      return {
        initData: webApp.initData,
        startParam: webApp.initDataUnsafe?.start_param,
      };
    }
  } catch {
    // Max Bridge not available
  }
  return {};
};

const getLaunchData = (): LaunchData => {
  let startParam: string | undefined;
  let initDataRaw: string | undefined;
  let detectedPlatform: "telegram" | "max" = "telegram";

  try {
    init();
    const launchParams = retrieveLaunchParams(true) as {
      startParam?: string;
      initDataRaw?: string;
      tgWebAppStartParam?: string;
      tgWebAppData?: { startParam?: string };
      tgWebAppDataRaw?: string;
    };
    startParam =
      launchParams?.startParam ??
      launchParams?.tgWebAppStartParam ??
      launchParams?.tgWebAppData?.startParam;
    initDataRaw =
      launchParams?.initDataRaw ?? launchParams?.tgWebAppDataRaw ?? undefined;
  } catch {
    startParam = undefined;
    initDataRaw = undefined;
  }

  if (!initDataRaw) {
    try {
      initDataRaw = retrieveRawInitData();
    } catch {
      initDataRaw = undefined;
    }
  }

  // If Telegram SDK didn't provide init data, try Max Bridge
  if (!initDataRaw) {
    const maxData = getMaxInitData();
    if (maxData.initData) {
      initDataRaw = maxData.initData;
      startParam = startParam ?? maxData.startParam;
      detectedPlatform = "max";
    }
  }

  const urlQuizId = new URLSearchParams(window.location.search).get('quizId') ?? undefined;

  return {
    quizId: startParam ?? urlQuizId,
    initDataRaw,
    startedFromParam: Boolean(startParam),
    platform: detectedPlatform,
  };
};

const launchData = getLaunchData();
setTelegramInitData(launchData.initDataRaw);
setPlatform(launchData.platform);
initWebPerf();
initTelegramUi();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      initialQuizId={launchData.quizId}
      startedFromParam={launchData.startedFromParam}
    />
  </StrictMode>,
);
