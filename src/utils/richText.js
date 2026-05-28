import { cleanSmiles, smilesToFormula, smilesOptions } from './smiles';
import { safeTypeset } from './mathJax';

// Parse text into segments of {type: 'text'|'smiles', content: string}.
// Handles SMILES atom brackets (e.g. [O-], [NH2]) inside [[SMILES: ...]] tags
// by tracking bracket depth.
export function parseSmilesSegments(text) {
  const segments = [];
  const tagPattern = /\[\[\s*SMILES:\s*/gi;
  let lastIndex = 0;
  let match;

  while ((match = tagPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.substring(lastIndex, match.index) });
    }

    let i = match.index + match[0].length;
    let depth = 0;
    let smilesStart = i;
    let found = false;

    while (i < text.length) {
      const ch = text[i];
      if (ch === '[') {
        depth++;
        i++;
      } else if (ch === ']') {
        if (depth > 0) {
          depth--;
          i++;
        } else {
          if (i + 1 < text.length && text[i + 1] === ']') {
            const smilesContent = text.substring(smilesStart, i);
            segments.push({ type: 'smiles', content: smilesContent });
            i += 2;
            while (i < text.length && text[i] === ']') i++;
            found = true;
            break;
          } else {
            i++;
          }
        }
      } else {
        i++;
      }
    }

    if (!found) {
      const smilesContent = text.substring(smilesStart);
      segments.push({ type: 'smiles', content: smilesContent });
      i = text.length;
    }

    lastIndex = i;
    tagPattern.lastIndex = i;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.substring(lastIndex) });
  }

  return segments;
}

export function wrapBracesInLatex(text) {
  if (typeof text !== 'string') return text;
  
  let result = '';
  let inMath = false;
  let inParenMath = false;
  let inBracketMath = false;
  
  let i = 0;
  while (i < text.length) {
    if (text.substring(i, i + 2) === '$$') {
      inMath = !inMath;
      result += '$$';
      i += 2;
      continue;
    }
    if (text[i] === '$') {
      inMath = !inMath;
      result += '$';
      i++;
      continue;
    }
    if (text.substring(i, i + 2) === '\\(') {
      inParenMath = true;
      result += '\\(';
      i += 2;
      continue;
    }
    if (text.substring(i, i + 2) === '\\)') {
      inParenMath = false;
      result += '\\)';
      i += 2;
      continue;
    }
    if (text.substring(i, i + 2) === '\\[') {
      inBracketMath = true;
      result += '\\[';
      i += 2;
      continue;
    }
    if (text.substring(i, i + 2) === '\\]') {
      inBracketMath = false;
      result += '\\]';
      i += 2;
      continue;
    }
    
    if (text[i] === '{' && !inMath && !inParenMath && !inBracketMath) {
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }
      
      if (depth === 0) {
        const content = text.substring(i + 1, j - 1);
        if (content.trim().length > 0) {
          if (content.trim().startsWith('\\ce{') && content.trim().endsWith('}')) {
            result += `$${content}$`;
          } else {
            result += `$\\ce{${content}}$`;
          }
        } else {
          result += '{}';
        }
        i = j;
        continue;
      }
    }
    
    result += text[i];
    i++;
  }
  
  return result;
}

// Render rich text with LaTeX + SMILES into a DOM container.
// This is an imperative DOM function used via refs.
export function renderRichText(text, container, isExplanation = false) {
  if (!container) return;
  container.innerHTML = '';

  text = wrapBracesInLatex(text);

  const segments = parseSmilesSegments(text);

  segments.forEach(seg => {
    if (seg.type === 'smiles') {
      let smiles = seg.content.trim();

      if (!isExplanation) {
        const hiddenText = document.createElement('span');
        hiddenText.className = 'sr-only-smiles';
        hiddenText.innerText = `[[SMILES: ${smiles}]]`;
        container.appendChild(hiddenText);
      }

      const wrapper = document.createElement('div');
      wrapper.className = isExplanation ? 'inline-molecule-explanation' : 'inline-molecule';

      const canvas = document.createElement('canvas');
      canvas.className = 'molecule-canvas';
      wrapper.appendChild(canvas);
      container.appendChild(wrapper);

      const dpr = window.devicePixelRatio || 1;
      const bSize = isExplanation ? 70 : 80;
      const size = bSize * dpr;
      canvas.style.width = bSize + "px";
      canvas.style.height = bSize + "px";

      const options = { width: size, height: size, ...smilesOptions };
      const sd = new window.SmilesDrawer.Drawer(options);

      const cleanedMol = cleanSmiles(smiles);
      if (cleanedMol) {
        window.SmilesDrawer.parse(cleanedMol, (tree) => {
          sd.draw(tree, canvas, 'monochrome', false);
        }, (err) => {
          console.error("Rich SMILES err:", cleanedMol, err);
          const fallbackFormula = smilesToFormula(smiles);
          const fallbackEl = document.createElement('span');
          if (fallbackFormula) {
            fallbackEl.innerHTML = `$ \\ce{${fallbackFormula}} $`;
          } else {
            fallbackEl.innerText = smiles;
            fallbackEl.style.fontSize = '0.8rem';
          }
          wrapper.replaceWith(fallbackEl);
        });
      } else {
        console.warn("cleanSmiles returned null for:", smiles);
        const fallbackFormula = smilesToFormula(smiles);
        const fallbackEl = document.createElement('span');
        if (fallbackFormula) {
          fallbackEl.innerHTML = `$ \\ce{${fallbackFormula}} $`;
        } else {
          fallbackEl.innerText = smiles;
          fallbackEl.style.fontSize = '0.8rem';
        }
        wrapper.replaceWith(fallbackEl);
      }

    } else if (seg.content.trim().length > 0) {
      const span = document.createElement('span');
      let content = seg.content.trim();

      content = content.replace(/^[,;:\s]+/, '').replace(/[,;:\s]+$/, '');
      if (content.length === 0) return;

      if (!content.includes('\\(') && !content.includes('\\[') && !content.includes('$')) {
        content = content.replace(/\\ce\{.*?\}/g, match => `$${match}$`);
        content = content.replace(/\\(Delta|alpha|beta|gamma|theta|mu|pi|sigma|phi|lambda|rightarrow|leftrightarrow|leftharpoons|deg)\b/g, match => `$${match}$`);

        if (!isExplanation) {
          if (/[_^{}\\+\-]/.test(content) || content.length >= 2) {
            if (!content.includes('$')) {
              content = `$ \\ce{${content}} $`;
            }
          }
        }
      }

      span.innerHTML = content.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
      container.appendChild(span);
    }
  });

  safeTypeset(container);
}
