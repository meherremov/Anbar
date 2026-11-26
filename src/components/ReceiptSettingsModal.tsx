import { Check, Eye, Printer, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  RECEIPT_LIMITS,
  sanitizeReceiptSettings,
  type ReceiptData,
  type ReceiptSettings,
} from '../types/inventory';
import { ReceiptCustomizerControls } from './ReceiptCustomizerControls';
import { ThermalReceipt } from './ThermalReceipt';

interface ReceiptSettingsModalProps {
  isOpen: boolean;
  settings: ReceiptSettings;
  onClose: () => void;
  onSave: (next: ReceiptSettings) => Promise<void>;
}

export function ReceiptSettingsModal({
  isOpen,
  settings,
  onClose,
  onSave,
}: ReceiptSettingsModalProps) {
  const [form, setForm] = useState<ReceiptSettings>(settings);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [previewTimestamp] = useState<Date>(() => new Date());

  const sampleReceipt = useMemo<ReceiptData>(
    () => ({
      receiptNumber: 'MK-2026-0148',
      issuedAt: previewTimestamp,
      cashierLabel: 'Kassa №1',
      paymentMethod: 'cash',
      items: [
        {
          productId: 'sample-1',
          productName: 'Qələm gel mavi 0.5mm',
          barcode: '4760012345012',
          quantity: 3,
          unit: 'ədəd',
          unitPrice: 1.2,
          lineTotal: 3.6,
        },
        {
          productId: 'sample-2',
          productName: 'A4 kağız paketi 500 vərəq',
          barcode: '4760012345098',
          quantity: 1,
          unit: 'paket',
          unitPrice: 9.5,
          discountAmount: 0.5,
          lineTotal: 9.0,
        },
      ],
      subtotalAmount: 13.1,
      discountAmount: 0.5,
      totalAmount: 12.6,
      cashReceived: 20.0,
      changeAmount: 7.4,
    }),
    [previewTimestamp]
  );

  useEffect(() => {
    if (isOpen) {
      setForm(settings);
      setError(null);
      setActiveTab('edit');
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const storeName = form.storeName.trim().slice(0, RECEIPT_LIMITS.STORE_NAME_MAX);
    if (!storeName) {
      setError('Çekdə görünəcək mağaza adını daxil edin.');
      setActiveTab('edit');
      return;
    }

    const sanitized = sanitizeReceiptSettings({
      ...form,
      storeName,
    });

    setSaving(true);
    try {
      await onSave(sanitized);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Çek ayarları yadda saxlanılarkən xəta baş verdi.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-settings-title"
    >
      <div className="w-full max-w-2xl bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 inline-flex items-center justify-center shrink-0">
              <Printer className="w-4 h-4" />
            </span>
            <div>
              <h2
                id="receipt-settings-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                Çek Formaları və Printer Ayarları
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Zyklen Z-604 / termal çek nümunəsi, görünüş və mağaza məlumatları
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            aria-label="Bağla"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('edit')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'edit'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-[#1976F3] dark:text-blue-300 border border-[#1976F3]/40'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Forma və Fərdiləşdirmə</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'preview'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-[#1976F3] dark:text-blue-300 border border-[#1976F3]/40'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Canlı Önizləmə ({form.paperWidth})</span>
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 min-h-0"
        >
          <div className="p-5 overflow-y-auto flex-1 space-y-4">
            {error ? (
              <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            ) : null}

            {activeTab === 'edit' ? (
              <ReceiptCustomizerControls
                value={form}
                onChange={setForm}
                compact
                idPrefix="modal-receipt"
              />
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Seçilmiş çek nümunəsinin kağız üzərindəki görünüşü ({form.paperWidth}):
                </p>
                <ThermalReceipt
                  receipt={sampleReceipt}
                  settings={form}
                  enablePrintPortal={false}
                />
              </div>
            )}
          </div>

          <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 shrink-0 bg-slate-50/50 dark:bg-slate-900/40">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
            >
              Ləğv et
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 rounded-lg cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{saving ? 'Yadda saxlanılır...' : 'Yadda saxla'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
