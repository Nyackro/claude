import { oreById } from '../data/ores';
import { B, BLOCKS } from './blocks';

/** Сетка этажа (вид сверху). Данные по индексу y * w + x. */
export class Grid {
  readonly w: number;
  readonly h: number;
  readonly b: Uint8Array;        // тип клетки
  readonly ore: Uint8Array;      // id руды для B.ORE
  readonly host: Uint8Array;     // порода, в которой сидит руда
  readonly hp: Float32Array;     // оставшаяся прочность
  readonly seen: Uint8Array;     // открыто (запомнено)
  readonly room: Uint8Array;     // номер комнаты для внутренних клеток (0 - нет)
  readonly deco: Uint8Array;     // украшения пола: 1 камешки, 2 корни, 3 кости, 4 гриб, 5 паутина
  readonly dug: Uint8Array;      // клетка откопана гномом (а не природная пещера)

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.b = new Uint8Array(n);
    this.ore = new Uint8Array(n);
    this.host = new Uint8Array(n);
    this.hp = new Float32Array(n);
    this.seen = new Uint8Array(n);
    this.room = new Uint8Array(n);
    this.deco = new Uint8Array(n);
    this.dug = new Uint8Array(n);
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

  set(x: number, y: number, b: number, ore = 0, host = 0): void {
    if (!this.inside(x, y)) return;
    const i = y * this.w + x;
    this.b[i] = b;
    this.ore[i] = b === B.ORE ? ore : 0;
    this.host[i] = b === B.ORE ? host || B.STONE : 0;
    this.hp[i] = this.maxHp(i);
  }

  maxHp(i: number): number {
    const b = this.b[i];
    if (b === B.ORE) return BLOCKS[this.host[i]].hp + oreById(this.ore[i]).hp;
    return BLOCKS[b].hp;
  }

  /** Какой уровень кирки нужен для клетки. */
  tier(i: number): number {
    const b = this.b[i];
    if (b === B.ORE) return Math.max(BLOCKS[this.host[i]].tier, oreById(this.ore[i]).tier);
    return BLOCKS[b].tier;
  }

  solid(x: number, y: number): boolean {
    return BLOCKS[this.get(x, y)].solid;
  }

  open(x: number, y: number): boolean {
    return this.inside(x, y) && !BLOCKS[this.b[y * this.w + x]].solid;
  }
}
