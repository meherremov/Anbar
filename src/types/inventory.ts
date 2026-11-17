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
  NUMERIC_MAX: 100000000,
} as const;

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
}

export interface CategoryItem {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Timestamp | null;
}

export type PaymentMethod = 'cash' | 'card' | 'mobile';
export type ThermalPaperWidth = '80mm' | '58mm';

export interface SaleRecord {
  id: string;
  productId: string;
  productName: string;
  barcode: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalAmount: number;
  discountAmount?: number;
  ownerId: string;
  receiptNumber?: string;
  paymentMethod?: PaymentMethod;
  cashierEmail?: string;
  soldAt: Timestamp | null;
}

export const RECEIPT_LIMITS = {
  STORE_NAME_MAX: 80,
  SUBTITLE_MAX: 100,
  ADDRESS_MAX: 140,
  PHONE_MAX: 40,
  TAX_ID_MAX: 40,
  FOOTER_NOTE_MAX: 160,
  RECEIPT_NUMBER_MAX: 40,
} as const;

export interface ReceiptSettings {
  storeName: string;
  subtitle: string;
  address: string;
  phone: string;
  taxId: string;
  footerNote: string;
  paperWidth: ThermalPaperWidth;
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  storeName: 'MƏKTƏBLİ',
  subtitle: 'Dəftərxana Sistemi',
  address: '',
  phone: '',
  taxId: '',
  footerNote: 'Alış-verişiniz üçün təşəkkür edirik!',
  paperWidth: '80mm',
};

export interface CheckoutCartItem {
  product: Product;
  quantity: number;
}

export interface ReceiptLineItem {
  productId: string;
  productName: string;
  barcode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
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
