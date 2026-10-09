// Расходники (GDD, раздел 7.3). Цена в Р текущего пласта.

export interface ConsumableDef {
  id: string;
  name: string;
  desc: string;
  price: number;
}

export const CONSUMABLES: ConsumableDef[] = [
  { id: 'dynamite', name: 'Динамит', desc: 'Взрыв вокруг гнома. Руда из взрыва стоит 50%.', price: 3 },
  { id: 'ladder', name: 'Лестница', desc: 'Ставит 3 ступени вверх: вернуться за рудой.', price: 2 },
  { id: 'stew', name: 'Тушёнка', desc: '+30% энергии.', price: 5 },
  { id: 'scan', name: 'Сканер', desc: 'Подсвечивает руду в радиусе 8.', price: 3 },
  { id: 'bomb', name: 'Бур-бомба', desc: 'Пробивает тоннель на 6 блоков вниз.', price: 6 },
];

export const consumableDef = (id: string): ConsumableDef => CONSUMABLES.find((c) => c.id === id) ?? CONSUMABLES[0];
