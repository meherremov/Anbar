import {
  DEFAULT_RECEIPT_SETTINGS,
  formatPaymentMethodLabel,
  formatPromoBannerText,
  type ReceiptData,
  type ReceiptDividerStyle,
  type ReceiptSettings,
  type ThermalPaperWidth,
} from '../types/inventory';
import {
  drawReceiptPresetLogoOnCanvas,
  loadReceiptLogoImage,
} from './receiptLogo';

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

function drawReceiptDivider(
  ctx: CanvasRenderingContext2D,
  padX: number,
  width: number,
  lineY: number,
  style: ReceiptDividerStyle
): void {
  ctx.save();
  ctx.strokeStyle = '#000000';
  if (style === 'solid') {
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padX, lineY);
    ctx.lineTo(width - padX, lineY);
    ctx.stroke();
  } else if (style === 'double') {
    ctx.setLineDash([]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(padX, lineY - 2);
    ctx.lineTo(width - padX, lineY - 2);
    ctx.moveTo(padX, lineY + 2);
    ctx.lineTo(width - padX, lineY + 2);
    ctx.stroke();
  } else {
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padX, lineY);
    ctx.lineTo(width - padX, lineY);
    ctx.stroke();
  }
  ctx.restore();
}

function drawReceiptBarcode(
  ctx: CanvasRenderingContext2D,
  codeRaw: string,
  width: number,
  contentWidth: number,
  startY: number,
  smallFontSize: number,
  smallStep: number,
  fontFamily: string
): number {
  let curY = startY;
  const code = codeRaw.trim() || '00000000';
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
      ctx.fillRect(barX, curY, Math.max(1, bw), 40);
    }
    barX += bw;
  }
  curY += 46;

  ctx.textAlign = 'center';
  ctx.font = `500 ${smallFontSize}px ${fontFamily}`;
  ctx.fillText(code, width / 2, curY);
  curY += smallStep + 4;
  return curY;
}

function measureLogoHeight(
  s: ReceiptSettings,
  logoImg: HTMLImageElement | null,
  maxW: number,
  maxH: number,
  badgeSize: number
): { hasLogo: boolean; drawW: number; drawH: number } {
  if (!s.showLogo) return { hasLogo: false, drawW: 0, drawH: 0 };
  if (logoImg) {
    const ratio = Math.min(
      1,
      maxW / Math.max(1, logoImg.width),
      maxH / Math.max(1, logoImg.height)
    );
    return {
      hasLogo: true,
      drawW: Math.round(logoImg.width * ratio),
      drawH: Math.round(logoImg.height * ratio),
    };
  }
  if (s.logoPreset !== 'none') {
    return { hasLogo: true, drawW: badgeSize, drawH: badgeSize };
  }
  return { hasLogo: false, drawW: 0, drawH: 0 };
}

function drawReceiptLogoOnCanvas(
  ctx: CanvasRenderingContext2D,
  s: ReceiptSettings,
  logoImg: HTMLImageElement | null,
  centerX: number,
  topY: number,
  maxW: number,
  maxH: number,
  badgeSize: number,
  onDarkSurface = false
): number {
  const dims = measureLogoHeight(s, logoImg, maxW, maxH, badgeSize);
  if (!dims.hasLogo) return topY;

  if (logoImg) {
    const drawX = Math.round(centerX - dims.drawW / 2);
    if (onDarkSurface) {
      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(drawX - 8, topY - 4, dims.drawW + 16, dims.drawH + 8, 8);
      ctx.fill();
      ctx.restore();
    }
    ctx.drawImage(logoImg, drawX, topY, dims.drawW, dims.drawH);
    return topY + dims.drawH + (onDarkSurface ? 12 : 10);
  }

  drawReceiptPresetLogoOnCanvas(
    ctx,
    s.logoPreset,
    centerX,
    topY,
    badgeSize,
    '#000000',
    '#FFFFFF'
  );
  return topY + badgeSize + 10;
}

function drawPromoBannerOnCanvas(
  ctx: CanvasRenderingContext2D,
  s: ReceiptSettings,
  padX: number,
  width: number,
  contentWidth: number,
  startY: number,
  smallFontSize: number,
  smallStep: number,
  sansFamily: string
): number {
  const bannerText = formatPromoBannerText(s.promoBanner, s.promoBannerUppercase);
  if (!bannerText) return startY;

  let curY = startY + 10;
  const fontSize = Math.max(15, smallFontSize);
  const step = Math.max(20, smallStep);
  ctx.font = `700 ${fontSize}px ${sansFamily}`;
  const innerMaxW = s.promoBannerStyle === 'plain' ? contentWidth : contentWidth - 24;
  const lines = wrapText(ctx, bannerText, innerMaxW);
  const textHeight = lines.length * step;

  if (s.promoBannerStyle === 'inverted') {
    const boxH = textHeight + 20;
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.roundRect(padX, curY, contentWidth, boxH, 8);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    let ly = curY + 11;
    for (const line of lines) {
      ctx.fillText(line, width / 2, ly);
      ly += step;
    }
    ctx.restore();
    return curY + boxH + 6;
  }

  if (s.promoBannerStyle === 'boxed') {
    const boxH = textHeight + 20;
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(padX, curY, contentWidth, boxH, 8);
    ctx.stroke();
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    let ly = curY + 11;
    for (const line of lines) {
      ctx.fillText(line, width / 2, ly);
      ly += step;
    }
    ctx.restore();
    return curY + boxH + 6;
  }

  // Plain bold with subtle dotted rule above
  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.setLineDash([2, 4]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(padX, curY);
  ctx.lineTo(width - padX, curY);
  ctx.stroke();
  ctx.restore();
  curY += 10;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#000000';
  for (const line of lines) {
    ctx.fillText(line, width / 2, curY);
    curY += step;
  }
  return curY + 4;
}

export async function renderReceiptToCanvas(
  receipt: ReceiptData,
  settings: ReceiptSettings
): Promise<HTMLCanvasElement> {
  const s: ReceiptSettings = { ...DEFAULT_RECEIPT_SETTINGS, ...settings };
  const is58mm = s.paperWidth === '58mm';
  const width = is58mm ? 384 : 576;
  const padX = is58mm ? 16 : 24;
  const contentWidth = width - padX * 2;

  const scaleDelta =
    s.fontScale === 'compact' ? -2 : s.fontScale === 'large' ? 2 : 0;

  const baseFontSize = (is58mm ? 18 : 22) + scaleDelta;
  const smallFontSize = Math.max(12, (is58mm ? 15 : 18) + scaleDelta);
  const titleFontSize = (is58mm ? 24 : 30) + scaleDelta;
  const totalFontSize = (is58mm ? 24 : 30) + scaleDelta;
  const lineStep = (is58mm ? 24 : 29) + scaleDelta;
  const smallStep = Math.max(16, (is58mm ? 20 : 25) + scaleDelta);

  const fontFamily = '"JetBrains Mono", "Courier New", monospace';
  const sansFamily = '"Plus Jakarta Sans", Arial, sans-serif';

  const logoImg =
    s.showLogo && s.logoDataUrl
      ? await loadReceiptLogoImage(s.logoDataUrl)
      : null;

  const logoMaxW = is58mm ? 170 : 240;
  const logoMaxH = is58mm ? 74 : 100;
  const logoBadgeSize = is58mm ? 50 : 62;

  const draftCanvas = document.createElement('canvas');
  draftCanvas.width = width;
  draftCanvas.height = Math.max(1900, receipt.items.length * 180 + 1150);
  const ctx = draftCanvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, draftCanvas.width, draftCanvas.height);
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';
  ctx.textBaseline = 'top';

  const totalUnits =
    Math.round(receipt.items.reduce((acc, item) => acc + item.quantity, 0) * 100) /
    100;
  const hasOrderDiscount =
    typeof receipt.discountAmount === 'number' && receipt.discountAmount > 0;
  const subtotalVal =
    typeof receipt.subtotalAmount === 'number'
      ? receipt.subtotalAmount
      : hasOrderDiscount
      ? receipt.totalAmount + receipt.discountAmount!
      : receipt.totalAmount;
  const showPayment = s.showPaymentMethod && receipt.paymentMethod !== 'c2c';
  const contactParts: string[] = [];
  if (s.address) contactParts.push(s.address);
  if (s.phone) contactParts.push(`Tel: ${s.phone}`);
  if (s.showTaxId && s.taxId) contactParts.push(`VÖEN: ${s.taxId}`);

  const drawKeyVal = (
    left: string,
    right: string,
    boldRight = false,
    leftSans = true
  ) => {
    ctx.textAlign = 'left';
    ctx.font = `400 ${smallFontSize}px ${leftSans ? sansFamily : fontFamily}`;
    ctx.fillText(left, padX, curY);
    ctx.textAlign = 'right';
    ctx.font = `${boldRight ? 700 : 400} ${smallFontSize}px ${fontFamily}`;
    ctx.fillText(right, width - padX, curY);
    curY += smallStep;
  };

  let curY = 24;

  if (s.templateId === 'modern') {
    const logoDims = measureLogoHeight(
      s,
      logoImg,
      logoMaxW,
      logoMaxH,
      logoBadgeSize
    );
    const headerStartY = curY;
    let bannerH = 26 + titleFontSize;
    if (logoDims.hasLogo) bannerH += logoDims.drawH + 16;
    if (s.headerBadge) bannerH += smallStep;
    if (s.subtitle) bannerH += smallStep;

    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.roundRect(padX, headerStartY, contentWidth, bannerH, 10);
    ctx.fill();
    ctx.restore();

    let bannerInnerY = headerStartY + 14;
    if (logoDims.hasLogo) {
      bannerInnerY = drawReceiptLogoOnCanvas(
        ctx,
        s,
        logoImg,
        width / 2,
        bannerInnerY,
        logoMaxW,
        logoMaxH,
        logoBadgeSize,
        true
      );
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    if (s.headerBadge) {
      ctx.font = `600 ${Math.max(11, smallFontSize - 2)}px ${fontFamily}`;
      ctx.fillText(s.headerBadge.toUpperCase(), width / 2, bannerInnerY);
      bannerInnerY += smallStep;
    }
    ctx.font = `800 ${titleFontSize}px ${sansFamily}`;
    ctx.fillText((s.storeName || 'MƏKTƏBLİ').toUpperCase(), width / 2, bannerInnerY);
    bannerInnerY += titleFontSize + 6;
    if (s.subtitle) {
      ctx.font = `500 ${smallFontSize}px ${sansFamily}`;
      ctx.fillText(s.subtitle, width / 2, bannerInnerY);
    }

    ctx.fillStyle = '#000000';
    curY = headerStartY + bannerH + 14;

    if (contactParts.length > 0) {
      ctx.textAlign = 'center';
      ctx.font = `400 ${smallFontSize}px ${sansFamily}`;
      for (const part of contactParts) {
        for (const line of wrapText(ctx, part, contentWidth)) {
          ctx.fillText(line, width / 2, curY);
          curY += smallStep;
        }
      }
      curY += 6;
      drawReceiptDivider(ctx, padX, width, curY, s.dividerStyle);
      curY += 10;
    }

    drawKeyVal('Çek №', receipt.receiptNumber, true);
    drawKeyVal('Tarix', formatDateTime(receipt.issuedAt));
    if (s.showCashier) drawKeyVal('Kassir', receipt.cashierLabel);
    if (showPayment) {
      drawKeyVal('Ödəniş', formatPaymentMethodLabel(receipt.paymentMethod), true);
    }

    curY += 6;
    drawReceiptDivider(ctx, padX, width, curY, s.dividerStyle);
    curY += 10;

    ctx.textAlign = 'left';
    ctx.font = `700 ${smallFontSize}px ${sansFamily}`;
    ctx.fillText('MƏHSUL', padX, curY);
    ctx.textAlign = 'right';
    ctx.fillText('MƏBLƏĞ', width - padX, curY);
    curY += smallStep + 4;
    ctx.fillRect(padX, curY, contentWidth, 2);
    curY += 10;

    for (const item of receipt.items) {
      ctx.textAlign = 'left';
      ctx.font = `600 ${baseFontSize}px ${sansFamily}`;
      for (const line of wrapText(ctx, item.productName, contentWidth * 0.72)) {
        ctx.fillText(line, padX, curY);
        curY += lineStep;
      }
      ctx.textAlign = 'right';
      ctx.font = `700 ${baseFontSize}px ${fontFamily}`;
      ctx.fillText(formatMoney(item.lineTotal), width - padX, curY - lineStep);

      ctx.textAlign = 'left';
      ctx.font = `400 ${smallFontSize}px ${fontFamily}`;
      const subLeft = `${item.quantity} ${item.unit} × ${formatMoney(item.unitPrice)}`;
      ctx.fillText(subLeft, padX, curY);
      if (s.showItemBarcodes && item.barcode) {
        ctx.textAlign = 'right';
        ctx.fillText(`#${item.barcode}`, width - padX, curY);
      }
      curY += smallStep + 8;
      if (typeof item.discountAmount === 'number' && item.discountAmount > 0) {
        drawKeyVal('Endirim', `-${formatMoney(item.discountAmount)}`);
      }
    }

    curY += 4;
    drawReceiptDivider(ctx, padX, width, curY, s.dividerStyle);
    curY += 10;

    drawKeyVal('Ümumi say', `${receipt.items.length} çeşid · ${totalUnits} vahid`);
    if (hasOrderDiscount) {
      drawKeyVal('Ara cəm', formatMoney(subtotalVal));
      drawKeyVal('Endirim', `-${formatMoney(receipt.discountAmount!)}`, true);
    }
    curY += 8;

    // Solid black rounded YEKUN block
    const boxH = totalFontSize + 20;
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.roundRect(padX, curY, contentWidth, boxH, 8);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.font = `800 ${totalFontSize}px ${sansFamily}`;
    ctx.fillText('YEKUN', padX + 12, curY + 10);
    ctx.textAlign = 'right';
    ctx.font = `700 ${totalFontSize}px ${fontFamily}`;
    ctx.fillText(formatMoney(receipt.totalAmount), width - padX - 12, curY + 10);
    ctx.restore();
    curY += boxH + 10;

    if (typeof receipt.cashReceived === 'number' && receipt.cashReceived > 0) {
      drawKeyVal('Verilən nağd', formatMoney(receipt.cashReceived));
      drawKeyVal('Qalıq', formatMoney(Math.max(0, receipt.changeAmount ?? 0)), true);
    }

    curY += 8;
    drawReceiptDivider(ctx, padX, width, curY, s.dividerStyle);
    curY += 12;

    if (s.showBarcode) {
      curY = drawReceiptBarcode(
        ctx,
        receipt.receiptNumber,
        width,
        contentWidth,
        curY,
        smallFontSize,
        smallStep,
        fontFamily
      );
    }
    if (s.footerNote) {
      ctx.textAlign = 'center';
      ctx.font = `500 ${smallFontSize}px ${sansFamily}`;
      for (const line of wrapText(ctx, s.footerNote, contentWidth)) {
        ctx.fillText(line, width / 2, curY);
        curY += smallStep;
      }
    }
    curY = drawPromoBannerOnCanvas(
      ctx,
      s,
      padX,
      width,
      contentWidth,
      curY,
      smallFontSize,
      smallStep,
      sansFamily
    );
  } else if (s.templateId === 'compact') {
    const compactStep = Math.max(15, smallStep - 4);
    curY = drawReceiptLogoOnCanvas(
      ctx,
      s,
      logoImg,
      width / 2,
      curY,
      Math.round(logoMaxW * 0.78),
      Math.round(logoMaxH * 0.78),
      Math.round(logoBadgeSize * 0.8),
      false
    );
    ctx.textAlign = 'center';
    ctx.font = `800 ${Math.max(18, titleFontSize - 3)}px ${sansFamily}`;
    ctx.fillText((s.storeName || 'MƏKTƏBLİ').toUpperCase(), width / 2, curY);
    curY += titleFontSize;
    ctx.font = `400 ${smallFontSize}px ${sansFamily}`;
    if (s.subtitle) {
      ctx.fillText(s.subtitle, width / 2, curY);
      curY += compactStep;
    }
    if (contactParts.length > 0) {
      for (const line of wrapText(ctx, contactParts.join(' · '), contentWidth)) {
        ctx.fillText(line, width / 2, curY);
        curY += compactStep;
      }
    }
    curY += 4;
    drawReceiptDivider(ctx, padX, width, curY, s.dividerStyle);
    curY += 8;

    drawKeyVal(receipt.receiptNumber, formatDateTime(receipt.issuedAt), false, false);
    if (s.showCashier || showPayment) {
      drawKeyVal(
        s.showCashier ? receipt.cashierLabel : '',
        showPayment ? formatPaymentMethodLabel(receipt.paymentMethod) : ''
      );
    }
    curY += 4;
    drawReceiptDivider(ctx, padX, width, curY, s.dividerStyle);
    curY += 8;

    for (let i = 0; i < receipt.items.length; i++) {
      const item = receipt.items[i];
      ctx.textAlign = 'left';
      ctx.font = `600 ${Math.max(14, baseFontSize - 2)}px ${sansFamily}`;
      const label = `${i + 1}. ${item.productName} (${item.quantity}×${item.unitPrice.toFixed(2)})`;
      const lines = wrapText(ctx, label, contentWidth * 0.72);
      for (let li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], padX, curY);
        if (li === 0) {
          ctx.textAlign = 'right';
          ctx.font = `700 ${Math.max(14, baseFontSize - 2)}px ${fontFamily}`;
          ctx.fillText(formatMoney(item.lineTotal), width - padX, curY);
          ctx.textAlign = 'left';
          ctx.font = `600 ${Math.max(14, baseFontSize - 2)}px ${sansFamily}`;
        }
        curY += compactStep + 2;
      }
      if (s.showItemBarcodes && item.barcode) {
        ctx.font = `400 ${Math.max(12, smallFontSize - 2)}px ${fontFamily}`;
        ctx.fillText(`  BAR: ${item.barcode}`, padX, curY);
        curY += compactStep;
      }
      if (typeof item.discountAmount === 'number' && item.discountAmount > 0) {
        drawKeyVal('  Endirim', `-${formatMoney(item.discountAmount)}`);
      }
    }

    curY += 4;
    drawReceiptDivider(ctx, padX, width, curY, s.dividerStyle);
    curY += 8;

    if (hasOrderDiscount) {
      drawKeyVal(
        `Endirim (${formatMoney(subtotalVal)}-dən)`,
        `-${formatMoney(receipt.discountAmount!)}`
      );
    }
    ctx.textAlign = 'left';
    ctx.font = `800 ${Math.max(18, totalFontSize - 2)}px ${sansFamily}`;
    ctx.fillText(`CƏMİ (${totalUnits} vahid):`, padX, curY);
    ctx.textAlign = 'right';
    ctx.font = `700 ${Math.max(18, totalFontSize - 2)}px ${fontFamily}`;
    ctx.fillText(formatMoney(receipt.totalAmount), width - padX, curY);
    curY += totalFontSize + 6;

    if (typeof receipt.cashReceived === 'number' && receipt.cashReceived > 0) {
      drawKeyVal(
        `Nağd: ${formatMoney(receipt.cashReceived)}`,
        `Qalıq: ${formatMoney(Math.max(0, receipt.changeAmount ?? 0))}`,
        true,
        false
      );
    }

    curY += 6;
    if (s.showBarcode) {
      curY = drawReceiptBarcode(
        ctx,
        receipt.receiptNumber,
        width,
        contentWidth,
        curY,
        smallFontSize,
        smallStep,
        fontFamily
      );
    }
    if (s.footerNote) {
      ctx.textAlign = 'center';
      ctx.font = `500 ${smallFontSize}px ${sansFamily}`;
      for (const line of wrapText(ctx, s.footerNote, contentWidth)) {
        ctx.fillText(line, width / 2, curY);
        curY += compactStep;
      }
    }
    curY = drawPromoBannerOnCanvas(
      ctx,
      s,
      padX,
      width,
      contentWidth,
      curY,
      smallFontSize,
      compactStep,
      sansFamily
    );
  } else if (s.templateId === 'detailed') {
    const boxStart = curY;
    let innerY = curY + 12;
    ctx.textAlign = 'center';
    if (s.headerBadge) {
      ctx.font = `700 ${smallFontSize}px ${sansFamily}`;
      ctx.fillText(s.headerBadge.toUpperCase(), width / 2, innerY);
      innerY += smallStep;
      ctx.fillRect(padX + 10, innerY, contentWidth - 20, 1.5);
      innerY += 10;
    }
    innerY = drawReceiptLogoOnCanvas(
      ctx,
      s,
      logoImg,
      width / 2,
      innerY,
      logoMaxW - 20,
      logoMaxH,
      logoBadgeSize,
      false
    );
    ctx.font = `800 ${titleFontSize}px ${sansFamily}`;
    ctx.fillText((s.storeName || 'MƏKTƏBLİ').toUpperCase(), width / 2, innerY);
    innerY += titleFontSize + 6;
    ctx.font = `400 ${smallFontSize}px ${sansFamily}`;
    if (s.subtitle) {
      ctx.fillText(s.subtitle, width / 2, innerY);
      innerY += smallStep;
    }
    if (s.address) {
      for (const line of wrapText(ctx, `Ünvan: ${s.address}`, contentWidth - 16)) {
        ctx.fillText(line, width / 2, innerY);
        innerY += smallStep;
      }
    }
    if (s.phone) {
      ctx.font = `400 ${smallFontSize}px ${fontFamily}`;
      ctx.fillText(`Tel: ${s.phone}`, width / 2, innerY);
      innerY += smallStep;
    }
    if (s.showTaxId && s.taxId) {
      ctx.font = `700 ${smallFontSize}px ${fontFamily}`;
      ctx.fillText(`VÖEN: ${s.taxId}`, width / 2, innerY);
      innerY += smallStep;
    }
    innerY += 6;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(padX, boxStart, contentWidth, innerY - boxStart, 8);
    ctx.stroke();
    ctx.restore();
    curY = innerY + 12;

    drawKeyVal('Qəbz №:', receipt.receiptNumber, true);
    drawKeyVal('Tarix / Saat:', formatDateTime(receipt.issuedAt));
    if (s.showCashier) drawKeyVal('Məsul kassir:', receipt.cashierLabel);
    if (showPayment) {
      drawKeyVal('Ödəniş üsulu:', formatPaymentMethodLabel(receipt.paymentMethod), true);
    }

    curY += 6;
    drawReceiptDivider(ctx, padX, width, curY, s.dividerStyle);
    curY += 10;

    ctx.textAlign = 'left';
    ctx.font = `700 ${smallFontSize}px ${sansFamily}`;
    ctx.fillText('№ · Məhsulun adı', padX, curY);
    ctx.textAlign = 'right';
    ctx.fillText('Cəmi', width - padX, curY);
    curY += smallStep + 4;
    ctx.fillRect(padX, curY, contentWidth, 2);
    curY += 8;

    for (let i = 0; i < receipt.items.length; i++) {
      const item = receipt.items[i];
      ctx.textAlign = 'left';
      ctx.font = `600 ${baseFontSize}px ${sansFamily}`;
      for (const line of wrapText(ctx, `${i + 1}. ${item.productName}`, contentWidth)) {
        ctx.fillText(line, padX, curY);
        curY += lineStep;
      }
      if (s.showItemBarcodes && item.barcode) {
        ctx.font = `400 ${Math.max(12, smallFontSize - 2)}px ${fontFamily}`;
        ctx.fillText(`  Barkod: ${item.barcode}`, padX, curY);
        curY += smallStep;
      }
      ctx.font = `400 ${smallFontSize}px ${fontFamily}`;
      ctx.fillText(`  ${item.quantity} ${item.unit} × ${formatMoney(item.unitPrice)}`, padX, curY);
      ctx.textAlign = 'right';
      ctx.font = `700 ${smallFontSize}px ${fontFamily}`;
      ctx.fillText(formatMoney(item.lineTotal), width - padX, curY);
      curY += smallStep + 8;

      if (typeof item.discountAmount === 'number' && item.discountAmount > 0) {
        drawKeyVal('  Sətir endirimi:', `-${formatMoney(item.discountAmount)}`);
      }
    }

    curY += 4;
    drawReceiptDivider(ctx, padX, width, curY, s.dividerStyle);
    curY += 10;

    drawKeyVal('Məhsul çeşidi / sayı:', `${receipt.items.length} çeşid · ${totalUnits} vahid`);
    if (hasOrderDiscount) {
      drawKeyVal('Endirimdən əvvəl:', formatMoney(subtotalVal));
      drawKeyVal('Tətbiq edilən endirim:', `-${formatMoney(receipt.discountAmount!)}`, true);
    }
    curY += 6;

    const totalBoxH = totalFontSize + 18;
    ctx.save();
    ctx.fillStyle = '#F1F5F9';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(padX, curY, contentWidth, totalBoxH, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.font = `800 ${totalFontSize}px ${sansFamily}`;
    ctx.fillText('YEKUN MƏBLƏĞ:', padX + 10, curY + 9);
    ctx.textAlign = 'right';
    ctx.font = `700 ${totalFontSize}px ${fontFamily}`;
    ctx.fillText(formatMoney(receipt.totalAmount), width - padX - 10, curY + 9);
    ctx.restore();
    curY += totalBoxH + 8;

    if (typeof receipt.cashReceived === 'number' && receipt.cashReceived > 0) {
      drawKeyVal('Qəbul edilən nağd:', formatMoney(receipt.cashReceived));
      drawKeyVal('Qaytarılan qalıq:', formatMoney(Math.max(0, receipt.changeAmount ?? 0)), true);
    }

    curY += 8;
    drawReceiptDivider(ctx, padX, width, curY, s.dividerStyle);
    curY += 12;

    drawKeyVal('Təhvil verdi:', '_________________');
    curY += 8;

    if (s.showBarcode) {
      curY = drawReceiptBarcode(
        ctx,
        receipt.receiptNumber,
        width,
        contentWidth,
        curY,
        smallFontSize,
        smallStep,
        fontFamily
      );
    }
    if (s.footerNote) {
      ctx.textAlign = 'center';
      ctx.font = `500 ${smallFontSize}px ${sansFamily}`;
      for (const line of wrapText(ctx, s.footerNote, contentWidth)) {
        ctx.fillText(line, width / 2, curY);
        curY += smallStep;
      }
    }
    curY = drawPromoBannerOnCanvas(
      ctx,
      s,
      padX,
      width,
      contentWidth,
      curY,
      smallFontSize,
      smallStep,
      sansFamily
    );
  } else {
    // CLASSIC TEMPLATE (modernized minimalist)
    curY = drawReceiptLogoOnCanvas(
      ctx,
      s,
      logoImg,
      width / 2,
      curY,
      logoMaxW,
      logoMaxH,
      logoBadgeSize,
      false
    );
    ctx.textAlign = 'center';
    ctx.font = `800 ${titleFontSize}px ${sansFamily}`;
    ctx.fillText((s.storeName || 'MƏKTƏBLİ').toUpperCase(), width / 2, curY);
    curY += titleFontSize + 8;

    ctx.font = `500 ${smallFontSize}px ${sansFamily}`;
    if (s.subtitle) {
      for (const line of wrapText(ctx, s.subtitle, contentWidth)) {
        ctx.fillText(line, width / 2, curY);
        curY += smallStep;
      }
    }
    ctx.font = `400 ${smallFontSize}px ${sansFamily}`;
    if (s.address) {
      for (const line of wrapText(ctx, s.address, contentWidth)) {
        ctx.fillText(line, width / 2, curY);
        curY += smallStep;
      }
    }
    ctx.font = `400 ${smallFontSize}px ${fontFamily}`;
    if (s.phone) {
      ctx.fillText(`Tel: ${s.phone}`, width / 2, curY);
      curY += smallStep;
    }
    if (s.showTaxId && s.taxId) {
      ctx.fillText(`VÖEN: ${s.taxId}`, width / 2, curY);
      curY += smallStep;
    }

    curY += 8;
    drawReceiptDivider(ctx, padX, width, curY, s.dividerStyle);
    curY += 10;

    drawKeyVal('Çek №:', receipt.receiptNumber, true);
    drawKeyVal('Tarix:', formatDateTime(receipt.issuedAt));
    if (s.showCashier) drawKeyVal('Kassir:', receipt.cashierLabel);
    if (showPayment) {
      drawKeyVal('Ödəniş:', formatPaymentMethodLabel(receipt.paymentMethod), true);
    }

    curY += 8;
    drawReceiptDivider(ctx, padX, width, curY, s.dividerStyle);
    curY += 10;

    ctx.textAlign = 'left';
    ctx.font = `700 ${smallFontSize}px ${sansFamily}`;
    ctx.fillText('MƏHSUL', padX, curY);
    ctx.textAlign = 'right';
    ctx.fillText('MƏBLƏĞ', width - padX, curY);
    curY += smallStep + 4;
    ctx.fillRect(padX, curY, contentWidth, 1);
    curY += 6;

    for (let i = 0; i < receipt.items.length; i++) {
      const item = receipt.items[i];
      ctx.textAlign = 'left';
      ctx.font = `600 ${baseFontSize}px ${sansFamily}`;
      const nameLines = wrapText(ctx, `${i + 1}. ${item.productName}`, contentWidth);
      for (const line of nameLines) {
        ctx.fillText(line, padX, curY);
        curY += lineStep;
      }

      if (s.showItemBarcodes && item.barcode) {
        ctx.font = `400 ${Math.max(12, smallFontSize - 2)}px ${fontFamily}`;
        ctx.fillText(`  BAR: ${item.barcode}`, padX, curY);
        curY += smallStep;
      }

      ctx.font = `400 ${smallFontSize}px ${fontFamily}`;
      ctx.fillText(
        `  ${item.quantity} ${item.unit} × ${formatMoney(item.unitPrice)}`,
        padX,
        curY
      );
      ctx.textAlign = 'right';
      ctx.font = `700 ${smallFontSize}px ${fontFamily}`;
      ctx.fillText(formatMoney(item.lineTotal), width - padX, curY);
      curY += smallStep + 10;

      if (typeof item.discountAmount === 'number' && item.discountAmount > 0) {
        drawKeyVal('  Məhsul endirimi:', `-${formatMoney(item.discountAmount)}`);
      }
    }

    curY += 4;
    drawReceiptDivider(ctx, padX, width, curY, s.dividerStyle);
    curY += 10;

    drawKeyVal('Çeşid / Miqdar:', `${receipt.items.length} çeşid · ${totalUnits} vahid`);
    if (hasOrderDiscount) {
      drawKeyVal('Ara cəm:', formatMoney(subtotalVal));
      drawKeyVal('Endirim:', `-${formatMoney(receipt.discountAmount!)}`);
    }
    curY += 6;

    ctx.textAlign = 'left';
    ctx.font = `800 ${totalFontSize}px ${sansFamily}`;
    ctx.fillText('CƏMİ:', padX, curY);
    ctx.textAlign = 'right';
    ctx.font = `700 ${totalFontSize}px ${fontFamily}`;
    ctx.fillText(formatMoney(receipt.totalAmount), width - padX, curY);
    curY += totalFontSize + 10;

    if (typeof receipt.cashReceived === 'number' && receipt.cashReceived > 0) {
      drawKeyVal('Verilən nağd:', formatMoney(receipt.cashReceived));
      drawKeyVal('Qalıq:', formatMoney(Math.max(0, receipt.changeAmount ?? 0)), true);
    }

    curY += 8;
    drawReceiptDivider(ctx, padX, width, curY, s.dividerStyle);
    curY += 14;

    if (s.showBarcode) {
      curY = drawReceiptBarcode(
        ctx,
        receipt.receiptNumber,
        width,
        contentWidth,
        curY,
        smallFontSize,
        smallStep,
        fontFamily
      );
    }

    if (s.footerNote) {
      ctx.textAlign = 'center';
      ctx.font = `500 ${smallFontSize}px ${sansFamily}`;
      for (const line of wrapText(ctx, s.footerNote, contentWidth)) {
        ctx.fillText(line, width / 2, curY);
        curY += smallStep;
      }
    }

    if (s.headerBadge) {
      curY += 4;
      ctx.textAlign = 'center';
      ctx.font = `500 ${Math.max(12, smallFontSize - 2)}px ${fontFamily}`;
      ctx.fillText(`*** ${s.headerBadge} ***`, width / 2, curY);
      curY += smallStep;
    }

    curY = drawPromoBannerOnCanvas(
      ctx,
      s,
      padX,
      width,
      contentWidth,
      curY,
      smallFontSize,
      smallStep,
      sansFamily
    );
  }

  const finalHeight = Math.min(draftCanvas.height, Math.max(160, Math.ceil(curY + 20)));
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = width;
  finalCanvas.height = finalHeight;
  const fctx = finalCanvas.getContext('2d')!;
  fctx.fillStyle = '#FFFFFF';
  fctx.fillRect(0, 0, width, finalHeight);
  fctx.drawImage(draftCanvas, 0, 0, width, finalHeight, 0, 0, width, finalHeight);
  return finalCanvas;
}

export async function downloadReceiptPng(
  receipt: ReceiptData,
  settings: ReceiptSettings
): Promise<void> {
  const canvas = await renderReceiptToCanvas(receipt, settings);
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
export async function buildEscPosRasterBuffer(
  receipt: ReceiptData,
  settings: ReceiptSettings
): Promise<Uint8Array> {
  const canvas = await renderReceiptToCanvas(receipt, settings);
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
  const data = await buildEscPosRasterBuffer(receipt, settings);

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

  const data = await buildEscPosRasterBuffer(receipt, settings);
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
