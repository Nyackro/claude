// Что этаж даёт предметам: предметы описаны данными, а их эффекты вызывают эти методы.
import type { Rng } from '../core/rng';
import type { PlayerStats } from '../core/stats';
import type { OreDef } from '../data/ores';

export interface EnemyRef {
  readonly id: string;
  x: number;
  y: number;
  hp: number;
  readonly max: number;
  readonly boss: boolean;
  readonly mini: boolean;
  dead: boolean;
}

export type DamageSrc = 'sword' | 'echo' | 'proj' | 'expl' | 'dot' | 'thorns' | 'summon' | 'ability' | 'light';
export type ProjKind = 'shard' | 'wave' | 'bolt' | 'fire' | 'bullet';

export interface ShootOpts {
  dmg: number;
  speed?: number;
  kind?: ProjKind;
  pierce?: number;
  dir?: number;              // угол, если нет цели
}

export interface FloorApi {
  readonly time: number;
  readonly rng: Rng;
  readonly stats: PlayerStats;
  readonly px: number;
  readonly py: number;
  readonly hp: number;
  nearest(x: number, y: number, range: number): EnemyRef | null;
  enemiesIn(x: number, y: number, r: number): EnemyRef[];
  damage(e: EnemyRef, dmg: number, src: DamageSrc): void;
  shoot(x: number, y: number, target: EnemyRef | null, o: ShootOpts): void;
  explode(x: number, y: number, r: number, dmg: number, safe?: boolean): void;
  lightning(x: number, y: number, target: EnemyRef, dmg: number, jumps: number): void;
  heal(n: number): void;
  coins(n: number, x: number, y: number): void;
  buff(id: string, dur: number, speed: number, attack: number): void;
  bomb(x: number, y: number, fuse: number, r: number, dmg: number): void;
  ignite(e: EnemyRef, dps: number, dur: number): void;
  slow(e: EnemyRef, k: number, dur: number): void;
  shield(n: number): void;
  summon(kind: 'bat' | 'golem', n: number): void;
  turret(x: number, y: number, dur: number): void;
  torches(): { x: number; y: number; r: number }[];
  text(x: number, y: number, s: string, color: string): void;
  counter(id: string, add?: number): number;
}

export interface ItemHooks {
  onBreak?: (f: FloorApi, n: number, x: number, y: number) => void;
  onOre?: (f: FloorApi, n: number, x: number, y: number, ore: OreDef) => void;
  onSwing?: (f: FloorApi, n: number, angle: number) => void;
  onHit?: (f: FloorApi, n: number, e: EnemyRef, dmg: number) => void;
  onKill?: (f: FloorApi, n: number, e: EnemyRef) => void;
  onHurt?: (f: FloorApi, n: number, dmg: number) => void;
  onTick?: (f: FloorApi, n: number, dt: number) => void;
  onFloor?: (f: FloorApi, n: number) => void;
  onTorch?: (f: FloorApi, n: number, x: number, y: number) => void;
}
