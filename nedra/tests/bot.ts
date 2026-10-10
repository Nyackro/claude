// Бот для проверки этажей без отрисовки: идёт к спуску по самому быстрому пути (копая), рубит врагов, бьёт босса.
import { B, BLOCKS } from '../src/core/blocks';
import { advance, buySupply, captiveHere, chooseReward, completeFloor, finishRun, floorSeed, forge, forgeInfo, newRun, rescueNpc, sellable, sellOre,
  sharpen, supplyBlocked, type RunOutcome } from '../src/core/run';
import { Rng } from '../src/core/rng';
import { newMeta, type MetaState, type RunState } from '../src/core/state';
import { computeStats } from '../src/core/stats';
import type { Audio } from '../src/game/audio';
import { Floor, segDist, type FloorEnv } from '../src/game/floor';
import { BUILDINGS, buildingCost, buildingLevel } from '../src/data/meta';
import { buyNpcUpgrade, npcUpgrades } from '../src/core/run';

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
    captive: captiveHere(meta, run)?.id ?? null,
    rescue: (id) => { rescueNpc(meta, run, id); },
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

const TAU = Math.PI * 2;

/** Опасность точки на ближайшие horizon секунд: удары с неба, лучи, волны, зоны, снаряды, бомбы, красные круги. */
export function danger(f: Floor, x: number, y: number, horizon: number): number {
  const pr = f.p.r;
  let d = 0;
  for (const st of f.strikes) {
    if (st.t > horizon + 0.6) continue;
    const inside = st.square ? Math.abs(x - st.x) < st.r + pr && Math.abs(y - st.y) < st.r + pr : Math.hypot(x - st.x, y - st.y) < st.r + pr;
    if (inside) d += 2 + 2 / (0.2 + st.t);
  }
  for (const b of f.beams) {
    if (b.warn > horizon + 0.5) continue;
    for (const a of b.spin ? [b.a, b.a + b.spin * (horizon + Math.max(0, b.warn))] : [b.a]) {
      const ex = b.x + Math.cos(a) * b.len, ey = b.y + Math.sin(a) * b.len;
      if (segDist(x, y, b.x, b.y, ex, ey) < b.w / 2 + pr + 0.3) { d += b.warn > 0 ? 3 : 6; break; }
    }
  }
  for (const w of f.waves) {
    if (w.hit) continue;
    const dist = Math.hypot(x - w.x, y - w.y), r1 = w.r + w.speed * horizon;
    if (dist < w.r - 0.5 || dist > r1 + 0.5) continue;
    let da = Math.atan2(y - w.y, x - w.x) - w.gapA;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    if (Math.abs(da) > w.gapW / 2 - 0.12) d += 4;
  }
  for (const z of f.zones) if (Math.hypot(x - z.x, y - z.y) < z.r + pr * 0.3 + 0.25) d += 2;
  for (const b of f.bombs) if (!b.safe && b.t < horizon + 0.5 && Math.hypot(x - b.x, y - b.y) < b.r + 0.3) d += 4;
  for (const t of f.telegraphs) {
    const dd = Math.hypot(x - t.x, y - t.y);
    if (t.ring ? Math.abs(dd - t.r) < 0.8 : dd < t.r + 0.45) d += 3;
  }
  for (const p of f.projs) {
    if (p.mine || p.kind === 'ebomb') continue;
    if (Math.abs(p.x - x) > 5 || Math.abs(p.y - y) > 5) continue;
    for (const t of [0.06, 0.15, 0.3]) {
      const tt = Math.max(0, t - p.wait);
      if (Math.hypot(x - p.x - p.vx * tt, y - p.y - p.vy * tt) < p.r + pr + 0.12) { d += 3; break; }
    }
  }
  return d;
}

/** Куда шагнуть: желаемое направление, но в обход опасности. */
export function steer(f: Floor, mx: number, my: number): [number, number] {
  const p = f.p, sp = f.stats.speed * (p.slowT > 0 ? 0.55 : 1), h = 0.22;
  const want = Math.hypot(mx, my);
  const ahead = (cx: number, cy: number, k: number) => danger(f, p.x + cx * sp * h * k, p.y + cy * sp * h * k, h * k);
  if (danger(f, p.x, p.y, h) === 0 && (want === 0 || ahead(mx / want, my / want, 1) + ahead(mx / want, my / want, 2) === 0)) return [mx, my];
  let best: [number, number] = [mx, my], bestScore = Infinity;
  const cands: [number, number][] = [[0, 0]];
  if (want) cands.push([mx / want, my / want]);
  for (let k = 0; k < 16; k++) cands.push([Math.cos((k / 16) * TAU), Math.sin((k / 16) * TAU)]);
  for (const [cx, cy] of cands) {
    if ((cx || cy) && f.g.solid(Math.floor(p.x + cx * 0.55), Math.floor(p.y + cy * 0.55)) && !(want && cx * mx + cy * my > 0.98 * want)) continue;
    const dng = ahead(cx, cy, 1) + 0.6 * ahead(cx, cy, 2.2);
    const align = want ? 1 - (cx * mx + cy * my) / want : cx || cy ? 0.2 : 0;
    const score = dng * 10 + align;
    if (score < bestScore) { bestScore = score; best = [cx, cy]; }
  }
  return best;
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
    if (run.potions > 0 && run.hp < f.stats.maxHp * 0.35) actions.push('potion');
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
        const a = f.layout.arena, c = f.captive;
        if (a && !f.bossStarted) path = plan(f, Math.floor((a.x0 + a.x1) / 2), a.y0 + 3);
        else if (c && !c.done) {
          // пленник: к клетке, стража проснётся и полезет сама
          path = c.open ? plan(f, c.x, c.y) : plan(f, c.x, c.y + 2);
          if (!path.length) path = plan(f, c.x, c.y - 2);
        } else {
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
    if (!process.env.NO_STEER) [mx, my] = steer(f, mx, my);
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
  if (run.swordTier <= run.pickTier) { forge(run, 'sword', meta); forge(run, 'pick', meta); } else { forge(run, 'pick', meta); forge(run, 'sword', meta); }
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
export function simulateRun(meta: MetaState, hero: string, seed: number, maxLayer = 3, log: string[] = [], startLayer = 1): RunSim {
  const run = newRun(meta, hero, startLayer, seed);
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

/** Посёлок: покупать самые дешёвые улучшения (постройки и мастера), пока хватает слитков. */
export function botMeta(meta: MetaState): void {
  for (let k = 0; k < 60; k++) {
    const opts: { c: number; buy: () => void }[] = [];
    for (const b of BUILDINGS) {
      const lvl = buildingLevel(meta, b.id);
      if (lvl < b.max) opts.push({ c: buildingCost(b, lvl), buy: () => { meta.ingots -= buildingCost(b, lvl); meta.buildings[b.id] = lvl + 1; } });
    }
    for (const id of meta.rescued) {
      for (const u of npcUpgrades(meta, id)) if (u.next) opts.push({ c: u.cost, buy: () => { buyNpcUpgrade(meta, u.id); } });
    }
    opts.sort((a, b) => a.c - b.c);
    const o = opts[0];
    if (!o || meta.ingots < o.c) break;
    o.buy();
  }
}
