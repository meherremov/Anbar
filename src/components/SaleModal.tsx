import type { IScannerControls } from '@zxing/browser';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ImagePlus,
  Keyboard,
  Minus,
  Plus,
  RefreshCw,
  ShoppingCart,
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
import type { BarcodeScanResult, Product } from '../types/inventory';
import {
  createCameraReader,
  decodeBarcodeFromImageFile,
  listCameras,
} from '../utils/barcodeDecoder';

interface SaleModalProps {
  isOpen: boolean;
  products: Product[];
  onClose: () => void;
  onConfirmSale: (
    productId: string,
    sellQuantity: number
  ) => Promise<{ remainingQty: number }>;
  onCreateMissingProduct: (scan: BarcodeScanResult) => void;
}

type InputMode = 'camera' | 'gallery' | 'manual';

export function SaleModal({
  isOpen,
  products,
  onClose,
  onConfirmSale,
  onCreateMissingProduct,
}: SaleModalProps) {
  const [inputMode, setInputMode] = useState<InputMode>('camera');
  const [scannedResult, setScannedResult] = useState<BarcodeScanResult | null>(null);
  const [manualCode, setManualCode] = useState<string>('');
  const [sellQuantity, setSellQuantity] = useState<string>('1');
  const [saleError, setSaleError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [completedSale, setCompletedSale] = useState<{
    productName: string;
    soldQty: number;
    unit: string;
    totalAmount: number;
    remainingQty: number;
  } | null>(null);

  // Camera state
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<string>('Kamera işə salınır...');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState<number>(0);

  // Gallery state
  const [galleryBusy, setGalleryBusy] = useState<boolean>(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scanLockRef = useRef<boolean>(false);

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

  const resetToScanner = useCallback(() => {
    setScannedResult(null);
    setManualCode('');
    setSellQuantity('1');
    setSaleError(null);
    setCompletedSale(null);
    setGalleryError(null);
    scanLockRef.current = false;
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      resetToScanner();
      setInputMode('camera');
      return;
    }
  }, [isOpen, stopCamera, resetToScanner]);

  useEffect(() => {
    if (!isOpen || inputMode !== 'camera' || scannedResult || completedSale) {
      stopCamera();
      return;
    }

    let cancelled = false;
    scanLockRef.current = false;

    async function startCamera() {
      setCameraError(null);
      setCameraStatus('Kamera icazəsi yoxlanılır...');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Bu brauzerdə kamera dəstəklənmir. Qalereya və ya əl ilə daxiletmədən istifadə edin.'
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
        setCameraStatus('Satılacaq məhsulun barkodunu tutun');

        const reader = createCameraReader();
        const controls = await reader.decodeFromStream(stream, videoEl, (result) => {
          if (result && !scanLockRef.current && !cancelled) {
            const text = result.getText()?.trim();
            if (text) {
              scanLockRef.current = true;
              stopCamera();
              setScannedResult({
                code: text,
                format: String(result.getBarcodeFormat()),
              });
              setSellQuantity('1');
              setSaleError(null);
            }
          }
        });
        controlsRef.current = controls;
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('Permission') ||
          msg.includes('NotAllowed') ||
          msg.includes('denied')
        ) {
          setCameraError(
            'Kameraya icazə verilmədi. Qalereya və ya barkod yazma bölməsindən davam edə bilərsiniz.'
          );
        } else {
          setCameraError(
            'Kamera açıla bilmədi. Zəhmət olmasa barkodu qalereyadan seçin və ya əl ilə yazın.'
          );
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, inputMode, scannedResult, completedSale, selectedDeviceIndex, stopCamera]);

  const matchedProduct = useMemo(() => {
    if (!scannedResult) return null;
    const normalized = scannedResult.code.trim().toLowerCase();
    return (
      products.find((p) => p.barcode.trim().toLowerCase() === normalized) || null
    );
  }, [products, scannedResult]);

  const parsedQty = Number(sellQuantity);
  const validSellQty =
    !Number.isNaN(parsedQty) &&
    parsedQty > 0 &&
    matchedProduct !== null &&
    parsedQty <= matchedProduct.quantity;

  const handleGalleryUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setGalleryError(null);
    setGalleryBusy(true);
    try {
      const hit = await decodeBarcodeFromImageFile(file);
      if (hit) {
        setScannedResult(hit);
        setSellQuantity('1');
        setSaleError(null);
      } else {
        setGalleryError('Şəkildə oxuna bilən barkod tapılmadı. Daha aydın şəkil seçin.');
      }
    } catch {
      setGalleryError('Şəkil oxunarkən xəta baş verdi.');
    } finally {
      setGalleryBusy(false);
    }
  };

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = manualCode.trim();
    if (!trimmed) return;
    setScannedResult({ code: trimmed, format: 'MANUAL' });
    setSellQuantity('1');
    setSaleError(null);
  };

  const adjustSellQty = (delta: number) => {
    if (!matchedProduct) return;
    const current = Number(sellQuantity) || 0;
    const next = Math.min(matchedProduct.quantity, Math.max(1, current + delta));
    setSellQuantity(String(next));
    setSaleError(null);
  };

  const handleSaleConfirm = async (e: FormEvent) => {
    e.preventDefault();
    if (!matchedProduct) return;
    setSaleError(null);

    const qty = Number(sellQuantity);
    if (Number.isNaN(qty) || qty <= 0) {
      setSaleError('Satış ədədi 0-dan böyük olmalıdır.');
      return;
    }
    if (qty > matchedProduct.quantity) {
      setSaleError(
        `Anbarda yalnız ${matchedProduct.quantity} ${matchedProduct.unit} mövcuddur.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const { remainingQty } = await onConfirmSale(matchedProduct.id, qty);
      setCompletedSale({
        productName: matchedProduct.name,
        soldQty: qty,
        unit: matchedProduct.unit,
        totalAmount: Math.round(qty * matchedProduct.salePrice * 100) / 100,
        remainingQty,
      });
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-modal-title"
    >
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <ShoppingCart className="w-5 h-5 text-emerald-700 shrink-0" />
            <div>
              <h2 id="sale-modal-title" className="text-base font-semibold text-slate-900">
                Satış et
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kamera ilə barkodu oxudun və satılan ədədi stokdan çıxın
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Bağla"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {completedSale ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>Satış uğurla tamamlandı</span>
                </div>
                <p className="text-sm text-slate-900 font-medium">
                  {completedSale.productName}
                </p>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-200/70 text-xs">
                  <div>
                    <div className="text-slate-500">Satılan</div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                      -{completedSale.soldQty} {completedSale.unit}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Məbləğ</div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                      {completedSale.totalAmount.toFixed(2)} ₼
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Qalan stok</div>
                    <div className="font-mono tabular-nums font-semibold text-emerald-800 mt-0.5">
                      {completedSale.remainingQty} {completedSale.unit}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Bağla
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetToScanner();
                    setInputMode('camera');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Növbəti məhsulu skan et</span>
                </button>
              </div>
            </div>
          ) : scannedResult ? (
            matchedProduct ? (
              <form onSubmit={handleSaleConfirm} className="space-y-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {matchedProduct.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {matchedProduct.category}
                        {matchedProduct.brand ? ` · ${matchedProduct.brand}` : ''}
                        {matchedProduct.shelfLocation
                          ? ` · ${matchedProduct.shelfLocation}`
                          : ''}
                      </div>
                    </div>
                    <div className="font-mono tabular-nums text-sm font-bold text-slate-900 whitespace-nowrap">
                      {matchedProduct.salePrice.toFixed(2)} ₼
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                    <span className="font-mono tabular-nums text-slate-600">
                      Barkod: {matchedProduct.barcode}
                    </span>
                    <span className="font-mono tabular-nums font-medium text-slate-800">
                      Mövcud stok: {matchedProduct.quantity} {matchedProduct.unit}
                    </span>
                  </div>
                </div>

                {matchedProduct.quantity <= 0 ? (
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-800">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Bu məhsulun stoku bitib (0 {matchedProduct.unit}). Satış etmək üçün
                      əvvəlcə məhsulun stokunu artırın.
                    </span>
                  </div>
                ) : (
                  <>
                    <div>
                      <label
                        htmlFor="sale-qty-input"
                        className="block text-xs font-semibold text-slate-800 mb-1.5"
                      >
                        Satış ədədi ({matchedProduct.unit})
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white flex-1 max-w-[220px]">
                          <button
                            type="button"
                            onClick={() => adjustSellQty(-1)}
                            disabled={Number(sellQuantity) <= 1}
                            className="px-3.5 py-2.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                            aria-label="Satış ədədini azalt"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            id="sale-qty-input"
                            type="number"
                            min="0.01"
                            max={matchedProduct.quantity}
                            step="any"
                            required
                            value={sellQuantity}
                            onChange={(e) => {
                              setSellQuantity(e.target.value);
                              setSaleError(null);
                            }}
                            className="w-full text-center py-2.5 text-base font-mono tabular-nums font-semibold text-slate-900 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => adjustSellQty(1)}
                            disabled={Number(sellQuantity) >= matchedProduct.quantity}
                            className="px-3.5 py-2.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                            aria-label="Satış ədədini artır"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="text-xs text-slate-600 space-y-0.5">
                          <div>
                            Cəmi məbləğ:{' '}
                            <span className="font-mono tabular-nums font-semibold text-slate-900">
                              {validSellQty
                                ? (parsedQty * matchedProduct.salePrice).toFixed(2)
                                : '0.00'}{' '}
                              ₼
                            </span>
                          </div>
                          <div>
                            Qalacaq stok:{' '}
                            <span className="font-mono tabular-nums font-medium text-slate-800">
                              {validSellQty
                                ? Math.max(
                                    0,
                                    Math.round((matchedProduct.quantity - parsedQty) * 100) /
                                      100
                                  )
                                : matchedProduct.quantity}{' '}
                              {matchedProduct.unit}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {saleError ? (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                        {saleError}
                      </div>
                    ) : null}
                  </>
                )}

                <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={resetToScanner}
                    disabled={submitting}
                    className="px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    Yenidən skan et
                  </button>
                  {matchedProduct.quantity > 0 ? (
                    <button
                      type="submit"
                      disabled={submitting || !validSellQty}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg whitespace-nowrap cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {submitting ? 'Yadda saxlanılır...' : 'Satışı təsdiqlə və stokdan çıx'}
                      </span>
                    </button>
                  ) : null}
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Bu barkodla məhsul tapılmadı</span>
                  </div>
                  <p className="text-xs text-amber-800 font-mono tabular-nums">
                    Oxunan barkod: {scannedResult.code}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={resetToScanner}
                    className="px-4 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Yenidən skan et
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const codeToCreate = scannedResult;
                      onClose();
                      onCreateMissingProduct(codeToCreate);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Yeni məhsul kimi əlavə et</span>
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setInputMode('camera')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    inputMode === 'camera'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5 shrink-0" />
                  <span>Kamera</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('gallery')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    inputMode === 'gallery'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ImagePlus className="w-3.5 h-3.5 shrink-0" />
                  <span>Qalereya</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('manual')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    inputMode === 'manual'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Keyboard className="w-3.5 h-3.5 shrink-0" />
                  <span>Barkod yaz</span>
                </button>
              </div>

              {inputMode === 'camera' ? (
                cameraError ? (
                  <div className="p-5 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-3">
                    <p className="text-sm text-slate-700">{cameraError}</p>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setInputMode('gallery')}
                        className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                      >
                        Qalereyadan seç
                      </button>
                      <button
                        type="button"
                        onClick={() => setInputMode('manual')}
                        className="px-3 py-2 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 cursor-pointer"
                      >
                        Barkod yaz
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative aspect-[4/3] w-full bg-slate-950 rounded-lg overflow-hidden border border-slate-200">
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      autoPlay
                    />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
                      <div className="w-full max-w-[280px] h-36 border-2 border-emerald-400/90 rounded-lg shadow-[0_0_0_9999px_rgba(15,23,42,0.45)] relative">
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
                    className="w-full border border-dashed border-slate-300 hover:border-emerald-600 bg-slate-50 hover:bg-emerald-50/40 rounded-lg p-6 text-center transition-colors cursor-pointer"
                  >
                    <Upload className="w-7 h-7 text-slate-500 mx-auto mb-2" />
                    <div className="text-sm font-medium text-slate-900">
                      {galleryBusy ? 'Barkod oxunur...' : 'Satılacaq məhsulun barkod şəklini seçin'}
                    </div>
                  </button>
                  {galleryError ? (
                    <p className="text-xs text-red-700">{galleryError}</p>
                  ) : null}
                </div>
              ) : (
                <form onSubmit={handleManualSubmit} className="space-y-3">
                  <div>
                    <label
                      htmlFor="manual-sale-barcode"
                      className="block text-xs font-semibold text-slate-800 mb-1.5"
                    >
                      Barkod nömrəsi
                    </label>
                    <input
                      id="manual-sale-barcode"
                      type="text"
                      autoFocus
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      placeholder="Məs: 4760012345678"
                      className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!manualCode.trim()}
                      className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg cursor-pointer"
                    >
                      Məhsulu tap
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
