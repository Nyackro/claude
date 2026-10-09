// Руды пластов (GDD, раздел 6). Частота внутри пласта 60/30/10%.

export type OreKind = 'metal' | 'gem' | 'coal' | 'relic';

export interface OreDef {
  id: number;
  key: string;
  name: string;
  layer: number;
  value: number;
  weight: number;
  kind: OreKind;
  color: string;
  light: string;
  dark: string;
}

const o = (key: string, name: string, layer: number, value: number, weight: number, kind: OreKind,
  color: string, light: string, dark: string) => ({ key, name, layer, value, weight, kind, color, light, dark });

const LIST = [
  o('copper', 'Медь', 1, 2, 60, 'metal', '#c87533', '#f2a65e', '#7a4019'),
  o('tin', 'Олово', 1, 3, 30, 'metal', '#a7b1b7', '#e4ecef', '#5e6a72'),
  o('jasper', 'Яшма', 1, 8, 10, 'gem', '#c43a2c', '#ff8a78', '#6e1a12'),
  o('iron', 'Железо', 2, 4, 60, 'metal', '#a36b4f', '#dc9f80', '#5a3426'),
  o('silver', 'Серебро', 2, 8, 30, 'metal', '#dbe3e8', '#ffffff', '#8c9ea8'),
  o('pearl', 'Пещерный жемчуг', 2, 22, 10, 'gem', '#efe4cf', '#fffaf0', '#b0a184'),
  o('coal', 'Уголь', 3, 8, 60, 'coal', '#2a2a2a', '#7a7a7a', '#0b0b0b'),
  o('lead', 'Свинец', 3, 15, 30, 'metal', '#76828f', '#b8c4cf', '#434c55'),
  o('amber', 'Янтарь', 3, 45, 10, 'gem', '#e39b2d', '#ffd27a', '#8a5410'),
  o('gold', 'Золото', 4, 22, 60, 'metal', '#e5bf3f', '#fff0a0', '#8f6f12'),
  o('garnet', 'Гранат', 4, 40, 30, 'gem', '#9b1e32', '#e2566c', '#4f0b17'),
  o('topaz', 'Топаз', 4, 70, 10, 'gem', '#f0b24a', '#ffe1a0', '#9a6a17'),
  o('amethyst', 'Аметист', 5, 50, 60, 'gem', '#9b59b6', '#d7a6ec', '#5a2a70'),
  o('sapphire', 'Сапфир', 5, 90, 30, 'gem', '#2e64c8', '#8fb4ff', '#163672'),
  o('emerald', 'Изумруд', 5, 160, 10, 'gem', '#27ae60', '#8ff0b5', '#11602f'),
  o('platinum', 'Платина', 6, 110, 60, 'metal', '#d5dde3', '#ffffff', '#7f8b93'),
  o('sporelight', 'Светоспора', 6, 200, 30, 'gem', '#5ff0cc', '#d0fff2', '#1b8a70'),
  o('mushpearl', 'Грибной жемчуг', 6, 350, 10, 'gem', '#f39bd8', '#ffd9f2', '#99407e'),
  o('cryolite', 'Криолит', 7, 240, 60, 'metal', '#cfe9f7', '#ffffff', '#7da3b8'),
  o('aquamarine', 'Аквамарин', 7, 450, 30, 'gem', '#6fd6d0', '#c8fffb', '#2a8580'),
  o('tusk', 'Бивень мамонта', 7, 750, 10, 'relic', '#eadfc4', '#fffaeb', '#a39573'),
  o('ruby', 'Рубин', 8, 520, 60, 'gem', '#d11d3a', '#ff7088', '#6e0818'),
  o('fireopal', 'Огненный опал', 8, 950, 30, 'gem', '#ff6a2b', '#ffc08f', '#8f2e08'),
  o('salamander', 'Саламандров камень', 8, 1700, 10, 'gem', '#ff2f6d', '#ff9fbd', '#86102f'),
  o('orichalcum', 'Орихалк', 9, 1150, 60, 'metal', '#dfa356', '#ffd9a0', '#7f5420'),
  o('ancientcoin', 'Древняя монета', 9, 2100, 30, 'relic', '#d4af37', '#fff1a8', '#7d6512'),
  o('goldmask', 'Золотая маска', 9, 4000, 10, 'relic', '#f5c542', '#fff4c2', '#8f6b0e'),
  o('stariron', 'Звёздное железо', 10, 2500, 60, 'metal', '#9fb3ff', '#e2e8ff', '#4a5aa0'),
  o('corespark', 'Искра Ядра', 10, 4600, 30, 'gem', '#ffe066', '#fffbd6', '#a88a12'),
  o('starshard', 'Осколок звезды', 10, 9000, 10, 'gem', '#f4f6ff', '#ffffff', '#9aa3c8'),
];

export const ORES: OreDef[] = LIST.map((x, i) => ({ id: i + 1, ...x }));
const BY_KEY = new Map(ORES.map((x) => [x.key, x]));

export const oreById = (id: number): OreDef => ORES[id - 1];
export const oreByKey = (key: string): OreDef => {
  const r = BY_KEY.get(key);
  if (!r) throw new Error(`unknown ore ${key}`);
  return r;
};
export const oresOfLayer = (layer: number): OreDef[] => ORES.filter((x) => x.layer === layer);
