type ChatMemberResponse = {
  ok: boolean;
  result?: {
    status?: string;
  };
};

const allowedStatuses = new Set([
  "member",
  "administrator",
  "creator",
]);

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

  const response = await fetch(url.toString());
  if (!response.ok) {
    return { subscribed: false, status: "request_failed" };
  }

  const data = (await response.json()) as ChatMemberResponse;
  const status = data.result?.status ?? "unknown";
  const subscribed = allowedStatuses.has(status);

  return { subscribed, status };
};
