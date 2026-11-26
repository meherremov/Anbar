import {
  AlertCircle,
  Banknote,
  Check,
  CheckCircle2,
  CreditCard,
  Minus,
  Plus,
  Printer,
  QrCode,
  Receipt,
  RotateCcw,
  Scan,
  Search,
  Tag,
  Trash2,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type {
  BarcodeScanResult,
  CheckoutCartItem,
  PaymentMethod,
  Product,
  ReceiptData,
  ReceiptSettings,
} from '../types/inventory';
import { parseLocaleNumber } from '../utils/barcodeDecoder';
import { triggerBrowserPrint } from '../utils/thermalPrinter';
import { ProductThumb } from './ProductThumb';
import { QuickAddModal } from './QuickAddModal';

function getCartItemUnitPrice(item: CheckoutCartItem): number {
  return typeof item.unitPriceOverride === 'number' &&
    Number.isFinite(item.unitPriceOverride) &&
    item.unitPriceOverride >= 0
    ? item.unitPriceOverride
    : item.product.salePrice;
}

const QUICK_DISCOUNT_PERCENTS = [10, 15, 20] as const;

interface PosWorkspaceProps {
  products: Product[];
  receiptSettings: ReceiptSettings;
  externalScan?: { seq: number; scan: BarcodeScanResult } | null;
  hasBlockingModal: boolean;
  hasPastSales?: boolean;
  onConfirmCheckout: (
    items: CheckoutCartItem[],
    options: {
      paymentMethod: PaymentMethod;
      cashReceived?: number;
      discountAmount?: number;
    }
  ) => Promise<ReceiptData>;
  onOpenCameraScanner: () => void;
  onCreateMissingProduct: (scan?: BarcodeScanResult) => void;
  onOpenReceiptPreview: (receipt: ReceiptData) => void;
  onOpenReturnModal: () => void;
  onReprintLatestSale?: () => void;
}

function playScanBeep(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1280;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
    window.setTimeout(() => {
      void ctx.close();
    }, 180);
  } catch {
    // Ignore audio context restriction
  }
}


function ScannerGunIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 7h11l3 4-2 2h-4l-1.5 6.5a1.5 1.5 0 0 1-1.46 1.15H7.5A1.5 1.5 0 0 1 6 19.15L7.4 12H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
      <path d="M19 6v4" />
      <path d="M21 5v6" />
    </svg>
  );
}

const AUTO_PRINT_STORAGE_KEY = 'ofis_anbari_auto_print_receipt';

export function PosWorkspace({
  products,
  receiptSettings,
  externalScan,
  hasBlockingModal,
  hasPastSales = false,
  onConfirmCheckout,
  onOpenCameraScanner,
  onCreateMissingProduct,
  onOpenReceiptPreview,
  onOpenReturnModal,
  onReprintLatestSale,
}: PosWorkspaceProps) {
  const [cart, setCart] = useState<CheckoutCartItem[]>([]);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [itemDiscountDrafts, setItemDiscountDrafts] = useState<Record<string, string>>({});
  const [itemDiscountModes, setItemDiscountModes] = useState<Record<string, 'percent' | 'amount'>>({});
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [suggestionsDismissed, setSuggestionsDismissed] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('percent');
  const [discountInput, setDiscountInput] = useState<string>('');
  const [cashReceivedInput, setCashReceivedInput] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [quickAddOpen, setQuickAddOpen] = useState<boolean>(false);
  const [pickerQuery, setPickerQuery] = useState<string>('');
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const [statusBanner, setStatusBanner] = useState<{
    tone: 'ok' | 'warn' | 'err';
    text: string;
    missingScan?: BarcodeScanResult;
    receipt?: ReceiptData;
  }>({
    tone: 'ok',
    text: 'Kassa hazırdır — məhsulu barkodla oxudun və ya əl ilə əlavə edin.',
  });

  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const pickerInputRef = useRef<HTMLInputElement | null>(null);
  const productsRef = useRef<Product[]>(products);
  productsRef.current = products;
  const lastExternalSeqRef = useRef<number>(externalScan?.seq ?? 0);

  useEffect(() => {
    if (!hasBlockingModal && !pickerOpen && !quickAddOpen) {
      scanInputRef.current?.focus();
    }
  }, [hasBlockingModal, pickerOpen, quickAddOpen]);

  // Dismiss suggestion dropdown on outside click
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setSuggestionsDismissed(true);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  useEffect(() => {
    if (pickerOpen) {
      window.setTimeout(() => pickerInputRef.current?.focus(), 40);
    }
  }, [pickerOpen]);

  // Keep cart item details synced with latest inventory updates (price, stock, icon, name, unit)
  useEffect(() => {
    setCart((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((item) => {
        const latest = products.find((p) => p.id === item.product.id);
        if (
          latest &&
          (latest.name !== item.product.name ||
            latest.salePrice !== item.product.salePrice ||
            latest.quantity !== item.product.quantity ||
            latest.icon !== item.product.icon ||
            latest.barcode !== item.product.barcode ||
            latest.unit !== item.product.unit ||
            latest.category !== item.product.category)
        ) {
          changed = true;
          const nextQty =
            latest.quantity > 0 && item.quantity > latest.quantity
              ? Math.round(latest.quantity * 100) / 100
              : item.quantity;
          const effectivePrice =
            typeof item.unitPriceOverride === 'number' &&
            Number.isFinite(item.unitPriceOverride) &&
            item.unitPriceOverride >= 0
              ? item.unitPriceOverride
              : latest.salePrice;
          const gross = Math.round(nextQty * effectivePrice * 100) / 100;
          const nextDiscount =
            typeof item.discountPercent === 'number' && item.discountPercent > 0
              ? Math.min(gross, Math.round(gross * item.discountPercent) / 100)
              : typeof item.discountAmount === 'number' && item.discountAmount > 0
              ? Math.min(gross, Math.round(item.discountAmount * 100) / 100)
              : undefined;
          return {
            ...item,
            product: latest,
            quantity: nextQty,
            discountAmount: nextDiscount && nextDiscount > 0 ? nextDiscount : undefined,
          };
        }
        return item;
      });
      return changed ? next : prev;
    });
  }, [products]);

  // Clear stale "missing barcode" banner if that product was just added
  useEffect(() => {
    if (!statusBanner.missingScan) return;
    const targetCode = statusBanner.missingScan.code.trim().toLowerCase();
    const created = products.find(
      (p) => p.barcode.trim().toLowerCase() === targetCode
    );
    if (created) {
      setStatusBanner({
        tone: 'ok',
        text: `Yeni məhsul əlavə edildi: ${created.name} — artıq skan edib sata bilərsiniz.`,
      });
    }
  }, [products, statusBanner.missingScan]);

  const addProductToCart = useCallback((product: Product) => {
    if (product.quantity <= 0) {
      setStatusBanner({
        tone: 'warn',
        text: `"${product.name}" məhsulunun anbar stoku bitib (0 ${product.unit}).`,
      });
      return;
    }

    setQtyDrafts((prev) => {
      if (!(product.id in prev)) return prev;
      const next = { ...prev };
      delete next[product.id];
      return next;
    });

    setCart((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id);
      if (idx >= 0) {
        const curQty = prev[idx].quantity;
        if (curQty + 1 > product.quantity) {
          setStatusBanner({
            tone: 'warn',
            text: `"${product.name}" üzrə maksimum mövcud stok (${product.quantity} ${product.unit}) səbətdədir.`,
          });
          return prev;
        }
        const updated = [...prev];
        const nextQty = Math.round((curQty + 1) * 100) / 100;
        const unitPrice = getCartItemUnitPrice(prev[idx]);
        const gross = Math.round(nextQty * unitPrice * 100) / 100;
        const nextDiscountAmount =
          typeof prev[idx].discountPercent === 'number' && prev[idx].discountPercent > 0
            ? Math.min(gross, Math.round(gross * prev[idx].discountPercent!) / 100)
            : typeof prev[idx].discountAmount === 'number'
            ? Math.min(gross, prev[idx].discountAmount!)
            : undefined;
        updated[idx] = {
          ...prev[idx],
          product,
          quantity: nextQty,
          discountAmount: nextDiscountAmount,
        };
        setStatusBanner({
          tone: 'ok',
          text: `${product.name} (${updated[idx].quantity} ${product.unit}) səbətdə yeniləndi.`,
        });
        return updated;
      }

      const initialQty =
        product.quantity < 1 ? Math.round(product.quantity * 100) / 100 : 1;
      setStatusBanner({
        tone: 'ok',
        text: `Səbətə əlavə edildi: ${product.name}`,
      });
      return [...prev, { product, quantity: initialQty }];
    });
  }, []);

  const cartQuantities = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      map.set(item.product.id, item.quantity);
    }
    return map;
  }, [cart]);

  const handleQuickAddConfirm = useCallback(
    (product: Product, addedQty: number, unitPrice: number) => {
      if (product.quantity <= 0 || addedQty <= 0) return;
      const normalizedPrice = Math.round(unitPrice * 100) / 100;
      const priceOverride =
        Math.abs(normalizedPrice - product.salePrice) > 0.001
          ? normalizedPrice
          : undefined;

      setQtyDrafts((prev) => {
        if (!(product.id in prev)) return prev;
        const next = { ...prev };
        delete next[product.id];
        return next;
      });

      setCart((prev) => {
        const idx = prev.findIndex((i) => i.product.id === product.id);
        if (idx >= 0) {
          const updated = [...prev];
          const nextQty = Math.min(
            product.quantity,
            Math.round((prev[idx].quantity + addedQty) * 100) / 100
          );
          const effectivePrice = priceOverride ?? product.salePrice;
          const gross = Math.round(nextQty * effectivePrice * 100) / 100;
          const nextDiscountAmount =
            typeof prev[idx].discountPercent === 'number' &&
            prev[idx].discountPercent! > 0
              ? Math.min(gross, Math.round(gross * prev[idx].discountPercent!) / 100)
              : typeof prev[idx].discountAmount === 'number'
              ? Math.min(gross, prev[idx].discountAmount!)
              : undefined;
          updated[idx] = {
            ...prev[idx],
            product,
            quantity: nextQty,
            unitPriceOverride: priceOverride,
            discountAmount: nextDiscountAmount,
          };
          setStatusBanner({
            tone: 'ok',
            text: `Tez əlavə: ${product.name} (${nextQty} ${product.unit} · ${effectivePrice.toFixed(2)} AZN)`,
          });
          return updated;
        }

        const initialQty = Math.min(
          product.quantity,
          Math.max(0.01, Math.round(addedQty * 100) / 100)
        );
        const effectivePrice = priceOverride ?? product.salePrice;
        setStatusBanner({
          tone: 'ok',
          text: `Tez əlavə edildi: ${product.name} (${initialQty} ${product.unit} · ${effectivePrice.toFixed(2)} AZN)`,
        });
        return [
          ...prev,
          {
            product,
            quantity: initialQty,
            ...(priceOverride !== undefined ? { unitPriceOverride: priceOverride } : {}),
          },
        ];
      });
    },
    []
  );

  const handleBarcodeHit = useCallback(
    (scan: BarcodeScanResult) => {
      const normalized = scan.code.trim().toLowerCase();
      if (!normalized) return;

      const exactMatch = productsRef.current.find(
        (p) => p.barcode.trim().toLowerCase() === normalized
      );

      if (exactMatch) {
        playScanBeep();
        addProductToCart(exactMatch);
        return;
      }

      const nameMatch = productsRef.current.find(
        (p) => p.name.trim().toLowerCase() === normalized
      );
      if (nameMatch) {
        playScanBeep();
        addProductToCart(nameMatch);
        return;
      }

      // If cashier typed a text search (non-numeric) and only 1 product matches, add it directly
      if (scan.format === 'MANUAL' && normalized.length >= 2 && !/^\d+$/.test(normalized)) {
        const partialMatches = productsRef.current.filter((p) =>
          `${p.name} ${p.category}`.toLowerCase().includes(normalized)
        );
        if (partialMatches.length === 1) {
          playScanBeep();
          addProductToCart(partialMatches[0]);
          return;
        }
      }

      setStatusBanner({
        tone: 'warn',
        text: `Bu barkodla (${scan.code}) məhsul tapılmadı.`,
        missingScan: scan,
      });
    },
    [addProductToCart]
  );

  // Sync with GlobalBarcodeListener USB/Bluetooth scanner
  useEffect(() => {
    if (!externalScan || externalScan.seq === lastExternalSeqRef.current) return;
    lastExternalSeqRef.current = externalScan.seq;
    if (hasBlockingModal || pickerOpen || quickAddOpen) return;
    handleBarcodeHit(externalScan.scan);
  }, [externalScan, hasBlockingModal, pickerOpen, quickAddOpen, handleBarcodeHit]);

  const subtotalAmount = useMemo(() => {
    const sum = cart.reduce(
      (acc, item) => acc + item.quantity * getCartItemUnitPrice(item),
      0
    );
    return Math.round(sum * 100) / 100;
  }, [cart]);

  const itemsDiscountTotal = useMemo(() => {
    const sum = cart.reduce((acc, item) => {
      const gross = Math.round(item.quantity * getCartItemUnitPrice(item) * 100) / 100;
      const itemDisc =
        typeof item.discountAmount === 'number' && item.discountAmount > 0
          ? Math.min(gross, Math.round(item.discountAmount * 100) / 100)
          : 0;
      return acc + itemDisc;
    }, 0);
    return Math.round(sum * 100) / 100;
  }, [cart]);

  const netAfterItemDiscounts = useMemo(() => {
    return Math.max(0, Math.round((subtotalAmount - itemsDiscountTotal) * 100) / 100);
  }, [subtotalAmount, itemsDiscountTotal]);

  const discountAmount = useMemo(() => {
    if (!discountInput.trim()) return 0;
    const val = parseLocaleNumber(discountInput);
    if (Number.isNaN(val) || val <= 0) return 0;
    if (discountMode === 'percent') {
      const pct = Math.min(100, val);
      return Math.min(
        netAfterItemDiscounts,
        Math.round(netAfterItemDiscounts * pct) / 100
      );
    }
    return Math.min(netAfterItemDiscounts, Math.round(val * 100) / 100);
  }, [discountInput, discountMode, netAfterItemDiscounts]);

  const payableTotal = useMemo(() => {
    return Math.max(0, Math.round((netAfterItemDiscounts - discountAmount) * 100) / 100);
  }, [netAfterItemDiscounts, discountAmount]);

  const parsedCashReceived = useMemo(() => {
    if (paymentMethod !== 'cash' || !cashReceivedInput.trim()) return undefined;
    const val = parseLocaleNumber(cashReceivedInput);
    if (Number.isNaN(val) || val < 0) return undefined;
    return Math.round(val * 100) / 100;
  }, [paymentMethod, cashReceivedInput]);

  const inputSuggestions = useMemo(() => {
    if (suggestionsDismissed) return [];
    const q = barcodeInput.trim().toLowerCase();
    if (!q) return [];
    const exactExists = products.some((p) => p.barcode.trim().toLowerCase() === q);
    if (exactExists) return [];
    return products
      .filter((p) => {
        const hay = `${p.name} ${p.barcode} ${p.category}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 6);
  }, [products, barcodeInput, suggestionsDismissed]);

  const pickerCandidates = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const sorted = [...products].sort((a, b) => {
      if ((a.quantity > 0) !== (b.quantity > 0)) {
        return a.quantity > 0 ? -1 : 1;
      }
      return a.name.localeCompare(b.name, 'az');
    });
    if (!q) return sorted.slice(0, 40);
    return sorted
      .filter((p) =>
        `${p.name} ${p.barcode} ${p.category} ${p.brand || ''}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 40);
  }, [products, pickerQuery]);

  const handleScanSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = barcodeInput.trim();
    if (!trimmed) return;
    handleBarcodeHit({ code: trimmed, format: 'MANUAL' });
    setBarcodeInput('');
    scanInputRef.current?.focus();
  };

  const updateCartQty = (productId: string, nextQtyRaw: number, clearDraft = true) => {
    if (Number.isNaN(nextQtyRaw) || nextQtyRaw <= 0) return;
    if (clearDraft) {
      setQtyDrafts((prev) => {
        if (!(productId in prev)) return prev;
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        const rounded = Math.max(0.01, Math.round(nextQtyRaw * 100) / 100);
        const clamped = Math.min(item.product.quantity, rounded);
        if (rounded > item.product.quantity) {
          setStatusBanner({
            tone: 'warn',
            text: `"${item.product.name}" üzrə maksimum stok (${item.product.quantity} ${item.product.unit}) keçilə bilməz.`,
          });
        }
        const gross =
          Math.round(clamped * getCartItemUnitPrice(item) * 100) / 100;
        const clampedDiscount =
          typeof item.discountPercent === 'number' && item.discountPercent > 0
            ? Math.min(gross, Math.round(gross * item.discountPercent) / 100)
            : typeof item.discountAmount === 'number' && item.discountAmount > 0
            ? Math.min(gross, Math.round(item.discountAmount * 100) / 100)
            : undefined;
        return {
          ...item,
          quantity: clamped,
          discountAmount: clampedDiscount && clampedDiscount > 0 ? clampedDiscount : undefined,
        };
      })
    );
  };

  const handleQtyInputChange = (item: CheckoutCartItem, rawValue: string) => {
    const cleaned = rawValue.replace(/[^\d.,]/g, '');
    const parsed = parseLocaleNumber(cleaned);

    if (!Number.isNaN(parsed) && parsed > item.product.quantity) {
      const maxQty = Math.round(item.product.quantity * 100) / 100;
      setQtyDrafts((prev) => ({ ...prev, [item.product.id]: String(maxQty) }));
      updateCartQty(item.product.id, maxQty, false);
      setStatusBanner({
        tone: 'warn',
        text: `"${item.product.name}" üzrə maksimum mövcud stok ${maxQty} ${item.product.unit}-dir.`,
      });
      return;
    }

    setQtyDrafts((prev) => ({ ...prev, [item.product.id]: cleaned }));
    if (!Number.isNaN(parsed) && parsed > 0) {
      updateCartQty(item.product.id, parsed, false);
    }
  };

  const handleQtyInputBlur = (productId: string) => {
    setQtyDrafts((prev) => {
      if (!(productId in prev)) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const applyItemPercentDiscount = (productId: string, percent: number) => {
    const targetItem = cart.find((i) => i.product.id === productId);
    if (!targetItem) return;

    if (targetItem.discountPercent === percent) {
      clearItemDiscount(productId);
      return;
    }

    const gross =
      Math.round(targetItem.quantity * getCartItemUnitPrice(targetItem) * 100) / 100;
    const clampedPct = Math.min(100, Math.max(0, Math.round(percent * 100) / 100));
    const applied = Math.min(gross, Math.round(gross * clampedPct) / 100);

    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? {
              ...item,
              discountPercent: clampedPct > 0 ? clampedPct : undefined,
              discountAmount: applied > 0 ? applied : undefined,
            }
          : item
      )
    );
    setItemDiscountModes((prev) => ({ ...prev, [productId]: 'percent' }));
    setItemDiscountDrafts((prev) => ({
      ...prev,
      [productId]: clampedPct > 0 ? String(clampedPct) : '',
    }));
    setStatusBanner({
      tone: 'ok',
      text:
        applied > 0
          ? `"${targetItem.product.name}" üçün ${clampedPct}% (-${applied.toFixed(2)} AZN) endirim tətbiq edildi.`
          : `"${targetItem.product.name}" üzrə məhsul endirimi sıfırlandı.`,
    });
  };

  const applyItemDiscount = (productId: string) => {
    const targetItem = cart.find((i) => i.product.id === productId);
    if (!targetItem) return;

    const gross =
      Math.round(targetItem.quantity * getCartItemUnitPrice(targetItem) * 100) / 100;
    const mode = itemDiscountModes[productId] ?? 'percent';
    const rawStr = (itemDiscountDrafts[productId] ?? '').trim();
    if (!rawStr) {
      clearItemDiscount(productId);
      return;
    }

    const val = parseLocaleNumber(rawStr);
    if (Number.isNaN(val) || val < 0) {
      setStatusBanner({
        tone: 'warn',
        text: 'Endirim dəyəri 0 və ya müsbət rəqəm olmalıdır.',
      });
      return;
    }

    if (mode === 'percent') {
      const clampedPct = Math.min(100, Math.round(val * 100) / 100);
      const applied = Math.min(gross, Math.round(gross * clampedPct) / 100);
      setCart((prev) =>
        prev.map((item) =>
          item.product.id === productId
            ? {
                ...item,
                discountPercent: clampedPct > 0 ? clampedPct : undefined,
                discountAmount: applied > 0 ? applied : undefined,
              }
            : item
        )
      );
      setItemDiscountDrafts((prev) => ({
        ...prev,
        [productId]: clampedPct > 0 ? String(clampedPct) : '',
      }));
      setStatusBanner({
        tone: 'ok',
        text:
          applied > 0
            ? `"${targetItem.product.name}" üçün ${clampedPct}% (-${applied.toFixed(2)} AZN) endirim tətbiq edildi.`
            : `"${targetItem.product.name}" üzrə məhsul endirimi sıfırlandı.`,
      });
      return;
    }

    const applied = Math.min(gross, Math.round(val * 100) / 100);
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? {
              ...item,
              discountPercent: undefined,
              discountAmount: applied > 0 ? applied : undefined,
            }
          : item
      )
    );
    setItemDiscountDrafts((prev) => ({
      ...prev,
      [productId]: applied > 0 ? applied.toFixed(2) : '',
    }));
    setStatusBanner({
      tone: 'ok',
      text:
        applied > 0
          ? `"${targetItem.product.name}" üçün ${applied.toFixed(2)} AZN endirim tətbiq edildi.`
          : `"${targetItem.product.name}" üzrə məhsul endirimi sıfırlandı.`,
    });
  };

  const clearItemDiscount = (productId: string) => {
    const targetItem = cart.find((i) => i.product.id === productId);
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? { ...item, discountAmount: undefined, discountPercent: undefined }
          : item
      )
    );
    setItemDiscountDrafts((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    if (targetItem) {
      setStatusBanner({
        tone: 'ok',
        text: `"${targetItem.product.name}" üzrə məhsul endirimi ləğv edildi.`,
      });
    }
  };

  const removeCartItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
    setQtyDrafts((prev) => {
      if (!(productId in prev)) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    setItemDiscountDrafts((prev) => {
      if (!(productId in prev)) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    setItemDiscountModes((prev) => {
      if (!(productId in prev)) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const handleClearCart = useCallback(() => {
    setCart([]);
    setQtyDrafts({});
    setItemDiscountDrafts({});
    setItemDiscountModes({});
    setDiscountInput('');
    setCashReceivedInput('');
    setBarcodeInput('');
    setStatusBanner({
      tone: 'ok',
      text: 'Səbət təmizləndi.',
    });
    scanInputRef.current?.focus();
  }, []);

  const handlePrintAction = useCallback(() => {
    if (lastReceipt) {
      onOpenReceiptPreview(lastReceipt);
      return;
    }
    if (hasPastSales && onReprintLatestSale) {
      onReprintLatestSale();
      return;
    }
    setStatusBanner({
      tone: 'warn',
      text: 'Çap etmək üçün əvvəlcə ödənişi təsdiqləyin (F12) və ya Satış Hesabatından çeki seçin.',
    });
  }, [lastReceipt, hasPastSales, onReprintLatestSale, onOpenReceiptPreview]);

  const handleConfirmPayment = useCallback(async () => {
    if (submitting) return;
    if (cart.length === 0) {
      setStatusBanner({
        tone: 'warn',
        text: 'Ödənişi təsdiqləmək üçün səbətə ən azı 1 məhsul əlavə edin.',
      });
      return;
    }

    for (const item of cart) {
      if (item.quantity <= 0 || item.quantity > item.product.quantity) {
        setStatusBanner({
          tone: 'err',
          text: `"${item.product.name}" üçün mövcud stok (${item.product.quantity} ${item.product.unit}) keçilə bilməz.`,
        });
        return;
      }
    }

    if (
      paymentMethod === 'cash' &&
      typeof parsedCashReceived === 'number' &&
      parsedCashReceived > 0 &&
      parsedCashReceived < payableTotal
    ) {
      setStatusBanner({
        tone: 'err',
        text: 'Alınan nağd məbləğ ödəniləcək məbləğdən az ola bilməz.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const receipt = await onConfirmCheckout(cart, {
        paymentMethod,
        cashReceived: parsedCashReceived,
        discountAmount,
      });
      setLastReceipt(receipt);
      setCart([]);
      setQtyDrafts({});
      setItemDiscountDrafts({});
      setItemDiscountModes({});
      setDiscountInput('');
      setCashReceivedInput('');
      setBarcodeInput('');
      setStatusBanner({
        tone: 'ok',
        text: 'Satış uğurla əlavə edildi!',
        receipt,
      });

      try {
        if (window.localStorage.getItem(AUTO_PRINT_STORAGE_KEY) === 'true') {
          onOpenReceiptPreview(receipt);
          window.setTimeout(() => {
            void triggerBrowserPrint(receiptSettings.paperWidth);
          }, 250);
        }
      } catch {
        // Ignore storage error
      }
      scanInputRef.current?.focus();
    } catch (err) {
      setStatusBanner({
        tone: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Satış təsdiqlənərkən xəta baş verdi.',
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    submitting,
    cart,
    paymentMethod,
    parsedCashReceived,
    payableTotal,
    discountAmount,
    onConfirmCheckout,
    onOpenReceiptPreview,
    receiptSettings.paperWidth,
  ]);

  // Function-key POS keyboard shortcuts (F2, F5, F8, F9, F10, F11, F12)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (hasBlockingModal) return;

      if (e.key === 'Escape') {
        if (quickAddOpen) {
          e.preventDefault();
          setQuickAddOpen(false);
        } else if (pickerOpen) {
          e.preventDefault();
          setPickerOpen(false);
        } else {
          setSuggestionsDismissed(true);
        }
        return;
      }

      if (quickAddOpen) return;

      if (e.key === 'F2') {
        e.preventDefault();
        setPickerOpen((prev) => !prev);
      } else if (e.key === 'F5') {
        e.preventDefault();
        if (!pickerOpen) handleClearCart();
      } else if (e.key === 'F6') {
        e.preventDefault();
        if (!pickerOpen) onOpenReturnModal();
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (!pickerOpen) handlePrintAction();
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (!pickerOpen) setPaymentMethod('cash');
      } else if (e.key === 'F10') {
        e.preventDefault();
        if (!pickerOpen) {
          setPaymentMethod('card');
          setCashReceivedInput('');
        }
      } else if (e.key === 'F11') {
        e.preventDefault();
        if (!pickerOpen) {
          setPaymentMethod('mobile');
          setCashReceivedInput('');
        }
      } else if (e.key === 'F12') {
        e.preventDefault();
        if (!pickerOpen) void handleConfirmPayment();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    hasBlockingModal,
    pickerOpen,
    quickAddOpen,
    handleClearCart,
    onOpenReturnModal,
    handlePrintAction,
    handleConfirmPayment,
  ]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5 items-start">
      {/* Left / Main POS Pane */}
      <div className="space-y-4 min-w-0">
        {/* Scan Input Row */}
        <div className="relative" ref={searchContainerRef}>
          <form onSubmit={handleScanSubmit} className="flex items-stretch gap-2.5">
            <div className="flex-1 flex items-center bg-white dark:bg-[#131C31] border-2 border-[#3B82F6]/60 focus-within:border-[#1976F3] rounded-xl px-4 shadow-xs transition-colors">
              <ScannerGunIcon className="w-5 h-5 text-[#13233F] dark:text-slate-300 shrink-0 mr-3" />
              <input
                ref={scanInputRef}
                type="text"
                value={barcodeInput}
                onFocus={() => setSuggestionsDismissed(false)}
                onChange={(e) => {
                  setBarcodeInput(e.target.value);
                  setSuggestionsDismissed(false);
                }}
                placeholder="Barkodu oxudun və ya məhsulun adını yazın..."
                aria-label="Barkodu oxudun və ya məhsul axtarın"
                className="w-full py-3 bg-transparent text-sm sm:text-base font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
              />
              {barcodeInput ? (
                <button
                  type="button"
                  onClick={() => {
                    setBarcodeInput('');
                    setSuggestionsDismissed(false);
                    scanInputRef.current?.focus();
                  }}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  aria-label="Təmizlə"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              title="Məhsulu adı ilə axtarıb miqdar və qiyməti təyin edərək əlavə et"
              className="px-3 sm:px-4 rounded-xl bg-[#05A660] hover:bg-[#048C50] text-white inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              <Zap className="w-4 h-4 shrink-0" />
              <span>Tez Əlavə</span>
            </button>

            <button
              type="button"
              onClick={onOpenCameraScanner}
              title="Kamera və ya qalereya ilə barkod oxu"
              aria-label="Kamera ilə barkod oxu"
              className="w-13 sm:w-14 rounded-xl bg-[#1976F3] hover:bg-[#1565D8] text-white flex items-center justify-center shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              <Scan className="w-6 h-6" />
            </button>
          </form>

          {/* Instant Search Dropdown while typing */}
          {inputSuggestions.length > 0 ? (
            <div className="absolute left-0 right-16 top-full mt-1.5 z-30 bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {inputSuggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    addProductToCart(item);
                    setBarcodeInput('');
                    scanInputRef.current?.focus();
                  }}
                  className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-blue-50/70 dark:hover:bg-slate-800/70 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ProductThumb
                      name={item.name}
                      category={item.category}
                      icon={item.icon}
                      sizeClassName="w-9 h-9"
                      imgClassName="w-7 h-7"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {item.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        BAR: {item.barcode} · Stok: {item.quantity} {item.unit}
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-[#1976F3] dark:text-blue-400 tabular-nums shrink-0">
                    {item.salePrice.toFixed(2)} AZN
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Cart Table Card */}
        <div className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden flex flex-col min-h-[290px]">
          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col">
              <div className="hidden md:grid grid-cols-[52px_1fr_120px_150px_120px_96px] bg-[#F3F6FA] dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 px-4 py-3 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                <div>№</div>
                <div>Məhsul</div>
                <div className="text-center">Qiymət (AZN)</div>
                <div className="text-center">Miqdar</div>
                <div className="text-center">Cəmi (AZN)</div>
                <div className="text-center">Əməliyyat</div>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-2.5">
                <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#1976F3] dark:text-blue-400 flex items-center justify-center">
                  <ScannerGunIcon className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Səbət hələ boşdur
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                  Barkodu USB skanerlə oxudun, yuxarıdakı sahəyə yazın və ya{' '}
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="font-semibold text-[#1976F3] dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Məhsul Əlavə Et (F2)
                  </button>{' '}
                  və ya{' '}
                  <button
                    type="button"
                    onClick={() => setQuickAddOpen(true)}
                    className="font-semibold text-[#05A660] dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    Tez Əlavə
                  </button>{' '}
                  düyməsindən seçin.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Desktop POS Cart Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F3F6FA] dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                      <th className="py-3 px-4 w-12">№</th>
                      <th className="py-3 px-4">Məhsul</th>
                      <th className="py-3 px-4 text-center">Qiymət (AZN)</th>
                      <th className="py-3 px-4 text-center">Miqdar</th>
                      <th className="py-3 px-4 text-center">Cəmi (AZN)</th>
                      <th className="py-3 px-4 text-center">Əməliyyat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {cart.map((item, idx) => {
                      const unitPrice = getCartItemUnitPrice(item);
                      const hasCustomPrice = typeof item.unitPriceOverride === 'number';
                      const grossLineTotal =
                        Math.round(item.quantity * unitPrice * 100) / 100;
                      const appliedItemDiscount =
                        typeof item.discountAmount === 'number' && item.discountAmount > 0
                          ? Math.min(grossLineTotal, item.discountAmount)
                          : 0;
                      const netLineTotal = Math.max(
                        0,
                        Math.round((grossLineTotal - appliedItemDiscount) * 100) / 100
                      );
                      const discountModeForItem = itemDiscountModes[item.product.id] ?? 'percent';
                      const draftValue =
                        itemDiscountDrafts[item.product.id] ??
                        (typeof item.discountPercent === 'number' && discountModeForItem === 'percent'
                          ? String(item.discountPercent)
                          : appliedItemDiscount > 0 && discountModeForItem === 'amount'
                          ? appliedItemDiscount.toFixed(2)
                          : '');
                      return (
                        <tr
                          key={item.product.id}
                          className="hover:bg-blue-50/35 dark:hover:bg-slate-800/40 transition-colors align-top"
                        >
                          <td className="py-3.5 px-4 font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-start gap-3 min-w-0">
                              <ProductThumb
                                name={item.product.name}
                                category={item.product.category}
                                icon={item.product.icon}
                                sizeClassName="w-10 h-10"
                                imgClassName="w-8 h-8"
                              />
                              <div className="min-w-0 flex-1 space-y-2">
                                <div>
                                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[260px]">
                                    {item.product.name}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                    <span>(BAR: {item.product.barcode})</span>
                                    {appliedItemDiscount > 0 ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-sans font-semibold text-[11px]">
                                        {typeof item.discountPercent === 'number'
                                          ? `-${item.discountPercent}% (-${appliedItemDiscount.toFixed(2)} AZN)`
                                          : `-${appliedItemDiscount.toFixed(2)} AZN endirim`}
                                        <button
                                          type="button"
                                          onClick={() => clearItemDiscount(item.product.id)}
                                          className="hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                                          aria-label="Məhsul endirimini sil"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </span>
                                    ) : null}
                                  </div>
                                </div>

                                {/* Per-Item Quick Percentage Buttons (10%, 15%, 20%) + Custom % / AZN */}
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {QUICK_DISCOUNT_PERCENTS.map((pct) => {
                                    const active = item.discountPercent === pct;
                                    return (
                                      <button
                                        key={pct}
                                        type="button"
                                        onClick={() => applyItemPercentDiscount(item.product.id, pct)}
                                        className={`px-2 py-1 text-[11px] font-bold rounded-md border transition-colors cursor-pointer ${
                                          active
                                            ? 'bg-[#1976F3] text-white border-[#1976F3]'
                                            : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-800'
                                        }`}
                                      >
                                        {pct}%
                                      </button>
                                    );
                                  })}

                                  <div className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 overflow-hidden">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={draftValue}
                                      onFocus={(e) => e.currentTarget.select()}
                                      onChange={(e) =>
                                        setItemDiscountDrafts((prev) => ({
                                          ...prev,
                                          [item.product.id]: e.target.value,
                                        }))
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          applyItemDiscount(item.product.id);
                                        }
                                      }}
                                      placeholder={discountModeForItem === 'percent' ? 'Faiz %' : 'AZN'}
                                      aria-label={`${item.product.name} üçün endirim`}
                                      className="w-18 px-2 py-1 text-xs font-mono tabular-nums bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setItemDiscountModes((prev) => ({
                                          ...prev,
                                          [item.product.id]:
                                            discountModeForItem === 'percent' ? 'amount' : 'percent',
                                        }))
                                      }
                                      className="px-2 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                                      title="Faiz (%) və ya Manat (₼) arası dəyiş"
                                    >
                                      {discountModeForItem === 'percent' ? '%' : '₼'}
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => applyItemDiscount(item.product.id)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#1976F3] dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                                  >
                                    <Tag className="w-3 h-3" />
                                    <span>Endirim tətbiq et</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                            <div>{unitPrice.toFixed(2)}</div>
                            {hasCustomPrice ? (
                              <div className="text-[10px] font-semibold text-[#1976F3] dark:text-blue-400">
                                Xüsusi qiymət
                              </div>
                            ) : null}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {(() => {
                              const minStep =
                                item.product.quantity < 1
                                  ? Math.round(item.product.quantity * 100) / 100
                                  : 1;
                              return (
                                <div className="inline-flex items-center border border-slate-200 dark:border-slate-700 rounded-lg bg-[#F8FAFC] dark:bg-slate-900 overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateCartQty(
                                        item.product.id,
                                        Math.max(
                                          minStep,
                                          Math.round((item.quantity - 1) * 100) / 100
                                        ),
                                        true
                                      )
                                    }
                                    disabled={item.quantity <= minStep}
                                    className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                                    aria-label="Miqdarı azalt"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={qtyDrafts[item.product.id] ?? String(item.quantity)}
                                    onFocus={(e) => e.currentTarget.select()}
                                    onChange={(e) => handleQtyInputChange(item, e.target.value)}
                                    onBlur={() => handleQtyInputBlur(item.product.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        e.currentTarget.blur();
                                      }
                                    }}
                                    aria-label="Satış miqdarı"
                                    className="w-14 text-center py-1 text-sm font-bold tabular-nums text-slate-900 dark:text-white bg-transparent focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateCartQty(item.product.id, item.quantity + 1, true)
                                    }
                                    disabled={item.quantity >= item.product.quantity}
                                    className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                                    aria-label="Miqdarı artır"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-3.5 px-4 text-center font-bold text-slate-900 dark:text-white tabular-nums">
                            {appliedItemDiscount > 0 ? (
                              <div>
                                <div className="text-[11px] font-normal text-slate-400 line-through">
                                  {grossLineTotal.toFixed(2)}
                                </div>
                                <div className="text-emerald-700 dark:text-emerald-400">
                                  {netLineTotal.toFixed(2)}
                                </div>
                              </div>
                            ) : (
                              netLineTotal.toFixed(2)
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => removeCartItem(item.product.id)}
                              className="w-9 h-9 rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white inline-flex items-center justify-center transition-colors cursor-pointer"
                              aria-label={`${item.product.name} sil`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile POS Cart Cards */}
              <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                {cart.map((item, idx) => {
                  const unitPrice = getCartItemUnitPrice(item);
                  const hasCustomPrice = typeof item.unitPriceOverride === 'number';
                  const grossLineTotal =
                    Math.round(item.quantity * unitPrice * 100) / 100;
                  const appliedItemDiscount =
                    typeof item.discountAmount === 'number' && item.discountAmount > 0
                      ? Math.min(grossLineTotal, item.discountAmount)
                      : 0;
                  const netLineTotal = Math.max(
                    0,
                    Math.round((grossLineTotal - appliedItemDiscount) * 100) / 100
                  );
                  const discountModeForItem = itemDiscountModes[item.product.id] ?? 'percent';
                  const draftValue =
                    itemDiscountDrafts[item.product.id] ??
                    (typeof item.discountPercent === 'number' && discountModeForItem === 'percent'
                      ? String(item.discountPercent)
                      : appliedItemDiscount > 0 && discountModeForItem === 'amount'
                      ? appliedItemDiscount.toFixed(2)
                      : '');
                  return (
                    <div key={item.product.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ProductThumb
                            name={item.product.name}
                            category={item.product.category}
                            icon={item.product.icon}
                            sizeClassName="w-9 h-9"
                            imgClassName="w-7 h-7"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {idx + 1}. {item.product.name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums flex flex-wrap items-center gap-1.5">
                              <span>
                                (BAR: {item.product.barcode}) · {unitPrice.toFixed(2)} AZN
                              </span>
                              {hasCustomPrice ? (
                                <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-sans font-semibold text-[10px]">
                                  Xüsusi qiymət
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCartItem(item.product.id)}
                          className="w-8 h-8 rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white inline-flex items-center justify-center shrink-0 cursor-pointer"
                          aria-label="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Mobile Per-Item Quick Percentages (10%, 15%, 20%) + Custom % / AZN */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {QUICK_DISCOUNT_PERCENTS.map((pct) => {
                          const active = item.discountPercent === pct;
                          return (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => applyItemPercentDiscount(item.product.id, pct)}
                              className={`px-2.5 py-1.5 text-xs font-bold rounded-md border transition-colors cursor-pointer ${
                                active
                                  ? 'bg-[#1976F3] text-white border-[#1976F3]'
                                  : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-800'
                              }`}
                            >
                              {pct}%
                            </button>
                          );
                        })}

                        <div className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 overflow-hidden">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={draftValue}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) =>
                              setItemDiscountDrafts((prev) => ({
                                ...prev,
                                [item.product.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                applyItemDiscount(item.product.id);
                              }
                            }}
                            placeholder={discountModeForItem === 'percent' ? 'Faiz %' : 'AZN'}
                            aria-label={`${item.product.name} üçün endirim`}
                            className="w-18 px-2 py-1.5 text-xs font-mono tabular-nums bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setItemDiscountModes((prev) => ({
                                ...prev,
                                [item.product.id]:
                                  discountModeForItem === 'percent' ? 'amount' : 'percent',
                              }))
                            }
                            className="px-2 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700 cursor-pointer"
                            title="Faiz (%) və ya Manat (₼) arası dəyiş"
                          >
                            {discountModeForItem === 'percent' ? '%' : '₼'}
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => applyItemDiscount(item.product.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#1976F3] dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 rounded-md whitespace-nowrap cursor-pointer"
                        >
                          <Tag className="w-3.5 h-3.5" />
                          <span>Endirim tətbiq et</span>
                        </button>
                        {appliedItemDiscount > 0 ? (
                          <button
                            type="button"
                            onClick={() => clearItemDiscount(item.product.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-md cursor-pointer"
                          >
                            <span>
                              {typeof item.discountPercent === 'number'
                                ? `-${item.discountPercent}% (-${appliedItemDiscount.toFixed(2)} ₼)`
                                : `-${appliedItemDiscount.toFixed(2)} AZN`}
                            </span>
                            <X className="w-3 h-3" />
                          </button>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between">
                        {(() => {
                          const minStep =
                            item.product.quantity < 1
                              ? Math.round(item.product.quantity * 100) / 100
                              : 1;
                          return (
                            <div className="inline-flex items-center border border-slate-200 dark:border-slate-700 rounded-lg bg-[#F8FAFC] dark:bg-slate-900 overflow-hidden">
                              <button
                                type="button"
                                onClick={() =>
                                  updateCartQty(
                                    item.product.id,
                                    Math.max(
                                      minStep,
                                      Math.round((item.quantity - 1) * 100) / 100
                                    ),
                                    true
                                  )
                                }
                                disabled={item.quantity <= minStep}
                                className="px-3 py-1.5 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                                aria-label="Miqdarı azalt"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={qtyDrafts[item.product.id] ?? String(item.quantity)}
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => handleQtyInputChange(item, e.target.value)}
                                onBlur={() => handleQtyInputBlur(item.product.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.currentTarget.blur();
                                  }
                                }}
                                aria-label="Satış miqdarı"
                                className="w-14 text-center py-1.5 text-sm font-bold tabular-nums text-slate-900 dark:text-white bg-transparent focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateCartQty(item.product.id, item.quantity + 1, true)
                                }
                                disabled={item.quantity >= item.product.quantity}
                                className="px-3 py-1.5 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                                aria-label="Miqdarı artır"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })()}
                        <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                          {appliedItemDiscount > 0 ? (
                            <span>
                              <span className="text-xs font-normal text-slate-400 line-through mr-1.5">
                                {grossLineTotal.toFixed(2)}
                              </span>
                              <span className="text-emerald-700 dark:text-emerald-400">
                                {netLineTotal.toFixed(2)} AZN
                              </span>
                            </span>
                          ) : (
                            `${netLineTotal.toFixed(2)} AZN`
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Four Colorful Quick Action Cards (F2, F5, F6, F8) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="bg-[#1976F3] hover:bg-[#1565D8] text-white rounded-xl py-4 px-3 shadow-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
            <span className="text-sm sm:text-base font-bold leading-tight text-center">
              Məhsul Əlavə Et
            </span>
            <span className="text-xs font-medium text-blue-100">(F2)</span>
          </button>

          <button
            type="button"
            onClick={handleClearCart}
            className="bg-[#05A660] hover:bg-[#048C50] text-white rounded-xl py-4 px-3 shadow-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Trash2 className="w-6 h-6" />
            <span className="text-sm sm:text-base font-bold leading-tight text-center">
              Səbəti Təmizlə
            </span>
            <span className="text-xs font-medium text-emerald-100">(F5)</span>
          </button>

          <button
            type="button"
            onClick={onOpenReturnModal}
            className="bg-[#D97706] hover:bg-[#B45309] text-white rounded-xl py-4 px-3 shadow-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-6 h-6" />
            <span className="text-sm sm:text-base font-bold leading-tight text-center">
              Mal Qaytar
            </span>
            <span className="text-xs font-medium text-amber-100">(F6)</span>
          </button>

          <button
            type="button"
            onClick={handlePrintAction}
            className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-xl py-4 px-3 shadow-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Printer className="w-6 h-6" />
            <span className="text-sm sm:text-base font-bold leading-tight text-center">
              Çap Et
            </span>
            <span className="text-xs font-medium text-violet-100">(F8)</span>
          </button>
        </div>

        {/* Bottom Status Toast Banner */}
        <div
          className={`rounded-xl px-4 py-3 border flex flex-wrap items-center justify-between gap-3 text-sm font-medium ${
            statusBanner.tone === 'ok'
              ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46] dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-200'
              : statusBanner.tone === 'warn'
              ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-200'
              : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/50 dark:border-red-800 dark:text-red-200'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {statusBanner.tone === 'ok' ? (
              <CheckCircle2 className="w-5 h-5 text-[#05A660] dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0" />
            )}
            <span className="truncate">{statusBanner.text}</span>
          </div>

          {statusBanner.missingScan ? (
            <button
              type="button"
              onClick={() => onCreateMissingProduct(statusBanner.missingScan)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1976F3] hover:bg-[#1565D8] rounded-lg shrink-0 cursor-pointer"
            >
              + Yeni məhsul yarat
            </button>
          ) : statusBanner.receipt ? (
            <button
              type="button"
              onClick={() => onOpenReceiptPreview(statusBanner.receipt!)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#7C3AED] hover:bg-[#6D28D9] rounded-lg shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Çekə bax ({statusBanner.receipt.receiptNumber})</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Right Summary & Payment Pane */}
      <div className="space-y-4">
        {/* Ümumi Məbləğ Card */}
        <div className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
          <div className="bg-[#1976F3] text-white px-4 py-3 flex items-center gap-2.5">
            <Receipt className="w-5 h-5 shrink-0" />
            <span className="text-base font-bold">Ümumi Məbləğ</span>
          </div>

          <div className="py-5 px-4 text-center border-b border-slate-100 dark:border-slate-800">
            <div className="text-3xl sm:text-[34px] font-extrabold tracking-tight text-slate-900 dark:text-white tabular-nums">
              {subtotalAmount.toFixed(2)} AZN
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {itemsDiscountTotal > 0 ? (
              <div className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-400">
                  Məhsul endirimləri:
                </span>
                <span className="font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                  -{itemsDiscountTotal.toFixed(2)} AZN
                </span>
              </div>
            ) : null}

            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="pos-discount-input"
                  className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300"
                >
                  <Tag className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  <span>{itemsDiscountTotal > 0 ? 'Əlavə endirim:' : 'Endirim:'}</span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    id="pos-discount-input"
                    type="text"
                    inputMode="decimal"
                    value={discountInput}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    placeholder="0"
                    className="w-18 text-right px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountMode((m) => (m === 'percent' ? 'amount' : 'percent'));
                      setDiscountInput('');
                    }}
                    className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
                    title="Faiz (%) və ya Manat (AZN) seç"
                  >
                    {discountMode === 'percent' ? '%' : 'AZN'}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  {QUICK_DISCOUNT_PERCENTS.map((pct) => {
                    const active =
                      discountMode === 'percent' && discountInput.trim() === String(pct);
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          if (active) {
                            setDiscountInput('');
                          } else {
                            setDiscountMode('percent');
                            setDiscountInput(String(pct));
                          }
                        }}
                        className={`px-2.5 py-1 text-xs font-bold rounded-md border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#1976F3] text-white border-[#1976F3]'
                            : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {pct}%
                      </button>
                    );
                  })}
                </div>
                {discountAmount > 0 ? (
                  <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
                    -{discountAmount.toFixed(2)} AZN
                  </span>
                ) : null}
              </div>
            </div>

            <div className="px-4 py-3.5 flex items-center justify-between gap-2 bg-slate-50/60 dark:bg-slate-900/40">
              <span className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300">
                <Wallet className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <span>Ödəniləcək:</span>
              </span>
              <span className="text-lg font-extrabold text-[#1976F3] dark:text-blue-400 tabular-nums">
                {payableTotal.toFixed(2)} AZN
              </span>
            </div>
          </div>
        </div>

        {/* Ödəniş Növü Card */}
        <div className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-xs">
          <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            <CreditCard className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            <span>Ödəniş Növü</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod('cash')}
              className={`rounded-xl border py-2.5 px-2.5 flex flex-col items-center justify-center gap-1 text-center transition-colors cursor-pointer ${
                paymentMethod === 'cash'
                  ? 'bg-[#1976F3] text-white border-[#1976F3] shadow-xs'
                  : 'bg-[#F8FAFC] dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Banknote className="w-5 h-5" />
              <span className="text-xs font-bold leading-tight">Nağd</span>
              <span
                className={`text-[11px] font-medium ${
                  paymentMethod === 'cash'
                    ? 'text-blue-100'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                (F9)
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPaymentMethod('card');
                setCashReceivedInput('');
              }}
              className={`rounded-xl border py-2.5 px-2.5 flex flex-col items-center justify-center gap-1 text-center transition-colors cursor-pointer ${
                paymentMethod === 'card'
                  ? 'bg-[#1976F3] text-white border-[#1976F3] shadow-xs'
                  : 'bg-[#F8FAFC] dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <CreditCard className="w-5 h-5" />
              <span className="text-xs font-bold leading-tight">Kart</span>
              <span
                className={`text-[11px] font-medium ${
                  paymentMethod === 'card'
                    ? 'text-blue-100'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                (F10)
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPaymentMethod('mobile');
                setCashReceivedInput('');
              }}
              className={`rounded-xl border py-2.5 px-2.5 flex flex-col items-center justify-center gap-1 text-center transition-colors cursor-pointer ${
                paymentMethod === 'mobile'
                  ? 'bg-[#1976F3] text-white border-[#1976F3] shadow-xs'
                  : 'bg-[#F8FAFC] dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <QrCode className="w-5 h-5" />
              <span className="text-xs font-bold leading-tight">Mobil Ödəniş</span>
              <span
                className={`text-[11px] font-medium ${
                  paymentMethod === 'mobile'
                    ? 'text-blue-100'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                (F11)
              </span>
            </button>
          </div>

          {paymentMethod === 'cash' && cart.length > 0 ? (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2 items-center">
              <div>
                <label
                  htmlFor="pos-cash-received"
                  className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
                >
                  Verilən nağd (AZN)
                </label>
                <input
                  id="pos-cash-received"
                  type="text"
                  inputMode="decimal"
                  value={cashReceivedInput}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setCashReceivedInput(e.target.value)}
                  placeholder={payableTotal.toFixed(2)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
                />
              </div>
              <div className="text-right">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Qaytarılacaq qalıq
                </div>
                <div className="text-sm font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {typeof parsedCashReceived === 'number' &&
                  parsedCashReceived >= payableTotal
                    ? `${(parsedCashReceived - payableTotal).toFixed(2)} AZN`
                    : '0.00 AZN'}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Confirm Payment CTA (F12) */}
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleConfirmPayment()}
          className="w-full bg-[#05A660] hover:bg-[#048C50] disabled:opacity-60 text-white rounded-xl py-4 px-5 shadow-sm flex items-center justify-center gap-3 transition-colors cursor-pointer"
        >
          <Check className="w-7 h-7 stroke-[2.75] shrink-0" />
          <span className="text-left leading-tight">
            <span className="block text-base sm:text-lg font-extrabold">
              {submitting ? 'Təsdiqlənir...' : 'Ödənişi Təsdiqlə'}
            </span>
            <span className="block text-xs font-semibold text-emerald-100 text-center">
              (F12)
            </span>
          </span>
        </button>
      </div>

      {/* F2 Quick Product Picker Modal */}
      {pickerOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-picker-title"
        >
          <div className="w-full max-w-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/60">
              <div>
                <h2
                  id="pos-picker-title"
                  className="text-base font-bold text-slate-900 dark:text-white"
                >
                  Səbətə Məhsul Əlavə Et
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Məhsulu siyahıdan seçin və ya yeni məhsul kartı yaradın
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPickerOpen(false);
                    setQuickAddOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#05A660] hover:bg-[#048C50] rounded-lg cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Tez Əlavə</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPickerOpen(false);
                    onCreateMissingProduct();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1976F3] hover:bg-[#1565D8] rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Yeni məhsul yarat</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
                  aria-label="Bağla"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={pickerInputRef}
                  type="text"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Məhsul adı, barkod və ya kateqoriya axtar..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {pickerCandidates.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  Axtarışa uyğun məhsul tapılmadı.
                </div>
              ) : (
                pickerCandidates.map((p) => (
                    <div
                      key={p.id}
                      className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ProductThumb
                          name={p.name}
                          category={p.category}
                          icon={p.icon}
                          sizeClassName="w-10 h-10"
                          imgClassName="w-8 h-8"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {p.name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                            BAR: {p.barcode} · Stok: {p.quantity} {p.unit} ·{' '}
                            {p.salePrice.toFixed(2)} AZN
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={p.quantity <= 0}
                        onClick={() => {
                          addProductToCart(p);
                          setPickerOpen(false);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#05A660] hover:bg-[#048C50] disabled:opacity-40 rounded-lg shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Səbətə at</span>
                      </button>
                    </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      <QuickAddModal
        isOpen={quickAddOpen}
        products={products}
        cartQuantities={cartQuantities}
        onClose={() => setQuickAddOpen(false)}
        onConfirmAdd={handleQuickAddConfirm}
      />
    </div>
  );
}
