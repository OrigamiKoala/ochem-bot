import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';

const WORKSPACE_HEIGHT_MULTIPLIER = 3;

const WhiteboardPanel = forwardRef(function WhiteboardPanel({
  isFreeDraw,
  isEraser,
  onEraserToggle,
  onCanvasBlankChange,
  isSubmitting,
  isCanvasBlank,
  // Toolbar
  generateBtnText,
  onGenerate,
  onSubmit,
  onClear,
  onReport,
  onSettings,
  onAbout,
  showReportBtn,
}, ref) {
  const fabricCanvasRef = useRef(null);
  const containerRef = useRef(null);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    getOptimizedImage: async () => {
      const fc = fabricCanvasRef.current;
      if (!fc) return null;
      const originalBg = fc.backgroundColor;
      fc.backgroundColor = 'white';
      const dataUrl = fc.toDataURL({
        format: 'jpeg',
        quality: 0.7,
        multiplier: 0.5
      });
      fc.backgroundColor = originalBg;
      return dataUrl.split(',')[1];
    },
    clearCanvas: () => {
      const fc = fabricCanvasRef.current;
      if (!fc) return;
      fc.clear();
      fc.backgroundColor = 'transparent';
      onCanvasBlankChange(true);
    },
    getFabricCanvas: () => fabricCanvasRef.current,
  }));

  // Initialize Fabric.js canvas
  useEffect(() => {
    const fc = new window.fabric.Canvas('whiteboard', {
      isDrawingMode: true,
      backgroundColor: 'transparent',
      selection: false,
    });

    fc.freeDrawingBrush = new window.fabric.PencilBrush(fc);
    fc.freeDrawingBrush.color = '#2c3e50';
    fc.freeDrawingBrush.width = 3;
    fc.freeDrawingBrush.strokeLineCap = 'round';
    fc.freeDrawingBrush.strokeLineJoin = 'round';

    fabricCanvasRef.current = fc;

    // Track drawing state
    fc.on('path:created', function () {
      onCanvasBlankChange(false);
    });

    // Resize handler
    function resizeCanvas() {
      const container = containerRef.current;
      if (!container) return;
      const width = container.clientWidth;
      const visibleHeight = container.clientHeight;
      const workspaceHeight = visibleHeight * WORKSPACE_HEIGHT_MULTIPLIER;

      fc.setWidth(width);
      fc.setHeight(workspaceHeight);
      fc.renderAll();

      fc._visibleHeight = visibleHeight;
      fc._workspaceHeight = workspaceHeight;
    }

    window.addEventListener('resize', resizeCanvas);
    setTimeout(resizeCanvas, 0);

    // Clamp viewport transform
    function clampViewport() {
      const vpt = fc.viewportTransform;
      const visH = fc._visibleHeight || fc.getHeight();
      const wsH = fc._workspaceHeight || fc.getHeight();
      const maxPanY = 0;
      const minPanY = -(wsH - visH);

      if (vpt[5] > maxPanY) vpt[5] = maxPanY;
      if (vpt[5] < minPanY) vpt[5] = minPanY;
      vpt[4] = 0;
    }

    // Two-finger pan / one-finger draw
    let _isPanning = false;
    let _lastPanY = 0;

    const upperCanvas = fc.upperCanvasEl || fc.wrapperEl;

    function onTouchStart(e) {
      if (e.touches.length >= 2) {
        _isPanning = true;
        fc.isDrawingMode = false;
        _lastPanY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        e.preventDefault();
      }
    }

    function onTouchMove(e) {
      if (_isPanning && e.touches.length >= 2) {
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const deltaY = midY - _lastPanY;
        _lastPanY = midY;

        const vpt = fc.viewportTransform;
        vpt[5] += deltaY;
        clampViewport();
        fc.setViewportTransform(vpt);
        fc.requestRenderAll();
        e.preventDefault();
      }
    }

    function onTouchEnd(e) {
      if (_isPanning && e.touches.length < 2) {
        _isPanning = false;
        fc.isDrawingMode = true;
      }
    }

    upperCanvas.addEventListener('touchstart', onTouchStart, { passive: false });
    upperCanvas.addEventListener('touchmove', onTouchMove, { passive: false });
    upperCanvas.addEventListener('touchend', onTouchEnd);

    // Mouse wheel scrolling
    const wbContainer = containerRef.current;
    function onWheel(e) {
      e.preventDefault();
      const vpt = fc.viewportTransform;
      vpt[5] -= e.deltaY;
      clampViewport();
      fc.setViewportTransform(vpt);
      fc.requestRenderAll();
    }
    if (wbContainer) {
      wbContainer.addEventListener('wheel', onWheel, { passive: false });
    }

    // Prevent pull-to-refresh on body
    function onBodyTouchMove(e) {
      if (e.target.closest('#about-content') || e.target.closest('#topics-list') ||
        e.target.closest('#explanation-display') || e.target.closest('#molecule-display') ||
        e.target.closest('#reaction-container') || e.target.closest('.modal-content') ||
        e.target.closest('#toolbar') || e.target.closest('#settings-modal')) {
        return;
      }
      e.preventDefault();
    }
    document.body.addEventListener('touchmove', onBodyTouchMove, { passive: false });

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      upperCanvas.removeEventListener('touchstart', onTouchStart);
      upperCanvas.removeEventListener('touchmove', onTouchMove);
      upperCanvas.removeEventListener('touchend', onTouchEnd);
      if (wbContainer) wbContainer.removeEventListener('wheel', onWheel);
      document.body.removeEventListener('touchmove', onBodyTouchMove);
      fc.dispose();
    };
  }, []); // Run once on mount

  // Update eraser/pen brush when isEraser changes
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    if (isEraser) {
      fc.freeDrawingBrush = new window.fabric.PencilBrush(fc);
      fc.freeDrawingBrush.color = '#fafafa';
      fc.freeDrawingBrush.width = 20;
      fc.freeDrawingBrush.strokeLineCap = 'round';
      fc.freeDrawingBrush.strokeLineJoin = 'round';
    } else {
      fc.freeDrawingBrush = new window.fabric.PencilBrush(fc);
      fc.freeDrawingBrush.color = '#2c3e50';
      fc.freeDrawingBrush.width = 3;
      fc.freeDrawingBrush.strokeLineCap = 'round';
      fc.freeDrawingBrush.strokeLineJoin = 'round';
    }
  }, [isEraser]);

  const submitDisabled = isCanvasBlank || isSubmitting;

  return (
    <div id="whiteboard-container" ref={containerRef}>
      <div id="toolbar">
        <button type="button" id="about-btn" onClick={onAbout}>About</button>
        <button type="button" id="generate-btn" onClick={onGenerate}>{generateBtnText}</button>
        <button
          type="button"
          id="submit-btn"
          style={{
            backgroundColor: '#34c759',
            opacity: submitDisabled ? 0.5 : 1,
            cursor: submitDisabled ? 'not-allowed' : 'pointer'
          }}
          disabled={submitDisabled}
          onClick={onSubmit}
        >
          Submit
        </button>
        <button
          type="button"
          id="eraser-btn"
          style={{ backgroundColor: '#ff3b30' }}
          className={isEraser ? 'active-tool' : ''}
          onClick={onEraserToggle}
        >
          {isEraser ? 'Pen' : 'Eraser'}
        </button>
        {!isFreeDraw && (
          <button type="button" id="clear-btn" onClick={onClear}>Clear</button>
        )}
        {showReportBtn && !isFreeDraw && (
          <button
            type="button"
            id="report-btn"
            style={{ backgroundColor: '#8e8e93' }}
            onClick={onReport}
          >
            I was right
          </button>
        )}
        <button
          type="button"
          id="settings-btn"
          style={{ backgroundColor: '#5856d6' }}
          onClick={onSettings}
        >
          Settings
        </button>
      </div>
      <canvas id="whiteboard"></canvas>
    </div>
  );
});

export default WhiteboardPanel;
