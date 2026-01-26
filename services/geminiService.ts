import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Flashcard, QuizQuestion, MindmapNode, TutorExplanation } from "../types";

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

export interface StudySet {
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  mindmap: MindmapNode;
}

/**
 * Robust retry utility to handle 429 (Quota) and 503 (Overloaded) errors.
 */
const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 4): Promise<T> => {
  let delay = 2000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const code = error?.code || error?.status || error?.error?.code || error?.error?.status;
      const status = error?.status || error?.error?.status || "";
      const message = error?.message || error?.error?.message || "";
      
      const isRetryable = 
        code === 429 || 
        code === '429' ||
        code === 503 ||
        code === '503' ||
        status === 'RESOURCE_EXHAUSTED' ||
        status === 'UNAVAILABLE' ||
        message.toLowerCase().includes('429') ||
        message.toLowerCase().includes('503') ||
        message.toLowerCase().includes('resource_exhausted') ||
        message.toLowerCase().includes('overloaded') ||
        message.toLowerCase().includes('unavailable') ||
        message.toLowerCase().includes('too many requests');

      if (isRetryable && i < maxRetries - 1) {
        console.warn(`[StuddiSmart AI] Service busy/limit hit. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = delay * 2; // Exponential backoff
        continue;
      }
      
      if (isRetryable) {
        throw new Error("The AI engine is currently experiencing extremely high traffic. Please wait a few seconds and try again.");
      }
      
      throw error;
    }
  }
  throw new Error('AI service is currently overloaded. Please try again in a moment.');
};

export const generateStudySet = async (input: GenerationInput): Promise<StudySet> => {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = 'gemini-3-flash-preview';
    
    const fcCount = input.flashcardCount || 10;
    const qCount = input.quizCount || 10;
    const varietyPrompt = input.isDifferentSet 
      ? "Provide a fresh perspective and different questions from any previous attempts. Avoid repeating common examples." 
      : "Focus on the absolute most fundamental core concepts and definitions.";

    const prompt = `You are a world-class educational assistant. Generate a comprehensive study set based on the provided input.
    ${varietyPrompt}
    
    The study set must include:
    1. Exactly ${fcCount} Flashcards.
    2. Exactly ${qCount} Multiple Choice Questions: 4 options and 1 correct answer.
    3. A Mindmap: A hierarchical JSON structure summarizing the main topic and its key sub-branches. 

    Strictly follow the provided JSON schema. Output valid JSON only.`;

    const parts: any[] = [{ text: prompt }];
    if (input.text) parts.push({ text: `Source Material: ${input.text}` });
    if (input.attachment) {
      parts.push({ 
        inlineData: { 
          data: input.attachment.data, 
          mimeType: input.attachment.mimeType 
        } 
      });
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        temperature: input.isDifferentSet ? 0.8 : 0.1,
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
                  options: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: 4, maxItems: 4 },
                  correctAnswer: { type: Type.STRING }
                },
                required: ["question", "options", "correctAnswer"]
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
                      children: { 
                        type: Type.ARRAY, 
                        items: { 
                          type: Type.OBJECT, 
                          properties: { 
                            label: { type: Type.STRING },
                            content: { type: Type.STRING }
                          },
                          required: ["label", "content"]
                        } 
                      }
                    },
                    required: ["label", "content"]
                  }
                }
              },
              required: ["label", "content"]
            }
          },
          required: ["flashcards", "quiz", "mindmap"]
        }
      }
    });

    const text = response.text || '{}';
    const data = JSON.parse(text);
    
    return {
      flashcards: (data.flashcards || []).map((c: any, i: number) => ({ ...c, id: `fc-${i}-${Date.now()}` })),
      quiz: (data.quiz || []).map((q: any, i: number) => ({ ...q, id: `q-${i}-${Date.now()}` })),
      mindmap: data.mindmap || { label: "Main Topic", content: "Main topic summary", children: [] }
    };
  });
};

export const fetchTutorInsights = async (question: string, answer: string): Promise<TutorExplanation> => {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `You are a world-class educational tutor. Provide a deep-dive explanation for the following flashcard:
    Question: ${question}
    Answer: ${answer}
    
    Return a detailed JSON object following the schema provided.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            simpleExplanation: { type: Type.STRING },
            realWorldExample: { type: Type.STRING },
            keyCommands: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: 3, maxItems: 3 },
            commonMistakes: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: 2, maxItems: 2 },
            quickCheck: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING }
                },
                required: ["question", "answer"]
              },
              minItems: 4,
              maxItems: 5
            }
          },
          required: ["simpleExplanation", "realWorldExample", "keyCommands", "commonMistakes", "quickCheck"]
        }
      }
    });
    return JSON.parse(response.text || '{}');
  });
};

export const generateAudio = async (text: string): Promise<string> => {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Speak this educational content clearly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Audio generation failed: No data returned.");
    return base64Audio;
  });
};