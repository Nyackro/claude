import type { NodeType } from './gen';

export interface MetaStats {
  runs: number;
  exploded: number;
  oreTypes: string[];
  bestDepth: number;
  totalHaul: number;
  cashOuts: number;
  evacs: number;
  blocks: number;
}

export interface MetaState {
  v: 1;
  ingots: number;
  buildings: Record<string, number>;
  gear: string[];
  blueprints: string[];
  bosses: number[];
  professions: string[];
  stats: MetaStats;
  purchases: { noAds: boolean; goldenSmelter: boolean; starter: boolean };
  settings: { sound: boolean; music: boolean };
  firstCashOut: boolean;
  tutorialDone: boolean;
  giftClaimed: boolean;
}

export interface Heir {
  name: string;
  female: boolean;
  profession: string;
  trait: string | null;
}

export interface Consumable {
  id: string;
  n: number;
}

export interface StationState {
  kind: NodeType | 'start';
  eventSeed: number;
  offer: string[] | null;     // выбор артефакта (элита, Разлом, набор с лифта)
  offerExtra: boolean;        // взят ли 4-й вариант за рекламу
  shop: string[];             // артефакты на продажу (Ярмарка)
  consumablesForSale: string[];
  eventId: string | null;
  eventResult: string | null;
  restDone: boolean;
  next: NodeType[];
  forcedEnd: string | null;
  kitLeft: number;            // сколько артефактов набора экспедиции осталось выбрать
}

export interface RunState {
  seed: number;
  heir: Heir;
  startLayer: number;
  layer: number;
  step: number;               // 0, 1 - обычные ряды, 2 - Разлом
  map: NodeType[][];
  energy: number;
  hearts: number;
  coins: number;
  haul: number;
  ore: Record<string, number>;
  gemTypes: string[];
  artifacts: string[];
  consumables: Consumable[];
  toolLevel: number;
  tiers: number;
  revived: boolean;
  tutorial: boolean;
  drinksBought: number;
  rerolls: number;
  freeRerollUsed: boolean;
  heirRerollUsed: boolean;
  beltBonus: number;
  oreBlessing: number;        // +x к множителю руды от событий
  chestBlessing: number;
  pet: string | null;
  station: StationState | null;
  bossesThisRun: number[];
  blocks: number;
}

export function newMeta(): MetaState {
  return {
    v: 1,
    ingots: 0,
    buildings: {},
    gear: [],
    blueprints: [],
    bosses: [],
    professions: ['miner'],
    stats: { runs: 0, exploded: 0, oreTypes: [], bestDepth: 0, totalHaul: 0, cashOuts: 0, evacs: 0, blocks: 0 },
    purchases: { noAds: false, goldenSmelter: false, starter: false },
    settings: { sound: true, music: true },
    firstCashOut: false,
    tutorialDone: false,
    giftClaimed: false,
  };
}

export const has = (run: RunState | null | undefined, id: string): boolean => !!run && run.artifacts.includes(id);
