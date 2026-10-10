import { describe, expect, it } from 'vitest';
import { B } from '../src/core/blocks';
import { generateFloor, reachable } from '../src/core/gen';
import { layerDef, LAYERS } from '../src/data/layers';
import { NPCS } from '../src/data/npcs';
import { oreByKey } from '../src/data/ores';

const count = (g: { b: Uint8Array; ore: Uint8Array }, key: string) => {
  let n = 0;
  for (let i = 0; i < g.b.length; i++) if (g.b[i] === B.ORE && g.ore[i] === oreByKey(key).id) n++;
  return n;
};

const NEED: Record<number, string> = { 1: 'copper', 2: 'iron', 4: 'mithril', 6: 'adamantite', 9: 'starmetal' };

describe('generateFloor', () => {
  for (const L of [...LAYERS, layerDef(11), layerDef(20)]) {
    for (const floor of [0, 1]) {
      it(`layer ${L.id} floor ${floor}: exit reachable with wooden pick, rooms placed`, () => {
        for (let seed = 1; seed <= 30; seed++) {
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
          const need = NEED[L.id];
          if (need) expect(count(g, need)).toBeGreaterThanOrEqual(12);
        }
      });
    }
    it(`layer ${L.id} boss floor: arena reachable, exit sealed`, () => {
      for (let seed = 1; seed <= 15; seed++) {
        const f = generateFloor(L, 2, seed);
        const a = f.arena!;
        expect(f.bosses).toEqual(L.bosses);
        expect(reachable(f.grid, f.start, { x: Math.round((a.x0 + a.x1) / 2), y: Math.round((a.y0 + a.y1) / 2) }, 0)).toBe(true);
        expect(reachable(f.grid, f.start, f.exit, 9)).toBe(false);
      }
    });
  }

  it('endless boss floors have two plus bosses, the 10th has True Bogomiron', () => {
    expect(layerDef(11).bosses.length).toBe(2);
    expect(layerDef(11).plus).toBe(1);
    expect(layerDef(20).bosses).toEqual(['bogomiron_true']);
    expect(layerDef(31).plus).toBe(3);
    expect(layerDef(21).scale.hp).toBeGreaterThan(layerDef(11).scale.hp);
  });

  for (const npc of NPCS) {
    it(`captive ${npc.id} gets a reachable cell with guards on layer ${npc.layer} floor ${npc.floor}`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const f = generateFloor(layerDef(npc.layer), npc.floor, seed * 104729, false, npc.id);
        expect(f.captive?.id).toBe(npc.id);
        const c = f.captive!;
        // клетка закрыта, но вход в темницу достижим
        if (c.room) {
          const r = f.rooms[c.room - 1];
          expect(r.kind).toBe('captive');
          expect(reachable(f.grid, f.start, { x: r.x0, y: r.y0 }, 0)).toBe(true);
          expect(f.spawns.filter((s) => s.room === c.room).length).toBeGreaterThanOrEqual(3);
          expect(f.grid.get(c.x + 1, c.y)).toBe(B.DOOR);
        }
      }
    });
  }

  it('tutorial floor is gentle', () => {
    const f = generateFloor(LAYERS[0], 0, 5, true);
    expect(f.rooms.map((r) => r.kind)).toEqual(['spring']);
  });
});
