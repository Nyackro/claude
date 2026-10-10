// Частицы, кольца и всплывающие цифры. Координаты - в клетках мира (вид сверху).

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  life: number;
  max: number;
  size: number;      // в пикселях текстуры 16x16
  color: string;
  glow?: boolean;
  soft?: boolean;    // мягкое облачко
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  big: boolean;
  num: boolean;
}

export interface Pillar {
  x: number;
  y: number;
  life: number;
  max: number;
  color: string;
}

export interface Ring {
  x: number;
  y: number;
  r: number;
  color: string;
  life: number;
  max: number;
}

export class Fx {
  parts: Particle[] = [];
  texts: FloatText[] = [];
  rings: Ring[] = [];
  pillars: Pillar[] = [];

  /** Столб света с неба. */
  pillar(x: number, y: number, life = 0.45, color = '255,242,176'): void {
    this.pillars.push({ x, y, life, max: life, color });
  }

  burst(x: number, y: number, color: string, n: number, speed = 4, size = 2, g = 0, life = 0.6): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (g ? speed * 0.4 : 0), g, drag: g ? 0 : 4,
        life: life * (0.6 + Math.random() * 0.6), max: life, size: size * (0.6 + Math.random() * 0.8), color });
    }
  }

  sparkle(x: number, y: number, color: string, n = 6): void {
    for (let k = 0; k < n; k++) {
      this.parts.push({ x: x + (Math.random() - 0.5) * 0.8, y: y + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 1.5,
        vy: -1 - Math.random() * 2, g: -1, drag: 1, life: 0.5 + Math.random() * 0.5, max: 1, size: 1.2, color, glow: true });
    }
  }

  dust(x: number, y: number, n = 4, color = 'rgba(200,190,170,0.6)'): void {
    for (let k = 0; k < n; k++) {
      this.parts.push({ x: x + Math.random(), y: y + Math.random() * 0.3, vx: (Math.random() - 0.5) * 1.2, vy: -Math.random() * 0.8,
        g: 0, drag: 2, life: 0.6 + Math.random() * 0.5, max: 1.1, size: 1.5 + Math.random() * 2, color, soft: true });
    }
  }

  puff(x: number, y: number, color: string): void {
    this.parts.push({ x, y, vx: (Math.random() - 0.5) * 0.4, vy: -0.4 - Math.random() * 0.4, g: 0, drag: 0.5,
      life: 0.9 + Math.random() * 0.5, max: 1.4, size: 4 + Math.random() * 3, color, soft: true });
  }

  flame(x: number, y: number): void {
    this.parts.push({ x: x + 0.2 + Math.random() * 0.6, y: y + 0.6 + Math.random() * 0.3, vx: (Math.random() - 0.5) * 0.6,
      vy: -1.5 - Math.random() * 1.5, g: -1, drag: 1, life: 0.4 + Math.random() * 0.35, max: 0.75, size: 2 + Math.random() * 2,
      color: Math.random() < 0.5 ? '#ffb030' : '#ff5a1f', glow: true });
  }

  ring(x: number, y: number, r: number, color: string, life = 0.35): void {
    this.rings.push({ x, y, r, color, life, max: life });
  }

  text(x: number, y: number, text: string, color = '#fff2b0', big = false): void {
    this.texts.push({ x, y, text, color, life: big ? 1.6 : 1.0, max: big ? 1.6 : 1.0, big, num: false });
  }

  /** Цифра урона. */
  number(x: number, y: number, n: number, crit: boolean, color?: string): void {
    this.texts.push({ x: x + (Math.random() - 0.5) * 0.4, y, text: crit ? `${n}!` : String(n), color: color ?? (crit ? '#ffd23f' : '#ffffff'),
      life: crit ? 0.9 : 0.65, max: crit ? 0.9 : 0.65, big: crit, num: true });
  }

  update(dt: number): void {
    for (const p of this.parts) {
      p.vy += p.g * dt;
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.parts.length > 700) this.parts.splice(0, this.parts.length - 700);
    for (const t of this.texts) {
      t.y -= dt * (t.num ? 1.4 : t.big ? 0.6 : 1.1);
      t.life -= dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    if (this.texts.length > 60) this.texts.splice(0, this.texts.length - 60);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const p of this.pillars) p.life -= dt;
    this.pillars = this.pillars.filter((p) => p.life > 0);
  }
}
