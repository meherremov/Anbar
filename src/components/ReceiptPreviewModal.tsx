import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Printer, Settings2, X } from 'lucide-react';
import type { ReceiptData, ReceiptSettings } from '../types/inventory';
import { prepareThermalPrintRoot } from '../utils/thermalPrinter';
import { ReceiptActionControls } from './ReceiptActionControls';
import { ThermalReceipt } from './ThermalReceipt';

interface ReceiptPreviewModalProps {
  isOpen: boolean;
  receipt: ReceiptData | null;
  settings: ReceiptSettings;
  onClose: () => void;
  onOpenSettings: () => void;
}

export function ReceiptPreviewModal({
  isOpen,
  receipt,
  settings,
  onClose,
  onOpenSettings,
}: ReceiptPreviewModalProps) {
  const [printBlockedNote, setPrintBlockedNote] = useState<string | null>(null);

  const isolateThermalPrintRoot = useCallback(() => {
    const printRoot = document.getElementById('thermal-receipt-print-root');
    if (!printRoot) {
      return () => {
        document.body.removeAttribute('data-thermal-print-only');
      };
    }
    return prepareThermalPrintRoot(settings.paperWidth);
  }, [settings.paperWidth]);

  // Ensure `beforeprint` / `afterprint` (and modal unmount) always toggle `data-thermal-print-only="true"`
  // and keep only `#thermal-receipt-print-root` visible during printing.
  useEffect(() => {
    if (!isOpen || !receipt) {
      setPrintBlockedNote(null);
      return;
    }

    let releasePrintIsolation: (() => void) | null = null;

    const handleBeforePrint = () => {
      releasePrintIsolation = isolateThermalPrintRoot();
    };

    const handleAfterPrint = () => {
      if (releasePrintIsolation) {
        releasePrintIsolation();
        releasePrintIsolation = null;
      } else {
        document.body.removeAttribute('data-thermal-print-only');
        document.querySelectorAll('.thermal-print-hidden').forEach((el) => {
          el.classList.remove('thermal-print-hidden');
        });
      }
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      handleAfterPrint();
    };
  }, [isOpen, receipt, isolateThermalPrintRoot]);

  const handlePrintClick = () => {
    setPrintBlockedNote(null);
    const cleanup = isolateThermalPrintRoot();

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
      setPrintBlockedNote(
        'Bu önizləmə pəncərəsində brauzer standart çap dialoqunu bloklayır. Saytı GitHub Pages və ya ayrıca brauzer tabında açdıqda birbaşa Zyklen Z-604 printer pəncərəsi açılacaq; burada isə "Çeki yüklə (PNG)" düyməsindən istifadə edə bilərsiniz.'
      );
      return;
    }

    const elapsed = performance.now() - start;
    window.setTimeout(() => {
      window.removeEventListener('beforeprint', onBeforePrint);
      if (!beforePrintFired && elapsed <= 80) {
        window.removeEventListener('afterprint', onAfterPrint);
        cleanup();
        setPrintBlockedNote(
          'Bu önizləmə pəncərəsində brauzer standart çap dialoqunu bloklayır. Saytı GitHub Pages və ya ayrıca brauzer tabında açdıqda birbaşa Zyklen Z-604 printer pəncərəsi açılacaq; burada isə "Çeki yüklə (PNG)" düyməsindən istifadə edə bilərsiniz.'
        );
      }
    }, 220);

    window.setTimeout(() => {
      window.removeEventListener('afterprint', onAfterPrint);
      cleanup();
    }, 60_000);
  };

  if (!isOpen || !receipt) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-preview-title"
    >
      <div className="w-full max-w-md bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 shrink-0">
          <div>
            <h2 id="receipt-preview-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Satış Çeki ({receipt.receiptNumber})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {settings.paperWidth} termal printer formatı · {receipt.items.length} çeşid
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Bağla"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <ThermalReceipt receipt={receipt} settings={settings} enablePrintPortal />

          <button
            type="button"
            onClick={handlePrintClick}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 shadow-xs rounded-lg transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span>Çap et ({settings.paperWidth})</span>
          </button>

          {printBlockedNote ? (
            <div className="p-3 rounded-lg border bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs leading-relaxed flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{printBlockedNote}</span>
            </div>
          ) : null}

          <ReceiptActionControls
            receipt={receipt}
            settings={settings}
            hideBrowserPrint
          />
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Çek ayarları</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
          >
            Bağla
          </button>
        </div>
      </div>
    </div>
  );
}
