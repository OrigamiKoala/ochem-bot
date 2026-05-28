import { useEffect, useRef } from 'react';
import { cleanSmiles, smilesOptions } from '../utils/smiles';

// Renders a single SMILES molecule onto a canvas element
export default function MoleculeCanvas({ smiles, baseSize = 100, suffix = '', index = 0 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !smiles) return;

    const cleanedMol = cleanSmiles(smiles);
    if (!cleanedMol) return;

    const dpr = window.devicePixelRatio || 1;
    const size = baseSize * dpr;

    const options = {
      width: size,
      height: size,
      ...smilesOptions
    };
    const smilesDrawer = new window.SmilesDrawer.Drawer(options);

    canvas.style.width = baseSize + "px";
    canvas.style.height = baseSize + "px";

    window.SmilesDrawer.parse(cleanedMol, function (tree) {
      smilesDrawer.draw(tree, canvas, 'monochrome', false);
    }, function (err) {
      console.error("Smiles parsing error: ", cleanedMol, err);
      // Replace canvas with text fallback
      if (canvas.parentNode) {
        const fallback = document.createElement('span');
        fallback.innerText = smiles;
        fallback.style.fontSize = '0.8rem';
        canvas.parentNode.replaceChild(fallback, canvas);
      }
    });
  }, [smiles, baseSize]);

  return (
    <canvas
      ref={canvasRef}
      id={`canvas-${suffix}-${index}-${Date.now()}`}
    />
  );
}
