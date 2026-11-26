import type { Timestamp } from 'firebase/firestore';

export const FIELD_LIMITS = {
  NAME_MAX: 160,
  BARCODE_MAX: 64,
  BARCODE_FORMAT_MAX: 32,
  CATEGORY_MAX: 64,
  BRAND_MAX: 80,
  UNIT_MAX: 24,
  SHELF_MAX: 64,
  NOTES_MAX: 500,
  ICON_MAX: 40,
  NUMERIC_MAX: 100000000,
} as const;

export const STATIONERY_ICON_IDS = [
  'pen',
  'pencil',
  'notebook',
  'eraser',
  'marker',
  'ruler',
  'folder',
  'paper',
  'glue_tape',
  'scissors_stapler',
  'paint_brush',
  'stationery_default',
] as const;

export type StationeryIconId = (typeof STATIONERY_ICON_IDS)[number];

// Synchronized verbatim with firebase-blueprint.json & firestore.rules
export const BARCODE_PATTERN = /^[A-Za-z0-9_\-./+:=?&%# ]+$/;

export const DEFAULT_CATEGORIES = [
  'Kağız və Dəftər',
  'Qələm və Marker',
  'Qovluq və Arxiv',
  'Ofis Texnikası',
  'Yapışqan və Skotç',
  'Masaüstü Ləvazimat',
  'Digər',
] as const;

export const UNIT_OPTIONS = [
  'ədəd',
  'qutu',
  'paket',
  'dəst',
  'rulon',
  'bağlama',
] as const;

export interface Product {
  id: string;
  name: string;
  barcode: string;
  barcodeFormat: string;
  category: string;
  brand?: string;
  quantity: number;
  unit: string;
  purchasePrice?: number;
  salePrice: number;
  minStock?: number;
  shelfLocation?: string;
  notes?: string;
  icon?: StationeryIconId;
  ownerId: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ProductFormValues {
  name: string;
  barcode: string;
  barcodeFormat: string;
  category: string;
  brand: string;
  quantity: string;
  unit: string;
  purchasePrice: string;
  salePrice: string;
  minStock: string;
  shelfLocation: string;
  notes: string;
  icon: string;
}

export interface CategoryItem {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Timestamp | null;
}

export type PaymentMethod = 'cash' | 'card' | 'c2c' | 'mobile';
export type ThermalPaperWidth = '80mm' | '58mm';

export function formatPaymentMethodLabel(method?: PaymentMethod): string {
  switch (method) {
    case 'card':
      return 'Bank kartı';
    case 'c2c':
      return 'C2C (Kartdan karta)';
    case 'mobile':
      return 'Mobil ödəniş';
    case 'cash':
    default:
      return 'Nağd';
  }
}

export const RETURN_LIMITS = {
  REASON_MAX: 160,
} as const;

export interface SaleRecord {
  id: string;
  productId: string;
  productName: string;
  barcode: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  purchasePrice?: number;
  totalAmount: number;
  discountAmount?: number;
  ownerId: string;
  receiptNumber?: string;
  paymentMethod?: PaymentMethod;
  cashierEmail?: string;
  soldAt: Timestamp | null;
  returnedQuantity?: number;
  returnedAmount?: number;
  returnReason?: string;
  returnedAt?: Timestamp | null;
}

export function getNetSaleQuantity(sale: SaleRecord): number {
  const returned = typeof sale.returnedQuantity === 'number' ? sale.returnedQuantity : 0;
  return Math.max(0, Math.round((sale.quantity - returned) * 100) / 100);
}

export function getNetSaleAmount(sale: SaleRecord): number {
  const returned = typeof sale.returnedAmount === 'number' ? sale.returnedAmount : 0;
  return Math.max(0, Math.round((sale.totalAmount - returned) * 100) / 100);
}

export function getSaleUnitCost(
  sale: SaleRecord,
  productCostMap?: Map<string, number>
): number | undefined {
  if (
    typeof sale.purchasePrice === 'number' &&
    !Number.isNaN(sale.purchasePrice) &&
    sale.purchasePrice >= 0
  ) {
    return sale.purchasePrice;
  }
  const fallback = productCostMap?.get(sale.productId);
  if (typeof fallback === 'number' && !Number.isNaN(fallback) && fallback >= 0) {
    return fallback;
  }
  return undefined;
}

export function getSaleCostAmount(
  sale: SaleRecord,
  productCostMap?: Map<string, number>
): number | null {
  const netQty = getNetSaleQuantity(sale);
  if (netQty <= 0) {
    return 0;
  }
  const unitCost = getSaleUnitCost(sale, productCostMap);
  if (unitCost === undefined) {
    return null;
  }
  return Math.round(unitCost * netQty * 100) / 100;
}

export function getSaleNetProfit(
  sale: SaleRecord,
  productCostMap?: Map<string, number>
): number | null {
  const cost = getSaleCostAmount(sale, productCostMap);
  if (cost === null) {
    return null;
  }
  return Math.round((getNetSaleAmount(sale) - cost) * 100) / 100;
}

export type ReceiptTemplateId = 'classic' | 'modern' | 'compact' | 'detailed';
export type ReceiptFontScale = 'compact' | 'normal' | 'large';
export type ReceiptDividerStyle = 'dashed' | 'solid' | 'double';
export type ReceiptLogoPreset =
  | 'none'
  | 'stationery'
  | 'bag'
  | 'book'
  | 'star'
  | 'crown';
export type ReceiptPromoStyle = 'boxed' | 'inverted' | 'plain';

export interface ReceiptTemplateMeta {
  id: ReceiptTemplateId;
  name: string;
  description: string;
  badge: string;
}

export const RECEIPT_TEMPLATES: ReceiptTemplateMeta[] = [
  {
    id: 'modern',
    name: 'Müasir Kassa',
    description: 'Qara başlıq zolağı, təmiz sətirlər və kontrastlı yekun bloku',
    badge: 'Tövsiyə',
  },
  {
    id: 'classic',
    name: 'Klassik Termal',
    description: 'Müasirləşdirilmiş standart kassa çeki, barkod və aydın cədvəl',
    badge: 'Standart',
  },
  {
    id: 'compact',
    name: 'Kompakt Ekonom',
    description: 'Kağıza qənaət edən sıx düzülüş və sürətli oxunuş',
    badge: 'Qənaətcil',
  },
  {
    id: 'detailed',
    name: 'Rəsmi / Detallı',
    description: 'Çərçivəli başlıq, VÖEN bloku, sıra cədvəli və imza xətti',
    badge: 'Rəsmi',
  },
];

export const RECEIPT_LOGO_PRESETS: Array<{
  id: ReceiptLogoPreset;
  label: string;
}> = [
  { id: 'none', label: 'Logosuz' },
  { id: 'stationery', label: 'Dəftərxana' },
  { id: 'bag', label: 'Mağaza' },
  { id: 'book', label: 'Kitab' },
  { id: 'star', label: 'Ulduz' },
  { id: 'crown', label: 'Premium' },
];

export const RECEIPT_PROMO_SUGGESTIONS: string[] = [
  'Yeni iliniz mübarək!',
  'Bayramınız mübarək!',
  'Novruz bayramınız mübarək!',
  'Yeni tədris iliniz uğurlu olsun!',
  'Bizi seçdiyiniz üçün təşəkkürlər!',
];

export const LOGO_DATA_URL_PATTERN =
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export const RECEIPT_LIMITS = {
  STORE_NAME_MAX: 80,
  SUBTITLE_MAX: 100,
  ADDRESS_MAX: 140,
  PHONE_MAX: 40,
  TAX_ID_MAX: 40,
  FOOTER_NOTE_MAX: 160,
  RECEIPT_NUMBER_MAX: 40,
  HEADER_BADGE_MAX: 40,
  LOGO_DATA_URL_MAX: 45000,
  PROMO_BANNER_MAX: 160,
} as const;

export interface ReceiptSettings {
  storeName: string;
  subtitle: string;
  address: string;
  phone: string;
  taxId: string;
  footerNote: string;
  paperWidth: ThermalPaperWidth;
  templateId: ReceiptTemplateId;
  headerBadge: string;
  showBarcode: boolean;
  showItemBarcodes: boolean;
  showCashier: boolean;
  showPaymentMethod: boolean;
  showTaxId: boolean;
  fontScale: ReceiptFontScale;
  dividerStyle: ReceiptDividerStyle;
  showLogo: boolean;
  logoPreset: ReceiptLogoPreset;
  logoDataUrl: string;
  promoBanner: string;
  promoBannerUppercase: boolean;
  promoBannerStyle: ReceiptPromoStyle;
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  storeName: 'MƏKTƏBLİ',
  subtitle: 'Dəftərxana Sistemi',
  address: '',
  phone: '',
  taxId: '',
  footerNote: 'Alış-verişiniz üçün təşəkkür edirik!',
  paperWidth: '80mm',
  templateId: 'modern',
  headerBadge: 'SATIŞ ÇEKİ',
  showBarcode: true,
  showItemBarcodes: false,
  showCashier: true,
  showPaymentMethod: true,
  showTaxId: true,
  fontScale: 'normal',
  dividerStyle: 'dashed',
  showLogo: true,
  logoPreset: 'stationery',
  logoDataUrl: '',
  promoBanner: '',
  promoBannerUppercase: false,
  promoBannerStyle: 'boxed',
};

export function isValidReceiptTemplateId(val: unknown): val is ReceiptTemplateId {
  return val === 'classic' || val === 'modern' || val === 'compact' || val === 'detailed';
}

export function isValidReceiptFontScale(val: unknown): val is ReceiptFontScale {
  return val === 'compact' || val === 'normal' || val === 'large';
}

export function isValidReceiptDividerStyle(val: unknown): val is ReceiptDividerStyle {
  return val === 'dashed' || val === 'solid' || val === 'double';
}

export function isValidReceiptLogoPreset(val: unknown): val is ReceiptLogoPreset {
  return (
    val === 'none' ||
    val === 'stationery' ||
    val === 'bag' ||
    val === 'book' ||
    val === 'star' ||
    val === 'crown'
  );
}

export function isValidReceiptPromoStyle(val: unknown): val is ReceiptPromoStyle {
  return val === 'boxed' || val === 'inverted' || val === 'plain';
}

export function formatPromoBannerText(
  text: string,
  uppercase: boolean
): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return uppercase ? trimmed.toLocaleUpperCase('az-AZ') : trimmed;
}

export function sanitizeReceiptSettings(
  input: Partial<ReceiptSettings> | Record<string, unknown>
): ReceiptSettings {
  const raw = input as Record<string, unknown>;
  const storeName =
    typeof raw.storeName === 'string' && raw.storeName.trim()
      ? raw.storeName.trim().slice(0, RECEIPT_LIMITS.STORE_NAME_MAX)
      : DEFAULT_RECEIPT_SETTINGS.storeName;

  const rawLogoDataUrl =
    typeof raw.logoDataUrl === 'string' ? raw.logoDataUrl.trim() : '';
  const safeLogoDataUrl =
    rawLogoDataUrl.length <= RECEIPT_LIMITS.LOGO_DATA_URL_MAX &&
    LOGO_DATA_URL_PATTERN.test(rawLogoDataUrl)
      ? rawLogoDataUrl
      : '';

  return {
    storeName,
    subtitle:
      typeof raw.subtitle === 'string'
        ? raw.subtitle.trim().slice(0, RECEIPT_LIMITS.SUBTITLE_MAX)
        : '',
    address:
      typeof raw.address === 'string'
        ? raw.address.trim().slice(0, RECEIPT_LIMITS.ADDRESS_MAX)
        : '',
    phone:
      typeof raw.phone === 'string'
        ? raw.phone.trim().slice(0, RECEIPT_LIMITS.PHONE_MAX)
        : '',
    taxId:
      typeof raw.taxId === 'string'
        ? raw.taxId.trim().slice(0, RECEIPT_LIMITS.TAX_ID_MAX)
        : '',
    footerNote:
      typeof raw.footerNote === 'string'
        ? raw.footerNote.trim().slice(0, RECEIPT_LIMITS.FOOTER_NOTE_MAX)
        : DEFAULT_RECEIPT_SETTINGS.footerNote,
    paperWidth: raw.paperWidth === '58mm' ? '58mm' : '80mm',
    templateId: isValidReceiptTemplateId(raw.templateId)
      ? raw.templateId
      : DEFAULT_RECEIPT_SETTINGS.templateId,
    headerBadge:
      typeof raw.headerBadge === 'string'
        ? raw.headerBadge.trim().slice(0, RECEIPT_LIMITS.HEADER_BADGE_MAX)
        : DEFAULT_RECEIPT_SETTINGS.headerBadge,
    showBarcode:
      typeof raw.showBarcode === 'boolean'
        ? raw.showBarcode
        : DEFAULT_RECEIPT_SETTINGS.showBarcode,
    showItemBarcodes:
      typeof raw.showItemBarcodes === 'boolean'
        ? raw.showItemBarcodes
        : DEFAULT_RECEIPT_SETTINGS.showItemBarcodes,
    showCashier:
      typeof raw.showCashier === 'boolean'
        ? raw.showCashier
        : DEFAULT_RECEIPT_SETTINGS.showCashier,
    showPaymentMethod:
      typeof raw.showPaymentMethod === 'boolean'
        ? raw.showPaymentMethod
        : DEFAULT_RECEIPT_SETTINGS.showPaymentMethod,
    showTaxId:
      typeof raw.showTaxId === 'boolean'
        ? raw.showTaxId
        : DEFAULT_RECEIPT_SETTINGS.showTaxId,
    fontScale: isValidReceiptFontScale(raw.fontScale)
      ? raw.fontScale
      : DEFAULT_RECEIPT_SETTINGS.fontScale,
    dividerStyle: isValidReceiptDividerStyle(raw.dividerStyle)
      ? raw.dividerStyle
      : DEFAULT_RECEIPT_SETTINGS.dividerStyle,
    showLogo:
      typeof raw.showLogo === 'boolean'
        ? raw.showLogo
        : DEFAULT_RECEIPT_SETTINGS.showLogo,
    logoPreset: isValidReceiptLogoPreset(raw.logoPreset)
      ? raw.logoPreset
      : DEFAULT_RECEIPT_SETTINGS.logoPreset,
    logoDataUrl: safeLogoDataUrl,
    promoBanner:
      typeof raw.promoBanner === 'string'
        ? raw.promoBanner.trim().slice(0, RECEIPT_LIMITS.PROMO_BANNER_MAX)
        : DEFAULT_RECEIPT_SETTINGS.promoBanner,
    promoBannerUppercase:
      typeof raw.promoBannerUppercase === 'boolean'
        ? raw.promoBannerUppercase
        : DEFAULT_RECEIPT_SETTINGS.promoBannerUppercase,
    promoBannerStyle: isValidReceiptPromoStyle(raw.promoBannerStyle)
      ? raw.promoBannerStyle
      : DEFAULT_RECEIPT_SETTINGS.promoBannerStyle,
  };
}

export interface ScreenLockSettings {
  lockEnabled: boolean;
  lockTimeoutSeconds: number;
  lockPinHash?: string;
  lockPinSalt?: string;
  lockPinLength?: number;
}

export const DEFAULT_SCREEN_LOCK_SETTINGS: ScreenLockSettings = {
  lockEnabled: false,
  lockTimeoutSeconds: 180,
};

export interface CheckoutCartItem {
  product: Product;
  quantity: number;
  unitPriceOverride?: number;
  discountAmount?: number;
  discountPercent?: number;
}

export interface ReceiptLineItem {
  productId: string;
  productName: string;
  barcode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountAmount?: number;
  lineTotal: number;
}

export interface ReceiptData {
  receiptNumber: string;
  issuedAt: Date;
  cashierLabel: string;
  paymentMethod: PaymentMethod;
  items: ReceiptLineItem[];
  subtotalAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  cashReceived?: number;
  changeAmount?: number;
}

export const AUTH_LIMITS = {
  EMAIL_MAX: 160,
  LABEL_MAX: 80,
} as const;

export const EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export interface AuthorizedUser {
  id: string;
  email: string;
  label?: string;
  addedBy: string;
  createdAt: Timestamp | null;
}

export interface BarcodeScanResult {
  code: string;
  format: string;
}

export type StockFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
export type SortOption = 'updated_desc' | 'name_asc' | 'qty_asc' | 'price_desc';
export type ActiveView =
  | 'pos'
  | 'home'
  | 'search'
  | 'inventory'
  | 'low_stock'
  | 'categories'
  | 'sales'
  | 'users'
  | 'settings';
