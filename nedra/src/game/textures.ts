// Процедурная пиксельная графика: всё рисуется в 16x16 и масштабируется без сглаживания.
import { hash2 } from '../core/rng';
import type { Palette } from '../data/layers';
import { ORES, type OreDef } from '../data/ores';

export const T = 16;

type RGB = [number, number, number];

export function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const shade = (c: RGB, k: number): RGB => [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k)];
const mix = (a: RGB, b: RGB, t: number): RGB => [clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t), clamp(a[2] + (b[2] - a[2]) * t)];

class Pix {
  readonly img: ImageData;
  constructor(w = T, h = T) {
    this.img = new ImageData(w, h);
  }
  set(x: number, y: number, c: RGB, a = 255): void {
    if (x < 0 || y < 0 || x >= this.img.width || y >= this.img.height) return;
    const i = (y * this.img.width + x) * 4;
    this.img.data[i] = c[0];
    this.img.data[i + 1] = c[1];
    this.img.data[i + 2] = c[2];
    this.img.data[i + 3] = a;
  }
  get(x: number, y: number): number {
    return this.img.data[(y * this.img.width + x) * 4 + 3];
  }
}

type Style = 'dirt' | 'clay' | 'stone' | 'hard' | 'bedrock' | 'sand' | 'rubble' | 'wall';

function material(base: RGB, seed: number, style: Style): Pix {
  const p = new Pix();
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const n = hash2(x, y, seed);
      const blob = hash2(x >> 2, y >> 2, seed + 7);
      let k = 0.92 + blob * 0.12 + (n - 0.5) * 0.1;
      if (style === 'clay') k += Math.sin((y + hash2(0, y, seed) * 2) * 1.3) * 0.05;
      if (style === 'sand') k = 0.95 + (n - 0.5) * 0.18;
      if (style === 'wall') k = 0.85 + blob * 0.2 + (n - 0.5) * 0.06;
      let c = shade(base, k);
      if (n > 0.95) c = shade(base, style === 'bedrock' ? 1.35 : 1.22);
      else if (n < 0.06) c = shade(base, 0.68);
      p.set(x, y, c);
    }
  }
  const rnd = (k: number) => hash2(k, seed, 99);
  if (style === 'dirt' || style === 'rubble') {
    for (let k = 0; k < (style === 'rubble' ? 6 : 3); k++) {
      const x = Math.floor(rnd(k) * 13) + 1, y = Math.floor(rnd(k + 10) * 13) + 1;
      const c = style === 'rubble' ? shade(base, 0.7 + rnd(k + 20) * 0.6) : shade(base, 1.25);
      p.set(x, y, c);
      p.set(x + 1, y, c);
      p.set(x, y + 1, shade(c, 0.75));
      p.set(x + 1, y + 1, shade(c, 0.75));
    }
  }
  if (style === 'stone' || style === 'hard' || style === 'bedrock') {
    const lines = style === 'stone' ? 2 : 3;
    for (let k = 0; k < lines; k++) {
      let x = Math.floor(rnd(k + 30) * 14) + 1, y = Math.floor(rnd(k + 40) * 14) + 1;
      for (let s = 0; s < 6; s++) {
        p.set(x, y, shade(base, style === 'hard' ? 0.55 : 0.7));
        p.set(x, y + 1, shade(base, 1.15));
        x += rnd(k * 10 + s) > 0.5 ? 1 : -1;
        y += rnd(k * 10 + s + 50) > 0.6 ? 1 : 0;
      }
    }
  }
  return p;
}

function ore(o: OreDef, seed: number): Pix {
  const p = new Pix();
  const c = hex(o.color), lt = hex(o.light), dk = hex(o.dark);
  const chunks = o.kind === 'gem' ? 2 : o.kind === 'relic' ? 1 : 4;
  for (let k = 0; k < chunks; k++) {
    const cx = 3 + Math.floor(hash2(k, 1, seed) * 10), cy = 3 + Math.floor(hash2(k, 2, seed) * 10);
    if (o.kind === 'gem' || o.kind === 'relic') {
      const r = o.kind === 'relic' ? 4 : 3;
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          if (Math.abs(x) + Math.abs(y) > r) continue;
          const col = y < 0 && x <= 0 ? lt : y > 0 && x > 0 ? dk : c;
          p.set(cx + x, cy + y, col);
        }
      }
      p.set(cx - 1, cy - 1, [255, 255, 255]);
    } else {
      const r = 1 + Math.floor(hash2(k, 3, seed) * 2);
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          if (x * x + y * y > r * r + 1) continue;
          const col = y < 0 ? lt : y > 0 ? dk : c;
          p.set(cx + x, cy + y, o.kind === 'coal' && hash2(x, y, seed + k) > 0.8 ? lt : col);
        }
      }
    }
  }
  return p;
}

function boulder(base: RGB): Pix {
  const p = new Pix();
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const dx = x - 7.5, dy = y - 8.5;
      const d = Math.sqrt(dx * dx * 0.9 + dy * dy * 1.1);
      if (d > 7.3) continue;
      const light = (-dx - dy) / 14;
      let c = shade(base, 0.85 + light * 0.5 + (hash2(x, y, 5) - 0.5) * 0.12);
      if (d > 6.4) c = shade(base, 0.55);
      p.set(x, y, c);
    }
  }
  p.set(5, 5, shade(base, 1.45));
  p.set(6, 5, shade(base, 1.3));
  return p;
}

function stalactite(base: RGB): Pix {
  const p = new Pix();
  for (let y = 0; y < T; y++) {
    const half = Math.max(0, 6 - y * 0.42);
    for (let x = 0; x < T; x++) {
      const dx = x - 7.5;
      if (Math.abs(dx) > half) continue;
      p.set(x, y, shade(base, dx < 0 ? 1.15 : 0.8));
    }
  }
  return p;
}

function chest(): Pix {
  const p = new Pix();
  const wood: RGB = [139, 90, 43], woodD: RGB = [94, 58, 26], gold: RGB = [240, 196, 64];
  for (let y = 4; y < 15; y++) for (let x = 1; x < 15; x++) p.set(x, y, y < 8 ? shade(wood, 1.12) : wood);
  for (let x = 1; x < 15; x++) { p.set(x, 4, woodD); p.set(x, 14, woodD); p.set(x, 8, woodD); }
  for (let y = 4; y < 15; y++) { p.set(1, y, woodD); p.set(14, y, woodD); p.set(4, y, gold); p.set(11, y, gold); }
  for (let y = 7; y < 11; y++) for (let x = 7; x < 9; x++) p.set(x, y, gold);
  p.set(7, 9, [60, 40, 10]);
  return p;
}

function crate(): Pix {
  const p = new Pix();
  const wood: RGB = [176, 128, 72], woodD: RGB = [120, 82, 40];
  for (let y = 3; y < 15; y++) for (let x = 2; x < 14; x++) p.set(x, y, wood);
  for (let k = 0; k < 12; k++) { p.set(2 + k, 3 + k, woodD); p.set(13 - k, 3 + k, woodD); }
  for (let x = 2; x < 14; x++) { p.set(x, 3, woodD); p.set(x, 14, woodD); }
  for (let y = 3; y < 15; y++) { p.set(2, y, woodD); p.set(13, y, woodD); }
  const red: RGB = [214, 64, 52];
  for (let k = -2; k <= 2; k++) { p.set(8 + k, 9, red); p.set(8, 9 + k, red); }
  return p;
}

function ladder(): Pix {
  const p = new Pix();
  const w: RGB = [168, 120, 64], d: RGB = [110, 74, 36];
  for (let y = 0; y < T; y++) { p.set(3, y, w); p.set(4, y, d); p.set(11, y, w); p.set(12, y, d); }
  for (const y of [2, 7, 12]) for (let x = 3; x <= 12; x++) { p.set(x, y, w); p.set(x, y + 1, d); }
  return p;
}

function exitPlate(): Pix {
  const p = new Pix();
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      if (y < 3) {
        p.set(x, y, ((x + y) >> 1) % 2 ? [240, 190, 40] : [40, 36, 30]);
      } else if (y > 12) {
        p.set(x, y, [70, 70, 76]);
      } else if (x % 4 === 0) {
        p.set(x, y, [90, 92, 100]);
      }
    }
  }
  return p;
}

function gasBubbles(): Pix {
  const p = new Pix();
  const g: RGB = [150, 230, 120];
  for (const [x, y] of [[4, 4], [10, 6], [6, 11], [12, 12]]) {
    p.set(x, y, g, 200);
    p.set(x + 1, y, g, 140);
    p.set(x, y + 1, g, 140);
  }
  return p;
}

function cracks(stage: number): Pix {
  const p = new Pix();
  const c: RGB = [20, 16, 14];
  const segs = [[8, 8, 3, 2], [8, 8, 13, 5], [8, 8, 5, 14], [8, 8, 14, 12], [3, 2, 1, 6], [13, 5, 15, 2], [5, 14, 2, 15]];
  const n = Math.min(segs.length, 2 + stage * 2);
  for (let k = 0; k < n; k++) {
    const [x0, y0, x1, y1] = segs[k];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 0; s <= steps; s++) p.set(Math.round(x0 + ((x1 - x0) * s) / steps), Math.round(y0 + ((y1 - y0) * s) / steps), c, 200);
  }
  return p;
}

export interface Atlas {
  canvas: HTMLCanvasElement;
  slots: Map<string, [number, number]>;
}

const COLS_IN_ATLAS = 16;

export function buildAtlas(pal: Palette, layerId: number): Atlas {
  const items: [string, Pix][] = [];
  const mats: [Style, string][] = [['dirt', pal.dirt], ['clay', pal.clay], ['stone', pal.stone], ['hard', pal.hard],
    ['bedrock', pal.bedrock], ['sand', pal.sand], ['rubble', pal.clay]];
  for (const [style, color] of mats) for (let v = 0; v < 4; v++) items.push([`${style}${v}`, material(hex(color), layerId * 100 + v * 13 + style.length, style)]);
  for (let v = 0; v < 4; v++) items.push([`wall${v}`, material(mix(hex(pal.bg), hex(pal.bg2), 0.5), layerId * 77 + v, 'wall')]);
  for (const o of ORES) items.push([`ore${o.id}`, ore(o, o.id * 31)]);
  items.push(['boulder', boulder(hex(pal.boulder))]);
  items.push(['stalactite', stalactite(hex(pal.stone))]);
  items.push(['chest', chest()], ['crate', crate()], ['ladder', ladder()], ['exit', exitPlate()], ['gas', gasBubbles()]);
  for (let s = 0; s < 4; s++) items.push([`crack${s}`, cracks(s)]);
  const rows = Math.ceil(items.length / COLS_IN_ATLAS);
  const canvas = document.createElement('canvas');
  canvas.width = COLS_IN_ATLAS * T;
  canvas.height = rows * T;
  const ctx = canvas.getContext('2d')!;
  const slots = new Map<string, [number, number]>();
  items.forEach(([key, pix], k) => {
    const sx = (k % COLS_IN_ATLAS) * T, sy = Math.floor(k / COLS_IN_ATLAS) * T;
    ctx.putImageData(pix.img, sx, sy);
    slots.set(key, [sx, sy]);
  });
  return { canvas, slots };
}

// ---------- Гном ----------

const GNOME_PAL: Record<string, RGB> = {
  Y: [242, 193, 78], y: [196, 146, 40], L: [255, 246, 176], S: [241, 194, 125], N: [226, 110, 100],
  E: [40, 30, 30], W: [244, 241, 234], w: [196, 188, 176], B: [59, 110, 165], b: [40, 76, 120],
  G: [120, 84, 50], K: [86, 58, 40], R: [200, 70, 60],
};

// 16x16, смотрит вправо
const FRAMES: Record<string, string[]> = {
  idle: [
    '................',
    '.....yYYYYy.....',
    '....yYYYYYYYL...',
    '....yyyyyyyyy...',
    '.....SSSSESS....',
    '.....SSSSSNN....',
    '....WWWWWWWW....',
    '...BWWWWWWWWw...',
    '...BBWWWWWWwB...',
    '..SBBBWWWWwBBS..',
    '..SBBBBWWwBBBS..',
    '...BBBBBBBBBB...',
    '...BGGGGGGGGB...',
    '....bbb..bbb....',
    '....KKK..KKK....',
    '...KKKK..KKKK...',
  ],
  walk: [
    '................',
    '.....yYYYYy.....',
    '....yYYYYYYYL...',
    '....yyyyyyyyy...',
    '.....SSSSESS....',
    '.....SSSSSNN....',
    '....WWWWWWWW....',
    '...BWWWWWWWWw...',
    '...BBWWWWWWwB...',
    '..SBBBWWWWwBBS..',
    '..SBBBBWWwBBBS..',
    '...BBBBBBBBBB...',
    '...BGGGGGGGGB...',
    '...bbb....bbb...',
    '..KKK......KKK..',
    '..KKKK.....KKKK.',
  ],
  fall: [
    '................',
    '.....yYYYYy.....',
    '....yYYYYYYYL...',
    '....yyyyyyyyy...',
    '.....SSSSESS....',
    '.....SSSSSNN....',
    '.S..WWWWWWWW..S.',
    '.SBBWWWWWWWWwBS.',
    '..BBBWWWWWWwBB..',
    '...BBBWWWWwBB...',
    '...BBBBWWwBBB...',
    '...BBBBBBBBBB...',
    '...BGGGGGGGGB...',
    '...bbb....bbb...',
    '...KKK....KKK...',
    '................',
  ],
};

export interface GnomeSprites {
  canvas: HTMLCanvasElement;
  frames: Map<string, [number, number]>;
}

/** Кадры гнома для обоих направлений; helmet - цвет каски (скины). */
export function buildGnome(helmet: string, beard: string): GnomeSprites {
  const keys = Object.keys(FRAMES);
  const canvas = document.createElement('canvas');
  canvas.width = T * keys.length;
  canvas.height = T * 2;
  const ctx = canvas.getContext('2d')!;
  const pal: Record<string, RGB> = { ...GNOME_PAL, Y: hex(helmet), y: shade(hex(helmet), 0.78), W: hex(beard), w: shade(hex(beard), 0.82) };
  const frames = new Map<string, [number, number]>();
  keys.forEach((key, k) => {
    for (const dir of [1, -1]) {
      const p = new Pix();
      FRAMES[key].forEach((row, y) => {
        for (let x = 0; x < T; x++) {
          const ch = row[dir === 1 ? x : T - 1 - x];
          if (ch !== '.') p.set(x, y, pal[ch]);
        }
      });
      const sy = dir === 1 ? 0 : T;
      ctx.putImageData(p.img, k * T, sy);
      frames.set(`${key}${dir}`, [k * T, sy]);
    }
  });
  return { canvas, frames };
}

export const HELMETS: Record<string, { color: string; name: string }> = {
  basic: { color: '#f2c14e', name: 'Шахтёрская каска' },
  veteran: { color: '#ffd700', name: 'Золотая каска «Ветеран»' },
};
