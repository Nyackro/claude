// Частицы и всплывающие цифры. Координаты частиц - в клетках мира.

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  size: number;      // в пикселях текстуры 16x16
  color: string;
  glow?: boolean;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  big: boolean;
}

export class Fx {
  parts: Particle[] = [];
  texts: FloatText[] = [];

  burst(x: number, y: number, color: string, n: number, speed = 4, size = 2, g = 18, life = 0.6): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, g, life: life * (0.6 + Math.random() * 0.6),
        max: life, size: size * (0.6 + Math.random() * 0.8), color });
    }
  }

  sparkle(x: number, y: number, color: string, n = 6): void {
    for (let k = 0; k < n; k++) {
      this.parts.push({ x: x + (Math.random() - 0.5) * 0.8, y: y + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 1.5,
        vy: -1 - Math.random() * 2, g: -1, life: 0.5 + Math.random() * 0.5, max: 1, size: 1.2, color, glow: true });
    }
  }

  dust(x: number, y: number, n = 4, color = 'rgba(200,190,170,0.6)'): void {
    for (let k = 0; k < n; k++) {
      this.parts.push({ x: x + Math.random(), y: y + Math.random() * 0.3, vx: (Math.random() - 0.5) * 1.2, vy: Math.random() * 1.5,
        g: 2, life: 0.8 + Math.random() * 0.6, max: 1.4, size: 1.5 + Math.random() * 2, color });
    }
  }

  flame(x: number, y: number): void {
    this.parts.push({ x: x + 0.2 + Math.random() * 0.6, y: y + 0.6 + Math.random() * 0.3, vx: (Math.random() - 0.5) * 0.6,
      vy: -2 - Math.random() * 2, g: -1, life: 0.5 + Math.random() * 0.4, max: 0.9, size: 2 + Math.random() * 2,
      color: Math.random() < 0.5 ? '#ffb030' : '#ff5a1f', glow: true });
  }

  text(x: number, y: number, text: string, color = '#fff2b0', big = false): void {
    this.texts.push({ x, y, text, color, life: big ? 1.6 : 1.0, max: big ? 1.6 : 1.0, big });
  }

  update(dt: number): void {
    for (const p of this.parts) {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
    for (const t of this.texts) {
      t.y -= dt * (t.big ? 0.6 : 1.1);
      t.life -= dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }
}
