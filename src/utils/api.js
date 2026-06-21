// API wrapper functions for /api/chat calls with automatic model selection logging

let lastModelUsed = null;
const sessionKeySeed = Math.floor(Math.random() * 1000000);

async function fetchWithModelLogging(url, options) {
  options.headers = {
    ...options.headers,
    'X-Session-Key-Seed': String(sessionKeySeed)
  };
  const response = await fetch(url, options);
  const modelUsed = response.headers.get('X-Model-Used');
  if (modelUsed && modelUsed !== lastModelUsed) {
    console.log(`[Model Selection] Generation model switched to: ${modelUsed}`);
    lastModelUsed = modelUsed;
  }
  return response;
}

export async function apiGenerate({ prompt, isGenChemMode, stream = false, responseMimeType = 'application/json' }) {
  return fetchWithModelLogging('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      task: 'generate',
      responseMimeType,
      stream,
      mode: isGenChemMode ? 'genchem' : 'ochem'
    })
  });
}

export async function apiGrade({ prompt, image, isLearnMode, isFreeDraw, isGenChemMode, stream = false }) {
  return fetchWithModelLogging('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      image,
      task: 'grade',
      gradeMode: isLearnMode ? 'learn' : 'normal',
      stream,
      mode: isFreeDraw ? 'freedraw' : (isGenChemMode ? 'genchem' : 'ochem')
    })
  });
}

export async function apiChat({ prompt, image, isGenChemMode, isFreeDraw, stream = false }) {
  return fetchWithModelLogging('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      ...(image ? { image } : {}),
      task: 'chat',
      stream,
      mode: isFreeDraw ? 'freedraw' : (isGenChemMode ? 'genchem' : 'ochem')
    })
  });
}

export async function apiReevaluate({ prompt, image, isGenChemMode, isLearnMode, stream = false }) {
  return fetchWithModelLogging('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      image,
      task: 'grade',
      gradeMode: isLearnMode ? 'learn' : 'normal',
      stream,
      mode: isGenChemMode ? 'genchem' : 'ochem'
    })
  });
}
