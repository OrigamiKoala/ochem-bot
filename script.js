// script.js
console.log("hi!");
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clear-btn');
const eraseBtn = document.getElementById('eraser-btn');
const generateBtn = document.getElementById('generate-btn');

let isDrawing = false;
let isEraser = false;

// API key is handled securely on the backend in /api/chat.js
// Modern fetch is built-in to Node 18+ and Vercel runtimes. No SDK import needed for proxy logic.
let reactionQueue = []; // Legacy - will be removed in favor of single-adaptive flow
let currentReaction = null;
let isFetching = false;
let isSubmitting = false;
let starterQuestionsBuffer = null;

// State for "Give Up" logic
let hasSubmitted = false;
let lastFeedback = "";
let isShowingAnswer = false;
let hasIncorrectSubmission = false;

const submitBtn = document.getElementById('submit-btn');
const reportBtn = document.getElementById('report-btn');

let isCanvasBlank = true;

// ------ Settings & Topic Management ------
const baseTopics = ["addition", "substitution", "elimination", "on rings", "Grignard", "redox", "protecting groups", "cycloadditions", "electrocyclic", "rearrangements", "radicals", "carbenes", "stereochemistry", "regioselectivity"];
let userCustomTopics = JSON.parse(localStorage.getItem('ochem_custom_topics')) || [];
let selectedTopics = JSON.parse(localStorage.getItem('ochem_selected_topics')) || [...baseTopics, ...userCustomTopics];

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

function addCustomTopic() {
    const newTopic = customTopicInput.value.trim().toLowerCase();
    if (!newTopic) return;
    if (baseTopics.includes(newTopic) || userCustomTopics.includes(newTopic)) {
        alert("Topic already exists!");
        return;
    }

    userCustomTopics.push(newTopic);
    selectedTopics.push(newTopic); // Auto-select new topic
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

if (addCustomTopicBtn) {
    addCustomTopicBtn.addEventListener('click', addCustomTopic);
}

if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        initSettings();
        settingsModal.style.display = 'flex';
    });
}

if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
        const checkboxes = topicsListDiv.querySelectorAll('input[type="checkbox"]');
        selectedTopics = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        // Save difficulty
        currentDifficulty = parseInt(difficultySlider.value);
        localStorage.setItem('ochem_difficulty', currentDifficulty);

        // Default to all if none selected to prevent errors
        if (selectedTopics.length === 0) selectedTopics = [...baseTopics, ...userCustomTopics];

        localStorage.setItem('ochem_selected_topics', JSON.stringify(selectedTopics));
        settingsModal.style.display = 'none';

        // Clear queue and fetch new ones immediately to reflect new settings
        reactionQueue = [];
        fetchBatchReactions(true);
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

async function sendFollowupQuestion(overrideText) {
    const question = overrideText || followupInput.value.trim();
    if (!question || !currentReaction) return;

    addChatMessage('user', question);
    followupInput.value = '';

    const botMsgDiv = document.createElement('div');
    botMsgDiv.className = 'chat-msg bot-msg';
    botMsgDiv.innerText = '...';
    chatMessages.appendChild(botMsgDiv);

    try {
        const botResponse = await liveAgent.sendTurn(question);
        if (botResponse) {
            botMsgDiv.innerText = botResponse.trim();
        } else {
            botMsgDiv.innerText = "Sorry, I couldn't process that question.";
        }
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

// ------ Report Error / I Was Right Logic ------
function updateReportButton() {
    if (!reportBtn) return;
    if (isShowingAnswer || hasIncorrectSubmission) {
        reportBtn.innerText = "I was right";
    } else {
        reportBtn.innerText = "Report Error";
    }
}

if (reportBtn) {
    reportBtn.addEventListener('click', () => {
        if (!currentReaction) return;

        // Ensure explanation display is visible so user sees the response
        if (explanationDisplay) {
            explanationDisplay.style.display = 'block';
        }

        let msg;
        if (isShowingAnswer) {
            msg = "Reevaluate"; // Challenge the reaction data itself
        } else if (hasIncorrectSubmission) {
            msg = "regrade"; // Challenge the AI grading
        } else {
            msg = "Are you sure this reaction is possible?";
        }

        sendFollowupQuestion(msg);
    });
}

// ------ Gemini Multimodal Live Agent (WebSocket) ------
class GeminiLiveAgent {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.token = null;
        this.pendingResolve = null;
        this.isSetup = false;
        this.model = "models/gemini-3.1-flash-live-preview";

        // Adaptive history (simplified)
        this.history = [];
    }
    async getToken() {
        const apiUrl = `/api/token?t=${Date.now()}`;
        console.log(`[DEBUG] Fetching key from: ${apiUrl}`);
        
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error("Could not fetch API credentials");
        const data = await response.json();
        return data.key; // Returns the raw API key
    }

    async connect() {
        if (this.isConnected) return;

        try {
            const key = await this.getToken();
            // Official Direct Key Connection (v1beta)
            const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`;

            this.ws = new WebSocket(url);

            return new Promise((resolve, reject) => {
                this.ws.onopen = () => {
                    this.isConnected = true;
                    console.log("Gemini Live Agent connected.");
                    this.sendSetup();
                    resolve();
                };
                this.ws.onerror = (e) => {
                    console.error("WebSocket error:", e);
                    reject(e);
                };
                this.ws.onclose = (event) => {
                    this.isConnected = false;
                    this.isSetup = false;
                    console.log(`Gemini Live Agent disconnected. Code: ${event.code}, Reason: ${event.reason || "No reason provided"}`);
                };
                this.ws.onmessage = (event) => this.handleMessage(event);
            });
        } catch (e) {
            console.error("Connection failed:", e);
            throw e;
        }
    }
    sendSetup() {
        // Correcting structure based on Code 1007: Flattening fields under 'setup'
        const setupMessage = {
            setup: {
                model: this.model,
                generationConfig: {
                    responseModalities: ["TEXT"] 
                },
                systemInstruction: {
                    parts: [{
                        text: `You are an expert organic chemistry tutor. Your goal is to help students practice and master reaction mechanisms.
                            
CORE RULES:
1. QUESTION GENERATION: When asked for a new question, generate 1 single reaction in JSON format.
2. ADAPTATION: If the student failed the last question, focus on a slightly simpler version of that concept. If they succeeded, increase difficulty.
3. OUTPUT FORMAT (Questions):
{
  "qtype": "predict|mechanism|stereo",
  "reactants": "SMILES",
  "conditions": "LaTeX",
  "answer": "SMILES",
  "instructions": "Task description",
  "explanation": "Detailed mechanism with [[SMILES: ...]] placeholders."
}
4. GRADING: When the student submits a drawing, evaluate it based on the current reaction. Output 'Correct' or 'Incorrect' (at the very start), followed by a subtle 10-word hint if incorrect.
5. PERSONA: Be encouraging, concise (max 50 words), and focus on electron-pushing logic.`
                    }]
                }
            }
        };
        console.log("[DEBUG] Sending flattened setup configuration...");
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
                console.warn("Received unexpected data type:", typeof event.data);
                return;
            }

            const data = JSON.parse(text);
            if (data.setupComplete) {
                this.isSetup = true;
                return;
            }

            if (data.serverContent && data.serverContent.modelTurn) {
                // Harden: Loop through all parts as per user's "Receiving responses" screenshot
                let combinedText = "";
                for (const part of data.serverContent.modelTurn.parts || []) {
                    if (part.text) {
                        combinedText += part.text;
                    }
                }
                
                if (combinedText && this.pendingResolve) {
                    this.pendingResolve(combinedText);
                    this.pendingResolve = null;
                }
            }
        } catch (e) { console.error("Live message error:", e); }
    }

    async sendTurn(prompt, base64Image) {
        if (!this.isConnected) await this.connect();

        // 1. Send text prompt via realtimeInput (per user's "Sending text" screenshot)
        this.ws.send(JSON.stringify({
            realtimeInput: {
                text: prompt
            }
        }));

        // 2. If image present, send via realtimeInput video field (per user's "Sending video" screenshot)
        if (base64Image) {
            this.ws.send(JSON.stringify({
                realtimeInput: {
                    video: {
                        data: base64Image,
                        mimeType: "image/jpeg"
                    }
                }
            }));
        }

        return new Promise((resolve) => {
            this.pendingResolve = resolve;
        });
    }

    async getNextQuestion(topic, difficulty) {
        const perf = this.history.length > 0 ? this.history[this.history.length - 1] : "start";
        const prompt = `Generate a new adaptive question. Topic: ${topic}. Difficulty: ${difficulty}. User's last performance: ${perf}. JSON ONLY.`;
        const responseText = await this.sendTurn(prompt);

        try {
            // Robust JSON extraction: Find the first '{' and last '}'
            const start = responseText.indexOf('{');
            const end = responseText.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error("No JSON found in response");
            
            const jsonText = responseText.substring(start, end + 1);
            const data = JSON.parse(jsonText);
            return data;
        } catch (e) {
            console.error("Failed to parse adaptive question:", e, responseText);
            throw e;
        }
    }
}

const liveAgent = new GeminiLiveAgent();

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

// Handle window resizing correctly to avoid stretching
function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    // Set standard drawing styles
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2c3e50'; // Dark slate blue for ink
}

window.addEventListener('resize', resizeCanvas);
// Give the browser a tiny bit of time to layout before initial sizing
setTimeout(resizeCanvas, 0);

// Helper function to extract correct coordinate for both Mouse and Touch events
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

function startDrawing(e) {
    e.preventDefault(); // Important to prevent default touch behaviors like scrolling
    isDrawing = true;

    // Set brush mode
    if (isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = 20; // Thicker for erasing
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = 3; // Standard for pen
    }

    const pos = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);

    // Draw a single dot if it's just a tap
    draw(e);
}

function stopDrawing(e) {
    if (e) e.preventDefault();
    isDrawing = false;
    ctx.beginPath(); // Reset the path for the next stroke
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

// Intercept global touch events to strictly prevent "pull to refresh" reloads
// Intercept global touch events to strictly prevent "pull to refresh" reloads
document.body.addEventListener('touchmove', function (e) {
    // Allow touch scrolling on specific containers
    if (e.target.closest('#about-content') || e.target.closest('#topics-list') || e.target.closest('#explanation-display') || e.target.closest('#molecule-display')) {
        return;
    }

    e.preventDefault();
}, { passive: false });


// ------ Touch Events (Crucial for iPad) ------
canvas.addEventListener('touchstart', startDrawing, { passive: false });
canvas.addEventListener('touchmove', draw, { passive: false });
canvas.addEventListener('touchend', stopDrawing, { passive: false });
canvas.addEventListener('touchcancel', stopDrawing, { passive: false });

// ------ Mouse Events (For testing on desktop) ------
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

// ------ Toolbar Actions ------
clearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    isCanvasBlank = true;
    updateSubmitDisabled();
});

if (eraseBtn) {
    eraseBtn.addEventListener('click', () => {
        isEraser = !isEraser;
        eraseBtn.classList.toggle('active-tool', isEraser);

        if (isEraser) {
            eraseBtn.innerText = "Pen";
        } else {
            eraseBtn.innerText = "Eraser";
        }
    });
}

// // ------ Render a Reaction ------
function renderReaction(data, showAnswer = false) {
    const instructionDiv = document.getElementById('question-instruction');
    const moleculeDiv = document.getElementById('molecule-display');
    const loadingText = document.getElementById('loading-text');

    if (!instructionDiv || !moleculeDiv || !explanationDisplay || !explanationContent) return;

    // Immediate clear
    moleculeDiv.innerHTML = '';
    explanationDisplay.style.display = 'none';

    // Reset/Parse explanation
    renderExplanationWithMolecules(data.explanation || "No explanation preloaded.", explanationContent);

    chatMessages.innerHTML = ''; // Reset chat history

    // Hide status text ONLY if we aren't displaying a persistent answer result
    if (!showAnswer && loadingText.innerText !== "Checking...") {
        loadingText.style.display = 'none';
        loadingText.className = "";
    }

    if (!data) return;

    // Set Instruction
    instructionDiv.innerText = data.instructions || "Predict the major product:";

    // Render Reactants
    const reactantMolecules = data.reactants.split('.').map(s => s.trim()).filter(s => s.length > 0);
    renderMolecules(reactantMolecules, moleculeDiv);

    // Add reaction arrow with conditions
    const arrowContainer = document.createElement('div');
    arrowContainer.className = 'reaction-arrow';
    arrowContainer.style.padding = '0 15px';
    arrowContainer.style.fontSize = '1.8rem';
    const conditions = (data.conditions || '').replace(/\\\\/g, '\\');
    arrowContainer.innerText = `\\( \\ce{->[${conditions}]} \\)`;
    moleculeDiv.appendChild(arrowContainer);

    // If MECHANISM mode, show the final product as a target
    if (data.qtype === 'mechanism' || showAnswer) {
        if (data.answer) {
            const answerMolecules = data.answer.split('.').map(s => s.trim()).filter(s => s.length > 0);
            renderMolecules(answerMolecules, moleculeDiv, "answer");
        }
    }

    if (window.MathJax) {
        MathJax.typesetPromise([arrowContainer]).catch(err => console.error('MathJax error:', err));
    }
}

// Helper to render a group of molecules with '+' signs
function renderMolecules(molecules, container, suffix = "") {
    molecules.forEach((mol, index) => {
        const newCanvas = document.createElement('canvas');
        newCanvas.id = `canvas-${suffix}-${index}-${Date.now()}`; // Unique ID

        if (index > 0) {
            const plus = document.createElement('div');
            plus.innerText = '+';
            plus.className = 'plus-sign';
            plus.style.fontSize = '1.8rem';
            plus.style.padding = '0 5px';
            container.appendChild(plus);
        }

        container.appendChild(newCanvas);

        // iPad/Retina support: Scale resolution by device pixel ratio
        const dpr = window.devicePixelRatio || 1;
        const baseSize = 100; // Increased base size
        const size = baseSize * dpr;

        let options = {
            width: size,
            height: size,
            bondThickness: 2,
            bondSpacing: 4,
            fontSizeLarge: 10,
            padding: 10
        };

        let smilesDrawer = new SmilesDrawer.Drawer(options);

        // Adjust canvas display size
        newCanvas.style.width = baseSize + "px";
        newCanvas.style.height = baseSize + "px";

        SmilesDrawer.parse(mol, function (tree) {
            smilesDrawer.draw(tree, newCanvas.id, 'light', false);
        }, function (err) {
            console.error("Smiles parsing error: ", mol, err);
        });
    });
}

// ------ Rendering Mechanistic Explanations ------
function renderExplanationWithMolecules(text, container) {
    if (!container) return;
    container.innerHTML = '';

    // Match [[SMILES: SMILES_STRING]]
    const parts = text.split(/(\[\[SMILES:.*?\]\])/g);

    parts.forEach(part => {
        const match = part.match(/\[\[SMILES:(.*?)\]\]/);
        if (match) {
            const smiles = match[1].trim();
            const wrapper = document.createElement('div');
            wrapper.className = 'inline-molecule';
            const canvas = document.createElement('canvas');
            const uniqueId = `inline-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            canvas.id = uniqueId;
            wrapper.appendChild(canvas);
            container.appendChild(wrapper);

            // Draw small molecule
            const dpr = window.devicePixelRatio || 1;
            const bSize = 120;
            const size = bSize * dpr;
            canvas.style.width = bSize + "px";
            canvas.style.height = bSize + "px";

            const options = { width: size, height: size, bondThickness: 2, bondSpacing: 4, padding: 10 };
            const sd = new SmilesDrawer.Drawer(options);
            SmilesDrawer.parse(smiles, (tree) => {
                sd.draw(tree, uniqueId, 'light', false);
            }, (err) => console.error("Inline SMILES err:", err));
        } else if (part.trim().length > 0) {
            const span = document.createElement('span');
            span.innerText = part;
            container.appendChild(span);
        }
    });
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

    const diffMap = { 1: "beginner", 2: "intermediate", 3: "collegiate" };
    const difficultyKey = diffMap[targetDifficulty];
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

//// ------ Fetch Batch of Reactions (ADAPTIVE LIVE VERSION) ------
async function fetchBatchReactions(isExplicit = false) {
    if (isFetching) return;
    isFetching = true;

    const container = document.getElementById('reaction-container');
    const loadingText = document.getElementById('loading-text');

    if (isExplicit) {
        container.querySelectorAll('canvas, .plus-sign, .reaction-arrow').forEach(el => el.remove());
        loadingText.innerText = "Generating adaptive challenge...";
        loadingText.style.display = 'block';
    }

    try {
        const topic = selectedTopics[Math.floor(Math.random() * selectedTopics.length)];

        // Use Live Agent to get the next adaptive question
        const newReaction = await liveAgent.getNextQuestion(topic, currentDifficulty);

        if (newReaction) {
            currentReaction = newReaction;
            displayNextReaction();
        }
    } catch (e) {
        console.error("Live Question Fetch error:", e);
        loadingText.innerText = "Oops. The Live connection failed!";
        loadingText.style.display = 'block';
    } finally {
        isFetching = false;
    }
}

// ------ Manage Display Logic ------
function displayNextReaction() {
    // Legacy queue logic removed for Adaptive Live flow

    // Reset state for new reaction
    hasSubmitted = false;
    lastFeedback = "";
    isShowingAnswer = false;
    hasIncorrectSubmission = false;
    isCanvasBlank = true;

    // Clear the board for the new reaction
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    updateButtonState();
    updateSubmitDisabled();
    updateReportButton();
    renderReaction(currentReaction);
}

// ------ Update Queue Indicator ------
function updateQueueCount() {
    // Hidden count per user request
}

function updateButtonState() {
    if (!currentReaction) {
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
        loadingText.style.display = 'block';
    } else {
        loadingText.style.display = 'none';
    }

    if (explanationDiv) {
        explanationDiv.style.display = 'block';
    }

    renderReaction(currentReaction, true);
    updateButtonState();
    updateReportButton();
}
generateBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!currentReaction || isShowingAnswer) {
        displayNextReaction();
    } else {
        handleGiveUp();
    }
});

// ------ Submit and Evaluate ------
async function submitDrawing() {
    if (!currentReaction || isSubmitting) return;

    const loadingText = document.getElementById('loading-text');
    loadingText.innerText = "Checking...";
    loadingText.className = "";
    loadingText.style.display = 'block';
    isSubmitting = true;
    updateSubmitDisabled();

    try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        const base64Image = dataUrl.split(',')[1];

        const prompt = "Evaluate my drawing.";
        const feedback = await liveAgent.sendTurn(prompt, base64Image);

        if (feedback) {
            loadingText.innerText = feedback;
            lastFeedback = feedback;
            hasSubmitted = true;

            // Check for 'correct' anywhere in the first few words, ignoring markdown
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
            loadingText.innerText = "The lab is a bit hazy. Try drawing slightly clearer?";
            loadingText.className = "error-text";
        }
    } catch (e) {
        console.error("Submission error:", e);
        loadingText.innerText = "Oops. Live session error!";
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

// Start the session with an initial adaptive question
fetchBatchReactions(true);
