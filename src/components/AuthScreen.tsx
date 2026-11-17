import { LogIn, LogOut, Package, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import stationeryShowcaseImg from '../assets/images/login_stationery_showcase_1794854445504.jpg';
import { OWNER_EMAIL } from '../firebase';

interface AuthScreenProps {
  unauthorizedEmail: string | null;
  authError: string | null;
  busy: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function AuthScreen({
  unauthorizedEmail,
  authError,
  busy,
  onSignIn,
  onSignOut,
}: AuthScreenProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-8">
        <div className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          Ofis Anbarı
        </div>
        <div className="text-xs text-slate-500 whitespace-nowrap shrink-0">
          Mağaza sahibinin şəxsi sistemi
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-5xl bg-white border border-slate-200 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 items-stretch">
          {/* Left Panel: Sign-In & Value */}
          <div className="p-8 sm:p-12 flex flex-col justify-between gap-8">
            <div className="space-y-4">
              <p className="text-xs font-medium text-blue-700">
                Ofis ləvazımatları mağazası
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                Mağaza mallarını və barkodları təhlükəsiz idarə edin
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed max-w-md">
                Məhsullarınızı kamera və ya qalereyadan barkod oxudaraq əlavə edin, redaktə
                edin və stokunuzu izləyin. Bütün məlumatlar avtomatik yadda saxlanılır və yalnız
                siz sildikdə silinir.
              </p>
            </div>

            <div className="space-y-4">
              {unauthorizedEmail ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                  <div className="flex items-start gap-2.5 text-red-800">
                    <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="text-xs leading-relaxed">
                      <p className="font-semibold">Giriş məhdudlaşdırılıb</p>
                      <p className="mt-1">
                        Hal-hazırda <span className="font-mono">{unauthorizedEmail}</span> hesabı
                        ilə daxil olmusunuz. Bu hesab hələ mağaza sahibi ({OWNER_EMAIL})
                        tərəfindən &ldquo;İcazəli hesablar&rdquo; siyahısına əlavə edilməyib.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-red-800 bg-white border border-red-300 hover:bg-red-100 rounded-lg cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Hesabdan çıx və düzgün hesabla daxil ol</span>
                  </button>
                </div>
              ) : (
                <>
                  {authError ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                      {authError}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={onSignIn}
                    disabled={busy}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{busy ? 'Giriş edilir...' : 'Google ilə daxil ol'}</span>
                  </button>
                </>
              )}

              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>Yalnız mağaza sahibi girişi</span>
                <span aria-hidden="true">·</span>
                <span>Kamera və qalereya barkod skanı</span>
                <span aria-hidden="true">·</span>
                <span>Avtomatik daimi yaddaş</span>
              </div>
            </div>
          </div>

          {/* Right Panel: Curated Visual */}
          <div className="relative bg-slate-100 min-h-[260px] lg:min-h-full border-t lg:border-t-0 lg:border-l border-slate-200">
            {!imageError ? (
              <img
                src={stationeryShowcaseImg}
                alt="Ofis ləvazımatları mağazası məhsul nümunələri"
                className="w-full h-full object-cover lg:h-full"
                referrerPolicy="no-referrer"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-slate-500 bg-gradient-to-br from-slate-100 to-slate-200">
                <Package className="w-10 h-10 mb-2 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">Ofis Anbarı</span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
