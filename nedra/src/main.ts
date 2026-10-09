import './style.css';
import { Game } from './game/game';

const game = new Game(document.getElementById('app')!);
game.start().catch((e) => {
  console.error(e);
  const el = document.getElementById('loading');
  if (el) el.textContent = 'Не удалось запустить игру. Обнови страницу.';
});
if (import.meta.env.DEV || location.search.includes('debug')) (window as unknown as { __game: Game }).__game = game;
