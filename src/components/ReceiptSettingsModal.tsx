import { Check, Printer, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  RECEIPT_LIMITS,
  type ReceiptSettings,
  type ThermalPaperWidth,
} from '../types/inventory';

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

  useEffect(() => {
    if (isOpen) {
      setForm(settings);
      setError(null);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const storeName = form.storeName.trim().slice(0, RECEIPT_LIMITS.STORE_NAME_MAX);
    if (!storeName) {
      setError('Çekdə görünəcək mağaza adını daxil edin.');
      return;
    }

    const sanitized: ReceiptSettings = {
      storeName,
      subtitle: form.subtitle.trim().slice(0, RECEIPT_LIMITS.SUBTITLE_MAX),
      address: form.address.trim().slice(0, RECEIPT_LIMITS.ADDRESS_MAX),
      phone: form.phone.trim().slice(0, RECEIPT_LIMITS.PHONE_MAX),
      taxId: form.taxId.trim().slice(0, RECEIPT_LIMITS.TAX_ID_MAX),
      footerNote: form.footerNote.trim().slice(0, RECEIPT_LIMITS.FOOTER_NOTE_MAX),
      paperWidth: form.paperWidth === '58mm' ? '58mm' : '80mm',
    };

    setSaving(true);
    try {
      await onSave(sanitized);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Çek ayarları yadda saxlanılarkən xəta baş verdi.'
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
      <div className="w-full max-w-lg bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 inline-flex items-center justify-center shrink-0">
              <Printer className="w-4 h-4" />
            </span>
            <div>
              <h2 id="receipt-settings-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Çek və Termal Printer Ayarları
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Zyklen Z-604 / termal çek aparatı üçün başlıq, ünvan və kağız ölçüsü
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {error ? (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div>
            <label
              htmlFor="receipt-store-name"
              className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
            >
              Mağaza adı (çekin yuxarısında görünəcək) *
            </label>
            <input
              id="receipt-store-name"
              type="text"
              required
              maxLength={RECEIPT_LIMITS.STORE_NAME_MAX}
              value={form.storeName}
              onChange={(e) => setForm((p) => ({ ...p, storeName: e.target.value }))}
              placeholder="Məs: OFİS ANBARI"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="receipt-subtitle"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
              >
                Alt başlıq
              </label>
              <input
                id="receipt-subtitle"
                type="text"
                maxLength={RECEIPT_LIMITS.SUBTITLE_MAX}
                value={form.subtitle}
                onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))}
                placeholder="Ofis ləvazımatları mağazası"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="receipt-phone"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
              >
                Əlaqə telefonu
              </label>
              <input
                id="receipt-phone"
                type="text"
                maxLength={RECEIPT_LIMITS.PHONE_MAX}
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+994 50 000 00 00"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="receipt-address"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
              >
                Mağaza ünvanı
              </label>
              <input
                id="receipt-address"
                type="text"
                maxLength={RECEIPT_LIMITS.ADDRESS_MAX}
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                placeholder="Məs: Bakı ş., Nizami küç. 12"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="receipt-tax-id"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
              >
                VÖEN (istəyə bağlı)
              </label>
              <input
                id="receipt-tax-id"
                type="text"
                maxLength={RECEIPT_LIMITS.TAX_ID_MAX}
                value={form.taxId}
                onChange={(e) => setForm((p) => ({ ...p, taxId: e.target.value }))}
                placeholder="1234567891"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="receipt-footer"
              className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
            >
              Çek altı təşəkkür qeydi
            </label>
            <input
              id="receipt-footer"
              type="text"
              maxLength={RECEIPT_LIMITS.FOOTER_NOTE_MAX}
              value={form.footerNote}
              onChange={(e) => setForm((p) => ({ ...p, footerNote: e.target.value }))}
              placeholder="Alış-verişiniz üçün təşəkkür edirik!"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              Termal printer kağız eni
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(['80mm', '58mm'] as ThermalPaperWidth[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, paperWidth: w }))}
                  className={`py-2.5 px-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    form.paperWidth === w
                      ? 'border-blue-700 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {w === '80mm' ? '80 mm (Standart POS)' : '58 mm (Kompakt termal)'}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Zyklen Z-604 üçün kağız eni adətən <span className="font-semibold text-slate-800 dark:text-slate-200">80 mm</span>-dir. Çap pəncərəsində quraşdırılmış printeri seçib kənar boşluqları (Margins) <span className="font-semibold text-slate-800 dark:text-slate-200">None</span> edin.
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
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
              <span>{saving ? 'Yadda saxlanılır...' : 'Ayarları yadda saxla'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
