import { BrowserCodeReader, BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  BARCODE_PATTERN,
  FIELD_LIMITS,
  type BarcodeScanResult,
  type ProductFormValues,
  type StationeryIconId,
} from '../types/inventory';
import {
  isValidStationeryIconId,
  resolveStationeryIconId,
} from './stationeryAssets';

const SUPPORTED_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
];

function formatName(format: BarcodeFormat): string {
  return BarcodeFormat[format] || 'BARCODE';
}

function createReader(): BrowserMultiFormatReader {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, SUPPORTED_FORMATS);
  return new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 120,
    delayBetweenScanSuccess: 500,
  });
}

interface NativeBarcodeDetector {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string; format: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): NativeBarcodeDetector;
    };
  }
}

async function tryNativeBarcodeDetector(
  source: ImageBitmapSource
): Promise<BarcodeScanResult | null> {
  if (typeof window === 'undefined' || !window.BarcodeDetector) {
    return null;
  }
  try {
    const detector = new window.BarcodeDetector({
      formats: [
        'ean_13',
        'ean_8',
        'upc_a',
        'upc_e',
        'code_128',
        'code_39',
        'code_93',
        'itf',
        'codabar',
        'qr_code',
        'data_matrix',
      ],
    });
    const results = await detector.detect(source);
    if (results.length > 0 && results[0].rawValue) {
      return {
        code: results[0].rawValue.trim(),
        format: results[0].format.toUpperCase(),
      };
    }
  } catch {
    // Fallback to ZXing
  }
  return null;
}

function loadImageFromFile(file: File): Promise<{ img: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, objectUrl });
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Şəkil faylı oxuna bilmədi.'));
    };
    img.src = objectUrl;
  });
}

function drawTransformedCanvas(
  img: HTMLImageElement,
  rotationDeg: number,
  maxDim: number,
  enhanceContrast: boolean,
  cropRatio = 1
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return canvas;
  }

  const srcW = Math.round(img.naturalWidth * cropRatio);
  const srcH = Math.round(img.naturalHeight * cropRatio);
  const srcX = Math.round((img.naturalWidth - srcW) / 2);
  const srcY = Math.round((img.naturalHeight - srcH) / 2);

  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const targetW = Math.max(1, Math.round(srcW * scale));
  const targetH = Math.max(1, Math.round(srcH * scale));

  const isVertical = rotationDeg === 90 || rotationDeg === 270;
  canvas.width = isVertical ? targetH : targetW;
  canvas.height = isVertical ? targetW : targetH;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  if (enhanceContrast) {
    ctx.filter = 'grayscale(100%) contrast(155%)';
  }
  ctx.drawImage(img, srcX, srcY, srcW, srcH, -targetW / 2, -targetH / 2, targetW, targetH);
  ctx.restore();

  return canvas;
}

export async function decodeBarcodeFromImageFile(file: File): Promise<BarcodeScanResult | null> {
  const { img, objectUrl } = await loadImageFromFile(file);
  try {
    const reader = createReader();

    // Pass 1: Native BarcodeDetector on raw loaded image
    const nativeHit = await tryNativeBarcodeDetector(img);
    if (nativeHit) {
      return nativeHit;
    }

    // Pass 2: Multi-scale, multi-rotation ZXing + Native attempts
    const attempts: Array<{ deg: number; maxDim: number; contrast: boolean; crop: number }> = [
      { deg: 0, maxDim: 1600, contrast: false, crop: 1 },
      { deg: 0, maxDim: 1200, contrast: true, crop: 1 },
      { deg: 90, maxDim: 1400, contrast: false, crop: 1 },
      { deg: 180, maxDim: 1400, contrast: false, crop: 1 },
      { deg: 270, maxDim: 1400, contrast: false, crop: 1 },
      { deg: 0, maxDim: 1200, contrast: true, crop: 0.7 },
      { deg: 90, maxDim: 1200, contrast: true, crop: 0.7 },
    ];

    for (const attempt of attempts) {
      const canvas = drawTransformedCanvas(
        img,
        attempt.deg,
        attempt.maxDim,
        attempt.contrast,
        attempt.crop
      );

      const nativeCanvasHit = await tryNativeBarcodeDetector(canvas);
      if (nativeCanvasHit) {
        return nativeCanvasHit;
      }

      try {
        const result = reader.decodeFromCanvas(canvas);
        const text = result.getText()?.trim();
        if (text) {
          return {
            code: text,
            format: formatName(result.getBarcodeFormat()),
          };
        }
      } catch {
        // Continue trying next orientation / contrast pass
      }
    }

    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  try {
    return await BrowserCodeReader.listVideoInputDevices();
  } catch {
    return [];
  }
}

export function createCameraReader(): BrowserMultiFormatReader {
  return createReader();
}

export function generateInternalBarcode(): string {
  const randomDigits = Math.floor(100000000000 + Math.random() * 899999999999);
  return String(randomDigits);
}

export interface ValidatedProductPayload {
  name: string;
  barcode: string;
  barcodeFormat: string;
  category: string;
  brand?: string;
  quantity: number;
  unit: string;
  purchasePrice?: number;
  salePrice: number;
  minStock?: number;
  shelfLocation?: string;
  notes?: string;
  icon: StationeryIconId;
}

export function parseLocaleNumber(raw: string): number {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) return Number.NaN;
  return Number(normalized);
}

export function validateAndSanitizeProduct(
  values: ProductFormValues
): { ok: true; data: ValidatedProductPayload } | { ok: false; error: string } {
  const name = values.name.trim().slice(0, FIELD_LIMITS.NAME_MAX);
  if (!name) {
    return { ok: false, error: 'Məhsulun adını daxil edin.' };
  }

  const barcode = values.barcode.trim().slice(0, FIELD_LIMITS.BARCODE_MAX);
  if (!barcode) {
    return { ok: false, error: 'Məhsulun barkodunu daxil edin və ya skan edin.' };
  }
  if (!BARCODE_PATTERN.test(barcode)) {
    return {
      ok: false,
      error: 'Barkodda icazə verilməyən simvollar var. Yalnız hərf, rəqəm və standart işarələr istifadə edin.',
    };
  }

  const barcodeFormat =
    values.barcodeFormat.trim().slice(0, FIELD_LIMITS.BARCODE_FORMAT_MAX) || 'MANUAL';

  const category = values.category.trim().slice(0, FIELD_LIMITS.CATEGORY_MAX);
  if (!category) {
    return { ok: false, error: 'Kateqoriya seçin.' };
  }

  const unit = values.unit.trim().slice(0, FIELD_LIMITS.UNIT_MAX) || 'ədəd';

  const quantity = parseLocaleNumber(values.quantity);
  if (Number.isNaN(quantity) || quantity < 0 || quantity > FIELD_LIMITS.NUMERIC_MAX) {
    return { ok: false, error: 'Stok miqdarı 0 və ya müsbət rəqəm olmalıdır.' };
  }

  const salePrice = parseLocaleNumber(values.salePrice);
  if (
    values.salePrice.trim() === '' ||
    Number.isNaN(salePrice) ||
    salePrice < 0 ||
    salePrice > FIELD_LIMITS.NUMERIC_MAX
  ) {
    return { ok: false, error: 'Satış qiyməti düzgün daxil edilməyib.' };
  }

  const resolvedIcon: StationeryIconId = isValidStationeryIconId(values.icon)
    ? values.icon
    : resolveStationeryIconId(name, category);

  const payload: ValidatedProductPayload = {
    name,
    barcode,
    barcodeFormat,
    category,
    quantity: Math.round(quantity * 100) / 100,
    unit,
    salePrice: Math.round(salePrice * 100) / 100,
    icon: resolvedIcon,
  };

  const brand = values.brand.trim().slice(0, FIELD_LIMITS.BRAND_MAX);
  if (brand) {
    payload.brand = brand;
  }

  if (values.purchasePrice.trim() !== '') {
    const purchasePrice = parseLocaleNumber(values.purchasePrice);
    if (
      Number.isNaN(purchasePrice) ||
      purchasePrice < 0 ||
      purchasePrice > FIELD_LIMITS.NUMERIC_MAX
    ) {
      return { ok: false, error: 'Alış qiyməti 0 və ya müsbət rəqəm olmalıdır.' };
    }
    payload.purchasePrice = Math.round(purchasePrice * 100) / 100;
  }

  if (values.minStock.trim() !== '') {
    const minStock = parseLocaleNumber(values.minStock);
    if (Number.isNaN(minStock) || minStock < 0 || minStock > FIELD_LIMITS.NUMERIC_MAX) {
      return { ok: false, error: 'Minimum stok həddi 0 və ya müsbət rəqəm olmalıdır.' };
    }
    payload.minStock = Math.round(minStock * 100) / 100;
  }

  const shelfLocation = values.shelfLocation.trim().slice(0, FIELD_LIMITS.SHELF_MAX);
  if (shelfLocation) {
    payload.shelfLocation = shelfLocation;
  }

  const notes = values.notes.trim().slice(0, FIELD_LIMITS.NOTES_MAX);
  if (notes) {
    payload.notes = notes;
  }

  return { ok: true, data: payload };
}
