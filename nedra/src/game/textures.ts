// Процедурная пиксельная графика (вид сверху 3/4): породы с гранями, руды, предметы, гномы-герои, враги.
import { B } from '../core/blocks';
import { hash2 } from '../core/rng';
import type { HeroDef } from '../data/heroes';
import { NPCS } from '../data/npcs';
import { BOGO_SHEET, BOGO_TRUE_SHEET } from './bogosprite';
import { ORES, type OreDef } from '../data/ores';

export const T = 16;
export const FACE_H = 6;

export type RGB = [number, number, number];
export type Sprite = HTMLCanvasElement;

export function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
export const shade = (c: RGB, k: number): RGB => [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k)];
export const mix = (a: RGB, b: RGB, t: number): RGB =>
  [clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t), clamp(a[2] + (b[2] - a[2]) * t)];
export const css = (c: RGB, a = 1): string => (a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);

class Pix {
  readonly w: number;
  readonly h: number;
  readonly d: Uint8ClampedArray;
  constructor(w = T, h = T) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  set(x: number, y: number, c: RGB, a = 255): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = c[0];
    this.d[i + 1] = c[1];
    this.d[i + 2] = c[2];
    this.d[i + 3] = a;
  }
  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }
  rgb(x: number, y: number): RGB {
    const i = (y * this.w + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2]];
  }
  rect(x0: number, y0: number, w: number, h: number, c: RGB): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }
  /** Эллипс с освещением сверху-слева: f(nx, ny) получает нормированные координаты. */
  ell(cx: number, cy: number, rx: number, ry: number, f: (nx: number, ny: number) => RGB | null): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny > 1) continue;
        const c = f(nx, ny);
        if (c) this.set(x, y, c);
      }
    }
  }
  blob(cx: number, cy: number, rx: number, ry: number, base: RGB, shine = 0.35): void {
    this.ell(cx, cy, rx, ry, (nx, ny) => {
      const l = -nx * 0.55 - ny * 0.8;
      const rim = nx * nx + ny * ny > 0.72 ? 0.82 : 1;
      return shade(base, (0.92 + l * shine) * rim);
    });
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let k = 0; k <= n; k++) this.set(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), c);
  }
  /** Тёмный контур вокруг непрозрачных пикселей. */
  outline(c: RGB = [16, 10, 8]): this {
    const src = new Uint8ClampedArray(this.d);
    const a = (x: number, y: number) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : src[(y * this.w + x) * 4 + 3]);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (a(x, y)) continue;
      if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) this.set(x, y, c);
    }
    return this;
  }
  flipX(): Pix {
    const p = new Pix(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = (y * this.w + x) * 4, j = (y * this.w + (this.w - 1 - x)) * 4;
      for (let k = 0; k < 4; k++) p.d[j + k] = this.d[i + k];
    }
    return p;
  }
  canvas(): Sprite {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const img = new ImageData(this.w, this.h);
    img.data.set(this.d);
    c.getContext('2d')!.putImageData(img, 0, 0);
    return c;
  }
  /** Белый силуэт для вспышки попадания. */
  white(): Sprite {
    const p = new Pix(this.w, this.h);
    for (let i = 0; i < this.d.length; i += 4) if (this.d[i + 3]) {
      p.d[i] = 255; p.d[i + 1] = 255; p.d[i + 2] = 255; p.d[i + 3] = 255;
    }
    return p.canvas();
  }
}

const rnd = (a: number, b: number, s: number) => hash2(a, b, s);

// ---------------- породы ----------------

type Pattern = 'dirt' | 'clay' | 'cobble' | 'speckle' | 'hex' | 'glass' | 'bedrock' | 'cracked' | 'crystal' | 'mycel' | 'ice' | 'magma' | 'rune' | 'star';

export const ROCK_STYLE: Record<number, { base: string; pattern: Pattern }> = {
  [B.DIRT]: { base: '#7a5236', pattern: 'dirt' },
  [B.CLAY]: { base: '#b0603a', pattern: 'clay' },
  [B.STONE]: { base: '#8a8a88', pattern: 'cobble' },
  [B.GRANITE]: { base: '#b48c8c', pattern: 'speckle' },
  [B.BASALT]: { base: '#4a5568', pattern: 'hex' },
  [B.OBSIDIAN]: { base: '#33263f', pattern: 'glass' },
  [B.BEDROCK]: { base: '#2b2523', pattern: 'bedrock' },
  [B.CRACKED]: { base: '#8a8a88', pattern: 'cracked' },
  [B.CRYSTALROCK]: { base: '#4a7aa8', pattern: 'crystal' },
  [B.MYCEL]: { base: '#6a4a7a', pattern: 'mycel' },
  [B.ICE]: { base: '#9ad0ec', pattern: 'ice' },
  [B.MAGMA]: { base: '#3a2420', pattern: 'magma' },
  [B.RUNE]: { base: '#8a7444', pattern: 'rune' },
  [B.STAR]: { base: '#2a1e48', pattern: 'star' },
};

/** Породы, которые светятся сами. */
export const ROCK_GLOW: Record<number, [number, string]> = {
  [B.MAGMA]: [1.1, '255,110,40'], [B.CRYSTALROCK]: [0.8, '120,200,255'], [B.STAR]: [0.7, '190,160,255'], [B.RUNE]: [0.5, '255,210,110'],
};

/** Ячейки Вороного: ближайшая и вторая точки. */
function voronoi(x: number, y: number, pts: [number, number][]): [number, number, number] {
  let d1 = 1e9, d2 = 1e9, id = 0;
  for (let k = 0; k < pts.length; k++) {
    for (const ox of [-16, 0, 16]) for (const oy of [-16, 0, 16]) {
      const d = Math.hypot(x - pts[k][0] - ox, y - pts[k][1] - oy);
      if (d < d1) { d2 = d1; d1 = d; id = k; } else if (d < d2) d2 = d;
    }
  }
  return [d1, d2, id];
}

function rockTop(base: RGB, pattern: Pattern, s: number): Pix {
  const p = new Pix();
  const pts: [number, number][] = [];
  for (let k = 0; k < (pattern === 'cobble' || pattern === 'cracked' ? 5 : 4); k++) pts.push([rnd(k, 1, s) * 16, rnd(k, 2, s) * 16]);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const n = rnd(x, y, s), blob = rnd(x >> 2, y >> 2, s + 7);
    let c = shade(base, 0.92 + blob * 0.12 + (n - 0.5) * 0.1);
    switch (pattern) {
      case 'dirt':
        if (n > 0.93) c = shade(base, 1.25);
        else if (n < 0.08) c = shade(base, 0.72);
        break;
      case 'clay': {
        const band = Math.sin((y + rnd(0, y, s) * 1.5) * 1.15 + x * 0.12);
        c = shade(base, 0.93 + band * 0.07 + (n - 0.5) * 0.06);
        if ((y + Math.floor(x / 7)) % 5 === 0 && n > 0.3) c = shade(base, 1.12);
        break;
      }
      case 'cobble':
      case 'cracked': {
        const [d1, d2, id] = voronoi(x + 0.5, y + 0.5, pts);
        if (d2 - d1 < 1.15) c = shade(base, 0.55);
        else {
          c = shade(base, 0.86 + rnd(id, 9, s) * 0.22 + (n - 0.5) * 0.06);
          const [u1, u2] = voronoi(x + 0.5, y - 0.5, pts);
          if (u2 - u1 < 1.15) c = shade(c, 1.18);
        }
        break;
      }
      case 'speckle':
        c = shade(base, 0.95 + (n - 0.5) * 0.08);
        if (n > 0.86) c = [58, 40, 42];
        else if (n > 0.78) c = [240, 228, 222];
        else if (n < 0.1) c = shade(base, 0.7);
        break;
      case 'hex': {
        // торцы базальтовых колонн
        const hx = x / 5.5, hy = y / 6.2 + (Math.floor(hx) % 2 ? 0.5 : 0);
        const fx = hx - Math.floor(hx), fy = hy - Math.floor(hy);
        const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
        const cell = rnd(Math.floor(hx), Math.floor(hy), s);
        c = edge < 0.12 ? shade(base, 0.55) : shade(base, 0.9 + cell * 0.25 + (fy < 0.3 ? 0.08 : 0) + (n - 0.5) * 0.05);
        break;
      }
      case 'glass': {
        c = shade(base, 0.8 + blob * 0.35 + (n - 0.5) * 0.05);
        const streak = (x + y + Math.floor(rnd(0, 0, s) * 16)) % 13;
        if (streak === 0 && n > 0.25) c = [196, 170, 230];
        else if (streak === 1 && n > 0.5) c = shade(base, 1.6);
        break;
      }
      case 'bedrock':
        c = shade(base, 0.8 + blob * 0.4 + (n - 0.5) * 0.2);
        if (n > 0.97) c = [110, 40, 30];
        break;
      case 'crystal': {
        // грани кристаллов: диагональные полосы светлых и тёмных граней
        const facet = Math.floor((x + y * 0.6 + rnd(Math.floor(y / 5), 3, s) * 6) / 4);
        const lit = rnd(facet, Math.floor(y / 5), s);
        c = shade(base, 0.75 + lit * 0.6 + (n - 0.5) * 0.06);
        if ((x + y) % 7 === 0 && lit > 0.6) c = [200, 240, 255];
        break;
      }
      case 'mycel': {
        // волокна грибницы и светящиеся точки
        const fib = Math.sin(x * 0.9 + Math.sin(y * 0.7 + s) * 2) * Math.cos(y * 0.5 + x * 0.2);
        c = shade(base, 0.85 + fib * 0.18 + (n - 0.5) * 0.08);
        if (n > 0.96) c = [190, 255, 150];
        else if (n < 0.06) c = [200, 160, 210];
        break;
      }
      case 'ice': {
        // прозрачная глыба: светлые блики и трещинки
        c = mix(shade(base, 0.9 + blob * 0.15), [235, 250, 255], Math.max(0, 0.35 - (x + y) / 40));
        if ((x * 3 + y * 5 + Math.floor(rnd(0, 1, s) * 9)) % 17 === 0) c = [255, 255, 255];
        if (n < 0.05) c = shade(base, 0.7);
        break;
      }
      case 'magma': {
        // тёмный камень с раскалёнными трещинами
        const [d1, d2] = voronoi(x + 0.5, y + 0.5, pts);
        c = shade(base, 0.85 + blob * 0.25 + (n - 0.5) * 0.1);
        if (d2 - d1 < 1.1) c = d2 - d1 < 0.5 ? [255, 210, 90] : [255, 110, 30];
        break;
      }
      case 'rune': {
        // кладка из блоков, на части - золотые знаки
        const bx = Math.floor((x + (Math.floor(y / 4) % 2 ? 4 : 0)) / 8), by = Math.floor(y / 4);
        const edge = y % 4 === 0 || (x + (by % 2 ? 4 : 0)) % 8 === 0;
        c = edge ? shade(base, 0.55) : shade(base, 0.88 + rnd(bx, by, s) * 0.2 + (n - 0.5) * 0.06);
        break;
      }
      case 'star':
        c = shade(base, 0.75 + blob * 0.5 + (n - 0.5) * 0.1);
        if (n > 0.975) c = [255, 255, 255];
        else if (n > 0.95) c = [200, 180, 255];
        break;
    }
    p.set(x, y, c);
  }
  if (pattern === 'rune') {
    // знак Предтеч
    const gx = 4 + Math.floor(rnd(1, 9, s) * 6), gy = 5 + Math.floor(rnd(2, 9, s) * 4);
    const gold: RGB = [255, 214, 110];
    p.line(gx, gy, gx + 3, gy, gold);
    p.line(gx + 1, gy - 1, gx + 1, gy + 2, gold);
    p.set(gx + 3, gy + 1, gold);
  }
  if (pattern === 'crystal') {
    // торчащий кристалл
    const cx = 3 + Math.floor(rnd(4, 4, s) * 10);
    for (let k = 0; k < 5; k++) {
      p.set(cx, 11 - k, [220, 245, 255]);
      p.set(cx + 1, 11 - k, [120, 180, 230]);
    }
  }
  if (pattern === 'dirt') {
    for (let k = 0; k < 3; k++) {
      const x = 1 + Math.floor(rnd(k, 3, s) * 13), y = 1 + Math.floor(rnd(k, 4, s) * 13);
      p.rect(x, y, 2, 2, shade(base, 1.3));
      p.set(x + 1, y + 1, shade(base, 0.85));
    }
    let x = Math.floor(rnd(5, 5, s) * 16), y = Math.floor(rnd(6, 6, s) * 6);
    for (let k = 0; k < 7; k++) {
      p.set(x, y, [70, 46, 28]);
      x += rnd(k, 7, s) > 0.5 ? 1 : 0;
      y += 1;
    }
  }
  if (pattern === 'cracked' || pattern === 'bedrock') {
    const lines = pattern === 'cracked' ? 2 : 3;
    for (let k = 0; k < lines; k++) {
      let x = 3 + Math.floor(rnd(k, 11, s) * 10), y = pattern === 'cracked' ? 1 : Math.floor(rnd(k, 12, s) * 10);
      for (let st = 0; st < 12; st++) {
        p.set(x, y, [12, 10, 10]);
        if (pattern === 'cracked') p.set(x + 1, y, shade(base, 0.4));
        x += rnd(k * 31 + st, 13, s) > 0.5 ? 1 : -1;
        y += 1;
      }
    }
  }
  return p;
}

function rockFace(base: RGB, pattern: Pattern, s: number): Pix {
  const p = new Pix(T, FACE_H);
  for (let y = 0; y < FACE_H; y++) for (let x = 0; x < T; x++) {
    const n = rnd(x, y + 40, s);
    let k = 0.66 - (y / FACE_H) * 0.2 + (n - 0.5) * 0.08;
    if (pattern === 'clay' && (y === 2 || y === 4)) k += 0.08;
    if ((pattern === 'cobble' || pattern === 'cracked') && (x + (y > 2 ? 4 : 0)) % 8 === 0) k -= 0.15;
    if (pattern === 'hex' && x % 6 === 0) k -= 0.18;
    if (pattern === 'hex' && x % 6 === 1) k += 0.08;
    if (pattern === 'speckle' && n > 0.85) k = 0.35;
    if (pattern === 'glass' && (x + y * 2) % 9 === 0) k = 1.1;
    if (pattern === 'crystal' && (x + y) % 5 === 0) k += 0.25;
    if (pattern === 'ice') k += 0.2;
    if (pattern === 'rune' && (y === 2 || x % 8 === 0)) k -= 0.15;
    let c = shade(base, Math.max(0.25, k));
    if (pattern === 'magma' && (x * 7 + y * 3) % 11 === 0) c = [255, 120, 40];
    if (pattern === 'star' && n > 0.93) c = [220, 200, 255];
    p.set(x, y, c);
  }
  if (pattern === 'dirt') for (let k = 0; k < 2; k++) {
    const x = 2 + Math.floor(rnd(k, 50, s) * 12);
    for (let y = 1; y < FACE_H; y++) p.set(x + (y > 3 ? 1 : 0), y, [60, 40, 24]);
  }
  for (let x = 0; x < T; x++) p.set(x, 0, shade(base, 1.15));
  return p;
}

// ---------------- руда, предметы ----------------

function oreOverlay(o: OreDef, s: number): Pix {
  const p = new Pix();
  const c = hex(o.color), lt = hex(o.light), dk = hex(o.dark);
  if (o.kind === 'gem') {
    for (let k = 0; k < 2; k++) {
      const cx = 4 + Math.floor(rnd(k, 1, s) * 8), cy = 4 + Math.floor(rnd(k, 2, s) * 8), r = k ? 2 : 3;
      for (let y = -r - 1; y <= r + 1; y++) for (let x = -r; x <= r; x++) {
        if (Math.abs(x) * 1.3 + Math.abs(y) > r + 0.5) continue;
        const col = x <= 0 && y <= 0 ? lt : x > 0 && y > 0 ? dk : c;
        p.set(cx + x, cy + y, col);
      }
      p.set(cx - 1, cy - 1, [255, 255, 255]);
    }
    return p.outline(shade(dk, 0.5));
  }
  if (o.kind === 'relic') {
    for (let k = 0; k < 3; k++) {
      const cx = 4 + rnd(k, 1, s) * 8, cy = 4 + rnd(k, 2, s) * 8;
      p.ell(cx, cy, 2.3, 2, (nx, ny) => (nx * nx + ny * ny > 0.55 ? dk : nx + ny < -0.3 ? lt : c));
      p.set(cx, cy, dk);
    }
    return p.outline(shade(dk, 0.5));
  }
  const n = o.kind === 'coal' ? 5 : 4;
  for (let k = 0; k < n; k++) {
    const cx = 3 + rnd(k, 1, s) * 10, cy = 3 + rnd(k, 2, s) * 10, r = 1.3 + rnd(k, 3, s) * 1.2;
    p.ell(cx, cy, r, r * 0.9, (nx, ny) => (o.kind === 'coal' && rnd(Math.floor(nx * 9), Math.floor(ny * 9), s + k) > 0.82 ? lt
      : nx + ny < -0.6 ? lt : nx + ny > 0.6 ? dk : c));
  }
  return p.outline(shade(dk, 0.6));
}

function chest(tier: number): Pix {
  const p = new Pix();
  if (tier === 4) {
    // россыпь монет
    for (let k = 0; k < 9; k++) {
      const x = 3 + rnd(k, 1, 77) * 10, y = 6 + rnd(k, 2, 77) * 7;
      p.ell(x, y, 2.2, 1.6, (nx, ny) => (nx + ny < -0.4 ? [255, 240, 160] : nx + ny > 0.5 ? [160, 110, 20] : [232, 193, 63]));
    }
    return p.outline();
  }
  const body: RGB = tier === 3 ? [232, 186, 60] : tier === 2 ? [120, 130, 140] : [140, 90, 45];
  const band: RGB = tier === 3 ? [150, 100, 20] : tier === 2 ? [70, 76, 84] : [90, 90, 96];
  p.rect(2, 6, 12, 8, body);
  p.rect(2, 3, 12, 4, shade(body, 1.2));
  p.rect(2, 7, 12, 1, shade(body, 0.6));
  for (const x of [4, 11]) p.rect(x, 3, 1, 11, band);
  p.rect(7, 7, 2, 3, [255, 220, 90]);
  p.set(7, 9, [60, 40, 10]);
  p.rect(2, 13, 12, 1, shade(body, 0.55));
  return p.outline();
}

function crate(): Pix {
  const p = new Pix();
  const w: RGB = [176, 128, 72];
  p.rect(2, 2, 12, 12, w);
  for (let y = 2; y < 14; y += 4) p.rect(2, y, 12, 1, shade(w, 0.7));
  for (let k = 0; k < 12; k++) {
    p.set(2 + k, 2 + k, shade(w, 0.6));
    p.set(13 - k, 2 + k, shade(w, 0.6));
  }
  p.rect(2, 2, 12, 1, shade(w, 1.25));
  return p.outline();
}

function tnt(): Pix {
  const p = new Pix();
  const red: RGB = [200, 50, 40];
  p.rect(3, 5, 10, 9, red);
  for (let x = 3; x < 13; x++) p.set(x, 5 + Math.round(Math.sin(x) * 0.3), shade(red, 1.2));
  p.ell(8, 5, 5, 2, () => shade(red, 1.3));
  p.rect(3, 8, 10, 1, [40, 30, 30]);
  p.rect(3, 12, 10, 1, [40, 30, 30]);
  p.rect(4, 6, 1, 7, shade(red, 1.3));
  p.line(8, 4, 10, 1, [90, 80, 70]);
  p.set(10, 0, [255, 230, 120]);
  p.set(11, 1, [255, 160, 60]);
  return p.outline();
}

function crystal(): Pix {
  const p = new Pix();
  const shards: [number, number, number][] = [[5, 13, 7], [9, 13, 10], [12, 13, 6]];
  for (const [x, y, h] of shards) {
    for (let k = 0; k < h; k++) {
      const w = Math.max(0, Math.round(1.6 - (k / h) * 1.2));
      for (let dx = -w; dx <= w; dx++) p.set(x + dx, y - k, dx < 0 ? [244, 236, 255] : dx > 0 ? [150, 120, 220] : [205, 184, 255]);
    }
  }
  return p.outline([50, 30, 80]);
}

function door(): Pix {
  const p = new Pix();
  p.rect(0, 0, 16, 16, [40, 34, 34]);
  for (let x = 1; x < 16; x += 3) {
    p.rect(x, 0, 2, 16, [96, 92, 100]);
    p.rect(x, 0, 1, 16, [150, 146, 156]);
  }
  p.rect(0, 2, 16, 1, [70, 66, 72]);
  p.rect(0, 13, 16, 1, [70, 66, 72]);
  p.ell(8, 8, 3, 3, (nx, ny) => (nx * nx + ny * ny > 0.4 ? [255, 80, 60] : [255, 190, 120]));
  return p;
}

// ---------------- пол и украшения ----------------

function floorTile(base: RGB, s: number, dug: boolean): Pix {
  const p = new Pix();
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const n = rnd(x, y, s), blob = rnd(x >> 2, y >> 2, s + 3), big = rnd(x >> 3, y >> 3, s + 9);
    let c = shade(base, 0.9 + blob * 0.1 + big * 0.06 + (n - 0.5) * 0.07);
    if (dug) c = shade(mix(c, [150, 130, 110], 0.08), 1.06);
    if (n > 0.975) c = shade(base, 1.35);
    else if (n < 0.025) c = shade(base, 0.7);
    p.set(x, y, c);
  }
  // камешки и трещинки
  for (let k = 0; k < 2; k++) {
    const x = 2 + Math.floor(rnd(k, 21, s) * 11), y = 2 + Math.floor(rnd(k, 22, s) * 11);
    p.set(x, y, shade(base, 1.4));
    p.set(x + 1, y, shade(base, 1.2));
    p.set(x, y + 1, shade(base, 0.75));
  }
  if (rnd(3, 3, s) > 0.5) {
    let x = Math.floor(rnd(4, 4, s) * 12) + 2, y = Math.floor(rnd(5, 5, s) * 12) + 2;
    for (let k = 0; k < 4; k++) {
      p.set(x, y, shade(base, 0.68));
      x += rnd(k, 31, s) > 0.5 ? 1 : 0;
      y += rnd(k, 32, s) > 0.4 ? 1 : -1;
    }
  }
  if (dug) for (let k = 0; k < 3; k++) {
    const x = 2 + Math.floor(rnd(k, 8, s) * 11), y = 2 + Math.floor(rnd(k, 9, s) * 11);
    p.set(x, y, shade(base, 0.72));
    p.set(x + 1, y + 1, shade(base, 0.72));
    p.set(x + 2, y + 2, shade(base, 0.8));
    p.set(x + 1, y, shade(base, 1.15));
  }
  return p;
}

function deco(kind: number, base: RGB): Pix {
  const p = new Pix();
  if (kind === 1) {
    for (let k = 0; k < 4; k++) {
      const x = 2 + rnd(k, 1, 3) * 12, y = 2 + rnd(k, 2, 3) * 12;
      p.ell(x, y, 1.3, 1, () => shade(base, 1.5));
    }
  } else if (kind === 2) {
    p.line(1, 3, 6, 6, [96, 70, 40]);
    p.line(6, 6, 9, 5, [96, 70, 40]);
    p.line(6, 6, 7, 10, [86, 60, 34]);
  } else if (kind === 3) {
    p.line(4, 10, 11, 7, [226, 218, 198]);
    p.rect(3, 9, 2, 2, [240, 232, 214]);
    p.rect(11, 6, 2, 2, [240, 232, 214]);
    p.ell(6, 5, 2, 1.6, () => [232, 224, 206]);
    p.set(5, 5, [40, 30, 30]);
  } else if (kind === 4) {
    p.rect(7, 9, 2, 4, [230, 220, 200]);
    p.ell(8, 8, 3.5, 2.2, (nx, ny) => (ny < -0.2 ? [120, 200, 230] : [70, 140, 190]));
    p.set(7, 7, [220, 250, 255]);
  } else if (kind === 5) {
    for (let k = 0; k < 9; k++) {
      p.set(k, 0, [220, 220, 230], 150);
      p.set(0, k, [220, 220, 230], 150);
      p.set(k, k, [220, 220, 230], 130);
    }
    p.line(0, 5, 5, 0, [220, 220, 230]);
  } else if (kind === 6) {
    for (const [x, y, h] of [[4, 11, 4], [6, 12, 6], [11, 10, 3]] as const) {
      for (let k = 0; k < h; k++) { p.set(x, y - k, [190, 240, 255]); p.set(x + 1, y - k, [100, 170, 220]); }
    }
  } else if (kind === 7) {
    for (let k = 0; k < 3; k++) {
      const x = 3 + rnd(k, 5, 7) * 10, y = 4 + rnd(k, 6, 7) * 8;
      p.rect(x, y + 1, 1, 2, [220, 200, 230]);
      p.ell(x + 0.5, y, 1.6, 1, () => [190, 90, 220]);
      p.set(x, y - 1, [210, 255, 170]);
    }
  } else if (kind === 8) {
    // наледь: бледная лужица неровного края и пара бликов
    p.ell(7, 9, 5, 2.6, (nx, ny) => (nx + ny < -0.5 ? [228, 246, 255] : [176, 214, 236]));
    p.ell(11, 7.5, 2.4, 1.6, () => [176, 214, 236]);
    for (let x = 3; x <= 12; x++) if (p.alpha(x, 7) && rnd(x, 7, 41) < 0.5) p.set(x, 7, [150, 196, 224]);
    p.line(5, 8, 7, 8, [255, 255, 255]);
    p.set(11, 7, [255, 255, 255]);
  } else if (kind === 9) {
    p.line(2, 4, 7, 8, [255, 120, 40]);
    p.line(7, 8, 9, 13, [255, 90, 30]);
    p.set(12, 5, [255, 200, 90]);
    p.set(4, 12, [255, 160, 60]);
  } else if (kind === 10) {
    // плита Предтеч с рунным кругом
    const gold: RGB = [214, 176, 92];
    p.rect(2, 2, 12, 12, shade(base, 1.12));
    p.rect(3, 3, 10, 10, shade(base, 0.9));
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      p.set(Math.round(7.5 + Math.cos(a) * 3.4), Math.round(7.5 + Math.sin(a) * 3.4), gold, 150);
    }
    p.rect(7, 7, 2, 2, gold);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) p.set(Math.round(7.5 + dx * 5.4), Math.round(7.5 + dy * 5.4), gold, 210);
  }
  return p;
}

// ---------------- обстановка комнат ----------------

function prop(kind: string): Pix {
  const p = new Pix(16, 24);
  switch (kind) {
    case 'merchant': {
      p.rect(9, 9, 6, 9, [120, 84, 50]);
      p.rect(9, 9, 6, 1, [160, 120, 70]);
      p.ell(7, 15, 4, 5, () => [70, 120, 60]);
      p.ell(7, 9, 3, 3, () => [240, 200, 160]);
      p.ell(7, 6, 4, 2.5, () => [50, 100, 50]);
      p.set(6, 9, [30, 20, 20]);
      p.set(8, 9, [30, 20, 20]);
      p.ell(7, 12, 2.5, 2, () => [220, 220, 210]);
      p.rect(4, 20, 3, 2, [60, 40, 30]);
      p.rect(8, 20, 3, 2, [60, 40, 30]);
      break;
    }
    case 'shrine': {
      p.rect(2, 14, 12, 8, [90, 86, 96]);
      p.rect(2, 14, 12, 1, [140, 136, 146]);
      p.rect(4, 8, 8, 6, [110, 104, 116]);
      p.ell(8, 10, 2.5, 2.5, (nx, ny) => (nx * nx + ny * ny < 0.4 ? [255, 120, 100] : [190, 40, 50]));
      for (const x of [3, 12]) {
        p.rect(x, 10, 1, 4, [230, 220, 190]);
        p.set(x, 9, [255, 200, 80]);
        p.set(x, 8, [255, 120, 40]);
      }
      break;
    }
    case 'anvil': {
      p.rect(4, 17, 8, 5, [110, 72, 40]);
      p.rect(3, 12, 11, 4, [70, 74, 82]);
      p.rect(1, 12, 3, 2, [70, 74, 82]);
      p.rect(3, 12, 11, 1, [150, 156, 166]);
      p.rect(6, 15, 5, 2, [60, 62, 70]);
      p.line(10, 6, 13, 10, [120, 80, 40]);
      p.rect(8, 5, 4, 2, [140, 144, 150]);
      break;
    }
    case 'spring': {
      p.ell(8, 16, 7, 5, (nx, ny) => (nx * nx + ny * ny > 0.75 ? [120, 116, 110] : ny < -0.3 ? [140, 210, 250] : [60, 140, 210]));
      p.set(6, 14, [240, 255, 255]);
      p.set(10, 17, [200, 240, 255]);
      break;
    }
    case 'lamp': {
      p.rect(7, 8, 2, 14, [70, 50, 34]);
      p.rect(5, 3, 6, 6, [60, 54, 50]);
      p.rect(6, 4, 4, 4, [255, 214, 110]);
      p.set(7, 5, [255, 250, 220]);
      p.rect(5, 2, 6, 1, [90, 84, 80]);
      break;
    }
    case 'mushroom': {
      p.rect(7, 16, 2, 5, [236, 226, 206]);
      p.ell(8, 15, 5, 3, (nx, ny) => (ny < -0.3 ? [235, 70, 60] : [190, 40, 40]));
      p.set(6, 14, [255, 240, 230]);
      p.set(10, 15, [255, 240, 230]);
      p.set(8, 13, [255, 240, 230]);
      break;
    }
    case 'exit': {
      p.ell(8, 15, 7, 6, (nx, ny) => (nx * nx + ny * ny > 0.7 ? [40, 30, 24] : [8, 6, 6]));
      for (const x of [5, 10]) p.rect(x, 10, 1, 11, [150, 110, 60]);
      for (let y = 12; y < 21; y += 3) p.rect(5, y, 6, 1, [180, 136, 80]);
      break;
    }
    case 'lift': {
      p.rect(1, 10, 14, 11, [120, 84, 48]);
      for (let y = 10; y < 21; y += 3) p.rect(1, y, 14, 1, [90, 60, 34]);
      for (const x of [1, 14]) p.rect(x, 0, 1, 11, [170, 160, 140]);
      break;
    }
  }
  return p.outline();
}

// ---------------- гномы-герои ----------------

export type Dir = 'down' | 'up' | 'left' | 'right';

export interface HeroSprites {
  frames: Record<Dir, Sprite[]>;
  flash: Record<Dir, Sprite[]>;
  portrait: Sprite;
}

function gnome(look: HeroDef['look'], dir: Dir, frame: number): Pix {
  const p = new Pix();
  const skin: RGB = [240, 196, 156], hat = hex(look.hat), cl = hex(look.clothes);
  const beard = look.beard ? hex(look.beard) : null, hair = look.hair ? hex(look.hair) : null;
  const boot: RGB = [70, 46, 30];
  const step = frame === 1 ? 1 : 0;
  // ноги
  if (dir === 'left' || dir === 'right') {
    p.rect(6 - step, 13, 2, 2, boot);
    p.rect(9 + step, 13, 2, 2, boot);
  } else {
    p.rect(5, 13 + (step ? -1 : 0), 2, 2, boot);
    p.rect(9, 13 + (step ? 0 : -1), 2, 2, boot);
  }
  // тело
  p.rect(5, 8, 6, 5, cl);
  p.rect(5, 8, 6, 1, shade(cl, 1.2));
  p.rect(5, 11, 6, 1, [70, 46, 26]);
  if (dir !== 'up') p.set(8, 11, [230, 190, 80]);
  // руки
  if (dir === 'down' || dir === 'up') {
    p.rect(4, 9, 1, 3, shade(cl, 0.8));
    p.rect(11, 9, 1, 3, shade(cl, 0.8));
    p.set(4, 12, skin);
    p.set(11, 12, skin);
  } else {
    const ax = dir === 'right' ? 9 : 6;
    p.rect(ax, 9, 1, 3, shade(cl, 0.75));
    p.set(ax, 12, skin);
  }
  // голова
  p.rect(5, 4, 6, 5, skin);
  if (dir === 'down') {
    p.set(6, 6, [30, 20, 16]);
    p.set(9, 6, [30, 20, 16]);
    p.set(7, 7, shade(skin, 0.85));
    p.set(8, 7, shade(skin, 0.85));
    if (beard) {
      p.rect(5, 7, 6, 3, beard);
      p.rect(6, 10, 4, 1, beard);
      p.set(7, 11, beard);
      p.set(8, 7, shade(skin, 0.8));
    }
    if (hair) {
      p.rect(4, 4, 1, 6, hair);
      p.rect(11, 4, 1, 6, hair);
      p.set(4, 10, hair);
      p.set(11, 10, hair);
    }
  } else if (dir === 'up') {
    p.rect(5, 4, 6, 5, hair ?? shade(skin, 0.9));
    if (hair) p.rect(7, 9, 2, 3, hair);
    if (beard) { p.set(4, 7, beard); p.set(11, 7, beard); }
  } else {
    const f = dir === 'right' ? 1 : -1;
    const ex = dir === 'right' ? 9 : 6;
    p.set(ex, 6, [30, 20, 16]);
    p.set(dir === 'right' ? 11 : 4, 6, skin);
    if (beard) {
      p.rect(dir === 'right' ? 8 : 5, 7, 3, 3, beard);
      p.set(dir === 'right' ? 11 : 4, 8, beard);
    }
    if (hair) {
      p.rect(dir === 'right' ? 5 : 9, 4, 2, 6, hair);
      p.set(dir === 'right' ? 5 : 10, 10, hair);
    }
    void f;
  }
  // каска с фонарём
  p.ell(8, 4, 4, 2.6, (nx, ny) => shade(hat, ny < -0.2 ? 1.18 : 1));
  p.rect(3, 4, 10, 1, shade(hat, 0.75));
  if (dir === 'down') p.rect(7, 2, 2, 2, [255, 236, 150]);
  else if (dir === 'left') p.rect(4, 3, 2, 2, [255, 236, 150]);
  else if (dir === 'right') p.rect(10, 3, 2, 2, [255, 236, 150]);
  return p.outline();
}

export function buildHero(look: HeroDef['look']): HeroSprites {
  const frames = {} as Record<Dir, Sprite[]>, flash = {} as Record<Dir, Sprite[]>;
  for (const d of ['down', 'up', 'left', 'right'] as Dir[]) {
    const ps = [0, 1].map((k) => gnome(look, d, k));
    frames[d] = ps.map((x) => x.canvas());
    flash[d] = ps.map((x) => x.white());
  }
  return { frames, flash, portrait: frames.down[0] };
}

// ---------------- инструменты ----------------

export const TIER_METAL = ['#a0703a', '#d07a3a', '#b8c0c6', '#dfe7ec', '#8fd6ff', '#c76bff', '#e2e8ff'];

function pickSprite(tier: number): Pix {
  const p = new Pix();
  const m = hex(TIER_METAL[tier] ?? TIER_METAL[0]);
  p.line(3, 13, 11, 5, [120, 80, 44]);
  p.line(4, 13, 12, 5, [150, 104, 60]);
  for (let k = 0; k < 6; k++) {
    p.set(8 + k, 2 + Math.round(k * 0.3), shade(m, 1.15));
    p.set(8 + k, 3 + Math.round(k * 0.3), m);
    p.set(12 - k, 2 + Math.round(k * 0.9), shade(m, 0.9));
  }
  return p.outline();
}

function swordSprite(tier: number): Pix {
  const p = new Pix();
  const m = hex(tier === 0 ? '#9a7a62' : TIER_METAL[tier] ?? TIER_METAL[0]);
  for (let k = 0; k < 10; k++) {
    p.set(5 + k, 10 - k, shade(m, 1.2));
    p.set(6 + k, 10 - k, m);
    p.set(6 + k, 11 - k, shade(m, 0.75));
  }
  p.line(2, 10, 6, 14, [200, 160, 60]);
  p.line(2, 14, 4, 12, [110, 70, 40]);
  return p.outline();
}

// ---------------- враги ----------------

export interface EnemySprites {
  frames: Sprite[];
  flash: Sprite[];
  size: number;
}

type Painter = (p: Pix, f: number) => void;

const EYE: RGB = [20, 12, 10];

function eyes(p: Pix, x0: number, x1: number, y: number, c: RGB = EYE, glint = true): void {
  p.set(x0, y, c);
  p.set(x1, y, c);
  if (glint) {
    p.set(x0, y - 1, [255, 255, 255]);
    p.set(x1, y - 1, [255, 255, 255]);
  }
}

function legs(p: Pix, cx: number, cy: number, n: number, span: number, len: number, c: RGB, f: number): void {
  for (let k = 0; k < n; k++) {
    const yy = cy - span / 2 + (span * k) / Math.max(1, n - 1);
    const wig = (k + f) % 2 ? 1 : -1;
    p.line(cx - 2, yy, cx - 2 - len, yy + wig, c);
    p.line(cx + 2, yy, cx + 2 + len, yy - wig, c);
  }
}

const PAINT: Record<string, { size: number; paint: Painter }> = {
  slime: { size: 16, paint: (p, f) => {
    const c: RGB = [111, 207, 90];
    p.blob(8, 10 + f * 0.5, 6 + f, 5 - f, c, 0.5);
    p.set(5, 8, [220, 255, 200]);
    eyes(p, 6, 10, 10);
  } },
  slimeling: { size: 16, paint: (p, f) => {
    p.blob(8, 11 + f * 0.5, 4 + f * 0.5, 3.5 - f * 0.5, [143, 224, 122], 0.5);
    eyes(p, 7, 9, 11, EYE, false);
  } },
  queen: { size: 32, paint: (p, f) => {
    const c: RGB = [90, 184, 74];
    p.blob(16, 20 + f, 13 + f, 10 - f, c, 0.5);
    p.ell(10, 15, 3, 2, () => [200, 255, 190]);
    eyes(p, 12, 20, 19);
    p.rect(11, 22, 10, 1, [40, 80, 30]);
    for (let k = 0; k < 5; k++) {
      p.rect(10 + k * 3, 6 + (k % 2 ? 0 : -2), 2, 4 - (k % 2 ? 0 : -2), [240, 200, 60]);
    }
    p.rect(10, 9, 13, 2, [220, 170, 40]);
    p.set(16, 9, [220, 40, 60]);
  } },
  beetle: { size: 16, paint: (p, f) => {
    legs(p, 8, 9, 3, 6, 3, [50, 34, 24], f);
    p.blob(8, 9, 4.5, 5, [138, 90, 58], 0.4);
    p.line(8, 5, 8, 13, [80, 50, 30]);
    p.ell(8, 4, 2.5, 2, () => [70, 46, 30]);
    p.set(6, 2, [40, 26, 18]);
    p.set(10, 2, [40, 26, 18]);
    p.set(7, 4, [255, 200, 120]);
    p.set(9, 4, [255, 200, 120]);
  } },
  firebeetle: { size: 16, paint: (p, f) => {
    legs(p, 8, 9, 3, 6, 3, [70, 30, 20], f);
    p.blob(8, 9, 4.5, 5, [255, 122, 58], 0.4);
    p.line(8, 5, 8, 13, [150, 50, 20]);
    p.set(6, 8, [255, 230, 120]);
    p.set(10, 11, [255, 230, 120]);
    p.set(6, 11 - f, [255, 250, 200]);
    p.ell(8, 4, 2.5, 2, () => [110, 40, 20]);
    p.set(7, 4, [255, 240, 120]);
    p.set(9, 4, [255, 240, 120]);
  } },
  bat: { size: 16, paint: (p, f) => {
    const w: RGB = [92, 66, 110];
    if (f === 0) {
      for (let k = 0; k < 6; k++) {
        p.line(7, 8, 1 + k * 0.3, 4 + k, w);
        p.line(9, 8, 15 - k * 0.3, 4 + k, w);
      }
    } else {
      for (let k = 0; k < 4; k++) {
        p.line(7, 8, 3, 9 + k, w);
        p.line(9, 8, 13, 9 + k, w);
      }
    }
    p.blob(8, 8, 2.5, 3, [122, 90, 138], 0.3);
    p.set(6, 5, w);
    p.set(10, 5, w);
    p.set(7, 7, [255, 80, 70]);
    p.set(9, 7, [255, 80, 70]);
  } },
  spider: { size: 16, paint: (p, f) => {
    legs(p, 8, 8, 4, 8, 4, [40, 30, 40], f);
    p.blob(8, 10, 4, 4, [90, 74, 90], 0.3);
    p.blob(8, 5, 2.5, 2, [70, 56, 70], 0.3);
    p.set(7, 4, [255, 60, 60]);
    p.set(9, 4, [255, 60, 60]);
    p.set(8, 5, [255, 60, 60]);
  } },
  spiderling: { size: 16, paint: (p, f) => {
    legs(p, 8, 9, 3, 4, 2, [50, 40, 50], f);
    p.blob(8, 10, 2.5, 2.5, [106, 90, 106], 0.3);
    p.set(7, 8, [255, 70, 70]);
    p.set(9, 8, [255, 70, 70]);
  } },
  mother: { size: 32, paint: (p, f) => {
    for (let k = 0; k < 4; k++) {
      const y = 9 + k * 4, wig = (k + f) % 2 ? 2 : -2;
      p.line(12, y, 2, y - 4 + wig, [40, 30, 40]);
      p.line(2, y - 4 + wig, 0, y + 3, [40, 30, 40]);
      p.line(20, y, 30, y - 4 - wig, [40, 30, 40]);
      p.line(30, y - 4 - wig, 31, y + 3, [40, 30, 40]);
    }
    p.blob(16, 19, 9, 9, [74, 58, 74], 0.35);
    p.blob(16, 9, 5, 4, [60, 46, 60], 0.3);
    p.rect(15, 15, 3, 2, [220, 40, 40]);
    p.rect(14, 18, 5, 1, [220, 40, 40]);
    p.rect(15, 20, 3, 2, [220, 40, 40]);
    for (const x of [13, 15, 17, 19]) p.set(x, 8, [255, 70, 70]);
  } },
  kobold: { size: 16, paint: (p, f) => {
    const s: RGB = [176, 122, 74];
    p.rect(5, 13, 2, 2, [80, 50, 30]);
    p.rect(9, 13, 2, 2, [80, 50, 30]);
    p.blob(8, 10, 3.5, 3.5, [120, 90, 60], 0.3);
    p.blob(8, 6, 3.5, 3, s, 0.4);
    p.rect(7, 7, 2, 2, shade(s, 1.15));
    p.set(4, 4, s);
    p.set(12, 4, s);
    eyes(p, 6, 10, 5, [255, 220, 80], false);
    if (f) p.blob(12, 3, 2, 2, [150, 140, 130], 0.4);
    else p.blob(12, 9, 2, 2, [150, 140, 130], 0.4);
  } },
  crab: { size: 16, paint: (p, f) => {
    legs(p, 8, 10, 3, 4, 4, [100, 80, 66], f);
    p.blob(8, 10, 5.5, 4, [138, 122, 106], 0.45);
    p.blob(3, 5 - f * 0.5, 2.5, 2, [160, 140, 120], 0.4);
    p.blob(13, 5 - f * 0.5, 2.5, 2, [160, 140, 120], 0.4);
    p.set(6, 7, EYE);
    p.set(10, 7, EYE);
    p.line(6, 8, 6, 9, [100, 90, 80]);
    p.line(10, 8, 10, 9, [100, 90, 80]);
  } },
  golem: { size: 32, paint: (p, f) => {
    const st: RGB = [138, 134, 128];
    p.blob(8, 18 + f, 5, 6, shade(st, 0.9), 0.4);
    p.blob(24, 18 - f, 5, 6, shade(st, 0.9), 0.4);
    p.rect(10, 26, 5, 5, shade(st, 0.7));
    p.rect(18, 26, 5, 5, shade(st, 0.7));
    p.blob(16, 17, 9, 10, st, 0.45);
    p.blob(16, 6, 5, 4, shade(st, 1.05), 0.4);
    p.set(14, 6, [120, 240, 255]);
    p.set(18, 6, [120, 240, 255]);
    p.ell(16, 17, 2.5, 2.5, () => [120, 230, 255]);
    p.line(11, 12, 14, 20, shade(st, 0.6));
    p.line(20, 11, 22, 19, shade(st, 0.6));
    p.rect(9, 8, 3, 2, [90, 140, 70]);
  } },
  wisp: { size: 16, paint: (p, f) => {
    p.ell(8, 9, 6 - f * 0.5, 6.5, (nx, ny) => (nx * nx + ny * ny > 0.6 ? [255, 90, 30] : [255, 170, 60]));
    p.ell(8, 9, 3.5, 4, () => [255, 230, 140]);
    p.set(6 + f, 2, [255, 140, 40]);
    p.set(10 - f, 1, [255, 120, 30]);
    eyes(p, 7, 9, 9, [90, 30, 10], false);
  } },
  goblin: { size: 16, paint: (p, f) => {
    const s: RGB = [106, 160, 74];
    p.rect(5, 13, 2, 2, [60, 40, 26]);
    p.rect(9, 13, 2, 2, [60, 40, 26]);
    p.rect(5, 9, 6, 4, [120, 80, 50]);
    p.blob(8, 6, 3.5, 3, s, 0.4);
    p.line(4, 5, 2, 3, s);
    p.line(12, 5, 14, 3, s);
    eyes(p, 7, 9, 6, [255, 230, 80], false);
    p.blob(12, 10 - f, 2, 2, [40, 40, 44], 0.5);
    p.set(13, 7 - f, [255, 200, 80]);
  } },
  baron: { size: 32, paint: (p, f) => {
    const c: RGB = [56, 48, 48];
    p.rect(10, 26, 4, 5, shade(c, 0.8));
    p.rect(18, 26, 4, 5, shade(c, 0.8));
    p.blob(16, 18, 9, 9, c, 0.35);
    p.line(12, 13, 15, 22, [255, 120, 40]);
    p.line(20, 12, 18, 24, [255, 150, 60]);
    p.line(10, 20, 13, 25, [255, 120, 40]);
    p.blob(16, 8, 5, 4, shade(c, 1.1), 0.3);
    p.rect(10, 4, 12, 1, [20, 16, 16]);
    p.rect(12, 0, 8, 4, [30, 24, 24]);
    p.rect(12, 3, 8, 1, [150, 40, 40]);
    p.set(14, 8, [255, 200, 80]);
    p.set(18, 8, [255, 200, 80]);
    p.ell(18, 8, 1.6, 1.6, (nx, ny) => (nx * nx + ny * ny > 0.5 ? [230, 200, 120] : null));
    p.ell(16, 18, 2, 2, () => (f ? [255, 200, 90] : [255, 140, 50]));
  } },
  salamander: { size: 32, paint: (p, f) => {
    const c: RGB = [255, 90, 42];
    for (let k = 0; k < 10; k++) p.ell(16 + Math.sin(k * 0.6 + f) * 2, 20 + k, 3 - k * 0.25, 1.5, () => shade(c, 0.85));
    const lg: RGB = shade(c, 0.7);
    p.line(10, 12 + f, 5, 9, lg);
    p.line(22, 12 - f, 27, 9, lg);
    p.line(10, 20 - f, 5, 23, lg);
    p.line(22, 20 + f, 27, 23, lg);
    p.blob(16, 16, 6, 8, c, 0.45);
    p.blob(16, 7, 4.5, 4, shade(c, 1.1), 0.4);
    p.set(14, 6, [255, 240, 120]);
    p.set(18, 6, [255, 240, 120]);
    for (let k = 0; k < 4; k++) p.set(14 + (k % 2) * 4, 12 + k * 2, [255, 220, 90]);
  } },
  worm: { size: 16, paint: (p, f) => {
    const c: RGB = [201, 138, 106];
    p.blob(8, 8, 6.5, 6.5, c, 0.4);
    p.ell(8, 8, 3.8 + f * 0.5, 3.8 + f * 0.5, () => [60, 20, 20]);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      p.set(8 + Math.cos(a) * 3, 8 + Math.sin(a) * 3, [250, 240, 220]);
    }
  } },
};

// ---------------- художники врагов пластов 4-10 ----------------

const rgb = (c: string): RGB => hex(c);

/** Каменный страж и прочие големы. */
function golemkin(body: string, accent: string, eye: string, sz = 16): Painter {
  return (p, f) => {
    const c = rgb(body), a = rgb(accent), e = rgb(eye), k = sz / 16;
    p.rect(Math.round(5 * k), Math.round(12 * k), Math.round(2 * k), Math.round(3 * k), shade(c, 0.7));
    p.rect(Math.round(9 * k), Math.round(12 * k), Math.round(2 * k), Math.round(3 * k), shade(c, 0.7));
    p.blob(3.5 * k, (9 + f * 0.5) * k, 2 * k, 3 * k, shade(c, 0.85), 0.4);
    p.blob(12.5 * k, (9 - f * 0.5) * k, 2 * k, 3 * k, shade(c, 0.85), 0.4);
    p.blob(8 * k, 8.5 * k, 4.6 * k, 4.6 * k, c, 0.45);
    p.blob(8 * k, 3.6 * k, 2.6 * k, 2.2 * k, shade(c, 1.08), 0.4);
    p.line(5 * k, 7 * k, 7 * k, 11 * k, a);
    p.line(11 * k, 6 * k, 10 * k, 10 * k, a);
    p.set(7 * k, 3.4 * k, e);
    p.set(9 * k, 3.4 * k, e);
    if (k >= 2) {
      p.rect(Math.round(7 * k), Math.round(3.2 * k), 2, 2, e);
      p.rect(Math.round(9 * k), Math.round(3.2 * k), 2, 2, e);
      p.ell(8 * k, 8.5 * k, 1.4 * k, 1.4 * k, () => e);
    }
  };
}

/** Четвероногие: кабан-таран, волк, снежник. */
function quad(body: string, belly: string, eye: string, kind: 'boar' | 'wolf' | 'yeti'): Painter {
  return (p, f) => {
    const c = rgb(body), b = rgb(belly), e = rgb(eye);
    const legs = shade(c, 0.7);
    for (const [x, ph] of [[4, 0], [7, 1], [10, 0], [12, 1]] as const) p.rect(x, 11 + ((ph + f) % 2), 1, 3, legs);
    if (kind === 'yeti') {
      p.blob(8, 8, 6, 5.5, c, 0.4);
      p.blob(8, 4, 3.5, 3, shade(c, 1.05), 0.4);
      p.rect(6, 5, 4, 2, b);
      p.set(7, 4, e);
      p.set(9, 4, e);
      p.rect(2, 7, 2, 4, shade(c, 0.9));
      p.rect(12, 7, 2, 4, shade(c, 0.9));
      return;
    }
    p.blob(8, 9, 6, 3.4, c, 0.45);
    p.ell(8, 10.5, 4, 1.4, () => b);
    const hx = kind === 'wolf' ? 13 : 12.5;
    p.blob(hx, 7.5, 2.6, 2.2, shade(c, 1.05), 0.4);
    p.set(Math.round(hx), 7, e);
    if (kind === 'boar') {
      p.set(15, 9, [240, 230, 210]);
      p.set(14, 10, [240, 230, 210]);
      for (let x = 4; x < 11; x += 2) p.set(x, 5, shade(c, 0.6));
    } else {
      p.set(12, 5, shade(c, 0.8));
      p.set(13, 5, shade(c, 0.8));
      p.line(1, 7, 3, 9, shade(c, 0.9));
    }
  };
}

function insect(shell: string, leg: string, spot: string | null): Painter {
  return (p, f) => {
    const c = rgb(shell);
    legs(p, 8, 9, 3, 6, 3, rgb(leg), f);
    p.blob(8, 9, 4.5, 5, c, 0.4);
    p.line(8, 5, 8, 13, shade(c, 0.6));
    if (spot) { p.set(6, 8, rgb(spot)); p.set(10, 11, rgb(spot)); p.set(6, 11 - f, rgb(spot)); }
    p.ell(8, 4, 2.5, 2, () => shade(c, 0.6));
    p.set(7, 4, [255, 230, 160]);
    p.set(9, 4, [255, 230, 160]);
  };
}

function winged(wing: string, body: string, eye: string, moth = false): Painter {
  return (p, f) => {
    const w = rgb(wing), b = rgb(body), e = rgb(eye);
    if (moth) {
      const spread = f ? 0 : 1;
      p.ell(4 - spread, 7, 3.5, 4 + spread, (nx, ny) => (nx * nx + ny * ny < 0.3 ? shade(w, 1.3) : w));
      p.ell(12 + spread, 7, 3.5, 4 + spread, (nx, ny) => (nx * nx + ny * ny < 0.3 ? shade(w, 1.3) : w));
      p.blob(8, 8, 1.6, 4, b, 0.3);
      p.set(7, 5, e);
      p.set(9, 5, e);
      p.line(7, 4, 6, 2, b);
      p.line(9, 4, 10, 2, b);
      return;
    }
    if (f === 0) for (let k = 0; k < 6; k++) { p.line(7, 8, 1 + k * 0.3, 4 + k, w); p.line(9, 8, 15 - k * 0.3, 4 + k, w); }
    else for (let k = 0; k < 4; k++) { p.line(7, 8, 3, 9 + k, w); p.line(9, 8, 13, 9 + k, w); }
    p.blob(8, 8, 2.5, 3, b, 0.3);
    p.set(7, 7, e);
    p.set(9, 7, e);
  };
}

function shroom(cap: string, stem: string, spot: string, sz = 16, face = true): Painter {
  return (p, f) => {
    const c = rgb(cap), st = rgb(stem), sp = rgb(spot), k = sz / 16;
    p.rect(Math.round(6 * k), Math.round(8 * k), Math.round(4 * k), Math.round(6 * k), st);
    p.rect(Math.round(5 * k), Math.round(13 * k + f), Math.round(2 * k), Math.max(1, Math.round(k)), shade(st, 0.7));
    p.rect(Math.round(9 * k), Math.round(13 * k + 1 - f), Math.round(2 * k), Math.max(1, Math.round(k)), shade(st, 0.7));
    p.ell(8 * k, 7 * k, 6.5 * k, 4 * k, (nx, ny) => (ny > 0.55 ? shade(c, 0.6) : ny < -0.3 ? shade(c, 1.2) : c));
    for (let i = 0; i < 4 + Math.round(k); i++) {
      const x = (3 + rnd(i, 1, 13) * 10) * k, y = (4 + rnd(i, 2, 13) * 3) * k;
      p.ell(x, y, 0.9 * k, 0.7 * k, () => sp);
    }
    if (face) {
      p.set(7 * k, 10 * k, [30, 20, 30]);
      p.set(9 * k, 10 * k, [30, 20, 30]);
      if (k >= 2) { p.rect(Math.round(6.5 * k), Math.round(12 * k), Math.round(3 * k), 1, [60, 20, 40]); }
    }
  };
}

function flameWisp(c1: string, c2: string, c3: string, eye: string): Painter {
  return (p, f) => {
    p.ell(8, 9, 6 - f * 0.5, 6.5, (nx, ny) => (nx * nx + ny * ny > 0.6 ? rgb(c1) : rgb(c2)));
    p.ell(8, 9, 3.5, 4, () => rgb(c3));
    p.set(6 + f, 2, rgb(c1));
    p.set(10 - f, 1, rgb(c1));
    eyes(p, 7, 9, 9, rgb(eye), false);
  };
}

function droneP(body: string, ring: string, eye: string, sz = 16): Painter {
  return (p, f) => {
    const k = sz / 16, b = rgb(body), r = rgb(ring), e = rgb(eye);
    const tilt = f ? 0.15 : -0.15;
    p.ell(8 * k, 9 * k, 7 * k, 2.4 * k, (nx, ny) => (Math.abs(nx * nx + ny * ny - 0.8) < 0.22 ? r : null));
    p.blob(8 * k, 8 * k, 4 * k, 4 * k, b, 0.5);
    p.ell(8 * k, 8 * k, 1.8 * k, 1.8 * k, () => e);
    p.set(7.5 * k, 7.5 * k, [255, 255, 255]);
    p.line(3 * k, (5 + tilt * 6) * k, 1 * k, 3 * k, r);
    p.line(13 * k, (5 - tilt * 6) * k, 15 * k, 3 * k, r);
  };
}

function crystalP(c1: string, c2: string, ball = false): Painter {
  return (p, f) => {
    const a = rgb(c1), b = rgb(c2);
    if (ball) {
      p.blob(8, 9, 4.5 + f * 0.4, 4.5 + f * 0.4, a, 0.6);
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2 + f * 0.4;
        p.line(8 + Math.cos(ang) * 4, 9 + Math.sin(ang) * 4, 8 + Math.cos(ang) * 7, 9 + Math.sin(ang) * 7, b);
      }
      p.set(7, 8, [255, 255, 255]);
      return;
    }
    p.rect(4, 12, 8, 2, shade(a, 0.6));
    const shards: [number, number][] = [[5, 7], [8, 10], [11, 6]];
    for (const [x, h] of shards) for (let k = 0; k < h; k++) {
      const w = Math.max(0, Math.round(1.6 - (k / h) * 1.2));
      for (let dx = -w; dx <= w; dx++) p.set(x + dx, 12 - k, dx < 0 ? shade(b, 1.2) : dx > 0 ? shade(a, 0.8) : a);
    }
    p.set(8, 4 - f, [255, 255, 255]);
  };
}

function goo(c: string): Painter {
  return (p, f) => {
    const col = rgb(c);
    p.blob(8, 10 + f * 0.5, 6 + f, 5 - f, col, 0.5);
    p.set(5, 8, shade(col, 1.6));
    p.set(10, 12, [255, 230, 120]);
    eyes(p, 6, 10, 10);
  };
}

function imp(skin: string, horn: string): Painter {
  return (p, f) => {
    const s = rgb(skin), h = rgb(horn);
    p.rect(5, 13, 2, 2, shade(s, 0.6));
    p.rect(9, 13, 2, 2, shade(s, 0.6));
    p.blob(8, 10, 3.5, 3.5, shade(s, 0.85), 0.3);
    p.blob(8, 6, 3.5, 3, s, 0.4);
    p.line(5, 4, 4, 1, h);
    p.line(11, 4, 12, 1, h);
    eyes(p, 7, 9, 6, [255, 240, 120], false);
    p.line(12, 10 - f, 14, 7 - f, shade(s, 0.7));
    p.set(14, 6 - f, [255, 220, 90]);
  };
}

function shade3(dark: string, eye: string): Painter {
  return (p, f) => {
    const d = rgb(dark);
    p.ell(8, 9, 5.5, 6.5, (nx, ny) => (ny > 0.7 && Math.abs(nx) > 0.3 ? null : shade(d, 1 + (ny < -0.4 ? 0.2 : 0))));
    for (let k = 0; k < 4; k++) p.set(4 + k * 2.5, 15 - ((k + f) % 2), d);
    p.rect(6, 6, 1, 2, rgb(eye));
    p.rect(9, 6, 1, 2, rgb(eye));
  };
}

function sparkP(): Painter {
  return (p, f) => {
    p.blob(8, 8, 3.5, 3.5, [160, 230, 255], 0.6);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + f;
      let x = 8, y = 8;
      for (let st = 0; st < 3; st++) {
        const nx = x + Math.cos(a + (st % 2 ? 0.6 : -0.6)) * 2, ny = y + Math.sin(a + (st % 2 ? 0.6 : -0.6)) * 2;
        p.line(x, y, nx, ny, [230, 250, 255]);
        x = nx; y = ny;
      }
    }
    p.set(7, 7, [255, 255, 255]);
  };
}

/** Ангельский вестник: крылья, нимб. */
function herald(sz: number): Painter {
  return (p, f) => {
    const k = sz / 16;
    const wing: RGB = [255, 248, 220];
    for (let i = 0; i < 6; i++) {
      p.line(7 * k, 8 * k, (1 + i * 0.4 - f * 0.5) * k, (3 + i * 1.3) * k, shade(wing, 1 - i * 0.05));
      p.line(9 * k, 8 * k, (15 - i * 0.4 + f * 0.5) * k, (3 + i * 1.3) * k, shade(wing, 1 - i * 0.05));
    }
    p.ell(8 * k, 10 * k, 2.6 * k, 4.5 * k, (nx, ny) => (ny < -0.3 ? [255, 255, 255] : [230, 220, 200]));
    p.blob(8 * k, 5 * k, 2 * k, 2 * k, [255, 236, 200], 0.4);
    p.ell(8 * k, 2.2 * k, 2.6 * k, 0.9 * k, (nx, ny) => (nx * nx + ny * ny > 0.45 ? [255, 220, 100] : null));
    p.set(7.3 * k, 5 * k, [255, 120, 160]);
    p.set(8.7 * k, 5 * k, [255, 120, 160]);
  };
}

const BOSS_PAINT: Record<string, { size: number; paint: Painter }> = {
  titan: { size: 48, paint: (p, f) => {
    golemkin('#9a8a8a', '#ffd060', '#ffd060', 48)(p, f);
    // руны по телу
    for (const [x, y] of [[18, 24], [28, 20], [22, 32], [30, 30]]) { p.rect(x, y, 3, 1, [255, 214, 110]); p.rect(x + 1, y - 1, 1, 3, [255, 214, 110]); }
  } },
  crystalqueen: { size: 48, paint: (p, f) => {
    const a: RGB = [120, 220, 255], b: RGB = [200, 160, 255];
    p.ell(24, 30, 9, 14, (nx, ny) => (Math.abs(nx) > 0.7 ? shade(b, 0.8) : nx < 0 ? shade(a, 1.15) : a));
    for (let k = 0; k < 5; k++) {
      const x = 12 + k * 6, h = 6 + (k % 2 ? 2 : 5);
      for (let i = 0; i < h; i++) p.rect(x, 12 - i, Math.max(1, 3 - Math.round(i / 3)), 1, k % 2 ? b : a);
    }
    p.blob(24, 15, 6, 5, shade(a, 1.2), 0.5);
    p.rect(21, 14, 2, 2, [255, 255, 255]);
    p.rect(26, 14, 2, 2, [255, 255, 255]);
    for (let k = 0; k < 3; k++) { p.line(13 - k, 24 + k * 4, 6 - f, 20 + k * 6, b); p.line(35 + k, 24 + k * 4, 42 + f, 20 + k * 6, b); }
  } },
  mycelord: { size: 48, paint: (p, f) => {
    shroom('#8a3aa8', '#e8d8c0', '#c8ff8a', 48, true)(p, f);
    for (let k = 0; k < 5; k++) p.line(8 + k * 8, 46, 6 + k * 9 + f * 2, 40, [120, 90, 60]);
  } },
  iceking: { size: 48, paint: (p, f) => {
    quad('#e8f4ff', '#a8d8f0', '#3a8ad8', 'yeti')(p, f);
    // уже 16 пикселей: увеличенная копия поверх
    const tmp = new Pix(16, 16);
    quad('#e8f4ff', '#a8d8f0', '#3a8ad8', 'yeti')(tmp, f);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (tmp.alpha(x, y)) p.rect(x * 3, y * 3, 3, 3, tmp.rgb(x, y));
    for (let k = 0; k < 5; k++) p.rect(12 + k * 5, 4 - (k % 2) * 3, 3, 6 + (k % 2) * 3, [160, 230, 255]);
    for (let k = 0; k < 4; k++) p.rect(18 + k * 3, 22, 2, 4 + (k % 2) * 3, [200, 245, 255]);
  } },
  leviathan: { size: 48, paint: (p, f) => {
    const c: RGB = [200, 60, 30];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 1.7 + 0.6 + f * 0.1;
      p.blob(24 + Math.cos(a) * 14, 28 + Math.sin(a) * 12, 5 - k * 0.15, 5 - k * 0.15, shade(c, 0.75 + (k % 2) * 0.15), 0.4);
    }
    p.blob(24, 18, 9, 8, c, 0.5);
    p.ell(24, 22, 5, 3 + f, () => [255, 200, 80]);
    for (let k = 0; k < 6; k++) p.set(20 + k * 1.6, 20 + f, [255, 250, 220]);
    p.rect(19, 13, 3, 2, [255, 240, 120]);
    p.rect(27, 13, 3, 2, [255, 240, 120]);
    for (let k = 0; k < 4; k++) p.line(16 + k * 5, 11, 15 + k * 5, 6, [120, 30, 20]);
  } },
  guardian: { size: 48, paint: (p, f) => {
    droneP('#8a7a4a', '#ffd060', '#6ff0d8', 48)(p, f);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + f * 0.2;
      p.rect(Math.round(24 + Math.cos(a) * 19), Math.round(26 + Math.sin(a) * 19), 2, 2, [255, 214, 110]);
    }
  } },
};

const EXTRA_PAINT: Record<string, { size: number; paint: Painter }> = {
  stoneguard: { size: 16, paint: golemkin('#b48c8c', '#5a3a3a', '#ffcf6a') },
  shardthrower: { size: 16, paint: imp('#a89090', '#6a5a5a') },
  rockeater: { size: 16, paint: insect('#8a8a88', '#4a4a48', '#c8c8c0') },
  ram: { size: 16, paint: quad('#8a6a5a', '#b89a8a', '#ff5040', 'boar') },
  warden: { size: 32, paint: golemkin('#8a7a7a', '#ffcf6a', '#ffcf6a', 32) },
  crystalspider: { size: 16, paint: (p, f) => { PAINT.spider.paint(p, f); p.blob(8, 10, 3, 3, [120, 220, 255], 0.6); } },
  prism: { size: 16, paint: crystalP('#c89bff', '#8ff0ff') },
  glassbat: { size: 16, paint: winged('#8ff0ff', '#4a8aa8', '#ffffff') },
  shardling: { size: 16, paint: crystalP('#9ff4ff', '#e0ffff', true) },
  crystalmatron: { size: 32, paint: (p, f) => { PAINT.mother.paint(p, f); p.blob(16, 19, 6, 6, [120, 220, 255], 0.6); p.rect(15, 16, 3, 6, [230, 250, 255]); } },
  sporeling: { size: 16, paint: shroom('#b04ac8', '#e8d8c0', '#d8ff9a', 16) },
  mushwalker: { size: 16, paint: shroom('#4aa838', '#d8c8a8', '#f0ffd0', 16) },
  hopper: { size: 16, paint: (p, f) => {
    p.blob(8, 10 - f, 5, 4, [90, 170, 80], 0.5);
    p.blob(5, 6 - f, 1.6, 1.6, [200, 255, 160], 0.3);
    p.blob(11, 6 - f, 1.6, 1.6, [200, 255, 160], 0.3);
    p.set(5, 6 - f, [20, 20, 20]);
    p.set(11, 6 - f, [20, 20, 20]);
    p.line(3, 13, 1, 14 - f, [70, 130, 60]);
    p.line(13, 13, 15, 14 - f, [70, 130, 60]);
  } },
  moth: { size: 16, paint: winged('#c8b8ff', '#6a5a8a', '#d8ff9a', true) },
  myconid: { size: 32, paint: shroom('#7a3a98', '#e0d0b8', '#c8ff8a', 32) },
  icewolf: { size: 16, paint: quad('#c8e0f0', '#ffffff', '#3a8ad8', 'wolf') },
  frostwisp: { size: 16, paint: flameWisp('#7ac8f0', '#bff4ff', '#ffffff', '#1a4a7a') },
  yeti: { size: 16, paint: quad('#f0f6ff', '#a8c8e0', '#2a5a9a', 'yeti') },
  icebat: { size: 16, paint: winged('#8ac8f0', '#5a8ab0', '#ffffff') },
  frostmother: { size: 32, paint: (p, f) => {
    flameWisp('#7ac8f0', '#bff4ff', '#ffffff', '#1a4a7a')(p, f);
    const tmp = new Pix(16, 16);
    flameWisp('#7ac8f0', '#bff4ff', '#ffffff', '#1a4a7a')(tmp, f);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (tmp.alpha(x, y)) p.rect(x * 2, y * 2, 2, 2, tmp.rgb(x, y));
    for (let k = 0; k < 5; k++) p.rect(8 + k * 4, 1 + (k % 2) * 2, 2, 4, [200, 245, 255]);
  } },
  magmaslime: { size: 16, paint: goo('#e0502a') },
  fireimp: { size: 16, paint: imp('#e05a3a', '#3a1a10') },
  lavabeetle: { size: 16, paint: insect('#4a2a20', '#2a1410', '#ff8a2a') },
  ashbat: { size: 16, paint: winged('#6a5a58', '#3a2a28', '#ff6a3a') },
  magmagolem: { size: 32, paint: golemkin('#4a2a22', '#ff7a2a', '#ffd06a', 32) },
  sentinel: { size: 16, paint: golemkin('#c8a860', '#6ff0d8', '#6ff0d8') },
  hunterdrone: { size: 16, paint: droneP('#5a6a6a', '#6ff0d8', '#ffd060') },
  construct: { size: 16, paint: golemkin('#a8783a', '#ffd060', '#6ff0d8') },
  spark: { size: 16, paint: sparkP() },
  archon: { size: 32, paint: droneP('#c8a860', '#ffd060', '#6ff0d8', 32) },
  voidspawn: { size: 16, paint: shade3('#2a1840', '#ff5ab0') },
  starwisp: { size: 16, paint: flameWisp('#8a6ad8', '#c8a8ff', '#ffffff', '#2a1a5a') },
  gravit: { size: 16, paint: golemkin('#4a3a6a', '#c8a8ff', '#ffffff') },
  corebat: { size: 16, paint: winged('#6a4ab0', '#3a2a6a', '#e0d0ff') },
  herald: { size: 32, paint: herald(32) },
  ...BOSS_PAINT,
};
Object.assign(PAINT, EXTRA_PAINT);

function wormSegment(): Pix {
  const p = new Pix();
  const c: RGB = [190, 126, 96];
  p.blob(8, 8, 5.5, 5.5, c, 0.4);
  p.line(3, 8, 13, 8, shade(c, 0.75));
  p.line(4, 6, 12, 6, shade(c, 1.1));
  return p.outline();
}

function buildEnemy(id: string): EnemySprites {
  const d = PAINT[id] ?? PAINT.slime;
  const ps = [0, 1].map((f) => {
    const p = new Pix(d.size, d.size);
    d.paint(p, f);
    return p.outline();
  });
  return { frames: ps.map((x) => x.canvas()), flash: ps.map((x) => x.white()), size: d.size };
}

// ---------------- атлас ----------------

export interface Atlas {
  rockTop: Map<number, Sprite[]>;
  rockFace: Map<number, Sprite[]>;
  ore: Map<number, Sprite[]>;
  oreFace: Map<number, Sprite>;
  chest: Sprite[];
  crate: Sprite;
  tnt: Sprite;
  crystal: Sprite;
  door: Sprite;
  cracks: Sprite[];
  floor: Map<string, Sprite[]>;
  dug: Map<string, Sprite[]>;
  decoSets: Map<string, Sprite[]>;
  props: Map<string, Sprite>;
  enemies: Map<string, EnemySprites>;
  segment: Sprite;
  picks: Sprite[];
  swords: Sprite[];
  heroes: Map<string, HeroSprites>;
  npcs: Map<string, HeroSprites>;
  bogo: HTMLImageElement;
  bogoTrue: HTMLImageElement;
}

function cracks(stage: number): Pix {
  const p = new Pix();
  const c: RGB = [16, 12, 10];
  const paths: [number, number][][] = [
    [[8, 8], [6, 5], [7, 2]], [[8, 8], [11, 10], [13, 13]], [[8, 8], [4, 10], [2, 13]], [[8, 8], [12, 6], [14, 3]],
  ];
  for (let k = 0; k <= stage && k < paths.length; k++) {
    const pts = paths[k];
    for (let j = 0; j < pts.length - 1; j++) p.line(pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1], c);
  }
  return p;
}

export function buildAtlas(): Atlas {
  const a: Atlas = {
    rockTop: new Map(), rockFace: new Map(), ore: new Map(), oreFace: new Map(), chest: [], crate: crate().canvas(), tnt: tnt().canvas(),
    crystal: crystal().canvas(), door: door().canvas(), cracks: [0, 1, 2, 3].map((k) => cracks(k).canvas()), floor: new Map(),
    dug: new Map(), decoSets: new Map(), props: new Map(), enemies: new Map(), segment: wormSegment().canvas(),
    picks: [0, 1, 2, 3, 4, 5, 6].map((k) => pickSprite(k).canvas()), swords: [0, 1, 2, 3, 4, 5, 6].map((k) => swordSprite(k).canvas()), heroes: new Map(),
    npcs: new Map(NPCS.map((n) => [n.id, buildHero(n.look)])), bogo: loadImage(BOGO_SHEET), bogoTrue: loadImage(BOGO_TRUE_SHEET),
  };
  for (const [b, st] of Object.entries(ROCK_STYLE)) {
    const base = hex(st.base);
    a.rockTop.set(Number(b), [0, 1, 2].map((k) => rockTop(base, st.pattern, Number(b) * 101 + k * 13).canvas()));
    a.rockFace.set(Number(b), [0, 1].map((k) => rockFace(base, st.pattern, Number(b) * 77 + k).canvas()));
  }
  for (const o of ORES) a.ore.set(o.id, [0, 1].map((k) => oreOverlay(o, o.id * 31 + k * 7).canvas()));
  a.chest = [0, 1, 2, 3, 4].map((k) => chest(k || 1).canvas());
  for (const k of ['merchant', 'shrine', 'anvil', 'spring', 'lamp', 'mushroom', 'exit', 'lift']) a.props.set(k, prop(k).canvas());
  for (const id of Object.keys(PAINT)) a.enemies.set(id, buildEnemy(id));
  return a;
}

function loadImage(src: string): HTMLImageElement {
  const im = new Image();
  im.src = src;
  return im;
}

/** Плитки пола и украшения пласта (кэшируются по цвету). */
export function floorTiles(a: Atlas, color: string): { floor: Sprite[]; dug: Sprite[]; deco: Sprite[] } {
  if (!a.floor.has(color)) {
    const base = hex(color);
    a.floor.set(color, [0, 1, 2, 3].map((k) => floorTile(base, k * 17 + 3, false).canvas()));
    a.dug.set(color, [0, 1].map((k) => floorTile(base, k * 17 + 5, true).canvas()));
    a.decoSets.set(color, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => deco(d, base).canvas()));
  }
  return { floor: a.floor.get(color)!, dug: a.dug.get(color)!, deco: a.decoSets.get(color)! };
}

export function heroSprites(a: Atlas, hero: HeroDef): HeroSprites {
  let s = a.heroes.get(hero.id);
  if (!s) {
    s = buildHero(hero.look);
    a.heroes.set(hero.id, s);
  }
  return s;
}

/** Цвет предмета на земле по редкости. */
export const RARITY_COLOR: Record<string, string> = { common: '#d8cbb8', rare: '#6fa8ff', legendary: '#ffc94a', cursed: '#ff6b5b' };
