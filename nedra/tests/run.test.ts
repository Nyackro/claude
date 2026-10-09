import { describe, expect, it } from 'vitest';
import { computeIngots, layerR } from '../src/core/economy';
import { Rng } from '../src/core/rng';
import { addArtifact, advance, availableLifts, buy, eventChoices, finishRun, makeEventCtx, makeStation, newRun,
  onBossBeaten, randomArtifacts, rollHeirs } from '../src/core/run';
import { newMeta } from '../src/core/state';
import { computeStats } from '../src/core/stats';
import { ARTIFACTS } from '../src/data/artifacts';
import { EVENTS } from '../src/data/events';

describe('run flow', () => {
  it('tutorial run: single miner heir, boosted energy, fixed map', () => {
    const meta = newMeta();
    const heirs = rollHeirs(meta, new Rng(1));
    expect(heirs).toHaveLength(1);
    expect(heirs[0].profession).toBe('miner');
    const run = newRun(meta, heirs[0], 1, 123);
    expect(run.tutorial).toBe(true);
    expect(run.energy).toBe(150);
    expect(computeStats(meta, run).fallCells).toBe(Infinity);
    expect(run.map[2]).toEqual(['boss']);
    expect(run.consumables).toEqual([{ id: 'stew', n: 1 }]);
  });

  it('walks a layer: start -> row0 -> row1 -> boss -> next layer or forced end', () => {
    const meta = newMeta();
    meta.tutorialDone = true;
    const rng = new Rng(7);
    const run = newRun(meta, rollHeirs(meta, rng)[0], 1, 99);
    expect(run.station!.next.length).toBe(3);
    advance(run, run.station!.next[0], rng);
    expect(run.step).toBe(0);
    run.station = makeStation(meta, run, 'normal', rng);
    expect(run.station.next).toEqual(run.map[1]);
    advance(run, run.station.next[0], rng);
    expect(run.step).toBe(1);
    run.station = makeStation(meta, run, 'rich', rng);
    expect(run.station.next).toEqual(['boss']);
    advance(run, 'boss', rng);
    expect(run.step).toBe(2);
    const unlocks = onBossBeaten(meta, run);
    expect(unlocks.some((u) => u.includes('лифт'))).toBe(true);
    run.station = makeStation(meta, run, 'boss', rng);
    expect(run.station.offer!.length).toBe(3);
    expect(run.station.forcedEnd).toBeNull();
    const first = run.station.next[0];
    advance(run, first, rng);
    expect(run.layer).toBe(2);
    expect(run.step).toBe(0);
    expect(run.map[0][0]).toBe(first);

    // Разлом 2 даёт чертёж противогаза, без него в пласт 3 не пустят
    run.step = 2;
    onBossBeaten(meta, run);
    expect(meta.blueprints).toContain('gasmask');
    run.station = makeStation(meta, run, 'boss', rng);
    expect(run.station.forcedEnd).toMatch(/Противогаз/);
    meta.gear.push('gasmask');
    expect(availableLifts(meta)).toEqual([1, 2, 3]);
  });

  it('shop: drink limited per station, consumables respect slots', () => {
    const meta = newMeta();
    meta.tutorialDone = true;
    const run = newRun(meta, { name: 'Тест', female: false, profession: 'miner', trait: null }, 1, 5);
    const s = computeStats(meta, run);
    run.coins = 1000;
    run.energy = 10;
    expect(buy(run, s, 'drink')).toBe(true);
    expect(buy(run, s, 'drink')).toBe(true);
    expect(buy(run, s, 'drink')).toBe(false);
    expect(buy(run, s, 'dynamite')).toBe(true);
    expect(buy(run, s, 'ladder')).toBe(true);
    expect(buy(run, s, 'scan')).toBe(true);
    expect(run.consumables.length).toBe(4); // шахтёр: 3 + 1 слот, тушёнка уже есть
    expect(buy(run, s, 'bomb')).toBe(false);
  });

  it('artifacts: offers are unique, belt has a limit, stats apply', () => {
    const meta = newMeta();
    meta.tutorialDone = true;
    meta.bosses = [1, 2, 3];
    const run = newRun(meta, { name: 'Т', female: false, profession: 'miner', trait: null }, 1, 1);
    const rng = new Rng(3);
    const offer = randomArtifacts(meta, run, rng, 3, 'rare');
    expect(new Set(offer).size).toBe(3);
    let s = computeStats(meta, run);
    for (const id of ['thermos', 'loupe', 'boots', 'sharpen', 'veinsense', 'coffee']) addArtifact(run, s, id);
    expect(run.artifacts).toHaveLength(5);
    s = computeStats(meta, run);
    expect(s.maxEnergy).toBe(125);
    expect(s.fallCells).toBe(Infinity);
    expect(s.power).toBeCloseTo(1.2);
    expect(s.comboBreak).toBe(3);
  });

  it('every artifact applies without throwing', () => {
    const meta = newMeta();
    const run = newRun(meta, { name: 'Т', female: false, profession: 'geologist', trait: 'strong' }, 1, 1);
    run.artifacts = ARTIFACTS.map((x) => x.id);
    const s = computeStats(meta, run);
    expect(s.maxHearts).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(s.maxEnergy)).toBe(true);
  });

  it('every event choice resolves', () => {
    const meta = newMeta();
    meta.bosses = [1, 2, 3];
    for (const ev of EVENTS) {
      for (let k = 0; k < 3; k++) {
        const run = newRun(meta, { name: 'Т', female: false, profession: 'miner', trait: null }, 2, 10 + k);
        run.coins = 100;
        run.artifacts = ['thermos'];
        run.station = makeStation(meta, run, 'cache', new Rng(k));
        run.station.eventId = ev.id;
        const e = eventChoices(run.station)!;
        expect(e.choices.length).toBeGreaterThan(0);
        for (const c of e.choices) {
          const ctx = makeEventCtx(meta, run, new Rng(k));
          if (c.can && !c.can(ctx)) continue;
          expect(typeof c.act(ctx)).toBe('string');
        }
      }
    }
  });

  it('ingots: cash-out beats evacuation, newbie and surface bonuses apply', () => {
    const meta = newMeta();
    meta.tutorialDone = true;
    const run = newRun(meta, { name: 'Т', female: false, profession: 'miner', trait: null }, 1, 1);
    run.haul = 400;
    const full = computeIngots(meta, run, 1).ingots;
    const half = computeIngots(meta, run, 0.5).ingots;
    expect(full).toBe(Math.floor(400 / 20 * 1.25 * 3));
    expect(half).toBe(Math.floor(full / 2));
    const out = finishRun(meta, run, 'cashout');
    expect(meta.ingots).toBe(out.ingots);
    expect(meta.firstCashOut).toBe(true);
    expect(layerR(1)).toBe(3);
  });
});
