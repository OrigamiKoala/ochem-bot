// api/token.js
export default async function handler(req, res) {
    // Add CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY missing' });
    
    try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1alpha/authTokens:generate?key=' + API_KEY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: { uses: 1 } })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return res.status(response.status).json({ error: err.error?.message || 'Upstream error' });
        }
        const data = await response.json();
        return res.status(200).json({ token: data.token || data.name });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
