import {
  AlertCircle,
  ArrowLeft,
  Check,
  Minus,
  Plus,
  Search,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Product } from '../types/inventory';
import { parseLocaleNumber } from '../utils/barcodeDecoder';
import { ProductThumb } from './ProductThumb';

interface QuickAddModalProps {
  isOpen: boolean;
  products: Product[];
  cartQuantities?: Map<string, number>;
  onClose: () => void;
  onConfirmAdd: (product: Product, quantity: number, unitPrice: number) => void;
}

export function QuickAddModal({
  isOpen,
  products,
  cartQuantities,
  onClose,
  onConfirmAdd,
}: QuickAddModalProps) {
  const [nameQuery, setNameQuery] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qtyInput, setQtyInput] = useState<string>('1');
  const [priceInput, setPriceInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const qtyInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setNameQuery('');
      setSelectedProduct(null);
      setQtyInput('1');
      setPriceInput('');
      setError(null);
      return;
    }
    window.setTimeout(() => searchInputRef.current?.focus(), 40);
  }, [isOpen]);

  const matchingProducts = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    const sorted = [...products].sort((a, b) => {
      if ((a.quantity > 0) !== (b.quantity > 0)) {
        return a.quantity > 0 ? -1 : 1;
      }
      if (q) {
        const aStarts = a.name.toLowerCase().startsWith(q);
        const bStarts = b.name.toLowerCase().startsWith(q);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
      }
      return a.name.localeCompare(b.name, 'az');
    });

    if (!q) return sorted.slice(0, 40);
    return sorted
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 40);
  }, [products, nameQuery]);

  const handleSelectProduct = (product: Product) => {
    if (product.quantity <= 0) return;
    const inCartQty = cartQuantities?.get(product.id) ?? 0;
    const remainingStock = Math.max(
      0,
      Math.round((product.quantity - inCartQty) * 100) / 100
    );
    const defaultQty =
      remainingStock > 0 && remainingStock < 1
        ? remainingStock
        : product.quantity < 1
        ? Math.round(product.quantity * 100) / 100
        : 1;

    setSelectedProduct(product);
    setQtyInput(String(defaultQty));
    setPriceInput(product.salePrice.toFixed(2));
    setError(null);
    window.setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 40);
  };

  const parsedQty = useMemo(() => {
    const val = parseLocaleNumber(qtyInput);
    if (Number.isNaN(val) || val <= 0) return 0;
    return Math.round(val * 100) / 100;
  }, [qtyInput]);

  const parsedPrice = useMemo(() => {
    const val = parseLocaleNumber(priceInput);
    if (Number.isNaN(val) || val < 0) return Number.NaN;
    return Math.round(val * 100) / 100;
  }, [priceInput]);

  const existingInCartQty = selectedProduct
    ? cartQuantities?.get(selectedProduct.id) ?? 0
    : 0;
  const maxAddableQty = selectedProduct
    ? Math.max(0, Math.round((selectedProduct.quantity - existingInCartQty) * 100) / 100)
    : 0;

  const linePreview =
    parsedQty > 0 && !Number.isNaN(parsedPrice)
      ? Math.round(parsedQty * parsedPrice * 100) / 100
      : 0;

  const handleStepQty = (delta: number) => {
    if (!selectedProduct) return;
    const minStep = selectedProduct.quantity < 1 ? selectedProduct.quantity : 1;
    const current = parsedQty > 0 ? parsedQty : minStep;
    const maxCap = maxAddableQty > 0 ? maxAddableQty : selectedProduct.quantity;
    const next = Math.min(
      maxCap,
      Math.max(minStep, Math.round((current + delta) * 100) / 100)
    );
    setQtyInput(String(next));
    setError(null);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    if (maxAddableQty <= 0) {
      setError(
        `"${selectedProduct.name}" üzrə bütün mövcud stok (${selectedProduct.quantity} ${selectedProduct.unit}) artıq səbətdədir.`
      );
      return;
    }

    if (parsedQty <= 0) {
      setError('Miqdar 0-dan böyük olmalıdır.');
      return;
    }

    if (parsedQty > maxAddableQty) {
      setError(
        existingInCartQty > 0
          ? `Səbətdə artıq ${existingInCartQty} ${selectedProduct.unit} var. Maksimum əlavə edilə bilən say: ${maxAddableQty} ${selectedProduct.unit}.`
          : `Mövcud anbar stoku (${selectedProduct.quantity} ${selectedProduct.unit}) keçilə bilməz.`
      );
      return;
    }

    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setError('Satış qiymətini düzgün daxil edin.');
      return;
    }

    onConfirmAdd(selectedProduct, parsedQty, parsedPrice);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-modal-title"
    >
      <div className="w-full max-w-lg bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-[#1976F3] dark:text-blue-400 inline-flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2
                id="quick-add-modal-title"
                className="text-base font-bold text-slate-900 dark:text-white truncate"
              >
                Tez Əlavə
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {selectedProduct
                  ? 'Miqdar və satış qiymətini təyin edib səbətə əlavə edin'
                  : 'Məhsulu adı ilə axtarın (barkodsuz satış üçün)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Bağla"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        {!selectedProduct ? (
          <div className="flex-1 overflow-hidden flex flex-col p-5 space-y-3">
            <div className="relative shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                placeholder="Məhsulun adını yazın..."
                aria-label="Məhsul adı üzrə axtarış"
                className="w-full pl-10 pr-9 py-2.5 bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
              />
              {nameQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setNameQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  aria-label="Axtarışı təmizlə"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-[52vh]">
              {matchingProducts.length === 0 ? (
                <div className="p-8 text-center space-y-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Uyğun məhsul tapılmadı
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Axtarış sözünü yoxlayın və ya dəyişin.
                  </p>
                </div>
              ) : (
                matchingProducts.map((product) => {
                  const inCart = cartQuantities?.get(product.id) ?? 0;
                  const outOfStock = product.quantity <= 0;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => handleSelectProduct(product)}
                      className="w-full px-3.5 py-3 flex items-center justify-between gap-3 text-left hover:bg-blue-50/60 dark:hover:bg-slate-800/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ProductThumb
                          name={product.name}
                          category={product.category}
                          icon={product.icon}
                          sizeClassName="w-9 h-9"
                          imgClassName="w-7 h-7"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {product.name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                            {outOfStock
                              ? 'Stok bitib (0)'
                              : `Stok: ${product.quantity} ${product.unit}`}
                            {inCart > 0 ? ` · Səbətdə: ${inCart}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold font-mono tabular-nums text-[#1976F3] dark:text-blue-400">
                          {product.salePrice.toFixed(2)} ₼
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {outOfStock ? 'Mövcud deyil' : 'Seç və təyin et'}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                setSelectedProduct(null);
                setError(null);
                window.setTimeout(() => searchInputRef.current?.focus(), 40);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Digər məhsul seç</span>
            </button>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <ProductThumb
                  name={selectedProduct.name}
                  category={selectedProduct.category}
                  icon={selectedProduct.icon}
                  sizeClassName="w-10 h-10"
                  imgClassName="w-8 h-8"
                />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {selectedProduct.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                    Stok: {selectedProduct.quantity} {selectedProduct.unit} · Kataloq:{' '}
                    {selectedProduct.salePrice.toFixed(2)} ₼
                    {existingInCartQty > 0
                      ? ` · Səbətdə: ${existingInCartQty}`
                      : ''}
                  </div>
                </div>
              </div>
            </div>

            {error ? (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Quantity input */}
              <div>
                <label
                  htmlFor="quick-add-qty"
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  Miqdar ({selectedProduct.unit}) *
                </label>
                <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleStepQty(-1)}
                    disabled={
                      parsedQty <=
                      (selectedProduct.quantity < 1 ? selectedProduct.quantity : 1)
                    }
                    className="px-3 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                    aria-label="Miqdarı azalt"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    ref={qtyInputRef}
                    id="quick-add-qty"
                    type="text"
                    inputMode="decimal"
                    value={qtyInput}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      setQtyInput(e.target.value.replace(/[^\d.,]/g, ''));
                      setError(null);
                    }}
                    className="w-full text-center py-2 text-sm font-mono tabular-nums font-bold text-slate-900 dark:text-white bg-transparent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleStepQty(1)}
                    disabled={parsedQty >= maxAddableQty}
                    className="px-3 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                    aria-label="Miqdarı artır"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Maksimum əlavə edilə bilən: {maxAddableQty} {selectedProduct.unit}
                </p>
              </div>

              {/* Custom on-the-fly price input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="quick-add-price"
                    className="text-xs font-semibold text-slate-800 dark:text-slate-200"
                  >
                    Satış qiyməti (AZN) *
                  </label>
                  {!Number.isNaN(parsedPrice) &&
                  parsedPrice !== selectedProduct.salePrice ? (
                    <button
                      type="button"
                      onClick={() => setPriceInput(selectedProduct.salePrice.toFixed(2))}
                      className="text-[11px] font-medium text-[#1976F3] dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Standart qiymət
                    </button>
                  ) : null}
                </div>
                <input
                  id="quick-add-price"
                  type="text"
                  inputMode="decimal"
                  value={priceInput}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    setPriceInput(e.target.value.replace(/[^\d.,]/g, ''));
                    setError(null);
                  }}
                  placeholder={selectedProduct.salePrice.toFixed(2)}
                  className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono tabular-nums font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Kataloq qiyməti: {selectedProduct.salePrice.toFixed(2)} AZN
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/35 border border-blue-200 dark:border-blue-900 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Sətir cəmi:
              </span>
              <span className="text-lg font-extrabold font-mono tabular-nums text-[#1976F3] dark:text-blue-400">
                {linePreview.toFixed(2)} AZN
              </span>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
              >
                Ləğv et
              </button>
              <button
                type="submit"
                disabled={maxAddableQty <= 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#05A660] hover:bg-[#048C50] disabled:opacity-50 rounded-lg cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Səbətə əlavə et</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
