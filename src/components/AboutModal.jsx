import { useState, useEffect, useRef } from 'react';

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

  // Check first visit
  useEffect(() => {
    // This is handled by parent — no auto-open here
  }, []);

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
          dangerouslySetInnerHTML={{ __html: content }}
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
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
