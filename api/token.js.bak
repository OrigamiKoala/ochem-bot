// api/token.js
// Dedicated endpoint for Gemini Live API session tokens

export default async function handler(req, res) {
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY missing on Vercel' });
    }

    try {
        console.log("Generating session token via /api/token...");
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/authTokens:generate?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                config: {
                    uses: 1,
                    expireTime: new Date(Date.now() + 3600 * 1000).toISOString()
                }
            })
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
