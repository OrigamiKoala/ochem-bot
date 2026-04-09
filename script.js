// script.js
console.log("hi!");
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clear-btn');
const generateBtn = document.getElementById('generate-btn');

let isDrawing = false;

// API key is handled securely on the backend in /api/chat.js
let reactionQueue = [];
let currentReaction = null;
let isFetching = false;
let isSubmitting = false;

// State for "Give Up" logic
let hasSubmitted = false;
let lastFeedback = "";
let isShowingAnswer = false;

const submitBtn = document.getElementById('submit-btn');

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

function initSettings() {
    if (!topicsListDiv) return;
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

        // Default to all if none selected to prevent errors
        if (selectedTopics.length === 0) selectedTopics = [...baseTopics, ...userCustomTopics];

        localStorage.setItem('ochem_selected_topics', JSON.stringify(selectedTopics));
        settingsModal.style.display = 'none';

        // Clear queue and fetch new ones immediately to reflect new settings
        reactionQueue = [];
        fetchBatchReactions();
    });
}

// Help button toggle
if (helpBtn) {
    helpBtn.addEventListener('click', () => {
        const explanationDiv = document.getElementById('explanation-display');
        if (explanationDiv) {
            const isHidden = explanationDiv.style.display === 'none';
            explanationDiv.style.display = isHidden ? 'block' : 'none';
        }
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
document.body.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

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

// // ------ Render a Reaction ------
function renderReaction(data, showAnswer = false) {
    const instructionDiv = document.getElementById('question-instruction');
    const moleculeDiv = document.getElementById('molecule-display');
    const explanationDiv = document.getElementById('explanation-display');
    const loadingText = document.getElementById('loading-text');

    if (!instructionDiv || !moleculeDiv || !explanationDiv) return;

    // Immediate clear
    moleculeDiv.innerHTML = '';
    explanationDiv.style.display = 'none';
    explanationDiv.innerText = data.explanation || "No explanation preloaded.";

    // Hide status text ONLY if we aren't displaying a persistent answer result
    if (!showAnswer && loadingText.innerText !== "Generating..." && loadingText.innerText !== "Checking...") {
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
    const conditions = data.conditions || '';
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

// ------ Fetch Batch of Reactions ------
async function fetchBatchReactions() {
    if (isFetching) return;
    isFetching = true;

    const container = document.getElementById('reaction-container');
    const loadingText = document.getElementById('loading-text');

    // Only clear if the queue is empty (to signal a new fetch)
    if (reactionQueue.length === 0) {
        container.querySelectorAll('canvas, .plus-sign, .reaction-arrow').forEach(el => el.remove());
        loadingText.innerText = "Generating...";
        loadingText.style.display = 'block';
    }

    try {
        // Use user-selected topics
        const topic = selectedTopics[Math.floor(Math.random() * selectedTopics.length)];
        const prompt = `Generate 5 organic chemistry questions (Topic: ${topic}). JSON only. Request ID: ${Date.now()}.

Type Mix: randomly use "predict" (Predict product), "mechanism" (Draw arrow mechanism), or "stereo" (stereochemistry focus).

Structure:
{
  "reactions": [
    {
      "qtype": "predict|mechanism|stereo",
      "reactants": "SMILES",
      "conditions": "LaTeX",
      "answer": "SMILES",
      "instructions": "Specific task instruction",
      "explanation": "Brief step-by-step mechanism/logic walkthrough"
    }
  ]
}

RULES:
1. SMILES: NO hydrogens.
2. LaTeX: Use DOUBLE backslashes (e.g. \\\\Delta).`;

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

            loadingText.style.display = 'block';
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
                loadingText.style.display = 'block';
            }
        }
    } catch (e) {
        console.error("Fetch error:", e);
        loadingText.innerText = "Oops. Looks like the bot messed up!";
        loadingText.style.display = 'block';
    } finally {
        isFetching = false;
        // Don't hide the text here if it's "Generating..." 
        // because displayNextReaction/renderReaction will handle it
        if (loadingText.innerText === "Generating...") {
            // Keep it visible for a brief moment or until render handles it
        } else {
            // If it was an error message, keep it. Otherwise hide.
            if (!loadingText.innerText.includes("Oops") && !loadingText.innerText.includes("busy")) {
                loadingText.style.display = 'none';
            }
        }

        // If the queue was empty and we just got data, display the first one
        if (reactionQueue.length > 0 && container.querySelectorAll('canvas, .reaction-arrow').length === 0) {
            displayNextReaction();
        }
    }
}

// ------ Manage Display Logic ------
function displayNextReaction() {
    if (reactionQueue.length === 0) {
        fetchBatchReactions();
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
    renderReaction(nextReaction);

    // If we're running low, fetch more in the background
    if (reactionQueue.length <= 2) {
        fetchBatchReactions();
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
        loadingText.style.display = 'block';
    } else {
        loadingText.style.display = 'none';
    }

    if (explanationDiv) {
        explanationDiv.style.display = 'block';
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
    loadingText.style.display = 'block';
    isSubmitting = true;
    updateSubmitDisabled();

    try {
        // Capture canvas
        const dataUrl = canvas.toDataURL('image/png');
        const base64Image = dataUrl.split(',')[1];

        const prompt = `Evaluate the user's drawing for this challenge:
Task Type: ${currentReaction.qtype}
Instructions: ${currentReaction.instructions}
Reaction: ${currentReaction.reactants} [${currentReaction.conditions}] -> ${currentReaction.answer}

Is the drawing correct? Output 'Correct' or 'Incorrect'. 
CRITICAL RULE: If Incorrect, give a subtle hint (max 10 words) that guides them without giving the answer away (no structure names or SMILES).`;

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
            loadingText.style.display = 'block';
            loadingText.className = "error-text";
            throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        if (result.candidates && result.candidates[0].content.parts[0].text) {
            const feedback = result.candidates[0].content.parts[0].text.trim();
            loadingText.innerText = feedback;
            lastFeedback = feedback; // Store for Give Up
            hasSubmitted = true;

            if (feedback.toLowerCase().startsWith('correct')) {
                loadingText.className = "success-text";
                isShowingAnswer = true; // Transition "Give up" to "New"
                updateButtonState();
            } else {
                loadingText.className = "error-text";
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
