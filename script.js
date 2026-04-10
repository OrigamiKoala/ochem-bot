// script.js — Organic Chemistry Tutor

// =============================================
// 1. DOM REFERENCES (single consolidated block)
// =============================================
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clear-btn');
const eraseBtn = document.getElementById('eraser-btn');
const generateBtn = document.getElementById('generate-btn');
const submitBtn = document.getElementById('submit-btn');
const reportBtn = document.getElementById('report-btn');
const helpBtn = document.getElementById('help-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const topicsListDiv = document.getElementById('topics-list');
const addCustomTopicBtn = document.getElementById('add-custom-topic-btn');
const customTopicInput = document.getElementById('custom-topic-input');
const followupInput = document.getElementById('followup-input');
const sendFollowupBtn = document.getElementById('send-followup-btn');
const chatMessages = document.getElementById('chat-messages');
const explanationDisplay = document.getElementById('explanation-display');
const explanationContent = document.getElementById('explanation-text-content');
const difficultySlider = document.getElementById('difficulty-slider');
const learnModeToggle = document.getElementById('learn-mode-toggle');
const aboutBtn = document.getElementById('about-btn');
const aboutModal = document.getElementById('about-modal');
const closeAboutBtn = document.getElementById('close-about-btn');
const aboutContent = document.getElementById('about-content');
const messageContainer = document.getElementById('message-container');
const loadingText = document.getElementById('loading-text');
const shrinkBtn = document.getElementById('shrink-btn');
const restoreBtn = document.getElementById('restore-btn');
const reactionContainer = document.getElementById('reaction-container');
const instructionDiv = document.getElementById('question-instruction');
const moleculeDiv = document.getElementById('molecule-display');

// =============================================
// 2. APPLICATION STATE
// =============================================
let isDrawing = false;
let isEraser = false;
let isCanvasBlank = true;
let currentReaction = null;
let isFetching = false;
let isSubmitting = false;
let starterQuestionsBuffer = null;
let hasSubmitted = false;
let lastFeedback = "";
let isShowingAnswer = false;
let hasIncorrectSubmission = false;
let currentDifficulty = parseInt(localStorage.getItem('ochem_difficulty')) || 1;
let isLearnMode = localStorage.getItem('ochem_learn_mode') === 'true';

const baseTopics = [
    "addition", "substitution", "elimination", "on rings", "Grignard",
    "redox", "protecting groups", "cycloadditions", "electrocyclic",
    "rearrangements", "radicals", "carbenes", "stereochemistry", "regioselectivity"
];
let userCustomTopics = JSON.parse(localStorage.getItem('ochem_custom_topics')) || [];
let selectedTopics = JSON.parse(localStorage.getItem('ochem_selected_topics')) || [...baseTopics, ...userCustomTopics];

// =============================================
// 3. SHARED HELPERS
// =============================================

// Shared SmilesDrawer instance (avoids re-creating per molecule)
const globalSmilesDrawer = new SmilesDrawer.Drawer({
    width: 200, height: 200,
    bondThickness: 2, bondSpacing: 4,
    fontSizeLarge: 10, padding: 10
});

const DIFF_LABELS = { 1: "Beginner", 2: "USNCO (Intermediate)", 3: "Collegiate/IChO (Advanced)" };

/** Strip trailing AI chatter from SMILES (e.g. "CC(O)C | some description") */
function cleanSmiles(raw) {
    return raw.split('|')[0].trim().split(/\s+/)[0];
}

/** Unified message box visibility control */
function toggleMessage(show, text = "", cssClass = "") {
    if (!messageContainer || !loadingText) return;
    if (show) {
        messageContainer.style.display = 'block';
        loadingText.innerText = text;
        loadingText.className = cssClass;
        if (restoreBtn) restoreBtn.style.display = 'none';
    } else {
        messageContainer.style.display = 'none';
    }
}

function updateSubmitDisabled() {
    submitBtn.disabled = isCanvasBlank || isSubmitting;
    submitBtn.style.opacity = submitBtn.disabled ? "0.5" : "1";
    submitBtn.style.cursor = submitBtn.disabled ? "not-allowed" : "pointer";
}

function updateButtonState() {
    if (!currentReaction || isShowingAnswer) {
        generateBtn.innerText = "New";
    } else {
        generateBtn.innerText = "Give Up";
    }
}

function updateReportButton() {
    if (!reportBtn) return;
    reportBtn.innerText = (isShowingAnswer || hasIncorrectSubmission) ? "I was right" : "Report Error";
}

// =============================================
// 4. SETTINGS & TOPICS
// =============================================
function initSettings() {
    if (!topicsListDiv || !difficultySlider) return;
    difficultySlider.value = currentDifficulty;
    if (learnModeToggle) learnModeToggle.checked = isLearnMode;

    topicsListDiv.innerHTML = '';
    const allTopics = [...baseTopics, ...userCustomTopics];

    allTopics.forEach(topic => {
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
    if (!newTopic) return;
    if (baseTopics.includes(newTopic) || userCustomTopics.includes(newTopic)) {
        alert("Topic already exists!");
        return;
    }
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

// =============================================
// 5. ABOUT MODAL
// =============================================
async function loadIntro() {
    try {
        const response = await fetch('./intro.txt');
        if (response.ok && aboutContent) {
            aboutContent.innerHTML = await response.text();
        }
    } catch (e) {
        console.error("Failed to load intro.txt", e);
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

// =============================================
// 6. AI TUTOR FOLLOW-UP CHAT
// =============================================
function addChatMessage(role, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${role === 'user' ? 'user-msg' : 'bot-msg'}`;
    msgDiv.innerText = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendFollowupQuestion(overrideText) {
    const question = overrideText || followupInput.value.trim();
    if (!question || !currentReaction) return;

    addChatMessage('user', question);
    followupInput.value = '';

    const botMsgDiv = document.createElement('div');
    botMsgDiv.className = 'chat-msg bot-msg';
    botMsgDiv.innerText = '';
    chatMessages.appendChild(botMsgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        // Stream chunks live into the chat bubble
        liveAgent.onChunk = (chunk) => {
            botMsgDiv.innerText += chunk;
            chatMessages.scrollTop = chatMessages.scrollHeight;
        };

        const botResponse = await liveAgent.sendTurn(question);
        botMsgDiv.innerText = botResponse ? botResponse.trim() : "Sorry, I couldn't process that question.";
    } catch (e) {
        console.error("Chat error:", e);
        botMsgDiv.innerText = "Oops, I'm having trouble connecting to the lab.";
    } finally {
        liveAgent.onChunk = null;
    }
}


// =============================================
// 7. GEMINI LIVE AGENT (WebSocket)
// =============================================
class GeminiLiveAgent {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.pendingResolve = null;
        this.isSetup = false;
        this.model = "models/gemini-3.1-flash-live-preview";
        this.history = [];
        this.textBuffer = "";
        this.onChunk = null;
    }

    async getToken() {
        const response = await fetch(`/api/token?t=${Date.now()}`);
        if (!response.ok) throw new Error("Could not fetch API credentials");
        const data = await response.json();
        return data.key;
    }

    async connect() {
        if (this.isConnected) return;
        try {
            const key = await this.getToken();
            const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`;
            this.ws = new WebSocket(url);

            return new Promise((resolve, reject) => {
                this.ws.onopen = () => {
                    this.isConnected = true;
                    console.log("Gemini Live Agent connected.");
                    this.sendSetup();
                    resolve();
                };
                this.ws.onerror = (e) => { console.error("WebSocket error:", e); reject(e); };
                this.ws.onclose = (event) => {
                    this.isConnected = false;
                    this.isSetup = false;
                    console.log(`Gemini Live Agent disconnected. Code: ${event.code}, Reason: ${event.reason || "N/A"}`);
                };
                this.ws.onmessage = (event) => this.handleMessage(event);
            });
        } catch (e) {
            console.error("Connection failed:", e);
            throw e;
        }
    }

    sendSetup() {
        const setupMessage = {
            setup: {
                model: this.model,
                generation_config: {
                    response_modalities: ["AUDIO"]
                },
                system_instruction: {
                    parts: [{
                        text: `You are an organic chemistry tutor. When asked for a new question, generate 1 reaction in JSON format:
{
  "qtype": "predict|mechanism|stereo",
  "reactants": "SMILES",
  "conditions": "LaTeX",
  "answer": "SMILES",
  "instructions": "Task description",
  "explanation": "Detailed mechanism with [[SMILES: ...]] placeholders."
}
Grade student drawings accurately.
CRITICAL RULE: NEVER tell the user exactly what to draw or reveal the final answer.
You are a tutor, not a solution key. Provide pedagogical feedback that explains chemical reasoning.
STRICT JSON RULES: You MUST escape all backslashes in LaTeX and SMILES (e.g., use \\\\Psi, not \\Psi; use \\\\Delta, not \\Delta). All responses must be valid JSON. Reaction 'reactants' and 'answer' fields must contain ONLY valid SMILES strings, no extra text.`
                    }]
                }
            }
        };
        this.ws.send(JSON.stringify(setupMessage));
    }

    async handleMessage(event) {
        try {
            let text;
            if (event.data instanceof Blob) {
                text = await event.data.text();
            } else if (typeof event.data === 'string') {
                text = event.data;
            } else {
                return;
            }

            const data = JSON.parse(text);

            if (data.setupComplete) {
                this.isSetup = true;
                return;
            }

            if (data.serverContent) {
                const sc = data.serverContent;

                // Capture text from modelTurn parts
                if (sc.modelTurn?.parts) {
                    for (const part of sc.modelTurn.parts) {
                        if (part.text) {
                            this.textBuffer += part.text;
                            if (this.onChunk) this.onChunk(part.text);
                        }
                    }
                }

                // Capture text from outputTranscription (AUDIO modality fallback)
                if (sc.outputTranscription?.text) {
                    this.textBuffer += sc.outputTranscription.text;
                    if (this.onChunk) this.onChunk(sc.outputTranscription.text);
                }

                // Check for turn completion
                if ((sc.turnComplete || sc.modelTurn?.turnComplete) && this.pendingResolve) {
                    const fullText = this.textBuffer;
                    this.textBuffer = "";
                    this.pendingResolve(fullText);
                    this.pendingResolve = null;
                }
            }
        } catch (e) {
            console.error("Live message error:", e);
        }
    }

    async sendTurn(prompt, base64Image) {
        if (!this.isConnected) await this.connect();

        if (this.ws?.readyState === WebSocket.OPEN) {
            if (base64Image) {
                this.ws.send(JSON.stringify({
                    realtime_input: {
                        video: { data: base64Image, mime_type: "image/jpeg" }
                    }
                }));
            }
            this.ws.send(JSON.stringify({
                realtime_input: { text: prompt }
            }));
        } else {
            console.warn('WebSocket not open.');
        }

        return new Promise((resolve) => { this.pendingResolve = resolve; });
    }

    async getNextQuestion(topic, difficulty) {
        const perf = this.history.length > 0 ? this.history[this.history.length - 1] : "start";
        const diffLabel = DIFF_LABELS[difficulty];

        const prompt = isLearnMode
            ? `Generate a new GUIDED learning question. Topic: ${topic}. Difficulty: ${diffLabel}.
LEARN MODE RULES:
1. Focus on teaching a specific pattern (e.g. nucleophile/electrophile identification, resonance, or a specific step).
2. Do NOT ask for the final product immediately if it's a multi-step reaction.
3. Provide 'instructions' that guide the user's thinking process via subtle hints.
4. JSON ONLY.`
            : `Generate a new adaptive question. Topic: ${topic}. Difficulty: ${diffLabel}. User's last performance: ${perf}.
Focus on creating questions that highlight key mechanisms.
Provide clear 'instructions' that hint at the pattern the student should look for without revealing the answer.
JSON ONLY.`;

        const responseText = await this.sendTurn(prompt);

        try {
            const start = responseText.indexOf('{');
            const end = responseText.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error("No JSON found in response");

            // Auto-escape raw LaTeX backslashes that break JSON.parse
            const jsonText = responseText.substring(start, end + 1)
                .replace(/\\(?!["\\\/bfnrtu])/g, '\\\\');

            return JSON.parse(jsonText);
        } catch (e) {
            console.error("Failed to parse adaptive question:", e, responseText);
            throw e;
        }
    }
}

const liveAgent = new GeminiLiveAgent();

// =============================================
// 8. CANVAS & DRAWING
// =============================================
function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2c3e50';
}

function getCoordinates(event) {
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event;
    return {
        x: source.clientX - rect.left,
        y: source.clientY - rect.top
    };
}

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

function stopDrawing(e) {
    if (e) e.preventDefault();
    isDrawing = false;
    ctx.beginPath();
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

/** Resize the whiteboard drawing to 768×768 for optimal vision model processing */
function captureDrawing() {
    const size = 768;
    const temp = document.createElement('canvas');
    temp.width = size;
    temp.height = size;
    const tCtx = temp.getContext('2d');
    tCtx.fillStyle = '#ffffff';
    tCtx.fillRect(0, 0, size, size);
    const scale = Math.min(size / canvas.width, size / canvas.height);
    const nw = canvas.width * scale;
    const nh = canvas.height * scale;
    tCtx.drawImage(canvas, (size - nw) / 2, (size - nh) / 2, nw, nh);
    return temp.toDataURL('image/jpeg', 0.8).split(',')[1];
}

// =============================================
// 9. MOLECULE RENDERING
// =============================================

/** Render a list of SMILES molecules with '+' separators */
function renderMolecules(molecules, container, suffix = "") {
    const dpr = window.devicePixelRatio || 1;
    const baseSize = 85;

    molecules.forEach((mol, index) => {
        const cleaned = cleanSmiles(mol);

        if (index > 0) {
            const plus = document.createElement('div');
            plus.innerText = '+';
            plus.className = 'plus-sign';
            plus.style.fontSize = '1.8rem';
            plus.style.padding = '0 5px';
            container.appendChild(plus);
        }

        const c = document.createElement('canvas');
        c.id = `canvas-${suffix}-${index}-${Date.now()}`;
        c.style.width = baseSize + "px";
        c.style.height = baseSize + "px";
        c.width = baseSize * dpr;
        c.height = baseSize * dpr;
        container.appendChild(c);

        SmilesDrawer.parse(cleaned,
            (tree) => globalSmilesDrawer.draw(tree, c, 'light', false),
            (err) => console.error("SMILES parse error:", cleaned, err)
        );
    });
}

/** Render explanation text with inline [[SMILES: ...]] molecules */
function renderExplanationWithMolecules(text, container) {
    if (!container) return;
    container.innerHTML = '';
    const dpr = window.devicePixelRatio || 1;
    const baseSize = 90;
    const parts = text.split(/(\[\[SMILES:.*?\]\])/g);

    parts.forEach(part => {
        const match = part.match(/\[\[SMILES:(.*?)\]\]/);
        if (match) {
            const cleaned = cleanSmiles(match[1]);
            const wrapper = document.createElement('div');
            wrapper.className = 'inline-molecule';
            const c = document.createElement('canvas');
            c.id = `inline-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            c.style.width = baseSize + "px";
            c.style.height = baseSize + "px";
            c.width = baseSize * dpr;
            c.height = baseSize * dpr;
            wrapper.appendChild(c);
            container.appendChild(wrapper);

            SmilesDrawer.parse(cleaned,
                (tree) => globalSmilesDrawer.draw(tree, c, 'light', false),
                (err) => console.error("Inline SMILES error:", cleaned, err)
            );
        } else if (part.trim().length > 0) {
            const span = document.createElement('span');
            span.innerText = part;
            container.appendChild(span);
        }
    });
}

/** Render a full reaction (reactants → arrow → [answer]) */
function renderReaction(data, showAnswer = false) {
    if (!instructionDiv || !moleculeDiv || !explanationDisplay || !explanationContent) return;

    moleculeDiv.innerHTML = '';
    explanationDisplay.style.display = 'none';
    renderExplanationWithMolecules(data.explanation || "No explanation preloaded.", explanationContent);
    chatMessages.innerHTML = '';

    if (!showAnswer && loadingText.innerText !== "Checking...") {
        toggleMessage(false);
    }

    if (!data) return;

    instructionDiv.innerText = data.instructions || "Predict the major product:";

    // Reactants
    const reactantMolecules = data.reactants.split('.').map(s => s.trim()).filter(Boolean);
    renderMolecules(reactantMolecules, moleculeDiv);

    // Reaction arrow with conditions
    const arrowContainer = document.createElement('div');
    arrowContainer.className = 'reaction-arrow';
    arrowContainer.style.padding = '0 15px';
    arrowContainer.style.fontSize = '1.8rem';
    const conditions = (data.conditions || '').replace(/\\\\/g, '\\');
    arrowContainer.innerText = `\\( \\ce{->[${conditions}]} \\)`;
    moleculeDiv.appendChild(arrowContainer);

    // Answer (mechanism mode or give-up)
    if (data.qtype === 'mechanism' || showAnswer) {
        if (data.answer) {
            const answerMolecules = data.answer.split('.').map(s => s.trim()).filter(Boolean);
            renderMolecules(answerMolecules, moleculeDiv, "answer");
        }
    }

    // Only invoke MathJax if there's actual LaTeX to typeset
    if (window.MathJax && (data.conditions || "").includes("\\")) {
        MathJax.typesetPromise([arrowContainer]).catch(err => console.error('MathJax error:', err));
    }
}

// =============================================
// 10. STARTER QUESTIONS
// =============================================
async function getStarterQuestion(targetTopic, targetDifficulty) {
    if (!starterQuestionsBuffer) {
        try {
            const response = await fetch('starter.json');
            if (response.ok) starterQuestionsBuffer = (await response.json()).reactions || [];
        } catch (e) {
            console.error("Failed to load starter.json", e);
            return null;
        }
    }
    if (!starterQuestionsBuffer?.length) return null;

    const diffMap = { 1: "beginner", 2: "intermediate", 3: "collegiate" };
    const diffKey = diffMap[targetDifficulty];
    const topicKey = targetTopic.replace(/\s+/g, '_').toLowerCase();

    const matches = starterQuestionsBuffer.filter(q => {
        const id = q.id.toLowerCase();
        return id.startsWith(diffKey) && id.includes(`_${topicKey}_`);
    });

    return matches.length > 0 ? matches[Math.floor(Math.random() * matches.length)] : null;
}

// =============================================
// 11. CORE GAME LOGIC
// =============================================
function displayNextReaction() {
    hasSubmitted = false;
    lastFeedback = "";
    isShowingAnswer = false;
    hasIncorrectSubmission = false;
    isCanvasBlank = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updateButtonState();
    updateSubmitDisabled();
    updateReportButton();
    renderReaction(currentReaction);
}

async function fetchBatchReactions(isExplicit = false) {
    if (isFetching) return;
    isFetching = true;

    if (isExplicit) {
        reactionContainer.querySelectorAll('canvas, .plus-sign, .reaction-arrow').forEach(el => el.remove());
        if (instructionDiv) instructionDiv.innerText = '';
        toggleMessage(true, "Generating adaptive challenge...");
    }

    try {
        const topic = selectedTopics[Math.floor(Math.random() * selectedTopics.length)];
        liveAgent.onChunk = null; // Suppress JSON streaming to UI
        const newReaction = await liveAgent.getNextQuestion(topic, currentDifficulty);
        if (newReaction) {
            currentReaction = newReaction;
            displayNextReaction();
        }
    } catch (e) {
        console.error("Live Question Fetch error:", e);
        toggleMessage(true, "Oops. The Live connection failed!", "error-text");
    } finally {
        isFetching = false;
    }
}

function handleGiveUp() {
    if (!currentReaction) return;
    isShowingAnswer = true;

    if (hasSubmitted && lastFeedback) {
        toggleMessage(true, lastFeedback);
    } else {
        toggleMessage(false);
    }

    if (explanationDisplay) explanationDisplay.style.display = 'block';
    renderReaction(currentReaction, true);
    updateButtonState();
    updateReportButton();
}

async function submitDrawing() {
    if (!currentReaction || isSubmitting) return;

    toggleMessage(true, "Checking...");
    isSubmitting = true;
    updateSubmitDisabled();

    try {
        const base64Image = captureDrawing();
        const diffLabel = DIFF_LABELS[currentDifficulty];
        const context = `Context: Reactants: ${currentReaction.reactants}, Target Answer: ${currentReaction.answer}. Carefully analyze the Whiteboard Drawing for mechanistic arrows and lone pairs.`;

        const prompt = isLearnMode
            ? `${context} Evaluate my drawing. Be extremely concise (max 2 sentences). Difficulty: ${diffLabel}. Suggest next step. DO NOT TELL ME WHAT TO DRAW.`
            : `${context} Evaluate my drawing. Difficulty: ${diffLabel}. EXTREMELY CONCISE (max 1 sentence). DO NOT TELL ME WHAT TO DRAW.`;

        // Stream feedback chunks to the UI in real-time
        toggleMessage(true, "");
        liveAgent.onChunk = (chunk) => { loadingText.innerText += chunk; };

        const feedback = await liveAgent.sendTurn(prompt, base64Image);

        if (feedback) {
            loadingText.innerText = feedback;
            lastFeedback = feedback;
            hasSubmitted = true;

            const isCorrect = /\bcorrect\b/i.test(feedback) && !/\bincorrect\b/i.test(feedback);
            liveAgent.history.push(isCorrect ? "correct" : "incorrect");

            if (isCorrect) {
                loadingText.className = "success-text";
                isShowingAnswer = true;
                updateButtonState();
                updateReportButton();
            } else {
                loadingText.className = "error-text";
                hasIncorrectSubmission = true;
                updateReportButton();
            }
        } else {
            toggleMessage(true, "The lab is a bit hazy. Try drawing slightly clearer?", "error-text");
        }
    } catch (e) {
        console.error("Submission error:", e);
        toggleMessage(true, "Oops. Live session error!", "error-text");
    } finally {
        isSubmitting = false;
        updateSubmitDisabled();
        liveAgent.onChunk = null;
    }
}

// =============================================
// 12. EVENT LISTENERS (single consolidated block)
// =============================================

// --- Canvas ---
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 0);

canvas.addEventListener('touchstart', startDrawing, { passive: false });
canvas.addEventListener('touchmove', draw, { passive: false });
canvas.addEventListener('touchend', stopDrawing, { passive: false });
canvas.addEventListener('touchcancel', stopDrawing, { passive: false });
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

// Prevent pull-to-refresh on mobile
document.body.addEventListener('touchmove', function (e) {
    if (e.target.closest('#about-content') || e.target.closest('#topics-list') ||
        e.target.closest('#explanation-display') || e.target.closest('#molecule-display')) {
        return;
    }
    e.preventDefault();
}, { passive: false });

// --- Toolbar ---
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

generateBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!currentReaction || isShowingAnswer) {
        fetchBatchReactions(true);
    } else {
        handleGiveUp();
    }
});

submitBtn.addEventListener('click', (e) => {
    e.preventDefault();
    submitDrawing();
});

// --- Message Shrink/Restore ---
if (shrinkBtn) {
    shrinkBtn.addEventListener('click', () => {
        messageContainer.style.display = 'none';
        restoreBtn.style.display = 'block';
    });
}
if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
        messageContainer.style.display = 'block';
        restoreBtn.style.display = 'none';
    });
}

// --- Settings ---
if (addCustomTopicBtn) addCustomTopicBtn.addEventListener('click', addCustomTopic);

if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        initSettings();
        settingsModal.style.display = 'flex';
    });
}

if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
        const checkboxes = topicsListDiv.querySelectorAll('input[type="checkbox"]');
        selectedTopics = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
        currentDifficulty = parseInt(difficultySlider.value);
        localStorage.setItem('ochem_difficulty', currentDifficulty);
        if (learnModeToggle) {
            isLearnMode = learnModeToggle.checked;
            localStorage.setItem('ochem_learn_mode', isLearnMode);
        }
        if (selectedTopics.length === 0) selectedTopics = [...baseTopics, ...userCustomTopics];
        localStorage.setItem('ochem_selected_topics', JSON.stringify(selectedTopics));
        settingsModal.style.display = 'none';
        fetchBatchReactions(true);
    });
}

if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.style.display = 'none';
    });
}

// --- About Modal ---
if (aboutBtn) aboutBtn.addEventListener('click', showAboutModal);
if (closeAboutBtn) closeAboutBtn.addEventListener('click', () => { aboutModal.style.display = 'none'; });
if (aboutModal) {
    aboutModal.addEventListener('click', (e) => {
        if (e.target === aboutModal) aboutModal.style.display = 'none';
    });
}

// --- Follow-up Chat ---
if (sendFollowupBtn) sendFollowupBtn.addEventListener('click', sendFollowupQuestion);
if (followupInput) {
    followupInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendFollowupQuestion();
    });
}

// --- Report / I Was Right ---
if (reportBtn) {
    reportBtn.addEventListener('click', () => {
        if (!currentReaction) return;
        if (explanationDisplay) explanationDisplay.style.display = 'block';
        const msg = isShowingAnswer ? "Reevaluate" : hasIncorrectSubmission ? "regrade" : "Are you sure this reaction is possible?";
        sendFollowupQuestion(msg);
    });
}

// --- Help ---
if (helpBtn) {
    helpBtn.addEventListener('click', () => {
        if (explanationDisplay) {
            explanationDisplay.style.display = explanationDisplay.style.display === 'none' ? 'block' : 'none';
        }
    });
}

// =============================================
// 13. INITIALIZATION
// =============================================
loadIntro();
checkFirstVisit();
updateSubmitDisabled();
updateButtonState();
