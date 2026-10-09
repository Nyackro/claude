// Пласты (GDD, раздел 6). В этой сборке играбельны 1-3, остальные описаны для следующих обновлений.

export type BossKind = 'collapse' | 'flood' | 'fire' | 'generic';

export interface Palette {
  bg: string;
  bg2: string;
  dirt: string;
  clay: string;
  stone: string;
  hard: string;
  bedrock: string;
  sand: string;
  boulder: string;
}

export interface LayerDef {
  id: number;
  name: string;
  depth: string;
  pal: Palette;
  mat: [number, number, number, number]; // веса: грунт, глина, камень, твёрдая
  cave: number;
  hazards: { boulders: number; sand: number; stalactites: number; water: number; gas: number };
  light: number;                       // радиус света в клетках, 0 = без тьмы
  boss: { kind: BossKind; name: string; desc: string };
  gear?: string;
  ready: boolean;
}

export const LAYERS: LayerDef[] = [
  {
    id: 1, name: 'Дёрн и глина', depth: '0-300 м',
    pal: { bg: '#21150d', bg2: '#2c1d13', dirt: '#6b4426', clay: '#9a5b35', stone: '#6f6a63', hard: '#4b4743', bedrock: '#262120', sand: '#c4a466', boulder: '#8a8178' },
    mat: [52, 30, 14, 4], cave: 0.36,
    hazards: { boulders: 6, sand: 3, stalactites: 0, water: 0, gas: 0 },
    light: 0,
    boss: { kind: 'collapse', name: 'Большой обвал', desc: 'Потолок рушится ряд за рядом. Копай вниз быстрее обвала!' },
    ready: true,
  },
  {
    id: 2, name: 'Известняковые пещеры', depth: '300-600 м',
    pal: { bg: '#121c25', bg2: '#192633', dirt: '#b8a47d', clay: '#8f7a5d', stone: '#878781', hard: '#5a5c5e', bedrock: '#25292c', sand: '#d8c48e', boulder: '#a09c92' },
    mat: [42, 24, 24, 10], cave: 0.38,
    hazards: { boulders: 5, sand: 2, stalactites: 6, water: 4, gas: 0 },
    light: 0,
    boss: { kind: 'flood', name: 'Половодье', desc: 'Сверху прорвало воду. Она идёт следом по твоим тоннелям!' },
    ready: true,
  },
  {
    id: 3, name: 'Угольные пласты', depth: '600-900 м',
    pal: { bg: '#0b0908', bg2: '#13100e', dirt: '#3d3632', clay: '#4c423b', stone: '#5c5753', hard: '#302c2a', bedrock: '#181514', sand: '#6e655c', boulder: '#67605a' },
    mat: [36, 24, 28, 12], cave: 0.35,
    hazards: { boulders: 5, sand: 1, stalactites: 2, water: 1, gas: 6 },
    light: 4.5,
    boss: { kind: 'fire', name: 'Подземный пожар', desc: 'Уголь загорелся. Огонь бежит по жилам, режь просеки и уходи вниз!' },
    gear: 'gasmask',
    ready: true,
  },
  {
    id: 4, name: 'Гранитный щит', depth: '900-1200 м',
    pal: { bg: '#1a1416', bg2: '#241b1e', dirt: '#8a6f6a', clay: '#9c7d75', stone: '#a08a86', hard: '#6d5a57', bedrock: '#2a2224', sand: '#b39c8f', boulder: '#b1a29d' },
    mat: [20, 20, 40, 20], cave: 0.33,
    hazards: { boulders: 9, sand: 1, stalactites: 2, water: 1, gas: 1 },
    light: 0,
    boss: { kind: 'generic', name: 'Печать', desc: 'Плита 5x4 со слабыми точками.' },
    gear: 'steelbit', ready: false,
  },
  {
    id: 5, name: 'Кристальные гроты', depth: '1200-1500 м',
    pal: { bg: '#150f22', bg2: '#1e1630', dirt: '#5e4f7a', clay: '#6d5a8f', stone: '#7a6f96', hard: '#4a4166', bedrock: '#1d1828', sand: '#9b8fc0', boulder: '#8c82ad' },
    mat: [30, 25, 30, 15], cave: 0.42,
    hazards: { boulders: 5, sand: 1, stalactites: 6, water: 1, gas: 0 },
    light: 0,
    boss: { kind: 'generic', name: 'Резонанс', desc: 'Разбей кристаллы в порядке звучания.' },
    ready: false,
  },
  {
    id: 6, name: 'Грибная чаща', depth: '1500-1800 м',
    pal: { bg: '#0d1714', bg2: '#13211c', dirt: '#3f5a4c', clay: '#4f6b58', stone: '#5b6f66', hard: '#344740', bedrock: '#141d1a', sand: '#7aa08a', boulder: '#6c8277' },
    mat: [40, 25, 25, 10], cave: 0.45,
    hazards: { boulders: 4, sand: 2, stalactites: 2, water: 2, gas: 2 },
    light: 5.5,
    boss: { kind: 'generic', name: 'Грибница', desc: 'Обгони зарастание, срежь узлы.' },
    gear: 'sporefilter', ready: false,
  },
  {
    id: 7, name: 'Подземный ледник', depth: '1800-2100 м',
    pal: { bg: '#0f1a24', bg2: '#152433', dirt: '#9ab7c8', clay: '#7f9fb3', stone: '#8fa4b0', hard: '#5d7484', bedrock: '#1c2630', sand: '#c9dde8', boulder: '#a9bcc7' },
    mat: [30, 30, 25, 15], cave: 0.40,
    hazards: { boulders: 5, sand: 3, stalactites: 8, water: 2, gas: 0 },
    light: 0,
    boss: { kind: 'generic', name: 'Лавина', desc: 'Скоростной спуск по склону.' },
    gear: 'crampons', ready: false,
  },
  {
    id: 8, name: 'Магматические камеры', depth: '2100-2400 м',
    pal: { bg: '#1a0a06', bg2: '#260f08', dirt: '#5a2f22', clay: '#6e3826', stone: '#5e4a44', hard: '#3a2a26', bedrock: '#1c100d', sand: '#8a5a44', boulder: '#6e5a52' },
    mat: [25, 25, 30, 20], cave: 0.38,
    hazards: { boulders: 6, sand: 2, stalactites: 2, water: 2, gas: 2 },
    light: 0,
    boss: { kind: 'generic', name: 'Извержение', desc: 'Лава пульсирует, строй обсидиановые мосты.' },
    gear: 'thermosuit', ready: false,
  },
  {
    id: 9, name: 'Город Предтеч', depth: '2400-2700 м',
    pal: { bg: '#0f1418', bg2: '#151c22', dirt: '#6f6a55', clay: '#827b62', stone: '#8d8a78', hard: '#5c5a4c', bedrock: '#1b1c18', sand: '#a59f80', boulder: '#9a9580' },
    mat: [25, 25, 30, 20], cave: 0.40,
    hazards: { boulders: 6, sand: 2, stalactites: 3, water: 2, gas: 1 },
    light: 0,
    boss: { kind: 'generic', name: 'Врата Предтеч', desc: 'Запусти механизм, направив воду.' },
    ready: false,
  },
  {
    id: 10, name: 'Ядро', depth: '2700-3000 м',
    pal: { bg: '#100c18', bg2: '#181226', dirt: '#5a4a6e', clay: '#6a5680', stone: '#75688a', hard: '#4a3f5e', bedrock: '#1a1424', sand: '#9282ab', boulder: '#857a9a' },
    mat: [20, 25, 30, 25], cave: 0.40,
    hazards: { boulders: 6, sand: 2, stalactites: 2, water: 1, gas: 1 },
    light: 0,
    boss: { kind: 'generic', name: 'Сердце Мира', desc: 'Оболочки с переворотом гравитации.' },
    gear: 'gravanchor', ready: false,
  },
];

export const layerDef = (id: number): LayerDef => LAYERS[Math.max(1, Math.min(LAYERS.length, id)) - 1];
export const lastReadyLayer = (): number => LAYERS.filter((l) => l.ready).length;
