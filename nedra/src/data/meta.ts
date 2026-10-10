// Посёлок: постоянные улучшения за слитки, и покупки за реальные деньги.
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
  { id: 'forge', name: 'Кузница', desc: 'Кирка с самого начала сильнее.', base: 20, growth: 1.5, max: 20,
    effect: (l) => `кирка +${10 * l}%` },
  { id: 'armory', name: 'Оружейная', desc: 'Меч с самого начала сильнее.', base: 20, growth: 1.5, max: 20,
    effect: (l) => `меч +${10 * l}%` },
  { id: 'infirmary', name: 'Лазарет', desc: 'Больше здоровья в экспедиции.', base: 25, growth: 1.55, max: 15,
    effect: (l) => `здоровье +${4 * l}` },
  { id: 'storage', name: 'Склад', desc: 'Монеты на первую лавку.', base: 30, growth: 1.6, max: 10,
    effect: (l) => `старт +${15 * l} монет` },
  { id: 'smelter', name: 'Плавильня', desc: 'Больше слитков из добычи.', base: 40, growth: 1.75, max: 20,
    effect: (l) => `слитки +${10 * l}%` },
  { id: 'insurance', name: 'Страховая контора', desc: 'Если гнома вытащат спасатели, сохранится больше добычи.', base: 100, growth: 6, max: 5,
    effect: (l) => `эвакуация ${50 + 5 * l}%` },
];

export const buildingLevel = (m: MetaState, id: string): number => m.buildings[id] ?? 0;

export function buildingCost(b: BuildingDef, lvl: number): number {
  if (b.costs) return b.costs[lvl] ?? Infinity;
  return Math.round(b.base! * b.growth! ** lvl);
}

export interface ProductDef {
  id: string;
  name: string;
  desc: string;
  fallbackPrice: string;
}

export const PRODUCTS: ProductDef[] = [
  { id: 'no_ads', name: 'Без рекламы', desc: 'Убирает полноэкранную рекламу и баннер. Награды за рекламу остаются по желанию.', fallbackPrice: '149' },
  { id: 'starter_pack', name: 'Набор новичка', desc: '300 слитков и золотая каска.', fallbackPrice: '49' },
  { id: 'golden_smelter', name: 'Золотая плавильня', desc: '+50% слитков после каждой экспедиции навсегда.', fallbackPrice: '299' },
];
