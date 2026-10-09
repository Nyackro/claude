import { COLS, ROWS, TOP_ROWS } from '../config';
import type { LayerDef } from '../data/layers';
import { oresOfLayer, type OreDef } from '../data/ores';
import { B } from './blocks';
import { Grid } from './grid';
import { Rng, noise2 } from './rng';

export type NodeType = 'normal' | 'rich' | 'danger' | 'cache' | 'fair' | 'rest' | 'boss';

export interface GenOptions {
  layer: LayerDef;
  node: NodeType;
  seed: number;
  tutorial?: boolean;
  extraChests?: number;
}

export interface VeinInfo {
  id: number;
  ore: number;
  size: number;
}

export interface TierLayout {
  grid: Grid;
  rows: number;
  spawnX: number;
  spawnY: number;
  veins: Map<number, VeinInfo>;
}

const MATERIALS = [B.DIRT, B.CLAY, B.STONE, B.HARD];
const isMaterial = (b: number) => b === B.DIRT || b === B.CLAY || b === B.STONE || b === B.HARD;

export function tierRows(node: NodeType, tutorial = false): number {
  if (tutorial) return ROWS.tutorial;
  if (node === 'boss') return ROWS.boss;
  if (node === 'cache') return ROWS.cache;
  return ROWS.normal;
}

export function generateTier(o: GenOptions): TierLayout {
  const rng = new Rng(o.seed);
  const L = o.layer;
  const boss = o.node === 'boss' ? L.boss.kind : null;
  const rows = tierRows(o.node, o.tutorial);
  const top = TOP_ROWS;
  const bottom = top + rows;               // ряд коренной породы с лифтом
  const g = new Grid(COLS, bottom + 1);

  fillMaterials(g, rng, L, top, bottom, boss === 'collapse' || !!o.tutorial);
  carveCaves(g, rng, top, bottom, boss === 'collapse' ? 0.3 : boss === 'flood' ? L.cave + 0.01 : o.tutorial ? 0.38 : L.cave);

  const veins = new Map<number, VeinInfo>();
  const richMult = o.node === 'rich' ? 1.5 : o.node === 'cache' ? 0.7 : boss ? 1.25 : o.tutorial ? 1.2 : 1;
  placeVeins(g, rng, L, top, bottom, rows, richMult, veins, boss === 'fire');
  if (boss === 'fire') placeCoalSeams(g, rng, top, bottom, veins);

  const hz = o.tutorial ? 0.35 : o.node === 'danger' ? 2 : o.node === 'rich' ? 1.3 : o.node === 'cache' ? 0.5 : 1;
  const h = L.hazards;
  placeSand(g, rng, top, bottom, Math.round(h.sand * hz));
  placeBoulders(g, rng, top, bottom, Math.round(h.boulders * hz * (boss === 'collapse' ? 0.4 : 1)));
  placeStalactites(g, rng, top, bottom, Math.round(h.stalactites * hz));
  if (boss !== 'flood') placeWater(g, rng, top, bottom, Math.round(h.water * hz));
  placeGas(g, rng, top, bottom, Math.round(h.gas * hz * (boss === 'fire' ? 1.5 : 1)));

  const chests = (o.node === 'danger' ? 0 : rng.chance(o.tutorial ? 1 : 0.5) ? 1 : 0) + (o.extraChests ?? 0);
  placeItems(g, rng, top, bottom, B.CHEST, chests);
  placeItems(g, rng, top, bottom, B.CRATE, o.tutorial ? 2 : rng.int(0, 2));

  // Коренная порода внизу и лифт
  for (let x = 0; x < g.w; x++) g.set(x, bottom, B.BEDROCK);
  g.exitX = rng.int(1, g.w - 2);
  g.exitY = bottom;
  g.set(g.exitX, bottom, B.EXIT);

  // Площадка прибытия
  const spawnX = rng.int(3, g.w - 4);
  for (let y = 0; y < top; y++) for (let x = 0; x < g.w; x++) g.set(x, y, B.EMPTY);
  for (let y = top; y < top + 3; y++) {
    for (let x = spawnX - 1; x <= spawnX + 1; x++) {
      const b = g.get(x, y);
      if (b === B.BOULDER || b === B.STALACTITE || b === B.GAS || b === B.SAND) g.set(x, y, B.DIRT);
    }
  }
  for (let x = spawnX - 1; x <= spawnX + 1; x++) if (!isMaterial(g.get(x, top)) && g.get(x, top) !== B.ORE) g.set(x, top, B.DIRT);

  settle(g);
  for (const [id, v] of veins) {
    let size = 0;
    for (let i = 0; i < g.vein.length; i++) if (g.vein[i] === id && g.b[i] === B.ORE) size++;
    if (size === 0) veins.delete(id);
    else v.size = size;
  }
  return { grid: g, rows, spawnX, spawnY: top - 1, veins };
}

function fillMaterials(g: Grid, rng: Rng, L: LayerDef, top: number, bottom: number, soft: boolean): void {
  // Шум с равномерным распределением (ранги), чтобы веса материалов соблюдались, а пятна оставались связными
  const s1 = rng.seed(), s2 = rng.seed();
  const cells: { i: number; n: number }[] = [];
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < g.w; x++) {
      const n = noise2(x * 0.34, y * 0.23, s1) * 0.72 + noise2(x * 0.95, y * 0.8, s2) * 0.28;
      cells.push({ i: g.i(x, y), n });
    }
  }
  const sorted = [...cells].sort((a, b) => a.n - b.n);
  const rank = new Map<number, number>();
  sorted.forEach((c, k) => rank.set(c.i, (k + 0.5) / sorted.length));
  const rows = bottom - top;
  for (let y = top; y < bottom; y++) {
    const d = (y - top) / rows;
    const m = soft ? [70, 22, 7, 1] : L.mat;
    const w = [m[0] * (1.3 - 0.6 * d), m[1], m[2] * (0.7 + 0.7 * d), m[3] * (0.35 + 1.4 * d)];
    const total = w[0] + w[1] + w[2] + w[3];
    for (let x = 0; x < g.w; x++) {
      const r = rank.get(g.i(x, y))! * total;
      let acc = 0, mat: number = B.HARD;
      for (let k = 0; k < 4; k++) {
        acc += w[k];
        if (r < acc) { mat = MATERIALS[k]; break; }
      }
      g.set(x, y, mat);
    }
  }
}

function carveCaves(g: Grid, rng: Rng, top: number, bottom: number, density: number): void {
  const y0 = top + 2, y1 = bottom - 2;
  const open = new Uint8Array(g.w * g.h);
  for (let y = y0; y <= y1; y++) for (let x = 0; x < g.w; x++) open[g.i(x, y)] = rng.chance(density + 0.14) ? 1 : 0;
  for (let it = 0; it < 4; it++) {
    const next = open.slice();
    for (let y = y0; y <= y1; y++) {
      for (let x = 0; x < g.w; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= g.w || ny < y0 || ny > y1 || !open[g.i(nx, ny)]) walls++;
          }
        }
        const i = g.i(x, y);
        if (walls >= 5) next[i] = 0;
        else if (walls <= 3) next[i] = 1;
      }
    }
    open.set(next);
  }
  for (let y = y0; y <= y1; y++) for (let x = 0; x < g.w; x++) if (open[g.i(x, y)]) g.set(x, y, B.EMPTY);
}

function randomCell(g: Grid, rng: Rng, y0: number, y1: number, ok: (x: number, y: number) => boolean): [number, number] | null {
  for (let k = 0; k < 60; k++) {
    const x = rng.int(0, g.w - 1), y = rng.int(y0, y1);
    if (ok(x, y)) return [x, y];
  }
  return null;
}

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function placeVeins(g: Grid, rng: Rng, L: LayerDef, top: number, bottom: number, rows: number, mult: number,
  veins: Map<number, VeinInfo>, coalHeavy: boolean): void {
  const ores = oresOfLayer(L.id);
  if (!ores.length) return;
  const count = Math.round((5 + rows / 5) * mult);
  const weight = (x: OreDef) => (coalHeavy && x.kind === 'coal' ? x.weight * 2 : x.weight);
  for (let v = 0; v < count; v++) {
    const ore = rng.weighted(ores, weight);
    const size = ore.kind === 'gem' ? rng.int(1, 2) : ore.kind === 'coal' ? rng.int(3, 6) : rng.int(2, 4);
    const minY = ore.kind === 'gem' ? top + Math.floor(rows * 0.35) : top + 1;
    const start = randomCell(g, rng, minY, bottom - 1, (x, y) => isMaterial(g.get(x, y)));
    if (!start) continue;
    const id = veins.size + 1;
    let [x, y] = start;
    for (let k = 0; k < size; k++) {
      g.set(x, y, B.ORE, ore.id);
      g.vein[g.i(x, y)] = id;
      const opts = DIRS.filter(([dx, dy]) => isMaterial(g.get(x + dx, y + dy)) && y + dy >= top + 1 && y + dy < bottom);
      if (!opts.length) break;
      const [dx, dy] = rng.pick(opts);
      x += dx;
      y += dy;
    }
    veins.set(id, { id, ore: ore.id, size });
  }
}

/** Угольные прослойки для Разлома «Подземный пожар»: огонь должен идти сверху вниз по связной сети. */
function placeCoalSeams(g: Grid, rng: Rng, top: number, bottom: number, veins: Map<number, VeinInfo>): void {
  const coal = oresOfLayer(3).find((x) => x.kind === 'coal');
  if (!coal) return;
  let x = rng.int(1, g.w - 2);
  const id = veins.size + 1;
  let size = 0;
  for (let y = top + 1; y < bottom - 1; y++) {
    if (rng.chance(0.55)) x = Math.max(0, Math.min(g.w - 1, x + rng.pick([-1, 1])));
    if (g.get(x, y) !== B.EMPTY) {
      g.set(x, y, B.ORE, coal.id);
      g.vein[g.i(x, y)] = id;
      size++;
    }
    if (rng.chance(0.25)) {
      const len = rng.int(2, 4), dir = rng.pick([-1, 1]);
      for (let k = 1; k <= len; k++) {
        const sx = x + k * dir;
        if (sx < 0 || sx >= g.w || g.get(sx, y) === B.EMPTY) break;
        g.set(sx, y, B.ORE, coal.id);
        g.vein[g.i(sx, y)] = id;
        size++;
      }
    }
  }
  veins.set(id, { id, ore: coal.id, size });
}

function placeSand(g: Grid, rng: Rng, top: number, bottom: number, n: number): void {
  for (let k = 0; k < n; k++) {
    const s = randomCell(g, rng, top + 3, bottom - 2, (x, y) => isMaterial(g.get(x, y)));
    if (!s) continue;
    let [x, y] = s;
    const size = rng.int(3, 5);
    for (let j = 0; j < size; j++) {
      g.set(x, y, B.SAND);
      const opts = DIRS.filter(([dx, dy]) => isMaterial(g.get(x + dx, y + dy)) && y + dy > top + 2 && y + dy < bottom);
      if (!opts.length) break;
      [x, y] = ((d) => [x + d[0], y + d[1]])(rng.pick(opts));
    }
  }
}

function placeBoulders(g: Grid, rng: Rng, top: number, bottom: number, n: number): void {
  for (let k = 0; k < n; k++) {
    const onFloor = rng.chance(0.5);
    const s = randomCell(g, rng, top + 3, bottom - 2, (x, y) =>
      onFloor ? g.get(x, y) === B.EMPTY && isMaterial(g.get(x, y + 1)) : isMaterial(g.get(x, y)));
    if (s) g.set(s[0], s[1], B.BOULDER);
  }
}

function placeStalactites(g: Grid, rng: Rng, top: number, bottom: number, n: number): void {
  for (let k = 0; k < n; k++) {
    const s = randomCell(g, rng, top + 3, bottom - 3, (x, y) =>
      g.get(x, y) === B.EMPTY && isMaterial(g.get(x, y - 1)) && g.get(x, y + 1) === B.EMPTY && g.get(x, y + 2) === B.EMPTY);
    if (s) g.set(s[0], s[1], B.STALACTITE);
  }
}

function placeWater(g: Grid, rng: Rng, top: number, bottom: number, n: number): void {
  for (let k = 0; k < n; k++) {
    const s = randomCell(g, rng, top + 4, bottom - 2, (x, y) => g.get(x, y) === B.EMPTY && g.solid(x, y + 1));
    if (!s) continue;
    const [sx, sy] = s;
    for (const dir of [-1, 1]) {
      for (let x = dir < 0 ? sx : sx + 1; x >= 0 && x < g.w; x += dir) {
        if (g.get(x, sy) !== B.EMPTY || !g.solid(x, sy + 1)) break;
        g.water[g.i(x, sy)] = 1;
      }
    }
  }
}

function placeGas(g: Grid, rng: Rng, top: number, bottom: number, n: number): void {
  for (let k = 0; k < n; k++) {
    const s = randomCell(g, rng, top + 4, bottom - 2, (x, y) => g.get(x, y) === B.STONE || g.get(x, y) === B.HARD);
    if (!s) continue;
    g.set(s[0], s[1], B.GAS);
    const [dx, dy] = rng.pick(DIRS);
    if (isMaterial(g.get(s[0] + dx, s[1] + dy)) && rng.chance(0.6)) g.set(s[0] + dx, s[1] + dy, B.GAS);
  }
}

function placeItems(g: Grid, rng: Rng, top: number, bottom: number, block: number, n: number): void {
  for (let k = 0; k < n; k++) {
    const onFloor = rng.chance(0.4);
    const s = randomCell(g, rng, top + 4, bottom - 2, (x, y) =>
      onFloor ? g.get(x, y) === B.EMPTY && isMaterial(g.get(x, y + 1)) : isMaterial(g.get(x, y)));
    if (s) g.set(s[0], s[1], block);
  }
}

/** Мгновенно роняет висящие валуны и сыпучку (после генерации). */
export function settle(g: Grid): void {
  for (let y = g.h - 2; y >= 0; y--) {
    for (let x = 0; x < g.w; x++) {
      const b = g.get(x, y);
      if (b !== B.BOULDER && b !== B.SAND) continue;
      let ny = y;
      while (g.get(x, ny + 1) === B.EMPTY) ny++;
      if (g.get(x, ny + 1) === B.EXIT) {
        g.set(x, y, B.EMPTY);
      } else if (ny !== y) {
        g.set(x, y, B.EMPTY);
        g.set(x, ny, b);
      }
    }
  }
}
