// HUD яруса: энергия, сердца, монеты, комбо, расходники. Обновляется только при изменениях.
import type { RunState } from '../core/state';
import { consumableDef } from '../data/consumables';
import { layerDef } from '../data/layers';
import { NODE_INFO } from '../core/map';
import type { Game } from '../game/game';
import type { TierScene } from '../game/tier';
import { fmt, h, icon, ICONS } from './dom';

const CONS_ICON: Record<string, keyof typeof ICONS> = { dynamite: 'dynamite', ladder: 'ladder', stew: 'stew', scan: 'scan', bomb: 'bomb' };

const HINTS = [
  '',
  'Держи палец там, куда копать (или жми стрелки/WASD). Копай вниз!',
  'Блестящие камни - руда. Руда = монеты.',
  'Каждый блок стоит энергию: жёлтая полоска вверху. Кончится - эвакуация.',
  'Внизу ждёт лифт. Спускайся к нему!',
];

export class Hud {
  private energy: HTMLElement;
  private energyText: HTMLElement;
  private energyBar: HTMLElement;
  private hearts: HTMLElement;
  private coins: HTMLElement;
  private coinsText: HTMLElement;
  private where: HTMLElement;
  private combo: HTMLElement;
  private slots: HTMLElement;
  private banner: HTMLElement;
  private hint: HTMLElement;
  private sig = '';
  private slotSig = '';
  private hintStep = -1;
  private hintTimer = 0;

  constructor(private root: HTMLElement, private game: Game) {
    this.energyText = h('b');
    this.energy = h('i');
    this.energyBar = h('div', { class: 'bar' }, this.energy, h('span', null, icon('bolt'), this.energyText));
    this.hearts = h('div', { class: 'hearts' });
    this.coinsText = h('b', null, '0');
    this.coins = h('div', { class: 'chip coins' }, icon('coin'), this.coinsText);
    this.where = h('span');
    this.combo = h('span', { class: 'combo' });
    this.slots = h('div', { class: 'slots' });
    this.banner = h('div', { class: 'boss-banner hidden' });
    this.hint = h('div', { class: 'hint hidden' });
    const pause = h('button', { class: 'round-btn', 'aria-label': 'Пауза', onclick: () => game.pauseMenu() }, icon('pause'));
    root.append(
      h('div', { class: 'hud-top' }, this.energyBar, this.hearts, this.coins,
        h('div', { class: 'hud-sub' }, this.where, this.combo)),
      h('div', { class: 'hud-bottom' }, this.slots, pause),
      this.banner,
      this.hint,
    );
    this.hide();
  }

  show(): void {
    this.root.classList.remove('hidden');
    this.sig = '';
    this.slotSig = '';
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.banner.classList.add('hidden');
    this.hint.classList.add('hidden');
    this.hintStep = -1;
  }

  coinTarget(): { x: number; y: number } | null {
    const r = this.coins.getBoundingClientRect();
    const c = this.game.canvas.getBoundingClientRect();
    if (!r.width) return null;
    return { x: r.left - c.left + 14, y: r.top - c.top + r.height / 2 };
  }

  pulseCoins(): void {
    this.coins.classList.remove('pulse');
    void this.coins.offsetWidth;
    this.coins.classList.add('pulse');
    this.game.audio.coin();
  }

  bossBanner(name: string, desc: string): void {
    this.banner.replaceChildren(h('h3', null, `Разлом: ${name}`), h('p', null, desc), h('div', { class: 'count' }, '3'));
    this.banner.classList.remove('hidden');
  }

  update(tier: TierScene, run: RunState): void {
    const s = tier.stats;
    const maxE = s.maxEnergy;
    const e = Math.max(0, Math.round(run.energy));
    const comboTxt = tier.combo >= 2 ? `Комбо x${tier.comboMult().toFixed(1)}` : '';
    const node = NODE_INFO[tier.node].name;
    const where = `Пласт ${run.layer} · ${layerDef(run.layer).name} · ${node} · ${(run.startLayer - 1) * 300 + run.tiers * 100 + Math.max(0, Math.round(tier.p.py - 3)) * 3} м`;
    const sig = `${e}|${maxE}|${run.hearts}|${s.maxHearts}|${Math.floor(run.coins)}|${comboTxt}|${where}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.energy.style.width = `${Math.min(100, (e / maxE) * 100)}%`;
      this.energyText.textContent = `${e}/${maxE}`;
      this.energyBar.classList.toggle('low', e <= maxE * 0.2);
      this.hearts.replaceChildren(...Array.from({ length: s.maxHearts }, (_, k) => icon(k < run.hearts ? 'heart' : 'heartEmpty')));
      this.coinsText.textContent = fmt(run.coins);
      this.combo.textContent = comboTxt;
      this.where.textContent = where;
    }
    const slotSig = run.consumables.map((c) => `${c.id}:${c.n}`).join(',');
    if (slotSig !== this.slotSig) {
      this.slotSig = slotSig;
      this.slots.replaceChildren(...run.consumables.map((c, k) => h('button', {
        class: 'slot', title: consumableDef(c.id).desc, 'aria-label': consumableDef(c.id).name,
        onpointerdown: (ev: Event) => { ev.stopPropagation(); tier.useConsumable(c.id); },
      }, icon(CONS_ICON[c.id] ?? 'pick'), h('b', null, c.n), h('small', null, k + 1))));
    }
    const boss = tier.bossInfo;
    if (boss && boss.delay > 0) {
      const count = this.banner.querySelector('.count');
      if (count) count.textContent = String(Math.ceil(boss.delay));
    } else if (!this.banner.classList.contains('hidden')) {
      this.banner.classList.add('hidden');
    }
  }

  tutorial(tier: TierScene): void {
    const g = this.game;
    let step = g.tutorialStep;
    if (step === 1 && tier.digs >= 3) step = 2;
    if (step === 2 && tier.oreMined >= 1) { step = 3; this.hintTimer = 0; }
    if (step === 3) {
      this.hintTimer += 1 / 60;
      if (this.hintTimer > 6) step = 4;
    }
    g.tutorialStep = step;
    if (step !== this.hintStep) {
      this.hintStep = step;
      this.hint.textContent = HINTS[step] ?? '';
      this.hint.classList.toggle('hidden', !HINTS[step]);
    }
  }
}
