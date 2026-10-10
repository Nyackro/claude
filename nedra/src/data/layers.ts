// Пласты: состав породы по этажам (чем глубже, тем твёрже), руда, враги, мини-босс и босс Разлома.
import { B } from '../core/blocks';

export interface LayerDef {
  id: number;
  name: string;
  depth: string;
  floor: string;                         // цвет пола пещер
  floor2: string;
  rocks: [number, number][][];           // для этажей 0, 1 и арены
  ores: [string, number][];
  enemies: [string, number][];
  mini: string;
  boss: string;
  ready: boolean;
}

export const LAYERS: LayerDef[] = [
  {
    id: 1, name: 'Дёрн и глина', depth: '0-300 м', floor: '#3b2a1d', floor2: '#2f2117',
    rocks: [
      [[B.DIRT, 55], [B.CLAY, 33], [B.STONE, 12]],
      [[B.DIRT, 34], [B.CLAY, 38], [B.STONE, 24], [B.GRANITE, 4]],
      [[B.DIRT, 50], [B.CLAY, 40], [B.STONE, 10]],
    ],
    ores: [['coal', 32], ['copper', 34], ['tin', 18], ['quartz', 11], ['jasper', 5]],
    enemies: [['slime', 45], ['beetle', 30], ['bat', 25]],
    mini: 'queen', boss: 'worm', ready: true,
  },
  {
    id: 2, name: 'Известняковые пещеры', depth: '300-600 м', floor: '#2c3036', floor2: '#23272c',
    rocks: [
      [[B.CLAY, 28], [B.STONE, 50], [B.GRANITE, 19], [B.BASALT, 3]],
      [[B.CLAY, 16], [B.STONE, 46], [B.GRANITE, 32], [B.BASALT, 6]],
      [[B.STONE, 60], [B.GRANITE, 40]],
    ],
    ores: [['coal', 18], ['copper', 10], ['iron', 32], ['silver', 20], ['malachite', 13], ['pearl', 7]],
    enemies: [['spider', 30], ['kobold', 30], ['crab', 22], ['bat', 18]],
    mini: 'mother', boss: 'golem', ready: true,
  },
  {
    id: 3, name: 'Угольные пласты', depth: '600-900 м', floor: '#221d1b', floor2: '#1a1614',
    rocks: [
      [[B.STONE, 40], [B.GRANITE, 38], [B.BASALT, 20], [B.OBSIDIAN, 2]],
      [[B.STONE, 28], [B.GRANITE, 40], [B.BASALT, 28], [B.OBSIDIAN, 4]],
      [[B.GRANITE, 60], [B.BASALT, 40]],
    ],
    ores: [['coal', 30], ['iron', 14], ['lead', 18], ['gold', 22], ['amber', 11], ['emerald', 5]],
    enemies: [['firebeetle', 32], ['wisp', 26], ['goblin', 26], ['crab', 16]],
    mini: 'baron', boss: 'salamander', ready: true,
  },
  ...[
    [4, 'Гранитный щит', '900-1200 м'], [5, 'Кристальные гроты', '1200-1500 м'], [6, 'Грибная чаща', '1500-1800 м'],
    [7, 'Подземный ледник', '1800-2100 м'], [8, 'Магматические камеры', '2100-2400 м'], [9, 'Город Предтеч', '2400-2700 м'],
    [10, 'Ядро', '2700-3000 м'],
  ].map(([id, name, depth]) => ({
    id: id as number, name: name as string, depth: depth as string, floor: '#222', floor2: '#1a1a1a',
    rocks: [[[B.GRANITE, 50], [B.BASALT, 50]]] as [number, number][][], ores: [['iron', 1]] as [string, number][], enemies: [['crab', 1]] as [string, number][],
    mini: 'baron', boss: 'golem', ready: false,
  })),
];

export const layerDef = (id: number): LayerDef => LAYERS[Math.max(1, Math.min(LAYERS.length, id)) - 1];
