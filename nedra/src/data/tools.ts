// Кирки и мечи: новый уровень куётся из руды (сильный скачок), заточка за монеты (+15% за уровень).

export interface ToolTier {
  tier: number;
  name: string;
  power: number;                      // сила удара кирки или урон меча
  recipe: Record<string, number>;     // руда для ковки
}

export const PICKS: ToolTier[] = [
  { tier: 0, name: 'Деревянная кирка', power: 1, recipe: {} },
  { tier: 1, name: 'Медная кирка', power: 2, recipe: { copper: 10 } },
  { tier: 2, name: 'Железная кирка', power: 3.6, recipe: { iron: 12 } },
  { tier: 3, name: 'Стальная кирка', power: 6.2, recipe: { iron: 8, coal: 12 } },
  { tier: 4, name: 'Мифриловая кирка', power: 10, recipe: { mithril: 10 } },
  { tier: 5, name: 'Адамантитовая кирка', power: 16, recipe: { adamantite: 12 } },
  { tier: 6, name: 'Звёздная кирка', power: 26, recipe: { starmetal: 10, starshard: 2 } },
];

export const SWORDS: ToolTier[] = [
  { tier: 0, name: 'Ржавый тесак', power: 4, recipe: {} },
  { tier: 1, name: 'Медный меч', power: 6, recipe: { copper: 8, tin: 4 } },
  { tier: 2, name: 'Железный меч', power: 10, recipe: { iron: 10 } },
  { tier: 3, name: 'Стальной меч', power: 16, recipe: { iron: 8, coal: 10 } },
  { tier: 4, name: 'Мифриловый меч', power: 26, recipe: { mithril: 10 } },
  { tier: 5, name: 'Адамантитовый меч', power: 42, recipe: { adamantite: 10 } },
  { tier: 6, name: 'Клинок звезды', power: 68, recipe: { starmetal: 10, starshard: 2 } },
];

export const sharpenCost = (kind: 'pick' | 'sword', lvl: number): number =>
  Math.round((kind === 'pick' ? 20 : 25) * 1.35 ** lvl);
