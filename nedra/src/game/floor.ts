// Этаж: гном, копание, меч, способности, враги, предметы, факелы, комнаты, волны, боссы.
import { INVULN, PLAYER_R, WAVE_EVERY, WAVE_FIRST } from '../config';
import { B, BLOCKS, PICK_TIER_NAME } from '../core/blocks';
import { generateFloor, ROOM_INFO, type FloorLayout, type Prop, type Room } from '../core/gen';
import type { Grid } from '../core/grid';
import { Rng } from '../core/rng';
import { stack, type MetaState, type RunState } from '../core/state';
import { clampHp, computeStats, type PlayerStats } from '../core/stats';
import { enemyDef, type EnemyDef } from '../data/enemies';
import { heroDef } from '../data/heroes';
import { ITEMS, itemDef, type ItemDef } from '../data/items';
import { layerDef, type LayerDef } from '../data/layers';
import { oreById, oreByKey } from '../data/ores';
import type { DamageSrc, EnemyRef, FloorApi, ProjKind, ShootOpts } from './api';
import type { Audio } from './audio';
import { updateEnemy } from './enemyai';
import { Fx } from './fx';
import { flowField, FAR, lineOfSight, moveBody } from './physics';

export interface FloorEnv {
  meta: MetaState;
  run: RunState;
  audio: Audio;
  toast(text: string, kind?: 'good' | 'bad' | 'info'): void;
  complete(): void;
  died(): void;
  openProp(kind: 'merchant' | 'shrine' | 'anvil', prop: PropState): void;
  itemFound(id: string): void;
}

export interface Enemy extends EnemyRef {
  def: EnemyDef;
  r: number;
  vx: number;
  vy: number;
  kx: number;
  ky: number;
  t: number;
  cd: number;
  state: string;
  st: number;
  sleep: boolean;
  room: number;
  elite: boolean;
  flash: number;
  slowT: number;
  slowK: number;
  burnT: number;
  burnDps: number;
  stunT: number;
  rhythm: number;
  digT: number;
  fuse: number;
  trail: { x: number; y: number }[];
  tx: number;
  ty: number;
  spawnT: number;
  under: boolean;
  enraged: boolean;
  touchT: number;
  cd2: number;
  side: number;
}

export type EProjKind = 'rock' | 'web' | 'efire' | 'ebomb';

export interface Proj {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  life: number;
  kind: ProjKind | EProjKind;
  mine: boolean;
  pierce: number;
  bounce: number;
  hit: Set<Enemy>;
  tx: number;
  ty: number;
}

export interface Pickup { x: number; y: number; vx: number; vy: number; kind: 'coin' | 'heart' | 'item'; value: number; item: string; t: number }
export interface Bomb { x: number; y: number; t: number; r: number; dmg: number; safe: boolean; enemy: boolean }
export interface Torch { x: number; y: number; r: number }
export interface Cloud { x: number; y: number; r: number; t: number; dps: number }
export interface FireZone { x: number; y: number; t: number }
export interface Turret { x: number; y: number; t: number; cd: number }
export interface Minion { kind: 'bat' | 'golem'; x: number; y: number; cd: number; a: number }
export interface PropState extends Prop { used: boolean; away: boolean; stock: string[] }
export interface Telegraph { x: number; y: number; r: number; t: number; max: number; ring?: boolean; follow?: Enemy }
export interface Bolt { pts: { x: number; y: number }[]; t: number }

interface Player {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  face: number;
  dir: 'down' | 'up' | 'left' | 'right';
  inv: number;
  mineT: number;
  mineCell: number;
  swordT: number;
  swing: { a: number; t: number; arc: number; r: number } | null;
  abilityT: number;
  dashT: number;
  dashX: number;
  dashY: number;
  walk: number;
  slowT: number;
  moving: boolean;
}

export interface MoveInput {
  mx: number;
  my: number;
}

const CHEST_NAMES = ['', 'деревянный', 'железный', 'золотой', 'тайник'];

export class Floor implements FloorApi {
  readonly layer: LayerDef;
  readonly index: number;
  readonly layout: FloorLayout;
  readonly g: Grid;
  readonly rng: Rng;
  readonly fx = new Fx();
  stats: PlayerStats;
  p: Player;
  enemies: Enemy[] = [];
  projs: Proj[] = [];
  pickups: Pickup[] = [];
  bombs: Bomb[] = [];
  torchList: Torch[] = [];
  clouds: Cloud[] = [];
  fires: FireZone[] = [];
  turrets: Turret[] = [];
  minions: Minion[] = [];
  props: PropState[];
  telegraphs: Telegraph[] = [];
  bolts: Bolt[] = [];
  vis: Uint8Array;
  oreSeen: Uint8Array;
  flow: Uint16Array;
  time = 0;
  paused = false;
  done = false;
  boss: Enemy | null = null;
  bossStarted = false;
  shake = 0;
  flash = 0;
  flashColor = '255,60,40';
  hitStop = 0;
  kills = 0;
  oreMined = 0;
  blocksBroken = 0;
  lastHit = { i: -1, t: -9 };
  torchesPlaced = 0;
  private flowT = 0;
  private waveT: number;
  private waveN = 0;
  private waveWarned = false;
  private lastCell = -1;
  private revealT = 0;
  private counters = new Map<string, number>();
  private buffs: { id: string; t: number; speed: number; attack: number }[] = [];
  private shields = 0;
  private breaks: number[] = [];
  private trial: { room: Room; wave: number; sealed: number[] } | null = null;
  private torchCount = 0;
  private warned = new Set<string>();
  private items: [ItemDef, number][] = [];

  constructor(private env: FloorEnv, seed: number) {
    const run = env.run;
    this.layer = layerDef(run.layer);
    this.index = run.floor;
    this.rng = new Rng(seed ^ 0x9e3779b9);
    this.layout = generateFloor(this.layer, run.floor, seed, run.tutorial && run.floor === 0);
    this.g = this.layout.grid;
    const n = this.g.w * this.g.h;
    this.vis = new Uint8Array(n);
    this.oreSeen = new Uint8Array(n);
    this.flow = new Uint16Array(n).fill(FAR);
    this.stats = computeStats(env.meta, run);
    clampHp(run, this.stats);
    this.refreshItems();
    const s = this.layout.start;
    this.p = { x: s.x + 0.5, y: s.y + 0.5, r: PLAYER_R, vx: 0, vy: 0, face: Math.PI / 2, dir: 'down', inv: 1, mineT: 0, mineCell: -1,
      swordT: 0, swing: null, abilityT: 0, dashT: 0, dashX: 0, dashY: 0, walk: 0, slowT: 0, moving: false };
    this.props = this.layout.props.map((p) => ({ ...p, used: false, away: true, stock: [] }));
    for (let k = 0; k < this.stats.mushrooms; k++) {
      const spot = this.freeNear(s.x, s.y + 2, 3);
      if (spot) this.props.push({ kind: 'mushroom', x: spot.x, y: spot.y, room: 0, used: false, away: true, stock: [] });
    }
    for (const sp of this.layout.spawns) this.spawn(sp.id, sp.x + 0.5, sp.y + 0.5, { sleep: true, elite: sp.elite, room: sp.room });
    this.waveT = run.tutorial && run.floor === 0 ? 9999 : WAVE_FIRST;
    for (const [d, k] of this.items) d.onFloor?.(this, k);
    this.reveal();
  }

  // ---------------- служебное ----------------

  refreshItems(): void {
    this.items = ITEMS.filter((d) => stack(this.env.run, d.id) > 0).map((d) => [d, stack(this.env.run, d.id)]);
  }

  refreshStats(): void {
    this.stats = computeStats(this.env.meta, this.env.run);
    clampHp(this.env.run, this.stats);
    this.refreshItems();
  }

  get heroId(): string { return this.env.run.hero; }
  get runState(): RunState { return this.env.run; }
  get px(): number { return this.p.x; }
  get py(): number { return this.p.y; }
  get hp(): number { return this.env.run.hp; }

  private freeNear(x: number, y: number, r: number): { x: number; y: number } | null {
    for (let k = 0; k < 40; k++) {
      const nx = x + this.rng.int(-r, r), ny = y + this.rng.int(-1, r);
      if (this.g.open(nx, ny) && !this.props.some((p) => p.x === nx && p.y === ny)) return { x: nx, y: ny };
    }
    return null;
  }

  spawn(id: string, x: number, y: number, o: { sleep?: boolean; elite?: boolean; room?: number } = {}): Enemy {
    const def = enemyDef(id);
    const scale = (def.boss ? 1 : 1 + 0.12 * this.index) * this.stats.enemyHp * (o.elite ? 2.2 : 1);
    const hp = Math.round(def.hp * scale);
    const e: Enemy = {
      id, def, x, y, r: def.r * (o.elite ? 1.15 : 1), hp, max: hp, boss: !!def.boss, mini: !!def.mini, dead: false,
      vx: 0, vy: 0, kx: 0, ky: 0, t: this.rng.next() * 10, cd: 1 + this.rng.next(), state: 'idle', st: 0,
      sleep: !!o.sleep, room: o.room ?? 0, elite: !!o.elite, flash: 0, slowT: 0, slowK: 0, burnT: 0, burnDps: 0, stunT: 0,
      rhythm: 0, digT: 0, fuse: -1, trail: [], tx: x, ty: y, spawnT: 0, under: false, enraged: false, touchT: 0,
      cd2: 2 + this.rng.next() * 2, side: this.rng.chance(0.5) ? 1 : -1,
    };
    this.enemies.push(e);
    return e;
  }

  counter(id: string, add = 0): number {
    const v = (this.counters.get(id) ?? 0) + add;
    this.counters.set(id, v);
    return v;
  }

  solidFor = (x: number, y: number): boolean => this.g.solid(x, y);

  get audio(): Audio {
    return this.env.audio;
  }

  say(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    this.env.toast(text, kind);
  }

  /** Порода изменилась: пересчитать пути и видимость. */
  terrain(): void {
    this.flowT = 0;
    this.revealT = 0;
  }

  telegraph(x: number, y: number, r: number, t: number, o: { follow?: Enemy; ring?: boolean } = {}): void {
    this.telegraphs.push({ x, y, r, t, max: t, ...o });
  }

  // ---------------- обновление ----------------

  update(dt: number, input: MoveInput, actions: string[]): void {
    if (this.paused || this.done) return;
    this.fx.update(dt);
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    for (const b of this.bolts) b.t -= dt;
    this.bolts = this.bolts.filter((b) => b.t > 0);
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }
    this.time += dt;
    const run = this.env.run;
    for (const a of actions) this.action(a);
    this.updatePlayer(dt, input);
    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.2;
      flowField(this.g, Math.floor(this.p.x), Math.floor(this.p.y), this.flow);
    }
    for (const e of this.enemies) if (!e.dead) updateEnemy(this, e, dt);
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.separate();
    this.updateProjs(dt);
    this.updateBombs(dt);
    this.updateZones(dt);
    this.updateTurrets(dt);
    this.updateMinions(dt);
    this.updatePickups(dt);
    this.updateProps();
    this.updateWaves(dt);
    this.updateTrial();
    this.updateBossTrigger();
    for (const t of this.telegraphs) {
      t.t -= dt;
      if (t.follow) {
        t.x = t.follow.x;
        t.y = t.follow.y;
        if (t.follow.dead) t.t = 0;
      }
    }
    this.telegraphs = this.telegraphs.filter((t) => t.t > 0);
    for (const b of this.buffs) b.t -= dt;
    this.buffs = this.buffs.filter((b) => b.t > 0);
    if (this.stats.regen > 0 && run.hp > 0) run.hp = Math.min(this.stats.maxHp, run.hp + this.stats.regen * dt);
    for (const [d, k] of this.items) d.onTick?.(this, k, dt);
    this.revealT -= dt;
    const cell = this.g.i(Math.floor(this.p.x), Math.floor(this.p.y));
    if (cell !== this.lastCell || this.revealT <= 0) this.reveal();
    this.lastCell = cell;
    this.checkExit();
  }

  private speedMult(): number {
    let m = 1;
    for (const b of this.buffs) m *= b.speed;
    return m * (this.p.slowT > 0 ? 0.55 : 1);
  }

  private attackMult(): number {
    let m = 1;
    for (const b of this.buffs) m *= b.attack;
    return m;
  }

  private action(a: string): void {
    const run = this.env.run;
    if (a === 'ability') this.useAbility();
    else if (a === 'torch') this.placeTorch();
    else if (a === 'bomb' && run.bombs > 0) {
      run.bombs--;
      const ang = this.p.face;
      this.throwBomb(this.p.x + Math.cos(ang) * 2.5, this.p.y + Math.sin(ang) * 2.5, 1.6, 12);
    } else if (a === 'scan' && run.scanners > 0) {
      run.scanners--;
      this.scan(8);
      this.env.toast('Сканер: руда вокруг подсвечена', 'info');
    }
  }

  private updatePlayer(dt: number, input: MoveInput): void {
    const p = this.p, s = this.stats;
    p.inv = Math.max(0, p.inv - dt);
    p.slowT = Math.max(0, p.slowT - dt);
    p.swordT -= dt;
    p.abilityT = Math.max(0, p.abilityT - dt);
    if (p.swing) {
      p.swing.t -= dt;
      if (p.swing.t <= 0) p.swing = null;
    }
    // рывок
    if (p.dashT > 0) {
      p.dashT -= dt;
      const step = 12 * dt;
      const tx = Math.floor(p.x + p.dashX * (p.r + 0.2)), ty = Math.floor(p.y + p.dashY * (p.r + 0.2));
      if (this.g.solid(tx, ty)) {
        const i = this.g.i(tx, ty);
        if (this.g.inside(tx, ty) && this.g.tier(i) <= s.pickTier && BLOCKS[this.g.b[i]].hp < Infinity) this.breakBlock(tx, ty, true);
        else p.dashT = 0;
      }
      moveBody(p, p.dashX * step, p.dashY * step, this.solidFor);
      for (const e of this.enemiesIn(p.x, p.y, 0.9)) if (e.flash <= 0) this.damage(e, s.swordDmg * 1.5 * s.dmgMult, 'ability');
      return;
    }
    let mx = input.mx, my = input.my;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    p.moving = len > 0.15;
    if (p.moving) {
      if (Math.floor(p.walk / 2.5) !== Math.floor((p.walk + dt * 8) / 2.5)) this.fx.dust(p.x - 0.5, p.y + 0.15, 1, 'rgba(150,130,110,0.5)');
      p.face = Math.atan2(my, mx);
      p.dir = Math.abs(mx) > Math.abs(my) ? (mx > 0 ? 'right' : 'left') : (my > 0 ? 'down' : 'up');
      p.walk += dt * 8;
    }
    const sp = s.speed * this.speedMult();
    const res = moveBody(p, mx * sp * dt, my * sp * dt, this.solidFor);
    this.cornerAssist(mx, my, res.hitX, res.hitY, dt);

    // бой важнее копания
    const target = this.nearest(p.x, p.y, s.swordRange);
    if (target && p.swordT <= 0) this.swingSword(target);
    else if (p.moving && !p.swing) this.tryMine(mx, my, dt);
    else p.mineCell = -1;
  }

  /** Подталкивает в проход шириной в клетку, если упёрлись краем. */
  private cornerAssist(mx: number, my: number, hitX: number, hitY: number, dt: number): void {
    const p = this.p;
    const nudge = 3 * dt;
    if (hitY && Math.abs(my) > Math.abs(mx)) {
      const cx = Math.floor(p.x), ty = Math.floor(p.y) + Math.sign(my);
      if (!this.g.solid(cx, ty)) {
        const d = cx + 0.5 - p.x;
        if (Math.abs(d) > 0.02) moveBody(p, Math.sign(d) * Math.min(Math.abs(d), nudge), 0, this.solidFor);
      }
    }
    if (hitX && Math.abs(mx) > Math.abs(my)) {
      const cy = Math.floor(p.y), tx = Math.floor(p.x) + Math.sign(mx);
      if (!this.g.solid(tx, cy)) {
        const d = cy + 0.5 - p.y;
        if (Math.abs(d) > 0.02) moveBody(p, 0, Math.sign(d) * Math.min(Math.abs(d), nudge), this.solidFor);
      }
    }
  }

  private tryMine(mx: number, my: number, dt: number): void {
    const p = this.p, g = this.g, s = this.stats;
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    let dx = 0, dy = 0;
    if (Math.abs(mx) >= Math.abs(my)) dx = Math.sign(mx); else dy = Math.sign(my);
    const tx = cx + dx, ty = cy + dy;
    const touching = dx > 0 ? tx - (p.x + p.r) < 0.1 : dx < 0 ? (p.x - p.r) - (tx + 1) < 0.1
      : dy > 0 ? ty - (p.y + p.r) < 0.1 : (p.y - p.r) - (ty + 1) < 0.1;
    if (!g.inside(tx, ty) || !g.solid(tx, ty) || !touching) {
      p.mineCell = -1;
      return;
    }
    const i = g.i(tx, ty);
    if (p.mineCell !== i) {
      p.mineCell = i;
      p.mineT = Math.min(p.mineT, 0.08);
    }
    p.mineT -= dt * this.attackMult();
    if (p.mineT > 0) return;
    p.mineT = s.mineInterval;
    p.swing = { a: Math.atan2(dy, dx), t: 0.16, arc: 0, r: 0 };
    this.hitBlock(tx, ty, s.pickPower, true);
    if (s.wideMine > 0) {
      const side: [number, number][] = dx ? [[tx, ty - 1], [tx, ty + 1]] : [[tx - 1, ty], [tx + 1, ty]];
      for (const [x, y] of side) if (g.solid(x, y)) this.hitBlock(x, y, s.pickPower * 0.5 * s.wideMine, false);
    }
    for (let k = 1; k <= s.drillDepth; k++) {
      const x = tx + dx * k, y = ty + dy * k;
      if (g.solid(x, y)) this.hitBlock(x, y, s.pickPower * 0.6, false);
    }
  }

  /** Удар по клетке. Возвращает true, если клетка разрушена. */
  hitBlock(x: number, y: number, power: number, primary: boolean): boolean {
    const g = this.g;
    if (!g.inside(x, y)) return false;
    const i = g.i(x, y);
    const b = g.b[i];
    const def = BLOCKS[b];
    if (!def.solid || def.hp === Infinity) {
      if (primary && b !== B.FLOOR) this.clang(x, y, b === B.DOOR ? 'Проход запечатан' : 'Коренную породу не пробить');
      return false;
    }
    const tier = g.tier(i);
    if (tier > this.stats.pickTier) {
      if (primary) {
        const name = b === B.ORE ? oreById(g.ore[i]).name : def.name;
        this.clang(x, y, `${name}: нужна ${PICK_TIER_NAME[tier]} кирка`);
      }
      return false;
    }
    g.hp[i] -= power;
    this.lastHit = { i, t: this.time };
    if (primary) this.env.audio.dig(Math.min(3, g.maxHp(i) / 8));
    this.fx.burst(x + 0.5, y + 0.5, this.blockColor(i), primary ? 4 : 2, 3, 1.6, 0, 0.35);
    if (g.hp[i] <= 0) {
      this.breakBlock(x, y, true);
      return true;
    }
    return false;
  }

  private clang(x: number, y: number, msg: string): void {
    this.fx.sparkle(x + 0.5, y + 0.5, '#ffe9a0', 4);
    this.env.audio.clang();
    if (!this.warned.has(msg)) {
      this.warned.add(msg);
      this.env.toast(msg, 'bad');
    }
  }

  blockColor(i: number): string {
    const g = this.g;
    const b = g.b[i] === B.ORE ? g.host[i] : g.b[i];
    return ROCK_COLOR[b] ?? '#8a7a6a';
  }

  /** Разрушить клетку. byPlayer - добыча гномом (срабатывают предметы на добычу). */
  breakBlock(x: number, y: number, byPlayer: boolean, quiet = false): void {
    const g = this.g, run = this.env.run;
    const i = g.i(x, y);
    const b = g.b[i];
    if (!BLOCKS[b].solid || BLOCKS[b].hp === Infinity) return;
    const color = this.blockColor(i);
    const oreId = g.ore[i];
    g.set(x, y, B.FLOOR);
    g.dug[i] = 1;
    this.flowT = 0;
    this.revealT = 0;
    if (!quiet) this.fx.burst(x + 0.5, y + 0.5, color, 9, 4, 2.2, 0, 0.5);
    if (b === B.ORE) {
      const ore = oreById(oreId);
      let n = 1;
      if (this.rng.chance(this.stats.doubleOre)) n = 2;
      run.bag[ore.key] = (run.bag[ore.key] ?? 0) + n;
      const value = Math.round(ore.value * n * this.stats.oreValue);
      run.haul += value;
      this.oreMined += n;
      this.env.meta.stats.ore += n;
      this.fx.text(x + 0.5, y + 0.3, `+${n} ${ore.name}`, ore.light, ore.kind === 'gem');
      this.fx.sparkle(x + 0.5, y + 0.5, ore.light, ore.kind === 'gem' ? 12 : 5);
      this.env.audio.ore(ore.kind === 'gem');
      if (byPlayer) for (const [d, k] of this.items) d.onOre?.(this, k, x + 0.5, y + 0.5, ore);
    } else if (b === B.CHEST) {
      this.openChest(x, y, oreId || 1);
    } else if (b === B.CRATE) {
      this.openCrate(x, y);
    } else if (b === B.TNT) {
      this.explode(x + 0.5, y + 0.5, 1.8 * this.stats.explRadius, 15, false);
    } else if (b === B.CRYSTAL) {
      run.bag.quartz = (run.bag.quartz ?? 0) + 2;
      run.haul += Math.round(oreByKey('quartz').value * 2 * this.stats.oreValue);
      this.fx.text(x + 0.5, y + 0.3, '+2 Кварц', '#d9ccff');
      this.fx.sparkle(x + 0.5, y + 0.5, '#d9ccff', 14);
    } else if (b === B.CRACKED) {
      this.env.toast('Тайник!', 'good');
    }
    if (byPlayer) {
      this.breaks.push(this.time);
      this.blocksBroken++;
      for (const [d, k] of this.items) d.onBreak?.(this, k, x + 0.5, y + 0.5);
    }
  }

  private openChest(x: number, y: number, tier: number): void {
    const run = this.env.run;
    this.env.audio.pickup();
    this.fx.sparkle(x + 0.5, y + 0.5, '#ffe36b', 20);
    this.shake = Math.max(this.shake, 0.1);
    if (tier === 4) {
      const n = Math.round((25 + this.rng.int(0, 15)) * (1 + 0.5 * (run.layer - 1)));
      this.dropCoins(x + 0.5, y + 0.5, n);
      this.env.toast(`Тайник: ${n} монет`, 'good');
      return;
    }
    const luck = this.stats.luck;
    const roll = this.rng.next() / luck;
    let rarity: 'common' | 'rare' | 'legendary' = 'common';
    if (tier === 3) rarity = roll < 0.4 ? 'legendary' : 'rare';
    else if (tier === 2) rarity = roll < 0.12 ? 'legendary' : roll < 0.8 ? 'rare' : 'common';
    else rarity = roll < 0.25 ? 'rare' : 'common';
    if (tier === 1 && this.rng.chance(0.35)) {
      this.dropCoins(x + 0.5, y + 0.5, Math.round((8 + this.rng.int(0, 8)) * (1 + 0.5 * (run.layer - 1))));
      return;
    }
    const id = this.randomItem(rarity);
    if (id) this.dropItem(x + 0.5, y + 0.5, id);
    this.env.toast(`Открыт ${CHEST_NAMES[tier]} сундук`, 'info');
  }

  randomItem(rarity: 'common' | 'rare' | 'legendary' | 'cursed'): string | null {
    const tier = this.env.meta.bosses.length ? Math.max(...this.env.meta.bosses) : 0;
    const run = this.env.run;
    const pool = ITEMS.filter((d) => d.rarity === rarity && d.pool <= tier && (!d.max || stack(run, d.id) < d.max));
    return pool.length ? this.rng.pick(pool).id : null;
  }

  private openCrate(x: number, y: number): void {
    const run = this.env.run;
    this.env.audio.pickup();
    const r = this.rng.next();
    if (r < (heroDef(run.hero).id === 'herbalist' ? 0.7 : 0.5)) {
      const n = Math.round(8 * this.stats.healMult);
      this.heal(n);
      this.fx.text(x + 0.5, y, `Каравай +${n}`, '#9ef07a');
    } else if (r < 0.75) {
      run.bag.coal = (run.bag.coal ?? 0) + 3;
      this.fx.text(x + 0.5, y, '+3 Уголь', '#c9c9d2');
    } else if (r < 0.9) {
      run.bombs += 1;
      this.fx.text(x + 0.5, y, '+1 Бомба', '#ff9a6b');
    } else {
      this.dropCoins(x + 0.5, y + 0.5, 6 + this.rng.int(0, 6));
    }
  }

  // ---------------- меч ----------------

  private swingSword(target: Enemy): void {
    const p = this.p, s = this.stats;
    const a = Math.atan2(target.y - p.y, target.x - p.x);
    p.face = a;
    p.dir = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 'right' : 'left') : (Math.sin(a) > 0 ? 'down' : 'up');
    p.swordT = s.swordCd / this.attackMult();
    p.swing = { a, t: 0.18, arc: (s.swordArc * Math.PI) / 180, r: s.swordRange };
    this.env.audio.swing();
    for (const [d, k] of this.items) d.onSwing?.(this, k, a);
    const half = (s.swordArc * Math.PI) / 360;
    let hits = 0;
    for (const e of [...this.enemies]) {
      if (e.dead || (e.under && e.def.ai === 'worm')) continue;
      const parts = e.def.ai === 'worm' ? [{ x: e.x, y: e.y }, ...e.trail] : [{ x: e.x, y: e.y }];
      const hit = parts.some((q) => {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d > s.swordRange + e.r) return false;
        let da = Math.atan2(q.y - p.y, q.x - p.x) - a;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        return Math.abs(da) <= half || d < e.r + p.r;
      });
      if (!hit) continue;
      hits++;
      e.rhythm = e.rhythm + 1;
      for (const o of this.enemies) if (o !== e) o.rhythm = 0;
      const dmg = this.swordDamage(e);
      this.damage(e, dmg, 'sword');
      if (s.lifesteal > 0) this.heal(dmg * s.lifesteal);
      const kb = e.boss ? 0.5 : e.mini ? 1.5 : 5;
      e.kx += Math.cos(a) * kb;
      e.ky += Math.sin(a) * kb;
      for (const [d, k] of this.items) d.onHit?.(this, k, e, dmg);
    }
    if (hits) this.hitStop = 0.035;
  }

  private swordDamage(e: Enemy): number {
    const s = this.stats, run = this.env.run;
    let dmg = s.swordDmg * s.dmgMult;
    if (s.berserk) dmg *= 1 + 0.01 * s.berserk * Math.max(0, 100 * (1 - run.hp / s.maxHp));
    if (s.rush) dmg *= 1 + Math.min(0.45 * s.rush / 0.03, s.rush * this.recentBreaks());
    if (s.rhythm) dmg *= 1 + Math.min(0.5, 0.1 * s.rhythm * Math.max(0, e.rhythm - 1));
    return dmg;
  }

  private recentBreaks(): number {
    this.breaks = this.breaks.filter((t) => this.time - t <= 8);
    return this.breaks.length;
  }

  // ---------------- урон ----------------

  damage(target: EnemyRef, raw: number, src: DamageSrc): void {
    const e = target as Enemy;
    if (e.dead || (e.under && src !== 'expl')) return;
    const s = this.stats;
    let dmg = raw;
    if (src !== 'sword' && src !== 'echo' && src !== 'ability') dmg *= s.dmgMult;
    let crit = false;
    if ((src === 'sword' || src === 'echo' || src === 'proj') && this.rng.chance(s.crit)) {
      dmg *= s.critMult;
      crit = true;
    }
    if (e.boss || e.mini) dmg *= s.bossDmg;
    if (s.execute && e.hp < e.max * 0.3) dmg *= 1 + s.execute;
    dmg = Math.max(1, dmg - (e.def.armor ?? 0));
    e.hp -= dmg;
    e.flash = 0.12;
    if (e.sleep) e.sleep = false;
    this.fx.number(e.x, e.y - e.r, Math.round(dmg), crit);
    if (e.hp <= 0) this.kill(e);
  }

  private kill(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    const run = this.env.run, s = this.stats;
    this.kills++;
    run.kills++;
    this.env.meta.stats.kills++;
    this.env.audio.squish(e.boss || e.mini);
    this.fx.burst(e.x, e.y, ENEMY_COLOR[e.def.id] ?? '#7ad06b', e.boss ? 40 : 14, 5, 2.6, 0, 0.7);
    const [a, b] = e.def.coins;
    const coins = Math.round(this.rng.int(a, b) * (e.elite ? 3 : 1) * s.killCoins);
    if (coins > 0) this.dropCoins(e.x, e.y, coins);
    if (this.rng.chance(Math.min(1, e.def.heart * s.luck))) this.pickups.push({ x: e.x, y: e.y, vx: 0, vy: -1, kind: 'heart', value: 4, item: '', t: 0 });
    if (e.elite && this.rng.chance(0.35 * s.luck)) {
      const id = this.randomItem('common');
      if (id) this.dropItem(e.x, e.y, id);
    }
    if (s.healOnKill) this.heal(s.healOnKill);
    for (const [d, k] of this.items) d.onKill?.(this, k, e);
    if (e.def.ai === 'queen') for (let k = 0; k < 4; k++) this.spawn('slimeling', e.x + this.rng.range(-0.5, 0.5), e.y + this.rng.range(-0.5, 0.5));
    if (e.boss) this.onBossDead(e);
    else if (e.mini) {
      this.env.toast(`${e.def.name} повержен!`, 'good');
      this.shake = 0.4;
    }
  }

  private onBossDead(e: Enemy): void {
    const g = this.g;
    this.shake = 0.8;
    this.flash = 0.6;
    this.flashColor = '255,230,150';
    this.env.toast(`${e.def.name} повержен! Проход к спуску открыт`, 'good');
    this.env.audio.fanfare();
    for (let i = 0; i < g.b.length; i++) if (g.b[i] === B.DOOR) { g.b[i] = B.FLOOR; g.hp[i] = 0; }
    this.flowT = 0;
    const id = this.randomItem(this.rng.chance(0.5) ? 'legendary' : 'rare');
    if (id) this.dropItem(e.x, e.y, id);
    this.boss = null;
  }

  hurt(raw: number, from: Enemy | null, why = ''): void {
    const p = this.p, run = this.env.run, s = this.stats;
    if (p.inv > 0 || p.dashT > 0 || this.done) return;
    if (this.rng.chance(s.block)) {
      this.fx.text(p.x, p.y - 0.5, 'Блок!', '#bfe8ff');
      p.inv = 0.3;
      return;
    }
    if (this.shields > 0) {
      this.shields--;
      this.fx.text(p.x, p.y - 0.5, 'Каменная кожа!', '#c9c2b8');
      p.inv = INVULN;
      return;
    }
    const dmg = Math.max(1, Math.round(raw - s.armor));
    run.hp -= dmg;
    p.inv = INVULN;
    this.shake = Math.max(this.shake, 0.25);
    this.flash = 0.5;
    this.flashColor = '255,60,40';
    this.env.audio.hurt();
    this.fx.number(p.x, p.y - 0.4, dmg, false, '#ff6b5b');
    if (why) this.fx.text(p.x, p.y - 0.9, why, '#ff9a8a');
    if (from) {
      const a = Math.atan2(p.y - from.y, p.x - from.x);
      moveBody(p, Math.cos(a) * 0.35, Math.sin(a) * 0.35, this.solidFor);
      if (s.thorns) this.damage(from, s.thorns, 'thorns');
    }
    for (const [d, k] of this.items) d.onHurt?.(this, k, dmg);
    if (run.hp <= 0) {
      if (run.extraLives > 0) {
        run.extraLives--;
        run.items.crystalheart = Math.max(0, (run.items.crystalheart ?? 1) - 1);
        this.refreshStats();
        run.hp = Math.round(this.stats.maxHp / 2);
        p.inv = 2;
        this.env.toast('Кристальное сердце спасло гнома!', 'good');
        this.flash = 0.8;
        this.flashColor = '180,240,255';
        return;
      }
      run.hp = 0;
      this.env.died();
    }
  }

  heal(n: number): void {
    const run = this.env.run;
    if (n <= 0 || run.hp <= 0) return;
    const before = run.hp;
    run.hp = Math.min(this.stats.maxHp, run.hp + n);
    if (run.hp - before >= 1) this.fx.text(this.p.x, this.p.y - 0.6, `+${Math.round(run.hp - before)}`, '#8fe07a');
  }

  // ---------------- FloorApi ----------------

  nearest(x: number, y: number, range: number): Enemy | null {
    let best: Enemy | null = null, bd = range;
    for (const e of this.enemies) {
      if (e.dead || e.sleep && !e.mini || (e.under && e.def.ai === 'worm')) continue;
      const d = Math.hypot(e.x - x, e.y - y) - e.r;
      if (d < bd && lineOfSight(this.g, x, y, e.x, e.y)) { bd = d; best = e; }
    }
    return best;
  }

  enemiesIn(x: number, y: number, r: number): Enemy[] {
    return this.enemies.filter((e) => !e.dead && !(e.under && e.def.ai === 'worm') && Math.hypot(e.x - x, e.y - y) <= r + e.r);
  }

  shoot(x: number, y: number, target: EnemyRef | null, o: ShootOpts): void {
    const speed = o.speed ?? 9;
    let a = o.dir ?? 0;
    if (target) a = Math.atan2(target.y - y, target.x - x) + this.rng.range(-0.08, 0.08);
    this.projs.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: o.kind === 'wave' ? 0.4 : 0.15, dmg: o.dmg,
      life: o.kind === 'wave' ? 0.6 : 1.2, kind: o.kind ?? 'shard', mine: true, pierce: o.pierce ?? 0, bounce: this.stats.bounce,
      hit: new Set(), tx: 0, ty: 0 });
  }

  enemyShot(e: Enemy, kind: EProjKind, dmg: number, speed: number, angle?: number): void {
    const a = angle ?? Math.atan2(this.p.y - e.y, this.p.x - e.x);
    const proj: Proj = { x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: kind === 'rock' ? 0.22 : 0.18, dmg,
      life: 2.5, kind, mine: false, pierce: 0, bounce: 0, hit: new Set(), tx: this.p.x, ty: this.p.y };
    if (kind === 'ebomb') {
      // навесом в точку, где стоит гном
      const d = Math.hypot(this.p.x - e.x, this.p.y - e.y);
      proj.life = Math.max(0.6, d / speed);
      proj.vx = (this.p.x - e.x) / proj.life;
      proj.vy = (this.p.y - e.y) / proj.life;
      this.telegraph(this.p.x, this.p.y, 1.3, proj.life);
    }
    this.projs.push(proj);
  }

  explode(x: number, y: number, r: number, dmg: number, safe = false): void {
    const s = this.stats, g = this.g;
    const R = r;
    const D = dmg * s.explDmg;
    this.env.audio.boom();
    this.shake = Math.max(this.shake, 0.3);
    this.fx.burst(x, y, '#ffcf6a', 22, 7, 3, 0, 0.6);
    this.fx.burst(x, y, '#5a524a', 12, 5, 3, 0, 0.8);
    this.fx.ring(x, y, R, '#ffb347');
    for (const e of this.enemiesIn(x, y, R)) this.damage(e, D, 'expl');
    if (!safe && !s.explSafe && Math.hypot(this.p.x - x, this.p.y - y) <= R + this.p.r) this.hurt(Math.round(D * 0.6), null, 'Взрыв!');
    const tierCap = this.stats.pickTier + 1;
    const chain: [number, number][] = [];
    for (let ty = Math.floor(y - R); ty <= Math.floor(y + R); ty++) for (let tx = Math.floor(x - R); tx <= Math.floor(x + R); tx++) {
      if (!g.inside(tx, ty) || Math.hypot(tx + 0.5 - x, ty + 0.5 - y) > R) continue;
      const i = g.i(tx, ty);
      const b = g.b[i];
      if (!BLOCKS[b].solid || BLOCKS[b].hp === Infinity || g.tier(i) > tierCap) continue;
      if (b === B.TNT) { chain.push([tx, ty]); continue; }
      this.breakBlock(tx, ty, false, true);
      this.env.meta.stats.exploded++;
    }
    for (const [tx, ty] of chain) {
      if (this.g.get(tx, ty) !== B.TNT) continue;
      this.g.set(tx, ty, B.FLOOR);
      this.bombs.push({ x: tx + 0.5, y: ty + 0.5, t: 0.15, r: 1.8 * s.explRadius, dmg: 15, safe: false, enemy: false });
    }
    for (const t of this.torchList) if (Math.hypot(t.x - x, t.y - y) < 0.5) t.r = 0;
    this.torchList = this.torchList.filter((t) => t.r > 0);
    this.revealT = 0;
  }

  lightning(x: number, y: number, target: EnemyRef, dmg: number, jumps: number): void {
    const pts = [{ x, y }];
    const hit = new Set<EnemyRef>();
    let cur: EnemyRef | null = target;
    for (let k = 0; k <= jumps && cur; k++) {
      hit.add(cur);
      pts.push({ x: cur.x, y: cur.y });
      this.damage(cur, dmg, 'light');
      let next: Enemy | null = null, bd = 4;
      for (const e of this.enemies) {
        if (e.dead || hit.has(e)) continue;
        const d = Math.hypot(e.x - cur.x, e.y - cur.y);
        if (d < bd) { bd = d; next = e; }
      }
      cur = next;
    }
    this.bolts.push({ pts, t: 0.18 });
    this.env.audio.zap();
  }

  coins(n: number, x: number, y: number): void {
    this.dropCoins(x, y, n);
  }

  buff(id: string, dur: number, speed: number, attack: number): void {
    const b = this.buffs.find((q) => q.id === id);
    if (b) { b.t = dur; b.speed = speed; b.attack = attack; } else this.buffs.push({ id, t: dur, speed, attack });
  }

  bomb(x: number, y: number, fuse: number, r: number, dmg: number): void {
    this.bombs.push({ x, y, t: fuse, r: r * this.stats.explRadius, dmg, safe: true, enemy: false });
  }

  private throwBomb(x: number, y: number, r: number, dmg: number): void {
    // летит в точку, взрывается через 0.9 с
    let tx = x, ty = y;
    const steps = 10;
    for (let k = 1; k <= steps; k++) {
      const qx = this.p.x + (x - this.p.x) * (k / steps), qy = this.p.y + (y - this.p.y) * (k / steps);
      if (this.g.solid(Math.floor(qx), Math.floor(qy))) break;
      tx = qx; ty = qy;
    }
    this.bombs.push({ x: tx, y: ty, t: 0.9, r: r * this.stats.explRadius, dmg, safe: false, enemy: false });
  }

  ignite(e: EnemyRef, dps: number, dur: number): void {
    const en = e as Enemy;
    en.burnDps = Math.max(en.burnDps, dps);
    en.burnT = Math.max(en.burnT, dur);
  }

  slow(e: EnemyRef, k: number, dur: number): void {
    const en = e as Enemy;
    en.slowK = Math.max(en.slowK, k);
    en.slowT = Math.max(en.slowT, dur);
  }

  shield(n: number): void {
    this.shields += n;
  }

  summon(kind: 'bat' | 'golem', n: number): void {
    for (let k = 0; k < n; k++) this.minions.push({ kind, x: this.p.x, y: this.p.y, cd: 0, a: (k / n) * Math.PI * 2 });
  }

  turret(x: number, y: number, dur: number): void {
    const spot = this.g.open(Math.floor(x), Math.floor(y)) ? { x, y } : { x: this.p.x, y: this.p.y };
    this.turrets.push({ x: spot.x, y: spot.y, t: dur, cd: 0.5 });
  }

  torches(): { x: number; y: number; r: number }[] {
    return this.torchList;
  }

  text(x: number, y: number, s: string, color: string): void {
    this.fx.text(x, y, s, color);
  }

  // ---------------- способности, факелы ----------------

  useAbility(): void {
    const p = this.p, s = this.stats, hero = heroDef(this.env.run.hero);
    if (p.abilityT > 0) return;
    p.abilityT = hero.ability.cd * s.cdMult;
    this.env.audio.ability();
    switch (hero.ability.id) {
      case 'drill':
        p.dashT = 0.25;
        p.dashX = Math.cos(p.face);
        p.dashY = Math.sin(p.face);
        if (Math.abs(p.dashX) > Math.abs(p.dashY)) { p.dashX = Math.sign(p.dashX); p.dashY = 0; } else { p.dashY = Math.sign(p.dashY); p.dashX = 0; }
        break;
      case 'dynamite': {
        const t = this.nearest(p.x, p.y, 6);
        const tx = t ? t.x : p.x + Math.cos(p.face) * 3, ty = t ? t.y : p.y + Math.sin(p.face) * 3;
        this.throwBomb(tx, ty, 2, 14);
        break;
      }
      case 'whirl':
        p.swing = { a: 0, t: 0.3, arc: Math.PI * 2, r: 2.2 };
        this.fx.ring(p.x, p.y, 2.2, '#ffe9a0');
        for (const e of this.enemiesIn(p.x, p.y, 2.2)) {
          this.damage(e, s.swordDmg * 3 * s.dmgMult, 'ability');
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          e.kx += Math.cos(a) * 6;
          e.ky += Math.sin(a) * 6;
        }
        break;
      case 'pulse':
        this.scan(8, true);
        this.fx.ring(p.x, p.y, 8, '#9fe0ff');
        for (const e of this.enemiesIn(p.x, p.y, 8)) e.stunT = 2;
        break;
      case 'turret':
        this.turret(p.x, p.y, 14);
        break;
      case 'potion': {
        const t = this.nearest(p.x, p.y, 6);
        const x = t ? t.x : p.x + Math.cos(p.face) * 2.5, y = t ? t.y : p.y + Math.sin(p.face) * 2.5;
        this.clouds.push({ x, y, r: 1.8, t: 5, dps: 4 });
        break;
      }
    }
  }

  get abilityReady(): number {
    const hero = heroDef(this.env.run.hero);
    return 1 - this.p.abilityT / (hero.ability.cd * this.stats.cdMult);
  }

  placeTorch(): void {
    const run = this.env.run, p = this.p;
    const x = Math.floor(p.x) + 0.5, y = Math.floor(p.y) + 0.5;
    if (this.torchList.some((t) => Math.hypot(t.x - x, t.y - y) < 0.5)) return;
    this.torchCount++;
    const free = this.stats.freeTorchEvery > 0 && this.torchCount % this.stats.freeTorchEvery === 0;
    if (!free) {
      if ((run.bag.coal ?? 0) <= 0) {
        this.env.toast('Нет угля: 1 уголь = 1 факел', 'bad');
        return;
      }
      run.bag.coal -= 1;
    }
    this.torchList.push({ x, y, r: this.stats.torchLight });
    this.torchesPlaced++;
    this.env.meta.stats.torches++;
    this.env.audio.torch();
    this.revealAround(x, y, this.stats.torchLight);
    for (const [d, k] of this.items) d.onTorch?.(this, k, x, y);
  }

  private scan(r: number, terrain = false): void {
    const g = this.g, p = this.p;
    for (let y = Math.floor(p.y - r); y <= Math.floor(p.y + r); y++) for (let x = Math.floor(p.x - r); x <= Math.floor(p.x + r); x++) {
      if (!g.inside(x, y) || Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) > r) continue;
      const i = g.i(x, y);
      if (g.b[i] === B.ORE || g.b[i] === B.CHEST || g.b[i] === B.CRYSTAL) this.oreSeen[i] = 1;
      if (terrain) g.seen[i] = 1;
    }
  }

  // ---------------- видимость ----------------

  /** Видно откопанное и пещеры в радиусе света, плюс по одной клетке стены вокруг. */
  private reveal(): void {
    this.revealT = 0.25;
    this.vis.fill(0);
    this.revealAround(this.p.x, this.p.y, this.stats.light);
    for (const t of this.torchList) this.revealAround(t.x, t.y, t.r);
    const g = this.g;
    for (const pr of this.props) if (pr.kind === 'lamp' && g.seen[g.i(pr.x, pr.y)]) this.revealAround(pr.x + 0.5, pr.y + 0.5, 3.2);
    if (this.stats.oreSight > 0) {
      const r = this.stats.oreSight + 1;
      for (let y = Math.floor(this.p.y - r); y <= Math.floor(this.p.y + r); y++) for (let x = Math.floor(this.p.x - r); x <= Math.floor(this.p.x + r); x++) {
        if (!g.inside(x, y) || Math.hypot(x + 0.5 - this.p.x, y + 0.5 - this.p.y) > r) continue;
        const i = g.i(x, y);
        if (g.b[i] === B.ORE) this.oreSeen[i] = 1;
      }
    }
  }

  private revealAround(cx: number, cy: number, r: number): void {
    const g = this.g;
    const sx = Math.floor(cx), sy = Math.floor(cy);
    if (!g.inside(sx, sy)) return;
    const q = [g.i(sx, sy)];
    const seen = new Set<number>(q);
    while (q.length) {
      const i = q.pop()!;
      const x = i % g.w, y = (i - x) / g.w;
      g.seen[i] = 1;
      this.vis[i] = 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!g.inside(nx, ny)) continue;
        const j = g.i(nx, ny);
        if (g.solid(nx, ny)) {
          g.seen[j] = 1;
          this.vis[j] = 1;
          continue;
        }
        if (seen.has(j) || (dx && dy)) continue;
        if (Math.hypot(nx + 0.5 - cx, ny + 0.5 - cy) > r) continue;
        seen.add(j);
        q.push(j);
      }
    }
  }

  // ---------------- снаряды, бомбы, зоны ----------------

  private updateProjs(dt: number): void {
    const g = this.g, p = this.p;
    for (const pr of this.projs) {
      pr.life -= dt;
      if (pr.kind === 'ebomb') {
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        if (pr.life <= 0) {
          this.bombs.push({ x: pr.x, y: pr.y, t: 0.01, r: 1.3, dmg: pr.dmg, safe: false, enemy: true });
        }
        continue;
      }
      const steps = 2;
      for (let k = 0; k < steps && pr.life > 0; k++) {
        pr.x += (pr.vx * dt) / steps;
        pr.y += (pr.vy * dt) / steps;
        if (g.solid(Math.floor(pr.x), Math.floor(pr.y))) {
          pr.life = 0;
          this.fx.burst(pr.x, pr.y, pr.kind === 'efire' || pr.kind === 'fire' ? '#ff8a3d' : '#bdb2a6', 4, 2, 1.4);
          break;
        }
        if (pr.mine) {
          for (const e of this.enemies) {
            if (e.dead || pr.hit.has(e) || (e.under && e.def.ai === 'worm')) continue;
            if (Math.hypot(e.x - pr.x, e.y - pr.y) > e.r + pr.r) continue;
            pr.hit.add(e);
            this.damage(e, pr.dmg, 'proj');
            if (pr.kind === 'fire') this.ignite(e, 2, 2);
            if (pr.pierce > 0) { pr.pierce--; continue; }
            if (pr.bounce > 0) {
              pr.bounce--;
              let next: Enemy | null = null, bd = 5;
              for (const o of this.enemies) {
                if (o.dead || pr.hit.has(o)) continue;
                const d = Math.hypot(o.x - pr.x, o.y - pr.y);
                if (d < bd) { bd = d; next = o; }
              }
              if (next) {
                const sp = Math.hypot(pr.vx, pr.vy);
                const a = Math.atan2(next.y - pr.y, next.x - pr.x);
                pr.vx = Math.cos(a) * sp;
                pr.vy = Math.sin(a) * sp;
                pr.life = Math.max(pr.life, 0.6);
                continue;
              }
            }
            pr.life = 0;
            break;
          }
        } else if (Math.hypot(p.x - pr.x, p.y - pr.y) < p.r + pr.r) {
          pr.life = 0;
          this.hurt(pr.dmg, null, pr.kind === 'web' ? 'Паутина!' : '');
          if (pr.kind === 'web') p.slowT = 1.4;
        }
      }
    }
    this.projs = this.projs.filter((pr) => pr.life > 0);
  }

  private updateBombs(dt: number): void {
    const ready: Bomb[] = [];
    for (const b of this.bombs) {
      b.t -= dt;
      if (b.t <= 0) ready.push(b);
    }
    this.bombs = this.bombs.filter((b) => b.t > 0);
    for (const b of ready) {
      if (b.enemy) {
        this.fx.burst(b.x, b.y, '#ffcf6a', 16, 6, 2.5);
        this.fx.ring(b.x, b.y, b.r, '#ff8a3d');
        this.env.audio.boom();
        if (Math.hypot(this.p.x - b.x, this.p.y - b.y) <= b.r + this.p.r) this.hurt(b.dmg, null, 'Взрыв!');
      } else {
        this.explode(b.x, b.y, b.r, b.dmg, b.safe);
      }
    }
  }

  private updateZones(dt: number): void {
    for (const c of this.clouds) {
      c.t -= dt;
      for (const e of this.enemiesIn(c.x, c.y, c.r)) this.damage(e, c.dps * dt, 'dot');
      if (Math.random() < 0.3) this.fx.puff(c.x + this.rng.range(-c.r, c.r) * 0.7, c.y + this.rng.range(-c.r, c.r) * 0.7, 'rgba(140,220,90,0.5)');
    }
    this.clouds = this.clouds.filter((c) => c.t > 0);
    for (const f of this.fires) {
      f.t -= dt;
      if (Math.random() < 0.15) this.fx.flame(f.x - 0.5, f.y - 0.5);
      if (Math.hypot(this.p.x - f.x, this.p.y - f.y) < 0.6) this.hurt(4, null, 'Огонь!');
    }
    this.fires = this.fires.filter((f) => f.t > 0);
    for (const e of this.enemies) {
      if (e.burnT > 0) {
        e.burnT -= dt;
        this.damage(e, e.burnDps * dt, 'dot');
        if (Math.random() < 0.2) this.fx.flame(e.x - 0.5, e.y - 0.6);
      }
    }
  }

  private updateTurrets(dt: number): void {
    for (const t of this.turrets) {
      t.t -= dt;
      t.cd -= dt;
      if (t.cd > 0) continue;
      const e = this.nearest(t.x, t.y, 6);
      if (!e) continue;
      t.cd = 0.7;
      for (let k = 0; k <= this.stats.projBonus; k++) this.shoot(t.x, t.y, e, { dmg: 2 + this.stats.swordDmg * 0.5, kind: 'bolt', speed: 11 });
      this.env.audio.zap();
    }
    this.turrets = this.turrets.filter((t) => t.t > 0);
  }

  private updateMinions(dt: number): void {
    const p = this.p;
    for (const m of this.minions) {
      m.cd -= dt;
      if (m.kind === 'bat') {
        m.a += dt * 3;
        m.x = p.x + Math.cos(m.a) * 1.2;
        m.y = p.y + Math.sin(m.a) * 1.2;
        if (m.cd <= 0) {
          const e = this.nearest(m.x, m.y, 1.6);
          if (e) { m.cd = 0.8; this.damage(e, 3, 'summon'); this.fx.burst(e.x, e.y, '#c9b8ff', 4, 2, 1.2); }
        }
      } else {
        const e = this.nearest(m.x, m.y, 5);
        const tx = e ? e.x : p.x - 0.8, ty = e ? e.y : p.y - 0.8;
        const d = Math.hypot(tx - m.x, ty - m.y);
        if (d > 0.9) {
          const b = { x: m.x, y: m.y, r: 0.35 };
          moveBody(b, ((tx - m.x) / d) * 2.6 * dt, ((ty - m.y) / d) * 2.6 * dt, this.solidFor);
          m.x = b.x; m.y = b.y;
        }
        if (Math.hypot(p.x - m.x, p.y - m.y) > 7) { m.x = p.x; m.y = p.y; }
        if (e && m.cd <= 0 && Math.hypot(e.x - m.x, e.y - m.y) < 1.3) {
          m.cd = 1;
          this.damage(e, 6 + this.stats.swordDmg * 0.5, 'summon');
          this.shake = Math.max(this.shake, 0.08);
        }
      }
    }
  }

  // ---------------- подбор ----------------

  dropCoins(x: number, y: number, n: number): void {
    const total = Math.round(n * this.stats.coinMult);
    const parts = Math.min(8, total);
    for (let k = 0; k < parts; k++) {
      const v = Math.floor(total / parts) + (k < total % parts ? 1 : 0);
      const a = this.rng.range(0, Math.PI * 2);
      this.pickups.push({ x, y, vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5, kind: 'coin', value: v, item: '', t: 0 });
    }
  }

  dropItem(x: number, y: number, id: string): void {
    this.pickups.push({ x, y, vx: 0, vy: 0, kind: 'item', value: 0, item: id, t: 0 });
  }

  private updatePickups(dt: number): void {
    const p = this.p, run = this.env.run;
    for (const k of this.pickups) {
      k.t += dt;
      k.vx *= 0.9;
      k.vy *= 0.9;
      const d = Math.hypot(p.x - k.x, p.y - k.y);
      if (k.kind === 'coin' && d < this.stats.magnet && k.t > 0.3) {
        const sp = 8 + 6 / Math.max(0.3, d);
        k.vx = ((p.x - k.x) / d) * sp;
        k.vy = ((p.y - k.y) / d) * sp;
      }
      const b = { x: k.x, y: k.y, r: 0.12 };
      moveBody(b, k.vx * dt, k.vy * dt, this.solidFor);
      k.x = b.x;
      k.y = b.y;
      if (d < 0.45 && k.t > 0.25) {
        if (k.kind === 'coin') {
          run.coins += k.value;
          run.haul += k.value;
          this.env.audio.coin();
        } else if (k.kind === 'heart') {
          this.heal(k.value * this.stats.healMult);
          this.env.audio.pickup();
        } else {
          this.takeItem(k.item);
        }
        k.value = -1;
      }
    }
    this.pickups = this.pickups.filter((k) => k.value >= 0);
  }

  takeItem(id: string): void {
    const run = this.env.run;
    run.items[id] = (run.items[id] ?? 0) + 1;
    if (id === 'crystalheart') run.extraLives++;
    const before = this.stats.maxHp;
    this.refreshStats();
    if (this.stats.maxHp > before) run.hp += this.stats.maxHp - before;
    clampHp(run, this.stats);
    const d = itemDef(id);
    if (d.onFloor) d.onFloor(this, 1);
    this.env.audio.fanfare();
    this.fx.sparkle(this.p.x, this.p.y, '#ffe36b', 18);
    this.env.itemFound(id);
  }

  // ---------------- комнаты, волны, босс ----------------

  private updateProps(): void {
    const p = this.p, run = this.env.run;
    for (const pr of this.props) {
      if (pr.kind === 'lamp' || pr.kind === 'trial') continue;
      const d = Math.hypot(p.x - (pr.x + 0.5), p.y - (pr.y + 0.5));
      if (d > 1.4) { pr.away = true; continue; }
      if (d > 0.9 || !pr.away) continue;
      pr.away = false;
      if (pr.kind === 'mushroom' && !pr.used) {
        pr.used = true;
        this.heal(10 * this.stats.healMult);
        this.env.audio.pickup();
      } else if (pr.kind === 'spring') {
        if (pr.used) { this.env.toast('Родник пересох', 'info'); continue; }
        pr.used = true;
        this.heal(this.stats.maxHp);
        this.env.toast('Родник: здоровье восстановлено', 'good');
        this.fx.sparkle(pr.x + 0.5, pr.y + 0.5, '#8fd6ff', 20);
      } else if (pr.kind === 'merchant' || pr.kind === 'shrine' || pr.kind === 'anvil') {
        if (pr.used && pr.kind === 'shrine') { this.env.toast('Алтарь молчит', 'info'); continue; }
        this.env.openProp(pr.kind, pr);
      }
      void run;
    }
  }

  private updateWaves(dt: number): void {
    if (this.layout.arena || this.trial) return;
    this.waveT -= dt;
    if (this.waveT <= 2.5 && !this.waveWarned) {
      this.waveWarned = true;
      this.env.toast('Из темноты что-то лезет...', 'bad');
      this.env.audio.rumble();
    }
    if (this.waveT > 0) return;
    this.waveT = WAVE_EVERY;
    this.waveWarned = false;
    this.waveN++;
    const n = 2 + this.waveN + (this.layer.id - 1) + this.index;
    this.spawnWave(n, 7, 12);
  }

  private spawnWave(n: number, rmin: number, rmax: number): void {
    const g = this.g, p = this.p;
    const cells: number[] = [];
    for (let i = 0; i < g.b.length; i++) {
      if (this.flow[i] === FAR || g.room[i]) continue;
      const x = i % g.w, y = (i - x) / g.w;
      const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
      if (d >= rmin && d <= rmax && !this.vis[i]) cells.push(i);
    }
    for (let k = 0; k < n; k++) {
      let id = this.rng.weighted(this.layer.enemies, (x) => x[1])[0];
      if (cells.length) {
        const i = this.rng.pick(cells);
        const e = this.spawn(id, (i % g.w) + 0.5, Math.floor(i / g.w) + 0.5, { elite: this.rng.chance(0.05 * this.waveN) });
        e.sleep = false;
      } else {
        // некуда выйти: прогрызают породу
        id = this.layer.id === 1 ? 'beetle' : id;
        const a = this.rng.range(0, Math.PI * 2);
        const x = Math.max(1.5, Math.min(g.w - 1.5, p.x + Math.cos(a) * 6)), y = Math.max(1.5, Math.min(g.h - 1.5, p.y + Math.sin(a) * 6));
        const cx = Math.floor(x), cy = Math.floor(y);
        if (g.solid(cx, cy)) {
          const d = BLOCKS[g.get(cx, cy)];
          if (enemyDef(id).ai !== 'burrow' || !d.rock || d.tier > 0) continue;
          g.set(cx, cy, B.FLOOR);
          g.dug[g.i(cx, cy)] = 1;
          this.terrain();
        }
        const e = this.spawn(id, x, y);
        e.sleep = false;
        e.spawnT = 0.5;
      }
    }
  }

  private updateTrial(): void {
    const p = this.p, g = this.g;
    const cell = g.i(Math.floor(p.x), Math.floor(p.y));
    const roomId = g.room[cell];
    if (!this.trial && roomId) {
      const room = this.layout.rooms[roomId - 1];
      const prop = this.props.find((q) => q.kind === 'trial' && q.room === roomId);
      if (room?.kind === 'trial' && prop && !prop.used) {
        prop.used = true;
        const sealed: number[] = [];
        for (let y = room.y0 - 1; y <= room.y1 + 1; y++) for (let x = room.x0 - 1; x <= room.x1 + 1; x++) {
          const inner = x >= room.x0 && x <= room.x1 && y >= room.y0 && y <= room.y1;
          if (!inner && g.open(x, y)) { g.b[g.i(x, y)] = B.DOOR; sealed.push(g.i(x, y)); }
        }
        this.trial = { room, wave: 0, sealed };
        this.env.toast('Испытание: продержись 3 волны!', 'bad');
        this.env.audio.rumble();
      }
      for (const e of this.enemies) if (e.room === roomId && e.sleep) e.sleep = false;
    }
    if (!this.trial) return;
    const t = this.trial;
    const alive = this.enemies.some((e) => e.room === t.room.id && !e.dead);
    if (alive) return;
    if (t.wave < 3) {
      t.wave++;
      const n = 2 + t.wave + (this.layer.id - 1);
      for (let k = 0; k < n; k++) {
        const x = this.rng.int(t.room.x0, t.room.x1) + 0.5, y = this.rng.int(t.room.y0, t.room.y1) + 0.5;
        if (Math.hypot(x - p.x, y - p.y) < 1.5) continue;
        const e = this.spawn(this.rng.weighted(this.layer.enemies, (q) => q[1])[0], x, y, { room: t.room.id, elite: t.wave === 3 && k === 0 });
        e.sleep = false;
        e.spawnT = 0.6;
      }
      this.env.toast(`Волна ${t.wave} из 3`, 'info');
      return;
    }
    for (const i of t.sealed) if (g.b[i] === B.DOOR) g.b[i] = B.FLOOR;
    // сундук в центре комнаты, но не под гномом
    let cx = t.room.cx, cy = t.room.cy;
    if (Math.floor(p.x) === cx && Math.floor(p.y) === cy) cx += cx > t.room.x0 ? -1 : 1;
    g.set(cx, cy, B.CHEST);
    g.ore[g.i(cx, cy)] = 2;
    this.env.toast('Испытание пройдено! Сундук ждёт', 'good');
    this.env.audio.fanfare();
    this.trial = null;
    this.flowT = 0;
  }

  private updateBossTrigger(): void {
    const a = this.layout.arena;
    if (!a || this.bossStarted || !this.layout.boss) return;
    if (this.p.y < a.y0 + 1.5) return;
    this.bossStarted = true;
    // закрыть вход на арену
    for (let y = a.y0 - 3; y < a.y0; y++) for (let x = a.x0; x <= a.x1; x++) if (this.g.open(x, y)) { this.g.b[this.g.i(x, y)] = B.DOOR; }
    const cx = (a.x0 + a.x1) / 2 + 0.5, cy = (a.y0 + a.y1) / 2 + 2;
    // жаровни по краю арены: босса должно быть видно
    for (let k = 0; k < 8; k++) {
      const an = (k / 8) * Math.PI * 2;
      const tx = Math.floor(cx + Math.cos(an) * ((a.x1 - a.x0) / 2 - 1.5)), ty = Math.floor((a.y0 + a.y1) / 2 + Math.sin(an) * ((a.y1 - a.y0) / 2 - 1.5));
      if (this.g.open(tx, ty)) this.torchList.push({ x: tx + 0.5, y: ty + 0.5, r: 5.5 });
    }
    this.revealT = 0;
    this.boss = this.spawn(this.layout.boss, cx, cy);
    this.boss.sleep = false;
    this.boss.spawnT = 1;
    this.shake = 0.6;
    this.env.audio.rumble();
    this.env.toast(`${this.boss.def.name}! ${this.boss.def.desc ?? ''}`, 'bad');
  }

  private checkExit(): void {
    const ex = this.layout.exit;
    if (Math.floor(this.p.x) === ex.x && Math.floor(this.p.y) === ex.y && !this.done) {
      if (this.boss) return;
      this.done = true;
      this.env.complete();
    }
  }

  private separate(): void {
    const es = this.enemies;
    for (let a = 0; a < es.length; a++) {
      const e = es[a];
      if (e.under) continue;
      for (let b = a + 1; b < es.length; b++) {
        const o = es[b];
        if (o.under) continue;
        const dx = o.x - e.x, dy = o.y - e.y;
        const d = Math.hypot(dx, dy), min = e.r + o.r;
        if (d > 0 && d < min) {
          const push = (min - d) * 0.5;
          const ex = { x: e.x, y: e.y, r: e.r }, ox = { x: o.x, y: o.y, r: o.r };
          moveBody(ex, (-dx / d) * push, (-dy / d) * push, this.solidFor);
          moveBody(ox, (dx / d) * push, (dy / d) * push, this.solidFor);
          e.x = ex.x; e.y = ex.y; o.x = ox.x; o.y = ox.y;
        }
      }
    }
  }

  get roomNames(): string[] {
    return this.layout.rooms.map((r) => ROOM_INFO[r.kind].name);
  }
}

export const ROCK_COLOR: Record<number, string> = {
  [B.DIRT]: '#7a5236', [B.CLAY]: '#b0603a', [B.STONE]: '#8a8a88', [B.GRANITE]: '#b48c8c', [B.BASALT]: '#4a5262',
  [B.OBSIDIAN]: '#3a2a4a', [B.CHEST]: '#a8763a', [B.CRATE]: '#b48a52', [B.TNT]: '#c0392b', [B.CRYSTAL]: '#cdb8ff',
  [B.CRACKED]: '#8a7a6a',
};

export const ENEMY_COLOR: Record<string, string> = {
  slime: '#6fcf5a', slimeling: '#8fe07a', queen: '#5ab84a', beetle: '#8a5a3a', bat: '#7a5a8a', worm: '#c98a6a',
  spider: '#5a4a5a', spiderling: '#6a5a6a', mother: '#4a3a4a', kobold: '#b07a4a', crab: '#8a7a6a', golem: '#8a8a8a',
  firebeetle: '#ff7a3a', wisp: '#ffb347', goblin: '#6aa04a', baron: '#4a3a3a', salamander: '#ff5a2a',
};
