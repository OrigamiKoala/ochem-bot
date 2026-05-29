import { useState, useEffect, useRef } from 'react';

const TRANSLATIONS = {
  gotIt: 'Got it!'
};

export default function AboutModal({ visible, onClose }) {
  const [content, setContent] = useState('');
  const contentRef = useRef(null);

  useEffect(() => {
    fetch('/intro.txt')
      .then(res => {
        if (res.ok) return res.text();
        throw new Error('Failed to load');
      })
      .then(html => setContent(html))
      .catch(e => console.error("Failed to load intro.txt", e));
  }, []);

  useEffect(() => {
    if (contentRef.current && content) {
      contentRef.current.innerHTML = '';
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      while (doc.body.firstChild) {
        contentRef.current.appendChild(doc.body.firstChild);
      }
    }
  }, [content, visible]);

  if (!visible) return null;

  return (
    <div
      id="about-modal"
      className="modal"
      style={{ display: 'flex' }}
      onClick={(e) => { if (e.target.id === 'about-modal') onClose(); }}
    >
      <div className="modal-content">
        <div
          id="about-content"
          ref={contentRef}
        />
        <div className="modal-actions">
          <button
            id="close-about-btn"
            style={{
              width: '100%',
              padding: 15,
              background: '#007aff',
              color: 'white',
              border: 'none',
              borderRadius: 16,
              fontSize: '1.1rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            onClick={onClose}
          >
            {TRANSLATIONS.gotIt}
          </button>
        </div>
      </div>
    </div>
  );
}
