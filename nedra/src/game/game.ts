// Контроллер игры: сохранения, площадка, реклама, переходы между посёлком, привалом и этажом.
import { AD_COOLDOWN, NEWBIE_GIFT } from '../config';
import { advance, captiveHere, completeFloor, finishRun, floorSeed, newRun, rescueNpc, type RunOutcome } from '../core/run';
import { Rng } from '../core/rng';
import { loadLocal, normalize, pickNewest, saveLocal, type SaveData } from '../core/save';
import { newMeta, type MetaState, type RunState } from '../core/state';
import { computeStats } from '../core/stats';
import type { HeroDef } from '../data/heroes';
import { createPlatform, type Platform, type Product } from '../platform';
import { Audio } from './audio';
import { Floor, type FloorEnv, type PropState } from './floor';
import { Input } from './input';
import { Renderer } from './render';
import { buildAtlas, heroSprites, ROCK_STYLE, T, type Atlas, type HeroSprites } from './textures';
import { Hud } from '../ui/hud';
import * as screens from '../ui/screens';

export type Mode = 'boot' | 'base' | 'station' | 'floor' | 'results';

const STEP = 1 / 60;

export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly screen: HTMLElement;
  readonly toasts: HTMLElement;
  readonly audio = new Audio();
  readonly input = new Input();
  hud!: Hud;
  platform!: Platform;
  atlas!: Atlas;
  renderer!: Renderer;
  meta: MetaState = newMeta();
  run: RunState | null = null;
  private runSnapshot: RunState | null = null;   // забег на входе в этаж: его сохраняем, пока идёт этаж
  mode: Mode = 'boot';
  floor: Floor | null = null;
  outcome: RunOutcome | null = null;
  outcomeDoubled = false;
  products: Product[] = [];
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
  private dying = false;

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
    this.atlas = buildAtlas();
    this.renderer = new Renderer(this.ctx, this.atlas);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    document.getElementById('loading')?.remove();
    this.platform.ready();
    if (this.run?.station) this.toStation();
    else if (this.run) this.enterFloor();
    else if (!this.meta.tutorialDone) this.startTutorial();
    else this.toBase();
    requestAnimationFrame((t) => this.frame(t));
  }

  heroSprite(hero: HeroDef): HeroSprites {
    return heroSprites(this.atlas, hero);
  }

  npcSprite(id: string): HTMLCanvasElement | null {
    return this.atlas.npcs.get(id)?.portrait ?? null;
  }

  rng(): Rng {
    this.rngCounter++;
    return new Rng(((this.run?.seed ?? 1) ^ Math.imul(this.rngCounter, 2654435761) ^ Date.now()) >>> 0);
  }

  // ---------------- паузы площадки ----------------

  private setAdPaused(p: boolean): void {
    this.adPaused = p;
    this.applyPause();
  }

  applyPause(): void {
    const sys = this.hidden || this.adPaused;
    this.audio.setPaused(sys);
    if (this.floor) this.floor.paused = sys || this.modalOpen;
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
    this.toast('Спасибо за поддержку!', 'good');
    this.saveNow(true);
  }

  // ---------------- сохранение ----------------

  save(): void {
    this.saveTimer = 0.5;
  }

  saveNow(cloud = false): void {
    const run = this.run?.station ? this.run : this.run ? this.runSnapshot : null;
    const data: SaveData = { v: 2, ts: Date.now(), meta: this.meta, run };
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
    this.floor = null;
    this.hud.hide();
    this.audio.stopMusic();
    this.clearScreen();
    screens.renderBase(this);
    if (this.meta.tutorialDone && !this.meta.giftClaimed) {
      this.meta.giftClaimed = true;
      this.meta.ingots += NEWBIE_GIFT;
      this.save();
      screens.showInfo(this, 'Подарок старейшины', `Старейшина клана гордится тобой и дарит ${NEWBIE_GIFT} слитков. Отстрой Кузницу или Лазарет и спускайся снова!`,
        () => screens.renderBase(this));
    }
  }

  private startTutorial(): void {
    this.run = newRun(this.meta, 'miner', 1, (Date.now() & 0x7fffffff) || 1);
    advance(this.run);
    this.enterFloor();
  }

  beginRun(hero: string, startLayer: number): void {
    this.meta.hero = hero;
    this.run = newRun(this.meta, hero, startLayer, (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    this.save();
    this.toStation();
  }

  toStation(): void {
    this.mode = 'station';
    this.floor = null;
    this.hud.hide();
    this.clearScreen();
    screens.renderStation(this);
    this.saveNow();
  }

  async descend(): Promise<void> {
    const run = this.run;
    if (!run?.station) return;
    this.audio.click();
    await this.interstitial();
    advance(run);
    this.enterFloor();
  }

  enterFloor(): void {
    const run = this.run!;
    this.clearScreen();
    this.mode = 'floor';
    this.dying = false;
    this.runSnapshot = JSON.parse(JSON.stringify(run)) as RunState;
    const env: FloorEnv = {
      meta: this.meta,
      run,
      audio: this.audio,
      toast: (t, k) => this.toast(t, k),
      complete: () => this.onFloorComplete(),
      died: () => this.onDeath(),
      openProp: (kind, prop) => this.openProp(kind, prop),
      itemFound: (id) => this.hud.itemCard(id),
      captive: captiveHere(this.meta, run)?.id ?? null,
      rescue: (id) => this.onRescue(id),
    };
    this.floor = new Floor(env, floorSeed(run));
    this.renderer.resetCamera();
    this.hud.show();
    this.hud.intro(this.floor, run);
    this.input.reset();
    this.platform.gameplayStart();
    this.audio.playMusic(run.layer);
    this.saveNow();
  }

  private onRescue(id: string): void {
    const npc = rescueNpc(this.meta, this.run!, id);
    this.saveNow(true);
    this.hud.rescued(npc);
  }

  private openProp(kind: 'merchant' | 'shrine' | 'anvil', prop: PropState): void {
    if (this.modalOpen) return;
    screens.showProp(this, kind, prop);
  }

  private onFloorComplete(): void {
    const run = this.run!;
    this.platform.gameplayStop();
    const news = completeFloor(this.meta, run, this.rng());
    this.audio.fanfare();
    this.saveNow(true);
    this.toStation();
    for (const n of news) this.toast(n, 'good');
    if (run.station?.kind === 'boss' && this.meta.bosses.length === 1 && run.layer === 1) void this.platform.requestReview();
  }

  private onDeath(): void {
    if (!this.floor || this.dying) return;
    this.dying = true;
    this.platform.gameplayStop();
    this.audio.fail();
    screens.showDeath(this);
  }

  async revive(): Promise<void> {
    const run = this.run, floor = this.floor;
    if (!run || !floor || run.revived) return;
    const ok = await this.rewarded();
    if (!ok) return;
    run.revived = true;
    run.hp = Math.ceil(computeStats(this.meta, run).maxHp * 0.5);
    floor.p.inv = 2.5;
    this.dying = false;
    this.closeModal();
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
    this.floor = null;
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
    if (this.mode === 'floor' && !this.modalOpen) this.platform.gameplayStop();
    this.modalOpen = true;
    this.input.reset();
    this.screen.append(el);
    this.applyPause();
  }

  closeModal(): void {
    this.screen.querySelectorAll('.modal-bg').forEach((m) => m.remove());
    if (this.mode === 'floor' && this.modalOpen && this.floor && !this.floor.done) this.platform.gameplayStart();
    this.modalOpen = false;
    this.applyPause();
  }

  pauseMenu(): void {
    if (this.mode !== 'floor' || this.modalOpen) return;
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

  private dpr(): number {
    return Math.min(window.devicePixelRatio || 1, 2.5);
  }

  private resize(): void {
    const dpr = this.dpr();
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.renderer?.resize(w, h);
  }

  private frame(t: number): void {
    requestAnimationFrame((n) => this.frame(n));
    const dt = Math.min(0.1, this.last ? (t - this.last) / 1000 : 0);
    this.last = t;
    this.time += dt;
    if (this.canvas.width !== Math.round(this.canvas.clientWidth * this.dpr())) this.resize();
    if (this.saveTimer > 0) {
      this.saveTimer -= dt;
      if (this.saveTimer <= 0) this.saveNow();
    }
    const W = this.canvas.width, H = this.canvas.height;
    const floor = this.floor;
    if (this.mode === 'floor' && floor && this.run) {
      const actions = this.input.take();
      if (actions.includes('pause')) this.pauseMenu();
      const acts = actions.filter((a) => a !== 'pause');
      this.acc += dt;
      let first = true;
      while (this.acc >= STEP && this.floor === floor) {
        floor.update(STEP, this.modalOpen ? { mx: 0, my: 0 } : this.input.move(), first && !this.modalOpen ? acts : []);
        first = false;
        this.acc -= STEP;
      }
      if (this.floor !== floor || !this.run) return;
      this.renderer.render(floor, dt, this.modalOpen ? null : this.input.joy);
      this.hud.update(floor, this.run, dt);
    } else {
      this.acc = 0;
      this.renderBackdrop(W, H);
    }
  }

  /** Фон меню: стена из пород пласта и медленная пыль. */
  private renderBackdrop(W: number, H: number): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const z = Math.max(2, Math.round(Math.min(W, H) / 140));
    const size = T * z;
    const rocks = Object.keys(ROCK_STYLE).map(Number);
    const layer = this.run?.layer ?? 1;
    for (let y = 0; y * size < H; y++) for (let x = 0; x * size < W; x++) {
      const k = Math.abs((x * 7 + y * 13 + layer * 3) % 5) + Math.floor(y / 6);
      const tops = this.atlas.rockTop.get(rocks[Math.min(rocks.length - 2, k % 6)])!;
      ctx.drawImage(tops[(x + y) % tops.length], x * size, y * size, size, size);
    }
    ctx.fillStyle = 'rgba(8,5,3,0.72)';
    ctx.fillRect(0, 0, W, H);
    const s = Math.max(3, Math.round(z * 1.5));
    for (let k = 0; k < 40; k++) {
      const x = ((k * 97.3 + this.time * 6 * (1 + (k % 3))) % (W + 40)) - 20;
      const y = (k * 151.7 + Math.sin(this.time * 0.3 + k) * 20) % H;
      ctx.fillStyle = `rgba(255,220,170,${0.05 + (k % 5) * 0.02})`;
      ctx.fillRect(Math.round(x), Math.round(y), s, s);
    }
  }
}
