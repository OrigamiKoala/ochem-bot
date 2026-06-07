import { useState, useRef, useCallback, useEffect } from 'react';
import { jsonrepair } from 'jsonrepair';
import ReactionPanel from './components/ReactionPanel';
import WhiteboardPanel from './components/WhiteboardPanel';
import MessageContainer from './components/MessageContainer';
import SettingsModal, { baseTopics, genchemBaseTopics } from './components/SettingsModal';
import AboutModal from './components/AboutModal';
import { handleStream } from './utils/stream';
import { renderRichText } from './utils/richText';
import { apiGenerate, apiGrade, apiChat, apiReevaluate } from './utils/api';
import {
  migrateModeFlags,
  getQueueCacheKey,
  saveQueueToCache as saveQueueToCacheUtil,
  loadQueueFromCache as loadQueueFromCacheUtil,
  getSelectedTopicsKey,
  getCustomTopicsKey,
} from './utils/localStorage';

// Run migration on module load
migrateModeFlags();

export default function App() {
  // ---- Practice Mode State ----
  const [practiceMode, setPracticeMode] = useState(
    () => localStorage.getItem('ochem_practice_mode') || 'organic'
  );
  const isGenChemMode = practiceMode === 'all';
  const isFreeDraw = practiceMode === 'freedraw';

  const [isLearnMode, setIsLearnMode] = useState(
    () => localStorage.getItem('ochem_learn_mode') === 'true'
  );
  const [currentDifficulty, setCurrentDifficulty] = useState(
    () => parseInt(localStorage.getItem('ochem_difficulty')) || 1
  );

  // Topics
  const getActiveBaseTopics = useCallback(() => {
    return isGenChemMode ? genchemBaseTopics : baseTopics;
  }, [isGenChemMode]);

  const [userCustomTopics, setUserCustomTopics] = useState(
    () => JSON.parse(localStorage.getItem(getCustomTopicsKey(isGenChemMode))) || []
  );
  const [selectedTopics, setSelectedTopics] = useState(() => {
    const saved = JSON.parse(localStorage.getItem(getSelectedTopicsKey(isGenChemMode)));
    if (saved) return saved;
    const base = isGenChemMode ? genchemBaseTopics : baseTopics;
    const custom = JSON.parse(localStorage.getItem(getCustomTopicsKey(isGenChemMode))) || [];
    return [...base, ...custom];
  });

  // ---- Reaction State ----
  const [currentReaction, setCurrentReaction] = useState(null);
  const [reactionQueue, setReactionQueue] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchingModel, setFetchingModel] = useState('gemini-3.5-flash');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ---- UI State ----
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [lastFeedback, setLastFeedback] = useState('');
  const [isShowingAnswer, setIsShowingAnswer] = useState(false);
  const [hasUsedHint, setHasUsedHint] = useState(false);
  const [isCanvasBlank, setIsCanvasBlank] = useState(true);
  const [isEraser, setIsEraser] = useState(false);
  const [lastSubmittedImage, setLastSubmittedImage] = useState(null);

  // ---- Message Container State ----
  const [messageVisible, setMessageVisible] = useState(false);
  const [messageText, setMessageText] = useState('Loading...');
  const [messageClassName, setMessageClassName] = useState('');
  const [isMessageMinimized, setIsMessageMinimized] = useState(false);
  const [showExplainBtn, setShowExplainBtn] = useState(false);
  const [explainDisabled, setExplainDisabled] = useState(false);
  const [explainText, setExplainText] = useState('Explain');

  // ---- Modal State ----
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [showReportBtn, setShowReportBtn] = useState(false);

  // ---- Explanation Panel State ----
  const [explanationVisible, setExplanationVisible] = useState(false);
  const [hintOverride, setHintOverride] = useState(null);

  // ---- Refs ----
  const whiteboardRef = useRef(null);
  const starterQuestionsBuffer = useRef(null);
  const isInitialLoadRef = useRef(true);

  // Use refs for values needed in async callbacks to avoid stale closures
  const reactionQueueRef = useRef(reactionQueue);
  const currentReactionRef = useRef(currentReaction);
  const isFetchingRef = useRef(false);
  const isFreeDrawRef = useRef(isFreeDraw);
  const isGenChemModeRef = useRef(isGenChemMode);

  useEffect(() => { reactionQueueRef.current = reactionQueue; }, [reactionQueue]);
  useEffect(() => { currentReactionRef.current = currentReaction; }, [currentReaction]);
  useEffect(() => { isFreeDrawRef.current = isFreeDraw; }, [isFreeDraw]);
  useEffect(() => { isGenChemModeRef.current = isGenChemMode; }, [isGenChemMode]);

  // ---- Save helpers ----
  const saveQueue = useCallback((reaction, queue) => {
    saveQueueToCacheUtil(reaction, queue, isFreeDrawRef.current, isGenChemModeRef.current);
  }, []);

  // ---- Starter Questions ----
  const getStarterQuestion = useCallback(async (targetTopic, targetDifficulty) => {
    if (!starterQuestionsBuffer.current) {
      try {
        const response = await fetch('/starter.json');
        if (response.ok) {
          const data = await response.json();
          starterQuestionsBuffer.current = data.reactions || [];
        }
      } catch (e) {
        console.error("Failed to load starter.json", e);
        return null;
      }
    }

    if (!starterQuestionsBuffer.current || starterQuestionsBuffer.current.length === 0) return null;

    let difficultyKey = "beginner";
    if (targetDifficulty > 33 && targetDifficulty <= 66) difficultyKey = "intermediate";
    else if (targetDifficulty > 66) difficultyKey = "collegiate";
    const topicKey = targetTopic.replace(/\s+/g, '_');

    const matches = starterQuestionsBuffer.current.filter(q => {
      const idLower = q.id.toLowerCase();
      return idLower.startsWith(difficultyKey) && idLower.includes(`_${topicKey.toLowerCase()}_`);
    });

    if (matches.length > 0) {
      const randIdx = Math.floor(Math.random() * matches.length);
      return matches.filter((_, idx) => idx === randIdx).pop();
    }
    return null;
  }, []);

  // ---- Fetch Batch Reactions ----
  const fetchBatchReactions = useCallback(async (isExplicit = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsFetching(true);
    setFetchingModel('gemini-3.5-flash');

    const queue = reactionQueueRef.current;

    if (isExplicit && queue.length === 0) {
      setMessageText("Generating... (fetching gemini-3.5-flash)");
      setMessageClassName('');
      setMessageVisible(true);
      setIsMessageMinimized(false);
    }

    try {
      const topicIndex = Math.floor(Math.random() * selectedTopics.length);
      const topic = selectedTopics.filter((_, idx) => idx === topicIndex).pop();
      const questiontypes = ["predict product", "draw arrow mechanism", "stereochemistry focus"];
      const qtypeIndex = Math.floor(Math.random() * 3);
      const questiontype = questiontypes.filter((_, idx) => idx === qtypeIndex).pop();

      // Try starter question on very first load
      if (isInitialLoadRef.current && !currentReactionRef.current && queue.length === 0) {
        const starter = await getStarterQuestion(topic, currentDifficulty);
        isInitialLoadRef.current = false;
        if (starter) {
          console.log("Loading starter question:", starter.id);
          // Display it
          setCurrentReaction(starter);
          setReactionQueue([]);
          reactionQueueRef.current = [];
          saveQueueToCacheUtil(starter, [], isFreeDrawRef.current, isGenChemModeRef.current);
          setHasSubmitted(false);
          setLastFeedback('');
          setIsShowingAnswer(false);
          setHasUsedHint(false);
          setIsCanvasBlank(true);
          setShowReportBtn(false);
          setExplanationVisible(false);
          if (whiteboardRef.current) whiteboardRef.current.clearCanvas();
          setMessageVisible(false);
        }
      }
      isInitialLoadRef.current = false;

      const diffExplanation = "(1=beginner/introductory, 50=intermediate/USNCO level, 100=advanced/IChO level)";
      const prompt = isGenChemMode
        ? `5 chemistry olympiad questions. Topic: ${topic}. Difficulty: ${currentDifficulty}/100 ${diffExplanation}. Type: ${questiontype}. JSON only. ${currentDifficulty > 33 ? 'Allow multi-part calculations.' : ''}`
        : `5 organic chemistry questions. Topic: ${topic}. Difficulty: ${currentDifficulty}/100 ${diffExplanation}. Type: ${questiontype}. JSON only. ${currentDifficulty > 33 ? 'Allow multistep reagents.' : ''}`;

      const response = await apiGenerate({ prompt, isGenChemMode });

      if (!response.ok) {
        const errorData = await response.json();
        const errMsg = errorData.error || "";
        console.error('Gemini API Error:', response.status, errorData);

        if (isExplicit) {
          if (response.status === 503 || response.status === 500 || response.status === 429 || errMsg.toLowerCase().includes('busy') || errMsg.toLowerCase().includes('capacity')) {
            setMessageText("The bot is currently at capacity. Please try again in a moment.");
          } else {
            setMessageText("Oops. Looks like the bot messed up!");
          }
          setMessageVisible(true);
          setIsMessageMinimized(false);
        }
        return;
      }

      const modelUsed = response.headers.get('X-Model-Used') || 'gemini-3.5-flash';
      setFetchingModel(modelUsed);
      const modelLabel = modelUsed ? ` [${modelUsed}]` : '';

      if (isExplicit && response.headers.get('X-Model-Fallback')) {
        setMessageText(`Taking a bit longer — switched to a backup model...${modelLabel}`);
        setMessageVisible(true);
        setIsMessageMinimized(false);
      }

      await handleStream(
        response,
        (text) => {
          if (isExplicit) {
            setMessageText(`Generating questions... (${text.length} characters)${modelLabel}`);
          }
        },
        (finalText) => {
          if (finalText) {
            try {
              let data;
              try {
                data = JSON.parse(finalText.trim());
              } catch (parseErr) {
                console.warn("JSON parse failed, attempting jsonrepair...", parseErr.message);
                const repaired = jsonrepair(finalText.trim());
                data = JSON.parse(repaired);
                console.log("jsonrepair succeeded, recovered reactions:", (data.reactions || data).length);
              }

              // Convert placeholder tokens to LaTeX
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
                  for (const k in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, k)) {
                      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
                      Reflect.set(out, k, applyLatexTokens(Reflect.get(obj, k)));
                    }
                  }
                  return out;
                }
                return obj;
              }
              const processedData = applyLatexTokens(data);

              let reactions = [];
              if (Array.isArray(processedData)) {
                processedData.forEach(item => {
                  if (item && Array.isArray(item.reactions)) {
                    reactions = reactions.concat(item.reactions);
                  } else if (item && (item.qtype || item.reactants || item.answer || item.instructions)) {
                    reactions.push(item);
                  }
                });
              } else if (processedData && Array.isArray(processedData.reactions)) {
                reactions = processedData.reactions;
              }

              if (reactions.length > 0) {
                setCurrentReaction(current => {
                  if (!current) {
                    const next = reactions[0];
                    const rest = reactions.slice(1);
                    setReactionQueue(rest);
                    reactionQueueRef.current = rest;
                    saveQueueToCacheUtil(next, rest, isFreeDrawRef.current, isGenChemModeRef.current);
                    
                    setHasSubmitted(false);
                    setLastFeedback('');
                    setIsShowingAnswer(false);
                    setHasUsedHint(false);
                    setIsCanvasBlank(true);
                    setShowReportBtn(false);
                    setExplanationVisible(false);
                    setShowExplainBtn(false);
                    if (whiteboardRef.current) whiteboardRef.current.clearCanvas();
                    setMessageVisible(false);

                    if (rest.length <= 2) {
                      setTimeout(() => fetchBatchReactions(false), 100);
                    }
                    return next;
                  } else {
                    setReactionQueue(prev => {
                      const updated = [...prev, ...reactions];
                      reactionQueueRef.current = updated;
                      saveQueueToCacheUtil(current, updated, isFreeDrawRef.current, isGenChemModeRef.current);
                      return updated;
                    });
                    return current;
                  }
                });
              } else if (isExplicit) {
                setMessageText("No questions were generated. Please try again.");
                setMessageVisible(true);
              }
            } catch (e) {
              console.error("JSON parse error", e, finalText);
              if (isExplicit) {
                setMessageText("Error parsing response.");
                setMessageVisible(true);
                setIsMessageMinimized(false);
              }
            }
          }
        }
      );
    } catch (e) {
      console.error("Fetch error:", e);
      if (isExplicit) {
        setMessageText("Oops. Looks like the bot messed up!");
        setMessageVisible(true);
        setIsMessageMinimized(false);
      }
    } finally {
      isFetchingRef.current = false;
      setIsFetching(false);


    }
  }, [selectedTopics, currentDifficulty, isGenChemMode, isFreeDraw, getStarterQuestion]);

  // ---- Display Next Reaction ----
  const displayNextReaction = useCallback(() => {
    let queue = reactionQueueRef.current;
    if (queue.length === 0) {
      const cached = loadQueueFromCacheUtil(isFreeDraw, isGenChemMode);
      let remaining = cached;
      if (currentReactionRef.current && cached.length > 0) {
        const first = cached[0];
        const current = currentReactionRef.current;
        const isSame = (first.id && first.id === current.id) ||
                       (first.instructions === current.instructions &&
                        first.reactants === current.reactants &&
                        first.answer === current.answer);
        if (isSame) {
          remaining = cached.slice(1);
        }
      }
      if (remaining.length > 0) {
        queue = remaining;
      }
    }

    if (queue.length === 0) {
      setCurrentReaction(null);
      setHasSubmitted(false);
      setLastFeedback('');
      setIsShowingAnswer(false);
      setHasUsedHint(false);
      setIsCanvasBlank(true);
      setShowReportBtn(false);
      setExplanationVisible(false);
      setShowExplainBtn(false);
      setHintOverride(null);
      if (whiteboardRef.current) {
        whiteboardRef.current.clearCanvas();
      }
      fetchBatchReactions(true);
      return;
    }

    const nextReaction = queue[0];
    const newQueue = queue.slice(1);

    setCurrentReaction(nextReaction);
    setReactionQueue(newQueue);
    saveQueueToCacheUtil(nextReaction, newQueue, isFreeDraw, isGenChemMode);

    // Reset state for new reaction
    setHasSubmitted(false);
    setLastFeedback('');
    setIsShowingAnswer(false);
    setHasUsedHint(false);
    setIsCanvasBlank(true);
    setShowReportBtn(false);
    setExplanationVisible(false);
    setShowExplainBtn(false);
    setHintOverride(null);

    // Clear whiteboard
    if (whiteboardRef.current) {
      whiteboardRef.current.clearCanvas();
    }

    // Hide message if it was showing success/error
    setMessageVisible(false);

    // If running low, fetch more
    if (newQueue.length <= 2) {
      fetchBatchReactions(false);
    }
  }, [isFreeDraw, isGenChemMode, fetchBatchReactions]);

  // ---- Button State ----
  const getGenerateBtnText = useCallback(() => {
    if (isFreeDraw) return 'Clear';
    if (!currentReaction || isShowingAnswer) return 'New';
    if (!hasUsedHint) return 'Hint';
    return 'Give Up';
  }, [isFreeDraw, currentReaction, isShowingAnswer, hasUsedHint]);

  // ---- Generate Button Handler ----
  const handleGenerate = useCallback(() => {
    if (isFreeDraw) {
      // Clear whiteboard
      if (whiteboardRef.current) whiteboardRef.current.clearCanvas();
      setIsCanvasBlank(true);
      setHasSubmitted(false);
      setLastFeedback('');
      setIsShowingAnswer(false);
      setMessageVisible(false);
      setExplanationVisible(false);
      setShowExplainBtn(false);
      setLastSubmittedImage(null);
    } else if (!currentReaction || isShowingAnswer) {
      displayNextReaction();
    } else if (!hasUsedHint) {
      // Hint
      setHasUsedHint(true);
      const hintText = currentReaction.hint || 'No hint available for this question.';
      setHintOverride(hintText);
      setExplanationVisible(true);
    } else {
      // Give Up
      setIsShowingAnswer(true);
      if (hasSubmitted && lastFeedback) {
        setMessageText(lastFeedback);
        setMessageVisible(true);
        setIsMessageMinimized(false);
      } else {
        setMessageVisible(false);
      }
      setExplanationVisible(true);
      setShowReportBtn(false);
    }
  }, [isFreeDraw, currentReaction, isShowingAnswer, hasUsedHint, hasSubmitted, lastFeedback, displayNextReaction]);

  // ---- Submit Drawing ----
  const handleSubmit = useCallback(async () => {
    if ((!currentReaction && !isFreeDraw) || isSubmitting) return;

    setMessageText("Checking...");
    setMessageClassName('');
    setMessageVisible(true);
    setIsMessageMinimized(false);
    setIsSubmitting(true);

    try {
      const base64Image = await whiteboardRef.current?.getOptimizedImage();
      if (!base64Image) return;

      if (isFreeDraw) setLastSubmittedImage(base64Image);

      const prompt = isFreeDraw
        ? `The student has drawn a chemistry mechanism on a whiteboard. There is no specific question — the student chose to draw this freely. Please evaluate the mechanism drawing for chemical plausibility, correctness of arrow-pushing notation, proper formal charges, and reasonable intermediates/products. Identify the reaction type if you recognize it.`
        : `Task: ${currentReaction.qtype} | ${currentReaction.instructions || 'Predict the major product'}
Reaction: ${currentReaction.reactants} + [${currentReaction.reagents || ''}] / [${currentReaction.conditions || ''}]
Answer: ${currentReaction.answer}`;

      const response = await apiGrade({ prompt, image: base64Image, isLearnMode, isFreeDraw, isGenChemMode });

      if (!response.ok) {
        const errorData = await response.json();
        const errMsg = errorData.error || "";
        console.error('Submission Gemini API Error:', response.status, errorData);

        if (response.status === 503 || response.status === 429 || errMsg.toLowerCase().includes('busy') || errMsg.toLowerCase().includes('capacity')) {
          setMessageText("The bot is currently at capacity. Please try again in a moment.");
        } else {
          setMessageText("Oops. Looks like the bot messed up!");
        }
        setMessageClassName("error-text");
        setMessageVisible(true);
        setIsMessageMinimized(false);
        return;
      }

      if (response.headers.get('X-Model-Fallback')) {
        setMessageText("Taking a bit longer — switched to a backup model...");
      }

      await handleStream(
        response,
        (text) => {
          setMessageText(text);
        },
        (finalText) => {
          if (finalText) {
            setMessageText(finalText);
            setLastFeedback(finalText);
            setHasSubmitted(true);

            if (finalText.toLowerCase().trim().startsWith('correct') || (isFreeDraw && finalText.toLowerCase().trim().startsWith('plausible'))) {
              setMessageClassName("success-text");
              setIsShowingAnswer(true);
              setShowReportBtn(false);
              setShowExplainBtn(false);

              if (!isFreeDraw) {
                // Remove correct question from cache
                localStorage.setItem(
                  getQueueCacheKey(isFreeDraw, isGenChemMode),
                  JSON.stringify(reactionQueueRef.current)
                );
                setExplanationVisible(true);
              }
            } else {
              setMessageClassName("error-text");
              if (!isFreeDraw) {
                setShowReportBtn(true);
              }
              if (isFreeDraw) {
                setShowExplainBtn(true);
              }
              setMessageVisible(true);
              setIsMessageMinimized(false);
            }
          }
        }
      );
    } catch (e) {
      console.error("Submission error:", e);
      setMessageText("Oops. Looks like the bot messed up!");
      setMessageClassName("error-text");
    } finally {
      setIsSubmitting(false);
    }
  }, [currentReaction, isFreeDraw, isSubmitting, isLearnMode, isGenChemMode]);

  // ---- Re-evaluate (I was right) ----
  const handleReport = useCallback(async () => {
    if (!currentReaction || isSubmitting) return;

    setMessageText("Re-evaluating...");
    setMessageClassName('');
    setMessageVisible(true);
    setIsMessageMinimized(false);
    setIsSubmitting(true);

    try {
      const base64Image = await whiteboardRef.current?.getOptimizedImage();

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

      const response = await apiReevaluate({ prompt, image: base64Image, isGenChemMode, isLearnMode });

      if (!response.ok) throw new Error("API error");

      await handleStream(
        response,
        (text) => {
          setMessageText(text);
        },
        (finalText) => {
          if (finalText) {
            const feedback = finalText.trim();
            setMessageText(feedback);
            setLastFeedback(feedback);

            if (feedback.toLowerCase().startsWith('correct')) {
              setMessageClassName("success-text");
              setIsShowingAnswer(true);
              localStorage.setItem(
                getQueueCacheKey(isFreeDraw, isGenChemMode),
                JSON.stringify(reactionQueueRef.current)
              );
              setExplanationVisible(true);
            } else {
              setMessageClassName("error-text");
            }
          }
        }
      );
    } catch (e) {
      console.error("Re-evaluation error:", e);
      setMessageText("Error re-evaluating.");
    } finally {
      setIsSubmitting(false);
      setShowReportBtn(false);
    }
  }, [currentReaction, isSubmitting, lastFeedback, isGenChemMode, isFreeDraw, isLearnMode]);

  // ---- Free Draw Explain ----
  const handleExplain = useCallback(async () => {
    if (!lastSubmittedImage || !lastFeedback || isSubmitting) return;

    setExplainDisabled(true);
    setExplainText('Explaining...');
    setExplanationVisible(true);

    try {
      const prompt = `The student drew a chemistry mechanism on a whiteboard (image attached). Your previous evaluation was:\n\n"${lastFeedback}"\n\nNow provide a detailed explanation of WHY this mechanism is chemically implausible or incorrect. Specifically:\n1. Identify what reaction the student appears to be attempting\n2. Point out each specific error in the arrow-pushing, electron flow, or products\n3. Explain the correct mechanism or approach\n4. Use [[SMILES: ...]] for any molecular structures you reference\n\nBe thorough, educational, and encouraging.`;

      const response = await apiChat({ prompt, image: lastSubmittedImage, isGenChemMode, isFreeDraw });

      if (!response.ok) {
        const errorData = await response.json();
        const errMsg = errorData.error || '';
        if (response.status === 503 || response.status === 429 || errMsg.toLowerCase().includes('busy') || errMsg.toLowerCase().includes('capacity')) {
          // Will be shown in explanation panel — handled by ReactionPanel
        }
        return;
      }

      // The explanation is rendered into the explanation panel by ReactionPanel
      // We need to get a ref to the explanation content div
      // For now, we'll update the currentReaction's explanation
      await handleStream(
        response,
        () => {},
        (finalText) => {
          if (finalText) {
            // Update the current reaction's explanation to show in the panel
            setCurrentReaction(prev => prev ? { ...prev, explanation: finalText } : prev);
          }
        }
      );
    } catch (e) {
      console.error('Free Draw explain error:', e);
    } finally {
      setShowExplainBtn(false);
      setExplainDisabled(false);
      setExplainText('Explain');
    }
  }, [lastSubmittedImage, lastFeedback, isSubmitting, isGenChemMode, isFreeDraw]);

  // ---- Clear Whiteboard ----
  const handleClear = useCallback(() => {
    if (!isCanvasBlank && !confirm('Are you sure? This will clear your drawing.')) return;
    if (whiteboardRef.current) whiteboardRef.current.clearCanvas();
    setIsCanvasBlank(true);
  }, [isCanvasBlank]);

  // ---- Settings Save ----
  const handleSettingsSave = useCallback((settings) => {
    // Save current queue to OLD mode's cache before switching
    const oldCacheKey = getQueueCacheKey(isFreeDraw, isGenChemMode);
    const queueToSave = currentReaction
      ? [currentReaction, ...reactionQueueRef.current]
      : [...reactionQueueRef.current];
    try { localStorage.setItem(oldCacheKey, JSON.stringify(queueToSave)); } catch(e) {}

    const prevPracticeMode = practiceMode;
    const modeChanged = prevPracticeMode !== settings.practiceMode;

    // Commit settings
    setPracticeMode(settings.practiceMode);
    localStorage.setItem('ochem_practice_mode', settings.practiceMode);

    setCurrentDifficulty(settings.difficulty);
    localStorage.setItem('ochem_difficulty', settings.difficulty);

    setIsLearnMode(settings.learnMode);
    localStorage.setItem('ochem_learn_mode', settings.learnMode);

    const newIsGenChem = settings.practiceMode === 'all';
    const newIsFreeDraw = settings.practiceMode === 'freedraw';

    if (!newIsFreeDraw) {
      setSelectedTopics(settings.selectedTopics);
      localStorage.setItem(
        getSelectedTopicsKey(newIsGenChem),
        JSON.stringify(settings.selectedTopics)
      );
      setUserCustomTopics(settings.customTopics);
      localStorage.setItem(
        getCustomTopicsKey(newIsGenChem),
        JSON.stringify(settings.customTopics)
      );
    }

    setSettingsVisible(false);

    // Detect if anything actually changed
    const changed = modeChanged ||
      settings.difficulty !== currentDifficulty ||
      settings.learnMode !== isLearnMode ||
      JSON.stringify(settings.selectedTopics.sort()) !== JSON.stringify(selectedTopics.sort());

    if (changed) {
      if (modeChanged) {
        // Load queue from new mode's cache
        const newQueue = loadQueueFromCacheUtil(newIsFreeDraw, newIsGenChem);
        setReactionQueue(newQueue);
        reactionQueueRef.current = newQueue;
        setCurrentReaction(null);
        currentReactionRef.current = null;

        if (newIsFreeDraw) {
          // Enter free draw mode
          setCurrentReaction(null);
          setHasSubmitted(false);
          setLastFeedback('');
          setIsShowingAnswer(false);
          setLastSubmittedImage(null);
          setShowExplainBtn(false);
          setExplanationVisible(false);
          setMessageVisible(false);
          setIsCanvasBlank(true);
          if (whiteboardRef.current) whiteboardRef.current.clearCanvas();
        } else if (newQueue.length > 0) {
          // Display from new mode's cache
          const next = newQueue[0];
          const rest = newQueue.slice(1);
          setCurrentReaction(next);
          setReactionQueue(rest);
          reactionQueueRef.current = rest;
          setHasSubmitted(false);
          setLastFeedback('');
          setIsShowingAnswer(false);
          setHasUsedHint(false);
          setIsCanvasBlank(true);
          setShowReportBtn(false);
          setExplanationVisible(false);
          if (whiteboardRef.current) whiteboardRef.current.clearCanvas();
          setMessageVisible(false);
          if (rest.length <= 2) {
            setTimeout(() => fetchBatchReactions(false), 0);
          }
        } else {
          setCurrentReaction(null);
          setReactionQueue([]);
          reactionQueueRef.current = [];
          setHasSubmitted(false);
          setLastFeedback('');
          setIsShowingAnswer(false);
          setIsCanvasBlank(true);
          setExplanationVisible(false);
          if (whiteboardRef.current) whiteboardRef.current.clearCanvas();
          setTimeout(() => fetchBatchReactions(true), 0);
        }
      } else {
        // Same mode, settings changed — reset and refetch
        setCurrentReaction(null);
        currentReactionRef.current = null;
        setReactionQueue([]);
        reactionQueueRef.current = [];
        saveQueueToCacheUtil(null, [], newIsFreeDraw, newIsGenChem);
        setHasSubmitted(false);
        setLastFeedback('');
        setIsShowingAnswer(false);
        setIsCanvasBlank(true);
        setExplanationVisible(false);
        if (whiteboardRef.current) whiteboardRef.current.clearCanvas();
        if (!newIsFreeDraw) {
          setTimeout(() => fetchBatchReactions(true), 0);
        }
      }
    }
  }, [practiceMode, currentDifficulty, isLearnMode, selectedTopics, isFreeDraw, isGenChemMode, currentReaction, fetchBatchReactions]);

  // ---- First Visit ----
  useEffect(() => {
    const hasVisited = localStorage.getItem('ochem_visited');
    if (!hasVisited) {
      setAboutVisible(true);
      localStorage.setItem('ochem_visited', 'true');
    }
  }, []);

  // ---- Initial Load ----
  useEffect(() => {
    if (isFreeDraw) {
      // Enter free draw mode
      setCurrentReaction(null);
      setHasSubmitted(false);
      setLastFeedback('');
      setIsShowingAnswer(false);
      setLastSubmittedImage(null);
      setShowExplainBtn(false);
      setExplanationVisible(false);
      setMessageVisible(false);
      setIsCanvasBlank(true);
    } else {
      const cachedQueue = loadQueueFromCacheUtil(isFreeDraw, isGenChemMode);
      if (cachedQueue.length > 0) {
        const next = cachedQueue[0];
        const rest = cachedQueue.slice(1);
        setCurrentReaction(next);
        currentReactionRef.current = next;
        setReactionQueue(rest);
        reactionQueueRef.current = rest;
        isInitialLoadRef.current = false;
        if (rest.length <= 2) {
          setTimeout(() => fetchBatchReactions(false), 100);
        }
      } else {
        setTimeout(() => fetchBatchReactions(true), 100);
      }
    }
  }, []); // Run once on mount

  return (
    <>
      <div id="app">
        <ReactionPanel
          currentReaction={currentReaction}
          isShowingAnswer={isShowingAnswer}
          isGenChemMode={isGenChemMode}
          isFreeDraw={isFreeDraw}
          lastFeedback={lastFeedback}
          explanationVisible={explanationVisible}
          hintOverride={hintOverride}
        />
        <WhiteboardPanel
          ref={whiteboardRef}
          isFreeDraw={isFreeDraw}
          isEraser={isEraser}
          onEraserToggle={() => setIsEraser(prev => !prev)}
          onCanvasBlankChange={setIsCanvasBlank}
          isSubmitting={isSubmitting}
          isCanvasBlank={isCanvasBlank}
          generateBtnText={getGenerateBtnText()}
          onGenerate={handleGenerate}
          onSubmit={handleSubmit}
          onClear={handleClear}
          onReport={handleReport}
          onSettings={() => setSettingsVisible(true)}
          onAbout={() => setAboutVisible(true)}
          showReportBtn={showReportBtn}
        />
      </div>

      <MessageContainer
        visible={messageVisible}
        messageText={messageText}
        messageClassName={messageClassName}
        onClose={() => { setMessageVisible(true); setIsMessageMinimized(true); }}
        onRestore={() => { setIsMessageMinimized(false); }}
        isMinimized={isMessageMinimized}
        showExplainBtn={showExplainBtn}
        onExplain={handleExplain}
        explainDisabled={explainDisabled}
        explainText={explainText}
      />

      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        practiceMode={practiceMode}
        isGenChemMode={isGenChemMode}
        isFreeDraw={isFreeDraw}
        isLearnMode={isLearnMode}
        currentDifficulty={currentDifficulty}
        selectedTopics={selectedTopics}
        userCustomTopics={userCustomTopics}
        onSave={handleSettingsSave}
      />

      <AboutModal
        visible={aboutVisible}
        onClose={() => setAboutVisible(false)}
      />
    </>
  );
}
