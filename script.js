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
});

// ------ Render a Reaction ------
function renderReaction(data, showAnswer = false) {
    const container = document.getElementById('reaction-container');
    const loadingText = document.getElementById('loading-text');

    // Immediate clear of all existing dynamic elements before starting the render
    container.querySelectorAll('canvas, .plus-sign, .reaction-arrow').forEach(el => el.remove());

    // Only hide loading text if we're not using it to show feedback
    if (!showAnswer) {
        loadingText.style.display = 'none';
        loadingText.className = "";
    }

    if (!data || !data.reactants) {
        console.error("Invalid reaction data", data);
        return;
    }

    // Render Reactants
    const reactantMolecules = data.reactants.split('.').map(s => s.trim()).filter(s => s.length > 0);
    renderMolecules(reactantMolecules, container);

    // Add reaction arrow with conditions
    const arrowContainer = document.createElement('div');
    arrowContainer.className = 'reaction-arrow';
    arrowContainer.style.display = 'flex';
    arrowContainer.style.alignItems = 'center';
    arrowContainer.style.justifyContent = 'center';
    arrowContainer.style.padding = '0 15px';
    arrowContainer.style.color = '#333';
    arrowContainer.style.fontSize = '1.8rem';
    const conditions = data.conditions || '';
    arrowContainer.innerText = `\\( \\ce{->[${conditions}]} \\)`;
    container.appendChild(arrowContainer);

    // Render Answer (if requested)
    if (showAnswer && data.answer) {
        const answerMolecules = data.answer.split('.').map(s => s.trim()).filter(s => s.length > 0);
        renderMolecules(answerMolecules, container, "answer");
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

        let options = { width: 70, height: 70 };
        let smilesDrawer = new SmilesDrawer.Drawer(options);

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
        loadingText.innerText = "Fetching new batch...";
        loadingText.style.display = 'block';
    }

    try {
        const prompt = "Generate 5 different organic chemistry mechanism practice questions with just the reactants, plus reaction conditions/catalysts if applicable. Also provide the correct major product(s) as a SMILES string. \nCRITICAL RULES:\n1. NEVER explicitly write out hydrogens (NO 'H3', NO 'H2', NO 'CH3'). \n2. Bromoethane must be `CCBr`, NEVER `CH3CH2Br`.\n3. Acetone must be `CC(=O)C`, NEVER `CH3C(=O)CH3`.\n4. SMILES syntax (used in 'reactants' and 'answer') must NEVER contain underscores or subscripts (NO `Br_2`). Bromine is `BrBr`.\n5. LaTeX mhchem syntax (used in 'conditions') MUST use proper subscripts (e.g., `Br2`, `H2SO4`, `\\Delta`).\n\nOutput ONLY a valid JSON object with an array of 5 reactions in a markdown block exactly like this (NO OTHER TEXT). Make sure the 'conditions' field is formatted as a valid LaTeX mhchem string (e.g. H_2SO_4, \\Delta):\n```json\n{\n  \"reactions\": [\n    {\n      \"reactants\": \"CC(=O)C.C1=CC=CC=C1\",\n      \"conditions\": \"Br2, H2SO4\",\n      \"answer\": \"CC(O)(C)C1=CC=CC=C1\"\n    },\n    ...\n  ]\n}\n```";

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Gemini API Error:', response.status, errorData);
            loadingText.innerText = "Oops. Looks like the bot messed up!";
            loadingText.style.display = 'block';
            isFetching = false;
            return;
        }

        const result = await response.json();

        if (result.candidates && result.candidates[0].content.parts[0].text) {
            let rawText = result.candidates[0].content.parts[0].text;
            try {
                const blockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
                let jsonText = blockMatch ? blockMatch[1].trim() : rawText.trim();
                const data = JSON.parse(jsonText);

                if (data.reactions && Array.isArray(data.reactions)) {
                    reactionQueue = [...reactionQueue, ...data.reactions];
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
        loadingText.style.display = 'none';

        // If the queue was empty and we just got data, display the first one
        if (reactionQueue.length > 0 && container.querySelectorAll('canvas').length === 0) {
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

    updateQueueCount();
    updateButtonState();
    renderReaction(nextReaction);

    // If we're running low, fetch more in the background
    if (reactionQueue.length <= 1) {
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

    if (hasSubmitted && lastFeedback) {
        loadingText.innerText = lastFeedback;
        loadingText.style.display = 'block';
        // Keep the styling (success/error) from the last submission
    } else {
        loadingText.style.display = 'none';
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
    loadingText.innerText = "Evaluating...";
    loadingText.className = ""; // Remove previous success/error colors
    loadingText.style.display = 'block';
    isSubmitting = true;

    try {
        // Capture canvas
        const dataUrl = canvas.toDataURL('image/png');
        const base64Image = dataUrl.split(',')[1];

        const prompt = `Reaction: ${currentReaction.reactants} under conditions ${currentReaction.conditions}. \nAnalyze the user's drawing on the provided image. Does it correctly represent the major product(s) or the mechanism for this reaction? \nOutput EXACTLY 'Correct' or 'Incorrect' followed by a very short (10 words max) explanation.`;

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, image: base64Image })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Submission Gemini API Error:', response.status, errorData);
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
    }
}

submitBtn.addEventListener('click', (e) => {
    e.preventDefault();
    submitDrawing();
});
