import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { availableLifts, newRun } from '../src/core/run';
import { freshMeta, botMeta, playFloor, simulateRun } from './bot';

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
    const firsts = new Map<string, number>();
    let liftWait = 0;
    for (let r = 1; r <= Number(process.env.SIM_RUNS ?? 30); r++) {
      const hero = meta.heroes.includes('warrior') ? 'warrior' : 'miner';
      const lifts = availableLifts(meta);
      // как игрок: с самого глубокого лифта, а если там не выжить - пару раз с поверхности
      const start = liftWait > 0 ? 1 : lifts[lifts.length - 1];
      const t0 = Date.now();
      const sim = simulateRun(meta, hero, r * 104729 + Number(process.env.SIM_SEED ?? 0), 99, [], start);
      const t = sim.floors.reduce((a, f) => a + f.time, 0) + sim.floors.length * 40;
      time += t;
      botMeta(meta);
      if (start > 1 && !sim.floors.some((f) => f.layer > start || (f.layer === start && f.floor === 2))) liftWait = 2;
      else if (liftWait > 0) liftWait--;
      for (const id of meta.rescued) if (!firsts.has(id)) firsts.set(id, time);
      for (const b of meta.bosses) if (!firsts.has(`b${b}`)) firsts.set(`b${b}`, time);
      const last = sim.floors[sim.floors.length - 1];
      const up = Object.values(meta.npcUp).reduce((a, v) => a + v, 0);
      appendFileSync(out, `run ${r} ${hero} @${start}: ${sim.floors.map((f) => `${f.layer}.${f.floor}${f.done ? '' : f.died ? 'x' : 't'}`).join(' ')} | ${last ? `${last.time}s -${last.hpLost}hp` : ''} pick ${sim.run.pickTier}+${sim.run.pickSharpen} sword ${sim.run.swordTier}+${sim.run.swordSharpen} ingots +${sim.outcome.ingots} bank ${meta.ingots} top ${Math.max(0, ...meta.bosses)} saved ${meta.rescued.length} npcUp ${up} bld ${Object.values(meta.buildings).reduce((a, v) => a + v, 0)} time ${(time / 3600).toFixed(2)}h cpu ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
    }
    appendFileSync(out, `firsts: ${[...firsts].map(([k, v]) => `${k}@${(v / 3600).toFixed(1)}h`).join(' ')}\n`);
  }, 7_200_000);
});
