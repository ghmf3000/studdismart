/**
 * Firebase Cloud Functions for StuddiSmart
 * Gemini via Vertex AI (NO API KEYS – Service Account Auth)
 */

const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const { GoogleGenAI, Type, Modality } = require("@google/genai");

const cors = require("cors")({
  origin: (origin, cb) => {
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

/**
 * Vertex AI Gemini client (SERVICE ACCOUNT AUTH)
 * NO API KEYS
 */
const ai = new GoogleGenAI({
  vertexai: true,
  project: "studywiseai-458aa",
  location: "us-central1",
});

// Safely read JSON body
function readJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

// Standard error handler
function handleError(res, err, friendlyMessage) {
  logger.error(err);

  const msg = String(err?.message || "");

  if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
    return res.status(429).json({
      error: "AI is rate-limited right now. Please wait and try again.",
    });
  }

  if (msg.toLowerCase().includes("cors blocked")) {
    return res.status(403).json({ error: msg });
  }

  return res.status(500).json({ error: friendlyMessage });
}

/**
 * POST /generateStudySet
 */
exports.generateStudySet = onRequest({}, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method not allowed" });

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

      const varietyPrompt = isDifferentSet
        ? "Provide a fresh perspective and different questions."
        : "Focus on fundamental core concepts.";

      const systemInstruction = `
You are an elite educational synthesis engine.
MANDATORY OUTPUT:
1. Exactly ${flashcardCount} Flashcards.
2. Exactly ${quizCount} Quiz Questions.
3. Exactly ${quizCount} Test Questions.
4. Each must include explanation + category.
5. Include a hierarchical mindmap.
${varietyPrompt}
Return ONLY valid JSON.
`;

      const parts = [];
      if (text?.trim()) parts.push({ text: `Source:\n${text}` });

      if (attachment?.data && attachment?.mimeType) {
        parts.push({
          inlineData: {
            data: attachment.data,
            mimeType: attachment.mimeType,
          },
        });
      }

      const response = await ai.models.generateContent({
        model: "models/gemini-1.5-flash-latest",
        contents: { parts },
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          temperature: isDifferentSet ? 0.7 : 0.1,
          thinkingConfig: { thinkingBudget: 0 },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              flashcards: { type: Type.ARRAY },
              quiz: { type: Type.ARRAY },
              test: { type: Type.ARRAY },
              mindmap: { type: Type.OBJECT },
            },
            required: ["flashcards", "quiz", "test", "mindmap"],
          },
        },
      });

      const data = JSON.parse(response.text);
      const now = Date.now();

      return res.status(200).json({
        flashcards: data.flashcards.map((c, i) => ({
          ...c,
          id: `fc-${i}-${now}`,
        })),
        quiz: data.quiz.map((q, i) => ({
          ...q,
          id: `quiz-${i}-${now}`,
        })),
        test: data.test.map((t, i) => ({
          ...t,
          id: `test-${i}-${now}`,
        })),
        mindmap: data.mindmap,
      });
    } catch (err) {
      return handleError(res, err, "AI generation failed.");
    }
  });
});

/**
 * POST /chat
 */
exports.chat = onRequest({}, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method not allowed" });

    try {
      const body = readJsonBody(req);
      const { messages = [], topicContext = "" } = body;

      if (!messages.length) {
        return res.status(400).json({ error: "Missing messages." });
      }

      const response = await ai.models.generateContent({
        model: "models/gemini-1.5-flash-latest",
        contents: messages.map((m) => ({
          role: m.role === "model" ? "model" : "user",
          parts: [{ text: m.text }],
        })),
        config: {
          systemInstruction: `
You are StuddiChat, an expert tutor.
Use bullets, numbered steps, and **bold** keywords.
${topicContext ? `Topic: ${topicContext}` : ""}
`,
          temperature: 0.7,
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
 * POST /tts
 */
exports.tts = onRequest({}, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method not allowed" });

    try {
      const { text = "" } = readJsonBody(req);
      if (!text.trim())
        return res.status(400).json({ error: "Missing text." });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Speak clearly: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Zephyr" },
            },
          },
        },
      });

      const audioBase64 =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!audioBase64)
        return res.status(502).json({ error: "Audio generation failed." });

      return res.status(200).json({ audioBase64 });
    } catch (err) {
      return handleError(res, err, "TTS generation failed.");
    }
  });
});
