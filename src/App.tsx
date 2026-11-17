import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type FieldValue,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InventoryDashboard } from './components/InventoryDashboard';
import { ProductDrawer } from './components/ProductDrawer';
import { SaleModal } from './components/SaleModal';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  OWNER_EMAIL,
} from './firebase';
import type {
  AuthorizedUser,
  BarcodeScanResult,
  CategoryItem,
  Product,
  SaleRecord,
} from './types/inventory';
import type { ValidatedProductPayload } from './utils/barcodeDecoder';

function makeSafeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

function MainApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [accessChecked, setAccessChecked] = useState<boolean>(false);
  const [isAllowlistedUser, setIsAllowlistedUser] = useState<boolean>(false);
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [initialBarcode, setInitialBarcode] = useState<BarcodeScanResult | null>(null);
  const [scannedOverride, setScannedOverride] = useState<BarcodeScanResult | null>(null);

  // Scanner modal state
  const [scannerOpen, setScannerOpen] = useState<boolean>(false);
  const [scannerTab, setScannerTab] = useState<'camera' | 'gallery'>('camera');
  const [scannerTarget, setScannerTarget] = useState<'lookup' | 'field'>('lookup');

  // Sale modal state
  const [saleOpen, setSaleOpen] = useState<boolean>(false);

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

  // Check allowlist status for non-admin signed-in users
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
    const docPath = `authorized_users/${emailKey}`;
    const unsubAllowlist = onSnapshot(
      doc(db, 'authorized_users', emailKey),
      (snap) => {
        setIsAllowlistedUser(snap.exists());
        setAccessChecked(true);
      },
      (error) => {
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
      setDataLoading(false);
      return;
    }

    setDataLoading(true);

    const productsPath = 'products';
    const unsubProducts = onSnapshot(
      collection(db, productsPath),
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
    const unsubCategories = onSnapshot(
      collection(db, categoriesPath),
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
    const unsubSales = onSnapshot(
      collection(db, salesPath),
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
            ownerId: String(data.ownerId || ''),
            soldAt: data.soldAt || null,
          };
        });
        setSales(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, salesPath);
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

      try {
        await setDoc(doc(db, 'products', productId), docData);
        showNotice('Məhsul əlavə edildi və yadda saxlanıldı');
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, docPath);
      }
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
        brand: payload.brand ? payload.brand : deleteField(),
        purchasePrice:
          typeof payload.purchasePrice === 'number' ? payload.purchasePrice : deleteField(),
        minStock: typeof payload.minStock === 'number' ? payload.minStock : deleteField(),
        shelfLocation: payload.shelfLocation ? payload.shelfLocation : deleteField(),
        notes: payload.notes ? payload.notes : deleteField(),
        updatedAt: serverTimestamp(),
      };

      try {
        await updateDoc(doc(db, 'products', productId), updateData);
        showNotice('Dəyişikliklər yadda saxlanıldı');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, docPath);
      }
    },
    [user, showNotice]
  );

  const handleQuickAdjustQuantity = useCallback(
    async (product: Product, delta: number) => {
      const nextQty = Math.max(0, Math.round((product.quantity + delta) * 100) / 100);
      const docPath = `products/${product.id}`;
      try {
        await updateDoc(doc(db, 'products', product.id), {
          quantity: nextQty,
          updatedAt: serverTimestamp(),
        });
        showNotice(`${product.name}: stok yeniləndi (${nextQty} ${product.unit})`);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, docPath);
      }
    },
    [showNotice]
  );

  const handleConfirmSale = useCallback(
    async (productId: string, sellQty: number): Promise<{ remainingQty: number }> => {
      if (!user) {
        throw new Error('İstifadəçi sessiyası tapılmadı.');
      }
      const docPath = `products/${productId}`;
      const productRef = doc(db, 'products', productId);
      const saleId = makeSafeDocId('sale');
      const saleRef = doc(db, 'sales', saleId);

      try {
        let soldProductName = '';
        let soldUnit = 'ədəd';
        const remainingQty = await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(productRef);
          if (!snap.exists()) {
            throw new Error('Məhsul bazada tapılmadı.');
          }
          const data = snap.data();
          soldProductName = String(data.name || '');
          soldUnit = String(data.unit || 'ədəd');
          const unitPrice = Number(data.salePrice ?? 0);
          const currentQty = Number(data.quantity ?? 0);
          if (sellQty <= 0 || sellQty > currentQty) {
            throw new Error(
              `Anbarda kifayət qədər stok yoxdur. Mövcud stok: ${currentQty} ${soldUnit}`
            );
          }
          const nextQty = Math.max(0, Math.round((currentQty - sellQty) * 100) / 100);
          const totalAmount = Math.round(sellQty * unitPrice * 100) / 100;

          transaction.update(productRef, {
            quantity: nextQty,
            updatedAt: serverTimestamp(),
          });

          transaction.set(saleRef, {
            productId,
            productName: soldProductName.slice(0, 160),
            barcode: String(data.barcode || '').slice(0, 64),
            category: String(data.category || 'Digər').slice(0, 64),
            quantity: Math.round(sellQty * 100) / 100,
            unit: soldUnit.slice(0, 24),
            unitPrice,
            totalAmount,
            ownerId: user.uid,
            soldAt: serverTimestamp(),
          });

          return nextQty;
        });
        showNotice(
          `Satış: ${soldProductName} (-${sellQty} ${soldUnit}) · Qalan: ${remainingQty} ${soldUnit}`
        );
        return { remainingQty };
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes('kifayət qədər stok') ||
            error.message.includes('tapılmadı'))
        ) {
          throw error;
        }
        handleFirestoreError(error, OperationType.WRITE, `${docPath} -> sales/${saleId}`);
      }
    },
    [user, showNotice]
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
      try {
        await setDoc(doc(db, 'categories', catId), {
          name,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
        });
        showNotice(`"${name}" kateqoriyası əlavə edildi`);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, docPath);
      }
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
        try {
          await deleteDoc(doc(db, 'products', deleteTargetProduct.id));
          if (editingProduct?.id === deleteTargetProduct.id) {
            setDrawerOpen(false);
            setEditingProduct(null);
          }
          showNotice('Məhsul silindi');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, path);
        }
        setDeleteTargetProduct(null);
      } else if (deleteTargetCategory) {
        const path = `categories/${deleteTargetCategory.id}`;
        try {
          await deleteDoc(doc(db, 'categories', deleteTargetCategory.id));
          showNotice('Kateqoriya silindi');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, path);
        }
        setDeleteTargetCategory(null);
      } else if (deleteTargetSale) {
        const path = `sales/${deleteTargetSale.id}`;
        try {
          await deleteDoc(doc(db, 'sales', deleteTargetSale.id));
          showNotice('Satış qeydi silindi');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, path);
        }
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
    } finally {
      setDeleting(false);
    }
  };

  const handleBarcodeDetected = (result: BarcodeScanResult) => {
    setScannerOpen(false);
    if (scannerTarget === 'field') {
      setScannedOverride(result);
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
  };

  if (!authReady || !accessChecked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-600">Sistem yüklənir...</div>
      </div>
    );
  }

  if (!user || !isAuthorizedStoreUser) {
    return (
      <AuthScreen
        unauthorizedEmail={
          user && !isAuthorizedStoreUser ? user.email || 'naməlum hesab' : null
        }
        authError={authError}
        busy={authBusy}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <>
      <InventoryDashboard
        userEmail={user.email || OWNER_EMAIL}
        isAdmin={isAdmin}
        products={products}
        customCategories={categories}
        sales={sales}
        authorizedUsers={authorizedUsers}
        loading={dataLoading}
        syncNotice={syncNotice}
        onSignOut={handleSignOut}
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
        onOpenQuickScanner={(tab) => {
          setScannerTarget('lookup');
          setScannerTab(tab);
          setScannerOpen(true);
        }}
        onOpenSale={() => setSaleOpen(true)}
        onQuickAdjustQuantity={handleQuickAdjustQuantity}
        onRequestDeleteProduct={(product) => setDeleteTargetProduct(product)}
        onAddCategory={handleAddCategory}
        onDeleteCategory={(cat) => setDeleteTargetCategory(cat)}
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
        onClose={() => setSaleOpen(false)}
        onConfirmSale={handleConfirmSale}
        onCreateMissingProduct={(scan) => {
          setEditingProduct(null);
          setDrawerMode('create');
          setInitialBarcode(scan);
          setDrawerOpen(true);
        }}
      />

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
