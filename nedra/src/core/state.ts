export interface MetaStats {
  runs: number;
  kills: number;
  ore: number;
  exploded: number;
  torches: number;
  bestDepth: number;
  totalHaul: number;
  cashOuts: number;
  evacs: number;
}

export interface MetaState {
  v: 2;
  ingots: number;
  buildings: Record<string, number>;
  bosses: number[];
  heroes: string[];
  hero: string;
  stats: MetaStats;
  purchases: { noAds: boolean; goldenSmelter: boolean; starter: boolean };
  settings: { sound: boolean; music: boolean };
  firstCashOut: boolean;
  tutorialDone: boolean;
  giftClaimed: boolean;
  rescued: string[];                    // спасённые мастера по порядку
  npcUp: Record<string, number>;        // уровни их улучшений
  seenTrue: boolean;                    // видел явление Истинного Богомирона
  seenBogo: boolean;                    // видел явление Богомирона (повторно заставка короче)
}

export interface StationState {
  kind: 'start' | 'floor' | 'boss';
  shop: string[];
  rerolls: number;
  reward: string[] | null;     // выбор предмета после Разлома или набора с лифта
  rewardLeft: number;
  forced: string | null;       // почему дальше нельзя
  healBought: number;
}

export interface RunState {
  seed: number;
  hero: string;
  startLayer: number;
  layer: number;
  floor: number;               // 0, 1 - обычные этажи, 2 - Разлом
  hp: number;
  coins: number;
  haul: number;                // всё добытое (руда по цене + монеты), из этого считаются слитки
  bag: Record<string, number>;
  items: Record<string, number>;
  pickTier: number;
  pickSharpen: number;
  swordTier: number;
  swordSharpen: number;
  bombs: number;
  scanners: number;
  floorsDone: number;
  kills: number;
  revived: boolean;
  tutorial: boolean;
  extraLives: number;
  rescued: string | null;               // кого спасли в этом забеге (больше никто не появится)
  potions: number;
  charm: boolean;                       // оберег Веданы ещё не сработал
  station: StationState | null;
}

export function newMeta(): MetaState {
  return {
    v: 2,
    ingots: 0,
    buildings: {},
    bosses: [],
    heroes: ['miner'],
    hero: 'miner',
    stats: { runs: 0, kills: 0, ore: 0, exploded: 0, torches: 0, bestDepth: 0, totalHaul: 0, cashOuts: 0, evacs: 0 },
    purchases: { noAds: false, goldenSmelter: false, starter: false },
    settings: { sound: true, music: true },
    firstCashOut: false,
    tutorialDone: false,
    giftClaimed: false,
    rescued: [],
    npcUp: {},
    seenTrue: false,
    seenBogo: false,
  };
}

export const stack = (run: RunState | null | undefined, id: string): number => (run ? run.items[id] ?? 0 : 0);
