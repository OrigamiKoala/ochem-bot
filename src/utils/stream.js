/**
 * Helper to handle streaming responses from the server.
 * Accumulates text and calls onChunk for every update, and onFinish at the end.
 */
export async function handleStream(response, onChunk, onFinish) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const jsonStr = trimmed.replace('data: ', '');
          const data = JSON.parse(jsonStr);

          if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
            const textChunk = data.candidates[0].content.parts[0].text || "";
            fullText += textChunk;
            if (onChunk) onChunk(fullText);
          }
        } catch (e) {
          // Fragmented JSON or heartbeat
        }
      }
    }
  } catch (e) {
    console.error("Stream error:", e);
  } finally {
    if (onFinish) onFinish(fullText);
  }
}
