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

const URLS = {
  // IMPORTANT: use the exact URLs from your deploy output
  generateStudySet: "https://generatestudyset-o54p56rtpg-uc.a.run.app",
  chat: "https://us-central1-studywiseai-458aa.cloudfunctions.net/chat",
  insights: "https://us-central1-studywiseai-458aa.cloudfunctions.net/insights",
  tts: "https://us-central1-studywiseai-458aa.cloudfunctions.net/tts",
};

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

async function postJSON<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    const data = await res.json().catch(() => ({}));
    throw new QuotaExceededError(
      data?.error || "StuddiSmart is rate-limited. Please wait and try again."
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Request failed.");
  }

  return (await res.json()) as T;
}

/**
 * ✅ Study Set generation (flashcards/quiz/test/mindmap)
 */
export const generateStudySet = async (input: GenerationInput): Promise<StudySet> => {
  return withRetry(async () => {
    return await postJSON<StudySet>(URLS.generateStudySet, {
      text: input.text || "",
      attachment: input.attachment,
      flashcardCount: input.flashcardCount ?? 10,
      quizCount: input.quizCount ?? 10,
      isDifferentSet: input.isDifferentSet ?? false,
    });
  });
};

/**
 * ✅ StuddiChat tutor response
 */
export const generateChatResponse = async (
  messages: ChatMessage[],
  topicContext?: string
): Promise<string> => {
  return withRetry(async () => {
    const data = await postJSON<{ text: string }>(URLS.chat, {
      messages: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user", // normalize if your types use "assistant"
        text: m.text,
      })),
      topicContext: topicContext || "",
    });
    return data.text || "";
  });
};

/**
 * ✅ Tutor insights JSON for a Q/A (explanations + quick check)
 */
export const fetchTutorInsights = async (
  question: string,
  answer: string
): Promise<TutorExplanation> => {
  return withRetry(async () => {
    return await postJSON<TutorExplanation>(URLS.insights, { question, answer });
  });
};

/**
 * ✅ TTS (returns base64 audio)
 */
export const generateAudio = async (text: string): Promise<string> => {
  return withRetry(async () => {
    const data = await postJSON<{ audioBase64: string }>(URLS.tts, { text });
    if (!data?.audioBase64) throw new Error("Audio generation failed.");
    return data.audioBase64;
  });
};
