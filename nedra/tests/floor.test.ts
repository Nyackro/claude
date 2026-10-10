import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newRun } from '../src/core/run';
import { BUILDINGS, buildingCost, buildingLevel } from '../src/data/meta';
import { freshMeta, playFloor, simulateRun } from './bot';

describe('этаж под управлением бота', () => {
  it('первый этаж проходится и не ломается', () => {
    const meta = freshMeta();
    const run = newRun(meta, 'miner', 1, 12345);
    run.station = null;
    const r = playFloor(meta, run, 400);
    expect(r.died || r.done).toBe(true);
    expect(Number.isFinite(run.hp)).toBe(true);
  });

  it.skipIf(!process.env.SIM)('прогон забегов (SIM=1)', () => {
    const heroes = (process.env.SIM_HEROES ?? 'miner,warrior,blaster,geologist,engineer,herbalist').split(',');
    for (const hero of heroes) {
      for (let seed = 1; seed <= Number(process.env.SIM_SEEDS ?? 4); seed++) {
        const meta = freshMeta();
        const log: string[] = [];
        const sim = simulateRun(meta, hero, seed * 7919, 3, log);
        const fl = sim.floors.map((f) => `${f.layer}.${f.floor}:${f.done ? 'ok' : f.died ? 'DIED' : 'TIME'} ${f.time}s -${f.hpLost}hp k${f.kills} o${f.ore} c${f.coins}${f.stuck ? ` stuck${f.stuck}` : ''}`);
        appendFileSync(process.env.SIM_OUT ?? 'sim.log', `${hero} #${seed}: pick ${sim.run.pickTier}+${sim.run.pickSharpen} sword ${sim.run.swordTier}+${sim.run.swordSharpen} haul ${Math.round(sim.run.haul)} ingots ${sim.outcome.ingots}\n  ${fl.join('\n  ')}\n${process.env.SIM_LOG ? `    ${log.join('\n    ')}\n` : ''}`);
      }
    }
  }, 600_000);
});

describe('прогрессия между забегами', () => {
  it.skipIf(!process.env.SIM_META)('кампания (SIM_META=1)', () => {
    const meta = freshMeta();
    meta.tutorialDone = false;
    const out = process.env.SIM_OUT ?? 'sim.log';
    let time = 0;
    for (let r = 1; r <= Number(process.env.SIM_RUNS ?? 30); r++) {
      const hero = meta.heroes.includes('warrior') ? 'warrior' : 'miner';
      const sim = simulateRun(meta, hero, r * 104729, 3);
      const t = sim.floors.reduce((a, f) => a + f.time, 0) + sim.floors.length * 40;
      time += t;
      // постройки: самые дешёвые полезные
      for (let k = 0; k < 20; k++) {
        const opts = BUILDINGS.filter((b) => buildingLevel(meta, b.id) < b.max).map((b) => ({ b, c: buildingCost(b, buildingLevel(meta, b.id)) }))
          .sort((a, b) => a.c - b.c);
        const o = opts[0];
        if (!o || meta.ingots < o.c) break;
        meta.ingots -= o.c;
        meta.buildings[o.b.id] = buildingLevel(meta, o.b.id) + 1;
      }
      const last = sim.floors[sim.floors.length - 1];
      appendFileSync(out, `run ${r} ${hero}: ${sim.floors.map((f) => `${f.layer}.${f.floor}${f.done ? '' : f.died ? 'x' : 't'}`).join(' ')} | ${last ? `${last.time}s` : ''} ingots +${sim.outcome.ingots} bank ${meta.ingots} bosses [${meta.bosses}] heroes ${meta.heroes.length} bld ${JSON.stringify(meta.buildings)} time ${Math.round(time / 60)}m\n`);
    }
  }, 900_000);
});
