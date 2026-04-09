// api/token.js
// Modern ESM format for Node 22+ on Vercel
export default async function handler(req, res) {
    // Add CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        console.error("GEMINI_API_KEY is missing from environment.");
        return res.status(500).json({ error: 'GEMINI_API_KEY missing on server' });
    }

    try {
        const model = "models/gemini-3.1-flash-live-preview";
        const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateAuthToken?key=${API_KEY}`;
        
        // Native fetch is available in Node 18+
        const response = await fetch(url, { method: 'POST' });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error("Google Upstream Error:", response.status, JSON.stringify(err));
            return res.status(response.status).json({ 
                error: err.error?.message || 'Google Auth Error',
                code: response.status
            });
        }

        const data = await response.json();
        return res.status(200).json({ token: data.token || data.name });
    } catch (err) {
        console.error("Token Handler Exception:", err);
        return res.status(500).json({ error: err.message });
    }
}
