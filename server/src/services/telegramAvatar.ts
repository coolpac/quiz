type TelegramFileResponse = {
  ok: boolean;
  result?: {
    file_path?: string;
  };
};

type TelegramPhotoSize = {
  file_id: string;
  width: number;
  height: number;
};

type TelegramUserProfilePhotosResponse = {
  ok: boolean;
  result?: {
    photos?: TelegramPhotoSize[][];
  };
};

type CacheEntry = {
  url: string | null;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const TTL_SECONDS = Number(process.env.AVATAR_CACHE_TTL_SECONDS ?? 21600);
const MISS_TTL_SECONDS = Number(process.env.AVATAR_MISS_TTL_SECONDS ?? 300);
const FETCH_TIMEOUT_MS = Number(process.env.AVATAR_FETCH_TIMEOUT_MS ?? 5000);

const fetchWithTimeout = (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
};

const getCache = (key: string) => {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.url;
};

const setCache = (key: string, url: string | null, ttlSeconds: number) => {
  cache.set(key, { url, expiresAt: Date.now() + ttlSeconds * 1000 });
};

export const getTelegramAvatarUrl = async (telegramId: bigint, platform?: string) => {
  // Max users have a different user ID space — Telegram API can't resolve them
  if (platform === "max") {
    return null;
  }

  const key = telegramId.toString();
  const cached = getCache(key);
  if (cached !== null || cache.has(key)) {
    return cached;
  }

  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    setCache(key, null, MISS_TTL_SECONDS);
    return null;
  }

  try {
    const photosUrl = new URL(
      `https://api.telegram.org/bot${botToken}/getUserProfilePhotos`,
    );
    photosUrl.searchParams.set("user_id", key);
    photosUrl.searchParams.set("limit", "1");

    const photosResponse = await fetchWithTimeout(photosUrl.toString());
    if (!photosResponse.ok) {
      setCache(key, null, MISS_TTL_SECONDS);
      return null;
    }
    const photosData =
      (await photosResponse.json()) as TelegramUserProfilePhotosResponse;
    const photos = photosData.result?.photos?.[0];
    if (!photos || photos.length === 0) {
      setCache(key, null, MISS_TTL_SECONDS);
      return null;
    }

    const bestSize = photos[photos.length - 1];
    const fileUrl = new URL(`https://api.telegram.org/bot${botToken}/getFile`);
    fileUrl.searchParams.set("file_id", bestSize.file_id);

    const fileResponse = await fetchWithTimeout(fileUrl.toString());
    if (!fileResponse.ok) {
      setCache(key, null, MISS_TTL_SECONDS);
      return null;
    }
    const fileData = (await fileResponse.json()) as TelegramFileResponse;
    const filePath = fileData.result?.file_path;
    if (!filePath) {
      setCache(key, null, MISS_TTL_SECONDS);
      return null;
    }

    const avatarUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    setCache(key, avatarUrl, TTL_SECONDS);
    return avatarUrl;
  } catch (error) {
    const isTimeoutOrNetwork = (() => {
      if (error instanceof Error && error.name === "AbortError") return true;
      const c = error instanceof Error ? (error.cause as { code?: string; errors?: { code?: string }[] }) : null;
      if (c?.code === "ETIMEDOUT" || c?.code === "ECONNRESET" || c?.code === "ENOTFOUND") return true;
      const nested = c?.errors;
      if (Array.isArray(nested) && nested.some((e) => e?.code === "ETIMEDOUT" || e?.code === "ECONNRESET")) return true;
      return false;
    })();
    if (!isTimeoutOrNetwork) {
      console.error("[telegram] failed to fetch avatar", error);
    }
    setCache(key, null, MISS_TTL_SECONDS);
    return null;
  }
};
