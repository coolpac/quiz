type ChatMemberResponse = {
  ok: boolean;
  result?: {
    status?: string;
  };
  error_code?: number;
  description?: string;
};

const allowedStatuses = new Set([
  "member",
  "administrator",
  "creator",
]);

const deniedStatuses = new Set(["left", "kicked"]);

export const checkSubscription = async (
  telegramId: bigint,
  channelId?: string | null,
) => {
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
