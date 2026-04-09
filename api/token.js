// api/token.js
export default async function handler(req, res) {
    // Add CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY missing on server' });

    try {
        // Correct 2026 Endpoint for Gemini Live API Session Tokens
        const model = "models/gemini-2.0-flash-exp"; // Standard model for auth token generation
        const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateAuthToken?key=${API_KEY}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}) // Some endpoints require an empty body
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error("Upstream Error:", response.status, err);
            return res.status(response.status).json({ 
                error: err.error?.message || 'Google API returned ' + response.status,
                endpoint: url.split('?')[0] // For debugging
            });
        }

        const data = await response.json();
        // The field name can be 'token' or 'name' depending on the specific v1beta version
        return res.status(200).json({ token: data.token || data.name });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
