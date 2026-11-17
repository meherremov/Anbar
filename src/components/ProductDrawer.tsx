import {
  AlertTriangle,
  Camera,
  Check,
  ImagePlus,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  DEFAULT_CATEGORIES,
  FIELD_LIMITS,
  UNIT_OPTIONS,
  type BarcodeScanResult,
  type Product,
  type ProductFormValues,
} from '../types/inventory';
import {
  generateInternalBarcode,
  validateAndSanitizeProduct,
  type ValidatedProductPayload,
} from '../utils/barcodeDecoder';
import { BarcodeGraphic } from './BarcodeGraphic';
import { ProductThumb } from './ProductThumb';

interface ProductDrawerProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  product: Product | null;
  initialBarcode?: BarcodeScanResult | null;
  categories: string[];
  existingProducts: Product[];
  onClose: () => void;
  onCreate: (payload: ValidatedProductPayload) => Promise<void>;
  onUpdate: (productId: string, payload: ValidatedProductPayload) => Promise<void>;
  onDeleteRequest: (product: Product) => void;
  onSelectExistingProduct: (product: Product) => void;
  onOpenScannerForField: (tab: 'camera' | 'gallery') => void;
  scannedBarcodeOverride: BarcodeScanResult | null;
  onConsumeScannedOverride: () => void;
  onAddCategory: (name: string) => Promise<void>;
}

function toFormValues(
  product: Product | null,
  initialBarcode: BarcodeScanResult | null | undefined,
  defaultCategory: string
): ProductFormValues {
  if (product) {
    return {
      name: product.name,
      barcode: product.barcode,
      barcodeFormat: product.barcodeFormat || 'MANUAL',
      category: product.category || defaultCategory,
      brand: product.brand || '',
      quantity: String(product.quantity),
      unit: product.unit || 'ədəd',
      purchasePrice:
        typeof product.purchasePrice === 'number' ? String(product.purchasePrice) : '',
      salePrice: String(product.salePrice),
      minStock: typeof product.minStock === 'number' ? String(product.minStock) : '5',
      shelfLocation: product.shelfLocation || '',
      notes: product.notes || '',
    };
  }

  return {
    name: '',
    barcode: initialBarcode?.code || '',
    barcodeFormat: initialBarcode?.format || 'MANUAL',
    category: defaultCategory,
    brand: '',
    quantity: '1',
    unit: 'ədəd',
    purchasePrice: '',
    salePrice: '',
    minStock: '5',
    shelfLocation: '',
    notes: '',
  };
}

export function ProductDrawer({
  isOpen,
  mode,
  product,
  initialBarcode,
  categories,
  existingProducts,
  onClose,
  onCreate,
  onUpdate,
  onDeleteRequest,
  onSelectExistingProduct,
  onOpenScannerForField,
  scannedBarcodeOverride,
  onConsumeScannedOverride,
  onAddCategory,
}: ProductDrawerProps) {
  const allCategories = useMemo(() => {
    const merged = new Set<string>([...DEFAULT_CATEGORIES, ...categories]);
    return Array.from(merged);
  }, [categories]);

  const [form, setForm] = useState<ProductFormValues>(() =>
    toFormValues(product, initialBarcode, allCategories[0] || 'Digər')
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState<boolean>(false);

  const lastSavedSerializedRef = useRef<string>('');
  const isInitialMountRef = useRef<boolean>(true);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const initial = toFormValues(product, initialBarcode, allCategories[0] || 'Digər');
    setForm(initial);
    setError(null);
    setAutoSaveState('idle');
    setShowNewCategoryInput(false);
    setNewCategoryName('');
    lastSavedSerializedRef.current = JSON.stringify(initial);
    isInitialMountRef.current = true;
  }, [isOpen, mode, product?.id, initialBarcode?.code]);

  // Apply barcode scanned from Camera/Gallery modal or GlobalBarcodeListener while drawer is open
  useEffect(() => {
    if (isOpen && scannedBarcodeOverride) {
      setForm((prev) => ({
        ...prev,
        barcode: scannedBarcodeOverride.code,
        barcodeFormat: scannedBarcodeOverride.format,
      }));
      setError(null);
      if (!form.name.trim()) {
        nameInputRef.current?.focus();
      }
      onConsumeScannedOverride();
    }
  }, [isOpen, scannedBarcodeOverride, onConsumeScannedOverride, form.name]);

  // Automatic cloud save when editing an existing product
  useEffect(() => {
    if (!isOpen || mode !== 'edit' || !product) return;

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    const currentSerialized = JSON.stringify(form);
    if (currentSerialized === lastSavedSerializedRef.current) {
      return;
    }

    const validation = validateAndSanitizeProduct(form);
    if (!validation.ok) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setAutoSaveState('saving');
      try {
        await onUpdate(product.id, validation.data);
        lastSavedSerializedRef.current = currentSerialized;
        setAutoSaveState('saved');
      } catch {
        setAutoSaveState('idle');
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [form, isOpen, mode, product, onUpdate]);

  const duplicateProduct = useMemo(() => {
    const trimmed = form.barcode.trim().toLowerCase();
    if (!trimmed) return null;
    return (
      existingProducts.find(
        (p) => p.barcode.trim().toLowerCase() === trimmed && p.id !== product?.id
      ) || null
    );
  }, [existingProducts, form.barcode, product?.id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = validateAndSanitizeProduct(form);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setSaving(true);
    try {
      if (mode === 'create') {
        await onCreate(validation.data);
      } else if (product) {
        await onUpdate(product.id, validation.data);
        lastSavedSerializedRef.current = JSON.stringify(form);
        setAutoSaveState('saved');
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Məlumat yadda saxlanılarkən xəta baş verdi.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCategory = async () => {
    const trimmed = newCategoryName.trim().slice(0, FIELD_LIMITS.CATEGORY_MAX);
    if (!trimmed) return;
    await onAddCategory(trimmed);
    setForm((prev) => ({ ...prev, category: trimmed }));
    setNewCategoryName('');
    setShowNewCategoryInput(false);
  };

  const adjustQty = (delta: number) => {
    const current = Number(form.quantity) || 0;
    const next = Math.max(0, current + delta);
    setForm((prev) => ({ ...prev, quantity: String(next) }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/60 backdrop-blur-[1px]">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <aside
        className="relative z-10 w-full max-w-xl bg-white dark:bg-[#131C31] h-full flex flex-col border-l border-slate-200 dark:border-slate-800 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <ProductThumb
              name={form.name}
              category={form.category}
              sizeClassName="w-10 h-10"
              imgClassName="w-8 h-8"
            />
            <div className="min-w-0">
              <h2 id="drawer-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
                {mode === 'create' ? 'Yeni məhsul əlavə et' : 'Məhsulu redaktə et'}
              </h2>
              {mode === 'edit' ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {autoSaveState === 'saving'
                    ? 'Dəyişikliklər yadda saxlanılır...'
                    : autoSaveState === 'saved'
                    ? 'Avtomatik yadda saxlanıldı'
                    : 'Dəyişikliklər avtomatik olaraq buludda yadda saxlanılır'}
                </p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  Barkodu kamera və ya qalereyadan oxudub məhsulu əlavə edin
                </p>
              )}
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error ? (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          ) : null}

          {/* Barcode Section */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="product-barcode"
                className="text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                Məhsulun barkodu
              </label>
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    barcode: generateInternalBarcode(),
                    barcodeFormat: 'INTERNAL_EAN13',
                  }))
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Daxili kod yarat</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="product-barcode"
                type="text"
                value={form.barcode}
                maxLength={FIELD_LIMITS.BARCODE_MAX}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    nameInputRef.current?.focus();
                  }
                }}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    barcode: e.target.value,
                    barcodeFormat: prev.barcodeFormat || 'MANUAL',
                  }))
                }
                placeholder="Məs: 4760012345678"
                className="flex-1 px-3 py-2.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenScannerForField('camera')}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <span>Kamera</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenScannerForField('gallery')}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap cursor-pointer"
                >
                  <ImagePlus className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <span>Qalereya</span>
                </button>
              </div>
            </div>

            {form.barcode.trim() ? (
              <BarcodeGraphic code={form.barcode.trim()} format={form.barcodeFormat} />
            ) : null}

            {duplicateProduct ? (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Bu barkod artıq başqa məhsulda qeydiyyatdadır:</p>
                    <p className="mt-0.5 text-amber-800 dark:text-amber-300">{duplicateProduct.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectExistingProduct(duplicateProduct)}
                  className="px-2.5 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-200 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Ona keç
                </button>
              </div>
            ) : null}
          </div>

          {/* Product Name */}
          <div>
            <label htmlFor="product-name" className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              Məhsulun adı *
            </label>
            <input
              ref={nameInputRef}
              id="product-name"
              type="text"
              required
              maxLength={FIELD_LIMITS.NAME_MAX}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Məs: A4 Çap Kağızı 80 q/m² (500 vərəq)"
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
          </div>

          {/* Category & Brand */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="product-category" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Kateqoriya *
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewCategoryInput((v) => !v)}
                  className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer"
                >
                  {showNewCategoryInput ? 'Ləğv et' : '+ Yeni kateqoriya'}
                </button>
              </div>
              {showNewCategoryInput ? (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newCategoryName}
                    maxLength={FIELD_LIMITS.CATEGORY_MAX}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Kateqoriya adı"
                    className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={handleCreateCategory}
                    className="px-3 py-2 bg-blue-700 dark:bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-800 dark:hover:bg-blue-500 cursor-pointer"
                  >
                    Əlavə et
                  </button>
                </div>
              ) : (
                <select
                  id="product-category"
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label htmlFor="product-brand" className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                Marka / Brend
              </label>
              <input
                id="product-brand"
                type="text"
                maxLength={FIELD_LIMITS.BRAND_MAX}
                value={form.brand}
                onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))}
                placeholder="Məs: Faber-Castell, Double A"
                className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Stock Quantity & Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="product-qty" className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                Stok miqdarı *
              </label>
              <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => adjustQty(-1)}
                  className="px-2.5 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  aria-label="Azalt"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  id="product-qty"
                  type="number"
                  min={0}
                  step="any"
                  required
                  value={form.quantity}
                  onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
                  className="w-full text-center py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-transparent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => adjustQty(1)}
                  className="px-2.5 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  aria-label="Artır"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="product-unit" className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                Ölçü vahidi
              </label>
              <select
                id="product-unit"
                value={form.unit}
                onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
                className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {UNIT_OPTIONS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="product-min-stock" className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                Minimum xəbərdarlıq
              </label>
              <input
                id="product-min-stock"
                type="number"
                min={0}
                step="1"
                value={form.minStock}
                onChange={(e) => setForm((prev) => ({ ...prev, minStock: e.target.value }))}
                className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Pricing & Shelf */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="product-purchase-price" className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                Alış qiyməti (₼)
              </label>
              <input
                id="product-purchase-price"
                type="number"
                min={0}
                step="0.01"
                value={form.purchasePrice}
                onChange={(e) => setForm((prev) => ({ ...prev, purchasePrice: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="product-sale-price" className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                Satış qiyməti (₼) *
              </label>
              <input
                id="product-sale-price"
                type="number"
                min={0}
                step="0.01"
                required
                value={form.salePrice}
                onChange={(e) => setForm((prev) => ({ ...prev, salePrice: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="product-shelf" className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                Rəf / Yer
              </label>
              <input
                id="product-shelf"
                type="text"
                maxLength={FIELD_LIMITS.SHELF_MAX}
                value={form.shelfLocation}
                onChange={(e) => setForm((prev) => ({ ...prev, shelfLocation: e.target.value }))}
                placeholder="Məs: Rəf B-2"
                className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="product-notes" className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              Əlavə qeyd
            </label>
            <textarea
              id="product-notes"
              rows={3}
              maxLength={FIELD_LIMITS.NOTES_MAX}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Təchizatçı, rəng, ölçü və ya digər qeydlər..."
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
            />
          </div>

          {/* Footer actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            {mode === 'edit' && product ? (
              <button
                type="button"
                onClick={() => onDeleteRequest(product)}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 border border-transparent hover:border-red-200 dark:hover:border-red-900 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Məhsulu sil</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap cursor-pointer"
              >
                Bağla
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 rounded-lg whitespace-nowrap cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>
                  {saving
                    ? 'Yadda saxlanılır...'
                    : mode === 'create'
                    ? 'Məhsulu əlavə et'
                    : 'Yadda saxla'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}
