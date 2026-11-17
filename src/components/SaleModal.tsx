import type { IScannerControls } from '@zxing/browser';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ImagePlus,
  Keyboard,
  ListChecks,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  ShoppingCart,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
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
import {
  createCameraReader,
  decodeBarcodeFromImageFile,
  listCameras,
} from '../utils/barcodeDecoder';
import { triggerBrowserPrint } from '../utils/thermalPrinter';
import { ProductThumb } from './ProductThumb';
import { ReceiptActionControls } from './ReceiptActionControls';
import { ThermalReceipt } from './ThermalReceipt';

interface SaleModalProps {
  isOpen: boolean;
  products: Product[];
  receiptSettings: ReceiptSettings;
  externalScan?: { seq: number; scan: BarcodeScanResult } | null;
  onClose: () => void;
  onConfirmCheckout: (
    items: CheckoutCartItem[],
    options: {
      paymentMethod: PaymentMethod;
      cashReceived?: number;
    }
  ) => Promise<ReceiptData>;
  onCreateMissingProduct: (scan: BarcodeScanResult) => void;
  onOpenReceiptSettings: () => void;
}

type InputMode = 'camera' | 'gallery' | 'manual' | 'browse';

const AUTO_PRINT_STORAGE_KEY = 'ofis_anbari_auto_print_receipt';

function playScanBeep(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
    // Ignore audio context errors on restricted devices
  }
}

export function SaleModal({
  isOpen,
  products,
  receiptSettings,
  externalScan,
  onClose,
  onConfirmCheckout,
  onCreateMissingProduct,
  onOpenReceiptSettings,
}: SaleModalProps) {
  const [inputMode, setInputMode] = useState<InputMode>('camera');
  const [cart, setCart] = useState<CheckoutCartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashReceivedInput, setCashReceivedInput] = useState<string>('');
  const [autoPrintAfterSale, setAutoPrintAfterSale] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(AUTO_PRINT_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [manualCode, setManualCode] = useState<string>('');
  const [browseQuery, setBrowseQuery] = useState<string>('');
  const [scanFeedback, setScanFeedback] = useState<{
    tone: 'ok' | 'warn';
    text: string;
    missingScan?: BarcodeScanResult;
  } | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [completedReceipt, setCompletedReceipt] = useState<ReceiptData | null>(null);

  // Camera state
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<string>('Kamera işə salınır...');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState<number>(0);
  const [cameraRetryTick, setCameraRetryTick] = useState<number>(0);

  // Gallery state
  const [galleryBusy, setGalleryBusy] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scanCooldownRef = useRef<boolean>(false);
  const lastExternalSeqRef = useRef<number>(externalScan?.seq ?? 0);
  const productsRef = useRef<Product[]>(products);
  productsRef.current = products;

  const stopCamera = useCallback(() => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {
        // Ignore cleanup error
      }
      controlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const resetForNewSale = useCallback(() => {
    setCart([]);
    setPaymentMethod('cash');
    setCashReceivedInput('');
    setManualCode('');
    setBrowseQuery('');
    setScanFeedback(null);
    setSaleError(null);
    setCompletedReceipt(null);
    scanCooldownRef.current = false;
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      resetForNewSale();
      setInputMode('camera');
      return;
    }
    try {
      setAutoPrintAfterSale(
        window.localStorage.getItem(AUTO_PRINT_STORAGE_KEY) === 'true'
      );
    } catch {
      // Ignore storage error
    }
  }, [isOpen, stopCamera, resetForNewSale]);

  const addProductToCart = useCallback((product: Product) => {
    if (product.quantity <= 0) {
      setScanFeedback({
        tone: 'warn',
        text: `"${product.name}" məhsulunun anbar stoku bitib (0 ${product.unit}).`,
      });
      return;
    }

    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => item.product.id === product.id);
      if (existingIdx >= 0) {
        const currentQty = prev[existingIdx].quantity;
        if (currentQty + 1 > product.quantity) {
          setScanFeedback({
            tone: 'warn',
            text: `"${product.name}" üzrə maksimum mövcud stok (${product.quantity} ${product.unit}) səbətdədir.`,
          });
          return prev;
        }
        const updated = [...prev];
        updated[existingIdx] = {
          product,
          quantity: Math.round((currentQty + 1) * 100) / 100,
        };
        setScanFeedback({
          tone: 'ok',
          text: `Səbət yeniləndi: ${product.name} (${updated[existingIdx].quantity} ${product.unit})`,
        });
        return updated;
      }

      setScanFeedback({
        tone: 'ok',
        text: `Səbətə əlavə edildi: ${product.name} (1 ${product.unit})`,
      });
      return [...prev, { product, quantity: 1 }];
    });
    setSaleError(null);
  }, []);

  const handleBarcodeHit = useCallback(
    (scan: BarcodeScanResult) => {
      const normalized = scan.code.trim().toLowerCase();
      const match = productsRef.current.find(
        (p) => p.barcode.trim().toLowerCase() === normalized
      );
      if (match) {
        playScanBeep();
        addProductToCart(match);
      } else {
        setScanFeedback({
          tone: 'warn',
          text: `Bu barkodla (${scan.code}) məhsul tapılmadı.`,
          missingScan: scan,
        });
      }
    },
    [addProductToCart]
  );

  useEffect(() => {
    if (!externalScan || externalScan.seq === lastExternalSeqRef.current) return;
    lastExternalSeqRef.current = externalScan.seq;
    if (!isOpen || completedReceipt) return;
    handleBarcodeHit(externalScan.scan);
  }, [externalScan, isOpen, completedReceipt, handleBarcodeHit]);

  // Live Camera Scanning (continuous multi-item scan with 1.3s cooldown between hits)
  useEffect(() => {
    if (!isOpen || inputMode !== 'camera' || completedReceipt) {
      stopCamera();
      return;
    }

    let cancelled = false;
    scanCooldownRef.current = false;

    async function startCamera() {
      setCameraError(null);
      setCameraStatus('Kamera icazəsi yoxlanılır...');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Bu brauzerdə kamera dəstəklənmir. Qalereya, Barkod yaz və ya Siyahı bölməsindən əlavə edin.'
        );
        return;
      }

      try {
        const videoDevices = await listCameras();
        if (!cancelled) {
          setDevices(videoDevices);
        }

        const chosenDevice = videoDevices[selectedDeviceIndex];
        const constraints: MediaStreamConstraints = chosenDevice?.deviceId
          ? {
              video: {
                deviceId: { exact: chosenDevice.deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            }
          : {
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const videoEl = videoRef.current;
        if (!videoEl) return;

        videoEl.srcObject = stream;
        await videoEl.play();
        setCameraStatus('Ardıcıl oxutmaq üçün barkodları tutun');

        const reader = createCameraReader();
        const controls = await reader.decodeFromStream(stream, videoEl, (result) => {
          if (result && !scanCooldownRef.current && !cancelled) {
            const text = result.getText()?.trim();
            if (text) {
              scanCooldownRef.current = true;
              handleBarcodeHit({
                code: text,
                format: String(result.getBarcodeFormat()),
              });
              window.setTimeout(() => {
                scanCooldownRef.current = false;
              }, 1300);
            }
          }
        });
        controlsRef.current = controls;
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (
          messageIncludesAny(msg, ['Permission', 'NotAllowed', 'denied'])
        ) {
          setCameraError(
            'Kameraya icazə verilmədi. Qalereya, Barkod yaz və ya Siyahı bölməsindən məhsul əlavə edin.'
          );
        } else {
          setCameraError(
            'Kamera açıla bilmədi. Qalereya, Barkod yaz və ya Siyahı bölməsindən məhsul əlavə edin.'
          );
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [
    isOpen,
    inputMode,
    completedReceipt,
    selectedDeviceIndex,
    cameraRetryTick,
    stopCamera,
    handleBarcodeHit,
  ]);

  const cartSummary = useMemo(() => {
    let totalAmount = 0;
    let totalUnits = 0;
    for (const item of cart) {
      totalAmount += item.quantity * item.product.salePrice;
      totalUnits += item.quantity;
    }
    return {
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalUnits: Math.round(totalUnits * 100) / 100,
    };
  }, [cart]);

  const parsedCashReceived = useMemo(() => {
    if (paymentMethod !== 'cash' || !cashReceivedInput.trim()) return undefined;
    const val = Number(cashReceivedInput);
    if (Number.isNaN(val) || val < 0) return undefined;
    return Math.round(val * 100) / 100;
  }, [paymentMethod, cashReceivedInput]);

  const browseCandidates = useMemo(() => {
    const q = browseQuery.trim().toLowerCase();
    const inStockFirst = [...products].sort((a, b) => {
      if ((a.quantity > 0) !== (b.quantity > 0)) {
        return a.quantity > 0 ? -1 : 1;
      }
      return a.name.localeCompare(b.name, 'az');
    });
    if (!q) return inStockFirst.slice(0, 30);
    return inStockFirst
      .filter((p) => {
        const hay = `${p.name} ${p.barcode} ${p.category} ${p.brand || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 30);
  }, [products, browseQuery]);

  const handleGalleryUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setGalleryBusy(true);
    try {
      const hit = await decodeBarcodeFromImageFile(file);
      if (hit) {
        handleBarcodeHit(hit);
      } else {
        setScanFeedback({
          tone: 'warn',
          text: 'Şəkildə oxuna bilən barkod tapılmadı. Daha aydın şəkil seçin.',
        });
      }
    } catch {
      setScanFeedback({
        tone: 'warn',
        text: 'Şəkil oxunarkən xəta baş verdi.',
      });
    } finally {
      setGalleryBusy(false);
    }
  };

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = manualCode.trim();
    if (!trimmed) return;
    handleBarcodeHit({ code: trimmed, format: 'MANUAL' });
    setManualCode('');
  };

  const updateCartQty = (productId: string, nextQtyRaw: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        if (Number.isNaN(nextQtyRaw) || nextQtyRaw <= 0) {
          return item;
        }
        const clamped = Math.min(
          item.product.quantity,
          Math.max(0.01, Math.round(nextQtyRaw * 100) / 100)
        );
        return { ...item, quantity: clamped };
      })
    );
    setSaleError(null);
  };

  const removeCartItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
    setSaleError(null);
  };

  const handleToggleAutoPrint = (checked: boolean) => {
    setAutoPrintAfterSale(checked);
    try {
      window.localStorage.setItem(AUTO_PRINT_STORAGE_KEY, String(checked));
    } catch {
      // Ignore storage error
    }
  };

  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      setSaleError('Satışı tamamlamaq üçün səbətə ən azı 1 məhsul əlavə edin.');
      return;
    }

    for (const item of cart) {
      if (item.quantity <= 0 || item.quantity > item.product.quantity) {
        setSaleError(
          `"${item.product.name}" üçün mövcud stok (${item.product.quantity} ${item.product.unit}) keçilə bilməz.`
        );
        return;
      }
    }

    if (
      paymentMethod === 'cash' &&
      typeof parsedCashReceived === 'number' &&
      parsedCashReceived > 0 &&
      parsedCashReceived < cartSummary.totalAmount
    ) {
      setSaleError('Alınan nağd məbləğ ümumi satış məbləğindən az ola bilməz.');
      return;
    }

    setSaleError(null);
    setSubmitting(true);
    try {
      const receipt = await onConfirmCheckout(cart, {
        paymentMethod,
        cashReceived: parsedCashReceived,
      });
      stopCamera();
      setCompletedReceipt(receipt);
      if (autoPrintAfterSale) {
        window.setTimeout(() => {
          void triggerBrowserPrint(receiptSettings.paperWidth);
        }, 200);
      }
    } catch (err) {
      setSaleError(
        err instanceof Error ? err.message : 'Satış təsdiqlənərkən xəta baş verdi.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-[2px] p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-modal-title"
    >
      <div
        className={`w-full bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] ${
          completedReceipt ? 'max-w-lg' : 'max-w-4xl'
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 inline-flex items-center justify-center shrink-0">
              <ShoppingCart className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 id="sale-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                {completedReceipt
                  ? `Satış tamamlandı · ${completedReceipt.receiptNumber}`
                  : 'Kassa və Satış Səbəti'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {completedReceipt
                  ? `${receiptSettings.paperWidth} termal çek hazırdır — Zyklen Z-604 / POS printerlə çap edə bilərsiniz`
                  : '1 və ya bir neçə məhsulu ardıcıl oxudub səbətə yığın, sonra tək çek çıxarın'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onOpenReceiptSettings}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
              title="Çek və Printer Ayarları"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Çek ayarları</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              aria-label="Bağla"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        {completedReceipt ? (
          <div className="p-5 overflow-y-auto space-y-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-lg flex items-center justify-between gap-3 text-xs text-emerald-900 dark:text-emerald-200">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                <span>
                  {completedReceipt.items.length} çeşid məhsul stokdan çıxıldı və yadda saxlanıldı
                </span>
              </div>
              <span className="font-mono tabular-nums font-bold shrink-0">
                {completedReceipt.totalAmount.toFixed(2)} ₼
              </span>
            </div>

            <ThermalReceipt
              receipt={completedReceipt}
              settings={receiptSettings}
              enablePrintPortal
            />

            <ReceiptActionControls
              receipt={completedReceipt}
              settings={receiptSettings}
            />

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
              >
                Bağla
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForNewSale();
                  setInputMode('camera');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni satış</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
            {/* Left Column: Barcode Scanner & Product Picker */}
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
                {(
                  [
                    { id: 'camera', label: 'Kamera', icon: Camera },
                    { id: 'gallery', label: 'Qalereya', icon: ImagePlus },
                    { id: 'manual', label: 'Barkod yaz', icon: Keyboard },
                    { id: 'browse', label: 'Siyahı', icon: ListChecks },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setInputMode(tab.id)}
                      className={`flex items-center justify-center gap-1.5 py-2 px-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        inputMode === tab.id
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {scanFeedback ? (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                    scanFeedback.tone === 'ok'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
                      : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {scanFeedback.tone === 'ok' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                    )}
                    <span className="truncate font-medium">{scanFeedback.text}</span>
                  </div>
                  {scanFeedback.missingScan ? (
                    <button
                      type="button"
                      onClick={() => {
                        const scan = scanFeedback.missingScan!;
                        onClose();
                        onCreateMissingProduct(scan);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      + Yeni məhsul
                    </button>
                  ) : null}
                </div>
              ) : null}

              {inputMode === 'camera' ? (
                cameraError ? (
                  <div className="p-5 bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-lg text-center space-y-3">
                    <p className="text-sm text-slate-700 dark:text-slate-300">{cameraError}</p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCameraRetryTick((n) => n + 1)}
                        className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        Yenidən yoxla
                      </button>
                      <button
                        type="button"
                        onClick={() => setInputMode('gallery')}
                        className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        Qalereyadan seç
                      </button>
                      <button
                        type="button"
                        onClick={() => setInputMode('manual')}
                        className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        Barkod yaz
                      </button>
                      <button
                        type="button"
                        onClick={() => setInputMode('browse')}
                        className="px-3 py-2 text-xs font-medium text-white bg-emerald-700 dark:bg-emerald-600 rounded-lg hover:bg-emerald-800 dark:hover:bg-emerald-500 cursor-pointer"
                      >
                        Siyahıdan seç
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative aspect-[4/3] w-full bg-slate-950 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800">
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      autoPlay
                    />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
                      <div className="w-full max-w-[260px] h-32 border-2 border-emerald-400/90 rounded-lg shadow-[0_0_0_9999px_rgba(15,23,42,0.45)] relative">
                        <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-0.5 bg-emerald-400" />
                      </div>
                    </div>
                    <div className="absolute bottom-3 inset-x-3 flex items-center justify-between gap-2">
                      <span className="px-2.5 py-1 bg-slate-950/80 text-white text-xs rounded-md">
                        {cameraStatus}
                      </span>
                      {devices.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedDeviceIndex((prev) => (prev + 1) % devices.length)
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950/80 text-white text-xs rounded-md hover:bg-slate-900 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Kameranı dəyiş</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              ) : inputMode === 'gallery' ? (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleGalleryUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-600 dark:hover:border-emerald-500 bg-slate-50 dark:bg-slate-900/60 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/30 rounded-lg p-7 text-center transition-colors cursor-pointer"
                  >
                    <Upload className="w-7 h-7 text-slate-500 dark:text-slate-400 mx-auto mb-2" />
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {galleryBusy ? 'Barkod oxunur...' : 'Barkod şəklini seçib səbətə əlavə et'}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Hər seçilən məhsul səbətə 1 ədəd artırılır
                    </div>
                  </button>
                </div>
              ) : inputMode === 'manual' ? (
                <form onSubmit={handleManualSubmit} className="space-y-3">
                  <div>
                    <label
                      htmlFor="manual-sale-barcode"
                      className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                    >
                      Barkod nömrəsi (USB skaner və ya əl ilə)
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="manual-sale-barcode"
                        type="text"
                        autoFocus
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value)}
                        placeholder="Barkodu oxudun və ya yazın..."
                        className="flex-1 px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                      <button
                        type="submit"
                        disabled={!manualCode.trim()}
                        className="px-4 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 rounded-lg whitespace-nowrap cursor-pointer"
                      >
                        Səbətə at
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                      USB əl skaneri (məs: Zebex Z-3151HS) qoşuludursa, kassa pəncərəsi açıq olan istənilən anda skan etdikdə səbətə avtomatik əlavə olunur.
                    </p>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={browseQuery}
                      onChange={(e) => setBrowseQuery(e.target.value)}
                      placeholder="Məhsul adı və ya barkod axtar..."
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto bg-white dark:bg-slate-900/60">
                    {browseCandidates.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                        Uyğun məhsul tapılmadı.
                      </div>
                    ) : (
                      browseCandidates.map((p) => (
                        <div
                          key={p.id}
                          className="px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/70"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ProductThumb
                              name={p.name}
                              category={p.category}
                              sizeClassName="w-8 h-8"
                              imgClassName="w-6 h-6"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {p.name}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                                {p.barcode} · Stok: {p.quantity} {p.unit} · {p.salePrice.toFixed(2)} ₼
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={p.quantity <= 0}
                            onClick={() => addProductToCart(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/70 disabled:opacity-40 border border-emerald-200 dark:border-emerald-900 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Əlavə et</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: POS Multi-Item Cart & Checkout */}
            <div className="p-5 flex flex-col justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/40">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Satış səbəti
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {cart.length} çeşid · {cartSummary.totalUnits} vahid
                    </span>
                    {cart.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setCart([])}
                        className="text-xs font-medium text-red-700 dark:text-red-400 hover:underline cursor-pointer"
                      >
                        Təmizlə
                      </button>
                    ) : null}
                  </div>
                </div>

                {cart.length === 0 ? (
                  <div className="bg-white dark:bg-slate-900/70 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center space-y-1.5">
                    <ShoppingCart className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto" />
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Səbət hələ boşdur
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Soldan kamera, qalereya və ya siyahı ilə 1 və ya bir neçə məhsul əlavə edin.
                    </p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
                    {cart.map((item) => {
                      const lineTotal =
                        Math.round(item.quantity * item.product.salePrice * 100) / 100;
                      return (
                        <div key={item.product.id} className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <ProductThumb
                                name={item.product.name}
                                category={item.product.category}
                                sizeClassName="w-8 h-8"
                                imgClassName="w-6 h-6"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                                  {item.product.name}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                  {item.product.salePrice.toFixed(2)} ₼ / {item.product.unit} · Stok:{' '}
                                  {item.product.quantity}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeCartItem(item.product.id)}
                              className="p-1 text-slate-400 dark:text-slate-500 hover:text-red-700 dark:hover:text-red-400 rounded cursor-pointer"
                              aria-label={`${item.product.name} səbətdən çıxar`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex items-center border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-950">
                              <button
                                type="button"
                                onClick={() =>
                                  updateCartQty(item.product.id, item.quantity - 1)
                                }
                                disabled={item.quantity <= 1}
                                className="px-2.5 py-1 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                                aria-label="Azalt"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <input
                                type="number"
                                min="0.01"
                                max={item.product.quantity}
                                step="any"
                                value={item.quantity}
                                onChange={(e) =>
                                  updateCartQty(item.product.id, Number(e.target.value))
                                }
                                className="w-14 text-center py-1 text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 bg-transparent focus:outline-none"
                                aria-label="Satış miqdarı"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateCartQty(item.product.id, item.quantity + 1)
                                }
                                disabled={item.quantity >= item.product.quantity}
                                className="px-2.5 py-1 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                                aria-label="Artır"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="font-mono tabular-nums text-xs font-bold text-slate-900 dark:text-slate-100">
                              {lineTotal.toFixed(2)} ₼
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Payment & Checkout Footer */}
              <div className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      paymentMethod === 'cash'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Nağd ödəniş
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('card');
                      setCashReceivedInput('');
                    }}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      paymentMethod === 'card'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Bank kartı
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('mobile');
                      setCashReceivedInput('');
                    }}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      paymentMethod === 'mobile'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    Mobil ödəniş
                  </button>
                </div>

                {paymentMethod === 'cash' && cart.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 items-center">
                    <div>
                      <label
                        htmlFor="cash-received-input"
                        className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                      >
                        Müştərinin verdiyi nağd (₼)
                      </label>
                      <input
                        id="cash-received-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={cashReceivedInput}
                        onChange={(e) => {
                          setCashReceivedInput(e.target.value);
                          setSaleError(null);
                        }}
                        placeholder={cartSummary.totalAmount.toFixed(2)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Qaytarılacaq qalıq</div>
                      <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                        {typeof parsedCashReceived === 'number' &&
                        parsedCashReceived >= cartSummary.totalAmount
                          ? `${(parsedCashReceived - cartSummary.totalAmount).toFixed(2)} ₼`
                          : '0.00 ₼'}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Yekun məbləğ</span>
                  <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {cartSummary.totalAmount.toFixed(2)} ₼
                  </span>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoPrintAfterSale}
                    onChange={(e) => handleToggleAutoPrint(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span>Satış təsdiqləndikdə çap pəncərəsini avtomatik aç</span>
                </label>

                {saleError ? (
                  <div className="p-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300">
                    {saleError}
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={submitting || cart.length === 0}
                  onClick={handleCompleteSale}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 shadow-xs disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>
                    {submitting
                      ? 'Satış qeydə alınır...'
                      : 'Satışı tamamla və Çek ver'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function messageIncludesAny(source: string, parts: string[]): boolean {
  return parts.some((p) => source.includes(p));
}
