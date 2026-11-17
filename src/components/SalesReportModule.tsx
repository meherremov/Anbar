import { ArrowRight, Receipt, Search, ShoppingCart, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { SaleRecord } from '../types/inventory';

interface SalesReportModuleProps {
  sales: SaleRecord[];
  loading: boolean;
  compact?: boolean;
  onOpenFullReport?: () => void;
  onOpenSaleModal: () => void;
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
        const hay = `${sale.productName} ${sale.barcode} ${sale.category}`.toLowerCase();
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
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-10 bg-slate-100 rounded animate-pulse" />
        <div className="h-10 bg-slate-100 rounded animate-pulse" />
      </section>
    );
  }

  return (
    <section
      aria-label="Keçmiş satışlar hesabatı"
      className="space-y-4"
    >
      {!compact ? (
        <>
          {/* Full Report KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5">
              <div className="text-xs text-slate-500">Satış əməliyyatı</div>
              <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                {summary.count}
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <div className="text-xs text-slate-500">Satılan məhsul miqdarı</div>
              <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                {summary.totalUnits}
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <div className="text-xs text-slate-500">Ümumi satış gəliri</div>
              <div className="text-2xl font-bold text-emerald-700 font-mono tabular-nums mt-1">
                {formatMoney(summary.totalRevenue)}
              </div>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="Məhsul adı və ya barkod üzrə satış axtar..."
                className="w-full pl-10 pr-9 py-2 bg-slate-50 focus:bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              {queryText ? (
                <button
                  type="button"
                  onClick={() => setQueryText('')}
                  aria-label="Axtarışı təmizlə"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto self-start md:self-auto">
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
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {compact ? 'Son Satışlar Hesabatı' : 'Keçmiş Satışların Siyahısı'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="font-mono tabular-nums">{summary.count}</span> satış
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              Cəmi gəlir:{' '}
              <span className="font-mono tabular-nums font-semibold text-emerald-700">
                {formatMoney(summary.totalRevenue)}
              </span>
            </p>
          </div>

          {compact && onOpenFullReport ? (
            <button
              type="button"
              onClick={onOpenFullReport}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap self-start sm:self-auto cursor-pointer"
            >
              <span>Tam hesabata bax</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>

        {filteredSales.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <Receipt className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">
                {sales.length === 0
                  ? 'Hələ heç bir satış qeydə alınmayıb'
                  : 'Seçilən filtr üzrə satış tapılmadı'}
              </p>
              <p className="text-xs text-slate-500">
                {sales.length === 0
                  ? 'İlk satışı qeydə almaq üçün "Satış et" düyməsindən istifadə edin.'
                  : 'Tarix aralığını və ya axtarış sözünü dəyişin.'}
              </p>
            </div>
            {sales.length === 0 ? (
              <button
                type="button"
                onClick={onOpenSaleModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
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
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Tarix</th>
                    <th className="py-3 px-4">Məhsul</th>
                    <th className="py-3 px-4">Barkod</th>
                    <th className="py-3 px-4 text-right">Satılan miqdar</th>
                    <th className="py-3 px-4 text-right">Vahid qiymət</th>
                    <th className="py-3 px-4 text-right">Cəmi məbləğ</th>
                    <th className="py-3 px-4 text-right">Əməliyyat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {formatDateTime(sale.soldAt)}
                      </td>
                      <td className="py-3 px-4 max-w-[240px]">
                        <div className="font-medium text-slate-900 truncate">
                          {sale.productName}
                        </div>
                        <div className="text-xs text-slate-500 truncate">{sale.category}</div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                        {sale.barcode}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs font-medium text-slate-800 whitespace-nowrap">
                        {sale.quantity} {sale.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                        {formatMoney(sale.unitPrice)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700 whitespace-nowrap">
                        {formatMoney(sale.totalAmount)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onRequestDeleteSale(sale)}
                          className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer"
                          aria-label="Satış qeydini sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile List */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredSales.map((sale) => (
                <div key={sale.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {sale.productName}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {sale.category} ·{' '}
                        <span className="font-mono tabular-nums">{sale.barcode}</span>
                      </div>
                    </div>
                    <div className="font-mono tabular-nums text-sm font-semibold text-emerald-700 whitespace-nowrap">
                      {formatMoney(sale.totalAmount)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono tabular-nums">
                      {formatDateTime(sale.soldAt)} · {sale.quantity} {sale.unit}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRequestDeleteSale(sale)}
                      className="p-1 text-slate-400 hover:text-red-700 cursor-pointer"
                      aria-label="Satış qeydini sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
