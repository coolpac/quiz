interface MaxWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

interface MaxWebAppData {
  query_id?: string;
  auth_date: number;
  hash: string;
  start_param?: string;
  user?: MaxWebAppUser;
  chat?: { id: number; type: string };
}

interface MaxHapticFeedback {
  impactOccurred(style: 'soft' | 'light' | 'medium' | 'heavy' | 'rigid', disableVibrationFallback?: boolean): void;
  notificationOccurred(type: 'error' | 'success' | 'warning', disableVibrationFallback?: boolean): void;
  selectionChanged(disableVibrationFallback?: boolean): void;
}

interface MaxBackButton {
  isVisible: boolean;
  show(): void;
  hide(): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
}

interface MaxWebApp {
  initData: string;
  initDataUnsafe: MaxWebAppData;
  platform: string;
  version: string;
  ready(): void;
  close(): void;
  openLink(url: string): void;
  openMaxLink(url: string): void;
  shareContent(text: string, link?: string): void;
  shareMaxContent(params: { text?: string; link?: string; mid?: string; chatType?: string }): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  openCodeReader(fileSelect?: boolean): void;
  onEvent(event: string, callback: (...args: unknown[]) => void): void;
  offEvent(event: string, callback: (...args: unknown[]) => void): void;
  HapticFeedback: MaxHapticFeedback;
  BackButton: MaxBackButton;
}

declare global {
  interface Window {
    WebApp?: MaxWebApp;
  }
}

export {};
