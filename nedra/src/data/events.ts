// События Тайников (GDD, раздел 7.4).
import type { Rng } from '../core/rng';
import type { RunState } from '../core/state';
import type { Rarity } from './artifacts';

export interface EventCtx {
  run: RunState;
  rng: Rng;
  R: number;                                        // цена руды пласта
  maxEnergy: number;
  addArtifact(id: string): boolean;
  randomArtifact(min: Rarity, cursed?: boolean): string | null;
  artifactName(id: string): string;
  addConsumable(id: string, n?: number): boolean;
  damage(n: number): void;
  heal(n: number): void;
  energy(pct: number): void;
  coins(n: number): void;
}

export interface EventChoice {
  label: string | ((c: EventCtx) => string);
  can?: (c: EventCtx) => boolean;
  act: (c: EventCtx) => string;
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  minLayer?: number;
  choices: EventChoice[];
}

const leave: EventChoice = { label: 'Уйти', act: () => 'Ты пошёл дальше.' };

const RIDDLES: { q: string; a: string[]; ok: number }[] = [
  { q: 'Чем больше из неё берёшь, тем больше она становится.', a: ['Яма', 'Гора', 'Тень'], ok: 0 },
  { q: 'Чёрный камень, а греет, как солнце.', a: ['Гранит', 'Уголь', 'Железо'], ok: 1 },
  { q: 'Растёт в пещере сверху вниз, по капле в год.', a: ['Корень', 'Сталагмит', 'Сталактит'], ok: 2 },
  { q: 'В воде родится, а воды боится.', a: ['Соль', 'Рыба', 'Лёд'], ok: 0 },
  { q: 'В пещере живёт, никто его не видел, а что скажешь, то и повторит.', a: ['Гном', 'Эхо', 'Филин'], ok: 1 },
];

export const EVENTS: EventDef[] = [
  {
    id: 'hermit', title: 'Гном-отшельник',
    text: 'Седой гном сидит у костра. «Отдай треть монет, и я отдам тебе вещь, которую нашёл в молодости».',
    choices: [
      {
        label: 'Отдать треть монет', can: (c) => c.run.coins >= 3,
        act: (c) => {
          c.coins(-Math.floor(c.run.coins / 3));
          const id = c.randomArtifact('epic');
          if (!id) return 'Отшельник развёл руками: отдавать нечего.';
          return c.addArtifact(id) ? `Получен артефакт: ${c.artifactName(id)}.` : 'Пояс полон, и отшельник обиделся.';
        },
      },
      leave,
    ],
  },
  {
    id: 'altar', title: 'Алтарь Глубины',
    text: 'Чёрный камень пульсирует теплом. Шёпот обещает силу в обмен на кровь.',
    choices: [
      {
        label: 'Пожертвовать 1 сердце', can: (c) => c.run.hearts > 1,
        act: (c) => {
          c.damage(1);
          c.run.beltBonus += 1;
          const id = c.randomArtifact('common', true);
          if (id && c.addArtifact(id)) return `+1 слот пояса и проклятый артефакт: ${c.artifactName(id)}.`;
          return '+1 слот пояса.';
        },
      },
      leave,
    ],
  },
  {
    id: 'flooded', title: 'Затопленная кладовая',
    text: 'Под водой виден угол старого сундука. Нырять холодно.',
    choices: [
      {
        label: 'Нырнуть (-15% энергии)',
        act: (c) => {
          c.energy(-0.15);
          if (c.rng.chance(0.6)) {
            const id = c.randomArtifact('rare');
            if (id && c.addArtifact(id)) return `В сундуке: ${c.artifactName(id)}!`;
            c.coins(Math.round(8 * c.R));
            return `В сундуке монеты: +${Math.round(8 * c.R)}.`;
          }
          return 'Сундук оказался пустым. Брр.';
        },
      },
      leave,
    ],
  },
  {
    id: 'trader', title: 'Крот-старьёвщик',
    text: '«Меняю, меняю! Отдай мне вещицу, а я дам другую, получше. Не глядя!»',
    choices: [
      {
        label: 'Обменять случайный артефакт', can: (c) => c.run.artifacts.length > 0,
        act: (c) => {
          const old = c.rng.pick(c.run.artifacts);
          c.run.artifacts.splice(c.run.artifacts.indexOf(old), 1);
          const id = c.randomArtifact('rare');
          if (id && c.addArtifact(id)) return `${c.artifactName(old)} обменян на ${c.artifactName(id)}.`;
          return 'Крот убежал с твоей вещью. Ну и ну.';
        },
      },
      leave,
    ],
  },
  {
    id: 'riddle', title: 'Говорящий самородок',
    text: '«Отгадаешь загадку, отдам свои монетки». ',
    choices: [],
  },
  {
    id: 'cat', title: 'Спящий кот шахтёра',
    text: 'На ящике спит рыжий кот в маленькой каске. Он приоткрывает один глаз.',
    choices: [
      { label: 'Погладить', act: (c) => { c.run.chestBlessing += 1; return 'Кот мурлычет. Удача на твоей стороне: +1 сундук на ярусах этого забега.'; } },
      {
        label: 'Взять с собой', can: (c) => !c.run.pet,
        act: (c) => { c.run.pet = 'cat'; c.heal(1); return 'Кот запрыгнул на плечо: +1 сердце. Но его мурлыканье будит валуны.'; },
      },
    ],
  },
  {
    id: 'dice', title: 'Кости гномов',
    text: 'Двое гномов играют в кости. «Ставишь треть монет? Удвоим или проиграешь!»',
    choices: [
      {
        label: 'Поставить треть монет', can: (c) => c.run.coins >= 3,
        act: (c) => {
          const bet = Math.floor(c.run.coins / 3);
          if (c.rng.chance(0.5)) { c.coins(bet); return `Шестёрка! +${bet} монет.`; }
          c.coins(-bet);
          return `Единица... -${bet} монет.`;
        },
      },
      leave,
    ],
  },
  {
    id: 'diary', title: 'Дневник предка',
    text: '«...Сердце бьётся всё реже. Я слышу его даже здесь, на этой глубине. Если ты читаешь это, спускайся дальше».',
    choices: [
      { label: 'Передохнуть (+20% энергии)', act: (c) => { c.energy(0.2); return 'Ты перевёл дух и пошёл дальше.'; } },
      {
        label: 'Поискать в тайнике',
        act: (c) => {
          const id = c.randomArtifact('common');
          return id && c.addArtifact(id) ? `Между страниц: ${c.artifactName(id)}.` : 'Тайник пуст.';
        },
      },
    ],
  },
  {
    id: 'camp', title: 'Заброшенный лагерь',
    text: 'Старая палатка, котелок, ящик с припасами. Вглубь лагеря ведёт тёмный лаз.',
    choices: [
      { label: 'Взять припасы', act: (c) => { c.addConsumable('stew'); c.addConsumable('dynamite'); return '+1 тушёнка, +1 динамит.'; } },
      {
        label: 'Обыскать лаз (-10% энергии)',
        act: (c) => {
          c.energy(-0.1);
          if (c.rng.chance(0.5)) {
            const id = c.randomArtifact('rare');
            if (id && c.addArtifact(id)) return `Нашёл: ${c.artifactName(id)}.`;
          }
          return 'Только паутина и старый сапог.';
        },
      },
    ],
  },
  {
    id: 'stream', title: 'Подземный ручей',
    text: 'Чистая ледяная вода журчит по камням.',
    choices: [
      { label: 'Напиться (+25% энергии)', act: (c) => { c.energy(0.25); return 'Вода бодрит!'; } },
      { label: 'Набрать флягу (+1 тушёнка)', act: (c) => (c.addConsumable('stew') ? 'Фляга полна.' : 'Некуда положить.') },
    ],
  },
  {
    id: 'crack', title: 'Трещина в стене',
    text: 'Узкая щель, из неё тянет теплом и что-то блестит. Протиснуться будет больно.',
    choices: [
      {
        label: 'Протиснуться (-1 сердце)', can: (c) => c.run.hearts > 1,
        act: (c) => {
          c.damage(1);
          const id = c.randomArtifact('epic');
          return id && c.addArtifact(id) ? `Внутри: ${c.artifactName(id)}!` : 'Внутри только кварц.';
        },
      },
      leave,
    ],
  },
  {
    id: 'cart', title: 'Старый вагонетчик',
    text: '«Сюрприз! Что внутри, не скажу, но тебе понравится».',
    choices: [
      {
        label: (c) => `Купить сюрприз за ${Math.round(8 * c.R)} монет`, can: (c) => c.run.coins >= Math.round(8 * c.R),
        act: (c) => {
          c.coins(-Math.round(8 * c.R));
          const item = c.rng.pick(['dynamite', 'ladder', 'stew', 'scan']);
          c.addConsumable(item, 2);
          return 'В свёртке два полезных предмета.';
        },
      },
      leave,
    ],
  },
  {
    id: 'anvil', title: 'Гномья наковальня',
    text: 'Тёплая наковальня и точильный камень. Можно поправить инструмент.',
    choices: [
      {
        label: (c) => `Заточить инструмент за ${Math.round(6 * c.R)} монет`, can: (c) => c.run.coins >= Math.round(6 * c.R) && c.run.toolLevel < 5,
        act: (c) => { c.coins(-Math.round(6 * c.R)); c.run.toolLevel += 1; return `Инструмент заточен: уровень ${c.run.toolLevel}.`; },
      },
      leave,
    ],
  },
  {
    id: 'shrooms', title: 'Светящиеся грибы', minLayer: 2,
    text: 'Голубые грибы светятся в темноте и пахнут орехами.',
    choices: [
      {
        label: 'Съесть',
        act: (c) => {
          if (c.rng.chance(0.5)) { c.energy(0.4); return 'Вкусно! +40% энергии.'; }
          c.damage(1);
          return 'Живот скрутило: -1 сердце.';
        },
      },
      leave,
    ],
  },
  {
    id: 'echo', title: 'Эхо предков',
    text: 'В тишине звучат голоса рода. Они предлагают благословение.',
    choices: [
      { label: 'Удача в руде (+10% к руде)', act: (c) => { c.run.oreBlessing += 0.1; return 'Руда до конца забега стоит на 10% дороже.'; } },
      { label: 'Крепость (+1 сердце)', act: (c) => { c.heal(1); return '+1 сердце.'; } },
    ],
  },
];

/** Загадка собирается при выборе события, чтобы варианты были случайными. */
export function riddleChoices(rng: Rng): { text: string; choices: EventChoice[] } {
  const r = rng.pick(RIDDLES);
  return {
    text: `«Отгадаешь загадку, отдам свои монетки». ${r.q}`,
    choices: r.a.map((ans, k) => ({
      label: ans,
      act: (c: EventCtx) => {
        if (k !== r.ok) return `«Не-а! Правильно: ${r.a[r.ok]}». Самородок укатился.`;
        const n = Math.round(10 * c.R);
        c.coins(n);
        return `«Верно!» +${n} монет.`;
      },
    })),
  };
}

export const eventDef = (id: string): EventDef | undefined => EVENTS.find((e) => e.id === id);
