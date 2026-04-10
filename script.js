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
let reactionQueue = [];
let currentReaction = null;
let isFetching = false;
let isSubmitting = false;
let starterQuestionsBuffer = null;

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

const submitBtn = document.getElementById('submit-btn');

let isCanvasBlank = true;
let isLearnMode = localStorage.getItem('ochem_learn_mode') === 'true';
const learnModeToggle = document.getElementById('learn-mode-toggle');

// ------ Settings & Topic Management ------
const baseTopics = ["addition", "substitution", "elimination", "on rings", "Grignard", "redox", "protecting groups", "cycloadditions", "electrocyclic", "rearrangements", "radicals", "carbenes", "stereochemistry", "regioselectivity"];
let userCustomTopics = JSON.parse(localStorage.getItem('ochem_custom_topics')) || [];
let selectedTopics = JSON.parse(localStorage.getItem('ochem_selected_topics')) || [...baseTopics, ...userCustomTopics];

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


// Helper to sanitize SMILES syntax to prevent parser crashes
function cleanSmiles(smiles) {
    if (!smiles) return null;
    let s = smiles.replace(/^\[\[SMILES: (.*?)\]\]$/, '$1').trim(); // Strip wrapping and trim

    // SMILES backslashes usually shouldn't be doubled if they come from JSON.parse
    // However, if the API sends them escaped, we only want one level.
    // Let's assume the string is raw SMILES.

    // Balance brackets
    const openBrackets = (s.match(/\[/g) || []).length;
    const closeBrackets = (s.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) s += ']'.repeat(openBrackets - closeBrackets);
    if (closeBrackets > openBrackets) s = '['.repeat(closeBrackets - openBrackets) + s;

    // Check for hanging operators (this can happen during AI generation)
    if (/[\-\+\=\#]$/.test(s)) {
        // Only strip if it's not a charge at the end e.g. [O-]
        if (!s.endsWith(']')) return null;
    }

    return s;
}


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

function showMessage(text, className = "") {
    const loadingText = document.getElementById('loading-text');
    if (!loadingText) return;
    loadingText.innerText = text;
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
    if (baseTopics.includes(newTopic) || userCustomTopics.includes(newTopic)) {
        alert("Topic already exists!");
        return;
    }

    userCustomTopics.push(newTopic);
    selectedTopics.push(newTopic); // Auto-select new topic
    localStorage.setItem('ochem_custom_topics', JSON.stringify(userCustomTopics));
    localStorage.setItem('ochem_selected_topics', JSON.stringify(selectedTopics));

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

        // Save learn mode
        if (learnModeToggle) {
            isLearnMode = learnModeToggle.checked;
            localStorage.setItem('ochem_learn_mode', isLearnMode);
        }

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
        const prompt = `Context:
Reactants: ${currentReaction.reactants}
Conditions: ${currentReaction.conditions}
Answer: ${currentReaction.answer}
Explanation: ${currentReaction.explanation}

Student Question: ${question}

Instructions: You are an expert organic chemistry tutor. Answer the student's question concisely (max 50 words) based on the reaction context above. Focus on mechanistic logic and principles.`;

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) throw new Error("API error");

        const result = await response.json();
        if (result.candidates && result.candidates[0].content.parts[0].text) {
            const botResponse = result.candidates[0].content.parts[0].text.trim();
            botMsgDiv.innerText = botResponse;
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

    // Set Instruction
    instructionDiv.innerText = data.instructions || "Predict the major product:";

    // Render Reactants
    const reactantMolecules = data.reactants.split('.').map(s => s.trim()).filter(s => s.length > 0);
    renderMolecules(reactantMolecules, moleculeDiv);

    // Render Arrow with Reagents and Conditions
    const arrowContainer = document.createElement('div');
    arrowContainer.className = 'reaction-arrow-container';

    const topRow = document.createElement('div');
    topRow.className = 'reagents-top';
    // Backwards compatibility for older starter.json / stored reactions
    const reagentsText = data.reagents || data.conditions || '';
    renderRichText(reagentsText.replace(/\\\\/g, '\\'), topRow);

    const arrowLine = document.createElement('div');
    arrowLine.className = 'arrow-line';
    // Remove innerHTML MathJax for the line; we'll use CSS for a better stretching arrow

    const bottomRow = document.createElement('div');
    bottomRow.className = 'conditions-bottom';
    if (data.reagents) {
        renderRichText(data.conditions || '', bottomRow);
    }

    arrowContainer.appendChild(topRow);
    arrowContainer.appendChild(arrowLine);
    arrowContainer.appendChild(bottomRow);
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

//// ------ Rendering Mechanistic Explanations & Rich Text ------
function renderRichText(text, container, isExplanation = false) {
    if (!container) return;
    container.innerHTML = '';

    // Match [[SMILES: SMILES_STRING]] possibly with spaces between brackets [[SMILES: ... ] ]
    const parts = text.split(/(\[\[SMILES:[\s\S]*?\]\s*\]\s*\]*)/g);




    parts.forEach(part => {
        const match = part.match(/\[\[SMILES:([\s\S]*?)\]\s*\]\s*\]*/);


        if (match) {
            let smiles = match[1].trim();
            // Handle cases where the AI might have outputted [[SMILES: ...]]] (extra ] at end)
            if (smiles.endsWith(']')) {
                const openCount = (smiles.match(/\[/g) || []).length;
                const closeCount = (smiles.match(/\]/g) || []).length;
                if (closeCount > openCount) {
                    smiles = smiles.substring(0, smiles.length - 1);
                }
            }

            // Horizontal separation for reagents (add + sign between multiple molecules)
            if (!isExplanation && container.children.length > 0) {
                const plus = document.createElement('span');
                plus.innerText = "+";
                plus.className = "reagent-separator";
                container.appendChild(plus);
            }


            const wrapper = document.createElement('div');

            wrapper.className = isExplanation ? 'inline-molecule-explanation' : 'inline-molecule';

            // For copy-pastability, we keep the sr-only-smiles span
            if (!isExplanation) {
                // Invisible copyable text for arrow context
                const hiddenText = document.createElement('span');
                hiddenText.className = 'sr-only-smiles';
                hiddenText.innerText = `[[SMILES: ${smiles}]]`;
                container.appendChild(hiddenText);
            }


            const canvas = document.createElement('canvas');
            canvas.className = 'molecule-canvas';
            wrapper.appendChild(canvas);

            container.appendChild(wrapper);

            // Draw small molecule
            const dpr = window.devicePixelRatio || 1;
            const bSize = isExplanation ? 70 : 80; // Smaller for explanation to avoid overflow
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
                    // Fallback to text
                    const fallbackText = document.createElement('span');
                    fallbackText.innerText = smiles;
                    fallbackText.style.fontSize = '0.8rem';
                    canvas.replaceWith(fallbackText);
                });
            }



        } else if (part.trim().length > 0) {
            const span = document.createElement('span');
            let content = part.trim();

            // Reagents/Conditions on arrow need auto-mhchem wrapping
            // Explanation text: 
            // 1. Don't auto-wrap everything (breaks fonts)
            // 2. DO wrap LaTeX commands (starting with \) so they render
            if (!isExplanation && !content.includes('\\(') && !content.includes('\\[')) {
                if (/[_^{}\\]/.test(content) || content.length > 2) {
                    content = `\\( \\ce{${content}} \\)`;
                }
            } else if (isExplanation) {
                // Auto-wrap LaTeX commands in explanations if they aren't already wrapped
                if (!content.includes('\\(') && !content.includes('\\[')) {
                    // Match \command or things that look like LaTeX
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
        MathJax.typesetPromise([container]).catch(err => console.error('MathJax error:', err));
    }
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
        const difficultyMap = {
            1: "Beginner: standard functional transformations (S_N1, S_N2, E1, E2, simple additions). Single step preferred.",
            2: "USNCO level: competitive chemistry. Regioselectivity, basic named reactions (Wittig, Robinson), some rearrangements. Can be 1-2 steps.",
            3: "IChO/Advanced Collegiate: total synthesis segments, advanced stereocontrol, complex pericyclics, obscure reagents (e.g. DDQ, DCC, specialized organometallics). Can be 2-3 step sequences."
        };

        // Use user-selected topics
        const topic = selectedTopics[Math.floor(Math.random() * selectedTopics.length)];

        // Immediate gratification: If this is the first ever question request, try starter.json first
        if (!currentReaction && reactionQueue.length === 0) {
            const starter = await getStarterQuestion(topic, currentDifficulty);
            if (starter) {
                console.log("Loading starter question:", starter.id);
                reactionQueue.push(starter);
                // We need to release isFetching to allow displayNextReaction to call fetchBatchReactions again if it wants
                // but actually displayNextReaction doesn't call it if something is in the queue.
                // However, we want the Gemini fetch to CONTINUE in the background.
                // So we display the starter and then PROCEED with the API call.
                displayNextReaction();
                // Important: We DON'T return here because we still want to fetch the rest of the batch from Gemini
            }
        }

        const prompt = `Generate 5 organic chemistry questions (Topic: ${topic}). Difficulty: ${difficultyMap[currentDifficulty]}. JSON only.

Type Mix: randomly use "predict" (Predict product), "mechanism" (Draw arrow mechanism), or "stereo" (stereochemistry focus).
Multistep: Allow '1. reagent, 2. reagent' in conditions if difficulty > 1.

Structure:
{
  "reactions": [
    {
      "qtype": "predict|mechanism|stereo",
      "reactants": "SMILES",
      "reagents": "Organic reagents in [[SMILES: ...]] and others in LaTeX. Top of arrow.",
      "conditions": "Solvents, temperature, time, etc. in LaTeX. Bottom of arrow.",
      "answer": "SMILES",
      "instructions": "Specific task",
      "explanation": "Detailed mechanism. Use [[SMILES: SMILES_STRING]] to draw mechanistic intermediates within the text."
    }
  ]
}

RULES:
1. SMILES: NO hydrogens.
2. LaTeX: Use DOUBLE backslashes for commands (e.g. \\\\Delta).
3. ORGANIC REAGENTS: ALWAYS use [[SMILES: ...]] in the 'reagents' field for organic molecules.
4. JSON RULES: NO actual newlines inside JSON strings. NO trailing commas.
5. Make sure the reaction actually occurs to a significant extent.
6. Make sure the SMILES syntax is correct and proper.`;


        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                responseMimeType: 'application/json'
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Gemini API Error:', response.status, errorData);

            if (response.status === 503 || response.status === 429) {
                loadingText.innerText = "Looks like the bot's busy...Please try again in a moment.";
            } else {
                loadingText.innerText = "Oops. Looks like the bot messed up!";
            }

            document.getElementById('message-container').style.display = 'block';

            isFetching = false;
            return;
        }

        const result = await response.json();

        if (result.candidates && result.candidates[0].content.parts[0].text) {
            let rawText = result.candidates[0].content.parts[0].text;
            try {
                // In JSON mode, rawText should be pure JSON
                let jsonText = rawText.trim();
                const data = JSON.parse(jsonText);

                // Support both {reactions: [...]} and direct [...]
                const reactions = Array.isArray(data) ? data : data.reactions;

                if (reactions && Array.isArray(reactions)) {
                    reactionQueue = [...reactionQueue, ...reactions];
                    updateQueueCount();
                }
            } catch (e) {
                console.error("JSON parse error", e, rawText);
                loadingText.innerText = "Error parsing response.";
                document.getElementById('message-container').style.display = 'block';

            }
        }
    } catch (e) {
        console.error("Fetch error:", e);
        loadingText.innerText = "Oops. Looks like the bot messed up!";
        document.getElementById('message-container').style.display = 'block';

    } finally {
        isFetching = false;

        // If the user was waiting for this specific batch (queue was empty),
        // display the first reaction from the new batch.
        if (requestedDirectly && reactionQueue.length > 0) {
            displayNextReaction();
        } else if (reactionQueue.length > 0 && !currentReaction) {
            // Initial load scenario
            displayNextReaction();
        }

        // Auto-hide the loading screen if it's not showing a persistent result
        if (loadingText.innerText === "Generating..." || loadingText.innerText === "Checking...") {
            // These states are handled by renderReaction/grading
        } else if (!loadingText.innerText.includes("Oops") && !loadingText.innerText.includes("busy")) {
            // Hide container if no error/busy message is present
            // document.getElementById('message-container').style.display = 'none';
        }
    }
}

// ------ Manage Display Logic ------
function displayNextReaction() {
    if (reactionQueue.length === 0) {
        fetchBatchReactions(true);
        return;
    }

    const nextReaction = reactionQueue.shift();
    currentReaction = nextReaction;

    // Reset state for new reaction
    hasSubmitted = false;
    lastFeedback = "";
    isShowingAnswer = false;
    isCanvasBlank = true;

    // Clear the board for the new reaction
    ctx.clearRect(0, 0, canvas.width, canvas.height);

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
    loadingText.className = ""; // Remove previous success/error colors
    document.getElementById('message-container').style.display = 'block';

    isSubmitting = true;
    updateSubmitDisabled();

    try {
        // High-speed grading optimization: 
        // 1. Capture the drawing
        // 2. Downscale to 60% for faster transmission and AI processing
        const originalDataUrl = canvas.toDataURL('image/png');

        // Use a temporary offscreen canvas for downscaling
        const offscreen = document.createElement('canvas');
        const scale = 0.6;
        offscreen.width = canvas.width * scale;
        offscreen.height = canvas.height * scale;
        const octx = offscreen.getContext('2d');

        // Draw whitespace background
        octx.fillStyle = "white";
        octx.fillRect(0, 0, offscreen.width, offscreen.height);

        const img = new Image();
        img.src = originalDataUrl;
        await new Promise(resolve => img.onload = resolve);
        octx.drawImage(img, 0, 0, offscreen.width, offscreen.height);

        const base64Image = offscreen.toDataURL('image/png').split(',')[1];

        // Evaluation strategy depends on Mode
        let promptSnippet = "";
        if (isLearnMode) {
            promptSnippet = `Act as a supportive organic chemistry tutor. 
1. If 'Incorrect', identify the specific chemical error (e.g., regio/stereo, steric clash, valency, or incorrect mechanism step) and explain the principle/rule being violated (e.g. Markovnikov, Anti-Zaitsev). 
2. Be encouraging. 
3. STATED RULE: NEVER give the answer, product name, or SMILES. Help them think, don't tell them.`;
        } else {
            promptSnippet = `Drawing correct? Output 'Correct' or 'Incorrect'. If wrong, give a subtle hint (max 10 words). NEVER give the answer or reveal the final structure.`;
        }


        const prompt = `Evaluate drawing.
Task: ${currentReaction.qtype}
Target: ${currentReaction.reactants} [${currentReaction.reagents || currentReaction.conditions}] -> ${currentReaction.answer}
${promptSnippet}`;


        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, image: base64Image })
        });


        if (!response.ok) {
            const errorData = await response.json();
            console.error('Submission Gemini API Error:', response.status, errorData);

            if (response.status === 503 || response.status === 429) {
                loadingText.innerText = "Looks like the bot's busy...Please try again in a moment.";
            } else {
                loadingText.innerText = "Oops. Looks like the bot messed up!";
            }
            document.getElementById('message-container').style.display = 'block';

            loadingText.className = "error-text";
            throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        if (result.candidates && result.candidates[0].content.parts[0].text) {
            const feedback = result.candidates[0].content.parts[0].text.trim();
            showMessage(feedback);
            lastFeedback = feedback; // Store for Give Up
            hasSubmitted = true;


            if (feedback.toLowerCase().startsWith('correct')) {
                loadingText.className = "success-text";
                isShowingAnswer = true; // Transition "Give up" to "New"
                updateButtonState();

                if (reportBtn) {
                    reportBtn.innerText = "Report Error";
                    reportBtn.style.backgroundColor = "#8e8e93";
                }

                // Show the actual answer so the user can see it!
                if (explanationDisplay) {
                    explanationDisplay.style.display = 'block';
                }
                renderReaction(currentReaction, true);
            } else {
                loadingText.className = "error-text";
                if (reportBtn) {
                    reportBtn.innerText = "I was right";
                    reportBtn.style.backgroundColor = "#ff9500"; // Orange to indicate appeal
                }
                // Ensure message is visible if it was manually closed
                messageContainer.style.display = 'block';
                messageRestoreBtn.style.display = 'none';
            }


        }
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

// ------ Report Error / I was right logic ------
async function reevaluateDrawing() {
    if (!currentReaction || isSubmitting) return;

    const loadingText = document.getElementById('loading-text');
    loadingText.innerText = "Re-evaluating...";
    loadingText.className = "";
    document.getElementById('message-container').style.display = 'block';
    isSubmitting = true;

    try {
        const dataUrl = canvas.toDataURL('image/png');
        const base64Image = dataUrl.split(',')[1];

        const prompt = `The user is appealing your previous 'Incorrect' verdict for this OChem drawing.
Task Type: ${currentReaction.qtype}
Instructions: ${currentReaction.instructions}
Reaction: ${currentReaction.reactants} [${currentReaction.reagents || currentReaction.conditions}] -> ${currentReaction.answer}
Previous Feedback: ${lastFeedback}

Re-evaluate VERY carefully. Is the user's drawing actually a plausible representation of the correct answer? 
Consider different orientations, implicit hydrogens, or valid alternative mechanisms if applicable.
Output 'Correct' or 'Incorrect'. If still Incorrect, explain specifically why (max 15 words).`;

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
                updateButtonState();
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

