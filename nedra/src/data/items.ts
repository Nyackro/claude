// Предметы (артефакты). Копии складываются: n - сколько штук собрано.
// Эффекты цепляются друг за друга: осколки от добычи, взрывы трупов, молнии, рикошеты, +1 снаряд.
import type { PlayerStats } from '../core/stats';
import type { FloorApi, ItemHooks } from '../game/api';

export type Rarity = 'common' | 'rare' | 'legendary' | 'cursed';

export interface ItemDef extends ItemHooks {
  id: string;
  name: string;
  rarity: Rarity;
  desc: string;
  pool: number;                                    // доступен после Разлома N
  stats?: (s: PlayerStats, n: number) => void;
  max?: number;                                    // лимит копий
}

export const RARITY_NAME: Record<Rarity, string> = { common: 'Обычный', rare: 'Редкий', legendary: 'Легендарный', cursed: 'Проклятый' };
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 62, rare: 28, legendary: 5, cursed: 5 };
export const RARITY_PRICE: Record<Rarity, number> = { common: 30, rare: 70, legendary: 160, cursed: 50 };

const shardDmg = (f: FloorApi) => 2 + f.stats.pickPower * 0.6;

export const ITEMS: ItemDef[] = [
  // ---------- обычные: характеристики ----------
  { id: 'whetstone', name: 'Точильный камень', rarity: 'common', pool: 0, desc: 'Урон меча +15%.',
    stats: (s, n) => { s.swordDmg *= 1 + 0.15 * n; } },
  { id: 'gloves', name: 'Перчатки шахтёра', rarity: 'common', pool: 0, desc: 'Кирка бьёт на 15% чаще.',
    stats: (s, n) => { s.mineInterval /= 1 + 0.15 * n; } },
  { id: 'boots', name: 'Сапоги-скороходы', rarity: 'common', pool: 0, desc: 'Скорость +10%.',
    stats: (s, n) => { s.speed *= 1 + 0.1 * n; } },
  { id: 'helmet', name: 'Железная каска', rarity: 'common', pool: 0, desc: 'Здоровье +8.',
    stats: (s, n) => { s.maxHp += 8 * n; } },
  { id: 'mail', name: 'Кольчуга', rarity: 'common', pool: 0, desc: 'Входящий урон -1 (не меньше 1).',
    stats: (s, n) => { s.armor += n; } },
  { id: 'magnet', name: 'Магнит', rarity: 'common', pool: 0, desc: 'Радиус подбора монет +1.',
    stats: (s, n) => { s.magnet += n; } },
  { id: 'lantern', name: 'Фонарь пошире', rarity: 'common', pool: 0, desc: 'Свет фонаря +0.8 клетки.',
    stats: (s, n) => { s.light += 0.8 * n; } },
  { id: 'clover', name: 'Клевер', rarity: 'common', pool: 0, desc: 'Удача +15%: чаще сердечки и сундуки получше.',
    stats: (s, n) => { s.luck += 0.15 * n; } },
  { id: 'eye', name: 'Зоркий глаз', rarity: 'common', pool: 0, desc: 'Шанс крита +8%.',
    stats: (s, n) => { s.crit += 0.08 * n; } },
  { id: 'lightblade', name: 'Лёгкий клинок', rarity: 'common', pool: 0, desc: 'Меч бьёт на 15% чаще.',
    stats: (s, n) => { s.swordCd /= 1 + 0.15 * n; } },
  { id: 'longhandle', name: 'Длинная рукоять', rarity: 'common', pool: 0, desc: 'Дальность и замах меча +15%.',
    stats: (s, n) => { s.swordRange *= 1 + 0.15 * n; s.swordArc *= 1 + 0.15 * n; } },
  { id: 'belt', name: 'Пояс силы', rarity: 'common', pool: 0, desc: 'Сила кирки +20%.',
    stats: (s, n) => { s.pickPower *= 1 + 0.2 * n; } },
  { id: 'thorns', name: 'Шипованная куртка', rarity: 'common', pool: 0, desc: 'Враги, задевшие тебя, получают 4 урона.',
    stats: (s, n) => { s.thorns += 4 * n; } },
  { id: 'luckycoin', name: 'Счастливая монетка', rarity: 'common', pool: 0, desc: 'Монет с врагов +15%.',
    stats: (s, n) => { s.coinMult *= 1 + 0.15 * n; } },
  { id: 'cart', name: 'Вагонетка', rarity: 'common', pool: 0, desc: 'Руда дороже на 15%.',
    stats: (s, n) => { s.oreValue *= 1 + 0.15 * n; } },
  { id: 'heartroot', name: 'Корень жизни', rarity: 'common', pool: 0, desc: 'Восстанавливает 0.15 здоровья в секунду.',
    stats: (s, n) => { s.regen += 0.15 * n; } },
  { id: 'executioner', name: 'Палач', rarity: 'common', pool: 0, desc: '+50% урона по врагам, у которых меньше 30% здоровья.',
    stats: (s, n) => { s.execute += 0.5 * n; } },
  { id: 'bigprey', name: 'Охотник на крупную дичь', rarity: 'common', pool: 1, desc: '+30% урона по боссам и мини-боссам.',
    stats: (s, n) => { s.bossDmg *= 1 + 0.3 * n; } },
  { id: 'mushkit', name: 'Грибница', rarity: 'common', pool: 0, desc: 'На каждом этаже у старта растёт целебный гриб.',
    stats: (s, n) => { s.mushrooms += n; } },

  // ---------- обычные: срабатывания ----------
  { id: 'shards', name: 'Каменные осколки', rarity: 'common', pool: 0,
    desc: 'Каждый разбитый блок выпускает осколок в ближайшего врага. Сила осколка растёт с киркой.',
    onBreak: (f, n, x, y) => {
      const t = f.nearest(x, y, 7);
      if (!t) return;
      for (let k = 0; k < n + f.stats.projBonus; k++) f.shoot(x, y, t, { dmg: shardDmg(f), kind: 'shard' });
    } },
  { id: 'firesword', name: 'Огненное лезвие', rarity: 'common', pool: 0, desc: 'Удары меча поджигают: 2 урона в секунду 3 секунды.',
    onHit: (f, n, e) => f.ignite(e, 2 * n, 3) },
  { id: 'icesword', name: 'Ледяное лезвие', rarity: 'common', pool: 0, desc: 'Удары меча замедляют врага на 35%.',
    onHit: (f, n, e) => f.slow(e, 0.35, 1.5 + 0.5 * n) },
  { id: 'orefever', name: 'Рудная лихорадка', rarity: 'common', pool: 0, desc: 'Добытая руда: +20% к скорости и атаке на 3 секунды.',
    onOre: (f, n) => f.buff('orefever', 3, 1 + 0.2 * n, 1 + 0.2 * n) },
  { id: 'coalheart', name: 'Угольное сердце', rarity: 'common', pool: 0, desc: 'Каждый добытый уголь лечит 1 здоровье.',
    onOre: (f, n, _x, _y, ore) => { if (ore.kind === 'coal') f.heal(n); } },
  { id: 'adrenaline', name: 'Адреналин', rarity: 'common', pool: 0, desc: 'Получив урон, +30% к скорости на 2 секунды.',
    onHurt: (f, n) => f.buff('adrenaline', 2, 1 + 0.3 * n, 1) },
  { id: 'stoneskin', name: 'Каменная кожа', rarity: 'common', pool: 0, desc: 'Первый удар на каждом этаже не наносит урона.',
    onFloor: (f, n) => f.shield(n) },
  { id: 'scrap', name: 'Металлолом', rarity: 'common', pool: 0, desc: 'Каждый убитый враг роняет ещё монету.',
    onKill: (f, n, e) => f.coins(n, e.x, e.y) },
  { id: 'echo', name: 'Эхо удара', rarity: 'common', pool: 1, desc: '15% шанс, что меч ударит дважды.',
    onHit: (f, n, e, dmg) => { if (f.rng.chance(Math.min(0.75, 0.15 * n))) f.damage(e, dmg, 'echo'); } },
  { id: 'hotTorch', name: 'Горячие факелы', rarity: 'common', pool: 1, desc: 'Враги в свете твоих факелов горят.',
    onTick: (f, n) => {
      if (f.counter('hotTorch', 1) % 30 !== 0) return;
      for (const t of f.torches()) for (const e of f.enemiesIn(t.x, t.y, t.r)) f.ignite(e, 1.5 * n, 1.2);
    } },

  // ---------- редкие ----------
  { id: 'bloodstone', name: 'Кровавый камень', rarity: 'rare', pool: 0, desc: 'Каждое убийство лечит 1 здоровье.',
    stats: (s, n) => { s.healOnKill += n; } },
  { id: 'sparkpick', name: 'Искрящая кирка', rarity: 'rare', pool: 0,
    desc: '25% шанс, что разбитый блок пустит молнию в ближайшего врага и ещё в двух.',
    onBreak: (f, n, x, y) => {
      if (!f.rng.chance(Math.min(1, 0.25 * n))) return;
      const t = f.nearest(x, y, 6);
      if (t) f.lightning(x, y, t, 3 + f.stats.pickPower, 2 + n);
    } },
  { id: 'dynabelt', name: 'Динамитный пояс', rarity: 'rare', pool: 0,
    desc: 'Каждый 10-й разбитый блок оставляет бомбу. Копии сокращают счёт.',
    onBreak: (f, n, x, y) => {
      const every = Math.max(3, 10 - 2 * (n - 1));
      if (f.counter('dynabelt', 1) % every === 0) f.bomb(x, y, 1.2, 1.5, 10);
    } },
  { id: 'corpsebomb', name: 'Взрывные трупы', rarity: 'rare', pool: 0, desc: 'Враги взрываются при смерти: 5 урона вокруг. Взрывы цепляют соседей.',
    onKill: (f, n, e) => f.explode(e.x, e.y, 1.3, 5 * n, true) },
  { id: 'chainlight', name: 'Цепная молния', rarity: 'rare', pool: 0, desc: '20% шанс, что удар меча пустит молнию в двух соседей.',
    onHit: (f, n, e, dmg) => { if (f.rng.chance(Math.min(1, 0.2 * n))) f.lightning(e.x, e.y, e, dmg * 0.6, 2 + n); } },
  { id: 'wave', name: 'Волна клинка', rarity: 'rare', pool: 0, desc: 'Каждый третий взмах выпускает волну, пробивающую врагов.',
    onSwing: (f, n, a) => {
      if (f.counter('wave', 1) % 3 !== 0) return;
      for (let k = 0; k < n + f.stats.projBonus; k++) {
        const spread = (k - (n + f.stats.projBonus - 1) / 2) * 0.25;
        f.shoot(f.px, f.py, null, { dmg: f.stats.swordDmg, kind: 'wave', pierce: 99, dir: a + spread, speed: 8 });
      }
    } },
  { id: 'vampire', name: 'Вампирский клинок', rarity: 'rare', pool: 0, desc: '8% урона меча возвращается здоровьем.',
    stats: (s, n) => { s.lifesteal += 0.08 * n; } },
  { id: 'doublevein', name: 'Двойная жила', rarity: 'rare', pool: 0, desc: '+20% шанс получить двойную руду.',
    stats: (s, n) => { s.doubleOre += 0.2 * n; } },
  { id: 'pet_bat', name: 'Ручная летучая мышь', rarity: 'rare', pool: 0, desc: 'Мышь кружит рядом и кусает врагов.',
    onFloor: (f, n) => f.summon('bat', n) },
  { id: 'molekid', name: 'Кротёнок', rarity: 'rare', pool: 0, desc: 'Кирка задевает и соседние блоки: тоннель шире.',
    stats: (s, n) => { s.wideMine += n; } },
  { id: 'drone', name: 'Дрон-сборщик', rarity: 'rare', pool: 0, desc: 'Монеты летят к тебе издалека.',
    stats: (s, n) => { s.magnet += 6 * n; } },
  { id: 'berserk', name: 'Берсерк', rarity: 'rare', pool: 0, desc: '+1% урона за каждый процент потерянного здоровья.',
    stats: (s, n) => { s.berserk += n; } },
  { id: 'ricochet', name: 'Рикошет', rarity: 'rare', pool: 0, desc: 'Снаряды отскакивают ещё в одного врага.',
    stats: (s, n) => { s.bounce += n; } },
  { id: 'bulwark', name: 'Щит-отражатель', rarity: 'rare', pool: 0, desc: '12% шанс полностью отразить удар.',
    stats: (s, n) => { s.block = 1 - (1 - s.block) * 0.88 ** n; } },
  { id: 'rhythm', name: 'Смертельный ритм', rarity: 'rare', pool: 0, desc: 'Каждый удар по той же цели подряд +10% урона (до +50%).',
    stats: (s, n) => { s.rhythm += n; } },
  { id: 'detonator', name: 'Детонатор', rarity: 'rare', pool: 0, desc: 'Все взрывы сильнее на 50%.',
    stats: (s, n) => { s.explDmg *= 1 + 0.5 * n; } },
  { id: 'blastproof', name: 'Взрывозащита', rarity: 'rare', pool: 0, desc: 'Свои взрывы не ранят, радиус взрывов +20%.',
    stats: (s, n) => { s.explSafe = true; s.explRadius *= 1 + 0.2 * n; } },
  { id: 'alchemy', name: 'Котелок алхимика', rarity: 'rare', pool: 1,
    desc: 'На каждой станции 10 самой дешёвой руды превращаются в 4 руды дороже.' },
  { id: 'rush', name: 'Азарт забоя', rarity: 'rare', pool: 0, desc: '+3% урона за каждый блок, разбитый за последние 8 секунд.',
    stats: (s, n) => { s.rush += 0.03 * n; } },
  { id: 'turretkit', name: 'Набор турели', rarity: 'rare', pool: 1, desc: 'В начале каждого этажа рядом ставится турель на 25 секунд.',
    onFloor: (f, n) => { for (let k = 0; k < n; k++) f.turret(f.px + k * 0.6, f.py + 1, 25); } },
  { id: 'phoenix', name: 'Перо феникса', rarity: 'rare', pool: 1, desc: 'Факел, поставленный рядом с врагами, взрывается огнём.',
    onTorch: (f, n, x, y) => { if (f.enemiesIn(x, y, 3).length) f.explode(x, y, 1.6, 8 * n, true); } },

  // ---------- легендарные ----------
  { id: 'midas', name: 'Перчатка Мидаса', rarity: 'legendary', pool: 0, desc: 'Враги роняют втрое больше монет.',
    stats: (s, n) => { s.killCoins *= 1 + 2 * n; } },
  { id: 'plusone', name: 'Плюс один', rarity: 'legendary', pool: 0, desc: '+1 снаряд ко всем снарядам: осколкам, волнам, турелям.',
    stats: (s, n) => { s.projBonus += n; } },
  { id: 'drillrig', name: 'Буровая установка', rarity: 'legendary', pool: 1, desc: 'Кирка пробивает ещё 2 блока вглубь.',
    stats: (s, n) => { s.drillDepth += 2 * n; } },
  { id: 'crystalheart', name: 'Кристальное сердце', rarity: 'legendary', pool: 1, max: 3,
    desc: 'Если гном погибнет, он встанет с половиной здоровья. Сгорает.' },
  { id: 'kingtorch', name: 'Король пещер', rarity: 'legendary', pool: 1, desc: 'Факелы стреляют огненными стрелами во врагов в своём свете.',
    onTick: (f, n) => {
      if (f.counter('kingtorch', 1) % Math.max(15, 60 - 15 * n) !== 0) return;
      for (const t of f.torches()) {
        const e = f.nearest(t.x, t.y, t.r);
        if (e) f.shoot(t.x, t.y, e, { dmg: 4 + 2 * n, kind: 'fire' });
      }
    } },
  { id: 'golemfriend', name: 'Каменный друг', rarity: 'legendary', pool: 2, desc: 'С тобой ходит каменный голем-телохранитель.',
    onFloor: (f, n) => f.summon('golem', n) },
  { id: 'chaosore', name: 'Нестабильная руда', rarity: 'legendary', pool: 0, desc: 'Добытая руда взрывается (тебя не ранит): 8 урона вокруг.',
    onOre: (f, n, x, y) => f.explode(x, y, 1.6, 8 * n, true) },
  { id: 'starforge', name: 'Звёздная наковальня', rarity: 'legendary', pool: 2, desc: 'Каждая заточка даёт вдвое больше.' },

  // ---------- проклятые: большой плюс и большой минус ----------
  { id: 'greed', name: 'Жадность', rarity: 'cursed', pool: 0, desc: 'Монеты и руда +50%, но у врагов на 25% больше здоровья.',
    stats: (s, n) => { s.coinMult *= 1 + 0.5 * n; s.oreValue *= 1 + 0.5 * n; s.enemyHp *= 1 + 0.25 * n; } },
  { id: 'bloodoath', name: 'Кровавая клятва', rarity: 'cursed', pool: 0, desc: 'Весь урон +60%, но здоровье -30%.',
    stats: (s, n) => { s.dmgMult *= 1 + 0.6 * n; s.maxHp *= 0.7 ** n; } },
  { id: 'heavyload', name: 'Тяжёлая ноша', rarity: 'cursed', pool: 0, desc: 'Сила кирки +60%, но скорость -20%.',
    stats: (s, n) => { s.pickPower *= 1 + 0.6 * n; s.speed *= 0.8 ** n; } },
  { id: 'darkpact', name: 'Договор с тьмой', rarity: 'cursed', pool: 0, desc: 'Свет -1, но шанс крита +25% и криты бьют втрое.',
    stats: (s, n) => { s.light -= n; s.crit += 0.25 * n; s.critMult = 3; } },
];

export const ITEM_BY_ID = new Map(ITEMS.map((x) => [x.id, x]));
export const itemDef = (id: string): ItemDef => {
  const d = ITEM_BY_ID.get(id);
  if (!d) throw new Error(`unknown item ${id}`);
  return d;
};
