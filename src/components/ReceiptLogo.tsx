import { useState } from 'react';
import type { ReceiptLogoPreset } from '../types/inventory';

export function ReceiptPresetIcon({
  preset,
  className = 'w-5 h-5',
}: {
  preset: ReceiptLogoPreset;
  className?: string;
}) {
  if (preset === 'none') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M7 17L17 7" strokeLinecap="round" />
      </svg>
    );
  }
  if (preset === 'stationery') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <path d="M12 3l5.5 7.5L14.5 20h-5L6.5 10.5 12 3z" />
        <path d="M12 3v9" />
        <circle cx="12" cy="13.5" r="1.3" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (preset === 'bag') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <rect x="4.5" y="8.5" width="15" height="12" rx="2" />
        <path d="M8.5 8.5V7a3.5 3.5 0 0 1 7 0v1.5" />
      </svg>
    );
  }
  if (preset === 'book') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <path d="M12 6.5L4 4.5v13l8 2 8-2v-13l-8 2z" />
        <path d="M12 6.5v13" />
      </svg>
    );
  }
  if (preset === 'star') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.3l6-.8L12 3z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 16.5V7.5l4.8 4.2L12 5.5l3.2 6.2L20 7.5v9H4z" />
      <path d="M4 19.5h16" />
    </svg>
  );
}

export function ReceiptLogoMark({
  showLogo,
  logoDataUrl,
  logoPreset,
  compact = false,
  darkSurface = false,
}: {
  showLogo: boolean;
  logoDataUrl: string;
  logoPreset: ReceiptLogoPreset;
  compact?: boolean;
  darkSurface?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  if (!showLogo) return null;

  if (logoDataUrl && !imgFailed) {
    return (
      <div className="flex justify-center">
        <div
          className={`inline-flex items-center justify-center overflow-hidden ${
            darkSurface ? 'bg-white rounded-md p-1.5' : 'bg-white'
          }`}
        >
          <img
            src={logoDataUrl}
            alt="Mağaza loqosu"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className={`${
              compact ? 'max-h-9 max-w-[110px]' : 'max-h-12 max-w-[156px]'
            } w-auto object-contain block grayscale contrast-125`}
          />
        </div>
      </div>
    );
  }

  if (logoPreset === 'none') return null;

  return (
    <div className="flex justify-center">
      <span
        className={`inline-flex items-center justify-center rounded-lg border-[1.5px] ${
          compact ? 'w-8 h-8' : 'w-10 h-10'
        } ${
          darkSurface
            ? 'bg-white text-black border-white'
            : 'bg-white text-black border-black'
        }`}
      >
        <ReceiptPresetIcon
          preset={logoPreset}
          className={compact ? 'w-4 h-4' : 'w-5 h-5'}
        />
      </span>
    </div>
  );
}
