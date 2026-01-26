import { StudySet, TutorExplanation, ChatMessage } from "../types";

export interface GenerationInput {
  text?: string;
  attachment?: { data: string; mimeType: string };
  flashcardCount?: number;
  quizCount?: number;
  isDifferentSet?: boolean;
}

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

const FUNCTION_URL =
  "https://us-central1-studywiseai-458aa.cloudfunctions.net/generateStudySet";

const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 4): Promise<T> => {
  let delay = 1500;
  let lastError: any = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      const message = error?.message || String(error || "");
      const isQuota = message.includes("429") || message.toLowerCase().includes("rate");
      const isOverloaded = message.includes("503") || message.toLowerCase().includes("overloaded");

      if (isQuota && i === maxRetries - 1) {
        throw new QuotaExceededError(
          "StuddiSmart is rate-limited right now. Please wait 30 seconds and try again."
        );
      }

      if ((isQuota || isOverloaded) && i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }

      break;
    }
  }

  throw new Error(lastError?.message || "Request failed.");
};

export const generateStudySet = async (input: GenerationInput): Promise<StudySet> => {
  return withRetry(async () => {
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: input.text || "",
        attachment: input.attachment,
        flashcardCount: input.flashcardCount ?? 10,
        quizCount: input.quizCount ?? 10,
        isDifferentSet: input.isDifferentSet ?? false,
      }),
    });

    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      throw new QuotaExceededError(
        data?.error || "StuddiSmart is rate-limited. Please wait and try again."
      );
    }

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || "Generation failed.");
    }

    return (await res.json()) as StudySet;
  });
};

/**
 * These 3 still call Gemini directly in your old version.
 * Since we moved keys to the backend, they should be converted
 * to backend endpoints too next.
 *
 * For now, keep them as placeholders so your build doesn't break.
 * We’ll add /chat, /insights, /tts functions next.
 */
export const generateChatResponse = async (
  _messages: ChatMessage[],
  _topicContext?: string
): Promise<string> => {
  throw new Error("Chat endpoint not connected yet. Next step: add a Firebase Function for chat.");
};

export const fetchTutorInsights = async (
  _question: string,
  _answer: string
): Promise<TutorExplanation> => {
  throw new Error("Insights endpoint not connected yet. Next step: add a Firebase Function for insights.");
};

export const generateAudio = async (_text: string): Promise<string> => {
  throw new Error("TTS endpoint not connected yet. Next step: add a Firebase Function for audio.");
};
