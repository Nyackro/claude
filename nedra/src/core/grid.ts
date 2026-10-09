import { B, BLOCKS } from './blocks';

/** Сетка яруса. Все слои данных - типизированные массивы по индексу y * w + x. */
export class Grid {
  readonly w: number;
  readonly h: number;
  readonly b: Uint8Array;        // тип блока
  readonly ore: Uint8Array;      // id руды для B.ORE
  readonly vein: Uint16Array;    // номер жилы (0 = нет)
  readonly water: Uint8Array;    // 0/1
  readonly gas: Float32Array;    // концентрация 0..1+
  readonly fire: Float32Array;   // >0: блок горит столько секунд
  readonly ladder: Uint8Array;
  readonly seen: Uint8Array;     // открыто светом
  readonly wobble: Float32Array; // таймер шатания валуна/сталактита, <0 нет
  exitX = 0;
  exitY = 0;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.b = new Uint8Array(n);
    this.ore = new Uint8Array(n);
    this.vein = new Uint16Array(n);
    this.water = new Uint8Array(n);
    this.gas = new Float32Array(n);
    this.fire = new Float32Array(n);
    this.ladder = new Uint8Array(n);
    this.seen = new Uint8Array(n);
    this.wobble = new Float32Array(n).fill(-1);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  i(x: number, y: number): number {
    return y * this.w + x;
  }

  get(x: number, y: number): number {
    return this.inside(x, y) ? this.b[y * this.w + x] : B.BEDROCK;
  }

  set(x: number, y: number, b: number, ore = 0): void {
    if (!this.inside(x, y)) return;
    const i = y * this.w + x;
    this.b[i] = b;
    this.ore[i] = b === B.ORE ? ore : 0;
    if (b !== B.ORE) this.vein[i] = 0;
    this.wobble[i] = -1;
    if (b !== B.EMPTY && b !== B.EXIT) {
      this.water[i] = 0;
      this.gas[i] = 0;
    }
  }

  /** Блок мешает движению (вне сетки - стена). */
  solid(x: number, y: number): boolean {
    return BLOCKS[this.get(x, y)].solid;
  }

  open(x: number, y: number): boolean {
    return this.inside(x, y) && !BLOCKS[this.b[y * this.w + x]].solid;
  }

  diggable(x: number, y: number): boolean {
    return this.inside(x, y) && BLOCKS[this.b[y * this.w + x]].diggable;
  }
}
