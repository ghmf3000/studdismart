/**
 * Firebase Cloud Functions for StuddiSmart
 * Gemini backend (server-side ONLY)
 */

const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { defineSecret } = require("firebase-functions/params");

const { GoogleGenAI, Type, Modality } = require("@google/genai");

const cors = require("cors")({
  origin: true,
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
});

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

/* ========= SECRET ========= */
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

/* ========= HELPERS ========= */
function readJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function fail(res, err, msg) {
  logger.error(err);
  return res.status(500).json({ error: msg });
}

/* ============================================================
   POST /chat
   ============================================================ */
exports.chat = onRequest({ secrets: [GEMINI_API_KEY] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") return res.status(204).send();
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      const body = readJsonBody(req);
      const { messages = [] } = body;

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array required" });
      }

      /* 🔍 PROOF LOGGING — NOT GUESSING */
      const key = GEMINI_API_KEY.value();
      logger.info("GEMINI KEY CHECK", {
        exists: !!key,
        length: key ? key.length : 0,
      });

      if (!key) {
        return res.status(500).json({ error: "Gemini API key missing" });
      }

      const ai = new GoogleGenAI({ apiKey: key });

      const contents = messages.map((m) => ({
        role: m.role === "model" ? "model" : "user",
        parts: [{ text: String(m.text || "") }],
      }));

      const result = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents,
        config: {
          temperature: 0.7,
          maxOutputTokens: 800,
        },
      });

      return res.status(200).json({
        text: result.text || "",
      });
    } catch (err) {
      return fail(res, err, "Chat generation failed.");
    }
  });
});

/* ============================================================
   POST /generateStudySet
   ============================================================ */
exports.generateStudySet = onRequest({ secrets: [GEMINI_API_KEY] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") return res.status(204).send();
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      const body = readJsonBody(req);
      const { text = "", flashcardCount = 10 } = body;

      if (!text.trim()) {
        return res.status(400).json({ error: "Text required" });
      }

      const key = GEMINI_API_KEY.value();
      if (!key) {
        return res.status(500).json({ error: "Gemini API key missing" });
      }

      const ai = new GoogleGenAI({ apiKey: key });

      const result = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: {
          parts: [{ text }],
        },
        config: {
          systemInstruction: `Create exactly ${flashcardCount} flashcards. Return JSON only.`,
          responseMimeType: "application/json",
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
            },
            required: ["flashcards"],
          },
        },
      });

      return res.status(200).json(JSON.parse(result.text));
    } catch (err) {
      return fail(res, err, "Study set generation failed.");
    }
  });
});

/* ============================================================
   POST /tts
   ============================================================ */
exports.tts = onRequest({ secrets: [GEMINI_API_KEY] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") return res.status(204).send();
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      const body = readJsonBody(req);
      const { text = "" } = body;

      if (!text.trim()) {
        return res.status(400).json({ error: "Text required" });
      }

      const key = GEMINI_API_KEY.value();
      if (!key) {
        return res.status(500).json({ error: "Gemini API key missing" });
      }

      const ai = new GoogleGenAI({ apiKey: key });

      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
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
        result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!audioBase64) {
        return res.status(502).json({ error: "Audio generation failed" });
      }

      return res.status(200).json({ audioBase64 });
    } catch (err) {
      return fail(res, err, "TTS generation failed.");
    }
  });
});
