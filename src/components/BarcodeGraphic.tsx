import { useMemo } from 'react';

interface BarcodeGraphicProps {
  code: string;
  format?: string;
  compact?: boolean;
}

export function BarcodeGraphic({ code, format, compact = false }: BarcodeGraphicProps) {
  const bars = useMemo(() => {
    const clean = code.trim() || '000000000000';
    const segments: Array<{ x: number; w: number }> = [];
    let cursor = 4;

    // Start guard bars
    segments.push({ x: cursor, w: 2 });
    cursor += 4;
    segments.push({ x: cursor, w: 2 });
    cursor += 4;

    for (let i = 0; i < clean.length && cursor < 208; i++) {
      const charCode = clean.charCodeAt(i);
      const pattern = [
        ((charCode >> 0) & 3) + 1,
        ((charCode >> 2) & 1) + 1,
        ((charCode >> 3) & 3) + 1,
        ((charCode >> 5) & 1) + 1,
      ];
      for (let p = 0; p < pattern.length; p++) {
        const width = pattern[p];
        if (p % 2 === 0) {
          segments.push({ x: cursor, w: width });
        }
        cursor += width + 1;
      }
    }

    // End guard bars
    segments.push({ x: cursor + 1, w: 2 });
    cursor += 5;
    segments.push({ x: cursor, w: 2 });
    const totalWidth = Math.max(cursor + 6, 140);

    return { segments, totalWidth };
  }, [code]);

  return (
    <div
      className={`inline-flex flex-col items-center bg-white border border-slate-200 rounded-md ${
        compact ? 'px-2.5 py-1.5' : 'px-4 py-3 w-full'
      }`}
    >
      <svg
        viewBox={`0 0 ${bars.totalWidth} ${compact ? 26 : 44}`}
        className={compact ? 'h-6 w-28 text-slate-900' : 'h-11 w-full max-w-[240px] text-slate-900'}
        aria-label={`Barkod ${code}`}
        role="img"
      >
        {bars.segments.map((bar, idx) => (
          <rect
            key={`${bar.x}-${idx}`}
            x={bar.x}
            y={0}
            width={bar.w}
            height={compact ? 26 : 44}
            fill="currentColor"
          />
        ))}
      </svg>
      <div
        className={`font-mono tabular-nums text-slate-700 tracking-wider ${
          compact ? 'text-[11px] mt-1' : 'text-xs mt-1.5'
        }`}
      >
        {code || '—'}
        {!compact && format ? (
          <span className="text-slate-400 ml-2 font-sans text-[11px]">· {format}</span>
        ) : null}
      </div>
    </div>
  );
}
