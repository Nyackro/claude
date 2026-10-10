import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newRun } from '../src/core/run';
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
