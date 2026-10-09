// Наследники: профессии, инструменты, черты (GDD, раздел 8).
import type { RunStats } from '../core/stats';
import type { MetaState } from '../core/state';

export interface ToolDef {
  id: string;
  name: string;
  desc: string;
  power: number;
}

export const TOOLS: Record<string, ToolDef> = {
  pick: { id: 'pick', name: 'Кирка', desc: 'Надёжная и простая.', power: 1 },
  blastpick: { id: 'blastpick', name: 'Взрывная кирка', desc: 'Каждый 6-й удар - мини-взрыв.', power: 1 },
  geohammer: { id: 'geohammer', name: 'Геологический молоток', desc: 'Слабее (x0.8), но руда +25%.', power: 0.8 },
  drill: { id: 'drill', name: 'Бур', desc: 'Вниз x1.5 силы, вбок x0.7.', power: 1 },
};

export interface ProfessionDef {
  id: string;
  name: string;
  desc: string;
  tool: string;
  start: Record<string, number>;
  unlock: { text: string; check: (m: MetaState) => boolean } | null;
  apply?: (s: RunStats) => void;
}

export const PROFESSIONS: ProfessionDef[] = [
  {
    id: 'miner', name: 'Шахтёр', desc: '+1 слот расходников. Старт с тушёнкой.', tool: 'pick',
    start: { stew: 1 }, unlock: null, apply: (s) => { s.consumableSlots += 1; },
  },
  {
    id: 'blaster', name: 'Подрывник', desc: 'Взрывы не ранят. Старт с 3 динамитами и взрывной киркой.', tool: 'blastpick',
    start: { dynamite: 3 }, unlock: { text: 'Взорвать 50 блоков', check: (m) => m.stats.exploded >= 50 },
    apply: (s) => { s.explosionSafe = true; },
  },
  {
    id: 'geologist', name: 'Геолог', desc: 'Видит руду сквозь тьму в радиусе 3. Самоцветы x1.25.', tool: 'geohammer',
    start: {}, unlock: { text: 'Найти 6 видов руды', check: (m) => m.stats.oreTypes.length >= 6 },
    apply: (s) => { s.oreVision = 3; s.gemMult *= 1.25; s.oreMult *= 1.25; },
  },
  {
    id: 'driller', name: 'Бурильщик', desc: 'Бур: вниз в 1.5 раза сильнее, вбок слабее. Старт с бур-бомбой.', tool: 'drill',
    start: { bomb: 1 }, unlock: { text: 'Пройти Разлом 2', check: (m) => m.bosses.includes(2) },
  },
];

export const professionDef = (id: string): ProfessionDef => PROFESSIONS.find((p) => p.id === id) ?? PROFESSIONS[0];

export interface TraitDef {
  id: string;
  name: string;
  desc: string;
  apply?: (s: RunStats) => void;
}

export const TRAITS: TraitDef[] = [
  { id: 'strong', name: 'Силач', desc: 'Сила +25%, энергия -15%.', apply: (s) => { s.power *= 1.25; s.maxEnergy *= 0.85; } },
  { id: 'glutton', name: 'Обжора', desc: 'Еда x2, энергия -10%.', apply: (s) => { s.foodMult *= 2; s.maxEnergy *= 0.9; } },
  { id: 'lucky', name: 'Везунчик', desc: '+1 сундук на ярусе.', apply: (s) => { s.extraChests += 1; } },
  { id: 'glasses', name: 'Забыл очки', desc: 'Даль размыта, зато руда +10%.', apply: (s) => { s.oreMult *= 1.1; s.blur = true; } },
  { id: 'beard', name: 'Бородач', desc: 'Раз за ярус борода работает как верёвка на 4 блока вверх (жми вверх).', apply: (s) => { s.beardRope = true; } },
  { id: 'clumsy', name: 'Растяпа', desc: '5% руды выскальзывает и катится вниз. Догони!', apply: (s) => { s.clumsy = true; } },
  { id: 'miser', name: 'Скряга', desc: 'Руда +10%, но покупки дороже на 10%.', apply: (s) => { s.oreMult *= 1.1; s.shopMult *= 1.1; } },
  { id: 'workaholic', name: 'Трудоголик', desc: 'Энергия +20%, сердец -1.', apply: (s) => { s.maxEnergy *= 1.2; s.maxHearts -= 1; } },
  { id: 'acrophobe', name: 'Боится высоты', desc: 'Падение ранит уже с 3 блоков, руда +15%.', apply: (s) => { s.fallCells = Math.min(s.fallCells, 3); s.oreMult *= 1.15; } },
  { id: 'singer', name: 'Певун', desc: 'Каждые 30 ударов +3% энергии.', apply: (s) => { s.singer = true; } },
  { id: 'sleepwalker', name: 'Лунатик', desc: 'Свет +2, но Привал восстанавливает меньше.', apply: (s) => { s.lightBonus += 2; s.restMult *= 0.6; } },
  { id: 'oldfilm', name: 'Старое кино', desc: 'Мир чёрно-белый, зато руда +30%.', apply: (s) => { s.oreMult *= 1.3; s.grayscale = true; } },
];

export const traitDef = (id: string | null): TraitDef | null => (id ? TRAITS.find((t) => t.id === id) ?? null : null);

export const NAMES_M = ['Борислав', 'Гордей', 'Добрыня', 'Ерофей', 'Жора', 'Зиновий', 'Игнат', 'Кузьма', 'Лука', 'Мирон',
  'Никанор', 'Остап', 'Прохор', 'Савва', 'Тихон', 'Фома', 'Харитон', 'Яким', 'Емельян', 'Потап'];
export const NAMES_F = ['Агафья', 'Варвара', 'Глафира', 'Дуняша', 'Ефросинья', 'Марфа', 'Пелагея', 'Фёкла', 'Василиса', 'Аксинья'];
