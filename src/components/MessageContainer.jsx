import { useRef, useEffect } from 'react';
import { renderRichText } from '../utils/richText';

export default function MessageContainer({
  visible,
  messageText,
  messageClassName,
  onClose,
  onRestore,
  isMinimized,
  showExplainBtn,
  onExplain,
  explainDisabled,
  explainText,
}) {
  const loadingTextRef = useRef(null);

  // Re-render rich text whenever messageText changes
  useEffect(() => {
    if (loadingTextRef.current && messageText) {
      renderRichText(messageText, loadingTextRef.current, true);
    }
  }, [messageText]);

  return (
    <>
      <div
        id="message-container"
        style={{ display: visible && !isMinimized ? 'block' : 'none' }}
      >
        <button id="message-close-btn" onClick={onClose}>&times;</button>
        <div
          id="loading-text"
          ref={loadingTextRef}
          className={messageClassName}
        >
          {/* Content rendered imperatively via renderRichText */}
        </div>
        {showExplainBtn && (
          <button
            id="freedraw-explain-btn"
            style={{ display: 'inline-block' }}
            disabled={explainDisabled}
            onClick={onExplain}
          >
            {explainText || 'Explain'}
          </button>
        )}
      </div>
      <div
        id="message-restore-btn"
        style={{ display: isMinimized ? 'flex' : 'none' }}
        onClick={onRestore}
      >
        💬
      </div>
    </>
  );
}
