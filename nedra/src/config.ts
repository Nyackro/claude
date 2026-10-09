// Баланс. Числа из GDD.md (разделы 4-6, 9), темп проверен в pacing_sim.py.

export const COLS = 11;
export const TOP_ROWS = 3;            // открытые ряды сверху яруса (прибытие лифта)
export const ROWS = { normal: 30, cache: 18, boss: 36, tutorial: 22 } as const;
export const METERS_PER_TIER = 100;

export const HP0 = 1.5;               // средняя прочность блока: HP0 * HP_GROWTH^(L-1)
export const HP_GROWTH = 1.72;
export const V0 = 3;                  // средняя цена руды (Р): V0 * V_GROWTH^(L-1)
export const V_GROWTH = 2.2;

export const BASE_ENERGY = 100;
export const BASE_HEARTS = 3;
export const MAX_HEARTS = 6;
export const BASE_BELT = 5;
export const CONSUMABLE_SLOTS = 3;
export const CONSUMABLE_STACK = 5;

export const INGOTS_PER_COIN = 1 / 20;
export const EVAC_KEEP = 0.5;
export const SURFACE_BONUS = 0.25;
export const NEWBIE_RUNS = 10;
export const NEWBIE_MULT = 3;
export const NEWBIE_GIFT = 60;
export const TUTORIAL_ENERGY_MULT = 1.5;

export const COMBO_STEP = 0.1;
export const COMBO_MAX_MULT = 3;
export const COMBO_BREAK = 2;
export const VEIN_BONUS = 0.5;
export const EXPLOSION_ORE_MULT = 0.5;

export const FALL_DAMAGE_CELLS = 8;
export const BOULDER_WOBBLE = 0.6;
export const STALACTITE_WOBBLE = 0.45;
export const INVULN_TIME = 1.0;

export const DIG_TIME_MIN = 0.14;
export const DIG_TIME_MAX = 0.55;
export const WALK_TIME = 0.11;
export const CLIMB_TIME = 0.18;
export const FALL_ACCEL = 60;         // клеток/с^2
export const FALL_MAX = 16;           // клеток/с

// Цены в Р текущего пласта
export const PRICES = { drink: 4, stew: 5, dynamite: 3, ladder: 2, repair: 8, reroll: 3 } as const;
export const DRINK_PCT = 0.2;
export const DRINKS_PER_STATION = 2;
export const STEW_PCT = 0.3;
export const PIE_PCT = 0.1;
export const REST_ENERGY_PCT = 0.4;
export const TOOL_LEVEL_POWER = 0.25;
export const TOOL_MAX_LEVEL = 5;

export const AD_COOLDOWN = 150;       // с, переопределяется флагом ad_cooldown из Remote Config
export const SAVE_KEY = 'nedra_save_v1';
