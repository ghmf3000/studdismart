import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Flashcard, QuizQuestion, MindmapNode, TutorExplanation, StudySet } from "../types";

export interface GenerationInput {
  text?: string;
  attachment?: {
    data: string;
    mimeType: string;
  };
  flashcardCount?: number;
  quizCount?: number;
  isDifferentSet?: boolean;
}

/**
 * Custom error for quota-related issues to allow specific UI handling.
 */
export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/**
 * Robust retry utility to handle 429 (Quota) and 503 (Overloaded) errors.
 */
const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 4): Promise<T> => {
  let delay = 3000;
  let lastError: any = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const message = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
      const status = error?.status || "";
      
      const isQuotaError = 
        message.includes('429') || 
        message.toLowerCase().includes('quota') || 
        message.toLowerCase().includes('resource_exhausted') ||
        status === 'RESOURCE_EXHAUSTED';

      const isOverloaded = 
        message.includes('503') || 
        message.toLowerCase().includes('overloaded') || 
        message.toLowerCase().includes('unavailable') ||
        status === 'UNAVAILABLE';

      if (isQuotaError && i === maxRetries - 1) {
        // If we still fail on quota after retries, throw specific error
        throw new QuotaExceededError("You've reached the AI synthesis limit for this session. Please wait a few minutes or upgrade to bypass tier restrictions.");
      }

      if ((isQuotaError || isOverloaded) && i < maxRetries - 1) {
        console.warn(`[StuddiSmart AI] System busy (Attempt ${i + 1}). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = delay * 2; // Exponential backoff
        continue;
      }
      
      break;
    }
  }

  const finalMessage = lastError?.message || "AI synthesis failed due to high server load.";
  throw new Error(finalMessage);
};

export const generateStudySet = async (input: GenerationInput): Promise<StudySet> => {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const modelName = 'gemini-3-flash-preview';
    
    const fcCount = input.flashcardCount || 10;
    const qCount = input.quizCount || 10;
    const varietyPrompt = input.isDifferentSet 
      ? "Provide a fresh perspective and different questions from previous iterations. Avoid common examples." 
      : "Focus on fundamental core concepts and essential definitions.";

    const systemInstruction = `You are an elite educational synthesis engine. 
    MANDATORY OUTPUT:
    1. Exactly ${fcCount} Flashcards.
    2. Exactly ${qCount} "Quiz" Questions (for practice).
    3. Exactly ${qCount} "Test" Questions (for evaluation). 
    IMPORTANT: Quiz and Test questions MUST be different.
    4. Each question must include an explanation and a 'category' tag.
    5. A hierarchical Mindmap.
    ${varietyPrompt}
    Return ONLY valid JSON.`;

    const parts: any[] = [];
    if (input.text) parts.push({ text: `Source Material:\n${input.text}` });
    if (input.attachment) {
      parts.push({ 
        inlineData: { 
          data: input.attachment.data, 
          mimeType: input.attachment.mimeType 
        } 
      });
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: input.isDifferentSet ? 0.7 : 0.1,
        thinkingConfig: { thinkingBudget: 0 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            flashcards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING }
                },
                required: ["question", "answer"]
              }
            },
            quiz: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctAnswer: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  category: { type: Type.STRING }
                },
                required: ["question", "options", "correctAnswer", "explanation", "category"]
              }
            },
            test: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctAnswer: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  category: { type: Type.STRING }
                },
                required: ["question", "options", "correctAnswer", "explanation", "category"]
              }
            },
            mindmap: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                content: { type: Type.STRING },
                children: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      content: { type: Type.STRING },
                      children: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { label: {type: Type.STRING}, content: {type: Type.STRING} }, required: ["label", "content"] } }
                    },
                    required: ["label", "content"]
                  }
                }
              },
              required: ["label", "content"]
            }
          },
          required: ["flashcards", "quiz", "test", "mindmap"]
        }
      }
    });

    const textOutput = response.text;
    if (!textOutput) throw new Error("AI returned empty synthesis.");
    const data = JSON.parse(textOutput);
    
    return {
      flashcards: (data.flashcards || []).map((c: any, i: number) => ({ ...c, id: `fc-${i}-${Date.now()}` })),
      quiz: (data.quiz || []).map((q: any, i: number) => ({ ...q, id: `quiz-${i}-${Date.now()}` })),
      test: (data.test || []).map((t: any, i: number) => ({ ...t, id: `test-${i}-${Date.now()}` })),
      mindmap: data.mindmap || { label: "Main Topic", content: "Main topic summary", children: [] }
    };
  });
};

export const fetchTutorInsights = async (question: string, answer: string): Promise<TutorExplanation> => {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const systemInstruction = `You are a world-class academic tutor.
    Explain simply, provide real-world examples, list key takeaways, and a knowledge check.
    MANDATORY: 'quickCheck' MUST contain exactly 5 questions/answers.
    Output valid JSON only.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: `Topic:\nQ: ${question}\nA: ${answer}` }] },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 }, 
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            simpleExplanation: { type: Type.STRING },
            realWorldExample: { type: Type.STRING },
            keyCommands: { type: Type.ARRAY, items: { type: Type.STRING } },
            commonMistakes: { type: Type.ARRAY, items: { type: Type.STRING } },
            quickCheck: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING }
                },
                required: ["question", "answer"]
              }
            }
          },
          required: ["simpleExplanation", "realWorldExample", "keyCommands", "commonMistakes", "quickCheck"]
        }
      }
    });
    const textOutput = response.text;
    if (!textOutput) throw new Error("AI returned empty insights.");
    return JSON.parse(textOutput);
  });
};

export const generateAudio = async (text: string): Promise<string> => {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Speak clearly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Audio generation failed.");
    return base64Audio;
  });
};