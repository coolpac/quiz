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

export const getTelegramAvatarUrl = async (telegramId: bigint) => {
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

    const photosResponse = await fetch(photosUrl.toString());
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

    const fileResponse = await fetch(fileUrl.toString());
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
    console.error("[telegram] failed to fetch avatar", error);
    setCache(key, null, MISS_TTL_SECONDS);
    return null;
  }
};
