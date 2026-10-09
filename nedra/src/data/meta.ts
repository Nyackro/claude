// Посёлок (GDD, раздел 9), снаряжение порогов и покупки (раздел 12.5).
import type { MetaState } from '../core/state';

export interface BuildingDef {
  id: string;
  name: string;
  desc: string;
  effect: (lvl: number) => string;
  base?: number;
  growth?: number;
  costs?: number[];
  max: number;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'forge', name: 'Кузница', desc: 'Сила удара: блоки дешевле по энергии.', base: 20, growth: 1.56, max: 60,
    effect: (l) => `сила x${(1.18 ** l).toFixed(2)}` },
  { id: 'canteen', name: 'Столовая', desc: 'Больше энергии на экспедицию.', base: 10, growth: 1.5, max: 25,
    effect: (l) => `энергия ${Math.round(100 * (1 + 0.12 * l))}` },
  { id: 'survey', name: 'Геологоразведка', desc: 'Руда стоит дороже.', base: 25, growth: 1.65, max: 25,
    effect: (l) => `руда +${6 * l}%` },
  { id: 'smelter', name: 'Плавильня', desc: 'Больше слитков из добычи.', base: 40, growth: 1.75, max: 20,
    effect: (l) => `слитки +${10 * l}%` },
  { id: 'helmet', name: 'Каска-мастерская', desc: 'Дополнительные сердца.', costs: [60, 1200, 25000], max: 3,
    effect: (l) => `сердец ${3 + l}` },
  { id: 'insurance', name: 'Страховая контора', desc: 'Эвакуация сохраняет больше добычи.', base: 100, growth: 6, max: 5,
    effect: (l) => `эвакуация ${50 + 5 * l}%` },
];

export const buildingLevel = (m: MetaState, id: string): number => m.buildings[id] ?? 0;

export function buildingCost(b: BuildingDef, lvl: number): number {
  if (b.costs) return b.costs[lvl] ?? Infinity;
  return Math.round(b.base! * b.growth! ** lvl);
}

export interface GearDef {
  id: string;
  name: string;
  layer: number;
  cost: number;
  from: number;          // Разлом, из которого выпадает чертёж
  desc: string;
}

export const GEAR: GearDef[] = [
  { id: 'gasmask', name: 'Противогаз', layer: 3, cost: 40, from: 2, desc: 'Пропуск в Угольные пласты. Газ не отнимает энергию.' },
  { id: 'steelbit', name: 'Стальная коронка', layer: 4, cost: 150, from: 3, desc: 'Пропуск в Гранитный щит.' },
];

export const gearForLayer = (layer: number): GearDef | undefined => GEAR.find((g) => g.layer === layer);

export interface ProductDef {
  id: string;
  name: string;
  desc: string;
  permanent: boolean;
  fallbackPrice: string;
}

export const PRODUCTS: ProductDef[] = [
  { id: 'no_ads', name: 'Без рекламы', desc: 'Убирает полноэкранную рекламу и баннер. Награды за рекламу остаются по желанию.', permanent: true, fallbackPrice: '149' },
  { id: 'starter_pack', name: 'Набор новичка', desc: '300 слитков и золотая каска «Ветеран».', permanent: true, fallbackPrice: '49' },
  { id: 'golden_smelter', name: 'Золотая плавильня', desc: '+50% слитков после каждой экспедиции навсегда.', permanent: true, fallbackPrice: '299' },
];
