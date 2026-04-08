const apiKey = 'AIzaSyBZpeTDP9s0gqlzubHarHlP1eTONxGrncU';

async function testFetch() {
    console.log("Fetching...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                generationConfig: {
                    maxOutputTokens: 80,
                    temperature: 0.2
                },
                contents: [{
                    parts: [{
                        text: "Generate a single organic chemistry mechanism practice question with just the reactants."
                    }]
                }]
            })
        });

        const data = await response.json();
        console.log("Response:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}

testFetch();
