// api/chat.js

export default async function handler(req, res) {
    // 1. Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt, image, responseMimeType, maxOutputTokens, temperature, type } = req.body;
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    // New: Handle session token requests for the Gemini Live API (WebSocket)
    if (type === 'session_token') {
        try {
            console.log("Generating ephemeral session token using REST...");
            // Using the standard generative-language provisioning endpoint
            const tokenResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/authTokens:generate?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    config: {
                        uses: 1,
                        expireTime: new Date(Date.now() + 3600 * 1000).toISOString()
                    }
                })
            });

            if (!tokenResponse.ok) {
                const errorData = await tokenResponse.json().catch(() => ({}));
                console.error("Upstream Token Error:", errorData);
                return res.status(tokenResponse.status).json({ 
                    error: errorData.error?.message || `Google API returned ${tokenResponse.status}` 
                });
            }

            const tokenData = await tokenResponse.json();
            // The JSON response from Google typically has a 'token' or 'name' field
            return res.status(200).json({ token: tokenData.token || tokenData.name });
        } catch (err) {
            console.error('REST Token Error:', err);
            return res.status(500).json({ error: 'Failed to proxy session token request: ' + err.message });
        }
    }

    // Hierarchical model list (Always starts from the top)
    const MODELS = [
        "gemini-3.1-flash-lite-preview", // Primary / "Top" Bot
        "gemini-3-flash-preview",              // Fallback 1
        "gemini-2.5-flash"           // Fallback 2 (Highest availability)
    ];

    let lastError = null;

    for (const modelId of MODELS) {
        try {
            console.log(`Attempting request with model: ${modelId}`);

            const parts = [{ text: prompt }];
            if (image) {
                parts.push({
                    inline_data: {
                        mime_type: 'image/png',
                        data: image
                    }
                });
            }

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: {
                        maxOutputTokens: maxOutputTokens || 2500,
                        temperature: temperature ?? 0.1,
                        topP: 0.8,
                        topK: 40,
                        response_mime_type: responseMimeType || "text/plain",
                    },
                })
            });

            // If we hit a rate limit (429) or the service is busy (503), try the next model
            if (response.status === 429 || response.status === 503) {
                const errorData = await response.json();
                console.warn(`Model ${modelId} reached limit/busy (${response.status}). Falling back...`, errorData);
                lastError = { status: response.status, data: errorData };
                continue;
            }

            // For other non-OK statuses, we assume it's a structural error and return immediately
            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.error?.message || 'Unknown upstream API error';
                console.error(`Gemini API Error with ${modelId}:`, response.status, errorData);
                return res.status(response.status).json({ error: errorMessage, status: response.status });
            }

            // Success!
            const data = await response.json();
            return res.status(200).json(data);

        } catch (error) {
            console.error(`Fetch Error with model ${modelId}:`, error);
            lastError = { error: 'Failed to reach Gemini' };
            // Continue to next model on network/transient fetch errors
            continue;
        }
    }

    // If we've exhausted all models
    const finalStatus = lastError?.status || 500;
    const finalMessage = lastError?.data?.error?.message || 'All available models are currently at capacity.';
    res.status(finalStatus).json({ error: finalMessage });
}