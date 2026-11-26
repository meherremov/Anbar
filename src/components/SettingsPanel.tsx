import {
  Check,
  Eye,
  Lock,
  Moon,
  Printer,
  ScanBarcode,
  Shield,
  Sun,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  RECEIPT_LIMITS,
  RECEIPT_TEMPLATES,
  sanitizeReceiptSettings,
  type ReceiptData,
  type ReceiptSettings,
  type ScreenLockSettings,
} from '../types/inventory';
import { formatTimeoutLabel, LOCK_TIMEOUT_OPTIONS } from '../utils/pinLock';
import type { AppTheme } from '../utils/theme';
import { ReceiptActionControls } from './ReceiptActionControls';
import { ReceiptCustomizerControls } from './ReceiptCustomizerControls';
import { ThermalReceipt } from './ThermalReceipt';

interface SettingsPanelProps {
  receiptSettings: ReceiptSettings;
  screenLockSettings: ScreenLockSettings;
  theme: AppTheme;
  onToggleTheme: () => void;
  onSaveReceiptSettings: (next: ReceiptSettings) => Promise<void>;
  onSaveScreenLockSettings: (next: ScreenLockSettings) => Promise<void>;
  onOpenPinSetup: () => void;
  onLockNow: () => void;
}

const AUTO_PRINT_STORAGE_KEY = 'ofis_anbari_auto_print_receipt';

export function SettingsPanel({
  receiptSettings,
  screenLockSettings,
  theme,
  onToggleTheme,
  onSaveReceiptSettings,
  onSaveScreenLockSettings,
  onOpenPinSetup,
  onLockNow,
}: SettingsPanelProps) {
  const [form, setForm] = useState<ReceiptSettings>(receiptSettings);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedOk, setSavedOk] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [autoPrint, setAutoPrint] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(AUTO_PRINT_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [scannerTestValue, setScannerTestValue] = useState<string>('');
  const [previewTimestamp] = useState<Date>(() => new Date());

  const samplePreviewReceipt = useMemo<ReceiptData>(
    () => ({
      receiptNumber: 'MK-2026-0148',
      issuedAt: previewTimestamp,
      cashierLabel: 'Kassa №1 · Sabir',
      paymentMethod: 'cash',
      items: [
        {
          productId: 'sample-1',
          productName: 'Qələm gel mavi 0.5mm',
          barcode: '4760012345012',
          quantity: 3,
          unit: 'ədəd',
          unitPrice: 1.2,
          lineTotal: 3.6,
        },
        {
          productId: 'sample-2',
          productName: 'A4 kağız paketi 500 vərəq',
          barcode: '4760012345098',
          quantity: 1,
          unit: 'paket',
          unitPrice: 9.5,
          discountAmount: 0.5,
          lineTotal: 9.0,
        },
      ],
      subtotalAmount: 13.1,
      discountAmount: 0.5,
      totalAmount: 12.6,
      cashReceived: 20.0,
      changeAmount: 7.4,
    }),
    [previewTimestamp]
  );

  useEffect(() => {
    setForm(receiptSettings);
  }, [receiptSettings]);

  const handleToggleAutoPrint = (checked: boolean) => {
    setAutoPrint(checked);
    try {
      window.localStorage.setItem(AUTO_PRINT_STORAGE_KEY, String(checked));
    } catch {
      // Ignore storage error
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedOk(false);

    const storeName = form.storeName.trim().slice(0, RECEIPT_LIMITS.STORE_NAME_MAX);
    if (!storeName) {
      setError('Çekdə görünəcək mağaza adını daxil edin.');
      return;
    }

    const sanitized = sanitizeReceiptSettings({
      ...form,
      storeName,
    });

    setSaving(true);
    try {
      await onSaveReceiptSettings(sanitized);
      setSavedOk(true);
      window.setTimeout(() => setSavedOk(false), 3000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Ayarlar yadda saxlanılarkən xəta baş verdi.'
      );
    } finally {
      setSaving(false);
    }
  };

  const activeTemplateMeta =
    RECEIPT_TEMPLATES.find((t) => t.id === form.templateId) ?? RECEIPT_TEMPLATES[0];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-5 items-start">
      {/* Receipt Templates, Customization & Zyklen Z-604 Settings */}
      <section className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#1976F3] dark:text-blue-400 inline-flex items-center justify-center shrink-0">
            <Printer className="w-4 h-4" />
          </span>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Çek Formaları və Zyklen Z-604 Printer Ayarları
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Çek nümunəsini seçin, elementləri fərdiləşdirin və çap üçün yadda saxlayın
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {error ? (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          ) : null}

          {savedOk ? (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-lg text-xs font-medium text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>Seçilmiş çek forması və ayarlar yadda saxlanıldı!</span>
            </div>
          ) : null}

          <ReceiptCustomizerControls
            value={form}
            onChange={setForm}
            idPrefix="settings"
          />

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoPrint}
                onChange={(e) => handleToggleAutoPrint(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#1976F3] focus:ring-[#1976F3]"
              />
              <span>Ödəniş təsdiqləndikdə (F12) avtomatik çap pəncərəsini aç</span>
            </label>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#1976F3] hover:bg-[#1565D8] disabled:opacity-60 rounded-lg cursor-pointer shrink-0"
            >
              <Check className="w-4 h-4" />
              <span>
                {saving ? 'Yadda saxlanılır...' : 'Seçilmiş çek formasını yadda saxla'}
              </span>
            </button>
          </div>
        </form>
      </section>

      {/* Right Column: Live Receipt Preview + Screen Lock, Appearance & Scanner */}
      <div className="space-y-5">
        <section className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#1976F3] dark:text-blue-400 inline-flex items-center justify-center shrink-0">
                <Eye className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  Canlı Çek Önizləməsi
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {activeTemplateMeta.name} · {form.paperWidth}
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <ThermalReceipt
              receipt={samplePreviewReceipt}
              settings={form}
              enablePrintPortal
            />
            <ReceiptActionControls
              receipt={samplePreviewReceipt}
              settings={form}
            />
          </div>
        </section>
        <section className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#1976F3] dark:text-blue-400 inline-flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Avtomatik Ekran Kilidi (PIN)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {screenLockSettings.lockPinHash && screenLockSettings.lockPinSalt
                    ? screenLockSettings.lockEnabled &&
                      screenLockSettings.lockTimeoutSeconds > 0
                      ? `Aktivdir · ${formatTimeoutLabel(
                          screenLockSettings.lockTimeoutSeconds
                        )} istifadəsiz qaldıqda kilidlənir`
                      : 'PIN kod təyin edilib, avtomatik kilid müvəqqəti söndürülüb'
                    : 'Sistem istifadəsiz qaldıqda səhifəni PIN koda salın'}
                </p>
              </div>
            </div>
          </div>

          {screenLockSettings.lockPinHash && screenLockSettings.lockPinSalt ? (
            <>
              <label className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 cursor-pointer select-none">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  İstifadəsiz qaldıqda avtomatik kilidlə
                </span>
                <input
                  type="checkbox"
                  checked={screenLockSettings.lockEnabled}
                  onChange={(e) =>
                    void onSaveScreenLockSettings({
                      ...screenLockSettings,
                      lockEnabled: e.target.checked,
                      lockTimeoutSeconds:
                        e.target.checked && screenLockSettings.lockTimeoutSeconds <= 0
                          ? 180
                          : screenLockSettings.lockTimeoutSeconds,
                    })
                  }
                  className="w-4 h-4 rounded border-slate-300 text-[#1976F3] focus:ring-[#1976F3]"
                />
              </label>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Kilidləmə vaxtı
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {LOCK_TIMEOUT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        void onSaveScreenLockSettings({
                          ...screenLockSettings,
                          lockEnabled: true,
                          lockTimeoutSeconds: opt.value,
                        })
                      }
                      className={`py-1.5 px-2 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                        screenLockSettings.lockEnabled &&
                        screenLockSettings.lockTimeoutSeconds === opt.value
                          ? 'border-[#1976F3] bg-blue-50 dark:bg-blue-950/60 text-[#1976F3] dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={onOpenPinSetup}
                  className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  PIN kodu dəyiş
                </button>
                <button
                  type="button"
                  onClick={onLockNow}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#1976F3] hover:bg-[#1565D8] rounded-lg cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>İndi kilidlə</span>
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenPinSetup}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#1976F3] hover:bg-[#1565D8] rounded-lg transition-colors cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>PIN kod təyin et və aktivləşdir</span>
            </button>
          )}
        </section>

        <section className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Görünüş Rejimi
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            İşıqlı kassa görünüşü və ya gecə işıqlandırmasına uyğun tünd rejim arasında keçid edin.
          </p>
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span>Gündüz rejiminə keç (Açıq fon)</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-[#1976F3]" />
                <span>Gecə rejiminə keç (Tünd fon)</span>
              </>
            )}
          </button>
        </section>

        <section className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-[#05A660] dark:text-emerald-400 inline-flex items-center justify-center shrink-0">
              <ScanBarcode className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                USB / Bluetooth Barkod Skaner
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Zebex Z-3151HS və bütün HID klaviatura skanerləri
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Quraşdırılmış qlobal dinləyici (GlobalBarcodeListener) aktivdir. Skaneri USB portuna qoşub istənilən məhsulun barkodunu oxutduqda sistem onu avtomatik tanıyır.
          </p>

          <div>
            <label
              htmlFor="scanner-test-input"
              className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1"
            >
              Skaneri burada yoxlaya bilərsiniz
            </label>
            <input
              id="scanner-test-input"
              type="text"
              value={scannerTestValue}
              onChange={(e) => setScannerTestValue(e.target.value)}
              placeholder="Skanerlə barkod oxudun..."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
