/**
 * svglib - A robust utility for parsing and rendering SVG code securely in the DOM.
 */

export function renderSVG(svgString, container) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = doc.documentElement;
    
    // Validate that it parsed correctly and is an SVG element
    if (svgElement && svgElement.tagName.toLowerCase() === 'svg') {
      svgElement.style.maxWidth = '100%';
      svgElement.style.height = 'auto';
      svgElement.style.display = 'block';
      svgElement.style.margin = '15px auto';
      svgElement.style.backgroundColor = 'transparent';
      
      // Clear container and append the SVG element
      container.appendChild(svgElement);
      return true;
    }
  } catch (e) {
    console.error('Error rendering SVG with svglib:', e);
  }
  return false;
}
