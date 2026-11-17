import { Check, Copy, Trash2, UserPlus, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { OWNER_EMAIL } from '../firebase';
import {
  AUTH_LIMITS,
  EMAIL_PATTERN,
  type AuthorizedUser,
} from '../types/inventory';

interface AuthorizedUsersPanelProps {
  authorizedUsers: AuthorizedUser[];
  onAddUser: (email: string, label?: string) => Promise<void>;
  onRequestDeleteUser: (user: AuthorizedUser) => void;
}

export function AuthorizedUsersPanel({
  authorizedUsers,
  onAddUser,
  onRequestDeleteUser,
}: AuthorizedUsersPanelProps) {
  const [emailInput, setEmailInput] = useState<string>('');
  const [labelInput, setLabelInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const shareUrl = (() => {
    if (typeof window === 'undefined') {
      return 'https://ais-pre-l7yorhyeumcmc36f4mxw5p-258308573473.europe-west2.run.app';
    }
    const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    return `${window.location.origin}${basePath}`;
  })();

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback ignored if clipboard unavailable
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalized = emailInput.trim().toLowerCase().slice(0, AUTH_LIMITS.EMAIL_MAX);
    if (!normalized || !EMAIL_PATTERN.test(normalized)) {
      setError('Düzgün Gmail və ya e-poçt ünvanı daxil edin (məs: dostum@gmail.com).');
      return;
    }

    if (normalized === OWNER_EMAIL.toLowerCase()) {
      setError('Sizin hesabınız artıq əsas mağaza sahibi kimi sistemdədir.');
      return;
    }

    if (authorizedUsers.some((u) => u.email.toLowerCase() === normalized)) {
      setError('Bu Gmail ünvanına artıq giriş icazəsi verilib.');
      return;
    }

    const cleanLabel = labelInput.trim().slice(0, AUTH_LIMITS.LABEL_MAX);

    setBusy(true);
    try {
      await onAddUser(normalized, cleanLabel || undefined);
      setEmailInput('');
      setLabelInput('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'İstifadəçi əlavə edilərkən xəta baş verdi.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-6">
      {/* Share instructions + Link copy */}
      <div className="bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Dostunuza və ya işçinizə giriş icazəsi verin
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            Aşağıya dostunuzun Google (Gmail) ünvanını əlavə edin və saytın linkini ona
            göndərin. O, həmin linkdən &ldquo;Google ilə daxil ol&rdquo; düyməsinə basaraq
            bu mağazanın məhsul və satışlarına daxil ola biləcək.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
          <div className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300 truncate">
            {shareUrl}
          </div>
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Link kopyalandı</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                <span>Linki kopyala</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Add new authorized email */}
      <div className="bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Yeni icazəli Gmail əlavə et
        </h2>

        {error ? (
          <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 md:grid-cols-[1fr_240px_auto] gap-3"
        >
          <input
            type="email"
            required
            maxLength={AUTH_LIMITS.EMAIL_MAX}
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="Gmail ünvanı (məs: dostum@gmail.com)"
            aria-label="Gmail ünvanı"
            className="px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <input
            type="text"
            maxLength={AUTH_LIMITS.LABEL_MAX}
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            placeholder="Ad və ya qeyd (istəyə bağlı)"
            aria-label="Ad və ya qeyd"
            className="px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={busy || !emailInput.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg whitespace-nowrap cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>{busy ? 'Əlavə edilir...' : 'İcazə ver'}</span>
          </button>
        </form>
      </div>

      {/* Authorized users list */}
      <div className="bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              İcazəli hesablar
            </h2>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {authorizedUsers.length + 1} hesab
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {/* Primary Owner (Immutable) */}
          <div className="px-5 py-3.5 flex items-center justify-between gap-4 bg-slate-50/70 dark:bg-slate-900/50">
            <div className="min-w-0">
              <div className="text-sm font-medium font-mono text-slate-900 dark:text-slate-100 truncate">
                {OWNER_EMAIL}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Əsas mağaza sahibi · Bütün hüquqlar aktivdir
              </div>
            </div>
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
              Admin
            </span>
          </div>

          {authorizedUsers.map((authUser) => (
            <div
              key={authUser.id}
              className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium font-mono text-slate-900 dark:text-slate-100 truncate">
                  {authUser.email}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {authUser.label ? `${authUser.label} · ` : ''}
                  Mağaza girişi aktivdir
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRequestDeleteUser(authUser)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-800 rounded-lg whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Girişi ləğv et</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
