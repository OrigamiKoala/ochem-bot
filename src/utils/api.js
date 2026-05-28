// API wrapper functions for /api/chat calls

export async function apiGenerate({ prompt, isGenChemMode, stream = true, responseMimeType = 'application/json' }) {
  return fetch('/api/chat', {
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

export async function apiGrade({ prompt, image, isLearnMode, isFreeDraw, isGenChemMode, stream = true }) {
  return fetch('/api/chat', {
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

export async function apiChat({ prompt, image, isGenChemMode, isFreeDraw, stream = true }) {
  return fetch('/api/chat', {
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

export async function apiReevaluate({ prompt, image, isGenChemMode, isLearnMode, stream = true }) {
  return fetch('/api/chat', {
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
