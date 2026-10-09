// Управление: клавиатура (WASD/стрелки, 1-3) и касание/мышь (держи палец там, куда копать).

export type Dir = 'l' | 'r' | 'u' | 'd';

const KEY_DIR: Record<string, Dir> = {
  ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd',
};

export class Input {
  private stack: Dir[] = [];
  pointer = { x: 0, y: 0, down: false };
  actions: string[] = [];
  onFirstGesture: (() => void) | null = null;

  attach(target: HTMLElement): void {
    const gesture = () => {
      this.onFirstGesture?.();
    };
    window.addEventListener('keydown', (e) => {
      gesture();
      const d = KEY_DIR[e.code];
      if (d) {
        if (!this.stack.includes(d)) this.stack.push(d);
        e.preventDefault();
      } else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
        this.actions.push(`c${e.code.slice(-1)}`);
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        this.actions.push('pause');
      } else if (e.code === 'Space') {
        this.actions.push('c1');
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      const d = KEY_DIR[e.code];
      if (d) this.stack = this.stack.filter((x) => x !== d);
    });
    window.addEventListener('blur', () => this.reset());
    const pos = (e: PointerEvent) => {
      const r = target.getBoundingClientRect();
      this.pointer.x = e.clientX - r.left;
      this.pointer.y = e.clientY - r.top;
    };
    target.addEventListener('pointerdown', (e) => {
      gesture();
      pos(e);
      this.pointer.down = true;
      target.setPointerCapture?.(e.pointerId);
    });
    target.addEventListener('pointermove', (e) => pos(e));
    const up = () => { this.pointer.down = false; };
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  keyDir(): Dir | null {
    return this.stack.length ? this.stack[this.stack.length - 1] : null;
  }

  reset(): void {
    this.stack = [];
    this.pointer.down = false;
    this.actions = [];
  }
}
