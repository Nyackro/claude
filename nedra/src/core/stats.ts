import { BASE_HP, BASE_SPEED, LIGHT_BASE, MAGNET, MINE_INTERVAL, SHARPEN_STEP, SWORD_ARC, SWORD_CD, SWORD_RANGE,
  TORCH_LIGHT } from '../config';
import { heroDef } from '../data/heroes';
import { ITEM_BY_ID } from '../data/items';
import { buildingLevel } from '../data/meta';
import { applyNpcStats, npcLevel } from '../data/npcs';
import { PICKS, SWORDS } from '../data/tools';
import type { MetaState, RunState } from './state';

/** Характеристики гнома на этаже: мета + герой + кирка и меч + предметы. */
export interface PlayerStats {
  maxHp: number;
  armor: number;
  speed: number;
  pickPower: number;
  pickTier: number;
  mineInterval: number;
  swordDmg: number;
  swordCd: number;
  swordRange: number;
  swordArc: number;
  crit: number;
  critMult: number;
  dmgMult: number;
  bossDmg: number;
  execute: number;
  light: number;
  torchLight: number;
  magnet: number;
  luck: number;
  coinMult: number;
  killCoins: number;
  oreValue: number;
  doubleOre: number;
  healMult: number;
  healOnKill: number;
  regen: number;
  thorns: number;
  block: number;
  lifesteal: number;
  explRadius: number;
  explDmg: number;
  explSafe: boolean;
  projBonus: number;
  bounce: number;
  oreSight: number;
  freeTorchEvery: number;
  mushrooms: number;
  cdMult: number;
  wideMine: number;
  drillDepth: number;
  rush: number;
  rhythm: number;
  berserk: number;
  enemyHp: number;
  zoneResist: number;
  drone: number;
}

export function baseStats(): PlayerStats {
  return {
    maxHp: BASE_HP, armor: 0, speed: BASE_SPEED, pickPower: 1, pickTier: 0, mineInterval: MINE_INTERVAL,
    swordDmg: 4, swordCd: SWORD_CD, swordRange: SWORD_RANGE, swordArc: SWORD_ARC, crit: 0.05, critMult: 2,
    dmgMult: 1, bossDmg: 1, execute: 0, light: LIGHT_BASE, torchLight: TORCH_LIGHT, magnet: MAGNET, luck: 1,
    coinMult: 1, killCoins: 1, oreValue: 1, doubleOre: 0, healMult: 1, healOnKill: 0, regen: 0, thorns: 0, block: 0,
    lifesteal: 0, explRadius: 1, explDmg: 1, explSafe: false, projBonus: 0, bounce: 0, oreSight: 0, freeTorchEvery: 0,
    mushrooms: 0, cdMult: 1, wideMine: 0, drillDepth: 0, rush: 0, rhythm: 0, berserk: 0, enemyHp: 1,
    zoneResist: 1, drone: 0,
  };
}

export function computeStats(meta: MetaState, run: RunState): PlayerStats {
  const s = baseStats();
  const pick = PICKS[Math.min(PICKS.length - 1, run.pickTier)];
  const sword = SWORDS[Math.min(SWORDS.length - 1, run.swordTier)];
  s.pickTier = pick.tier;
  s.pickPower = pick.power * (1 + SHARPEN_STEP * run.pickSharpen) * (1 + 0.1 * buildingLevel(meta, 'forge'));
  s.swordDmg = sword.power * (1 + SHARPEN_STEP * run.swordSharpen) * (1 + 0.1 * buildingLevel(meta, 'armory'));
  s.maxHp += 4 * buildingLevel(meta, 'infirmary');
  applyNpcStats(meta, s);
  s.drone = npcLevel(meta, 'drone');
  heroDef(run.hero).apply(s);
  for (const [id, n] of Object.entries(run.items)) if (n > 0) ITEM_BY_ID.get(id)?.stats?.(s, n);
  s.maxHp = Math.max(1, Math.round(s.maxHp));
  s.swordArc = Math.min(360, s.swordArc);
  s.light = Math.max(1.2, s.light);
  s.block = Math.min(0.6, s.block);
  return s;
}

/** Здоровье не может быть больше максимума (после проклятий, смены героя и т.п.). */
export function clampHp(run: RunState, s: PlayerStats): void {
  run.hp = Math.max(0, Math.min(s.maxHp, run.hp));
}
