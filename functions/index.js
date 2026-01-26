/**
 * Firebase Cloud Functions for StuddiSmart
 * Backend Gemini calls (no API key in the browser)
 */

const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/https");
const logger = require("firebase-functions/logger");

const { defineSecret } = require("firebase-functions/params");
const { GoogleGenAI, Type } = require("@google/genai");

setGlobalOptions({ maxInstances: 10 });

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

exports.generateStudySet = onRequest(
  {
    secrets: [GEMINI_API_KEY],
    cors: true,
  },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const {
        text = "",
        attachment,
        flashcardCount = 10,
        quizCount = 10,
        isDifferentSet = false,
      } = req.body || {};

      if (!text?.trim() && !attachment) {
        return res.status(400).json({ error: "Missing text or attachment." });
      }

      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });

      const fcCount = Number(flashcardCount) || 10;
      const qCount = Number(quizCount) || 10;

      const varietyPrompt = isDifferentSet
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

      const parts = [];

      if (text?.trim()) parts.push({ text: `Source Material:\n${text}` });

      if (attachment?.data && attachment?.mimeType) {
        parts.push({
          inlineData: {
            data: attachment.data,
            mimeType: attachment.mimeType,
          },
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: { parts },
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          temperature: isDifferentSet ? 0.7 : 0.1,
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
                    answer: { type: Type.STRING },
                  },
                  required: ["question", "answer"],
                },
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
                    category: { type: Type.STRING },
                  },
                  required: ["question", "options", "correctAnswer", "explanation", "category"],
                },
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
                    category: { type: Type.STRING },
                  },
                  required: ["question", "options", "correctAnswer", "explanation", "category"],
                },
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
                              content: { type: Type.STRING },
                            },
                            required: ["label", "content"],
                          },
                        },
                      },
                      required: ["label", "content"],
                    },
                  },
                },
                required: ["label", "content"],
              },
            },
            required: ["flashcards", "quiz", "test", "mindmap"],
          },
        },
      });

      const textOutput = response.text;
      if (!textOutput) {
        return res.status(502).json({ error: "AI returned empty synthesis." });
      }

      const data = JSON.parse(textOutput);
      const now = Date.now();

      return res.status(200).json({
        flashcards: (data.flashcards || []).map((c, i) => ({ ...c, id: `fc-${i}-${now}` })),
        quiz: (data.quiz || []).map((q, i) => ({ ...q, id: `quiz-${i}-${now}` })),
        test: (data.test || []).map((t, i) => ({ ...t, id: `test-${i}-${now}` })),
        mindmap: data.mindmap || { label: "Main Topic", content: "Main topic summary", children: [] },
      });
    } catch (err) {
      logger.error(err);
      // Friendly 429 (quota/rate limits) handling
      const msg = err?.message || "";
      if (String(msg).includes("429") || String(msg).toLowerCase().includes("quota")) {
        return res.status(429).json({
          error: "AI is rate-limited right now. Please wait 30 seconds and try again.",
        });
      }

      return res.status(500).json({ error: "AI generation failed." });
    }
  }
);
