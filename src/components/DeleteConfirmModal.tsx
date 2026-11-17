import { Trash2, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmModal({
  isOpen,
  title,
  description,
  confirmLabel = 'Bəli, sil',
  busy = false,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
    >
      <div className="w-full max-w-md bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 text-red-700 dark:text-red-400">
            <span className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 inline-flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4" />
            </span>
            <h2 id="delete-confirm-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Bağla"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 mt-3 leading-relaxed">{description}</p>

        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap cursor-pointer"
          >
            Ləğv et
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg whitespace-nowrap cursor-pointer"
          >
            {busy ? 'Silinir...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
