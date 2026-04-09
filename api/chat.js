// api/chat.js
export default async function handler(req, res) {
    // 1. Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt, image } = req.body;
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    try {
        const parts = [{ text: prompt }];
        if (image) {
            parts.push({
                inline_data: {
                    mime_type: 'image/png',
                    data: image
                }
            });
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemma-3-1B:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = errorData.error?.message || 'Unknown upstream API error';
            console.error('Gemini API Error:', response.status, errorData);
            return res.status(response.status).json({ error: errorMessage, status: response.status });
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('Fetch Error:', error);
        res.status(500).json({ error: 'Failed to reach Gemini' });
    }
}