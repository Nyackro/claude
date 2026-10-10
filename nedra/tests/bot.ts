// Бот для проверки этажей без отрисовки: идёт к спуску по самому быстрому пути (копая), рубит врагов, бьёт босса.
import { B, BLOCKS } from '../src/core/blocks';
import { advance, buySupply, chooseReward, completeFloor, finishRun, floorSeed, forge, forgeInfo, newRun, sellable, sellOre, sharpen,
  supplyBlocked, type RunOutcome } from '../src/core/run';
import { Rng } from '../src/core/rng';
import { newMeta, type MetaState, type RunState } from '../src/core/state';
import { computeStats } from '../src/core/stats';
import type { Audio } from '../src/game/audio';
import { Floor, type FloorEnv } from '../src/game/floor';

export const silentAudio = new Proxy({}, { get: () => () => undefined }) as unknown as Audio;

export interface FloorResult {
  layer: number;
  floor: number;
  time: number;
  done: boolean;
  died: boolean;
  hpLost: number;
  kills: number;
  ore: number;
  coins: number;
  stuck: number;
}

export function makeEnv(meta: MetaState, run: RunState, log: string[] = []): FloorEnv & { state: { done: boolean; died: boolean } } {
  const state = { done: false, died: false };
  return {
    meta, run, audio: silentAudio, state,
    toast: (t) => log.push(t),
    complete: () => { state.done = true; },
    died: () => { state.died = true; },
    openProp: (_k, prop) => { prop.used = true; },
    itemFound: () => undefined,
  };
}

/** Время прохода клетки: открытая - шаг, порода - удары кирки. */
function cellCost(f: Floor, i: number): number {
  const g = f.g, s = f.stats;
  const b = g.b[i];
  const d = BLOCKS[b];
  if (!d.solid) return 1 / s.speed;
  if (d.hp === Infinity || b === B.TNT || g.tier(i) > s.pickTier) return Infinity;
  return Math.ceil(g.hp[i] / s.pickPower) * s.mineInterval + 1 / s.speed;
}

/** Дейкстра по клеткам от гнома: время до каждой клетки и откуда пришли. */
export function dijkstra(f: Floor, goal = -1): { dist: Float64Array; prev: Int32Array; start: number } {
  const g = f.g, n = g.w * g.h;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const start = g.i(Math.floor(f.p.x), Math.floor(f.p.y));
  dist[start] = 0;
  const heap: [number, number][] = [[0, start]];
  const push = (d: number, i: number) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    if (i === goal) break;
    const x = i % g.w, y = (i - x) / g.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!g.inside(nx, ny)) continue;
      const j = g.i(nx, ny);
      const c = cellCost(f, j);
      if (c === Infinity) continue;
      if (d + c < dist[j]) {
        dist[j] = d + c;
        prev[j] = i;
        push(d + c, j);
      }
    }
  }
  return { dist, prev, start };
}

function pathTo(d: { prev: Int32Array; start: number }, goal: number): number[] {
  if (d.prev[goal] < 0 && goal !== d.start) return [];
  const path: number[] = [];
  for (let i = goal; i !== d.start && i >= 0; i = d.prev[i]) path.unshift(i);
  return path;
}

export function plan(f: Floor, tx: number, ty: number): number[] {
  const goal = f.g.i(tx, ty);
  return pathTo(dijkstra(f, goal), goal);
}

/** Ближайшая видимая добыча (руда по силам, сундук, ящик) не дальше limit секунд. */
function lootPath(f: Floor, limit: number): number[] {
  const g = f.g;
  const d = dijkstra(f);
  let best = -1, bc = limit;
  for (let i = 0; i < g.b.length; i++) {
    if (!g.seen[i] || d.dist[i] >= bc) continue;
    const b = g.b[i];
    if (b === B.ORE || b === B.CHEST || b === B.CRATE || b === B.CRYSTAL) { bc = d.dist[i]; best = i; }
  }
  return best < 0 ? [] : pathTo(d, best);
}

/** Прогон одного этажа ботом. */
export function playFloor(meta: MetaState, run: RunState, maxTime = 600, log: string[] = [], greedy = 5): FloorResult {
  const env = makeEnv(meta, run, log);
  const f = new Floor(env, floorSeed(run));
  const dt = 1 / 60;
  const hp0 = run.hp;
  let path: number[] = [];
  let replan = 0, stuckT = 0, stuck = 0, lastX = f.p.x, lastY = f.p.y, jiggle = 0, jx = 0, jy = 0;
  let hpLost = 0, prevHp = run.hp;
  const g = f.g;
  const hurt = f.hurt.bind(f);
  f.hurt = (raw, from, why = '') => {
    if (f.p.inv <= 0) log.push(`${f.time.toFixed(1)}s ${raw} ${from ? `${from.id}:${from.state}` : why || 'proj'} hp=${run.hp}`);
    hurt(raw, from, why);
  };
  while (f.time < maxTime && !env.state.done && !env.state.died) {
    const actions: string[] = [];
    let mx = 0, my = 0;
    const boss = f.boss && !f.boss.dead ? f.boss : null;
    const near = f.nearest(f.p.x, f.p.y, 3);
    if (near && f.abilityReady >= 1) actions.push('ability');
    const tele = f.telegraphs.find((t) => Math.hypot(f.p.x - t.x, f.p.y - t.y) < t.r + 0.45);
    if (tele) {
      // уйти из красного круга
      const d = Math.hypot(f.p.x - tele.x, f.p.y - tele.y) || 1;
      mx = (f.p.x - tele.x) / d; my = (f.p.y - tele.y) / d;
      if (d < 0.05) { mx = 1; my = 0; }
    } else if (jiggle > 0) {
      jiggle -= dt;
      mx = jx; my = jy;
    } else if (boss) {
      // бей и отходи
      const d = Math.hypot(boss.x - f.p.x, boss.y - f.p.y) || 1;
      const ux = (boss.x - f.p.x) / d, uy = (boss.y - f.p.y) / d;
      const want = boss.under ? 3 : f.p.swordT <= 0.05 ? f.stats.swordRange + boss.r - 0.35 : 2.6;
      // кружим вокруг босса, чтобы не упираться в стены
      const side = Math.floor(f.time / 4) % 2 ? 1 : -1;
      if (d > want + 0.2) { mx = ux - uy * side * 0.4; my = uy + ux * side * 0.4; }
      else if (d < want - 0.2) { mx = -ux * 0.6 - uy * side * 0.8; my = -uy * 0.6 + ux * side * 0.8; }
      else { mx = -uy * side; my = ux * side; }
    } else {
      replan -= dt;
      const cell = g.i(Math.floor(f.p.x), Math.floor(f.p.y));
      if (replan <= 0 || !path.length) {
        replan = 0.5;
        const a = f.layout.arena;
        if (a && !f.bossStarted) path = plan(f, Math.floor((a.x0 + a.x1) / 2), a.y0 + 3);
        else {
          path = greedy ? lootPath(f, greedy) : [];
          if (!path.length) {
            const ex = f.layout.exit;
            path = plan(f, ex.x, ex.y);
          }
        }
      }
      while (path.length && path[0] === cell) path.shift();
      const next = path[0];
      if (next !== undefined) {
        const nx = (next % g.w) + 0.5, ny = Math.floor(next / g.w) + 0.5;
        const dx = nx - f.p.x, dy = ny - f.p.y, d = Math.hypot(dx, dy) || 1;
        mx = dx / d; my = dy / d;
      }
    }
    f.update(dt, { mx, my }, actions);
    if (run.hp < prevHp) hpLost += prevHp - run.hp;
    prevHp = run.hp;
    stuckT += dt;
    if (stuckT >= 3) {
      if (Math.hypot(f.p.x - lastX, f.p.y - lastY) < 0.5 && !boss && !f.nearest(f.p.x, f.p.y, 4)) {
        stuck++;
        jiggle = 0.6;
        const a = Math.random() * Math.PI * 2;
        jx = Math.cos(a); jy = Math.sin(a);
        path = [];
      }
      stuckT = 0;
      lastX = f.p.x; lastY = f.p.y;
    }
  }
  void hp0;
  return { layer: run.layer, floor: run.floor, time: Math.round(f.time), done: env.state.done, died: env.state.died, hpLost: Math.round(hpLost),
    kills: f.kills, ore: f.oreMined, coins: run.coins, stuck };
}

/** Простая стратегия привала: награда, ковка, заточка, лечение, продажа самоцветов. */
export function botStation(meta: MetaState, run: RunState): void {
  const st = run.station!;
  if (st.reward?.length) chooseReward(meta, run, st.reward[0]);
  for (const s of sellable(run)) sellOre(run, s.key);
  if (run.swordTier <= run.pickTier) { forge(run, 'sword'); forge(run, 'pick'); } else { forge(run, 'pick'); forge(run, 'sword'); }
  const s = computeStats(meta, run);
  while (run.hp < s.maxHp * 0.6 && !supplyBlocked(meta, run, 'heal')) buySupply(meta, run, 'heal');
  for (let k = 0; k < 20; k++) {
    const pick = forgeInfo(run, 'pick'), sword = forgeInfo(run, 'sword');
    const kind = sword.sharpen <= pick.sharpen ? 'sword' : 'pick';
    if (!sharpen(run, kind) && !sharpen(run, kind === 'sword' ? 'pick' : 'sword')) break;
  }
}

export interface RunSim {
  floors: FloorResult[];
  outcome: RunOutcome;
  run: RunState;
}

/** Целый забег ботом: до смерти или до конца готовых пластов. */
export function simulateRun(meta: MetaState, hero: string, seed: number, maxLayer = 3, log: string[] = []): RunSim {
  const run = newRun(meta, hero, 1, seed);
  const rng = new Rng(seed ^ 0x5bd1e995);
  const floors: FloorResult[] = [];
  for (;;) {
    botStation(meta, run);
    if (run.station?.kind === 'boss' && (run.station.forced || run.layer >= maxLayer)) {
      return { floors, outcome: finishRun(meta, run, 'cashout'), run };
    }
    advance(run);
    log.length = 0;
    const r = playFloor(meta, run, 600, log);
    floors.push(r);
    if (!r.done) return { floors, outcome: finishRun(meta, run, 'evac'), run };
    completeFloor(meta, run, rng);
  }
}

export const freshMeta = (): MetaState => {
  const m = newMeta();
  m.tutorialDone = true;
  return m;
};
