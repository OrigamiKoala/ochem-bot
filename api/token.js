// api/token.js
// Optimized token generator for Gemini 3.1 Flash Live
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY missing' });

    try {
        console.log("Requesting session token for gemini-3.1-flash-live-preview...");
        
        // Simplified global endpoint for ephemeral tokens
        const url = `https://generativelanguage.googleapis.com/v1alpha/authTokens:generate?key=${API_KEY}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Simplified body: some accounts reject nested 'config' or 'liveConnectConstraints' for basic session tokens
            body: JSON.stringify({
                uses: 1
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error("Google Auth Error:", response.status, err);
            return res.status(response.status).json({ 
                error: err.error?.message || "Google Auth Failure",
                status: response.status 
            });
        }

        const data = await response.json();
        // The field name can be 'token' or 'name' depending on the API version flavor
        const token = data.token || data.name;
        
        if (!token) {
            console.error("Malformed response from Google:", data);
            throw new Error("No token returned in Google response");
        }
        
        return res.status(200).json({ token });
    } catch (err) {
        console.error("Token handler crash:", err);
        return res.status(500).json({ error: err.message });
    }
}
