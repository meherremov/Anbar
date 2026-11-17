import {
  AlertCircle,
  Barcode,
  Camera,
  CheckCircle2,
  FolderOpen,
  ImagePlus,
  LogOut,
  Menu,
  Minus,
  Package,
  Pencil,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import {
  DEFAULT_CATEGORIES,
  FIELD_LIMITS,
  type ActiveView,
  type AuthorizedUser,
  type CategoryItem,
  type Product,
  type SaleRecord,
  type SortOption,
  type StockFilter,
} from '../types/inventory';
import { AuthorizedUsersPanel } from './AuthorizedUsersPanel';
import { CategoryValueChart } from './CategoryValueChart';
import { SalesReportModule } from './SalesReportModule';

interface InventoryDashboardProps {
  userEmail: string;
  isAdmin: boolean;
  products: Product[];
  customCategories: CategoryItem[];
  sales: SaleRecord[];
  authorizedUsers: AuthorizedUser[];
  loading: boolean;
  syncNotice: string | null;
  onSignOut: () => void;
  onOpenNewProduct: () => void;
  onOpenEditProduct: (product: Product) => void;
  onOpenQuickScanner: (tab: 'camera' | 'gallery') => void;
  onOpenSale: () => void;
  onQuickAdjustQuantity: (product: Product, delta: number) => Promise<void>;
  onRequestDeleteProduct: (product: Product) => void;
  onAddCategory: (name: string) => Promise<void>;
  onDeleteCategory: (cat: CategoryItem) => void;
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
  return `${val.toFixed(2)} ₼`;
}

export function InventoryDashboard({
  userEmail,
  isAdmin,
  products,
  customCategories,
  sales,
  authorizedUsers,
  loading,
  syncNotice,
  onSignOut,
  onOpenNewProduct,
  onOpenEditProduct,
  onOpenQuickScanner,
  onOpenSale,
  onQuickAdjustQuantity,
  onRequestDeleteProduct,
  onAddCategory,
  onDeleteCategory,
  onRequestDeleteSale,
  onAddAuthorizedUser,
  onRequestDeleteAuthorizedUser,
}: InventoryDashboardProps) {
  const [activeView, setActiveView] = useState<ActiveView>('inventory');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('updated_desc');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchField, setSearchField] = useState<'all' | 'name' | 'barcode'>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [newCategoryInput, setNewCategoryInput] = useState<string>('');
  const [addingCategory, setAddingCategory] = useState<boolean>(false);

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

    return {
      skuCount: products.length,
      totalUnits,
      totalValue,
      lowOrOutCount,
    };
  }, [products]);

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
    setActiveView(view);
    setSelectedCategory(category);
    setMobileMenuOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="px-5 py-5 border-b border-slate-200 flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
          Ofis Anbarı
        </span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
          aria-label="Menyunu bağla"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => handleNavSelect('inventory', 'all')}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              activeView === 'inventory' && selectedCategory === 'all'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <Package className="w-4 h-4 shrink-0" />
              <span className="truncate">Bütün Məhsullar</span>
            </span>
            <span className="font-mono tabular-nums text-xs opacity-80">
              {products.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleNavSelect('low_stock', 'all')}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              activeView === 'low_stock'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate">Azalan Stok</span>
            </span>
            <span className="font-mono tabular-nums text-xs opacity-80">
              {metrics.lowOrOutCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleNavSelect('categories', 'all')}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              activeView === 'categories'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <FolderOpen className="w-4 h-4 shrink-0" />
              <span className="truncate">Kateqoriyalar</span>
            </span>
            <span className="font-mono tabular-nums text-xs opacity-80">
              {allCategoryNames.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleNavSelect('sales', 'all')}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              activeView === 'sales'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <Receipt className="w-4 h-4 shrink-0" />
              <span className="truncate">Satış Hesabatı</span>
            </span>
            <span className="font-mono tabular-nums text-xs opacity-80">
              {sales.length}
            </span>
          </button>

          {isAdmin ? (
            <button
              type="button"
              onClick={() => handleNavSelect('users', 'all')}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                activeView === 'users'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <Users className="w-4 h-4 shrink-0" />
                <span className="truncate">İcazəli hesablar</span>
              </span>
              <span className="font-mono tabular-nums text-xs opacity-80">
                {authorizedUsers.length + 1}
              </span>
            </button>
          ) : null}
        </div>

        <div className="pt-4 border-t border-slate-200">
          <div className="px-3 mb-2 text-xs font-semibold text-slate-500">
            Kateqoriyaya görə
          </div>
          <div className="space-y-0.5">
            {allCategoryNames.map((cat) => {
              const count = categoryCounts.get(cat) || 0;
              const isSelected = activeView === 'inventory' && selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleNavSelect('inventory', cat)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 text-blue-800'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="truncate">{cat}</span>
                  <span className="font-mono tabular-nums text-slate-400 ml-2">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-3">
        <div className="text-xs text-slate-500 truncate" title={userEmail}>
          {userEmail}
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Hesabdan çıx</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-72 max-w-[85vw] h-full">{sidebarContent}</div>
        </div>
      ) : null}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
              aria-label="Menyunu aç"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">
                {activeView === 'categories'
                  ? 'Kateqoriyalar'
                  : activeView === 'sales'
                  ? 'Satış Hesabatı'
                  : activeView === 'users' && isAdmin
                  ? 'İcazəli hesablar'
                  : activeView === 'low_stock'
                  ? 'Azalan və Bitən Stok'
                  : selectedCategory === 'all'
                  ? 'Bütün Məhsullar'
                  : selectedCategory}
              </h1>
              {syncNotice ? (
                <p className="text-xs text-emerald-700 truncate">{syncNotice}</p>
              ) : (
                <p className="text-xs text-slate-500 hidden sm:block truncate">
                  Daxil edilən bütün məlumatlar avtomatik olaraq buludda yadda saxlanılır
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenSale}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Satış et</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenQuickScanner('camera')}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Camera className="w-4 h-4 text-blue-700" />
              <span className="hidden sm:inline">Barkod oxu</span>
              <span className="sm:hidden">Skan</span>
            </button>
            <button
              type="button"
              onClick={onOpenNewProduct}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni məhsul</span>
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-7xl w-full mx-auto">
          {activeView === 'users' && isAdmin ? (
            <AuthorizedUsersPanel
              authorizedUsers={authorizedUsers}
              onAddUser={onAddAuthorizedUser}
              onRequestDeleteUser={onRequestDeleteAuthorizedUser}
            />
          ) : activeView === 'sales' ? (
            <SalesReportModule
              sales={sales}
              loading={loading}
              onOpenSaleModal={onOpenSale}
              onRequestDeleteSale={onRequestDeleteSale}
            />
          ) : activeView === 'categories' ? (
            <section className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">
                  Yeni kateqoriya əlavə et
                </h2>
                <form onSubmit={handleCategorySubmit} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newCategoryInput}
                    maxLength={FIELD_LIMITS.CATEGORY_MAX}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    placeholder="Məs: Rəsm Ləvazimatları"
                    className="flex-1 px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="submit"
                    disabled={addingCategory || !newCategoryInput.trim()}
                    className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    {addingCategory ? 'Əlavə edilir...' : 'Əlavə et'}
                  </button>
                </form>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Mövcud kateqoriyalar</h2>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {allCategoryNames.length} ədəd
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {allCategoryNames.map((name) => {
                    const customDoc = customCategories.find((c) => c.name === name);
                    const count = categoryCounts.get(name) || 0;
                    return (
                      <div
                        key={name}
                        className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
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
                            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer"
                          >
                            Məhsullara bax
                          </button>
                          {customDoc ? (
                            <button
                              type="button"
                              onClick={() => onDeleteCategory(customDoc)}
                              className="p-2 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer"
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
          ) : (
            <>
              {/* 4-Column Flat KPI Strip */}
              <section
                aria-label="Anbar göstəriciləri"
                className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y lg:divide-y-0 divide-x divide-slate-200 overflow-hidden"
              >
                <div className="p-4 sm:p-5">
                  <div className="text-xs text-slate-500">Ümumi məhsul çeşidi</div>
                  <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                    {metrics.skuCount}
                  </div>
                </div>
                <div className="p-4 sm:p-5">
                  <div className="text-xs text-slate-500">Anbardakı cəmi say</div>
                  <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                    {metrics.totalUnits}
                  </div>
                </div>
                <div className="p-4 sm:p-5">
                  <div className="text-xs text-slate-500">Ümumi satış dəyəri</div>
                  <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                    {formatPrice(metrics.totalValue)}
                  </div>
                </div>
                <div className="p-4 sm:p-5">
                  <div className="text-xs text-slate-500">Azalan / Bitən çeşid</div>
                  <div
                    className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
                      metrics.lowOrOutCount > 0 ? 'text-amber-700' : 'text-slate-900'
                    }`}
                  >
                    {metrics.lowOrOutCount}
                  </div>
                </div>
              </section>

              {/* Category Value Pie Chart above inventory list */}
              <CategoryValueChart
                products={products}
                loading={loading}
                selectedCategory={selectedCategory}
                onSelectCategory={(cat) => setSelectedCategory(cat)}
              />

              {/* Search & Filter Panel directly above Product List */}
              <section
                aria-label="Məhsul axtarış paneli"
                className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
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
                      className="w-full pl-10 pr-28 py-2.5 bg-slate-50 focus:bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                    />
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {searchQuery ? (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          title="Axtarışı təmizlə"
                          aria-label="Axtarışı təmizlə"
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 rounded-md cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onOpenQuickScanner('camera')}
                        title="Kamera ilə barkod axtar"
                        aria-label="Kamera ilə barkod axtar"
                        className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-md cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenQuickScanner('gallery')}
                        title="Qalereya şəkli ilə barkod axtar"
                        aria-label="Qalereya şəkli ilə barkod axtar"
                        className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-md cursor-pointer"
                      >
                        <ImagePlus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Search Field Scope Selector */}
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0 self-start lg:self-auto">
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
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
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
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
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
                      className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="updated_desc">Son yenilənənlər</option>
                      <option value="name_asc">Ada görə (A–Z)</option>
                      <option value="qty_asc">Stok (azdan çoxa)</option>
                      <option value="price_desc">Qiymət (yüksəkdən aşağı)</option>
                    </select>
                  </div>

                  <div className="text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                    Nəticə: {filteredProducts.length} / {products.length} məhsul
                  </div>
                </div>
              </section>

              {/* Data View: Loading / Empty / Populated */}
              {loading ? (
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {[1, 2, 3, 4].map((row) => (
                    <div key={row} className="p-4 flex items-center justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
                        <div className="h-3 w-32 bg-slate-100 rounded animate-pulse" />
                      </div>
                      <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
                      <div className="h-7 w-20 bg-slate-100 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
                  <Barcode className="w-10 h-10 text-slate-300 mx-auto" />
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-slate-900">
                      {products.length === 0
                        ? 'Hələ heç bir məhsul əlavə edilməyib'
                        : 'Axtarışa uyğun məhsul tapılmadı'}
                    </h2>
                    <p className="text-sm text-slate-500 max-w-md mx-auto">
                      {products.length === 0
                        ? 'Mağazanızdakı ofis ləvazımatlarının barkodunu kamera və ya qalereyadan oxudaraq ilk məhsulu əlavə edin.'
                        : 'Axtarış sözünü dəyişin və ya filtrləri sıfırlayın.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    {products.length === 0 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onOpenQuickScanner('camera')}
                          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                        >
                          <Camera className="w-4 h-4 text-blue-700" />
                          <span>Kamera ilə barkod oxu</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenQuickScanner('gallery')}
                          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                        >
                          <ImagePlus className="w-4 h-4 text-blue-700" />
                          <span>Qalereyadan şəkil seç</span>
                        </button>
                        <button
                          type="button"
                          onClick={onOpenNewProduct}
                          className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>İlk məhsulu əlavə et</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setStockFilter('all');
                          setSelectedCategory('all');
                          setActiveView('inventory');
                        }}
                        className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                      >
                        Filtrləri sıfırla
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Desktop High-Density Table */}
                  <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                            <th className="py-3 px-4">Məhsul</th>
                            <th className="py-3 px-4">Barkod</th>
                            <th className="py-3 px-4">Kateqoriya</th>
                            <th className="py-3 px-4">Stok</th>
                            <th className="py-3 px-4 text-right">Satış qiyməti</th>
                            <th className="py-3 px-4">Vəziyyət</th>
                            <th className="py-3 px-4 text-right">Əməliyyat</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {filteredProducts.map((product) => {
                            const status = getStockStatus(product);
                            return (
                              <tr
                                key={product.id}
                                className="hover:bg-slate-50/80 transition-colors"
                              >
                                <td className="py-3 px-4 max-w-[260px]">
                                  <button
                                    type="button"
                                    onClick={() => onOpenEditProduct(product)}
                                    className="text-left font-medium text-slate-900 hover:text-blue-700 truncate block w-full cursor-pointer"
                                  >
                                    {product.name}
                                  </button>
                                  <div className="text-xs text-slate-500 truncate mt-0.5">
                                    {[product.brand, product.shelfLocation]
                                      .filter(Boolean)
                                      .join(' · ') || '—'}
                                  </div>
                                </td>

                                <td className="py-3 px-4">
                                  <div className="font-mono tabular-nums text-xs font-medium text-slate-800">
                                    {product.barcode}
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    {product.barcodeFormat}
                                  </div>
                                </td>

                                <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                                  {product.category}
                                </td>

                                <td className="py-3 px-4">
                                  <div className="inline-flex items-center gap-1.5">
                                    <div className="inline-flex items-center border border-slate-200 rounded-md bg-white">
                                      <button
                                        type="button"
                                        onClick={() => onQuickAdjustQuantity(product, -1)}
                                        disabled={product.quantity <= 0}
                                        className="px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                                        aria-label="Stoku 1 azalt"
                                      >
                                        <Minus className="w-3.5 h-3.5" />
                                      </button>
                                      <span className="px-2.5 py-1 font-mono tabular-nums text-xs font-semibold text-slate-900 min-w-[2.5rem] text-center">
                                        {product.quantity}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => onQuickAdjustQuantity(product, 1)}
                                        className="px-2 py-1 text-slate-600 hover:bg-slate-100 cursor-pointer"
                                        aria-label="Stoku 1 artır"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <span className="text-xs text-slate-500">{product.unit}</span>
                                  </div>
                                </td>

                                <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                                  {formatPrice(product.salePrice)}
                                </td>

                                <td className="py-3 px-4 whitespace-nowrap">
                                  {status.tone === 'ok' ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                      <span>{status.label}</span>
                                    </span>
                                  ) : status.tone === 'low' ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                      <span>{status.label}</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
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
                                      className="p-2 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer"
                                      aria-label={`${product.name} redaktə et`}
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onRequestDeleteProduct(product)}
                                      className="p-2 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer"
                                      aria-label={`${product.name} sil`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile Card List */}
                  <div className="md:hidden space-y-3">
                    {filteredProducts.map((product) => {
                      const status = getStockStatus(product);
                      return (
                        <div
                          key={product.id}
                          className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onOpenEditProduct(product)}
                                className="text-left text-sm font-semibold text-slate-900 hover:text-blue-700 cursor-pointer"
                              >
                                {product.name}
                              </button>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {product.category}
                                {product.brand ? ` · ${product.brand}` : ''}
                                {product.shelfLocation ? ` · ${product.shelfLocation}` : ''}
                              </div>
                            </div>
                            <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 whitespace-nowrap">
                              {formatPrice(product.salePrice)}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-mono tabular-nums text-slate-700">
                              {product.barcode}
                            </span>
                            {status.tone === 'ok' ? (
                              <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{status.label}</span>
                              </span>
                            ) : status.tone === 'low' ? (
                              <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                                <AlertCircle className="w-3.5 h-3.5" />
                                <span>{status.label}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-medium text-red-700">
                                <AlertCircle className="w-3.5 h-3.5" />
                                <span>{status.label}</span>
                              </span>
                            )}
                          </div>

                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
                            <div className="inline-flex items-center gap-1.5">
                              <div className="inline-flex items-center border border-slate-200 rounded-lg bg-slate-50">
                                <button
                                  type="button"
                                  onClick={() => onQuickAdjustQuantity(product, -1)}
                                  disabled={product.quantity <= 0}
                                  className="px-3 py-2 text-slate-700 disabled:opacity-40 cursor-pointer"
                                  aria-label="Stoku 1 azalt"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="px-3 py-2 font-mono tabular-nums text-xs font-semibold text-slate-900">
                                  {product.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onQuickAdjustQuantity(product, 1)}
                                  className="px-3 py-2 text-slate-700 cursor-pointer"
                                  aria-label="Stoku 1 artır"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                              <span className="text-xs text-slate-500">{product.unit}</span>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onOpenEditProduct(product)}
                                className="px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                              >
                                Redaktə
                              </button>
                              <button
                                type="button"
                                onClick={() => onRequestDeleteProduct(product)}
                                className="p-2 text-red-700 border border-slate-200 rounded-lg hover:bg-red-50 cursor-pointer"
                                aria-label="Sil"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Compact Past Sales Report Module */}
              <SalesReportModule
                sales={sales}
                loading={loading}
                compact
                onOpenFullReport={() => handleNavSelect('sales', 'all')}
                onOpenSaleModal={onOpenSale}
                onRequestDeleteSale={onRequestDeleteSale}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
