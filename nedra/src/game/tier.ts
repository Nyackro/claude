// Ярус: гном, копание, руда, комбо, опасности, Разломы и отрисовка шахты.
import { CLIMB_TIME, COLS, COMBO_MAX_MULT, DIG_TIME_MAX, DIG_TIME_MIN, FALL_ACCEL, FALL_MAX, INVULN_TIME, PIE_PCT,
  VEIN_BONUS, WALK_TIME } from '../config';
import { B, BLOCKS } from '../core/blocks';
import { blockCost, layerR } from '../core/economy';
import { generateTier, type NodeType, type VeinInfo } from '../core/gen';
import type { Grid } from '../core/grid';
import { TierSim } from '../core/physics';
import { Rng } from '../core/rng';
import { addArtifact, addConsumable, randomArtifacts, takeConsumable, useStew } from '../core/run';
import { has, type MetaState, type RunState } from '../core/state';
import { computeStats, type RunStats } from '../core/stats';
import { artifactDef } from '../data/artifacts';
import { consumableDef } from '../data/consumables';
import { layerDef, type LayerDef } from '../data/layers';
import { oreById } from '../data/ores';
import type { Audio } from './audio';
import { Fx } from './fx';
import type { Dir, Input } from './input';
import { T, type Atlas, type GnomeSprites } from './textures';

export interface TierEnv {
  meta: MetaState;
  run: RunState;
  audio: Audio;
  atlas: Atlas;
  gnome: GnomeSprites;
  coinTarget(): { x: number; y: number } | null;
  complete(summary: TierSummary): void;
  fail(reason: 'energy' | 'hearts'): void;
  toast(text: string, kind?: 'good' | 'bad' | 'info'): void;
  pulseCoins(): void;
}

export interface TierSummary {
  node: NodeType;
  coins: number;
  ore: number;
  seconds: number;
}

type PState = 'idle' | 'walk' | 'dig' | 'fall' | 'climb' | 'exit';

interface Player {
  x: number; y: number;
  fx: number; fy: number;
  px: number; py: number;
  state: PState;
  t: number; dur: number;
  face: 1 | -1;
  digX: number; digY: number; digDir: Dir; digCost: number;
  vy: number; fallFrom: number;
  path: [number, number][];
}

interface Nugget { x: number; y: number; vy: number; value: number; ore: number }
interface Fly { sx: number; sy: number; t: number; dur: number; color: string }

interface Boss {
  kind: 'collapse' | 'flood' | 'fire' | 'generic';
  delay: number;
  front: number;
  speed: number;
  pause: number;
}

const DIRV: Record<Dir, [number, number]> = { l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] };
const NORMAL_LIGHT = 7;

export class TierScene {
  readonly layer: LayerDef;
  readonly node: NodeType;
  readonly g: Grid;
  readonly sim: TierSim;
  readonly fx = new Fx();
  private readonly veins: Map<number, VeinInfo & { mined: number; value: number }>;
  private readonly rng: Rng;
  stats: RunStats;
  p: Player;
  camY = 0;
  private shake = 0;
  private flash = 0;
  private flashColor = '255,60,40';
  time = 0;
  paused = false;
  done = false;
  private invuln = 0;
  combo = 0;
  private rockStreak = 0;
  digs = 0;
  private freeLeft: number;
  private stoneskin: boolean;
  private beardUsed = false;
  private startCoins: number;
  oreMined = 0;
  energySpent = 0;
  private gasTick = 0;
  private coldTick = 0;
  private revealT = 0;
  private nuggets: Nugget[] = [];
  private flies: Fly[] = [];
  private boss: Boss | null = null;
  private view = { ts: 32, offX: 0, offY: 0, w: 0, h: 0, rows: 20, cssW: 0 };
  private pending: { t: number; x: number; y: number }[] = [];
  private lastHint = '';

  constructor(private env: TierEnv, node: NodeType, seed: number) {
    const run = env.run;
    this.node = node;
    this.layer = layerDef(run.layer);
    this.rng = new Rng(seed ^ 0x5bd1e995);
    this.stats = computeStats(env.meta, run);
    const layout = generateTier({ layer: this.layer, node, seed, tutorial: run.tutorial && run.layer === 1 && node !== 'boss',
      extraChests: this.stats.extraChests });
    this.g = layout.grid;
    this.veins = new Map([...layout.veins].map(([id, v]) => [id, { ...v, mined: 0, value: 0 }]));
    this.p = {
      x: layout.spawnX, y: layout.spawnY, fx: layout.spawnX, fy: layout.spawnY, px: layout.spawnX, py: layout.spawnY,
      state: 'idle', t: 0, dur: 0, face: 1, digX: 0, digY: 0, digDir: 'd', digCost: 0, vy: 0, fallFrom: layout.spawnY, path: [],
    };
    this.sim = new TierSim(this.g, {
      player: () => ({ x: this.p.x, y: this.p.y }),
      hitPlayer: (kind) => {
        if (kind === B.SAND) return;
        this.damage(1, kind === B.STALACTITE ? 'Сталактит!' : 'Валун!');
      },
      landed: (kind, x, y, below) => {
        if (kind === B.BOULDER) {
          if (this.near(x, y, 9)) {
            env.audio.thud();
            this.shake = Math.max(this.shake, 0.18);
          }
          this.fx.dust(x, y + 0.7, 6);
          if (below === B.ORE && has(run, 'bouldersmith')) this.mine(x, y + 1, 'boulder', 3);
        }
      },
      shattered: (kind, x, y) => {
        this.fx.burst(x + 0.5, y + 0.5, kind === B.SAND ? this.layer.pal.sand : this.layer.pal.boulder, 10, 5, 2.5);
        if (this.near(x, y, 9)) env.audio.thud();
      },
      wobbleStart: (_k, x, y) => {
        if (this.near(x, y, 8)) env.audio.rattle();
      },
      fireTouch: () => this.damage(1, 'Огонь!'),
      burnedOut: (x, y) => this.fx.dust(x, y, 5, 'rgba(60,50,45,0.7)'),
      ignite: (x, y) => this.explode(x, y, 1, 'gas'),
    });
    if (run.pet === 'cat') this.sim.boulderWobble = 0.4;
    this.freeLeft = this.stats.freeBlocks;
    this.stoneskin = has(run, 'stoneskin');
    this.startCoins = run.coins;
    if (has(run, 'powderbelt')) addConsumable(run, this.stats, 'dynamite');
    if (node === 'boss') this.setupBoss();
    this.camY = this.cameraTarget();
    this.updateSeen();
  }

  private setupBoss(): void {
    const kind = this.layer.boss.kind;
    this.boss = { kind, delay: 3, front: -1, speed: 0.75, pause: 0 };
  }

  private near(x: number, y: number, r: number): boolean {
    return Math.abs(x - this.p.x) + Math.abs(y - this.p.y) <= r;
  }

  get lightRadius(): number {
    return (this.layer.light || NORMAL_LIGHT) + this.stats.lightBonus;
  }

  get bossInfo(): { name: string; delay: number } | null {
    return this.boss ? { name: this.layer.boss.name, delay: this.boss.delay } : null;
  }

  refreshStats(): void {
    this.stats = computeStats(this.env.meta, this.env.run);
  }

  // ---------------- обновление ----------------

  update(dt: number, input: Input): void {
    if (this.paused || this.done) return;
    this.time += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.revealT = Math.max(0, this.revealT - dt);
    for (const a of input.actions.splice(0)) this.action(a);
    this.updateBoss(dt);
    for (const e of this.pending) e.t -= dt;
    for (const e of this.pending.filter((q) => q.t <= 0)) this.explode(e.x, e.y, 1, 'chain');
    this.pending = this.pending.filter((q) => q.t > 0);
    this.updatePlayer(dt, this.inputDir(input));
    this.sim.update(dt);
    this.updateHazardsOnPlayer(dt);
    this.updateNuggets(dt);
    this.fx.update(dt);
    for (const f of this.flies) f.t += dt;
    this.flies = this.flies.filter((f) => {
      if (f.t >= f.dur) {
        this.env.pulseCoins();
        return false;
      }
      return true;
    });
    if (this.g.fire.some((v) => v > 0) && Math.random() < 0.5) {
      for (let i = 0; i < this.g.fire.length; i++) {
        if (this.g.fire[i] > 0 && Math.random() < 0.2) this.fx.flame(i % this.g.w, Math.floor(i / this.g.w));
      }
    }
    const target = this.cameraTarget();
    this.camY += (target - this.camY) * Math.min(1, dt * 7);
  }

  private inputDir(input: Input): Dir | null {
    const k = input.keyDir();
    if (k) return k;
    if (!input.pointer.down) return null;
    const v = this.view;
    const dpr = v.w && v.cssW ? v.w / v.cssW : 1;
    const wx = (input.pointer.x * dpr - v.offX) / v.ts;
    const wy = (input.pointer.y * dpr - v.offY) / v.ts + this.camY;
    const dx = wx - (this.p.px + 0.5), dy = wy - (this.p.py + 0.5);
    if (Math.abs(dx) < 0.55 && Math.abs(dy) < 0.55) return null;
    if (Math.abs(dy) >= Math.abs(dx)) return dy > 0 ? 'd' : 'u';
    return dx > 0 ? 'r' : 'l';
  }

  private action(a: string): void {
    const run = this.env.run;
    if (a === 'pause') return;
    const slot = run.consumables[Number(a.slice(1)) - 1];
    if (slot) this.useConsumable(slot.id);
  }

  useConsumable(id: string): void {
    const run = this.env.run;
    if (this.done || this.paused || this.p.state === 'exit') return;
    if (!run.consumables.some((c) => c.id === id)) return;
    const p = this.p;
    if (id === 'ladder' && !this.g.open(p.x, p.y - 1) && !this.g.diggable(p.x, p.y - 1)) {
      this.env.toast('Над головой нет места для лестницы', 'bad');
      return;
    }
    takeConsumable(run, id);
    if (id === 'dynamite') {
      this.explode(p.x, p.y, this.stats.dynamiteRadius, 'dynamite');
    } else if (id === 'ladder') {
      this.g.ladder[this.g.i(p.x, p.y)] = 1;
      for (let k = 1; k <= 3; k++) {
        if (!this.g.open(p.x, p.y - k)) break;
        this.g.ladder[this.g.i(p.x, p.y - k)] = 1;
      }
      this.env.audio.pickup();
    } else if (id === 'stew') {
      useStew(run, this.stats);
      this.fx.text(p.px + 0.5, p.py, '+энергия', '#9ef07a');
      this.env.audio.pickup();
    } else if (id === 'scan') {
      this.reveal(8, false);
      this.revealT = 4;
      this.env.audio.pickup();
    } else if (id === 'bomb') {
      this.env.audio.boom();
      this.shake = 0.35;
      for (let k = 1; k <= 6; k++) {
        const y = p.y + k;
        if (!this.g.diggable(p.x, y)) break;
        this.mine(p.x, y, 'explosion');
        this.fx.burst(p.x + 0.5, y + 0.5, '#ffcf6a', 6, 5, 2);
      }
    }
    this.env.toast(consumableDef(id).name, 'info');
  }

  private cameraTarget(): number {
    const rows = this.view.rows;
    const max = Math.max(0, this.g.h - rows + 0.5);
    return Math.max(-0.5, Math.min(max, this.p.py - rows * 0.38));
  }

  private supported(x: number, y: number): boolean {
    const g = this.g;
    if (g.ladder[g.i(x, y)]) return true;
    return g.solid(x, y + 1);
  }

  private updatePlayer(dt: number, dir: Dir | null): void {
    const p = this.p;
    if (p.state === 'idle') {
      if (this.atExit()) return;
      if (!this.supported(p.x, p.y)) this.startFall();
      else if (dir) this.act(dir);
    }
    switch (p.state) {
      case 'walk':
      case 'climb': {
        p.t += dt;
        const k = Math.min(1, p.t / p.dur);
        if (p.path.length) {
          // лазанье на уступ: сначала вверх, потом в сторону
          const [mx, my] = p.path[0];
          if (k < 0.5) { p.px = p.fx; p.py = p.fy + (my - p.fy) * (k * 2); }
          else { p.px = mx + (p.x - mx) * ((k - 0.5) * 2); p.py = my; }
        } else {
          p.px = p.fx + (p.x - p.fx) * k;
          p.py = p.fy + (p.y - p.fy) * k;
        }
        if (k >= 1) {
          p.state = 'idle';
          p.path = [];
          p.px = p.x;
          p.py = p.y;
          this.afterMove();
        }
        break;
      }
      case 'dig': {
        if (!this.g.diggable(p.digX, p.digY) || !this.supported(p.x, p.y)) {
          p.state = 'idle';
          break;
        }
        p.t += dt;
        if (p.t >= p.dur) this.finishDig();
        break;
      }
      case 'fall': {
        p.vy = Math.min(FALL_MAX, p.vy + FALL_ACCEL * dt);
        let ny = p.py + p.vy * dt;
        while (ny >= p.y + 1 || this.g.solid(p.x, p.y + 1)) {
          if (this.g.solid(p.x, p.y + 1) || this.g.ladder[this.g.i(p.x, p.y)]) {
            this.land();
            ny = p.y;
            break;
          }
          p.y += 1;
          this.updateSeen();
          if (this.atExit()) break;
        }
        if (p.state === 'fall') p.py = ny;
        break;
      }
      case 'exit': {
        p.t += dt;
        p.py = p.y + p.t * 2;
        if (p.t >= 0.7 && !this.done) {
          this.done = true;
          this.env.complete({ node: this.node, coins: this.env.run.coins - this.startCoins, ore: this.oreMined, seconds: this.time });
        }
        break;
      }
    }
    p.px = p.state === 'fall' ? p.x : p.px;
  }

  private atExit(): boolean {
    const p = this.p;
    if (p.state === 'exit') return true;
    if (p.x === this.g.exitX && p.y === this.g.exitY) {
      p.state = 'exit';
      p.t = 0;
      p.px = p.x;
      this.env.audio.fanfare();
      return true;
    }
    return false;
  }

  private act(dir: Dir): void {
    const p = this.p, g = this.g;
    const [dx] = DIRV[dir];
    if (dx) p.face = dx as 1 | -1;
    if (dir === 'l' || dir === 'r') {
      const tx = p.x + dx;
      if (!g.inside(tx, p.y)) return;
      if (g.open(tx, p.y)) this.move(tx, p.y, WALK_TIME);
      else if (g.diggable(tx, p.y)) this.startDig(tx, p.y, dir);
      return;
    }
    if (dir === 'd') {
      if (g.diggable(p.x, p.y + 1)) this.startDig(p.x, p.y + 1, 'd');
      return;
    }
    // вверх: лестница, уступ, копание вверх, борода
    const i = g.i(p.x, p.y);
    if (g.open(p.x, p.y - 1) && (g.ladder[i] || g.ladder[g.i(p.x, Math.max(0, p.y - 1))])) {
      this.move(p.x, p.y - 1, CLIMB_TIME);
      return;
    }
    for (const side of [p.face, -p.face]) {
      if (g.open(p.x, p.y - 1) && g.solid(p.x + side, p.y) && g.open(p.x + side, p.y - 1) && g.inside(p.x + side, p.y)) {
        p.face = side as 1 | -1;
        p.path = [[p.x, p.y - 1]];
        this.move(p.x + side, p.y - 1, CLIMB_TIME * 1.6, 'climb');
        return;
      }
    }
    if (g.diggable(p.x, p.y - 1)) {
      this.startDig(p.x, p.y - 1, 'u');
      return;
    }
    if (this.stats.beardRope && !this.beardUsed && g.open(p.x, p.y - 1)) {
      this.beardUsed = true;
      g.ladder[i] = 1;
      for (let k = 1; k <= 4 && g.open(p.x, p.y - k); k++) g.ladder[g.i(p.x, p.y - k)] = 1;
      this.env.toast('Борода-верёвка!', 'info');
      this.move(p.x, p.y - 1, CLIMB_TIME);
      return;
    }
    if (this.lastHint !== 'up') {
      this.lastHint = 'up';
      this.env.toast('Наверх только по уступу или лестнице', 'info');
    }
  }

  private move(x: number, y: number, dur: number, state: PState = 'walk'): void {
    const p = this.p;
    p.fx = p.x;
    p.fy = p.y;
    p.x = x;
    p.y = y;
    p.t = 0;
    p.dur = dur;
    p.state = state;
    this.updateSeen();
  }

  private afterMove(): void {
    this.atExit();
  }

  private startFall(): void {
    const p = this.p;
    p.state = 'fall';
    p.vy = 2;
    p.fallFrom = p.y;
    p.py = p.y;
  }

  private land(): void {
    const p = this.p;
    const dist = p.y - p.fallFrom;
    p.state = 'idle';
    p.py = p.y;
    p.vy = 0;
    if (dist >= 2) this.fx.dust(p.x, p.y + 0.8, 3);
    const below = this.g.get(p.x, p.y + 1);
    if (dist >= 2 && below === B.ORE && has(this.env.run, 'ram')) {
      this.mine(p.x, p.y + 1, 'ram', 2);
      this.fx.text(p.x + 0.5, p.y, 'Таран!', '#ffd36b');
      return;
    }
    const inWater = this.g.water[this.g.i(p.x, p.y)] > 0;
    if (dist >= this.stats.fallCells && !inWater) this.damage(1, 'Больно падать!');
  }

  private startDig(x: number, y: number, dir: Dir): void {
    const p = this.p, g = this.g;
    const b = g.get(x, y);
    const s = this.stats;
    let mult = s.costMult;
    if (dir === 'd') mult *= s.downMult;
    if (dir === 'l' || dir === 'r') mult *= s.sideMult;
    if (!s.waterFree && (g.water[g.i(p.x, p.y)] || g.water[g.i(x, y)])) mult *= 1.5;
    let power = s.power;
    if (has(this.env.run, 'perforator') && (this.digs + 1) % 4 === 0) power *= 3;
    p.digCost = blockCost(b, this.layer.id, power, mult);
    p.digX = x;
    p.digY = y;
    p.digDir = dir;
    p.t = 0;
    p.dur = Math.min(DIG_TIME_MAX, Math.max(DIG_TIME_MIN, DIG_TIME_MIN + 0.05 * (p.digCost - 1)));
    p.state = 'dig';
  }

  private finishDig(): void {
    const p = this.p, run = this.env.run;
    let cost = p.digCost;
    let free = false;
    if (this.freeLeft > 0) { this.freeLeft--; free = true; }
    else if (this.stats.freeChance > 0 && this.rng.chance(this.stats.freeChance)) free = true;
    if (free) cost = 0;
    this.energySpent += cost;
    run.energy = Math.max(0, run.energy - cost);
    const { digX: x, digY: y, digDir: dir } = p;
    p.state = 'idle';
    this.digs++;
    this.mine(x, y, 'dig');
    const [dx, dy] = DIRV[dir];
    if (has(run, 'jackhammer') && dir === 'd' && this.g.diggable(x, y + 1)) {
      this.energySpent += Math.ceil(cost / 2);
      run.energy = Math.max(0, run.energy - Math.ceil(cost / 2));
      this.mine(x, y + 1, 'dig');
    }
    if (this.stats.tool === 'blastpick' && this.digs % 6 === 0) {
      const side: [number, number][] = dx ? [[x, y - 1], [x, y + 1]] : [[x - 1, y], [x + 1, y]];
      this.env.audio.boom();
      this.shake = Math.max(this.shake, 0.15);
      for (const [sx, sy] of side) if (this.g.diggable(sx, sy)) this.mine(sx, sy, 'explosion');
      this.fx.burst(x + 0.5, y + 0.5, '#ffcf6a', 10, 5, 2);
    }
    if (has(run, 'mole') && this.digs % 8 === 0 && this.g.diggable(x + dx, y + dy)) {
      this.mine(x + dx, y + dy, 'dig');
      this.fx.text(x + dx + 0.5, y + dy + 0.3, 'Крот!', '#d9b38c');
    }
    if (this.stats.singer && this.digs % 30 === 0) {
      run.energy = Math.min(Math.round(this.stats.maxEnergy * 1.5), run.energy + Math.round(this.stats.maxEnergy * 0.03));
      this.fx.text(p.px + 0.5, p.py, 'Песня!', '#bfe8ff');
    }
    if (has(run, 'bat') && this.digs % 20 === 0) {
      this.reveal(6, true);
      this.fx.text(p.px + 0.5, p.py - 0.4, 'Эхолокация', '#c9b8ff');
    }
    if (run.energy <= 0) this.env.fail('energy');
  }

  /** Добыть блок. cause влияет на комбо и цену руды. */
  mine(x: number, y: number, cause: 'dig' | 'explosion' | 'ram' | 'boulder', valueMult = 1): void {
    const g = this.g, run = this.env.run;
    if (!g.diggable(x, y)) return;
    const i = g.i(x, y);
    const b = g.b[i];
    const def = BLOCKS[b];
    const wasFire = g.fire[i] > 0;
    if (b === B.ORE) {
      const ore = oreById(g.ore[i]);
      const vein = g.vein[i];
      g.set(x, y, B.EMPTY);
      g.fire[i] = 0;
      if (cause === 'dig' || cause === 'ram') {
        this.combo++;
        this.rockStreak = 0;
      }
      let value = ore.value * this.stats.oreMult * valueMult;
      if (ore.kind === 'gem') value *= this.stats.gemMult;
      if (ore.kind === 'metal') value *= this.stats.metalMult;
      if (cause === 'explosion') value *= this.stats.explOreMult;
      const comboMult = Math.min(COMBO_MAX_MULT, 1 + this.stats.comboStep * this.combo);
      value *= comboMult;
      if (has(run, 'goldrush') && this.combo >= 25) value *= 2;
      const coins = Math.max(1, Math.round(value));
      run.ore[ore.key] = (run.ore[ore.key] ?? 0) + 1;
      this.oreMined++;
      if (ore.kind === 'gem' && !run.gemTypes.includes(ore.key)) {
        run.gemTypes.push(ore.key);
        if (has(run, 'collector')) this.refreshStats();
      }
      if (ore.kind === 'coal' && has(run, 'stove')) {
        run.energy = Math.min(Math.round(this.stats.maxEnergy * 1.5), run.energy + 2);
      }
      if (this.stats.clumsy && this.rng.chance(0.05)) {
        this.nuggets.push({ x, y, vy: 0, value: coins, ore: ore.id });
        this.fx.text(x + 0.5, y + 0.3, 'Ой, укатилось!', '#ffb36b');
      } else {
        this.addCoins(coins, x, y, ore.color);
        this.fx.text(x + 0.5, y + 0.2, `+${coins}`, ore.kind === 'gem' ? '#ffe36b' : '#fff2c4', ore.kind === 'gem');
      }
      this.fx.burst(x + 0.5, y + 0.5, ore.color, 8, 5, 2);
      this.fx.sparkle(x + 0.5, y + 0.5, ore.light, ore.kind === 'gem' ? 10 : 4);
      this.env.audio.ore(this.combo, ore.kind === 'gem');
      const v = this.veins.get(vein);
      if (v) {
        v.mined++;
        v.value += coins;
        if (v.mined >= v.size && v.size >= 2) {
          const bonus = Math.max(1, Math.round(v.value * VEIN_BONUS));
          this.addCoins(bonus, x, y, '#ffd36b');
          this.fx.text(x + 0.5, y - 0.4, `Чистая жила! +${bonus}`, '#ffd36b', true);
          this.env.audio.coin();
        }
      }
    } else if (b === B.CHEST) {
      g.set(x, y, B.EMPTY);
      this.openChest(x, y);
    } else if (b === B.CRATE) {
      g.set(x, y, B.EMPTY);
      this.openCrate(x, y);
    } else {
      g.set(x, y, B.EMPTY);
      g.fire[i] = 0;
      if (cause === 'dig' && def.rock) {
        this.rockStreak++;
        if (this.rockStreak >= this.stats.comboBreak && this.combo > 0) {
          if (this.combo >= 5) this.fx.text(this.p.px + 0.5, this.p.py - 0.3, `Комбо x${this.comboMult().toFixed(1)} сгорело`, '#c9c2b8');
          this.combo = 0;
        }
      }
      const color = this.blockColor(b);
      this.fx.burst(x + 0.5, y + 0.5, color, cause === 'dig' ? 7 : 4, 4, 2.2);
      if (cause === 'dig') this.env.audio.dig(def.hp);
      if (b === B.GAS) {
        this.sim.releaseGas(x, y, 3.5);
        this.fx.text(x + 0.5, y + 0.3, 'Газ!', '#a6f07a');
        this.env.audio.sizzle();
      } else if (cause === 'dig' && def.rock && this.gasNear(x, y) > 0.3) {
        this.fx.text(x + 0.5, y, 'Искра!', '#ffcf6a');
        this.explode(x, y, 1, 'gas');
      }
    }
    if (wasFire) this.fx.dust(x, y, 3, 'rgba(255,140,40,0.5)');
    run.blocks++;
  }

  comboMult(): number {
    return Math.min(COMBO_MAX_MULT, 1 + this.stats.comboStep * this.combo);
  }

  private gasNear(x: number, y: number): number {
    const g = this.g;
    let m = g.gas[g.i(this.p.x, this.p.y)];
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (g.inside(x + dx, y + dy)) m = Math.max(m, g.gas[g.i(x + dx, y + dy)]);
    }
    return m;
  }

  private blockColor(b: number): string {
    const pal = this.layer.pal;
    switch (b) {
      case B.DIRT: return pal.dirt;
      case B.CLAY: return pal.clay;
      case B.STONE: case B.GAS: return pal.stone;
      case B.HARD: return pal.hard;
      case B.SAND: return pal.sand;
      case B.BOULDER: return pal.boulder;
      default: return pal.clay;
    }
  }

  private addCoins(n: number, x: number, y: number, color: string): void {
    const run = this.env.run;
    run.coins += n;
    run.haul += n;
    const v = this.view;
    const sx = v.offX + (x + 0.5) * v.ts, sy = v.offY + (y + 0.5 - this.camY) * v.ts;
    this.flies.push({ sx, sy, t: 0, dur: 0.45 + Math.random() * 0.15, color });
  }

  private openChest(x: number, y: number): void {
    const run = this.env.run, R = layerR(this.layer.id);
    this.env.audio.pickup();
    this.fx.sparkle(x + 0.5, y + 0.5, '#ffe36b', 16);
    const roll = this.rng.next();
    if (roll < 0.25) {
      const id = randomArtifacts(this.env.meta, run, this.rng, 1, this.rng.chance(0.3) ? 'rare' : 'common')[0];
      if (id && addArtifact(run, this.stats, id)) {
        this.refreshStats();
        this.fx.text(x + 0.5, y, artifactDef(id).name, '#ffd36b', true);
        this.env.toast(`Артефакт: ${artifactDef(id).name}`, 'good');
        return;
      }
    } else if (roll < 0.5) {
      const id = this.rng.pick(['dynamite', 'ladder', 'stew', 'scan']);
      if (addConsumable(run, this.stats, id)) {
        this.fx.text(x + 0.5, y, consumableDef(id).name, '#bfe8ff');
        return;
      }
    }
    const n = Math.round(R * (3 + this.rng.next() * 3));
    this.addCoins(n, x, y, '#ffd36b');
    this.fx.text(x + 0.5, y, `Сундук: +${n}`, '#ffd36b', true);
  }

  private openCrate(x: number, y: number): void {
    const run = this.env.run;
    this.env.audio.pickup();
    if (this.rng.chance(0.65)) {
      const n = Math.round(this.stats.maxEnergy * PIE_PCT * this.stats.foodMult);
      run.energy = Math.min(Math.round(this.stats.maxEnergy * 1.5), run.energy + n);
      this.fx.text(x + 0.5, y, `Пирожок +${n}`, '#9ef07a');
      return;
    }
    const id = this.rng.pick(['dynamite', 'ladder', 'stew']);
    if (addConsumable(run, this.stats, id)) this.fx.text(x + 0.5, y, consumableDef(id).name, '#bfe8ff');
    else {
      run.energy = Math.min(Math.round(this.stats.maxEnergy * 1.5), run.energy + 8);
      this.fx.text(x + 0.5, y, '+8 энергии', '#9ef07a');
    }
  }

  explode(cx: number, cy: number, r: number, cause: 'dynamite' | 'gas' | 'chain'): void {
    const g = this.g, run = this.env.run;
    this.env.audio.boom();
    this.shake = Math.max(this.shake, 0.35);
    this.flash = 0.5;
    this.flashColor = '255,200,120';
    const chained: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + r) continue;
        const x = cx + dx, y = cy + dy;
        if (!g.inside(x, y)) continue;
        const i = g.i(x, y);
        g.gas[i] = 0;
        const b = g.b[i];
        if (!g.diggable(x, y)) continue;
        if (b === B.GAS) chained.push([x, y]);
        if (b === B.ORE && has(run, 'chain') && this.rng.chance(0.25)) chained.push([x, y]);
        if (b === B.ORE && oreById(g.ore[i]).kind === 'coal' && this.rng.chance(0.5)) {
          this.sim.ignite(x, y);
          continue;
        }
        this.env.meta.stats.exploded++;
        this.mine(x, y, 'explosion');
      }
    }
    this.fx.burst(cx + 0.5, cy + 0.5, '#ffcf6a', 24, 8, 3, 10, 0.7);
    this.fx.burst(cx + 0.5, cy + 0.5, '#6b625a', 16, 6, 3);
    const hurts = cause === 'gas' && !this.stats.explosionSafe && !has(run, 'methane');
    if (cause === 'gas' && has(run, 'methane')) {
      const n = Math.round(5 * layerR(this.layer.id));
      this.addCoins(n, cx, cy, '#a6f07a');
      this.fx.text(cx + 0.5, cy - 0.5, `Хирургия! +${n}`, '#a6f07a', true);
    }
    if (hurts && Math.abs(this.p.x - cx) <= r && Math.abs(this.p.y - cy) <= r) this.damage(1, 'Взрыв!');
    for (const [x, y] of chained) this.pending.push({ t: 0.15, x, y });
  }

  damage(n: number, why: string): void {
    const run = this.env.run;
    if (this.invuln > 0 || this.done || this.p.state === 'exit') return;
    this.invuln = INVULN_TIME;
    if (this.stoneskin) {
      this.stoneskin = false;
      this.fx.text(this.p.px + 0.5, this.p.py - 0.3, 'Каменная кожа!', '#c9c2b8');
      this.env.audio.thud();
      return;
    }
    run.hearts = Math.max(0, run.hearts - n);
    this.shake = 0.3;
    this.flash = 0.6;
    this.flashColor = '255,60,40';
    this.env.audio.hurt();
    this.fx.text(this.p.px + 0.5, this.p.py - 0.3, why, '#ff7a6b');
    if (run.hearts <= 0) this.env.fail('hearts');
  }

  private updateHazardsOnPlayer(dt: number): void {
    const g = this.g, run = this.env.run, p = this.p;
    const i = g.i(p.x, Math.max(0, Math.min(g.h - 1, p.y)));
    if (g.gas[i] > 0.25 && !this.stats.gasSafe) {
      this.gasTick += dt;
      if (this.gasTick >= 0.5) {
        this.gasTick = 0;
        run.energy = Math.max(0, run.energy - 1);
        this.fx.text(p.px + 0.5, p.py - 0.2, '-1', '#a6f07a');
        if (run.energy <= 0) this.env.fail('energy');
      }
    }
    const submerged = g.water[i] && p.y > 0 && g.water[g.i(p.x, p.y - 1)];
    if (this.boss?.kind === 'flood' && submerged) {
      this.coldTick += dt;
      const every = this.stats.waterFree ? 1 : 0.5;
      if (this.coldTick >= every) {
        this.coldTick = 0;
        run.energy = Math.max(0, run.energy - 1);
        if (Math.random() < 0.3) this.env.audio.splash();
        if (run.energy <= 0) this.env.fail('energy');
      }
    }
  }

  private updateBoss(dt: number): void {
    const b = this.boss;
    if (!b) return;
    if (b.delay > 0) {
      b.delay -= dt;
      if (b.delay <= 0) {
        this.env.audio.boom();
        this.shake = 0.5;
        if (b.kind === 'flood') {
          this.sim.sources.push({ x: this.p.x, y: 0, every: 0.5, t: 0 });
          this.env.toast('Вода прорвалась! Не стой на месте', 'bad');
        } else if (b.kind === 'fire') {
          // поджигаем верх угольной жилы, но не рядом с гномом
          const cand: [number, number][] = [];
          for (let y = 3; y < Math.min(this.g.h, 12); y++) {
            for (let x = 0; x < this.g.w; x++) {
              if (this.sim.flammable(x, y) && Math.abs(x - this.p.x) + Math.abs(y - this.p.y) >= 4) cand.push([x, y]);
            }
          }
          for (const [x, y] of cand.slice(0, 3)) this.sim.ignite(x, y);
          this.env.toast('Уголь загорелся!', 'bad');
        } else if (b.kind === 'collapse') {
          this.env.toast('Обвал начался!', 'bad');
        }
      }
      return;
    }
    if (b.kind === 'flood') {
      b.front += dt;                         // здесь front - время с прорыва
      if (b.front > 15 && this.sim.sources.length < 2) this.sim.sources.push({ x: this.g.w - 1 - this.sim.sources[0].x, y: 0, every: 0.6, t: 0 });
      return;
    }
    if (b.kind !== 'collapse') return;
    if (b.pause > 0) {
      b.pause -= dt;
      return;
    }
    const prev = Math.floor(b.front);
    b.front += b.speed * dt;
    b.speed = Math.min(1.7, b.speed + 0.015 * dt);
    const cur = Math.floor(b.front);
    for (let y = Math.max(0, prev); y <= cur && y < this.g.h - 1; y++) {
      for (let x = 0; x < this.g.w; x++) {
        const bb = this.g.get(x, y);
        if (bb !== B.BEDROCK && bb !== B.EXIT && !(x === this.p.x && y === this.p.y)) {
          this.g.set(x, y, B.RUBBLE);
          this.g.ladder[this.g.i(x, y)] = 0;
        }
      }
      for (let x = 0; x < this.g.w; x += 2) this.fx.dust(x, y + 0.5, 1);
    }
    this.sim.falling = this.sim.falling.filter((f) => f.y > b.front);
    if (Math.random() < 0.3) this.shake = Math.max(this.shake, 0.06);
    if (this.p.py < b.front + 0.6) {
      this.damage(1, 'Завалило!');
      b.pause = 2;
      b.front = this.p.py - 0.7;
    }
  }

  get collapseFront(): number | null {
    return this.boss?.kind === 'collapse' && this.boss.delay <= 0 ? this.boss.front : null;
  }

  private updateNuggets(dt: number): void {
    const g = this.g;
    for (const n of this.nuggets) {
      const cy = Math.floor(n.y);
      if (!g.solid(n.x, cy + 1)) {
        n.vy = Math.min(10, n.vy + 30 * dt);
        n.y += n.vy * dt;
        if (Math.floor(n.y) > cy && g.solid(n.x, Math.floor(n.y) + 1)) { n.y = Math.floor(n.y); n.vy = 0; }
      } else {
        n.y = cy;
        n.vy = 0;
      }
      if (n.x === this.p.x && Math.abs(n.y - this.p.py) < 0.8) {
        this.addCoins(n.value, n.x, n.y, oreById(n.ore).color);
        this.fx.text(n.x + 0.5, n.y, `Догнал! +${n.value}`, '#ffd36b');
        this.env.audio.coin();
        n.value = 0;
      }
    }
    this.nuggets = this.nuggets.filter((n) => n.value > 0 && n.y < g.h);
  }

  private updateSeen(): void {
    const g = this.g, p = this.p;
    const r = this.lightRadius;
    const rr = Math.ceil(r);
    for (let dy = -rr; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = p.x + dx, y = p.y + dy;
        if (g.inside(x, y)) g.seen[g.i(x, y)] = 1;
      }
    }
    const ov = this.stats.oreVision;
    if (ov) this.reveal(r + ov, true);
    if (this.stats.poiVision) {
      for (let i = 0; i < g.b.length; i++) if (g.b[i] === B.CHEST || g.b[i] === B.CRATE || g.b[i] === B.GAS) g.seen[i] = 1;
    }
  }

  private reveal(r: number, oreOnly: boolean): void {
    const g = this.g, p = this.p;
    for (let y = Math.max(0, p.y - Math.ceil(r)); y <= Math.min(g.h - 1, p.y + Math.ceil(r)); y++) {
      for (let x = 0; x < g.w; x++) {
        if ((x - p.x) ** 2 + (y - p.y) ** 2 > r * r) continue;
        const i = g.i(x, y);
        if (!oreOnly || g.b[i] === B.ORE || g.b[i] === B.CHEST) g.seen[i] = 1;
      }
    }
  }

  /** Возобновить после «Второго дыхания». */
  revive(): void {
    this.invuln = 2;
    this.paused = false;
    this.refreshStats();
    if (this.boss?.kind === 'collapse') {
      this.boss.pause = 3;
      this.boss.front = Math.min(this.boss.front, this.p.py - 3);
    }
  }

  // ---------------- отрисовка ----------------

  render(ctx: CanvasRenderingContext2D, W: number, H: number, cssW: number): void {
    const g = this.g, p = this.p, run = this.env.run;
    const ts = Math.max(8, Math.floor(Math.min(W / (COLS + 1), H / 14)));
    const rows = H / ts;
    const offX = Math.floor((W - COLS * ts) / 2);
    let shakeX = 0, shakeY = 0;
    if (this.shake > 0) {
      const m = this.shake * ts * 0.35;
      shakeX = (Math.random() - 0.5) * m;
      shakeY = (Math.random() - 0.5) * m;
    }
    const offY = Math.round(shakeY);
    this.view = { ts, offX: offX + Math.round(shakeX), offY, w: W, h: H, rows, cssW } as typeof this.view;
    const camPx = Math.round(this.camY * ts);
    const pal = this.layer.pal;
    const atlas = this.env.atlas;
    const at = (key: string, dx: number, dy: number, size = ts) => {
      const s = atlas.slots.get(key);
      if (s) ctx.drawImage(atlas.canvas, s[0], s[1], T, T, dx, dy, size, size);
    };
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    const y0 = Math.max(0, Math.floor(this.camY) - 1);
    const y1 = Math.min(g.h - 1, Math.ceil(this.camY + rows) + 1);
    const ox = this.view.offX;
    const sy = (y: number) => offY + y * ts - camPx;

    // боковые стены
    for (let y = y0; y <= y1; y++) {
      for (let x = -Math.ceil(ox / ts) - 1; x < 0; x++) at(`bedrock${(x + y * 3) & 3}`, ox + x * ts, sy(y));
      for (let x = COLS; x < COLS + Math.ceil(ox / ts) + 1; x++) at(`bedrock${(x + y * 3) & 3}`, ox + x * ts, sy(y));
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, ox, H);
    ctx.fillRect(ox + COLS * ts, 0, W - ox - COLS * ts, H);

    const texel = Math.max(1, Math.round(ts / T));
    const front = this.collapseFront;
    for (let y = y0; y <= y1; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = g.i(x, y);
        const b = g.b[i];
        const dx = ox + x * ts, dy = sy(y);
        const seen = g.seen[i] || y < 3;
        const v = ((x * 7 + y * 13) ^ (x * y)) & 3;
        if (!seen) {
          // неизвестная порода: видно, где камень и где пустота, но не видно руды и сундуков
          at(BLOCKS[b].solid ? `${b === B.HARD || b === B.STONE ? 'stone' : 'dirt'}${v}` : `wall${v}`, dx, dy);
          ctx.fillStyle = 'rgba(6,5,8,0.78)';
          ctx.fillRect(dx, dy, ts, ts);
          continue;
        }
        if (!BLOCKS[b].solid || b === B.BOULDER || b === B.STALACTITE || b === B.CHEST || b === B.CRATE) {
          at(`wall${v}`, dx, dy);
          if (y < 3) {
            ctx.fillStyle = 'rgba(255,230,180,0.05)';
            ctx.fillRect(dx, dy, ts, ts);
          }
        }
        switch (b) {
          case B.DIRT: at(`dirt${v}`, dx, dy); break;
          case B.CLAY: at(`clay${v}`, dx, dy); break;
          case B.STONE: at(`stone${v}`, dx, dy); break;
          case B.HARD: at(`hard${v}`, dx, dy); break;
          case B.BEDROCK: at(`bedrock${v}`, dx, dy); break;
          case B.SAND: at(`sand${v}`, dx, dy); break;
          case B.RUBBLE: at(`rubble${v}`, dx, dy); break;
          case B.GAS:
            at(`stone${v}`, dx, dy);
            if (this.stats.gasVisible) at('gas', dx, dy);
            break;
          case B.ORE: {
            const host = (x + y) % 3 === 0 ? 'stone' : 'clay';
            at(`${host}${v}`, dx, dy);
            at(`ore${g.ore[i]}`, dx, dy);
            break;
          }
          case B.BOULDER: {
            const wob = g.wobble[i] >= 0 ? Math.round(Math.sin(this.time * 50) * texel) : 0;
            at('boulder', dx + wob, dy);
            break;
          }
          case B.STALACTITE: {
            const wob = g.wobble[i] >= 0 ? Math.round(Math.sin(this.time * 60) * texel) : 0;
            at('stalactite', dx + wob, dy);
            break;
          }
          case B.CHEST: at('chest', dx, dy); break;
          case B.CRATE: at('crate', dx, dy); break;
          case B.EXIT: {
            at('exit', dx, dy);
            const glow = 0.25 + Math.sin(this.time * 4) * 0.15;
            ctx.fillStyle = `rgba(255,220,120,${glow})`;
            ctx.fillRect(dx, dy - ts, ts, ts * 2);
            break;
          }
        }
        if (BLOCKS[b].solid && b !== B.BOULDER && b !== B.STALACTITE && b !== B.CHEST && b !== B.CRATE) {
          if (!g.solid(x, y - 1)) {
            ctx.fillStyle = 'rgba(255,240,210,0.16)';
            ctx.fillRect(dx, dy, ts, texel);
          }
          if (!g.solid(x, y + 1)) {
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(dx, dy + ts - texel * 2, ts, texel * 2);
          }
          if (!g.solid(x - 1, y)) {
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.fillRect(dx, dy, texel, ts);
          }
          if (!g.solid(x + 1, y)) {
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.fillRect(dx + ts - texel, dy, texel, ts);
          }
        }
        if (g.ladder[i]) at('ladder', dx, dy);
        if (g.fire[i] > 0) {
          ctx.fillStyle = `rgba(255,${90 + Math.floor(Math.random() * 60)},20,${0.35 + Math.random() * 0.2})`;
          ctx.fillRect(dx, dy, ts, ts);
        }
        if (this.revealT > 0 && b === B.ORE) {
          ctx.strokeStyle = `rgba(255,240,150,${Math.min(1, this.revealT) * 0.9})`;
          ctx.lineWidth = texel;
          ctx.strokeRect(dx + texel / 2, dy + texel / 2, ts - texel, ts - texel);
        }
      }
    }
    if (front !== null) {
      const fy = sy(front);
      const grad = ctx.createLinearGradient(0, fy - ts * 2, 0, fy + ts * 0.6);
      grad.addColorStop(0, 'rgba(30,20,12,0.85)');
      grad.addColorStop(1, 'rgba(30,20,12,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(ox, fy - ts * 2, COLS * ts, ts * 2.6);
    }

    // копание: трещины
    if (p.state === 'dig') {
      const stage = Math.min(3, Math.floor((p.t / p.dur) * 4));
      at(`crack${stage}`, ox + p.digX * ts, sy(p.digY));
    }
    // падающие тела
    for (const f of this.sim.falling) {
      const key = f.kind === B.BOULDER ? 'boulder' : f.kind === B.SAND ? `sand0` : 'stalactite';
      at(key, ox + f.x * ts, offY + Math.round(f.y * ts) - camPx);
    }
    for (const n of this.nuggets) at(`ore${n.ore}`, ox + n.x * ts + ts / 4, offY + Math.round(n.y * ts) - camPx + ts / 4, ts / 2);

    this.drawGnome(ctx, ts, ox, offY - camPx);

    // вода и газ поверх
    for (let y = y0; y <= y1; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = g.i(x, y);
        const dx = ox + x * ts, dy = sy(y);
        if (g.water[i]) {
          const surface = y === 0 || !g.water[g.i(x, y - 1)];
          ctx.fillStyle = 'rgba(52,120,210,0.5)';
          const wave = surface ? Math.round((Math.sin(this.time * 3 + x) + 1) * texel) : 0;
          ctx.fillRect(dx, dy + wave, ts, ts - wave);
          if (surface) {
            ctx.fillStyle = 'rgba(170,215,255,0.55)';
            ctx.fillRect(dx, dy + wave, ts, texel);
          }
        }
        if (g.gas[i] > 0.05) {
          ctx.fillStyle = `rgba(140,220,90,${Math.min(0.45, g.gas[i] * 0.35)})`;
          ctx.fillRect(dx, dy, ts, ts);
        }
      }
    }

    // частицы
    const camY = this.camY;
    for (const pt of this.fx.parts) {
      const s = Math.max(1, Math.round((pt.size * ts) / T));
      ctx.globalAlpha = Math.min(1, pt.life / (pt.max * 0.5));
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(ox + pt.x * ts - s / 2), Math.round(offY + (pt.y - camY) * ts - s / 2), s, s);
    }
    ctx.globalAlpha = 1;

    // тьма
    const r = this.lightRadius;
    const cx = ox + (p.px + 0.5) * ts, cy = offY + (p.py + 0.5 - camY) * ts;
    if (this.layer.light) {
      const grad = ctx.createRadialGradient(cx, cy, ts * r * 0.35, cx, cy, ts * r);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    } else {
      const grad = ctx.createRadialGradient(cx, cy, ts * 3, cx, cy, Math.max(W, H) * 0.75);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.stats.blur) {
      const grad = ctx.createRadialGradient(cx, cy, ts * 3, cx, cy, ts * 7);
      grad.addColorStop(0, 'rgba(200,190,170,0)');
      grad.addColorStop(1, 'rgba(120,110,100,0.55)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // летящие к счётчику монеты
    const target = this.env.coinTarget();
    for (const f of this.flies) {
      const k = Math.min(1, f.t / f.dur);
      const e = k * k * (3 - 2 * k);
      const tx = target ? target.x * (W / cssW) : W / 2, ty = target ? target.y * (W / cssW) : 0;
      const x = f.sx + (tx - f.sx) * e;
      const y = f.sy + (ty - f.sy) * e - Math.sin(k * Math.PI) * ts * 1.5;
      const s = Math.max(2, Math.round(ts / 5));
      ctx.fillStyle = f.color;
      ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), Math.max(1, s >> 1), Math.max(1, s >> 1));
    }

    // текст
    for (const t of this.fx.texts) {
      const a = Math.min(1, t.life / (t.max * 0.4));
      const size = Math.round(ts * (t.big ? 0.5 : 0.4));
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = a;
      ctx.lineWidth = Math.max(2, size / 5);
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const x = ox + t.x * ts, y = offY + (t.y - camY) * ts;
      ctx.strokeText(t.text, x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, y);
    }
    ctx.globalAlpha = 1;

    // стрелка к лифту, если он за экраном
    const exitY = sy(g.exitY);
    if (exitY > H - ts * 0.5) {
      const ex = ox + (g.exitX + 0.5) * ts;
      const bob = Math.sin(this.time * 5) * ts * 0.1;
      ctx.fillStyle = 'rgba(255,214,90,0.9)';
      ctx.beginPath();
      ctx.moveTo(ex - ts * 0.35, H - ts * 0.9 + bob);
      ctx.lineTo(ex + ts * 0.35, H - ts * 0.9 + bob);
      ctx.lineTo(ex, H - ts * 0.45 + bob);
      ctx.fill();
      ctx.font = `800 ${Math.round(ts * 0.3)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('лифт', ex, H - ts * 1.05 + bob);
    }

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(${this.flashColor},${this.flash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (run.energy <= 15 && Math.sin(this.time * 6) > 0) {
      ctx.strokeStyle = 'rgba(255,80,60,0.5)';
      ctx.lineWidth = ts * 0.15;
      ctx.strokeRect(0, 0, W, H);
    }
  }

  private drawGnome(ctx: CanvasRenderingContext2D, ts: number, ox: number, oy: number): void {
    const p = this.p;
    if (this.invuln > 0 && Math.floor(this.time * 14) % 2 === 0) return;
    const sp = this.env.gnome;
    let frame = 'idle';
    if (p.state === 'fall') frame = 'fall';
    else if (p.state === 'walk' || p.state === 'climb') frame = Math.floor(this.time * 10) % 2 ? 'walk' : 'idle';
    const s = sp.frames.get(`${frame}${p.face}`)!;
    const x = Math.round(ox + p.px * ts);
    let y = Math.round(oy + p.py * ts);
    if (p.state === 'idle') y += Math.round(Math.sin(this.time * 3) * ts * 0.02);
    const alpha = p.state === 'exit' ? Math.max(0, 1 - p.t / 0.7) : 1;
    ctx.globalAlpha = alpha;
    ctx.drawImage(sp.canvas, s[0], s[1], T, T, x, y, ts, ts);
    // кирка
    const texel = ts / T;
    let ang = p.face === 1 ? -0.6 : Math.PI + 0.6;
    if (p.state === 'dig') {
      const k = Math.sin(Math.min(1, p.t / p.dur) * Math.PI);
      const base = p.digDir === 'd' ? Math.PI / 2 : p.digDir === 'u' ? -Math.PI / 2 : p.digDir === 'r' ? 0 : Math.PI;
      const swing = p.digDir === 'l' ? 1 : -1;
      ang = base + swing * (1 - k) * 1.3;
    }
    const hx = x + ts * (p.face === 1 ? 0.62 : 0.38), hy = y + ts * 0.62;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(0, -texel * 0.7, texel * 8, texel * 1.4);
    ctx.fillStyle = '#b8c0c6';
    ctx.fillRect(texel * 7, -texel * 3.5, texel * 1.6, texel * 7);
    ctx.fillStyle = '#e8eef2';
    ctx.fillRect(texel * 7, -texel * 3.5, texel * 0.8, texel * 3);
    ctx.restore();
    // свет фонаря
    if (this.layer.light) {
      ctx.fillStyle = 'rgba(255,245,180,0.9)';
      ctx.fillRect(x + Math.round(ts * (p.face === 1 ? 0.75 : 0.19)), y + Math.round(ts * 0.13), Math.max(1, Math.round(texel)), Math.max(1, Math.round(texel)));
    }
    ctx.globalAlpha = 1;
  }
}
