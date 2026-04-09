// api/token.js
// Final refinement of Gemini Live API token generator
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY missing' });

    try {
        console.log("Requesting session token for gemini-3.1-flash-live-preview...");
        // Documentation & Best Practice: For preview models, use the model-specific generateAuthToken path
        const model = "gemini-3.1-flash-live-preview";
        const url = `https://generativelanguage.googleapis.com/v1alpha/models/${model}:generateAuthToken?key=${API_KEY}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}) // Some generateAuthToken endpoints prefer empty body
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error("Google Auth Error:", response.status, err);
            
            // Fallback to global authTokens:generate if model-specific fails
            if (response.status === 404) {
                console.warn("Model-specific token failed, trying global v1alpha endpoint...");
                const globalUrl = `https://generativelanguage.googleapis.com/v1alpha/authTokens:generate?key=${API_KEY}`;
                const globalResp = await fetch(globalUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ config: { uses: 1 } })
                });
                
                if (globalResp.ok) {
                    const globalData = await globalResp.json();
                    return res.status(200).json({ token: globalData.token || globalData.name });
                }
            }

            return res.status(response.status).json({ 
                error: err.error?.message || "Google Auth Failure",
                status: response.status 
            });
        }

        const data = await response.json();
        const token = data.token || data.name;
        if (!token) throw new Error("No token returned in response");
        
        return res.status(200).json({ token });
    } catch (err) {
        console.error("Token handler crash:", err);
        return res.status(500).json({ error: err.message });
    }
}
