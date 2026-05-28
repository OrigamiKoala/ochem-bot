import { useState, useEffect, useRef } from 'react';

const baseTopics = ["addition", "substitution", "elimination", "on rings", "Grignard", "redox", "protecting groups", "cycloadditions", "electrocyclic", "rearrangements", "radicals", "carbenes", "stereochemistry", "regioselectivity"];
const genchemBaseTopics = ["stoichiometry", "thermodynamics", "kinetics", "equilibrium", "acid-base", "electrochemistry", "atomic structure", "bonding & VSEPR", "solutions & colligative", "gas laws", "nuclear chemistry", "coordination chemistry", "descriptive inorganic", "organic reactions"];

export { baseTopics, genchemBaseTopics };

export default function SettingsModal({
  visible,
  onClose,
  practiceMode,
  isGenChemMode,
  isFreeDraw,
  isLearnMode,
  currentDifficulty,
  selectedTopics,
  userCustomTopics,
  onSave,
}) {
  // Local state for editing (committed on Save)
  const [localPracticeMode, setLocalPracticeMode] = useState(practiceMode);
  const [localDifficulty, setLocalDifficulty] = useState(currentDifficulty);
  const [localLearnMode, setLocalLearnMode] = useState(isLearnMode);
  const [localCustomTopics, setLocalCustomTopics] = useState([...userCustomTopics]);
  const [localSelectedTopics, setLocalSelectedTopics] = useState([...selectedTopics]);
  const customInputRef = useRef(null);

  // Reset local state when modal opens
  useEffect(() => {
    if (visible) {
      setLocalPracticeMode(practiceMode);
      setLocalDifficulty(currentDifficulty);
      setLocalLearnMode(isLearnMode);
      setLocalCustomTopics([...userCustomTopics]);
      setLocalSelectedTopics([...selectedTopics]);
    }
  }, [visible, practiceMode, currentDifficulty, isLearnMode, userCustomTopics, selectedTopics]);

  const localIsGenChem = localPracticeMode === 'all';
  const localIsFreeDraw = localPracticeMode === 'freedraw';

  function getActiveBaseTopics() {
    return localIsGenChem ? genchemBaseTopics : baseTopics;
  }

  const allAvailableTopics = [...getActiveBaseTopics(), ...localCustomTopics];

  function handleTopicToggle(topic) {
    setLocalSelectedTopics(prev =>
      prev.includes(topic)
        ? prev.filter(t => t !== topic)
        : [...prev, topic]
    );
  }

  function handleAddCustomTopic() {
    const input = customInputRef.current;
    if (!input) return;
    const newTopic = input.value.trim().toLowerCase();
    if (!newTopic) return;
    if (getActiveBaseTopics().includes(newTopic) || localCustomTopics.includes(newTopic)) {
      alert("Topic already exists!");
      return;
    }
    setLocalCustomTopics(prev => [...prev, newTopic]);
    setLocalSelectedTopics(prev => [...prev, newTopic]);
    input.value = '';
  }

  function handleRemoveCustomTopic(topic) {
    setLocalCustomTopics(prev => prev.filter(t => t !== topic));
    setLocalSelectedTopics(prev => prev.filter(t => t !== topic));
  }

  function handlePracticeModeChange(val) {
    setLocalPracticeMode(val);
    // When switching modes, reload that mode's topics
    const newIsGenChem = val === 'all';
    const customKey = newIsGenChem ? 'genchem_custom_topics' : 'ochem_custom_topics';
    const selectedKey = newIsGenChem ? 'genchem_selected_topics' : 'ochem_selected_topics';
    const newBase = newIsGenChem ? genchemBaseTopics : baseTopics;
    const newCustom = JSON.parse(localStorage.getItem(customKey)) || [];
    const newSelected = JSON.parse(localStorage.getItem(selectedKey)) || [...newBase, ...newCustom];
    setLocalCustomTopics(newCustom);
    setLocalSelectedTopics(newSelected);
  }

  function handleSave() {
    let finalSelectedTopics = localSelectedTopics;
    if (!localIsFreeDraw && finalSelectedTopics.length === 0) {
      finalSelectedTopics = [...getActiveBaseTopics(), ...localCustomTopics];
    }

    onSave({
      practiceMode: localPracticeMode,
      difficulty: localDifficulty,
      learnMode: localLearnMode,
      selectedTopics: finalSelectedTopics,
      customTopics: localCustomTopics,
    });
  }

  if (!visible) return null;

  return (
    <div
      id="settings-modal"
      className="modal"
      style={{ display: 'flex' }}
      onClick={(e) => { if (e.target.id === 'settings-modal') onClose(); }}
    >
      <div className="modal-content">
        <h2>Practice Settings</h2>

        {!localIsFreeDraw && (
          <div id="settings-difficulty-container">
            <h3>Practice Difficulty</h3>
            <div className="difficulty-slider-row">
              <input
                type="range"
                id="difficulty-slider"
                min="1"
                max="100"
                value={localDifficulty}
                onChange={(e) => setLocalDifficulty(parseInt(e.target.value))}
              />
              <div className="difficulty-labels">
                <span>Beginner</span>
                <span>USNCO</span>
                <span>IChO/Collegiate</span>
              </div>
            </div>
          </div>
        )}

        <div id="settings-mode-container" style={{ marginTop: 20 }}>
          <div className="mode-row">
            <div className="mode-info">
              <h3>Practice Mode</h3>
              <p style={{ fontSize: '0.85rem', color: '#8e8e93', margin: 0 }}>
                Choose which type of practice questions to generate.
              </p>
            </div>
            <select
              id="practice-mode-select"
              value={localPracticeMode}
              onChange={(e) => handlePracticeModeChange(e.target.value)}
            >
              <option value="organic">🧪 Organic</option>
              <option value="all">🔬 All Chemistry</option>
              <option value="freedraw">🎨 Free Draw</option>
            </select>
          </div>
          <div className="mode-row">
            <div className="mode-info">
              <h3>Learn Mode</h3>
              <p style={{ fontSize: '0.85rem', color: '#8e8e93', margin: 0 }}>
                AI acts as a tutor, explaining chemical principles and providing guided feedback.
              </p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                id="learn-mode-toggle"
                checked={localLearnMode}
                onChange={(e) => setLocalLearnMode(e.target.checked)}
              />
              <span className="slider round"></span>
            </label>
          </div>
        </div>

        {!localIsFreeDraw && (
          <>
            <p>Select reaction types to focus on:</p>
            <div id="topics-list">
              {allAvailableTopics.map(topic => {
                const isCustom = localCustomTopics.includes(topic);
                const isChecked = localSelectedTopics.includes(topic);
                return (
                  <div
                    key={topic}
                    className="topic-item"
                    onClick={(e) => {
                      if (e.target.className === 'remove-topic-btn') return;
                      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL') {
                        handleTopicToggle(topic);
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      id={`topic-${topic.replace(/\s+/g, '-')}`}
                      value={topic}
                      checked={isChecked}
                      onChange={() => handleTopicToggle(topic)}
                    />
                    <label htmlFor={`topic-${topic.replace(/\s+/g, '-')}`}>
                      {topic.charAt(0).toUpperCase() + topic.slice(1)}
                    </label>
                    {isCustom && (
                      <button
                        className="remove-topic-btn"
                        data-topic={topic}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveCustomTopic(topic);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div id="custom-topic-container">
              <h3>Add Custom Topic</h3>
              <div className="custom-topic-input-row">
                <input
                  type="text"
                  id="custom-topic-input"
                  ref={customInputRef}
                  placeholder="e.g., Peptides, Alkaloids..."
                />
                <button id="add-custom-topic-btn" onClick={handleAddCustomTopic}>Add</button>
              </div>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button id="save-settings-btn" onClick={handleSave}>Save &amp; Close</button>
        </div>
      </div>
    </div>
  );
}
