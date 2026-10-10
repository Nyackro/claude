// Логика забега без отрисовки: старт, привалы (кузница, заточка, лавка, лечение), комнаты этажа, итоги и открытия.
import { EVAC_KEEP, SHARPEN_MAX } from '../config';
import { HEROES } from '../data/heroes';
import { ITEMS, itemDef, RARITY_PRICE, RARITY_WEIGHT, type Rarity } from '../data/items';
import { layerDef } from '../data/layers';
import { buildingLevel } from '../data/meta';
import { ORES, oreByKey } from '../data/ores';
import { PICKS, sharpenCost, SWORDS, type ToolTier } from '../data/tools';
import { computeIngots, type IngotResult } from './economy';
import { hash2, Rng } from './rng';
import { stack, type MetaState, type RunState, type StationState } from './state';
import { clampHp, computeStats } from './stats';

export type ToolKind = 'pick' | 'sword';

/** Пласты, к которым можно спуститься на лифте. */
export function availableLifts(meta: MetaState): number[] {
  const out = [1];
  for (let L = 2; L <= 10; L++) {
    if (!meta.bosses.includes(L - 1) || !layerDef(L).ready) break;
    out.push(L);
  }
  return out;
}

/** Множитель цен пласта. */
export const priceMult = (layer: number): number => 1 + 0.6 * (layer - 1);

export function newRun(meta: MetaState, hero: string, startLayer: number, seed: number): RunState {
  const rng = new Rng(seed);
  const kit = startLayer - 1;
  const run: RunState = {
    seed, hero, startLayer, layer: startLayer, floor: 0, hp: 0,
    coins: 15 * buildingLevel(meta, 'storage') + 40 * kit,
    haul: 0, bag: { coal: 3 }, items: {}, pickTier: kit, pickSharpen: 0, swordTier: kit, swordSharpen: 0,
    bombs: 1, scanners: 0, floorsDone: 0, kills: 0, revived: false, tutorial: !meta.tutorialDone, extraLives: 0, station: null,
  };
  if (meta.purchases.starter) run.items.helmet = 1;
  run.hp = computeStats(meta, run).maxHp;
  run.station = makeStation(meta, run, 'start', rng);
  if (kit > 0) {
    run.station.reward = randomItems(meta, run, rng, 3, 'common');
    run.station.rewardLeft = 1;
  }
  return run;
}

export const floorSeed = (run: RunState): number => Math.floor(hash2(run.layer * 7 + run.floor, run.floorsDone, run.seed) * 2 ** 31) + 1;

/** Предметы, которые могут выпасть: открытые Разломами и не упёршиеся в лимит. */
export function itemPool(meta: MetaState, run: RunState, rarity?: Rarity): string[] {
  const tier = meta.bosses.length ? Math.max(...meta.bosses) : 0;
  return ITEMS.filter((d) => d.pool <= tier && (!rarity || d.rarity === rarity) && (!d.max || stack(run, d.id) < d.max)).map((d) => d.id);
}

/** n разных предметов. min - не ниже редкости; без min в лавке изредка попадаются проклятые. */
export function randomItems(meta: MetaState, run: RunState, rng: Rng, n: number, min: Rarity | null): string[] {
  const order: Rarity[] = ['common', 'rare', 'legendary'];
  const minIdx = min ? order.indexOf(min) : 0;
  const pool = itemPool(meta, run).filter((id) => {
    const r = itemDef(id).rarity;
    return r === 'cursed' ? !min : order.indexOf(r) >= minIdx;
  });
  const out: string[] = [];
  for (let k = 0; k < n && pool.length; k++) {
    const id = rng.weighted(pool, (x) => RARITY_WEIGHT[itemDef(x).rarity] * (stack(run, x) ? 0.6 : 1));
    out.push(id);
    pool.splice(pool.indexOf(id), 1);
  }
  return out;
}

export function makeStation(meta: MetaState, run: RunState, kind: StationState['kind'], rng: Rng): StationState {
  const st: StationState = { kind, shop: randomItems(meta, run, rng, 3, null), rerolls: 0, reward: null, rewardLeft: 0, forced: null, healBought: 0 };
  if (kind === 'boss') {
    st.reward = randomItems(meta, run, rng, 3, 'rare');
    st.rewardLeft = 1;
    const next = layerDef(run.layer + 1);
    if (run.layer >= 10) st.forced = 'Дальше только Сердце Мира. Этот путь откроется в следующих обновлениях.';
    else if (!next.ready) st.forced = `Пласт ${next.id} «${next.name}» ещё копают строители. Скоро обновление!`;
  }
  if (kind !== 'start') alchemy(run, stack(run, 'alchemy'));
  return st;
}

/** Котелок алхимика: 10 самой дешёвой руды становятся 4 рудами подороже. */
function alchemy(run: RunState, n: number): void {
  for (let k = 0; k < n; k++) {
    const have = ORES.filter((o) => (run.bag[o.key] ?? 0) >= 10 && o.kind !== 'coal').sort((a, b) => a.value - b.value);
    if (!have.length) return;
    const from = have[0];
    const to = ORES.filter((o) => o.value > from.value && o.kind === from.kind).sort((a, b) => a.value - b.value)[0];
    if (!to) return;
    run.bag[from.key] -= 10;
    run.bag[to.key] = (run.bag[to.key] ?? 0) + 4;
  }
}

/** Этаж пройден: привал (после Разлома - с наградой и лифтом наверх). */
export function completeFloor(meta: MetaState, run: RunState, rng: Rng): string[] {
  run.floorsDone++;
  // передышка на привале
  const s = computeStats(meta, run);
  run.hp = Math.min(s.maxHp, run.hp + Math.ceil(s.maxHp * 0.25));
  meta.stats.bestDepth = Math.max(meta.stats.bestDepth, depthOf(run) + 100);
  const news = run.floor >= 2 ? onBossBeaten(meta, run) : [];
  run.station = makeStation(meta, run, run.floor >= 2 ? 'boss' : 'floor', rng);
  return news;
}

/** С привала вниз: следующий этаж или следующий пласт. */
export function advance(run: RunState): void {
  const st = run.station;
  if (st?.kind === 'boss') {
    run.layer += 1;
    run.floor = 0;
  } else if (st?.kind === 'floor') {
    run.floor += 1;
  }
  if (st && st.kind !== 'start') run.tutorial = false;
  run.station = null;
}

export const depthOf = (run: RunState): number => (run.layer - 1) * 300 + run.floor * 100;

// ---------------- кузница ----------------

export interface ForgeInfo {
  kind: ToolKind;
  cur: ToolTier;
  next: ToolTier | null;
  have: Record<string, number>;
  can: boolean;
  sharpen: number;
  sharpenMax: number;
  sharpenCost: number;
}

export function forgeInfo(run: RunState, kind: ToolKind): ForgeInfo {
  const list = kind === 'pick' ? PICKS : SWORDS;
  const tier = kind === 'pick' ? run.pickTier : run.swordTier;
  const next = list[tier + 1] ?? null;
  const have: Record<string, number> = {};
  let can = !!next;
  if (next) for (const [k, n] of Object.entries(next.recipe)) {
    have[k] = run.bag[k] ?? 0;
    if (have[k] < n) can = false;
  }
  const lvl = kind === 'pick' ? run.pickSharpen : run.swordSharpen;
  const star = stack(run, 'starforge') > 0;
  return { kind, cur: list[tier], next, have, can, sharpen: lvl, sharpenMax: SHARPEN_MAX * (star ? 2 : 1),
    sharpenCost: Math.round(sharpenCost(kind, star ? Math.floor(lvl / 2) : lvl) * priceMult(run.layer)) };
}

export function forge(run: RunState, kind: ToolKind): boolean {
  const f = forgeInfo(run, kind);
  if (!f.can || !f.next) return false;
  for (const [k, n] of Object.entries(f.next.recipe)) run.bag[k] -= n;
  if (kind === 'pick') run.pickTier++;
  else run.swordTier++;
  return true;
}

export function sharpen(run: RunState, kind: ToolKind): boolean {
  const f = forgeInfo(run, kind);
  if (f.sharpen >= f.sharpenMax || run.coins < f.sharpenCost) return false;
  run.coins -= f.sharpenCost;
  const add = stack(run, 'starforge') > 0 ? 2 : 1;
  if (kind === 'pick') run.pickSharpen = Math.min(f.sharpenMax, run.pickSharpen + add);
  else run.swordSharpen = Math.min(f.sharpenMax, run.swordSharpen + add);
  return true;
}

// ---------------- лавка ----------------

export const itemPrice = (run: RunState, id: string, mult = 1): number =>
  Math.round(RARITY_PRICE[itemDef(id).rarity] * priceMult(run.layer) * mult);

export function addItem(meta: MetaState, run: RunState, id: string): void {
  const before = computeStats(meta, run).maxHp;
  run.items[id] = (run.items[id] ?? 0) + 1;
  if (id === 'crystalheart') run.extraLives++;
  const s = computeStats(meta, run);
  if (s.maxHp > before) run.hp += s.maxHp - before;
  clampHp(run, s);
}

export function buyShopItem(meta: MetaState, run: RunState, idx: number): boolean {
  const st = run.station;
  const id = st?.shop[idx];
  if (!st || !id) return false;
  const price = itemPrice(run, id);
  if (run.coins < price) return false;
  run.coins -= price;
  st.shop[idx] = '';
  addItem(meta, run, id);
  return true;
}

export const rerollPrice = (run: RunState): number => Math.round((8 + 6 * (run.station?.rerolls ?? 0)) * priceMult(run.layer));

export function reroll(meta: MetaState, run: RunState, rng: Rng): boolean {
  const st = run.station;
  if (!st) return false;
  const price = rerollPrice(run);
  if (run.coins < price) return false;
  run.coins -= price;
  st.rerolls++;
  st.shop = randomItems(meta, run, rng, 3, null);
  return true;
}

export function chooseReward(meta: MetaState, run: RunState, id: string): void {
  const st = run.station;
  if (!st?.reward?.includes(id) || st.rewardLeft <= 0) return;
  addItem(meta, run, id);
  st.rewardLeft--;
  if (st.rewardLeft <= 0) st.reward = null;
  else st.reward = st.reward.filter((x) => x !== id);
}

export type Supply = 'heal' | 'bomb' | 'coal' | 'scanner';

export function supplyPrice(run: RunState, what: Supply): number {
  const base = { heal: 12 + 10 * (run.station?.healBought ?? 0), bomb: 14, coal: 8, scanner: 10 }[what];
  return Math.round(base * priceMult(run.layer));
}

export function supplyBlocked(meta: MetaState, run: RunState, what: Supply): string | null {
  if (run.coins < supplyPrice(run, what)) return 'Мало монет';
  if (what === 'heal' && run.hp >= computeStats(meta, run).maxHp) return 'Здоровье полное';
  return null;
}

export function buySupply(meta: MetaState, run: RunState, what: Supply): boolean {
  if (supplyBlocked(meta, run, what)) return false;
  run.coins -= supplyPrice(run, what);
  if (what === 'heal') {
    const s = computeStats(meta, run);
    run.hp = Math.min(s.maxHp, run.hp + Math.ceil(s.maxHp * 0.5));
    if (run.station) run.station.healBought++;
  } else if (what === 'bomb') run.bombs++;
  else if (what === 'coal') run.bag.coal = (run.bag.coal ?? 0) + 3;
  else run.scanners++;
  return true;
}

/** Самоцветы и лишний металл на продажу: всё, кроме угля и руды для ближайшей ковки. */
export function sellable(run: RunState): { key: string; n: number; value: number }[] {
  const keep = new Set<string>(['coal']);
  for (const kind of ['pick', 'sword'] as const) {
    const f = forgeInfo(run, kind);
    if (f.next) for (const k of Object.keys(f.next.recipe)) keep.add(k);
  }
  return Object.entries(run.bag)
    .filter(([k, n]) => n > 0 && !keep.has(k))
    .map(([k, n]) => ({ key: k, n, value: oreByKey(k).value * n }));
}

export function sellOre(run: RunState, key: string): number {
  const n = run.bag[key] ?? 0;
  if (n <= 0) return 0;
  const v = oreByKey(key).value * n;
  run.bag[key] = 0;
  run.coins += v;
  return v;
}

// ---------------- комнаты этажа: торговец, алтарь, наковальня ----------------

export interface PropOffer {
  id: string;
  title: string;
  desc: string;
  price: number;
  item?: string;
}

export function merchantStock(meta: MetaState, run: RunState, rng: Rng): string[] {
  return randomItems(meta, run, rng, 3, null);
}

export function shrineOffers(meta: MetaState, run: RunState): PropOffer[] {
  const s = computeStats(meta, run);
  const blood = Math.ceil(s.maxHp * 0.25);
  return [
    { id: 'blood', title: 'Кровавая жертва', desc: `Отдать ${blood} здоровья: редкий предмет.`, price: blood },
    { id: 'dark', title: 'Тёмный дар', desc: 'Проклятый предмет и редкий в придачу.', price: 0 },
    { id: 'gold', title: 'Подношение', desc: 'Монеты за полное лечение и обычный предмет.', price: Math.round(30 * priceMult(run.layer)) },
  ];
}

/** Выбор у алтаря. Возвращает полученные предметы или null, если не хватает. */
export function useShrine(meta: MetaState, run: RunState, id: string, rng: Rng): string[] | null {
  const offer = shrineOffers(meta, run).find((o) => o.id === id);
  if (!offer) return null;
  const got: string[] = [];
  if (id === 'blood') {
    if (run.hp <= offer.price) return null;
    run.hp -= offer.price;
    got.push(...randomItems(meta, run, rng, 1, 'rare'));
  } else if (id === 'dark') {
    const cursed = itemPool(meta, run, 'cursed');
    if (cursed.length) got.push(rng.pick(cursed));
    got.push(...randomItems(meta, run, rng, 1, 'rare'));
  } else {
    if (run.coins < offer.price) return null;
    run.coins -= offer.price;
    got.push(...randomItems(meta, run, rng, 1, 'common'));
  }
  for (const it of got) addItem(meta, run, it);
  if (id === 'gold') run.hp = computeStats(meta, run).maxHp;
  return got;
}

export function useAnvil(run: RunState, kind: ToolKind): void {
  const max = SHARPEN_MAX * (stack(run, 'starforge') > 0 ? 2 : 1);
  if (kind === 'pick') run.pickSharpen = Math.min(max, run.pickSharpen + 2);
  else run.swordSharpen = Math.min(max, run.swordSharpen + 2);
}

// ---------------- итоги ----------------

export interface RunOutcome extends IngotResult {
  reason: 'cashout' | 'evac';
  depth: number;
  unlocks: string[];
}

export function evacKeep(meta: MetaState): number {
  return Math.min(1, EVAC_KEEP + 0.05 * buildingLevel(meta, 'insurance'));
}

/** Итог забега: слитки, статистика, открытия героев. */
export function finishRun(meta: MetaState, run: RunState, reason: 'cashout' | 'evac'): RunOutcome {
  const keep = reason === 'cashout' ? 1 : evacKeep(meta);
  const res = computeIngots(meta, run, keep);
  const depth = depthOf(run) + (run.station ? 100 : 0);
  meta.ingots += res.ingots;
  meta.stats.runs += 1;
  meta.stats.totalHaul += run.haul;
  meta.stats.bestDepth = Math.max(meta.stats.bestDepth, depth);
  if (reason === 'cashout') {
    meta.stats.cashOuts += 1;
    meta.firstCashOut = true;
  } else meta.stats.evacs += 1;
  const wasTutorial = !meta.tutorialDone;
  meta.tutorialDone = true;
  const unlocks = checkUnlocks(meta);
  if (wasTutorial) unlocks.unshift('Первая экспедиция позади. Дальше этажи сложнее, зато больше комнат и наград.');
  return { ...res, reason, depth, unlocks };
}

export function checkUnlocks(meta: MetaState): string[] {
  const out: string[] = [];
  for (const h of HEROES) {
    if (h.unlock && !meta.heroes.includes(h.id) && h.unlock.check(meta)) {
      meta.heroes.push(h.id);
      out.push(`Новый герой: ${h.name}, ${h.title.toLowerCase()}!`);
    }
  }
  return out;
}

/** Разлом пройден: лифт, новые предметы в шахте. */
export function onBossBeaten(meta: MetaState, run: RunState): string[] {
  const out: string[] = [];
  if (!meta.bosses.includes(run.layer)) {
    meta.bosses.push(run.layer);
    if (layerDef(run.layer + 1).ready) out.push(`Открыт лифт к пласту ${run.layer + 1}.`);
    const fresh = ITEMS.filter((x) => x.pool === run.layer).length;
    if (fresh) out.push(`В шахте появились новые предметы: ${fresh}.`);
  }
  out.push(...checkUnlocks(meta));
  return out;
}
