// Простой бот: идёт к лифту по самому дешёвому пути и по дороге забирает недорогую руду.
import { B, BLOCKS } from '../src/core/blocks';
import { blockCost } from '../src/core/economy';
import type { NodeType } from '../src/core/gen';
import { Rng } from '../src/core/rng';
import { newRun } from '../src/core/run';
import type { MetaState, RunState } from '../src/core/state';
import type { Audio } from '../src/game/audio';
import type { Dir, Input } from '../src/game/input';
import { TierScene } from '../src/game/tier';

const silent = new Proxy({}, { get: () => () => undefined }) as unknown as Audio;

export interface BotResult {
  done: boolean;
  failed: string | null;
  seconds: number;
  energyUsed: number;
  coins: number;
  ore: number;
  hearts: number;
}

export function playTier(meta: MetaState, run: RunState, node: NodeType, seed: number, oreBudget = 6): BotResult {
  let failed: string | null = null;
  let done = false;
  const tier = new TierScene({
    meta, run, audio: silent,
    atlas: null as never, gnome: null as never,
    coinTarget: () => null,
    complete: () => { done = true; },
    fail: (r) => { failed = r; },
    toast: () => undefined,
    pulseCoins: () => undefined,
  }, node, seed);
  const c0 = run.coins;
  let dir: Dir | null = null;
  const input = {
    keyDir: () => dir,
    pointer: { x: 0, y: 0, down: false },
    actions: [] as string[],
  } as unknown as Input;
  const dt = 1 / 60;
  let t = 0;
  while (!done && !failed && t < 240) {
    if (tier.p.state === 'idle') dir = nextDir(tier, oreBudget);
    tier.update(dt, input);
    t += dt;
  }
  return { done, failed, seconds: t, energyUsed: tier.energySpent, coins: run.coins - c0, ore: tier.oreMined, hearts: run.hearts };
}

function nextDir(tier: TierScene, oreBudget: number): Dir | null {
  const g = tier.g, p = tier.p;
  const n = g.w * g.h;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const start = g.i(p.x, p.y);
  dist[start] = 0;
  const open = [start];
  const cost = (x: number, y: number): number => {
    const b = g.get(x, y);
    if (b === B.EXIT || !BLOCKS[b].solid) return 0.05;
    if (!BLOCKS[b].diggable) return Infinity;
    return blockCost(b, tier.layer.id, tier.stats.power, tier.stats.costMult);
  };
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k;
    const cur = open.splice(bi, 1)[0];
    const cx = cur % g.w, cy = Math.floor(cur / g.w);
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const x = cx + dx, y = cy + dy;
      if (!g.inside(x, y)) continue;
      // наверх только копая (по воздуху не взлететь)
      if (dy < 0 && !g.solid(x, y)) continue;
      const c = cost(x, y) + (dy < 0 ? 1.5 : 0);
      if (!Number.isFinite(c)) continue;
      const j = g.i(x, y);
      if (dist[cur] + c < dist[j]) {
        dist[j] = dist[cur] + c;
        prev[j] = cur;
        open.push(j);
      }
    }
  }
  // ближайшая дешёвая руда, иначе лифт
  let target = g.i(g.exitX, g.exitY);
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    if (g.b[i] !== B.ORE && g.b[i] !== B.CHEST && g.b[i] !== B.CRATE) continue;
    if (dist[i] <= oreBudget && dist[i] < best) {
      best = dist[i];
      target = i;
    }
  }
  if (!Number.isFinite(dist[target])) return 'd';
  let step = target;
  while (prev[step] !== start && prev[step] !== -1) step = prev[step];
  if (prev[step] === -1 && step !== start) return 'd';
  const sx = step % g.w, sy = Math.floor(step / g.w);
  if (sy > p.y) return 'd';
  if (sy < p.y) return 'u';
  return sx > p.x ? 'r' : 'l';
}

export function botRun(meta: MetaState, layer: number, seed: number): RunState {
  const rng = new Rng(seed);
  return newRun(meta, { name: 'Бот', female: false, profession: 'miner', trait: null }, layer, rng.seed());
}
