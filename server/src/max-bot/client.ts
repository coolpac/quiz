/**
 * Max Bot API client — raw HTTP wrapper for platform-api.max.ru
 *
 * Auth: Authorization header with bot token.
 * Rate limit: 30 rps.
 */

const BASE_URL = "https://platform-api.max.ru";

export interface MaxUser {
  user_id: number;
  name: string;
  username?: string;
  is_bot?: boolean;
}

export interface MaxMessage {
  sender: MaxUser;
  recipient: { chat_id: number; chat_type: string };
  timestamp: number;
  body: {
    mid: string;
    seq: number;
    text?: string;
    attachments?: unknown[];
  };
  link?: {
    type: string;
    sender: MaxUser;
    chat_id: number;
    message: { mid: string; text?: string };
  };
  stat?: { views: number };
}

export interface MaxUpdate {
  update_type: string;
  timestamp: number;
  message?: MaxMessage;
  callback?: {
    callback_id: string;
    payload: string;
    user: MaxUser;
    message?: MaxMessage;
  };
  message_id?: string;
  chat_id?: number;
  user?: MaxUser;
  payload?: string;
}

export interface MaxBotInfo {
  user_id: number;
  name: string;
  username: string;
  is_bot: boolean;
  commands?: { name: string; description: string }[];
}

export interface InlineButton {
  type:
    | "callback"
    | "link"
    | "request_contact"
    | "request_geo_location"
    | "open_app"
    | "message";
  text: string;
  payload?: string;
  url?: string;
  web_app?: string;
}

export class MaxBotClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>
  ): Promise<T> {
    const url = new URL(path, BASE_URL);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: this.token,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[Max Bot API]", res.status, path, text.slice(0, 500));
      throw new Error(`Max API ${res.status}: ${text.slice(0, 200)}`);
    }

    return res.json() as Promise<T>;
  }

  /** GET /me — get bot info */
  async getMe(): Promise<MaxBotInfo> {
    return this.request("GET", "/me");
  }

  /** PATCH /me — update bot info (name, description, commands) */
  async editBotInfo(info: {
    name?: string;
    description?: string;
    commands?: Array<{ name: string; description: string }>;
  }): Promise<MaxBotInfo> {
    return this.request("PATCH", "/me", info);
  }

  /** POST /messages — send a text message */
  async sendMessage(
    chatId: number,
    text: string,
    options?: {
      format?: "markdown" | "html";
      buttons?: InlineButton[][];
    }
  ): Promise<unknown> {
    const body: Record<string, unknown> = { text };

    if (options?.format) {
      body.format = options.format;
    }

    if (options?.buttons?.length) {
      body.attachments = [
        {
          type: "inline_keyboard",
          payload: {
            buttons: options.buttons,
          },
        },
      ];
    }

    return this.request("POST", "/messages", body, {
      chat_id: String(chatId),
    });
  }

  /** POST /answers — answer a callback */
  async answerCallback(
    callbackId: string,
    message?: string
  ): Promise<unknown> {
    return this.request("POST", "/answers", {
      callback_id: callbackId,
      message: message ? { text: message } : undefined,
    });
  }

  /** POST /subscriptions — subscribe to webhook */
  async subscribe(webhookUrl: string): Promise<unknown> {
    return this.request("POST", "/subscriptions", {
      url: webhookUrl,
    });
  }

  /** GET /subscriptions — get current subscription */
  async getSubscription(): Promise<unknown> {
    return this.request("GET", "/subscriptions");
  }

  /** DELETE /subscriptions — unsubscribe */
  async unsubscribe(): Promise<unknown> {
    return this.request("DELETE", "/subscriptions");
  }

  /** POST /chats/{chatId}/actions — send typing action */
  async sendAction(
    chatId: number,
    action: string = "typing_on"
  ): Promise<unknown> {
    return this.request("POST", `/chats/${chatId}/actions`, {
      action,
    });
  }
}
