// Контроллер игры: сохранения, площадка, реклама, переходы между посёлком, станцией и ярусом.
import { AD_COOLDOWN, NEWBIE_GIFT } from '../config';
import { advance, finishRun, makeStation, newRun, onBossBeaten, type RunOutcome } from '../core/run';
import { Rng } from '../core/rng';
import { loadLocal, normalize, pickNewest, saveLocal, type SaveData } from '../core/save';
import { newMeta, type Heir, type MetaState, type RunState } from '../core/state';
import { computeStats } from '../core/stats';
import type { NodeType } from '../core/gen';
import { layerDef, LAYERS } from '../data/layers';
import { createPlatform, type Platform, type Product } from '../platform';
import { Audio } from './audio';
import { Input } from './input';
import { buildAtlas, buildGnome, HELMETS, type Atlas, type GnomeSprites } from './textures';
import { TierScene } from './tier';
import { Hud } from '../ui/hud';
import * as screens from '../ui/screens';

export type Mode = 'boot' | 'base' | 'station' | 'tier' | 'results';

export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly screen: HTMLElement;
  readonly toasts: HTMLElement;
  readonly audio = new Audio();
  readonly input = new Input();
  hud!: Hud;
  platform!: Platform;
  meta: MetaState = newMeta();
  run: RunState | null = null;
  private runSnapshot: RunState | null = null;   // забег на последней станции: его сохраняем, пока идёт ярус
  mode: Mode = 'boot';
  tier: TierScene | null = null;
  outcome: RunOutcome | null = null;
  outcomeDoubled = false;
  products: Product[] = [];
  private atlases = new Map<number, Atlas>();
  gnome!: GnomeSprites;
  private lastAd = 0;
  private adCooldown = AD_COOLDOWN;
  private hidden = false;
  private adPaused = false;
  modalOpen = false;
  private last = 0;
  private acc = 0;
  private time = 0;
  private saveTimer = 0;
  private cloudAt = 0;
  private rngCounter = 1;
  tutorialStep = 0;

  constructor(root: HTMLElement) {
    this.canvas = root.querySelector('#game') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.screen = root.querySelector('#screen') as HTMLElement;
    this.toasts = root.querySelector('#toasts') as HTMLElement;
    this.hud = new Hud(root.querySelector('#hud') as HTMLElement, this);
  }

  async start(): Promise<void> {
    this.platform = await createPlatform();
    this.platform.onPause(() => this.setAdPaused(true));
    this.platform.onResume(() => this.setAdPaused(false));
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      this.applyPause();
      if (document.hidden) this.saveNow(true);
    });
    const local = loadLocal();
    const cloud = normalize(await this.platform.loadCloud());
    const save = pickNewest(local, cloud);
    if (save) {
      this.meta = save.meta;
      this.run = save.run;
    }
    const flags = await this.platform.flags();
    const cd = Number(flags.ad_cooldown);
    if (Number.isFinite(cd) && cd >= 0) this.adCooldown = cd;
    await this.applyOwned();
    this.platform.catalog().then((p) => { this.products = p; });
    this.audio.setSound(this.meta.settings.sound);
    this.audio.setMusic(this.meta.settings.music);
    this.input.attach(this.canvas);
    this.input.onFirstGesture = () => this.audio.unlock();
    window.addEventListener('pointerdown', () => this.audio.unlock(), { capture: true });
    this.buildGnome();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    document.getElementById('loading')?.remove();
    this.platform.ready();
    if (this.run?.station) this.toStation();
    else if (!this.meta.tutorialDone) this.startTutorial();
    else this.toBase();
    requestAnimationFrame((t) => this.frame(t));
  }

  buildGnome(): void {
    const helmet = this.meta.purchases.starter ? HELMETS.veteran.color : HELMETS.basic.color;
    this.gnome = buildGnome(helmet, '#f4f1ea');
  }

  atlas(layer: number): Atlas {
    let a = this.atlases.get(layer);
    if (!a) {
      a = buildAtlas(layerDef(layer).pal, layer);
      this.atlases.set(layer, a);
    }
    return a;
  }

  rng(): Rng {
    this.rngCounter++;
    return new Rng(((this.run?.seed ?? 1) ^ Math.imul(this.rngCounter, 2654435761)) >>> 0);
  }

  // ---------------- паузы площадки ----------------

  private setAdPaused(p: boolean): void {
    this.adPaused = p;
    this.applyPause();
  }

  applyPause(): void {
    const sys = this.hidden || this.adPaused;
    this.audio.setPaused(sys);
    if (this.tier) this.tier.paused = sys || this.modalOpen;
    if (sys) this.input.reset();
  }

  // ---------------- реклама ----------------

  /** Полноэкранная реклама в логической паузе: не чаще кулдауна и не до первого подъёма с добычей. */
  async interstitial(): Promise<void> {
    if (this.meta.purchases.noAds || !this.meta.firstCashOut) return;
    const now = Date.now();
    if (now - this.lastAd < this.adCooldown * 1000) return;
    this.lastAd = now;
    await this.platform.interstitial();
  }

  async rewarded(): Promise<boolean> {
    const ok = await this.platform.rewarded();
    if (!ok) this.toast('Реклама не досмотрена или недоступна', 'bad');
    return ok;
  }

  // ---------------- покупки ----------------

  async applyOwned(): Promise<void> {
    const owned = await this.platform.owned();
    const p = this.meta.purchases;
    if (owned.includes('no_ads')) p.noAds = true;
    if (owned.includes('golden_smelter')) p.goldenSmelter = true;
    if (owned.includes('starter_pack') && !p.starter) {
      p.starter = true;
      this.meta.ingots += 300;
    }
  }

  async buy(id: string): Promise<void> {
    const ok = await this.platform.purchase(id);
    if (!ok) {
      this.toast('Покупка не завершена', 'bad');
      return;
    }
    await this.applyOwned();
    this.buildGnome();
    this.toast('Спасибо за поддержку!', 'good');
    this.saveNow(true);
  }

  // ---------------- сохранение ----------------

  save(): void {
    this.saveTimer = 0.5;
  }

  saveNow(cloud = false): void {
    const run = this.run?.station ? this.run : this.run ? this.runSnapshot : null;
    const data: SaveData = { v: 1, ts: Date.now(), meta: this.meta, run };
    saveLocal(data);
    const now = Date.now();
    if (cloud || now - this.cloudAt > 5000) {
      this.cloudAt = now;
      void this.platform.saveCloud(JSON.parse(JSON.stringify(data)));
    }
  }

  // ---------------- переходы ----------------

  private clearScreen(): void {
    this.screen.replaceChildren();
    this.modalOpen = false;
  }

  toBase(): void {
    this.mode = 'base';
    this.tier = null;
    this.hud.hide();
    this.audio.stopMusic();
    this.clearScreen();
    screens.renderBase(this);
    if (this.meta.tutorialDone && !this.meta.giftClaimed) {
      this.meta.giftClaimed = true;
      this.meta.ingots += NEWBIE_GIFT;
      this.save();
      screens.showInfo(this, 'Подарок старейшины', `Старейшина клана гордится тобой и дарит ${NEWBIE_GIFT} слитков. Улучши Кузницу или Столовую и спускайся снова!`,
        () => screens.renderBase(this));
    }
  }

  private startTutorial(): void {
    const heir: Heir = { name: 'Кузьма', female: false, profession: 'miner', trait: null };
    this.run = newRun(this.meta, heir, 1, (Date.now() & 0x7fffffff) || 1);
    this.tutorialStep = 1;
    const node = this.run.station!.next[0];
    advance(this.run, node, this.rng());
    this.enterTier(node);
  }

  beginRun(heir: Heir, startLayer: number): void {
    this.run = newRun(this.meta, heir, startLayer, (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    this.save();
    this.toStation();
  }

  toStation(): void {
    if (this.run?.station) this.runSnapshot = JSON.parse(JSON.stringify(this.run)) as RunState;
    this.mode = 'station';
    this.tier = null;
    this.hud.hide();
    this.clearScreen();
    screens.renderStation(this);
  }

  async chooseNode(node: NodeType): Promise<void> {
    const run = this.run;
    if (!run?.station) return;
    this.audio.click();
    await this.interstitial();
    advance(run, node, this.rng());
    this.enterTier(node);
  }

  enterTier(node: NodeType): void {
    const run = this.run!;
    this.clearScreen();
    this.mode = 'tier';
    const seed = (run.seed + run.tiers * 7919 + run.layer * 104729) >>> 0;
    this.tier = new TierScene({
      meta: this.meta,
      run,
      audio: this.audio,
      atlas: this.atlas(run.layer),
      gnome: this.gnome,
      coinTarget: () => this.hud.coinTarget(),
      complete: (s) => this.onTierComplete(s.node),
      fail: (r) => this.onTierFail(r),
      toast: (t, k) => this.toast(t, k),
      pulseCoins: () => this.hud.pulseCoins(),
    }, node, seed);
    this.canvas.style.filter = this.tier.stats.grayscale ? 'grayscale(1) contrast(1.1)' : '';
    this.hud.show();
    this.input.reset();
    this.platform.gameplayStart();
    this.audio.playMusic(run.layer);
    if (node === 'boss') this.hud.bossBanner(layerDef(run.layer).boss.name, layerDef(run.layer).boss.desc);
  }

  private onTierComplete(node: NodeType): void {
    const run = this.run!;
    this.platform.gameplayStop();
    run.tiers += 1;
    const notes: string[] = [];
    if (node === 'boss') notes.push(...onBossBeaten(this.meta, run));
    run.station = makeStation(this.meta, run, node, this.rng());
    this.canvas.style.filter = '';
    this.saveNow();
    if (this.tutorialStep) this.tutorialStep = 0;
    this.toStation();
    for (const n of notes) this.toast(n, 'good');
    if (node === 'boss' && this.meta.bosses.length === 1 && run.layer === 1) void this.platform.requestReview();
  }

  private onTierFail(reason: 'energy' | 'hearts'): void {
    if (!this.tier || this.modalOpen) return;
    this.platform.gameplayStop();
    this.audio.fail();
    screens.showEvac(this, reason);
  }

  async revive(): Promise<void> {
    const run = this.run, tier = this.tier;
    if (!run || !tier || run.revived) return;
    const ok = await this.rewarded();
    if (!ok) return;
    run.revived = true;
    const s = computeStats(this.meta, run);
    run.energy = Math.max(run.energy, 0) + Math.round(s.maxEnergy * 0.5);
    run.hearts = Math.max(run.hearts, 0) + 1;
    this.closeModal();
    tier.revive();
    this.toast('Второе дыхание!', 'good');
  }

  endRun(reason: 'cashout' | 'evac'): void {
    const run = this.run;
    if (!run) return;
    this.platform.gameplayStop();
    this.outcome = finishRun(this.meta, run, reason);
    this.outcomeDoubled = false;
    void this.platform.submitScore('depth', this.meta.stats.bestDepth);
    this.run = null;
    this.runSnapshot = null;
    this.tier = null;
    this.canvas.style.filter = '';
    this.saveNow(true);
    this.mode = 'results';
    this.hud.hide();
    this.audio.stopMusic();
    this.clearScreen();
    if (reason === 'cashout') this.audio.fanfare();
    screens.renderResults(this);
  }

  async doubleOutcome(): Promise<void> {
    if (!this.outcome || this.outcomeDoubled) return;
    if (!(await this.rewarded())) return;
    this.outcomeDoubled = true;
    this.meta.ingots += this.outcome.ingots;
    this.saveNow(true);
    this.audio.coin();
    screens.renderResults(this);
  }

  async leaveResults(): Promise<void> {
    await this.interstitial();
    this.outcome = null;
    this.toBase();
  }

  openModal(el: HTMLElement): void {
    if (this.mode === 'tier' && !this.modalOpen) this.platform.gameplayStop();
    this.modalOpen = true;
    this.screen.append(el);
    this.applyPause();
  }

  closeModal(): void {
    this.screen.querySelectorAll('.modal-bg').forEach((m) => m.remove());
    if (this.mode === 'tier' && this.modalOpen && this.tier && !this.tier.done) this.platform.gameplayStart();
    this.modalOpen = false;
    this.applyPause();
  }

  pauseMenu(): void {
    if (this.mode !== 'tier' || this.modalOpen) return;
    screens.showPause(this);
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.toasts.append(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    setTimeout(() => el.remove(), 2500);
  }

  setSetting(key: 'sound' | 'music', on: boolean): void {
    this.meta.settings[key] = on;
    if (key === 'sound') this.audio.setSound(on);
    else this.audio.setMusic(on);
    this.save();
  }

  // ---------------- цикл ----------------

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private frame(t: number): void {
    requestAnimationFrame((n) => this.frame(n));
    const dt = Math.min(0.1, this.last ? (t - this.last) / 1000 : 0);
    this.last = t;
    this.time += dt;
    if (this.canvas.width !== Math.round(this.canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2.5))) this.resize();
    if (this.saveTimer > 0) {
      this.saveTimer -= dt;
      if (this.saveTimer <= 0) this.saveNow();
    }
    const W = this.canvas.width, H = this.canvas.height;
    if (this.mode === 'tier' && this.tier) {
      if (this.input.actions.includes('pause')) {
        this.input.actions = this.input.actions.filter((a) => a !== 'pause');
        this.pauseMenu();
      }
      const tier = this.tier;
      this.acc += dt;
      const step = 1 / 60;
      while (this.acc >= step && this.tier === tier) {
        tier.update(step, this.input);
        this.acc -= step;
      }
      if (this.tier !== tier || !this.run) return;
      tier.render(this.ctx, W, H, this.canvas.clientWidth);
      this.hud.update(tier, this.run);
      if (this.tutorialStep) this.hud.tutorial(tier);
    } else {
      this.acc = 0;
      this.renderBackdrop(W, H);
    }
  }

  /** Фон меню: разрез шахты с медленной пылью. */
  private renderBackdrop(W: number, H: number): void {
    const ctx = this.ctx;
    const layer = LAYERS[Math.max(0, Math.min(LAYERS.length - 1, (this.run?.layer ?? 1) - 1))];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a1d14');
    g.addColorStop(1, layer.pal.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const s = Math.max(4, Math.round(Math.min(W, H) / 60));
    for (let k = 0; k < 40; k++) {
      const x = ((k * 97.3 + this.time * 6 * (1 + (k % 3))) % (W + 40)) - 20;
      const y = (k * 151.7 + Math.sin(this.time * 0.3 + k) * 20) % H;
      ctx.fillStyle = `rgba(255,220,170,${0.05 + (k % 5) * 0.02})`;
      ctx.fillRect(Math.round(x), Math.round(y), s, s);
    }
  }
}
