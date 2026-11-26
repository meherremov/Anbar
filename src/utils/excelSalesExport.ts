import JSZip from 'jszip';
import {
  formatPaymentMethodLabel,
  getNetSaleAmount,
  getNetSaleQuantity,
  getSaleCostAmount,
  getSaleNetProfit,
  getSaleUnitCost,
  type SaleRecord,
} from '../types/inventory';

export interface ExportSalesWorkbookOptions {
  sales: SaleRecord[];
  productCostMap?: Map<string, number>;
  storeName?: string;
  periodLabel: string;
  fileSlug: string;
}

interface CellSpec {
  value: string | number;
  style: number;
  type: 's' | 'n' | 'f';
  formula?: string;
}

type RowMap = Map<number, CellSpec>; // 1-based col index -> cell

function escapeXml(raw: string | number): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colToLetter(colIndex1Based: number): string {
  let n = colIndex1Based;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellRef(col: number, row: number): string {
  return `${colToLetter(col)}${row}`;
}

function getSaleMs(sale: SaleRecord): number {
  if (sale.soldAt && typeof sale.soldAt.toMillis === 'function') {
    return sale.soldAt.toMillis();
  }
  const match = /_(\d{13})_/.exec(sale.id);
  if (match) {
    const parsed = Number(match[1]);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function getLocalDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplayDateFromKey(dateKey: string): string {
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function formatDateTime(ts: SaleRecord['soldAt'], fallbackId: string): string {
  const ms =
    ts && typeof ts.toMillis === 'function'
      ? ts.toMillis()
      : getSaleMs({ id: fallbackId, soldAt: ts } as SaleRecord);
  return new Date(ms).toLocaleString('az-AZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

class SharedStringsPool {
  private readonly list: string[] = [];
  private readonly indexMap = new Map<string, number>();

  intern(str: string): number {
    const existing = this.indexMap.get(str);
    if (existing !== undefined) return existing;
    const idx = this.list.length;
    this.list.push(str);
    this.indexMap.set(str, idx);
    return idx;
  }

  toXml(): string {
    const items = this.list
      .map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`)
      .join('');
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.list.length}" uniqueCount="${this.list.length}">${items}</sst>`
    );
  }
}

/**
 * Style indices in xl/styles.xml:
 * 0: Default text (left)
 * 1: Title banner (14pt white bold on #13233F, vertical center, left)
 * 2: Subtitle bar (10pt #475569 on #F1F5F9, vertical center, left)
 * 3: Section header (11pt white bold on #1E3A5F, vertical center, left)
 * 4: Table header center (10pt white bold on #13233F, bordered)
 * 5: Table header left (10pt white bold on #13233F, bordered)
 * 6: Table header right (10pt white bold on #13233F, bordered)
 * 7: KPI label blue (#EFF6FF, bold #1E40AF, 9pt, center)
 * 8: KPI value blue (#EFF6FF, bold #1D4ED8, 13pt, center, #,##0.00 "₼")
 * 9: KPI label amber (#FFFBEB, bold #92400E, 9pt, center)
 * 10: KPI value amber (#FFFBEB, bold #B45309, 13pt, center, #,##0.00 "₼")
 * 11: KPI label emerald (#ECFDF5, bold #065F46, 9pt, center)
 * 12: KPI value emerald (#ECFDF5, bold #047857, 13pt, center, #,##0.00 "₼")
 * 13: KPI label slate (#F8FAFC, bold #334155, 9pt, center)
 * 14: KPI value percent (#F8FAFC, bold #0F172A, 13pt, center, 0.0%)
 * 15: Row even text left (bordered)
 * 16: Row even text center (bordered)
 * 17: Row even qty right (#,##0.##, bordered)
 * 18: Row even money right (#,##0.00, bordered)
 * 19: Row even money blue bold (#1D4ED8, #,##0.00, bordered)
 * 20: Row even money amber (#B45309, #,##0.00, bordered)
 * 21: Row even profit green (#ECFDF5, #047857 bold, #,##0.00, bordered)
 * 22: Row even profit red (#FEF2F2, #B91C1C bold, #,##0.00, bordered)
 * 23: Row odd text left (#F8FAFC, bordered)
 * 24: Row odd text center (#F8FAFC, bordered)
 * 25: Row odd qty right (#F8FAFC, #,##0.##, bordered)
 * 26: Row odd money right (#F8FAFC, #,##0.00, bordered)
 * 27: Row odd money blue bold (#F8FAFC, #1D4ED8, #,##0.00, bordered)
 * 28: Row odd money amber (#F8FAFC, #B45309, #,##0.00, bordered)
 * 29: Row odd profit green (#ECFDF5, #047857 bold, #,##0.00, bordered)
 * 30: Row odd profit red (#FEF2F2, #B91C1C bold, #,##0.00, bordered)
 * 31: Muted dash center (bordered, #94A3B8)
 * 32: Totals label left (#E2E8F0, bold, top medium + bottom double)
 * 33: Totals qty right (#E2E8F0, bold, #,##0.##, top medium + bottom double)
 * 34: Totals blank (#E2E8F0, top medium + bottom double)
 * 35: Totals blue money (#E2E8F0, bold #1D4ED8, #,##0.00 "₼", top medium + bottom double)
 * 36: Totals amber money (#E2E8F0, bold #B45309, #,##0.00 "₼", top medium + bottom double)
 * 37: Totals green money (#E2E8F0, bold #047857, #,##0.00 "₼", top medium + bottom double)
 * 38: Totals red money (#E2E8F0, bold #B91C1C, #,##0.00 "₼", top medium + bottom double)
 * 39: Footnote italic (#64748B, 9pt italic)
 * 40: Row even percent right (0.0%, bordered)
 * 41: Row odd percent right (#F8FAFC, 0.0%, bordered)
 * 42: Totals percent right (#E2E8F0, bold, 0.0%, top medium + bottom double)
 * 43: KPI value slate text (#F8FAFC, bold #334155, 11pt, center)
 */
const ST = {
  DEFAULT: 0,
  TITLE: 1,
  SUBTITLE: 2,
  SECTION: 3,
  TH_CENTER: 4,
  TH_LEFT: 5,
  TH_RIGHT: 6,
  KPI_LBL_BLUE: 7,
  KPI_VAL_BLUE: 8,
  KPI_LBL_AMBER: 9,
  KPI_VAL_AMBER: 10,
  KPI_LBL_GREEN: 11,
  KPI_VAL_GREEN: 12,
  KPI_LBL_SLATE: 13,
  KPI_VAL_PCT: 14,
  EVEN_LEFT: 15,
  EVEN_CENTER: 16,
  EVEN_QTY: 17,
  EVEN_MONEY: 18,
  EVEN_BLUE: 19,
  EVEN_AMBER: 20,
  EVEN_PROFIT_POS: 21,
  EVEN_PROFIT_NEG: 22,
  ODD_LEFT: 23,
  ODD_CENTER: 24,
  ODD_QTY: 25,
  ODD_MONEY: 26,
  ODD_BLUE: 27,
  ODD_AMBER: 28,
  ODD_PROFIT_POS: 29,
  ODD_PROFIT_NEG: 30,
  MUTED_DASH: 31,
  TOT_LEFT: 32,
  TOT_QTY: 33,
  TOT_BLANK: 34,
  TOT_BLUE: 35,
  TOT_AMBER: 36,
  TOT_GREEN: 37,
  TOT_RED: 38,
  NOTE: 39,
  EVEN_PCT: 40,
  ODD_PCT: 41,
  TOT_PCT: 42,
  KPI_VAL_TEXT: 43,
} as const;

function buildStylesXml(): string {
  const numFmts = [
    `<numFmt numFmtId="164" formatCode="#,##0.00 &quot;₼&quot;"/>`,
    `<numFmt numFmtId="165" formatCode="#,##0.00"/>`,
    `<numFmt numFmtId="166" formatCode="#,##0.##"/>`,
    `<numFmt numFmtId="167" formatCode="0.0%"/>`,
  ];

  // Fonts:
  // 0: 10pt #0F172A regular
  // 1: 14pt #FFFFFF bold (title)
  // 2: 10pt #475569 regular (subtitle)
  // 3: 10pt #FFFFFF bold (headers)
  // 4: 9pt #1E40AF bold (KPI label blue)
  // 5: 13pt #1D4ED8 bold (KPI val blue)
  // 6: 9pt #92400E bold (KPI label amber)
  // 7: 13pt #B45309 bold (KPI val amber)
  // 8: 9pt #065F46 bold (KPI label green)
  // 9: 13pt #047857 bold (KPI val green)
  // 10: 9pt #334155 bold (KPI label slate)
  // 11: 13pt #0F172A bold (KPI val slate)
  // 12: 10pt #1D4ED8 bold (data blue)
  // 13: 10pt #B45309 bold (data amber)
  // 14: 10pt #047857 bold (profit pos)
  // 15: 10pt #B91C1C bold (profit neg)
  // 16: 10pt #94A3B8 regular (muted dash)
  // 17: 10pt #0F172A bold (totals)
  // 18: 9pt #64748B italic (footnote)
  // 19: 11pt #FFFFFF bold (section bar)
  // 20: 11pt #334155 bold (KPI val text)
  const f = (sz: number, color: string, bold = false, italic = false) =>
    `<font>${bold ? '<b/>' : ''}${italic ? '<i/>' : ''}<sz val="${sz}"/><color rgb="FF${color}"/><name val="Calibri"/></font>`;

  const fonts = [
    f(10, '0F172A'),
    f(14, 'FFFFFF', true),
    f(10, '475569'),
    f(10, 'FFFFFF', true),
    f(9, '1E40AF', true),
    f(13, '1D4ED8', true),
    f(9, '92400E', true),
    f(13, 'B45309', true),
    f(9, '065F46', true),
    f(13, '047857', true),
    f(9, '334155', true),
    f(13, '0F172A', true),
    f(10, '1D4ED8', true),
    f(10, 'B45309', true),
    f(10, '047857', true),
    f(10, 'B91C1C', true),
    f(10, '94A3B8'),
    f(10, '0F172A', true),
    f(9, '64748B', false, true),
    f(11, 'FFFFFF', true),
    f(11, '334155', true),
  ];

  // Fills (0=none, 1=gray125 mandatory):
  // 2: #13233F dark navy
  // 3: #F1F5F9 soft slate
  // 4: #1E3A5F slate navy
  // 5: #EFF6FF light blue
  // 6: #FFFBEB light amber
  // 7: #ECFDF5 light emerald
  // 8: #F8FAFC light zebra/slate
  // 9: #FEF2F2 light red
  // 10: #E2E8F0 totals gray
  // 11: #FFFFFF white
  const solid = (hex: string) =>
    `<fill><patternFill patternType="solid"><fgColor rgb="FF${hex}"/><bgColor indexed="64"/></patternFill></fill>`;

  const fills = [
    `<fill><patternFill patternType="none"/></fill>`,
    `<fill><patternFill patternType="gray125"/></fill>`,
    solid('13233F'),
    solid('F1F5F9'),
    solid('1E3A5F'),
    solid('EFF6FF'),
    solid('FFFBEB'),
    solid('ECFDF5'),
    solid('F8FAFC'),
    solid('FEF2F2'),
    solid('E2E8F0'),
    solid('FFFFFF'),
  ];

  // Borders:
  // 0: empty
  // 1: thin #CBD5E1 all sides (data cells)
  // 2: thin #334155 all sides (header)
  // 3: thin #CBD5E1 all sides (KPI card)
  // 4: accounting total (top medium #475569, bottom double #13233F, sides thin #CBD5E1)
  const bSide = (tag: string, style: string, hex: string) =>
    `<${tag} style="${style}"><color rgb="FF${hex}"/></${tag}>`;
  const borders = [
    `<border><left/><right/><top/><bottom/><diagonal/></border>`,
    `<border>${bSide('left', 'thin', 'CBD5E1')}${bSide('right', 'thin', 'CBD5E1')}${bSide('top', 'thin', 'CBD5E1')}${bSide('bottom', 'thin', 'CBD5E1')}<diagonal/></border>`,
    `<border>${bSide('left', 'thin', '334155')}${bSide('right', 'thin', '334155')}${bSide('top', 'thin', '334155')}${bSide('bottom', 'thin', '334155')}<diagonal/></border>`,
    `<border>${bSide('left', 'thin', 'CBD5E1')}${bSide('right', 'thin', 'CBD5E1')}${bSide('top', 'thin', 'CBD5E1')}${bSide('bottom', 'thin', 'CBD5E1')}<diagonal/></border>`,
    `<border>${bSide('left', 'thin', 'CBD5E1')}${bSide('right', 'thin', 'CBD5E1')}${bSide('top', 'medium', '475569')}${bSide('bottom', 'double', '13233F')}<diagonal/></border>`,
  ];

  const xf = (
    numFmtId: number,
    fontId: number,
    fillId: number,
    borderId: number,
    hAlign: 'left' | 'center' | 'right',
    wrap = false
  ) =>
    `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${
      numFmtId > 0 ? ' applyNumberFormat="1"' : ''
    } applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${hAlign}" vertical="center"${
      wrap ? ' wrapText="1"' : ''
    }/></xf>`;

  const xfs = [
    xf(0, 0, 0, 0, 'left'), // 0 DEFAULT
    xf(0, 1, 2, 0, 'left'), // 1 TITLE
    xf(0, 2, 3, 0, 'left'), // 2 SUBTITLE
    xf(0, 19, 4, 2, 'left'), // 3 SECTION
    xf(0, 3, 2, 2, 'center', true), // 4 TH_CENTER
    xf(0, 3, 2, 2, 'left', true), // 5 TH_LEFT
    xf(0, 3, 2, 2, 'right', true), // 6 TH_RIGHT
    xf(0, 4, 5, 3, 'center'), // 7 KPI_LBL_BLUE
    xf(164, 5, 5, 3, 'center'), // 8 KPI_VAL_BLUE
    xf(0, 6, 6, 3, 'center'), // 9 KPI_LBL_AMBER
    xf(164, 7, 6, 3, 'center'), // 10 KPI_VAL_AMBER
    xf(0, 8, 7, 3, 'center'), // 11 KPI_LBL_GREEN
    xf(164, 9, 7, 3, 'center'), // 12 KPI_VAL_GREEN
    xf(0, 10, 8, 3, 'center'), // 13 KPI_LBL_SLATE
    xf(167, 11, 8, 3, 'center'), // 14 KPI_VAL_PCT
    xf(0, 0, 11, 1, 'left', true), // 15 EVEN_LEFT
    xf(0, 0, 11, 1, 'center'), // 16 EVEN_CENTER
    xf(166, 0, 11, 1, 'right'), // 17 EVEN_QTY
    xf(165, 0, 11, 1, 'right'), // 18 EVEN_MONEY
    xf(165, 12, 11, 1, 'right'), // 19 EVEN_BLUE
    xf(165, 13, 11, 1, 'right'), // 20 EVEN_AMBER
    xf(165, 14, 7, 1, 'right'), // 21 EVEN_PROFIT_POS
    xf(165, 15, 9, 1, 'right'), // 22 EVEN_PROFIT_NEG
    xf(0, 0, 8, 1, 'left', true), // 23 ODD_LEFT
    xf(0, 0, 8, 1, 'center'), // 24 ODD_CENTER
    xf(166, 0, 8, 1, 'right'), // 25 ODD_QTY
    xf(165, 0, 8, 1, 'right'), // 26 ODD_MONEY
    xf(165, 12, 8, 1, 'right'), // 27 ODD_BLUE
    xf(165, 13, 8, 1, 'right'), // 28 ODD_AMBER
    xf(165, 14, 7, 1, 'right'), // 29 ODD_PROFIT_POS
    xf(165, 15, 9, 1, 'right'), // 30 ODD_PROFIT_NEG
    xf(0, 16, 11, 1, 'center'), // 31 MUTED_DASH
    xf(0, 17, 10, 4, 'left'), // 32 TOT_LEFT
    xf(166, 17, 10, 4, 'right'), // 33 TOT_QTY
    xf(0, 17, 10, 4, 'center'), // 34 TOT_BLANK
    xf(164, 12, 10, 4, 'right'), // 35 TOT_BLUE
    xf(164, 13, 10, 4, 'right'), // 36 TOT_AMBER
    xf(164, 14, 10, 4, 'right'), // 37 TOT_GREEN
    xf(164, 15, 10, 4, 'right'), // 38 TOT_RED
    xf(0, 18, 0, 0, 'left'), // 39 NOTE
    xf(167, 0, 11, 1, 'right'), // 40 EVEN_PCT
    xf(167, 0, 8, 1, 'right'), // 41 ODD_PCT
    xf(167, 17, 10, 4, 'right'), // 42 TOT_PCT
    xf(0, 20, 8, 3, 'center'), // 43 KPI_VAL_TEXT
  ];

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="${numFmts.length}">${numFmts.join('')}</numFmts>` +
    `<fonts count="${fonts.length}">${fonts.join('')}</fonts>` +
    `<fills count="${fills.length}">${fills.join('')}</fills>` +
    `<borders count="${borders.length}">${borders.join('')}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`
  );
}

interface SheetBuildInput {
  rows: Map<number, RowMap>; // 1-based row -> Map(1-based col -> CellSpec)
  rowHeights: Map<number, number>;
  colWidths: number[];
  merges: string[];
  maxCol: number;
  maxRow: number;
  freezeRow?: number;
  autoFilterRef?: string;
  drawingRelId?: string;
  landscape?: boolean;
}

function buildWorksheetXml(input: SheetBuildInput, strings: SharedStringsPool): string {
  const {
    rows,
    rowHeights,
    colWidths,
    merges,
    maxCol,
    maxRow,
    freezeRow,
    autoFilterRef,
    drawingRelId,
    landscape = true,
  } = input;

  const dimensionRef = `A1:${cellRef(maxCol, Math.max(1, maxRow))}`;

  const sheetViewsXml = freezeRow
    ? `<sheetViews><sheetView tabSelected="0" workbookViewId="0"><pane ySplit="${freezeRow}" topLeftCell="A${
        freezeRow + 1
      }" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;

  const colsXml = `<cols>${colWidths
    .map(
      (w, idx) =>
        `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`
    )
    .join('')}</cols>`;

  const rowNums = Array.from(rows.keys()).sort((a, b) => a - b);
  const sheetDataRows = rowNums
    .map((r) => {
      const rowMap = rows.get(r)!;
      const ht = rowHeights.get(r);
      const htAttr = ht ? ` ht="${ht}" customHeight="1"` : '';
      const cols = Array.from(rowMap.keys()).sort((a, b) => a - b);
      const cellsXml = cols
        .map((c) => {
          const cell = rowMap.get(c)!;
          const ref = cellRef(c, r);
          if (cell.type === 's') {
            const sIdx = strings.intern(String(cell.value));
            return `<c r="${ref}" s="${cell.style}" t="s"><v>${sIdx}</v></c>`;
          }
          if (cell.type === 'f' && cell.formula) {
            return `<c r="${ref}" s="${cell.style}"><f>${escapeXml(
              cell.formula
            )}</f><v>${Number(cell.value)}</v></c>`;
          }
          return `<c r="${ref}" s="${cell.style}"><v>${Number(cell.value)}</v></c>`;
        })
        .join('');
      return `<row r="${r}"${htAttr}>${cellsXml}</row>`;
    })
    .join('');

  const autoFilterXml = autoFilterRef ? `<autoFilter ref="${autoFilterRef}"/>` : '';
  const mergesXml =
    merges.length > 0
      ? `<mergeCells count="${merges.length}">${merges
          .map((m) => `<mergeCell ref="${m}"/>`)
          .join('')}</mergeCells>`
      : '';

  const drawingXml = drawingRelId ? `<drawing r:id="${drawingRelId}"/>` : '';

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<dimension ref="${dimensionRef}"/>` +
    sheetViewsXml +
    `<sheetFormatPr defaultRowHeight="20"/>` +
    colsXml +
    `<sheetData>${sheetDataRows}</sheetData>` +
    autoFilterXml +
    mergesXml +
    `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.25" footer="0.25"/>` +
    `<pageSetup orientation="${landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>` +
    drawingXml +
    `</worksheet>`
  );
}

function setCell(
  rows: Map<number, RowMap>,
  row: number,
  col: number,
  spec: CellSpec
) {
  let rowMap = rows.get(row);
  if (!rowMap) {
    rowMap = new Map<number, CellSpec>();
    rows.set(row, rowMap);
  }
  rowMap.set(col, spec);
}

function fillMergedStyleRow(
  rows: Map<number, RowMap>,
  row: number,
  startCol: number,
  endCol: number,
  style: number,
  text?: string
) {
  for (let c = startCol; c <= endCol; c++) {
    setCell(rows, row, c, {
      type: 's',
      value: c === startCol && text !== undefined ? text : '',
      style,
    });
  }
}

interface ChartSeriesInput {
  nameCellRef: string;
  name: string;
  valuesRangeRef: string;
  values: number[];
  colorHex: string;
}

interface BarChartInput {
  title: string;
  barDir: 'col' | 'bar';
  categoriesRangeRef: string;
  categories: string[];
  series: ChartSeriesInput[];
}

function buildBarChartXml(chart: BarChartInput): string {
  const catAxId = chart.barDir === 'col' ? 110001 : 210001;
  const valAxId = chart.barDir === 'col' ? 110002 : 210002;
  const catAxPos = chart.barDir === 'col' ? 'b' : 'l';
  const valAxPos = chart.barDir === 'col' ? 'l' : 'b';
  const catOrientation = chart.barDir === 'bar' ? 'maxMin' : 'minMax';

  const catPtsXml = chart.categories
    .map((cat, i) => `<c:pt idx="${i}"><c:v>${escapeXml(cat)}</c:v></c:pt>`)
    .join('');

  const seriesXml = chart.series
    .map((s, idx) => {
      const valPtsXml = s.values
        .map((v, i) => `<c:pt idx="${i}"><c:v>${round2(v)}</c:v></c:pt>`)
        .join('');
      return (
        `<c:ser>` +
        `<c:idx val="${idx}"/>` +
        `<c:order val="${idx}"/>` +
        `<c:tx><c:strRef><c:f>${escapeXml(s.nameCellRef)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${escapeXml(
          s.name
        )}</c:v></c:pt></c:strCache></c:strRef></c:tx>` +
        `<c:spPr><a:solidFill><a:srgbClr val="${s.colorHex}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>` +
        `<c:invertIfNegative val="0"/>` +
        `<c:cat><c:strRef><c:f>${escapeXml(
          chart.categoriesRangeRef
        )}</c:f><c:strCache><c:ptCount val="${chart.categories.length}"/>${catPtsXml}</c:strCache></c:strRef></c:cat>` +
        `<c:val><c:numRef><c:f>${escapeXml(
          s.valuesRangeRef
        )}</c:f><c:numCache><c:formatCode>#,##0.00</c:formatCode><c:ptCount val="${
          s.values.length
        }"/>${valPtsXml}</c:numCache></c:numRef></c:val>` +
        `</c:ser>`
      );
    })
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<c:date1904 val="0"/>` +
    `<c:lang val="az-Latn-AZ"/>` +
    `<c:roundedCorners val="0"/>` +
    `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></c:spPr>` +
    `<c:chart>` +
    `<c:title>` +
    `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"><a:solidFill><a:srgbClr val="13233F"/></a:solidFill></a:defRPr></a:pPr><a:r><a:rPr lang="az-Latn-AZ" sz="1200" b="1"><a:solidFill><a:srgbClr val="13233F"/></a:solidFill></a:rPr><a:t>${escapeXml(
      chart.title
    )}</a:t></a:r></a:p></c:rich></c:tx>` +
    `<c:overlay val="0"/>` +
    `</c:title>` +
    `<c:autoTitleDeleted val="0"/>` +
    `<c:plotArea>` +
    `<c:layout/>` +
    `<c:barChart>` +
    `<c:barDir val="${chart.barDir}"/>` +
    `<c:grouping val="clustered"/>` +
    `<c:varyColors val="0"/>` +
    seriesXml +
    `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>` +
    `<c:gapWidth val="120"/>` +
    `<c:overlap val="-15"/>` +
    `<c:axId val="${catAxId}"/>` +
    `<c:axId val="${valAxId}"/>` +
    `</c:barChart>` +
    `<c:catAx>` +
    `<c:axId val="${catAxId}"/>` +
    `<c:scaling><c:orientation val="${catOrientation}"/></c:scaling>` +
    `<c:delete val="0"/>` +
    `<c:axPos val="${catAxPos}"/>` +
    `<c:majorTickMark val="none"/>` +
    `<c:minorTickMark val="none"/>` +
    `<c:tickLblPos val="nextTo"/>` +
    `<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></c:spPr>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="334155"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="az-Latn-AZ" sz="900"/></a:p></c:txPr>` +
    `<c:crossAx val="${valAxId}"/>` +
    `<c:crosses val="autoZero"/>` +
    `<c:auto val="1"/>` +
    `<c:lblAlgn val="ctr"/>` +
    `<c:lblOffset val="100"/>` +
    `</c:catAx>` +
    `<c:valAx>` +
    `<c:axId val="${valAxId}"/>` +
    `<c:scaling><c:orientation val="minMax"/></c:scaling>` +
    `<c:delete val="0"/>` +
    `<c:axPos val="${valAxPos}"/>` +
    `<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>` +
    `<c:numFmt formatCode="#,##0.00" sourceLinked="0"/>` +
    `<c:majorTickMark val="none"/>` +
    `<c:minorTickMark val="none"/>` +
    `<c:tickLblPos val="nextTo"/>` +
    `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="475569"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="az-Latn-AZ" sz="900"/></a:p></c:txPr>` +
    `<c:crossAx val="${catAxId}"/>` +
    `<c:crosses val="autoZero"/>` +
    `<c:crossBetween val="between"/>` +
    `</c:valAx>` +
    `</c:plotArea>` +
    `<c:legend>` +
    `<c:legendPos val="t"/>` +
    `<c:overlay val="0"/>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="950"><a:solidFill><a:srgbClr val="334155"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="az-Latn-AZ" sz="950"/></a:p></c:txPr>` +
    `</c:legend>` +
    `<c:plotVisOnly val="1"/>` +
    `</c:chart>` +
    `</c:chartSpace>`
  );
}

interface DrawingAnchorSpec {
  relId: string;
  name: string;
  fromCol0: number;
  fromRow0: number;
  toCol0: number;
  toRow0: number;
}

function buildDrawingXml(anchors: DrawingAnchorSpec[]): string {
  const anchorXml = anchors
    .map(
      (a, idx) =>
        `<xdr:twoCellAnchor>` +
        `<xdr:from><xdr:col>${a.fromCol0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.fromRow0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
        `<xdr:to><xdr:col>${a.toCol0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.toRow0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
        `<xdr:graphicFrame macro="">` +
        `<xdr:nvGraphicFramePr><xdr:cNvPr id="${idx + 2}" name="${escapeXml(
          a.name
        )}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
        `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
        `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${a.relId}"/></a:graphicData></a:graphic>` +
        `</xdr:graphicFrame>` +
        `<xdr:clientData/>` +
        `</xdr:twoCellAnchor>`
    )
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/spreadsheetml/2006/drawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    anchorXml +
    `</xdr:wsDr>`
  );
}

interface AggregatedRow {
  label: string;
  count: number;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
}

export async function generateSalesExcelBlob({
  sales,
  productCostMap,
  storeName = 'MƏKTƏBLİ',
  periodLabel,
}: ExportSalesWorkbookOptions): Promise<Blob> {
  const strings = new SharedStringsPool();

  // =========================================================================
  // SHEET 1: "Satış Siyahısı"
  // =========================================================================
  const s1Rows = new Map<number, RowMap>();
  const s1Heights = new Map<number, number>();
  const s1Merges: string[] = [];

  const exportedAt = new Date().toLocaleString('az-AZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Banner Row 1 & Subtitle Row 2
  s1Heights.set(1, 30);
  fillMergedStyleRow(
    s1Rows,
    1,
    1,
    16,
    ST.TITLE,
    `${storeName} — Satış, Maya Dəyəri və Xalis Gəlir Hesabatı`
  );
  s1Merges.push('A1:P1');

  s1Heights.set(2, 20);
  fillMergedStyleRow(
    s1Rows,
    2,
    1,
    16,
    ST.SUBTITLE,
    `Dövr: ${periodLabel}   |   Hazırlanma tarixi: ${exportedAt}   |   Satış sətri: ${sales.length}`
  );
  s1Merges.push('A2:P2');

  s1Heights.set(3, 9);

  // Totals pre-calculation
  let totalSoldQty = 0;
  let totalReturnedQty = 0;
  let totalNetQty = 0;
  let totalRevenue = 0;
  let totalCost = 0;
  let totalProfit = 0;
  let costedRevenue = 0;
  let missingCostCount = 0;

  const firstDataRow = 8;
  const lastDataRow = firstDataRow + sales.length - 1;
  const totalRow = lastDataRow + 1;

  sales.forEach((sale, idx) => {
    const r = firstDataRow + idx;
    const isOdd = idx % 2 === 1;
    s1Heights.set(r, 21);

    const returnedQty = typeof sale.returnedQuantity === 'number' ? sale.returnedQuantity : 0;
    const netQty = getNetSaleQuantity(sale);
    const netAmt = getNetSaleAmount(sale);
    const unitCost = getSaleUnitCost(sale, productCostMap);
    const costAmt = getSaleCostAmount(sale, productCostMap);
    const profitAmt = getSaleNetProfit(sale, productCostMap);

    totalSoldQty = round2(totalSoldQty + sale.quantity);
    totalReturnedQty = round2(totalReturnedQty + returnedQty);
    totalNetQty = round2(totalNetQty + netQty);
    totalRevenue = round2(totalRevenue + netAmt);
    if (costAmt !== null && profitAmt !== null) {
      totalCost = round2(totalCost + costAmt);
      totalProfit = round2(totalProfit + profitAmt);
      costedRevenue = round2(costedRevenue + netAmt);
    } else if (netQty > 0) {
      missingCostCount += 1;
    }

    const stLeft = isOdd ? ST.ODD_LEFT : ST.EVEN_LEFT;
    const stCenter = isOdd ? ST.ODD_CENTER : ST.EVEN_CENTER;
    const stQty = isOdd ? ST.ODD_QTY : ST.EVEN_QTY;
    const stMoney = isOdd ? ST.ODD_MONEY : ST.EVEN_MONEY;
    const stBlue = isOdd ? ST.ODD_BLUE : ST.EVEN_BLUE;
    const stAmber = isOdd ? ST.ODD_AMBER : ST.EVEN_AMBER;

    setCell(s1Rows, r, 1, { type: 'n', value: idx + 1, style: stCenter });
    setCell(s1Rows, r, 2, {
      type: 's',
      value: formatDateTime(sale.soldAt, sale.id),
      style: stCenter,
    });
    setCell(s1Rows, r, 3, {
      type: 's',
      value: sale.receiptNumber || 'Tək satış',
      style: stCenter,
    });
    setCell(s1Rows, r, 4, {
      type: 's',
      value: formatPaymentMethodLabel(sale.paymentMethod),
      style: stCenter,
    });
    setCell(s1Rows, r, 5, { type: 's', value: sale.productName, style: stLeft });
    setCell(s1Rows, r, 6, { type: 's', value: sale.category, style: stLeft });
    setCell(s1Rows, r, 7, { type: 's', value: sale.barcode, style: stCenter });
    setCell(s1Rows, r, 8, { type: 'n', value: round2(sale.quantity), style: stQty });
    setCell(s1Rows, r, 9, { type: 'n', value: round2(returnedQty), style: stQty });
    setCell(s1Rows, r, 10, { type: 'n', value: round2(netQty), style: stQty });
    setCell(s1Rows, r, 11, { type: 's', value: sale.unit, style: stCenter });
    setCell(s1Rows, r, 12, { type: 'n', value: round2(sale.unitPrice), style: stMoney });

    if (unitCost !== undefined) {
      setCell(s1Rows, r, 13, { type: 'n', value: round2(unitCost), style: stMoney });
    } else {
      setCell(s1Rows, r, 13, { type: 's', value: '—', style: ST.MUTED_DASH });
    }

    setCell(s1Rows, r, 14, { type: 'n', value: round2(netAmt), style: stBlue });

    if (costAmt !== null) {
      setCell(s1Rows, r, 15, { type: 'n', value: round2(costAmt), style: stAmber });
    } else {
      setCell(s1Rows, r, 15, { type: 's', value: '—', style: ST.MUTED_DASH });
    }

    if (profitAmt !== null) {
      const profitStyle =
        profitAmt < 0
          ? isOdd
            ? ST.ODD_PROFIT_NEG
            : ST.EVEN_PROFIT_NEG
          : isOdd
          ? ST.ODD_PROFIT_POS
          : ST.EVEN_PROFIT_POS;
      setCell(s1Rows, r, 16, { type: 'n', value: round2(profitAmt), style: profitStyle });
    } else {
      setCell(s1Rows, r, 16, { type: 's', value: '—', style: ST.MUTED_DASH });
    }
  });

  // KPI Strip Rows 4 & 5 referencing Total Row formulas
  s1Heights.set(4, 18);
  s1Heights.set(5, 26);

  fillMergedStyleRow(s1Rows, 4, 1, 4, ST.KPI_LBL_BLUE, 'ÜMUMİ SATIŞ (DÖVRİYYƏ)');
  s1Merges.push('A4:D4');
  fillMergedStyleRow(s1Rows, 5, 1, 4, ST.KPI_VAL_BLUE);
  setCell(s1Rows, 5, 1, {
    type: 'f',
    formula: `N${totalRow}`,
    value: totalRevenue,
    style: ST.KPI_VAL_BLUE,
  });
  s1Merges.push('A5:D5');

  fillMergedStyleRow(s1Rows, 4, 5, 8, ST.KPI_LBL_AMBER, 'MAYA DƏYƏRİ (AYRI)');
  s1Merges.push('E4:H4');
  fillMergedStyleRow(s1Rows, 5, 5, 8, ST.KPI_VAL_AMBER);
  setCell(s1Rows, 5, 5, {
    type: 'f',
    formula: `O${totalRow}`,
    value: totalCost,
    style: ST.KPI_VAL_AMBER,
  });
  s1Merges.push('E5:H5');

  fillMergedStyleRow(s1Rows, 4, 9, 12, ST.KPI_LBL_GREEN, 'XALİS GƏLİR (MƏNFƏƏT)');
  s1Merges.push('I4:L4');
  fillMergedStyleRow(s1Rows, 5, 9, 12, ST.KPI_VAL_GREEN);
  setCell(s1Rows, 5, 9, {
    type: 'f',
    formula: `P${totalRow}`,
    value: totalProfit,
    style: ST.KPI_VAL_GREEN,
  });
  s1Merges.push('I5:L5');

  fillMergedStyleRow(s1Rows, 4, 13, 16, ST.KPI_LBL_SLATE, 'MƏNFƏƏT MARJASI');
  s1Merges.push('M4:P4');
  const marginRatio = costedRevenue > 0 ? totalProfit / costedRevenue : 0;
  fillMergedStyleRow(s1Rows, 5, 13, 16, ST.KPI_VAL_PCT);
  if (missingCostCount === 0) {
    setCell(s1Rows, 5, 13, {
      type: 'f',
      formula: `IF(N${totalRow}>0,P${totalRow}/N${totalRow},0)`,
      value: marginRatio,
      style: ST.KPI_VAL_PCT,
    });
  } else {
    setCell(s1Rows, 5, 13, {
      type: 'n',
      value: marginRatio,
      style: ST.KPI_VAL_PCT,
    });
  }
  s1Merges.push('M5:P5');

  s1Heights.set(6, 10);

  // Header Row 7
  s1Heights.set(7, 26);
  const s1Headers: Array<{ label: string; style: number }> = [
    { label: '№', style: ST.TH_CENTER },
    { label: 'Tarix / Saat', style: ST.TH_CENTER },
    { label: 'Çek №', style: ST.TH_CENTER },
    { label: 'Ödəniş', style: ST.TH_CENTER },
    { label: 'Məhsulun adı', style: ST.TH_LEFT },
    { label: 'Kateqoriya', style: ST.TH_LEFT },
    { label: 'Barkod', style: ST.TH_CENTER },
    { label: 'Satılan', style: ST.TH_RIGHT },
    { label: 'İadə', style: ST.TH_RIGHT },
    { label: 'Xalis miqdar', style: ST.TH_RIGHT },
    { label: 'Vahid', style: ST.TH_CENTER },
    { label: 'Satış qiyməti', style: ST.TH_RIGHT },
    { label: 'Alış qiyməti', style: ST.TH_RIGHT },
    { label: 'Satış məbləği', style: ST.TH_RIGHT },
    { label: 'Maya dəyəri', style: ST.TH_RIGHT },
    { label: 'Xalis gəlir', style: ST.TH_RIGHT },
  ];
  s1Headers.forEach((h, i) => {
    setCell(s1Rows, 7, i + 1, { type: 's', value: h.label, style: h.style });
  });

  // Totals Row
  s1Heights.set(totalRow, 24);
  fillMergedStyleRow(
    s1Rows,
    totalRow,
    1,
    7,
    ST.TOT_LEFT,
    `CƏMİ (${sales.length} satış sətri)`
  );
  s1Merges.push(`A${totalRow}:G${totalRow}`);

  setCell(s1Rows, totalRow, 8, {
    type: 'f',
    formula: `SUM(H${firstDataRow}:H${lastDataRow})`,
    value: totalSoldQty,
    style: ST.TOT_QTY,
  });
  setCell(s1Rows, totalRow, 9, {
    type: 'f',
    formula: `SUM(I${firstDataRow}:I${lastDataRow})`,
    value: totalReturnedQty,
    style: ST.TOT_QTY,
  });
  setCell(s1Rows, totalRow, 10, {
    type: 'f',
    formula: `SUM(J${firstDataRow}:J${lastDataRow})`,
    value: totalNetQty,
    style: ST.TOT_QTY,
  });
  for (let c = 11; c <= 13; c++) {
    setCell(s1Rows, totalRow, c, { type: 's', value: '', style: ST.TOT_BLANK });
  }
  setCell(s1Rows, totalRow, 14, {
    type: 'f',
    formula: `SUM(N${firstDataRow}:N${lastDataRow})`,
    value: totalRevenue,
    style: ST.TOT_BLUE,
  });
  setCell(s1Rows, totalRow, 15, {
    type: 'f',
    formula: `SUM(O${firstDataRow}:O${lastDataRow})`,
    value: totalCost,
    style: ST.TOT_AMBER,
  });
  setCell(s1Rows, totalRow, 16, {
    type: 'f',
    formula: `SUM(P${firstDataRow}:P${lastDataRow})`,
    value: totalProfit,
    style: totalProfit < 0 ? ST.TOT_RED : ST.TOT_GREEN,
  });

  let s1MaxRow = totalRow;
  if (missingCostCount > 0) {
    s1MaxRow = totalRow + 2;
    s1Heights.set(s1MaxRow, 18);
    setCell(s1Rows, s1MaxRow, 1, {
      type: 's',
      value: `Qeyd: ${missingCostCount} sətirdə məhsulun alış qiyməti (maya dəyəri) daxil edilmədiyi üçün "—" kimi göstərilmişdir.`,
      style: ST.NOTE,
    });
    s1Merges.push(`A${s1MaxRow}:P${s1MaxRow}`);
  }

  const s1ColWidths = [6, 18, 16, 13, 30, 18, 16, 10, 9, 13, 9, 14, 14, 16, 16, 16];

  // =========================================================================
  // SHEET 2: "Qrafik və Analitika" (Tables + Native OOXML Charts)
  // =========================================================================
  const s2SheetTitle = 'Qrafik və Analitika';
  const s2Rows = new Map<number, RowMap>();
  const s2Heights = new Map<number, number>();
  const s2Merges: string[] = [];

  s2Heights.set(1, 30);
  fillMergedStyleRow(
    s2Rows,
    1,
    1,
    16,
    ST.TITLE,
    `${storeName} — Qrafik və Maliyyə Analitikası`
  );
  s2Merges.push('A1:P1');

  s2Heights.set(2, 20);
  fillMergedStyleRow(
    s2Rows,
    2,
    1,
    16,
    ST.SUBTITLE,
    `Dövr: ${periodLabel}   |   Satış məbləği, Maya dəyəri və Xalis gəlir qrafikləri`
  );
  s2Merges.push('A2:P2');

  s2Heights.set(3, 10);

  // Group by date to check whether multi-day or single-day
  const byDateMap = new Map<string, AggregatedRow>();
  const byCatMap = new Map<string, AggregatedRow>();
  const byProductMap = new Map<string, AggregatedRow>();

  for (const s of sales) {
    const ms = getSaleMs(s);
    const dateKey = getLocalDateKey(ms);
    const netQty = getNetSaleQuantity(s);
    const netAmt = getNetSaleAmount(s);
    const cost = getSaleCostAmount(s, productCostMap) ?? 0;
    const profit = getSaleNetProfit(s, productCostMap) ?? 0;

    const dEntry = byDateMap.get(dateKey) || {
      label: formatDisplayDateFromKey(dateKey),
      count: 0,
      units: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
    };
    dEntry.count += 1;
    dEntry.units = round2(dEntry.units + netQty);
    dEntry.revenue = round2(dEntry.revenue + netAmt);
    dEntry.cost = round2(dEntry.cost + cost);
    dEntry.profit = round2(dEntry.profit + profit);
    byDateMap.set(dateKey, dEntry);

    const catKey = s.category || 'Digər';
    const cEntry = byCatMap.get(catKey) || {
      label: catKey,
      count: 0,
      units: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
    };
    cEntry.count += 1;
    cEntry.units = round2(cEntry.units + netQty);
    cEntry.revenue = round2(cEntry.revenue + netAmt);
    cEntry.cost = round2(cEntry.cost + cost);
    cEntry.profit = round2(cEntry.profit + profit);
    byCatMap.set(catKey, cEntry);

    const prodKey = s.productName || s.productId;
    const pEntry = byProductMap.get(prodKey) || {
      label: prodKey,
      count: 0,
      units: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
    };
    pEntry.count += 1;
    pEntry.units = round2(pEntry.units + netQty);
    pEntry.revenue = round2(pEntry.revenue + netAmt);
    pEntry.cost = round2(pEntry.cost + cost);
    pEntry.profit = round2(pEntry.profit + profit);
    byProductMap.set(prodKey, pEntry);
  }

  const useDailySeries = byDateMap.size >= 2;
  const primaryRows: AggregatedRow[] = useDailySeries
    ? Array.from(byDateMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, v]) => v)
    : byCatMap.size >= 2
    ? Array.from(byCatMap.values()).sort((a, b) => b.revenue - a.revenue)
    : Array.from(byProductMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

  const primarySectionTitle = useDailySeries
    ? '1. Günlər üzrə Satış, Maya və Xalis Gəlir'
    : byCatMap.size >= 2
    ? '1. Kateqoriyalar üzrə Satış, Maya və Xalis Gəlir'
    : '1. Məhsullar üzrə Satış, Maya və Xalis Gəlir';
  const primaryLabelColHeader = useDailySeries
    ? 'Tarix'
    : byCatMap.size >= 2
    ? 'Kateqoriya'
    : 'Məhsul';
  const chart1Title = useDailySeries
    ? 'Günlər üzrə Satış, Maya Dəyəri və Xalis Gəlir'
    : byCatMap.size >= 2
    ? 'Kateqoriyalar üzrə Satış, Maya Dəyəri və Xalis Gəlir'
    : 'Satış, Maya Dəyəri və Xalis Gəlir Müqayisəsi';

  // Table 1 (Rows 4..5 headers, data starting row 6)
  s2Heights.set(4, 24);
  fillMergedStyleRow(s2Rows, 4, 1, 6, ST.SECTION, primarySectionTitle);
  s2Merges.push('A4:F4');

  s2Heights.set(5, 24);
  setCell(s2Rows, 5, 1, { type: 's', value: primaryLabelColHeader, style: ST.TH_LEFT });
  setCell(s2Rows, 5, 2, { type: 's', value: 'Satış sayı', style: ST.TH_RIGHT });
  setCell(s2Rows, 5, 3, { type: 's', value: 'Satış məbləği', style: ST.TH_RIGHT });
  setCell(s2Rows, 5, 4, { type: 's', value: 'Maya dəyəri', style: ST.TH_RIGHT });
  setCell(s2Rows, 5, 5, { type: 's', value: 'Xalis gəlir', style: ST.TH_RIGHT });
  setCell(s2Rows, 5, 6, { type: 's', value: 'Marja (%)', style: ST.TH_RIGHT });

  const t1StartRow = 6;
  primaryRows.forEach((row, idx) => {
    const r = t1StartRow + idx;
    const isOdd = idx % 2 === 1;
    s2Heights.set(r, 21);
    setCell(s2Rows, r, 1, {
      type: 's',
      value: row.label,
      style: isOdd ? ST.ODD_LEFT : ST.EVEN_LEFT,
    });
    setCell(s2Rows, r, 2, {
      type: 'n',
      value: row.count,
      style: isOdd ? ST.ODD_QTY : ST.EVEN_QTY,
    });
    setCell(s2Rows, r, 3, {
      type: 'n',
      value: row.revenue,
      style: isOdd ? ST.ODD_BLUE : ST.EVEN_BLUE,
    });
    setCell(s2Rows, r, 4, {
      type: 'n',
      value: row.cost,
      style: isOdd ? ST.ODD_AMBER : ST.EVEN_AMBER,
    });
    setCell(s2Rows, r, 5, {
      type: 'f',
      formula: `C${r}-D${r}`,
      value: round2(row.revenue - row.cost),
      style:
        row.revenue - row.cost < 0
          ? isOdd
            ? ST.ODD_PROFIT_NEG
            : ST.EVEN_PROFIT_NEG
          : isOdd
          ? ST.ODD_PROFIT_POS
          : ST.EVEN_PROFIT_POS,
    });
    const mRatio = row.revenue > 0 ? (row.revenue - row.cost) / row.revenue : 0;
    setCell(s2Rows, r, 6, {
      type: 'f',
      formula: `IF(C${r}>0,E${r}/C${r},0)`,
      value: mRatio,
      style: isOdd ? ST.ODD_PCT : ST.EVEN_PCT,
    });
  });

  const t1EndRow = t1StartRow + primaryRows.length - 1;
  const t1TotRow = t1EndRow + 1;
  s2Heights.set(t1TotRow, 23);
  setCell(s2Rows, t1TotRow, 1, { type: 's', value: 'CƏMİ', style: ST.TOT_LEFT });
  setCell(s2Rows, t1TotRow, 2, {
    type: 'f',
    formula: `SUM(B${t1StartRow}:B${t1EndRow})`,
    value: primaryRows.reduce((acc, r) => acc + r.count, 0),
    style: ST.TOT_QTY,
  });
  setCell(s2Rows, t1TotRow, 3, {
    type: 'f',
    formula: `SUM(C${t1StartRow}:C${t1EndRow})`,
    value: round2(primaryRows.reduce((acc, r) => acc + r.revenue, 0)),
    style: ST.TOT_BLUE,
  });
  setCell(s2Rows, t1TotRow, 4, {
    type: 'f',
    formula: `SUM(D${t1StartRow}:D${t1EndRow})`,
    value: round2(primaryRows.reduce((acc, r) => acc + r.cost, 0)),
    style: ST.TOT_AMBER,
  });
  const t1ProfitSum = round2(
    primaryRows.reduce((acc, r) => acc + (r.revenue - r.cost), 0)
  );
  setCell(s2Rows, t1TotRow, 5, {
    type: 'f',
    formula: `SUM(E${t1StartRow}:E${t1EndRow})`,
    value: t1ProfitSum,
    style: t1ProfitSum < 0 ? ST.TOT_RED : ST.TOT_GREEN,
  });
  const t1RevSum = round2(primaryRows.reduce((acc, r) => acc + r.revenue, 0));
  setCell(s2Rows, t1TotRow, 6, {
    type: 'f',
    formula: `IF(C${t1TotRow}>0,E${t1TotRow}/C${t1TotRow},0)`,
    value: t1RevSum > 0 ? t1ProfitSum / t1RevSum : 0,
    style: ST.TOT_PCT,
  });

  // Table 2: Top 10 Products (starts below Table 1 AND below Chart 1 if short)
  const topProducts: AggregatedRow[] = Array.from(byProductMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const t2HeaderTitleRow = Math.max(t1TotRow + 3, 23);
  const t2ColHeaderRow = t2HeaderTitleRow + 1;
  const t2StartRow = t2ColHeaderRow + 1;

  s2Heights.set(t2HeaderTitleRow, 24);
  fillMergedStyleRow(
    s2Rows,
    t2HeaderTitleRow,
    1,
    6,
    ST.SECTION,
    '2. Ən Çox Satılan Məhsullar (Top 10)'
  );
  s2Merges.push(`A${t2HeaderTitleRow}:F${t2HeaderTitleRow}`);

  s2Heights.set(t2ColHeaderRow, 24);
  setCell(s2Rows, t2ColHeaderRow, 1, { type: 's', value: 'Məhsul', style: ST.TH_LEFT });
  setCell(s2Rows, t2ColHeaderRow, 2, { type: 's', value: 'Miqdar', style: ST.TH_RIGHT });
  setCell(s2Rows, t2ColHeaderRow, 3, {
    type: 's',
    value: 'Satış məbləği',
    style: ST.TH_RIGHT,
  });
  setCell(s2Rows, t2ColHeaderRow, 4, {
    type: 's',
    value: 'Maya dəyəri',
    style: ST.TH_RIGHT,
  });
  setCell(s2Rows, t2ColHeaderRow, 5, {
    type: 's',
    value: 'Xalis gəlir',
    style: ST.TH_RIGHT,
  });
  setCell(s2Rows, t2ColHeaderRow, 6, { type: 's', value: 'Marja (%)', style: ST.TH_RIGHT });

  topProducts.forEach((row, idx) => {
    const r = t2StartRow + idx;
    const isOdd = idx % 2 === 1;
    s2Heights.set(r, 21);
    setCell(s2Rows, r, 1, {
      type: 's',
      value: row.label,
      style: isOdd ? ST.ODD_LEFT : ST.EVEN_LEFT,
    });
    setCell(s2Rows, r, 2, {
      type: 'n',
      value: row.units,
      style: isOdd ? ST.ODD_QTY : ST.EVEN_QTY,
    });
    setCell(s2Rows, r, 3, {
      type: 'n',
      value: row.revenue,
      style: isOdd ? ST.ODD_BLUE : ST.EVEN_BLUE,
    });
    setCell(s2Rows, r, 4, {
      type: 'n',
      value: row.cost,
      style: isOdd ? ST.ODD_AMBER : ST.EVEN_AMBER,
    });
    setCell(s2Rows, r, 5, {
      type: 'f',
      formula: `C${r}-D${r}`,
      value: round2(row.revenue - row.cost),
      style:
        row.revenue - row.cost < 0
          ? isOdd
            ? ST.ODD_PROFIT_NEG
            : ST.EVEN_PROFIT_NEG
          : isOdd
          ? ST.ODD_PROFIT_POS
          : ST.EVEN_PROFIT_POS,
    });
    const mRatio = row.revenue > 0 ? (row.revenue - row.cost) / row.revenue : 0;
    setCell(s2Rows, r, 6, {
      type: 'f',
      formula: `IF(C${r}>0,E${r}/C${r},0)`,
      value: mRatio,
      style: isOdd ? ST.ODD_PCT : ST.EVEN_PCT,
    });
  });

  const t2EndRow = t2StartRow + topProducts.length - 1;
  const t2TotRow = t2EndRow + 1;
  s2Heights.set(t2TotRow, 23);
  setCell(s2Rows, t2TotRow, 1, { type: 's', value: 'TOP CƏMİ', style: ST.TOT_LEFT });
  setCell(s2Rows, t2TotRow, 2, {
    type: 'f',
    formula: `SUM(B${t2StartRow}:B${t2EndRow})`,
    value: round2(topProducts.reduce((acc, r) => acc + r.units, 0)),
    style: ST.TOT_QTY,
  });
  setCell(s2Rows, t2TotRow, 3, {
    type: 'f',
    formula: `SUM(C${t2StartRow}:C${t2EndRow})`,
    value: round2(topProducts.reduce((acc, r) => acc + r.revenue, 0)),
    style: ST.TOT_BLUE,
  });
  setCell(s2Rows, t2TotRow, 4, {
    type: 'f',
    formula: `SUM(D${t2StartRow}:D${t2EndRow})`,
    value: round2(topProducts.reduce((acc, r) => acc + r.cost, 0)),
    style: ST.TOT_AMBER,
  });
  const t2ProfitSum = round2(
    topProducts.reduce((acc, r) => acc + (r.revenue - r.cost), 0)
  );
  setCell(s2Rows, t2TotRow, 5, {
    type: 'f',
    formula: `SUM(E${t2StartRow}:E${t2EndRow})`,
    value: t2ProfitSum,
    style: t2ProfitSum < 0 ? ST.TOT_RED : ST.TOT_GREEN,
  });
  const t2RevSum = round2(topProducts.reduce((acc, r) => acc + r.revenue, 0));
  setCell(s2Rows, t2TotRow, 6, {
    type: 'f',
    formula: `IF(C${t2TotRow}>0,E${t2TotRow}/C${t2TotRow},0)`,
    value: t2RevSum > 0 ? t2ProfitSum / t2RevSum : 0,
    style: ST.TOT_PCT,
  });

  // Build Chart 1 & Chart 2 XML
  const quotedS2 = `'${s2SheetTitle}'`;
  const chart1Xml = buildBarChartXml({
    title: chart1Title,
    barDir: 'col',
    categoriesRangeRef: `${quotedS2}!$A$${t1StartRow}:$A$${t1EndRow}`,
    categories: primaryRows.map((r) => r.label),
    series: [
      {
        nameCellRef: `${quotedS2}!$C$5`,
        name: 'Satış məbləği',
        valuesRangeRef: `${quotedS2}!$C$${t1StartRow}:$C$${t1EndRow}`,
        values: primaryRows.map((r) => r.revenue),
        colorHex: '1976F3',
      },
      {
        nameCellRef: `${quotedS2}!$D$5`,
        name: 'Maya dəyəri',
        valuesRangeRef: `${quotedS2}!$D$${t1StartRow}:$D$${t1EndRow}`,
        values: primaryRows.map((r) => r.cost),
        colorHex: 'F59E0B',
      },
      {
        nameCellRef: `${quotedS2}!$E$5`,
        name: 'Xalis gəlir',
        valuesRangeRef: `${quotedS2}!$E$${t1StartRow}:$E$${t1EndRow}`,
        values: primaryRows.map((r) => round2(r.revenue - r.cost)),
        colorHex: '05A660',
      },
    ],
  });

  const chart2Xml = buildBarChartXml({
    title: 'Top Məhsullar: Satış və Xalis Gəlir',
    barDir: 'bar',
    categoriesRangeRef: `${quotedS2}!$A$${t2StartRow}:$A$${t2EndRow}`,
    categories: topProducts.map((r) => r.label),
    series: [
      {
        nameCellRef: `${quotedS2}!$C$${t2ColHeaderRow}`,
        name: 'Satış məbləği',
        valuesRangeRef: `${quotedS2}!$C$${t2StartRow}:$C$${t2EndRow}`,
        values: topProducts.map((r) => r.revenue),
        colorHex: '1976F3',
      },
      {
        nameCellRef: `${quotedS2}!$E$${t2ColHeaderRow}`,
        name: 'Xalis gəlir',
        valuesRangeRef: `${quotedS2}!$E$${t2StartRow}:$E$${t2EndRow}`,
        values: topProducts.map((r) => round2(r.revenue - r.cost)),
        colorHex: '05A660',
      },
    ],
  });

  const chart1EndRow0 = 21; // 0-indexed row 21 (Excel row 22)
  const chart2StartRow0 = t2HeaderTitleRow - 1;
  const chart2EndRow0 = Math.max(chart2StartRow0 + 16, t2TotRow + 1);

  const drawingXml = buildDrawingXml([
    {
      relId: 'rId1',
      name: 'Qrafik 1 — Satış, Maya və Xalis Gəlir',
      fromCol0: 7, // Col H
      fromRow0: 3, // Row 4
      toCol0: 16, // Col Q
      toRow0: chart1EndRow0,
    },
    {
      relId: 'rId2',
      name: 'Qrafik 2 — Top Məhsullar',
      fromCol0: 7, // Col H
      fromRow0: chart2StartRow0,
      toCol0: 16, // Col Q
      toRow0: chart2EndRow0,
    },
  ]);

  const s2MaxRow = Math.max(t2TotRow, chart2EndRow0 + 1);
  const s2ColWidths = [26, 12, 16, 16, 16, 12, 4, 12, 12, 12, 12, 12, 12, 12, 12, 12];

  // =========================================================================
  // Assemble OOXML Package with JSZip
  // =========================================================================
  const sheet1Xml = buildWorksheetXml(
    {
      rows: s1Rows,
      rowHeights: s1Heights,
      colWidths: s1ColWidths,
      merges: s1Merges,
      maxCol: 16,
      maxRow: s1MaxRow,
      freezeRow: 7,
      autoFilterRef: `A7:P${lastDataRow}`,
      landscape: true,
    },
    strings
  );

  const sheet2Xml = buildWorksheetXml(
    {
      rows: s2Rows,
      rowHeights: s2Heights,
      colWidths: s2ColWidths,
      merges: s2Merges,
      maxCol: 16,
      maxRow: s2MaxRow,
      drawingRelId: 'rId1',
      landscape: true,
    },
    strings
  );

  const stylesXml = buildStylesXml();
  const sharedStringsXml = strings.toXml();

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
    `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` +
    `<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>` +
    `<Override PartName="/xl/charts/chart2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>` +
    `</Types>`;

  const rootRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>` +
    `<sheet name="Satış Siyahısı" sheetId="1" r:id="rId1"/>` +
    `<sheet name="${escapeXml(s2SheetTitle)}" sheetId="2" r:id="rId2"/>` +
    `</sheets>` +
    `</workbook>`;

  const workbookRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
    `</Relationships>`;

  const sheet2RelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>` +
    `</Relationships>`;

  const drawing1RelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart2.xml"/>` +
    `</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', rootRelsXml);
  zip.file('xl/workbook.xml', workbookXml);
  zip.file('xl/_rels/workbook.xml.rels', workbookRelsXml);
  zip.file('xl/styles.xml', stylesXml);
  zip.file('xl/sharedStrings.xml', sharedStringsXml);
  zip.file('xl/worksheets/sheet1.xml', sheet1Xml);
  zip.file('xl/worksheets/sheet2.xml', sheet2Xml);
  zip.file('xl/worksheets/_rels/sheet2.xml.rels', sheet2RelsXml);
  zip.file('xl/drawings/drawing1.xml', drawingXml);
  zip.file('xl/drawings/_rels/drawing1.xml.rels', drawing1RelsXml);
  zip.file('xl/charts/chart1.xml', chart1Xml);
  zip.file('xl/charts/chart2.xml', chart2Xml);

  return zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
