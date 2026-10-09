import { BASE_BELT, BASE_ENERGY, BASE_HEARTS, COMBO_BREAK, COMBO_STEP, CONSUMABLE_SLOTS, EVAC_KEEP,
  EXPLOSION_ORE_MULT, FALL_DAMAGE_CELLS, MAX_HEARTS, TOOL_LEVEL_POWER, TUTORIAL_ENERGY_MULT } from '../config';
import { ARTIFACT_BY_ID } from '../data/artifacts';
import { professionDef, TOOLS, traitDef } from '../data/heirs';
import { buildingLevel } from '../data/meta';
import type { MetaState, RunState } from './state';

/** Производные характеристики забега: мета + профессия + черта + артефакты + события. */
export interface RunStats {
  maxEnergy: number;
  maxHearts: number;
  power: number;
  downMult: number;           // множитель энергии при копании вниз
  sideMult: number;
  costMult: number;
  oreMult: number;
  gemMult: number;
  metalMult: number;
  foodMult: number;
  comboStep: number;
  comboBreak: number;
  fallCells: number;
  explOreMult: number;
  explosionSafe: boolean;
  gasSafe: boolean;
  gasVisible: boolean;
  poiVision: boolean;
  waterFree: boolean;
  lightBonus: number;
  extraChests: number;
  freeBlocks: number;
  freeChance: number;
  shopMult: number;
  beltSlots: number;
  consumableSlots: number;
  dynamiteRadius: number;
  oreVision: number;
  evacKeep: number;
  restMult: number;
  blur: boolean;
  grayscale: boolean;
  beardRope: boolean;
  clumsy: boolean;
  singer: boolean;
  tool: string;
}

export function computeStats(meta: MetaState, run: RunState): RunStats {
  const prof = professionDef(run.heir.profession);
  const tool = TOOLS[prof.tool];
  const s: RunStats = {
    maxEnergy: BASE_ENERGY * (1 + 0.12 * buildingLevel(meta, 'canteen')),
    maxHearts: BASE_HEARTS + buildingLevel(meta, 'helmet'),
    power: 1.18 ** buildingLevel(meta, 'forge') * tool.power * (1 + TOOL_LEVEL_POWER * (run.toolLevel - 1)),
    downMult: prof.tool === 'drill' ? 1 / 1.5 : 1,
    sideMult: prof.tool === 'drill' ? 1 / 0.7 : 1,
    costMult: 1,
    oreMult: (1 + 0.06 * buildingLevel(meta, 'survey')) * (1 + run.oreBlessing),
    gemMult: 1,
    metalMult: 1,
    foodMult: 1,
    comboStep: COMBO_STEP,
    comboBreak: COMBO_BREAK,
    fallCells: FALL_DAMAGE_CELLS,
    explOreMult: EXPLOSION_ORE_MULT,
    explosionSafe: false,
    gasSafe: meta.gear.includes('gasmask'),
    gasVisible: false,
    poiVision: false,
    waterFree: false,
    lightBonus: 0,
    extraChests: run.chestBlessing,
    freeBlocks: 0,
    freeChance: 0,
    shopMult: 1,
    beltSlots: BASE_BELT + run.beltBonus,
    consumableSlots: CONSUMABLE_SLOTS,
    dynamiteRadius: 1,
    oreVision: 0,
    evacKeep: EVAC_KEEP + 0.05 * buildingLevel(meta, 'insurance'),
    restMult: 1,
    blur: false,
    grayscale: false,
    beardRope: false,
    clumsy: false,
    singer: false,
    tool: tool.id,
  };
  prof.apply?.(s);
  traitDef(run.heir.trait)?.apply?.(s);
  if (run.pet === 'cat') s.maxHearts += 1;
  if (run.tutorial) {
    s.maxEnergy *= TUTORIAL_ENERGY_MULT;
    s.fallCells = Infinity;
  }
  for (const id of run.artifacts) ARTIFACT_BY_ID.get(id)?.apply?.(s, run);
  s.maxEnergy = Math.round(s.maxEnergy);
  s.maxHearts = Math.max(1, Math.min(MAX_HEARTS + 1, s.maxHearts));
  return s;
}
