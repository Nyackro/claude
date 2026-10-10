// Клетки этажа (вид сверху). Порода различается прочностью и уровнем кирки, который нужен, чтобы её копать.

export const B = {
  FLOOR: 0,
  DIRT: 1,
  CLAY: 2,
  STONE: 3,
  GRANITE: 4,
  BASALT: 5,
  OBSIDIAN: 6,
  BEDROCK: 7,
  ORE: 8,
  CHEST: 9,
  CRATE: 10,
  TNT: 11,
  CRYSTAL: 12,
  CRACKED: 13,
  DOOR: 14,
  CRYSTALROCK: 15,
  MYCEL: 16,
  ICE: 17,
  MAGMA: 18,
  RUNE: 19,
  STAR: 20,
} as const;

export type BlockId = (typeof B)[keyof typeof B];

export interface BlockDef {
  name: string;
  hp: number;
  tier: number;        // минимальный уровень кирки
  solid: boolean;
  rock: boolean;       // обычная порода (может быть носителем руды)
}

const d = (name: string, hp: number, tier: number, solid = true, rock = true): BlockDef => ({ name, hp, tier, solid, rock });

export const BLOCKS: Record<number, BlockDef> = {
  [B.FLOOR]: d('Пол', 0, 0, false, false),
  [B.DIRT]: d('Земля', 3, 0),
  [B.CLAY]: d('Глина', 6, 0),
  [B.STONE]: d('Камень', 12, 0),
  [B.GRANITE]: d('Гранит', 22, 1),
  [B.BASALT]: d('Базальт', 38, 2),
  [B.OBSIDIAN]: d('Обсидиан', 60, 3),
  [B.BEDROCK]: d('Коренная порода', Infinity, 99, true, false),
  [B.ORE]: d('Руда', 0, 0),
  [B.CHEST]: d('Сундук', 2, 0, true, false),
  [B.CRATE]: d('Ящик', 2, 0, true, false),
  [B.TNT]: d('Бочка с порохом', 1, 0, true, false),
  [B.CRYSTAL]: d('Светокристалл', 8, 1, true, false),
  [B.CRACKED]: d('Треснувшая стена', 4, 0, true, false),
  [B.DOOR]: d('Запечатанный проход', Infinity, 99, true, false),
  [B.CRYSTALROCK]: d('Кристаллит', 48, 3),
  [B.MYCEL]: d('Мицелий', 26, 2),
  [B.ICE]: d('Вечный лёд', 34, 2),
  [B.MAGMA]: d('Магмовый камень', 85, 4),
  [B.RUNE]: d('Кладка Предтеч', 95, 4),
  [B.STAR]: d('Звёздная порода', 140, 5),
};

export const ROCKS = [B.DIRT, B.CLAY, B.STONE, B.GRANITE, B.BASALT, B.OBSIDIAN, B.CRYSTALROCK, B.MYCEL, B.ICE, B.MAGMA, B.RUNE, B.STAR] as const;

export const PICK_TIER_NAME = ['деревянная', 'медная', 'железная', 'стальная', 'мифриловая', 'адамантитовая', 'звёздная'];
