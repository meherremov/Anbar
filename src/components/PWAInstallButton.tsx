import { Download, Share, X } from 'lucide-react';
import { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1D72F3] hover:bg-[#1662D6] rounded-lg shadow-xs transition-colors whitespace-nowrap cursor-pointer"
        title="Tətbiqi kompüterə və ya telefona quraşdırın (internetsiz işləmə üçün)"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">Tətbiqi quraşdır</span>
        <span className="sm:hidden">Quraşdır</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>Tətbiqi quraşdır</span>
        </button>

        {showIOSGuide ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-pwa-install-title"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h3
                  id="ios-pwa-install-title"
                  className="text-base font-bold text-slate-900 dark:text-white"
                >
                  iPhone / iPad-ə quraşdırın
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                  aria-label="Bağla"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed list-decimal list-inside">
                <li>
                  Safari panelində aşağıdakı{' '}
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-900 dark:text-white">
                    <Share className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    Paylaş (Share)
                  </span>{' '}
                  düyməsinə toxunun.
                </li>
                <li>
                  Aşağı sürüşdürüb{' '}
                  <strong className="text-slate-900 dark:text-white">
                    Ana Ekrana Əlavə Et (Add to Home Screen)
                  </strong>{' '}
                  seçiminə toxunun.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                Bağla
              </button>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return null;
}
