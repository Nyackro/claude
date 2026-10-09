// Логика забега без отрисовки: наследники, пояс, станции, лавка, события, итоги.
import { CONSUMABLE_STACK, DRINK_PCT, DRINKS_PER_STATION, PRICES, REST_ENERGY_PCT, STEW_PCT, TOOL_MAX_LEVEL } from '../config';
import { ARTIFACTS, artifactDef, RARITY_ORDER, RARITY_WEIGHT, type Rarity } from '../data/artifacts';
import { consumableDef } from '../data/consumables';
import { EVENTS, eventDef, riddleChoices, type EventChoice, type EventCtx } from '../data/events';
import { NAMES_F, NAMES_M, PROFESSIONS, professionDef, TRAITS } from '../data/heirs';
import { layerDef } from '../data/layers';
import { GEAR, gearForLayer } from '../data/meta';
import { computeIngots, layerR, priceR, type IngotResult } from './economy';
import type { NodeType } from './gen';
import { genLayerMap } from './map';
import { Rng } from './rng';
import type { Heir, MetaState, RunState, StationState } from './state';
import { computeStats, type RunStats } from './stats';

export function rollHeirs(meta: MetaState, rng: Rng): Heir[] {
  const n = !meta.tutorialDone ? 1 : meta.stats.runs < 2 ? 2 : 3;
  const out: Heir[] = [];
  const profs = rng.shuffle([...meta.professions]);
  for (let k = 0; k < n; k++) {
    const female = rng.chance(0.3);
    const name = rng.pick(female ? NAMES_F : NAMES_M);
    const profession = !meta.tutorialDone ? 'miner' : profs[k % profs.length];
    const trait = !meta.tutorialDone ? null : rng.chance(0.8) ? rng.pick(TRAITS).id : null;
    out.push({ name, female, profession, trait });
  }
  return out;
}

export function availableLifts(meta: MetaState): number[] {
  const out = [1];
  for (let L = 2; L <= 10; L++) {
    if (!meta.bosses.includes(L - 1) || !layerDef(L).ready) break;
    const gear = gearForLayer(L);
    if (gear && !meta.gear.includes(gear.id)) break;
    out.push(L);
  }
  return out;
}

/** Почему нельзя пройти в пласт L (или null, если можно). */
export function layerBlocker(meta: MetaState, L: number): string | null {
  const def = layerDef(L);
  if (L > 10) return 'Дальше Сердце Мира. Этот путь откроется в следующих обновлениях.';
  if (!def.ready) return `Пласт ${L} «${def.name}» ещё копают строители. Скоро обновление!`;
  const gear = gearForLayer(L);
  if (gear && !meta.gear.includes(gear.id)) return `Нужно снаряжение: ${gear.name}. Купи его в посёлке.`;
  return null;
}

export function newRun(meta: MetaState, heir: Heir, startLayer: number, seed: number): RunState {
  const tutorial = !meta.tutorialDone;
  const rng = new Rng(seed);
  const run: RunState = {
    seed, heir, startLayer, layer: startLayer, step: 0,
    map: genLayerMap(rng.seed(), tutorial),
    energy: 0, hearts: 0, coins: 0, haul: 0, ore: {}, gemTypes: [], artifacts: [], consumables: [],
    toolLevel: 1, tiers: 0, revived: false, tutorial, drinksBought: 0, rerolls: 0, freeRerollUsed: false,
    heirRerollUsed: false, beltBonus: 0, oreBlessing: 0, chestBlessing: 0, pet: null, station: null,
    bossesThisRun: [], blocks: 0,
  };
  const s = computeStats(meta, run);
  run.energy = s.maxEnergy;
  run.hearts = s.maxHearts;
  for (const [id, n] of Object.entries(professionDef(heir.profession).start)) addConsumable(run, s, id, n);
  const kit = Math.min(3, startLayer - 1);
  if (kit > 0) run.coins = Math.round(6 * layerR(startLayer));
  run.station = {
    kind: 'start', eventSeed: rng.seed(), offer: null, offerExtra: false, shop: [], consumablesForSale: [],
    eventId: null, eventResult: null, restDone: true, next: run.map[0], forcedEnd: null, kitLeft: kit,
  };
  if (kit > 0) run.station.offer = randomArtifacts(meta, run, rng, 3, 'common');
  return run;
}

export function artifactPool(meta: MetaState): string[] {
  const tier = meta.bosses.length ? Math.max(...meta.bosses) : 0;
  return ARTIFACTS.filter((x) => x.rarity !== 'cursed' && x.pool <= tier).map((x) => x.id);
}

export function randomArtifacts(meta: MetaState, run: RunState, rng: Rng, n: number, min: Rarity,
  cursedChance = 0): string[] {
  const minIdx = RARITY_ORDER.indexOf(min);
  let pool = artifactPool(meta).filter((id) => !run.artifacts.includes(id));
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    if (cursedChance > 0 && rng.chance(cursedChance)) {
      const cursed = ARTIFACTS.filter((x) => x.rarity === 'cursed' && !run.artifacts.includes(x.id) && !out.includes(x.id));
      if (cursed.length) { out.push(rng.pick(cursed).id); continue; }
    }
    const cand = pool.filter((id) => RARITY_ORDER.indexOf(artifactDef(id).rarity) >= minIdx && !out.includes(id));
    if (!cand.length) break;
    const id = rng.weighted(cand, (x) => RARITY_WEIGHT[artifactDef(x).rarity]);
    out.push(id);
    pool = pool.filter((x) => x !== id);
  }
  return out;
}

export function addArtifact(run: RunState, s: RunStats, id: string): boolean {
  if (run.artifacts.includes(id)) return false;
  const slots = s.beltSlots + (artifactDef(id).id === 'pact' ? 1 : 0);
  if (run.artifacts.length >= slots) return false;
  run.artifacts.push(id);
  return true;
}

export function sellArtifact(run: RunState, id: string): number {
  const i = run.artifacts.indexOf(id);
  if (i < 0) return 0;
  run.artifacts.splice(i, 1);
  const price = Math.round(artifactPrice(id, run.layer) / 2);
  run.coins += price;
  return price;
}

export const ARTIFACT_PRICE: Record<Rarity, number> = { common: 10, rare: 18, epic: 30, legendary: 50, cursed: 14 };

export function artifactPrice(id: string, layer: number, mult = 1): number {
  return priceR(ARTIFACT_PRICE[artifactDef(id).rarity], layer, mult);
}

export function addConsumable(run: RunState, s: RunStats, id: string, n = 1): boolean {
  const slot = run.consumables.find((c) => c.id === id);
  if (slot) {
    if (slot.n >= CONSUMABLE_STACK) return false;
    slot.n = Math.min(CONSUMABLE_STACK, slot.n + n);
    return true;
  }
  if (run.consumables.length >= s.consumableSlots) return false;
  run.consumables.push({ id, n: Math.min(CONSUMABLE_STACK, n) });
  return true;
}

export function takeConsumable(run: RunState, id: string): boolean {
  const slot = run.consumables.find((c) => c.id === id);
  if (!slot || slot.n <= 0) return false;
  slot.n--;
  if (slot.n <= 0) run.consumables.splice(run.consumables.indexOf(slot), 1);
  return true;
}

/** Станция после пройденного яруса типа kind. Вызывать после того, как run.step указывает на пройденный ряд. */
export function makeStation(meta: MetaState, run: RunState, kind: NodeType, rng: Rng): StationState {
  const s = computeStats(meta, run);
  const st: StationState = {
    kind, eventSeed: rng.seed(), offer: null, offerExtra: false, shop: [], consumablesForSale: [],
    eventId: null, eventResult: null, restDone: kind !== 'rest', next: [], forcedEnd: null, kitLeft: 0,
  };
  run.drinksBought = 0;
  run.rerolls = 0;
  run.freeRerollUsed = false;
  if (kind === 'danger') st.offer = randomArtifacts(meta, run, rng, 3, 'rare', 0.15);
  if (kind === 'boss') st.offer = randomArtifacts(meta, run, rng, 3, 'rare');
  if (kind === 'fair') {
    st.shop = randomArtifacts(meta, run, rng, 3, 'common');
    st.consumablesForSale = ['dynamite', 'ladder', 'stew', 'scan', 'bomb'];
  }
  if (kind === 'cache') {
    const pool = EVENTS.filter((e) => (e.minLayer ?? 1) <= run.layer);
    st.eventId = rng.pick(pool).id;
  }
  if (run.artifacts.includes('piggy')) run.coins += Math.min(Math.round(run.coins * 0.1), Math.round(20 * layerR(run.layer)));
  if (run.artifacts.includes('plantain') && rng.chance(0.25)) run.hearts = Math.min(s.maxHearts, run.hearts + 1);

  if (run.step < run.map.length - 1) {
    st.next = run.map[run.step + 1];
  } else {
    const blocker = layerBlocker(meta, run.layer + 1);
    if (blocker) st.forcedEnd = blocker;
    else st.next = genLayerMap(rng.seed(), false)[0];
  }
  return st;
}

/** Переход к выбранному узлу: сдвигает ряд/пласт. Возвращает тип яруса. */
export function advance(run: RunState, node: NodeType, rng: Rng): NodeType {
  const st = run.station;
  if (st && st.kind === 'boss' && run.step >= run.map.length - 1) {
    run.layer += 1;
    run.map = genLayerMap(rng.seed(), false);
    run.map[0] = st.next;
    run.step = 0;
  } else if (st && st.kind !== 'start') {
    run.step += 1;
  }
  run.station = null;
  return node;
}

export type ShopItem = 'drink' | 'stew' | 'dynamite' | 'ladder' | 'repair' | 'scan' | 'bomb';

export function shopPrice(run: RunState, s: RunStats, item: ShopItem): number {
  const base = item === 'scan' || item === 'bomb' ? consumableDef(item).price : PRICES[item];
  return priceR(base, run.layer, s.shopMult);
}

export function canBuy(run: RunState, s: RunStats, item: ShopItem): string | null {
  if (run.coins < shopPrice(run, s, item)) return 'Мало монет';
  if (item === 'drink') {
    if (run.drinksBought >= DRINKS_PER_STATION) return 'Закончились';
    if (run.energy >= s.maxEnergy) return 'Энергия полная';
  }
  if (item === 'repair' && run.hearts >= s.maxHearts) return 'Каска цела';
  if (item !== 'drink' && item !== 'repair') {
    const slot = run.consumables.find((c) => c.id === item);
    if (slot ? slot.n >= CONSUMABLE_STACK : run.consumables.length >= s.consumableSlots) return 'Нет места';
  }
  return null;
}

export function buy(run: RunState, s: RunStats, item: ShopItem): boolean {
  if (canBuy(run, s, item)) return false;
  run.coins -= shopPrice(run, s, item);
  if (item === 'drink') {
    run.drinksBought++;
    run.energy = Math.min(Math.round(s.maxEnergy * 1.5), run.energy + Math.round(s.maxEnergy * DRINK_PCT));
  } else if (item === 'repair') {
    run.hearts = Math.min(s.maxHearts, run.hearts + 1);
  } else {
    addConsumable(run, s, item);
  }
  return true;
}

export function rerollPrice(run: RunState, s: RunStats): number {
  return priceR(PRICES.reroll + run.rerolls, run.layer, s.shopMult);
}

export function restOptions(run: RunState, s: RunStats): { id: 'energy' | 'heart' | 'tool'; label: string; can: boolean }[] {
  const pct = Math.round(REST_ENERGY_PCT * s.restMult * 100);
  return [
    { id: 'energy', label: `Поспать: +${pct}% энергии`, can: true },
    { id: 'heart', label: 'Подлатать каску: +1 сердце', can: run.hearts < s.maxHearts },
    { id: 'tool', label: `Заточить инструмент: уровень ${run.toolLevel + 1}`, can: run.toolLevel < TOOL_MAX_LEVEL },
  ];
}

export function rest(run: RunState, s: RunStats, choice: 'energy' | 'heart' | 'tool'): void {
  if (choice === 'energy') run.energy = Math.min(Math.round(s.maxEnergy * 1.5), run.energy + Math.round(s.maxEnergy * REST_ENERGY_PCT * s.restMult));
  if (choice === 'heart') run.hearts = Math.min(s.maxHearts, run.hearts + 1);
  if (choice === 'tool') run.toolLevel = Math.min(TOOL_MAX_LEVEL, run.toolLevel + 1);
}

export function useStew(run: RunState, s: RunStats): void {
  run.energy = Math.min(Math.round(s.maxEnergy * 1.5), run.energy + Math.round(s.maxEnergy * STEW_PCT * s.foodMult));
}

export function eventChoices(st: StationState): { title: string; text: string; choices: EventChoice[] } | null {
  if (!st.eventId) return null;
  const ev = eventDef(st.eventId);
  if (!ev) return null;
  if (ev.id === 'riddle') {
    const r = riddleChoices(new Rng(st.eventSeed));
    return { title: ev.title, text: r.text, choices: r.choices };
  }
  return { title: ev.title, text: ev.text, choices: ev.choices };
}

export function makeEventCtx(meta: MetaState, run: RunState, rng: Rng): EventCtx {
  const stats = () => computeStats(meta, run);
  return {
    run, rng,
    R: layerR(run.layer),
    maxEnergy: stats().maxEnergy,
    addArtifact: (id) => addArtifact(run, stats(), id),
    randomArtifact: (min, cursed) => (cursed
      ? randomArtifacts(meta, run, rng, 1, min, 1)[0] ?? null
      : randomArtifacts(meta, run, rng, 1, min)[0] ?? null),
    artifactName: (id) => artifactDef(id).name,
    addConsumable: (id, n = 1) => addConsumable(run, stats(), id, n),
    damage: (n) => { run.hearts = Math.max(1, run.hearts - n); },
    heal: (n) => { run.hearts = Math.min(stats().maxHearts, run.hearts + n); },
    energy: (pct) => {
      const s = stats();
      run.energy = Math.max(1, Math.min(Math.round(s.maxEnergy * 1.5), run.energy + Math.round(s.maxEnergy * pct)));
    },
    coins: (n) => { run.coins = Math.max(0, run.coins + n); },
  };
}

export interface RunOutcome extends IngotResult {
  reason: 'cashout' | 'evac';
  depth: number;
  unlocks: string[];
}

/** Итог забега: начисляет слитки и статистику, проверяет открытия. */
export function finishRun(meta: MetaState, run: RunState, reason: 'cashout' | 'evac'): RunOutcome {
  const s = computeStats(meta, run);
  const keep = reason === 'cashout' ? 1 : Math.min(1, s.evacKeep);
  const res = computeIngots(meta, run, keep);
  const depth = (run.startLayer - 1) * 300 + run.tiers * 100;
  meta.ingots += res.ingots;
  meta.stats.runs += 1;
  meta.stats.totalHaul += run.haul;
  meta.stats.blocks += run.blocks;
  meta.stats.bestDepth = Math.max(meta.stats.bestDepth, depth);
  if (reason === 'cashout') { meta.stats.cashOuts += 1; meta.firstCashOut = true; } else meta.stats.evacs += 1;
  for (const key of Object.keys(run.ore)) if (!meta.stats.oreTypes.includes(key)) meta.stats.oreTypes.push(key);
  const wasTutorial = !meta.tutorialDone;
  meta.tutorialDone = true;
  const unlocks = checkUnlocks(meta);
  if (wasTutorial) unlocks.unshift('Обучение пройдено: теперь у тебя выбор из нескольких наследников с чертами.');
  return { ...res, reason, depth, unlocks };
}

export function checkUnlocks(meta: MetaState): string[] {
  const out: string[] = [];
  for (const p of PROFESSIONS) {
    if (p.unlock && !meta.professions.includes(p.id) && p.unlock.check(meta)) {
      meta.professions.push(p.id);
      out.push(`Новая профессия: ${p.name}!`);
    }
  }
  return out;
}

/** Разлом пройден: лифт, чертёж, новые артефакты в пуле. */
export function onBossBeaten(meta: MetaState, run: RunState): string[] {
  const out: string[] = [];
  if (!run.bossesThisRun.includes(run.layer)) run.bossesThisRun.push(run.layer);
  if (meta.bosses.includes(run.layer)) return out;
  meta.bosses.push(run.layer);
  if (layerDef(run.layer + 1).ready) out.push(`Открыт лифт к пласту ${run.layer + 1}.`);
  const gear = GEAR.find((g) => g.from === run.layer);
  if (gear && !meta.blueprints.includes(gear.id)) {
    meta.blueprints.push(gear.id);
    out.push(`Чертёж: ${gear.name}. Снаряжение можно собрать в посёлке.`);
  }
  const fresh = ARTIFACTS.filter((x) => x.pool === run.layer).length;
  if (fresh) out.push(`В шахте появились новые артефакты: ${fresh}.`);
  out.push(...checkUnlocks(meta));
  return out;
}
