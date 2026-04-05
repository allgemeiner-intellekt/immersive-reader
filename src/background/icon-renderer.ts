import { darkenHex, hexToRgb } from '@shared/accent-colors';

/**
 * Renders the Recito icon directly via Canvas 2D API (no SVG decoding needed).
 * Works in service worker contexts where createImageBitmap doesn't support SVG.
 */

const DEFAULT_COLOR = '#3b82f6';

/** Draw the Recito icon on a canvas context. All coords are in 128-unit space; caller scales. */
function drawIcon(ctx: OffscreenCanvasRenderingContext2D, size: number, color: string): void {
  const s = size / 128; // scale factor
  const darker = darkenHex(color, 0.18);

  ctx.save();
  ctx.scale(s, s);

  // --- Background rounded rect ---
  const r = 28;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(128 - r, 0);
  ctx.arcTo(128, 0, 128, r, r);
  ctx.lineTo(128, 128 - r);
  ctx.arcTo(128, 128, 128 - r, 128, r);
  ctx.lineTo(r, 128);
  ctx.arcTo(0, 128, 0, 128 - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, color);
  grad.addColorStop(1, darker);
  ctx.fillStyle = grad;
  ctx.fill();

  // --- Book (rotated -8 deg around 64, 80) ---
  ctx.save();
  ctx.translate(64, 80);
  ctx.rotate((-8 * Math.PI) / 180);
  ctx.translate(-64, -80);

  // Helper for page shapes
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Left page fill
  ctx.beginPath();
  ctx.moveTo(64, 52);
  ctx.quadraticCurveTo(42, 48, 26, 54);
  ctx.lineTo(26, 92);
  ctx.quadraticCurveTo(42, 86, 64, 90);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 4.5;
  ctx.stroke();

  // Right page fill
  ctx.beginPath();
  ctx.moveTo(64, 52);
  ctx.quadraticCurveTo(86, 48, 102, 54);
  ctx.lineTo(102, 92);
  ctx.quadraticCurveTo(86, 86, 64, 90);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 4.5;
  ctx.stroke();

  // Spine
  ctx.beginPath();
  ctx.moveTo(64, 52);
  ctx.lineTo(64, 96);
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 4.5;
  ctx.stroke();

  // Text lines (left page)
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(36, 66);
  ctx.lineTo(56, 64);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(34, 76);
  ctx.lineTo(54, 74);
  ctx.stroke();

  // Text lines (right page)
  ctx.beginPath();
  ctx.moveTo(72, 64);
  ctx.lineTo(92, 66);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(74, 74);
  ctx.lineTo(94, 76);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.restore(); // end book rotation

  // --- Sound wave arcs ---
  ctx.strokeStyle = 'white';
  ctx.lineCap = 'round';
  ctx.fillStyle = 'transparent';

  // Arc 1 (closest)
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(52, 42);
  ctx.bezierCurveTo(56, 34, 72, 34, 76, 42);
  ctx.stroke();

  // Arc 2 (middle)
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(44, 34);
  ctx.bezierCurveTo(50, 22, 78, 22, 84, 34);
  ctx.stroke();

  // Arc 3 (farthest)
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(38, 26);
  ctx.bezierCurveTo(46, 12, 82, 12, 90, 26);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.restore();
}

function renderIcon(color: string, size: number): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  drawIcon(ctx, size, color);
  return ctx.getImageData(0, 0, size, size);
}

/**
 * Update the extension icon to match the given accent color.
 * Renders at 16, 48, and 128 px.
 */
export async function updateIcon(color?: string | null): Promise<void> {
  const hex = color || DEFAULT_COLOR;
  try {
    const img16 = renderIcon(hex, 16);
    const img48 = renderIcon(hex, 48);
    const img128 = renderIcon(hex, 128);
    await chrome.action.setIcon({
      imageData: {
        16: img16,
        48: img48,
        128: img128,
      },
    });
  } catch (err) {
    console.error('Recito: failed to render icon', err);
  }
}
