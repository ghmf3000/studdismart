/**
 * Firebase Cloud Functions for StuddiSmart
 * Backend Gemini calls (no API key in the browser)
 */

const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const { defineSecret } = require("firebase-functions/params");
const { GoogleGenAI, Type, Modality } = require("@google/genai");

const cors = require("cors")({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, server-to-server)
    if (!origin) return cb(null, true);

    const allowlist = [
      "https://studdismart.com",
      "https://www.studdismart.com",
      "http://localhost:5173",
      "http://localhost:3000",
    ];

    if (allowlist.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
});

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// ✅ Use a model that exists for the Gemini Developer API JS SDK (Gemini 2.0+)
const DEFAULT_TEXT_MODEL = "gemini-2.5-flash";

// Safely read JSON body even if it comes through as a string
function readJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

// Create Gemini client (force stable API)
function getGeminiClient() {
  const key = GEMINI_API_KEY.value();
  // Helpful debug (safe): length only
  logger.info("GEMINI KEY CHECK", { exists: !!key, length: (key || "").length });

  return new GoogleGenAI({
    apiKey: key,
    apiVersion: "v1", // ✅ stable endpoint (avoids v1beta model mismatch issues)
  });
}

// Standard error handler (returns real message)
function handleError(res, err, friendlyMessage) {
  logger.error(err);

  const status = Number(err?.status) || 500;

  // Try to extract best possible message
  const apiMessage =
    err?.message ||
    err?.error?.message ||
    err?.response?.data?.error?.message ||
    "";

  const msg = String(apiMessage || "");

  // Quota / rate limits
  if (
    status === 429 ||
    msg.includes("429") ||
    msg.toLowerCase().includes("quota") ||
    msg.toLowerCase().includes("resource_exhausted")
  ) {
    return res.status(429).json({
      error: "AI is rate-limited right now. Please wait 30 seconds and try again.",
      details: msg || undefined,
    });
  }

  // CORS debugging
  if (msg.toLowerCase().includes("cors blocked")) {
    return res.status(403).json({ error: msg });
  }

  return res.status(status).json({
    error: friendlyMessage,
    details: msg || undefined,
    status,
  });
}

/**
 * POST /generateStudySet
 */
exports.generateStudySet = onRequest({ secrets: [GEMINI_API_KEY] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
      const body = readJsonBody(req);

      const {
        text = "",
        attachment,
        flashcardCount = 10,
        quizCount = 10,
        isDifferentSet = false,
      } = body;

      if (!text?.trim() && !attachment) {
        return res.status(400).json({ error: "Missing text or attachment." });
      }

      const ai = getGeminiClient();

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
        model: DEFAULT_TEXT_MODEL,
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
      if (!textOutput) return res.status(502).json({ error: "AI returned empty synthesis." });

      const data = JSON.parse(textOutput);
      const now = Date.now();

      return res.status(200).json({
        flashcards: (data.flashcards || []).map((c, i) => ({ ...c, id: `fc-${i}-${now}` })),
        quiz: (data.quiz || []).map((q, i) => ({ ...q, id: `quiz-${i}-${now}` })),
        test: (data.test || []).map((t, i) => ({ ...t, id: `test-${i}-${now}` })),
        mindmap: data.mindmap || { label: "Main Topic", content: "Main topic summary", children: [] },
      });
    } catch (err) {
      return handleError(res, err, "AI generation failed.");
    }
  });
});

/**
 * POST /chat
 * Body: { messages: [{role:"user"|"model", text:string}], topicContext?: string }
 * Returns: { text: string }
 */
exports.chat = onRequest({ secrets: [GEMINI_API_KEY] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
      const body = readJsonBody(req);
      const { messages = [], topicContext = "" } = body;

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Missing messages array." });
      }

      const ai = getGeminiClient();

      const systemInstruction = `You are StuddiChat, the brilliant AI tutor for StuddiSmart.
Your job is to help users learn clearly and fast.

MANDATORY FORMATTING:
- Use clear section headers when helpful.
- Use numbered lists (1., 2., 3.) for steps.
- Use bullet points for key facts.
- Use **bold** for critical terms.
- Keep answers concise and encouraging.

${topicContext ? `Current study topic: ${topicContext}` : "No specific topic selected yet."}`;

      const contents = messages.map((m) => ({
        role: m.role === "model" ? "model" : "user",
        parts: [{ text: String(m.text || "") }],
      }));

      const response = await ai.models.generateContent({
        model: DEFAULT_TEXT_MODEL,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 900,
        },
      });

      return res.status(200).json({ text: response.text || "" });
    } catch (err) {
      return handleError(res, err, "Chat generation failed.");
    }
  });
});

/**
 * POST /insights
 * Body: { question: string, answer: string }
 * Returns: TutorExplanation JSON
 */
exports.insights = onRequest({ secrets: [GEMINI_API_KEY] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
      const body = readJsonBody(req);
      const { question = "", answer = "" } = body;

      if (!question.trim() || !answer.trim()) {
        return res.status(400).json({ error: "Missing question or answer." });
      }

      const ai = getGeminiClient();

      const systemInstruction = `You are a world-class academic tutor.
Explain simply, provide a real-world example, list key takeaways, common mistakes, and a knowledge check.
MANDATORY: quickCheck MUST contain exactly 5 question/answer pairs.
Return ONLY valid JSON.`;

      const response = await ai.models.generateContent({
        model: DEFAULT_TEXT_MODEL,
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
                    answer: { type: Type.STRING },
                  },
                  required: ["question", "answer"],
                },
              },
            },
            required: ["simpleExplanation", "realWorldExample", "keyCommands", "commonMistakes", "quickCheck"],
          },
        },
      });

      const textOutput = response.text;
      if (!textOutput) return res.status(502).json({ error: "AI returned empty insights." });

      return res.status(200).json(JSON.parse(textOutput));
    } catch (err) {
      return handleError(res, err, "Insights generation failed.");
    }
  });
});

/**
 * POST /tts (kept as-is; not required for your current ask)
 */
exports.tts = onRequest({ secrets: [GEMINI_API_KEY] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
      const body = readJsonBody(req);
      const { text = "" } = body;

      if (!text.trim()) return res.status(400).json({ error: "Missing text." });

      const ai = new GoogleGenAI({
        apiKey: GEMINI_API_KEY.value(),
        apiVersion: "v1alpha", // TTS models may require alpha endpoints
      });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Speak clearly: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
        },
      });

      const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioBase64) return res.status(502).json({ error: "Audio generation failed." });

      return res.status(200).json({ audioBase64 });
    } catch (err) {
      return handleError(res, err, "TTS generation failed.");
    }
  });
});
