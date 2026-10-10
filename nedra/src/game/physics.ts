// Движение с коллизиями о клетки, прямая видимость и поле путей для врагов.
import type { Grid } from '../core/grid';

export interface Body {
  x: number;
  y: number;
  r: number;
}

export interface MoveResult {
  hitX: number;   // -1, 0, 1: в какую сторону упёрлись по X
  hitY: number;
}

const EPS = 0.001;

/** Двигает квадрат 2r x 2r с упором в твёрдые клетки. solid(x, y) - непроходима ли клетка. */
export function moveBody(b: Body, dx: number, dy: number, solid: (x: number, y: number) => boolean): MoveResult {
  const res: MoveResult = { hitX: 0, hitY: 0 };
  if (dx) {
    let nx = b.x + dx;
    const y0 = Math.floor(b.y - b.r + EPS), y1 = Math.floor(b.y + b.r - EPS);
    if (dx > 0) {
      const tx = Math.floor(nx + b.r);
      for (let ty = y0; ty <= y1; ty++) if (solid(tx, ty)) { nx = tx - b.r - EPS; res.hitX = 1; break; }
    } else {
      const tx = Math.floor(nx - b.r);
      for (let ty = y0; ty <= y1; ty++) if (solid(tx, ty)) { nx = tx + 1 + b.r + EPS; res.hitX = -1; break; }
    }
    b.x = nx;
  }
  if (dy) {
    let ny = b.y + dy;
    const x0 = Math.floor(b.x - b.r + EPS), x1 = Math.floor(b.x + b.r - EPS);
    if (dy > 0) {
      const ty = Math.floor(ny + b.r);
      for (let tx = x0; tx <= x1; tx++) if (solid(tx, ty)) { ny = ty - b.r - EPS; res.hitY = 1; break; }
    } else {
      const ty = Math.floor(ny - b.r);
      for (let tx = x0; tx <= x1; tx++) if (solid(tx, ty)) { ny = ty + 1 + b.r + EPS; res.hitY = -1; break; }
    }
    b.y = ny;
  }
  return res;
}

/** Есть ли прямая видимость между центрами (стены закрывают). */
export function lineOfSight(g: Grid, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 3);
  for (let k = 1; k < steps; k++) {
    const t = k / steps;
    if (g.solid(Math.floor(x0 + dx * t), Math.floor(y0 + dy * t))) return false;
  }
  return true;
}

export const FAR = 0xffff;

/** Поле расстояний до клетки игрока по открытым клеткам (BFS). */
export function flowField(g: Grid, px: number, py: number, out: Uint16Array, limit = 40): void {
  out.fill(FAR);
  if (!g.inside(px, py)) return;
  const q = new Int32Array(g.w * g.h);
  let head = 0, tail = 0;
  const s = g.i(px, py);
  out[s] = 0;
  q[tail++] = s;
  while (head < tail) {
    const i = q[head++];
    const d = out[i];
    if (d >= limit) continue;
    const x = i % g.w, y = (i - x) / g.w;
    if (x > 0) push(i - 1);
    if (x < g.w - 1) push(i + 1);
    if (y > 0) push(i - g.w);
    if (y < g.h - 1) push(i + g.w);
    function push(j: number) {
      if (out[j] !== FAR || g.solid(j % g.w, Math.floor(j / g.w))) return;
      out[j] = d + 1;
      q[tail++] = j;
    }
  }
}

/** Куда шагнуть из клетки по полю путей: центр соседней клетки с меньшим расстоянием. */
export function flowStep(g: Grid, field: Uint16Array, x: number, y: number): { x: number; y: number } | null {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (!g.inside(cx, cy)) return null;
  let best = field[g.i(cx, cy)], bx = -1, by = -1;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = cx + dx, ny = cy + dy;
    if (!g.inside(nx, ny)) continue;
    const d = field[g.i(nx, ny)];
    if (d < best) { best = d; bx = nx; by = ny; }
  }
  return bx < 0 ? null : { x: bx + 0.5, y: by + 0.5 };
}
