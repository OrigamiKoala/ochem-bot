// api/token.js
// Optimized for Gemini 3.1 Flash Live (CommonJS)
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY missing' });

    try {
        const model = "models/gemini-3.1-flash-live-preview";
        const url = "https://generativelanguage.googleapis.com/v1beta/" + model + ":generateAuthToken?key=" + API_KEY;
        const response = await fetch(url, { method: 'POST' });
        
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return res.status(response.status).json({ error: err.error?.message || 'Google Auth Error' });
        }
        const data = await response.json();
        return res.status(200).json({ token: data.token || data.name });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};
