import { useMemo, useState } from 'react';
import type { Product } from '../types/inventory';

interface CategoryValueChartProps {
  products: Product[];
  loading: boolean;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

interface CategorySlice {
  category: string;
  value: number;
  count: number;
  percentage: number;
  color: string;
  swatchClass: string;
}

const CHART_PALETTE = [
  { color: '#1D4ED8', swatchClass: 'bg-blue-700' },
  { color: '#0F766E', swatchClass: 'bg-teal-700' },
  { color: '#D97706', swatchClass: 'bg-amber-600' },
  { color: '#4338CA', swatchClass: 'bg-indigo-700' },
  { color: '#15803D', swatchClass: 'bg-green-700' },
  { color: '#B45309', swatchClass: 'bg-amber-700' },
  { color: '#475569', swatchClass: 'bg-slate-600' },
  { color: '#B91C1C', swatchClass: 'bg-red-700' },
] as const;

function formatPrice(val: number): string {
  return `${val.toLocaleString('az-AZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₼`;
}

function describeArcSlice(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngleDeg: number,
  endAngleDeg: number
): string {
  const startRad = ((startAngleDeg - 90) * Math.PI) / 180;
  const endRad = ((endAngleDeg - 90) * Math.PI) / 180;

  const x1 = cx + outerRadius * Math.cos(startRad);
  const y1 = cy + outerRadius * Math.sin(startRad);
  const x2 = cx + outerRadius * Math.cos(endRad);
  const y2 = cy + outerRadius * Math.sin(endRad);

  const x3 = cx + innerRadius * Math.cos(endRad);
  const y3 = cy + innerRadius * Math.sin(endRad);
  const x4 = cx + innerRadius * Math.cos(startRad);
  const y4 = cy + innerRadius * Math.sin(startRad);

  const largeArc = endAngleDeg - startAngleDeg > 180 ? 1 : 0;

  return [
    `M ${x1} ${y1}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

export function CategoryValueChart({
  products,
  loading,
  selectedCategory,
  onSelectCategory,
}: CategoryValueChartProps) {
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  const { slices, totalValue } = useMemo(() => {
    const map = new Map<string, { value: number; count: number }>();
    let grandTotal = 0;

    for (const p of products) {
      const itemValue = Math.max(0, p.quantity * p.salePrice);
      grandTotal += itemValue;
      const existing = map.get(p.category) || { value: 0, count: 0 };
      map.set(p.category, {
        value: existing.value + itemValue,
        count: existing.count + 1,
      });
    }

    const entries = Array.from(map.entries())
      .map(([category, stats]) => ({
        category,
        value: stats.value,
        count: stats.count,
      }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value);

    const computed: CategorySlice[] = entries.map((entry, idx) => {
      const palette = CHART_PALETTE[idx % CHART_PALETTE.length];
      return {
        ...entry,
        percentage: grandTotal > 0 ? (entry.value / grandTotal) * 100 : 0,
        color: palette.color,
        swatchClass: palette.swatchClass,
      };
    });

    return { slices: computed, totalValue: grandTotal };
  }, [products]);

  const activeSlice = useMemo(() => {
    const target =
      hoveredCategory || (selectedCategory !== 'all' ? selectedCategory : null);
    if (!target) return null;
    return slices.find((s) => s.category === target) || null;
  }, [hoveredCategory, selectedCategory, slices]);

  const geometrySlices = useMemo(() => {
    let cumulative = 0;
    return slices.map((slice) => {
      const startDeg = (cumulative / 100) * 360;
      cumulative += slice.percentage;
      const endDeg = (cumulative / 100) * 360;
      return {
        ...slice,
        startDeg,
        endDeg,
      };
    });
  }, [slices]);

  if (loading) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-56 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 items-center">
          <div className="w-44 h-44 mx-auto rounded-full bg-slate-100 animate-pulse" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-5 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Kateqoriyalar üzrə anbar dəyəri"
      className="bg-white border border-slate-200 rounded-xl p-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Kateqoriyalar üzrə anbar dəyəri
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Hər kateqoriyadakı məhsulların cəmi satış dəyəri (filtr üçün kateqoriyaya klikləyin)
          </p>
        </div>
        {selectedCategory !== 'all' ? (
          <button
            type="button"
            onClick={() => onSelectCategory('all')}
            className="self-start sm:self-auto text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap cursor-pointer"
          >
            Bütün kateqoriyaları göstər
          </button>
        ) : null}
      </div>

      {slices.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">
          Diaqramın görünməsi üçün qiyməti və stoku 0-dan böyük məhsul əlavə edin.
        </div>
      ) : (
        <div className="pt-5 grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 items-center">
          {/* Interactive SVG Donut/Pie Chart */}
          <div className="relative flex items-center justify-center">
            <svg
              viewBox="0 0 220 220"
              className="w-52 h-52 select-none"
              role="img"
              aria-label="Kateqoriyalar üzrə məhsul dəyəri dairəvi diaqramı"
            >
              {geometrySlices.length === 1 ? (
                <g
                  onMouseEnter={() => setHoveredCategory(geometrySlices[0].category)}
                  onMouseLeave={() => setHoveredCategory(null)}
                  onClick={() =>
                    onSelectCategory(
                      selectedCategory === geometrySlices[0].category
                        ? 'all'
                        : geometrySlices[0].category
                    )
                  }
                  className="cursor-pointer"
                >
                  <circle
                    cx={110}
                    cy={110}
                    r={74}
                    fill="none"
                    stroke={geometrySlices[0].color}
                    strokeWidth={36}
                  />
                </g>
              ) : (
                geometrySlices.map((slice) => {
                  const isHighlighted =
                    hoveredCategory === slice.category ||
                    selectedCategory === slice.category;
                  const isDimmed =
                    (hoveredCategory && hoveredCategory !== slice.category) ||
                    (!hoveredCategory &&
                      selectedCategory !== 'all' &&
                      selectedCategory !== slice.category);

                  // Small visual separator between slices for crispness
                  const gap = slice.endDeg - slice.startDeg > 2 ? 0.8 : 0;
                  const safeEnd = Math.min(slice.endDeg - gap / 2, slice.startDeg + 359.8);
                  const path = describeArcSlice(
                    110,
                    110,
                    isHighlighted ? 96 : 92,
                    54,
                    slice.startDeg + gap / 2,
                    safeEnd
                  );

                  return (
                    <path
                      key={slice.category}
                      d={path}
                      fill={slice.color}
                      opacity={isDimmed ? 0.35 : 1}
                      className="transition-opacity duration-150 cursor-pointer"
                      onMouseEnter={() => setHoveredCategory(slice.category)}
                      onMouseLeave={() => setHoveredCategory(null)}
                      onClick={() =>
                        onSelectCategory(
                          selectedCategory === slice.category ? 'all' : slice.category
                        )
                      }
                    >
                      <title>
                        {slice.category}: {formatPrice(slice.value)} (
                        {slice.percentage.toFixed(1)}%)
                      </title>
                    </path>
                  );
                })
              )}
            </svg>

            {/* Center Readout */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-6">
              <span className="text-[11px] text-slate-500 max-w-[96px] truncate">
                {activeSlice ? activeSlice.category : 'Ümumi dəyər'}
              </span>
              <span className="text-sm font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                {formatPrice(activeSlice ? activeSlice.value : totalValue)}
              </span>
              {activeSlice ? (
                <span className="text-[11px] font-mono tabular-nums text-blue-700 mt-0.5">
                  {activeSlice.percentage.toFixed(1)}%
                </span>
              ) : null}
            </div>
          </div>

          {/* Tabular Category Breakdown Legend */}
          <div className="divide-y divide-slate-100">
            {slices.map((slice) => {
              const isSelected = selectedCategory === slice.category;
              const isHovered = hoveredCategory === slice.category;
              return (
                <button
                  key={slice.category}
                  type="button"
                  onMouseEnter={() => setHoveredCategory(slice.category)}
                  onMouseLeave={() => setHoveredCategory(null)}
                  onClick={() =>
                    onSelectCategory(isSelected ? 'all' : slice.category)
                  }
                  className={`w-full py-2.5 px-2 -mx-2 rounded-lg flex items-center justify-between gap-4 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/80'
                      : isHovered
                      ? 'bg-slate-50'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-sm shrink-0 ${slice.swatchClass}`}
                      aria-hidden="true"
                    />
                    <span
                      className={`text-sm truncate ${
                        isSelected
                          ? 'font-semibold text-blue-900'
                          : 'font-medium text-slate-800'
                      }`}
                    >
                      {slice.category}
                    </span>
                    <span className="text-xs text-slate-400 font-mono tabular-nums shrink-0">
                      · {slice.count} çeşid
                    </span>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-xs font-mono tabular-nums text-slate-500 w-12 text-right">
                      {slice.percentage.toFixed(1)}%
                    </span>
                    <span className="text-sm font-semibold font-mono tabular-nums text-slate-900 min-w-[5.5rem] text-right">
                      {formatPrice(slice.value)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
