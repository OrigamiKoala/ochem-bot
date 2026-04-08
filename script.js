import { GoogleGenAI } from "@google/genai";
console.log("hi!");
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clear-btn');
const generateBtn = document.getElementById('generate-btn');

let isDrawing = false;

// The __API_KEY__ placeholder is replaced by the actual API_KEY secret during GitHub Actions deployment.
// Make sure you have restricted your API key to "origamikoala.github.io" in Google Cloud Console!
const apiKey = process.env.API_KEY;
const ai = apiKey && apiKey !== '__API_KEY__' ? new GoogleGenAI({ apiKey: apiKey }) : null;

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

// ------ Fetch Practice Question ------
async function fetchPracticeQuestion() {
    const container = document.getElementById('reaction-container');
    const loadingText = document.getElementById('loading-text');

    // Clear all existing dynamic canvases from the previous reaction
    container.querySelectorAll('canvas').forEach(c => c.remove());
    loadingText.style.display = 'block';

    try {
        if (!ai) {
            loadingText.innerText = "Error: No valid API Key was provided. Please refresh the page.";
            loadingText.style.display = 'block';
            return;
        }
        
        // Using the GoogleGenAI sdk with gemini-3.1-flash-lite-preview
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: "Generate a single organic chemistry mechanism practice question with just the reactants, plus reaction conditions/catalysts. Make sure the reaction is actually valid. \nCRITICAL RULES:\n1. NEVER explicitly write out hydrogens (NO 'H3', NO 'H2', NO 'CH3'). \n2. Bromoethane must be `CCBr`, NEVER `CH3CH2Br`.\n3. Acetone must be `CC(=O)C`, NEVER `CH3C(=O)CH3`.\n\nOutput ONLY a valid JSON object in a yaml/markdown block exactly like this (NO OTHER TEXT). Make sure the 'conditions' field is formatted as a valid LaTeX mhchem string (e.g. H_2SO_4, \\Delta):\n```json\n{\n  \"reactants\": \"CC(=O)C.C1=CC=CC=C1\",\n  \"conditions\": \"H_2SO_4, \\\\Delta\"\n}\n```",
            config: {
                maxOutputTokens: 2000,
                temperature: 1
            }
        });

        loadingText.style.display = 'none';
        if (response.text) {
            let rawText = response.text;
            let data = { reactants: "", conditions: "" };

            try {
                const blockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
                let jsonText = blockMatch ? blockMatch[1].trim() : rawText.trim();
                data = JSON.parse(jsonText);
            } catch (e) {
                console.error("JSON parse error", e, rawText);
                loadingText.innerText = "Error parsing response.";
                loadingText.style.display = 'block';
                return;
            }

            if (!data.reactants) {
                loadingText.innerText = "Invalid response format.";
                loadingText.style.display = 'block';
                return;
            }

            let smiles = data.reactants.trim();

            // SmilesDrawer does not natively parse disconnected components separated by '.'
            // We need to split the string and render each molecule to its own canvas
            const molecules = smiles.split('.').map(s => s.trim()).filter(s => s.length > 0);

            // Clear any plus signs or arrows we added
            container.querySelectorAll('.plus-sign, .reaction-arrow').forEach(el => el.remove());

            molecules.forEach((mol, index) => {
                // Create a dynamic canvas for each molecule
                const newCanvas = document.createElement('canvas');
                newCanvas.id = `reaction-canvas-${index}`;

                // Add a '+' sign between molecules
                if (index > 0) {
                    const plus = document.createElement('div');
                    plus.innerText = '+';
                    plus.className = 'plus-sign';
                    plus.style.fontSize = '2rem';
                    plus.style.padding = '0 10px';
                    container.appendChild(plus);
                }

                container.appendChild(newCanvas);

                let options = {
                    width: (container.clientWidth / molecules.length) - 40,
                    height: container.clientHeight - 40,
                };
                let smilesDrawer = new SmilesDrawer.Drawer(options);

                SmilesDrawer.parse(mol, function (tree) {
                    smilesDrawer.draw(tree, newCanvas.id, 'light', false);
                }, function (err) {
                    console.error("Smiles parsing error on component: ", mol, err);
                    loadingText.innerText = 'Syntax Error: "' + mol + '"';
                    loadingText.style.display = 'block';
                });
            });

            // Add reaction arrow with conditions
            const arrowContainer = document.createElement('div');
            arrowContainer.className = 'reaction-arrow';
            arrowContainer.style.display = 'flex';
            arrowContainer.style.alignItems = 'center';
            arrowContainer.style.justifyContent = 'center';
            arrowContainer.style.padding = '0 15px';
            arrowContainer.style.color = '#333';
            arrowContainer.style.fontSize = '1.8rem';
            
            // Format for mhchem
            const conditions = data.conditions || '';
            arrowContainer.innerText = `\\( \\ce{->[${conditions}]} \\)`;
            
            container.appendChild(arrowContainer);
            
            if (window.MathJax) {
                MathJax.typesetPromise([arrowContainer]).catch(err => console.error('MathJax error:', err));
            }

        } else {
            console.error(data);
            loadingText.innerText = "Error loading reaction.";
            loadingText.style.display = 'block';
        }
    } catch (e) {
        console.error(e);
        loadingText.innerText = "Error loading reaction.";
        loadingText.style.display = 'block';
    }
}
generateBtn.addEventListener('click', (e) => {
    e.preventDefault();
    fetchPracticeQuestion();
});
