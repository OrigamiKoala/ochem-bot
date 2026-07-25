function isLikelySmiles(token) {
  const s = token.trim();
  if (s.length < 3) return false;
  if (!/^[A-Za-z0-9@+\-\[\]\(\)\\/#=.]+$/.test(s)) return false;
  const excludeList = new Set(['THF', 'Hg', 'OAc', 'Hg(OAc)2']);
  if (excludeList.has(s) || excludeList.has(s.toUpperCase())) return false;
  const outsideBrackets = s.replace(/\[[^\]]*\]/g, '');
  const cleanOutside = outsideBrackets.replace(/Cl/g, '').replace(/Br/g, '');
  if (/[^BCNOSPFIbcnospfi0-9@+\-\(\)\\/#=.]/.test(cleanOutside)) return false;
  const atoms = s.match(/[COHNSPFIBcns]|\b(Cl|Br)\b/g);
  if (!atoms) return false;
  const hasSmilesSyntax = /[=\(\)#\[\]\\\/]/.test(s);
  if (hasSmilesSyntax) return true;
  return false;
}

function autoTagSmiles(text) {
  if (!text) return "";
  const parts = [];
  let lastIdx = 0;
  const mathRegex = /(\$\$.*?\$\$|\$.*?\$|\\\(.*?\\\)|\\\[.*?\\\]|\\ce\{.*?\})/gs;
  let match;

  while ((match = mathRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ isMath: false, content: text.substring(lastIdx, match.index) });
    }
    parts.push({ isMath: true, content: match[0] });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    parts.push({ isMath: false, content: text.substring(lastIdx) });
  }

  return parts.map(part => {
    if (part.isMath) return part.content;
    return part.content.replace(/\b[A-Za-z0-9@+\-\[\]\(\)\\/#=.]+\b/g, (token) => {
      if (isLikelySmiles(token)) {
        return `[[SMILES: ${token}]]`;
      }
      return token;
    });
  }).join('');
}

function wrapBracesInLatex(text) {
  if (typeof text !== 'string') return text;
  let result = '';
  let inMath = false;
  let inParenMath = false;
  let inBracketMath = false;
  let i = 0;
  while (i < text.length) {
    if (text.substring(i, i + 2) === '$$') { inMath = !inMath; result += '$$'; i += 2; continue; }
    if (text.charAt(i) === '$') { inMath = !inMath; result += '$'; i++; continue; }
    if (text.substring(i, i + 2) === '\\(') { inParenMath = true; result += '\\('; i += 2; continue; }
    if (text.substring(i, i + 2) === '\\)') { inParenMath = false; result += '\\)'; i += 2; continue; }
    if (text.substring(i, i + 2) === '\\[') { inBracketMath = true; result += '\\['; i += 2; continue; }
    if (text.substring(i, i + 2) === '\\]') { inBracketMath = false; result += '\\]'; i += 2; continue; }
    if (text.charAt(i) === '{' && !inMath && !inParenMath && !inBracketMath) {
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text.charAt(j) === '{') depth++;
        else if (text.charAt(j) === '}') depth--;
        j++;
      }
      if (depth === 0) {
        const content = text.substring(i + 1, j - 1);
        const trimmedContent = content.trim();
        const ceMatch = result.match(/\\ce\s*$/);
        if (ceMatch) {
          result = result.substring(0, result.length - ceMatch[0].length);
        }
        if (trimmedContent.length > 0) {
          if (trimmedContent.startsWith('\\ce{') && trimmedContent.endsWith('}')) {
            result += `$${trimmedContent}$`;
          } else {
            result += `$\\ce{${trimmedContent}}$`;
          }
        } else {
          result += '{}';
        }
        i = j;
        continue;
      }
    }
    result += text.charAt(i);
    i++;
  }
  return result;
}

const input1 = "1. $\\ce{Hg(OAc)2}$";
const input2 = "1. \\ce{Hg(OAc)2}";
const input3 = "1. Hg(OAc)2";
const input4 = "1. CC(=O)O";

console.log("Input 1 autoTagged:", autoTagSmiles(input1));
console.log("Input 1 wrapBraces:", wrapBracesInLatex(autoTagSmiles(input1)));
console.log("Input 2 autoTagged:", autoTagSmiles(input2));
console.log("Input 2 wrapBraces:", wrapBracesInLatex(autoTagSmiles(input2)));
console.log("Input 3 autoTagged:", autoTagSmiles(input3));
console.log("Input 3 wrapBraces:", wrapBracesInLatex(autoTagSmiles(input3)));
console.log("Input 4 autoTagged:", autoTagSmiles(input4));
