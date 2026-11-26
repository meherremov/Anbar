import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  Receipt,
  RotateCcw,
  Search,
  Settings2,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  formatPaymentMethodLabel,
  getNetSaleAmount,
  getNetSaleQuantity,
  getSaleCostAmount,
  getSaleNetProfit,
  getSaleUnitCost,
  type SaleRecord,
  type StationeryIconId,
} from '../types/inventory';
import { ProductThumb } from './ProductThumb';

interface SalesReportModuleProps {
  sales: SaleRecord[];
  productIconMap?: Map<string, StationeryIconId>;
  productCostMap?: Map<string, number>;
  loading: boolean;
  compact?: boolean;
  onOpenFullReport?: () => void;
  onOpenSaleModal: () => void;
  onOpenReceiptSettings: () => void;
  onReprintSale: (sale: SaleRecord) => void;
  onRequestReturnSale: (sale: SaleRecord) => void;
  onRequestDeleteSale: (sale: SaleRecord) => void;
}

type PeriodFilter = 'today' | 'date' | 'week' | 'month' | 'all';

function formatMoney(val: number): string {
  return `${val.toLocaleString('az-AZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₼`;
}

function getLocalDateInputValue(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplayDateFromKey(dateKey: string): string {
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return getLocalDateInputValue();
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalDateInputValue(dt);
}

function formatDateTime(ts: SaleRecord['soldAt'], fallbackId?: string): string {
  if (ts && typeof ts.toDate === 'function') {
    const d = ts.toDate();
    return d.toLocaleString('az-AZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (fallbackId) {
    const match = /_(\d{13})_/.exec(fallbackId);
    if (match) {
      const parsed = Number(match[1]);
      if (!Number.isNaN(parsed)) {
        return new Date(parsed).toLocaleString('az-AZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    }
  }
  return 'İndi';
}

function getSaleMs(sale: SaleRecord): number {
  if (sale.soldAt && typeof sale.soldAt.toMillis === 'function') {
    return sale.soldAt.toMillis();
  }
  const match = /_(\d{13})_/.exec(sale.id);
  if (match) {
    const parsed = Number(match[1]);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function csvCell(value: string | number): string {
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes(';') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

interface SalesFinancialSummary {
  count: number;
  totalUnits: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  costedRevenue: number;
  costedCount: number;
  missingCostCount: number;
  totalReturnedAmount: number;
}

function computeSalesSummary(
  items: SaleRecord[],
  productCostMap?: Map<string, number>
): SalesFinancialSummary {
  let totalRevenue = 0;
  let totalCost = 0;
  let totalProfit = 0;
  let costedRevenue = 0;
  let costedCount = 0;
  let missingCostCount = 0;
  let totalUnits = 0;
  let totalReturnedAmount = 0;

  for (const s of items) {
    const netAmt = getNetSaleAmount(s);
    const netQty = getNetSaleQuantity(s);
    const cost = getSaleCostAmount(s, productCostMap);
    const profit = getSaleNetProfit(s, productCostMap);

    totalRevenue += netAmt;
    totalUnits += netQty;
    totalReturnedAmount += typeof s.returnedAmount === 'number' ? s.returnedAmount : 0;

    if (cost !== null && profit !== null) {
      totalCost += cost;
      totalProfit += profit;
      costedRevenue += netAmt;
      if (netQty > 0) {
        costedCount += 1;
      }
    } else if (netQty > 0) {
      missingCostCount += 1;
    }
  }

  return {
    count: items.length,
    totalUnits: Math.round(totalUnits * 100) / 100,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    totalProfit: Math.round(totalProfit * 100) / 100,
    costedRevenue: Math.round(costedRevenue * 100) / 100,
    costedCount,
    missingCostCount,
    totalReturnedAmount: Math.round(totalReturnedAmount * 100) / 100,
  };
}

export function SalesReportModule({
  sales,
  productIconMap,
  productCostMap,
  loading,
  compact = false,
  onOpenFullReport,
  onOpenSaleModal,
  onOpenReceiptSettings,
  onReprintSale,
  onRequestReturnSale,
  onRequestDeleteSale,
}: SalesReportModuleProps) {
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalDateInputValue());
  const [queryText, setQueryText] = useState<string>('');

  const todayKey = getLocalDateInputValue();

  const sortedSales = useMemo(() => {
    return [...sales].sort((a, b) => getSaleMs(b) - getSaleMs(a));
  }, [sales]);

  const filteredSales = useMemo(() => {
    if (compact) {
      return sortedSales.slice(0, 5);
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const q = queryText.trim().toLowerCase();
    const activeDayKey = period === 'today' ? todayKey : selectedDate;

    return sortedSales.filter((sale) => {
      const soldMs = getSaleMs(sale);
      if (period === 'today' || period === 'date') {
        if (getLocalDateInputValue(new Date(soldMs)) !== activeDayKey) return false;
      } else if (period === 'week') {
        if (soldMs < sevenDaysAgo) return false;
      } else if (period === 'month') {
        if (soldMs < startOfMonth) return false;
      }

      if (q) {
        const hay = `${sale.productName} ${sale.barcode} ${sale.category} ${
          sale.receiptNumber || ''
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sortedSales, compact, period, selectedDate, todayKey, queryText]);

  const summary = useMemo(() => {
    const source = compact ? sortedSales : filteredSales;
    return computeSalesSummary(source, productCostMap);
  }, [compact, sortedSales, filteredSales, productCostMap]);

  const dailyGroups = useMemo(() => {
    if (compact || period === 'today' || period === 'date') {
      return [];
    }
    const groups = new Map<
      string,
      {
        dateKey: string;
        count: number;
        totalUnits: number;
        totalRevenue: number;
        totalCost: number;
        totalProfit: number;
        missingCostCount: number;
      }
    >();

    for (const s of filteredSales) {
      const ms = getSaleMs(s);
      const dateKey = getLocalDateInputValue(new Date(ms));
      const existing = groups.get(dateKey) || {
        dateKey,
        count: 0,
        totalUnits: 0,
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        missingCostCount: 0,
      };
      const netQty = getNetSaleQuantity(s);
      const netAmt = getNetSaleAmount(s);
      const cost = getSaleCostAmount(s, productCostMap);
      const profit = getSaleNetProfit(s, productCostMap);

      existing.count += 1;
      existing.totalUnits = Math.round((existing.totalUnits + netQty) * 100) / 100;
      existing.totalRevenue = Math.round((existing.totalRevenue + netAmt) * 100) / 100;
      if (cost !== null && profit !== null) {
        existing.totalCost = Math.round((existing.totalCost + cost) * 100) / 100;
        existing.totalProfit = Math.round((existing.totalProfit + profit) * 100) / 100;
      } else if (netQty > 0) {
        existing.missingCostCount += 1;
      }
      groups.set(dateKey, existing);
    }

    return Array.from(groups.values()).sort((a, b) =>
      b.dateKey.localeCompare(a.dateKey)
    );
  }, [compact, period, filteredSales, productCostMap]);

  const profitMarginPercent = useMemo(() => {
    if (summary.costedRevenue <= 0) return null;
    return (summary.totalProfit / summary.costedRevenue) * 100;
  }, [summary]);

  const activeListTitle = useMemo(() => {
    if (compact) return 'Son Satışlar Hesabatı';
    if (period === 'today') {
      return `Bugünkü Satışların Siyahısı (${formatDisplayDateFromKey(todayKey)})`;
    }
    if (period === 'date') {
      return `Günlük Satış Siyahısı (${formatDisplayDateFromKey(selectedDate)})`;
    }
    if (period === 'week') return 'Son 7 Günün Satış Siyahısı';
    if (period === 'month') return 'Bu Ayın Satış Siyahısı';
    return 'Bütün Satışların Siyahısı';
  }, [compact, period, todayKey, selectedDate]);

  const handleExportCsv = () => {
    if (filteredSales.length === 0) return;

    const headers = [
      'Tarix',
      'Çek nömrəsi',
      'Ödəniş üsulu',
      'Məhsul',
      'Barkod',
      'Kateqoriya',
      'Satılan miqdar',
      'Qaytarılan miqdar',
      'Xalis miqdar',
      'Vahid',
      'Vahid satış qiyməti (AZN)',
      'Vahid maya dəyəri (AZN)',
      'Satış məbləği (AZN)',
      'Maya dəyəri (AZN)',
      'Xalis gəlir (AZN)',
    ];

    const rows = filteredSales.map((s) => {
      const returnedQty = s.returnedQuantity ?? 0;
      const netQty = getNetSaleQuantity(s);
      const netAmt = getNetSaleAmount(s);
      const unitCost = getSaleUnitCost(s, productCostMap);
      const costAmt = getSaleCostAmount(s, productCostMap);
      const profitAmt = getSaleNetProfit(s, productCostMap);

      return [
        formatDateTime(s.soldAt, s.id),
        s.receiptNumber || 'Tək satış',
        formatPaymentMethodLabel(s.paymentMethod),
        s.productName,
        s.barcode,
        s.category,
        s.quantity.toFixed(2),
        returnedQty.toFixed(2),
        netQty.toFixed(2),
        s.unit,
        s.unitPrice.toFixed(2),
        unitCost !== undefined ? unitCost.toFixed(2) : '',
        netAmt.toFixed(2),
        costAmt !== null ? costAmt.toFixed(2) : '',
        profitAmt !== null ? profitAmt.toFixed(2) : '',
      ]
        .map(csvCell)
        .join(';');
    });

    const totalsRow = [
      'CƏMİ',
      '',
      '',
      `${summary.count} satış`,
      '',
      '',
      '',
      '',
      summary.totalUnits.toFixed(2),
      '',
      '',
      '',
      summary.totalRevenue.toFixed(2),
      summary.totalCost.toFixed(2),
      summary.totalProfit.toFixed(2),
    ]
      .map(csvCell)
      .join(';');

    const csvContent = `\uFEFF${headers.map(csvCell).join(';')}\n${rows.join(
      '\n'
    )}\n${totalsRow}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fileDate =
      period === 'today'
        ? todayKey
        : period === 'date'
        ? selectedDate
        : `${period}-${todayKey}`;
    link.href = url;
    link.download = `satislar-${fileDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <section className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        <div className="h-10 bg-slate-100 dark:bg-slate-800/70 rounded animate-pulse" />
        <div className="h-10 bg-slate-100 dark:bg-slate-800/70 rounded animate-pulse" />
      </section>
    );
  }

  const activeDateValue = period === 'today' ? todayKey : selectedDate;
  const isAtToday = activeDateValue >= todayKey;

  return (
    <section aria-label="Günlük satışlar və mənfəət hesabatı" className="space-y-4">
      {!compact ? (
        <>
          {/* 4-Column Flat KPI Strip: Volume, Sales Revenue, Cost Price (Separate), Net Profit (Separate) */}
          <div className="grid grid-cols-2 xl:grid-cols-4 bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl divide-y xl:divide-y-0 divide-x divide-slate-200 dark:divide-slate-800 overflow-hidden">
            <div className="p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Satış sayı / Miqdar
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums mt-1">
                {summary.count}
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400 ml-1.5">
                  ({summary.totalUnits} vahid)
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                {summary.totalReturnedAmount > 0
                  ? `İadə məbləği: -${formatMoney(summary.totalReturnedAmount)}`
                  : 'Qaytarma yoxdur'}
              </div>
            </div>

            <div className="p-4 sm:p-5 bg-blue-50/35 dark:bg-blue-950/20">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Ümumi Satış (Dövriyyə)
              </div>
              <div className="text-2xl font-bold text-[#1976F3] dark:text-blue-400 font-mono tabular-nums mt-1">
                {formatMoney(summary.totalRevenue)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Müştəridən alınan yekun məbləğ
              </div>
            </div>

            <div className="p-4 sm:p-5 bg-amber-50/40 dark:bg-amber-950/25">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Maya Dəyəri (Ayrı)
              </div>
              <div className="text-2xl font-bold text-amber-700 dark:text-amber-400 font-mono tabular-nums mt-1">
                {summary.count > 0 && summary.costedCount === 0 && summary.missingCostCount > 0
                  ? '—'
                  : formatMoney(summary.totalCost)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {summary.missingCostCount > 0
                  ? `${summary.missingCostCount} sətirdə alış qiyməti boşdur`
                  : 'Satılan malların alış dəyəri'}
              </div>
            </div>

            <div
              className={`p-4 sm:p-5 ${
                summary.totalProfit < 0
                  ? 'bg-red-50/45 dark:bg-red-950/30'
                  : 'bg-emerald-50/45 dark:bg-emerald-950/30'
              }`}
            >
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Xalis Gəlir (Mənfəət)
              </div>
              <div
                className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
                  summary.totalProfit < 0
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {summary.count > 0 && summary.costedCount === 0 && summary.missingCostCount > 0
                  ? '—'
                  : formatMoney(summary.totalProfit)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                {profitMarginPercent !== null
                  ? `Satış − Maya · Marja ${profitMarginPercent.toFixed(1)}%`
                  : 'Satış − Maya dəyəri'}
              </div>
            </div>
          </div>

          {/* Filter & Date Toolbar */}
          <div className="bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="Məhsul adı, barkod və ya çek nömrəsi axtar..."
                className="w-full pl-10 pr-9 py-2 bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              {queryText ? (
                <button
                  type="button"
                  onClick={() => setQueryText('')}
                  aria-label="Axtarışı təmizlə"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg overflow-x-auto">
                {(
                  [
                    { id: 'today', label: 'Bu gün' },
                    { id: 'week', label: 'Son 7 gün' },
                    { id: 'month', label: 'Bu ay' },
                    { id: 'all', label: 'Hamısı' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setPeriod(tab.id);
                      if (tab.id === 'today') {
                        setSelectedDate(todayKey);
                      }
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      period === tab.id
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Specific Day Stepper & Picker */}
              <div className="inline-flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    const prev = shiftDateKey(activeDateValue, -1);
                    setSelectedDate(prev);
                    setPeriod(prev === todayKey ? 'today' : 'date');
                  }}
                  aria-label="Əvvəlki gün"
                  title="Əvvəlki gün"
                  className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-r border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <input
                  type="date"
                  value={activeDateValue}
                  max={todayKey}
                  aria-label="Gün seçin"
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    setSelectedDate(val);
                    setPeriod(val === todayKey ? 'today' : 'date');
                  }}
                  className="px-2.5 py-1.5 text-xs font-mono tabular-nums bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                />
                <button
                  type="button"
                  disabled={isAtToday}
                  onClick={() => {
                    const next = shiftDateKey(activeDateValue, 1);
                    const clamped = next > todayKey ? todayKey : next;
                    setSelectedDate(clamped);
                    setPeriod(clamped === todayKey ? 'today' : 'date');
                  }}
                  aria-label="Növbəti gün"
                  title="Növbəti gün"
                  className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed border-l border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                disabled={filteredSales.length === 0}
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-45 disabled:cursor-not-allowed rounded-lg whitespace-nowrap cursor-pointer"
                title="Siyahını Excel (CSV) faylı kimi yüklə"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel (CSV)</span>
              </button>

              <button
                type="button"
                onClick={onOpenReceiptSettings}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap cursor-pointer"
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>Çek ayarları</span>
              </button>
            </div>
          </div>

          {/* Daily Summary Breakdown when viewing multi-day period */}
          {dailyGroups.length > 0 ? (
            <div className="bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Günlər üzrə yekun
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Hər günün siyahısını açmaq üçün istənilən günün sətrinə klikləyin
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {dailyGroups.length} gün
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/70 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <th className="py-2.5 px-4">Tarix</th>
                      <th className="py-2.5 px-4 text-right">Satış</th>
                      <th className="py-2.5 px-4 text-right">Miqdar</th>
                      <th className="py-2.5 px-4 text-right">Satış məbləği</th>
                      <th className="py-2.5 px-4 text-right">Maya dəyəri</th>
                      <th className="py-2.5 px-4 text-right">Xalis gəlir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs sm:text-sm">
                    {dailyGroups.map((day) => {
                      const hasAllMissing =
                        day.missingCostCount > 0 &&
                        day.totalCost === 0 &&
                        day.count === day.missingCostCount;
                      return (
                        <tr
                          key={day.dateKey}
                          onClick={() => {
                            setSelectedDate(day.dateKey);
                            setPeriod(day.dateKey === todayKey ? 'today' : 'date');
                          }}
                          className="hover:bg-blue-50/40 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                        >
                          <td className="py-2.5 px-4 font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            {formatDisplayDateFromKey(day.dateKey)}
                            {day.dateKey === todayKey ? (
                              <span className="ml-2 text-[11px] font-sans font-semibold text-[#1976F3] dark:text-blue-400">
                                Bu gün
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {day.count}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {day.totalUnits}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-[#1976F3] dark:text-blue-400 whitespace-nowrap">
                            {formatMoney(day.totalRevenue)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
                            {hasAllMissing ? '—' : formatMoney(day.totalCost)}
                          </td>
                          <td
                            className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                              day.totalProfit < 0
                                ? 'text-red-700 dark:text-red-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {hasAllMissing ? '—' : formatMoney(day.totalProfit)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {/* Itemized Sales List */}
      <div className="bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {activeListTitle}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>
                <span className="font-mono tabular-nums">{summary.count}</span> satış
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Satış:{' '}
                <span className="font-mono tabular-nums font-semibold text-[#1976F3] dark:text-blue-400">
                  {formatMoney(summary.totalRevenue)}
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Maya dəyəri:{' '}
                <span className="font-mono tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                  {formatMoney(summary.totalCost)}
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Xalis gəlir:{' '}
                <span
                  className={`font-mono tabular-nums font-semibold ${
                    summary.totalProfit < 0
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {formatMoney(summary.totalProfit)}
                </span>
              </span>
              {summary.totalReturnedAmount > 0 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-700 dark:text-amber-400 font-mono tabular-nums">
                    İadə: -{formatMoney(summary.totalReturnedAmount)}
                  </span>
                </>
              ) : null}
            </p>
          </div>

          {compact && onOpenFullReport ? (
            <button
              type="button"
              onClick={onOpenFullReport}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 whitespace-nowrap self-start sm:self-auto cursor-pointer"
            >
              <span>Günlük siyahıya bax</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>

        {filteredSales.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <Receipt className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {sales.length === 0
                  ? 'Hələ heç bir satış qeydə alınmayıb'
                  : period === 'today'
                  ? 'Bu gün hələ satış qeydə alınmayıb'
                  : 'Seçilən tarix və filtr üzrə satış tapılmadı'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {sales.length === 0
                  ? 'İlk satışı qeydə almaq və çek çap etmək üçün "Satış et" düyməsindən istifadə edin.'
                  : 'Başqa tarix seçə və ya "Hamısı" bölməsinə keçə bilərsiniz.'}
              </p>
            </div>
            {sales.length === 0 ? (
              <button
                type="button"
                onClick={onOpenSaleModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg cursor-pointer"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Satış et</span>
              </button>
            ) : !compact && period !== 'all' ? (
              <button
                type="button"
                onClick={() => setPeriod('all')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
              >
                <span>Bütün satışları göstər</span>
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/70 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <th className="py-3 px-4">Tarix / Çek</th>
                    <th className="py-3 px-4">Məhsul</th>
                    <th className="py-3 px-4 text-right">Miqdar</th>
                    <th className="py-3 px-4 text-right">Vahid qiymət</th>
                    <th className="py-3 px-4 text-right">Satış məbləği</th>
                    <th className="py-3 px-4 text-right">Maya dəyəri</th>
                    <th className="py-3 px-4 text-right">Xalis gəlir</th>
                    <th className="py-3 px-4 text-right">Əməliyyat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                  {filteredSales.map((sale) => {
                    const returnedQty = sale.returnedQuantity ?? 0;
                    const returnedAmt = sale.returnedAmount ?? 0;
                    const remainingQty = getNetSaleQuantity(sale);
                    const netAmt = getNetSaleAmount(sale);
                    const unitCost = getSaleUnitCost(sale, productCostMap);
                    const costAmt = getSaleCostAmount(sale, productCostMap);
                    const profitAmt = getSaleNetProfit(sale, productCostMap);
                    const isFullyReturned = remainingQty <= 0;
                    return (
                      <tr
                        key={sale.id}
                        className="hover:bg-blue-50/35 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {formatDateTime(sale.soldAt, sale.id)}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500 mt-0.5">
                            {sale.receiptNumber || 'Tək satış'}
                            {sale.paymentMethod
                              ? ` · ${formatPaymentMethodLabel(sale.paymentMethod)}`
                              : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4 max-w-[240px]">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ProductThumb
                              name={sale.productName}
                              category={sale.category}
                              icon={productIconMap?.get(sale.productId)}
                              sizeClassName="w-8 h-8"
                              imgClassName="w-6 h-6"
                            />
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                                {sale.productName}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono tabular-nums">
                                {sale.category} · {sale.barcode}
                              </div>
                              {returnedQty > 0 ? (
                                <div className="mt-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 truncate">
                                  {isFullyReturned
                                    ? 'Tam qaytarılıb'
                                    : `Qaytarılıb: ${returnedQty} ${sale.unit}`}
                                  {sale.returnReason ? ` · ${sale.returnReason}` : ''}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {returnedQty > 0 ? (
                            <div>
                              <div className="line-through text-slate-400">
                                {sale.quantity} {sale.unit}
                              </div>
                              <div>
                                {remainingQty} {sale.unit}
                              </div>
                            </div>
                          ) : (
                            `${sale.quantity} ${sale.unit}`
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          <div>{formatMoney(sale.unitPrice)}</div>
                          {unitCost !== undefined ? (
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                              Alış: {formatMoney(unitCost)}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap">
                          {returnedAmt > 0 ? (
                            <div>
                              <div className="text-[11px] font-normal text-slate-400 line-through">
                                {formatMoney(sale.totalAmount)}
                              </div>
                              <div
                                className={
                                  isFullyReturned
                                    ? 'text-slate-400 dark:text-slate-500'
                                    : 'text-[#1976F3] dark:text-blue-400'
                                }
                              >
                                {formatMoney(netAmt)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[#1976F3] dark:text-blue-400">
                              {formatMoney(sale.totalAmount)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs sm:text-sm font-medium whitespace-nowrap">
                          {costAmt !== null ? (
                            <span
                              className={
                                isFullyReturned
                                  ? 'text-slate-400 dark:text-slate-500'
                                  : 'text-amber-700 dark:text-amber-400'
                              }
                            >
                              {formatMoney(costAmt)}
                            </span>
                          ) : (
                            <span
                              className="text-xs font-sans text-slate-400 dark:text-slate-500"
                              title="Məhsulda alış qiyməti (maya dəyəri) daxil edilməyib"
                            >
                              Qeyd yoxdur
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs sm:text-sm font-semibold whitespace-nowrap">
                          {profitAmt !== null ? (
                            <span
                              className={
                                isFullyReturned
                                  ? 'text-slate-400 dark:text-slate-500'
                                  : profitAmt < 0
                                  ? 'text-red-700 dark:text-red-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                              }
                            >
                              {formatMoney(profitAmt)}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {remainingQty > 0 ? (
                              <button
                                type="button"
                                onClick={() => onRequestReturnSale(sale)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 rounded-lg cursor-pointer"
                                title="Malı qaytar və stoku bərpa et"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Qaytar</span>
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => onReprintSale(sale)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/60 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
                              title="Çeki aç və çap et"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Çek</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onRequestDeleteSale(sale)}
                              className="p-1.5 text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg cursor-pointer"
                              aria-label="Satış qeydini sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {!compact ? (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-900/80 text-xs sm:text-sm font-bold">
                      <td className="py-3 px-4 text-slate-800 dark:text-slate-200" colSpan={2}>
                        Siyahı üzrə cəmi ({summary.count} satış)
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {summary.totalUnits}
                      </td>
                      <td className="py-3 px-4" />
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#1976F3] dark:text-blue-400 whitespace-nowrap">
                        {formatMoney(summary.totalRevenue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400 whitespace-nowrap">
                        {summary.count > 0 &&
                        summary.costedCount === 0 &&
                        summary.missingCostCount > 0
                          ? '—'
                          : formatMoney(summary.totalCost)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap ${
                          summary.totalProfit < 0
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {summary.count > 0 &&
                        summary.costedCount === 0 &&
                        summary.missingCostCount > 0
                          ? '—'
                          : formatMoney(summary.totalProfit)}
                      </td>
                      <td className="py-3 px-4" />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>

            {/* Mobile List */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSales.map((sale) => {
                const returnedQty = sale.returnedQuantity ?? 0;
                const remainingQty = getNetSaleQuantity(sale);
                const netAmt = getNetSaleAmount(sale);
                const costAmt = getSaleCostAmount(sale, productCostMap);
                const profitAmt = getSaleNetProfit(sale, productCostMap);
                const isFullyReturned = remainingQty <= 0;
                return (
                  <div key={sale.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ProductThumb
                          name={sale.productName}
                          category={sale.category}
                          icon={productIconMap?.get(sale.productId)}
                          sizeClassName="w-9 h-9"
                          imgClassName="w-7 h-7"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {sale.productName}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {sale.category} ·{' '}
                            <span className="font-mono tabular-nums">{sale.barcode}</span>
                          </div>
                          {returnedQty > 0 ? (
                            <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400 mt-0.5">
                              {isFullyReturned
                                ? 'Tam qaytarılıb'
                                : `Qaytarılıb: ${returnedQty} ${sale.unit}`}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="font-mono tabular-nums text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap text-right">
                        {remainingQty} {sale.unit}
                      </div>
                    </div>

                    {/* Separate Revenue / Cost / Profit strip per mobile row */}
                    <div className="grid grid-cols-3 border border-slate-200/80 dark:border-slate-800 rounded-lg divide-x divide-slate-200/80 dark:divide-slate-800 bg-slate-50/70 dark:bg-slate-900/60 text-xs">
                      <div className="px-2.5 py-1.5">
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          Satış
                        </div>
                        <div className="font-mono tabular-nums font-semibold text-[#1976F3] dark:text-blue-400">
                          {formatMoney(netAmt)}
                        </div>
                      </div>
                      <div className="px-2.5 py-1.5">
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          Maya dəyəri
                        </div>
                        <div className="font-mono tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                          {costAmt !== null ? formatMoney(costAmt) : '—'}
                        </div>
                      </div>
                      <div className="px-2.5 py-1.5">
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          Xalis gəlir
                        </div>
                        <div
                          className={`font-mono tabular-nums font-semibold ${
                            profitAmt === null
                              ? 'text-slate-400'
                              : profitAmt < 0
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {profitAmt !== null ? formatMoney(profitAmt) : '—'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono tabular-nums truncate">
                        {formatDateTime(sale.soldAt, sale.id)}
                        {sale.receiptNumber ? ` · ${sale.receiptNumber}` : ''}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {remainingQty > 0 ? (
                          <button
                            type="button"
                            onClick={() => onRequestReturnSale(sale)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Qaytar</span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onReprintSale(sale)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 border border-slate-200 dark:border-slate-700 rounded cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Çek</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onRequestDeleteSale(sale)}
                          className="p-1 text-slate-400 hover:text-red-700 dark:hover:text-red-400 cursor-pointer"
                          aria-label="Satış qeydini sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
