import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocFromCache,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type FieldValue,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GlobalBarcodeListener } from './components/GlobalBarcodeListener';
import { InventoryDashboard } from './components/InventoryDashboard';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PinSetupModal } from './components/PinSetupModal';
import { ProductDrawer } from './components/ProductDrawer';
import { ReceiptPreviewModal } from './components/ReceiptPreviewModal';
import { ReceiptSettingsModal } from './components/ReceiptSettingsModal';
import { ReturnSaleModal } from './components/ReturnSaleModal';
import { SaleModal } from './components/SaleModal';
import { ScreenLockOverlay } from './components/ScreenLockOverlay';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  OWNER_EMAIL,
} from './firebase';
import {
  DEFAULT_RECEIPT_SETTINGS,
  DEFAULT_SCREEN_LOCK_SETTINGS,
  type ActiveView,
  type AuthorizedUser,
  type BarcodeScanResult,
  type CategoryItem,
  type CheckoutCartItem,
  type PaymentMethod,
  type Product,
  type ReceiptData,
  type ReceiptLineItem,
  type ReceiptSettings,
  type SaleRecord,
  type ScreenLockSettings,
  type StationeryIconId,
} from './types/inventory';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import type { ValidatedProductPayload } from './utils/barcodeDecoder';
import { isValidStationeryIconId } from './utils/stationeryAssets';
import { useAppTheme } from './utils/theme';

const ALLOWLIST_CACHE_PREFIX = 'ofis_anbari_allowlist_';
const SCREEN_LOCK_SESSION_PREFIX = 'ofis_anbari_screen_locked_';

function makeSafeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

function makeReceiptNumber(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CHK-${yy}${mm}${dd}-${rand}`;
}

async function runOfflineSafeWrite(
  writeOp: () => Promise<void>,
  opType: OperationType,
  docPath: string
): Promise<'online' | 'offline'> {
  const promise = writeOp();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    promise.catch((err) => {
      console.error('Deferred offline sync error:', docPath, err);
    });
    await new Promise((resolve) => window.setTimeout(resolve, 40));
    return 'offline';
  }

  let timedOut = false;
  return new Promise<'online' | 'offline'>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      timedOut = true;
      resolve('offline');
    }, 1800);

    promise.then(
      () => {
        window.clearTimeout(timer);
        if (!timedOut) resolve('online');
      },
      (error) => {
        window.clearTimeout(timer);
        if (!timedOut) {
          try {
            handleFirestoreError(error, opType, docPath);
          } catch (handledErr) {
            reject(handledErr);
          }
        } else {
          console.error('Deferred sync error:', docPath, error);
        }
      }
    );
  });
}

function isNetworkOrOfflineError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('client is offline') ||
    msg.includes('unavailable') ||
    msg.includes('failed to get document') ||
    msg.includes('could not reach') ||
    msg.includes('network')
  );
}

function MainApp() {
  const { theme, toggleTheme } = useAppTheme();
  const isOnline = useOnlineStatus();
  const wasOfflineRef = useRef<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [accessChecked, setAccessChecked] = useState<boolean>(false);
  const [isAllowlistedUser, setIsAllowlistedUser] = useState<boolean>(false);
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const productsRef = useRef<Product[]>(products);
  productsRef.current = products;
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const salesRef = useRef<SaleRecord[]>(sales);
  salesRef.current = sales;
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>([]);
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(
    DEFAULT_RECEIPT_SETTINGS
  );
  const receiptSettingsRef = useRef<ReceiptSettings>(receiptSettings);
  receiptSettingsRef.current = receiptSettings;

  const [screenLock, setScreenLock] = useState<ScreenLockSettings>(
    DEFAULT_SCREEN_LOCK_SETTINGS
  );
  const screenLockRef = useRef<ScreenLockSettings>(screenLock);
  screenLockRef.current = screenLock;

  const [isScreenLocked, setIsScreenLocked] = useState<boolean>(false);
  const [lockReason, setLockReason] = useState<'idle' | 'manual'>('idle');
  const [pinSetupOpen, setPinSetupOpen] = useState<boolean>(false);
  const lastActivityRef = useRef<number>(Date.now());

  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<ActiveView>('pos');

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [initialBarcode, setInitialBarcode] = useState<BarcodeScanResult | null>(null);
  const [scannedOverride, setScannedOverride] = useState<BarcodeScanResult | null>(null);

  // Scanner modal state
  const [scannerOpen, setScannerOpen] = useState<boolean>(false);
  const [scannerTab, setScannerTab] = useState<'camera' | 'gallery'>('camera');
  const [scannerTarget, setScannerTarget] = useState<'lookup' | 'field' | 'pos'>('lookup');

  // Sale, Return & Receipt modals state
  const [saleOpen, setSaleOpen] = useState<boolean>(false);
  const [returnModalOpen, setReturnModalOpen] = useState<boolean>(false);
  const [returnTargetSale, setReturnTargetSale] = useState<SaleRecord | null>(null);
  const [receiptSettingsOpen, setReceiptSettingsOpen] = useState<boolean>(false);
  const [reprintReceipt, setReprintReceipt] = useState<ReceiptData | null>(null);
  const [externalSaleScan, setExternalSaleScan] = useState<{
    seq: number;
    scan: BarcodeScanResult;
  } | null>(null);
  const [externalReturnScan, setExternalReturnScan] = useState<{
    seq: number;
    scan: BarcodeScanResult;
  } | null>(null);
  const [externalPosScan, setExternalPosScan] = useState<{
    seq: number;
    scan: BarcodeScanResult;
  } | null>(null);
  const [externalDashboardSearch, setExternalDashboardSearch] = useState<{
    seq: number;
    code: string;
  } | null>(null);

  // Delete confirmation modal state
  const [deleteTargetProduct, setDeleteTargetProduct] = useState<Product | null>(null);
  const [deleteTargetCategory, setDeleteTargetCategory] = useState<CategoryItem | null>(null);
  const [deleteTargetSale, setDeleteTargetSale] = useState<SaleRecord | null>(null);
  const [deleteTargetAuthUser, setDeleteTargetAuthUser] = useState<AuthorizedUser | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const showNotice = useCallback((message: string) => {
    setSyncNotice(message);
    window.setTimeout(() => {
      setSyncNotice((prev) => (prev === message ? null : prev));
    }, 3000);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const isAdmin =
    Boolean(user) &&
    Boolean(user?.emailVerified) &&
    user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      showNotice('İnternet bərpa olundu — məlumatlar sinxronlaşdırılır');
    }
  }, [isOnline, showNotice]);

  // Check allowlist status for non-admin signed-in users (with offline cache support)
  useEffect(() => {
    if (!authReady) return;
    if (!user || !user.email || !user.emailVerified) {
      setIsAllowlistedUser(false);
      setAccessChecked(true);
      return;
    }
    if (isAdmin) {
      setIsAllowlistedUser(true);
      setAccessChecked(true);
      return;
    }

    setAccessChecked(false);
    const emailKey = user.email.toLowerCase();
    const cacheKey = `${ALLOWLIST_CACHE_PREFIX}${user.uid}`;
    const docPath = `authorized_users/${emailKey}`;
    const unsubAllowlist = onSnapshot(
      doc(db, 'authorized_users', emailKey),
      (snap) => {
        const exists = snap.exists();
        if (exists) {
          try {
            window.localStorage.setItem(cacheKey, emailKey);
          } catch {
            // Ignore storage errors
          }
          setIsAllowlistedUser(true);
          setAccessChecked(true);
          return;
        }
        if (!snap.metadata.fromCache) {
          try {
            window.localStorage.removeItem(cacheKey);
          } catch {
            // Ignore storage errors
          }
          setIsAllowlistedUser(false);
          setAccessChecked(true);
          return;
        }
        // Snapshot came from empty local cache while offline: consult local fallback
        let cachedEmail: string | null = null;
        try {
          cachedEmail = window.localStorage.getItem(cacheKey);
        } catch {
          cachedEmail = null;
        }
        setIsAllowlistedUser(cachedEmail === emailKey);
        setAccessChecked(true);
      },
      (error) => {
        if (!navigator.onLine) {
          try {
            if (window.localStorage.getItem(cacheKey) === emailKey) {
              setIsAllowlistedUser(true);
              setAccessChecked(true);
              return;
            }
          } catch {
            // Ignore storage errors
          }
        }
        setIsAllowlistedUser(false);
        setAccessChecked(true);
        handleFirestoreError(error, OperationType.GET, docPath);
      }
    );

    return () => unsubAllowlist();
  }, [authReady, user, isAdmin]);

  const isAuthorizedStoreUser =
    Boolean(user) && Boolean(user?.emailVerified) && (isAdmin || isAllowlistedUser);

  useEffect(() => {
    if (!authReady || !accessChecked || !isAuthorizedStoreUser || !user) {
      setProducts([]);
      setCategories([]);
      setSales([]);
      setAuthorizedUsers([]);
      setReceiptSettings(DEFAULT_RECEIPT_SETTINGS);
      setScreenLock(DEFAULT_SCREEN_LOCK_SETTINGS);
      setIsScreenLocked(false);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);

    const productsPath = 'products';
    const productsQuery = query(
      collection(db, productsPath),
      where('ownerId', '==', user.uid)
    );
    const unsubProducts = onSnapshot(
      productsQuery,
      (snapshot) => {
        const list: Product[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: String(data.name || ''),
            barcode: String(data.barcode || ''),
            barcodeFormat: String(data.barcodeFormat || 'MANUAL'),
            category: String(data.category || 'Digər'),
            brand: typeof data.brand === 'string' ? data.brand : undefined,
            quantity: typeof data.quantity === 'number' ? data.quantity : 0,
            unit: String(data.unit || 'ədəd'),
            purchasePrice:
              typeof data.purchasePrice === 'number' ? data.purchasePrice : undefined,
            salePrice: typeof data.salePrice === 'number' ? data.salePrice : 0,
            minStock: typeof data.minStock === 'number' ? data.minStock : undefined,
            shelfLocation:
              typeof data.shelfLocation === 'string' ? data.shelfLocation : undefined,
            notes: typeof data.notes === 'string' ? data.notes : undefined,
            icon: isValidStationeryIconId(data.icon) ? data.icon : undefined,
            ownerId: String(data.ownerId || ''),
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });
        setProducts(list);
        setDataLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, productsPath);
      }
    );

    const categoriesPath = 'categories';
    const categoriesQuery = query(
      collection(db, categoriesPath),
      where('ownerId', '==', user.uid)
    );
    const unsubCategories = onSnapshot(
      categoriesQuery,
      (snapshot) => {
        const list: CategoryItem[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: String(data.name || ''),
            ownerId: String(data.ownerId || ''),
            createdAt: data.createdAt || null,
          };
        });
        setCategories(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, categoriesPath);
      }
    );

    const salesPath = 'sales';
    const salesQuery = query(
      collection(db, salesPath),
      where('ownerId', '==', user.uid)
    );
    const unsubSales = onSnapshot(
      salesQuery,
      (snapshot) => {
        const list: SaleRecord[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            productId: String(data.productId || ''),
            productName: String(data.productName || ''),
            barcode: String(data.barcode || ''),
            category: String(data.category || 'Digər'),
            quantity: typeof data.quantity === 'number' ? data.quantity : 0,
            unit: String(data.unit || 'ədəd'),
            unitPrice: typeof data.unitPrice === 'number' ? data.unitPrice : 0,
            totalAmount: typeof data.totalAmount === 'number' ? data.totalAmount : 0,
            discountAmount:
              typeof data.discountAmount === 'number' ? data.discountAmount : undefined,
            ownerId: String(data.ownerId || ''),
            receiptNumber:
              typeof data.receiptNumber === 'string' ? data.receiptNumber : undefined,
            paymentMethod:
              data.paymentMethod === 'card' ||
              data.paymentMethod === 'c2c' ||
              data.paymentMethod === 'cash' ||
              data.paymentMethod === 'mobile'
                ? data.paymentMethod
                : undefined,
            cashierEmail:
              typeof data.cashierEmail === 'string' ? data.cashierEmail : undefined,
            soldAt: data.soldAt || null,
            returnedQuantity:
              typeof data.returnedQuantity === 'number' ? data.returnedQuantity : undefined,
            returnedAmount:
              typeof data.returnedAmount === 'number' ? data.returnedAmount : undefined,
            returnReason:
              typeof data.returnReason === 'string' ? data.returnReason : undefined,
            returnedAt: data.returnedAt || null,
          };
        });
        setSales(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, salesPath);
      }
    );

    const receiptSettingsPath = `store_settings/${user.uid}`;
    const unsubReceiptSettings = onSnapshot(
      doc(db, 'store_settings', user.uid),
      (snap) => {
        if (!snap.exists()) {
          setReceiptSettings(DEFAULT_RECEIPT_SETTINGS);
          setScreenLock(DEFAULT_SCREEN_LOCK_SETTINGS);
          return;
        }
        const data = snap.data();
        setReceiptSettings({
          storeName:
            typeof data.storeName === 'string' && data.storeName.trim()
              ? data.storeName
              : DEFAULT_RECEIPT_SETTINGS.storeName,
          subtitle: typeof data.subtitle === 'string' ? data.subtitle : '',
          address: typeof data.address === 'string' ? data.address : '',
          phone: typeof data.phone === 'string' ? data.phone : '',
          taxId: typeof data.taxId === 'string' ? data.taxId : '',
          footerNote:
            typeof data.footerNote === 'string'
              ? data.footerNote
              : DEFAULT_RECEIPT_SETTINGS.footerNote,
          paperWidth: data.paperWidth === '58mm' ? '58mm' : '80mm',
        });

        const lockPinHash =
          typeof data.lockPinHash === 'string' && data.lockPinHash
            ? data.lockPinHash
            : undefined;
        const lockPinSalt =
          typeof data.lockPinSalt === 'string' && data.lockPinSalt
            ? data.lockPinSalt
            : undefined;
        const lockPinLength =
          typeof data.lockPinLength === 'number' &&
          data.lockPinLength >= 4 &&
          data.lockPinLength <= 6
            ? data.lockPinLength
            : undefined;
        const lockTimeoutSeconds =
          typeof data.lockTimeoutSeconds === 'number' && data.lockTimeoutSeconds >= 0
            ? data.lockTimeoutSeconds
            : DEFAULT_SCREEN_LOCK_SETTINGS.lockTimeoutSeconds;
        const lockEnabled =
          typeof data.lockEnabled === 'boolean' ? data.lockEnabled : false;

        setScreenLock({
          lockEnabled,
          lockTimeoutSeconds,
          lockPinHash,
          lockPinSalt,
          lockPinLength,
        });

        // Restore session lock state across page refresh if PIN is still configured
        if (lockPinHash && lockPinSalt) {
          try {
            const savedReason = window.sessionStorage.getItem(
              `${SCREEN_LOCK_SESSION_PREFIX}${user.uid}`
            );
            if (savedReason === 'idle' || savedReason === 'manual') {
              setLockReason(savedReason);
              setIsScreenLocked(true);
            }
          } catch {
            // Ignore storage errors
          }
        } else {
          setIsScreenLocked(false);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, receiptSettingsPath);
      }
    );

    let unsubAuthUsers: (() => void) | undefined;
    if (isAdmin) {
      const authUsersPath = 'authorized_users';
      unsubAuthUsers = onSnapshot(
        collection(db, authUsersPath),
        (snapshot) => {
          const list: AuthorizedUser[] = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              email: String(data.email || d.id),
              label: typeof data.label === 'string' ? data.label : undefined,
              addedBy: String(data.addedBy || ''),
              createdAt: data.createdAt || null,
            };
          });
          setAuthorizedUsers(list);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, authUsersPath);
        }
      );
    }

    return () => {
      unsubProducts();
      unsubCategories();
      unsubSales();
      unsubReceiptSettings();
      if (unsubAuthUsers) unsubAuthUsers();
    };
  }, [authReady, accessChecked, isAuthorizedStoreUser, isAdmin, user]);

  const handleSignIn = async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('Giriş pəncərəsi bağlandı. Yenidən cəhd edin.');
      } else {
        setAuthError('Google ilə giriş zamanı xəta baş verdi. Yenidən cəhd edin.');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (user) {
      try {
        window.localStorage.removeItem(`${ALLOWLIST_CACHE_PREFIX}${user.uid}`);
        window.sessionStorage.removeItem(`${SCREEN_LOCK_SESSION_PREFIX}${user.uid}`);
      } catch {
        // Ignore storage errors
      }
    }
    setIsScreenLocked(false);
    await signOut(auth);
  };

  const handleCreateProduct = useCallback(
    async (payload: ValidatedProductPayload) => {
      if (!user) return;
      const productId = makeSafeDocId('prod');
      const docPath = `products/${productId}`;
      const docData: Record<string, unknown> = {
        name: payload.name,
        barcode: payload.barcode,
        barcodeFormat: payload.barcodeFormat,
        category: payload.category,
        quantity: payload.quantity,
        unit: payload.unit,
        salePrice: payload.salePrice,
        icon: payload.icon,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (payload.brand) docData.brand = payload.brand;
      if (typeof payload.purchasePrice === 'number') {
        docData.purchasePrice = payload.purchasePrice;
      }
      if (typeof payload.minStock === 'number') {
        docData.minStock = payload.minStock;
      }
      if (payload.shelfLocation) docData.shelfLocation = payload.shelfLocation;
      if (payload.notes) docData.notes = payload.notes;

      const mode = await runOfflineSafeWrite(
        () => setDoc(doc(db, 'products', productId), docData),
        OperationType.CREATE,
        docPath
      );
      showNotice(
        mode === 'offline'
          ? 'Məhsul oflayn əlavə edildi (internet gələndə sinxronlaşacaq)'
          : 'Məhsul əlavə edildi və yadda saxlanıldı'
      );
    },
    [user, showNotice]
  );

  const handleUpdateProduct = useCallback(
    async (productId: string, payload: ValidatedProductPayload) => {
      if (!user) return;
      const docPath = `products/${productId}`;
      const updateData: Record<string, FieldValue | string | number> = {
        name: payload.name,
        barcode: payload.barcode,
        barcodeFormat: payload.barcodeFormat,
        category: payload.category,
        quantity: payload.quantity,
        unit: payload.unit,
        salePrice: payload.salePrice,
        icon: payload.icon,
        brand: payload.brand ? payload.brand : deleteField(),
        purchasePrice:
          typeof payload.purchasePrice === 'number' ? payload.purchasePrice : deleteField(),
        minStock: typeof payload.minStock === 'number' ? payload.minStock : deleteField(),
        shelfLocation: payload.shelfLocation ? payload.shelfLocation : deleteField(),
        notes: payload.notes ? payload.notes : deleteField(),
        updatedAt: serverTimestamp(),
      };

      const mode = await runOfflineSafeWrite(
        () => updateDoc(doc(db, 'products', productId), updateData),
        OperationType.UPDATE,
        docPath
      );
      showNotice(
        mode === 'offline'
          ? 'Dəyişikliklər oflayn yadda saxlanıldı'
          : 'Dəyişikliklər yadda saxlanıldı'
      );
    },
    [user, showNotice]
  );

  const handleQuickAdjustQuantity = useCallback(
    async (product: Product, delta: number) => {
      const nextQty = Math.max(0, Math.round((product.quantity + delta) * 100) / 100);
      const docPath = `products/${product.id}`;
      const mode = await runOfflineSafeWrite(
        () =>
          updateDoc(doc(db, 'products', product.id), {
            quantity: nextQty,
            updatedAt: serverTimestamp(),
          }),
        OperationType.UPDATE,
        docPath
      );
      showNotice(
        mode === 'offline'
          ? `${product.name}: stok oflayn yeniləndi (${nextQty} ${product.unit})`
          : `${product.name}: stok yeniləndi (${nextQty} ${product.unit})`
      );
    },
    [showNotice]
  );

  const handleConfirmCheckout = useCallback(
    async (
      items: CheckoutCartItem[],
      options: {
        paymentMethod: PaymentMethod;
        cashReceived?: number;
        discountAmount?: number;
      }
    ): Promise<ReceiptData> => {
      if (!user) {
        throw new Error('İstifadəçi sessiyası tapılmadı.');
      }
      if (items.length === 0) {
        throw new Error('Satış səbəti boşdur.');
      }

      const receiptNumber = makeReceiptNumber();
      const cashierEmail = (user.email || '').slice(0, 160);
      const cashierLabel = cashierEmail.split('@')[0] || 'Kassir';
      const pathHint = `checkout:${receiptNumber}`;

      const executeOfflineBatchCheckout = async (): Promise<ReceiptData> => {
        const baseItems: Array<{
          productRef: ReturnType<typeof doc>;
          productId: string;
          productName: string;
          barcode: string;
          category: string;
          unit: string;
          unitPrice: number;
          sellQty: number;
          nextQty: number;
          grossLineTotal: number;
          itemDiscount: number;
          afterItemDiscount: number;
        }> = [];

        let grossSubtotal = 0;
        let itemsDiscountTotal = 0;

        for (const cartItem of items) {
          const productRef = doc(db, 'products', cartItem.product.id);
          let sourceData: Record<string, unknown> | null = null;
          try {
            const cachedSnap = await getDocFromCache(productRef);
            if (cachedSnap.exists()) {
              sourceData = cachedSnap.data() as Record<string, unknown>;
            }
          } catch {
            // Fall back to live React state snapshot
          }
          if (!sourceData) {
            const localMatch = productsRef.current.find(
              (p) => p.id === cartItem.product.id
            );
            if (localMatch) {
              sourceData = {
                name: localMatch.name,
                barcode: localMatch.barcode,
                category: localMatch.category,
                unit: localMatch.unit,
                salePrice: localMatch.salePrice,
                quantity: localMatch.quantity,
                ownerId: localMatch.ownerId,
              };
            }
          }

          if (!sourceData) {
            throw new Error(`"${cartItem.product.name}" bazada tapılmadı.`);
          }
          if (sourceData.ownerId !== user.uid) {
            throw new Error(`"${cartItem.product.name}" sizin hesabınıza aid deyil.`);
          }

          const productName = String(sourceData.name || '');
          const unit = String(sourceData.unit || 'ədəd');
          const catalogPrice = Number(sourceData.salePrice ?? 0);
          const unitPrice =
            typeof cartItem.unitPriceOverride === 'number' &&
            !Number.isNaN(cartItem.unitPriceOverride) &&
            cartItem.unitPriceOverride >= 0
              ? Math.round(cartItem.unitPriceOverride * 100) / 100
              : catalogPrice;
          const currentQty = Number(sourceData.quantity ?? 0);
          const sellQty = Math.round(cartItem.quantity * 100) / 100;

          if (sellQty <= 0 || sellQty > currentQty) {
            throw new Error(
              `"${productName}" üçün anbarda kifayət qədər stok yoxdur. Mövcud stok: ${currentQty} ${unit}`
            );
          }

          const nextQty = Math.max(0, Math.round((currentQty - sellQty) * 100) / 100);
          const grossLineTotal = Math.round(sellQty * unitPrice * 100) / 100;
          const rawItemDiscount =
            typeof cartItem.discountAmount === 'number' && cartItem.discountAmount > 0
              ? Math.round(cartItem.discountAmount * 100) / 100
              : 0;
          const itemDiscount = Math.min(grossLineTotal, rawItemDiscount);
          const afterItemDiscount = Math.max(
            0,
            Math.round((grossLineTotal - itemDiscount) * 100) / 100
          );

          grossSubtotal += grossLineTotal;
          itemsDiscountTotal += itemDiscount;

          baseItems.push({
            productRef,
            productId: cartItem.product.id,
            productName,
            barcode: String(sourceData.barcode || ''),
            category: String(sourceData.category || 'Digər'),
            unit,
            unitPrice,
            sellQty,
            nextQty,
            grossLineTotal,
            itemDiscount,
            afterItemDiscount,
          });
        }

        grossSubtotal = Math.round(grossSubtotal * 100) / 100;
        itemsDiscountTotal = Math.round(itemsDiscountTotal * 100) / 100;
        const netBeforeOrderDiscount = Math.max(
          0,
          Math.round((grossSubtotal - itemsDiscountTotal) * 100) / 100
        );
        const requestedOrderDiscount =
          typeof options.discountAmount === 'number' && options.discountAmount > 0
            ? Math.min(
                netBeforeOrderDiscount,
                Math.round(options.discountAmount * 100) / 100
              )
            : 0;

        let remainingOrderDiscount = requestedOrderDiscount;
        const receiptLines: ReceiptLineItem[] = [];
        const batch = writeBatch(db);

        for (let i = 0; i < baseItems.length; i++) {
          const entry = baseItems[i];
          let extraLineDiscount = 0;
          if (requestedOrderDiscount > 0 && netBeforeOrderDiscount > 0) {
            if (i === baseItems.length - 1) {
              extraLineDiscount = Math.min(
                entry.afterItemDiscount,
                remainingOrderDiscount
              );
            } else {
              extraLineDiscount = Math.min(
                entry.afterItemDiscount,
                Math.round(
                  requestedOrderDiscount *
                    (entry.afterItemDiscount / netBeforeOrderDiscount) *
                    100
                ) / 100
              );
            }
            extraLineDiscount = Math.max(0, Math.round(extraLineDiscount * 100) / 100);
            remainingOrderDiscount = Math.max(
              0,
              Math.round((remainingOrderDiscount - extraLineDiscount) * 100) / 100
            );
          }

          const lineDiscount = Math.min(
            entry.grossLineTotal,
            Math.round((entry.itemDiscount + extraLineDiscount) * 100) / 100
          );
          const netLineTotal = Math.max(
            0,
            Math.round((entry.grossLineTotal - lineDiscount) * 100) / 100
          );
          const saleId = makeSafeDocId('sale');

          const salePayload: Record<string, unknown> = {
            productId: entry.productId,
            productName: entry.productName.slice(0, 160),
            barcode: entry.barcode.slice(0, 64),
            category: entry.category.slice(0, 64),
            quantity: entry.sellQty,
            unit: entry.unit.slice(0, 24),
            unitPrice: entry.unitPrice,
            totalAmount: netLineTotal,
            ownerId: user.uid,
            receiptNumber,
            paymentMethod: options.paymentMethod,
            soldAt: serverTimestamp(),
          };
          if (lineDiscount > 0) {
            salePayload.discountAmount = lineDiscount;
          }
          if (cashierEmail) {
            salePayload.cashierEmail = cashierEmail;
          }

          batch.update(entry.productRef, {
            quantity: entry.nextQty,
            updatedAt: serverTimestamp(),
          });
          batch.set(doc(db, 'sales', saleId), salePayload);

          receiptLines.push({
            productId: entry.productId,
            productName: entry.productName,
            barcode: entry.barcode,
            quantity: entry.sellQty,
            unit: entry.unit,
            unitPrice: entry.unitPrice,
            discountAmount: lineDiscount > 0 ? lineDiscount : undefined,
            lineTotal: entry.grossLineTotal,
          });
        }

        const appliedDiscount =
          Math.round((itemsDiscountTotal + requestedOrderDiscount) * 100) / 100;
        const totalAmount = Math.max(
          0,
          Math.round((grossSubtotal - appliedDiscount) * 100) / 100
        );
        const changeAmount =
          typeof options.cashReceived === 'number' && options.cashReceived >= totalAmount
            ? Math.round((options.cashReceived - totalAmount) * 100) / 100
            : undefined;

        const commitMode = await runOfflineSafeWrite(
          () => batch.commit(),
          OperationType.WRITE,
          pathHint
        );

        showNotice(
          commitMode === 'offline'
            ? `Satış oflayn qeydə alındı (${receiptNumber}) · internet gələndə sinxronlaşacaq`
            : `Satış tamamlandı (${receiptNumber}) · ${receiptLines.length} çeşid · ${totalAmount.toFixed(2)} AZN`
        );

        return {
          receiptNumber,
          issuedAt: new Date(),
          cashierLabel,
          paymentMethod: options.paymentMethod,
          items: receiptLines,
          subtotalAmount: grossSubtotal,
          discountAmount: appliedDiscount > 0 ? appliedDiscount : undefined,
          totalAmount,
          cashReceived: options.cashReceived,
          changeAmount,
        };
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return executeOfflineBatchCheckout();
      }

      try {
        const result = await runTransaction(db, async (transaction) => {
          // 1. Read all product snapshots first before any writes
          const snapshots = await Promise.all(
            items.map(async (cartItem) => {
              const productRef = doc(db, 'products', cartItem.product.id);
              const snap = await transaction.get(productRef);
              return { cartItem, productRef, snap };
            })
          );

          const baseItems: Array<{
            productRef: ReturnType<typeof doc>;
            productId: string;
            productName: string;
            barcode: string;
            category: string;
            unit: string;
            unitPrice: number;
            sellQty: number;
            nextQty: number;
            grossLineTotal: number;
            itemDiscount: number;
            afterItemDiscount: number;
          }> = [];

          let grossSubtotal = 0;
          let itemsDiscountTotal = 0;

          for (const { cartItem, productRef, snap } of snapshots) {
            if (!snap.exists()) {
              throw new Error(`"${cartItem.product.name}" bazada tapılmadı.`);
            }
            const data = snap.data();
            if (data.ownerId !== user.uid) {
              throw new Error(`"${cartItem.product.name}" sizin hesabınıza aid deyil.`);
            }
            const productName = String(data.name || '');
            const unit = String(data.unit || 'ədəd');
            const catalogPrice = Number(data.salePrice ?? 0);
            const unitPrice =
              typeof cartItem.unitPriceOverride === 'number' &&
              !Number.isNaN(cartItem.unitPriceOverride) &&
              cartItem.unitPriceOverride >= 0
                ? Math.round(cartItem.unitPriceOverride * 100) / 100
                : catalogPrice;
            const currentQty = Number(data.quantity ?? 0);
            const sellQty = Math.round(cartItem.quantity * 100) / 100;

            if (sellQty <= 0 || sellQty > currentQty) {
              throw new Error(
                `"${productName}" üçün anbarda kifayət qədər stok yoxdur. Mövcud stok: ${currentQty} ${unit}`
              );
            }

            const nextQty = Math.max(0, Math.round((currentQty - sellQty) * 100) / 100);
            const grossLineTotal = Math.round(sellQty * unitPrice * 100) / 100;
            const rawItemDiscount =
              typeof cartItem.discountAmount === 'number' && cartItem.discountAmount > 0
                ? Math.round(cartItem.discountAmount * 100) / 100
                : 0;
            const itemDiscount = Math.min(grossLineTotal, rawItemDiscount);
            const afterItemDiscount = Math.max(
              0,
              Math.round((grossLineTotal - itemDiscount) * 100) / 100
            );

            grossSubtotal += grossLineTotal;
            itemsDiscountTotal += itemDiscount;

            baseItems.push({
              productRef,
              productId: cartItem.product.id,
              productName,
              barcode: String(data.barcode || ''),
              category: String(data.category || 'Digər'),
              unit,
              unitPrice,
              sellQty,
              nextQty,
              grossLineTotal,
              itemDiscount,
              afterItemDiscount,
            });
          }

          grossSubtotal = Math.round(grossSubtotal * 100) / 100;
          itemsDiscountTotal = Math.round(itemsDiscountTotal * 100) / 100;
          const netBeforeOrderDiscount = Math.max(
            0,
            Math.round((grossSubtotal - itemsDiscountTotal) * 100) / 100
          );
          const requestedOrderDiscount =
            typeof options.discountAmount === 'number' && options.discountAmount > 0
              ? Math.min(
                  netBeforeOrderDiscount,
                  Math.round(options.discountAmount * 100) / 100
                )
              : 0;

          let remainingOrderDiscount = requestedOrderDiscount;
          const receiptLines: ReceiptLineItem[] = [];

          // 2. Apply all stock deductions and sale records atomically
          for (let i = 0; i < baseItems.length; i++) {
            const entry = baseItems[i];
            let extraLineDiscount = 0;
            if (requestedOrderDiscount > 0 && netBeforeOrderDiscount > 0) {
              if (i === baseItems.length - 1) {
                extraLineDiscount = Math.min(
                  entry.afterItemDiscount,
                  remainingOrderDiscount
                );
              } else {
                extraLineDiscount = Math.min(
                  entry.afterItemDiscount,
                  Math.round(
                    requestedOrderDiscount *
                      (entry.afterItemDiscount / netBeforeOrderDiscount) *
                      100
                  ) / 100
                );
              }
              extraLineDiscount = Math.max(0, Math.round(extraLineDiscount * 100) / 100);
              remainingOrderDiscount = Math.max(
                0,
                Math.round((remainingOrderDiscount - extraLineDiscount) * 100) / 100
              );
            }

            const lineDiscount = Math.min(
              entry.grossLineTotal,
              Math.round((entry.itemDiscount + extraLineDiscount) * 100) / 100
            );
            const netLineTotal = Math.max(
              0,
              Math.round((entry.grossLineTotal - lineDiscount) * 100) / 100
            );
            const saleId = makeSafeDocId('sale');

            const salePayload: Record<string, unknown> = {
              productId: entry.productId,
              productName: entry.productName.slice(0, 160),
              barcode: entry.barcode.slice(0, 64),
              category: entry.category.slice(0, 64),
              quantity: entry.sellQty,
              unit: entry.unit.slice(0, 24),
              unitPrice: entry.unitPrice,
              totalAmount: netLineTotal,
              ownerId: user.uid,
              receiptNumber,
              paymentMethod: options.paymentMethod,
              soldAt: serverTimestamp(),
            };
            if (lineDiscount > 0) {
              salePayload.discountAmount = lineDiscount;
            }
            if (cashierEmail) {
              salePayload.cashierEmail = cashierEmail;
            }

            transaction.update(entry.productRef, {
              quantity: entry.nextQty,
              updatedAt: serverTimestamp(),
            });
            transaction.set(doc(db, 'sales', saleId), salePayload);

            receiptLines.push({
              productId: entry.productId,
              productName: entry.productName,
              barcode: entry.barcode,
              quantity: entry.sellQty,
              unit: entry.unit,
              unitPrice: entry.unitPrice,
              discountAmount: lineDiscount > 0 ? lineDiscount : undefined,
              lineTotal: entry.grossLineTotal,
            });
          }

          return {
            lineItems: receiptLines,
            subtotalAmount: grossSubtotal,
            appliedDiscount: Math.round(
              (itemsDiscountTotal + requestedOrderDiscount) * 100
            ) / 100,
          };
        });

        const totalAmount = Math.max(
          0,
          Math.round((result.subtotalAmount - result.appliedDiscount) * 100) / 100
        );
        const changeAmount =
          typeof options.cashReceived === 'number' && options.cashReceived >= totalAmount
            ? Math.round((options.cashReceived - totalAmount) * 100) / 100
            : undefined;

        showNotice(
          `Satış tamamlandı (${receiptNumber}) · ${result.lineItems.length} çeşid · ${totalAmount.toFixed(2)} AZN`
        );

        return {
          receiptNumber,
          issuedAt: new Date(),
          cashierLabel,
          paymentMethod: options.paymentMethod,
          items: result.lineItems,
          subtotalAmount: result.subtotalAmount,
          discountAmount: result.appliedDiscount > 0 ? result.appliedDiscount : undefined,
          totalAmount,
          cashReceived: options.cashReceived,
          changeAmount,
        };
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes('kifayət qədər stok') ||
            error.message.includes('tapılmadı') ||
            error.message.includes('aid deyil'))
        ) {
          throw error;
        }
        if (isNetworkOrOfflineError(error)) {
          return executeOfflineBatchCheckout();
        }
        handleFirestoreError(error, OperationType.WRITE, pathHint);
      }
    },
    [user, showNotice]
  );

  const handleReturnSale = useCallback(
    async (
      sale: SaleRecord,
      returnQuantity: number,
      reason?: string
    ): Promise<{ stockRestored: boolean }> => {
      if (!user) {
        throw new Error('İstifadəçi sessiyası tapılmadı.');
      }
      const cleanQty = Math.round(returnQuantity * 100) / 100;
      if (cleanQty <= 0) {
        throw new Error('Qaytarılacaq miqdar 0-dan böyük olmalıdır.');
      }
      const trimmedReason = reason?.trim().slice(0, 160) || '';
      const pathHint = `sales/${sale.id}:return`;

      const computeReturnTotals = (
        origQty: number,
        origTotal: number,
        prevReturnedQty: number,
        prevReturnedAmt: number
      ) => {
        const remainingQty = Math.max(
          0,
          Math.round((origQty - prevReturnedQty) * 100) / 100
        );
        if (cleanQty > remainingQty + 0.0001) {
          throw new Error(
            `Maksimum qaytarıla bilən miqdar: ${remainingQty} ${sale.unit}`
          );
        }
        const nextReturnedQty = Math.min(
          origQty,
          Math.round((prevReturnedQty + cleanQty) * 100) / 100
        );
        const isFullReturn = nextReturnedQty >= origQty - 0.0001;
        const finalReturnedQty = isFullReturn ? origQty : nextReturnedQty;
        const nextReturnedAmount = isFullReturn
          ? Math.round(origTotal * 100) / 100
          : Math.min(
              Math.round(origTotal * 100) / 100,
              Math.round(
                (prevReturnedAmt + (cleanQty / origQty) * origTotal) * 100
              ) / 100
            );
        return {
          nextReturnedQty: finalReturnedQty,
          nextReturnedAmount,
        };
      };

      const executeOfflineReturn = async (): Promise<{ stockRestored: boolean }> => {
        const saleRef = doc(db, 'sales', sale.id);
        let saleData: Record<string, unknown> | null = null;
        try {
          const cachedSaleSnap = await getDocFromCache(saleRef);
          if (cachedSaleSnap.exists()) {
            saleData = cachedSaleSnap.data() as Record<string, unknown>;
          }
        } catch {
          // Fall back to live state
        }
        if (!saleData) {
          const localSale = salesRef.current.find((s) => s.id === sale.id);
          if (localSale) {
            saleData = {
              ownerId: localSale.ownerId,
              productId: localSale.productId,
              quantity: localSale.quantity,
              totalAmount: localSale.totalAmount,
              returnedQuantity: localSale.returnedQuantity,
              returnedAmount: localSale.returnedAmount,
            };
          }
        }
        if (!saleData) {
          throw new Error('Satış qeydi bazada tapılmadı.');
        }
        if (saleData.ownerId !== user.uid) {
          throw new Error('Bu satış qeydi sizin hesabınıza aid deyil.');
        }

        const origQty = Number(saleData.quantity ?? sale.quantity);
        const origTotal = Number(saleData.totalAmount ?? sale.totalAmount);
        const prevReturnedQty =
          typeof saleData.returnedQuantity === 'number'
            ? saleData.returnedQuantity
            : 0;
        const prevReturnedAmt =
          typeof saleData.returnedAmount === 'number'
            ? saleData.returnedAmount
            : 0;

        const { nextReturnedQty, nextReturnedAmount } = computeReturnTotals(
          origQty,
          origTotal,
          prevReturnedQty,
          prevReturnedAmt
        );

        const productId = String(saleData.productId || sale.productId);
        const productRef = doc(db, 'products', productId);
        let productData: Record<string, unknown> | null = null;
        try {
          const cachedProdSnap = await getDocFromCache(productRef);
          if (cachedProdSnap.exists()) {
            productData = cachedProdSnap.data() as Record<string, unknown>;
          }
        } catch {
          // Fall back to live productsRef
        }
        if (!productData) {
          const localProd = productsRef.current.find((p) => p.id === productId);
          if (localProd) {
            productData = {
              ownerId: localProd.ownerId,
              quantity: localProd.quantity,
            };
          }
        }

        const batch = writeBatch(db);
        const saleUpdate: Record<string, unknown> = {
          returnedQuantity: nextReturnedQty,
          returnedAmount: nextReturnedAmount,
          returnedAt: serverTimestamp(),
        };
        if (trimmedReason) {
          saleUpdate.returnReason = trimmedReason;
        }
        batch.update(saleRef, saleUpdate);

        let stockRestored = false;
        if (productData && productData.ownerId === user.uid) {
          const currentQty = Number(productData.quantity ?? 0);
          const nextProdQty = Math.round((currentQty + cleanQty) * 100) / 100;
          batch.update(productRef, {
            quantity: nextProdQty,
            updatedAt: serverTimestamp(),
          });
          stockRestored = true;
        }

        const commitMode = await runOfflineSafeWrite(
          () => batch.commit(),
          OperationType.UPDATE,
          pathHint
        );
        showNotice(
          commitMode === 'offline'
            ? `Qaytarma oflayn qeydə alındı: ${sale.productName} (+${cleanQty} ${sale.unit})`
            : stockRestored
            ? `Qaytarma tamamlandı: ${sale.productName} · anbara +${cleanQty} ${sale.unit} əlavə edildi`
            : `Qaytarma tamamlandı: ${sale.productName} (məhsul anbardan silindiyi üçün stok yenilənmədi)`
        );
        return { stockRestored };
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return executeOfflineReturn();
      }

      try {
        const result = await runTransaction(db, async (transaction) => {
          const saleRef = doc(db, 'sales', sale.id);
          const saleSnap = await transaction.get(saleRef);
          if (!saleSnap.exists()) {
            throw new Error('Satış qeydi bazada tapılmadı.');
          }
          const saleData = saleSnap.data();
          if (saleData.ownerId !== user.uid) {
            throw new Error('Bu satış qeydi sizin hesabınıza aid deyil.');
          }

          const origQty = Number(saleData.quantity ?? 0);
          const origTotal = Number(saleData.totalAmount ?? 0);
          const prevReturnedQty =
            typeof saleData.returnedQuantity === 'number'
              ? saleData.returnedQuantity
              : 0;
          const prevReturnedAmt =
            typeof saleData.returnedAmount === 'number'
              ? saleData.returnedAmount
              : 0;

          const { nextReturnedQty, nextReturnedAmount } = computeReturnTotals(
            origQty,
            origTotal,
            prevReturnedQty,
            prevReturnedAmt
          );

          const productId = String(saleData.productId || sale.productId);
          const productRef = doc(db, 'products', productId);
          const productSnap = await transaction.get(productRef);

          const saleUpdate: Record<string, unknown> = {
            returnedQuantity: nextReturnedQty,
            returnedAmount: nextReturnedAmount,
            returnedAt: serverTimestamp(),
          };
          if (trimmedReason) {
            saleUpdate.returnReason = trimmedReason;
          }
          transaction.update(saleRef, saleUpdate);

          let stockRestored = false;
          if (productSnap.exists() && productSnap.data().ownerId === user.uid) {
            const currentQty = Number(productSnap.data().quantity ?? 0);
            const nextProdQty = Math.round((currentQty + cleanQty) * 100) / 100;
            transaction.update(productRef, {
              quantity: nextProdQty,
              updatedAt: serverTimestamp(),
            });
            stockRestored = true;
          }

          return { stockRestored };
        });

        showNotice(
          result.stockRestored
            ? `Qaytarma tamamlandı: ${sale.productName} · anbara +${cleanQty} ${sale.unit} əlavə edildi`
            : `Qaytarma tamamlandı: ${sale.productName} (məhsul anbardan silindiyi üçün stok yenilənmədi)`
        );
        return result;
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes('Maksimum qaytarıla') ||
            error.message.includes('tapılmadı') ||
            error.message.includes('aid deyil') ||
            error.message.includes('0-dan böyük'))
        ) {
          throw error;
        }
        if (isNetworkOrOfflineError(error)) {
          return executeOfflineReturn();
        }
        handleFirestoreError(error, OperationType.UPDATE, pathHint);
      }
    },
    [user, showNotice]
  );

  const buildStoreSettingsDoc = useCallback(
    (receipt: ReceiptSettings, lock: ScreenLockSettings, uid: string) => {
      const payload: Record<string, unknown> = {
        storeName: receipt.storeName,
        subtitle: receipt.subtitle,
        address: receipt.address,
        phone: receipt.phone,
        taxId: receipt.taxId,
        footerNote: receipt.footerNote,
        paperWidth: receipt.paperWidth,
        lockEnabled: lock.lockEnabled,
        lockTimeoutSeconds: lock.lockTimeoutSeconds,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      };
      if (lock.lockPinHash && lock.lockPinSalt) {
        payload.lockPinHash = lock.lockPinHash;
        payload.lockPinSalt = lock.lockPinSalt;
        payload.lockPinLength = lock.lockPinLength ?? 4;
      }
      return payload;
    },
    []
  );

  const lockScreen = useCallback(
    (reason: 'idle' | 'manual') => {
      if (!user || !screenLockRef.current.lockPinHash || !screenLockRef.current.lockPinSalt) {
        return;
      }
      setLockReason(reason);
      setIsScreenLocked(true);
      try {
        window.sessionStorage.setItem(
          `${SCREEN_LOCK_SESSION_PREFIX}${user.uid}`,
          reason
        );
      } catch {
        // Ignore storage errors
      }
    },
    [user]
  );

  const unlockScreen = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsScreenLocked(false);
    if (user) {
      try {
        window.sessionStorage.removeItem(`${SCREEN_LOCK_SESSION_PREFIX}${user.uid}`);
      } catch {
        // Ignore storage errors
      }
    }
  }, [user]);

  const handleSaveReceiptSettings = useCallback(
    async (next: ReceiptSettings) => {
      if (!user) return;
      const docPath = `store_settings/${user.uid}`;
      const payload = buildStoreSettingsDoc(next, screenLockRef.current, user.uid);
      const mode = await runOfflineSafeWrite(
        () => setDoc(doc(db, 'store_settings', user.uid), payload),
        OperationType.WRITE,
        docPath
      );
      showNotice(
        mode === 'offline'
          ? 'Çek ayarları oflayn yadda saxlanıldı'
          : 'Çek və printer ayarları yadda saxlanıldı'
      );
    },
    [user, showNotice, buildStoreSettingsDoc]
  );

  const handleSaveScreenLockSettings = useCallback(
    async (next: ScreenLockSettings, lockImmediately = false) => {
      if (!user) return;
      const docPath = `store_settings/${user.uid}`;
      const payload = buildStoreSettingsDoc(receiptSettingsRef.current, next, user.uid);
      setScreenLock(next);
      lastActivityRef.current = Date.now();
      const mode = await runOfflineSafeWrite(
        () => setDoc(doc(db, 'store_settings', user.uid), payload),
        OperationType.WRITE,
        docPath
      );

      if (lockImmediately && next.lockPinHash && next.lockPinSalt) {
        setLockReason('manual');
        setIsScreenLocked(true);
        try {
          window.sessionStorage.setItem(
            `${SCREEN_LOCK_SESSION_PREFIX}${user.uid}`,
            'manual'
          );
        } catch {
          // Ignore storage errors
        }
        return;
      }

      if (!next.lockPinHash || !next.lockPinSalt) {
        setIsScreenLocked(false);
        try {
          window.sessionStorage.removeItem(`${SCREEN_LOCK_SESSION_PREFIX}${user.uid}`);
        } catch {
          // Ignore storage errors
        }
      }

      showNotice(
        mode === 'offline'
          ? 'Ekran kilidi ayarları oflayn yadda saxlanıldı'
          : next.lockPinHash
          ? 'Ekran kilidi ayarları yadda saxlanıldı'
          : 'Ekran kilidi ləğv edildi'
      );
    },
    [user, showNotice, buildStoreSettingsDoc]
  );

  // Automatic idle lock monitor (mousemove/keydown/touch/visibility wake-up)
  useEffect(() => {
    if (
      !isAuthorizedStoreUser ||
      !screenLock.lockEnabled ||
      !screenLock.lockPinHash ||
      !screenLock.lockPinSalt ||
      screenLock.lockTimeoutSeconds <= 0 ||
      isScreenLocked
    ) {
      return;
    }

    lastActivityRef.current = Date.now();
    const timeoutMs = screenLock.lockTimeoutSeconds * 1000;

    const markActive = () => {
      lastActivityRef.current = Date.now();
    };

    const checkIdle = () => {
      if (Date.now() - lastActivityRef.current >= timeoutMs) {
        lockScreen('idle');
      }
    };

    const onVisibilityChange = () => {
      if (!document.hidden) {
        checkIdle();
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'pointerdown',
      'wheel',
      'scroll',
    ];
    for (const evt of activityEvents) {
      window.addEventListener(evt, markActive, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    const intervalId = window.setInterval(checkIdle, 1000);

    return () => {
      for (const evt of activityEvents) {
        window.removeEventListener(evt, markActive);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [
    isAuthorizedStoreUser,
    screenLock.lockEnabled,
    screenLock.lockPinHash,
    screenLock.lockPinSalt,
    screenLock.lockTimeoutSeconds,
    isScreenLocked,
    lockScreen,
  ]);

  const handleReprintSale = useCallback(
    (targetSale: SaleRecord) => {
      const grouped = targetSale.receiptNumber
        ? sales.filter((s) => s.receiptNumber === targetSale.receiptNumber)
        : [targetSale];
      const source = grouped.length > 0 ? grouped : [targetSale];
      const items: ReceiptLineItem[] = source.map((s) => ({
        productId: s.productId,
        productName: s.productName,
        barcode: s.barcode,
        quantity: s.quantity,
        unit: s.unit,
        unitPrice: s.unitPrice,
        discountAmount:
          typeof s.discountAmount === 'number' && s.discountAmount > 0
            ? s.discountAmount
            : undefined,
        lineTotal: Math.round(s.quantity * s.unitPrice * 100) / 100,
      }));
      const totalAmount =
        Math.round(source.reduce((sum, s) => sum + s.totalAmount, 0) * 100) / 100;
      const discountAmount =
        Math.round(source.reduce((sum, s) => sum + (s.discountAmount ?? 0), 0) * 100) /
        100;
      const subtotalAmount =
        Math.round(items.reduce((sum, i) => sum + i.lineTotal, 0) * 100) / 100;
      const issuedAt =
        targetSale.soldAt && typeof targetSale.soldAt.toDate === 'function'
          ? targetSale.soldAt.toDate()
          : new Date();
      const cashierEmail = targetSale.cashierEmail || user?.email || '';
      setReprintReceipt({
        receiptNumber:
          targetSale.receiptNumber || `CHK-${targetSale.id.slice(-6).toUpperCase()}`,
        issuedAt,
        cashierLabel: cashierEmail.split('@')[0] || 'Kassir',
        paymentMethod: targetSale.paymentMethod || 'cash',
        items,
        subtotalAmount: discountAmount > 0 ? subtotalAmount : undefined,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
        totalAmount,
      });
    },
    [sales, user]
  );

  const handleAddCategory = useCallback(
    async (name: string) => {
      if (!user) return;
      const alreadyExists = categories.some(
        (c) => c.name.toLowerCase() === name.toLowerCase()
      );
      if (alreadyExists) return;

      const catId = makeSafeDocId('cat');
      const docPath = `categories/${catId}`;
      const mode = await runOfflineSafeWrite(
        () =>
          setDoc(doc(db, 'categories', catId), {
            name,
            ownerId: user.uid,
            createdAt: serverTimestamp(),
          }),
        OperationType.CREATE,
        docPath
      );
      showNotice(
        mode === 'offline'
          ? `"${name}" kateqoriyası oflayn əlavə edildi`
          : `"${name}" kateqoriyası əlavə edildi`
      );
    },
    [user, categories, showNotice]
  );

  const handleAddAuthorizedUser = useCallback(
    async (email: string, label?: string) => {
      if (!user || !isAdmin) return;
      const emailKey = email.trim().toLowerCase();
      const docPath = `authorized_users/${emailKey}`;
      const docData: Record<string, unknown> = {
        email: emailKey,
        addedBy: user.uid,
        createdAt: serverTimestamp(),
      };
      if (label) {
        docData.label = label;
      }
      try {
        await setDoc(doc(db, 'authorized_users', emailKey), docData);
        showNotice(`${emailKey} hesabına giriş icazəsi verildi`);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, docPath);
      }
    },
    [user, isAdmin, showNotice]
  );

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      if (deleteTargetProduct) {
        const path = `products/${deleteTargetProduct.id}`;
        await runOfflineSafeWrite(
          () => deleteDoc(doc(db, 'products', deleteTargetProduct.id)),
          OperationType.DELETE,
          path
        );
        if (editingProduct?.id === deleteTargetProduct.id) {
          setDrawerOpen(false);
          setEditingProduct(null);
        }
        showNotice('Məhsul silindi');
        setDeleteTargetProduct(null);
      } else if (deleteTargetCategory) {
        const path = `categories/${deleteTargetCategory.id}`;
        await runOfflineSafeWrite(
          () => deleteDoc(doc(db, 'categories', deleteTargetCategory.id)),
          OperationType.DELETE,
          path
        );
        showNotice('Kateqoriya silindi');
        setDeleteTargetCategory(null);
      } else if (deleteTargetSale) {
        const path = `sales/${deleteTargetSale.id}`;
        await runOfflineSafeWrite(
          () => deleteDoc(doc(db, 'sales', deleteTargetSale.id)),
          OperationType.DELETE,
          path
        );
        showNotice('Satış qeydi silindi');
        setDeleteTargetSale(null);
      } else if (deleteTargetAuthUser) {
        const path = `authorized_users/${deleteTargetAuthUser.id}`;
        try {
          await deleteDoc(doc(db, 'authorized_users', deleteTargetAuthUser.id));
          showNotice(`${deleteTargetAuthUser.email} giriş icazəsi ləğv edildi`);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, path);
        }
        setDeleteTargetAuthUser(null);
      }
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : 'Silinmə zamanı xəta baş verdi. Yenidən cəhd edin.'
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleBarcodeDetected = useCallback(
    (result: BarcodeScanResult) => {
      setScannerOpen(false);
      if (scannerTarget === 'field') {
        setScannedOverride(result);
        return;
      }

      if (scannerTarget === 'pos') {
        setExternalPosScan((prev) => ({
          seq: (prev?.seq ?? 0) + 1,
          scan: result,
        }));
        return;
      }

      // Lookup mode: find existing product by barcode, or open create drawer pre-filled
      const match = products.find(
        (p) => p.barcode.trim().toLowerCase() === result.code.trim().toLowerCase()
      );
      if (match) {
        setEditingProduct(match);
        setDrawerMode('edit');
        setInitialBarcode(null);
        setDrawerOpen(true);
        showNotice(`Barkod tapıldı: ${match.name}`);
      } else {
        setEditingProduct(null);
        setDrawerMode('create');
        setInitialBarcode(result);
        setDrawerOpen(true);
      }
    },
    [scannerTarget, products, showNotice]
  );

  const productIconMap = useMemo(() => {
    const map = new Map<string, StationeryIconId>();
    for (const p of products) {
      if (p.icon) {
        map.set(p.id, p.icon);
      }
    }
    return map;
  }, [products]);

  const hasAnyBlockingModal = Boolean(
    isScreenLocked ||
      pinSetupOpen ||
      scannerOpen ||
      saleOpen ||
      returnModalOpen ||
      drawerOpen ||
      receiptSettingsOpen ||
      reprintReceipt ||
      deleteTargetProduct ||
      deleteTargetCategory ||
      deleteTargetSale ||
      deleteTargetAuthUser
  );

  const handleGlobalBarcodeScan = useCallback(
    (result: BarcodeScanResult) => {
      if (scannerOpen) {
        handleBarcodeDetected(result);
        return;
      }

      if (saleOpen) {
        setExternalSaleScan((prev) => ({
          seq: (prev?.seq ?? 0) + 1,
          scan: result,
        }));
        return;
      }

      if (returnModalOpen) {
        setExternalReturnScan((prev) => ({
          seq: (prev?.seq ?? 0) + 1,
          scan: result,
        }));
        return;
      }

      if (drawerOpen) {
        setScannedOverride(result);
        return;
      }

      const anyBlockingModalOpen = Boolean(
        receiptSettingsOpen ||
          reprintReceipt ||
          deleteTargetProduct ||
          deleteTargetCategory ||
          deleteTargetSale ||
          deleteTargetAuthUser
      );
      if (!anyBlockingModalOpen) {
        if (activeView === 'pos') {
          setExternalPosScan((prev) => ({
            seq: (prev?.seq ?? 0) + 1,
            scan: result,
          }));
        } else {
          setExternalDashboardSearch((prev) => ({
            seq: (prev?.seq ?? 0) + 1,
            code: result.code,
          }));
        }
      }
    },
    [
      scannerOpen,
      saleOpen,
      returnModalOpen,
      drawerOpen,
      activeView,
      receiptSettingsOpen,
      reprintReceipt,
      deleteTargetProduct,
      deleteTargetCategory,
      deleteTargetSale,
      deleteTargetAuthUser,
      handleBarcodeDetected,
    ]
  );

  if (!authReady || !accessChecked) {
    return (
      <div className="min-h-screen bg-[#F0F4F9] dark:bg-[#0B1120] flex items-center justify-center p-6">
        <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Sistem yüklənir...
        </div>
      </div>
    );
  }

  if (!user || !isAuthorizedStoreUser) {
    return (
      <>
        <AuthScreen
          unauthorizedEmail={
            user && !isAuthorizedStoreUser ? user.email || 'naməlum hesab' : null
          }
          authError={authError}
          busy={authBusy}
          theme={theme}
          onToggleTheme={toggleTheme}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <>
      <GlobalBarcodeListener
        enabled={isAuthorizedStoreUser && !isScreenLocked}
        onScan={handleGlobalBarcodeScan}
      />

      <InventoryDashboard
        activeView={activeView}
        onChangeActiveView={setActiveView}
        userEmail={user.email || OWNER_EMAIL}
        isAdmin={isAdmin}
        theme={theme}
        onToggleTheme={toggleTheme}
        products={products}
        customCategories={categories}
        sales={sales}
        authorizedUsers={authorizedUsers}
        receiptSettings={receiptSettings}
        screenLockSettings={screenLock}
        loading={dataLoading}
        syncNotice={syncNotice}
        hasBlockingModal={hasAnyBlockingModal}
        externalSearch={externalDashboardSearch}
        externalPosScan={externalPosScan}
        onSignOut={handleSignOut}
        onLockNow={() => {
          if (screenLock.lockPinHash && screenLock.lockPinSalt) {
            lockScreen('manual');
          } else {
            setPinSetupOpen(true);
          }
        }}
        onOpenPinSetup={() => setPinSetupOpen(true)}
        onOpenNewProduct={() => {
          setEditingProduct(null);
          setInitialBarcode(null);
          setDrawerMode('create');
          setDrawerOpen(true);
        }}
        onOpenEditProduct={(product) => {
          setEditingProduct(product);
          setInitialBarcode(null);
          setDrawerMode('edit');
          setDrawerOpen(true);
        }}
        onOpenQuickScanner={(tab, target = 'lookup') => {
          setScannerTarget(target);
          setScannerTab(tab);
          setScannerOpen(true);
        }}
        onOpenSale={() => setSaleOpen(true)}
        onOpenReturnModal={(sale) => {
          setReturnTargetSale(sale ?? null);
          setReturnModalOpen(true);
        }}
        onConfirmCheckout={handleConfirmCheckout}
        onCreateMissingProductFromPos={(scan) => {
          setEditingProduct(null);
          setDrawerMode('create');
          setInitialBarcode(scan ?? null);
          setDrawerOpen(true);
        }}
        onOpenReceiptPreview={(receipt) => setReprintReceipt(receipt)}
        onQuickAdjustQuantity={handleQuickAdjustQuantity}
        onRequestDeleteProduct={(product) => setDeleteTargetProduct(product)}
        onAddCategory={handleAddCategory}
        onDeleteCategory={(cat) => setDeleteTargetCategory(cat)}
        onOpenReceiptSettings={() => setReceiptSettingsOpen(true)}
        onSaveReceiptSettings={handleSaveReceiptSettings}
        onSaveScreenLockSettings={(next) => handleSaveScreenLockSettings(next)}
        onReprintSale={handleReprintSale}
        onRequestDeleteSale={(sale) => setDeleteTargetSale(sale)}
        onAddAuthorizedUser={handleAddAuthorizedUser}
        onRequestDeleteAuthorizedUser={(authUser) => setDeleteTargetAuthUser(authUser)}
      />

      <ProductDrawer
        isOpen={drawerOpen}
        mode={drawerMode}
        product={editingProduct}
        initialBarcode={initialBarcode}
        categories={categories.map((c) => c.name)}
        existingProducts={products}
        onClose={() => {
          setDrawerOpen(false);
          setEditingProduct(null);
          setInitialBarcode(null);
        }}
        onCreate={handleCreateProduct}
        onUpdate={handleUpdateProduct}
        onDeleteRequest={(product) => setDeleteTargetProduct(product)}
        onSelectExistingProduct={(existing) => {
          setEditingProduct(existing);
          setDrawerMode('edit');
          setInitialBarcode(null);
        }}
        onOpenScannerForField={(tab) => {
          setScannerTarget('field');
          setScannerTab(tab);
          setScannerOpen(true);
        }}
        scannedBarcodeOverride={scannedOverride}
        onConsumeScannedOverride={() => setScannedOverride(null)}
        onAddCategory={handleAddCategory}
      />

      <BarcodeScannerModal
        isOpen={scannerOpen}
        initialTab={scannerTab}
        title={
          scannerTarget === 'field'
            ? 'Məhsul üçün barkod oxu'
            : 'Barkodla məhsul tap və ya əlavə et'
        }
        subtitle={
          scannerTarget === 'field'
            ? 'Barkod oxunduqdan sonra avtomatik olaraq məhsul formasına yazılacaq.'
            : 'Barkod mağazada varsa dərhal açılacaq, yoxdursa yeni məhsul kimi əlavə ediləcək.'
        }
        onClose={() => setScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />

      <SaleModal
        isOpen={saleOpen}
        products={products}
        receiptSettings={receiptSettings}
        externalScan={externalSaleScan}
        onClose={() => setSaleOpen(false)}
        onConfirmCheckout={handleConfirmCheckout}
        onCreateMissingProduct={(scan) => {
          setEditingProduct(null);
          setDrawerMode('create');
          setInitialBarcode(scan);
          setDrawerOpen(true);
        }}
        onOpenReceiptSettings={() => setReceiptSettingsOpen(true)}
      />

      <ReturnSaleModal
        isOpen={returnModalOpen}
        initialSale={returnTargetSale}
        sales={sales}
        productIconMap={productIconMap}
        externalScan={externalReturnScan}
        onClose={() => {
          setReturnModalOpen(false);
          setReturnTargetSale(null);
        }}
        onConfirmReturn={handleReturnSale}
      />

      <ReceiptPreviewModal
        isOpen={Boolean(reprintReceipt)}
        receipt={reprintReceipt}
        settings={receiptSettings}
        onClose={() => setReprintReceipt(null)}
        onOpenSettings={() => setReceiptSettingsOpen(true)}
      />

      <ReceiptSettingsModal
        isOpen={receiptSettingsOpen}
        settings={receiptSettings}
        onClose={() => setReceiptSettingsOpen(false)}
        onSave={handleSaveReceiptSettings}
      />

      <PinSetupModal
        isOpen={pinSetupOpen}
        currentSettings={screenLock}
        onClose={() => setPinSetupOpen(false)}
        onSave={handleSaveScreenLockSettings}
      />

      {screenLock.lockPinHash && screenLock.lockPinSalt ? (
        <ScreenLockOverlay
          isOpen={isScreenLocked}
          reason={lockReason}
          storeName={receiptSettings.storeName}
          userEmail={user.email || OWNER_EMAIL}
          pinHash={screenLock.lockPinHash}
          pinSalt={screenLock.lockPinSalt}
          pinLength={screenLock.lockPinLength ?? 4}
          onUnlock={unlockScreen}
          onSignOut={handleSignOut}
        />
      ) : null}

      <DeleteConfirmModal
        isOpen={Boolean(
          deleteTargetProduct ||
            deleteTargetCategory ||
            deleteTargetSale ||
            deleteTargetAuthUser
        )}
        title={
          deleteTargetProduct
            ? `"${deleteTargetProduct.name}" silinsin?`
            : deleteTargetSale
            ? `"${deleteTargetSale.productName}" satış qeydi silinsin?`
            : deleteTargetAuthUser
            ? `"${deleteTargetAuthUser.email}" giriş icazəsi ləğv edilsin?`
            : `"${deleteTargetCategory?.name}" kateqoriyası silinsin?`
        }
        description={
          deleteTargetProduct
            ? 'Bu məhsulu sildikdən sonra bərpa etmək mümkün olmayacaq. Silmədiyiniz müddətcə bütün məlumatlar sistemdə daimi saxlanılır.'
            : deleteTargetSale
            ? 'Bu satış qeydi satış hesabatından silinəcək (anbar stok miqdarına təsir etmir).'
            : deleteTargetAuthUser
            ? 'Bu hesab artıq mağaza sisteminə daxil ola bilməyəcək. İstədiyiniz vaxt yenidən əlavə edə bilərsiniz.'
            : 'Bu kateqoriya siyahıdan silinəcək. Bu kateqoriyaya aid mövcud məhsullar silinməyəcək.'
        }
        busy={deleting}
        onCancel={() => {
          setDeleteTargetProduct(null);
          setDeleteTargetCategory(null);
          setDeleteTargetSale(null);
          setDeleteTargetAuthUser(null);
        }}
        onConfirm={handleConfirmDelete}
      />

      <OfflineIndicator />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
