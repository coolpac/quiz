type ChatMemberResponse = {
  ok: boolean;
  result?: {
    status?: string;
  };
  error_code?: number;
  description?: string;
};

type MaxMembersResponse = {
  members?: Array<{
    user_id?: number;
    name?: string;
    username?: string;
  }>;
};

const allowedStatuses = new Set([
  "member",
  "administrator",
  "creator",
]);

const deniedStatuses = new Set(["left", "kicked"]);

/**
 * Check subscription for Telegram users via Telegram Bot API getChatMember.
 */
export const checkSubscription = async (
  telegramId: bigint,
  channelId?: string | null,
  platform?: string,
) => {
  if (platform === "max") {
    return checkMaxSubscription(telegramId, channelId);
  }

  const botToken = process.env.BOT_TOKEN;
  const resolvedChannelId = channelId ?? process.env.CHANNEL_ID;

  if (!botToken || !resolvedChannelId) {
    return { subscribed: false, status: "missing_config" };
  }

  const url = new URL(`https://api.telegram.org/bot${botToken}/getChatMember`);
  url.searchParams.set("chat_id", resolvedChannelId);
  url.searchParams.set("user_id", telegramId.toString());

  try {
    const response = await fetch(url.toString());
    const data = (await response.json()) as ChatMemberResponse;

    if (!data.ok) {
      const errorDesc = data.description?.toLowerCase() ?? "";
      if (
        data.error_code === 400 &&
        (errorDesc.includes("user not found") ||
          errorDesc.includes("chat not found") ||
          errorDesc.includes("bad request"))
      ) {
        return { subscribed: false, status: "not_found" };
      }
      if (data.error_code === 403) {
        return {
          subscribed: false,
          status: "bot_not_admin",
        };
      }
      return { subscribed: false, status: "request_failed" };
    }

    const status = data.result?.status ?? "unknown";
    if (deniedStatuses.has(status)) {
      return { subscribed: false, status };
    }
    const subscribed = allowedStatuses.has(status);

    return { subscribed, status };
  } catch (error) {
    return { subscribed: false, status: "network_error" };
  }
};

/**
 * Check subscription for Max users via Max Bot API GET /chats/{chatId}/members?user_ids=...
 * Accepts numeric chat_id or username — resolves automatically.
 */
async function checkMaxSubscription(
  userId: bigint,
  channelId?: string | null,
) {
  const maxBotToken = process.env.MAX_BOT_TOKEN;
  if (!maxBotToken || !channelId) {
    return { subscribed: false, status: "missing_config" };
  }

  // Resolve username/link to numeric chat_id if needed
  const { resolveMaxChatId } = await import("../max-bot/handler");
  const numericChatId = await resolveMaxChatId(channelId);
  if (!numericChatId) {
    return { subscribed: false, status: "chat_not_found" };
  }

  try {
    const url = new URL(`https://platform-api.max.ru/chats/${numericChatId}/members`);
    url.searchParams.set("user_ids", userId.toString());

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: maxBotToken,
      },
    });

    if (!response.ok) {
      if (response.status === 403) {
        return { subscribed: false, status: "bot_not_admin" };
      }
      if (response.status === 404) {
        return { subscribed: false, status: "not_found" };
      }
      return { subscribed: false, status: "request_failed" };
    }

    const data = (await response.json()) as MaxMembersResponse;
    const members = data.members ?? [];
    const isMember = members.some(
      (m) => m.user_id?.toString() === userId.toString(),
    );

    return { subscribed: isMember, status: isMember ? "member" : "not_found" };
  } catch (error) {
    return { subscribed: false, status: "network_error" };
  }
}
