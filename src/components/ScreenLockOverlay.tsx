import { Delete, Lock, LogOut, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { verifyPin } from '../utils/pinLock';

interface ScreenLockOverlayProps {
  isOpen: boolean;
  reason: 'idle' | 'manual';
  storeName: string;
  userEmail: string;
  pinHash: string;
  pinSalt: string;
  pinLength: number;
  onUnlock: () => void;
  onSignOut: () => Promise<void>;
}

const MAX_FAILED_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 30;

export function ScreenLockOverlay({
  isOpen,
  reason,
  storeName,
  userEmail,
  pinHash,
  pinSalt,
  pinLength,
  onUnlock,
  onSignOut,
}: ScreenLockOverlayProps) {
  const [entered, setEntered] = useState<string>('');
  const [verifying, setVerifying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [failedCount, setFailedCount] = useState<number>(0);
  const [cooldownLeft, setCooldownLeft] = useState<number>(0);
  const [signingOut, setSigningOut] = useState<boolean>(false);

  const safeLength = Math.min(6, Math.max(4, pinLength || 4));

  useEffect(() => {
    if (!isOpen) {
      setEntered('');
      setError(null);
      setFailedCount(0);
      setCooldownLeft(0);
      setVerifying(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownLeft((prev) => {
        if (prev <= 1) {
          setError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownLeft]);

  const attemptVerify = useCallback(
    async (candidate: string) => {
      if (verifying || cooldownLeft > 0) return;
      if (candidate.length < 4) {
        setError('Ən azı 4 rəqəmli PIN daxil edin.');
        return;
      }

      setVerifying(true);
      setError(null);
      try {
        const ok = await verifyPin(candidate, pinSalt, pinHash);
        if (ok) {
          setEntered('');
          setFailedCount(0);
          onUnlock();
          return;
        }

        const nextFailed = failedCount + 1;
        setFailedCount(nextFailed);
        setEntered('');
        if (nextFailed >= MAX_FAILED_ATTEMPTS) {
          setCooldownLeft(COOLDOWN_SECONDS);
          setFailedCount(0);
          setError(
            `Ardıcıl ${MAX_FAILED_ATTEMPTS} səhv cəhd edildi. ${COOLDOWN_SECONDS} saniyə gözləyin.`
          );
        } else {
          setError(
            `PIN kod yanlışdır (${MAX_FAILED_ATTEMPTS - nextFailed} cəhd qaldı)`
          );
        }
      } catch {
        setError('PIN yoxlanılarkən xəta baş verdi.');
        setEntered('');
      } finally {
        setVerifying(false);
      }
    },
    [verifying, cooldownLeft, pinSalt, pinHash, failedCount, onUnlock]
  );

  const appendDigit = useCallback(
    (digit: string) => {
      if (verifying || cooldownLeft > 0) return;
      setError(null);
      setEntered((prev) => {
        if (prev.length >= safeLength) return prev;
        const next = `${prev}${digit}`;
        if (next.length === safeLength) {
          window.setTimeout(() => {
            void attemptVerify(next);
          }, 40);
        }
        return next;
      });
    },
    [verifying, cooldownLeft, safeLength, attemptVerify]
  );

  const handleBackspace = useCallback(() => {
    if (verifying || cooldownLeft > 0) return;
    setError(null);
    setEntered((prev) => prev.slice(0, -1));
  }, [verifying, cooldownLeft]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        appendDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setEntered('');
        setError(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void attemptVerify(entered);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, appendDigit, handleBackspace, attemptVerify, entered]);

  const handleForgotSignOut = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-lg p-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="screen-lock-title"
    >
      <div className="w-full max-w-sm bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 text-center border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
          <div className="w-12 h-12 rounded-2xl bg-[#1976F3]/12 text-[#1976F3] dark:text-blue-400 inline-flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h2
            id="screen-lock-title"
            className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight"
          >
            {storeName || 'Məktəbli'}
          </h2>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
            {reason === 'idle'
              ? 'Sistem istifadəsiz qaldığı üçün avtomatik kilidlənib'
              : 'Kassa ekranı kilidlənib'}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
            {userEmail}
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* PIN Dot Indicators */}
          <div className="flex items-center justify-center gap-3">
            {Array.from({ length: safeLength }).map((_, idx) => {
              const filled = idx < entered.length;
              return (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                    filled
                      ? 'bg-[#1976F3] border-[#1976F3] scale-110'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                  }`}
                />
              );
            })}
          </div>

          {cooldownLeft > 0 ? (
            <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-xs font-medium text-amber-800 dark:text-amber-300 text-center tabular-nums">
              Çox sayda səhv cəhd. {cooldownLeft} san sonra yenidən cəhd edin.
            </div>
          ) : error ? (
            <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs font-medium text-red-700 dark:text-red-300 text-center">
              {error}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              Davam etmək üçün {safeLength} rəqəmli PIN kodu daxil edin
            </p>
          )}

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={verifying || cooldownLeft > 0}
                onClick={() => appendDigit(digit)}
                className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.97] text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white transition-all disabled:opacity-40 cursor-pointer"
              >
                {digit}
              </button>
            ))}

            <button
              type="button"
              disabled={verifying || cooldownLeft > 0 || entered.length === 0}
              onClick={() => {
                setEntered('');
                setError(null);
              }}
              className="h-12 rounded-xl bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
            >
              Təmizlə
            </button>

            <button
              type="button"
              disabled={verifying || cooldownLeft > 0}
              onClick={() => appendDigit('0')}
              className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.97] text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white transition-all disabled:opacity-40 cursor-pointer"
            >
              0
            </button>

            <button
              type="button"
              disabled={verifying || cooldownLeft > 0 || entered.length === 0}
              onClick={handleBackspace}
              aria-label="Sil"
              className="h-12 rounded-xl bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          <button
            type="button"
            disabled={verifying || cooldownLeft > 0 || entered.length < 4}
            onClick={() => void attemptVerify(entered)}
            className="w-full h-11 rounded-xl bg-[#1976F3] hover:bg-[#1565D8] disabled:opacity-50 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{verifying ? 'Yoxlanılır...' : 'Kilidi aç'}</span>
          </button>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-center">
            <button
              type="button"
              disabled={signingOut}
              onClick={() => void handleForgotSignOut()}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>
                {signingOut
                  ? 'Çıxış edilir...'
                  : 'PIN unutmusunuz? Hesabdan çıxın'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
