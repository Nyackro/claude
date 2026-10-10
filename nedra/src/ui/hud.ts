// HUD этажа: здоровье, монеты, уголь, бомбы, мини-карта, полоска босса, кнопки способности, факела и бомбы.
import { B, BLOCKS, PICK_TIER_NAME } from '../core/blocks';
import type { RunState } from '../core/state';
import { enemyDef } from '../data/enemies';
import { heroDef } from '../data/heroes';
import { itemDef, RARITY_NAME } from '../data/items';
import { layerDef } from '../data/layers';
import { oreById } from '../data/ores';
import { PICKS, SWORDS } from '../data/tools';
import type { Floor } from '../game/floor';
import type { Game } from '../game/game';
import { fmt, h, icon } from './dom';

const HINTS = [
  'Тяни палец по экрану (или WASD), чтобы идти. Упрись в стену - гном копает.',
  'Враг рядом - меч бьёт сам. Отходи между ударами!',
  'Темно? Кнопка с огнём ставит факел: 1 уголь = 1 факел.',
  'Ищи лестницу вниз в конце этажа. Между этажами - привал с кузницей и лавкой.',
];

const MINI_ROWS = 30;
const MINI_PX = 2;

export class Hud {
  private hpFill: HTMLElement;
  private hpText: HTMLElement;
  private hpBar: HTMLElement;
  private coins: HTMLElement;
  private coal: HTMLElement;
  private bombs: HTMLElement;
  private where: HTMLElement;
  private tools: HTMLElement;
  private boss: HTMLElement;
  private bossName: HTMLElement;
  private bossFill: HTMLElement;
  private mini: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private ability: HTMLElement;
  private abilityRing: HTMLElement;
  private torchN: HTMLElement;
  private bombN: HTMLElement;
  private scanBtn: HTMLElement;
  private scanN: HTMLElement;
  private hint: HTMLElement;
  private banner: HTMLElement;
  private card: HTMLElement;
  private sig = '';
  private miniT = 0;
  private hintStep = -1;
  private hintT = 0;
  private cardT = 0;
  private bannerT = 0;

  constructor(private root: HTMLElement, game: Game) {
    this.hpFill = h('i');
    this.hpText = h('b');
    this.hpBar = h('div', { class: 'bar hp' }, this.hpFill, h('span', null, icon('heart'), this.hpText));
    this.coins = h('b', null, '0');
    this.coal = h('b', null, '0');
    this.bombs = h('b', null, '0');
    this.where = h('span');
    this.tools = h('span');
    this.bossName = h('b');
    this.bossFill = h('i');
    this.boss = h('div', { class: 'boss-bar hidden' }, this.bossName, h('div', { class: 'bar' }, this.bossFill));
    this.mini = h('canvas', { class: 'minimap', width: 54, height: MINI_ROWS * MINI_PX }) as HTMLCanvasElement;
    this.mctx = this.mini.getContext('2d')!;
    const act = (a: string) => (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      game.input.actions.push(a);
    };
    this.abilityRing = h('i', { class: 'cd' });
    this.ability = h('button', { class: 'act big', 'aria-label': 'Способность', onpointerdown: act('ability') }, this.abilityRing, h('span', { class: 'act-name' }));
    this.torchN = h('b');
    this.bombN = h('b');
    this.scanN = h('b');
    this.scanBtn = h('button', { class: 'act small hidden', 'aria-label': 'Сканер', onpointerdown: act('scan') }, icon('scan'), this.scanN);
    this.hint = h('div', { class: 'hint hidden' });
    this.banner = h('div', { class: 'floor-banner hidden' });
    this.card = h('div', { class: 'item-pop hidden' });
    const pause = h('button', { class: 'round-btn', 'aria-label': 'Пауза', onpointerdown: (e: Event) => { e.stopPropagation(); game.pauseMenu(); } }, icon('pause'));
    root.append(
      h('div', { class: 'hud-top' },
        h('div', { class: 'hud-row' }, this.hpBar,
          h('span', { class: 'chip' }, icon('coin'), this.coins),
          pause),
        h('div', { class: 'hud-sub' }, this.where, this.tools)),
      this.mini,
      this.boss,
      h('div', { class: 'hud-actions' },
        this.scanBtn,
        h('button', { class: 'act', 'aria-label': 'Бомба', onpointerdown: act('bomb') }, icon('bomb'), this.bombN),
        h('button', { class: 'act', 'aria-label': 'Факел', onpointerdown: act('torch') }, icon('torch'), this.torchN),
        this.ability),
      h('div', { class: 'hud-res' }, h('span', { class: 'chip' }, icon('coal'), this.coal), h('span', { class: 'chip' }, icon('bomb'), this.bombs)),
      this.hint,
      this.banner,
      this.card,
    );
    this.hide();
  }

  show(): void {
    this.root.classList.remove('hidden');
    this.sig = '';
    this.miniT = 0;
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.hint.classList.add('hidden');
    this.card.classList.add('hidden');
    this.banner.classList.add('hidden');
    this.hintStep = -1;
  }

  /** Заставка этажа: где мы и какие породы ждут. */
  intro(f: Floor, run: RunState): void {
    const L = layerDef(run.layer);
    const boss = f.layout.arena !== null;
    const rocks = (L.rocks[Math.min(L.rocks.length - 1, run.floor)] ?? []).map(([b]) => b);
    const pick = run.pickTier;
    const chips = rocks.map((b) => {
      const d = BLOCKS[b];
      const ok = d.tier <= pick;
      return h('span', { class: `rock-chip ${ok ? '' : 'hard'}` }, d.name, ok ? '' : `: нужна ${PICK_TIER_NAME[d.tier]} кирка`);
    });
    this.banner.replaceChildren(
      h('div', { class: 'fb-title' }, boss ? `Разлом: ${enemyDef(L.boss).name}` : `Пласт ${L.id} · этаж ${run.floor + 1} из 2`),
      h('div', { class: 'fb-sub' }, `${L.name}, ${L.depth}`),
      h('div', { class: 'fb-rocks' }, ...chips));
    this.banner.classList.remove('hidden');
    this.bannerT = 4;
  }

  itemCard(id: string): void {
    const d = itemDef(id);
    this.card.className = `item-pop ${d.rarity}`;
    this.card.replaceChildren(h('div', { class: 'rar' }, RARITY_NAME[d.rarity]), h('div', { class: 'name' }, d.name), h('div', { class: 'desc' }, d.desc));
    this.cardT = 4;
  }

  update(f: Floor, run: RunState, dt: number): void {
    const s = f.stats;
    const hp = Math.max(0, Math.ceil(run.hp));
    const hero = heroDef(run.hero);
    const where = f.layout.arena ? `Пласт ${run.layer} · Разлом` : `Пласт ${run.layer} · этаж ${run.floor + 1}/2`;
    const tools = `${PICKS[run.pickTier].name}${run.pickSharpen ? ` +${run.pickSharpen}` : ''} · ${SWORDS[run.swordTier].name}${run.swordSharpen ? ` +${run.swordSharpen}` : ''}`;
    const coal = run.bag.coal ?? 0;
    const sig = `${hp}|${s.maxHp}|${Math.floor(run.coins)}|${coal}|${run.bombs}|${run.scanners}|${where}|${tools}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.hpFill.style.width = `${Math.min(100, (hp / s.maxHp) * 100)}%`;
      this.hpText.textContent = `${hp}/${s.maxHp}`;
      this.hpBar.classList.toggle('low', hp <= s.maxHp * 0.3);
      this.coins.textContent = fmt(run.coins);
      this.coal.textContent = String(coal);
      this.bombs.textContent = String(run.bombs);
      this.torchN.textContent = s.freeTorchEvery ? `${coal}+` : String(coal);
      this.bombN.textContent = String(run.bombs);
      this.scanN.textContent = String(run.scanners);
      this.scanBtn.classList.toggle('hidden', run.scanners <= 0);
      this.where.textContent = where;
      this.tools.textContent = tools;
      (this.ability.querySelector('.act-name') as HTMLElement).textContent = hero.ability.name;
    }
    const ready = Math.max(0, Math.min(1, f.abilityReady));
    this.abilityRing.style.background = ready >= 1 ? 'transparent' : `conic-gradient(rgba(0,0,0,0.65) ${(1 - ready) * 360}deg, transparent 0)`;
    this.ability.classList.toggle('ready', ready >= 1);
    // босс или мини-босс рядом
    const b = f.boss && !f.boss.dead ? f.boss : f.enemies.find((e) => e.mini && !e.sleep && !e.dead && Math.hypot(e.x - f.p.x, e.y - f.p.y) < 9);
    this.boss.classList.toggle('hidden', !b);
    if (b) {
      this.bossName.textContent = b.def.name + (b.enraged ? ' (ярость)' : '');
      this.bossFill.style.width = `${Math.max(0, (b.hp / b.max) * 100)}%`;
    }
    this.miniT -= dt;
    if (this.miniT <= 0) {
      this.miniT = 0.2;
      this.drawMini(f);
    }
    if (this.cardT > 0) {
      this.cardT -= dt;
      this.card.classList.toggle('hidden', this.cardT <= 0);
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      this.banner.classList.toggle('fade', this.bannerT < 0.8);
      if (this.bannerT <= 0) this.banner.classList.add('hidden');
    }
    if (run.tutorial && run.floor === 0) this.tutorial(f, dt);
  }

  private tutorial(f: Floor, dt: number): void {
    let step = Math.max(0, this.hintStep);
    this.hintT += dt;
    if (step === 0 && f.blocksBroken >= 4) step = 1;
    if (step === 1 && (f.kills >= 1 || this.hintT > 30)) step = 2;
    if (step === 2 && (f.torchesPlaced >= 1 || this.hintT > 50)) step = 3;
    if (step === 3 && this.hintT > 62) step = 4;
    if (step !== this.hintStep) {
      this.hintStep = step;
      this.hint.textContent = HINTS[step] ?? '';
      this.hint.classList.toggle('hidden', !HINTS[step]);
    }
  }

  private drawMini(f: Floor): void {
    const g = f.g, c = this.mctx;
    const w = g.w, rows = MINI_ROWS;
    const y0 = Math.max(0, Math.min(g.h - rows, Math.floor(f.p.y) - (rows >> 1)));
    if (this.mini.width !== w * MINI_PX) this.mini.width = w * MINI_PX;
    c.clearRect(0, 0, this.mini.width, this.mini.height);
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(0, 0, this.mini.width, this.mini.height);
    for (let y = y0; y < y0 + rows && y < g.h; y++) for (let x = 0; x < w; x++) {
      const i = g.i(x, y);
      if (!g.seen[i]) continue;
      const b = g.b[i];
      let col = '#2e2620';
      if (!BLOCKS[b].solid) col = g.dug[i] ? '#9a8a74' : '#6e5e4c';
      else if (b === B.ORE) col = oreById(g.ore[i]).color;
      else if (b === B.CHEST) col = '#ffd23f';
      else if (b === B.DOOR) col = '#ff5a3a';
      c.fillStyle = col;
      c.fillRect(x * MINI_PX, (y - y0) * MINI_PX, MINI_PX, MINI_PX);
    }
    for (const p of f.props) {
      if (!g.seen[g.i(p.x, p.y)] || p.y < y0 || p.y >= y0 + rows) continue;
      const col = { merchant: '#ffd23f', shrine: '#ff6b5b', anvil: '#c8d0d8', spring: '#6fc3ff', trial: '#ff9a3a' }[p.kind as string];
      if (!col) continue;
      c.fillStyle = col;
      c.fillRect(p.x * MINI_PX - 1, (p.y - y0) * MINI_PX - 1, 4, 4);
    }
    const ex = f.layout.exit;
    if (g.seen[g.i(ex.x, ex.y)] && ex.y >= y0 && ex.y < y0 + rows) {
      c.fillStyle = Math.floor(performance.now() / 300) % 2 ? '#7CFC00' : '#2a6a10';
      c.fillRect(ex.x * MINI_PX - 1, (ex.y - y0) * MINI_PX - 1, 4, 4);
    }
    c.fillStyle = '#ff5040';
    for (const e of f.enemies) {
      const cx = Math.floor(e.x), cy = Math.floor(e.y);
      if (!g.inside(cx, cy) || !f.vis[g.i(cx, cy)] || cy < y0 || cy >= y0 + rows) continue;
      c.fillRect(cx * MINI_PX, (cy - y0) * MINI_PX, MINI_PX, MINI_PX);
    }
    c.fillStyle = '#ffffff';
    c.fillRect(Math.floor(f.p.x) * MINI_PX - 1, (Math.floor(f.p.y) - y0) * MINI_PX - 1, 4, 4);
  }
}
