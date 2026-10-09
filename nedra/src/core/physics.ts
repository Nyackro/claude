import { BOULDER_WOBBLE, FALL_ACCEL, FALL_MAX, STALACTITE_WOBBLE } from '../config';
import { oreById } from '../data/ores';
import { B } from './blocks';
import type { Grid } from './grid';

export interface FallingBody {
  kind: number;      // B.BOULDER | B.SAND | B.STALACTITE
  x: number;
  y: number;         // клетка сверху тела (дробная)
  vy: number;
}

export interface SimHooks {
  player(): { x: number; y: number };
  hitPlayer(kind: number, x: number, y: number): void;
  landed(kind: number, x: number, y: number, below: number): void;
  shattered(kind: number, x: number, y: number): void;
  wobbleStart(kind: number, x: number, y: number): void;
  fireTouch(): void;
  burnedOut(x: number, y: number, ore: number): void;
  ignite(x: number, y: number): void;        // огонь добрался до газа
}

export interface WaterSource {
  x: number;
  y: number;
  every: number;
  t: number;
}

const FIRE_SPREAD_AT = 1.2;
const FIRE_BURN_OUT = 3.5;

export class TierSim {
  falling: FallingBody[] = [];
  sources: WaterSource[] = [];
  boulderWobble = BOULDER_WOBBLE;
  private waterT = 0;
  private gasT = 0;
  private fireT = 0;
  private spread: Uint8Array;

  constructor(readonly g: Grid, readonly hooks: SimHooks) {
    this.spread = new Uint8Array(g.w * g.h);
  }

  update(dt: number): void {
    this.updateStatic(dt);
    this.updateFalling(dt);
    this.waterT += dt;
    while (this.waterT >= 0.07) {
      this.waterT -= 0.07;
      this.stepWater();
    }
    this.gasT += dt;
    while (this.gasT >= 0.15) {
      this.gasT -= 0.15;
      this.stepGas();
    }
    this.fireT += dt;
    if (this.fireT >= 0.1) {
      this.stepFire(this.fireT);
      this.fireT = 0;
    }
  }

  /** Есть ли под клеткой опора для падающих блоков. */
  private supported(x: number, y: number): boolean {
    const below = this.g.get(x, y + 1);
    return below !== B.EMPTY && below !== B.EXIT;
  }

  private updateStatic(dt: number): void {
    const g = this.g;
    const p = this.hooks.player();
    for (let y = g.h - 2; y >= 0; y--) {
      for (let x = 0; x < g.w; x++) {
        const i = g.i(x, y);
        const b = g.b[i];
        if (b === B.SAND) {
          if (!this.supported(x, y)) this.startFall(x, y, b);
        } else if (b === B.BOULDER) {
          if (this.supported(x, y)) {
            g.wobble[i] = -1;
          } else if (g.wobble[i] < 0) {
            g.wobble[i] = this.boulderWobble;
            this.hooks.wobbleStart(b, x, y);
          } else {
            g.wobble[i] -= dt;
            if (g.wobble[i] <= 0) this.startFall(x, y, b);
          }
        } else if (b === B.STALACTITE) {
          if (g.wobble[i] >= 0) {
            g.wobble[i] -= dt;
            if (g.wobble[i] <= 0) this.startFall(x, y, b);
          } else if (!g.solid(x, y - 1)) {
            g.wobble[i] = 0.05;                  // оторвался от потолка
          } else if (p.x === x && p.y > y && p.y - y <= 6 && this.clearColumn(x, y + 1, p.y)) {
            g.wobble[i] = STALACTITE_WOBBLE;
            this.hooks.wobbleStart(b, x, y);
          }
        }
      }
    }
  }

  private clearColumn(x: number, y0: number, y1: number): boolean {
    for (let y = y0; y < y1; y++) if (this.g.solid(x, y)) return false;
    return true;
  }

  private startFall(x: number, y: number, kind: number): void {
    this.g.set(x, y, B.EMPTY);
    this.falling.push({ kind, x, y, vy: kind === B.SAND ? 4 : 1 });
  }

  private updateFalling(dt: number): void {
    const g = this.g;
    const p = this.hooks.player();
    const keep: FallingBody[] = [];
    // Тело занимает [y, y+1). Идём по клеткам, чтобы не проскочить игрока или опору.
    outer: for (const f of this.falling) {
      f.vy = Math.min(FALL_MAX, f.vy + FALL_ACCEL * dt);
      const ny = f.y + f.vy * dt;
      for (;;) {
        const cy = Math.floor(f.y);
        if (p.x === f.x && (p.y === cy || (p.y === cy + 1 && ny + 1 > p.y + 0.2))) {
          this.hooks.hitPlayer(f.kind, f.x, cy);
          this.hooks.shattered(f.kind, f.x, cy);
          continue outer;
        }
        const below = g.get(f.x, cy + 1);
        if (below === B.EXIT) {
          if (ny >= cy + 1) continue outer;      // ушло в шахту лифта
        } else if (below !== B.EMPTY) {
          this.land(f, cy, below);
          continue outer;
        }
        if (ny >= cy + 1) {
          f.y = cy + 1;
          continue;
        }
        f.y = ny;
        break;
      }
      keep.push(f);
    }
    this.falling = keep;
  }

  private land(f: FallingBody, y: number, below: number): void {
    const g = this.g;
    if (f.kind === B.STALACTITE) {
      this.hooks.shattered(f.kind, f.x, y);
      return;
    }
    if (g.get(f.x, y) !== B.EMPTY) {
      this.hooks.shattered(f.kind, f.x, y);
      return;
    }
    g.set(f.x, y, f.kind);
    this.hooks.landed(f.kind, f.x, y, below);
  }

  private stepWater(): void {
    const g = this.g;
    for (const s of this.sources) {
      s.t += 0.07;
      if (s.t >= s.every) {
        s.t = 0;
        if (g.get(s.x, s.y) === B.EMPTY) g.water[g.i(s.x, s.y)] = 1;
      }
    }
    const moved = new Uint8Array(g.w * g.h);
    const flip = Math.random() < 0.5;
    for (let y = g.h - 2; y >= 0; y--) {
      for (let k = 0; k < g.w; k++) {
        const x = flip ? k : g.w - 1 - k;
        const i = g.i(x, y);
        if (!g.water[i] || moved[i]) continue;
        const below = g.get(x, y + 1);
        if (below === B.EXIT) {
          g.water[i] = 0;
          continue;
        }
        if (below === B.EMPTY && !g.water[g.i(x, y + 1)]) {
          g.water[i] = 0;
          g.water[g.i(x, y + 1)] = 1;
          moved[g.i(x, y + 1)] = 1;
          continue;
        }
        const dirs = Math.random() < 0.5 ? [-1, 1] : [1, -1];
        for (const d of dirs) {
          const nx = x + d;
          if (nx < 0 || nx >= g.w) continue;
          const j = g.i(nx, y);
          if (g.b[j] === B.EMPTY && !g.water[j]) {
            // По ровному полу растекается не каждый шаг, чтобы вода не дрожала
            const falls = g.get(nx, y + 1) === B.EMPTY && !g.water[g.i(nx, y + 1)];
            if (!falls && Math.random() < 0.5) continue;
            g.water[i] = 0;
            g.water[j] = 1;
            moved[j] = 1;
            break;
          }
        }
      }
    }
  }

  private stepGas(): void {
    const g = this.g;
    let any = false;
    for (let i = 0; i < g.gas.length; i++) if (g.gas[i] > 0.01) { any = true; break; }
    if (!any) return;
    const next = new Float32Array(g.gas.length);
    const share: [number, number, number][] = [[0, -1, 0.28], [-1, 0, 0.12], [1, 0, 0.12], [0, 1, 0.05]];
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const i = g.i(x, y);
        const v = g.gas[i];
        if (v <= 0.01) continue;
        let stay = v;
        for (const [dx, dy, part] of share) {
          const nx = x + dx, ny = y + dy;
          if (!g.inside(nx, ny) || g.b[g.i(nx, ny)] !== B.EMPTY) continue;
          next[g.i(nx, ny)] += v * part;
          stay -= v * part;
        }
        next[i] += stay;
      }
    }
    for (let i = 0; i < next.length; i++) g.gas[i] = next[i] > 0.02 && g.b[i] === B.EMPTY ? next[i] * 0.985 : 0;
  }

  private stepFire(dt: number): void {
    const g = this.g;
    const p = this.hooks.player();
    let touch = false;
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const i = g.i(x, y);
        if (g.fire[i] <= 0) continue;
        if (g.b[i] === B.EMPTY) {
          g.fire[i] = 0;
          continue;
        }
        g.fire[i] += dt;
        if (Math.abs(p.x - x) + Math.abs(p.y - y) <= 1) touch = true;
        if (g.fire[i] >= FIRE_SPREAD_AT && !this.spread[i]) {
          this.spread[i] = 1;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (!g.inside(nx, ny)) continue;
            const j = g.i(nx, ny);
            if (this.flammable(nx, ny) && g.fire[j] <= 0) g.fire[j] = 0.01;
            else if (g.b[j] === B.EMPTY && g.gas[j] > 0.3) this.hooks.ignite(nx, ny);
          }
        }
        if (g.fire[i] >= FIRE_BURN_OUT) {
          const ore = g.ore[i];
          g.set(x, y, B.EMPTY);
          g.fire[i] = 0;
          this.spread[i] = 0;
          this.hooks.burnedOut(x, y, ore);
        }
      }
    }
    if (touch) this.hooks.fireTouch();
  }

  flammable(x: number, y: number): boolean {
    const g = this.g;
    const b = g.get(x, y);
    if (b === B.GAS) return true;
    return b === B.ORE && oreById(g.ore[g.i(x, y)]).kind === 'coal';
  }

  ignite(x: number, y: number): void {
    if (this.flammable(x, y)) {
      const i = this.g.i(x, y);
      if (this.g.fire[i] <= 0) this.g.fire[i] = 0.01;
    }
  }

  /** Выпустить газ из кармана: облако в открытых клетках вокруг. */
  releaseGas(x: number, y: number, amount = 3): void {
    const g = this.g;
    const cells: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (g.inside(x + dx, y + dy) && g.b[g.i(x + dx, y + dy)] === B.EMPTY) cells.push(g.i(x + dx, y + dy));
    }
    for (const i of cells) g.gas[i] = Math.min(1.5, g.gas[i] + amount / cells.length);
  }
}
