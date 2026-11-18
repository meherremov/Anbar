import {
  formatPaymentMethodLabel,
  type ReceiptData,
  type ReceiptSettings,
  type ThermalPaperWidth,
} from '../types/inventory';

interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
}

interface UsbEndpointLike {
  endpointNumber: number;
  direction: 'in' | 'out';
  type: string;
}

interface UsbAlternateLike {
  interfaceClass: number;
  endpoints: UsbEndpointLike[];
}

interface UsbInterfaceLike {
  interfaceNumber: number;
  alternate: UsbAlternateLike;
}

interface UsbConfigurationLike {
  interfaces: UsbInterfaceLike[];
}

interface UsbDeviceLike {
  configuration: UsbConfigurationLike | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<unknown>;
}

type NavigatorWithHardware = Navigator & {
  serial?: {
    requestPort(): Promise<SerialPortLike>;
    getPorts(): Promise<SerialPortLike[]>;
  };
  usb?: {
    requestDevice(options: { filters: Array<{ classCode?: number }> }): Promise<UsbDeviceLike>;
    getDevices(): Promise<UsbDeviceLike[]>;
  };
};

function formatMoney(val: number): string {
  return `${val.toFixed(2)} ₼`;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('az-AZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (ctx.measureText(word).width <= maxWidth) {
        current = word;
      } else {
        let chunk = '';
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width <= maxWidth) {
            chunk += ch;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function renderReceiptToCanvas(
  receipt: ReceiptData,
  settings: ReceiptSettings
): HTMLCanvasElement {
  const is58mm = settings.paperWidth === '58mm';
  const width = is58mm ? 384 : 576;
  const padX = is58mm ? 16 : 24;
  const contentWidth = width - padX * 2;
  const baseFontSize = is58mm ? 18 : 22;
  const smallFontSize = is58mm ? 15 : 18;
  const titleFontSize = is58mm ? 24 : 30;
  const totalFontSize = is58mm ? 24 : 30;
  const lineStep = is58mm ? 24 : 29;
  const smallStep = is58mm ? 20 : 25;

  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = width;
  measureCanvas.height = 100;
  const mctx = measureCanvas.getContext('2d')!;

  const fontFamily = '"JetBrains Mono", "Courier New", monospace';
  const sansFamily = '"Plus Jakarta Sans", Arial, sans-serif';

  // Compute required height dynamically
  let y = 26;
  y += titleFontSize + 8; // storeName
  if (settings.subtitle) {
    mctx.font = `400 ${smallFontSize}px ${sansFamily}`;
    y += wrapText(mctx, settings.subtitle, contentWidth).length * smallStep;
  }
  if (settings.address) {
    mctx.font = `400 ${smallFontSize}px ${sansFamily}`;
    y += wrapText(mctx, settings.address, contentWidth).length * smallStep;
  }
  if (settings.phone) y += smallStep;
  if (settings.taxId) y += smallStep;
  y += 18; // dashed divider

  // Metadata (3 rows when C2C is hidden from receipt, 4 otherwise)
  const metadataRowCount = receipt.paymentMethod === 'c2c' ? 3 : 4;
  y += smallStep * metadataRowCount + 18;

  // Items header
  y += smallStep + 10;

  mctx.font = `600 ${baseFontSize}px ${sansFamily}`;
  for (let i = 0; i < receipt.items.length; i++) {
    const item = receipt.items[i];
    const label = `${i + 1}. ${item.productName}`;
    y += wrapText(mctx, label, contentWidth).length * lineStep;
    y += smallStep + 10;
    if (typeof item.discountAmount === 'number' && item.discountAmount > 0) {
      y += smallStep;
    }
  }
  y += 14; // dashed divider

  // Summary + Total
  y += smallStep + 8;
  if (typeof receipt.discountAmount === 'number' && receipt.discountAmount > 0) {
    y += smallStep * 2 + 4;
  }
  y += totalFontSize + 14;
  if (typeof receipt.cashReceived === 'number' && receipt.cashReceived > 0) {
    y += smallStep * 2 + 8;
  }
  y += 18; // dashed divider

  // Barcode + Footer
  y += 74;
  if (settings.footerNote) {
    mctx.font = `500 ${smallFontSize}px ${sansFamily}`;
    y += wrapText(mctx, settings.footerNote, contentWidth).length * smallStep + 8;
  }
  y += 40;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = y;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';

  const drawDashedLine = (lineY: number) => {
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padX, lineY);
    ctx.lineTo(width - padX, lineY);
    ctx.stroke();
    ctx.restore();
  };

  let curY = 26;
  ctx.textBaseline = 'top';

  // Header
  ctx.textAlign = 'center';
  ctx.font = `700 ${titleFontSize}px ${sansFamily}`;
  ctx.fillText((settings.storeName || 'OFİS ANBARI').toUpperCase(), width / 2, curY);
  curY += titleFontSize + 8;

  ctx.font = `400 ${smallFontSize}px ${sansFamily}`;
  if (settings.subtitle) {
    for (const line of wrapText(ctx, settings.subtitle, contentWidth)) {
      ctx.fillText(line, width / 2, curY);
      curY += smallStep;
    }
  }
  if (settings.address) {
    for (const line of wrapText(ctx, settings.address, contentWidth)) {
      ctx.fillText(line, width / 2, curY);
      curY += smallStep;
    }
  }
  if (settings.phone) {
    ctx.fillText(`Tel: ${settings.phone}`, width / 2, curY);
    curY += smallStep;
  }
  if (settings.taxId) {
    ctx.fillText(`VÖEN: ${settings.taxId}`, width / 2, curY);
    curY += smallStep;
  }

  curY += 8;
  drawDashedLine(curY);
  curY += 10;

  // Metadata rows
  const drawKeyVal = (left: string, right: string, boldRight = false) => {
    ctx.textAlign = 'left';
    ctx.font = `400 ${smallFontSize}px ${fontFamily}`;
    ctx.fillText(left, padX, curY);
    ctx.textAlign = 'right';
    ctx.font = `${boldRight ? 700 : 400} ${smallFontSize}px ${fontFamily}`;
    ctx.fillText(right, width - padX, curY);
    curY += smallStep;
  };

  drawKeyVal('Çek №:', receipt.receiptNumber, true);
  drawKeyVal('Tarix:', formatDateTime(receipt.issuedAt));
  drawKeyVal('Kassir:', receipt.cashierLabel);
  if (receipt.paymentMethod !== 'c2c') {
    drawKeyVal('Ödəniş:', formatPaymentMethodLabel(receipt.paymentMethod), true);
  }

  curY += 8;
  drawDashedLine(curY);
  curY += 10;

  // Items header
  ctx.textAlign = 'left';
  ctx.font = `700 ${smallFontSize}px ${sansFamily}`;
  ctx.fillText('Məhsul', padX, curY);
  ctx.textAlign = 'right';
  ctx.fillText('Məbləğ', width - padX, curY);
  curY += smallStep + 4;
  ctx.fillRect(padX, curY, contentWidth, 1);
  curY += 6;

  // Line items
  for (let i = 0; i < receipt.items.length; i++) {
    const item = receipt.items[i];
    ctx.textAlign = 'left';
    ctx.font = `600 ${baseFontSize}px ${sansFamily}`;
    const nameLines = wrapText(ctx, `${i + 1}. ${item.productName}`, contentWidth);
    for (const line of nameLines) {
      ctx.fillText(line, padX, curY);
      curY += lineStep;
    }

    ctx.font = `400 ${smallFontSize}px ${fontFamily}`;
    ctx.fillText(
      `  ${item.quantity} ${item.unit} x ${formatMoney(item.unitPrice)}`,
      padX,
      curY
    );
    ctx.textAlign = 'right';
    ctx.font = `700 ${smallFontSize}px ${fontFamily}`;
    ctx.fillText(formatMoney(item.lineTotal), width - padX, curY);
    curY += smallStep + 10;

    if (typeof item.discountAmount === 'number' && item.discountAmount > 0) {
      ctx.textAlign = 'left';
      ctx.font = `400 ${smallFontSize}px ${fontFamily}`;
      ctx.fillText('  Məhsul endirimi:', padX, curY);
      ctx.textAlign = 'right';
      ctx.fillText(`-${formatMoney(item.discountAmount)}`, width - padX, curY);
      curY += smallStep;
    }
  }

  curY += 4;
  drawDashedLine(curY);
  curY += 10;

  // Totals
  const totalUnits =
    Math.round(receipt.items.reduce((acc, item) => acc + item.quantity, 0) * 100) / 100;
  drawKeyVal('Çeşid / Miqdar:', `${receipt.items.length} çeşid · ${totalUnits} vahid`);
  if (typeof receipt.discountAmount === 'number' && receipt.discountAmount > 0) {
    const subtotalVal =
      typeof receipt.subtotalAmount === 'number'
        ? receipt.subtotalAmount
        : receipt.totalAmount + receipt.discountAmount;
    drawKeyVal('Ara cəm:', formatMoney(subtotalVal));
    drawKeyVal('Endirim:', `-${formatMoney(receipt.discountAmount)}`);
  }
  curY += 6;

  ctx.textAlign = 'left';
  ctx.font = `700 ${totalFontSize}px ${fontFamily}`;
  ctx.fillText('CƏMİ:', padX, curY);
  ctx.textAlign = 'right';
  ctx.fillText(formatMoney(receipt.totalAmount), width - padX, curY);
  curY += totalFontSize + 10;

  if (typeof receipt.cashReceived === 'number' && receipt.cashReceived > 0) {
    drawKeyVal('Verilən nağd:', formatMoney(receipt.cashReceived));
    drawKeyVal('Qalıq:', formatMoney(Math.max(0, receipt.changeAmount ?? 0)), true);
  }

  curY += 8;
  drawDashedLine(curY);
  curY += 14;

  // Deterministic barcode bars
  const code = receipt.receiptNumber.trim() || '00000000';
  const barWidths: Array<{ draw: boolean; w: number }> = [
    { draw: true, w: 3 },
    { draw: false, w: 3 },
    { draw: true, w: 3 },
    { draw: false, w: 3 },
  ];
  for (let i = 0; i < code.length; i++) {
    const c = code.charCodeAt(i);
    barWidths.push({ draw: true, w: ((c >> 0) & 3) + 2 });
    barWidths.push({ draw: false, w: ((c >> 2) & 1) + 2 });
    barWidths.push({ draw: true, w: ((c >> 3) & 3) + 2 });
    barWidths.push({ draw: false, w: ((c >> 5) & 1) + 2 });
  }
  barWidths.push({ draw: true, w: 3 }, { draw: false, w: 3 }, { draw: true, w: 3 });

  const totalBarPx = barWidths.reduce((s, b) => s + b.w, 0);
  const scale = Math.min(1.6, (contentWidth * 0.85) / totalBarPx);
  let barX = (width - totalBarPx * scale) / 2;
  for (const b of barWidths) {
    const bw = b.w * scale;
    if (b.draw) {
      ctx.fillRect(barX, curY, Math.max(1, bw), 42);
    }
    barX += bw;
  }
  curY += 48;

  ctx.textAlign = 'center';
  ctx.font = `500 ${smallFontSize}px ${fontFamily}`;
  ctx.fillText(code, width / 2, curY);
  curY += smallStep + 4;

  if (settings.footerNote) {
    ctx.font = `500 ${smallFontSize}px ${sansFamily}`;
    for (const line of wrapText(ctx, settings.footerNote, contentWidth)) {
      ctx.fillText(line, width / 2, curY);
      curY += smallStep;
    }
  }

  return canvas;
}

export async function downloadReceiptPng(
  receipt: ReceiptData,
  settings: ReceiptSettings
): Promise<void> {
  const canvas = renderReceiptToCanvas(receipt, settings);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );
  if (!blob) {
    throw new Error('Çek şəkli yaradıla bilmədi.');
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cek-${receipt.receiptNumber}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Converts a receipt canvas into monochrome 1-bit ESC/POS raster commands (GS v 0 + paper cut).
 * Prints exact Azerbaijani glyphs (ə, ş, ç, ğ, ü, ö, ı) and barcodes on any Zywell / ESC-POS printer.
 */
export function buildEscPosRasterBuffer(
  receipt: ReceiptData,
  settings: ReceiptSettings
): Uint8Array {
  const canvas = renderReceiptToCanvas(receipt, settings);
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  const widthBytes = Math.ceil(canvas.width / 8);
  const height = canvas.height;
  const rasterData = new Uint8Array(widthBytes * height);

  for (let y = 0; y < height; y++) {
    for (let xByte = 0; xByte < widthBytes; xByte++) {
      let byteVal = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xByte * 8 + bit;
        if (x < canvas.width) {
          const idx = (y * canvas.width + x) * 4;
          const lum =
            0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
          if (lum < 165) {
            byteVal |= 1 << (7 - bit);
          }
        }
      }
      rasterData[y * widthBytes + xByte] = byteVal;
    }
  }

  const xL = widthBytes & 0xff;
  const xH = (widthBytes >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;

  const initCmd = [0x1b, 0x40]; // ESC @
  const rasterHeader = [0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]; // GS v 0
  const feedAndCut = [0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00]; // Feed 4 lines + Partial Cut

  const out = new Uint8Array(initCmd.length + rasterHeader.length + rasterData.length + feedAndCut.length);
  let offset = 0;
  out.set(initCmd, offset);
  offset += initCmd.length;
  out.set(rasterHeader, offset);
  offset += rasterHeader.length;
  out.set(rasterData, offset);
  offset += rasterData.length;
  out.set(feedAndCut, offset);
  return out;
}

export async function printViaWebSerial(
  receipt: ReceiptData,
  settings: ReceiptSettings
): Promise<void> {
  const nav = navigator as NavigatorWithHardware;
  if (!nav.serial) {
    throw new Error(
      'Bu brauzer birbaşa Serial/COM printer bağlantısını dəstəkləmir. Chrome və ya Edge istifadə edin.'
    );
  }
  const existingPorts = await nav.serial.getPorts();
  const port = existingPorts[0] || (await nav.serial.requestPort());
  const data = buildEscPosRasterBuffer(receipt, settings);

  await port.open({ baudRate: 9600 });
  try {
    if (!port.writable) {
      throw new Error('Printer portu yazıla bilən deyil.');
    }
    const writer = port.writable.getWriter();
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  } finally {
    await port.close();
  }
}

export async function printViaWebUsb(
  receipt: ReceiptData,
  settings: ReceiptSettings
): Promise<void> {
  const nav = navigator as NavigatorWithHardware;
  if (!nav.usb) {
    throw new Error(
      'Bu brauzer birbaşa USB printer bağlantısını dəstəkləmir. Chrome və ya Edge istifadə edin.'
    );
  }

  const existing = await nav.usb.getDevices();
  const device =
    existing[0] ||
    (await nav.usb.requestDevice({
      filters: [{ classCode: 7 }, {}],
    }));

  const data = buildEscPosRasterBuffer(receipt, settings);
  await device.open();
  try {
    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }
    const iface =
      device.configuration?.interfaces.find((i) => i.alternate.interfaceClass === 7) ||
      device.configuration?.interfaces[0];
    if (!iface) {
      throw new Error('USB printer interfeysi tapılmadı.');
    }

    await device.claimInterface(iface.interfaceNumber);
    try {
      const outEndpoint = iface.alternate.endpoints.find((e) => e.direction === 'out');
      if (!outEndpoint) {
        throw new Error('USB çıxış kanalı tapılmadı.');
      }
      const chunkSize = 512;
      for (let i = 0; i < data.length; i += chunkSize) {
        await device.transferOut(outEndpoint.endpointNumber, data.slice(i, i + chunkSize));
      }
    } finally {
      await device.releaseInterface(iface.interfaceNumber);
    }
  } finally {
    await device.close();
  }
}

const THERMAL_PAGE_STYLE_ID = 'thermal-receipt-page-style';

/**
 * Isolates `#thermal-receipt-print-root` as the sole printable element and applies
 * dynamic `@page` dimensions (`58mm` or `80mm`) for thermal POS drivers before `window.print()`.
 */
export function prepareThermalPrintRoot(paperWidth: ThermalPaperWidth = '80mm'): () => void {
  const roots = Array.from(
    document.querySelectorAll<HTMLElement>('#thermal-receipt-print-root')
  );
  const activeRoot = roots[roots.length - 1] ?? null;

  let pageStyleEl = document.getElementById(THERMAL_PAGE_STYLE_ID) as HTMLStyleElement | null;
  if (!pageStyleEl) {
    pageStyleEl = document.createElement('style');
    pageStyleEl.id = THERMAL_PAGE_STYLE_ID;
    document.head.appendChild(pageStyleEl);
  }
  pageStyleEl.textContent = `@media print { @page { size: ${paperWidth} auto; margin: 0; } }`;

  const hiddenElements: HTMLElement[] = [];

  if (activeRoot) {
    activeRoot.setAttribute('data-paper-width', paperWidth);
    activeRoot.classList.remove('thermal-print-hidden');

    if (activeRoot.parentElement !== document.body) {
      document.body.appendChild(activeRoot);
    }

    // Hide any stale duplicate print portals if multiple modals mounted simultaneously
    for (const root of roots) {
      if (root !== activeRoot) {
        root.classList.add('thermal-print-hidden');
        hiddenElements.push(root);
      }
    }

    document.body.setAttribute('data-thermal-print-only', 'true');
    for (const child of Array.from(document.body.children)) {
      if (
        child instanceof HTMLElement &&
        child !== activeRoot &&
        child.tagName !== 'SCRIPT' &&
        child.tagName !== 'STYLE'
      ) {
        child.classList.add('thermal-print-hidden');
        hiddenElements.push(child);
      }
    }

    // Flush computed styles before window.print() snapshots the document
    void activeRoot.offsetHeight;
  }

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    document.body.removeAttribute('data-thermal-print-only');
    for (const el of hiddenElements) {
      el.classList.remove('thermal-print-hidden');
    }
  };
}

/**
 * Triggers native browser print targeting only `#thermal-receipt-print-root`
 * and detects if a sandboxed iframe silently blocked `window.print()`.
 */
export function triggerBrowserPrint(
  paperWidth: ThermalPaperWidth = '80mm'
): Promise<'opened' | 'blocked'> {
  return new Promise((resolve) => {
    const cleanup = prepareThermalPrintRoot(paperWidth);

    let beforePrintFired = false;
    const onBeforePrint = () => {
      beforePrintFired = true;
    };
    const onAfterPrint = () => {
      cleanup();
    };

    window.addEventListener('beforeprint', onBeforePrint, { once: true });
    window.addEventListener('afterprint', onAfterPrint, { once: true });

    const start = performance.now();
    try {
      window.print();
    } catch {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
      cleanup();
      resolve('blocked');
      return;
    }
    const elapsed = performance.now() - start;

    // On desktop browsers, window.print() is synchronous when not blocked (elapsed > 80ms)
    // or fires 'beforeprint'. On mobile or sandboxed iframes, check after a short tick.
    window.setTimeout(() => {
      window.removeEventListener('beforeprint', onBeforePrint);
      if (beforePrintFired || elapsed > 80) {
        resolve('opened');
      } else {
        window.removeEventListener('afterprint', onAfterPrint);
        cleanup();
        resolve('blocked');
      }
    }, 220);

    // Safety fallback cleanup in case a browser suppresses `afterprint`
    window.setTimeout(() => {
      window.removeEventListener('afterprint', onAfterPrint);
      cleanup();
    }, 60_000);
  });
}
