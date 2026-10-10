// Отрисовка этажа: породы с гранями, туман, свет фонаря и факелов, враги, снаряды, эффекты.
import { B, BLOCKS } from '../core/blocks';
import { hash2 } from '../core/rng';
import { heroDef } from '../data/heroes';
import { itemDef } from '../data/items';
import { oreById } from '../data/ores';
import { BOGO_FPS, BOGO_FRAME, BOGO_FRAMES } from './bogosprite';
import { STRIKE_COLOR, type Enemy, type Floor } from './floor';
import { JOY_R, type Joystick } from './input';
import { FACE_H, floorTiles, heroSprites, RARITY_COLOR, ROCK_GLOW, T, type Atlas, type Sprite } from './textures';

const OBJECT_BLOCKS = new Set<number>([B.CHEST, B.CRATE, B.TNT, B.CRYSTAL]);
const LUMINOUS: Record<string, [number, string]> = { golem: [1.4, '120,230,255'] };
/** Свет существа: из описания или запасной. */
const lum = (e: Enemy): [number, string] | undefined => e.def.glow ?? LUMINOUS[e.def.id];
const isGod = (e: Enemy): boolean => e.def.id.startsWith('bogomiron') || e.def.ai === 'clone';
const ZONE_RGB: Record<string, string> = { fire: '255,110,40', poison: '130,220,80', ice: '170,225,255', holy: '255,236,160', glitch: '255,80,180' };
const GLYPHS = '#%@?!БГМРНЖЪЫ01░▒▓';
/** Цвет свечения вражеских снарядов по виду. */
const PROJ_COLOR: Record<string, string> = {
  orb: '#9ff4ff', ice: '#bff4ff', spore: '#9dff7a', holy: '#fff2b0', glitch: '#ff5ab0', efire: '#ff7a3a', rock: '#a89888',
};
/** Цветные копии листа Богомирона: вспышка и цветовое расслоение. */
interface Tinted { white: HTMLCanvasElement; red: HTMLCanvasElement; cyan: HTMLCanvasElement }
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
  private wide = false;

  constructor(private ctx: CanvasRenderingContext2D, private atlas: Atlas) {}

  /** Масштаб под экран: на телефоне ~11 клеток по ширине, на ПК ~20; на арене босса шире. */
  resize(w: number, h: number): void {
    const portrait = h > w;
    const want = this.wide ? (portrait ? 13 : 25) : portrait ? 11 : 19;
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
    const wide = f.layout.arena !== null;
    if (wide !== this.wide) {
      this.wide = wide;
      this.resize(cw, ch);
    }
    // камера: за гномом, в бою с боссом чуть к боссу, при явлении бога - на нём
    const look = 0.9;
    let fx = f.p.x + Math.cos(f.p.face) * (f.p.moving ? look : 0), fy = f.p.y + Math.sin(f.p.face) * (f.p.moving ? look : 0);
    const boss = f.boss;
    if (boss && f.cine) {
      fx = boss.x;
      fy = boss.y - 0.3;
    } else if (boss && !boss.under) {
      const k = isGod(boss) ? 0.5 : 0.3;
      fx += (boss.x - fx) * k;
      fy += (boss.y - (isGod(boss) ? 1.6 : 0) - fy) * k;
    }
    let tx = fx - this.viewW / 2;
    let ty = fy - this.viewH / 2 + 0.3;
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
    const shake = f.shake + (f.cine ? (f.cine.kind === 'true' ? 0.6 : 0.2) * (f.cine.t / f.cine.dur) : 0);
    if (shake > 0) {
      sx += (Math.random() - 0.5) * shake * 0.5;
      sy += (Math.random() - 0.5) * shake * 0.5;
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
        if (g.deco[i] && !BLOCKS[b].solid) ctx.drawImage(tiles.deco[g.deco[i]], px, py);
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
    this.drawZones(f);
    this.drawStrikes(f);
    this.drawPickups(f);
    for (const t of f.torchList) if (!t.hidden) this.drawTorch(t.x, t.y);
    for (const b of f.bombs) this.drawBomb(b.x, b.y, b.t);
    for (const tu of f.turrets) this.drawTurret(tu.x, tu.y);
    this.drawWaves(f);

    // существа по глубине
    const order: { y: number; draw: () => void }[] = [];
    for (const e of f.enemies) {
      const cx = Math.floor(e.x), cy = Math.floor(e.y);
      if (!g.inside(cx, cy) || (!f.vis[g.i(cx, cy)] && !e.boss) || (e.under && e.def.ai === 'worm')) continue;
      order.push({ y: e.y + (isGod(e) ? 1.2 : 0), draw: () => this.drawEnemy(f, e) });
    }
    for (const m of f.minions) order.push({ y: m.y, draw: () => (m.kind === 'drone' ? this.drawDrone(m.x, m.y, m.a) : this.drawMinion(m.kind, m.x, m.y, m.a)) });
    const c = f.captive;
    if (c && !c.done && g.seen[g.i(c.x, c.y)]) order.push({ y: c.y + 0.5, draw: () => this.drawCaptive(f) });
    order.push({ y: f.p.y, draw: () => this.drawPlayer(f) });
    order.sort((a, b) => a.y - b.y);
    for (const o of order) o.draw();

    this.drawBeams(f);
    this.drawProjs(f);
    for (const b of f.bolts) this.drawBolt(b.pts);
    this.drawParticles(f, false);
    this.drawRings(f);

    this.drawMotes(f);

    // свет и туман
    this.drawLight(f, x0, y0, x1, y1);
    this.drawGlows(f, x0, y0, x1, y1);
    this.drawEyes(f);
    this.drawHalos(f);

    // экранные слои
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (f.layer.tint) this.drawTint(f.layer.tint, cw, ch);
    ctx.drawImage(this.vignette(cw, ch), 0, 0);
    if (f.cine) this.drawCine(f, cw, ch);
    if (f.glitch > 0) this.drawGlitch(f.glitch, cw, ch);
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

  /** Зоны на земле: огонь, яд, лёд, свет, сбой. */
  private drawZones(f: Floor): void {
    const ctx = this.ctx;
    for (const z of f.zones) {
      const fade = Math.max(0, Math.min(1, z.t / 0.7, (z.max - z.t) / 0.2));
      const x = z.x * T, y = z.y * T, r = z.r * T;
      ctx.globalAlpha = fade;
      ctx.fillStyle = `rgba(${ZONE_RGB[z.kind]},0.2)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      const seed = Math.floor(z.x * 13 + z.y * 7);
      if (z.kind === 'fire') {
        ctx.fillStyle = 'rgba(90,20,5,0.35)';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
        ctx.fill();
        for (let k = 0; k < 8; k++) {
          const a = k * 2.4 + seed, d = r * (0.1 + 0.75 * hash2(k, seed, 5));
          const fl = Math.sin(this.time * 12 + k * 1.7);
          ctx.fillStyle = fl > 0.3 ? '#ffd36b' : fl > -0.4 ? '#ff8a2a' : '#c8401a';
          ctx.fillRect(x + Math.cos(a) * d - 1, y + Math.sin(a) * d - 1 - (fl > 0 ? 1 : 0), 2, 2);
        }
      } else if (z.kind === 'poison') {
        ctx.fillStyle = 'rgba(60,130,35,0.35)';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1;
        for (let k = 0; k < 5; k++) {
          const ph = this.time * 0.9 + k * 0.37 + seed * 0.1, q = ph % 1;
          const a = k * 2.1 + Math.floor(ph) * 1.3, d = r * 0.65 * hash2(k, Math.floor(ph), seed);
          ctx.strokeStyle = `rgba(190,255,140,${0.8 * (1 - q)})`;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.5 + q * 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (z.kind === 'ice') {
        ctx.strokeStyle = 'rgba(230,250,255,0.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + seed;
          ctx.moveTo(x + Math.cos(a) * r * 0.15, y + Math.sin(a) * r * 0.15);
          ctx.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (z.kind === 'holy') {
        ctx.strokeStyle = `rgba(255,240,180,${0.6 + 0.3 * Math.sin(this.time * 6)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.95, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#fff6c8';
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + this.time * 0.8;
          ctx.fillRect(x + Math.cos(a) * r * 0.75 - 1, y + Math.sin(a) * r * 0.75 - 1, 2, 2);
        }
      } else {
        const tick = Math.floor(this.time * 12);
        for (let k = 0; k < 9; k++) {
          const hx = hash2(k, tick, seed), hy = hash2(k, tick, seed + 1);
          ctx.fillStyle = k % 3 === 0 ? 'rgba(40,230,255,0.6)' : k % 3 === 1 ? 'rgba(255,60,170,0.6)' : 'rgba(0,0,0,0.65)';
          ctx.fillRect(x + (hx - 0.5) * r * 1.5, y + (hy - 0.5) * r * 1.5, 2 + hash2(k, tick, 9) * 6, 1 + hash2(k, tick, 8) * 3);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Метки ударов с неба: круг или квадрат заполняется к моменту удара. */
  private drawStrikes(f: Floor): void {
    const ctx = this.ctx;
    for (const st of f.strikes) {
      const prog = Math.max(0, Math.min(1, 1 - st.t / st.max));
      const rgb = hexToRgb(STRIKE_COLOR[st.kind] ?? '#ffcf6a');
      const x = st.x * T, y = st.y * T, r = st.r * T;
      const shape = (rr: number): void => {
        ctx.beginPath();
        if (st.square) ctx.rect(x - rr, y - rr, rr * 2, rr * 2);
        else ctx.arc(x, y, rr, 0, Math.PI * 2);
      };
      ctx.fillStyle = `rgba(${rgb},${0.1 + 0.15 * prog})`;
      shape(r);
      ctx.fill();
      ctx.fillStyle = `rgba(${rgb},${0.18 + 0.35 * prog})`;
      shape(r * prog);
      ctx.fill();
      const blink = st.t < 0.3 && Math.floor(this.time * 18) % 2 === 0;
      ctx.strokeStyle = blink ? 'rgba(255,255,255,0.95)' : `rgba(${rgb},0.85)`;
      ctx.lineWidth = 1;
      shape(r);
      ctx.stroke();
      if (st.kind === 'rock' || st.kind === 'ice') {
        // тень падающего камня растёт, сам камень летит сверху
        ctx.fillStyle = `rgba(0,0,0,${0.15 + 0.35 * prog})`;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 0.55 * prog + 1, (r * 0.55 * prog + 1) * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        if (prog > 0.45) {
          const hh = (1 - prog) * 7 * T;
          ctx.fillStyle = st.kind === 'ice' ? '#bff4ff' : '#8a7a6a';
          if (st.kind === 'ice') {
            ctx.beginPath();
            ctx.moveTo(x - 2.5, y - hh - 6);
            ctx.lineTo(x + 2.5, y - hh - 6);
            ctx.lineTo(x, y - hh + 2);
            ctx.fill();
          } else {
            ctx.fillRect(x - 3, y - hh - 5, 6, 5);
            ctx.fillStyle = '#b4a494';
            ctx.fillRect(x - 3, y - hh - 5, 3, 2);
          }
        }
      } else if (st.kind === 'root') {
        ctx.strokeStyle = `rgba(60,40,20,${0.4 + 0.5 * prog})`;
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + st.x;
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * r * prog, y + Math.sin(a) * r * prog);
        }
        ctx.stroke();
      }
    }
  }

  /** Ударные волны: кольцо с проходом. */
  private drawWaves(f: Floor): void {
    const ctx = this.ctx;
    for (const w of f.waves) {
      const rgb = hexToRgb(w.color);
      const fade = Math.max(0, Math.min(1, (w.max - w.r) / 2, w.r / 0.6));
      const a0 = w.gapA + w.gapW / 2, a1 = w.gapA + Math.PI * 2 - w.gapW / 2;
      ctx.lineWidth = 0.6 * T;
      ctx.strokeStyle = `rgba(${rgb},${0.45 * fade})`;
      ctx.beginPath();
      ctx.arc(w.x * T, w.y * T, w.r * T, a0, a1);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * fade})`;
      ctx.beginPath();
      ctx.arc(w.x * T, w.y * T, w.r * T + 0.2 * T, a0, a1);
      ctx.stroke();
    }
  }

  /** Лучи: тонкое предупреждение, затем сплошной столб света. */
  private drawBeams(f: Floor): void {
    const ctx = this.ctx;
    for (const b of f.beams) {
      const rgb = hexToRgb(b.color);
      ctx.save();
      ctx.translate(b.x * T, b.y * T);
      ctx.rotate(b.a);
      const L = b.len * T, w = b.w * T;
      if (b.warn > 0) {
        const on = Math.floor(this.time * 14) % 2 === 0;
        ctx.fillStyle = `rgba(${rgb},0.1)`;
        ctx.fillRect(0, -w / 2, L, w);
        ctx.fillStyle = `rgba(${rgb},${on ? 0.85 : 0.4})`;
        ctx.fillRect(0, -0.5, L, 1);
        ctx.fillStyle = `rgba(${rgb},0.4)`;
        for (let d = 0; d < L; d += 6) {
          ctx.fillRect(d, -w / 2, 3, 0.7);
          ctx.fillRect(d, w / 2 - 0.7, 3, 0.7);
        }
      } else {
        const k = Math.max(0, Math.min(1, (b.max - b.t) / 0.08, b.t / 0.15));
        const ww = w * k * (0.85 + 0.15 * Math.sin(this.time * 50));
        ctx.fillStyle = `rgba(${rgb},0.6)`;
        ctx.fillRect(0, -ww / 2, L, ww);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(0, -ww / 6, L, ww / 3);
      }
      ctx.restore();
    }
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
    if (isGod(e)) {
      this.drawGod(f, e);
      return;
    }
    const ctx = this.ctx;
    if (e.under) {
      // нырнул в лаву: под землёй ползёт раскалённый бугор
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 10);
      ctx.fillStyle = `rgba(255,${90 + Math.floor(pulse * 60)},30,0.45)`;
      ctx.beginPath();
      ctx.ellipse(e.x * T, e.y * T, e.r * T * (1.1 + pulse * 0.2), e.r * T * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(40,10,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(e.x * T, e.y * T, e.r * T * 0.6, e.r * T * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const spr = this.atlas.enemies.get(e.def.look ?? e.def.id);
    if (!spr) return;
    const frame = Math.floor(e.t * (e.def.float ? 10 : 5)) % 2;
    let scale = (e.def.size * T) / spr.size * (e.elite ? 1.15 : 1) * (e.small ? 0.7 : 1);
    if (e.spawnT > 0) scale *= Math.max(0.1, 1 - e.spawnT / 0.6);
    const flip = e.vx < -0.05;
    const bob = e.def.float ? Math.sin(e.t * 6) * 0.08 - 0.15 : 0;
    const baseY = e.y + e.r * 0.9 + bob;
    const alpha = Math.max(0, Math.min(1, e.ghost));
    if (e.def.ai === 'worm') {
      for (let k = e.trail.length - 1; k >= 1; k--) {
        const s = e.trail[k];
        this.shadow(s.x, s.y + 0.3, 0.4);
        this.sprite(this.atlas.segment, s.x, s.y + 0.45, 1.1 - k * 0.04, false);
      }
    }
    if (alpha < 0.05) return;
    this.shadow(e.x, e.y + e.r * 0.9, e.r * 1.1 * (e.def.float ? 0.8 : 1));
    if (e.state === 'wind' && e.boss) {
      // босс копит силу: пульсирующая аура
      const k = 0.5 + 0.5 * Math.sin(this.time * 18);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + 0.25 * k;
      const r = e.def.size * 0.9;
      ctx.drawImage(glow(hexToRgb(e.def.color ?? '#ff5a3a')), (e.x - r) * T, (baseY - e.def.size * 0.55 - r) * T, r * 2 * T, r * 2 * T);
      ctx.restore();
    }
    if (e.elite || e.boss) {
      ctx.save();
      ctx.shadowColor = e.boss ? (e.enraged || e.phase >= 2 ? '#ff2a2a' : e.def.color ?? '#ff5a3a') : '#ffd23f';
      ctx.shadowBlur = e.boss ? 8 + 3 * e.phase : 6;
      this.sprite(spr.frames[frame], e.x, baseY, scale, flip, alpha);
      ctx.restore();
    } else this.sprite(spr.frames[frame], e.x, baseY, scale, flip, alpha);
    if (e.flash > 0) this.sprite(spr.flash[frame], e.x, baseY, scale, flip, Math.min(1, e.flash * 9) * alpha);
    if (e.slowT > 0) this.sprite(spr.flash[frame], e.x, baseY, scale, flip, 0.25 * alpha);
    const top = baseY - (spr.size * scale) / T;
    if (e.invuln > 0) {
      // щит: удары не проходят
      ctx.strokeStyle = `rgba(255,236,160,${0.45 + 0.3 * Math.sin(this.time * 12)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(e.x * T, (baseY + top) * T / 2, (baseY - top) * T * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
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

  /** Дрон Прокопа: корпус, винты, глаз смотрит на цель. */
  private drawDrone(x: number, y: number, a: number): void {
    const ctx = this.ctx;
    const hover = Math.sin(this.time * 5) * 1.2;
    const px = Math.round(x * T), py = Math.round((y - 0.55) * T + hover);
    this.shadow(x, y + 0.15, 0.2);
    const spin = Math.floor(this.time * 30) % 2;
    ctx.fillStyle = 'rgba(210,220,230,0.75)';
    ctx.fillRect(px - 7, py - 4, spin ? 5 : 3, 1);
    ctx.fillRect(px + 2 + (spin ? 0 : 2), py - 4, spin ? 5 : 3, 1);
    ctx.fillStyle = '#5a6270';
    ctx.fillRect(px - 5, py - 3, 1, 2);
    ctx.fillRect(px + 4, py - 3, 1, 2);
    ctx.fillStyle = '#2e323c';
    ctx.fillRect(px - 4, py - 2, 8, 5);
    ctx.fillStyle = '#8a94a4';
    ctx.fillRect(px - 4, py - 2, 8, 1);
    ctx.fillStyle = '#c87a24';
    ctx.fillRect(px - 4, py + 2, 8, 1);
    ctx.fillStyle = '#7ff0ff';
    ctx.fillRect(px - 1 + Math.round(Math.cos(a) * 2), py - 1, 2, 2);
  }

  /** Пленник в клетке: ждёт, машет, когда стража пала. */
  private drawCaptive(f: Floor): void {
    const c = f.captive;
    if (!c) return;
    const spr = this.atlas.npcs.get(c.id);
    if (!spr) return;
    const ctx = this.ctx, p = f.p;
    const x = c.x + 0.5, y = c.y + 0.5;
    let dir: 'down' | 'up' | 'left' | 'right' = 'down';
    if (c.open) {
      const dx = p.x - x, dy = p.y - y;
      dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    }
    const frame = c.open ? Math.floor(this.time * 4) % 2 : Math.floor(this.time * 0.8) % 2;
    this.shadow(x, y + 0.28, 0.3);
    const shiver = c.open ? 0 : Math.sin(this.time * 30) * 0.015;
    this.sprite(spr.frames[dir][frame], x + shiver, y + 0.3, 1, false);
    // пузырь над головой
    const bob = Math.sin(this.time * 3) * 1.2;
    const bx = x * T, by = (y - 1.05) * T + bob;
    const text = c.open ? 'Ура!' : Math.hypot(p.x - x, p.y - y) < 7 ? 'Помоги!' : '!';
    ctx.font = '900 5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = Math.max(7, ctx.measureText(text).width + 4);
    ctx.fillStyle = 'rgba(255,248,230,0.92)';
    ctx.fillRect(bx - w / 2, by - 4, w, 8);
    ctx.fillRect(bx - 1, by + 4, 2, 2);
    ctx.fillStyle = c.open ? '#2a7a2a' : '#a02a1a';
    ctx.fillText(text, bx, by + 0.5);
  }

  private tints = new Map<HTMLImageElement, Tinted>();

  private tinted(img: HTMLImageElement): Tinted | null {
    if (!img.complete || !img.naturalWidth) return null;
    let t = this.tints.get(img);
    if (!t) {
      const make = (color: string): HTMLCanvasElement => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = color;
        g.fillRect(0, 0, c.width, c.height);
        return c;
      };
      t = { white: make('#ffffff'), red: make('#ff2a5a'), cyan: make('#2af0ff') };
      this.tints.set(img, t);
    }
    return t;
  }

  /** Масштаб и прозрачность бога: во время явления он проступает из света. */
  private godAppear(f: Floor, e: Enemy): { k: number; alpha: number } {
    let k = 1, alpha = Math.max(0, Math.min(1, e.ghost));
    if (f.cine) {
      const p = f.cine.t / f.cine.dur;
      const from = f.cine.kind === 'true' ? 0.62 : 0.5;
      const q = Math.max(0, Math.min(1, (p - from) / (0.95 - from)));
      k = 0.3 + 0.7 * q;
      alpha *= q;
    } else if (e.spawnT > 0) k = Math.max(0.1, 1 - e.spawnT / 0.6);
    return { k, alpha };
  }

  /** Богомирон и его отражения: кадры листа, сияние, срезы и цветовое расслоение при сбое. */
  private drawGod(f: Floor, e: Enemy): void {
    const ctx = this.ctx;
    const truth = e.def.id === 'bogomiron_true';
    const clone = e.def.ai === 'clone';
    const img = truth ? this.atlas.bogoTrue : this.atlas.bogo;
    const tint = this.tinted(img);
    if (!tint) return;
    const ap = this.godAppear(f, e);
    let alpha = ap.alpha * (clone ? 0.55 : 1);
    if (clone && e.life < 0.7 && Math.floor(this.time * 20) % 2) alpha *= 0.35;
    if (alpha < 0.03) return;
    const fr = Math.floor(this.time * BOGO_FPS + e.t * 3) % BOGO_FRAMES;
    const size = e.def.size * T * (e.small ? 0.7 : 1) * ap.k;
    const sc = size / BOGO_FRAME;
    const hover = Math.sin(this.time * 2 + e.t) * 1.6;
    const cx = e.x * T, cy = (e.y - 0.55) * T + hover;
    const x0 = cx - size / 2, y0 = cy - size / 2;
    const sx = fr * BOGO_FRAME;
    ctx.fillStyle = `rgba(0,0,0,${0.35 * alpha})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 34 * sc - hover + 3, 15 * sc, 4.5 * sc, 0, 0, Math.PI * 2);
    ctx.fill();
    // сияние за спиной
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rgb = truth || clone ? '255,70,160' : '255,236,160';
    const wind = e.state === 'wind' ? 0.25 + 0.2 * Math.sin(this.time * 20) : 0;
    ctx.globalAlpha = Math.min(1, alpha * (0.32 + 0.08 * Math.sin(this.time * 3) + wind + 0.08 * e.phase));
    const gr = size * (0.85 + 0.12 * e.phase);
    ctx.drawImage(glow(rgb), cx - gr, cy - gr, gr * 2, gr * 2);
    ctx.restore();
    // сбой: чем глубже фаза, тем чаще
    const rate = clone ? 0.6 : truth ? 0.3 + 0.15 * e.phase : e.phase * 0.17;
    const tick = Math.floor(this.time * 14);
    const glitching = hash2(tick, Math.floor(e.t * 100), 31) < rate;
    ctx.save();
    if (glitching || truth || clone) {
      const d = (glitching ? 3 : 1.2) * (truth ? 1.5 : 1) * sc;
      ctx.globalAlpha = alpha * (glitching ? 0.75 : 0.5);
      ctx.drawImage(tint.red, sx, 0, BOGO_FRAME, BOGO_FRAME, x0 - d, y0, size, size);
      ctx.drawImage(tint.cyan, sx, 0, BOGO_FRAME, BOGO_FRAME, x0 + d, y0, size, size);
    }
    ctx.globalAlpha = alpha;
    if (glitching) {
      const bands = 8, bh = BOGO_FRAME / bands;
      for (let b = 0; b < bands; b++) {
        const dx = hash2(tick, b, 78) < 0.45 ? (hash2(tick, b, 77) - 0.5) * (truth ? 16 : 10) : 0;
        ctx.drawImage(img, sx, b * bh, BOGO_FRAME, bh, x0 + dx * sc, y0 + b * bh * sc, size, bh * sc);
      }
    } else ctx.drawImage(img, sx, 0, BOGO_FRAME, BOGO_FRAME, x0, y0, size, size);
    if (e.flash > 0) {
      ctx.globalAlpha = Math.min(1, e.flash * 9) * alpha;
      ctx.drawImage(tint.white, sx, 0, BOGO_FRAME, BOGO_FRAME, x0, y0, size, size);
    }
    ctx.restore();
    if (e.invuln > 0 && !clone) {
      ctx.strokeStyle = `rgba(255,236,160,${0.45 + 0.3 * Math.sin(this.time * 12)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
      ctx.stroke();
    }
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
      ctx.drawImage(this.atlas.swords[Math.min(this.atlas.swords.length - 1, run.swordTier)], 0, -14);
    } else {
      const prog = 1 - sw.t / 0.16;
      ctx.rotate(sw.a + Math.PI / 4 - 0.9 + prog * 1.4);
      ctx.drawImage(this.atlas.picks[Math.min(this.atlas.picks.length - 1, run.pickTier)], -2, -14);
    }
    ctx.restore();
  }

  // ---------------- снаряды, эффекты ----------------

  private drawProjs(f: Floor): void {
    const ctx = this.ctx;
    for (const pr of f.projs) {
      const px = pr.x * T, py = pr.y * T;
      if (!pr.mine && pr.wait > 0) {
        // висит перед броском: мигающее кольцо
        ctx.strokeStyle = `rgba(${hexToRgb(pr.color ?? '#ffffff')},${0.4 + 0.4 * Math.sin(this.time * 20)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, 4 + Math.sin(this.time * 10) * 0.8, 0, Math.PI * 2);
        ctx.stroke();
      } else if (!pr.mine && pr.kind !== 'ebomb' && pr.kind !== 'web') {
        // короткий след
        ctx.strokeStyle = `rgba(${hexToRgb(pr.color ?? PROJ_COLOR[pr.kind] ?? '#ffffff')},0.35)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - pr.vx * 0.05 * T, py - pr.vy * 0.05 * T);
        ctx.stroke();
      }
      switch (pr.kind) {
        case 'orb':
          ctx.fillStyle = pr.color ?? '#9ff4ff';
          ctx.beginPath();
          ctx.arc(px, py, pr.r * T * 0.75, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(px - 1, py - 1, 2, 2);
          break;
        case 'ice': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(Math.atan2(pr.vy, pr.vx));
          ctx.fillStyle = pr.color ?? '#bff4ff';
          ctx.beginPath();
          ctx.moveTo(5, 0);
          ctx.lineTo(-3, -2);
          ctx.lineTo(-4, 0);
          ctx.lineTo(-3, 2);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-1, -0.5, 5, 1);
          ctx.restore();
          break;
        }
        case 'spore': {
          const wob = Math.sin(this.time * 9 + pr.x * 5) * 0.6;
          ctx.fillStyle = pr.color ?? '#9dff7a';
          ctx.beginPath();
          ctx.arc(px, py, 2.6 + wob * 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(40,90,20,0.8)';
          ctx.fillRect(px - 1 + wob, py, 1, 1);
          ctx.fillRect(px + 1, py - 1 - wob, 1, 1);
          break;
        }
        case 'holy': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(this.time * 6 + pr.x);
          ctx.fillStyle = pr.color ?? '#fff2b0';
          ctx.fillRect(-4, -1, 8, 2);
          ctx.fillRect(-1, -4, 2, 8);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-1.5, -1.5, 3, 3);
          ctx.restore();
          break;
        }
        case 'glitch': {
          const ph = Math.floor(this.time * 20 + pr.x * 7) % 3;
          const j = ph === 2 ? 1 : 0;
          ctx.fillStyle = 'rgba(42,240,255,0.8)';
          ctx.fillRect(px - 3 + j + 1, py - 3, 6, 6);
          ctx.fillStyle = 'rgba(255,42,140,0.85)';
          ctx.fillRect(px - 3 - j - 1, py - 3, 6, 6);
          ctx.fillStyle = ph === 0 ? '#ffffff' : '#120612';
          ctx.fillRect(px - 2, py - 2, 4, 4);
          break;
        }
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
          ctx.fillStyle = pr.kind === 'efire' ? pr.color ?? '#ff5a2a' : '#ffb347';
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
    for (const t of f.torchList) ls.push({ x: t.x, y: t.y, r: t.hidden ? t.r * 0.8 : t.r + Math.sin(this.time * 9 + t.x) * 0.12 });
    for (const p of f.props) if (p.kind === 'lamp' && g.seen[g.i(p.x, p.y)]) ls.push({ x: p.x + 0.5, y: p.y + 0.5, r: 3.4 });
    for (const z of f.zones) if (z.kind !== 'poison') ls.push({ x: z.x, y: z.y, r: z.r + 0.5 });
    for (const st of f.strikes) if (st.kind === 'holy' || st.kind === 'fire') ls.push({ x: st.x, y: st.y, r: st.r * (1 - st.t / st.max) + 0.5 });
    for (const e of f.enemies) {
      const l = lum(e);
      if (l && !e.under && e.ghost > 0.3) ls.push({ x: e.x, y: e.y, r: l[0] });
    }
    for (const pr of f.projs) if (pr.kind === 'fire' || pr.kind === 'efire' || pr.kind === 'holy' || pr.kind === 'orb') ls.push({ x: pr.x, y: pr.y, r: 1.2 });
    for (const b of f.beams) {
      if (b.warn > 0) continue;
      for (let d = 1; d < b.len; d += 3) ls.push({ x: b.x + Math.cos(b.a) * d, y: b.y + Math.sin(b.a) * d, r: 1.6 });
    }
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
    for (const t of f.torchList) if (!t.hidden) put(t.x, t.y - 0.3, 1.6 + Math.sin(this.time * 9 + t.x) * 0.08, '255,150,60', 0.55);
    for (const p of f.props) if (p.kind === 'lamp' && g.seen[g.i(p.x, p.y)]) put(p.x + 0.5, p.y - 0.1, 1.4, '255,200,110', 0.5);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = g.i(x, y);
      if (!g.seen[i] && !f.oreSeen[i]) continue;
      const b = g.b[i];
      if (b === B.ORE) {
        const o = oreById(g.ore[i]);
        if (o.glow) put(x + 0.5, y + 0.5, 0.9, hexToRgb(o.glow), 0.35 + 0.1 * Math.sin(this.time * 3 + x));
      } else if (b === B.CRYSTAL) put(x + 0.5, y + 0.4, 1.2, '200,170,255', 0.45);
      else if (ROCK_GLOW[b] && g.seen[i] && (g.open(x - 1, y) || g.open(x + 1, y) || g.open(x, y - 1) || g.open(x, y + 1))) {
        const [r, rgb] = ROCK_GLOW[b];
        put(x + 0.5, y + 0.5, r, rgb, 0.22 + 0.08 * Math.sin(this.time * 2 + x * 1.3 + y));
      }
    }
    for (const z of f.zones) {
      const fade = Math.max(0, Math.min(1, z.t / 0.7, (z.max - z.t) / 0.2));
      put(z.x, z.y, z.r * 1.3, ZONE_RGB[z.kind], (z.kind === 'poison' ? 0.18 : 0.32) * fade);
    }
    for (const st of f.strikes) {
      const prog = 1 - st.t / st.max;
      if (st.kind === 'holy') {
        // луч с неба нацеливается на метку
        const w = (1 + 3 * prog) / T;
        ctx.globalAlpha = 0.15 + 0.5 * prog;
        ctx.fillStyle = 'rgba(255,240,180,0.9)';
        ctx.fillRect((st.x - w / 2) * T, (st.y - 10) * T, w * T, 10 * T);
      }
      put(st.x, st.y, st.r * (0.6 + 0.6 * prog), hexToRgb(STRIKE_COLOR[st.kind] ?? '#ffcf6a'), 0.12 + 0.25 * prog);
    }
    for (const b of f.beams) {
      const rgb = hexToRgb(b.color);
      const k = b.warn > 0 ? 0.12 : Math.max(0, Math.min(1, (b.max - b.t) / 0.08, b.t / 0.15)) * 0.45;
      for (let d = 0; d < b.len; d += 1.2) put(b.x + Math.cos(b.a) * d, b.y + Math.sin(b.a) * d, b.w * 1.3 + 0.4, rgb, k);
    }
    for (const w of f.waves) {
      const fade = Math.max(0, Math.min(1, (w.max - w.r) / 2));
      const n = Math.max(8, Math.floor(w.r * 3));
      for (let k = 0; k < n; k++) {
        const a = w.gapA + w.gapW / 2 + ((Math.PI * 2 - w.gapW) * k) / n;
        put(w.x + Math.cos(a) * w.r, w.y + Math.sin(a) * w.r, 0.7, hexToRgb(w.color), 0.25 * fade);
      }
    }
    for (const pl of f.fx.pillars) {
      const k = pl.life / pl.max, w = (0.4 + 0.9 * k) * T;
      const lg = ctx.createLinearGradient(0, (pl.y - 14) * T, 0, pl.y * T);
      lg.addColorStop(0, `rgba(${pl.color},0)`);
      lg.addColorStop(1, `rgba(${pl.color},${0.9 * k})`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = lg;
      ctx.fillRect(pl.x * T - w / 2, (pl.y - 14) * T, w, 14 * T);
      ctx.fillStyle = `rgba(255,255,255,${0.8 * k})`;
      ctx.fillRect(pl.x * T - w / 8, (pl.y - 14) * T, w / 4, 14 * T);
      put(pl.x, pl.y, 1.6, pl.color, 0.6 * k);
    }
    for (const pr of f.projs) {
      if (pr.kind === 'fire' || pr.kind === 'efire') put(pr.x, pr.y, 0.7, pr.color ? hexToRgb(pr.color) : '255,140,50', 0.7);
      else if (pr.kind === 'bolt' || pr.kind === 'bullet') put(pr.x, pr.y, 0.5, '140,220,255', 0.6);
      else if (!pr.mine && PROJ_COLOR[pr.kind] && pr.kind !== 'rock') put(pr.x, pr.y, 0.65, hexToRgb(pr.color ?? PROJ_COLOR[pr.kind]), 0.6);
    }
    for (const e of f.enemies) {
      const l = lum(e);
      if (l && !e.under && (f.vis[g.i(Math.floor(e.x), Math.floor(e.y))] || e.boss)) put(e.x, e.y - 0.2, l[0] * 0.45, l[1], 0.45 * e.ghost);
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
      if (e.sleep || e.under || isGod(e) || e.ghost < 0.5) continue;
      const cx = Math.floor(e.x), cy = Math.floor(e.y);
      if (!g.inside(cx, cy) || f.vis[g.i(cx, cy)]) continue;
      const d = Math.hypot(e.x - f.p.x, e.y - f.p.y);
      if (d > 8) continue;
      if (Math.sin(this.time * 2.3 + e.t * 7) > 0.93) continue;
      const a = Math.max(0.25, 1 - d / 9);
      const col = lum(e) ? '255,180,80' : '255,60,50';
      ctx.fillStyle = `rgba(${col},${a})`;
      const s = Math.max(1, e.def.size);
      const ey = (e.y - 0.25 * s) * T;
      ctx.fillRect(e.x * T - 2.5 * s, ey, 1.5 * s, 1.2 * s);
      ctx.fillRect(e.x * T + 1 * s, ey, 1.5 * s, 1.2 * s);
    }
  }

  /** Нимб и кольца света вокруг Богомирона (поверх тьмы). */
  private drawHalos(f: Floor): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const e of f.enemies) {
      if (!e.def.id.startsWith('bogomiron')) continue;
      const truth = e.def.id === 'bogomiron_true';
      const ap = this.godAppear(f, e);
      if (ap.alpha < 0.03) continue;
      const sc = (e.def.size * T * ap.k) / BOGO_FRAME;
      const hover = Math.sin(this.time * 2 + e.t) * 1.6;
      const cx = e.x * T, cy = (e.y - 0.55) * T + hover;
      const col = truth ? '255,90,180' : '255,236,160';
      // нимб над головой
      ctx.globalAlpha = ap.alpha;
      ctx.strokeStyle = `rgba(${col},0.85)`;
      ctx.lineWidth = 1.4 * sc;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 31 * sc, 10 * sc, 2.8 * sc, 0, 0, Math.PI * 2);
      ctx.stroke();
      const ha = this.time * 3;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(cx + Math.cos(ha) * 10 * sc - 1, cy - 31 * sc + Math.sin(ha) * 2.8 * sc - 1, 2, 2);
      // кольца сфер: с каждой фазой больше
      const rings = (truth ? 2 : 0) + e.phase;
      for (let r = 0; r < rings; r++) {
        const n = 6 + r * 3, R = (2.2 + r * 0.7) * T * ap.k, tilt = truth ? (r % 2 ? 0.5 : -0.5) : 0;
        const spd = (r % 2 ? -1 : 1) * (0.8 + r * 0.3);
        for (let k = 0; k < n; k++) {
          const a = this.time * spd + (k / n) * Math.PI * 2;
          const ox = Math.cos(a) * R, oy = Math.sin(a) * R * 0.45;
          const x = cx + ox * Math.cos(tilt) - oy * Math.sin(tilt), y = cy + 4 * sc + ox * Math.sin(tilt) + oy * Math.cos(tilt);
          const front = Math.sin(a) > 0 ? 1 : 0.55;
          ctx.globalAlpha = ap.alpha * 0.55 * front;
          ctx.drawImage(glow(r % 2 && truth ? '255,240,200' : col), x - 5, y - 5, 10, 10);
          ctx.globalAlpha = ap.alpha * front;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x - 1, y - 1, 2, 2);
        }
      }
      if (truth) {
        // трещины реальности вокруг истинного облика
        const tick = Math.floor(this.time * 8);
        ctx.strokeStyle = 'rgba(255,60,120,0.7)';
        ctx.lineWidth = 1;
        ctx.globalAlpha = ap.alpha;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          let a = hash2(tick, k, 5) * Math.PI * 2, x = cx + Math.cos(a) * 22 * sc, y = cy + Math.sin(a) * 26 * sc;
          ctx.moveTo(x, y);
          for (let j = 0; j < 4; j++) {
            a += (hash2(tick, k * 7 + j, 6) - 0.5) * 1.6;
            x += Math.cos(a) * 6;
            y += Math.sin(a) * 6;
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Изнанка: весь мир окрашен оттенком цикла. */
  private drawTint(tint: string, cw: number, ch: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.08;
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
  }

  /** Явление Богомирона: мрак, столп света, имя по буквам. Истинный: лучи со всех сторон, сбой и крик. */
  private drawCine(f: Floor, cw: number, ch: number): void {
    const c = f.cine!, ctx = this.ctx;
    const truth = c.kind === 'true';
    const p = c.t / c.dur;
    const b = f.bosses[0];
    const [gx, gy] = b ? this.toScreen(b.x, b.y - 0.55) : [cw / 2, ch / 2];
    const u = Math.min(cw, ch);
    const dark = Math.min(1, c.t / 0.8) * (truth ? 0.88 : 0.72);
    const hole = u * (0.06 + 0.3 * Math.max(0, (p - 0.45) / 0.55));
    const rg = ctx.createRadialGradient(gx, gy, hole * 0.3, gx, gy, hole + u * 0.55);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, `rgba(0,0,0,${dark})`);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rgb = truth ? '255,80,170' : '255,236,160';
    // столп света с небес
    const fall = Math.max(0, Math.min(1, (p - (truth ? 0.35 : 0.08)) / 0.3));
    if (fall > 0) {
      const w = u * (0.05 + 0.1 * fall) * (1 + 0.1 * Math.sin(this.time * 40));
      const bot = gy * fall;
      const lg = ctx.createLinearGradient(0, 0, 0, Math.max(1, bot));
      lg.addColorStop(0, `rgba(${rgb},0.08)`);
      lg.addColorStop(1, `rgba(${rgb},0.75)`);
      ctx.fillStyle = lg;
      ctx.fillRect(gx - w / 2, 0, w, bot);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillRect(gx - w / 8, 0, w / 4, bot);
      ctx.globalAlpha = fall;
      const gs = u * (0.25 + 0.2 * fall);
      ctx.drawImage(glow(rgb), gx - gs, gy - gs, gs * 2, gs * 2);
      ctx.globalAlpha = 1;
    }
    // искры поднимаются к свету
    for (let k = 0; k < 40; k++) {
      const q = (this.time * (0.15 + hash2(k, 1, 3) * 0.2) + hash2(k, 2, 3)) % 1;
      const x = gx + (hash2(k, 3, 3) - 0.5) * u * 1.2 * (1 - q * 0.6);
      const y = ch - q * (ch + 40);
      ctx.fillStyle = `rgba(${rgb},${0.6 * Math.min(1, c.t) * (1 - q)})`;
      ctx.fillRect(x, y, 3, 3);
    }
    if (truth) {
      // лучи сходятся со всех сторон, кольца сжимаются
      const conv = Math.max(0, Math.min(1, (p - 0.12) / 0.5));
      const R = Math.hypot(cw, ch);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + this.time * 0.5;
        const sx = gx + Math.cos(a) * R, sy = gy + Math.sin(a) * R;
        ctx.strokeStyle = `rgba(${i % 2 ? '255,70,150' : '255,236,210'},${0.2 + 0.45 * conv})`;
        ctx.lineWidth = u * 0.01 * (1 + conv * 1.5);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + (gx - sx) * conv, sy + (gy - sy) * conv);
        ctx.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const q = (this.time * 0.9 + i / 4) % 1;
        ctx.strokeStyle = `rgba(255,90,180,${(1 - q) * 0.55 * conv})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(gx, gy, u * 0.6 * (1 - q), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    if (truth) this.drawGlitch(0.25 + 0.75 * Math.max(0, Math.sin(p * Math.PI * 3)) * p, cw, ch);
    // имя
    const fs = Math.round(u * (truth ? 0.085 : 0.095));
    const ty = ch * 0.76;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (truth) {
      const a1 = Math.max(0, Math.min(1, (p - 0.3) / 0.1));
      if (a1 > 0) {
        ctx.font = `900 ${Math.round(fs * 0.55)}px system-ui, sans-serif`;
        ctx.globalAlpha = a1;
        ctx.fillStyle = '#ff5ab0';
        ctx.fillText('И С Т И Н Н Ы Й', cw / 2 + (Math.random() - 0.5) * 4, ty - fs * 0.9);
      }
    }
    const name = 'БОГОМИРОН';
    const s0 = truth ? 0.45 : 0.38, s1 = truth ? 0.85 : 0.78;
    if (p > s0) {
      ctx.font = `900 ${fs}px system-ui, sans-serif`;
      const full = ctx.measureText(name).width + fs * 0.25 * (name.length - 1);
      let x = cw / 2 - full / 2;
      for (let i = 0; i < name.length; i++) {
        const at = s0 + ((s1 - s0) * i) / name.length;
        const w = ctx.measureText(name[i]).width;
        if (p >= at) {
          const age = (p - at) * c.dur;
          const k = Math.max(1, 1.8 - age * 3);
          const locked = !truth || age > 0.5;
          const ch0 = locked ? name[i] : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          ctx.save();
          ctx.translate(x + w / 2, ty);
          ctx.scale(k, k);
          ctx.globalAlpha = Math.min(1, age * 4);
          if (truth) {
            const j = locked ? 2 : 6;
            ctx.fillStyle = 'rgba(255,40,120,0.85)';
            ctx.fillText(ch0, -j, 0);
            ctx.fillStyle = 'rgba(40,240,255,0.85)';
            ctx.fillText(ch0, j, 0);
          }
          ctx.shadowColor = truth ? '#ff3a9a' : '#ffd36b';
          ctx.shadowBlur = fs * 0.4;
          ctx.fillStyle = truth ? '#ffe0f0' : '#fff4c8';
          ctx.fillText(ch0, 0, 0);
          ctx.restore();
        }
        x += w + fs * 0.25;
      }
    }
    const sub = Math.max(0, Math.min(1, (p - (truth ? 0.88 : 0.8)) / 0.08));
    if (sub > 0) {
      ctx.globalAlpha = sub;
      ctx.font = `700 ${Math.round(fs * 0.4)}px system-ui, sans-serif`;
      ctx.fillStyle = truth ? '#ff9ad0' : '#ffe9a0';
      ctx.fillText(truth ? 'реальность трещит по швам' : 'Бог Недр', cw / 2, ty + fs * 0.95);
    }
    ctx.restore();
  }

  /** Сбой: полосы экрана съезжают, цветные блоки. */
  private drawGlitch(v: number, cw: number, ch: number): void {
    const ctx = this.ctx;
    const k = Math.min(1, v);
    if (k <= 0.01) return;
    const tick = Math.floor(this.time * 24);
    const n = 2 + Math.floor(8 * k);
    for (let i = 0; i < n; i++) {
      const y = Math.floor(hash2(i, tick, 11) * ch);
      const h = Math.min(ch - y, Math.floor(3 + hash2(i, tick, 12) * ch * 0.07 * k));
      const dx = Math.round((hash2(i, tick, 13) - 0.5) * cw * 0.08 * k);
      if (h > 0) ctx.drawImage(ctx.canvas, 0, y, cw, h, dx, y, cw, h);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = hash2(i, tick, 14) < 0.5 ? `rgba(255,40,140,${0.22 * k})` : `rgba(40,230,255,${0.22 * k})`;
      ctx.fillRect(hash2(i, tick, 15) * cw, hash2(i, tick, 16) * ch, cw * (0.05 + 0.3 * hash2(i, tick, 17)), 2 + hash2(i, tick, 18) * 12);
    }
    ctx.restore();
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
