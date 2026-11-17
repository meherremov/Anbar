import {
  AlertCircle,
  Barcode,
  BarChart3,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FolderOpen,
  Home,
  ImagePlus,
  LogOut,
  Menu,
  Minus,
  Moon,
  Package,
  Pencil,
  Plus,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  Sun,
  Trash2,
  UserCircle2,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  DEFAULT_CATEGORIES,
  FIELD_LIMITS,
  type ActiveView,
  type AuthorizedUser,
  type BarcodeScanResult,
  type CategoryItem,
  type CheckoutCartItem,
  type PaymentMethod,
  type Product,
  type ReceiptData,
  type ReceiptSettings,
  type SaleRecord,
  type SortOption,
  type StockFilter,
} from '../types/inventory';
import type { AppTheme } from '../utils/theme';
import { AuthorizedUsersPanel } from './AuthorizedUsersPanel';
import { CategoryValueChart } from './CategoryValueChart';
import { PosWorkspace } from './PosWorkspace';
import { ProductThumb } from './ProductThumb';
import { SalesReportModule } from './SalesReportModule';
import { SettingsPanel } from './SettingsPanel';

interface InventoryDashboardProps {
  activeView: ActiveView;
  onChangeActiveView: (view: ActiveView) => void;
  userEmail: string;
  isAdmin: boolean;
  theme: AppTheme;
  onToggleTheme: () => void;
  products: Product[];
  customCategories: CategoryItem[];
  sales: SaleRecord[];
  authorizedUsers: AuthorizedUser[];
  receiptSettings: ReceiptSettings;
  loading: boolean;
  syncNotice: string | null;
  hasBlockingModal: boolean;
  externalSearch?: { seq: number; code: string } | null;
  externalPosScan?: { seq: number; scan: BarcodeScanResult } | null;
  onSignOut: () => void;
  onOpenNewProduct: () => void;
  onOpenEditProduct: (product: Product) => void;
  onOpenQuickScanner: (tab: 'camera' | 'gallery', target?: 'lookup' | 'pos') => void;
  onOpenSale: () => void;
  onConfirmCheckout: (
    items: CheckoutCartItem[],
    options: {
      paymentMethod: PaymentMethod;
      cashReceived?: number;
      discountAmount?: number;
    }
  ) => Promise<ReceiptData>;
  onCreateMissingProductFromPos: (scan?: BarcodeScanResult) => void;
  onOpenReceiptPreview: (receipt: ReceiptData) => void;
  onQuickAdjustQuantity: (product: Product, delta: number) => Promise<void>;
  onRequestDeleteProduct: (product: Product) => void;
  onAddCategory: (name: string) => Promise<void>;
  onDeleteCategory: (cat: CategoryItem) => void;
  onOpenReceiptSettings: () => void;
  onSaveReceiptSettings: (next: ReceiptSettings) => Promise<void>;
  onReprintSale: (sale: SaleRecord) => void;
  onRequestDeleteSale: (sale: SaleRecord) => void;
  onAddAuthorizedUser: (email: string, label?: string) => Promise<void>;
  onRequestDeleteAuthorizedUser: (authUser: AuthorizedUser) => void;
}

function getStockStatus(product: Product): {
  label: string;
  tone: 'ok' | 'low' | 'out';
} {
  const min = typeof product.minStock === 'number' ? product.minStock : 5;
  if (product.quantity <= 0) {
    return { label: 'Bitib', tone: 'out' };
  }
  if (product.quantity <= min) {
    return { label: 'Az qalıb', tone: 'low' };
  }
  return { label: 'Stokda var', tone: 'ok' };
}

function formatPrice(val: number): string {
  return `${val.toFixed(2)} AZN`;
}

function formatLiveDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function formatLiveTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function InventoryDashboard({
  activeView,
  onChangeActiveView,
  userEmail,
  isAdmin,
  theme,
  onToggleTheme,
  products,
  customCategories,
  sales,
  authorizedUsers,
  receiptSettings,
  loading,
  syncNotice,
  hasBlockingModal,
  externalSearch,
  externalPosScan,
  onSignOut,
  onOpenNewProduct,
  onOpenEditProduct,
  onOpenQuickScanner,
  onOpenSale,
  onConfirmCheckout,
  onCreateMissingProductFromPos,
  onOpenReceiptPreview,
  onQuickAdjustQuantity,
  onRequestDeleteProduct,
  onAddCategory,
  onDeleteCategory,
  onOpenReceiptSettings,
  onSaveReceiptSettings,
  onReprintSale,
  onRequestDeleteSale,
  onAddAuthorizedUser,
  onRequestDeleteAuthorizedUser,
}: InventoryDashboardProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('updated_desc');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchField, setSearchField] = useState<'all' | 'name' | 'barcode'>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [warehouseOpen, setWarehouseOpen] = useState<boolean>(false);
  const [reportsOpen, setReportsOpen] = useState<boolean>(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState<boolean>(false);
  const [newCategoryInput, setNewCategoryInput] = useState<string>('');
  const [addingCategory, setAddingCategory] = useState<boolean>(false);
  const [now, setNow] = useState<Date>(() => new Date());

  const shouldReduceMotion = useReducedMotion();
  const lastExternalSearchSeqRef = useRef<number>(externalSearch?.seq ?? 0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const profileDropdownRef = useRef<HTMLDivElement | null>(null);

  // Live clock ticking every second
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(e.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [profileMenuOpen]);

  // Focus search input when switching to Məhsul Axtarışı
  useEffect(() => {
    if (activeView === 'search') {
      window.setTimeout(() => searchInputRef.current?.focus(), 60);
    }
  }, [activeView]);

  useEffect(() => {
    if (!externalSearch || externalSearch.seq === lastExternalSearchSeqRef.current) {
      return;
    }
    lastExternalSearchSeqRef.current = externalSearch.seq;
    onChangeActiveView('search');
    setSelectedCategory('all');
    setStockFilter('all');
    setSearchField('all');
    setSearchQuery(externalSearch.code);
  }, [externalSearch, onChangeActiveView]);

  const allCategoryNames = useMemo(() => {
    const set = new Set<string>([
      ...DEFAULT_CATEGORIES,
      ...customCategories.map((c) => c.name),
      ...products.map((p) => p.category),
    ]);
    return Array.from(set);
  }, [customCategories, products]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      counts.set(p.category, (counts.get(p.category) || 0) + 1);
    }
    return counts;
  }, [products]);

  const metrics = useMemo(() => {
    let totalUnits = 0;
    let totalValue = 0;
    let lowOrOutCount = 0;

    for (const p of products) {
      totalUnits += p.quantity;
      totalValue += p.quantity * p.salePrice;
      const status = getStockStatus(p);
      if (status.tone === 'low' || status.tone === 'out') {
        lowOrOutCount += 1;
      }
    }

    let todaySalesRevenue = 0;
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    for (const s of sales) {
      const ms = s.soldAt?.toMillis?.() ?? 0;
      if (ms >= startOfToday) {
        todaySalesRevenue += s.totalAmount;
      }
    }

    return {
      skuCount: products.length,
      totalUnits,
      totalValue,
      lowOrOutCount,
      todaySalesRevenue,
    };
  }, [products, sales, now]);

  const latestSale = useMemo(() => {
    if (sales.length === 0) return null;
    return [...sales].sort((a, b) => {
      const aMs = a.soldAt?.toMillis?.() ?? 0;
      const bMs = b.soldAt?.toMillis?.() ?? 0;
      return bMs - aMs;
    })[0];
  }, [sales]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const result = products.filter((p) => {
      if (activeView === 'low_stock') {
        const status = getStockStatus(p);
        if (status.tone === 'ok') return false;
      }

      if (selectedCategory !== 'all' && p.category !== selectedCategory) {
        return false;
      }

      if (stockFilter !== 'all') {
        const status = getStockStatus(p);
        if (stockFilter === 'in_stock' && status.tone !== 'ok') return false;
        if (stockFilter === 'low_stock' && status.tone !== 'low') return false;
        if (stockFilter === 'out_of_stock' && status.tone !== 'out') return false;
      }

      if (q) {
        if (searchField === 'name') {
          if (!p.name.toLowerCase().includes(q)) return false;
        } else if (searchField === 'barcode') {
          if (!p.barcode.toLowerCase().includes(q)) return false;
        } else {
          const hay = `${p.name} ${p.barcode} ${p.brand || ''} ${p.category} ${
            p.shelfLocation || ''
          }`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
      }

      return true;
    });

    result.sort((a, b) => {
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name, 'az');
      }
      if (sortBy === 'qty_asc') {
        return a.quantity - b.quantity;
      }
      if (sortBy === 'price_desc') {
        return b.salePrice - a.salePrice;
      }
      const aTime = a.updatedAt?.toMillis?.() ?? 0;
      const bTime = b.updatedAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });

    return result;
  }, [products, activeView, selectedCategory, stockFilter, searchQuery, searchField, sortBy]);

  const handleCategorySubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryInput.trim().slice(0, FIELD_LIMITS.CATEGORY_MAX);
    if (!trimmed) return;
    setAddingCategory(true);
    try {
      await onAddCategory(trimmed);
      setNewCategoryInput('');
    } finally {
      setAddingCategory(false);
    }
  };

  const handleNavSelect = (view: ActiveView, category = 'all') => {
    onChangeActiveView(view);
    setSelectedCategory(category);
    if (view === 'inventory' || view === 'low_stock' || view === 'categories') {
      setWarehouseOpen(true);
    }
    if (view === 'sales') {
      setReportsOpen(true);
    }
    setMobileMenuOpen(false);
  };

  const isWarehouseActive =
    activeView === 'inventory' ||
    activeView === 'low_stock' ||
    activeView === 'categories';

  const headerMeta = useMemo(() => {
    switch (activeView) {
      case 'pos':
        return {
          title: 'Barkodla Satış',
          subtitle: 'Məhsulu barkodla oxudun və ya əl ilə əlavə edin',
          Icon: Barcode,
        };
      case 'home':
        return {
          title: 'Ana Səhifə',
          subtitle: 'Mağazanın ümumi anbar və satış icmalı',
          Icon: Home,
        };
      case 'search':
        return {
          title: 'Məhsul Axtarışı',
          subtitle: 'Məhsul adı və ya barkod üzrə sürətli axtarış və stok idarəsi',
          Icon: Search,
        };
      case 'inventory':
        return {
          title: selectedCategory === 'all' ? 'Anbar — Bütün Məhsullar' : selectedCategory,
          subtitle: 'Məhsul siyahısı, qiymətlər və real vaxt stok miqdarları',
          Icon: Package,
        };
      case 'low_stock':
        return {
          title: 'Azalan və Bitən Stok',
          subtitle: 'Təcili tədarük tələb edən məhsulların siyahısı',
          Icon: AlertCircle,
        };
      case 'categories':
        return {
          title: 'Kateqoriyalar',
          subtitle: 'Dəftərxana bölmələrini yaradın və idarə edin',
          Icon: FolderOpen,
        };
      case 'sales':
        return {
          title: 'Satış Hesabatı',
          subtitle: 'Tamamlanmış satışlar, çek tarixçəsi və gəlir analitikası',
          Icon: BarChart3,
        };
      case 'users':
        return {
          title: 'İstifadəçilər',
          subtitle: 'Mağaza sisteminə giriş icazəsi olan hesablar',
          Icon: Users,
        };
      case 'settings':
        return {
          title: 'Parametrlər',
          subtitle: 'Çek başlığı, Zyklen Z-604 printer və skaner tənzimləmələri',
          Icon: Settings,
        };
    }
  }, [activeView, selectedCategory]);

  const HeaderIcon = headerMeta.Icon;

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#13233F] text-white select-none">
      {/* Brand Block */}
      <div className="px-5 pt-5 pb-4 border-b border-white/10 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => handleNavSelect('pos')}
          className="flex items-center gap-3 text-left cursor-pointer"
        >
          <span className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center shrink-0">
            <ShoppingCart className="w-6 h-6 text-[#F59E0B]" />
          </span>
          <div className="leading-tight">
            <div className="text-xl font-extrabold tracking-tight text-white">
              Məktəbli
            </div>
            <div className="text-[11px] font-medium text-slate-300 mt-0.5">
              Dəftərxana Sistemi
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
          aria-label="Menyunu bağla"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <button
          type="button"
          onClick={() => handleNavSelect('home')}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
            activeView === 'home'
              ? 'bg-[#1D72F3] text-white shadow-sm'
              : 'text-slate-200 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Home className="w-4 h-4 shrink-0" />
          <span className="truncate">Ana Səhifə</span>
        </button>

        <button
          type="button"
          onClick={() => handleNavSelect('pos')}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
            activeView === 'pos'
              ? 'bg-[#1D72F3] text-white shadow-sm'
              : 'text-slate-200 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Barcode className="w-4 h-4 shrink-0" />
          <span className="truncate">Barkodla Satış</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMobileMenuOpen(false);
            onOpenSale();
          }}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg text-slate-200 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
        >
          <ShoppingCart className="w-4 h-4 shrink-0" />
          <span className="truncate">Satış Et</span>
        </button>

        <button
          type="button"
          onClick={() => handleNavSelect('search')}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
            activeView === 'search'
              ? 'bg-[#1D72F3] text-white shadow-sm'
              : 'text-slate-200 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="truncate">Məhsul Axtarışı</span>
        </button>

        {/* Expandable Anbar Group */}
        <div>
          <button
            type="button"
            onClick={() => {
              setWarehouseOpen((prev) => !prev);
              if (!isWarehouseActive) {
                handleNavSelect('inventory', 'all');
              }
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              isWarehouseActive
                ? 'bg-[#1D72F3] text-white shadow-sm'
                : 'text-slate-200 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-3 truncate">
              <Package className="w-4 h-4 shrink-0" />
              <span className="truncate">Anbar</span>
            </span>
            {warehouseOpen ? (
              <ChevronDown className="w-4 h-4 opacity-80 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 opacity-80 shrink-0" />
            )}
          </button>

          {warehouseOpen ? (
            <div className="mt-1 ml-4 pl-3 border-l border-white/15 space-y-1">
              <button
                type="button"
                onClick={() => handleNavSelect('inventory', 'all')}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeView === 'inventory' && selectedCategory === 'all'
                    ? 'bg-white/15 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="truncate">Bütün Məhsullar</span>
                <span className="font-mono tabular-nums opacity-80">
                  {products.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleNavSelect('low_stock', 'all')}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeView === 'low_stock'
                    ? 'bg-white/15 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="truncate">Azalan Stok</span>
                <span
                  className={`font-mono tabular-nums ${
                    metrics.lowOrOutCount > 0 ? 'text-amber-300' : 'opacity-80'
                  }`}
                >
                  {metrics.lowOrOutCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleNavSelect('categories', 'all')}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeView === 'categories'
                    ? 'bg-white/15 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="truncate">Kateqoriyalar</span>
                <span className="font-mono tabular-nums opacity-80">
                  {allCategoryNames.length}
                </span>
              </button>
            </div>
          ) : null}
        </div>

        {/* Expandable Hesabatlar Group */}
        <div>
          <button
            type="button"
            onClick={() => {
              setReportsOpen((prev) => !prev);
              handleNavSelect('sales');
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              activeView === 'sales'
                ? 'bg-[#1D72F3] text-white shadow-sm'
                : 'text-slate-200 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-3 truncate">
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span className="truncate">Hesabatlar</span>
            </span>
            {reportsOpen ? (
              <ChevronDown className="w-4 h-4 opacity-80 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 opacity-80 shrink-0" />
            )}
          </button>

          {reportsOpen ? (
            <div className="mt-1 ml-4 pl-3 border-l border-white/15 space-y-1">
              <button
                type="button"
                onClick={() => handleNavSelect('sales')}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeView === 'sales'
                    ? 'bg-white/15 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="truncate">Satış Hesabatı</span>
                <span className="font-mono tabular-nums opacity-80">
                  {sales.length}
                </span>
              </button>
            </div>
          ) : null}
        </div>

        {isAdmin ? (
          <button
            type="button"
            onClick={() => handleNavSelect('users')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              activeView === 'users'
                ? 'bg-[#1D72F3] text-white shadow-sm'
                : 'text-slate-200 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-3 truncate">
              <Users className="w-4 h-4 shrink-0" />
              <span className="truncate">İstifadəçilər</span>
            </span>
            <span className="font-mono tabular-nums text-xs opacity-75">
              {authorizedUsers.length + 1}
            </span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => handleNavSelect('settings')}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
            activeView === 'settings'
              ? 'bg-[#1D72F3] text-white shadow-sm'
              : 'text-slate-200 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span className="truncate">Parametrlər</span>
        </button>

        <button
          type="button"
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg text-slate-200 hover:bg-red-500/20 hover:text-red-200 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className="truncate">Çıxış</span>
        </button>
      </nav>

      {/* Bottom Slogan matching mockup */}
      <div className="px-5 py-5 border-t border-white/10 text-center">
        <p className="italic text-slate-300/90 text-sm leading-snug tracking-wide">
          Uğurlu biznes
          <br />
          üçün doğru sistem!
        </p>
      </div>
    </div>
  );

  const showInventoryList =
    activeView === 'search' ||
    activeView === 'inventory' ||
    activeView === 'low_stock';

  return (
    <div className="min-h-screen bg-[#F0F4F9] dark:bg-[#0B1120] flex transition-colors">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-60 xl:w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-64 max-w-[85vw] h-full">{sidebarContent}</div>
        </div>
      ) : null}

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar matching mockup */}
        <header className="sticky top-0 z-20 bg-white dark:bg-[#0F172A] border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-7 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              aria-label="Menyunu aç"
            >
              <Menu className="w-5 h-5" />
            </button>

            <span className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-[#13233F] dark:text-blue-400 hidden sm:inline-flex items-center justify-center shrink-0">
              <HeaderIcon className="w-6 h-6" />
            </span>

            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
                {headerMeta.title}
              </h1>
              {syncNotice ? (
                <p className="text-xs font-semibold text-[#05A660] dark:text-emerald-400 truncate">
                  {syncNotice}
                </p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block truncate">
                  {headerMeta.subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Right: Live Date, Live Clock, User Profile Dropdown */}
          <div className="flex items-center gap-3 sm:gap-5 shrink-0">
            <div className="hidden md:flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
              <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
              <span>{formatLiveDate(now)}</span>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
              <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
              <span>{formatLiveTime(now)}</span>
            </div>

            <div className="relative" ref={profileDropdownRef}>
              <button
                type="button"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <span className="w-8 h-8 rounded-full bg-[#1976F3]/15 text-[#1976F3] dark:text-blue-400 inline-flex items-center justify-center shrink-0">
                  <UserCircle2 className="w-5 h-5" />
                </span>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 hidden sm:inline max-w-[120px] truncate">
                  {isAdmin ? 'Admin' : userEmail.split('@')[0]}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </button>

              {profileMenuOpen ? (
                <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-2 z-30">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {isAdmin ? 'Mağaza Administratoru' : 'Kassir / İstifadəçi'}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {userEmail}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      handleNavSelect('settings');
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Parametrlər</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleTheme();
                      setProfileMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                  >
                    {theme === 'dark' ? (
                      <>
                        <Sun className="w-4 h-4 text-amber-400" />
                        <span>Gündüz rejimi</span>
                      </>
                    ) : (
                      <>
                        <Moon className="w-4 h-4 text-[#1976F3]" />
                        <span>Gecə rejimi</span>
                      </>
                    )}
                  </button>
                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="w-full px-4 py-2 text-left text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Çıxış</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {/* Workspace Main Body */}
        <main className="flex-1 px-4 sm:px-6 lg:px-7 py-5 max-w-[1440px] w-full mx-auto space-y-5">
          {activeView === 'pos' ? (
            <PosWorkspace
              products={products}
              receiptSettings={receiptSettings}
              externalScan={externalPosScan}
              hasBlockingModal={hasBlockingModal}
              hasPastSales={Boolean(latestSale)}
              onConfirmCheckout={onConfirmCheckout}
              onOpenCameraScanner={() => onOpenQuickScanner('camera', 'pos')}
              onCreateMissingProduct={onCreateMissingProductFromPos}
              onOpenReceiptPreview={onOpenReceiptPreview}
              onReprintLatestSale={
                latestSale ? () => onReprintSale(latestSale) : undefined
              }
            />
          ) : activeView === 'settings' ? (
            <SettingsPanel
              receiptSettings={receiptSettings}
              theme={theme}
              onToggleTheme={onToggleTheme}
              onSaveReceiptSettings={onSaveReceiptSettings}
            />
          ) : activeView === 'users' && isAdmin ? (
            <AuthorizedUsersPanel
              authorizedUsers={authorizedUsers}
              onAddUser={onAddAuthorizedUser}
              onRequestDeleteUser={onRequestDeleteAuthorizedUser}
            />
          ) : activeView === 'sales' ? (
            <SalesReportModule
              sales={sales}
              loading={loading}
              onOpenSaleModal={() => handleNavSelect('pos')}
              onOpenReceiptSettings={onOpenReceiptSettings}
              onReprintSale={onReprintSale}
              onRequestDeleteSale={onRequestDeleteSale}
            />
          ) : activeView === 'categories' ? (
            <section className="space-y-6">
              <div className="bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 shadow-xs">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                  Yeni kateqoriya əlavə et
                </h2>
                <form onSubmit={handleCategorySubmit} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newCategoryInput}
                    maxLength={FIELD_LIMITS.CATEGORY_MAX}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    placeholder="Məs: Rəsm Ləvazımatları"
                    className="flex-1 px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
                  />
                  <button
                    type="submit"
                    disabled={addingCategory || !newCategoryInput.trim()}
                    className="px-5 py-2.5 text-xs font-semibold text-white bg-[#1976F3] hover:bg-[#1565D8] disabled:opacity-50 rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    {addingCategory ? 'Əlavə edilir...' : 'Əlavə et'}
                  </button>
                </form>
              </div>

              <div className="bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Mövcud kateqoriyalar
                  </h2>
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {allCategoryNames.length} ədəd
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {allCategoryNames.map((name) => {
                    const customDoc = customCategories.find((c) => c.name === name);
                    const count = categoryCounts.get(name) || 0;
                    return (
                      <div
                        key={name}
                        className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            <span className="font-mono tabular-nums">{count}</span> məhsul
                            <span className="mx-1.5" aria-hidden="true">
                              ·
                            </span>
                            <span>{customDoc ? 'Xüsusi kateqoriya' : 'Standart kateqoriya'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleNavSelect('inventory', name)}
                            className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                          >
                            Məhsullara bax
                          </button>
                          {customDoc ? (
                            <button
                              type="button"
                              onClick={() => onDeleteCategory(customDoc)}
                              className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg cursor-pointer"
                              aria-label={`${name} kateqoriyasını sil`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : activeView === 'home' ? (
            <>
              {/* Quick Actions Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleNavSelect('pos')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#1976F3] hover:bg-[#1565D8] rounded-xl shadow-xs cursor-pointer"
                  >
                    <Barcode className="w-4 h-4" />
                    <span>Barkodla Satışa Keç</span>
                  </button>
                  <button
                    type="button"
                    onClick={onOpenNewProduct}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#05A660] hover:bg-[#048C50] rounded-xl shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Yeni məhsul</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavSelect('inventory', 'all')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                  >
                    <Package className="w-4 h-4" />
                    <span>Anbar siyahısı</span>
                  </button>
                </div>
              </div>

              {/* 5-Column Flat KPI Strip */}
              <section
                aria-label="Anbar göstəriciləri"
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl divide-y lg:divide-y-0 divide-x divide-slate-200 dark:divide-slate-800 overflow-hidden shadow-xs"
              >
                <div className="p-4 sm:p-5">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Ümumi məhsul çeşidi
                  </div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums mt-1">
                    {metrics.skuCount}
                  </div>
                </div>
                <div className="p-4 sm:p-5">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Anbardakı cəmi say
                  </div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums mt-1">
                    {metrics.totalUnits}
                  </div>
                </div>
                <div className="p-4 sm:p-5 bg-blue-50/40 dark:bg-blue-950/30">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Ümumi anbar dəyəri
                  </div>
                  <div className="text-2xl font-bold text-[#1976F3] dark:text-blue-400 font-mono tabular-nums mt-1">
                    {formatPrice(metrics.totalValue)}
                  </div>
                </div>
                <div className="p-4 sm:p-5 bg-emerald-50/45 dark:bg-emerald-950/25">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Bugünkü satış
                  </div>
                  <div className="text-2xl font-bold text-[#05A660] dark:text-emerald-400 font-mono tabular-nums mt-1">
                    {formatPrice(metrics.todaySalesRevenue)}
                  </div>
                </div>
                <div
                  className={`p-4 sm:p-5 col-span-2 md:col-span-1 ${
                    metrics.lowOrOutCount > 0
                      ? 'bg-amber-50/60 dark:bg-amber-950/30'
                      : 'bg-slate-50/60 dark:bg-slate-900/40'
                  }`}
                >
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Azalan / Bitən çeşid
                  </div>
                  <div
                    className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
                      metrics.lowOrOutCount > 0
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-[#05A660] dark:text-emerald-400'
                    }`}
                  >
                    {metrics.lowOrOutCount}
                  </div>
                </div>
              </section>

              <CategoryValueChart
                products={products}
                loading={loading}
                selectedCategory={selectedCategory}
                onSelectCategory={(cat) => {
                  setSelectedCategory(cat);
                  onChangeActiveView('inventory');
                }}
              />

              <SalesReportModule
                sales={sales}
                loading={loading}
                compact
                onOpenFullReport={() => handleNavSelect('sales', 'all')}
                onOpenSaleModal={() => handleNavSelect('pos')}
                onOpenReceiptSettings={onOpenReceiptSettings}
                onReprintSale={onReprintSale}
                onRequestDeleteSale={onRequestDeleteSale}
              />
            </>
          ) : showInventoryList ? (
            <>
              {/* Inventory Top Action Strip */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onOpenNewProduct}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1976F3] hover:bg-[#1565D8] rounded-lg shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Yeni məhsul</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenQuickScanner('camera', 'lookup')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#131C31] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-[#1976F3] dark:text-blue-400" />
                    <span>Kamera ilə barkod oxu</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenQuickScanner('gallery', 'lookup')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#131C31] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <ImagePlus className="w-4 h-4 text-[#1976F3] dark:text-blue-400" />
                    <span>Qalereyadan oxu</span>
                  </button>
                </div>

                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  aria-label="Kateqoriya filtri"
                  className="px-3 py-2 bg-white dark:bg-[#131C31] border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
                >
                  <option value="all">Bütün kateqoriyalar</option>
                  {allCategoryNames.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat} ({categoryCounts.get(cat) || 0})
                    </option>
                  ))}
                </select>
              </div>

              {/* Search & Filter Panel */}
              <section
                aria-label="Məhsul axtarış paneli"
                className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-xs"
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={
                        searchField === 'barcode'
                          ? 'Barkod nömrəsi ilə axtar (məs: 4760012345678)...'
                          : searchField === 'name'
                          ? 'Məhsulun adı ilə axtar (məs: A4 kağız, qələm)...'
                          : 'Məhsulun adı və ya barkodu ilə axtar...'
                      }
                      aria-label="Məhsul adı və ya barkod üzrə axtarış"
                      className="w-full pl-10 pr-24 py-2.5 bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
                    />
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {searchQuery ? (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          title="Axtarışı təmizlə"
                          aria-label="Axtarışı təmizlə"
                          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-md cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onOpenQuickScanner('camera', 'lookup')}
                        title="Kamera ilə barkod axtar"
                        aria-label="Kamera ilə barkod axtar"
                        className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-[#1976F3] dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-md cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Search Field Scope Selector */}
                  <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg shrink-0 self-start lg:self-auto">
                    {(
                      [
                        { id: 'all', label: 'Ad və Barkod' },
                        { id: 'name', label: 'Yalnız Ad' },
                        { id: 'barcode', label: 'Yalnız Barkod' },
                      ] as const
                    ).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setSearchField(mode.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                          searchField === mode.id
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg overflow-x-auto">
                      {(
                        [
                          { id: 'all', label: 'Hamısı' },
                          { id: 'in_stock', label: 'Stokda' },
                          { id: 'low_stock', label: 'Az qalıb' },
                          { id: 'out_of_stock', label: 'Bitib' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setStockFilter(tab.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                            stockFilter === tab.id
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      aria-label="Sıralama"
                      className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1976F3]"
                    >
                      <option value="updated_desc">Son yenilənənlər</option>
                      <option value="name_asc">Ada görə (A–Z)</option>
                      <option value="qty_asc">Stok (azdan çoxa)</option>
                      <option value="price_desc">Qiymət (yüksəkdən aşağı)</option>
                    </select>
                  </div>

                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums whitespace-nowrap">
                    Nəticə: {filteredProducts.length} / {products.length} məhsul
                  </div>
                </div>
              </section>

              {/* Product List: Loading / Empty / Populated */}
              {loading ? (
                <div className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
                  {[1, 2, 3, 4].map((row) => (
                    <div key={row} className="p-4 flex items-center justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                        <div className="h-3 w-32 bg-slate-100 dark:bg-slate-800/70 rounded animate-pulse" />
                      </div>
                      <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                      <div className="h-7 w-20 bg-slate-100 dark:bg-slate-800/70 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-4">
                  <Barcode className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {products.length === 0
                        ? 'Hələ heç bir məhsul əlavə edilməyib'
                        : 'Axtarışa uyğun məhsul tapılmadı'}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      {products.length === 0
                        ? 'Mağazanızdakı ofis ləvazımatlarının barkodunu skan edərək ilk məhsulu əlavə edin.'
                        : 'Axtarış sözünü dəyişin və ya filtrləri sıfırlayın.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    {products.length === 0 ? (
                      <button
                        type="button"
                        onClick={onOpenNewProduct}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#1976F3] hover:bg-[#1565D8] rounded-lg cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>İlk məhsulu əlavə et</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setStockFilter('all');
                          setSelectedCategory('all');
                          onChangeActiveView('inventory');
                        }}
                        className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                      >
                        Filtrləri sıfırla
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Desktop High-Density Animated Table */}
                  <div className="hidden md:block bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-[#F3F6FA] dark:bg-slate-900/70 text-xs font-semibold text-slate-600 dark:text-slate-300">
                            <th className="py-3 px-4">Məhsul</th>
                            <th className="py-3 px-4">Barkod</th>
                            <th className="py-3 px-4">Kateqoriya</th>
                            <th className="py-3 px-4">Stok</th>
                            <th className="py-3 px-4 text-right">Satış qiyməti</th>
                            <th className="py-3 px-4">Vəziyyət</th>
                            <th className="py-3 px-4 text-right">Əməliyyat</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                          <AnimatePresence initial>
                            {filteredProducts.map((product, index) => {
                              const status = getStockStatus(product);
                              const staggerDelay = shouldReduceMotion
                                ? 0
                                : Math.min(index * 0.03, 0.36);
                              return (
                                <motion.tr
                                  key={product.id}
                                  initial={
                                    shouldReduceMotion ? false : { opacity: 0, y: 10 }
                                  }
                                  animate={{
                                    opacity: 1,
                                    y: 0,
                                    transition: {
                                      duration: shouldReduceMotion ? 0 : 0.24,
                                      delay: staggerDelay,
                                      ease: [0.22, 1, 0.36, 1],
                                    },
                                  }}
                                  exit={
                                    shouldReduceMotion
                                      ? { opacity: 0, transition: { duration: 0 } }
                                      : {
                                          opacity: 0,
                                          x: -16,
                                          transition: { duration: 0.18, ease: 'easeIn' },
                                        }
                                  }
                                  className="hover:bg-blue-50/45 dark:hover:bg-slate-800/60 hover:shadow-md hover:shadow-slate-900/5 dark:hover:shadow-black/30 transition-[background-color,box-shadow] duration-200 ease-out"
                                >
                                  <td className="py-3 px-4 max-w-[280px]">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <ProductThumb
                                        name={product.name}
                                        category={product.category}
                                        sizeClassName="w-10 h-10"
                                        imgClassName="w-8 h-8"
                                      />
                                      <div className="min-w-0">
                                        <button
                                          type="button"
                                          onClick={() => onOpenEditProduct(product)}
                                          className="text-left font-semibold text-slate-900 dark:text-slate-100 hover:text-[#1976F3] dark:hover:text-blue-400 truncate block w-full cursor-pointer"
                                        >
                                          {product.name}
                                        </button>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                          {[product.brand, product.shelfLocation]
                                            .filter(Boolean)
                                            .join(' · ') || '—'}
                                        </div>
                                      </div>
                                    </div>
                                  </td>

                                  <td className="py-3 px-4">
                                    <div className="font-mono tabular-nums text-xs font-medium text-slate-800 dark:text-slate-200">
                                      {product.barcode}
                                    </div>
                                    <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                      {product.barcodeFormat}
                                    </div>
                                  </td>

                                  <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                    {product.category}
                                  </td>

                                  <td className="py-3 px-4">
                                    <div className="inline-flex items-center gap-1.5">
                                      <div className="inline-flex items-center border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900">
                                        <button
                                          type="button"
                                          onClick={() => onQuickAdjustQuantity(product, -1)}
                                          disabled={product.quantity <= 0}
                                          className="px-2 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                                          aria-label="Stoku 1 azalt"
                                        >
                                          <Minus className="w-3.5 h-3.5" />
                                        </button>
                                        <span className="px-2.5 py-1 font-mono tabular-nums text-xs font-semibold text-slate-900 dark:text-slate-100 min-w-[2.5rem] text-center">
                                          {product.quantity}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => onQuickAdjustQuantity(product, 1)}
                                          className="px-2 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                          aria-label="Stoku 1 artır"
                                        >
                                          <Plus className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      <span className="text-xs text-slate-500 dark:text-slate-400">
                                        {product.unit}
                                      </span>
                                    </div>
                                  </td>

                                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                    {formatPrice(product.salePrice)}
                                  </td>

                                  <td className="py-3 px-4 whitespace-nowrap">
                                    {status.tone === 'ok' ? (
                                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#05A660] dark:text-emerald-400">
                                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                        <span>{status.label}</span>
                                      </span>
                                    ) : status.tone === 'low' ? (
                                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                        <span>{status.label}</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
                                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                        <span>{status.label}</span>
                                      </span>
                                    )}
                                  </td>

                                  <td className="py-3 px-4 text-right whitespace-nowrap">
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => onOpenEditProduct(product)}
                                        className="p-2 text-slate-500 dark:text-slate-400 hover:text-[#1976F3] dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-lg cursor-pointer"
                                        aria-label={`${product.name} redaktə et`}
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onRequestDeleteProduct(product)}
                                        className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg cursor-pointer"
                                        aria-label={`${product.name} sil`}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                </motion.tr>
                              );
                            })}
                          </AnimatePresence>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile Animated Product Cards */}
                  <div className="md:hidden space-y-3">
                    <AnimatePresence mode="popLayout" initial>
                      {filteredProducts.map((product, index) => {
                        const status = getStockStatus(product);
                        const staggerDelay = shouldReduceMotion
                          ? 0
                          : Math.min(index * 0.035, 0.36);
                        return (
                          <motion.div
                            key={product.id}
                            layout={!shouldReduceMotion}
                            initial={
                              shouldReduceMotion
                                ? false
                                : { opacity: 0, y: 12, scale: 0.98 }
                            }
                            animate={{
                              opacity: 1,
                              y: 0,
                              scale: 1,
                              transition: {
                                duration: shouldReduceMotion ? 0 : 0.26,
                                delay: staggerDelay,
                                ease: [0.22, 1, 0.36, 1],
                              },
                            }}
                            exit={
                              shouldReduceMotion
                                ? { opacity: 0, transition: { duration: 0 } }
                                : {
                                    opacity: 0,
                                    scale: 0.96,
                                    y: -8,
                                    transition: { duration: 0.18, ease: 'easeIn' },
                                  }
                            }
                            whileHover={
                              shouldReduceMotion
                                ? undefined
                                : {
                                    scale: 1.015,
                                    transition: { duration: 0.18, ease: 'easeOut' },
                                  }
                            }
                            className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 transition-[box-shadow,border-color] duration-200 ease-out hover:shadow-lg hover:shadow-slate-900/10 dark:hover:shadow-black/45 hover:border-blue-300/80 dark:hover:border-blue-700/70"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <ProductThumb
                                  name={product.name}
                                  category={product.category}
                                  sizeClassName="w-10 h-10"
                                  imgClassName="w-8 h-8"
                                />
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => onOpenEditProduct(product)}
                                    className="text-left text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-[#1976F3] dark:hover:text-blue-400 cursor-pointer"
                                  >
                                    {product.name}
                                  </button>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    {product.category}
                                    {product.brand ? ` · ${product.brand}` : ''}
                                    {product.shelfLocation ? ` · ${product.shelfLocation}` : ''}
                                  </div>
                                </div>
                              </div>
                              <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                                {formatPrice(product.salePrice)}
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                                {product.barcode}
                              </span>
                              {status.tone === 'ok' ? (
                                <span className="inline-flex items-center gap-1 font-medium text-[#05A660] dark:text-emerald-400">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{status.label}</span>
                                </span>
                              ) : status.tone === 'low' ? (
                                <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  <span>{status.label}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-400">
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  <span>{status.label}</span>
                                </span>
                              )}
                            </div>

                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                              <div className="inline-flex items-center gap-1.5">
                                <div className="inline-flex items-center border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900">
                                  <button
                                    type="button"
                                    onClick={() => onQuickAdjustQuantity(product, -1)}
                                    disabled={product.quantity <= 0}
                                    className="px-3 py-2 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                                    aria-label="Stoku 1 azalt"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                  <span className="px-3 py-2 font-mono tabular-nums text-xs font-semibold text-slate-900 dark:text-slate-100">
                                    {product.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => onQuickAdjustQuantity(product, 1)}
                                    className="px-3 py-2 text-slate-700 dark:text-slate-300 cursor-pointer"
                                    aria-label="Stoku 1 artır"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </div>
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  {product.unit}
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => onOpenEditProduct(product)}
                                  className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                  Redaktə
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRequestDeleteProduct(product)}
                                  className="p-2 text-red-700 dark:text-red-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 cursor-pointer"
                                  aria-label="Sil"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
