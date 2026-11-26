import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Minus,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatPaymentMethodLabel,
  getNetSaleAmount,
  getNetSaleQuantity,
  RETURN_LIMITS,
  type BarcodeScanResult,
  type SaleRecord,
  type StationeryIconId,
} from '../types/inventory';
import { parseLocaleNumber } from '../utils/barcodeDecoder';
import { ProductThumb } from './ProductThumb';

interface ReturnSaleModalProps {
  isOpen: boolean;
  initialSale: SaleRecord | null;
  sales: SaleRecord[];
  productIconMap?: Map<string, StationeryIconId>;
  externalScan?: { seq: number; scan: BarcodeScanResult } | null;
  onClose: () => void;
  onConfirmReturn: (
    sale: SaleRecord,
    returnQuantity: number,
    reason?: string
  ) => Promise<{ stockRestored: boolean }>;
}

const QUICK_REASONS = [
  'Müştəri fikrini dəyişdi',
  'Zədəli / defekt',
  'Səhv məhsul',
] as const;

function getSaleTimestampMs(sale: SaleRecord): number {
  if (sale.soldAt && typeof sale.soldAt.toMillis === 'function') {
    return sale.soldAt.toMillis();
  }
  const match = /_(\d{13})_/.exec(sale.id);
  if (match) {
    const parsed = Number(match[1]);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function formatSaleDate(ts: SaleRecord['soldAt'], id: string): string {
  const ms = getSaleTimestampMs({ soldAt: ts, id } as SaleRecord);
  if (!ms) return 'İndi';
  return new Date(ms).toLocaleString('az-AZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ReturnSaleModal({
  isOpen,
  initialSale,
  sales,
  productIconMap,
  externalScan,
  onClose,
  onConfirmReturn,
}: ReturnSaleModalProps) {
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [returnQtyInput, setReturnQtyInput] = useState<string>('1');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const lastExternalSeqRef = useRef<number>(externalScan?.seq ?? 0);

  useEffect(() => {
    if (!isOpen) {
      setSelectedSale(null);
      setSearchQuery('');
      setReturnQtyInput('1');
      setReason('');
      setError(null);
      setSuccessText(null);
      return;
    }

    setError(null);
    setSuccessText(null);
    setReason('');
    if (initialSale) {
      setSelectedSale(initialSale);
      const remaining = getNetSaleQuantity(initialSale);
      setReturnQtyInput(String(remaining > 0 ? remaining : 1));
    } else {
      setSelectedSale(null);
      setSearchQuery('');
      window.setTimeout(() => searchInputRef.current?.focus(), 40);
    }
  }, [isOpen, initialSale]);

  useEffect(() => {
    if (!externalScan || externalScan.seq === lastExternalSeqRef.current) return;
    lastExternalSeqRef.current = externalScan.seq;
    if (!isOpen) return;
    setSelectedSale(null);
    setSearchQuery(externalScan.scan.code);
    setSuccessText(null);
    setError(null);
  }, [externalScan, isOpen]);

  const returnableSales = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...sales]
      .filter((s) => getNetSaleQuantity(s) > 0)
      .sort((a, b) => getSaleTimestampMs(b) - getSaleTimestampMs(a));

    if (!q) return sorted.slice(0, 40);
    return sorted
      .filter((s) =>
        `${s.productName} ${s.barcode} ${s.receiptNumber || ''} ${s.category}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 40);
  }, [sales, searchQuery]);

  const selectSaleForReturn = (sale: SaleRecord) => {
    const remaining = getNetSaleQuantity(sale);
    setSelectedSale(sale);
    setReturnQtyInput(String(remaining > 0 ? remaining : 1));
    setReason('');
    setError(null);
    setSuccessText(null);
  };

  const maxReturnQty = selectedSale ? getNetSaleQuantity(selectedSale) : 0;
  const maxRefundAmount = selectedSale ? getNetSaleAmount(selectedSale) : 0;
  const minReturnQtyStep = maxReturnQty > 0 && maxReturnQty < 1 ? maxReturnQty : 1;

  const parsedReturnQty = useMemo(() => {
    const val = parseLocaleNumber(returnQtyInput);
    if (Number.isNaN(val) || val <= 0) return 0;
    return Math.min(maxReturnQty, Math.round(val * 100) / 100);
  }, [returnQtyInput, maxReturnQty]);

  const refundPreview = useMemo(() => {
    if (!selectedSale || parsedReturnQty <= 0) return 0;
    if (parsedReturnQty >= maxReturnQty) {
      return maxRefundAmount;
    }
    const proportional =
      Math.round((parsedReturnQty / selectedSale.quantity) * selectedSale.totalAmount * 100) /
      100;
    return Math.min(maxRefundAmount, Math.max(0, proportional));
  }, [selectedSale, parsedReturnQty, maxReturnQty, maxRefundAmount]);

  const handleSubmitReturn = async () => {
    if (!selectedSale || submitting) return;
    if (maxReturnQty <= 0) {
      setError('Bu satışdakı bütün məhsullar artıq qaytarılıb.');
      return;
    }
    if (parsedReturnQty <= 0 || parsedReturnQty > maxReturnQty) {
      setError(`Qaytarılacaq say 0-dan böyük və maksimum ${maxReturnQty} olmalıdır.`);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const result = await onConfirmReturn(
        selectedSale,
        parsedReturnQty,
        reason.trim().slice(0, RETURN_LIMITS.REASON_MAX) || undefined
      );
      setSuccessText(
        result.stockRestored
          ? `${parsedReturnQty} ${selectedSale.unit} "${selectedSale.productName}" qaytarıldı, stok bərpa olundu (${refundPreview.toFixed(2)} AZN).`
          : `${parsedReturnQty} ${selectedSale.unit} "${selectedSale.productName}" iadə kimi qeyd edildi (${refundPreview.toFixed(2)} AZN). Məhsul anbardan silindiyi üçün yalnız satış gəliri yeniləndi.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Qaytarma əməliyyatı zamanı xəta baş verdi.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="return-modal-title"
    >
      <div className="w-full max-w-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 inline-flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2
                id="return-modal-title"
                className="text-base font-bold text-slate-900 dark:text-white truncate"
              >
                Mal Qaytarma (İadə)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Qaytarılan məhsul avtomatik anbar stokuna geri əlavə olunur
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            aria-label="Bağla"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {successText ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 flex items-start gap-3 text-sm text-emerald-900 dark:text-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Qaytarma uğurla tamamlandı</div>
                  <p className="text-xs mt-1 leading-relaxed">{successText}</p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSale(null);
                    setSuccessText(null);
                    setError(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  Başqa mal qaytar
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1976F3] hover:bg-[#1565D8] rounded-lg cursor-pointer"
                >
                  Bağla
                </button>
              </div>
            </div>
          ) : !selectedSale ? (
            /* Search & Pick Sale View */
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Çek nömrəsi (CHK-...), məhsul adı və ya barkod oxudun..."
                  className="w-full pl-10 pr-9 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    aria-label="Axtarışı təmizlə"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : null}
              </div>

              {returnableSales.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5">
                  <RotateCcw className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Qaytarıla bilən satış tapılmadı
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Çek nömrəsini və ya məhsul adını dəqiqləşdirin.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-[52vh] overflow-y-auto">
                  {returnableSales.map((sale) => {
                    const remainingQty = getNetSaleQuantity(sale);
                    const remainingAmt = getNetSaleAmount(sale);
                    const prevReturned = sale.returnedQuantity ?? 0;
                    return (
                      <div
                        key={sale.id}
                        className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <ProductThumb
                            name={sale.productName}
                            category={sale.category}
                            icon={productIconMap?.get(sale.productId)}
                            sizeClassName="w-10 h-10"
                            imgClassName="w-8 h-8"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {sale.productName}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                              {sale.receiptNumber || 'Tək satış'} · {formatSaleDate(sale.soldAt, sale.id)}
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums mt-0.5">
                              Qalan: <span className="font-bold">{remainingQty} {sale.unit}</span> ·{' '}
                              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                {remainingAmt.toFixed(2)} ₼
                              </span>
                              {prevReturned > 0 ? (
                                <span className="ml-2 text-amber-700 dark:text-amber-400">
                                  ({prevReturned} {sale.unit} artıq qaytarılıb)
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => selectSaleForReturn(sale)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 rounded-lg shrink-0 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Seç</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Confirm Quantity & Reason View */
            <div className="space-y-4">
              {!initialSale ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSale(null);
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Digər satışlara qayıt</span>
                </button>
              ) : null}

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <ProductThumb
                    name={selectedSale.productName}
                    category={selectedSale.category}
                    icon={productIconMap?.get(selectedSale.productId)}
                    sizeClassName="w-11 h-11"
                    imgClassName="w-9 h-9"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {selectedSale.productName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                      {selectedSale.receiptNumber || 'Tək satış'} ·{' '}
                      {formatPaymentMethodLabel(selectedSale.paymentMethod)} · BAR:{' '}
                      {selectedSale.barcode}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                      Satılmış say:{' '}
                      <span className="font-mono font-semibold">
                        {selectedSale.quantity} {selectedSale.unit}
                      </span>{' '}
                      · Qaytarıla bilər:{' '}
                      <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                        {maxReturnQty} {selectedSale.unit}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums shrink-0">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Qalıq satış</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {maxRefundAmount.toFixed(2)} ₼
                  </div>
                </div>
              </div>

              {error ? (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              {/* Return quantity selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label
                    htmlFor="return-qty-input"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                  >
                    Qaytarılacaq miqdar ({selectedSale.unit})
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          setReturnQtyInput(
                            String(
                              Math.max(
                                minReturnQtyStep,
                                Math.round((parsedReturnQty - 1) * 100) / 100
                              )
                            )
                          )
                        }
                        disabled={parsedReturnQty <= minReturnQtyStep}
                        className="px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                        aria-label="Azalt"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        id="return-qty-input"
                        type="text"
                        inputMode="decimal"
                        value={returnQtyInput}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setReturnQtyInput(e.target.value)}
                        onBlur={() => {
                          const parsed = parseLocaleNumber(returnQtyInput);
                          if (Number.isNaN(parsed) || parsed <= 0) {
                            setReturnQtyInput(String(minReturnQtyStep));
                          } else {
                            const clamped = Math.min(
                              maxReturnQty,
                              Math.max(0.01, Math.round(parsed * 100) / 100)
                            );
                            setReturnQtyInput(String(clamped));
                          }
                        }}
                        className="w-20 text-center py-2 text-sm font-mono tabular-nums font-bold text-slate-900 dark:text-white bg-transparent focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setReturnQtyInput(
                            String(
                              Math.min(
                                maxReturnQty,
                                Math.round((parsedReturnQty + 1) * 100) / 100
                              )
                            )
                          )
                        }
                        disabled={parsedReturnQty >= maxReturnQty}
                        className="px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                        aria-label="Artır"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReturnQtyInput(String(maxReturnQty))}
                      className="px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 rounded-lg cursor-pointer"
                    >
                      Hamısı ({maxReturnQty})
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-900 text-right">
                  <div className="text-xs font-medium text-amber-900 dark:text-amber-300">
                    Müştəriyə qaytarılacaq məbləğ
                  </div>
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-amber-700 dark:text-amber-400 mt-0.5">
                    {refundPreview.toFixed(2)} AZN
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <label
                  htmlFor="return-reason-input"
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  Qaytarma səbəbi (istəyə bağlı)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_REASONS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setReason((prev) => (prev === chip ? '' : chip))}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                        reason === chip
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <input
                  id="return-reason-input"
                  type="text"
                  maxLength={RETURN_LIMITS.REASON_MAX}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Qısa qeyd yaza bilərsiniz..."
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  Ləğv et
                </button>
                <button
                  type="button"
                  disabled={submitting || parsedReturnQty <= 0 || maxReturnQty <= 0}
                  onClick={() => void handleSubmitReturn()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>
                    {submitting
                      ? 'Qaytarılır...'
                      : `Qaytarmanı təsdiqlə (${refundPreview.toFixed(2)} ₼)`}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
