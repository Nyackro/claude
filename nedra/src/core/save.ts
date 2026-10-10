import { SAVE_KEY } from '../config';
import { newMeta, type MetaState, type RunState } from './state';

export interface SaveData {
  v: 2;
  ts: number;
  meta: MetaState;
  run: RunState | null;
}

/** Дополняет сохранение полями, появившимися в новых версиях. */
export function normalize(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<SaveData>;
  if (!d.meta || d.meta.v !== 2) return null;
  const base = newMeta();
  const meta: MetaState = {
    ...base,
    ...d.meta,
    stats: { ...base.stats, ...(d.meta.stats ?? {}) },
    purchases: { ...base.purchases, ...(d.meta.purchases ?? {}) },
    settings: { ...base.settings, ...(d.meta.settings ?? {}) },
    buildings: { ...(d.meta.buildings ?? {}) },
    heroes: Array.isArray(d.meta.heroes) && d.meta.heroes.length ? [...d.meta.heroes] : [...base.heroes],
    bosses: Array.isArray(d.meta.bosses) ? [...d.meta.bosses] : [],
    rescued: Array.isArray(d.meta.rescued) ? [...d.meta.rescued] : [],
    npcUp: { ...(d.meta.npcUp ?? {}) },
  };
  if (!meta.heroes.includes(meta.hero)) meta.hero = meta.heroes[0];
  const r = d.run as RunState | null | undefined;
  const run = r && typeof r === 'object' && typeof r.layer === 'number' && r.bag && r.items
    ? { ...r, rescued: r.rescued ?? null, potions: r.potions ?? 0, charm: r.charm ?? false } : null;
  return { v: 2, ts: Number(d.ts) || 0, meta, run };
}

export function loadLocal(): SaveData | null {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    return s ? normalize(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

export function saveLocal(d: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
  } catch {
    /* приватный режим: игра работает без сохранения */
  }
}

/** Из двух сохранений берём более свежее. */
export function pickNewest(a: SaveData | null, b: SaveData | null): SaveData | null {
  if (!a) return b;
  if (!b) return a;
  return b.ts > a.ts ? b : a;
}
