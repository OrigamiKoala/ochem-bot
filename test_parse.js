const fs = require('fs');

function parseSmilesSegments(text) {
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

const text = "Consider a sample of 'isotopically desymmetrized' 2,4-pentanediol. Specifically, examine the $(2R, 4S)$ diastereomer where the hydroxyl oxygen at the 2-position is the stable $^{16}O$ isotope, while the hydroxyl oxygen at the 4-position is the radioactive $^{15}O$ isotope ($t_{1/2} = 122$ s). \n\n1. At $t = 0$, is the molecule chiral or achiral?\n2. After several hours, the $^{15}O$ has entirely decayed via \\beta^+ emission to $^{15}N$. Assuming the $C-N$ bond remains intact and the resulting amine group is protonated to form an ammonium salt, what is the stereochemical nature of the organic product (neglecting the isotope of the other oxygen)?\n3. Explain the symmetry element (or lack thereof) that justifies the answer in part 1. Use the SMILES [[SMILES: C[C@H](O)C[C@@H](O)C]] as a reference for the 2,4-pentanediol backbone.";

console.log(JSON.stringify(parseSmilesSegments(text), null, 2));

const segments = parseSmilesSegments(text);
segments.forEach(seg => {
    if (seg.type === 'text') {
        let content = seg.content.trim();
        content = content.replace(/^[,;:\s]+/, '').replace(/[,;:\s]+$/, '');
        console.log("AFTER STRIP:", content);
    }
});
