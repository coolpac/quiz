const baseUrl = import.meta.env.VITE_API_URL ?? "";

let telegramInitData = "";

export const setTelegramInitData = (value?: string) => {
  telegramInitData = value ?? "";
};

const buildHeaders = (withBody: boolean) => {
  const headers: Record<string, string> = {};
  headers["X-Telegram-Init-Data"] = telegramInitData;
  if (withBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
};

const parseError = async (response: Response) => {
  try {
    const data = await response.json();
    if (data?.error) {
      return data.error as string;
    }
  } catch {
    // ignore
  }
  return `Request failed (${response.status})`;
};

export const api = {
  async getQuiz(id: string) {
    const response = await fetch(`${baseUrl}/api/quiz/${id}`, {
      headers: buildHeaders(false),
    });

    if (response.status === 410) {
      return response.json();
    }

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  },

  async submitAnswer(
    quizId: string,
    questionIndex: number,
    answerIndex: number,
    timeLeft: number,
    attemptId: string,
  ) {
    const response = await fetch(`${baseUrl}/api/quiz/${quizId}/answer`, {
      method: "POST",
      headers: buildHeaders(true),
      body: JSON.stringify({ questionIndex, answerIndex, timeLeft, attemptId }),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  },

  async completeQuiz(quizId: string, attemptId: string) {
    const response = await fetch(`${baseUrl}/api/quiz/${quizId}/complete`, {
      method: "POST",
      headers: buildHeaders(true),
      body: JSON.stringify({ attemptId }),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  },

  async startAttempt(quizId: string) {
    const response = await fetch(`${baseUrl}/api/quiz/${quizId}/start`, {
      method: "POST",
      headers: buildHeaders(true),
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  },

  async getLeaderboard(quizId: string) {
    const response = await fetch(`${baseUrl}/api/quiz/${quizId}/leaderboard`, {
      headers: buildHeaders(false),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  },

  async checkSubscription(quizId: string) {
    const response = await fetch(
      `${baseUrl}/api/quiz/${quizId}/check-subscription`,
      {
        method: "POST",
        headers: buildHeaders(true),
        body: JSON.stringify({}),
      },
    );

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  },

  async uploadMedia(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${baseUrl}/api/upload/media`, {
      method: "POST",
      headers: buildHeaders(false),
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json() as Promise<{
      url: string;
      mediaType: "image" | "video";
      filename: string;
    }>;
  },

  async createQuiz(data: {
    title: string;
    category: string;
    difficulty: string;
    timePerQuestion: number;
    isPublic: boolean;
    channelUrl?: string | null;
    questions: Array<{
      text: string;
      options: string[];
      correctIndex: number;
      mediaUrl?: string;
      mediaType?: string;
      requiresSubscription?: boolean;
      order: number;
    }>;
  }) {
    const response = await fetch(`${baseUrl}/api/quiz`, {
      method: "POST",
      headers: buildHeaders(true),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  },

  async getMyQuizzes() {
    const response = await fetch(`${baseUrl}/api/quiz/my`, {
      headers: buildHeaders(false),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  },

  async getDashboardStats() {
    const response = await fetch(`${baseUrl}/api/stats/dashboard`, {
      headers: buildHeaders(false),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  },

  async getMe() {
    const response = await fetch(`${baseUrl}/api/me`, {
      headers: buildHeaders(false),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  },

  async getStats(quizId: string) {
    const response = await fetch(`${baseUrl}/api/quiz/${quizId}/stats`, {
      headers: buildHeaders(false),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  },

  async resetQuiz(quizId: string) {
    const response = await fetch(`${baseUrl}/api/quiz/${quizId}/reset`, {
      method: "POST",
      headers: buildHeaders(true),
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  },

  async deleteQuiz(quizId: string) {
    const response = await fetch(`${baseUrl}/api/quiz/${quizId}`, {
      method: "DELETE",
      headers: buildHeaders(true),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  },

  async updateQuiz(
    quizId: string,
    data: {
      title: string;
      category: string;
      difficulty: string;
      timePerQuestion: number;
      isPublic: boolean;
      channelUrl?: string | null;
      questions: Array<{
        text: string;
        options: string[];
        correctIndex: number;
        mediaUrl?: string;
        mediaType?: string;
        requiresSubscription?: boolean;
        order: number;
      }>;
    },
  ) {
    const response = await fetch(`${baseUrl}/api/quiz/${quizId}`, {
      method: "PUT",
      headers: buildHeaders(true),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.json();
  },
};
