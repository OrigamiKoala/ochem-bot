// api/token.js
// Securely provides the API key to the authorized frontend for the Live API
// Note: In production, consider restricting this key in Google AI Studio to your domain.
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY missing from Vercel environment' });

    // In this "Direct Key" mode, we simply return the key to the frontend script
    // so it can establish a raw WebSocket connection as requested.
    return res.status(200).json({ key: API_KEY });
}
