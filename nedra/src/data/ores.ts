// Руды: tier - какая кирка нужна, value - цена у скупщика, hp - добавка к прочности породы.

export type OreKind = 'coal' | 'metal' | 'gem' | 'relic';

export interface OreDef {
  id: number;
  key: string;
  name: string;
  value: number;
  tier: number;
  hp: number;
  kind: OreKind;
  color: string;
  light: string;
  dark: string;
  glow?: string;      // светится в темноте
}

type Raw = Omit<OreDef, 'id'>;
const o = (key: string, name: string, value: number, tier: number, hp: number, kind: OreKind,
  color: string, light: string, dark: string, glow?: string): Raw => ({ key, name, value, tier, hp, kind, color, light, dark, glow });

const LIST: Raw[] = [
  o('coal', 'Уголь', 1, 0, 2, 'coal', '#2b2b2e', '#8a8a92', '#0b0b0d'),
  o('copper', 'Медь', 3, 0, 3, 'metal', '#d07a3a', '#ffb072', '#7a3e16'),
  o('tin', 'Олово', 4, 0, 3, 'metal', '#b7c2c7', '#f0f6f8', '#66727a'),
  o('quartz', 'Кварц', 8, 0, 4, 'gem', '#e8e2f5', '#ffffff', '#9a8fb5', '#d9ccff'),
  o('jasper', 'Яшма', 15, 1, 6, 'gem', '#d0402e', '#ff8a78', '#6e1a12'),
  o('iron', 'Железо', 6, 1, 6, 'metal', '#a87156', '#e3ab8c', '#5a3426'),
  o('silver', 'Серебро', 10, 1, 6, 'metal', '#dfe7ec', '#ffffff', '#8c9ea8'),
  o('malachite', 'Малахит', 22, 1, 8, 'gem', '#2fae6a', '#8ff0b8', '#0f5a32'),
  o('pearl', 'Пещерный жемчуг', 38, 2, 8, 'gem', '#f2e8d4', '#fffaf0', '#b0a184', '#fff6dc'),
  o('lead', 'Свинец', 9, 1, 8, 'metal', '#7c8896', '#bcc8d3', '#434c55'),
  o('gold', 'Золото', 18, 2, 10, 'metal', '#e8c13f', '#fff0a0', '#8f6f12', '#ffd75a'),
  o('amber', 'Янтарь', 30, 2, 10, 'gem', '#e8992a', '#ffd27a', '#8a5410', '#ffb347'),
  o('emerald', 'Изумруд', 70, 3, 14, 'gem', '#1fbf74', '#9dffd0', '#0b6b3c', '#5dffad'),
  o('mithril', 'Мифрил', 45, 3, 16, 'metal', '#8fd6ff', '#e0f6ff', '#3c7fa8', '#9fe0ff'),
  o('ruby', 'Рубин', 110, 4, 20, 'gem', '#e0213f', '#ff7088', '#6e0818', '#ff4a6a'),
  o('adamantite', 'Адамантит', 90, 4, 24, 'metal', '#b04ad9', '#e9a6ff', '#52186e', '#c76bff'),
  o('diamond', 'Алмаз', 220, 5, 30, 'gem', '#bff4ff', '#ffffff', '#5fb0c8', '#d6fbff'),
  o('starmetal', 'Звёздный металл', 260, 5, 34, 'metal', '#9fb3ff', '#e2e8ff', '#4a5aa0', '#b8c6ff'),
  o('glowspore', 'Светоспора', 55, 3, 12, 'gem', '#7dff6a', '#d8ffc8', '#2a7a20', '#9dff7a'),
  o('cryolite', 'Криолит', 40, 3, 14, 'metal', '#9fe8ff', '#effcff', '#3f8aa8'),
  o('aquamarine', 'Аквамарин', 85, 3, 14, 'gem', '#4fd8e8', '#c8f8ff', '#16707e', '#7ff0ff'),
  o('fireopal', 'Огненный опал', 150, 4, 20, 'gem', '#ff7a2a', '#ffd08a', '#8a2a08', '#ff9a4a'),
  o('orichalcum', 'Орихалк', 120, 4, 26, 'metal', '#f0b040', '#fff0b0', '#8a5a10', '#ffd060'),
  o('relic', 'Древняя монета', 200, 2, 10, 'relic', '#d8b860', '#fff4c0', '#6a5420', '#ffe08a'),
  o('starshard', 'Осколок звезды', 420, 5, 36, 'gem', '#c8a8ff', '#ffffff', '#5a3aa8', '#e0d0ff'),
  o('voidstone', 'Камень Изнанки', 800, 6, 50, 'gem', '#ff3a8a', '#ffd0f0', '#3a0a2a', '#ff5ab0'),
];

export const ORES: OreDef[] = LIST.map((x, i) => ({ id: i + 1, ...x }));
const BY_KEY = new Map(ORES.map((x) => [x.key, x]));

export const oreById = (id: number): OreDef => ORES[id - 1];
export const oreByKey = (key: string): OreDef => {
  const r = BY_KEY.get(key);
  if (!r) throw new Error(`unknown ore ${key}`);
  return r;
};
