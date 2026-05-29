import { useEffect, useRef, useCallback } from 'react';
import { renderRichText } from '../utils/richText';
import { cleanSmiles, smilesOptions } from '../utils/smiles';
import { safeTypeset } from '../utils/mathJax';
import { handleStream } from '../utils/stream';
import { apiChat } from '../utils/api';

export default function ReactionPanel({
  currentReaction,
  isShowingAnswer,
  isGenChemMode,
  isFreeDraw,
  lastFeedback,
  explanationVisible,
  hintOverride,
}) {
  const instructionRef = useRef(null);
  const moleculeRef = useRef(null);
  const explanationContentRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const followupInputRef = useRef(null);

  // Render the reaction whenever it changes
  useEffect(() => {
    renderReaction(currentReaction, isShowingAnswer);
  }, [currentReaction, isShowingAnswer]);

  // Render hint override when it changes
  useEffect(() => {
    if (hintOverride && explanationContentRef.current) {
      const container = explanationContentRef.current;
      container.innerHTML = '';
      const hintLabel = document.createElement('strong');
      hintLabel.textContent = '💡 Hint: ';
      container.appendChild(hintLabel);
      renderRichText(hintOverride, container, true);
    }
  }, [hintOverride]);

  function hasContent(field) {
    if (!field) return false;
    const trimmed = field.trim().toLowerCase();
    return trimmed.length > 0 && trimmed !== 'none' && trimmed !== 'n/a' && trimmed !== '-';
  }

  function extractPureSmiles(str) {
    if (!str) return "";
    let s = str.trim();
    const tagMatch = /\[\[\s*SMILES:\s*(.*?)\s*\]\]/i.exec(s);
    if (tagMatch) return tagMatch[1];
    return s.replace(/\[\[\s*SMILES:\s*/gi, '').replace(/\]\]/g, '').trim();
  }

  function cleanTextForSvg(text) {
    if (!text) return "";
    let clean = text.trim();
    clean = clean.replace(/\\ce\{([^\}]+)\}/g, '$1');
    clean = clean.replace(/\\cdot\b/g, '·')
                 .replace(/\\Delta\b/g, 'Δ')
                 .replace(/\\deg\b/g, '°')
                 .replace(/\{\\circ\}/g, '°')
                 .replace(/\^\{\\circ\}/g, '°')
                 .replace(/\^\\circ/g, '°')
                 .replace(/\\rightarrow\b/g, '→')
                 .replace(/\\leftrightarrow\b/g, '↔')
                 .replace(/\\leftharpoons\b/g, '⇌')
                 .replace(/\\to\b/g, '→')
                 .replace(/\\beta\b/g, 'β')
                 .replace(/\\alpha\b/g, 'α');
    clean = clean.replace(/\\\\/g, '').replace(/\\/g, '').replace(/[\{\}]/g, '');
    clean = clean.replace(/\$/g, '').replace(/_/g, '');
    return clean;
  }

  function renderReactionOneStep(data, container, showAnswer = false) {
    container.innerHTML = '';

    let cleanReactants = extractPureSmiles(data.reactants);
    let cleanAnswer = showAnswer && data.answer ? extractPureSmiles(data.answer) : "";

    const reactantMolecules = cleanReactants.split('.').map(s => s.trim()).filter(s => s.length > 0);
    const answerMolecules = cleanAnswer.split('.').map(s => s.trim()).filter(s => s.length > 0);

    const cleanReactantMols = reactantMolecules.map(m => cleanSmiles(m)).filter(Boolean);
    const cleanAnswerMols = answerMolecules.map(m => cleanSmiles(m)).filter(Boolean);

    if (cleanReactantMols.length === 0) {
      return false;
    }

    const reactionSmiles = cleanReactantMols.join('.') + '>>' + cleanAnswerMols.join('.');

    const dpr = window.devicePixelRatio || 1;
    const svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    container.appendChild(svgElement);

    const molOpts = {
      width: 120 * dpr,
      height: 120 * dpr,
      bondLength: 15,
      ...smilesOptions
    };
    
    const reactionDrawer = new window.SmilesDrawer.ReactionDrawer({ scale: 1 }, molOpts);

    let textAbove = "";
    let textBelow = "";

    if (hasContent(data.reagents) && hasContent(data.conditions)) {
      textAbove = cleanTextForSvg(data.reagents);
      textBelow = cleanTextForSvg(data.conditions);
    } else if (hasContent(data.reagents)) {
      textAbove = cleanTextForSvg(data.reagents);
    } else if (hasContent(data.conditions)) {
      textAbove = cleanTextForSvg(data.conditions);
    }

    try {
      let success = false;
      window.SmilesDrawer.parseReaction(reactionSmiles, function (reaction) {
        reactionDrawer.draw(reaction, svgElement, 'monochrome', textAbove, textBelow, false);
        svgElement.style.maxWidth = '100%';
        svgElement.style.height = 'auto';
        svgElement.style.display = 'block';
        svgElement.style.margin = '0 auto';
        success = true;
      }, function (err) {
        console.error("Reaction SMILES parse error:", reactionSmiles, err);
      });
      return success;
    } catch (e) {
      console.error("ReactionDrawer drawing exception:", e);
      return false;
    }
  }

  function renderMolecules(molecules, container, suffix = "") {
    molecules.forEach((mol, index) => {
      const newCanvas = document.createElement('canvas');
      newCanvas.id = `canvas-${suffix}-${index}-${Date.now()}`;
      container.appendChild(newCanvas);

      const dpr = window.devicePixelRatio || 1;
      const baseSize = 100;
      const size = baseSize * dpr;

      const options = { width: size, height: size, ...smilesOptions };
      let smilesDrawer = new window.SmilesDrawer.Drawer(options);

      newCanvas.style.width = baseSize + "px";
      newCanvas.style.height = baseSize + "px";

      const cleanedMol = cleanSmiles(mol);
      if (!cleanedMol) return;

      window.SmilesDrawer.parse(cleanedMol, function (tree) {
        smilesDrawer.draw(tree, newCanvas, 'monochrome', false);
      }, function (err) {
        console.error("Smiles parsing error: ", cleanedMol, err);
        const fallback = document.createElement('span');
        fallback.innerText = mol;
        fallback.style.fontSize = '0.8rem';
        newCanvas.replaceWith(fallback);
      });
    });
  }

  function renderReaction(data, showAnswer = false) {
    const instructionDiv = instructionRef.current;
    const moleculeDiv = moleculeRef.current;
    const explanationContentDiv = explanationContentRef.current;

    if (!instructionDiv || !moleculeDiv || !explanationContentDiv) return;

    moleculeDiv.innerHTML = '';

    if (!showAnswer && chatMessagesRef.current) {
      chatMessagesRef.current.innerHTML = '';
    }

    renderRichText(data?.explanation || "No explanation preloaded.", explanationContentDiv, true);

    if (!data) {
      if (isFreeDraw) {
        instructionDiv.innerText = 'Free Draw Mode — draw any mechanism and submit for grading.';
      } else {
        instructionDiv.innerText = '';
      }
      return;
    }

    const questionText = data.instructions || data.instruction || data.question || data.text;
    renderRichText(questionText || (isGenChemMode ? "" : "Predict the major product:"), instructionDiv, true);

    // Try rendering as a single-step reaction!
    let renderedOneStep = false;
    if (!isGenChemMode && hasContent(data.reactants)) {
      let cleanReactants = extractPureSmiles(data.reactants);
      const looksLikeSMILES = !cleanReactants.includes(' ') && (/[=\(\)#\[\]]/.test(cleanReactants) || cleanReactants.length < 80);
      if (looksLikeSMILES) {
        renderedOneStep = renderReactionOneStep(data, moleculeDiv, showAnswer);
      }
    }

    if (!renderedOneStep) {
      // Render Reactants
      if (hasContent(data.reactants)) {
        let cleanReactants = extractPureSmiles(data.reactants);
        const looksLikeSMILES = !cleanReactants.includes(' ') && (/[=\(\)#\[\]]/.test(cleanReactants) || cleanReactants.length < 80);

        if (looksLikeSMILES) {
          const reactantMolecules = cleanReactants.split('.').map(s => s.trim()).filter(s => s.length > 0);
          renderMolecules(reactantMolecules, moleculeDiv);
        } else {
          const reactantText = document.createElement('div');
          reactantText.style.cssText = 'font-size: 1rem; color: #1c1c1e; margin-bottom: 8px;';
          renderRichText(data.reactants, reactantText, true);
          moleculeDiv.appendChild(reactantText);
        }
      }

      // Arrow + reagents/conditions
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

      // Show answer
      if (showAnswer && data.answer) {
        let cleanAnswer = extractPureSmiles(data.answer);
        const answerLooksSMILES = !cleanAnswer.includes(' ') && (/[=\(\)#\[\]]/.test(cleanAnswer) || cleanAnswer.length < 80) && /^[A-Za-z0-9@+\-\[\]\(\)\\/#=.]+$/.test(cleanAnswer);

        if (answerLooksSMILES) {
          const answerMolecules = cleanAnswer.split('.').map(s => s.trim()).filter(s => s.length > 0);
          renderMolecules(answerMolecules, moleculeDiv, "answer");
        } else {
          const answerDiv = document.createElement('div');
          answerDiv.style.cssText = 'font-size: 1.1rem; font-weight: 600; color: #34c759; margin-top: 10px; padding: 8px 12px; background: #f0faf0; border-radius: 8px;';
          renderRichText(data.answer, answerDiv, true);
          moleculeDiv.appendChild(answerDiv);
        }
      }
    }
  }

  // Follow-up chat
  function addChatMessage(role, text) {
    const chatMsgs = chatMessagesRef.current;
    if (!chatMsgs) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${role === 'user' ? 'user-msg' : 'bot-msg'}`;
    msgDiv.innerText = text;
    chatMsgs.appendChild(msgDiv);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
  }

  const sendFollowupQuestion = useCallback(async () => {
    const input = followupInputRef.current;
    if (!input) return;
    const question = input.value.trim();
    if (!question || !currentReaction) return;

    addChatMessage('user', question);
    input.value = '';

    const botMsgDiv = document.createElement('div');
    botMsgDiv.className = 'chat-msg bot-msg';
    botMsgDiv.innerText = '...';
    chatMessagesRef.current.appendChild(botMsgDiv);

    try {
      const prompt = `Reaction: ${currentReaction.reactants} + [${currentReaction.reagents || ''}] / [${currentReaction.conditions || ''}] → ${currentReaction.answer}
Explanation: ${currentReaction.explanation}

Student asks: ${question}

Answer concisely as ${isGenChemMode ? 'chemistry' : 'organic chemistry'} tutor. Use [[SMILES: ...]] for structures. ALWAYS wrap ALL LaTeX formulas, chemical formulas (like $\\ce{H2O}$), equations, and expressions in inline math delimiters ($...$) or block math delimiters ($$...$$).`;

      const response = await apiChat({ prompt, isGenChemMode, isFreeDraw });

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
          chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
        },
        (finalText) => {
          if (finalText) {
            renderRichText(finalText, botMsgDiv, true);
            chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
          } else {
            botMsgDiv.innerText = "Sorry, I couldn't process that question.";
          }
        }
      );
    } catch (e) {
      console.error("Chat error:", e);
      botMsgDiv.innerText = "Oops, I'm having trouble connecting to the lab.";
    }
  }, [currentReaction, isGenChemMode, isFreeDraw]);

  return (
    <div id="reaction-container">
      <div id="question-instruction" ref={instructionRef}></div>
      <div id="molecule-display" ref={moleculeRef}></div>
      <div
        id="explanation-display"
        style={{ display: explanationVisible ? 'block' : 'none' }}
      >
        <div id="explanation-text-content" ref={explanationContentRef}></div>
        <div id="chat-interface">
          <div id="chat-messages" ref={chatMessagesRef}></div>
          <div className="chat-input-row">
            <input
              type="text"
              id="followup-input"
              ref={followupInputRef}
              placeholder="Still confused? Ask Gemini..."
              onKeyPress={(e) => { if (e.key === 'Enter') sendFollowupQuestion(); }}
            />
            <button id="send-followup-btn" onClick={sendFollowupQuestion}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}
