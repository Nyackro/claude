// Управление: клавиатура (WASD/стрелки, пробел - способность, F - факел, Q - бомба) и плавающий джойстик на касании.

const KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
};

const ACTION_KEYS: Record<string, string> = {
  Space: 'ability', KeyE: 'ability', KeyJ: 'ability',
  KeyF: 'torch', KeyT: 'torch', KeyK: 'torch',
  KeyQ: 'bomb', KeyB: 'bomb', KeyL: 'bomb',
  KeyR: 'scan',
  Escape: 'pause', KeyP: 'pause',
};

export interface Joystick {
  active: boolean;
  id: number;
  ox: number;
  oy: number;
  x: number;
  y: number;
}

export const JOY_R = 46;

export class Input {
  private held = new Set<string>();
  joy: Joystick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  actions: string[] = [];
  onFirstGesture: (() => void) | null = null;
  usedTouch = false;

  attach(target: HTMLElement): void {
    const gesture = () => this.onFirstGesture?.();
    window.addEventListener('keydown', (e) => {
      gesture();
      if (KEYS[e.code]) {
        this.held.add(e.code);
        e.preventDefault();
      } else if (ACTION_KEYS[e.code] && !e.repeat) {
        this.actions.push(ACTION_KEYS[e.code]);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.reset());
    target.addEventListener('pointerdown', (e) => {
      gesture();
      if (this.joy.active) return;
      if (e.pointerType === 'touch') this.usedTouch = true;
      const r = target.getBoundingClientRect();
      this.joy = { active: true, id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top, x: e.clientX - r.left, y: e.clientY - r.top };
      target.setPointerCapture?.(e.pointerId);
    });
    target.addEventListener('pointermove', (e) => {
      if (!this.joy.active || e.pointerId !== this.joy.id) return;
      const r = target.getBoundingClientRect();
      this.joy.x = e.clientX - r.left;
      this.joy.y = e.clientY - r.top;
      // джойстик тянется за пальцем, если тот ушёл далеко
      const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy, d = Math.hypot(dx, dy);
      if (d > JOY_R * 1.6) {
        this.joy.ox = this.joy.x - (dx / d) * JOY_R * 1.6;
        this.joy.oy = this.joy.y - (dy / d) * JOY_R * 1.6;
      }
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.joy.id) this.joy.active = false;
    };
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Вектор движения длиной до 1. */
  move(): { mx: number; my: number } {
    let mx = 0, my = 0;
    for (const k of this.held) {
      mx += KEYS[k][0];
      my += KEYS[k][1];
    }
    if (mx || my) {
      const d = Math.hypot(mx, my);
      return { mx: mx / d, my: my / d };
    }
    if (this.joy.active) {
      const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy, d = Math.hypot(dx, dy);
      if (d < 8) return { mx: 0, my: 0 };
      const k = Math.min(1, d / JOY_R) / d;
      return { mx: dx * k, my: dy * k };
    }
    return { mx: 0, my: 0 };
  }

  take(): string[] {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  reset(): void {
    this.held.clear();
    this.joy.active = false;
    this.actions = [];
  }
}
