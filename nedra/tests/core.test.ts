import { describe, expect, it } from 'vitest';
import { B } from '../src/core/blocks';
import { generateTier, type NodeType } from '../src/core/gen';
import { Grid } from '../src/core/grid';
import { TierSim, type SimHooks } from '../src/core/physics';
import { LAYERS } from '../src/data/layers';
import { BOULDER_WOBBLE, TOP_ROWS } from '../src/config';

const nodes: NodeType[] = ['normal', 'rich', 'danger', 'cache', 'fair', 'rest', 'boss'];

function hooks(player = { x: -5, y: -5 }, log: string[] = []): SimHooks {
  return {
    player: () => player,
    hitPlayer: (k) => log.push(`hit:${k}`),
    landed: (k, x, y) => log.push(`land:${k}:${x}:${y}`),
    shattered: (k) => log.push(`shatter:${k}`),
    wobbleStart: (k) => log.push(`wobble:${k}`),
    fireTouch: () => log.push('fire'),
    burnedOut: () => log.push('burn'),
    ignite: () => log.push('ignite'),
  };
}

describe('generateTier', () => {
  for (const layer of LAYERS.filter((l) => l.ready)) {
    for (const node of nodes) {
      it(`layer ${layer.id} ${node}: valid layout`, () => {
        for (let seed = 1; seed <= 25; seed++) {
          const t = generateTier({ layer, node, seed: seed * 7919 });
          const g = t.grid;
          expect(g.get(g.exitX, g.exitY)).toBe(B.EXIT);
          expect(g.exitY).toBe(g.h - 1);
          for (let x = 0; x < g.w; x++) if (x !== g.exitX) expect(g.get(x, g.h - 1)).toBe(B.BEDROCK);
          for (let y = 0; y < TOP_ROWS; y++) for (let x = 0; x < g.w; x++) expect(g.get(x, y)).toBe(B.EMPTY);
          expect(g.solid(t.spawnX, t.spawnY + 1)).toBe(true);
          let ore = 0;
          for (let y = 0; y < g.h; y++) {
            for (let x = 0; x < g.w; x++) {
              const b = g.get(x, y);
              if (b === B.ORE) ore++;
              if (b === B.BOULDER || b === B.SAND) expect(g.get(x, y + 1)).not.toBe(B.EMPTY);
            }
          }
          expect(ore).toBeGreaterThan(node === 'cache' ? 4 : 10);
          for (const v of t.veins.values()) expect(v.size).toBeGreaterThan(0);
        }
      });
    }
  }

  it('is deterministic for a seed', () => {
    const a = generateTier({ layer: LAYERS[1], node: 'normal', seed: 42 });
    const b = generateTier({ layer: LAYERS[1], node: 'normal', seed: 42 });
    expect(Array.from(a.grid.b)).toEqual(Array.from(b.grid.b));
    expect(Array.from(a.grid.ore)).toEqual(Array.from(b.grid.ore));
  });

  it('has caves but stays mostly solid', () => {
    let open = 0, total = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = generateTier({ layer: LAYERS[0], node: 'normal', seed }).grid;
      for (let y = TOP_ROWS; y < g.h - 1; y++) for (let x = 0; x < g.w; x++) {
        total++;
        if (g.get(x, y) === B.EMPTY) open++;
      }
    }
    expect(open / total).toBeGreaterThan(0.12);
    expect(open / total).toBeLessThan(0.45);
  });
});

describe('TierSim', () => {
  it('boulder wobbles, then falls and lands', () => {
    const g = new Grid(3, 8);
    for (let x = 0; x < 3; x++) g.set(x, 7, B.STONE);
    g.set(1, 1, B.BOULDER);
    const log: string[] = [];
    const sim = new TierSim(g, hooks(undefined, log));
    sim.update(BOULDER_WOBBLE / 2);
    expect(g.get(1, 1)).toBe(B.BOULDER);
    expect(log).toContain(`wobble:${B.BOULDER}`);
    for (let k = 0; k < 120; k++) sim.update(1 / 60);
    expect(g.get(1, 6)).toBe(B.BOULDER);
    expect(sim.falling.length).toBe(0);
  });

  it('falling boulder hits the player below', () => {
    const g = new Grid(3, 10);
    for (let x = 0; x < 3; x++) g.set(x, 9, B.STONE);
    g.set(1, 1, B.BOULDER);
    const log: string[] = [];
    const sim = new TierSim(g, hooks({ x: 1, y: 8 }, log));
    for (let k = 0; k < 120; k++) sim.update(1 / 60);
    expect(log).toContain(`hit:${B.BOULDER}`);
    expect(g.get(1, 8)).toBe(B.EMPTY);
  });

  it('sand falls without wobble, water flows down and drains into the exit', () => {
    const g = new Grid(3, 6);
    for (let x = 0; x < 3; x++) g.set(x, 5, B.STONE);
    g.set(1, 5, B.EXIT);
    g.set(0, 0, B.SAND);
    g.water[g.i(2, 0)] = 1;
    const sim = new TierSim(g, hooks());
    for (let k = 0; k < 60; k++) sim.update(1 / 60);
    expect(g.get(0, 4)).toBe(B.SAND);
    let water = 0;
    for (let i = 0; i < g.water.length; i++) water += g.water[i];
    expect(water).toBeLessThanOrEqual(1);
  });

  it('stalactite drops when the player walks under it', () => {
    const g = new Grid(3, 8);
    for (let x = 0; x < 3; x++) { g.set(x, 0, B.STONE); g.set(x, 7, B.STONE); }
    g.set(1, 1, B.STALACTITE);
    const log: string[] = [];
    const player = { x: 0, y: 6 };
    const sim = new TierSim(g, hooks(player, log));
    sim.update(0.1);
    expect(log).not.toContain(`wobble:${B.STALACTITE}`);
    player.x = 1;
    for (let k = 0; k < 90; k++) sim.update(1 / 60);
    expect(log).toContain(`hit:${B.STALACTITE}`);
  });

  it('fire spreads along coal and burns out', () => {
    const g = new Grid(4, 3);
    for (let x = 0; x < 4; x++) g.set(x, 1, B.ORE, 7); // уголь
    const log: string[] = [];
    const sim = new TierSim(g, hooks(undefined, log));
    sim.ignite(0, 1);
    for (let k = 0; k < 60 * 12; k++) sim.update(1 / 60);
    for (let x = 0; x < 4; x++) expect(g.get(x, 1)).toBe(B.EMPTY);
    expect(log.filter((s) => s === 'burn').length).toBe(4);
  });
});
