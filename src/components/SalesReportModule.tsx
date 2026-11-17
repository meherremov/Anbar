import {
  ArrowRight,
  Printer,
  Receipt,
  Search,
  Settings2,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { SaleRecord } from '../types/inventory';

interface SalesReportModuleProps {
  sales: SaleRecord[];
  loading: boolean;
  compact?: boolean;
  onOpenFullReport?: () => void;
  onOpenSaleModal: () => void;
  onOpenReceiptSettings: () => void;
  onReprintSale: (sale: SaleRecord) => void;
  onRequestDeleteSale: (sale: SaleRecord) => void;
}

type PeriodFilter = 'all' | 'today' | 'week' | 'month';

function formatMoney(val: number): string {
  return `${val.toLocaleString('az-AZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₼`;
}

function formatDateTime(ts: SaleRecord['soldAt']): string {
  if (!ts || typeof ts.toDate !== 'function') {
    return 'İndi';
  }
  const d = ts.toDate();
  return d.toLocaleString('az-AZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SalesReportModule({
  sales,
  loading,
  compact = false,
  onOpenFullReport,
  onOpenSaleModal,
  onOpenReceiptSettings,
  onReprintSale,
  onRequestDeleteSale,
}: SalesReportModuleProps) {
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [queryText, setQueryText] = useState<string>('');

  const sortedSales = useMemo(() => {
    return [...sales].sort((a, b) => {
      const aMs = a.soldAt?.toMillis?.() ?? Date.now();
      const bMs = b.soldAt?.toMillis?.() ?? Date.now();
      return bMs - aMs;
    });
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

    return sortedSales.filter((sale) => {
      const soldMs = sale.soldAt?.toMillis?.() ?? Date.now();
      if (period === 'today' && soldMs < startOfToday) return false;
      if (period === 'week' && soldMs < sevenDaysAgo) return false;
      if (period === 'month' && soldMs < startOfMonth) return false;

      if (q) {
        const hay = `${sale.productName} ${sale.barcode} ${sale.category} ${
          sale.receiptNumber || ''
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sortedSales, compact, period, queryText]);

  const summary = useMemo(() => {
    const source = compact ? sortedSales : filteredSales;
    let totalRevenue = 0;
    let totalUnits = 0;
    for (const s of source) {
      totalRevenue += s.totalAmount;
      totalUnits += s.quantity;
    }
    return {
      count: source.length,
      totalUnits: Math.round(totalUnits * 100) / 100,
      totalRevenue,
    };
  }, [compact, sortedSales, filteredSales]);

  if (loading) {
    return (
      <section className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        <div className="h-10 bg-slate-100 dark:bg-slate-800/70 rounded animate-pulse" />
        <div className="h-10 bg-slate-100 dark:bg-slate-800/70 rounded animate-pulse" />
      </section>
    );
  }

  return (
    <section aria-label="Keçmiş satışlar hesabatı" className="space-y-4">
      {!compact ? (
        <>
          {/* Full Report KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 overflow-hidden">
            <div className="p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Satış sətri
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums mt-1">
                {summary.count}
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Satılan məhsul miqdarı
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums mt-1">
                {summary.totalUnits}
              </div>
            </div>
            <div className="p-4 sm:p-5 bg-emerald-50/40 dark:bg-emerald-950/35">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Ümumi satış gəliri
              </div>
              <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums mt-1">
                {formatMoney(summary.totalRevenue)}
              </div>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
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

            <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg overflow-x-auto">
                {(
                  [
                    { id: 'all', label: 'Hamısı' },
                    { id: 'today', label: 'Bu gün' },
                    { id: 'week', label: 'Son 7 gün' },
                    { id: 'month', label: 'Bu ay' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPeriod(tab.id)}
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
        </>
      ) : null}

      <div className="bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {compact ? 'Son Satışlar Hesabatı' : 'Keçmiş Satışların Siyahısı'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              <span className="font-mono tabular-nums">{summary.count}</span> satış
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              Cəmi gəlir:{' '}
              <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                {formatMoney(summary.totalRevenue)}
              </span>
            </p>
          </div>

          {compact && onOpenFullReport ? (
            <button
              type="button"
              onClick={onOpenFullReport}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 whitespace-nowrap self-start sm:self-auto cursor-pointer"
            >
              <span>Tam hesabata bax</span>
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
                  : 'Seçilən filtr üzrə satış tapılmadı'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {sales.length === 0
                  ? 'İlk satışı qeydə almaq və çek çap etmək üçün "Satış et" düyməsindən istifadə edin.'
                  : 'Tarix aralığını və ya axtarış sözünü dəyişin.'}
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
                    <th className="py-3 px-4">Barkod</th>
                    <th className="py-3 px-4 text-right">Satılan miqdar</th>
                    <th className="py-3 px-4 text-right">Vahid qiymət</th>
                    <th className="py-3 px-4 text-right">Cəmi məbləğ</th>
                    <th className="py-3 px-4 text-right">Əməliyyat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                  {filteredSales.map((sale) => (
                    <tr
                      key={sale.id}
                      className="hover:bg-blue-50/35 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {formatDateTime(sale.soldAt)}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500 mt-0.5">
                          {sale.receiptNumber || 'Tək satış'}
                          {sale.paymentMethod
                            ? ` · ${sale.paymentMethod === 'card' ? 'Kart' : 'Nağd'}`
                            : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-[240px]">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {sale.productName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {sale.category}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {sale.barcode}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {sale.quantity} {sale.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatMoney(sale.unitPrice)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {formatMoney(sale.totalAmount)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
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
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile List */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSales.map((sale) => (
                <div key={sale.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {sale.productName}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {sale.category} ·{' '}
                        <span className="font-mono tabular-nums">{sale.barcode}</span>
                      </div>
                    </div>
                    <div className="font-mono tabular-nums text-sm font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                      {formatMoney(sale.totalAmount)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono tabular-nums truncate">
                      {formatDateTime(sale.soldAt)} · {sale.quantity} {sale.unit}
                      {sale.receiptNumber ? ` · ${sale.receiptNumber}` : ''}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
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
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
