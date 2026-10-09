import { HP0, HP_GROWTH, INGOTS_PER_COIN, NEWBIE_MULT, NEWBIE_RUNS, SURFACE_BONUS, V0, V_GROWTH } from '../config';
import { buildingLevel } from '../data/meta';
import { BLOCKS } from './blocks';
import type { MetaState, RunState } from './state';

/** Средняя прочность блока пласта. */
export const layerHp = (L: number): number => HP0 * HP_GROWTH ** (L - 1);

/** Р: средняя цена блока руды пласта, единица всех цен в забеге. */
export const layerR = (L: number): number => V0 * V_GROWTH ** (L - 1);

export const priceR = (r: number, L: number, mult = 1): number => Math.max(1, Math.round(r * layerR(L) * mult));

export function blockCost(block: number, layer: number, power: number, mult = 1): number {
  return Math.max(1, Math.round((layerHp(layer) * BLOCKS[block].hp * mult) / power));
}

export interface IngotLine {
  label: string;
  value: string;
}

export interface IngotResult {
  ingots: number;
  lines: IngotLine[];
}

export function computeIngots(meta: MetaState, run: RunState, keep: number): IngotResult {
  const lines: IngotLine[] = [];
  let v = run.haul * INGOTS_PER_COIN;
  lines.push({ label: 'Добыча: монеты / 20', value: `${Math.round(run.haul)}` });
  if (keep < 1) lines.push({ label: 'Эвакуация', value: `x${keep.toFixed(2)}` });
  v *= keep;
  const smelter = buildingLevel(meta, 'smelter');
  if (smelter) {
    v *= 1 + 0.1 * smelter;
    lines.push({ label: 'Плавильня', value: `+${smelter * 10}%` });
  }
  if (meta.purchases.goldenSmelter) {
    v *= 1.5;
    lines.push({ label: 'Золотая плавильня', value: '+50%' });
  }
  if (run.startLayer === 1 && !run.tutorial) {
    v *= 1 + SURFACE_BONUS;
    lines.push({ label: 'Честная экспедиция', value: `+${SURFACE_BONUS * 100}%` });
  }
  if (meta.stats.runs < NEWBIE_RUNS) {
    v *= NEWBIE_MULT;
    lines.push({ label: 'Удача новичка', value: `x${NEWBIE_MULT}` });
  }
  const ingots = run.haul > 0 ? Math.max(1, Math.floor(v)) : 0;
  return { ingots, lines };
}

export const formatNum = (n: number): string => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`;
  return String(Math.round(n));
};
