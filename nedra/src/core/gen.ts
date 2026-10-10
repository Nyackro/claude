// Генерация этажа (вид сверху): цепочка пещер от лифта к спуску, проходимый путь для деревянной кирки,
// боковые комнаты с испытаниями, рудные жилы, ящики, бочки, враги.
import { BOSS_H, FLOOR_H, FLOOR_W } from '../config';
import { enemyDef } from '../data/enemies';
import type { LayerDef } from '../data/layers';
import { oreByKey } from '../data/ores';
import { B, BLOCKS } from './blocks';
import { Grid } from './grid';
import { noise2, Rng } from './rng';

export type RoomKind = 'lair' | 'vault' | 'trial' | 'merchant' | 'shrine' | 'anvil' | 'spring' | 'secret';

export interface Rect { x0: number; y0: number; x1: number; y1: number }

export interface Room extends Rect {
  id: number;
  kind: RoomKind;
  cx: number;
  cy: number;
  lamp: { x: number; y: number } | null;
  door: { x: number; y: number };
}

export interface Prop {
  kind: 'merchant' | 'shrine' | 'anvil' | 'spring' | 'trial' | 'lamp' | 'mushroom';
  x: number;
  y: number;
  room: number;
}

export interface Spawn {
  id: string;
  x: number;
  y: number;
  elite: boolean;
  room: number;
}

export interface FloorLayout {
  grid: Grid;
  start: { x: number; y: number };
  exit: { x: number; y: number };
  rooms: Room[];
  props: Prop[];
  spawns: Spawn[];
  chambers: Rect[];
  arena: Rect | null;
  boss: string | null;
  route: [number, number][];
}

export const ROOM_INFO: Record<RoomKind, { name: string; w: number; h: number; weight: number }> = {
  lair: { name: 'Логово', w: 7, h: 6, weight: 18 },
  vault: { name: 'Сокровищница', w: 5, h: 4, weight: 16 },
  trial: { name: 'Испытание', w: 7, h: 6, weight: 14 },
  merchant: { name: 'Торговец', w: 5, h: 4, weight: 14 },
  shrine: { name: 'Алтарь', w: 5, h: 4, weight: 11 },
  anvil: { name: 'Наковальня', w: 5, h: 4, weight: 12 },
  spring: { name: 'Родник', w: 4, h: 4, weight: 9 },
  secret: { name: 'Тайник', w: 3, h: 3, weight: 0 },
};

const HARD_BY_TIER = [B.STONE, B.GRANITE, B.BASALT, B.OBSIDIAN];

export function generateFloor(layer: LayerDef, floor: number, seed: number, tutorial = false): FloorLayout {
  return floor >= 2 ? generateBossFloor(layer, seed) : generateNormal(layer, floor, seed, tutorial);
}

function fillRock(g: Grid, rng: Rng, weights: [number, number][], hardenDown: number): void {
  const s1 = rng.seed(), s2 = rng.seed();
  const cells: { i: number; n: number }[] = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    cells.push({ i: g.i(x, y), n: noise2(x * 0.28, y * 0.2, s1) * 0.75 + noise2(x * 0.8, y * 0.7, s2) * 0.25 });
  }
  const sorted = [...cells].sort((a, b) => a.n - b.n);
  const rank = new Float32Array(g.w * g.h);
  sorted.forEach((c, k) => { rank[c.i] = (k + 0.5) / sorted.length; });
  // веса твёрдых пород растут к низу этажа
  for (let y = 0; y < g.h; y++) {
    const d = y / g.h;
    const w = weights.map(([b, wt]) => [b, wt * (1 + BLOCKS[b].hp / 12 * d * hardenDown)] as [number, number]);
    const total = w.reduce((a, [, wt]) => a + wt, 0);
    for (let x = 0; x < g.w; x++) {
      let r = rank[g.i(x, y)] * total;
      let pick = w[w.length - 1][0];
      for (const [b, wt] of w) {
        if (r < wt) { pick = b; break; }
        r -= wt;
      }
      g.set(x, y, pick);
    }
  }
  for (let x = 0; x < g.w; x++) { g.set(x, 0, B.BEDROCK); g.set(x, g.h - 1, B.BEDROCK); }
  for (let y = 0; y < g.h; y++) { g.set(0, y, B.BEDROCK); g.set(g.w - 1, y, B.BEDROCK); }
}

function carveRect(g: Grid, r: Rect, room = 0): void {
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    if (x <= 0 || y <= 0 || x >= g.w - 1 || y >= g.h - 1) continue;
    g.set(x, y, B.FLOOR);
    if (room) g.room[g.i(x, y)] = room;
  }
}

function carveBlob(g: Grid, rng: Rng, cx: number, cy: number, rx: number, ry: number): Rect {
  const s = rng.seed();
  for (let y = cy - ry - 1; y <= cy + ry + 1; y++) for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
    if (x <= 1 || y <= 1 || x >= g.w - 2 || y >= g.h - 2) continue;
    const dx = (x - cx) / (rx + 0.5), dy = (y - cy) / (ry + 0.5);
    const edge = 1 + (noise2(x * 0.7, y * 0.7, s) - 0.5) * 0.6;
    if (dx * dx + dy * dy <= edge) g.set(x, y, B.FLOOR);
  }
  return { x0: cx - rx, y0: cy - ry, x1: cx + rx, y1: cy + ry };
}

/** Путь между точками: клетки, которые точно можно прокопать деревянной киркой. */
function softPath(g: Grid, rng: Rng, ax: number, ay: number, bx: number, by: number, soft: number): [number, number][] {
  let x = ax, y = ay;
  let guard = 0;
  const cells: [number, number][] = [];
  while ((x !== bx || y !== by) && guard++ < 400) {
    const dx = Math.sign(bx - x), dy = Math.sign(by - y);
    if (dx && (!dy || rng.chance(0.45))) x += dx;
    else if (dy) y += dy;
    cells.push([x, y]);
    const i = g.i(x, y);
    const b = g.b[i];
    if (b === B.FLOOR) continue;
    if (b === B.BEDROCK || g.tier(i) > 0) g.set(x, y, soft);
    else if (b === B.STONE && soft !== B.STONE) g.set(x, y, soft);
  }
  return cells;
}

const overlaps = (a: Rect, b: Rect, m: number) => !(a.x1 + m < b.x0 || b.x1 + m < a.x0 || a.y1 + m < b.y0 || b.y1 + m < a.y0);

function generateNormal(L: LayerDef, floor: number, seed: number, tutorial: boolean): FloorLayout {
  const rng = new Rng(seed);
  const g = new Grid(FLOOR_W, FLOOR_H);
  fillRock(g, rng, L.rocks[Math.min(floor, L.rocks.length - 1)], 0.8);

  const start = { x: Math.floor(g.w / 2), y: 3 };
  const startRect = { x0: start.x - 2, y0: 2, x1: start.x + 2, y1: 5 };
  carveRect(g, startRect);

  const chambers: Rect[] = [];
  let cx = start.x;
  for (let y = 13; y < g.h - 12; y += rng.int(10, 13)) {
    cx = Math.max(5, Math.min(g.w - 6, cx + rng.pick([-1, 1]) * rng.int(3, 7)));
    chambers.push(carveBlob(g, rng, cx, y, rng.int(2, 4), rng.int(2, 3)));
  }
  const exitX = rng.int(6, g.w - 7);
  const exitRect = { x0: exitX - 2, y0: g.h - 6, x1: exitX + 2, y1: g.h - 3 };
  carveRect(g, exitRect);
  const exit = { x: exitX, y: g.h - 3 };

  // маленькие природные карманы
  for (let k = 0; k < 6; k++) carveBlob(g, rng, rng.int(3, g.w - 4), rng.int(10, g.h - 10), rng.int(1, 2), 1);

  const rooms: Room[] = [];
  const props: Prop[] = [];
  const spawns: Spawn[] = [];
  const taken: Rect[] = [startRect, exitRect, ...chambers];

  placeVeins(g, rng, L, floor, chambers);

  // проходимый путь: старт -> пещеры -> спуск (до комнат, чтобы комнаты его не перекрыли)
  const soft = L.id === 1 && floor === 0 ? B.CLAY : B.STONE;
  const pts = [start, ...chambers.map((c) => ({ x: Math.round((c.x0 + c.x1) / 2), y: Math.round((c.y0 + c.y1) / 2) })), exit];
  const route: [number, number][] = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    for (const [x, y] of softPath(g, rng, pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y, soft)) {
      taken.push({ x0: x, y0: y, x1: x, y1: y });
      route.push([x, y]);
    }
  }

  // боковые комнаты
  const kinds = (Object.keys(ROOM_INFO) as RoomKind[]).filter((k) => ROOM_INFO[k].weight > 0);
  const want = tutorial ? 1 : 2 + (floor >= 1 ? 1 : 0);
  const chosen: RoomKind[] = tutorial ? ['spring'] : [];
  while (chosen.length < want) {
    const k = rng.weighted(kinds.filter((x) => !chosen.includes(x)), (x) => ROOM_INFO[x].weight);
    chosen.push(k);
  }
  if (!tutorial && rng.chance(0.4)) chosen.push('secret');
  for (const kind of chosen) {
    const room = placeRoom(g, rng, kind, chambers, taken, rooms.length + 1, L, floor);
    if (!room) continue;
    rooms.push(room);
    taken.push(room);
    fillRoom(g, room, props, spawns, L, floor);
  }

  for (const r of rooms) {
    if (r.kind === 'vault' || r.kind === 'secret') continue;
    const near = nearestPoint(pts, r.cx, r.cy);
    route.push(...softPath(g, rng, near.x, near.y, r.door.x, r.door.y, soft));
  }

  // ящики, бочки, кристаллы (кристаллы твёрже, их не ставим на проходимый путь)
  const onRoute = new Uint8Array(g.w * g.h);
  for (const [x, y] of route) onRoute[g.i(x, y)] = 1;
  for (let k = 0; k < (tutorial ? 4 : 3); k++) placeNearOpen(g, rng, B.CRATE, chambers, onRoute);
  for (let k = 0; k < (tutorial ? 1 : 2); k++) placeInChamber(g, rng, B.TNT, chambers);
  for (let k = 0; k < 2; k++) placeNearOpen(g, rng, B.CRYSTAL, chambers, onRoute);
  ensureMetals(g, rng, L, chambers, tutorial, onRoute);

  // враги в пещерах
  const pool = L.enemies;
  chambers.forEach((c, idx) => {
    if (idx === 0 && (tutorial || floor === 0)) return;
    const n = (tutorial ? 1 : 2) + floor + rng.int(0, 1) + (L.id - 1);
    for (let k = 0; k < n; k++) {
      const p = randomOpenIn(g, rng, c);
      if (!p) continue;
      spawns.push({ id: rng.weighted(pool, (x) => x[1])[0], x: p.x, y: p.y, elite: !tutorial && rng.chance(0.08 + 0.04 * floor), room: 0 });
    }
  });

  decorate(g, rng, L);
  for (let x = start.x - 2; x <= start.x + 2; x++) for (let y = 2; y <= 5; y++) g.seen[g.i(x, y)] = 1;
  return { grid: g, start, exit, rooms, props, spawns, chambers, arena: null, boss: null, route };
}

function nearestPoint(pts: { x: number; y: number }[], x: number, y: number) {
  let best = pts[0], bd = Infinity;
  for (const p of pts) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function placeRoom(g: Grid, rng: Rng, kind: RoomKind, chambers: Rect[], taken: Rect[], id: number, L: LayerDef, floor: number): Room | null {
  const { w, h } = ROOM_INFO[kind];
  for (let attempt = 0; attempt < 60; attempt++) {
    const c = rng.pick(chambers);
    const ccx = Math.round((c.x0 + c.x1) / 2);
    const left = ccx > g.w / 2 ? rng.chance(0.8) : rng.chance(0.2);
    const x0 = left ? rng.int(2, Math.max(2, c.x0 - w - 2)) : rng.int(Math.min(g.w - w - 2, c.x1 + 3), g.w - w - 2);
    const y0 = Math.max(3, Math.min(g.h - h - 8, rng.int(c.y0 - 3, c.y1)));
    const r: Rect = { x0, y0, x1: x0 + w - 1, y1: y0 + h - 1 };
    if (r.x0 < 2 || r.x1 > g.w - 3 || r.y1 > g.h - 8) continue;
    if (taken.some((t) => overlaps(t, r, 2))) continue;
    // проход в комнату со стороны пещеры
    const doorX = left ? r.x1 + 1 : r.x0 - 1;
    const doorY = Math.round((r.y0 + r.y1) / 2);
    const room: Room = { ...r, id, kind, cx: Math.round((r.x0 + r.x1) / 2), cy: Math.round((r.y0 + r.y1) / 2),
      lamp: kind === 'secret' ? null : { x: left ? r.x1 : r.x0, y: doorY }, door: { x: doorX, y: doorY } };
    carveRect(g, r, id);
    // стена комнаты
    const tier = kind === 'vault' ? Math.min(3, (L.id - 1) + floor) : -1;
    for (let y = r.y0 - 1; y <= r.y1 + 1; y++) for (let x = r.x0 - 1; x <= r.x1 + 1; x++) {
      const inner = x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
      if (inner || !g.inside(x, y) || g.get(x, y) === B.BEDROCK) continue;
      if (tier >= 0) g.set(x, y, HARD_BY_TIER[tier]);
      else if (g.get(x, y) === B.FLOOR) g.set(x, y, B.STONE);
    }
    if (kind === 'secret') g.set(room.door.x, room.door.y, B.CRACKED);
    if (kind === 'vault') {
      // в стенах сокровищницы - самоцветы
      const gems = L.ores.filter(([k]) => oreByKey(k).kind === 'gem');
      for (let k = 0; k < 4; k++) {
        const x = rng.pick([r.x0 - 1, r.x1 + 1]), y = rng.int(r.y0, r.y1);
        if (g.get(x, y) !== B.BEDROCK && gems.length) g.set(x, y, B.ORE, oreByKey(rng.weighted(gems, (q) => q[1])[0]).id, HARD_BY_TIER[Math.max(0, tier)]);
      }
    }
    return room;
  }
  return null;
}

function fillRoom(g: Grid, r: Room, props: Prop[], spawns: Spawn[], L: LayerDef, floor: number): void {
  const chest = (x: number, y: number, tier: number) => { g.set(x, y, B.CHEST); g.ore[g.i(x, y)] = tier; };
  if (r.lamp) props.push({ kind: 'lamp', x: r.lamp.x, y: r.lamp.y, room: r.id });
  switch (r.kind) {
    case 'lair':
      spawns.push({ id: L.mini, x: r.cx, y: r.cy, elite: false, room: r.id });
      chest(r.door.x < r.x0 ? r.x1 : r.x0, r.cy, 2);
      break;
    case 'vault':
      chest(r.cx, r.cy, floor >= 1 ? 3 : 2);
      break;
    case 'trial':
      props.push({ kind: 'trial', x: r.cx, y: r.cy, room: r.id });
      break;
    case 'merchant':
      props.push({ kind: 'merchant', x: r.cx, y: r.cy, room: r.id });
      break;
    case 'shrine':
      props.push({ kind: 'shrine', x: r.cx, y: r.cy, room: r.id });
      break;
    case 'anvil':
      props.push({ kind: 'anvil', x: r.cx, y: r.cy, room: r.id });
      break;
    case 'spring':
      props.push({ kind: 'spring', x: r.cx, y: r.cy, room: r.id });
      break;
    case 'secret':
      chest(r.cx, r.cy, 1);
      g.ore[g.i(r.cx, r.cy)] = 4;                // тайник: сундук с монетами
      break;
  }
}

function placeVeins(g: Grid, rng: Rng, L: LayerDef, floor: number, chambers: Rect[]): void {
  const count = 20 + floor * 3;
  const nearRoute = (x: number, y: number) => chambers.some((c) => x >= c.x0 - 5 && x <= c.x1 + 5 && y >= c.y0 - 4 && y <= c.y1 + 4);
  const rockAt = (x: number, y: number) => BLOCKS[g.get(x, y)].rock && g.get(x, y) !== B.ORE && g.room[g.i(x, y)] === 0;
  const vein = (key: string, x: number, y: number) => {
    const ore = oreByKey(key);
    const size = ore.kind === 'coal' ? rng.int(3, 6) : ore.kind === 'gem' ? rng.int(1, 2) : rng.int(2, 5);
    let n = 0;
    for (let k = 0; k < size; k++) {
      if (rockAt(x, y)) {
        g.set(x, y, B.ORE, ore.id, g.get(x, y));
        n++;
      }
      const [dx, dy] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      x = Math.max(1, Math.min(g.w - 2, x + dx));
      y = Math.max(1, Math.min(g.h - 2, y + dy));
    }
    return n;
  };
  const weights = L.ores.map(([k, w]) => [k, oreByKey(k).kind === 'gem' ? w * (1 + floor * 0.5) : w] as [string, number]);
  for (let v = 0; v < count; v++) {
    const key = rng.weighted(weights, (x) => x[1])[0];
    for (let a = 0; a < 30; a++) {
      const x = rng.int(1, g.w - 2), y = rng.int(7, g.h - 4);
      if (!rockAt(x, y)) continue;
      if (rng.chance(0.6) && !nearRoute(x, y)) continue;
      vein(key, x, y);
      break;
    }
  }
}

/** Металл для первой кирки и меча: медь и олово в пласте 1, железо дальше. */
function ensureMetals(g: Grid, rng: Rng, L: LayerDef, chambers: Rect[], tutorial: boolean, reserved: Uint8Array): void {
  const need = L.id === 1 ? ['copper', 'tin'] : L.id === 2 ? ['iron'] : ['iron', 'coal'];
  for (const key of need) {
    const ore = oreByKey(key);
    const target = key === 'tin' ? 6 : tutorial ? 16 : 14;
    let have = 0;
    for (let i = 0; i < g.b.length; i++) if (g.b[i] === B.ORE && g.ore[i] === ore.id) have++;
    for (let a = 0; a < 400 && have < target; a++) {
      const c = rng.pick(chambers);
      const x = rng.int(c.x0 - 3, c.x1 + 3), y = rng.int(c.y0 - 2, c.y1 + 2);
      if (!g.inside(x, y) || !BLOCKS[g.get(x, y)].rock || g.get(x, y) === B.ORE || g.room[g.i(x, y)]) continue;
      if (reserved[g.i(x, y)] && ore.tier > 0) continue;
      g.set(x, y, B.ORE, ore.id, g.get(x, y));
      have++;
    }
  }
}

function randomOpenIn(g: Grid, rng: Rng, r: Rect): { x: number; y: number } | null {
  for (let a = 0; a < 40; a++) {
    const x = rng.int(r.x0, r.x1), y = rng.int(r.y0, r.y1);
    if (g.open(x, y) && g.room[g.i(x, y)] === 0) return { x, y };
  }
  return null;
}

function placeNearOpen(g: Grid, rng: Rng, block: number, chambers: Rect[], reserved: Uint8Array): void {
  for (let a = 0; a < 60; a++) {
    const c = rng.pick(chambers);
    const x = rng.int(c.x0 - 2, c.x1 + 2), y = rng.int(c.y0 - 2, c.y1 + 2);
    if (!g.inside(x, y) || !BLOCKS[g.get(x, y)].rock || g.room[g.i(x, y)] || reserved[g.i(x, y)]) continue;
    if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g.open(x + dx, y + dy))) continue;
    g.set(x, y, block);
    return;
  }
}

function placeInChamber(g: Grid, rng: Rng, block: number, chambers: Rect[]): void {
  for (let a = 0; a < 40; a++) {
    const p = randomOpenIn(g, rng, rng.pick(chambers));
    if (p) { g.set(p.x, p.y, block); return; }
  }
}

function decorate(g: Grid, rng: Rng, L: LayerDef): void {
  for (let i = 0; i < g.b.length; i++) {
    if (g.b[i] !== B.FLOOR || g.room[i]) continue;
    const r = rng.next();
    if (r < 0.06) g.deco[i] = 1;
    else if (r < 0.09) g.deco[i] = L.id === 1 ? 2 : 3;
    else if (r < 0.1 && L.id === 2) g.deco[i] = 5;
  }
}

function generateBossFloor(L: LayerDef, seed: number): FloorLayout {
  const rng = new Rng(seed);
  const g = new Grid(FLOOR_W, BOSS_H);
  fillRock(g, rng, L.rocks[2] ?? L.rocks[0], 0.3);
  const start = { x: Math.floor(g.w / 2), y: 3 };
  carveRect(g, { x0: start.x - 2, y0: 2, x1: start.x + 2, y1: 5 });
  softPath(g, rng, start.x, 5, start.x, 11, B.DIRT);
  const arena: Rect = { x0: 3, y0: 12, x1: g.w - 4, y1: g.h - 9 };
  const acx = (arena.x0 + arena.x1) / 2, acy = (arena.y0 + arena.y1) / 2;
  const rx = (arena.x1 - arena.x0) / 2 + 0.5, ry = (arena.y1 - arena.y0) / 2 + 0.5;
  for (let y = arena.y0; y <= arena.y1; y++) for (let x = arena.x0; x <= arena.x1; x++) {
    if (((x - acx) / rx) ** 2 + ((y - acy) / ry) ** 2 <= 1) g.set(x, y, B.FLOOR);
  }
  // колонны
  for (let k = 0; k < 4; k++) {
    const x = Math.round(acx + (k % 2 ? 1 : -1) * rx * 0.45), y = Math.round(acy + (k < 2 ? -1 : 1) * ry * 0.4);
    g.set(x, y, B.GRANITE);
    if (rng.chance(0.5)) g.set(x + 1, y, B.GRANITE);
  }
  g.set(Math.round(acx) - 4, Math.round(acy), B.TNT);
  g.set(Math.round(acx) + 4, Math.round(acy), B.TNT);
  const exit = { x: Math.round(acx), y: g.h - 4 };
  softPath(g, rng, Math.round(acx), Math.round(arena.y1), exit.x, g.h - 8, B.DIRT);
  // комната спуска: коренная порода вокруг, сверху запечатанный проход до победы над боссом
  for (let y = g.h - 7; y <= g.h - 2; y++) for (let x = exit.x - 2; x <= exit.x + 2; x++) {
    const inner = x >= exit.x - 1 && x <= exit.x + 1 && y >= g.h - 6 && y <= g.h - 3;
    if (inner) g.set(x, y, B.FLOOR);
    else if (y === g.h - 7 && Math.abs(x - exit.x) <= 1) g.set(x, y, B.DOOR);
    else g.set(x, y, B.BEDROCK);
  }
  for (let x = start.x - 2; x <= start.x + 2; x++) for (let y = 2; y <= 5; y++) g.seen[g.i(x, y)] = 1;
  decorate(g, rng, L);
  const boss = enemyDef(L.boss).id;
  return { grid: g, start, exit, rooms: [], props: [], spawns: [], chambers: [arena], arena, boss, route: [] };
}

/** Можно ли дойти от старта до спуска, копая только породу уровня tier и ниже. */
export function reachable(g: Grid, from: { x: number; y: number }, to: { x: number; y: number }, tier: number): boolean {
  const seen = new Uint8Array(g.w * g.h);
  const q = [g.i(from.x, from.y)];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % g.w, y = (i - x) / g.w;
    if (x === to.x && y === to.y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!g.inside(nx, ny)) continue;
      const j = g.i(nx, ny);
      if (seen[j]) continue;
      const b = g.b[j];
      if (b === B.BEDROCK || b === B.DOOR || (BLOCKS[b].solid && g.tier(j) > tier)) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return false;
}
