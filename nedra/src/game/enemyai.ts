// ИИ врагов: сон и пробуждение, погоня по полю путей, землерои, мыши, стрелки, подрывники, мини-боссы и боссы.
import { B, BLOCKS } from '../core/blocks';
import type { Grid } from '../core/grid';
import type { AI, AttackSpec, Phase, ShotKind } from '../data/enemies';
import { dmgScale } from '../data/layers';
import type { EProjKind, Enemy, Floor } from './floor';
import { FAR, flowStep, lineOfSight, moveBody, type MoveResult } from './physics';

const TAU = Math.PI * 2;
const WAKE_R = 3.6;

type Brain = (f: Floor, e: Enemy, dt: number, dist: number) => void;

export function updateEnemy(f: Floor, e: Enemy, dt: number): void {
  e.t += dt;
  e.flash = Math.max(0, e.flash - dt);
  e.touchT = Math.max(0, e.touchT - dt);
  if (e.spawnT > 0) {
    e.spawnT -= dt;
    return;
  }
  if (e.def.steady) e.kx = e.ky = 0;
  knockback(f, e, dt);
  if (e.slowT > 0) e.slowT -= dt;
  else e.slowK = 0;
  if (e.invuln > 0 && e.state !== 'shift') e.invuln = Math.max(0, e.invuln - dt);
  if (e.stunT > 0) {
    e.stunT -= dt * (e.boss ? 2 : 1);
    e.vx = e.vy = 0;
    return;
  }
  const p = f.p;
  const dist = Math.hypot(p.x - e.x, p.y - e.y);
  if (e.sleep) {
    if (dist > WAKE_R || !lineOfSight(f.g, e.x, e.y, p.x, p.y)) return;
    wake(f, e);
  }
  e.cd -= dt;
  e.cd2 -= dt;
  if ((e.boss || e.mini) && e.def.ai !== 'pattern' && !e.enraged && e.hp < e.max * 0.5) enrage(f, e);
  BRAINS[e.def.ai](f, e, dt, dist);
}

// ---------------- общее ----------------

function wake(f: Floor, e: Enemy): void {
  e.sleep = false;
  e.cd = Math.max(e.cd, 0.6);
  f.fx.text(e.x, e.y - e.r - 0.3, '!', '#ffdf6b');
  for (const o of f.enemies) {
    if (o.sleep && !o.mini && !o.boss && Math.hypot(o.x - e.x, o.y - e.y) < 3) o.sleep = false;
  }
}

function enrage(f: Floor, e: Enemy): void {
  e.enraged = true;
  f.say(`${e.def.name} в ярости!`, 'bad');
  f.shake = Math.max(f.shake, 0.3);
  f.fx.ring(e.x, e.y, 2.2, '#ff5a3a');
  f.audio.roar();
}

function knockback(f: Floor, e: Enemy, dt: number): void {
  if (!e.kx && !e.ky) return;
  if (!e.under) moveBody(e, e.kx * dt, e.ky * dt, f.solidFor);
  const k = Math.exp(-9 * dt);
  e.kx *= k;
  e.ky *= k;
  if (Math.abs(e.kx) + Math.abs(e.ky) < 0.05) e.kx = e.ky = 0;
}

function speedOf(e: Enemy): number {
  return e.def.speed * (1 - e.slowK) * (e.enraged ? 1.3 : 1) * (e.elite ? 1.1 : 1);
}

/** Урон врага с учётом этажа, пласта (Изнанки), элиты и ярости. */
function dmgOf(f: Floor, e: Enemy, base = e.def.dmg): number {
  return Math.max(1, Math.round(base * (1 + 0.1 * f.index) * dmgScale(f.layer, e.def.layer) * (e.elite ? 1.3 : 1) * (e.enraged ? 1.15 : 1) * (e.small ? 0.6 : 1)));
}

function step(f: Floor, e: Enemy, ux: number, uy: number, sp: number, dt: number): MoveResult {
  e.vx = ux * sp;
  e.vy = uy * sp;
  return moveBody(e, ux * sp * dt, uy * sp * dt, f.solidFor);
}

function moveTo(f: Floor, e: Enemy, tx: number, ty: number, sp: number, dt: number): MoveResult | null {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d < 0.02) {
    e.vx = e.vy = 0;
    return null;
  }
  const v = Math.min(sp, d / dt);
  return step(f, e, dx / d, dy / d, v, dt);
}

/** Свободен ли коридор шириной в тело врага. */
function clearPath(g: Grid, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  if (!lineOfSight(g, x0, y0, x1, y1)) return false;
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
  const nx = (-dy / d) * r * 0.9, ny = (dx / d) * r * 0.9;
  return lineOfSight(g, x0 + nx, y0 + ny, x1 + nx, y1 + ny) && lineOfSight(g, x0 - nx, y0 - ny, x1 - nx, y1 - ny);
}

/** Направление к игроку: напрямую, если коридор свободен, иначе по полю путей. */
function pathDir(f: Floor, e: Enemy): { x: number; y: number } | null {
  const p = f.p;
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
  if (d < 0.05) return { x: 0, y: 0 };
  if (d < 8 && clearPath(f.g, e.x, e.y, p.x, p.y, e.r)) return { x: dx / d, y: dy / d };
  const s = flowStep(f.g, f.flow, e.x, e.y);
  if (!s) return null;
  const sx = s.x - e.x, sy = s.y - e.y, sd = Math.hypot(sx, sy) || 1;
  return { x: sx / sd, y: sy / sd };
}

function follow(f: Floor, e: Enemy, sp: number, dt: number): boolean {
  const d = pathDir(f, e);
  if (!d) {
    wander(f, e, sp * 0.5, dt);
    return false;
  }
  step(f, e, d.x, d.y, sp, dt);
  return true;
}

function wander(f: Floor, e: Enemy, sp: number, dt: number): void {
  e.st -= dt;
  if (e.st <= 0 || Math.hypot(e.tx - e.x, e.ty - e.y) < 0.1) {
    e.st = 1 + f.rng.next() * 1.5;
    const cx = Math.floor(e.x), cy = Math.floor(e.y);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => f.g.open(cx + dx, cy + dy));
    const [dx, dy] = dirs.length ? f.rng.pick(dirs) : [0, 0];
    e.tx = cx + dx + 0.5;
    e.ty = cy + dy + 0.5;
  }
  moveTo(f, e, e.tx, e.ty, sp, dt);
}

/** Держит дистанцию: подходит, отступает или кружит вокруг гнома. */
function kite(f: Floor, e: Enemy, dt: number, dist: number, want: number): void {
  const p = f.p, sp = speedOf(e);
  if (dist > want + 0.8 || !lineOfSight(f.g, e.x, e.y, p.x, p.y)) {
    follow(f, e, sp, dt);
    return;
  }
  const ux = (e.x - p.x) / (dist || 1), uy = (e.y - p.y) / (dist || 1);
  if (dist < want - 0.8) {
    const r = step(f, e, ux, uy, sp * 0.85, dt);
    if (!r.hitX && !r.hitY) return;
  }
  if (Math.floor(e.t / 2.5) % 2) e.side = -e.side || 1;
  step(f, e, -uy * e.side, ux * e.side, sp * 0.5, dt);
}

function touch(f: Floor, e: Enemy, x: number, y: number, r: number, dmg: number): void {
  if (e.touchT > 0 || e.under) return;
  const p = f.p;
  if (Math.hypot(p.x - x, p.y - y) < r + p.r) {
    e.touchT = 0.6;
    f.hurt(dmg, e);
  }
}

/** Враг виден гному (не стреляет из полной темноты издалека). */
function canShoot(f: Floor, e: Enemy, dist: number): boolean {
  const g = f.g, cx = Math.floor(e.x), cy = Math.floor(e.y);
  if (!g.inside(cx, cy)) return false;
  return (f.vis[g.i(cx, cy)] === 1 || dist < 3) && lineOfSight(g, e.x, e.y, f.p.x, f.p.y);
}

const SHOT: Record<ShotKind, EProjKind> = {
  web: 'web', rock: 'rock', fire: 'efire', bomb: 'ebomb', orb: 'orb', ice: 'ice', spore: 'spore', holy: 'holy', glitch: 'glitch',
};

const SHOT_COLOR: Partial<Record<ShotKind, string>> = { holy: '#fff2b0', glitch: '#ff5ab0', ice: '#bff4ff', spore: '#9dff7a', fire: '#ff8a3d' };

function spread(f: Floor, e: Enemy, kind: EProjKind, dmg: number, speed: number, n: number, gap: number, color?: string, home = 0): void {
  const base = Math.atan2(f.p.y - e.y, f.p.x - e.x);
  for (let k = 0; k < n; k++) f.enemyShot(e, kind, dmg, speed, base + (k - (n - 1) / 2) * gap, { color, home });
}

function radial(f: Floor, e: Enemy, kind: EProjKind, dmg: number, speed: number, n: number, color?: string, off = f.rng.next() * TAU): void {
  for (let k = 0; k < n; k++) f.enemyShot(e, kind, dmg, speed, off + (k / n) * TAU, { color });
}

function spawnKids(f: Floor, e: Enemy, id: string, n: number, cap: number): void {
  const alive = f.enemies.filter((o) => o.id === id && !o.dead).length;
  for (let k = 0; k < Math.min(n, cap - alive); k++) {
    const a = f.rng.range(0, TAU);
    const x = e.x + Math.cos(a) * (e.r + 0.3), y = e.y + Math.sin(a) * (e.r + 0.3);
    if (f.g.solid(Math.floor(x), Math.floor(y))) continue;
    const c = f.spawn(id, x, y, { room: e.room });
    c.spawnT = 0.35;
  }
}

function diggable(g: Grid, x: number, y: number, tier = 0): boolean {
  if (!g.inside(x, y)) return false;
  const i = g.i(x, y);
  const d = BLOCKS[g.b[i]];
  return d.solid && d.rock && g.b[i] !== B.ORE && d.tier <= tier && d.hp < Infinity;
}

// ---------------- обычные враги ----------------

function chase(f: Floor, e: Enemy, dt: number): void {
  let sp = speedOf(e);
  if (e.id.startsWith('slime')) sp *= 0.35 + 1.3 * Math.max(0, Math.sin(e.t * 5.5));
  follow(f, e, sp, dt);
  touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
}

/** Жук-землерой: идёт по пещерам, а если путь длинный - прогрызает мягкую породу. */
function burrow(f: Floor, e: Enemy, dt: number, dist: number): void {
  const g = f.g, sp = speedOf(e);
  const cx = Math.floor(e.x), cy = Math.floor(e.y);
  const fd = g.inside(cx, cy) ? f.flow[g.i(cx, cy)] : FAR;
  if (fd !== FAR && fd <= dist * 1.6 + 4) {
    e.state = 'walk';
    follow(f, e, sp, dt);
  } else {
    dig(f, e, sp, dt);
  }
  touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
}

function dig(f: Floor, e: Enemy, sp: number, dt: number): void {
  const g = f.g, p = f.p;
  const cx = Math.floor(e.x), cy = Math.floor(e.y);
  const dx = p.x - e.x, dy = p.y - e.y;
  const order: [number, number][] = Math.abs(dx) > Math.abs(dy)
    ? [[Math.sign(dx), 0], [0, Math.sign(dy) || 1]]
    : [[0, Math.sign(dy)], [Math.sign(dx) || 1, 0]];
  for (const [ox, oy] of order) {
    if (!ox && !oy) continue;
    const nx = cx + ox, ny = cy + oy;
    if (g.open(nx, ny)) {
      e.digT = 0;
      moveTo(f, e, nx + 0.5, ny + 0.5, sp, dt);
      return;
    }
    if (!diggable(g, nx, ny, e.def.digTier ?? 0)) continue;
    e.state = 'dig';
    moveTo(f, e, cx + 0.5 + ox * 0.15, cy + 0.5 + oy * 0.15, sp, dt);
    e.digT += dt;
    if (f.rng.chance(dt * 10)) f.fx.burst(cx + 0.5 + ox * 0.5, cy + 0.5 + oy * 0.5, f.blockColor(g.i(nx, ny)), 1, 2, 1.3, 0, 0.3);
    if (e.digT >= 0.55) {
      e.digT = 0;
      g.set(nx, ny, B.FLOOR);
      g.dug[g.i(nx, ny)] = 1;
      f.terrain();
    }
    return;
  }
  wander(f, e, sp * 0.5, dt);
}

/** Мышь: порхает к гному и пикирует. */
function bat(f: Floor, e: Enemy, dt: number, dist: number): void {
  const p = f.p, sp = speedOf(e);
  if (e.state === 'swoop') {
    e.st -= dt;
    const r = step(f, e, e.tx, e.ty, sp * 2.3, dt);
    touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
    if (e.st <= 0 || r.hitX || r.hitY) {
      e.state = 'back';
      e.st = 0.6;
    }
    return;
  }
  if (e.state === 'back') {
    e.st -= dt;
    step(f, e, -e.tx, -e.ty, sp * 0.8, dt);
    if (e.st <= 0) e.state = 'fly';
    return;
  }
  const d = pathDir(f, e);
  if (!d) {
    wander(f, e, sp * 0.5, dt);
    return;
  }
  const w = Math.sin(e.t * 7) * 0.9;
  const ux = d.x - d.y * w, uy = d.y + d.x * w, n = Math.hypot(ux, uy) || 1;
  step(f, e, ux / n, uy / n, sp * (dist < 2.2 ? 0.45 : 1), dt);
  if (dist < 2.6 && e.cd <= 0 && lineOfSight(f.g, e.x, e.y, p.x, p.y)) {
    e.state = 'swoop';
    e.st = 0.4;
    e.tx = (p.x - e.x) / dist;
    e.ty = (p.y - e.y) / dist;
    e.cd = 1.6 + f.rng.next() * 0.6;
  }
  touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
}

/** Стрелок: держит дистанцию, целится и стреляет (паутина, камни, огонь). */
function ranged(f: Floor, e: Enemy, dt: number, dist: number): void {
  const r = e.def.ranged!;
  if (e.state === 'aim') {
    e.vx = e.vy = 0;
    e.st -= dt;
    if (e.st <= 0) {
      e.state = 'move';
      e.cd = r.cd * (0.8 + 0.4 * f.rng.next());
      const n = (r.burst ?? 1) + (e.elite ? 2 : 0);
      spread(f, e, SHOT[r.kind], dmgOf(f, e, r.dmg), r.speed, n, 0.22, e.def.color ?? SHOT_COLOR[r.kind], r.home ?? 0);
    }
    return;
  }
  kite(f, e, dt, dist, r.range * 0.7);
  if (e.cd <= 0 && dist <= r.range && canShoot(f, e, dist)) {
    e.state = 'aim';
    e.st = 0.4;
  }
  touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
}

/** Гоблин-подрывник: бросает бомбы навесом и убегает. */
function bomber(f: Floor, e: Enemy, dt: number, dist: number): void {
  const r = e.def.ranged!, p = f.p;
  if (e.state === 'flee') {
    e.st -= dt;
    const ux = (e.x - p.x) / (dist || 1), uy = (e.y - p.y) / (dist || 1);
    const res = step(f, e, ux, uy, speedOf(e) * 1.1, dt);
    if (res.hitX || res.hitY) wander(f, e, speedOf(e), dt);
    if (e.st <= 0) e.state = 'move';
    return;
  }
  kite(f, e, dt, dist, 3.5);
  if (e.cd <= 0 && dist <= r.range && canShoot(f, e, dist)) {
    f.enemyShot(e, 'ebomb', dmgOf(f, e, r.dmg), r.speed);
    e.cd = r.cd * (0.85 + 0.3 * f.rng.next());
    e.state = 'flee';
    e.st = 0.9;
  }
  touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
}

/** Огненный жук: подбегает, шипит и взрывается. Задевает и других врагов. */
function exploder(f: Floor, e: Enemy, dt: number, dist: number): void {
  const bl = e.def.blast!;
  if (e.fuse >= 0) {
    e.vx = e.vy = 0;
    e.fuse -= dt;
    if (f.rng.chance(dt * 20)) f.fx.flame(e.x - 0.5, e.y - 0.7);
    if (e.fuse <= 0) blast(f, e, bl.r, dmgOf(f, e, bl.dmg));
    return;
  }
  follow(f, e, speedOf(e), dt);
  if (dist < 1.15) {
    e.fuse = 0.7;
    f.telegraph(e.x, e.y, bl.r, 0.7, { follow: e });
    f.audio.sizzle();
  }
}

function blast(f: Floor, e: Enemy, r: number, dmg: number): void {
  e.dead = true;
  const p = f.p;
  f.fx.burst(e.x, e.y, '#ffcf6a', 18, 6, 2.6, 0, 0.5);
  f.fx.burst(e.x, e.y, '#ff6a2a', 10, 4, 2.2, 0, 0.6);
  f.fx.ring(e.x, e.y, r, '#ff8a3d');
  f.audio.boom();
  f.shake = Math.max(f.shake, 0.25);
  if (Math.hypot(p.x - e.x, p.y - e.y) <= r + p.r) f.hurt(dmg, null, 'Взрыв!');
  for (const o of f.enemiesIn(e.x, e.y, r)) if (o !== e) f.damage(o, dmg * 1.5, 'expl');
}

// ---------------- мини-боссы ----------------

/** Королева слизней: прыгает на гнома, при приземлении рождает слизнят. */
function queen(f: Floor, e: Enemy, dt: number, dist: number): void {
  const p = f.p;
  if (e.state === 'leap') {
    e.st -= dt;
    const k = Math.min(1, dt / Math.max(dt, e.st));
    moveBody(e, (e.tx - e.x) * k, (e.ty - e.y) * k, f.solidFor);
    if (e.st <= 0) {
      e.state = 'hop';
      f.shake = Math.max(f.shake, 0.3);
      f.audio.thud();
      f.fx.burst(e.x, e.y, '#6fcf5a', 16, 4, 2.4, 0, 0.5);
      if (Math.hypot(p.x - e.x, p.y - e.y) < 1.4 + p.r) f.hurt(dmgOf(f, e), e);
      spawnKids(f, e, 'slimeling', e.enraged ? 3 : 2, 8);
    }
    return;
  }
  const sp = speedOf(e) * (0.35 + 1.3 * Math.max(0, Math.sin(e.t * 4)));
  follow(f, e, sp, dt);
  if (e.cd <= 0 && dist < 6 && lineOfSight(f.g, e.x, e.y, p.x, p.y)) {
    e.state = 'leap';
    e.st = 0.8;
    e.tx = p.x;
    e.ty = p.y;
    f.telegraph(p.x, p.y, 1.4, 0.8);
    e.cd = e.enraged ? 2.4 : 3.6;
  }
  touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
}

/** Паучиха: веер паутины и паучата. */
function mother(f: Floor, e: Enemy, dt: number, dist: number): void {
  const r = e.def.ranged!;
  if (e.state === 'aim') {
    e.vx = e.vy = 0;
    e.st -= dt;
    if (e.st <= 0) {
      e.state = 'move';
      e.cd = r.cd;
      spread(f, e, 'web', dmgOf(f, e, r.dmg), r.speed, e.enraged ? 5 : 3, 0.28);
    }
    return;
  }
  kite(f, e, dt, dist, 3.5);
  if (e.cd <= 0 && dist <= r.range && canShoot(f, e, dist)) {
    e.state = 'aim';
    e.st = 0.45;
  }
  if (e.cd2 <= 0) {
    e.cd2 = e.enraged ? 4.5 : 6.5;
    spawnKids(f, e, 'spiderling', 2, 6);
  }
  touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
}

/** Угольный барон: кольцо огня вокруг себя, в ярости - огненные залпы и жуки. */
function baron(f: Floor, e: Enemy, dt: number, dist: number): void {
  if (e.state === 'ring') {
    e.vx = e.vy = 0;
    e.st -= dt;
    if (e.st <= 0) {
      e.state = 'walk';
      const n = 14, R = 2.3;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU, x = e.x + Math.cos(a) * R, y = e.y + Math.sin(a) * R;
        if (!f.g.solid(Math.floor(x), Math.floor(y))) f.zone(x, y, 0.6, 3.5, 'fire', dmgOf(f, e, e.def.dmg * 0.45));
      }
      f.audio.boom();
      if (e.enraged) radial(f, e, 'efire', dmgOf(f, e, 5), 5, 8);
    }
    return;
  }
  follow(f, e, speedOf(e), dt);
  if (e.cd <= 0 && dist < 5) {
    e.state = 'ring';
    e.st = 0.9;
    f.telegraph(e.x, e.y, 2.3, 0.9, { follow: e, ring: true });
    e.cd = e.enraged ? 3.5 : 5;
  }
  if (e.enraged && e.cd2 <= 0) {
    e.cd2 = 9;
    spawnKids(f, e, 'firebeetle', 2, 4);
  }
  touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
}

// ---------------- боссы ----------------

/** Великий червь: ползёт под землёй, вырывается из-под ног, на поверхности уязвим. */
function worm(f: Floor, e: Enemy, dt: number): void {
  const p = f.p, a = f.layout.arena;
  e.st -= dt;
  switch (e.state) {
    case 'under': {
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      const v = Math.min(d, 3.2 * (e.enraged ? 1.15 : 1) * (1 - e.slowK) * dt);
      e.x += (dx / d) * v;
      e.y += (dy / d) * v;
      if (a) {
        e.x = Math.max(a.x0 + 0.5, Math.min(a.x1 + 0.5, e.x));
        e.y = Math.max(a.y0 + 0.5, Math.min(a.y1 + 0.5, e.y));
      }
      e.vx = (dx / d) * 3;
      e.vy = (dy / d) * 3;
      if (f.rng.chance(dt * 16)) f.fx.dust(e.x - 0.5, e.y - 0.4, 1, 'rgba(170,125,90,0.8)');
      if (e.st <= 0 || d < 0.35) {
        e.state = 'tele';
        e.st = e.enraged ? 0.6 : 0.85;
        f.telegraph(e.x, e.y, 1.5, e.st);
        f.audio.rumble();
      }
      return;
    }
    case 'tele':
      e.vx = e.vy = 0;
      if (f.rng.chance(dt * 30)) f.fx.dust(e.x - 0.5 + f.rng.range(-0.6, 0.6), e.y - 0.4, 1, 'rgba(170,125,90,0.9)');
      if (e.st <= 0) emerge(f, e);
      return;
    case 'surface': {
      follow(f, e, speedOf(e), dt);
      const last = e.trail[0];
      if (!last || Math.hypot(last.x - e.x, last.y - e.y) > 0.38) {
        e.trail.unshift({ x: e.x, y: e.y });
        if (e.trail.length > 7) e.trail.pop();
      }
      touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
      for (const s of e.trail.slice(1)) touch(f, e, s.x, s.y, 0.36, dmgOf(f, e, e.def.dmg * 0.5));
      if ((e.enraged || f.layer.plus) && e.cd <= 0) {
        e.cd = f.layer.plus ? 1.2 : 1.6;
        spread(f, e, 'rock', dmgOf(f, e, 4), 6, 3 + 2 * Math.min(2, f.layer.plus), 0.3);
      }
      if (e.st <= 0) {
        e.state = 'dive';
        e.st = 0.5;
      }
      return;
    }
    case 'dive':
      e.vx = e.vy = 0;
      if (e.trail.length && f.rng.chance(dt * 20)) e.trail.pop();
      if (e.st <= 0) {
        e.state = 'under';
        e.under = true;
        e.trail = [];
        e.st = 1.5 + f.rng.next() * 1.2;
        f.fx.burst(e.x, e.y, '#9a7050', 12, 3, 2, 0, 0.5);
      }
      return;
    default:
      e.state = 'surface';
      e.st = 2;
  }
}

function emerge(f: Floor, e: Enemy): void {
  const g = f.g, p = f.p;
  e.under = false;
  e.state = 'surface';
  e.st = e.enraged ? 2.6 : 3.3;
  e.trail = [];
  for (let y = Math.floor(e.y - 1); y <= Math.floor(e.y + 1); y++) for (let x = Math.floor(e.x - 1); x <= Math.floor(e.x + 1); x++) {
    if (!g.inside(x, y) || Math.hypot(x + 0.5 - e.x, y + 0.5 - e.y) > 1.1) continue;
    const d = BLOCKS[g.b[g.i(x, y)]];
    if (d.solid && d.hp < Infinity && g.b[g.i(x, y)] !== B.ORE) g.set(x, y, B.FLOOR);
  }
  f.terrain();
  f.shake = Math.max(f.shake, 0.45);
  f.audio.boom();
  f.fx.burst(e.x, e.y, '#9a7050', 26, 6, 2.8, 0, 0.7);
  f.fx.ring(e.x, e.y, 1.5, '#d9a070');
  if (Math.hypot(p.x - e.x, p.y - e.y) < 1.5 + p.r) f.hurt(Math.round(dmgOf(f, e) * 1.2), e, 'Червь!');
  radial(f, e, 'rock', dmgOf(f, e, 3), 5.5, (e.enraged ? 8 : 4) + 4 * f.layer.plus);
  if (f.layer.plus) f.wave(e.x, e.y, 5, dmgOf(f, e), '#d9a070');
}

/** Каменный голем: удар по земле вблизи, валуны издалека. */
function golem(f: Floor, e: Enemy, dt: number, dist: number): void {
  const p = f.p, r = e.def.ranged!;
  const R = e.enraged ? 2.8 : 2.3;
  if (e.state === 'slam') {
    e.vx = e.vy = 0;
    e.st -= dt;
    if (e.st <= 0) {
      e.state = 'walk';
      e.cd = 1.6;
      f.shake = Math.max(f.shake, 0.5);
      f.audio.boom();
      f.fx.burst(e.x, e.y, '#9a948c', 24, 6, 3, 0, 0.6);
      f.fx.ring(e.x, e.y, R, '#d8d0c4');
      if (dist <= R + p.r) f.hurt(dmgOf(f, e), e, 'Удар голема!');
      if (e.enraged) radial(f, e, 'rock', dmgOf(f, e, 4), 5, 8);
      if (f.layer.plus) f.wave(e.x, e.y, 5.5, dmgOf(f, e, e.def.dmg * 0.8), '#d8d0c4');
    }
    return;
  }
  if (e.state === 'wind') {
    e.vx = e.vy = 0;
    e.st -= dt;
    if (e.st <= 0) {
      e.state = 'walk';
      e.cd2 = r.cd;
      spread(f, e, 'rock', dmgOf(f, e, r.dmg), r.speed, (e.enraged ? 3 : 1) + 2 * Math.min(2, f.layer.plus), 0.3);
    }
    return;
  }
  follow(f, e, speedOf(e), dt);
  touch(f, e, e.x, e.y, e.r, dmgOf(f, e, e.def.dmg * 0.6));
  if (dist < R - 0.2 && e.cd <= 0) {
    e.state = 'slam';
    e.st = e.enraged ? 0.7 : 0.95;
    f.telegraph(e.x, e.y, R, e.st, { follow: e });
  } else if (dist > 3 && e.cd2 <= 0 && lineOfSight(f.g, e.x, e.y, p.x, p.y)) {
    e.state = 'wind';
    e.st = 0.5;
  }
}

/** Саламандра: кружит и плюётся огнём, затем рывок по прямой с огненным следом. */
function salamander(f: Floor, e: Enemy, dt: number, dist: number): void {
  const p = f.p, r = e.def.ranged!;
  e.st -= dt;
  if (e.state === 'aim') {
    e.vx = e.vy = 0;
    if (e.st <= 0) {
      e.state = 'dash';
      e.st = 0.75;
      e.digT = 0;
      f.audio.swing();
    }
    return;
  }
  if (e.state === 'dash') {
    const sp = 10.5;
    const res = step(f, e, e.tx, e.ty, sp, dt);
    e.digT += sp * dt;
    if (e.digT >= 0.45) {
      e.digT = 0;
      f.zone(e.x, e.y, 0.6, e.enraged || f.layer.plus ? 4 : 2.6, 'fire', dmgOf(f, e, e.def.dmg * 0.4));
    }
    touch(f, e, e.x, e.y, e.r + 0.1, dmgOf(f, e));
    if (res.hitX || res.hitY || e.st <= 0) {
      e.state = 'rest';
      e.st = 0.8;
      if (f.layer.plus) for (let k = 0; k < 2 + f.layer.plus; k++) {
        f.strike(f.p.x + f.rng.range(-2, 2), f.p.y + f.rng.range(-2, 2), 1.1, 1, dmgOf(f, e), 'fire', false, 'fire');
      }
      if (res.hitX || res.hitY) {
        f.shake = Math.max(f.shake, 0.25);
        f.audio.thud();
      }
    }
    return;
  }
  if (e.state === 'rest') {
    e.vx = e.vy = 0;
    if (e.st <= 0) {
      e.state = 'run';
      e.st = 1.6 + f.rng.next() * 1.2;
    }
    return;
  }
  if (e.state !== 'run') {
    e.state = 'run';
    e.st = 1.5;
    e.side = 1;
  }
  // кружит вокруг гнома
  const ang = Math.atan2(e.y - p.y, e.x - p.x) + e.side * 1.4 * dt * 2;
  const res = moveTo(f, e, p.x + Math.cos(ang) * 3.6, p.y + Math.sin(ang) * 3.6, speedOf(e), dt);
  if (res && (res.hitX || res.hitY)) e.side = -e.side;
  if (e.cd2 <= 0 && canShoot(f, e, dist)) {
    e.cd2 = r.cd * (e.enraged ? 0.7 : 1);
    spread(f, e, 'efire', dmgOf(f, e, r.dmg), r.speed, (e.enraged ? 3 : 1) + 2 * Math.min(2, f.layer.plus), 0.3);
  }
  touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
  if (e.st <= 0 && lineOfSight(f.g, e.x, e.y, p.x, p.y)) {
    e.state = 'aim';
    e.st = e.enraged ? 0.5 : 0.7;
    e.tx = (p.x - e.x) / (dist || 1);
    e.ty = (p.y - e.y) / (dist || 1);
    for (let k = 1; k <= 10; k++) {
      const x = e.x + e.tx * k * 0.9, y = e.y + e.ty * k * 0.9;
      if (f.g.solid(Math.floor(x), Math.floor(y))) break;
      f.telegraph(x, y, 0.55, e.st);
    }
  }
}

// ---------------- новые обычные враги ----------------

/** Таран: целится, несётся по прямой, отдыхает. */
function charger(f: Floor, e: Enemy, dt: number, dist: number): void {
  const p = f.p;
  if (e.state === 'aim') {
    e.vx = e.vy = 0;
    e.st -= dt;
    if (e.st <= 0) { e.state = 'dash'; e.st = 0.5; f.audio.swing(); }
    return;
  }
  if (e.state === 'dash') {
    e.st -= dt;
    const res = step(f, e, e.tx, e.ty, 8.5 + e.def.speed, dt);
    touch(f, e, e.x, e.y, e.r + 0.1, dmgOf(f, e));
    if (res.hitX || res.hitY || e.st <= 0) {
      e.state = 'rest';
      e.st = 0.7;
      if (res.hitX || res.hitY) { f.shake = Math.max(f.shake, 0.15); f.fx.burst(e.x, e.y, '#bdb2a6', 6, 3, 1.6, 0, 0.4); }
    }
    return;
  }
  if (e.state === 'rest') {
    e.vx = e.vy = 0;
    e.st -= dt;
    if (e.st <= 0) e.state = 'move';
    return;
  }
  follow(f, e, speedOf(e), dt);
  touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
  if (e.cd <= 0 && dist < 5.5 && dist > 1.3 && lineOfSight(f.g, e.x, e.y, p.x, p.y)) {
    e.state = 'aim';
    e.st = 0.55;
    e.tx = (p.x - e.x) / dist;
    e.ty = (p.y - e.y) / dist;
    e.cd = 2.6 + f.rng.next();
    for (let k = 1; k <= 6; k++) {
      const x = e.x + e.tx * k * 0.85, y = e.y + e.ty * k * 0.85;
      if (f.g.solid(Math.floor(x), Math.floor(y))) break;
      f.telegraph(x, y, 0.4, e.st);
    }
  }
}

/** Призма: стоит и выпускает вращающийся веер снарядов. */
function turret(f: Floor, e: Enemy, dt: number, dist: number): void {
  const r = e.def.ranged!;
  e.vx = e.vy = 0;
  e.ang += dt * 0.9;
  if (e.cd <= 0 && dist <= r.range && canShoot(f, e, dist)) {
    e.cd = r.cd;
    radial(f, e, SHOT[r.kind], dmgOf(f, e, r.dmg), r.speed, r.burst ?? 4, e.def.color, e.ang);
  }
  touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
}

/** Бес и порождение пустоты: мерцают и возникают рядом с гномом. */
function phaser(f: Floor, e: Enemy, dt: number, dist: number): void {
  const p = f.p;
  if (e.state === 'out') {
    e.vx = e.vy = 0;
    e.ghost = Math.max(0, e.ghost - dt * 4);
    e.st -= dt;
    if (e.st <= 0) {
      const dest = freeAround(f, p.x, p.y, 2, 3.2);
      if (dest) { e.x = dest.x; e.y = dest.y; f.telegraph(dest.x, dest.y, 0.6, 0.35); }
      e.state = 'in';
      e.st = 0.35;
    }
    return;
  }
  if (e.state === 'in') {
    e.vx = e.vy = 0;
    e.ghost = Math.min(1, e.ghost + dt * 4);
    e.st -= dt;
    if (e.st <= 0) {
      e.state = 'move';
      e.ghost = 1;
      const r = e.def.ranged;
      if (r) spread(f, e, SHOT[r.kind], dmgOf(f, e, r.dmg), r.speed, r.burst ?? 1, 0.25, e.def.color ?? SHOT_COLOR[r.kind]);
      else e.cd = 0;
    }
    return;
  }
  const r = e.def.ranged;
  if (r) {
    kite(f, e, dt, dist, 3.5);
    if (e.cd <= 0 && dist <= r.range && canShoot(f, e, dist)) {
      e.cd = r.cd;
      spread(f, e, SHOT[r.kind], dmgOf(f, e, r.dmg), r.speed, r.burst ?? 1, 0.25, e.def.color ?? SHOT_COLOR[r.kind]);
    }
  } else follow(f, e, speedOf(e), dt);
  touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
  if (e.cd2 <= 0 && dist < 9 && dist > 1.5) {
    e.state = 'out';
    e.st = 0.3;
    e.cd2 = 3.2 + f.rng.next() * 1.5;
    f.audio.glitch();
  }
}

/** Дрон-охотник: кружит на расстоянии и стреляет. */
function orbiter(f: Floor, e: Enemy, dt: number, dist: number): void {
  const p = f.p, r = e.def.ranged!;
  if (dist > 7 || !lineOfSight(f.g, e.x, e.y, p.x, p.y)) {
    follow(f, e, speedOf(e), dt);
    return;
  }
  const ang = Math.atan2(e.y - p.y, e.x - p.x) + e.side * 1.1 * dt;
  const res = moveTo(f, e, p.x + Math.cos(ang) * 3.4, p.y + Math.sin(ang) * 3.4, speedOf(e), dt);
  if (res && (res.hitX || res.hitY)) e.side = -e.side;
  if (e.cd <= 0 && canShoot(f, e, dist)) {
    e.cd = r.cd * (0.8 + 0.4 * f.rng.next());
    f.enemyShot(e, SHOT[r.kind], dmgOf(f, e, r.dmg), r.speed, undefined, { color: e.def.color });
  }
  touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
}

/** Прыгунок: прыжок на метку. */
function leaper(f: Floor, e: Enemy, dt: number, dist: number): void {
  const p = f.p;
  if (e.state === 'leap') {
    e.st -= dt;
    const k = Math.min(1, dt / Math.max(dt, e.st));
    moveBody(e, (e.tx - e.x) * k, (e.ty - e.y) * k, f.solidFor);
    if (e.st <= 0) {
      e.state = 'move';
      f.fx.burst(e.x, e.y, '#9dff7a', 10, 3, 2, 0, 0.4);
      f.audio.thud();
      if (Math.hypot(p.x - e.x, p.y - e.y) < 1.1 + p.r) f.hurt(dmgOf(f, e), e);
    }
    return;
  }
  follow(f, e, speedOf(e) * 0.8, dt);
  touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
  if (e.cd <= 0 && dist < 5 && lineOfSight(f.g, e.x, e.y, p.x, p.y)) {
    e.state = 'leap';
    e.st = 0.7;
    e.tx = p.x;
    e.ty = p.y;
    f.telegraph(p.x, p.y, 1.1, 0.7);
    e.cd = 2.4 + f.rng.next();
  }
}

/** Отражение Богомирона: стреляет веером и рассыпается. */
function clone(f: Floor, e: Enemy, dt: number): void {
  e.vx = e.vy = 0;
  e.life -= dt;
  if (e.cd <= 0) {
    e.cd = 1.1;
    spread(f, e, 'glitch', dmgOf(f, e, e.def.dmg * 0.6), 5, 5, 0.22, '#ff5ab0');
    f.audio.glitch();
  }
  if (e.life <= 0) {
    e.dead = true;
    f.fx.burst(e.x, e.y, '#ff5ab0', 16, 4, 2, 0, 0.5);
  }
}

/** Свободная клетка на расстоянии от точки (для телепортов и отражений). */
function freeAround(f: Floor, x: number, y: number, rmin: number, rmax: number): { x: number; y: number } | null {
  const g = f.g;
  for (let k = 0; k < 30; k++) {
    const a = f.rng.range(0, TAU), r = f.rng.range(rmin, rmax);
    const nx = x + Math.cos(a) * r, ny = y + Math.sin(a) * r;
    const cx = Math.floor(nx), cy = Math.floor(ny);
    if (!g.open(cx, cy) || !g.open(cx + 1, cy) || !g.open(cx - 1, cy) || !g.open(cx, cy + 1) || !g.open(cx, cy - 1)) continue;
    const ar = f.layout.arena;
    if (ar && (cx < ar.x0 || cx > ar.x1 || cy < ar.y0 || cy > ar.y1)) continue;
    return { x: cx + 0.5, y: cy + 0.5 };
  }
  return null;
}

// ---------------- шаблонные боссы и мини-боссы ----------------

/** Урон снаряда шаблонной атаки (снарядов много, поэтому слабее касания) и урон по площади. */
const shotDmg = (f: Floor, e: Enemy, a: AttackSpec) => dmgOf(f, e, e.def.dmg * (a.dmg ?? 0.6));
const areaDmg = (f: Floor, e: Enemy, a: AttackSpec) => dmgOf(f, e, e.def.dmg * (a.dmg ?? 1));
const colorOf = (e: Enemy, a: AttackSpec) => (a.pk ? SHOT_COLOR[a.pk] : undefined) ?? e.def.color ?? '#ffcf6a';

function pattern(f: Floor, e: Enemy, dt: number, dist: number): void {
  const P = e.def.phases!;
  const plus = f.layer.plus;
  let ph = e.phase;
  while (ph + 1 < P.length && e.hp / e.max <= P[ph + 1].at) ph++;
  if (ph !== e.phase) {
    e.phase = ph;
    e.state = 'shift';
    e.st = e.boss ? 1.6 : 1;
    e.invuln = e.st;
    e.enraged = true;
    e.under = false;
    e.ghost = 1;
    f.beams = f.beams.filter((b) => b.owner !== e);
    f.phaseShift(e, P[ph].say);
    return;
  }
  const phase = P[e.phase];
  const tempo = (phase.tempo ?? 1) * (1 + 0.15 * plus);
  e.cd -= dt * (tempo - 1);
  switch (e.state) {
    case 'shift':
      e.vx = e.vy = 0;
      e.st -= dt;
      if (e.st <= 0) { e.state = 'move'; e.invuln = 0; }
      return;
    case 'wind':
      e.vx = e.vy = 0;
      e.st -= dt;
      if (e.atk?.a === 'teleport') e.ghost = Math.max(0, e.ghost - dt * 3);
      if (e.st <= 0) execute(f, e, tempo);
      return;
    case 'cast':
      e.vx = e.vy = 0;
      e.st -= dt;
      channel(f, e, dt);
      if (e.st <= 0) recover(f, e, tempo);
      return;
    case 'under':
      diveUnder(f, e, dt);
      return;
    case 'emerge':
      e.vx = e.vy = 0;
      e.st -= dt;
      if (e.st <= 0) diveEmerge(f, e, tempo);
      return;
    case 'dash': {
      e.st -= dt;
      const res = step(f, e, e.tx, e.ty, 10, dt);
      touch(f, e, e.x, e.y, e.r + 0.1, dmgOf(f, e));
      if (res.hitX || res.hitY || e.st <= 0) recover(f, e, tempo);
      return;
    }
    case 'recover':
      e.st -= dt;
      if (e.ghost < 1) e.ghost = Math.min(1, e.ghost + dt * 3);
      if (e.st <= 0) e.state = 'move';
      moveBoss(f, e, dt, dist, phase);
      return;
  }
  moveBoss(f, e, dt, dist, phase);
  touch(f, e, e.x, e.y, e.r, dmgOf(f, e));
  if (e.cd <= 0 && dist < 14) chooseAttack(f, e, phase, dist, plus);
}

function moveBoss(f: Floor, e: Enemy, dt: number, dist: number, phase: Phase): void {
  const p = f.p, sp = speedOf(e) * (phase.speed ?? 1);
  switch (phase.move) {
    case 'chase':
      follow(f, e, sp, dt);
      break;
    case 'hover': {
      const tx = e.hx + (p.x - e.hx) * 0.4, ty = e.hy + (p.y - e.hy) * 0.4;
      moveTo(f, e, tx, ty, sp * 0.8, dt);
      break;
    }
    case 'center':
      moveTo(f, e, e.hx, e.hy, Math.max(sp, 1), dt);
      break;
    case 'orbit': {
      if (dist > 7) { follow(f, e, sp, dt); break; }
      const ang = Math.atan2(e.y - p.y, e.x - p.x) + e.side * 0.9 * dt;
      const res = moveTo(f, e, p.x + Math.cos(ang) * 4, p.y + Math.sin(ang) * 4, sp, dt);
      if (res && (res.hitX || res.hitY)) e.side = -e.side;
      break;
    }
    default:
      e.vx = e.vy = 0;
  }
}

function chooseAttack(f: Floor, e: Enemy, phase: Phase, dist: number, plus: number): void {
  const opts = phase.attacks.filter((a) => (a.plus ?? 0) <= plus && attackFits(f, e, a, dist));
  if (!opts.length) { e.cd = 0.5; return; }
  const a = f.rng.weighted(opts, (x) => (x.w ?? 1) * (x === e.atk ? 0.35 : 1));
  e.atk = a;
  startAttack(f, e, a, plus);
}

function attackFits(f: Floor, e: Enemy, a: AttackSpec, dist: number): boolean {
  switch (a.a) {
    case 'slam': return dist < (a.r ?? 2.5) + 1.3;
    case 'dash': return dist > 2.5;
    case 'summon': return f.enemies.filter((o) => o.id === a.id && !o.dead).length < (a.n ?? 2) * 2;
    case 'clones': return f.enemies.filter((o) => o.def.ai === 'clone' && !o.dead).length === 0;
    default: return true;
  }
}

function startAttack(f: Floor, e: Enemy, a: AttackSpec, plus: number): void {
  const p = f.p;
  const wind = (a.wind ?? 0.55) / (1 + 0.1 * plus);
  const n = Math.round((a.n ?? 1) * (1 + 0.25 * plus));
  e.state = 'wind';
  e.st = wind;
  const aim = Math.atan2(p.y - e.y, p.x - e.x);
  switch (a.a) {
    case 'slam':
      f.strike(e.x, e.y, a.r ?? 2.5, wind, areaDmg(f, e, a), 'rock');
      break;
    case 'nova':
      f.strike(e.x, e.y, a.r ?? 4, wind, Math.round(areaDmg(f, e, a) * 1.3), a.pk ?? (e.def.color === '#fff2b0' ? 'holy' : 'fire'));
      f.audio.rumble();
      break;
    case 'rain': {
      const kind = a.pk ?? 'rock';
      for (let k = 0; k < n; k++) {
        const x = k === 0 ? p.x : p.x + f.rng.range(-4, 4), y = k === 0 ? p.y : p.y + f.rng.range(-4, 4);
        if (f.g.solid(Math.floor(x), Math.floor(y))) continue;
        f.strike(x, y, a.r ?? 1.2, wind + 0.3 + k * 0.05, Math.round(areaDmg(f, e, a) * 0.8), kind);
      }
      break;
    }
    case 'squares':
      for (let k = 0; k < n; k++) {
        const x = k === 0 ? Math.floor(p.x) + 0.5 : Math.floor(p.x + f.rng.range(-5, 5)) + 0.5;
        const y = k === 0 ? Math.floor(p.y) + 0.5 : Math.floor(p.y + f.rng.range(-5, 5)) + 0.5;
        f.strike(x, y, a.r ?? 1, wind + 0.25 + k * 0.03, Math.round(areaDmg(f, e, a) * 0.85), 'glitch', true);
      }
      f.audio.glitch();
      break;
    case 'roots':
      for (let k = 0; k < n; k++) {
        const ang = aim + (k - (n - 1) / 2) * 0.55;
        for (let i = 1; i <= 12; i++) {
          const x = e.x + Math.cos(ang) * i * 0.85, y = e.y + Math.sin(ang) * i * 0.85;
          if (f.g.solid(Math.floor(x), Math.floor(y))) break;
          f.strike(x, y, 0.55, wind + i * 0.07, areaDmg(f, e, a), 'root');
        }
      }
      break;
    case 'zone':
      for (let k = 0; k < n; k++) {
        const x = k === 0 ? p.x : p.x + f.rng.range(-4, 4), y = k === 0 ? p.y : p.y + f.rng.range(-4, 4);
        if (f.g.solid(Math.floor(x), Math.floor(y))) continue;
        f.strike(x, y, a.r ?? 1.3, wind + 0.2, 0, a.zone ?? 'poison', false, a.zone ?? 'poison');
      }
      break;
    case 'beam':
      for (let k = 0; k < n; k++) {
        f.beam({ x: e.x, y: e.y, a: aim + (k - (n - 1) / 2) * 0.4, len: 24, w: 0.75, warn: wind, t: a.dur ?? 0.6, dmg: areaDmg(f, e, a),
          color: e.def.color ?? '#ffffff', spin: 0, owner: e });
      }
      f.audio.beam();
      break;
    case 'cross': {
      const off = f.rng.range(0, TAU), dir = f.rng.chance(0.5) ? 1 : -1;
      for (let k = 0; k < n; k++) {
        f.beam({ x: e.x, y: e.y, a: off + (k / n) * TAU, len: 24, w: 0.7, warn: wind, t: a.dur ?? 3.5, dmg: areaDmg(f, e, a),
          color: e.def.color ?? '#ffffff', spin: (a.spin ?? 0.6) * dir, owner: e });
      }
      f.audio.beam();
      break;
    }
    case 'teleport': {
      const dest = freeAround(f, p.x, p.y, 3.5, 6.5);
      if (dest) { e.tx = dest.x; e.ty = dest.y; f.telegraph(dest.x, dest.y, e.r + 0.4, wind); } else { e.tx = e.x; e.ty = e.y; }
      break;
    }
    case 'dash':
      e.tx = Math.cos(aim);
      e.ty = Math.sin(aim);
      for (let k = 1; k <= 10; k++) {
        const x = e.x + e.tx * k * 0.9, y = e.y + e.ty * k * 0.9;
        if (f.g.solid(Math.floor(x), Math.floor(y))) break;
        f.telegraph(x, y, 0.55, wind);
      }
      break;
    case 'dive':
      e.state = 'under';
      e.under = true;
      e.ghost = 0;
      e.st = 1.3 + f.rng.next() * 0.5;
      f.fx.burst(e.x, e.y, '#ff8a3d', 18, 4, 2.4, 0, 0.6);
      f.audio.rumble();
      break;
  }
}

function execute(f: Floor, e: Enemy, tempo: number): void {
  const a = e.atk!;
  const p = f.p, plus = f.layer.plus;
  const n = Math.round((a.n ?? 1) * (1 + 0.25 * plus));
  const speed = (a.speed ?? 5) * (1 + 0.08 * plus);
  const kind = SHOT[a.pk ?? 'orb'];
  const color = colorOf(e, a);
  switch (a.a) {
    case 'radial':
      radial(f, e, kind, shotDmg(f, e, a), speed, n, color, e.ang);
      e.ang += Math.PI / n;
      f.audio.swing();
      break;
    case 'fan':
      spread(f, e, kind, shotDmg(f, e, a), speed, n, Math.min(0.2, 1.6 / n), color);
      f.audio.swing();
      break;
    case 'homing': {
      const aim = Math.atan2(p.y - e.y, p.x - e.x);
      for (let k = 0; k < n; k++) {
        f.enemyShot(e, kind, shotDmg(f, e, a), speed, aim + (k - (n - 1) / 2) * 0.45 + Math.PI * (k % 2 ? 0.3 : -0.3), { color, home: 1.7 });
      }
      break;
    }
    case 'halo':
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * TAU;
        f.enemyShot(e, a.pk ? kind : 'holy', shotDmg(f, e, a), speed, ang,
          { color: a.pk ? color : '#fff2b0', wait: 0.7 + k * 0.02, home: 0.0001, x: e.x + Math.cos(ang) * 1.6, y: e.y + Math.sin(ang) * 1.6 });
      }
      f.audio.holy();
      break;
    case 'ring':
      for (let k = 0; k < n; k++) f.wave(e.x, e.y, (a.speed ?? 5) * (1 + 0.05 * plus), areaDmg(f, e, a), color, 1.1, 18);
      // следующие волны позже: стартуют с отрицательного радиуса
      f.waves.slice(-n).forEach((w, k) => { w.r = 0.3 - k * 1.8; });
      f.audio.boom();
      break;
    case 'summon':
      spawnKids(f, e, a.id ?? 'slime', n, n * 2);
      break;
    case 'clones':
      for (let k = 0; k < n; k++) {
        const d = freeAround(f, p.x, p.y, 3.5, 5);
        if (!d) continue;
        const c = f.spawn('bogo_clone', d.x, d.y);
        c.sleep = false;
        c.spawnT = 0.3;
        c.life = 3.4;
        c.cd = 0.6 + k * 0.15;
      }
      f.glitch = Math.max(f.glitch, 0.4);
      f.audio.glitch();
      break;
    case 'teleport':
      f.fx.burst(e.x, e.y, color, 12, 4, 2, 0, 0.5);
      e.x = e.tx;
      e.y = e.ty;
      e.ghost = 0;
      f.fx.burst(e.x, e.y, color, 12, 4, 2, 0, 0.5);
      f.audio.glitch();
      break;
    case 'spiral':
      e.state = 'cast';
      e.st = (a.dur ?? 2.5) * (1 + 0.15 * plus);
      e.shotT = 0;
      return;
    case 'beam':
    case 'cross':
      e.state = 'cast';
      e.st = a.dur ?? 0.6;
      return;
    case 'dash':
      e.state = 'dash';
      e.st = 0.7;
      f.audio.swing();
      return;
  }
  recover(f, e, tempo);
}

function channel(f: Floor, e: Enemy, dt: number): void {
  const a = e.atk;
  if (!a || a.a !== 'spiral') return;
  const plus = f.layer.plus;
  const arms = Math.round((a.n ?? 3) * (1 + 0.25 * plus));
  e.ang += (a.spin ?? 1.5) * dt;
  e.shotT -= dt;
  while (e.shotT <= 0) {
    e.shotT += 0.12 / (1 + 0.1 * plus);
    for (let k = 0; k < arms; k++) {
      f.enemyShot(e, SHOT[a.pk ?? 'orb'], shotDmg(f, e, a), (a.speed ?? 4.5) * (1 + 0.08 * plus), e.ang + (k / arms) * TAU, { color: colorOf(e, a) });
    }
  }
}

function recover(f: Floor, e: Enemy, tempo: number): void {
  e.state = 'recover';
  e.st = 0.35;
  e.cd = (e.atk?.cd ?? 1.8) / tempo;
}

/** Нырок Левиафана: невидим под лавой, догоняет гнома, вырывается столбом огня. */
function diveUnder(f: Floor, e: Enemy, dt: number): void {
  const p = f.p, a = f.layout.arena;
  e.st -= dt;
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
  const v = Math.min(d, 3.6 * dt);
  e.x += (dx / d) * v;
  e.y += (dy / d) * v;
  if (a) {
    e.x = Math.max(a.x0 + 0.5, Math.min(a.x1 + 0.5, e.x));
    e.y = Math.max(a.y0 + 0.5, Math.min(a.y1 + 0.5, e.y));
  }
  if (f.rng.chance(dt * 18)) f.fx.flame(e.x - 0.5, e.y - 0.6);
  if (e.st <= 0 || d < 0.4) {
    e.state = 'emerge';
    e.st = 0.75 / (1 + 0.1 * f.layer.plus);
    const r = e.atk?.r ?? 1.8;
    f.strike(e.x, e.y, r, e.st, areaDmg(f, e, e.atk ?? { a: 'dive' }), 'fire');
  }
}

function diveEmerge(f: Floor, e: Enemy, tempo: number): void {
  const a = e.atk ?? { a: 'dive' as const };
  e.under = false;
  e.ghost = 1;
  const n = Math.round((a.n ?? 12) * (1 + 0.25 * f.layer.plus));
  radial(f, e, SHOT[a.pk ?? 'fire'], shotDmg(f, e, a), 5, n, colorOf(e, a));
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * TAU + f.rng.next();
    f.zone(e.x + Math.cos(ang) * 1.6, e.y + Math.sin(ang) * 1.6, 0.8, 4, 'fire', dmgOf(f, e, e.def.dmg * 0.35));
  }
  f.shake = Math.max(f.shake, 0.4);
  recover(f, e, tempo);
}

const BRAINS: Record<AI, Brain> = {
  chase, burrow, bat, ranged, bomber, exploder, queen, mother, baron, worm, golem, salamander,
  charger, turret, phaser, orbiter, leaper, clone, pattern,
};
