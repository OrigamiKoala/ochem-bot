// ------ Safe MathJax Typesetting ------
// MathJax loads asynchronously and may not be ready on slow connections.
// This helper queues elements and typesets them once MathJax is available.

const _mathJaxQueue = [];
let _mathJaxReady = false;

export function safeTypeset(element) {
  if (_mathJaxReady && window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise([element]).catch(err => console.error('MathJax error:', err));
  } else {
    _mathJaxQueue.push(element);
  }
}

// Wait for MathJax to finish loading, then flush the queue
function initMathJaxReadyHook() {
  if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
    window.MathJax.startup.promise.then(() => {
      _mathJaxReady = true;
      while (_mathJaxQueue.length > 0) {
        const el = _mathJaxQueue.shift();
        if (document.body.contains(el)) {
          window.MathJax.typesetPromise([el]).catch(err => console.error('MathJax error:', err));
        }
      }
    });
  } else {
    setTimeout(initMathJaxReadyHook, 200);
  }
}

// Initialize immediately on module load
initMathJaxReadyHook();
