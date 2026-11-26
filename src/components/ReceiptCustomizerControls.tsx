import { ImagePlus, RotateCcw, Trash2 } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import {
  DEFAULT_RECEIPT_SETTINGS,
  RECEIPT_LIMITS,
  RECEIPT_LOGO_PRESETS,
  RECEIPT_PROMO_SUGGESTIONS,
  RECEIPT_TEMPLATES,
  type ReceiptDividerStyle,
  type ReceiptFontScale,
  type ReceiptPromoStyle,
  type ReceiptSettings,
  type ReceiptTemplateId,
  type ThermalPaperWidth,
} from '../types/inventory';
import { compressReceiptLogoFile } from '../utils/receiptLogo';
import { ReceiptPresetIcon } from './ReceiptLogo';

interface ReceiptCustomizerControlsProps {
  value: ReceiptSettings;
  onChange: (next: ReceiptSettings) => void;
  compact?: boolean;
  idPrefix?: string;
}

function TemplateMiniSchematic({
  templateId,
  active,
}: {
  templateId: ReceiptTemplateId;
  active: boolean;
}) {
  const accentBorder = active
    ? 'border-[#1976F3]/50 dark:border-blue-400/50'
    : 'border-slate-200 dark:border-slate-700';

  return (
    <div
      className={`w-12 h-16 shrink-0 rounded bg-white text-slate-800 border ${accentBorder} p-1.5 flex flex-col justify-between shadow-[0_1px_2px_rgba(15,23,42,0.06)] overflow-hidden`}
      aria-hidden="true"
    >
      {templateId === 'modern' ? (
        <>
          <div className="bg-slate-900 rounded-[3px] h-4.5 w-full flex flex-col items-center justify-center gap-0.5 px-1">
            <div className="w-2 h-2 rounded-[2px] bg-white" />
            <div className="h-[2px] w-5 bg-white rounded-full" />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between gap-1">
              <div className="h-[2px] w-5 bg-slate-500 rounded-full" />
              <div className="h-[2px] w-2 bg-slate-800 rounded-full" />
            </div>
            <div className="flex justify-between gap-1">
              <div className="h-[2px] w-4 bg-slate-400 rounded-full" />
              <div className="h-[2px] w-2 bg-slate-700 rounded-full" />
            </div>
          </div>
          <div className="bg-slate-900 rounded-[2px] px-1 py-0.5 flex justify-between items-center">
            <div className="h-[2px] w-3 bg-white" />
            <div className="h-[2px] w-2.5 bg-white" />
          </div>
        </>
      ) : templateId === 'compact' ? (
        <>
          <div className="flex flex-col items-center gap-0.5 border-b border-dashed border-slate-400 pb-1">
            <div className="w-2 h-2 rounded-[2px] border border-slate-800" />
            <div className="h-[2px] w-6 bg-slate-900 rounded-full" />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <div className="h-[1.5px] w-5 bg-slate-600" />
              <div className="h-[1.5px] w-2 bg-slate-800" />
            </div>
            <div className="flex justify-between">
              <div className="h-[1.5px] w-6 bg-slate-600" />
              <div className="h-[1.5px] w-2 bg-slate-800" />
            </div>
            <div className="flex justify-between">
              <div className="h-[1.5px] w-4 bg-slate-600" />
              <div className="h-[1.5px] w-2 bg-slate-800" />
            </div>
          </div>
          <div className="border-t border-dashed border-slate-400 pt-1 flex justify-between">
            <div className="h-[2px] w-3.5 bg-slate-900" />
            <div className="h-[2px] w-2.5 bg-slate-900" />
          </div>
        </>
      ) : templateId === 'detailed' ? (
        <>
          <div className="border border-slate-800 rounded-[2px] p-0.5 flex flex-col items-center gap-0.5">
            <div className="w-2 h-2 rounded-[2px] border border-slate-800" />
            <div className="h-[1.5px] w-5 bg-slate-900" />
          </div>
          <div className="space-y-1">
            <div className="border-b border-slate-300 pb-0.5 flex justify-between">
              <div className="h-[1.5px] w-5 bg-slate-700" />
              <div className="h-[1.5px] w-2 bg-slate-900" />
            </div>
            <div className="flex justify-between">
              <div className="h-[1.5px] w-4 bg-slate-600" />
              <div className="h-[1.5px] w-2 bg-slate-800" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="bg-slate-200 border border-slate-800 rounded-[1px] h-2 w-full" />
            <div className="flex justify-between items-center">
              <div className="h-[1px] w-3 bg-slate-500" />
              <div className="h-[1px] w-4 bg-slate-800" />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center gap-0.5 border-b border-dashed border-slate-400 pb-1">
            <div className="w-2 h-2 rounded-[2px] border border-slate-800" />
            <div className="h-[2.5px] w-6 bg-slate-900 rounded-full" />
          </div>
          <div className="space-y-1 border-b border-dashed border-slate-400 pb-1">
            <div className="flex justify-between">
              <div className="h-[2px] w-5 bg-slate-700" />
              <div className="h-[2px] w-2 bg-slate-900" />
            </div>
            <div className="flex justify-between">
              <div className="h-[2px] w-4 bg-slate-500" />
              <div className="h-[2px] w-2 bg-slate-800" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex justify-between w-full">
              <div className="h-[2px] w-3 bg-slate-900" />
              <div className="h-[2px] w-3 bg-slate-900" />
            </div>
            <div className="flex gap-[1px] h-2 items-end">
              <span className="w-[1px] h-2 bg-slate-900" />
              <span className="w-[2px] h-2 bg-slate-900" />
              <span className="w-[1px] h-2 bg-slate-900" />
              <span className="w-[1px] h-2 bg-slate-900" />
              <span className="w-[2px] h-2 bg-slate-900" />
              <span className="w-[1px] h-2 bg-slate-900" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const FONT_SCALE_OPTIONS: Array<{ value: ReceiptFontScale; label: string }> = [
  { value: 'compact', label: 'Kiçik' },
  { value: 'normal', label: 'Standart' },
  { value: 'large', label: 'Böyük' },
];

const DIVIDER_STYLE_OPTIONS: Array<{ value: ReceiptDividerStyle; label: string }> = [
  { value: 'dashed', label: 'Qırıq-qırıq' },
  { value: 'solid', label: 'Düz xətt' },
  { value: 'double', label: 'İkiqat xətt' },
];

const PROMO_STYLE_OPTIONS: Array<{ value: ReceiptPromoStyle; label: string }> = [
  { value: 'boxed', label: 'Çərçivəli' },
  { value: 'inverted', label: 'Tünd zolaq' },
  { value: 'plain', label: 'Sadə qalın' },
];

export function ReceiptCustomizerControls({
  value,
  onChange,
  compact = false,
  idPrefix = 'receipt',
}: ReceiptCustomizerControlsProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [processingLogo, setProcessingLogo] = useState<boolean>(false);

  const handleResetFormatting = () => {
    setLogoError(null);
    onChange({
      ...value,
      paperWidth: DEFAULT_RECEIPT_SETTINGS.paperWidth,
      templateId: DEFAULT_RECEIPT_SETTINGS.templateId,
      headerBadge: DEFAULT_RECEIPT_SETTINGS.headerBadge,
      showBarcode: DEFAULT_RECEIPT_SETTINGS.showBarcode,
      showItemBarcodes: DEFAULT_RECEIPT_SETTINGS.showItemBarcodes,
      showCashier: DEFAULT_RECEIPT_SETTINGS.showCashier,
      showPaymentMethod: DEFAULT_RECEIPT_SETTINGS.showPaymentMethod,
      showTaxId: DEFAULT_RECEIPT_SETTINGS.showTaxId,
      fontScale: DEFAULT_RECEIPT_SETTINGS.fontScale,
      dividerStyle: DEFAULT_RECEIPT_SETTINGS.dividerStyle,
      showLogo: DEFAULT_RECEIPT_SETTINGS.showLogo,
      logoPreset: DEFAULT_RECEIPT_SETTINGS.logoPreset,
      logoDataUrl: '',
      promoBanner: '',
      promoBannerUppercase: DEFAULT_RECEIPT_SETTINGS.promoBannerUppercase,
      promoBannerStyle: DEFAULT_RECEIPT_SETTINGS.promoBannerStyle,
    });
  };

  const handleLogoFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setLogoError(null);
    setProcessingLogo(true);
    try {
      const dataUrl = await compressReceiptLogoFile(file);
      onChange({
        ...value,
        showLogo: true,
        logoDataUrl: dataUrl,
      });
    } catch (err) {
      setLogoError(
        err instanceof Error ? err.message : 'Şəkil əlavə edilərkən xəta baş verdi.'
      );
    } finally {
      setProcessingLogo(false);
    }
  };

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      {/* Section 1: Template Presets */}
      <div>
        <div className="mb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            1. Çek Forması Nümunəsi
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Seçilmiş nümunə həm kassa çapında, həm də PNG / USB ixracında tətbiq olunur
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {RECEIPT_TEMPLATES.map((tpl) => {
            const active = value.templateId === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onChange({ ...value, templateId: tpl.id })}
                aria-pressed={active}
                className={`text-left p-3 rounded-lg border transition-colors flex items-start gap-3 cursor-pointer ${
                  active
                    ? 'border-[#1976F3] bg-blue-50/70 dark:bg-blue-950/40 ring-1 ring-[#1976F3]/30'
                    : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                }`}
              >
                <TemplateMiniSchematic templateId={tpl.id} active={active} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs font-bold truncate ${
                        active
                          ? 'text-[#1976F3] dark:text-blue-300'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {tpl.name}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                      {active ? 'Seçilib' : tpl.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug mt-1">
                    {tpl.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: Store Logo & Image Upload */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              2. Çek Loqosu və Şəkil Seçimi
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Öz mağaza şəklinizi yükləyin və ya hazır loqolardan birini seçin
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={value.showLogo}
              onChange={(e) => onChange({ ...value, showLogo: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-[#1976F3] focus:ring-[#1976F3]"
            />
            <span>Çekdə loqo göstər</span>
          </label>
        </div>

        {logoError ? (
          <div className="p-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300">
            {logoError}
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/*"
          onChange={handleLogoFileChange}
          className="hidden"
          aria-label="Loqo şəkli seçin"
        />

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={processingLogo}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#1976F3]/40 bg-blue-50/70 dark:bg-blue-950/50 text-[#1976F3] dark:text-blue-300 hover:bg-blue-100/70 dark:hover:bg-blue-950/80 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
          >
            <ImagePlus className="w-4 h-4 shrink-0" />
            <span>
              {processingLogo
                ? 'Şəkil hazırlanır...'
                : value.logoDataUrl
                ? 'Başqa şəkil seç'
                : 'Cihazdan şəkil seç (Loqo)'}
            </span>
          </button>

          {value.logoDataUrl ? (
            <div className="flex items-center gap-2.5">
              <div className="h-10 px-2 rounded-lg bg-white border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center">
                <img
                  src={value.logoDataUrl}
                  alt="Seçilmiş loqo"
                  referrerPolicy="no-referrer"
                  className="max-h-8 max-w-[100px] object-contain"
                />
              </div>
              <button
                type="button"
                onClick={() => onChange({ ...value, logoDataUrl: '' })}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Şəkli sil</span>
              </button>
            </div>
          ) : null}
        </div>

        <div>
          <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
            Və ya hazır loqo nişanları
          </span>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {RECEIPT_LOGO_PRESETS.map((preset) => {
              const active = !value.logoDataUrl && value.logoPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      logoDataUrl: '',
                      logoPreset: preset.id,
                      showLogo: preset.id === 'none' ? false : true,
                    })
                  }
                  className={`py-2 px-2 rounded-lg border flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'border-[#1976F3] bg-blue-50 dark:bg-blue-950/60 text-[#1976F3] dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <ReceiptPresetIcon preset={preset.id} className="w-4 h-4" />
                  <span className="truncate max-w-full">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Section 3: Layout & Content Customization */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            3. Çek Fərdiləşdirməsi
          </h3>
          <button
            type="button"
            onClick={handleResetFormatting}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-[#1976F3] dark:hover:text-blue-400 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Standarta sıfırla</span>
          </button>
        </div>

        {/* Paper width */}
        <div>
          <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
            Termal printer kağız eni
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(['80mm', '58mm'] as ThermalPaperWidth[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => onChange({ ...value, paperWidth: w })}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                  value.paperWidth === w
                    ? 'border-[#1976F3] bg-blue-50 dark:bg-blue-950/60 text-[#1976F3] dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {w === '80mm' ? '80 mm (Zyklen Z-604)' : '58 mm (Kompakt)'}
              </button>
            ))}
          </div>
        </div>

        {/* Font scale & Divider style */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              Şrift ölçüsü
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {FONT_SCALE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange({ ...value, fontScale: opt.value })}
                  className={`py-2 px-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    value.fontScale === opt.value
                      ? 'border-[#1976F3] bg-blue-50 dark:bg-blue-950/60 text-[#1976F3] dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              Ayırıcı xətt üslubu
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {DIVIDER_STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange({ ...value, dividerStyle: opt.value })}
                  className={`py-2 px-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    value.dividerStyle === opt.value
                      ? 'border-[#1976F3] bg-blue-50 dark:bg-blue-950/60 text-[#1976F3] dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Document Badge / Title */}
        <div>
          <label
            htmlFor={`${idPrefix}-header-badge`}
            className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
          >
            Çek sənəd başlığı (məs: SATIŞ ÇEKİ, ÖDƏNİŞ QƏBZİ)
          </label>
          <input
            id={`${idPrefix}-header-badge`}
            type="text"
            maxLength={RECEIPT_LIMITS.HEADER_BADGE_MAX}
            value={value.headerBadge}
            onChange={(e) => onChange({ ...value, headerBadge: e.target.value })}
            placeholder="SATIŞ ÇEKİ"
            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
          />
        </div>

        {/* Visibility toggles */}
        <div>
          <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
            Çekdə görünən məlumatlar
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={value.showBarcode}
                onChange={(e) => onChange({ ...value, showBarcode: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-[#1976F3] focus:ring-[#1976F3]"
              />
              <span>Çek altında doğrulama barkodunu göstər</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={value.showItemBarcodes}
                onChange={(e) =>
                  onChange({ ...value, showItemBarcodes: e.target.checked })
                }
                className="w-4 h-4 rounded border-slate-300 text-[#1976F3] focus:ring-[#1976F3]"
              />
              <span>Məhsulların barkodunu sətirdə göstər</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={value.showCashier}
                onChange={(e) => onChange({ ...value, showCashier: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-[#1976F3] focus:ring-[#1976F3]"
              />
              <span>Kassir adını göstər</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={value.showPaymentMethod}
                onChange={(e) =>
                  onChange({ ...value, showPaymentMethod: e.target.checked })
                }
                className="w-4 h-4 rounded border-slate-300 text-[#1976F3] focus:ring-[#1976F3]"
              />
              <span>Ödəniş növünü göstər</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={value.showTaxId}
                onChange={(e) => onChange({ ...value, showTaxId: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-[#1976F3] focus:ring-[#1976F3]"
              />
              <span>VÖEN məlumatını göstər</span>
            </label>
          </div>
        </div>
      </div>

      {/* Section 4: Bottom Custom Greeting / Promo Banner */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            4. Alt Təbrik və Xüsusi Yazı
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Çekin aşağı hissəsində bayram təbriki, elan və ya istənilən sözü yazın
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label
              htmlFor={`${idPrefix}-promo-banner`}
              className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
            >
              Aşağıdakı xüsusi söz / təbrik mətni
            </label>
            {value.promoBanner ? (
              <button
                type="button"
                onClick={() => onChange({ ...value, promoBanner: '' })}
                className="text-[11px] font-semibold text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 cursor-pointer"
              >
                Təmizlə
              </button>
            ) : null}
          </div>
          <input
            id={`${idPrefix}-promo-banner`}
            type="text"
            maxLength={RECEIPT_LIMITS.PROMO_BANNER_MAX}
            value={value.promoBanner}
            onChange={(e) => onChange({ ...value, promoBanner: e.target.value })}
            placeholder="Məs: Yeni iliniz mübarək!"
            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
          />
        </div>

        {/* Quick suggestions */}
        <div className="flex flex-wrap gap-1.5">
          {RECEIPT_PROMO_SUGGESTIONS.map((phrase) => (
            <button
              key={phrase}
              type="button"
              onClick={() => onChange({ ...value, promoBanner: phrase })}
              className={`px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer ${
                value.promoBanner === phrase
                  ? 'border-[#1976F3] bg-blue-50 dark:bg-blue-950/60 text-[#1976F3] dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {phrase}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 items-center">
          <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={value.promoBannerUppercase}
              onChange={(e) =>
                onChange({ ...value, promoBannerUppercase: e.target.checked })
              }
              className="w-4 h-4 rounded border-slate-300 text-[#1976F3] focus:ring-[#1976F3]"
            />
            <span>Böyük hərflərlə yaz (YENİ İLİNİZ MÜBARƏK!)</span>
          </label>

          <div>
            <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Görünüş üslubu
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {PROMO_STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange({ ...value, promoBannerStyle: opt.value })}
                  className={`py-1.5 px-2 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                    value.promoBannerStyle === opt.value
                      ? 'border-[#1976F3] bg-blue-50 dark:bg-blue-950/60 text-[#1976F3] dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Section 5: Store & Contact Info */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          5. Mağaza və Əlaqə Məlumatları
        </h3>

        <div>
          <label
            htmlFor={`${idPrefix}-store-name`}
            className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
          >
            Mağaza adı (çek başlığı) *
          </label>
          <input
            id={`${idPrefix}-store-name`}
            type="text"
            required
            maxLength={RECEIPT_LIMITS.STORE_NAME_MAX}
            value={value.storeName}
            onChange={(e) => onChange({ ...value, storeName: e.target.value })}
            placeholder="MƏKTƏBLİ"
            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={`${idPrefix}-subtitle`}
              className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
            >
              Alt başlıq
            </label>
            <input
              id={`${idPrefix}-subtitle`}
              type="text"
              maxLength={RECEIPT_LIMITS.SUBTITLE_MAX}
              value={value.subtitle}
              onChange={(e) => onChange({ ...value, subtitle: e.target.value })}
              placeholder="Dəftərxana Sistemi"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
            />
          </div>

          <div>
            <label
              htmlFor={`${idPrefix}-phone`}
              className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
            >
              Əlaqə telefonu
            </label>
            <input
              id={`${idPrefix}-phone`}
              type="text"
              maxLength={RECEIPT_LIMITS.PHONE_MAX}
              value={value.phone}
              onChange={(e) => onChange({ ...value, phone: e.target.value })}
              placeholder="+994 50 000 00 00"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={`${idPrefix}-address`}
              className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
            >
              Mağaza ünvanı
            </label>
            <input
              id={`${idPrefix}-address`}
              type="text"
              maxLength={RECEIPT_LIMITS.ADDRESS_MAX}
              value={value.address}
              onChange={(e) => onChange({ ...value, address: e.target.value })}
              placeholder="Bakı ş."
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
            />
          </div>

          <div>
            <label
              htmlFor={`${idPrefix}-tax-id`}
              className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
            >
              VÖEN
            </label>
            <input
              id={`${idPrefix}-tax-id`}
              type="text"
              maxLength={RECEIPT_LIMITS.TAX_ID_MAX}
              value={value.taxId}
              onChange={(e) => onChange({ ...value, taxId: e.target.value })}
              placeholder="1234567891"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor={`${idPrefix}-footer`}
            className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
          >
            Çek altı təşəkkür qeydi
          </label>
          <input
            id={`${idPrefix}-footer`}
            type="text"
            maxLength={RECEIPT_LIMITS.FOOTER_NOTE_MAX}
            value={value.footerNote}
            onChange={(e) => onChange({ ...value, footerNote: e.target.value })}
            placeholder="Alış-verişiniz üçün təşəkkür edirik!"
            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
          />
        </div>
      </div>
    </div>
  );
}
