import eraserImg from '../assets/icons/eraser.png';
import folderImg from '../assets/icons/folder.png';
import glueTapeImg from '../assets/icons/glue_tape.png';
import markerImg from '../assets/icons/marker.png';
import notebookImg from '../assets/icons/notebook.png';
import paintBrushImg from '../assets/icons/paint_brush.png';
import paperImg from '../assets/icons/paper.png';
import penImg from '../assets/icons/pen.png';
import pencilImg from '../assets/icons/pencil.png';
import rulerImg from '../assets/icons/ruler.png';
import scissorsStaplerImg from '../assets/icons/scissors_stapler.png';
import stationeryDefaultImg from '../assets/icons/stationery_default.png';
import { STATIONERY_ICON_IDS, type StationeryIconId } from '../types/inventory';

export interface StationeryAsset {
  id: StationeryIconId;
  src: string;
  alt: string;
}

export interface StationeryIconOption {
  id: StationeryIconId;
  label: string;
  src: string;
}

const ICON_IMAGE_MAP: Record<StationeryIconId, string> = {
  pen: penImg,
  pencil: pencilImg,
  notebook: notebookImg,
  eraser: eraserImg,
  marker: markerImg,
  ruler: rulerImg,
  folder: folderImg,
  paper: paperImg,
  glue_tape: glueTapeImg,
  scissors_stapler: scissorsStaplerImg,
  paint_brush: paintBrushImg,
  stationery_default: stationeryDefaultImg,
};

export const STATIONERY_ICON_OPTIONS: StationeryIconOption[] = [
  { id: 'pen', label: 'Qələm', src: penImg },
  { id: 'pencil', label: 'Karandaş', src: pencilImg },
  { id: 'notebook', label: 'Dəftər', src: notebookImg },
  { id: 'eraser', label: 'Pozan', src: eraserImg },
  { id: 'marker', label: 'Marker', src: markerImg },
  { id: 'ruler', label: 'Xətkeş', src: rulerImg },
  { id: 'folder', label: 'Qovluq', src: folderImg },
  { id: 'paper', label: 'Kağız', src: paperImg },
  { id: 'glue_tape', label: 'Yapışqan', src: glueTapeImg },
  { id: 'scissors_stapler', label: 'Qayçı', src: scissorsStaplerImg },
  { id: 'paint_brush', label: 'Boya', src: paintBrushImg },
  { id: 'stationery_default', label: 'Digər', src: stationeryDefaultImg },
];

export function isValidStationeryIconId(value: unknown): value is StationeryIconId {
  return (
    typeof value === 'string' &&
    (STATIONERY_ICON_IDS as readonly string[]).includes(value)
  );
}

function normalizeAzText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ə/g, 'e')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/ç/g, 'c')
    .trim();
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

export function resolveStationeryIconId(
  name: string,
  category = '',
  explicitIcon?: string
): StationeryIconId {
  if (isValidStationeryIconId(explicitIcon)) {
    return explicitIcon;
  }

  const normName = normalizeAzText(name);
  const normCat = normalizeAzText(category);
  const combined = `${normName} ${normCat}`;

  if (hasAnyKeyword(normName, ['pozan', 'silgi', 'korrektor', 'eraser', 'lastik'])) {
    return 'eraser';
  }
  if (
    hasAnyKeyword(normName, [
      'marker',
      'flomaster',
      'flamaster',
      'highlighter',
      'textmarker',
      'tekstmarker',
    ])
  ) {
    return 'marker';
  }
  if (
    hasAnyKeyword(normName, [
      'karandas',
      'qrafit',
      'karandash',
      'pencil',
      'mexaniki karandas',
    ])
  ) {
    return 'pencil';
  }
  if (
    hasAnyKeyword(normName, [
      'qelem',
      'rucka',
      'diyircəkli',
      'diyircekli',
      'gel qelem',
      'piroqraf',
      'pen',
    ])
  ) {
    return 'pen';
  }
  if (
    hasAnyKeyword(normName, [
      'defter',
      'bloknot',
      'gundelik',
      'qeyd kitab',
      'kitabca',
      'notebook',
      'tetrad',
      'albom',
    ])
  ) {
    return 'notebook';
  }
  if (
    hasAnyKeyword(normName, [
      'xetkes',
      'transportir',
      'ucbucaq',
      'pergar',
      'ruler',
      'lineyka',
      'geometriya',
    ])
  ) {
    return 'ruler';
  }
  if (
    hasAnyKeyword(normName, [
      'qovluq',
      'fayl',
      'registrator',
      'skorosivatel',
      'papka',
      'arxiv',
      'folder',
    ])
  ) {
    return 'folder';
  }
  if (
    hasAnyKeyword(normName, [
      'yapisqan',
      'kley',
      'skotc',
      'skoc',
      'bant',
      'lent',
      'glue',
      'tape',
    ])
  ) {
    return 'glue_tape';
  }
  if (
    hasAnyKeyword(normName, [
      'qayci',
      'stepler',
      'skrepka',
      'sancaq',
      'delik acan',
      'bicaq',
      'kantalyar',
      'scissors',
      'stapler',
    ])
  ) {
    return 'scissors_stapler';
  }
  if (
    hasAnyKeyword(normName, [
      'boya',
      'akvarel',
      'guas',
      'firca',
      'plastilin',
      'resm',
      'palitra',
      'paint',
      'brush',
    ])
  ) {
    return 'paint_brush';
  }
  if (
    hasAnyKeyword(normName, [
      'kagiz',
      'a4',
      'a3',
      'a5',
      'vereq',
      'stiker',
      'kartoc',
      'paper',
      'bumaga',
    ])
  ) {
    return 'paper';
  }

  if (hasAnyKeyword(combined, ['yazi', 'qelem', 'karandas'])) {
    return 'pen';
  }
  if (hasAnyKeyword(combined, ['defter', 'bloknot'])) {
    return 'notebook';
  }
  if (hasAnyKeyword(combined, ['kagiz', 'ofis kagiz'])) {
    return 'paper';
  }
  if (hasAnyKeyword(combined, ['qovluq', 'arxiv', 'fayl'])) {
    return 'folder';
  }
  if (hasAnyKeyword(combined, ['yapisqan', 'bant', 'kley'])) {
    return 'glue_tape';
  }
  if (hasAnyKeyword(combined, ['resm', 'boya', 'hobbi'])) {
    return 'paint_brush';
  }
  if (hasAnyKeyword(combined, ['masa', 'ofis'])) {
    return 'scissors_stapler';
  }

  return 'stationery_default';
}

export function getStationeryImage(
  name: string,
  category = '',
  explicitIcon?: string
): StationeryAsset {
  const id = resolveStationeryIconId(name, category, explicitIcon);
  const option = STATIONERY_ICON_OPTIONS.find((item) => item.id === id);
  return {
    id,
    src: ICON_IMAGE_MAP[id],
    alt: `${name || option?.label || 'Dəftərxana ləvazimatı'} ikonu`,
  };
}
