import { describe, expect, it } from 'vitest';
import { newMeta } from '../src/core/state';
import type { NodeType } from '../src/core/gen';
import { botRun, playTier } from './bot';

describe('bot can finish tiers', () => {
  const nodes: NodeType[] = ['normal', 'rich', 'danger', 'cache', 'boss'];
  for (const layer of [1, 2, 3]) {
    for (const node of nodes) {
      it(`layer ${layer} ${node}`, () => {
        const meta = newMeta();
        meta.tutorialDone = true;
        meta.gear = ['gasmask'];
        meta.buildings = { forge: 4 * (layer - 1), canteen: 6 * (layer - 1) };
        let finished = 0;
        for (let k = 0; k < 6; k++) {
          const run = botRun(meta, layer, 1000 * layer + k * 17 + node.length);
          run.energy = 10_000;                   // проверяем проходимость, а не экономику
          run.hearts = 99;
          const r = playTier(meta, run, node, 77 + k * 131 + layer);
          if (r.done) finished++;
        }
        expect(finished).toBe(6);
      });
    }
  }
});
