import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Flashcard, QuizQuestion, MindmapNode, TutorExplanation } from "../types";

export interface GenerationInput {
  text?: string;
  attachment?: {
    data: string;
    mimeType: string;
  };
}

export interface StudySet {
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  mindmap: MindmapNode;
}

/**
 * Robust retry utility to handle 429 Resource Exhausted errors.
 */
const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 6): Promise<T> => {
  let delay = 4000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const code = error?.code || error?.status || error?.error?.code || error?.error?.status;
      const status = error?.status || error?.error?.status || "";
      const message = error?.message || error?.error?.message || "";
      
      const isQuotaError = 
        code === 429 || 
        code === '429' ||
        status === 'RESOURCE_EXHAUSTED' ||
        message.includes('429') ||
        message.includes('RESOURCE_EXHAUSTED');

      if (isQuotaError && i < maxRetries - 1) {
        console.warn(`[StuddiSmart AI] Rate limit (429) hit. Backing off for ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = delay * 2 + Math.random() * 1000;
        continue;
      }
      
      console.error("[StuddiSmart AI] API Execution Error:", { code, status, message, originalError: error });
      throw error;
    }
  }
  throw new Error('StuddiSmart AI service is currently overloaded. Please try again in a moment.');
};

export const generateStudySet = async (input: GenerationInput): Promise<StudySet> => {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = 'gemini-3-flash-preview';
    
    const prompt = `You are a world-class educational assistant. Generate a comprehensive study set based on the provided input (text, images, or documents like PDFs).
    Analyze the material thoroughly. Extract all relevant educational concepts.
    
    The study set must include:
    1. Exactly 8 Flashcards: Focused on core definitions, formulas, or historical facts.
    2. Exactly 5 Multiple Choice Questions: Testing comprehension with 4 distinct options and 1 correct answer.
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
        temperature: 0.1,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            flashcards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING },
                  imagePrompt: { type: Type.STRING, description: "A simple visual description for an icon representing this concept." }
                },
                required: ["question", "answer", "imagePrompt"]
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
                children: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      children: { 
                        type: Type.ARRAY, 
                        items: { 
                          type: Type.OBJECT, 
                          properties: { label: { type: Type.STRING } } 
                        } 
                      }
                    },
                    required: ["label"]
                  }
                }
              },
              required: ["label"]
            }
          },
          required: ["flashcards", "quiz", "mindmap"]
        }
      }
    });

    let text = response.text || '{}';
    text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    
    const data = JSON.parse(text);
    return {
      flashcards: (data.flashcards || []).map((c: any, i: number) => ({ ...c, id: `fc-${i}` })),
      quiz: (data.quiz || []).map((q: any, i: number) => ({ ...q, id: `q-${i}` })),
      mindmap: data.mindmap || { label: "Main Topic", children: [] }
    };
  });
};

export const generateFlashcardImage = async (prompt: string): Promise<string> => {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `Minimalist educational icon for: ${prompt}. Clean line art, white background, high contrast.` }]
      },
      config: { temperature: 0.2 }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  });
};

export const fetchTutorInsights = async (question: string, answer: string): Promise<TutorExplanation> => {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `You are a world-class educational tutor. Provide a deep-dive explanation for the following flashcard:
    Question: ${question}
    Answer: ${answer}
    
    Return a detailed JSON object following the schema provided. 
    Include:
    - a simple explanation (summary),
    - a real-world example,
    - exactly 3 key takeaways (concise facts),
    - exactly 2 common mistakes,
    - exactly 4 to 5 Quick Check questions with short answers.`;

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