import { LogIn, LogOut, Moon, Package, ShieldAlert, ShoppingCart, Sun } from 'lucide-react';
import { useState } from 'react';
import stationeryShowcaseImg from '../assets/images/login_stationery_showcase_1794854445504.jpg';
import { OWNER_EMAIL } from '../firebase';
import type { AppTheme } from '../utils/theme';

interface AuthScreenProps {
  unauthorizedEmail: string | null;
  authError: string | null;
  busy: boolean;
  theme: AppTheme;
  onToggleTheme: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function AuthScreen({
  unauthorizedEmail,
  authError,
  busy,
  theme,
  onToggleTheme,
  onSignIn,
  onSignOut,
}: AuthScreenProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="min-h-screen bg-[#F0F4F9] dark:bg-[#0B1120] flex flex-col transition-colors">
      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-8 border-b border-slate-300/60 dark:border-slate-800">
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <span className="w-8 h-8 rounded-lg bg-[#13233F] text-[#F59E0B] inline-flex items-center justify-center">
            <ShoppingCart className="w-4 h-4" />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
            Məktəbli
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden sm:inline text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
            Dəftərxana Sistemi
          </span>
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            aria-label="Rəng rejimini dəyiş"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Gündüz</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-blue-700" />
                <span>Gecə</span>
              </>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-5xl bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 shadow-sm dark:shadow-2xl rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 items-stretch">
          {/* Left Panel: Sign-In & Value */}
          <div className="p-8 sm:p-12 flex flex-col justify-between gap-8">
            <div className="space-y-4">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 tracking-wide">
                Ofis ləvazımatları mağazası
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                Mağaza mallarını və barkodları təhlükəsiz idarə edin
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-md">
                Məhsullarınızı kamera və ya qalereyadan barkod oxudaraq əlavə edin, redaktə
                edin və stokunuzu izləyin. Bütün məlumatlar avtomatik yadda saxlanılır və yalnız
                siz sildikdə silinir.
              </p>
            </div>

            <div className="space-y-4">
              {unauthorizedEmail ? (
                <div className="p-4 bg-red-50/80 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl space-y-3">
                  <div className="flex items-start gap-2.5 text-red-900 dark:text-red-200">
                    <ShieldAlert className="w-5 h-5 text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
                    <div className="text-xs leading-relaxed">
                      <p className="font-semibold">Giriş məhdudlaşdırılıb</p>
                      <p className="mt-1 text-red-800 dark:text-red-300">
                        Hal-hazırda <span className="font-mono">{unauthorizedEmail}</span> hesabı
                        ilə daxil olmusunuz. Bu hesab hələ mağaza sahibi ({OWNER_EMAIL})
                        tərəfindən &ldquo;İcazəli hesablar&rdquo; siyahısına əlavə edilməyib.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-red-800 dark:text-red-200 bg-white dark:bg-slate-900 border border-red-300 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-950 rounded-lg transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Hesabdan çıx və düzgün hesabla daxil ol</span>
                  </button>
                </div>
              ) : (
                <>
                  {authError ? (
                    <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300">
                      {authError}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={onSignIn}
                    disabled={busy}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-600 shadow-xs disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{busy ? 'Giriş edilir...' : 'Google ilə daxil ol'}</span>
                  </button>
                </>
              )}

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>Yalnız mağaza sahibi girişi</span>
                <span aria-hidden="true">·</span>
                <span>Kamera və qalereya barkod skanı</span>
                <span aria-hidden="true">·</span>
                <span>Avtomatik daimi yaddaş</span>
              </div>
            </div>
          </div>

          {/* Right Panel: Curated Visual */}
          <div className="relative bg-slate-900 min-h-[260px] lg:min-h-full border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800">
            {!imageError ? (
              <>
                <img
                  src={stationeryShowcaseImg}
                  alt="Ofis ləvazımatları mağazası məhsul nümunələri"
                  className="w-full h-full object-cover lg:h-full"
                  referrerPolicy="no-referrer"
                  onError={() => setImageError(true)}
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-slate-950/15"
                  aria-hidden="true"
                />
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-slate-300 bg-gradient-to-br from-slate-800 to-slate-950">
                <Package className="w-10 h-10 mb-2 text-blue-400" />
                <span className="text-sm font-medium text-white">Ofis Anbarı</span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
