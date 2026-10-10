// ИИ врагов: сон и пробуждение, погоня по полю путей, землерои, мыши, стрелки, подрывники, мини-боссы и боссы.
import { B, BLOCKS } from '../core/blocks';
import type { Grid } from '../core/grid';
import type { AI } from '../data/enemies';
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
  knockback(f, e, dt);
  if (e.slowT > 0) e.slowT -= dt;
  else e.slowK = 0;
  if (e.stunT > 0) {
    e.stunT -= dt;
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
  if ((e.boss || e.mini) && !e.enraged && e.hp < e.max * 0.5) enrage(f, e);
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

/** Урон врага с учётом этажа, элиты и ярости. */
function dmgOf(f: Floor, e: Enemy, base = e.def.dmg): number {
  return Math.max(1, Math.round(base * (1 + 0.1 * f.index) * (e.elite ? 1.3 : 1) * (e.enraged ? 1.15 : 1)));
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

const SHOT: Record<string, EProjKind> = { web: 'web', rock: 'rock', fire: 'efire', bomb: 'ebomb' };

function spread(f: Floor, e: Enemy, kind: EProjKind, dmg: number, speed: number, n: number, gap: number): void {
  const base = Math.atan2(f.p.y - e.y, f.p.x - e.x);
  for (let k = 0; k < n; k++) f.enemyShot(e, kind, dmg, speed, base + (k - (n - 1) / 2) * gap);
}

function radial(f: Floor, e: Enemy, kind: EProjKind, dmg: number, speed: number, n: number): void {
  const off = f.rng.next() * TAU;
  for (let k = 0; k < n; k++) f.enemyShot(e, kind, dmg, speed, off + (k / n) * TAU);
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

function diggable(g: Grid, x: number, y: number): boolean {
  if (!g.inside(x, y)) return false;
  const d = BLOCKS[g.b[g.i(x, y)]];
  return d.solid && d.rock && d.tier === 0 && d.hp < Infinity;
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
    if (!diggable(g, nx, ny)) continue;
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
      spread(f, e, SHOT[r.kind], dmgOf(f, e, r.dmg), r.speed, e.elite ? 3 : 1, 0.25);
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
        if (!f.g.solid(Math.floor(x), Math.floor(y))) f.fires.push({ x, y, t: 3.5 });
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
      for (const s of e.trail.slice(1)) touch(f, e, s.x, s.y, 0.36, dmgOf(f, e, e.def.dmg * 0.7));
      if (e.enraged && e.cd <= 0) {
        e.cd = 1.6;
        spread(f, e, 'rock', dmgOf(f, e, 4), 6, 3, 0.3);
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
  if (Math.hypot(p.x - e.x, p.y - e.y) < 1.5 + p.r) f.hurt(Math.round(dmgOf(f, e) * 1.3), e, 'Червь!');
  radial(f, e, 'rock', dmgOf(f, e, 3), 5.5, e.enraged ? 8 : 4);
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
    }
    return;
  }
  if (e.state === 'wind') {
    e.vx = e.vy = 0;
    e.st -= dt;
    if (e.st <= 0) {
      e.state = 'walk';
      e.cd2 = r.cd;
      spread(f, e, 'rock', dmgOf(f, e, r.dmg), r.speed, e.enraged ? 3 : 1, 0.3);
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
      f.fires.push({ x: e.x, y: e.y, t: e.enraged ? 4 : 2.6 });
    }
    touch(f, e, e.x, e.y, e.r + 0.1, dmgOf(f, e));
    if (res.hitX || res.hitY || e.st <= 0) {
      e.state = 'rest';
      e.st = 0.8;
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
    spread(f, e, 'efire', dmgOf(f, e, r.dmg), r.speed, e.enraged ? 3 : 1, 0.3);
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

const BRAINS: Record<AI, Brain> = { chase, burrow, bat, ranged, bomber, exploder, queen, mother, baron, worm, golem, salamander };
