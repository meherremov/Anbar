import { createPortal } from 'react-dom';
import type { ReceiptData, ReceiptSettings } from '../types/inventory';
import { BarcodeGraphic } from './BarcodeGraphic';

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

function ReceiptPaperContent({
  receipt,
  settings,
  isPrintTarget,
}: {
  receipt: ReceiptData;
  settings: ReceiptSettings;
  isPrintTarget: boolean;
}) {
  const is58mm = settings.paperWidth === '58mm';
  const totalUnits = Math.round(
    receipt.items.reduce((acc, item) => acc + item.quantity, 0) * 100
  ) / 100;

  return (
    <div
      className={`bg-white text-black font-mono tabular-nums leading-snug ${
        isPrintTarget
          ? is58mm
            ? 'w-[48mm] px-1.5 py-2 text-[10px]'
            : 'w-[72mm] px-2.5 py-3 text-[11px]'
          : is58mm
          ? 'w-[240px] mx-auto px-4 py-5 text-[11px] border border-slate-200 shadow-sm'
          : 'w-[310px] mx-auto px-5 py-6 text-[12px] border border-slate-200 shadow-sm'
      }`}
    >
      {/* Store Header */}
      <div className="text-center space-y-0.5 pb-2.5 border-b border-dashed border-slate-900">
        <div
          className={`font-bold tracking-wide uppercase text-black ${
            is58mm ? 'text-sm' : 'text-base'
          }`}
        >
          {settings.storeName || 'MƏKTƏBLİ'}
        </div>
        {settings.subtitle ? (
          <div className="text-[10px] text-slate-800">{settings.subtitle}</div>
        ) : null}
        {settings.address ? (
          <div className="text-[10px] text-slate-800">{settings.address}</div>
        ) : null}
        {settings.phone ? (
          <div className="text-[10px] text-slate-800">Tel: {settings.phone}</div>
        ) : null}
        {settings.taxId ? (
          <div className="text-[10px] text-slate-800">VÖEN: {settings.taxId}</div>
        ) : null}
      </div>

      {/* Receipt Metadata */}
      <div className="py-2 border-b border-dashed border-slate-900 space-y-0.5 text-[10px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-700">Çek №:</span>
          <span className="font-bold text-black">{receipt.receiptNumber}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-700">Tarix:</span>
          <span className="text-black">{formatReceiptDateTime(receipt.issuedAt)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-700">Kassir:</span>
          <span className="text-black truncate max-w-[160px]">{receipt.cashierLabel}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-700">Ödəniş:</span>
          <span className="font-semibold text-black">
            {receipt.paymentMethod === 'card'
              ? 'Bank kartı'
              : receipt.paymentMethod === 'mobile'
              ? 'Mobil ödəniş'
              : 'Nağd'}
          </span>
        </div>
      </div>

      {/* Itemized Products */}
      <div className="py-2 border-b border-dashed border-slate-900">
        <div className="flex items-center justify-between text-[10px] font-bold pb-1 mb-1.5 border-b border-slate-400">
          <span>Məhsul</span>
          <span>Məbləğ</span>
        </div>

        <div className="space-y-2">
          {receipt.items.map((item, idx) => (
            <div key={`${item.productId}-${idx}`} className="space-y-0.5">
              <div className="font-semibold text-black break-words">
                {idx + 1}. {item.productName}
              </div>
              <div className="flex items-center justify-between gap-2 text-[10px] pl-3">
                <span className="text-slate-800">
                  {item.quantity} {item.unit} × {formatMoney(item.unitPrice)}
                </span>
                <span className="font-semibold text-black shrink-0">
                  {formatMoney(item.lineTotal)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="py-2.5 border-b border-dashed border-slate-900 space-y-1">
        <div className="flex items-center justify-between text-[10px] text-slate-800">
          <span>Çeşid / Miqdar:</span>
          <span>
            {receipt.items.length} çeşid · {totalUnits} vahid
          </span>
        </div>

        {typeof receipt.discountAmount === 'number' && receipt.discountAmount > 0 ? (
          <>
            <div className="flex items-center justify-between text-[10px] text-slate-800">
              <span>Ara cəm:</span>
              <span>
                {formatMoney(
                  typeof receipt.subtotalAmount === 'number'
                    ? receipt.subtotalAmount
                    : receipt.totalAmount + receipt.discountAmount
                )}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-900 font-semibold">
              <span>Endirim:</span>
              <span>-{formatMoney(receipt.discountAmount)}</span>
            </div>
          </>
        ) : null}

        <div
          className={`flex items-center justify-between font-bold text-black pt-1 ${
            is58mm ? 'text-sm' : 'text-base'
          }`}
        >
          <span>CƏMİ:</span>
          <span>{formatMoney(receipt.totalAmount)}</span>
        </div>

        {typeof receipt.cashReceived === 'number' && receipt.cashReceived > 0 ? (
          <div className="pt-1 space-y-0.5 text-[10px] text-slate-900">
            <div className="flex items-center justify-between">
              <span>Verilən nağd:</span>
              <span>{formatMoney(receipt.cashReceived)}</span>
            </div>
            <div className="flex items-center justify-between font-semibold">
              <span>Qalıq:</span>
              <span>{formatMoney(Math.max(0, receipt.changeAmount ?? 0))}</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Verification Barcode & Footer */}
      <div className="pt-3 text-center space-y-2">
        <div className="flex justify-center">
          <BarcodeGraphic code={receipt.receiptNumber} compact />
        </div>
        {settings.footerNote ? (
          <p className="text-[10px] font-medium text-black leading-relaxed pt-0.5">
            {settings.footerNote}
          </p>
        ) : null}
        <div className="text-[9px] text-slate-600">*** SATIŞ ÇEKİ ***</div>
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
