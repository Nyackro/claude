// Типы блоков сетки. Цифры хранятся в Uint8Array.

export const B = {
  EMPTY: 0,
  DIRT: 1,
  CLAY: 2,
  STONE: 3,
  HARD: 4,
  BEDROCK: 5,
  ORE: 6,
  BOULDER: 7,
  SAND: 8,
  STALACTITE: 9,
  CHEST: 10,
  CRATE: 11,
  GAS: 12,
  RUBBLE: 13,
  EXIT: 14,
} as const;

export type BlockId = (typeof B)[keyof typeof B];

export interface BlockDef {
  name: string;
  hp: number;          // множитель к прочности пласта
  solid: boolean;      // мешает движению
  diggable: boolean;
  rock: boolean;       // пустая порода: сбивает комбо, высекает искру в газе
}

const def = (name: string, hp: number, solid = true, diggable = true, rock = true): BlockDef =>
  ({ name, hp, solid, diggable, rock });

export const BLOCKS: Record<number, BlockDef> = {
  [B.EMPTY]: def('Пусто', 0, false, false, false),
  [B.DIRT]: def('Грунт', 0.6),
  [B.CLAY]: def('Глина', 1.0),
  [B.STONE]: def('Камень', 1.5),
  [B.HARD]: def('Твёрдая порода', 3.0),
  [B.BEDROCK]: def('Коренная порода', 0, true, false, false),
  [B.ORE]: def('Руда', 1.2, true, true, false),
  [B.BOULDER]: def('Валун', 2.0),
  [B.SAND]: def('Сыпучка', 0.4),
  [B.STALACTITE]: def('Сталактит', 0.5),
  [B.CHEST]: def('Сундук', 0.4, true, true, false),
  [B.CRATE]: def('Ящик с припасами', 0.4, true, true, false),
  [B.GAS]: def('Камень', 1.5),
  [B.RUBBLE]: def('Обломки', 0.5),
  [B.EXIT]: def('Лифт', 0, false, false, false),
};

export const isFalling = (b: number) => b === B.BOULDER || b === B.SAND;
