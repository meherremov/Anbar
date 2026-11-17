import { AlertCircle, Download, Printer, Usb } from 'lucide-react';
import { useState } from 'react';
import type { ReceiptData, ReceiptSettings } from '../types/inventory';
import {
  downloadReceiptPng,
  printViaWebSerial,
  printViaWebUsb,
  triggerBrowserPrint,
} from '../utils/thermalPrinter';

interface ReceiptActionControlsProps {
  receipt: ReceiptData;
  settings: ReceiptSettings;
  onPrintClick?: () => Promise<'opened' | 'blocked'>;
  hideBrowserPrint?: boolean;
}

export function ReceiptActionControls({
  receipt,
  settings,
  onPrintClick,
  hideBrowserPrint = false,
}: ReceiptActionControlsProps) {
  const [printFeedback, setPrintFeedback] = useState<{
    tone: 'warn' | 'ok' | 'err';
    text: string;
  } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const handleBrowserPrint = async () => {
    setPrintFeedback(null);
    const result = onPrintClick
      ? await onPrintClick()
      : await triggerBrowserPrint(settings.paperWidth);
    if (result === 'blocked') {
      setPrintFeedback({
        tone: 'warn',
        text: 'Bu önizləmə pəncərəsində brauzer standart çap dialoqunu bloklayır. Saytı GitHub Pages və ya ayrıca brauzer tabında açdıqda birbaşa Zyklen Z-604 printer pəncərəsi açılacaq; burada isə "Çeki yüklə (PNG)" düyməsindən istifadə edə bilərsiniz.',
      });
    }
  };

  const handleDownloadPng = async () => {
    setPrintFeedback(null);
    setBusyAction('png');
    try {
      await downloadReceiptPng(receipt, settings);
      setPrintFeedback({
        tone: 'ok',
        text: `Çek şəkli yükləndi (cek-${receipt.receiptNumber}.png). İstənilən printer proqramından çap edə bilərsiniz.`,
      });
    } catch (err) {
      setPrintFeedback({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Çek şəkli yüklənə bilmədi.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleHardwarePrint = async (mode: 'usb' | 'serial') => {
    setPrintFeedback(null);
    setBusyAction(mode);
    try {
      if (mode === 'usb') {
        await printViaWebUsb(receipt, settings);
      } else {
        await printViaWebSerial(receipt, settings);
      }
      setPrintFeedback({
        tone: 'ok',
        text: 'Çek birbaşa termal printerə göndərildi.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('No port selected') || msg.includes('No device selected')) {
        setPrintFeedback(null);
      } else if (msg.includes('Access denied') || msg.includes('claimInterface')) {
        setPrintFeedback({
          tone: 'warn',
          text: 'USB printer əməliyyat sisteminin drayveri ilə məşğuldur. Standart "Çap et" düyməsini (və ya COM portunu) istifadə edin.',
        });
      } else {
        setPrintFeedback({
          tone: 'err',
          text: msg || 'Printerə qoşulmaq mümkün olmadı.',
        });
      }
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!hideBrowserPrint ? (
          <button
            type="button"
            onClick={handleBrowserPrint}
            className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg cursor-pointer"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span>Çap et ({settings.paperWidth})</span>
          </button>
        ) : null}

        <button
          type="button"
          disabled={busyAction !== null}
          onClick={handleDownloadPng}
          className={`${
            hideBrowserPrint ? 'w-full' : ''
          } inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 rounded-lg cursor-pointer`}
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>{busyAction === 'png' ? 'Hazırlanır...' : 'Çeki yüklə (PNG)'}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={() => handleHardwarePrint('usb')}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-50 rounded-lg cursor-pointer"
        >
          <Usb className="w-3.5 h-3.5 shrink-0" />
          <span>{busyAction === 'usb' ? 'Göndərilir...' : 'Birbaşa Zyklen USB'}</span>
        </button>
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={() => handleHardwarePrint('serial')}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-50 rounded-lg cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5 shrink-0" />
          <span>{busyAction === 'serial' ? 'Göndərilir...' : 'Birbaşa COM / Bluetooth'}</span>
        </button>
      </div>

      {printFeedback ? (
        <div
          className={`p-3 rounded-lg border text-xs leading-relaxed flex items-start gap-2 ${
            printFeedback.tone === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
              : printFeedback.tone === 'warn'
              ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200'
              : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300'
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{printFeedback.text}</span>
        </div>
      ) : null}
    </div>
  );
}
