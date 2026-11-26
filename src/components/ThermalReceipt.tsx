import { createPortal } from 'react-dom';
import {
  DEFAULT_RECEIPT_SETTINGS,
  formatPaymentMethodLabel,
  formatPromoBannerText,
  type ReceiptData,
  type ReceiptDividerStyle,
  type ReceiptSettings,
} from '../types/inventory';
import { BarcodeGraphic } from './BarcodeGraphic';
import { ReceiptLogoMark } from './ReceiptLogo';

interface ThermalReceiptProps {
  receipt: ReceiptData;
  settings: ReceiptSettings;
  enablePrintPortal?: boolean;
}

function formatMoney(val: number): string {
  return `${val.toFixed(2)} ₼`;
}

function formatReceiptDateTime(date: Date): string {
  return date.toLocaleString('az-AZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getDividerClass(style: ReceiptDividerStyle): string {
  switch (style) {
    case 'solid':
      return 'border-b border-solid border-black/80';
    case 'double':
      return 'border-b-[3px] border-double border-black';
    case 'dashed':
    default:
      return 'border-b border-dashed border-black/75';
  }
}

function getTopDividerClass(style: ReceiptDividerStyle): string {
  switch (style) {
    case 'solid':
      return 'border-t border-solid border-black/80';
    case 'double':
      return 'border-t-[3px] border-double border-black';
    case 'dashed':
    default:
      return 'border-t border-dashed border-black/75';
  }
}

function ReceiptPromoFooter({
  settings,
  smallSizePx,
}: {
  settings: ReceiptSettings;
  smallSizePx: number;
}) {
  const bannerText = formatPromoBannerText(
    settings.promoBanner,
    settings.promoBannerUppercase
  );
  if (!bannerText) return null;

  const style = settings.promoBannerStyle;
  if (style === 'inverted') {
    return (
      <div
        className="mt-2 bg-black text-white rounded-md px-3 py-2 text-center font-sans font-bold tracking-wide leading-snug break-words"
        style={{ fontSize: `${Math.max(10, smallSizePx)}px` }}
      >
        {bannerText}
      </div>
    );
  }
  if (style === 'boxed') {
    return (
      <div
        className="mt-2 border-[1.5px] border-black rounded-md px-3 py-2 text-center font-sans font-bold text-black tracking-wide leading-snug break-words"
        style={{ fontSize: `${Math.max(10, smallSizePx)}px` }}
      >
        {bannerText}
      </div>
    );
  }
  return (
    <p
      className="mt-2 pt-1.5 border-t border-dotted border-black/60 text-center font-sans font-bold text-black tracking-wide leading-snug break-words"
      style={{ fontSize: `${Math.max(10, smallSizePx)}px` }}
    >
      {bannerText}
    </p>
  );
}

function ReceiptPaperContent({
  receipt,
  settings,
  isPrintTarget,
}: {
  receipt: ReceiptData;
  settings: ReceiptSettings;
  isPrintTarget: boolean;
}) {
  const s: ReceiptSettings = { ...DEFAULT_RECEIPT_SETTINGS, ...settings };
  const is58mm = s.paperWidth === '58mm';
  const totalUnits =
    Math.round(receipt.items.reduce((acc, item) => acc + item.quantity, 0) * 100) /
    100;

  const dividerClass = getDividerClass(s.dividerStyle);
  const topDividerClass = getTopDividerClass(s.dividerStyle);

  const scaleOffset =
    s.fontScale === 'compact' ? -1 : s.fontScale === 'large' ? 1 : 0;

  const baseSizePx =
    (isPrintTarget ? (is58mm ? 10 : 11) : is58mm ? 11 : 12) + scaleOffset;
  const smallSizePx = Math.max(8.5, baseSizePx - 1.5);
  const titleSizePx = (is58mm ? 15 : 17) + scaleOffset * 1.5;
  const totalSizePx = (is58mm ? 14 : 16) + scaleOffset * 1.5;

  const containerClass = isPrintTarget
    ? is58mm
      ? 'w-[48mm] px-1.5 py-2'
      : 'w-[72mm] px-2.5 py-3'
    : is58mm
    ? 'w-[254px] mx-auto px-4 py-5 border border-slate-200/90 shadow-sm rounded-sm'
    : 'w-[328px] mx-auto px-5 py-6 border border-slate-200/90 shadow-sm rounded-sm';

  const contactParts: string[] = [];
  if (s.address) contactParts.push(s.address);
  if (s.phone) contactParts.push(`Tel: ${s.phone}`);
  if (s.showTaxId && s.taxId) contactParts.push(`VÖEN: ${s.taxId}`);

  const subtotalValue =
    typeof receipt.subtotalAmount === 'number'
      ? receipt.subtotalAmount
      : typeof receipt.discountAmount === 'number'
      ? receipt.totalAmount + receipt.discountAmount
      : receipt.totalAmount;

  const hasOrderDiscount =
    typeof receipt.discountAmount === 'number' && receipt.discountAmount > 0;
  const hasCashDetails =
    typeof receipt.cashReceived === 'number' && receipt.cashReceived > 0;
  const showPayment = s.showPaymentMethod && receipt.paymentMethod !== 'c2c';

  // --- TEMPLATE: MODERN ---
  if (s.templateId === 'modern') {
    return (
      <div
        className={`bg-white text-black font-sans leading-snug ${containerClass}`}
        style={{ fontSize: `${baseSizePx}px` }}
      >
        {/* Sleek Modern Header Card */}
        <div className="bg-black text-white rounded-lg px-3.5 py-3 text-center space-y-1.5 mb-2.5">
          <ReceiptLogoMark
            showLogo={s.showLogo}
            logoDataUrl={s.logoDataUrl}
            logoPreset={s.logoPreset}
            compact={is58mm}
            darkSurface
          />
          <div>
            {s.headerBadge ? (
              <div
                className="font-mono uppercase tracking-[0.18em] text-white/80 mb-0.5"
                style={{ fontSize: `${Math.max(8, smallSizePx - 1)}px` }}
              >
                {s.headerBadge}
              </div>
            ) : null}
            <div
              className="font-extrabold tracking-tight uppercase leading-tight"
              style={{ fontSize: `${titleSizePx}px` }}
            >
              {s.storeName || 'MƏKTƏBLİ'}
            </div>
            {s.subtitle ? (
              <div
                className="text-white/85 font-medium mt-0.5"
                style={{ fontSize: `${smallSizePx}px` }}
              >
                {s.subtitle}
              </div>
            ) : null}
          </div>
        </div>

        {contactParts.length > 0 ? (
          <div
            className={`text-center pb-2 space-y-0.5 text-slate-800 ${dividerClass}`}
            style={{ fontSize: `${smallSizePx}px` }}
          >
            {contactParts.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        ) : null}

        {/* Crisp Two-Column Metadata */}
        <div
          className={`py-2 space-y-1 font-mono tabular-nums ${dividerClass}`}
          style={{ fontSize: `${smallSizePx}px` }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-sans text-slate-600">Çek №</span>
            <span className="font-bold text-black">{receipt.receiptNumber}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-sans text-slate-600">Tarix</span>
            <span className="text-black">{formatReceiptDateTime(receipt.issuedAt)}</span>
          </div>
          {s.showCashier ? (
            <div className="flex items-center justify-between gap-2">
              <span className="font-sans text-slate-600">Kassir</span>
              <span className="font-sans font-medium text-black truncate max-w-[165px]">
                {receipt.cashierLabel}
              </span>
            </div>
          ) : null}
          {showPayment ? (
            <div className="flex items-center justify-between gap-2">
              <span className="font-sans text-slate-600">Ödəniş</span>
              <span className="font-sans font-bold text-black">
                {formatPaymentMethodLabel(receipt.paymentMethod)}
              </span>
            </div>
          ) : null}
        </div>

        {/* Modern Itemized Table */}
        <div className={`py-2.5 ${dividerClass}`}>
          <div
            className="grid grid-cols-[1fr_auto] gap-2 font-bold pb-1.5 mb-2 border-b-[1.5px] border-black uppercase tracking-wider"
            style={{ fontSize: `${Math.max(8.5, smallSizePx - 0.5)}px` }}
          >
            <span>Məhsul</span>
            <span className="text-right">Məbləğ</span>
          </div>

          <div className="space-y-2.5">
            {receipt.items.map((item, idx) => (
              <div key={`${item.productId}-${idx}`} className="space-y-0.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-black break-words leading-snug">
                    {item.productName}
                  </span>
                  <span className="font-mono tabular-nums font-bold text-black shrink-0">
                    {formatMoney(item.lineTotal)}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between gap-2 font-mono tabular-nums text-slate-700"
                  style={{ fontSize: `${smallSizePx}px` }}
                >
                  <span>
                    {item.quantity} {item.unit} × {formatMoney(item.unitPrice)}
                  </span>
                  {s.showItemBarcodes && item.barcode ? (
                    <span className="text-slate-600">#{item.barcode}</span>
                  ) : null}
                </div>
                {typeof item.discountAmount === 'number' && item.discountAmount > 0 ? (
                  <div
                    className="flex items-center justify-between font-mono tabular-nums text-slate-800"
                    style={{ fontSize: `${smallSizePx}px` }}
                  >
                    <span className="font-sans">Endirim</span>
                    <span>-{formatMoney(item.discountAmount)}</span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Modern Highlighted Total Card */}
        <div className="py-2.5 space-y-1.5">
          <div
            className="flex items-center justify-between text-slate-700"
            style={{ fontSize: `${smallSizePx}px` }}
          >
            <span>Ümumi say</span>
            <span className="font-mono tabular-nums">
              {receipt.items.length} çeşid · {totalUnits} vahid
            </span>
          </div>

          {hasOrderDiscount ? (
            <>
              <div
                className="flex items-center justify-between text-slate-700"
                style={{ fontSize: `${smallSizePx}px` }}
              >
                <span>Ara cəm</span>
                <span className="font-mono tabular-nums">
                  {formatMoney(subtotalValue)}
                </span>
              </div>
              <div
                className="flex items-center justify-between font-semibold text-black"
                style={{ fontSize: `${smallSizePx}px` }}
              >
                <span>Endirim</span>
                <span className="font-mono tabular-nums">
                  -{formatMoney(receipt.discountAmount!)}
                </span>
              </div>
            </>
          ) : null}

          <div
            className="bg-black text-white rounded-md px-3 py-2 flex items-center justify-between font-extrabold mt-1.5"
            style={{ fontSize: `${totalSizePx}px` }}
          >
            <span className="tracking-wide">YEKUN</span>
            <span className="font-mono tabular-nums">
              {formatMoney(receipt.totalAmount)}
            </span>
          </div>

          {hasCashDetails ? (
            <div
              className="pt-1 space-y-0.5 text-slate-900 font-mono tabular-nums"
              style={{ fontSize: `${smallSizePx}px` }}
            >
              <div className="flex items-center justify-between">
                <span className="font-sans">Verilən nağd</span>
                <span>{formatMoney(receipt.cashReceived!)}</span>
              </div>
              <div className="flex items-center justify-between font-bold">
                <span className="font-sans">Qalıq</span>
                <span>{formatMoney(Math.max(0, receipt.changeAmount ?? 0))}</span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer + Barcode + Custom Greeting */}
        <div className={`pt-2.5 text-center space-y-2 ${topDividerClass}`}>
          {s.showBarcode ? (
            <div className="flex justify-center">
              <BarcodeGraphic code={receipt.receiptNumber} compact />
            </div>
          ) : null}
          {s.footerNote ? (
            <p
              className="font-medium text-slate-800 leading-relaxed"
              style={{ fontSize: `${smallSizePx}px` }}
            >
              {s.footerNote}
            </p>
          ) : null}
          <ReceiptPromoFooter settings={s} smallSizePx={smallSizePx} />
        </div>
      </div>
    );
  }

  // --- TEMPLATE: COMPACT ---
  if (s.templateId === 'compact') {
    return (
      <div
        className={`bg-white text-black font-sans leading-tight ${containerClass}`}
        style={{ fontSize: `${Math.max(9, baseSizePx - 0.5)}px` }}
      >
        <div className={`text-center pb-2 space-y-1 ${dividerClass}`}>
          <ReceiptLogoMark
            showLogo={s.showLogo}
            logoDataUrl={s.logoDataUrl}
            logoPreset={s.logoPreset}
            compact
          />
          <div
            className="font-extrabold uppercase tracking-tight"
            style={{ fontSize: `${Math.max(12, titleSizePx - 1)}px` }}
          >
            {s.storeName || 'MƏKTƏBLİ'}
          </div>
          {s.subtitle ? (
            <div className="text-slate-700" style={{ fontSize: `${smallSizePx}px` }}>
              {s.subtitle}
            </div>
          ) : null}
          {contactParts.length > 0 ? (
            <div
              className="text-slate-700"
              style={{ fontSize: `${Math.max(8, smallSizePx - 0.5)}px` }}
            >
              {contactParts.join(' · ')}
            </div>
          ) : null}
        </div>

        <div
          className={`py-1.5 space-y-0.5 font-mono tabular-nums ${dividerClass}`}
          style={{ fontSize: `${Math.max(8, smallSizePx - 0.5)}px` }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold">{receipt.receiptNumber}</span>
            <span>{formatReceiptDateTime(receipt.issuedAt)}</span>
          </div>
          {s.showCashier || showPayment ? (
            <div className="flex items-center justify-between gap-2 font-sans text-slate-700">
              <span className="truncate max-w-[140px]">
                {s.showCashier ? receipt.cashierLabel : ''}
              </span>
              <span className="font-semibold text-black">
                {showPayment ? formatPaymentMethodLabel(receipt.paymentMethod) : ''}
              </span>
            </div>
          ) : null}
        </div>

        <div className={`py-1.5 space-y-1.5 ${dividerClass}`}>
          {receipt.items.map((item, idx) => (
            <div key={`${item.productId}-${idx}`} className="space-y-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-black break-words">
                  {idx + 1}. {item.productName}{' '}
                  <span
                    className="font-mono tabular-nums font-normal text-slate-700"
                    style={{ fontSize: `${smallSizePx}px` }}
                  >
                    ({item.quantity}×{item.unitPrice.toFixed(2)})
                  </span>
                </span>
                <span className="font-mono tabular-nums font-bold text-black shrink-0">
                  {formatMoney(item.lineTotal)}
                </span>
              </div>
              {s.showItemBarcodes && item.barcode ? (
                <div
                  className="font-mono text-slate-600 pl-3"
                  style={{ fontSize: `${Math.max(8, smallSizePx - 1)}px` }}
                >
                  BAR: {item.barcode}
                </div>
              ) : null}
              {typeof item.discountAmount === 'number' && item.discountAmount > 0 ? (
                <div
                  className="flex items-center justify-between pl-3 text-slate-700"
                  style={{ fontSize: `${Math.max(8, smallSizePx - 1)}px` }}
                >
                  <span>Endirim</span>
                  <span className="font-mono tabular-nums">
                    -{formatMoney(item.discountAmount)}
                  </span>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className={`py-2 space-y-0.5 ${dividerClass}`}>
          {hasOrderDiscount ? (
            <div
              className="flex items-center justify-between text-slate-700"
              style={{ fontSize: `${smallSizePx}px` }}
            >
              <span>Endirim ({formatMoney(subtotalValue)}-dən):</span>
              <span className="font-mono tabular-nums">
                -{formatMoney(receipt.discountAmount!)}
              </span>
            </div>
          ) : null}
          <div
            className="flex items-center justify-between font-extrabold text-black"
            style={{ fontSize: `${Math.max(12, totalSizePx - 1)}px` }}
          >
            <span>CƏMİ ({totalUnits} vahid):</span>
            <span className="font-mono tabular-nums">
              {formatMoney(receipt.totalAmount)}
            </span>
          </div>
          {hasCashDetails ? (
            <div
              className="flex items-center justify-between font-mono tabular-nums text-slate-800"
              style={{ fontSize: `${smallSizePx}px` }}
            >
              <span>Nağd: {formatMoney(receipt.cashReceived!)}</span>
              <span>Qalıq: {formatMoney(Math.max(0, receipt.changeAmount ?? 0))}</span>
            </div>
          ) : null}
        </div>

        <div className="pt-2 text-center space-y-1.5">
          {s.showBarcode ? (
            <div className="flex justify-center">
              <BarcodeGraphic code={receipt.receiptNumber} compact />
            </div>
          ) : null}
          {s.footerNote ? (
            <p
              className="font-medium text-slate-800"
              style={{ fontSize: `${Math.max(8.5, smallSizePx - 0.5)}px` }}
            >
              {s.footerNote}
            </p>
          ) : null}
          <ReceiptPromoFooter settings={s} smallSizePx={smallSizePx} />
        </div>
      </div>
    );
  }

  // --- TEMPLATE: DETAILED / FORMAL ---
  if (s.templateId === 'detailed') {
    return (
      <div
        className={`bg-white text-black font-sans leading-snug ${containerClass}`}
        style={{ fontSize: `${baseSizePx}px` }}
      >
        {/* Framed Formal Header with Logo */}
        <div className="border-[1.5px] border-black rounded-md p-3 text-center space-y-1 mb-2.5">
          {s.headerBadge ? (
            <div
              className="font-bold uppercase tracking-[0.14em] border-b border-black pb-1 mb-1.5"
              style={{ fontSize: `${smallSizePx}px` }}
            >
              {s.headerBadge}
            </div>
          ) : null}
          <ReceiptLogoMark
            showLogo={s.showLogo}
            logoDataUrl={s.logoDataUrl}
            logoPreset={s.logoPreset}
            compact={is58mm}
          />
          <div
            className="font-extrabold uppercase tracking-tight text-black pt-0.5"
            style={{ fontSize: `${titleSizePx}px` }}
          >
            {s.storeName || 'MƏKTƏBLİ'}
          </div>
          {s.subtitle ? (
            <div className="text-slate-800 font-medium" style={{ fontSize: `${smallSizePx}px` }}>
              {s.subtitle}
            </div>
          ) : null}
          {s.address ? (
            <div className="text-slate-700" style={{ fontSize: `${smallSizePx}px` }}>
              Ünvan: {s.address}
            </div>
          ) : null}
          {s.phone ? (
            <div className="font-mono text-slate-700" style={{ fontSize: `${smallSizePx}px` }}>
              Tel: {s.phone}
            </div>
          ) : null}
          {s.showTaxId && s.taxId ? (
            <div
              className="font-mono font-bold text-black"
              style={{ fontSize: `${smallSizePx}px` }}
            >
              VÖEN: {s.taxId}
            </div>
          ) : null}
        </div>

        {/* Receipt Document Metadata */}
        <div
          className={`pb-2 space-y-0.5 ${dividerClass}`}
          style={{ fontSize: `${smallSizePx}px` }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-600">Qəbz №:</span>
            <span className="font-mono tabular-nums font-bold">{receipt.receiptNumber}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-600">Tarix / Saat:</span>
            <span className="font-mono tabular-nums">{formatReceiptDateTime(receipt.issuedAt)}</span>
          </div>
          {s.showCashier ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600">Məsul kassir:</span>
              <span className="font-medium truncate max-w-[155px]">{receipt.cashierLabel}</span>
            </div>
          ) : null}
          {showPayment ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600">Ödəniş üsulu:</span>
              <span className="font-bold">
                {formatPaymentMethodLabel(receipt.paymentMethod)}
              </span>
            </div>
          ) : null}
        </div>

        {/* Formal Table */}
        <div className={`py-2 ${dividerClass}`}>
          <div
            className="flex items-center justify-between font-bold pb-1.5 mb-1 border-b-[1.5px] border-black uppercase tracking-wider"
            style={{ fontSize: `${Math.max(8.5, smallSizePx - 0.5)}px` }}
          >
            <span>№ · Məhsulun adı</span>
            <span>Cəmi</span>
          </div>

          <div className="divide-y divide-slate-300">
            {receipt.items.map((item, idx) => (
              <div key={`${item.productId}-${idx}`} className="py-1.5 space-y-0.5">
                <div className="font-semibold text-black break-words">
                  {idx + 1}. {item.productName}
                </div>
                {s.showItemBarcodes && item.barcode ? (
                  <div
                    className="font-mono text-slate-600 pl-3"
                    style={{ fontSize: `${Math.max(8, smallSizePx - 1)}px` }}
                  >
                    Barkod: {item.barcode}
                  </div>
                ) : null}
                <div
                  className="flex items-center justify-between gap-2 pl-3 font-mono tabular-nums"
                  style={{ fontSize: `${smallSizePx}px` }}
                >
                  <span className="text-slate-700">
                    {item.quantity} {item.unit} × {formatMoney(item.unitPrice)}
                  </span>
                  <span className="font-bold text-black shrink-0">
                    {formatMoney(item.lineTotal)}
                  </span>
                </div>
                {typeof item.discountAmount === 'number' && item.discountAmount > 0 ? (
                  <div
                    className="flex items-center justify-between pl-3 text-slate-700"
                    style={{ fontSize: `${smallSizePx}px` }}
                  >
                    <span>Sətir endirimi:</span>
                    <span className="font-mono tabular-nums">
                      -{formatMoney(item.discountAmount)}
                    </span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Formal Totals Box */}
        <div className="py-2 space-y-1">
          <div
            className="flex items-center justify-between text-slate-700"
            style={{ fontSize: `${smallSizePx}px` }}
          >
            <span>Məhsul çeşidi / sayı:</span>
            <span className="font-mono tabular-nums">
              {receipt.items.length} çeşid · {totalUnits} vahid
            </span>
          </div>
          {hasOrderDiscount ? (
            <>
              <div
                className="flex items-center justify-between text-slate-700"
                style={{ fontSize: `${smallSizePx}px` }}
              >
                <span>Endirimdən əvvəl:</span>
                <span className="font-mono tabular-nums">{formatMoney(subtotalValue)}</span>
              </div>
              <div
                className="flex items-center justify-between font-semibold"
                style={{ fontSize: `${smallSizePx}px` }}
              >
                <span>Tətbiq edilən endirim:</span>
                <span className="font-mono tabular-nums">
                  -{formatMoney(receipt.discountAmount!)}
                </span>
              </div>
            </>
          ) : null}

          <div
            className="border-[1.5px] border-black rounded bg-slate-100 px-2.5 py-2 flex items-center justify-between font-extrabold text-black mt-1"
            style={{ fontSize: `${totalSizePx}px` }}
          >
            <span>YEKUN MƏBLƏĞ:</span>
            <span className="font-mono tabular-nums">
              {formatMoney(receipt.totalAmount)}
            </span>
          </div>

          {hasCashDetails ? (
            <div
              className="pt-1 space-y-0.5 font-mono tabular-nums"
              style={{ fontSize: `${smallSizePx}px` }}
            >
              <div className="flex items-center justify-between">
                <span className="font-sans">Qəbul edilən nağd:</span>
                <span>{formatMoney(receipt.cashReceived!)}</span>
              </div>
              <div className="flex items-center justify-between font-bold">
                <span className="font-sans">Qaytarılan qalıq:</span>
                <span>{formatMoney(Math.max(0, receipt.changeAmount ?? 0))}</span>
              </div>
            </div>
          ) : null}
        </div>

        <div
          className={`pt-2.5 mt-1 space-y-2 ${topDividerClass}`}
          style={{ fontSize: `${smallSizePx}px` }}
        >
          <div className="flex items-center justify-between pt-1">
            <span>Təhvil verdi:</span>
            <span className="font-mono">_________________</span>
          </div>
          {s.showBarcode ? (
            <div className="flex justify-center pt-1">
              <BarcodeGraphic code={receipt.receiptNumber} compact />
            </div>
          ) : null}
          {s.footerNote ? (
            <p className="text-center font-medium text-slate-800 leading-relaxed">
              {s.footerNote}
            </p>
          ) : null}
          <ReceiptPromoFooter settings={s} smallSizePx={smallSizePx} />
        </div>
      </div>
    );
  }

  // --- TEMPLATE: CLASSIC (modernized minimalist) ---
  return (
    <div
      className={`bg-white text-black font-sans leading-snug ${containerClass}`}
      style={{ fontSize: `${baseSizePx}px` }}
    >
      {/* Clean Modern Header */}
      <div className={`text-center space-y-1 pb-3 ${dividerClass}`}>
        <ReceiptLogoMark
          showLogo={s.showLogo}
          logoDataUrl={s.logoDataUrl}
          logoPreset={s.logoPreset}
          compact={is58mm}
        />
        <div
          className="font-extrabold tracking-tight uppercase text-black pt-0.5"
          style={{ fontSize: `${titleSizePx}px` }}
        >
          {s.storeName || 'MƏKTƏBLİ'}
        </div>
        {s.subtitle ? (
          <div className="text-slate-700 font-medium" style={{ fontSize: `${smallSizePx}px` }}>
            {s.subtitle}
          </div>
        ) : null}
        {s.address ? (
          <div className="text-slate-700" style={{ fontSize: `${smallSizePx}px` }}>
            {s.address}
          </div>
        ) : null}
        {s.phone ? (
          <div className="font-mono text-slate-700" style={{ fontSize: `${smallSizePx}px` }}>
            Tel: {s.phone}
          </div>
        ) : null}
        {s.showTaxId && s.taxId ? (
          <div className="font-mono text-slate-800 font-medium" style={{ fontSize: `${smallSizePx}px` }}>
            VÖEN: {s.taxId}
          </div>
        ) : null}
      </div>

      {/* Receipt Metadata */}
      <div
        className={`py-2 space-y-0.5 ${dividerClass}`}
        style={{ fontSize: `${smallSizePx}px` }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-600">Çek №:</span>
          <span className="font-mono tabular-nums font-bold text-black">
            {receipt.receiptNumber}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-600">Tarix:</span>
          <span className="font-mono tabular-nums text-black">
            {formatReceiptDateTime(receipt.issuedAt)}
          </span>
        </div>
        {s.showCashier ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-600">Kassir:</span>
            <span className="font-medium text-black truncate max-w-[160px]">
              {receipt.cashierLabel}
            </span>
          </div>
        ) : null}
        {showPayment ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-600">Ödəniş:</span>
            <span className="font-bold text-black">
              {formatPaymentMethodLabel(receipt.paymentMethod)}
            </span>
          </div>
        ) : null}
      </div>

      {/* Itemized Products */}
      <div className={`py-2.5 ${dividerClass}`}>
        <div
          className="flex items-center justify-between font-bold pb-1 mb-2 border-b border-black/40 uppercase tracking-wider"
          style={{ fontSize: `${Math.max(8.5, smallSizePx - 0.5)}px` }}
        >
          <span>Məhsul</span>
          <span>Məbləğ</span>
        </div>

        <div className="space-y-2">
          {receipt.items.map((item, idx) => (
            <div key={`${item.productId}-${idx}`} className="space-y-0.5">
              <div className="font-semibold text-black break-words">
                {idx + 1}. {item.productName}
              </div>
              {s.showItemBarcodes && item.barcode ? (
                <div
                  className="font-mono text-slate-600 pl-3"
                  style={{ fontSize: `${Math.max(8, smallSizePx - 1)}px` }}
                >
                  BAR: {item.barcode}
                </div>
              ) : null}
              <div
                className="flex items-center justify-between gap-2 pl-3 font-mono tabular-nums"
                style={{ fontSize: `${smallSizePx}px` }}
              >
                <span className="text-slate-700">
                  {item.quantity} {item.unit} × {formatMoney(item.unitPrice)}
                </span>
                <span className="font-bold text-black shrink-0">
                  {formatMoney(item.lineTotal)}
                </span>
              </div>
              {typeof item.discountAmount === 'number' && item.discountAmount > 0 ? (
                <div
                  className="flex items-center justify-between gap-2 pl-3 text-slate-700"
                  style={{ fontSize: `${smallSizePx}px` }}
                >
                  <span>Məhsul endirimi:</span>
                  <span className="font-mono tabular-nums">
                    -{formatMoney(item.discountAmount)}
                  </span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className={`py-2.5 space-y-1 ${dividerClass}`}>
        <div
          className="flex items-center justify-between text-slate-700"
          style={{ fontSize: `${smallSizePx}px` }}
        >
          <span>Çeşid / Miqdar:</span>
          <span className="font-mono tabular-nums">
            {receipt.items.length} çeşid · {totalUnits} vahid
          </span>
        </div>

        {hasOrderDiscount ? (
          <>
            <div
              className="flex items-center justify-between text-slate-700"
              style={{ fontSize: `${smallSizePx}px` }}
            >
              <span>Ara cəm:</span>
              <span className="font-mono tabular-nums">
                {formatMoney(subtotalValue)}
              </span>
            </div>
            <div
              className="flex items-center justify-between text-black font-semibold"
              style={{ fontSize: `${smallSizePx}px` }}
            >
              <span>Endirim:</span>
              <span className="font-mono tabular-nums">
                -{formatMoney(receipt.discountAmount!)}
              </span>
            </div>
          </>
        ) : null}

        <div
          className="flex items-center justify-between font-extrabold text-black pt-1"
          style={{ fontSize: `${totalSizePx}px` }}
        >
          <span>CƏMİ:</span>
          <span className="font-mono tabular-nums">
            {formatMoney(receipt.totalAmount)}
          </span>
        </div>

        {hasCashDetails ? (
          <div
            className="pt-1 space-y-0.5 text-slate-900 font-mono tabular-nums"
            style={{ fontSize: `${smallSizePx}px` }}
          >
            <div className="flex items-center justify-between">
              <span className="font-sans">Verilən nağd:</span>
              <span>{formatMoney(receipt.cashReceived!)}</span>
            </div>
            <div className="flex items-center justify-between font-bold">
              <span className="font-sans">Qalıq:</span>
              <span>{formatMoney(Math.max(0, receipt.changeAmount ?? 0))}</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Verification Barcode & Footer */}
      <div className="pt-3 text-center space-y-2">
        {s.showBarcode ? (
          <div className="flex justify-center">
            <BarcodeGraphic code={receipt.receiptNumber} compact />
          </div>
        ) : null}
        {s.footerNote ? (
          <p
            className="font-medium text-slate-800 leading-relaxed pt-0.5"
            style={{ fontSize: `${smallSizePx}px` }}
          >
            {s.footerNote}
          </p>
        ) : null}
        {s.headerBadge ? (
          <div
            className="font-mono text-slate-600 tracking-wider"
            style={{ fontSize: `${Math.max(8, smallSizePx - 1)}px` }}
          >
            *** {s.headerBadge} ***
          </div>
        ) : null}
        <ReceiptPromoFooter settings={s} smallSizePx={smallSizePx} />
      </div>
    </div>
  );
}

export function ThermalReceipt({
  receipt,
  settings,
  enablePrintPortal = true,
}: ThermalReceiptProps) {
  return (
    <>
      {/* Screen Preview */}
      <div className="bg-slate-200/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 overflow-x-auto">
        <ReceiptPaperContent
          receipt={receipt}
          settings={settings}
          isPrintTarget={false}
        />
      </div>

      {/* Dedicated Thermal Print Portal (visible only during @media print) */}
      {enablePrintPortal && typeof document !== 'undefined'
        ? createPortal(
            <div
              id="thermal-receipt-print-root"
              data-paper-width={settings.paperWidth}
            >
              <ReceiptPaperContent
                receipt={receipt}
                settings={settings}
                isPrintTarget
              />
            </div>,
            document.body
          )
        : null}
    </>
  );
}
