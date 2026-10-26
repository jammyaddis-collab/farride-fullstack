import { Router } from 'express';
import { knownLandmarks } from './rides.js';

/**
 * Gemini AI Landmark & Route Navigator — preserved from the original AfarRide.
 * Optional feature: requires GEMINI_API_KEY in .env. Uses the REST API directly
 * so no extra dependency is needed.
 */
export const aiRouter = Router();

const GEMINI_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;

const SYSTEM_PROMPT = `You are 'AfarRide Navigator & Landmark Guide', an expert local navigation chatbot and Bajaj trip advisor for Semera and Logiya in the Afar Regional State, Ethiopia.

Your responsibilities:
1. Help passengers discover landmarks, ministries, campuses, clinics, hotels, and markets across Semera and Logiya.
2. Provide estimated Bajaj travel advice, road tips along the Semera-Logiya Highway (Route 1), and travel times (usually 10-18 minutes between Semera and Logiya by Bajaj).
3. Whenever the user asks about a landmark, identify it and include its coordinates in this exact markdown pattern so the app UI can show a one-tap 'Set as Destination' button:
   [[LANDMARK|lat|lng]]
Known landmarks: ${knownLandmarks.map(l => `${l.name} (${l.lat},${l.lng})`).join('; ')}.
Reply in the user's language (English, Amharic, or Qafaraf).`;

aiRouter.post('/chat', async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  const { message, history = [] } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message text is required' });
  }
  if (!key) {
    return res.status(503).json({
      error: 'AI Navigator disabled — set GEMINI_API_KEY in .env',
      fallback: knownLandmarks,
    });
  }
  try {
    const r = await fetch(GEMINI_URL(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          ...history.slice(-8).map(h => ({
            role: h.role === 'model' ? 'model' : 'user',
            parts: [{ text: String(h.text || '') }],
          })),
          { role: 'user', parts: [{ text: message }] },
        ],
      }),
    });
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    if (!text) return res.status(502).json({ error: 'Empty AI response' });
    res.json({ text });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Gemini API error' });
  }
});
