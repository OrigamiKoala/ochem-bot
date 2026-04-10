/**
 * Organic Chemistry Mechanism Practice - Core Script
 * Handles canvas drawing, chemical rendering (SMILES/LaTeX), 
 * AI grading, and question queue management.
 */

// ==========================================
// 1. Global State & Constants
// ==========================================

const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clear-btn');
const eraseBtn = document.getElementById('eraser-btn');
const submitBtn = document.getElementById('submit-btn');
const generateBtn = document.getElementById('generate-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const saveSettingsBtn = document.getElementById('save-settings-btn');
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
const aboutBtn = document.getElementById('about-btn');
const aboutModal = document.getElementById('about-modal');
const closeAboutBtn = document.getElementById('close-about-btn');
const aboutContent = document.getElementById('about-content');

// Drawing State
let isDrawing = false;
let isEraser = false;
let isCanvasBlank = true;

// Game & Queue State
let reactionQueue = [];
let currentReaction = null;
let isFetching = false;
let isSubmitting = false;
let starterQuestionsBuffer = null;
let hasSubmitted = false;
let lastFeedback = "";
let isShowingAnswer = false;

// Settings State
const baseTopics = ["addition", "substitution", "elimination", "on rings", "Grignard", "redox", "protecting groups", "cycloadditions", "electrocyclic", "rearrangements", "radicals", "carbenes", "stereochemistry", "regioselectivity"];
let userCustomTopics = JSON.parse(localStorage.getItem('ochem_custom_topics')) || [];
let selectedTopics = JSON.parse(localStorage.getItem('ochem_selected_topics')) || [...baseTopics, ...userCustomTopics];
let currentDifficulty = parseInt(localStorage.getItem('ochem_difficulty')) || 1;

// Rendering Constants
const MONO_THEME = {
    C: '#1a1a1a', O: '#1a1a1a', N: '#1a1a1a', F: '#1a1a1a', 
    CL: '#1a1a1a', BR: '#1a1a1a', I: '#1a1a1a', P: '#1a1a1a', 
    S: '#1a1a1a', B: '#1a1a1a', H: '#1a1a1a', BACKGROUND: 'transparent'
};

// ==========================================
// 2. Helper Functions
// ==========================================

function cleanSmiles(smiles) {
    if (!smiles) return null;
    let s = smiles.replace(/^\[\[SMILES: (.*?)\]\]$/, '$1').trim();
    
    // Balance brackets
    const openBrackets = (s.match(/\[/g) || []).length;
    const closeBrackets = (s.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) s += ']'.repeat(openBrackets - closeBrackets);
    if (closeBrackets > openBrackets) s = '['.repeat(closeBrackets - openBrackets) + s;
    
    // Check for hanging operators
    if (/[\-\+\=\#]$/.test(s)) {
        if (!s.endsWith(']')) return null;
    }
    return s;
}

function getCoordinates(event) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if (event.touches && event.touches.length > 0) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }

    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

/**
 * Generates a 512x512 downscaled JPEG for Gemini to minimize latency.
 */
function getOptimizedImageB64() {
    const size = 512;
    const offscreen = document.createElement('canvas');
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext('2d');
    
    // Fill background (JPEG doesn't support transparency well in some viewers, and white is standard for OChem)
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, size, size);
    
    // Calculate scaling to fit into 512-margin
    const margin = 20;
    const usableSize = size - (margin * 2);
    const scale = Math.min(usableSize / canvas.width, usableSize / canvas.height);
    
    const x = (size / 2) - (canvas.width * scale / 2);
    const y = (size / 2) - (canvas.height * scale / 2);
    
    ctx.drawImage(canvas, x, y, canvas.width * scale, canvas.height * scale);
    
    // Return base64 without the prefix
    return offscreen.toDataURL('image/jpeg', 0.5).split(',')[1];
}

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2c3e50';
}

function updateSubmitDisabled() {
    submitBtn.disabled = isCanvasBlank || isSubmitting;
    submitBtn.style.opacity = submitBtn.disabled ? "0.5" : "1";
    submitBtn.style.cursor = submitBtn.disabled ? "not-allowed" : "pointer";
}

function updateButtonState() {
    if (!reportBtn) return;
    if (isShowingAnswer) {
        reportBtn.innerText = "I was right";
        reportBtn.style.backgroundColor = "#1a1a1a"; 
    } else {
        reportBtn.innerText = "Report Error";
        reportBtn.style.backgroundColor = "#8e8e93"; // Gray for skip
    }
}

// ==========================================
// 3. Chemical Rendering Logic
// ==========================================

/**
 * Shared helper to draw SMILES structure onto a canvas element
 */
function applySmilesRendering(smiles, targetCanvas, bSize, bondThickness = 2) {
    const dpr = window.devicePixelRatio || 1;
    const size = bSize * dpr;
    targetCanvas.style.width = bSize + "px";
    targetCanvas.style.height = bSize + "px";

    const options = {
        width: size,
        height: size,
        bondThickness: bondThickness,
        bondSpacing: 4,
        fontSizeLarge: 10,
        padding: 0,
        themes: { mono: MONO_THEME }
    };

    const sd = new SmilesDrawer.Drawer(options);
    const cleanedMol = cleanSmiles(smiles);
    if (!cleanedMol) return;

    SmilesDrawer.parse(cleanedMol, function (tree) {
        sd.draw(tree, targetCanvas, 'mono', false);
    }, function (err) {
        console.error("Smiles parsing error:", cleanedMol, err);
    });
}

/**
 * Main function to render the current reaction question
 */
function renderReaction(data, showAnswer = false) {
    const instructionDiv = document.getElementById('question-instruction');
    const moleculeDiv = document.getElementById('molecule-display');
    const loadingText = document.getElementById('loading-text');

    if (!instructionDiv || !moleculeDiv || !explanationDisplay || !explanationContent) return;

    moleculeDiv.innerHTML = '';
    
    if (!showAnswer) {
        explanationDisplay.style.display = 'none';
        chatMessages.innerHTML = ''; 
    }

    renderRichText(data.explanation || "No explanation preloaded.", explanationContent, true);

    if (!showAnswer) {
        if (loadingText && loadingText.innerText !== "Checking..." && !loadingText.innerText.includes("Incorrect")) {
            document.getElementById('message-container').style.display = 'none';
        }
    } else if (lastFeedback) {
        document.getElementById('message-container').style.display = 'block';
    }

    if (!data) return;

    instructionDiv.innerText = data.instructions || "Predict the major product:";

    // Render Reactants
    const reactantMolecules = data.reactants.split('.').map(s => s.trim()).filter(s => s.length > 0);
    renderMolecules(reactantMolecules, moleculeDiv);

    // Render Arrow
    const arrowContainer = document.createElement('div');
    arrowContainer.className = 'reaction-arrow-container';
    
    const topRow = document.createElement('div');
    topRow.className = 'reagents-top';
    const reagentsText = data.reagents || data.conditions || '';
    renderRichText(reagentsText.replace(/\\\\/g, '\\'), topRow);
    
    const arrowLine = document.createElement('div');
    arrowLine.className = 'arrow-line';
    
    const bottomRow = document.createElement('div');
    bottomRow.className = 'conditions-bottom';
    if (data.reagents) {
        renderRichText(data.conditions || '', bottomRow);
    }
    
    arrowContainer.appendChild(topRow);
    arrowContainer.appendChild(arrowLine);
    arrowContainer.appendChild(bottomRow);
    moleculeDiv.appendChild(arrowContainer);

    // Render Target/Answer
    if (data.qtype === 'mechanism' || showAnswer) {
        if (data.answer) {
            const answerMolecules = data.answer.split('.').map(s => s.trim()).filter(s => s.length > 0);
            renderMolecules(answerMolecules, moleculeDiv, "answer");
        }
    }

    if (window.MathJax) {
        MathJax.typesetPromise([arrowContainer]).catch(e => console.error('MathJax error:', e));
    }
}

function renderMolecules(molecules, container, suffix = "") {
    molecules.forEach((mol, index) => {
        if (index > 0) {
            const plus = document.createElement('div');
            plus.innerText = '+';
            plus.className = 'plus-sign';
            plus.style.fontSize = '1.8rem';
            plus.style.padding = '0 5px';
            container.appendChild(plus);
        }

        const newCanvas = document.createElement('canvas');
        newCanvas.id = `canvas-${suffix}-${index}-${Date.now()}`;
        container.appendChild(newCanvas);
        applySmilesRendering(mol, newCanvas, 100);
    });
}

function renderRichText(text, container, isExplanation = false) {
    if (!container) return;
    container.innerHTML = '';

    const parts = text.split(/(\[\[SMILES:[\s\S]*?\]\s*?\]\s*?\]*)/g);

    parts.forEach(part => {
        const match = part.match(/\[\[SMILES:([\s\S]*?)\]\s*?\]\s*?\]*/);
        if (match) {
            let smiles = match[1].trim();
            if (smiles.endsWith(']')) {
                const openCount = (smiles.match(/\[/g) || []).length;
                const closeCount = (smiles.match(/\]/g) || []).length;
                if (closeCount > openCount) smiles = smiles.substring(0, smiles.length - 1);
            }

            const wrapper = document.createElement('div');
            wrapper.className = isExplanation ? 'inline-molecule-explanation' : 'inline-molecule';
            
            const canvas = document.createElement('canvas');
            canvas.className = 'molecule-canvas';
            wrapper.appendChild(canvas);
            container.appendChild(wrapper);

            applySmilesRendering(smiles, canvas, isExplanation ? 60 : 70, 1.5);

        } else if (part.trim().length > 0) {
            const span = document.createElement('span');
            let content = part.trim();
            
            if (!isExplanation && !content.includes('\\(') && !content.includes('\\[')) {
                if (/[_^{}\\]/.test(content) || content.length > 2) {
                    content = `\\( \\ce{${content}} \\)`;
                }
            } else if (isExplanation) {
                if (!content.includes('\\(') && !content.includes('\\[')) {
                    if (/\\[a-zA-Z]+/.test(content)) {
                        content = content.replace(/(\\[a-zA-Z]+(?:\{.*?\})?)/g, '\\( $1 \\)');
                    }
                }
            }
            
            span.innerHTML = content.replace(/\n/g, '<br>');
            container.appendChild(span);
        }
    });

    if (window.MathJax) {
        MathJax.typesetPromise([container]).catch(e => console.error('MathJax error:', e));
    }
}

// ==========================================
// 4. Game Logic & Question Management
// ==========================================

async function fetchBatchReactions(isExplicit = false) {
    if (isFetching) return;
    isFetching = true;

    const container = document.getElementById('reaction-container');
    const loadingText = document.getElementById('loading-text');

    if (isExplicit && reactionQueue.length === 0) {
        container.querySelectorAll('canvas, .plus-sign, .reaction-arrow').forEach(el => el.remove());
        loadingText.innerText = "Generating...";
        document.getElementById('message-container').style.display = 'block';
    }

    try {
        const difficultyMap = {
            1: "Beginner: standard functional transformations (S_N1, S_N2, E1, E2, simple additions). Single step preferred.",
            2: "USNCO level: competitive chemistry. Regioselectivity, basic named reactions (Wittig, Robinson), some rearrangements. Can be 1-2 steps.",
            3: "IChO/Advanced Collegiate: total synthesis segments, advanced stereocontrol, complex pericyclics, obscure reagents (e.g. DDQ, DCC, specialized organometallics). Can be 2-3 step sequences."
        };

        const topic = selectedTopics[Math.floor(Math.random() * selectedTopics.length)];

        if (!currentReaction && reactionQueue.length === 0) {
            const starter = await getStarterQuestion(topic, currentDifficulty);
            if (starter) {
                reactionQueue.push(starter);
                displayNextReaction();
            }
        }

        const prompt = `Generate 5 organic chemistry questions (Topic: ${topic}). Difficulty: ${difficultyMap[currentDifficulty]}. JSON only.
Mix types: predict, mechanism, stereo.
Rules: 
1. SMILES: NO hydrogens.
2. LaTeX: Double backslashes (\\\\Delta).
3. Reagents: Use [[SMILES: ...]] ONLY for complex organic molecules. Standard LaTeX for others (OsO4, NaBH4, etc).
4. Output strict JSON only.`;

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) throw new Error("API error");

        const result = await response.json();
        if (result.candidates && result.candidates[0].content.parts[0].text) {
            let text = result.candidates[0].content.parts[0].text;
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
                const batch = JSON.parse(match[0]);
                if (batch.reactions) {
                    reactionQueue.push(...batch.reactions);
                    if (!currentReaction) displayNextReaction();
                }
            }
        }
    } catch (e) {
        console.error("Batch fetch error:", e);
    } finally {
        isFetching = false;
    }
}

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

    const diffMap = { 1: "beginner", 2: "intermediate", 3: "collegiate" };
    const difficultyKey = diffMap[targetDifficulty];
    const topicKey = targetTopic.replace(/\s+/g, '_');

    const matches = starterQuestionsBuffer.filter(q => {
        const idLower = q.id.toLowerCase();
        return idLower.startsWith(difficultyKey) && idLower.includes(`_${topicKey.toLowerCase()}_`);
    });

    return matches.length > 0 ? matches[Math.floor(Math.random() * matches.length)] : null;
}

function displayNextReaction() {
    if (reactionQueue.length === 0) {
        fetchBatchReactions(true);
        return;
    }

    currentReaction = reactionQueue.shift();
    isShowingAnswer = false;
    hasSubmitted = false;
    updateButtonState();

    renderReaction(currentReaction);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    isCanvasBlank = true;
    updateSubmitDisabled();

    if (reactionQueue.length < 2) {
        fetchBatchReactions(false);
    }
}

// ==========================================
// 5. Grading & Appeals
// ==========================================

async function submitDrawing() {
    if (isSubmitting || isCanvasBlank) return;
    isSubmitting = true;
    updateSubmitDisabled();

    const loadingText = document.getElementById('loading-text');
    loadingText.innerText = "Checking...";
    loadingText.className = "";
    document.getElementById('message-container').style.display = 'block';

    try {
        const base64Image = getOptimizedImageB64();

        const prompt = `Evaluate the user's drawing for this challenge:
Task Type: ${currentReaction.qtype}
Reactants: ${currentReaction.reactants}
Conditions/Reagents: ${currentReaction.reagents}
Correct Answer (SMILES reference): ${currentReaction.answer}

Is the drawing correct? Output 'Correct' or 'Incorrect'. Then, in 15 words or less, explain why.`;

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, image: base64Image })
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
                if (explanationDisplay) explanationDisplay.style.display = 'block';
                renderReaction(currentReaction, true);
            } else {
                loadingText.className = "error-text";
                hasSubmitted = true;
            }
            updateButtonState();
        }
    } catch (e) {
        console.error("Submission error:", e);
        loadingText.innerText = "Error checking drawing.";
    } finally {
        isSubmitting = false;
        updateSubmitDisabled();
    }
}

async function reevaluateDrawing() {
    if (isSubmitting) return;
    isSubmitting = true;

    const loadingText = document.getElementById('loading-text');
    loadingText.innerText = "Re-evaluating...";
    loadingText.className = "";
    if (reportBtn) reportBtn.innerText = "Processing...";

    try {
        const base64Image = getOptimizedImageB64();

        const prompt = `The user is appealing your previous 'Incorrect' verdict.
Correct Answer: ${currentReaction.answer}
Previous feedback: ${lastFeedback}

Re-evaluate VERY carefully. Is the user's drawing actually a plausible representation? 
Output 'Correct' or 'Incorrect' and a brief explanation (max 15 words).`;

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, image: base64Image })
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
                if (explanationDisplay) explanationDisplay.style.display = 'block';
                renderReaction(currentReaction, true);
            } else {
                loadingText.className = "error-text";
            }
            updateButtonState();
        }
    } catch (e) {
        console.error("Re-evaluation error:", e);
        loadingText.innerText = "Error re-evaluating.";
    } finally {
        isSubmitting = false;
    }
}

// ==========================================
// 6. UI & Settings Management
// ==========================================

function initSettings() {
    if (!topicsListDiv || !difficultySlider) return;
    difficultySlider.value = currentDifficulty;
    topicsListDiv.innerHTML = '';

    const allAvailableTopics = [...baseTopics, ...userCustomTopics];
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

function addCustomTopic() {
    const newTopic = customTopicInput.value.trim().toLowerCase();
    if (!newTopic || baseTopics.includes(newTopic) || userCustomTopics.includes(newTopic)) return;

    userCustomTopics.push(newTopic);
    selectedTopics.push(newTopic);
    localStorage.setItem('ochem_custom_topics', JSON.stringify(userCustomTopics));
    localStorage.setItem('ochem_selected_topics', JSON.stringify(selectedTopics));
    customTopicInput.value = '';
    initSettings();
}

function removeCustomTopic(topicToRemove) {
    userCustomTopics = userCustomTopics.filter(t => t !== topicToRemove);
    selectedTopics = selectedTopics.filter(t => t !== topicToRemove);
    localStorage.setItem('ochem_custom_topics', JSON.stringify(userCustomTopics));
    localStorage.setItem('ochem_selected_topics', JSON.stringify(selectedTopics));
    initSettings();
}

// Modal/UI Helpers
async function loadIntro() {
    try {
        const response = await fetch('./intro.txt');
        if (response.ok) {
            const html = await response.text();
            if (aboutContent) aboutContent.innerHTML = html;
        }
    } catch (e) {
        console.error("Intro load error:", e);
    }
}

function showAboutModal() {
    if (aboutModal) aboutModal.style.display = 'flex';
}

function checkFirstVisit() {
    if (!localStorage.getItem('ochem_visited')) {
        showAboutModal();
        localStorage.setItem('ochem_visited', 'true');
    }
}

// Chat Helpers
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
        const prompt = `Reaction: ${currentReaction.reactants} ${currentReaction.reagents} -> ${currentReaction.answer}. \nQuestion: ${question}`;
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        const result = await response.json();
        const botResponse = result.candidates[0].content.parts[0].text.trim();
        botMsgDiv.innerText = botResponse;
    } catch (e) {
        botMsgDiv.innerText = "Error connecting to lab.";
    }
}

// ==========================================
// 7. Event Listeners & Initialization
// ==========================================

// Canvas Interactions
function startDrawing(e) {
    e.preventDefault();
    isDrawing = true;
    if (isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = 20;
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = 3;
    }
    const pos = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    draw(e);
}

function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    if (isCanvasBlank) {
        isCanvasBlank = false;
        updateSubmitDisabled();
    }
    const pos = getCoordinates(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
}

function stopDrawing(e) {
    if (e) e.preventDefault();
    isDrawing = false;
    ctx.beginPath();
}

// Initialization and Startup
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 0);

// Prevention of accidental scrolling/reloading
document.body.addEventListener('touchmove', function (e) {
    if (e.target.closest('#about-content') || e.target.closest('#topics-list') || 
        e.target.closest('#explanation-display') || e.target.closest('#molecule-display')) {
        return;
    }
    e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchstart', startDrawing, { passive: false });
canvas.addEventListener('touchmove', draw, { passive: false });
canvas.addEventListener('touchend', stopDrawing, { passive: false });
canvas.addEventListener('touchcancel', stopDrawing, { passive: false });
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

// Toolbar/Button Actions
clearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    isCanvasBlank = true;
    updateSubmitDisabled();
});

if (eraseBtn) {
    eraseBtn.addEventListener('click', () => {
        isEraser = !isEraser;
        eraseBtn.classList.toggle('active-tool', isEraser);
        eraseBtn.innerText = isEraser ? "Pen" : "Eraser";
    });
}

if (generateBtn) generateBtn.addEventListener('click', displayNextReaction);
submitBtn.addEventListener('click', submitDrawing);

if (reportBtn) {
    reportBtn.addEventListener('click', () => {
        if (reportBtn.innerText === "Report Error") {
            displayNextReaction();
        } else {
            reevaluateDrawing();
        }
    });
}

if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        initSettings();
        settingsModal.style.display = 'flex';
    });
}

if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
        selectedTopics = Array.from(topicsListDiv.querySelectorAll('input:checked')).map(cb => cb.value);
        currentDifficulty = parseInt(difficultySlider.value);
        localStorage.setItem('ochem_difficulty', currentDifficulty);
        localStorage.setItem('ochem_selected_topics', JSON.stringify(selectedTopics));
        settingsModal.style.display = 'none';
        reactionQueue = [];
        fetchBatchReactions(true);
    });
}

if (addCustomTopicBtn) addCustomTopicBtn.addEventListener('click', addCustomTopic);
if (helpBtn) helpBtn.addEventListener('click', () => {
    if (explanationDisplay) {
        const isHidden = explanationDisplay.style.display === 'none';
        explanationDisplay.style.display = isHidden ? 'block' : 'none';
    }
});

if (sendFollowupBtn) sendFollowupBtn.addEventListener('click', sendFollowupQuestion);
if (followupInput) followupInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendFollowupQuestion();
});

if (aboutBtn) aboutBtn.addEventListener('click', showAboutModal);
if (closeAboutBtn) closeAboutBtn.addEventListener('click', () => aboutModal.style.display = 'none');

[settingsModal, aboutModal].forEach(m => {
    if (m) m.addEventListener('click', (e) => {
        if (e.target === m) m.style.display = 'none';
    });
});

// Final Init
loadIntro();
checkFirstVisit();
fetchBatchReactions(true);
