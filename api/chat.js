// api/chat.js
export default async function handler(req, res) {
    // 1. Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt, image, responseMimeType, task } = req.body;
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    // Task-based model routing: use the best model for question generation,
    // cheaper/faster models for grading and chat where speed matters more.
    const GENERATION_MODELS = [
        "gemini-2.5-flash",                // Best chemistry knowledge
        "gemini-3-flash-preview",          // Fallback 1
        "gemini-3.1-flash-lite-preview",   // Fallback 2
    ];

    const GRADING_MODELS = [
        "gemini-3.1-flash-lite-preview",   // Fast, cheap — fine for image eval
        "gemini-3-flash-preview",          // Fallback 1
        "gemini-2.5-flash",                // Fallback 2
    ];

    const models = (task === 'generate') ? GENERATION_MODELS : GRADING_MODELS;

    // Use higher temperature for generation (variety), low for grading (consistency)
    const temperature = (task === 'generate') ? 1.5 : 0.2;
    const topP = (task === 'generate') ? 0.95 : 0.8;
    const maxOutputTokens = (task === 'generate') ? 8192 : 256;

    let lastError = null;

    for (const modelId of models) {
        try {
            console.log(`[${task || 'unknown'}] Attempting request with model: ${modelId}`);

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
                        maxOutputTokens,
                        temperature,
                        topP: topP,
                        topK: 40,
                        response_mime_type: responseMimeType || "text/plain",
                    },
                    // Disable thinking for grading — pure speed
                    ...(task !== 'generate' ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
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