// Пласты 1-10: порода по этажам (чем глубже, тем твёрже), руда, враги, мини-босс и босс Разлома.
// Дальше - бесконечная Изнанка: пласты 1-10 по кругу, с двумя усложнёнными боссами разом
// и Истинным Богомироном в конце каждого круга.
import { B } from '../core/blocks';

export interface LayerDef {
  id: number;
  name: string;
  depth: string;
  floor: string;                         // цвет пола пещер
  floor2: string;
  rocks: [number, number][][];           // для этажей 0, 1 и арены
  ores: [string, number][];
  enemies: [string, number][];
  mini: string;
  bosses: string[];                      // один босс, в Изнанке - двое
  deco: number[];                        // украшения пола
  kit: number;                           // уровень кирки и меча при старте с лифта
  ref: { hp: number; dmg: number };      // типичный враг пласта (для масштаба Изнанки)
  scale: { hp: number; dmg: number; boss: number };  // множители врагов (Изнанка); boss - доп. множитель здоровья боссов
  plus: number;                          // 0 - обычные боссы, 1+ - усложнённые с новыми атаками
  cycle: number;                         // круг Изнанки (0 - Недра)
  tint: string | null;                   // цветовой оттенок Изнанки
  oreMult: number;                       // цена руды
  ready: boolean;
}

type Base = Omit<LayerDef, 'scale' | 'plus' | 'cycle' | 'tint' | 'oreMult' | 'ready'>;

const BASE: Base[] = [
  {
    id: 1, name: 'Дёрн и глина', depth: '0-300 м', floor: '#3b2a1d', floor2: '#2f2117',
    rocks: [
      [[B.DIRT, 55], [B.CLAY, 33], [B.STONE, 12]],
      [[B.DIRT, 34], [B.CLAY, 38], [B.STONE, 24], [B.GRANITE, 4]],
      [[B.DIRT, 50], [B.CLAY, 40], [B.STONE, 10]],
    ],
    ores: [['coal', 32], ['copper', 34], ['tin', 18], ['quartz', 11], ['jasper', 5]],
    enemies: [['slime', 45], ['beetle', 30], ['bat', 25]],
    mini: 'queen', bosses: ['worm'], deco: [1, 2], kit: 0, ref: { hp: 8, dmg: 3 },
  },
  {
    id: 2, name: 'Известняковые пещеры', depth: '300-600 м', floor: '#2c3036', floor2: '#23272c',
    rocks: [
      [[B.CLAY, 28], [B.STONE, 50], [B.GRANITE, 19], [B.BASALT, 3]],
      [[B.CLAY, 16], [B.STONE, 46], [B.GRANITE, 32], [B.BASALT, 6]],
      [[B.STONE, 60], [B.GRANITE, 40]],
    ],
    ores: [['coal', 18], ['copper', 10], ['iron', 32], ['silver', 20], ['malachite', 13], ['pearl', 7]],
    enemies: [['spider', 30], ['kobold', 30], ['crab', 22], ['bat', 18]],
    mini: 'mother', bosses: ['golem'], deco: [1, 5], kit: 1, ref: { hp: 20, dmg: 5 },
  },
  {
    id: 3, name: 'Угольные пласты', depth: '600-900 м', floor: '#221d1b', floor2: '#1a1614',
    rocks: [
      [[B.STONE, 40], [B.GRANITE, 38], [B.BASALT, 20], [B.OBSIDIAN, 2]],
      [[B.STONE, 28], [B.GRANITE, 40], [B.BASALT, 28], [B.OBSIDIAN, 4]],
      [[B.GRANITE, 60], [B.BASALT, 40]],
    ],
    ores: [['coal', 30], ['iron', 14], ['lead', 18], ['gold', 22], ['amber', 11], ['emerald', 5]],
    enemies: [['firebeetle', 32], ['wisp', 26], ['goblin', 26], ['crab', 16]],
    mini: 'baron', bosses: ['salamander'], deco: [3, 1], kit: 2, ref: { hp: 22, dmg: 6 },
  },
  {
    id: 4, name: 'Гранитный щит', depth: '900-1200 м', floor: '#2a2427', floor2: '#211c1f',
    rocks: [
      [[B.STONE, 22], [B.GRANITE, 48], [B.BASALT, 25], [B.OBSIDIAN, 5]],
      [[B.STONE, 14], [B.GRANITE, 44], [B.BASALT, 32], [B.OBSIDIAN, 10]],
      [[B.GRANITE, 70], [B.BASALT, 30]],
    ],
    ores: [['coal', 14], ['iron', 10], ['gold', 18], ['silver', 12], ['mithril', 24], ['emerald', 10], ['amber', 10]],
    enemies: [['stoneguard', 30], ['shardthrower', 28], ['rockeater', 20], ['ram', 22]],
    mini: 'warden', bosses: ['titan'], deco: [1, 3], kit: 3, ref: { hp: 70, dmg: 10 },
  },
  {
    id: 5, name: 'Кристальные гроты', depth: '1200-1500 м', floor: '#1f2433', floor2: '#181c28',
    rocks: [
      [[B.STONE, 20], [B.CRYSTALROCK, 40], [B.BASALT, 30], [B.GRANITE, 10]],
      [[B.STONE, 12], [B.CRYSTALROCK, 48], [B.BASALT, 28], [B.OBSIDIAN, 12]],
      [[B.CRYSTALROCK, 60], [B.BASALT, 40]],
    ],
    ores: [['coal', 10], ['quartz', 14], ['mithril', 24], ['pearl', 10], ['emerald', 14], ['aquamarine', 12], ['ruby', 6]],
    enemies: [['crystalspider', 28], ['prism', 18], ['glassbat', 26], ['shardling', 28]],
    mini: 'crystalmatron', bosses: ['crystalqueen'], deco: [6, 1], kit: 4, ref: { hp: 95, dmg: 13 },
  },
  {
    id: 6, name: 'Грибная чаща', depth: '1500-1800 м', floor: '#261d2e', floor2: '#1e1724',
    rocks: [
      [[B.STONE, 18], [B.MYCEL, 46], [B.BASALT, 26], [B.CRYSTALROCK, 10]],
      [[B.STONE, 10], [B.MYCEL, 48], [B.BASALT, 26], [B.OBSIDIAN, 16]],
      [[B.MYCEL, 60], [B.BASALT, 40]],
    ],
    ores: [['coal', 14], ['mithril', 14], ['glowspore', 20], ['adamantite', 16], ['malachite', 10], ['amber', 10], ['ruby', 10]],
    enemies: [['sporeling', 30], ['mushwalker', 24], ['hopper', 24], ['moth', 22]],
    mini: 'myconid', bosses: ['mycelord'], deco: [4, 7], kit: 4, ref: { hp: 135, dmg: 16 },
  },
  {
    id: 7, name: 'Подземный ледник', depth: '1800-2100 м', floor: '#26323d', floor2: '#1d2731',
    rocks: [
      [[B.STONE, 14], [B.ICE, 50], [B.BASALT, 22], [B.OBSIDIAN, 14]],
      [[B.STONE, 8], [B.ICE, 52], [B.BASALT, 20], [B.OBSIDIAN, 20]],
      [[B.ICE, 70], [B.OBSIDIAN, 30]],
    ],
    ores: [['coal', 12], ['cryolite', 22], ['adamantite', 20], ['aquamarine', 14], ['silver', 10], ['pearl', 10], ['diamond', 6]],
    enemies: [['icewolf', 28], ['frostwisp', 24], ['yeti', 22], ['icebat', 26]],
    mini: 'frostmother', bosses: ['iceking'], deco: [8, 1], kit: 5, ref: { hp: 190, dmg: 20 },
  },
  {
    id: 8, name: 'Магматические камеры', depth: '2100-2400 м', floor: '#2a1814', floor2: '#21120f',
    rocks: [
      [[B.STONE, 12], [B.BASALT, 34], [B.OBSIDIAN, 24], [B.MAGMA, 30]],
      [[B.STONE, 8], [B.BASALT, 28], [B.OBSIDIAN, 24], [B.MAGMA, 40]],
      [[B.OBSIDIAN, 50], [B.MAGMA, 50]],
    ],
    ores: [['coal', 14], ['adamantite', 22], ['fireopal', 18], ['ruby', 14], ['gold', 12], ['diamond', 8], ['orichalcum', 8]],
    enemies: [['magmaslime', 28], ['fireimp', 24], ['lavabeetle', 24], ['ashbat', 24]],
    mini: 'magmagolem', bosses: ['leviathan'], deco: [9, 3], kit: 5, ref: { hp: 260, dmg: 25 },
  },
  {
    id: 9, name: 'Город Предтеч', depth: '2400-2700 м', floor: '#2b2618', floor2: '#221e13',
    rocks: [
      [[B.STONE, 14], [B.RUNE, 46], [B.OBSIDIAN, 20], [B.MAGMA, 20]],
      [[B.STONE, 8], [B.RUNE, 52], [B.OBSIDIAN, 18], [B.MAGMA, 22]],
      [[B.RUNE, 80], [B.OBSIDIAN, 20]],
    ],
    ores: [['coal', 8], ['orichalcum', 20], ['relic', 10], ['diamond', 12], ['starmetal', 16], ['starshard', 6], ['gold', 14], ['adamantite', 14]],
    enemies: [['sentinel', 28], ['hunterdrone', 26], ['construct', 22], ['spark', 24]],
    mini: 'archon', bosses: ['guardian'], deco: [10, 1], kit: 6, ref: { hp: 360, dmg: 30 },
  },
  {
    id: 10, name: 'Ядро', depth: '2700-3000 м', floor: '#1d1626', floor2: '#16101e',
    rocks: [
      [[B.STONE, 10], [B.STAR, 44], [B.RUNE, 22], [B.MAGMA, 24]],
      [[B.STONE, 6], [B.STAR, 54], [B.RUNE, 20], [B.MAGMA, 20]],
      [[B.STAR, 70], [B.RUNE, 30]],
    ],
    ores: [['coal', 8], ['starmetal', 24], ['starshard', 14], ['diamond', 14], ['orichalcum', 14], ['adamantite', 10], ['voidstone', 3]],
    enemies: [['voidspawn', 26], ['starwisp', 26], ['gravit', 22], ['corebat', 26]],
    mini: 'herald', bosses: ['bogomiron'], deco: [10, 6], kit: 6, ref: { hp: 500, dmg: 38 },
  },
];

export const LAYERS: LayerDef[] = BASE.map((b) => ({ ...b, scale: { hp: 1, dmg: 1, boss: 1 }, plus: 0, cycle: 0, tint: null, oreMult: 1, ready: true }));

const TINTS = ['#7a2a8a', '#8a1a3a', '#2a4a9a', '#1a7a6a', '#9a6a1a'];
const ENDLESS = new Map<number, LayerDef>();

/** Пласт Изнанки: пласты 1-10 по кругу, всё сильнее с каждым шагом вглубь. */
function endless(id: number): LayerDef {
  let d = ENDLESS.get(id);
  if (d) return d;
  const cycle = Math.floor((id - 11) / 10) + 1;
  const k = ((id - 11) % 10) + 1;
  const base = LAYERS[k - 1];
  const top = LAYERS[9];
  const n = id - 10;
  const refHp = top.ref.hp * 1.22 ** n;
  const refDmg = top.ref.dmg * 1.07 ** n;
  const pair = LAYERS[k % 9];
  const bosses = k === 10 ? ['bogomiron_true'] : [base.bosses[0], pair.bosses[0]];
  d = {
    ...base,
    id,
    name: `Изнанка ${cycle}: ${base.name}`,
    depth: `${(id - 1) * 300}-${id * 300} м`,
    enemies: [...base.enemies, [pair.enemies[0][0], 18]],
    ores: [...base.ores, ['voidstone', 4 + cycle]],
    bosses,
    kit: 6,
    ref: { hp: refHp, dmg: refDmg },
    scale: { hp: refHp / base.ref.hp, dmg: refDmg / base.ref.dmg, boss: bosses.length > 1 ? 0.6 : 1 },
    plus: cycle,
    cycle,
    tint: TINTS[(cycle - 1) % TINTS.length],
    oreMult: 1 + 0.35 * n,
    ready: true,
  };
  ENDLESS.set(id, d);
  return d;
}

export const layerDef = (id: number): LayerDef => (id <= 10 ? LAYERS[Math.max(1, id) - 1] : endless(id));

const homeRef = (home: number) => LAYERS[Math.min(10, Math.max(1, home)) - 1].ref;

/** Множитель здоровья врага с родного пласта home: в Изнанке все приводятся к опорной силе пласта. */
export const hpScale = (L: LayerDef, home: number): number => (L.cycle ? L.ref.hp / homeRef(home).hp : L.scale.hp);

/** То же для урона. */
export const dmgScale = (L: LayerDef, home: number): number => (L.cycle ? L.ref.dmg / homeRef(home).dmg : L.scale.dmg);

export const isEndless = (id: number): boolean => id > 10;
