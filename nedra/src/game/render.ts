// Отрисовка этажа: породы с гранями, туман, свет фонаря и факелов, враги, снаряды, эффекты.
import { B, BLOCKS } from '../core/blocks';
import { hash2 } from '../core/rng';
import { heroDef } from '../data/heroes';
import { itemDef } from '../data/items';
import { oreById } from '../data/ores';
import type { Enemy, Floor } from './floor';
import { JOY_R, type Joystick } from './input';
import { FACE_H, floorTiles, heroSprites, RARITY_COLOR, T, type Atlas, type Sprite } from './textures';

const OBJECT_BLOCKS = new Set<number>([B.CHEST, B.CRATE, B.TNT, B.CRYSTAL]);
const LUMINOUS: Record<string, [number, string]> = {
  wisp: [2.6, '255,170,60'], firebeetle: [1.6, '255,120,50'], baron: [2.8, '255,120,40'], salamander: [3, '255,110,40'],
  golem: [1.4, '120,230,255'],
};
const GLOW_CACHE = new Map<string, HTMLCanvasElement>();

/** Радиальное свечение заданного цвета (кэшируется). */
function glow(rgb: string): HTMLCanvasElement {
  let c = GLOW_CACHE.get(rgb);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${rgb},0.9)`);
    gr.addColorStop(0.35, `rgba(${rgb},0.35)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    GLOW_CACHE.set(rgb, c);
  }
  return c;
}

interface Light { x: number; y: number; r: number }

export class Renderer {
  zoom = 4;
  camX = 0;
  camY = 0;
  viewW = 10;
  viewH = 10;
  private light = document.createElement('canvas');
  private lctx = this.light.getContext('2d')!;
  private lightImg: ImageData | null = null;
  private time = 0;
  private camInit = false;

  constructor(private ctx: CanvasRenderingContext2D, private atlas: Atlas) {}

  /** Масштаб под экран: на телефоне ~11 клеток по ширине, на ПК ~20. */
  resize(w: number, h: number): void {
    const portrait = h > w;
    const want = portrait ? 11 : 19;
    this.zoom = Math.max(2, Math.floor(w / (want * T)));
    if (h / (this.zoom * T) < 9) this.zoom = Math.max(2, Math.floor(h / (9 * T)));
    this.viewW = w / (this.zoom * T);
    this.viewH = h / (this.zoom * T);
  }

  resetCamera(): void {
    this.camInit = false;
  }

  /** Экранные координаты точки мира (в пикселях холста). */
  toScreen(x: number, y: number): [number, number] {
    return [(x - this.camX) * T * this.zoom, (y - this.camY) * T * this.zoom];
  }

  render(f: Floor, dt: number, joy: Joystick | null): void {
    const ctx = this.ctx, g = f.g, z = this.zoom;
    this.time += dt;
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    // камера
    const look = 0.9;
    let tx = f.p.x + Math.cos(f.p.face) * (f.p.moving ? look : 0) - this.viewW / 2;
    let ty = f.p.y + Math.sin(f.p.face) * (f.p.moving ? look : 0) - this.viewH / 2 + 0.3;
    tx = this.viewW >= g.w ? (g.w - this.viewW) / 2 : Math.max(-0.5, Math.min(g.w + 0.5 - this.viewW, tx));
    ty = Math.max(-this.viewH * 0.35, Math.min(g.h + this.viewH * 0.35 - this.viewH, ty));
    if (!this.camInit) {
      this.camX = tx;
      this.camY = ty;
      this.camInit = true;
    }
    const k = 1 - Math.exp(-8 * dt);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    let sx = this.camX, sy = this.camY;
    if (f.shake > 0) {
      sx += (Math.random() - 0.5) * f.shake * 0.5;
      sy += (Math.random() - 0.5) * f.shake * 0.5;
    }
    const ox = Math.round(-sx * T * z), oy = Math.round(-sy * T * z);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(z, 0, 0, z, ox, oy);

    const x0 = Math.max(0, Math.floor(sx) - 1), y0 = Math.max(0, Math.floor(sy) - 1);
    const x1 = Math.min(g.w - 1, Math.ceil(sx + this.viewW) + 1), y1 = Math.min(g.h - 1, Math.ceil(sy + this.viewH) + 1);
    const tiles = floorTiles(this.atlas, f.layer.floor);

    // пол, породы, грани
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = g.i(x, y);
      const px = x * T, py = y * T;
      if (!g.seen[i]) {
        if (f.oreSeen[i] && g.b[i] === B.ORE) {
          ctx.globalAlpha = 0.55;
          ctx.drawImage(this.atlas.ore.get(g.ore[i])![0], px, py);
          ctx.globalAlpha = 1;
        }
        continue;
      }
      const b = g.b[i];
      const h = hash2(x, y, 911);
      if (!BLOCKS[b].solid || OBJECT_BLOCKS.has(b)) {
        const set = g.dug[i] ? tiles.dug : tiles.floor;
        ctx.drawImage(set[Math.floor(h * set.length)], px, py);
        if (g.deco[i] && !BLOCKS[b].solid) ctx.drawImage(this.atlas.deco.get(g.deco[i])!, px, py);
      }
      if (BLOCKS[b].solid) this.drawSolid(f, x, y, i, b, h);
      else this.drawEdges(f, x, y);
    }

    // обстановка
    this.drawProps(f);
    for (const t of f.telegraphs) this.drawTelegraph(t.x, t.y, t.r, t.t / t.max, !!t.ring);
    for (const c of f.clouds) {
      ctx.fillStyle = `rgba(120,210,80,${0.18 + 0.06 * Math.sin(this.time * 6)})`;
      ctx.beginPath();
      ctx.arc(c.x * T, c.y * T, c.r * T, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const fz of f.fires) {
      ctx.fillStyle = `rgba(255,${90 + Math.floor(Math.random() * 60)},30,0.55)`;
      ctx.beginPath();
      ctx.arc(fz.x * T, fz.y * T, 0.45 * T, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawPickups(f);
    for (const t of f.torchList) this.drawTorch(t.x, t.y);
    for (const b of f.bombs) this.drawBomb(b.x, b.y, b.t);
    for (const tu of f.turrets) this.drawTurret(tu.x, tu.y);

    // существа по глубине
    const order: { y: number; draw: () => void }[] = [];
    for (const e of f.enemies) {
      const cell = g.i(Math.floor(e.x), Math.floor(e.y));
      if (!g.inside(Math.floor(e.x), Math.floor(e.y)) || !f.vis[cell] || (e.under && e.def.ai === 'worm')) continue;
      order.push({ y: e.y, draw: () => this.drawEnemy(f, e) });
    }
    for (const m of f.minions) order.push({ y: m.y, draw: () => this.drawMinion(m.kind, m.x, m.y, m.a) });
    order.push({ y: f.p.y, draw: () => this.drawPlayer(f) });
    order.sort((a, b) => a.y - b.y);
    for (const o of order) o.draw();

    this.drawProjs(f);
    for (const b of f.bolts) this.drawBolt(b.pts);
    this.drawParticles(f, false);
    this.drawRings(f);

    this.drawMotes(f);

    // свет и туман
    this.drawLight(f, x0, y0, x1, y1);
    this.drawGlows(f, x0, y0, x1, y1);
    this.drawEyes(f);

    // экранные слои
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.vignette(cw, ch), 0, 0);
    this.drawTexts(f);
    if (f.flash > 0) {
      ctx.fillStyle = `rgba(${f.flashColor},${Math.min(0.45, f.flash * 0.5)})`;
      ctx.fillRect(0, 0, cw, ch);
    }
    const run = f.hp / Math.max(1, f.stats.maxHp);
    if (run < 0.3) {
      const a = 0.25 + 0.15 * Math.sin(this.time * 6);
      const gr = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
      gr.addColorStop(0, 'rgba(160,0,0,0)');
      gr.addColorStop(1, `rgba(160,0,0,${a})`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, cw, ch);
    }
    if (joy?.active) this.drawJoystick(joy);
  }

  // ---------------- породы ----------------

  private drawSolid(f: Floor, x: number, y: number, i: number, b: number, h: number): void {
    const ctx = this.ctx, g = f.g, a = this.atlas;
    const px = x * T, py = y * T;
    if (b === B.DOOR) ctx.drawImage(a.door, px, py);
    else if (b === B.CHEST) ctx.drawImage(a.chest[g.ore[i] || 1], px, py);
    else if (b === B.CRATE) ctx.drawImage(a.crate, px, py);
    else if (b === B.TNT) ctx.drawImage(a.tnt, px, py);
    else if (b === B.CRYSTAL) ctx.drawImage(a.crystal, px, py);
    else {
      const host = b === B.ORE ? g.host[i] : b;
      const tops = a.rockTop.get(host) ?? a.rockTop.get(B.STONE)!;
      const jig = f.lastHit.i === i && f.time - f.lastHit.t < 0.1 ? (Math.random() < 0.5 ? -1 : 1) : 0;
      ctx.drawImage(tops[Math.floor(h * tops.length)], px + jig, py);
      if (b === B.ORE) {
        const ov = a.ore.get(g.ore[i])!;
        ctx.drawImage(ov[Math.floor(h * 7) % ov.length], px + jig, py);
        // блеск руды
        const ph = (this.time * 0.7 + h * 10) % 3;
        if (ph < 0.25 && f.vis[i]) {
          const sx = px + 3 + Math.floor(h * 97) % 10, sy = py + 3 + Math.floor(h * 53) % 10;
          ctx.fillStyle = `rgba(255,255,255,${0.9 - ph * 3})`;
          ctx.fillRect(sx, sy - 1, 1, 3);
          ctx.fillRect(sx - 1, sy, 3, 1);
        }
      }
      // контур там, где порода граничит с пустотой, и шов между разными породами
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      if (g.open(x - 1, y)) ctx.fillRect(px, py, 1, T);
      if (g.open(x + 1, y)) ctx.fillRect(px + T - 1, py, 1, T);
      if (g.open(x, y - 1)) ctx.fillRect(px, py, T, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      if (this.otherRock(g, x + 1, y, host)) ctx.fillRect(px + T - 1, py, 1, T);
      if (this.otherRock(g, x, y + 1, host)) ctx.fillRect(px, py + T - 1, T, 1);
      // слишком твёрдая для кирки: холодный отблеск и штриховка
      if (g.tier(i) > f.stats.pickTier && BLOCKS[b].hp < Infinity && f.vis[i]) {
        ctx.fillStyle = 'rgba(110,140,255,0.16)';
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = 'rgba(190,210,255,0.22)';
        for (let k = 0; k < 4; k++) ctx.fillRect(px + 2 + k * 4, py + 12 - k * 3, 2, 1);
      }
    }
    // трещины от ударов
    const max = g.maxHp(i);
    if (g.hp[i] < max && max < Infinity) {
      const stage = Math.min(3, Math.floor((1 - g.hp[i] / max) * 4));
      ctx.drawImage(a.cracks[stage], px, py);
    }
  }

  private otherRock(g: Floor['g'], x: number, y: number, host: number): boolean {
    if (!g.inside(x, y)) return false;
    const i = g.i(x, y), b = g.b[i];
    if (!BLOCKS[b].solid || OBJECT_BLOCKS.has(b) || b === B.DOOR) return false;
    return (b === B.ORE ? g.host[i] : b) !== host;
  }

  /** Грань стены над открытой клеткой и тени у стен. */
  private drawEdges(f: Floor, x: number, y: number): void {
    const ctx = this.ctx, g = f.g, a = this.atlas;
    const px = x * T, py = y * T;
    const up = g.get(x, y - 1);
    if (BLOCKS[up].solid && !OBJECT_BLOCKS.has(up) && g.seen[g.i(x, Math.max(0, y - 1))]) {
      const ui = g.i(x, y - 1);
      const host = up === B.ORE ? g.host[ui] : up;
      const faces = a.rockFace.get(host);
      if (faces) ctx.drawImage(faces[(x + y) % faces.length], px, py);
      else if (up === B.DOOR) {
        ctx.fillStyle = '#2a2424';
        ctx.fillRect(px, py, T, FACE_H);
      }
      if (up === B.ORE) {
        const o = oreById(g.ore[ui]);
        ctx.fillStyle = o.color;
        ctx.fillRect(px + 4 + ((x * 7) % 6), py + 2, 2, 2);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(px, py + FACE_H, T, 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    if (g.solid(x - 1, y)) ctx.fillRect(px, py, 2, T);
    if (g.solid(x + 1, y)) ctx.fillRect(px + T - 2, py, 2, T);
    if (g.solid(x, y + 1)) ctx.fillRect(px, py + T - 1, T, 1);
  }

  // ---------------- обстановка ----------------

  private drawProps(f: Floor): void {
    const ctx = this.ctx, g = f.g, a = this.atlas;
    const ex = f.layout.exit, st = f.layout.start;
    if (g.seen[g.i(ex.x, ex.y)]) ctx.drawImage(a.props.get('exit')!, ex.x * T, ex.y * T - 8);
    if (g.seen[g.i(st.x, st.y)]) ctx.drawImage(a.props.get('lift')!, st.x * T, st.y * T - 8);
    for (const p of f.props) {
      if (!g.seen[g.i(p.x, p.y)]) continue;
      if (p.kind === 'trial') {
        const r = 1.6;
        ctx.strokeStyle = p.used ? 'rgba(120,120,120,0.5)' : `rgba(255,90,70,${0.5 + 0.3 * Math.sin(this.time * 3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc((p.x + 0.5) * T, (p.y + 0.5) * T, r * T, 0, Math.PI * 2);
        ctx.stroke();
        for (let k = 0; k < 6; k++) {
          const an = (k / 6) * Math.PI * 2 + this.time * 0.3;
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fillRect((p.x + 0.5 + Math.cos(an) * r) * T - 1, (p.y + 0.5 + Math.sin(an) * r) * T - 1, 3, 3);
        }
        continue;
      }
      if (p.kind === 'mushroom' && p.used) continue;
      const spr = a.props.get(p.kind);
      if (!spr) continue;
      if (p.kind === 'spring' && p.used) ctx.globalAlpha = 0.5;
      ctx.drawImage(spr, p.x * T, p.y * T - 8);
      ctx.globalAlpha = 1;
      if ((p.kind === 'merchant' || p.kind === 'shrine' || p.kind === 'anvil') && !(p.used && p.kind !== 'merchant')) {
        const bob = Math.sin(this.time * 4) * 1.5;
        ctx.fillStyle = '#ffd36b';
        ctx.fillRect(p.x * T + 7, p.y * T - 12 + bob, 2, 4);
        ctx.fillRect(p.x * T + 7, p.y * T - 6 + bob, 2, 2);
      }
    }
  }

  private drawTelegraph(x: number, y: number, r: number, left: number, ring: boolean): void {
    const ctx = this.ctx;
    const a = 0.18 + 0.4 * (1 - left);
    ctx.save();
    if (ring) {
      ctx.strokeStyle = `rgba(255,70,40,${a + 0.1})`;
      ctx.lineWidth = 0.9 * T;
      ctx.beginPath();
      ctx.arc(x * T, y * T, r * T, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(255,50,30,${a * 0.6})`;
      ctx.beginPath();
      ctx.arc(x * T, y * T, r * T, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,60,40,${a})`;
      ctx.beginPath();
      ctx.arc(x * T, y * T, r * T * (1 - left), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,90,60,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x * T, y * T, r * T, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPickups(f: Floor): void {
    const ctx = this.ctx, g = f.g;
    for (const k of f.pickups) {
      const cx = Math.floor(k.x), cy = Math.floor(k.y);
      if (!g.inside(cx, cy) || !f.vis[g.i(cx, cy)]) continue;
      const bob = Math.sin(this.time * 5 + k.x * 3) * 1.2;
      const px = k.x * T, py = k.y * T;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(px - 2, py + 2, 4, 1);
      if (k.kind === 'coin') {
        ctx.fillStyle = '#8f6f12';
        ctx.fillRect(px - 2, py - 3 + bob, 4, 4);
        ctx.fillStyle = '#f2c14e';
        ctx.fillRect(px - 2, py - 3 + bob, 3, 3);
        ctx.fillStyle = '#fff3b0';
        ctx.fillRect(px - 1, py - 3 + bob, 1, 1);
      } else if (k.kind === 'heart') {
        ctx.fillStyle = '#e33b3b';
        ctx.fillRect(px - 3, py - 4 + bob, 2, 2);
        ctx.fillRect(px + 1, py - 4 + bob, 2, 2);
        ctx.fillRect(px - 3, py - 3 + bob, 6, 2);
        ctx.fillRect(px - 2, py - 1 + bob, 4, 1);
        ctx.fillRect(px - 1, py + bob, 2, 1);
        ctx.fillStyle = '#ffb0b0';
        ctx.fillRect(px - 2, py - 4 + bob, 1, 1);
      } else {
        const col = RARITY_COLOR[itemDef(k.item).rarity];
        ctx.fillStyle = col;
        ctx.fillRect(px - 3, py - 6 + bob, 6, 6);
        ctx.fillStyle = '#2a1a10';
        ctx.fillRect(px - 2, py - 5 + bob, 4, 4);
        ctx.fillStyle = col;
        ctx.fillRect(px - 1, py - 4 + bob, 2, 2);
      }
    }
  }

  private drawTorch(x: number, y: number): void {
    const ctx = this.ctx;
    const px = x * T, py = y * T;
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(px - 1, py - 4, 2, 7);
    const fl = Math.sin(this.time * 18 + x) > 0 ? 1 : 0;
    ctx.fillStyle = '#ff8a2a';
    ctx.fillRect(px - 2, py - 8 + fl, 4, 4);
    ctx.fillStyle = '#ffe08a';
    ctx.fillRect(px - 1, py - 7 + fl, 2, 2);
  }

  private drawBomb(x: number, y: number, t: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#1a1a1e';
    ctx.beginPath();
    ctx.arc(x * T, y * T, 3, 0, Math.PI * 2);
    ctx.fill();
    if (Math.floor(t * 10) % 2 === 0) {
      ctx.fillStyle = '#ff4a2a';
      ctx.fillRect(x * T - 1, y * T - 5, 2, 2);
    }
  }

  private drawTurret(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#4a4e58';
    ctx.fillRect(x * T - 4, y * T - 2, 8, 5);
    ctx.fillStyle = '#8a92a0';
    ctx.fillRect(x * T - 3, y * T - 5, 6, 4);
    ctx.fillStyle = '#9fe0ff';
    ctx.fillRect(x * T - 1, y * T - 4, 2, 2);
  }

  // ---------------- существа ----------------

  private sprite(s: Sprite, x: number, y: number, scale: number, flip: boolean, alpha = 1): void {
    const ctx = this.ctx;
    const w = s.width * scale, h = s.height * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x * T, y * T);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(s, -w / 2, -h, w, h);
    ctx.restore();
  }

  private shadow(x: number, y: number, r: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(x * T, y * T, r * T, r * T * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawEnemy(f: Floor, e: Enemy): void {
    const ctx = this.ctx;
    const spr = this.atlas.enemies.get(e.def.id);
    if (!spr) return;
    const frame = Math.floor(e.t * (e.def.ai === 'bat' ? 10 : 5)) % 2;
    let scale = (e.def.size * T) / spr.size * (e.elite ? 1.15 : 1);
    if (e.spawnT > 0) scale *= Math.max(0.1, 1 - e.spawnT / 0.6);
    const flip = e.vx < -0.05;
    const bob = e.def.ai === 'bat' || e.def.ai === 'ranged' && e.def.id === 'wisp' ? Math.sin(e.t * 6) * 0.08 - 0.15 : 0;
    const baseY = e.y + e.r * 0.9 + bob;
    if (e.def.ai === 'worm') {
      for (let k = e.trail.length - 1; k >= 1; k--) {
        const s = e.trail[k];
        this.shadow(s.x, s.y + 0.3, 0.4);
        this.sprite(this.atlas.segment, s.x, s.y + 0.45, 1.1 - k * 0.04, false);
      }
    }
    this.shadow(e.x, baseY, e.r * 1.1);
    if (e.elite || e.boss) {
      ctx.save();
      ctx.shadowColor = e.boss ? '#ff5a3a' : '#ffd23f';
      ctx.shadowBlur = 6;
      this.sprite(spr.frames[frame], e.x, baseY, scale, flip);
      ctx.restore();
    } else this.sprite(spr.frames[frame], e.x, baseY, scale, flip);
    if (e.flash > 0) this.sprite(spr.flash[frame], e.x, baseY, scale, flip, Math.min(1, e.flash * 9));
    if (e.slowT > 0) this.sprite(spr.flash[frame], e.x, baseY, scale, flip, 0.25);
    const top = baseY - (spr.size * scale) / T;
    if (e.sleep) {
      ctx.fillStyle = '#cfe6ff';
      ctx.font = '6px monospace';
      ctx.fillText('z', e.x * T + 4, (top + 0.1) * T + Math.sin(this.time * 2) * 2);
    }
    if (e.state === 'aim' || e.fuse >= 0 || e.state === 'wind' || e.state === 'slam') {
      ctx.fillStyle = Math.floor(this.time * 12) % 2 ? '#ff3a2a' : '#ffd23f';
      ctx.fillRect(e.x * T - 1, top * T - 6, 2, 4);
      ctx.fillRect(e.x * T - 1, top * T - 1, 2, 1);
    }
    if (e.stunT > 0) {
      ctx.fillStyle = '#ffe36b';
      for (let k = 0; k < 3; k++) {
        const a = this.time * 6 + (k * Math.PI * 2) / 3;
        ctx.fillRect(e.x * T + Math.cos(a) * 4, top * T - 2 + Math.sin(a) * 1.5, 1, 1);
      }
    }
    if ((e.mini || e.elite) && !e.boss && e.hp < e.max) {
      const w = 14 * Math.max(1, e.def.size);
      ctx.fillStyle = '#000';
      ctx.fillRect(e.x * T - w / 2 - 1, top * T - 4, w + 2, 3);
      ctx.fillStyle = e.mini ? '#ff6b5b' : '#ffd23f';
      ctx.fillRect(e.x * T - w / 2, top * T - 3, (w * Math.max(0, e.hp)) / e.max, 1);
    }
  }

  private drawMinion(kind: 'bat' | 'golem', x: number, y: number, a: number): void {
    const spr = this.atlas.enemies.get(kind === 'bat' ? 'bat' : 'golem')!;
    const frame = Math.floor(this.time * 8) % 2;
    this.shadow(x, y + 0.2, 0.25);
    this.ctx.save();
    this.ctx.filter = kind === 'bat' ? 'hue-rotate(160deg) brightness(1.3)' : 'sepia(0.6) brightness(1.2)';
    this.sprite(spr.frames[frame], x, y + 0.25, kind === 'bat' ? 0.7 : 0.45, Math.cos(a) < 0);
    this.ctx.restore();
  }

  private drawPlayer(f: Floor): void {
    const ctx = this.ctx, p = f.p;
    const hero = heroSprites(this.atlas, heroDef(f.heroId));
    const frame = p.moving ? Math.floor(p.walk) % 2 : 0;
    const blink = p.inv > 0 && Math.floor(this.time * 20) % 2 === 0;
    this.shadow(p.x, p.y + 0.28, 0.3);
    if (p.dashT > 0) {
      for (let k = 1; k <= 3; k++) {
        this.sprite(hero.frames[p.dir][frame], p.x - p.dashX * k * 0.3, p.y + 0.3 - p.dashY * k * 0.3, 1, false, 0.25);
      }
    }
    // инструмент в руке
    const sw = p.swing;
    const toolBehind = p.dir === 'up';
    if (sw && toolBehind) this.drawTool(f);
    this.sprite(hero.frames[p.dir][frame], p.x, p.y + 0.3, 1, false, blink ? 0.45 : 1);
    if (sw && !toolBehind) this.drawTool(f);
    if (p.mineCell >= 0 && f.g.b[p.mineCell] !== B.FLOOR) {
      // полоска прочности добываемого блока
      const g = f.g, i = p.mineCell, max = g.maxHp(i);
      if (max < Infinity && g.hp[i] < max) {
        const cx = (i % g.w) + 0.5, cy = Math.floor(i / g.w);
        ctx.fillStyle = '#000';
        ctx.fillRect(cx * T - 7, cy * T - 4, 14, 3);
        ctx.fillStyle = '#ffd36b';
        ctx.fillRect(cx * T - 6, cy * T - 3, (12 * Math.max(0, g.hp[i])) / max, 1);
      }
    }
  }

  private drawTool(f: Floor): void {
    const ctx = this.ctx, p = f.p, sw = p.swing!;
    const run = f.runState;
    ctx.save();
    ctx.translate(p.x * T, (p.y - 0.05) * T);
    if (sw.arc > 0) {
      // взмах меча: дуга и клинок
      const prog = 1 - sw.t / (sw.arc >= Math.PI * 2 ? 0.3 : 0.18);
      const a0 = sw.a - sw.arc / 2, a = a0 + sw.arc * Math.min(1, prog);
      ctx.fillStyle = `rgba(255,250,230,${0.35 * (1 - prog * 0.6)})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, sw.r * T, a0, a);
      ctx.closePath();
      ctx.fill();
      ctx.rotate(a + Math.PI / 4);
      ctx.drawImage(this.atlas.swords[Math.min(4, run.swordTier)], 0, -14);
    } else {
      const prog = 1 - sw.t / 0.16;
      ctx.rotate(sw.a + Math.PI / 4 - 0.9 + prog * 1.4);
      ctx.drawImage(this.atlas.picks[Math.min(4, run.pickTier)], -2, -14);
    }
    ctx.restore();
  }

  // ---------------- снаряды, эффекты ----------------

  private drawProjs(f: Floor): void {
    const ctx = this.ctx;
    for (const pr of f.projs) {
      const px = pr.x * T, py = pr.y * T;
      switch (pr.kind) {
        case 'shard':
          ctx.fillStyle = '#d8d0c4';
          ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
          break;
        case 'wave': {
          const a = Math.atan2(pr.vy, pr.vx);
          ctx.strokeStyle = 'rgba(230,245,255,0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px - Math.cos(a) * 4, py - Math.sin(a) * 4, 6, a - 1, a + 1);
          ctx.stroke();
          break;
        }
        case 'bolt':
        case 'bullet':
          ctx.fillStyle = '#9fe0ff';
          ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
          break;
        case 'fire':
        case 'efire':
          ctx.fillStyle = pr.kind === 'efire' ? '#ff5a2a' : '#ffb347';
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffe9a0';
          ctx.fillRect(px - 1, py - 1, 2, 2);
          break;
        case 'rock':
          ctx.fillStyle = '#7a6a5a';
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#a89888';
          ctx.fillRect(px - 2, py - 2, 2, 2);
          break;
        case 'web':
          ctx.strokeStyle = '#eeeef4';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.moveTo(px - 4, py);
          ctx.lineTo(px + 4, py);
          ctx.moveTo(px, py - 4);
          ctx.lineTo(px, py + 4);
          ctx.stroke();
          break;
        case 'ebomb': {
          // летит навесом: тень на земле, бомба выше
          const total = Math.hypot(pr.tx - pr.x, pr.ty - pr.y) + 0.001;
          const h = Math.min(1.4, total * 0.5) * T * Math.sin(Math.min(1, pr.life / 1.2) * Math.PI);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(px - 2, py, 4, 2);
          ctx.fillStyle = '#1a1a1e';
          ctx.beginPath();
          ctx.arc(px, py - h, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ff7a3a';
          ctx.fillRect(px, py - h - 4, 1, 2);
          break;
        }
      }
    }
  }

  private drawBolt(pts: { x: number; y: number }[]): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#d6f4ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      ctx.moveTo(a.x * T, a.y * T);
      for (let s = 1; s <= 4; s++) {
        const t = s / 4;
        ctx.lineTo((a.x + (b.x - a.x) * t) * T + (s < 4 ? (Math.random() - 0.5) * 6 : 0), (a.y + (b.y - a.y) * t) * T + (s < 4 ? (Math.random() - 0.5) * 6 : 0));
      }
    }
    ctx.stroke();
  }

  private drawParticles(f: Floor, glowPass: boolean): void {
    const ctx = this.ctx;
    for (const p of f.fx.parts) {
      if (!!p.glow !== glowPass) continue;
      const a = Math.max(0, Math.min(1, p.life / (p.max * 0.5)));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.soft) {
        ctx.beginPath();
        ctx.arc(p.x * T, p.y * T, p.size * (1.2 - a * 0.4), 0, Math.PI * 2);
        ctx.fill();
      } else {
        const s = Math.max(1, p.size);
        ctx.fillRect(p.x * T - s / 2, p.y * T - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawRings(f: Floor): void {
    const ctx = this.ctx;
    for (const r of f.fx.rings) {
      const t = 1 - r.life / r.max;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x * T, r.y * T, r.r * T * (0.35 + 0.65 * t), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------- свет ----------------

  private lights(f: Floor): Light[] {
    const g = f.g;
    const ls: Light[] = [{ x: f.p.x, y: f.p.y, r: f.stats.light + 0.2 + Math.sin(this.time * 7) * 0.05 },
      { x: f.p.x + Math.cos(f.p.face) * 1.3, y: f.p.y + Math.sin(f.p.face) * 1.3, r: f.stats.light * 0.75 }];
    for (const t of f.torchList) ls.push({ x: t.x, y: t.y, r: t.r + Math.sin(this.time * 9 + t.x) * 0.12 });
    for (const p of f.props) if (p.kind === 'lamp' && g.seen[g.i(p.x, p.y)]) ls.push({ x: p.x + 0.5, y: p.y + 0.5, r: 3.4 });
    for (const fz of f.fires) ls.push({ x: fz.x, y: fz.y, r: 1.4 });
    for (const e of f.enemies) {
      const lum = LUMINOUS[e.def.id];
      if (lum && !e.under) ls.push({ x: e.x, y: e.y, r: lum[0] });
    }
    for (const pr of f.projs) if (pr.kind === 'fire' || pr.kind === 'efire') ls.push({ x: pr.x, y: pr.y, r: 1.2 });
    return ls;
  }

  private drawLight(f: Floor, x0: number, y0: number, x1: number, y1: number): void {
    const g = f.g, ctx = this.ctx;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (this.light.width !== w || this.light.height !== h) {
      this.light.width = w;
      this.light.height = h;
      this.lightImg = null;
    }
    if (!this.lightImg) this.lightImg = this.lctx.createImageData(w, h);
    const d = this.lightImg.data;
    const ls = this.lights(f);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = g.i(x, y), k = ((y - y0) * w + (x - x0)) * 4;
      let dark = 1;
      if (g.seen[i]) {
        if (!f.vis[i]) dark = 0.74;
        else {
          let b = 0;
          for (const l of ls) {
            const dd = Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y);
            const v = (l.r + 0.9 - dd) / (l.r * 0.55 + 0.9);
            if (v > b) b = v;
          }
          dark = 1 - (0.3 + 0.7 * Math.min(1, Math.max(0, b)));
        }
      }
      d[k] = 4;
      d[k + 1] = 2;
      d[k + 2] = 8;
      d[k + 3] = Math.round(dark * 255);
    }
    this.lctx.putImageData(this.lightImg, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.light, x0 * T, y0 * T, w * T, h * T);
    ctx.restore();
  }

  private drawGlows(f: Floor, x0: number, y0: number, x1: number, y1: number): void {
    const ctx = this.ctx, g = f.g;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const put = (x: number, y: number, r: number, rgb: string, a: number) => {
      ctx.globalAlpha = a;
      ctx.drawImage(glow(rgb), (x - r) * T, (y - r) * T, r * 2 * T, r * 2 * T);
    };
    for (const t of f.torchList) put(t.x, t.y - 0.3, 1.6 + Math.sin(this.time * 9 + t.x) * 0.08, '255,150,60', 0.55);
    for (const p of f.props) if (p.kind === 'lamp' && g.seen[g.i(p.x, p.y)]) put(p.x + 0.5, p.y - 0.1, 1.4, '255,200,110', 0.5);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = g.i(x, y);
      if (!g.seen[i] && !f.oreSeen[i]) continue;
      if (g.b[i] === B.ORE) {
        const o = oreById(g.ore[i]);
        if (o.glow) put(x + 0.5, y + 0.5, 0.9, hexToRgb(o.glow), 0.35 + 0.1 * Math.sin(this.time * 3 + x));
      } else if (g.b[i] === B.CRYSTAL) put(x + 0.5, y + 0.4, 1.2, '200,170,255', 0.45);
    }
    for (const fz of f.fires) put(fz.x, fz.y, 1, '255,120,40', 0.5);
    for (const pr of f.projs) {
      if (pr.kind === 'fire' || pr.kind === 'efire') put(pr.x, pr.y, 0.7, '255,140,50', 0.7);
      else if (pr.kind === 'bolt' || pr.kind === 'bullet') put(pr.x, pr.y, 0.5, '140,220,255', 0.6);
    }
    for (const e of f.enemies) {
      const lum = LUMINOUS[e.def.id];
      if (lum && !e.under && f.vis[g.i(Math.floor(e.x), Math.floor(e.y))]) put(e.x, e.y - 0.2, lum[0] * 0.45, lum[1], 0.45);
    }
    for (const pk of f.pickups) {
      if (pk.kind === 'item') put(pk.x, pk.y - 0.2, 0.8, hexToRgb(RARITY_COLOR[itemDef(pk.item).rarity]), 0.5 + 0.2 * Math.sin(this.time * 4));
    }
    for (const b of f.bolts) for (const pt of b.pts) put(pt.x, pt.y, 0.7, '170,230,255', 0.7);
    ctx.globalAlpha = 1;
    this.drawParticles(f, true);
    ctx.restore();
  }

  /** Глаза бодрствующих врагов, которых не видно в темноте. */
  private drawEyes(f: Floor): void {
    const ctx = this.ctx, g = f.g;
    for (const e of f.enemies) {
      if (e.sleep || e.under) continue;
      const cx = Math.floor(e.x), cy = Math.floor(e.y);
      if (!g.inside(cx, cy) || f.vis[g.i(cx, cy)]) continue;
      const d = Math.hypot(e.x - f.p.x, e.y - f.p.y);
      if (d > 8) continue;
      if (Math.sin(this.time * 2.3 + e.t * 7) > 0.93) continue;
      const a = Math.max(0.25, 1 - d / 9);
      const col = LUMINOUS[e.def.id] ? '255,180,80' : '255,60,50';
      ctx.fillStyle = `rgba(${col},${a})`;
      const s = Math.max(1, e.def.size);
      const ey = (e.y - 0.25 * s) * T;
      ctx.fillRect(e.x * T - 2.5 * s, ey, 1.5 * s, 1.2 * s);
      ctx.fillRect(e.x * T + 1 * s, ey, 1.5 * s, 1.2 * s);
    }
  }

  private vig: HTMLCanvasElement | null = null;

  private vignette(w: number, h: number): HTMLCanvasElement {
    if (!this.vig || this.vig.width !== w || this.vig.height !== h) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.55);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      this.vig = c;
    }
    return this.vig;
  }

  /** Пылинки в свете фонаря. */
  private drawMotes(f: Floor): void {
    const ctx = this.ctx, r = f.stats.light + 0.5;
    ctx.fillStyle = 'rgba(255,236,200,0.35)';
    for (let k = 0; k < 14; k++) {
      const a = k * 2.399 + this.time * 0.07 * (1 + (k % 3));
      const d = ((k * 0.618) % 1) * r;
      const x = f.p.x + Math.cos(a) * d + Math.sin(this.time * 0.5 + k) * 0.3;
      const y = f.p.y + Math.sin(a) * d - ((this.time * 0.15 + k * 0.37) % 1) * 0.8;
      ctx.fillRect(x * T, y * T, 1, 1);
    }
  }

  private drawTexts(f: Floor): void {
    const ctx = this.ctx, z = this.zoom;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of f.fx.texts) {
      const [x, y] = this.toScreen(t.x, t.y);
      const a = Math.min(1, t.life / (t.max * 0.4));
      const size = Math.round((t.num ? (t.big ? 7 : 5.5) : t.big ? 6 : 4.5) * z);
      ctx.font = `900 ${size}px system-ui, sans-serif`;
      ctx.globalAlpha = a;
      ctx.lineWidth = Math.max(2, z * 0.9);
      ctx.strokeStyle = '#120a06';
      ctx.strokeText(t.text, x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  private drawJoystick(j: Joystick): void {
    const ctx = this.ctx, dpr = ctx.canvas.width / ctx.canvas.clientWidth || 1;
    const ox = j.ox * dpr, oy = j.oy * dpr;
    const dx = j.x - j.ox, dy = j.y - j.oy, d = Math.hypot(dx, dy);
    const k = d > JOY_R ? JOY_R / d : 1;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(ox, oy, JOY_R * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f3e9dc';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#f3e9dc';
    ctx.beginPath();
    ctx.arc(ox + dx * k * dpr, oy + dy * k * dpr, 18 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function hexToRgb(c: string): string {
  const n = parseInt(c.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
