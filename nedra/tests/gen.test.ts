import { describe, expect, it } from 'vitest';
import { B } from '../src/core/blocks';
import { generateFloor, reachable } from '../src/core/gen';
import { LAYERS } from '../src/data/layers';
import { oreByKey } from '../src/data/ores';

const count = (g: { b: Uint8Array; ore: Uint8Array }, key: string) => {
  let n = 0;
  for (let i = 0; i < g.b.length; i++) if (g.b[i] === B.ORE && g.ore[i] === oreByKey(key).id) n++;
  return n;
};

describe('generateFloor', () => {
  for (const L of LAYERS.filter((l) => l.ready)) {
    for (const floor of [0, 1]) {
      it(`layer ${L.id} floor ${floor}: exit reachable with wooden pick, rooms placed`, () => {
        for (let seed = 1; seed <= 40; seed++) {
          const f = generateFloor(L, floor, seed * 7919);
          const g = f.grid;
          expect(g.open(f.start.x, f.start.y)).toBe(true);
          expect(g.open(f.exit.x, f.exit.y)).toBe(true);
          expect(reachable(g, f.start, f.exit, 0)).toBe(true);
          expect(f.rooms.length).toBeGreaterThanOrEqual(2);
          for (const r of f.rooms) {
            if (r.kind === 'vault' || r.kind === 'secret') continue;
            expect(reachable(g, f.start, { x: r.cx, y: r.cy }, 0)).toBe(true);
          }
          expect(f.spawns.length).toBeGreaterThan(0);
          if (L.id === 1) expect(count(g, 'copper')).toBeGreaterThanOrEqual(14);
          if (L.id === 2) expect(count(g, 'iron')).toBeGreaterThanOrEqual(14);
        }
      });
    }
    it(`layer ${L.id} boss floor: arena reachable, exit sealed`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const f = generateFloor(L, 2, seed);
        const a = f.arena!;
        expect(f.boss).toBe(L.boss);
        expect(reachable(f.grid, f.start, { x: Math.round((a.x0 + a.x1) / 2), y: Math.round((a.y0 + a.y1) / 2) }, 0)).toBe(true);
        expect(reachable(f.grid, f.start, f.exit, 9)).toBe(false);
      }
    });
  }

  it('tutorial floor is gentle', () => {
    const f = generateFloor(LAYERS[0], 0, 5, true);
    expect(f.rooms.map((r) => r.kind)).toEqual(['spring']);
  });
});
