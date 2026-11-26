import {
  LOGO_DATA_URL_PATTERN,
  RECEIPT_LIMITS,
  type ReceiptLogoPreset,
} from '../types/inventory';

const TARGET_DATA_URL_MAX = RECEIPT_LIMITS.LOGO_DATA_URL_MAX - 2000;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Şəkil oxuna bilmədi.'));
    img.src = src;
  });
}

export async function loadReceiptLogoImage(
  src: string
): Promise<HTMLImageElement | null> {
  const trimmed = src.trim();
  if (!trimmed || !LOGO_DATA_URL_PATTERN.test(trimmed)) {
    return null;
  }
  try {
    return await loadImageElement(trimmed);
  } catch {
    return null;
  }
}

/**
 * Resizes and compresses a user-selected image file on a white background so it
 * prints cleanly on 58mm/80mm thermal paper and fits comfortably within Firestore limits.
 */
export async function compressReceiptLogoFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Zəhmət olmasa yalnız şəkil faylı (PNG, JPG, WebP) seçin.');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('Seçilən şəkil çox böyükdür (maksimum 12 MB).');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const srcW = Math.max(1, img.naturalWidth || img.width);
    const srcH = Math.max(1, img.naturalHeight || img.height);

    const drawScaled = (maxW: number, maxH: number): HTMLCanvasElement => {
      const ratio = Math.min(1, maxW / srcW, maxH / srcH);
      const w = Math.max(24, Math.round(srcW * ratio));
      const h = Math.max(24, Math.round(srcH * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Şəkil emalı üçün qrafik kontekst yaradıla bilmədi.');
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return canvas;
    };

    const dimensions: Array<[number, number]> = [
      [240, 104],
      [180, 84],
      [140, 64],
    ];

    for (const [maxW, maxH] of dimensions) {
      const canvas = drawScaled(maxW, maxH);
      const pngUrl = canvas.toDataURL('image/png');
      if (
        pngUrl.length <= TARGET_DATA_URL_MAX &&
        LOGO_DATA_URL_PATTERN.test(pngUrl)
      ) {
        return pngUrl;
      }

      for (const quality of [0.85, 0.72, 0.58]) {
        const webpUrl = canvas.toDataURL('image/webp', quality);
        if (
          webpUrl.length <= TARGET_DATA_URL_MAX &&
          LOGO_DATA_URL_PATTERN.test(webpUrl)
        ) {
          return webpUrl;
        }
        const jpgUrl = canvas.toDataURL('image/jpeg', quality);
        if (
          jpgUrl.length <= TARGET_DATA_URL_MAX &&
          LOGO_DATA_URL_PATTERN.test(jpgUrl)
        ) {
          return jpgUrl;
        }
      }
    }

    throw new Error('Şəkil ölçüsü sıxışdırıla bilmədi. Daha sadə və ya kiçik loqo seçin.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Draws crisp vector preset logos onto the thermal receipt canvas so PNG and ESC/POS
 * exports match the HTML receipt preview.
 */
export function drawReceiptPresetLogoOnCanvas(
  ctx: CanvasRenderingContext2D,
  preset: ReceiptLogoPreset,
  centerX: number,
  topY: number,
  boxSize: number,
  foreground = '#000000',
  background = '#FFFFFF'
): number {
  if (preset === 'none') return topY;

  const left = centerX - boxSize / 2;
  const radius = Math.round(boxSize * 0.22);

  ctx.save();
  ctx.fillStyle = background;
  ctx.strokeStyle = foreground;
  ctx.lineWidth = Math.max(2, boxSize * 0.055);

  // Rounded square badge container
  ctx.beginPath();
  ctx.roundRect(left, topY, boxSize, boxSize, radius);
  ctx.fill();
  ctx.stroke();

  const cx = centerX;
  const cy = topY + boxSize / 2;
  const u = boxSize * 0.28;

  ctx.strokeStyle = foreground;
  ctx.fillStyle = foreground;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, boxSize * 0.06);

  if (preset === 'stationery') {
    // Stylized pen nib + ruler mark
    ctx.beginPath();
    ctx.moveTo(cx, cy - u);
    ctx.lineTo(cx + u * 0.68, cy - u * 0.05);
    ctx.lineTo(cx + u * 0.35, cy + u * 0.85);
    ctx.lineTo(cx - u * 0.35, cy + u * 0.85);
    ctx.lineTo(cx - u * 0.68, cy - u * 0.05);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - u);
    ctx.lineTo(cx, cy + u * 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + u * 0.25, Math.max(2, u * 0.14), 0, Math.PI * 2);
    ctx.fill();
  } else if (preset === 'bag') {
    // Modern shopping bag
    ctx.beginPath();
    ctx.roundRect(cx - u * 0.85, cy - u * 0.35, u * 1.7, u * 1.25, 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy - u * 0.35, u * 0.45, Math.PI, 0);
    ctx.stroke();
  } else if (preset === 'book') {
    // Open book / notebook
    ctx.beginPath();
    ctx.moveTo(cx, cy - u * 0.55);
    ctx.lineTo(cx - u * 0.9, cy - u * 0.78);
    ctx.lineTo(cx - u * 0.9, cy + u * 0.65);
    ctx.lineTo(cx, cy + u * 0.85);
    ctx.lineTo(cx + u * 0.9, cy + u * 0.65);
    ctx.lineTo(cx + u * 0.9, cy - u * 0.78);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - u * 0.55);
    ctx.lineTo(cx, cy + u * 0.85);
    ctx.stroke();
  } else if (preset === 'star') {
    // Crisp 5-point star
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? u * 0.98 : u * 0.44;
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (preset === 'crown') {
    // Crisp geometric crown
    ctx.beginPath();
    ctx.moveTo(cx - u * 0.9, cy + u * 0.55);
    ctx.lineTo(cx - u * 0.9, cy - u * 0.45);
    ctx.lineTo(cx - u * 0.35, cy + u * 0.05);
    ctx.lineTo(cx, cy - u * 0.7);
    ctx.lineTo(cx + u * 0.35, cy + u * 0.05);
    ctx.lineTo(cx + u * 0.9, cy - u * 0.45);
    ctx.lineTo(cx + u * 0.9, cy + u * 0.55);
    ctx.closePath();
    ctx.stroke();
    ctx.fillRect(cx - u * 0.9, cy + u * 0.68, u * 1.8, Math.max(2.5, u * 0.16));
  }

  ctx.restore();
  return topY + boxSize;
}
