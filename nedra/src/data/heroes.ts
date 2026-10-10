// Герои: у каждого своя способность, пассивка и стиль игры. Открываются достижениями.
import type { MetaState } from '../core/state';
import type { PlayerStats } from '../core/stats';

export type AbilityId = 'drill' | 'dynamite' | 'whirl' | 'pulse' | 'turret' | 'potion';

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  desc: string;
  ability: { id: AbilityId; name: string; desc: string; cd: number };
  passive: string;
  look: { hat: string; clothes: string; beard: string | null; hair: string | null };
  apply: (s: PlayerStats) => void;
  unlock: { text: string; check: (m: MetaState) => boolean } | null;
}

export const HEROES: HeroDef[] = [
  {
    id: 'miner', name: 'Кузьма', title: 'Шахтёр',
    desc: 'Надёжный середняк. Копает и дерётся одинаково неплохо.',
    ability: { id: 'drill', name: 'Бурорывок', desc: 'Рывок на 3 клетки: пробивает мягкую породу и сносит врагов на пути.', cd: 6 },
    passive: 'Рудное чутьё: 20% шанс получить двойную руду.',
    look: { hat: '#f2c14e', clothes: '#3b6ea5', beard: '#f4f1ea', hair: null },
    apply: (s) => { s.doubleOre += 0.2; },
    unlock: null,
  },
  {
    id: 'blaster', name: 'Варвара', title: 'Подрывница',
    desc: 'Решает всё динамитом. Слабее в ближнем бою, зато сносит целые пещеры.',
    ability: { id: 'dynamite', name: 'Динамит', desc: 'Бросок шашки: взрыв радиусом 2 рушит породу и бьёт врагов.', cd: 5 },
    passive: 'Свои взрывы не ранят, радиус взрывов +25%.',
    look: { hat: '#d9483b', clothes: '#7a4b2a', beard: null, hair: '#e07a2f' },
    apply: (s) => { s.swordDmg *= 0.8; s.pickPower *= 0.9; s.maxHp -= 4; s.explSafe = true; s.explRadius *= 1.25; },
    unlock: { text: 'Взорвать 25 блоков', check: (m) => m.stats.exploded >= 25 },
  },
  {
    id: 'warrior', name: 'Добрыня', title: 'Богатырь',
    desc: 'Широкий замах и много здоровья. Копает медленно, рубит быстро.',
    ability: { id: 'whirl', name: 'Вихрь', desc: 'Удар по кругу радиусом 2.2 с утроенным уроном.', cd: 7 },
    passive: 'Каждое убийство лечит 1 здоровье. Замах меча 160°.',
    look: { hat: '#b8c0c6', clothes: '#9e2b25', beard: '#8a5a30', hair: null },
    apply: (s) => { s.maxHp += 12; s.swordDmg *= 1.5; s.swordArc = 160; s.pickPower *= 0.75; s.healOnKill += 1; },
    unlock: { text: 'Победить 60 врагов', check: (m) => m.stats.kills >= 60 },
  },
  {
    id: 'geologist', name: 'Тихон', title: 'Геолог',
    desc: 'Видит руду сквозь камень. Богатеет быстрее всех.',
    ability: { id: 'pulse', name: 'Сейсмоимпульс', desc: 'Открывает породу и руду в радиусе 8 и оглушает врагов на 2 секунды.', cd: 12 },
    passive: 'Руда видна сквозь стены в радиусе 3, руда дороже на 20%.',
    look: { hat: '#4c8c4a', clothes: '#a08a5a', beard: '#c9c2b8', hair: null },
    apply: (s) => { s.maxHp -= 6; s.swordDmg *= 0.8; s.pickPower *= 1.15; s.oreSight += 3; s.oreValue *= 1.2; },
    unlock: { text: 'Добыть 150 руды', check: (m) => m.stats.ore >= 150 },
  },
  {
    id: 'engineer', name: 'Прохор', title: 'Инженер',
    desc: 'Ставит турели и освещает шахту. Любит, когда работают механизмы.',
    ability: { id: 'turret', name: 'Турель', desc: 'Ставит турель на 14 секунд: она стреляет по ближайшим врагам.', cd: 16 },
    passive: 'Факелы светят на 1.5 клетки дальше, каждый третий факел бесплатный.',
    look: { hat: '#f08a24', clothes: '#2a3f6e', beard: '#3a2a20', hair: null },
    apply: (s) => { s.maxHp -= 2; s.swordDmg *= 0.9; s.torchLight += 1.5; s.freeTorchEvery = 3; },
    unlock: { text: 'Поставить 30 факелов', check: (m) => m.stats.torches >= 30 },
  },
  {
    id: 'herbalist', name: 'Марфа', title: 'Травница',
    desc: 'Травит врагов зельями и умеет лечиться лучше всех.',
    ability: { id: 'potion', name: 'Ядовитое зелье', desc: 'Облако яда радиусом 1.8 на 5 секунд: 4 урона в секунду.', cd: 8 },
    passive: 'Лечение сильнее на 50%. На каждом этаже растёт целебный гриб.',
    look: { hat: '#3f9e5a', clothes: '#7a4f9e', beard: null, hair: '#e8c46b' },
    apply: (s) => { s.swordDmg *= 0.9; s.healMult *= 1.5; s.mushrooms += 1; },
    unlock: { text: 'Пройти Разлом 1', check: (m) => m.bosses.includes(1) },
  },
];

export const heroDef = (id: string): HeroDef => HEROES.find((h) => h.id === id) ?? HEROES[0];
