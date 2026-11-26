import { Check, Lock, Shield, Trash2, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { ScreenLockSettings } from '../types/inventory';
import {
  generatePinSalt,
  hashPin,
  isValidPinFormat,
  LOCK_PIN_LIMITS,
  LOCK_TIMEOUT_OPTIONS,
} from '../utils/pinLock';

interface PinSetupModalProps {
  isOpen: boolean;
  currentSettings: ScreenLockSettings;
  onClose: () => void;
  onSave: (next: ScreenLockSettings, lockImmediately?: boolean) => Promise<void>;
}

export function PinSetupModal({
  isOpen,
  currentSettings,
  onClose,
  onSave,
}: PinSetupModalProps) {
  const hasExistingPin = Boolean(
    currentSettings.lockPinHash && currentSettings.lockPinSalt
  );

  const [pin, setPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(
    currentSettings.lockTimeoutSeconds > 0
      ? currentSettings.lockTimeoutSeconds
      : 180
  );
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPin('');
    setConfirmPin('');
    setTimeoutSeconds(
      currentSettings.lockTimeoutSeconds > 0
        ? currentSettings.lockTimeoutSeconds
        : 180
    );
    setError(null);
    setSaving(false);
  }, [isOpen, currentSettings.lockTimeoutSeconds]);

  if (!isOpen) return null;

  const submitPin = async (lockImmediately: boolean) => {
    setError(null);
    const trimmed = pin.trim();
    const trimmedConfirm = confirmPin.trim();

    if (!isValidPinFormat(trimmed)) {
      setError(
        `PIN kod ${LOCK_PIN_LIMITS.MIN_LENGTH}–${LOCK_PIN_LIMITS.MAX_LENGTH} rəqəmdən ibarət olmalıdır.`
      );
      return;
    }
    if (trimmed !== trimmedConfirm) {
      setError('Daxil edilən PIN kodlar eyni deyil.');
      return;
    }

    setSaving(true);
    try {
      const salt = generatePinSalt();
      const hash = await hashPin(trimmed, salt);
      await onSave(
        {
          lockEnabled: true,
          lockTimeoutSeconds: timeoutSeconds,
          lockPinHash: hash,
          lockPinSalt: salt,
          lockPinLength: trimmed.length,
        },
        lockImmediately
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'PIN kod yadda saxlanılarkən xəta baş verdi.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitPin(false);
  };

  const handleRemovePin = async () => {
    setError(null);
    setSaving(true);
    try {
      await onSave({
        lockEnabled: false,
        lockTimeoutSeconds: 0,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'PIN silinərkən xəta baş verdi.'
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
      aria-labelledby="pin-setup-title"
    >
      <div className="w-full max-w-md bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-[#1976F3] dark:text-blue-400 inline-flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4" />
            </span>
            <div>
              <h2
                id="pin-setup-title"
                className="text-base font-bold text-slate-900 dark:text-white"
              >
                {hasExistingPin ? 'Ekran Kilidi PIN Kodunu Dəyiş' : 'Ekran Kilidi (PIN) Təyin Et'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Sistem istifadəsiz qaldıqda seçdiyiniz vaxtdan sonra avtomatik koda düşəcək
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

        <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
          {error ? (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div>
            <label
              htmlFor="pin-setup-input"
              className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
            >
              Yeni PIN kod (4–6 rəqəm) *
            </label>
            <input
              id="pin-setup-input"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={LOCK_PIN_LIMITS.MAX_LENGTH}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Məs: 2580"
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-base font-mono tracking-[0.3em] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="pin-setup-confirm"
              className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
            >
              PIN kodu təkrarlayın *
            </label>
            <input
              id="pin-setup-confirm"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={LOCK_PIN_LIMITS.MAX_LENGTH}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-base font-mono tracking-[0.3em] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
            />
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              İstifadəsiz qaldıqda kilidləmə müddəti
            </span>
            <div className="grid grid-cols-3 gap-2">
              {LOCK_TIMEOUT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTimeoutSeconds(opt.value)}
                  className={`py-2 px-2.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    timeoutSeconds === opt.value
                      ? 'border-[#1976F3] bg-blue-50 dark:bg-blue-950/60 text-[#1976F3] dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            {hasExistingPin ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleRemovePin()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Kilidi ləğv et</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1976F3] hover:bg-[#1565D8] disabled:opacity-60 rounded-lg cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{saving ? 'Yadda saxlanılır...' : 'Yadda saxla'}</span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitPin(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 dark:hover:bg-amber-900/80 border border-amber-300 dark:border-amber-700 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Yadda saxla və kilidlə</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
