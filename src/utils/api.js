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
    lastModelUsed = modelUsed;
  }
  return response;
}

async function performApiChatRequest({ prompt, image, responseMimeType, task, gradeMode, stream = false, mode }) {
  const bodyPayload = { prompt, task, stream, mode };
  if (image) bodyPayload.image = image;
  if (responseMimeType) bodyPayload.responseMimeType = responseMimeType;
  if (gradeMode) bodyPayload.gradeMode = gradeMode;

  return fetchWithModelLogging('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyPayload)
  });
}

export async function apiGenerate({ prompt, isGenChemMode, stream = false, responseMimeType = 'application/json' }) {
  return performApiChatRequest({
    prompt,
    task: 'generate',
    responseMimeType,
    stream,
    mode: isGenChemMode ? 'genchem' : 'ochem'
  });
}

export async function apiGrade({ prompt, image, isLearnMode, isFreeDraw, isGenChemMode, stream = false }) {
  return performApiChatRequest({
    prompt,
    image,
    task: 'grade',
    gradeMode: isLearnMode ? 'learn' : 'normal',
    stream,
    mode: isFreeDraw ? 'freedraw' : (isGenChemMode ? 'genchem' : 'ochem')
  });
}

export async function apiChat({ prompt, image, isGenChemMode, isFreeDraw, stream = false }) {
  return performApiChatRequest({
    prompt,
    image,
    task: 'chat',
    stream,
    mode: isFreeDraw ? 'freedraw' : (isGenChemMode ? 'genchem' : 'ochem')
  });
}

export async function apiReevaluate({ prompt, image, isGenChemMode, isLearnMode, stream = false }) {
  return performApiChatRequest({
    prompt,
    image,
    task: 'grade',
    gradeMode: isLearnMode ? 'learn' : 'normal',
    stream,
    mode: isGenChemMode ? 'genchem' : 'ochem'
  });
}
