// Артефакты (GDD, раздел 7.2). Статовые эффекты применяются в core/stats.ts,
// поведенческие (Таран, Валунщик, Крот...) проверяются по id в игровой логике.
import type { RunStats } from '../core/stats';
import type { RunState } from '../core/state';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'cursed';
export type Tag = 'explosive' | 'combo' | 'energy' | 'luck' | 'fall' | 'scout' | 'elements' | 'helpers' | 'gems' | 'metal' | 'tool' | 'cursed';

export interface ArtifactDef {
  id: string;
  name: string;
  rarity: Rarity;
  tag: Tag;
  desc: string;
  pool: number;                                   // открывается после Разлома N (0 - сразу)
  apply?: (s: RunStats, run: RunState) => void;
}

export const RARITY_NAME: Record<Rarity, string> = {
  common: 'Обычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный', cursed: 'Проклятый',
};
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 55, rare: 30, epic: 12, legendary: 3, cursed: 0 };
export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
export const TAG_NAME: Record<Tag, string> = {
  explosive: 'Взрывы', combo: 'Комбо', energy: 'Энергия', luck: 'Удача', fall: 'Падения', scout: 'Разведка',
  elements: 'Стихии', helpers: 'Помощники', gems: 'Самоцветы', metal: 'Металлы', tool: 'Инструмент', cursed: 'Проклятие',
};

const a = (id: string, name: string, rarity: Rarity, tag: Tag, pool: number, desc: string,
  apply?: ArtifactDef['apply']): ArtifactDef => ({ id, name, rarity, tag, pool, desc, apply });

export const ARTIFACTS: ArtifactDef[] = [
  a('fuse', 'Короткий фитиль', 'common', 'explosive', 1, 'Динамит: радиус +1.', (s) => { s.dynamiteRadius += 1; }),
  a('powderbelt', 'Пороховой пояс', 'rare', 'explosive', 1, 'В начале каждого яруса +1 динамит.'),
  a('jewelblast', 'Ювелирный подрыв', 'rare', 'explosive', 1, 'Руда из взрыва стоит 100%, а не 50%.', (s) => { s.explOreMult = 1; }),
  a('chain', 'Цепная реакция', 'epic', 'explosive', 2, 'Руда, разбитая взрывом, взрывается сама с шансом 25%.'),
  a('methane', 'Метановый хирург', 'epic', 'explosive', 3, 'Взрывы газа не ранят и приносят монеты.'),
  a('earplugs', 'Беруши', 'common', 'explosive', 0, 'Взрывы не снимают сердца.', (s) => { s.explosionSafe = true; }),
  a('veinsense', 'Чутьё жилы', 'common', 'combo', 0, 'Комбо сбрасывают 3 блока породы подряд, а не 2.', (s) => { s.comboBreak += 1; }),
  a('rhythm', 'Ритм кирки', 'rare', 'combo', 0, 'Множитель комбо растёт в 1.5 раза быстрее.', (s) => { s.comboStep *= 1.5; }),
  a('goldrush', 'Золотая лихорадка', 'legendary', 'combo', 2, 'При комбо 25+ вся руда x2, пока комбо не сброшено.'),
  a('thermos', 'Термос', 'common', 'energy', 0, '+25% к макс. энергии.', (s) => { s.maxEnergy *= 1.25; }),
  a('pies', 'Бабушкины пирожки', 'common', 'energy', 0, 'Еда восстанавливает вдвое больше.', (s) => { s.foodMult *= 2; }),
  a('stove', 'Угольная печка', 'rare', 'energy', 3, 'Каждый блок угля даёт +2 энергии.'),
  a('coffee', 'Утренний кофе', 'rare', 'energy', 0, 'Первые 15 блоков каждого яруса бесплатны.', (s) => { s.freeBlocks += 15; }),
  a('thrifty', 'Бережливый удар', 'epic', 'energy', 1, '20% блоков не стоят энергии.', (s) => { s.freeChance = 1 - (1 - s.freeChance) * 0.8; }),
  a('plantain', 'Подорожник', 'common', 'energy', 0, 'На каждой станции 25% шанс вернуть 1 сердце.'),
  a('luckycoin', 'Счастливая монетка', 'common', 'luck', 0, '+1 сундук на каждом ярусе.', (s) => { s.extraChests += 1; }),
  a('dice', 'Кости гнома', 'rare', 'luck', 0, 'Бесплатный переброс в каждой лавке.'),
  a('piggy', 'Копилка', 'rare', 'luck', 1, 'На каждой станции +10% к монетам на руках.'),
  a('boots', 'Резиновые сапоги', 'common', 'fall', 0, 'Падения не ранят.', (s) => { s.fallCells = Infinity; }),
  a('ram', 'Таран', 'rare', 'fall', 1, 'Падение с 2+ блоков на руду добывает её бесплатно и вдвое дороже.'),
  a('bouldersmith', 'Валунщик', 'epic', 'fall', 2, 'Валун, упавший на руду, раскалывает её: руда x3 тебе.'),
  a('stoneskin', 'Каменная кожа', 'rare', 'fall', 0, 'Первый удар на каждом ярусе не снимает сердце.'),
  a('scanner', 'Сканер глубин', 'common', 'scout', 0, 'Сундуки, ящики и газ видны сквозь тьму.', (s) => { s.poiVision = true; s.gasVisible = true; }),
  a('bat', 'Летучая мышь', 'rare', 'scout', 2, 'Каждые 20 ударов эхолокация показывает руду в радиусе 6.'),
  a('headlamp', 'Каска с фонарём', 'common', 'scout', 2, 'Радиус света +2.', (s) => { s.lightBonus += 2; }),
  a('pump', 'Помпа', 'common', 'elements', 1, 'Вода не мешает копать, холодная вода вдвое слабее.', (s) => { s.waterFree = true; }),
  a('canary', 'Канарейка Кеша', 'common', 'elements', 2, 'Предупреждает о газе. Газ не отнимает энергию.', (s) => { s.gasSafe = true; s.gasVisible = true; }),
  a('mole', 'Крот Тимофей', 'rare', 'helpers', 0, 'Каждые 8 ударов крот бесплатно копает ещё блок по ходу движения.'),
  a('loupe', 'Ювелирная лупа', 'common', 'gems', 0, 'Самоцветы x1.5.', (s) => { s.gemMult *= 1.5; }),
  a('collector', 'Коллекционер', 'rare', 'gems', 1, '+5% ко всей руде за каждый новый вид самоцвета в забеге.',
    (s, run) => { s.oreMult *= 1 + 0.05 * run.gemTypes.length; }),
  a('crown', 'Корона Кирковичей', 'legendary', 'gems', 3, 'Если в поясе 3+ артефакта «Самоцветы», все самоцветы x2.',
    (s, run) => {
      const gems = run.artifacts.filter((id) => ARTIFACT_BY_ID.get(id)?.tag === 'gems').length;
      if (gems >= 3) s.gemMult *= 2;
    }),
  a('metallurg', 'Металлург', 'rare', 'metal', 0, 'Металлы x1.4.', (s) => { s.metalMult *= 1.4; }),
  a('sharpen', 'Заточка', 'common', 'tool', 0, 'Сила удара +20%.', (s) => { s.power *= 1.2; }),
  a('perforator', 'Перфоратор', 'epic', 'tool', 1, 'Каждый 4-й удар втрое сильнее.'),
  a('jackhammer', 'Отбойник', 'rare', 'tool', 2, 'Копая вниз, пробиваешь и следующий блок за полцены.'),
  a('greedy', 'Жадный самородок', 'cursed', 'cursed', 0, 'Руда +50%, но макс. сердец -1.', (s) => { s.oreMult *= 1.5; s.maxHearts -= 1; }),
  a('hungrydrill', 'Голодный бур', 'cursed', 'cursed', 0, 'Сила удара x2, но макс. энергия -40%.', (s) => { s.power *= 2; s.maxEnergy *= 0.6; }),
  a('pact', 'Договор с Глубиной', 'cursed', 'cursed', 0, '+1 слот пояса, но блоки стоят на 20% больше энергии.',
    (s) => { s.beltSlots += 1; s.costMult *= 1.2; }),
];

export const ARTIFACT_BY_ID = new Map(ARTIFACTS.map((x) => [x.id, x]));
export const artifactDef = (id: string): ArtifactDef => {
  const d = ARTIFACT_BY_ID.get(id);
  if (!d) throw new Error(`unknown artifact ${id}`);
  return d;
};
