import { jsonrepair } from 'https://cdn.jsdelivr.net/npm/jsonrepair@3/lib/esm/index.js';

// script.js
console.log("hi!");
const canvasEl = document.getElementById('whiteboard');

const clearBtn = document.getElementById('clear-btn');
const eraseBtn = document.getElementById('eraser-btn');
const generateBtn = document.getElementById('generate-btn');

// Initialize Fabric.js canvas
const fabricCanvas = new fabric.Canvas('whiteboard', {
    isDrawingMode: true,
    backgroundColor: 'transparent',
    selection: false,
});

// Configure the default pencil brush for smooth strokes
fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
fabricCanvas.freeDrawingBrush.color = '#2c3e50';
fabricCanvas.freeDrawingBrush.width = 3;
fabricCanvas.freeDrawingBrush.strokeLineCap = 'round';
fabricCanvas.freeDrawingBrush.strokeLineJoin = 'round';

// Keep a reference to the underlying canvas element for toDataURL compatibility
const canvas = fabricCanvas.lowerCanvasEl;

let isDrawing = false;
let isEraser = false;

// API key is handled securely on the backend in /api/chat.js
let reactionQueue = [];

// ------ Queue Cache (localStorage) ------
// Use separate cache keys for ochem vs genchem mode
function getQueueCacheKey() {
    if (isFreeDraw) return 'freedraw_reaction_queue';
    return isGenChemMode ? 'genchem_reaction_queue' : 'ochem_reaction_queue';
}

function saveQueueToCache() {
    try {
        const queueToSave = currentReaction ? [currentReaction, ...reactionQueue] : reactionQueue;
        localStorage.setItem(getQueueCacheKey(), JSON.stringify(queueToSave));
    } catch (e) {
        console.warn('Failed to save queue to cache:', e);
    }
}

function loadQueueFromCache() {
    try {
        const cached = localStorage.getItem(getQueueCacheKey());
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                // Flatten out any AI-hallucinated nested {reactions: [...]} objects that got cached
                let flattenedQueue = [];
                parsed.forEach(item => {
                    if (item && Array.isArray(item.reactions)) {
                        flattenedQueue = flattenedQueue.concat(item.reactions);
                    } else if (item && item.qtype) {
                        flattenedQueue.push(item);
                    }
                });

                // If flattening produced no valid objects, clear cache and return empty to force a new fetch
                if (flattenedQueue.length === 0) {
                    localStorage.removeItem(getQueueCacheKey());
                    return [];
                }

                return flattenedQueue;
            }
        }
    } catch (e) {
        console.warn('Failed to load queue from cache:', e);
    }
    return [];
}
let currentReaction = null;
let isFetching = false;
let isSubmitting = false;
let starterQuestionsBuffer = null;
let isInitialLoad = true;

// ------ Safe MathJax Typesetting ------
// MathJax loads asynchronously and may not be ready on slow connections (especially iPhone).
// This helper queues elements and typesets them once MathJax is available.
const _mathJaxQueue = [];
let _mathJaxReady = false;

function safeTypeset(element) {
    if (_mathJaxReady && window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([element]).catch(err => console.error('MathJax error:', err));
    } else {
        _mathJaxQueue.push(element);
    }
}

// Wait for MathJax to finish loading, then flush the queue
function initMathJaxReadyHook() {
    if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
        MathJax.startup.promise.then(() => {
            _mathJaxReady = true;
            // Flush queued elements
            while (_mathJaxQueue.length > 0) {
                const el = _mathJaxQueue.shift();
                // Only typeset if element is still in the DOM
                if (document.body.contains(el)) {
                    MathJax.typesetPromise([el]).catch(err => console.error('MathJax error:', err));
                }
            }
        });
    } else {
        // MathJax script tag hasn't been parsed yet — retry shortly
        setTimeout(initMathJaxReadyHook, 200);
    }
}
initMathJaxReadyHook();

// Monochrome theme for colorless SMILES
const monochromeTheme = {
    C: '#000', O: '#000', N: '#000', P: '#000', S: '#000', B: '#000',
    F: '#000', Cl: '#000', Br: '#000', I: '#000', H: '#000',
    BACKGROUND: 'transparent'
};
const smilesOptions = {
    padding: 10,
    themes: { monochrome: monochromeTheme }
};



// State for "Give Up" logic
let hasSubmitted = false;
let lastFeedback = "";
let isShowingAnswer = false;
let lastSubmittedImage = null; // Store for Free Draw explain requests

const submitBtn = document.getElementById('submit-btn');

let isCanvasBlank = true;
let isLearnMode = localStorage.getItem('ochem_learn_mode') === 'true';
const learnModeToggle = document.getElementById('learn-mode-toggle');

// Track drawing state via Fabric.js events
fabricCanvas.on('path:created', function () {
    if (isCanvasBlank) {
        isCanvasBlank = false;
        updateSubmitDisabled();
    }
});

// Handle window resizing correctly
function resizeCanvas() {
    const container = document.getElementById('whiteboard-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    fabricCanvas.setWidth(width);
    fabricCanvas.setHeight(height);
    fabricCanvas.renderAll();
}

window.addEventListener('resize', resizeCanvas);
// Give the browser a tiny bit of time to layout before initial sizing
setTimeout(resizeCanvas, 0);

// Intercept global touch events to strictly prevent "pull to refresh" reloads
document.body.addEventListener('touchmove', function (e) {
    // Allow touch scrolling on specific scrollable containers
    if (e.target.closest('#about-content') || e.target.closest('#topics-list') || e.target.closest('#explanation-display') || e.target.closest('#molecule-display')) {
        return;
    }

    // Allow vertical scrolling on #app (for whiteboard scroll) when not drawing on canvas
    if (e.target.closest('#app') && !e.target.closest('.canvas-container')) {
        return;
    }

    e.preventDefault();
}, { passive: false });


// ------ Toolbar Actions ------
clearBtn.addEventListener('click', () => {
    fabricCanvas.clear();
    fabricCanvas.backgroundColor = 'transparent';
    isCanvasBlank = true;
    updateSubmitDisabled();
});

if (eraseBtn) {
    eraseBtn.addEventListener('click', () => {
        isEraser = !isEraser;
        eraseBtn.classList.toggle('active-tool', isEraser);

        if (isEraser) {
            eraseBtn.innerText = "Pen";
            // Use a white brush to "erase" (draw over with background color)
            fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
            fabricCanvas.freeDrawingBrush.color = '#fafafa';
            fabricCanvas.freeDrawingBrush.width = 20;
            fabricCanvas.freeDrawingBrush.strokeLineCap = 'round';
            fabricCanvas.freeDrawingBrush.strokeLineJoin = 'round';
        } else {
            eraseBtn.innerText = "Eraser";
            fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
            fabricCanvas.freeDrawingBrush.color = '#2c3e50';
            fabricCanvas.freeDrawingBrush.width = 3;
            fabricCanvas.freeDrawingBrush.strokeLineCap = 'round';
            fabricCanvas.freeDrawingBrush.strokeLineJoin = 'round';
        }
    });
}
const baseTopics = ["addition", "substitution", "elimination", "on rings", "Grignard", "redox", "protecting groups", "cycloadditions", "electrocyclic", "rearrangements", "radicals", "carbenes", "stereochemistry", "regioselectivity"];
const genchemBaseTopics = ["stoichiometry", "thermodynamics", "kinetics", "equilibrium", "acid-base", "electrochemistry", "atomic structure", "bonding & VSEPR", "solutions & colligative", "gas laws", "nuclear chemistry", "coordination chemistry", "descriptive inorganic", "organic reactions"];

// Practice mode state — single source of truth
// Migrate old boolean flags to the new unified key on first load
(function migrateModeFlags() {
    if (!localStorage.getItem('ochem_practice_mode')) {
        if (localStorage.getItem('ochem_freedraw_mode') === 'true') {
            localStorage.setItem('ochem_practice_mode', 'freedraw');
        } else if (localStorage.getItem('ochem_genchem_mode') === 'true') {
            localStorage.setItem('ochem_practice_mode', 'all');
        } else {
            localStorage.setItem('ochem_practice_mode', 'organic');
        }
    }
})();
let practiceMode = localStorage.getItem('ochem_practice_mode') || 'organic';
let isGenChemMode = practiceMode === 'all';
let isFreeDraw = practiceMode === 'freedraw';
const practiceModeSelect = document.getElementById('practice-mode-select');

function getActiveBaseTopics() {
    return isGenChemMode ? genchemBaseTopics : baseTopics;
}

function getSelectedTopicsKey() {
    return isGenChemMode ? 'genchem_selected_topics' : 'ochem_selected_topics';
}

function getCustomTopicsKey() {
    return isGenChemMode ? 'genchem_custom_topics' : 'ochem_custom_topics';
}

let userCustomTopics = JSON.parse(localStorage.getItem(getCustomTopicsKey())) || [];
let selectedTopics = JSON.parse(localStorage.getItem(getSelectedTopicsKey())) || [...getActiveBaseTopics(), ...userCustomTopics];

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const messageCloseBtn = document.getElementById('message-close-btn');
const messageRestoreBtn = document.getElementById('message-restore-btn');
const messageContainer = document.getElementById('message-container');

const topicsListDiv = document.getElementById('topics-list');
const addCustomTopicBtn = document.getElementById('add-custom-topic-btn');
const customTopicInput = document.getElementById('custom-topic-input');
const helpBtn = document.getElementById('help-btn');
const followupInput = document.getElementById('followup-input');
const sendFollowupBtn = document.getElementById('send-followup-btn');
const chatMessages = document.getElementById('chat-messages');
const explanationDisplay = document.getElementById('explanation-display');
const explanationContent = document.getElementById('explanation-text-content');
const difficultySlider = document.getElementById('difficulty-slider');
const reportBtn = document.getElementById('report-btn');
const freedrawExplainBtn = document.getElementById('freedraw-explain-btn');


// ---- SMILES-to-formula conversion for simple reagents ----
// Many reagents (OH-, Na+, BrBr, HCl, NaOH, etc.) look terrible when drawn on a
// tiny SmilesDrawer canvas. This helper detects "simple" SMILES and converts them
// to mhchem-compatible formula strings so they render as clean text.

const SMILES_TO_FORMULA = {
    // Common ions
    '[OH-]': 'OH^{-}', '[O-]': 'O^{-}', '[Na+]': 'Na^{+}', '[K+]': 'K^{+}',
    '[Li+]': 'Li^{+}', '[NH4+]': 'NH4^{+}', '[NH2-]': 'NH2^{-}',
    '[Cl-]': 'Cl^{-}', '[Br-]': 'Br^{-}', '[I-]': 'I^{-}', '[F-]': 'F^{-}',
    '[H-]': 'H^{-}', '[H+]': 'H^{+}', '[BH4-]': 'BH4^{-}',
    '[AlH4-]': 'AlH4^{-}', '[CN-]': 'CN^{-}', 'N#[C-]': 'CN^{-}',
    '[N-]=[N+]=[N-]': 'N3^{-}', '[O-][O-]': 'O2^{2-}',
    // Common diatomic / small molecules (both notations)
    'BrBr': 'Br2', '[Br][Br]': 'Br2', 'ClCl': 'Cl2', '[Cl][Cl]': 'Cl2',
    'FF': 'F2', '[F][F]': 'F2', 'II': 'I2', '[I][I]': 'I2',
    'O=O': 'O2', '[H][H]': 'H2', 'O': 'H2O', 'N': 'NH3',
    'S': 'H2S', 'P': 'PH3',
    // Common reagents
    'OO': 'H2O2', 'Cl': 'HCl', 'Br': 'HBr', 'I': 'HI', 'F': 'HF',
    'O=S(=O)O': 'H2SO4', 'O=[N+]([O-])O': 'HNO3',
    'O=C=O': 'CO2', 'C=O': 'CH2O', 'CS': 'CH3SH',
    'CC(=O)Cl': 'CH3COCl', 'CC(=O)O': 'CH3COOH', 'CC=O': 'CH3CHO',
    'CCO': 'EtOH', 'CO': 'MeOH', 'CCOC': 'Et2O',
    'ClS(Cl)=O': 'SOCl2', 'ClP(Cl)Cl': 'PCl3', 'ClP(Cl)(Cl)=O': 'POCl3',
    'ClP(Cl)(Cl)(Cl)Cl': 'PCl5',
    'O=S(Cl)Cl': 'SOCl2',
    'OB(O)O': 'B(OH)3', '[BH3-]': 'BH3',
    // Grignard-type / organometallics
    '[Mg]': 'Mg', '[Zn]': 'Zn', '[Cu]': 'Cu', '[Pd]': 'Pd', '[Pt]': 'Pt',
    '[Ag]': 'Ag', '[Al]': 'Al',
};

// Heuristic: is this SMILES "simple enough" to render as a formula?
// Simple = few heavy atoms, no rings, basically linear chains or ions.
function isSimpleSmiles(smiles) {
    if (!smiles) return false;
    const s = smiles.trim();

    // Direct lookup match
    if (SMILES_TO_FORMULA[s]) return true;

    // Single atom in brackets (ions): [O-], [Na+], [NH2+], etc.
    if (/^\[[A-Za-z][a-z]?[HhDd]?\d*[+\-]\d*\]$/.test(s)) return true;

    // Count heavy atoms (uppercase letters = atoms in SMILES)
    const heavyAtoms = (s.match(/[A-Z]/g) || []).length;

    // Contains rings? (digit characters in SMILES denote ring closures)
    const hasRings = /\d/.test(s.replace(/\[[^\]]*\]/g, '')); // ignore digits inside brackets

    // Very short SMILES with no rings — treat as simple
    if (heavyAtoms <= 3 && !hasRings) return true;

    return false;
}

// Convert a simple SMILES to an mhchem formula string.
// Returns null if no conversion is available (caller should fall back to canvas).
function smilesToFormula(smiles) {
    if (!smiles) return null;
    const s = smiles.trim();

    // Direct lookup
    if (SMILES_TO_FORMULA[s]) return SMILES_TO_FORMULA[s];

    // Single bracketed ion: [OH-] -> OH^{-}, [Na+] -> Na^{+}
    const ionMatch = s.match(/^\[([A-Za-z][a-z]?[HhDd]?\d*)([+\-]\d*)\]$/);
    if (ionMatch) {
        const atom = ionMatch[1];
        const charge = ionMatch[2];
        return `${atom}^{${charge}}`;
    }

    // Single bracketed atom (no charge): [Br] -> Br, [Pd] -> Pd
    const bracketAtom = s.match(/^\[([A-Z][a-z]?)\]$/);
    if (bracketAtom) return bracketAtom[1];

    // Two bracketed identical atoms: [Br][Br] -> Br2
    const bracketDiatomic = s.match(/^\[([A-Z][a-z]?)\]\[(\1)\]$/);
    if (bracketDiatomic) return `${bracketDiatomic[1]}2`;

    // Fallback: try matching [X][Y] pattern (two bracketed atoms)
    const twoBrackets = s.match(/^\[([A-Z][a-z]?)\]\[([A-Z][a-z]?)\]$/);
    if (twoBrackets) {
        if (twoBrackets[1] === twoBrackets[2]) return `${twoBrackets[1]}2`;
        return `${twoBrackets[1]}${twoBrackets[2]}`;
    }

    // Two-letter element repeated (diatomic): BrBr -> Br2
    const diatomicMatch = s.match(/^([A-Z][a-z]?)\1$/);
    if (diatomicMatch) return `${diatomicMatch[1]}2`;

    // Very simple: just a few uppercase letters with lowercase, no special chars
    // e.g. "NaOH" -> "NaOH", "KOH" -> "KOH"
    if (/^[A-Za-z]+$/.test(s) && s.length <= 6) {
        return s; // Already looks like a formula
    }

    return null; // Can't convert — use canvas
}

// Helper to sanitize SMILES syntax to prevent parser crashes
function cleanSmiles(smiles) {
    if (!smiles) return null;
    let s = smiles.trim();

    // Strip [[SMILES: ...]] wrapping if still present (legacy/fallback)
    s = s.replace(/^\[\[\s*SMILES:\s*([\s\S]*?)\s*\]\]$/, '$1').trim();

    if (s.length === 0) return null;

    // Balance brackets — only trim excess closing ] at the end (don't prepend [)
    const openBrackets = (s.match(/\[/g) || []).length;
    const closeBrackets = (s.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) {
        s += ']'.repeat(openBrackets - closeBrackets);
    } else if (closeBrackets > openBrackets) {
        // Strip excess ] from end — prepending [ would corrupt the SMILES
        let excess = closeBrackets - openBrackets;
        while (excess > 0 && s.endsWith(']')) {
            s = s.substring(0, s.length - 1);
            excess--;
        }
    }

    // Check for hanging bond operators (truncated AI output)
    // Don't reject if it ends with a charge like [O-] or [NH2+]
    if (/[\-\+\=\#]$/.test(s) && !s.endsWith(']')) {
        console.warn("cleanSmiles: rejecting truncated SMILES:", s);
        return null;
    }

    return s;
}

// JSON repair is handled by the `jsonrepair` library (imported at the top).
// It handles truncated JSON, unescaped backslashes (e.g. LaTeX \frac),
// missing closing brackets, markdown code fences, and more.


// About Modal Elements
const aboutBtn = document.getElementById('about-btn');
const aboutModal = document.getElementById('about-modal');
const closeAboutBtn = document.getElementById('close-about-btn');
const aboutContent = document.getElementById('about-content');


let currentDifficulty = parseInt(localStorage.getItem('ochem_difficulty')) || 1;

function initSettings() {
    if (!topicsListDiv || !difficultySlider) return;

    // Set slider value
    difficultySlider.value = currentDifficulty;

    topicsListDiv.innerHTML = '';

    const allAvailableTopics = [...getActiveBaseTopics(), ...userCustomTopics];

    allAvailableTopics.forEach(topic => {
        const item = document.createElement('div');
        item.className = 'topic-item';
        const isChecked = selectedTopics.includes(topic);
        const isCustom = userCustomTopics.includes(topic);

        item.innerHTML = `
            <input type="checkbox" id="topic-${topic.replace(/\s+/g, '-')}" value="${topic}" ${isChecked ? 'checked' : ''}>
            <label for="topic-${topic.replace(/\s+/g, '-')}">${topic.charAt(0).toUpperCase() + topic.slice(1)}</label>
            ${isCustom ? `<button class="remove-topic-btn" data-topic="${topic}">×</button>` : ''}
        `;

        // Interaction logic
        item.addEventListener('click', (e) => {
            if (e.target.className === 'remove-topic-btn') {
                removeCustomTopic(e.target.dataset.topic);
                return;
            }
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL') {
                const cb = item.querySelector('input');
                cb.checked = !cb.checked;
            }
        });
        topicsListDiv.appendChild(item);
    });
}

// ------ Message UI Logic ------
if (messageCloseBtn) {
    messageCloseBtn.addEventListener('click', () => {
        messageContainer.style.display = 'none';
        messageRestoreBtn.style.display = 'flex';
    });
}

if (messageRestoreBtn) {
    messageRestoreBtn.addEventListener('click', () => {
        messageContainer.style.display = 'block';
        messageRestoreBtn.style.display = 'none';
    });
}

/**
 * Helper to handle streaming responses from the server.
 * Accumulates text and calls onChunk for every update, and onFinish at the end.
 */
async function handleStream(response, onChunk, onFinish) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            // Gemini API stream chunks are sometimes multiple per event or fragmented
            const lines = chunk.split('\n');

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data: ')) continue;

                try {
                    const jsonStr = trimmed.replace('data: ', '');
                    const data = JSON.parse(jsonStr);

                    // streamGenerateContent returns candidates in each chunk
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

function showMessage(text, className = "") {
    const loadingText = document.getElementById('loading-text');
    if (!loadingText) return;

    // Use renderRichText to support LaTeX and SMILES diagrams in bot replies
    // We treat this as an explanation-style text for better formatting
    renderRichText(text, loadingText, true);

    loadingText.className = className;
    messageContainer.style.display = 'block';
    messageRestoreBtn.style.display = 'none';
}

function hideMessage() {
    messageContainer.style.display = 'none';
}

function addCustomTopic() {

    const newTopic = customTopicInput.value.trim().toLowerCase();
    if (!newTopic) return;
    if (getActiveBaseTopics().includes(newTopic) || userCustomTopics.includes(newTopic)) {
        alert("Topic already exists!");
        return;
    }

    userCustomTopics.push(newTopic);
    selectedTopics.push(newTopic); // Auto-select new topic
    localStorage.setItem(getCustomTopicsKey(), JSON.stringify(userCustomTopics));
    localStorage.setItem(getSelectedTopicsKey(), JSON.stringify(selectedTopics));

    customTopicInput.value = '';

    // Set learn mode toggle
    if (learnModeToggle) {
        learnModeToggle.checked = isLearnMode;
    }

    initSettings();

}

function removeCustomTopic(topicToRemove) {
    userCustomTopics = userCustomTopics.filter(t => t !== topicToRemove);
    selectedTopics = selectedTopics.filter(t => t !== topicToRemove);
    localStorage.setItem(getCustomTopicsKey(), JSON.stringify(userCustomTopics));
    localStorage.setItem(getSelectedTopicsKey(), JSON.stringify(selectedTopics));
    initSettings();
}

if (addCustomTopicBtn) {
    addCustomTopicBtn.addEventListener('click', addCustomTopic);
}

// Live-preview topics when practice-mode dropdown changes (before Save)
if (practiceModeSelect) {
    practiceModeSelect.addEventListener('change', () => {
        const val = practiceModeSelect.value;
        // Temporarily update mode so getActiveBaseTopics/getCustomTopicsKey resolve correctly
        const prevMode = isGenChemMode;
        const prevFreeDraw = isFreeDraw;
        isGenChemMode = val === 'all';
        isFreeDraw = val === 'freedraw';
        // Show/hide topics list based on mode
        const topicsSection = document.querySelector('#settings-modal .modal-content > p');
        const customSection = document.getElementById('custom-topic-container');
        const difficultySection = document.getElementById('settings-difficulty-container');
        if (isFreeDraw) {
            if (topicsListDiv) topicsListDiv.style.display = 'none';
            if (topicsSection) topicsSection.style.display = 'none';
            if (customSection) customSection.style.display = 'none';
            if (difficultySection) difficultySection.style.display = 'none';
        } else {
            if (topicsListDiv) topicsListDiv.style.display = '';
            if (topicsSection) topicsSection.style.display = '';
            if (customSection) customSection.style.display = '';
            if (difficultySection) difficultySection.style.display = '';
            userCustomTopics = JSON.parse(localStorage.getItem(getCustomTopicsKey())) || [];
            selectedTopics = JSON.parse(localStorage.getItem(getSelectedTopicsKey())) || [...getActiveBaseTopics(), ...userCustomTopics];
            initSettings();
        }
        // Restore actual mode (it only commits on Save)
        isGenChemMode = prevMode;
        isFreeDraw = prevFreeDraw;
    });
}

// Snapshot of settings taken when the modal opens, used to detect actual changes
let _settingsSnapshot = null;

if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        // Snapshot current settings before the user can modify them
        _settingsSnapshot = {
            topics: [...selectedTopics].sort().join(','),
            difficulty: currentDifficulty,
            learnMode: isLearnMode,
            practiceMode: practiceMode
        };

        // Set dropdown to current practice mode
        if (practiceModeSelect) {
            practiceModeSelect.value = practiceMode;
        }

        // Show/hide topics based on current free draw state
        const topicsSection = document.querySelector('#settings-modal .modal-content > p');
        const customSection = document.getElementById('custom-topic-container');
        const difficultySection = document.getElementById('settings-difficulty-container');
        if (isFreeDraw) {
            if (topicsListDiv) topicsListDiv.style.display = 'none';
            if (topicsSection) topicsSection.style.display = 'none';
            if (customSection) customSection.style.display = 'none';
            if (difficultySection) difficultySection.style.display = 'none';
        } else {
            if (topicsListDiv) topicsListDiv.style.display = '';
            if (topicsSection) topicsSection.style.display = '';
            if (customSection) customSection.style.display = '';
            if (difficultySection) difficultySection.style.display = '';
        }

        initSettings();
        settingsModal.style.display = 'flex';
    });
}

if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
        // --- Save current queue to OLD mode's cache BEFORE switching ---
        const oldCacheKey = getQueueCacheKey();
        const queueToSave = currentReaction ? [currentReaction, ...reactionQueue] : [...reactionQueue];
        try { localStorage.setItem(oldCacheKey, JSON.stringify(queueToSave)); } catch(e) {}

        // Save practice mode from dropdown
        const prevPracticeMode = practiceMode;
        if (practiceModeSelect) {
            practiceMode = practiceModeSelect.value;
            localStorage.setItem('ochem_practice_mode', practiceMode);
            isGenChemMode = practiceMode === 'all';
            isFreeDraw = practiceMode === 'freedraw';
        }

        const modeChanged = prevPracticeMode !== practiceMode;

        // If mode changed, load that mode's saved topics (or defaults)
        if (modeChanged && !isFreeDraw) {
            // Load the new mode's custom topics and selections from cache
            userCustomTopics = JSON.parse(localStorage.getItem(getCustomTopicsKey())) || [];
            selectedTopics = JSON.parse(localStorage.getItem(getSelectedTopicsKey())) || [...getActiveBaseTopics(), ...userCustomTopics];
        } else if (!isFreeDraw) {
            const checkboxes = topicsListDiv.querySelectorAll('input[type="checkbox"]');
            selectedTopics = Array.from(checkboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);
        }

        // Save difficulty
        currentDifficulty = parseInt(difficultySlider.value);
        localStorage.setItem('ochem_difficulty', currentDifficulty);

        // Save learn mode
        if (learnModeToggle) {
            isLearnMode = learnModeToggle.checked;
            localStorage.setItem('ochem_learn_mode', isLearnMode);
        }

        // Default to all if none selected to prevent errors
        if (!isFreeDraw && selectedTopics.length === 0) selectedTopics = [...getActiveBaseTopics(), ...userCustomTopics];

        if (!isFreeDraw) localStorage.setItem(getSelectedTopicsKey(), JSON.stringify(selectedTopics));
        settingsModal.style.display = 'none';

        // Only regenerate questions if settings actually changed
        const newSnapshot = {
            topics: [...selectedTopics].sort().join(','),
            difficulty: currentDifficulty,
            learnMode: isLearnMode,
            practiceMode: practiceMode
        };
        const changed = !_settingsSnapshot ||
            newSnapshot.topics !== _settingsSnapshot.topics ||
            newSnapshot.difficulty !== _settingsSnapshot.difficulty ||
            newSnapshot.learnMode !== _settingsSnapshot.learnMode ||
            newSnapshot.practiceMode !== _settingsSnapshot.practiceMode;

        if (changed) {
            if (modeChanged) {
                // Restore queue from the NEW mode's cache instead of wiping
                currentReaction = null;
                reactionQueue = loadQueueFromCache();
                updateFreeDrawUI();
                if (isFreeDraw) {
                    enterFreeDrawMode();
                } else if (reactionQueue.length > 0) {
                    displayNextReaction();
                    if (reactionQueue.length <= 2) fetchBatchReactions(false);
                } else {
                    resetQuestionUI();
                    fetchBatchReactions(true);
                }
            } else {
                resetQuestionUI();
                if (!isFreeDraw) fetchBatchReactions(true);
            }
        }
        _settingsSnapshot = null;
    });
}

// Help button toggle
if (helpBtn) {
    helpBtn.addEventListener('click', () => {
        if (explanationDisplay) {
            const isHidden = explanationDisplay.style.display === 'none';
            explanationDisplay.style.display = isHidden ? 'block' : 'none';
        }
    });
}

// ------ AI Tutor Follow-up Chat ------
function addChatMessage(role, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${role === 'user' ? 'user-msg' : 'bot-msg'}`;
    msgDiv.innerText = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendFollowupQuestion() {
    const question = followupInput.value.trim();
    if (!question || !currentReaction) return;

    addChatMessage('user', question);
    followupInput.value = '';

    const botMsgDiv = document.createElement('div');
    botMsgDiv.className = 'chat-msg bot-msg';
    botMsgDiv.innerText = '...';
    chatMessages.appendChild(botMsgDiv);

    try {
        const prompt = `Reaction: ${currentReaction.reactants} + [${currentReaction.reagents || ''}] / [${currentReaction.conditions || ''}] → ${currentReaction.answer}
Explanation: ${currentReaction.explanation}

Student asks: ${question}

Answer concisely as ${isGenChemMode ? 'chemistry' : 'organic chemistry'} tutor. Use [[SMILES: ...]] for structures.`;

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, task: 'chat', stream: true, mode: isGenChemMode ? 'genchem' : 'ochem' })
        });

        if (!response.ok) {
            const errorData = await response.json();
            const errMsg = errorData.error || "";
            if (response.status === 503 || response.status === 429 || errMsg.toLowerCase().includes('busy') || errMsg.toLowerCase().includes('capacity')) {
                botMsgDiv.innerText = "The bot is currently at capacity. Please try again in a moment.";
            } else {
                botMsgDiv.innerText = "Oops, I'm having trouble connecting to the lab.";
            }
            return;
        }

        await handleStream(
            response,
            (text) => {
                botMsgDiv.innerText = text;
                // Scroll chat to bottom
                chatMessages.scrollTop = chatMessages.scrollHeight;
            },
            (finalText) => {
                if (finalText) {
                    // Render final LaTeX/SMILES
                    renderRichText(finalText, botMsgDiv, true);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                } else {
                    botMsgDiv.innerText = "Sorry, I couldn't process that question.";
                }
            }
        );
    } catch (e) {
        console.error("Chat error:", e);
        botMsgDiv.innerText = "Oops, I'm having trouble connecting to the lab.";
    }
}

if (sendFollowupBtn) {
    sendFollowupBtn.addEventListener('click', sendFollowupQuestion);
}
if (followupInput) {
    followupInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendFollowupQuestion();
    });
}

// Close modal when clicking outside
if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });
}

// ------ About Modal Logic ------
async function loadIntro() {
    try {
        const response = await fetch('./intro.txt');
        if (response.ok) {
            const html = await response.text();
            if (aboutContent) aboutContent.innerHTML = html;
        }
    } catch (e) {
        console.error("Failed to load intro.txt", e);
    }
}

function showAboutModal() {
    if (aboutModal) {
        aboutModal.style.display = 'flex';
    }
}

function checkFirstVisit() {
    const hasVisited = localStorage.getItem('ochem_visited');
    if (!hasVisited) {
        showAboutModal();
        localStorage.setItem('ochem_visited', 'true');
    }
}

if (aboutBtn) {
    aboutBtn.addEventListener('click', () => {
        showAboutModal();
    });
}

if (closeAboutBtn) {
    closeAboutBtn.addEventListener('click', () => {
        aboutModal.style.display = 'none';
    });
}

if (aboutModal) {
    aboutModal.addEventListener('click', (e) => {
        if (e.target === aboutModal) {
            aboutModal.style.display = 'none';
        }
    });
}

// Load intro content immediately
loadIntro();

// Check for first visit auto-open
checkFirstVisit();


function updateSubmitDisabled() {
    submitBtn.disabled = isCanvasBlank || isSubmitting;
    submitBtn.style.opacity = submitBtn.disabled ? "0.5" : "1";
    submitBtn.style.cursor = submitBtn.disabled ? "not-allowed" : "pointer";
}
updateSubmitDisabled(); // Initial state

// Helper to prepare drawing for AI: downscale and convert to JPEG for speed
async function getOptimizedImage() {
    const originalBg = fabricCanvas.backgroundColor;
    fabricCanvas.backgroundColor = 'white';

    const dataUrl = fabricCanvas.toDataURL({
        format: 'jpeg',
        quality: 0.7,
        multiplier: 0.5
    });

    fabricCanvas.backgroundColor = originalBg;

    return dataUrl.split(',')[1];
}


// ------ Submit and Evaluate ------
function renderReaction(data, showAnswer = false) {
    const instructionDiv = document.getElementById('question-instruction');
    const moleculeDiv = document.getElementById('molecule-display');
    const loadingText = document.getElementById('loading-text');

    if (!instructionDiv || !moleculeDiv || !explanationDisplay || !explanationContent) return;

    // Immediate clear
    moleculeDiv.innerHTML = '';

    // Only hide explanation if we aren't explicitly showing the answer
    if (!showAnswer) {
        explanationDisplay.style.display = 'none';
        chatMessages.innerHTML = ''; // Reset chat history
    }

    // Reset/Parse explanation
    renderRichText(data.explanation || "No explanation preloaded.", explanationContent, true);


    // Hide status text ONLY if we aren't displaying a persistent answer result
    // and if we are loading a NEW reaction (not just showing an answer)
    if (!showAnswer) {
        if (loadingText && loadingText.innerText !== "Checking..." && !loadingText.innerText.includes("Incorrect")) {
            document.getElementById('message-container').style.display = 'none';
        }
    } else {
        // If we are showing an answer, we should probably show the message container if there is feedback
        if (lastFeedback) {
            document.getElementById('message-container').style.display = 'block';
        }
    }



    if (!data) return;

    // AI sometimes renames 'instructions' to 'instruction' or 'question'
    const questionText = data.instructions || data.instruction || data.question || data.text;

    // Set Instruction (with LaTeX/SMILES support)
    renderRichText(questionText || (isGenChemMode ? "" : "Predict the major product:"), instructionDiv, true);

    // Helper: check if a field has meaningful content (not empty, not "None", etc.)
    function hasContent(field) {
        if (!field) return false;
        const trimmed = field.trim().toLowerCase();
        return trimmed.length > 0 && trimmed !== 'none' && trimmed !== 'n/a' && trimmed !== '-';
    }

    // Helper: clean AI hallucinations of [[SMILES: ... ]] tags from fields that should be pure SMILES
    function extractPureSmiles(str) {
        if (!str) return "";
        let s = str.trim();
        // If it's wrapped in a SMILES tag, extract just the content
        const tagMatch = /\[\[\s*SMILES:\s*(.*?)\s*\]\]/i.exec(s);
        if (tagMatch) return tagMatch[1];
        // Otherwise remove just the opening/closing tags if they leaked
        return s.replace(/\[\[\s*SMILES:\s*/gi, '').replace(/\]\]/g, '').trim();
    }

    // Render Reactants (guard against missing or plain-text reactants in gen-chem mode)
    if (hasContent(data.reactants)) {
        let cleanReactants = extractPureSmiles(data.reactants);
        // Heuristic: pure SMILES shouldn't have spaces (unless part of a list, but usually they use dot-separated)
        const looksLikeSMILES = !cleanReactants.includes(' ') && (/[=\(\)#\[\]]/.test(cleanReactants) || cleanReactants.length < 80);

        if (looksLikeSMILES) {
            const reactantMolecules = cleanReactants.split('.').map(s => s.trim()).filter(s => s.length > 0);
            renderMolecules(reactantMolecules, moleculeDiv);
        } else {
            // Plain text description — render as rich text
            const reactantText = document.createElement('div');
            reactantText.style.cssText = 'font-size: 1rem; color: #1c1c1e; margin-bottom: 8px;';
            renderRichText(data.reactants, reactantText, true);
            moleculeDiv.appendChild(reactantText);
        }
    }

    // Only show the reaction arrow + reagents/conditions if there's meaningful content
    const hasReagents = hasContent(data.reagents);
    const hasConditions = hasContent(data.conditions);

    if (hasReagents || hasConditions || hasContent(data.reactants)) {
        const arrowContainer = document.createElement('div');
        arrowContainer.className = 'reaction-arrow-container';

        const topRow = document.createElement('div');
        topRow.className = 'reagents-top';
        const reagentsText = data.reagents || data.conditions || '';
        if (hasContent(reagentsText)) {
            renderRichText(reagentsText.replace(/\\\\/g, '\\'), topRow);
        }

        const arrowLine = document.createElement('div');
        arrowLine.className = 'arrow-line';

        const bottomRow = document.createElement('div');
        bottomRow.className = 'conditions-bottom';
        if (hasReagents && hasConditions) {
            renderRichText(data.conditions, bottomRow);
        }

        arrowContainer.appendChild(topRow);
        arrowContainer.appendChild(arrowLine);
        arrowContainer.appendChild(bottomRow);
        moleculeDiv.appendChild(arrowContainer);

        safeTypeset(arrowContainer);
    }

    // Show the answer only when explicitly requested (give-up or correct submission)
    if (showAnswer) {
        if (data.answer) {
            let cleanAnswer = extractPureSmiles(data.answer);
            // Check if answer looks like pure SMILES (no spaces)
            const answerLooksSMILES = !cleanAnswer.includes(' ') && (/[=\(\)#\[\]]/.test(cleanAnswer) || cleanAnswer.length < 80) && /^[A-Za-z0-9@+\-\[\]\(\)\\/#=.]+$/.test(cleanAnswer);

            if (answerLooksSMILES) {
                const answerMolecules = cleanAnswer.split('.').map(s => s.trim()).filter(s => s.length > 0);
                renderMolecules(answerMolecules, moleculeDiv, "answer");
            } else {
                // Plain text / numeric / formula answer
                const answerDiv = document.createElement('div');
                answerDiv.style.cssText = 'font-size: 1.1rem; font-weight: 600; color: #34c759; margin-top: 10px; padding: 8px 12px; background: #f0faf0; border-radius: 8px;';
                renderRichText(data.answer, answerDiv, true);
                moleculeDiv.appendChild(answerDiv);
            }
        }
    }
}

// Helper to render a group of molecules with '+' signs
function renderMolecules(molecules, container, suffix = "") {
    molecules.forEach((mol, index) => {
        const newCanvas = document.createElement('canvas');
        newCanvas.id = `canvas-${suffix}-${index}-${Date.now()}`; // Unique ID



        container.appendChild(newCanvas);

        // iPad/Retina support: Scale resolution by device pixel ratio
        const dpr = window.devicePixelRatio || 1;
        const baseSize = 100; // Increased base size
        const size = baseSize * dpr;

        const options = {
            width: size,
            height: size,
            ...smilesOptions
        };
        let smilesDrawer = new SmilesDrawer.Drawer(options);

        // Adjust canvas display size
        newCanvas.style.width = baseSize + "px";
        newCanvas.style.height = baseSize + "px";

        const cleanedMol = cleanSmiles(mol);
        if (!cleanedMol) return;

        SmilesDrawer.parse(cleanedMol, function (tree) {
            smilesDrawer.draw(tree, newCanvas, 'monochrome', false);
        }, function (err) {
            console.error("Smiles parsing error: ", cleanedMol, err);
            // Fallback for user: replace canvas with text if rendering fails
            const fallback = document.createElement('span');
            fallback.innerText = mol;
            fallback.style.fontSize = '0.8rem';
            newCanvas.replaceWith(fallback);
        });

    });
}

// Parse text into segments of {type: 'text'|'smiles', content: string}.
// Handles SMILES atom brackets (e.g. [O-], [NH2]) inside [[SMILES: ...]] tags
// by tracking bracket depth — only treats ]] as the tag closer when depth == 0.
function parseSmilesSegments(text) {
    const segments = [];
    const tagPattern = /\[\[\s*SMILES:\s*/gi;
    let lastIndex = 0;
    let match;

    while ((match = tagPattern.exec(text)) !== null) {
        // Push any text before this tag
        if (match.index > lastIndex) {
            segments.push({ type: 'text', content: text.substring(lastIndex, match.index) });
        }

        // Now parse the SMILES content, tracking bracket depth
        let i = match.index + match[0].length;
        let depth = 0; // Track [ ] nesting inside SMILES
        let smilesStart = i;
        let found = false;

        while (i < text.length) {
            const ch = text[i];
            if (ch === '[') {
                depth++;
                i++;
            } else if (ch === ']') {
                if (depth > 0) {
                    // Closing an atom bracket inside the SMILES
                    depth--;
                    i++;
                } else {
                    // depth == 0: this ] might be part of the closing ]]
                    if (i + 1 < text.length && text[i + 1] === ']') {
                        // Found the closing ]] — extract SMILES content
                        const smilesContent = text.substring(smilesStart, i);
                        segments.push({ type: 'smiles', content: smilesContent });
                        i += 2; // Skip past ]]
                        // Also skip any extra trailing ] (AI sometimes outputs ]]])
                        while (i < text.length && text[i] === ']') i++;
                        found = true;
                        break;
                    } else {
                        // Single ] at depth 0 — shouldn't normally happen in valid
                        // SMILES inside a tag, but advance to avoid infinite loop
                        i++;
                    }
                }
            } else {
                i++;
            }
        }

        if (!found) {
            // Tag was never closed — treat the whole remaining text as SMILES
            const smilesContent = text.substring(smilesStart);
            segments.push({ type: 'smiles', content: smilesContent });
            i = text.length;
        }

        lastIndex = i;
        tagPattern.lastIndex = i; // Resume regex search after parsed content
    }

    // Push any remaining text after the last tag
    if (lastIndex < text.length) {
        segments.push({ type: 'text', content: text.substring(lastIndex) });
    }

    return segments;
}

//// ------ Rendering Mechanistic Explanations & Rich Text ------
function renderRichText(text, container, isExplanation = false) {
    if (!container) return;
    container.innerHTML = '';

    // Parse SMILES tags from the text. SMILES can contain ] chars (atom brackets
    // like [O-], [NH2]), so simple regex splitting breaks. Instead, we use a custom
    // parser that tracks bracket depth inside the SMILES content to find the real
    // closing ]] delimiter.
    const segments = parseSmilesSegments(text);

    segments.forEach(seg => {
        if (seg.type === 'smiles') {
            let smiles = seg.content.trim();

            // For copy-pastability, we keep the sr-only-smiles span
            if (!isExplanation) {
                const hiddenText = document.createElement('span');
                hiddenText.className = 'sr-only-smiles';
                hiddenText.innerText = `[[SMILES: ${smiles}]]`;
                container.appendChild(hiddenText);
            }

            // Always render SMILES as structural diagrams on canvas
            const wrapper = document.createElement('div');
            wrapper.className = isExplanation ? 'inline-molecule-explanation' : 'inline-molecule';

            const canvas = document.createElement('canvas');
            canvas.className = 'molecule-canvas';
            wrapper.appendChild(canvas);
            container.appendChild(wrapper);

            // Draw molecule
            const dpr = window.devicePixelRatio || 1;
            const bSize = isExplanation ? 70 : 80;
            const size = bSize * dpr;
            canvas.style.width = bSize + "px";
            canvas.style.height = bSize + "px";

            const options = { width: size, height: size, ...smilesOptions };
            const sd = new SmilesDrawer.Drawer(options);

            const cleanedMol = cleanSmiles(smiles);
            if (cleanedMol) {
                SmilesDrawer.parse(cleanedMol, (tree) => {
                    sd.draw(tree, canvas, 'monochrome', false);
                }, (err) => {
                    console.error("Rich SMILES err:", cleanedMol, err);
                    // Fallback: try formula conversion, otherwise show raw text
                    const fallbackFormula = smilesToFormula(smiles);
                    const fallbackEl = document.createElement('span');
                    if (fallbackFormula) {
                        fallbackEl.innerHTML = `\\( \\ce{${fallbackFormula}} \\)`;
                    } else {
                        fallbackEl.innerText = smiles;
                        fallbackEl.style.fontSize = '0.8rem';
                    }
                    wrapper.replaceWith(fallbackEl);
                });
            } else {
                // cleanSmiles returned null — show text fallback instead of blank canvas
                console.warn("cleanSmiles returned null for:", smiles);
                const fallbackFormula = smilesToFormula(smiles);
                const fallbackEl = document.createElement('span');
                if (fallbackFormula) {
                    fallbackEl.innerHTML = `\\( \\ce{${fallbackFormula}} \\)`;
                } else {
                    fallbackEl.innerText = smiles;
                    fallbackEl.style.fontSize = '0.8rem';
                }
                wrapper.replaceWith(fallbackEl);
            }

        } else if (seg.content.trim().length > 0) {
            const span = document.createElement('span');
            let content = seg.content.trim();

            // Strip leading/trailing commas and separators that can break mhchem
            // e.g. ", NaOH" from splitting around [[SMILES:...]], NaOH
            content = content.replace(/^[,;:\s]+/, '').replace(/[,;:\s]+$/, '');
            if (content.length === 0) return; // Nothing left after stripping

            // Reagents/Conditions on arrow need auto-mhchem wrapping
            // Explanation text: 
            // We rely on the AI's math delimiters ($...$ or \[...\]) to render LaTeX properly,
            // as auto-wrapping breaks existing delimiters and generates MathJax errors.
            if (!isExplanation && !content.includes('\\(') && !content.includes('\\[')) {
                if (/[_^{}\\+\-]/.test(content) || content.length >= 2) {
                    content = `\\( \\ce{${content}} \\)`;
                }
            }

            // The AI often passes literal \n sequences inside the JSON string instead of true newlines.
            span.innerHTML = content.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
            container.appendChild(span);
        }
    });

    safeTypeset(container);
}


// ------ Starter Questions Selection ------
async function getStarterQuestion(targetTopic, targetDifficulty) {
    if (!starterQuestionsBuffer) {
        try {
            const response = await fetch('starter.json');
            if (response.ok) {
                const data = await response.json();
                starterQuestionsBuffer = data.reactions || [];
            }
        } catch (e) {
            console.error("Failed to load starter.json", e);
            return null;
        }
    }

    if (!starterQuestionsBuffer || starterQuestionsBuffer.length === 0) return null;

    let difficultyKey = "beginner";
    if (targetDifficulty > 33 && targetDifficulty <= 66) difficultyKey = "intermediate";
    else if (targetDifficulty > 66) difficultyKey = "collegiate";
    // Handle spaces as underscores (e.g. "on rings" -> "on_rings")
    const topicKey = targetTopic.replace(/\s+/g, '_');

    // Case-insensitive/flexible match for the topic in the ID
    const matches = starterQuestionsBuffer.filter(q => {
        const idLower = q.id.toLowerCase();
        return idLower.startsWith(difficultyKey) && idLower.includes(`_${topicKey.toLowerCase()}_`);
    });

    if (matches.length > 0) {
        return matches[Math.floor(Math.random() * matches.length)];
    }
    return null;
}

// ------ Fetch Batch of Reactions ------
async function fetchBatchReactions(isExplicit = false) {
    if (isFetching) return;
    isFetching = true;

    const container = document.getElementById('reaction-container');
    const loadingText = document.getElementById('loading-text');

    // Only clear and show "Generating..." if this is an explicit user request and the queue is empty
    if (isExplicit && reactionQueue.length === 0) {
        container.querySelectorAll('canvas, .plus-sign, .reaction-arrow').forEach(el => el.remove());
        loadingText.innerText = "Generating...";
        document.getElementById('message-container').style.display = 'block';
    }


    try {
        // Use user-selected topics
        const questiontypes = ["predict product", "draw arrow mechanism", "stereochemistry focus"]
        const topic = selectedTopics[Math.floor(Math.random() * selectedTopics.length)];
        const questiontype = questiontypes[Math.floor(Math.random() * 3)];

        // Immediate gratification: If this is the VERY first ever question request, try starter.json first
        if (isInitialLoad && !currentReaction && reactionQueue.length === 0) {
            const starter = await getStarterQuestion(topic, currentDifficulty);
            isInitialLoad = false; // Only try once
            if (starter) {
                console.log("Loading starter question:", starter.id);
                reactionQueue.push(starter);
                displayNextReaction();
            }
        }
        isInitialLoad = false; // Ensure it's false even if starter fetch failed

        const diffExplanation = "(1=beginner/introductory, 50=intermediate/USNCO level, 100=advanced/IChO level)";
        const prompt = isGenChemMode
            ? `5 chemistry olympiad questions. Topic: ${topic}. Difficulty: ${currentDifficulty}/100 ${diffExplanation}. Type: ${questiontype}. JSON only. ${currentDifficulty > 33 ? 'Allow multi-part calculations.' : ''}`
            : `5 organic chemistry questions. Topic: ${topic}. Difficulty: ${currentDifficulty}/100 ${diffExplanation}. Type: ${questiontype}. JSON only. ${currentDifficulty > 33 ? 'Allow multistep reagents.' : ''}`;


        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                task: 'generate',
                responseMimeType: 'application/json',
                stream: true,
                mode: isGenChemMode ? 'genchem' : 'ochem'
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            const errMsg = errorData.error || "";
            console.error('Gemini API Error:', response.status, errorData);

            if (response.status === 503 || response.status === 500 || response.status === 429 || errMsg.toLowerCase().includes('busy') || errMsg.toLowerCase().includes('capacity')) {
                loadingText.innerText = "The bot is currently at capacity. Please try again in a moment.";
            } else {
                loadingText.innerText = "Oops. Looks like the bot messed up!";
            }

            document.getElementById('message-container').style.display = 'block';
            isFetching = false;
            return;
        }

        // Notify user if the server had to switch models
        if (response.headers.get('X-Model-Fallback')) {
            loadingText.innerText = "Taking a bit longer — switched to a backup model...";
            document.getElementById('message-container').style.display = 'block';
        }

        await handleStream(
            response,
            (text) => {
                loadingText.innerText = `Generating questions... (${text.length} characters)`;
            },
            (finalText) => {
                if (finalText) {
                    let rawText = finalText;
                    try {
                        // Use jsonrepair to fix truncated JSON, unescaped backslashes,
                        // markdown code fences, missing brackets, etc.
                        let data;
                        try {
                            data = JSON.parse(rawText.trim());
                        } catch (parseErr) {
                            console.warn("JSON parse failed, attempting jsonrepair...", parseErr.message);
                            const repaired = jsonrepair(rawText.trim());
                            data = JSON.parse(repaired);
                            console.log("jsonrepair succeeded, recovered reactions:",
                                (data.reactions || data).length);
                        }

                        // Convert placeholder tokens to LaTeX in all string fields
                        function applyLatexTokens(obj) {
                            if (typeof obj === 'string') {
                                return obj
                                    .replace(/\{DELTA\}/g, '\\Delta')
                                    .replace(/\{deg\}/g, '^{\\circ}')
                                    .replace(/\{hv\}/g, 'h\\nu')
                                    .replace(/\{H2\}/g, 'H_2')
                                    .replace(/\{H\+\}/g, 'H^{+}');
                            }
                            if (Array.isArray(obj)) return obj.map(applyLatexTokens);
                            if (obj && typeof obj === 'object') {
                                const out = {};
                                for (const k in obj) out[k] = applyLatexTokens(obj[k]);
                                return out;
                            }
                            return obj;
                        }
                        const processedData = applyLatexTokens(data);

                        // Support multiple AI hallucinated shapes:
                        // 1. { "reactions": [ { qtype... } ] }
                        // 2. [ { qtype... } ]
                        // 3. [ { "reactions": [ { qtype... } ] } ]
                        let reactions = [];
                        if (Array.isArray(processedData)) {
                            // It's an array. Check if the elements are wrapper objects or actual reactions
                            processedData.forEach(item => {
                                if (item && Array.isArray(item.reactions)) {
                                    reactions = reactions.concat(item.reactions);
                                } else if (item && item.qtype) {
                                    reactions.push(item);
                                }
                            });
                        } else if (processedData && Array.isArray(processedData.reactions)) {
                            reactions = processedData.reactions;
                        }

                        if (reactions.length > 0) {
                            reactionQueue = [...reactionQueue, ...reactions];
                            saveQueueToCache();
                            updateQueueCount();
                        }
                    } catch (e) {
                        console.error("JSON parse error", e, rawText);
                        loadingText.innerText = "Error parsing response.";
                        document.getElementById('message-container').style.display = 'block';
                    }
                }
            }
        );
    } catch (e) {
        console.error("Fetch error:", e);
        loadingText.innerText = "Oops. Looks like the bot messed up!";
        document.getElementById('message-container').style.display = 'block';
    } finally {
        isFetching = false;

        // If the user was waiting for this specific batch (queue was empty),
        // display the first reaction from the new batch.
        if (reactionQueue.length > 0 && !currentReaction) {
            displayNextReaction();
        }

        // Auto-hide the loading screen if it's not showing a persistent result
        if (loadingText.innerText.includes("Generating...") || loadingText.innerText.includes("Checking...")) {
            // Handled by other logic
        }
    }
}

// ------ Free Draw Mode Helpers ------
function enterFreeDrawMode() {
    const instructionDiv = document.getElementById('question-instruction');
    const moleculeDiv = document.getElementById('molecule-display');

    currentReaction = null;
    hasSubmitted = false;
    lastFeedback = '';
    isShowingAnswer = false;
    lastSubmittedImage = null;
    if (freedrawExplainBtn) freedrawExplainBtn.style.display = 'none';

    if (instructionDiv) instructionDiv.innerText = 'Free Draw Mode — draw any mechanism and submit for grading.';
    if (moleculeDiv) moleculeDiv.innerHTML = '';
    if (explanationDisplay) explanationDisplay.style.display = 'none';
    if (chatMessages) chatMessages.innerHTML = '';

    // Clear whiteboard
    fabricCanvas.clear(); fabricCanvas.backgroundColor = 'transparent';
    isCanvasBlank = true;
    updateSubmitDisabled();
    updateButtonState();

    // Hide loading
    document.getElementById('message-container').style.display = 'none';
}

function updateFreeDrawUI() {
    // Show/hide UI elements based on free draw state
    const helpBtnEl = document.getElementById('help-btn');
    const reportBtnEl = document.getElementById('report-btn');
    if (isFreeDraw) {
        if (helpBtnEl) helpBtnEl.style.display = 'none';
        if (reportBtnEl) reportBtnEl.style.display = 'none';
    } else {
        if (helpBtnEl) helpBtnEl.style.display = '';
        if (reportBtnEl) reportBtnEl.style.display = '';
    }
}

// ------ Reset UI for new questions ------
function resetQuestionUI() {
    currentReaction = null;
    reactionQueue = [];
    saveQueueToCache();
    const instructionDiv = document.getElementById('question-instruction');
    const moleculeDiv = document.getElementById('molecule-display');
    const loadingText = document.getElementById('loading-text');

    if (instructionDiv) instructionDiv.innerText = '';
    if (moleculeDiv) moleculeDiv.innerHTML = '';
    if (explanationDisplay) explanationDisplay.style.display = 'none';
    if (chatMessages) chatMessages.innerHTML = '';

    // Clear whiteboard
    fabricCanvas.clear(); fabricCanvas.backgroundColor = 'transparent';
    isCanvasBlank = true;
    updateSubmitDisabled();
    updateButtonState();

    // Show generating state in message container
    if (loadingText) {
        loadingText.innerText = "Generating...";
        loadingText.className = "";
        document.getElementById('message-container').style.display = 'block';
    }
}

// ------ Manage Display Logic ------
function displayNextReaction() {
    if (reactionQueue.length === 0) {
        // Mark that the user is waiting — no active reaction
        currentReaction = null;
        fetchBatchReactions(true);
        return;
    }

    const nextReaction = reactionQueue.shift();
    currentReaction = nextReaction;
    saveQueueToCache();

    // Reset state for new reaction
    hasSubmitted = false;
    lastFeedback = "";
    isShowingAnswer = false;
    isCanvasBlank = true;

    // Clear the board for the new reaction
    fabricCanvas.clear(); fabricCanvas.backgroundColor = 'transparent';

    updateQueueCount();
    updateButtonState();
    updateSubmitDisabled();

    // Ensure "New" button is immediately responsive by clearing status
    const loadingText = document.getElementById('loading-text');
    if (loadingText && (loadingText.className === "success-text" || loadingText.className === "error-text")) {
        document.getElementById('message-container').style.display = 'none';
    }

    // Reset report button

    if (reportBtn) {
        reportBtn.innerText = "Report Error";
        reportBtn.style.backgroundColor = "#8e8e93";
    }

    renderReaction(nextReaction);


    // If we're running low, fetch more in the background
    if (reactionQueue.length <= 2) {
        fetchBatchReactions(false);
    }
}

// ------ Update Queue Indicator ------
function updateQueueCount() {
    // Hidden count per user request
}

function updateButtonState() {
    if (isFreeDraw) {
        generateBtn.innerText = 'Clear';
    } else if (!currentReaction) {
        generateBtn.innerText = "New";
    } else if (isShowingAnswer) {
        generateBtn.innerText = "New";
    } else {
        generateBtn.innerText = "Give Up";
    }
}

function handleGiveUp() {
    if (!currentReaction) return;

    isShowingAnswer = true;
    const loadingText = document.getElementById('loading-text');
    const explanationDiv = document.getElementById('explanation-display');

    if (hasSubmitted && lastFeedback) {
        loadingText.innerText = lastFeedback;
        document.getElementById('message-container').style.display = 'block';
    } else {
        document.getElementById('message-container').style.display = 'none';
    }


    if (explanationDiv) {
        explanationDiv.style.display = 'block';
    }

    if (reportBtn) {
        reportBtn.innerText = "Report Error";
        reportBtn.style.backgroundColor = "#8e8e93";
    }

    renderReaction(currentReaction, true);

    updateButtonState();
}
generateBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (isFreeDraw) {
        // In free draw, just clear the whiteboard
        fabricCanvas.clear(); fabricCanvas.backgroundColor = 'transparent';
        isCanvasBlank = true;
        hasSubmitted = false;
        lastFeedback = '';
        isShowingAnswer = false;
        updateSubmitDisabled();
        updateButtonState();
        document.getElementById('message-container').style.display = 'none';
        if (explanationDisplay) explanationDisplay.style.display = 'none';
        if (freedrawExplainBtn) freedrawExplainBtn.style.display = 'none';
        lastSubmittedImage = null;
    } else if (!currentReaction || isShowingAnswer) {
        displayNextReaction();
    } else {
        handleGiveUp();
    }
});

// ------ Submit and Evaluate ------
async function submitDrawing() {
    if ((!currentReaction && !isFreeDraw) || isSubmitting) return;

    const loadingText = document.getElementById('loading-text');
    loadingText.innerText = "Checking...";
    loadingText.className = ""; // Remove previous success/error colors
    document.getElementById('message-container').style.display = 'block';

    isSubmitting = true;
    updateSubmitDisabled();

    try {
        const base64Image = await getOptimizedImage();
        if (isFreeDraw) lastSubmittedImage = base64Image;

        const prompt = isFreeDraw
            ? `The student has drawn a chemistry mechanism on a whiteboard. There is no specific question — the student chose to draw this freely. Please evaluate the mechanism drawing for chemical plausibility, correctness of arrow-pushing notation, proper formal charges, and reasonable intermediates/products. Identify the reaction type if you recognize it.`
            : `Task: ${currentReaction.qtype} | ${currentReaction.instructions || 'Predict the major product'}
Reaction: ${currentReaction.reactants} + [${currentReaction.reagents || ''}] / [${currentReaction.conditions || ''}]
Answer: ${currentReaction.answer}`;

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                image: base64Image,
                task: 'grade',
                gradeMode: isLearnMode ? 'learn' : 'normal',
                stream: true,
                mode: isFreeDraw ? 'freedraw' : (isGenChemMode ? 'genchem' : 'ochem')
            })
        });


        if (!response.ok) {
            const errorData = await response.json();
            const errMsg = errorData.error || "";
            console.error('Submission Gemini API Error:', response.status, errorData);

            if (response.status === 503 || response.status === 429 || errMsg.toLowerCase().includes('busy') || errMsg.toLowerCase().includes('capacity')) {
                loadingText.innerText = "The bot is currently at capacity. Please try again in a moment.";
            } else {
                loadingText.innerText = "Oops. Looks like the bot messed up!";
            }
            document.getElementById('message-container').style.display = 'block';

            loadingText.className = "error-text";
            throw new Error(`API error: ${response.status}`);
        }

        // Notify user if the server had to switch models
        if (response.headers.get('X-Model-Fallback')) {
            loadingText.innerText = "Taking a bit longer — switched to a backup model...";
        }

        await handleStream(
            response,
            (text) => {
                loadingText.innerText = text;
            },
            (finalText) => {
                if (finalText) {
                    showMessage(finalText); // This handles renderRichText internally
                    lastFeedback = finalText;
                    hasSubmitted = true;

                    if (finalText.toLowerCase().trim().startsWith('correct') || (isFreeDraw && finalText.toLowerCase().trim().startsWith('plausible'))) {
                        loadingText.className = "success-text";
                        isShowingAnswer = true; // Transition "Give up" to "New"
                        updateButtonState();

                        if (!isFreeDraw) {
                            // Remove the correct question from cache immediately
                            // (currentReaction stays in memory so the answer can still display)
                            localStorage.setItem(getQueueCacheKey(), JSON.stringify(reactionQueue));
                        }

                        if (reportBtn) {
                            reportBtn.innerText = "Report Error";
                            reportBtn.style.backgroundColor = "#8e8e93";
                        }

                        // Show the actual answer so the user can see it!
                        if (explanationDisplay && !isFreeDraw) {
                            explanationDisplay.style.display = 'block';
                        }
                        if (!isFreeDraw) renderReaction(currentReaction, true);
                    } else {
                        loadingText.className = "error-text";
                        if (reportBtn && !isFreeDraw) {
                            reportBtn.innerText = "I was right";
                            reportBtn.style.backgroundColor = "#ff9500"; // Orange to indicate appeal
                        }
                        // Show Explain button for Free Draw implausible results
                        if (isFreeDraw && freedrawExplainBtn) {
                            freedrawExplainBtn.style.display = 'inline-block';
                        }
                        // Ensure message is visible if it was manually closed
                        messageContainer.style.display = 'block';
                        messageRestoreBtn.style.display = 'none';
                    }
                }
            }
        );
    } catch (e) {
        console.error("Submission error:", e);
        loadingText.innerText = "Oops. Looks like the bot messed up!";
        loadingText.className = "error-text";
    } finally {
        isSubmitting = false;
        updateSubmitDisabled();
    }
}

submitBtn.addEventListener('click', (e) => {
    e.preventDefault();
    submitDrawing();
});

// ------ Free Draw Explain Logic ------
async function explainFreeDrawFeedback() {
    if (!lastSubmittedImage || !lastFeedback || isSubmitting) return;

    const loadingText = document.getElementById('loading-text');
    if (freedrawExplainBtn) {
        freedrawExplainBtn.disabled = true;
        freedrawExplainBtn.innerText = 'Explaining...';
    }

    try {
        const prompt = `The student drew a chemistry mechanism on a whiteboard (image attached). Your previous evaluation was:\n\n"${lastFeedback}"\n\nNow provide a detailed explanation of WHY this mechanism is chemically implausible or incorrect. Specifically:\n1. Identify what reaction the student appears to be attempting\n2. Point out each specific error in the arrow-pushing, electron flow, or products\n3. Explain the correct mechanism or approach\n4. Use [[SMILES: ...]] for any molecular structures you reference\n\nBe thorough, educational, and encouraging.`;

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                image: lastSubmittedImage,
                task: 'chat',
                stream: true,
                mode: 'freedraw'
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            const errMsg = errorData.error || '';
            if (response.status === 503 || response.status === 429 || errMsg.toLowerCase().includes('busy') || errMsg.toLowerCase().includes('capacity')) {
                loadingText.innerText = 'The bot is currently at capacity. Please try again in a moment.';
            } else {
                loadingText.innerText = 'Oops. Could not generate explanation.';
            }
            return;
        }

        await handleStream(
            response,
            (text) => {
                loadingText.innerText = text;
            },
            (finalText) => {
                if (finalText) {
                    renderRichText(finalText, loadingText, true);
                    loadingText.className = '';
                } else {
                    loadingText.innerText = 'Sorry, could not generate explanation.';
                }
            }
        );
    } catch (e) {
        console.error('Free Draw explain error:', e);
        loadingText.innerText = 'Error generating explanation.';
    } finally {
        if (freedrawExplainBtn) {
            freedrawExplainBtn.style.display = 'none';
            freedrawExplainBtn.disabled = false;
            freedrawExplainBtn.innerText = 'Explain';
        }
    }
}

if (freedrawExplainBtn) {
    freedrawExplainBtn.addEventListener('click', explainFreeDrawFeedback);
}

// ------ Report Error / I was right logic ------
async function reevaluateDrawing() {
    if (!currentReaction || isSubmitting) return;

    const loadingText = document.getElementById('loading-text');
    loadingText.innerText = "Re-evaluating...";
    loadingText.className = "";
    document.getElementById('message-container').style.display = 'block';
    isSubmitting = true;

    try {
        const base64Image = await getOptimizedImage();

        const prompt = `The user is appealing your previous 'Incorrect' verdict for this OChem drawing.
Task Type: ${currentReaction.qtype}
Instructions: ${currentReaction.instructions}
Reaction: ${currentReaction.reactants} + [${currentReaction.reagents || ''}] under [${currentReaction.conditions || ''}]
Expected Answer (SMILES): ${currentReaction.answer}
Explanation: ${currentReaction.explanation || 'N/A'}
Previous Feedback: ${lastFeedback}

Re-evaluate VERY carefully. Is the user's drawing actually a plausible representation of the correct answer? 
Consider different orientations, implicit hydrogens, or valid alternative mechanisms if applicable.
Output ONLY 'Correct' or 'Incorrect: [Brief reason]'. Max 10 words total.`;

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, image: base64Image, task: 'grade', mode: isGenChemMode ? 'genchem' : 'ochem' })
        });

        if (!response.ok) throw new Error("API error");

        const result = await response.json();
        if (result.candidates && result.candidates[0].content.parts[0].text) {
            const feedback = result.candidates[0].content.parts[0].text.trim();
            loadingText.innerText = feedback;
            lastFeedback = feedback;

            if (feedback.toLowerCase().startsWith('correct')) {
                loadingText.className = "success-text";
                isShowingAnswer = true;
                updateButtonState();
                // Remove the correct question from cache immediately
                localStorage.setItem(getQueueCacheKey(), JSON.stringify(reactionQueue));
                if (explanationDisplay) explanationDisplay.style.display = 'block';
                renderReaction(currentReaction, true);
            } else {
                loadingText.className = "error-text";
            }
        }
    } catch (e) {
        console.error("Re-evaluation error:", e);
        loadingText.innerText = "Error re-evaluating.";
    } finally {
        isSubmitting = false;
        if (reportBtn) {
            reportBtn.innerText = "Report Error";
            reportBtn.style.backgroundColor = "#8e8e93";
        }
    }
}

if (reportBtn) {
    reportBtn.addEventListener('click', () => {
        if (reportBtn.innerText === "Report Error") {
            displayNextReaction();
        } else {
            reevaluateDrawing();
        }
    });
}

// Initial load — restore cached questions first, then fetch if needed
updateFreeDrawUI();
if (isFreeDraw) {
    enterFreeDrawMode();
} else {
    const cachedQueue = loadQueueFromCache();
    if (cachedQueue.length > 0) {
        reactionQueue = cachedQueue;
        displayNextReaction();
        // Still fetch more in the background if running low
        if (reactionQueue.length <= 2) {
            fetchBatchReactions(false);
        }
    } else {
        fetchBatchReactions(true);
    }
}
