import eraserImg from '../assets/stationery/eraser.png';
import folderImg from '../assets/stationery/folder.png';
import glueTapeImg from '../assets/stationery/glue_tape.png';
import markerImg from '../assets/stationery/marker.png';
import notebookImg from '../assets/stationery/notebook.png';
import paintBrushImg from '../assets/stationery/paint_brush.png';
import paperImg from '../assets/stationery/paper.png';
import penImg from '../assets/stationery/pen.png';
import pencilImg from '../assets/stationery/pencil.png';
import rulerImg from '../assets/stationery/ruler.png';
import scissorsStaplerImg from '../assets/stationery/scissors_stapler.png';
import stationeryDefaultImg from '../assets/stationery/stationery_default.png';

export interface StationeryAsset {
  src: string;
  alt: string;
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

export function getStationeryImage(name: string, category = ''): StationeryAsset {
  const normName = normalizeAzText(name);
  const normCat = normalizeAzText(category);
  const combined = `${normName} ${normCat}`;

  // 1. Eraser & Correction (check early so "karandas pozani" hits eraser)
  if (hasAnyKeyword(normName, ['pozan', 'silgi', 'korrektor', 'eraser', 'lastik'])) {
    return { src: eraserImg, alt: `${name || 'Pozan'} illüstrasiyası` };
  }

  // 2. Marker & Highlighter
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
    return { src: markerImg, alt: `${name || 'Marker'} illüstrasiyası` };
  }

  // 3. Pencil (check before pen so "qelem ve karandas" prefers name match accurately)
  if (
    hasAnyKeyword(normName, [
      'karandas',
      'qrafit',
      'karandash',
      'pencil',
      'mexaniki karandas',
    ])
  ) {
    return { src: pencilImg, alt: `${name || 'Karandaş'} illüstrasiyası` };
  }

  // 4. Pen
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
    return { src: penImg, alt: `${name || 'Qələm'} illüstrasiyası` };
  }

  // 5. Notebook / Diary / Notepad
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
    return { src: notebookImg, alt: `${name || 'Dəftər'} illüstrasiyası` };
  }

  // 6. Ruler / Geometry
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
    return { src: rulerImg, alt: `${name || 'Xətkeş'} illüstrasiyası` };
  }

  // 7. Folder / Binder / File
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
    return { src: folderImg, alt: `${name || 'Qovluq'} illüstrasiyası` };
  }

  // 8. Glue & Tape
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
    return { src: glueTapeImg, alt: `${name || 'Yapışqan və lent'} illüstrasiyası` };
  }

  // 9. Scissors / Stapler / Clips
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
    return {
      src: scissorsStaplerImg,
      alt: `${name || 'Qayçı və stepler'} illüstrasiyası`,
    };
  }

  // 10. Paint / Brush / Art supplies
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
    return { src: paintBrushImg, alt: `${name || 'Boya və fırça'} illüstrasiyası` };
  }

  // 11. Office Paper / A4 / Sticky notes
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
    return { src: paperImg, alt: `${name || 'Kağız'} illüstrasiyası` };
  }

  // Fallback by Category if specific product name didn't match
  if (hasAnyKeyword(combined, ['yazi', 'qelem', 'karandas'])) {
    return { src: penImg, alt: `${name || 'Yazı ləvazimatı'} illüstrasiyası` };
  }
  if (hasAnyKeyword(combined, ['defter', 'bloknot'])) {
    return { src: notebookImg, alt: `${name || 'Dəftər'} illüstrasiyası` };
  }
  if (hasAnyKeyword(combined, ['kagiz', 'ofis kagiz'])) {
    return { src: paperImg, alt: `${name || 'Kağız'} illüstrasiyası` };
  }
  if (hasAnyKeyword(combined, ['qovluq', 'arxiv', 'fayl'])) {
    return { src: folderImg, alt: `${name || 'Qovluq'} illüstrasiyası` };
  }
  if (hasAnyKeyword(combined, ['yapisqan', 'bant', 'kley'])) {
    return { src: glueTapeImg, alt: `${name || 'Yapışqan'} illüstrasiyası` };
  }
  if (hasAnyKeyword(combined, ['resm', 'boya', 'hobbi'])) {
    return { src: paintBrushImg, alt: `${name || 'Rəsm ləvazimatı'} illüstrasiyası` };
  }
  if (hasAnyKeyword(combined, ['masa', 'ofis'])) {
    return {
      src: scissorsStaplerImg,
      alt: `${name || 'Ofis ləvazimatı'} illüstrasiyası`,
    };
  }

  return {
    src: stationeryDefaultImg,
    alt: `${name || 'Dəftərxana ləvazimatı'} illüstrasiyası`,
  };
}
