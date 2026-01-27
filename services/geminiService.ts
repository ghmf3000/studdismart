// services/geminiService.ts (FRONTEND)
// Calls Firebase Functions endpoints (backend-powered)

import { StudySet, ChatMessage, TutorExplanation } from "../types";

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

// ✅ Put your functions base here (these are your real URLs)
const FUNCTIONS_BASE = "https://us-central1-studywiseai-458aa.cloudfunctions.net";

async function postJSON<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${FUNCTIONS_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Try to parse JSON either way
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.error || `Request failed (${res.status})`;
    if (res.status === 429) throw new QuotaExceededError(msg);
    throw new Error(msg);
  }

  return data as T;
}

export async function generateStudySet(input: GenerationInput): Promise<StudySet> {
  return postJSON<StudySet>("/generateStudySet", input);
}

export async function generateChatResponse(messages: ChatMessage[], topicContext?: string): Promise<string> {
  const out = await postJSON<{ text: string }>("/chat", { messages, topicContext });
  return out.text || "";
}

export async function fetchTutorInsights(question: string, answer: string): Promise<TutorExplanation> {
  return postJSON<TutorExplanation>("/insights", { question, answer });
}

export async function generateAudio(text: string): Promise<string> {
  const out = await postJSON<{ audioBase64: string }>("/tts", { text });
  return out.audioBase64;
}
