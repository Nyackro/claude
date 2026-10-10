// Враги пластов 1-10: обычные, мини-боссы боковых логов, боссы Разломов и Богомирон.
// Боссы с 4-го пласта описаны шаблонами атак по фазам (см. game/enemyai.ts).

export type AI = 'chase' | 'burrow' | 'bat' | 'ranged' | 'bomber' | 'exploder'
  | 'charger' | 'turret' | 'phaser' | 'orbiter' | 'leaper' | 'clone'
  | 'queen' | 'mother' | 'baron' | 'worm' | 'golem' | 'salamander' | 'pattern';

export type ShotKind = 'web' | 'rock' | 'fire' | 'bomb' | 'orb' | 'ice' | 'spore' | 'holy' | 'glitch';

export interface Ranged {
  range: number;
  cd: number;
  speed: number;
  dmg: number;
  kind: ShotKind;
  burst?: number;            // снарядов веером
  home?: number;             // самонаведение, рад/с
}

export type AttackKind = 'radial' | 'fan' | 'spiral' | 'rain' | 'beam' | 'cross' | 'ring' | 'slam' | 'nova' | 'dash'
  | 'summon' | 'zone' | 'teleport' | 'homing' | 'squares' | 'clones' | 'dive' | 'roots' | 'halo';

export type ZoneKind = 'fire' | 'poison' | 'ice' | 'holy' | 'glitch';

export interface AttackSpec {
  a: AttackKind;
  w?: number;                // вес выбора
  cd?: number;               // пауза после атаки
  wind?: number;             // замах (телеграф)
  n?: number;                // сколько снарядов, лучей, ударов
  speed?: number;
  dmg?: number;              // множитель урона врага
  pk?: ShotKind;
  r?: number;                // радиус удара или зоны
  dur?: number;              // длительность (спираль, лучи)
  spin?: number;             // скорость вращения, рад/с
  id?: string;               // кого призвать
  zone?: ZoneKind;
  plus?: number;             // только для усложнённых версий (Изнанка)
}

export type MoveMode = 'chase' | 'hover' | 'center' | 'orbit' | 'still';

export interface Phase {
  at: number;                // доля здоровья, с которой начинается фаза
  move: MoveMode;
  speed?: number;            // множитель скорости
  tempo?: number;            // множитель частоты атак
  say?: string;
  attacks: AttackSpec[];
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
  look?: string;             // чей спрайт взять (по умолчанию id)
  color?: string;            // цвет снарядов и свечения
  glow?: [number, string];   // радиус света и rgb
  float?: boolean;           // парит
  onDeath?: 'spores' | 'shards' | 'fire' | 'ice' | 'split';
  digTier?: number;          // землерой прогрызает породу до этого уровня
  steady?: boolean;          // не отбрасывается
  phases?: Phase[];
}

const e = (x: EnemyDef) => x;

// ---------------- пласты 1-3 ----------------

const L1_3: EnemyDef[] = [
  e({ id: 'slime', name: 'Слизень', layer: 1, ai: 'chase', hp: 8, dmg: 3, speed: 1.5, r: 0.32, size: 1, coins: [1, 2], heart: 0.08 }),
  e({ id: 'beetle', name: 'Жук-землерой', layer: 1, ai: 'burrow', hp: 6, dmg: 2, speed: 2.0, r: 0.28, size: 1, coins: [1, 2], heart: 0.05,
    desc: 'Прогрызает мягкую породу' }),
  e({ id: 'bat', name: 'Летучая мышь', layer: 1, ai: 'bat', hp: 4, dmg: 2, speed: 3.0, r: 0.26, size: 1, coins: [1, 1], heart: 0.04, float: true }),
  e({ id: 'slimeling', name: 'Слизнёнок', layer: 1, ai: 'chase', hp: 3, dmg: 1, speed: 2.1, r: 0.22, size: 0.7, coins: [0, 1], heart: 0.03 }),
  e({ id: 'queen', name: 'Королева слизней', layer: 1, ai: 'queen', hp: 70, dmg: 5, speed: 1.1, r: 0.65, size: 2, coins: [14, 20], heart: 1,
    mini: true, desc: 'Делится слизнятами' }),
  e({ id: 'worm', name: 'Великий червь', layer: 1, ai: 'worm', hp: 100, dmg: 6, speed: 1.9, r: 0.5, size: 1.4, coins: [45, 60], heart: 1,
    boss: true, steady: true, desc: 'Ныряет в породу и вырывается из-под ног' }),

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
    boss: true, steady: true, armor: 2, ranged: { range: 8, cd: 3, speed: 6, dmg: 8, kind: 'rock' }, desc: 'Бьёт по земле и швыряет валуны' }),

  e({ id: 'firebeetle', name: 'Огненный жук', layer: 3, ai: 'exploder', hp: 10, dmg: 4, speed: 2.5, r: 0.28, size: 1, coins: [2, 3], heart: 0.05,
    blast: { r: 1.3, dmg: 9 }, glow: [1.6, '255,120,50'], desc: 'Взрывается рядом с тобой' }),
  e({ id: 'wisp', name: 'Угольный дух', layer: 3, ai: 'ranged', hp: 20, dmg: 6, speed: 1.9, r: 0.3, size: 1, coins: [3, 4], heart: 0.08, float: true,
    ranged: { range: 5, cd: 2.2, speed: 5, dmg: 6, kind: 'fire' }, glow: [2.6, '255,170,60'] }),
  e({ id: 'goblin', name: 'Гоблин-подрывник', layer: 3, ai: 'bomber', hp: 16, dmg: 4, speed: 2.6, r: 0.3, size: 1, coins: [3, 5], heart: 0.08,
    ranged: { range: 4, cd: 3, speed: 5, dmg: 10, kind: 'bomb' } }),
  e({ id: 'baron', name: 'Угольный барон', layer: 3, ai: 'baron', hp: 170, dmg: 9, speed: 1.3, r: 0.65, size: 2, coins: [28, 36], heart: 1,
    mini: true, glow: [2.8, '255,120,40'], desc: 'Окружает себя кольцом огня' }),
  e({ id: 'salamander', name: 'Огненная саламандра', layer: 3, ai: 'salamander', hp: 420, dmg: 10, speed: 3.2, r: 0.6, size: 2, coins: [80, 100], heart: 1,
    boss: true, steady: true, ranged: { range: 7, cd: 2.5, speed: 6, dmg: 9, kind: 'fire' }, glow: [3, '255,110,40'],
    desc: 'Рывками носится по арене и оставляет пламя' }),
];

// ---------------- пласт 4: Гранитный щит ----------------

const L4: EnemyDef[] = [
  e({ id: 'stoneguard', name: 'Гранитный страж', layer: 4, ai: 'chase', hp: 70, dmg: 10, speed: 1.25, r: 0.38, size: 1.1, coins: [5, 8], heart: 0.1,
    armor: 4, desc: 'Толстая броня: точи меч' }),
  e({ id: 'shardthrower', name: 'Осколочник', layer: 4, ai: 'ranged', hp: 45, dmg: 8, speed: 1.9, r: 0.3, size: 1, coins: [5, 7], heart: 0.08,
    ranged: { range: 5.5, cd: 2.3, speed: 7, dmg: 7, kind: 'rock', burst: 3 } }),
  e({ id: 'rockeater', name: 'Камнеед', layer: 4, ai: 'burrow', hp: 55, dmg: 9, speed: 2.1, r: 0.32, size: 1, coins: [4, 7], heart: 0.07, digTier: 1,
    desc: 'Прогрызает даже гранит' }),
  e({ id: 'ram', name: 'Таран', layer: 4, ai: 'charger', hp: 65, dmg: 13, speed: 1.6, r: 0.36, size: 1.1, coins: [5, 8], heart: 0.08,
    desc: 'Целится и несётся по прямой' }),
  e({ id: 'warden', name: 'Каменный надзиратель', layer: 4, ai: 'pattern', hp: 520, dmg: 12, speed: 1.1, r: 0.7, size: 2.2, coins: [40, 55], heart: 1,
    mini: true, armor: 3, steady: true, desc: 'Бьёт по земле, мечет камни',
    phases: [
      { at: 1, move: 'chase', attacks: [
        { a: 'slam', r: 2.4, wind: 0.9, cd: 1.6, w: 3 },
        { a: 'radial', n: 10, pk: 'rock', speed: 5, cd: 2.2, w: 2 },
        { a: 'rain', n: 4, r: 1.1, pk: 'rock', wind: 1.0, cd: 2.4, w: 2 },
      ] },
      { at: 0.5, move: 'chase', speed: 1.25, tempo: 1.3, say: 'Надзиратель в ярости!', attacks: [
        { a: 'slam', r: 2.8, wind: 0.8, cd: 1.4, w: 3 },
        { a: 'spiral', n: 3, pk: 'rock', speed: 4.5, dur: 2, spin: 1.8, cd: 2, w: 2 },
        { a: 'rain', n: 6, r: 1.1, pk: 'rock', wind: 1.0, cd: 2.2, w: 2 },
      ] },
    ] }),
  e({ id: 'titan', name: 'Гранитный Титан', layer: 4, ai: 'pattern', hp: 1300, dmg: 14, speed: 0.9, r: 0.95, size: 2.8, coins: [150, 200], heart: 1,
    boss: true, armor: 4, steady: true, desc: 'Спирали валунов, ударные волны и каменный дождь',
    phases: [
      { at: 1, move: 'hover', attacks: [
        { a: 'radial', n: 12, pk: 'rock', speed: 5, cd: 2.2, w: 3 },
        { a: 'rain', n: 5, r: 1.2, pk: 'rock', wind: 1.1, cd: 2.4, w: 2 },
        { a: 'ring', n: 1, speed: 5, cd: 2.4, w: 2 },
        { a: 'slam', r: 3, wind: 1, cd: 1.8, w: 2 },
        { a: 'radial', n: 16, pk: 'rock', speed: 6, cd: 1.6, w: 2, plus: 1 },
      ] },
      { at: 0.6, move: 'hover', tempo: 1.15, say: 'Титан трескается!', attacks: [
        { a: 'spiral', n: 3, pk: 'rock', speed: 4.5, dur: 2.5, spin: 1.6, cd: 2, w: 3 },
        { a: 'rain', n: 7, r: 1.2, pk: 'rock', wind: 1.1, cd: 2.2, w: 2 },
        { a: 'summon', id: 'stoneguard', n: 2, cd: 3, w: 1 },
        { a: 'ring', n: 2, speed: 5, cd: 2.4, w: 2 },
      ] },
      { at: 0.3, move: 'hover', speed: 1.3, tempo: 1.35, say: 'Гранитный Титан рушится в ярости!', attacks: [
        { a: 'spiral', n: 4, pk: 'rock', speed: 5, dur: 3, spin: 2, cd: 1.6, w: 3 },
        { a: 'ring', n: 3, speed: 5.5, cd: 2.2, w: 2 },
        { a: 'rain', n: 9, r: 1.2, pk: 'rock', wind: 1, cd: 2, w: 2 },
        { a: 'nova', r: 4, wind: 1.4, cd: 2.5, w: 1 },
      ] },
    ] }),
];

// ---------------- пласт 5: Кристальные гроты ----------------

const L5: EnemyDef[] = [
  e({ id: 'crystalspider', name: 'Кристальный паук', layer: 5, ai: 'ranged', hp: 60, dmg: 10, speed: 2.3, r: 0.3, size: 1, coins: [6, 9], heart: 0.08,
    ranged: { range: 5.5, cd: 2.1, speed: 6.5, dmg: 9, kind: 'orb', burst: 2 }, color: '#7ff0ff', onDeath: 'shards' }),
  e({ id: 'prism', name: 'Призма', layer: 5, ai: 'turret', hp: 85, dmg: 9, speed: 0, r: 0.36, size: 1, coins: [7, 10], heart: 0.06, armor: 2,
    ranged: { range: 7, cd: 1.6, speed: 4.5, dmg: 9, kind: 'orb', burst: 4 }, color: '#c89bff', glow: [1.6, '200,160,255'], steady: true,
    desc: 'Стоит на месте и вращает лучи осколков' }),
  e({ id: 'glassbat', name: 'Стеклокрыл', layer: 5, ai: 'bat', hp: 40, dmg: 10, speed: 3.2, r: 0.28, size: 1, coins: [5, 7], heart: 0.05, float: true }),
  e({ id: 'shardling', name: 'Осколыш', layer: 5, ai: 'exploder', hp: 45, dmg: 10, speed: 2.7, r: 0.3, size: 1, coins: [5, 8], heart: 0.05,
    blast: { r: 1.4, dmg: 14 }, onDeath: 'shards', color: '#9ff4ff', glow: [1.4, '160,240,255'] }),
  e({ id: 'crystalmatron', name: 'Хрустальная матка', layer: 5, ai: 'pattern', hp: 700, dmg: 14, speed: 1.2, r: 0.65, size: 2.1, coins: [55, 70], heart: 1,
    mini: true, color: '#7ff0ff', glow: [2.4, '140,230,255'], desc: 'Рождает осколышей и бьёт лучом',
    phases: [
      { at: 1, move: 'orbit', attacks: [
        { a: 'fan', n: 5, pk: 'orb', speed: 6, cd: 1.8, w: 3 },
        { a: 'summon', id: 'shardling', n: 2, cd: 3, w: 1 },
        { a: 'radial', n: 12, pk: 'orb', speed: 4.5, cd: 2.2, w: 2 },
      ] },
      { at: 0.5, move: 'orbit', speed: 1.2, tempo: 1.3, say: 'Матка звенит от ярости!', attacks: [
        { a: 'beam', n: 1, wind: 0.8, dur: 0.6, cd: 1.8, w: 2 },
        { a: 'fan', n: 7, pk: 'orb', speed: 6.5, cd: 1.6, w: 2 },
        { a: 'radial', n: 16, pk: 'orb', speed: 5, cd: 2, w: 2 },
      ] },
    ] }),
  e({ id: 'crystalqueen', name: 'Кристальная Королева', layer: 5, ai: 'pattern', hp: 1700, dmg: 15, speed: 1.4, r: 0.8, size: 2.6, coins: [190, 240], heart: 1,
    boss: true, steady: true, color: '#9ff4ff', glow: [3.4, '150,240,255'], desc: 'Телепортируется, бьёт лучами и рассыпает кристаллы',
    phases: [
      { at: 1, move: 'hover', attacks: [
        { a: 'beam', n: 1, wind: 0.9, dur: 0.7, cd: 1.8, w: 3 },
        { a: 'radial', n: 14, pk: 'orb', speed: 5, cd: 2, w: 2 },
        { a: 'fan', n: 7, pk: 'orb', speed: 6.5, cd: 1.8, w: 2 },
        { a: 'teleport', wind: 0.5, cd: 0.8, w: 2 },
        { a: 'beam', n: 3, wind: 0.9, dur: 0.7, cd: 2, w: 2, plus: 1 },
      ] },
      { at: 0.6, move: 'hover', tempo: 1.15, say: 'Королева рассыпается на осколки!', attacks: [
        { a: 'beam', n: 3, wind: 0.9, dur: 0.8, cd: 2, w: 3 },
        { a: 'homing', n: 4, pk: 'orb', speed: 4, cd: 2.2, w: 2 },
        { a: 'rain', n: 5, r: 1.2, pk: 'orb', wind: 1.1, cd: 2.4, w: 2 },
        { a: 'teleport', wind: 0.4, cd: 0.6, w: 2 },
      ] },
      { at: 0.3, move: 'center', tempo: 1.3, say: 'Кристальная Королева сияет нестерпимо!', attacks: [
        { a: 'cross', n: 4, wind: 1, dur: 3.5, spin: 0.7, cd: 1.4, w: 3 },
        { a: 'spiral', n: 4, pk: 'orb', speed: 4.5, dur: 2.5, spin: 1.7, cd: 1.6, w: 2 },
        { a: 'homing', n: 6, pk: 'orb', speed: 4.2, cd: 2, w: 2 },
        { a: 'teleport', wind: 0.4, cd: 0.5, w: 1 },
      ] },
    ] }),
];

// ---------------- пласт 6: Грибная чаща ----------------

const L6: EnemyDef[] = [
  e({ id: 'sporeling', name: 'Спорыш', layer: 6, ai: 'chase', hp: 80, dmg: 13, speed: 1.9, r: 0.32, size: 1, coins: [7, 10], heart: 0.08,
    onDeath: 'spores', desc: 'Умирая, выпускает ядовитое облако' }),
  e({ id: 'mushwalker', name: 'Ходячий гриб', layer: 6, ai: 'ranged', hp: 110, dmg: 12, speed: 1.4, r: 0.34, size: 1.1, coins: [8, 12], heart: 0.09,
    ranged: { range: 5.5, cd: 2.4, speed: 5, dmg: 11, kind: 'spore' }, color: '#9dff7a' }),
  e({ id: 'hopper', name: 'Прыгунок', layer: 6, ai: 'leaper', hp: 95, dmg: 16, speed: 2.2, r: 0.32, size: 1, coins: [7, 11], heart: 0.08,
    desc: 'Прыгает на метку' }),
  e({ id: 'moth', name: 'Пыльцевая моль', layer: 6, ai: 'bat', hp: 60, dmg: 12, speed: 3.0, r: 0.28, size: 1, coins: [6, 9], heart: 0.06, float: true,
    onDeath: 'spores', glow: [1.2, '200,255,160'] }),
  e({ id: 'myconid', name: 'Грибной старейшина', layer: 6, ai: 'pattern', hp: 1000, dmg: 16, speed: 1.0, r: 0.7, size: 2.2, coins: [70, 90], heart: 1,
    mini: true, color: '#9dff7a', glow: [2.2, '170,255,120'], desc: 'Ядовитые облака и споры',
    phases: [
      { at: 1, move: 'chase', attacks: [
        { a: 'zone', n: 3, r: 1.3, zone: 'poison', dur: 5, wind: 0.8, cd: 2.4, w: 2 },
        { a: 'radial', n: 10, pk: 'spore', speed: 4.5, cd: 2.2, w: 2 },
        { a: 'summon', id: 'sporeling', n: 2, cd: 3, w: 1 },
      ] },
      { at: 0.5, move: 'chase', speed: 1.2, tempo: 1.3, say: 'Старейшина пускает корни!', attacks: [
        { a: 'roots', n: 1, wind: 0.9, cd: 2, w: 3 },
        { a: 'radial', n: 14, pk: 'spore', speed: 5, cd: 2, w: 2 },
        { a: 'zone', n: 4, r: 1.3, zone: 'poison', dur: 5, wind: 0.8, cd: 2.2, w: 2 },
      ] },
    ] }),
  e({ id: 'mycelord', name: 'Владыка Грибницы', layer: 6, ai: 'pattern', hp: 2500, dmg: 18, speed: 0.7, r: 1.0, size: 3, coins: [240, 300], heart: 1,
    boss: true, steady: true, color: '#9dff7a', glow: [3.6, '160,255,120'], desc: 'Корни из-под земли, ядовитые споры и грибные слуги',
    phases: [
      { at: 1, move: 'hover', attacks: [
        { a: 'roots', n: 1, wind: 1, cd: 2, w: 3 },
        { a: 'radial', n: 16, pk: 'spore', speed: 4.5, cd: 2.2, w: 2 },
        { a: 'zone', n: 4, r: 1.4, zone: 'poison', dur: 6, wind: 0.9, cd: 2.4, w: 2 },
        { a: 'roots', n: 2, wind: 1, cd: 2, w: 2, plus: 1 },
      ] },
      { at: 0.6, move: 'hover', tempo: 1.15, say: 'Грибница пробуждается!', attacks: [
        { a: 'summon', id: 'sporeling', n: 3, cd: 3, w: 1 },
        { a: 'homing', n: 5, pk: 'spore', speed: 3.8, cd: 2.2, w: 2 },
        { a: 'roots', n: 2, wind: 1, cd: 2, w: 3 },
        { a: 'ring', n: 1, speed: 4.5, cd: 2.4, w: 2 },
      ] },
      { at: 0.3, move: 'center', tempo: 1.35, say: 'Владыка Грибницы гниёт заживо и бесится!', attacks: [
        { a: 'spiral', n: 5, pk: 'spore', speed: 4, dur: 3, spin: 1.5, cd: 1.6, w: 3 },
        { a: 'roots', n: 3, wind: 0.9, cd: 1.8, w: 3 },
        { a: 'rain', n: 8, r: 1.3, pk: 'spore', wind: 1.1, cd: 2.2, w: 2 },
      ] },
    ] }),
];

// ---------------- пласт 7: Подземный ледник ----------------

const L7: EnemyDef[] = [
  e({ id: 'icewolf', name: 'Ледяной волк', layer: 7, ai: 'charger', hp: 130, dmg: 18, speed: 2.6, r: 0.34, size: 1.1, coins: [9, 13], heart: 0.08 }),
  e({ id: 'frostwisp', name: 'Морозный дух', layer: 7, ai: 'ranged', hp: 110, dmg: 14, speed: 1.8, r: 0.3, size: 1, coins: [9, 12], heart: 0.08, float: true,
    ranged: { range: 5.5, cd: 2.2, speed: 6, dmg: 13, kind: 'ice', burst: 2 }, color: '#bff4ff', glow: [2, '170,230,255'] }),
  e({ id: 'yeti', name: 'Снежник', layer: 7, ai: 'chase', hp: 220, dmg: 22, speed: 1.2, r: 0.42, size: 1.25, coins: [12, 16], heart: 0.12, armor: 5 }),
  e({ id: 'icebat', name: 'Ледяная мышь', layer: 7, ai: 'bat', hp: 70, dmg: 14, speed: 3.3, r: 0.28, size: 1, coins: [7, 10], heart: 0.06, float: true }),
  e({ id: 'frostmother', name: 'Ледяная матушка', layer: 7, ai: 'pattern', hp: 1400, dmg: 20, speed: 1.1, r: 0.7, size: 2.2, coins: [90, 120], heart: 1,
    mini: true, color: '#bff4ff', glow: [2.6, '170,230,255'], desc: 'Сосульки с потолка и ледяные волны',
    phases: [
      { at: 1, move: 'orbit', attacks: [
        { a: 'rain', n: 6, r: 1.1, pk: 'ice', wind: 1.1, cd: 2.2, w: 3 },
        { a: 'fan', n: 7, pk: 'ice', speed: 6, cd: 1.8, w: 2 },
        { a: 'summon', id: 'icebat', n: 2, cd: 3, w: 1 },
      ] },
      { at: 0.5, move: 'orbit', speed: 1.2, tempo: 1.3, say: 'Матушка звенит льдом!', attacks: [
        { a: 'ring', n: 2, speed: 5, cd: 2.2, w: 2 },
        { a: 'rain', n: 8, r: 1.1, pk: 'ice', wind: 1, cd: 2, w: 3 },
        { a: 'zone', n: 3, r: 1.5, zone: 'ice', dur: 6, wind: 0.8, cd: 2.4, w: 1 },
      ] },
    ] }),
  e({ id: 'iceking', name: 'Ледяной Великан', layer: 7, ai: 'pattern', hp: 3500, dmg: 24, speed: 1.0, r: 1.0, size: 3, coins: [300, 380], heart: 1,
    boss: true, armor: 5, steady: true, color: '#bff4ff', glow: [3, '170,230,255'], desc: 'Морозное дыхание, сосульки и топот',
    phases: [
      { at: 1, move: 'chase', attacks: [
        { a: 'fan', n: 11, pk: 'ice', speed: 6, cd: 1.8, w: 3 },
        { a: 'slam', r: 3, wind: 1, cd: 1.6, w: 2 },
        { a: 'rain', n: 6, r: 1.2, pk: 'ice', wind: 1.1, cd: 2.2, w: 2 },
        { a: 'ring', n: 2, speed: 5.5, cd: 2.2, w: 2, plus: 1 },
      ] },
      { at: 0.6, move: 'chase', speed: 1.15, tempo: 1.15, say: 'Великан ревёт, ледник трещит!', attacks: [
        { a: 'ring', n: 2, speed: 5, cd: 2.2, w: 2 },
        { a: 'zone', n: 4, r: 1.5, zone: 'ice', dur: 7, wind: 0.8, cd: 2.4, w: 2 },
        { a: 'fan', n: 13, pk: 'ice', speed: 6.5, cd: 1.7, w: 3 },
        { a: 'summon', id: 'yeti', n: 1, cd: 3, w: 1 },
      ] },
      { at: 0.3, move: 'chase', speed: 1.3, tempo: 1.35, say: 'Ледяной Великан в бешенстве!', attacks: [
        { a: 'spiral', n: 3, pk: 'ice', speed: 5, dur: 2.5, spin: 1.8, cd: 1.6, w: 2 },
        { a: 'nova', r: 4.2, wind: 1.3, cd: 2.2, w: 2 },
        { a: 'rain', n: 10, r: 1.2, pk: 'ice', wind: 1, cd: 2, w: 2 },
        { a: 'fan', n: 15, pk: 'ice', speed: 7, cd: 1.6, w: 2 },
      ] },
    ] }),
];

// ---------------- пласт 8: Магматические камеры ----------------

const L8: EnemyDef[] = [
  e({ id: 'magmaslime', name: 'Магмовый слизень', layer: 8, ai: 'chase', hp: 180, dmg: 20, speed: 1.6, r: 0.36, size: 1.15, coins: [11, 15], heart: 0.09,
    onDeath: 'split', glow: [1.4, '255,110,40'] }),
  e({ id: 'fireimp', name: 'Огненный бес', layer: 8, ai: 'phaser', hp: 140, dmg: 18, speed: 2.4, r: 0.3, size: 1, coins: [11, 15], heart: 0.09,
    ranged: { range: 5, cd: 2.4, speed: 6.5, dmg: 16, kind: 'fire', burst: 3 }, glow: [1.8, '255,140,60'], desc: 'Мерцает и мечет огонь' }),
  e({ id: 'lavabeetle', name: 'Лавовый жук', layer: 8, ai: 'exploder', hp: 120, dmg: 18, speed: 2.8, r: 0.3, size: 1, coins: [10, 14], heart: 0.06,
    blast: { r: 1.6, dmg: 30 }, onDeath: 'fire', glow: [1.6, '255,110,40'] }),
  e({ id: 'ashbat', name: 'Пепельная мышь', layer: 8, ai: 'bat', hp: 90, dmg: 18, speed: 3.4, r: 0.28, size: 1, coins: [9, 12], heart: 0.06, float: true,
    onDeath: 'fire' }),
  e({ id: 'magmagolem', name: 'Магмовый голем', layer: 8, ai: 'pattern', hp: 1900, dmg: 26, speed: 1.1, r: 0.75, size: 2.3, coins: [120, 150], heart: 1,
    mini: true, armor: 4, steady: true, glow: [2.6, '255,120,40'], desc: 'Удар по земле оставляет лаву',
    phases: [
      { at: 1, move: 'chase', attacks: [
        { a: 'slam', r: 2.6, wind: 0.9, cd: 1.6, w: 3 },
        { a: 'radial', n: 12, pk: 'fire', speed: 5, cd: 2.2, w: 2 },
        { a: 'rain', n: 5, r: 1.2, pk: 'fire', wind: 1.1, cd: 2.4, w: 2 },
      ] },
      { at: 0.5, move: 'chase', speed: 1.25, tempo: 1.3, say: 'Голем раскалился добела!', attacks: [
        { a: 'zone', n: 4, r: 1.3, zone: 'fire', dur: 5, wind: 0.8, cd: 2.2, w: 2 },
        { a: 'spiral', n: 3, pk: 'fire', speed: 5, dur: 2, spin: 2, cd: 1.8, w: 2 },
        { a: 'slam', r: 3, wind: 0.8, cd: 1.4, w: 3 },
      ] },
    ] }),
  e({ id: 'leviathan', name: 'Магмовый Левиафан', layer: 8, ai: 'pattern', hp: 4800, dmg: 28, speed: 1.6, r: 0.95, size: 2.8, coins: [380, 460], heart: 1,
    boss: true, steady: true, glow: [3.4, '255,110,40'], desc: 'Ныряет в лаву и вырывается огненным столбом',
    phases: [
      { at: 1, move: 'hover', attacks: [
        { a: 'dive', r: 1.8, n: 12, pk: 'fire', wind: 0.9, cd: 1.6, w: 3 },
        { a: 'fan', n: 7, pk: 'fire', speed: 6.5, cd: 1.8, w: 2 },
        { a: 'rain', n: 6, r: 1.2, pk: 'fire', wind: 1.1, cd: 2.2, w: 2 },
        { a: 'zone', n: 4, r: 1.4, zone: 'fire', dur: 5, wind: 0.8, cd: 2.2, w: 1, plus: 1 },
      ] },
      { at: 0.6, move: 'hover', tempo: 1.2, say: 'Лава кипит!', attacks: [
        { a: 'dive', r: 2, n: 16, pk: 'fire', wind: 0.8, cd: 1.4, w: 3 },
        { a: 'spiral', n: 4, pk: 'fire', speed: 5, dur: 2.5, spin: 1.8, cd: 1.6, w: 2 },
        { a: 'homing', n: 4, pk: 'fire', speed: 4.5, cd: 2, w: 2 },
      ] },
      { at: 0.3, move: 'hover', speed: 1.3, tempo: 1.4, say: 'Магмовый Левиафан извергается!', attacks: [
        { a: 'dive', r: 2.2, n: 20, pk: 'fire', wind: 0.7, cd: 1.2, w: 3 },
        { a: 'nova', r: 4.5, wind: 1.3, cd: 2.2, w: 2 },
        { a: 'zone', n: 6, r: 1.4, zone: 'fire', dur: 6, wind: 0.8, cd: 2, w: 2 },
        { a: 'rain', n: 10, r: 1.2, pk: 'fire', wind: 1, cd: 2, w: 2 },
      ] },
    ] }),
];

// ---------------- пласт 9: Город Предтеч ----------------

const L9: EnemyDef[] = [
  e({ id: 'sentinel', name: 'Страж Предтеч', layer: 9, ai: 'ranged', hp: 260, dmg: 24, speed: 1.0, r: 0.36, size: 1.15, coins: [14, 19], heart: 0.1, armor: 4,
    ranged: { range: 6, cd: 2.2, speed: 7, dmg: 20, kind: 'orb', burst: 3 }, color: '#ffd060', glow: [1.6, '255,210,110'] }),
  e({ id: 'hunterdrone', name: 'Дрон-охотник', layer: 9, ai: 'orbiter', hp: 150, dmg: 20, speed: 3.0, r: 0.28, size: 1, coins: [12, 16], heart: 0.07, float: true,
    ranged: { range: 6, cd: 1.6, speed: 8, dmg: 16, kind: 'orb' }, color: '#6ff0d8', glow: [1.4, '110,240,215'] }),
  e({ id: 'construct', name: 'Конструкт', layer: 9, ai: 'chase', hp: 420, dmg: 32, speed: 1.3, r: 0.44, size: 1.3, coins: [18, 24], heart: 0.12, armor: 7 }),
  e({ id: 'spark', name: 'Искрун', layer: 9, ai: 'exploder', hp: 160, dmg: 22, speed: 3.0, r: 0.28, size: 1, coins: [12, 16], heart: 0.06,
    blast: { r: 1.5, dmg: 36 }, onDeath: 'shards', color: '#9ff4ff', glow: [1.6, '160,240,255'] }),
  e({ id: 'archon', name: 'Архонт', layer: 9, ai: 'pattern', hp: 2600, dmg: 30, speed: 1.4, r: 0.7, size: 2.2, coins: [150, 190], heart: 1,
    mini: true, float: true, color: '#ffd060', glow: [2.6, '255,210,110'], desc: 'Лучи Предтеч и дроны',
    phases: [
      { at: 1, move: 'orbit', attacks: [
        { a: 'beam', n: 2, wind: 0.9, dur: 0.7, cd: 1.8, w: 3 },
        { a: 'summon', id: 'hunterdrone', n: 2, cd: 3.2, w: 1 },
        { a: 'radial', n: 14, pk: 'orb', speed: 5, cd: 2, w: 2 },
      ] },
      { at: 0.5, move: 'center', tempo: 1.3, say: 'Архонт включает защитный контур!', attacks: [
        { a: 'cross', n: 4, wind: 1, dur: 3, spin: 0.8, cd: 1.6, w: 3 },
        { a: 'homing', n: 4, pk: 'orb', speed: 4.5, cd: 2, w: 2 },
        { a: 'beam', n: 3, wind: 0.8, dur: 0.6, cd: 1.8, w: 2 },
      ] },
    ] }),
  e({ id: 'guardian', name: 'Страж Врат', layer: 9, ai: 'pattern', hp: 7000, dmg: 34, speed: 0.8, r: 1.0, size: 3, coins: [460, 560], heart: 1,
    boss: true, armor: 6, steady: true, float: true, color: '#ffd060', glow: [3.6, '255,210,110'], desc: 'Сетка лучей, самонаводящиеся сферы и дроны',
    phases: [
      { at: 1, move: 'center', attacks: [
        { a: 'cross', n: 4, wind: 1.1, dur: 4, spin: 0.6, cd: 1.6, w: 3 },
        { a: 'radial', n: 18, pk: 'orb', speed: 5, cd: 2, w: 2 },
        { a: 'homing', n: 4, pk: 'orb', speed: 4.2, cd: 2.2, w: 2 },
        { a: 'beam', n: 3, wind: 0.8, dur: 0.6, cd: 1.6, w: 2, plus: 1 },
      ] },
      { at: 0.6, move: 'center', tempo: 1.2, say: 'Врата Предтеч открываются!', attacks: [
        { a: 'beam', n: 3, wind: 0.9, dur: 0.7, cd: 1.8, w: 3 },
        { a: 'summon', id: 'hunterdrone', n: 2, cd: 3.5, w: 1 },
        { a: 'ring', n: 2, speed: 5.5, cd: 2.2, w: 2 },
        { a: 'cross', n: 6, wind: 1.1, dur: 4, spin: 0.7, cd: 1.6, w: 2 },
      ] },
      { at: 0.3, move: 'center', tempo: 1.4, say: 'Страж Врат перегружен!', attacks: [
        { a: 'cross', n: 8, wind: 1.2, dur: 4.5, spin: 0.75, cd: 1.4, w: 3 },
        { a: 'spiral', n: 6, pk: 'orb', speed: 4.5, dur: 3, spin: 1.4, cd: 1.6, w: 2 },
        { a: 'homing', n: 6, pk: 'orb', speed: 4.5, cd: 2, w: 2 },
      ] },
    ] }),
];

// ---------------- пласт 10: Ядро ----------------

const BOGO_PHASES: Phase[] = [
  { at: 1, move: 'still', say: 'БОГОМИРОН: Смертный... ты пришёл в мой свет.', attacks: [
    { a: 'radial', n: 20, pk: 'holy', speed: 4.5, cd: 1.8, w: 3 },
    { a: 'rain', n: 6, r: 1.25, pk: 'holy', wind: 1.1, cd: 2, w: 3 },
    { a: 'cross', n: 4, wind: 1.1, dur: 4, spin: 0.55, cd: 1.5, w: 2 },
    { a: 'halo', n: 16, speed: 5, wind: 0.6, cd: 2.2, w: 2 },
  ] },
  { at: 0.66, move: 'still', tempo: 1.2, say: 'БОГОМИРОН: М̷И̷Р̷ ̷Л̷О̷М̷А̷Е̷Т̷С̷Я̷', attacks: [
    { a: 'squares', n: 8, r: 1, wind: 1, cd: 1.8, w: 3 },
    { a: 'clones', n: 2, cd: 2.6, w: 2 },
    { a: 'beam', n: 3, wind: 0.6, dur: 0.5, cd: 1.6, w: 2 },
    { a: 'radial', n: 24, pk: 'glitch', speed: 5, cd: 1.8, w: 2 },
    { a: 'rain', n: 7, r: 1.25, pk: 'holy', wind: 1, cd: 2, w: 1 },
  ] },
  { at: 0.33, move: 'still', tempo: 1.45, say: 'БОГОМИРОН: Я — БОГ НЕДР!', attacks: [
    { a: 'spiral', n: 6, pk: 'holy', speed: 4.5, dur: 3.5, spin: 1.3, cd: 1.4, w: 3 },
    { a: 'cross', n: 8, wind: 1.1, dur: 4.5, spin: 0.6, cd: 1.4, w: 2 },
    { a: 'squares', n: 12, r: 1, wind: 0.95, cd: 1.6, w: 2 },
    { a: 'nova', r: 5, wind: 1.6, cd: 2.4, w: 1 },
    { a: 'clones', n: 3, cd: 2.4, w: 1 },
  ] },
];

const TRUE_PHASES: Phase[] = [
  { at: 1, move: 'still', say: 'ИСТИННЫЙ БОГОМИРОН: Я ВИЖУ ТЕБЯ СКВОЗЬ ВСЕ МИРЫ.', attacks: [
    { a: 'spiral', n: 8, pk: 'holy', speed: 4.6, dur: 3.5, spin: 1.5, cd: 1.3, w: 3 },
    { a: 'rain', n: 10, r: 1.3, pk: 'holy', wind: 1.05, cd: 1.8, w: 2 },
    { a: 'cross', n: 6, wind: 1.1, dur: 4.5, spin: 0.75, cd: 1.3, w: 2 },
    { a: 'halo', n: 24, speed: 5.5, wind: 0.6, cd: 2, w: 2 },
    { a: 'squares', n: 10, r: 1, wind: 1, cd: 1.6, w: 2 },
  ] },
  { at: 0.66, move: 'still', tempo: 1.25, say: 'И̸С̸Т̸И̸Н̸Н̸Ы̸Й̸ ̸Б̸О̸Г̸О̸М̸И̸Р̸О̸Н̸: Р̷Е̷А̷Л̷Ь̷Н̷О̷С̷Т̷Ь̷ ̷—̷ ̷М̷О̷Я̷', attacks: [
    { a: 'squares', n: 16, r: 1, wind: 0.9, cd: 1.5, w: 3 },
    { a: 'clones', n: 4, cd: 2.2, w: 2 },
    { a: 'beam', n: 5, wind: 0.6, dur: 0.5, cd: 1.4, w: 2 },
    { a: 'radial', n: 32, pk: 'glitch', speed: 5.2, cd: 1.6, w: 2 },
    { a: 'ring', n: 3, speed: 5.5, cd: 2, w: 2 },
  ] },
  { at: 0.33, move: 'still', tempo: 1.6, say: 'ИСТИННЫЙ БОГОМИРОН: ВСЁ. ЕСТЬ. СВЕТ.', attacks: [
    { a: 'spiral', n: 10, pk: 'holy', speed: 4.8, dur: 4, spin: 1.6, cd: 1.2, w: 3 },
    { a: 'cross', n: 10, wind: 1.2, dur: 5, spin: 0.7, cd: 1.3, w: 2 },
    { a: 'squares', n: 20, r: 1, wind: 0.9, cd: 1.4, w: 2 },
    { a: 'nova', r: 5.5, wind: 1.6, cd: 2.2, w: 1 },
    { a: 'halo', n: 32, speed: 6, wind: 0.5, cd: 1.8, w: 2 },
    { a: 'clones', n: 4, cd: 2.2, w: 1 },
  ] },
];

const L10: EnemyDef[] = [
  e({ id: 'voidspawn', name: 'Порождение пустоты', layer: 10, ai: 'phaser', hp: 350, dmg: 34, speed: 2.4, r: 0.32, size: 1.1, coins: [18, 24], heart: 0.09,
    color: '#c8a8ff', glow: [1.6, '200,170,255'], desc: 'Возникает рядом и бьёт' }),
  e({ id: 'starwisp', name: 'Звёздный дух', layer: 10, ai: 'ranged', hp: 300, dmg: 28, speed: 1.8, r: 0.3, size: 1, coins: [18, 24], heart: 0.09, float: true,
    ranged: { range: 6, cd: 2.4, speed: 4.5, dmg: 24, kind: 'orb', burst: 2, home: 1.4 }, color: '#e0d0ff', glow: [2.2, '220,200,255'] }),
  e({ id: 'gravit', name: 'Гравитон', layer: 10, ai: 'chase', hp: 600, dmg: 40, speed: 1.4, r: 0.46, size: 1.35, coins: [24, 32], heart: 0.12, armor: 6 }),
  e({ id: 'corebat', name: 'Звёздная мышь', layer: 10, ai: 'bat', hp: 200, dmg: 26, speed: 3.6, r: 0.28, size: 1, coins: [14, 19], heart: 0.07, float: true,
    glow: [1.2, '200,170,255'] }),
  e({ id: 'herald', name: 'Вестник Богомирона', layer: 10, ai: 'pattern', hp: 3600, dmg: 36, speed: 1.2, r: 0.7, size: 2.2, coins: [200, 260], heart: 1,
    mini: true, float: true, color: '#fff2b0', glow: [3, '255,240,170'], desc: 'Свет и сбой: предвестник бога',
    phases: [
      { at: 1, move: 'orbit', attacks: [
        { a: 'rain', n: 5, r: 1.2, pk: 'holy', wind: 1.1, cd: 2, w: 3 },
        { a: 'radial', n: 16, pk: 'holy', speed: 5, cd: 2, w: 2 },
        { a: 'beam', n: 2, wind: 0.8, dur: 0.6, cd: 1.8, w: 2 },
      ] },
      { at: 0.5, move: 'orbit', speed: 1.2, tempo: 1.3, say: 'Вестник мерцает сбоем!', attacks: [
        { a: 'squares', n: 5, r: 1, wind: 1, cd: 1.8, w: 3 },
        { a: 'radial', n: 20, pk: 'glitch', speed: 5, cd: 2, w: 2 },
        { a: 'clones', n: 1, cd: 3, w: 1 },
      ] },
    ] }),
  e({ id: 'bogomiron', name: 'БОГОМИРОН', layer: 10, ai: 'pattern', hp: 14000, dmg: 40, speed: 0, r: 1.15, size: 4.5, coins: [900, 1100], heart: 1,
    boss: true, steady: true, float: true, color: '#fff2b0', glow: [5, '255,240,170'], desc: 'Бог Недр. Божественные и глитч-атаки, три фазы',
    phases: BOGO_PHASES }),
  e({ id: 'bogomiron_true', name: 'ИСТИННЫЙ БОГОМИРОН', layer: 10, ai: 'pattern', hp: 20000, dmg: 45, speed: 0, r: 1.3, size: 5.6, coins: [2500, 3000], heart: 1,
    boss: true, steady: true, float: true, color: '#ff5ab0', glow: [6, '255,90,180'], desc: 'Истинный облик бога. Реальность трещит',
    phases: TRUE_PHASES }),
  e({ id: 'bogo_clone', name: 'Отражение', layer: 10, ai: 'clone', hp: 1, dmg: 30, speed: 0, r: 0.6, size: 2.6, coins: [0, 0], heart: 0, float: true,
    color: '#ff5ab0', look: 'bogomiron' }),
];

export const ENEMIES: EnemyDef[] = [...L1_3, ...L4, ...L5, ...L6, ...L7, ...L8, ...L9, ...L10];

const BY_ID = new Map(ENEMIES.map((x) => [x.id, x]));
export const enemyDef = (id: string): EnemyDef => {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`unknown enemy ${id}`);
  return d;
};
