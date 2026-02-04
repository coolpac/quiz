import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { init, retrieveLaunchParams, retrieveRawInitData } from '@telegram-apps/sdk-react';
import './index.css';
import App from './App.tsx';
import { setTelegramInitData } from './api';
import { initWebPerf } from './lib/perf';
import { initTelegramUi } from './lib/telegramUi';

type LaunchData = {
  quizId?: string;
  initDataRaw?: string;
  startedFromParam: boolean;
};

const getLaunchData = (): LaunchData => {
  let startParam: string | undefined;
  let initDataRaw: string | undefined;

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

  const urlQuizId = new URLSearchParams(window.location.search).get('quizId') ?? undefined;

  return {
    quizId: startParam ?? urlQuizId,
    initDataRaw,
    startedFromParam: Boolean(startParam),
  };
};

const launchData = getLaunchData();
setTelegramInitData(launchData.initDataRaw);
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
