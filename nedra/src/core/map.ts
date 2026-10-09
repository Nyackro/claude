import type { NodeType } from './gen';
import { Rng } from './rng';

export interface NodeInfo {
  name: string;
  desc: string;
  reward: string;
}

export const NODE_INFO: Record<NodeType, NodeInfo> = {
  normal: { name: 'Выработка', desc: 'Обычный ярус.', reward: 'Мини-лавка' },
  rich: { name: 'Богатая жила', desc: 'Руды +50%, опасностей больше.', reward: 'Мини-лавка' },
  danger: { name: 'Обвальная зона', desc: 'Опасности x2.', reward: 'Сундук: артефакт 1 из 3, не ниже редкого' },
  cache: { name: 'Тайник', desc: 'Короткий ярус.', reward: 'Событие с выбором' },
  fair: { name: 'Ярмарка', desc: 'Обычный ярус.', reward: 'Большая лавка с артефактами' },
  rest: { name: 'Привал', desc: 'Обычный ярус.', reward: 'Отдых: энергия, сердце или заточка' },
  boss: { name: 'Разлом', desc: 'Испытание пласта.', reward: 'Артефакт, чертёж, лифт к следующему пласту' },
};

const WEIGHTS: [NodeType, number][] = [['normal', 30], ['rich', 20], ['danger', 12], ['cache', 14], ['fair', 12], ['rest', 12]];

/** Карта пласта: 2 ряда по 3 узла + Разлом. */
export function genLayerMap(seed: number, tutorial: boolean): NodeType[][] {
  if (tutorial) return [['normal'], ['fair', 'rest'], ['boss']];
  const rng = new Rng(seed);
  const row = (): NodeType[] => {
    const pool = [...WEIGHTS];
    const out: NodeType[] = [];
    while (out.length < 3) {
      const pick = rng.weighted(pool, (w) => w[1]);
      out.push(pick[0]);
      pool.splice(pool.indexOf(pick), 1);
    }
    if (!out.includes('normal') && !out.includes('rich')) out[rng.int(0, 2)] = rng.chance(0.5) ? 'normal' : 'rich';
    return out;
  };
  return [row(), row(), ['boss']];
}
