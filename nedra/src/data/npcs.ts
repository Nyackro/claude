// Пленники Недр: четыре мастера томятся на фиксированных этажах. За забег можно спасти только одного,
// следующий появляется только в следующей экспедиции и глубже. Спасённые прокачивают героя в посёлке.
import type { MetaState } from '../core/state';
import type { PlayerStats } from '../core/stats';

export interface NpcUpgrade {
  id: string;
  name: string;
  desc: (lvl: number) => string;
  max: number;
  base: number;
  growth: number;
}

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  hall: string;
  layer: number;
  floor: number;
  greet: string;
  look: { hat: string; clothes: string; beard: string | null; hair: string | null; skin?: string };
  upgrades: NpcUpgrade[];
}

const u = (id: string, name: string, max: number, base: number, growth: number, desc: (l: number) => string): NpcUpgrade =>
  ({ id, name, max, base, growth, desc });

export const NPCS: NpcDef[] = [
  {
    id: 'smith', name: 'Гордей', title: 'кузнец', hall: 'Кузня Гордея', layer: 2, floor: 1,
    greet: 'Ох, спасибо! Обвал запер меня тут с наковальней. Наверху я подкую тебе удачу.',
    look: { hat: '#5a4636', clothes: '#8a3a26', beard: '#2a1a12', hair: null },
    upgrades: [
      u('temper', 'Закалка кирки', 3, 40, 2.2, (l) => `кирка начинает забег заточенной на +${l}`),
      u('edge', 'Закалка клинка', 3, 50, 2.2, (l) => `меч начинает забег заточенным на +${l}`),
      u('thrift', 'Бережливая ковка', 3, 70, 2.3, (l) => `ковка требует на ${15 * l}% меньше руды`),
      u('heirloom', 'Фамильный меч', 2, 150, 3, (l) => (l >= 2 ? 'начинать с железным мечом' : l ? 'начинать с медным мечом' : 'начинать с ржавым тесаком')),
      u('swing', 'Тяжёлая рука', 5, 60, 1.9, (l) => `урон меча +${8 * l}%`),
    ],
  },
  {
    id: 'healer', name: 'Ведана', title: 'знахарка', hall: 'Изба Веданы', layer: 4, floor: 1,
    greet: 'Свет! Я уж думала, сгину среди гранита. Пойдём, травы мои ещё целы.',
    look: { hat: '#3f7a4a', clothes: '#5a3a7a', beard: null, hair: '#d8d0c0' },
    upgrades: [
      u('potion', 'Целебное зелье', 3, 160, 2.4, (l) => `${l} зелья в забег: лечат 35% здоровья`),
      u('vigor', 'Живучесть', 5, 140, 1.8, (l) => `здоровье +${6 * l}`),
      u('herbs', 'Отвары', 3, 180, 2, (l) => `всё лечение сильнее на ${15 * l}%`),
      u('antidote', 'Противоядие', 2, 220, 2.5, (l) => `урон от яда, огня и льда на земле -${25 * l}%`),
      u('charm', 'Оберег', 1, 900, 1, (l) => (l ? 'раз за забег встать с 30% здоровья' : 'раз за забег встать с 30% здоровья (не куплено)')),
    ],
  },
  {
    id: 'mechanic', name: 'Прокоп', title: 'механик', hall: 'Мастерская Прокопа', layer: 6, floor: 1,
    greet: 'Наконец-то живая душа! Мои дроны съели грибы. Ну ничего, соберу новые.',
    look: { hat: '#c87a24', clothes: '#2a4a6e', beard: '#6a4a2a', hair: null },
    upgrades: [
      u('drone', 'Боевой дрон', 3, 450, 2.4, (l) => (l ? `дрон стреляет по врагам, урон x${l}` : 'дрон стреляет по врагам')),
      u('pack', 'Бездонный рюкзак', 3, 300, 2, (l) => `+${l} бомбы и +${2 * l} угля в начале забега`),
      u('lamp', 'Прожектор', 3, 350, 2, (l) => `свет фонаря +${(0.5 * l).toFixed(1)}`),
      u('magnet', 'Магнитный пояс', 2, 300, 2.2, (l) => `магнит +${(1.5 * l).toFixed(1)}`),
      u('gears', 'Пружинные сапоги', 3, 400, 2.1, (l) => `скорость +${5 * l}%`),
    ],
  },
  {
    id: 'sage', name: 'Велемир', title: 'хранитель рун', hall: 'Рунный круг Велемира', layer: 9, floor: 1,
    greet: 'Ты дошёл... Сотню лет я ждал того, кто не побоится Богомирона. Руны помогут тебе.',
    look: { hat: '#e8e0d0', clothes: '#3a3a6e', beard: '#f4f1ea', hair: null },
    upgrades: [
      u('fury', 'Руна ярости', 5, 1200, 1.8, (l) => `весь урон +${10 * l}%`),
      u('fortune', 'Руна удачи', 3, 1000, 2, (l) => `удача +${15 * l}%: предметы лучше`),
      u('haste', 'Руна времени', 3, 1100, 2, (l) => `способность перезаряжается на ${8 * l}% быстрее`),
      u('choice', 'Руна выбора', 1, 2500, 1, () => 'ещё один предмет на выбор после Разлома'),
      u('aegis', 'Руна света', 2, 1500, 2.4, (l) => `${l} щит на каждом этаже: первый удар не ранит`),
    ],
  },
];

export const npcDef = (id: string): NpcDef => NPCS.find((n) => n.id === id) ?? NPCS[0];

export const npcLevel = (m: MetaState, id: string): number => m.npcUp[id] ?? 0;

export const npcCost = (up: NpcUpgrade, lvl: number): number => Math.round(up.base * up.growth ** lvl);

/** Следующий пленник, который может появиться (по порядку). */
export function nextCaptive(m: MetaState): NpcDef | null {
  return NPCS.find((n) => !m.rescued.includes(n.id)) ?? null;
}

/** Постоянные эффекты спасённых на характеристики героя. */
export function applyNpcStats(m: MetaState, s: PlayerStats): void {
  const L = (id: string) => npcLevel(m, id);
  s.swordDmg *= 1 + 0.08 * L('swing');
  s.maxHp += 6 * L('vigor');
  s.healMult *= 1 + 0.15 * L('herbs');
  s.zoneResist *= 1 - 0.25 * L('antidote');
  s.light += 0.5 * L('lamp');
  s.magnet += 1.5 * L('magnet');
  s.speed *= 1 + 0.05 * L('gears');
  s.dmgMult *= 1 + 0.1 * L('fury');
  s.luck += 0.15 * L('fortune');
  s.cdMult *= 1 - 0.08 * L('haste');
}
