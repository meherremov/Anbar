import type { IScannerControls } from '@zxing/browser';
import { BarcodeFormat } from '@zxing/library';
import {
  Camera,
  CheckCircle2,
  ImagePlus,
  RefreshCw,
  ScanBarcode,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { BarcodeScanResult } from '../types/inventory';
import {
  createCameraReader,
  decodeBarcodeFromImageFile,
  listCameras,
} from '../utils/barcodeDecoder';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  initialTab?: 'camera' | 'gallery';
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onDetected: (result: BarcodeScanResult) => void;
}

export function BarcodeScannerModal({
  isOpen,
  initialTab = 'camera',
  title = 'Barkod Oxuyucu',
  subtitle = 'Məhsulun barkodunu kamera ilə oxudun və ya qalereyadan şəkil seçin.',
  onClose,
  onDetected,
}: BarcodeScannerModalProps) {
  const [activeTab, setActiveTab] = useState<'camera' | 'gallery'>(initialTab);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<string>('Kamera işə salınır...');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState<number>(0);

  const [galleryPreview, setGalleryPreview] = useState<string | null>(null);
  const [galleryBusy, setGalleryBusy] = useState<boolean>(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [galleryHit, setGalleryHit] = useState<BarcodeScanResult | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const detectedLockRef = useRef<boolean>(false);

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
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      detectedLockRef.current = false;
      setGalleryError(null);
      setGalleryHit(null);
      if (galleryPreview) {
        URL.revokeObjectURL(galleryPreview);
        setGalleryPreview(null);
      }
      return;
    }
    setActiveTab(initialTab);
  }, [isOpen, initialTab, stopCamera]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'camera') {
      stopCamera();
      return;
    }

    let cancelled = false;
    detectedLockRef.current = false;

    async function startCamera() {
      setCameraError(null);
      setCameraStatus('Kamera icazəsi yoxlanılır...');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Bu brauzerdə kamera dəstəklənmir. Qalereya bölməsindən şəkil yükləyə bilərsiniz.'
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
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        const videoEl = videoRef.current;
        if (!videoEl) {
          return;
        }

        videoEl.srcObject = stream;
        await videoEl.play();
        setCameraStatus('Barkodu çərçivənin içinə tutun');

        const reader = createCameraReader();
        const controls = await reader.decodeFromStream(stream, videoEl, (result) => {
          if (result && !detectedLockRef.current && !cancelled) {
            const text = result.getText()?.trim();
            if (text) {
              detectedLockRef.current = true;
              const fmt = BarcodeFormat[result.getBarcodeFormat()] || 'BARCODE';
              stopCamera();
              onDetected({ code: text, format: fmt });
            }
          }
        });
        controlsRef.current = controls;
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        if (
          message.includes('Permission') ||
          message.includes('NotAllowed') ||
          message.includes('denied')
        ) {
          setCameraError(
            'Kameraya icazə verilmədi. Brauzer icazəsini aktiv edin və ya Qalereya bölməsindən şəkil seçin.'
          );
        } else {
          setCameraError(
            'Kamera açıla bilmədi. Zəhmət olmasa Qalereya bölməsindən barkod şəklini seçin.'
          );
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, activeTab, selectedDeviceIndex, stopCamera, onDetected]);

  const handleGalleryFile = async (file: File | undefined) => {
    if (!file) return;
    setGalleryError(null);
    setGalleryHit(null);
    setGalleryBusy(true);

    if (galleryPreview) {
      URL.revokeObjectURL(galleryPreview);
    }
    const previewUrl = URL.createObjectURL(file);
    setGalleryPreview(previewUrl);

    try {
      const result = await decodeBarcodeFromImageFile(file);
      if (result) {
        setGalleryHit(result);
      } else {
        setGalleryError(
          'Şəkildə oxuna bilən barkod tapılmadı. Daha aydın və yaxın çəkilmiş şəkil seçin.'
        );
      }
    } catch {
      setGalleryError('Şəkil emal edilərkən xəta baş verdi.');
    } finally {
      setGalleryBusy(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    void handleGalleryFile(file);
    e.target.value = '';
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scanner-modal-title"
    >
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200">
          <div>
            <h2 id="scanner-modal-title" className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
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

        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('camera')}
              className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'camera'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-4 h-4 shrink-0" />
              <span>Kamera ilə oxu</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('gallery')}
              className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'gallery'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ImagePlus className="w-4 h-4 shrink-0" />
              <span>Qalereyadan seç</span>
            </button>
          </div>
        </div>

        <div className="p-5">
          {activeTab === 'camera' ? (
            <div className="space-y-3">
              {cameraError ? (
                <div className="p-5 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-3">
                  <ScanBarcode className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm text-slate-700">{cameraError}</p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedDeviceIndex((i) => i)}
                      className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      Yenidən yoxla
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('gallery')}
                      className="px-3 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
                    >
                      Qalereyadan şəkil seç
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
                  {/* Scanning viewfinder reticle */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
                    <div className="w-full max-w-[280px] h-36 border-2 border-white/80 rounded-lg shadow-[0_0_0_9999px_rgba(15,23,42,0.45)] relative">
                      <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-0.5 bg-blue-400/90" />
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
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed border-slate-300 hover:border-blue-600 bg-slate-50 hover:bg-blue-50/40 rounded-lg p-6 text-center transition-colors cursor-pointer"
              >
                <Upload className="w-7 h-7 text-slate-500 mx-auto mb-2" />
                <div className="text-sm font-medium text-slate-900">
                  {galleryBusy ? 'Barkod axtarılır...' : 'Qalereyadan və ya cihazdan şəkil seçin'}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  JPG, PNG, WEBP formatlı məhsul və ya barkod şəkilləri dəstəklənir
                </div>
              </button>

              {galleryPreview ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                  <div className="max-h-52 overflow-hidden flex items-center justify-center bg-slate-900/5">
                    <img
                      src={galleryPreview}
                      alt="Seçilmiş barkod şəkli"
                      className="max-h-52 w-auto object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="p-3 bg-white border-t border-slate-200">
                    {galleryBusy ? (
                      <p className="text-xs text-slate-600">Şəkildəki barkod oxunur...</p>
                    ) : galleryHit ? (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>Barkod tapıldı</span>
                          </div>
                          <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-0.5 truncate">
                            {galleryHit.code}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDetected(galleryHit)}
                          className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Bu barkodu istifadə et
                        </button>
                      </div>
                    ) : galleryError ? (
                      <p className="text-xs text-red-700">{galleryError}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
