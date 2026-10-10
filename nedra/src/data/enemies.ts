// Враги пластов 1-3: обычные, мини-боссы боковых логов и боссы Разломов.

export type AI = 'chase' | 'burrow' | 'bat' | 'ranged' | 'bomber' | 'exploder'
  | 'queen' | 'mother' | 'baron' | 'worm' | 'golem' | 'salamander';

export interface Ranged {
  range: number;
  cd: number;
  speed: number;
  dmg: number;
  kind: 'web' | 'rock' | 'fire' | 'bomb';
}

export interface EnemyDef {
  id: string;
  name: string;
  layer: number;
  ai: AI;
  hp: number;
  dmg: number;
  speed: number;
  r: number;
  size: number;              // масштаб спрайта в клетках
  coins: [number, number];
  heart: number;             // шанс выронить сердечко
  armor?: number;
  ranged?: Ranged;
  blast?: { r: number; dmg: number };
  mini?: boolean;
  boss?: boolean;
  desc?: string;
}

const e = (x: EnemyDef) => x;

export const ENEMIES: EnemyDef[] = [
  e({ id: 'slime', name: 'Слизень', layer: 1, ai: 'chase', hp: 8, dmg: 3, speed: 1.5, r: 0.32, size: 1, coins: [1, 2], heart: 0.08 }),
  e({ id: 'beetle', name: 'Жук-землерой', layer: 1, ai: 'burrow', hp: 6, dmg: 2, speed: 2.0, r: 0.28, size: 1, coins: [1, 2], heart: 0.05,
    desc: 'Прогрызает мягкую породу' }),
  e({ id: 'bat', name: 'Летучая мышь', layer: 1, ai: 'bat', hp: 4, dmg: 2, speed: 3.0, r: 0.26, size: 1, coins: [1, 1], heart: 0.04 }),
  e({ id: 'slimeling', name: 'Слизнёнок', layer: 1, ai: 'chase', hp: 3, dmg: 1, speed: 2.1, r: 0.22, size: 0.7, coins: [0, 1], heart: 0.03 }),
  e({ id: 'queen', name: 'Королева слизней', layer: 1, ai: 'queen', hp: 70, dmg: 5, speed: 1.1, r: 0.65, size: 2, coins: [14, 20], heart: 1,
    mini: true, desc: 'Делится слизнятами' }),
  e({ id: 'worm', name: 'Великий червь', layer: 1, ai: 'worm', hp: 100, dmg: 6, speed: 1.9, r: 0.5, size: 1.4, coins: [45, 60], heart: 1,
    boss: true, desc: 'Ныряет в породу и вырывается из-под ног' }),

  e({ id: 'spider', name: 'Пещерный паук', layer: 2, ai: 'ranged', hp: 12, dmg: 4, speed: 2.2, r: 0.3, size: 1, coins: [2, 3], heart: 0.07,
    ranged: { range: 5, cd: 2.4, speed: 6, dmg: 2, kind: 'web' } }),
  e({ id: 'kobold', name: 'Кобольд-камнемёт', layer: 2, ai: 'ranged', hp: 14, dmg: 5, speed: 2.0, r: 0.3, size: 1, coins: [2, 4], heart: 0.07,
    ranged: { range: 4.5, cd: 2.2, speed: 7, dmg: 4, kind: 'rock' } }),
  e({ id: 'crab', name: 'Скальный краб', layer: 2, ai: 'chase', hp: 20, dmg: 5, speed: 1.3, r: 0.34, size: 1, coins: [2, 4], heart: 0.1, armor: 2,
    desc: 'Панцирь снижает урон на 2' }),
  e({ id: 'spiderling', name: 'Паучок', layer: 2, ai: 'chase', hp: 4, dmg: 2, speed: 3.0, r: 0.2, size: 0.6, coins: [0, 1], heart: 0.03 }),
  e({ id: 'mother', name: 'Паучиха-матка', layer: 2, ai: 'mother', hp: 110, dmg: 7, speed: 1.4, r: 0.6, size: 2, coins: [20, 28], heart: 1,
    mini: true, ranged: { range: 6, cd: 1.8, speed: 6, dmg: 4, kind: 'web' }, desc: 'Плетёт паутину и зовёт паучат' }),
  e({ id: 'golem', name: 'Каменный голем', layer: 2, ai: 'golem', hp: 300, dmg: 9, speed: 1.2, r: 0.75, size: 2.2, coins: [60, 80], heart: 1,
    boss: true, armor: 2, ranged: { range: 8, cd: 3, speed: 6, dmg: 8, kind: 'rock' }, desc: 'Бьёт по земле и швыряет валуны' }),

  e({ id: 'firebeetle', name: 'Огненный жук', layer: 3, ai: 'exploder', hp: 10, dmg: 4, speed: 2.5, r: 0.28, size: 1, coins: [2, 3], heart: 0.05,
    blast: { r: 1.3, dmg: 9 }, desc: 'Взрывается рядом с тобой' }),
  e({ id: 'wisp', name: 'Угольный дух', layer: 3, ai: 'ranged', hp: 20, dmg: 6, speed: 1.9, r: 0.3, size: 1, coins: [3, 4], heart: 0.08,
    ranged: { range: 5, cd: 2.2, speed: 5, dmg: 6, kind: 'fire' } }),
  e({ id: 'goblin', name: 'Гоблин-подрывник', layer: 3, ai: 'bomber', hp: 16, dmg: 4, speed: 2.6, r: 0.3, size: 1, coins: [3, 5], heart: 0.08,
    ranged: { range: 4, cd: 3, speed: 5, dmg: 10, kind: 'bomb' } }),
  e({ id: 'baron', name: 'Угольный барон', layer: 3, ai: 'baron', hp: 170, dmg: 9, speed: 1.3, r: 0.65, size: 2, coins: [28, 36], heart: 1,
    mini: true, desc: 'Окружает себя кольцом огня' }),
  e({ id: 'salamander', name: 'Огненная саламандра', layer: 3, ai: 'salamander', hp: 420, dmg: 10, speed: 3.2, r: 0.6, size: 2, coins: [80, 100], heart: 1,
    boss: true, ranged: { range: 7, cd: 2.5, speed: 6, dmg: 9, kind: 'fire' }, desc: 'Рывками носится по арене и оставляет пламя' }),
];

const BY_ID = new Map(ENEMIES.map((x) => [x.id, x]));
export const enemyDef = (id: string): EnemyDef => {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`unknown enemy ${id}`);
  return d;
};
