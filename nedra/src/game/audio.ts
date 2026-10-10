// Звук синтезируется WebAudio: никаких файлов, мгновенная загрузка.

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private music: { stop(): void } | null = null;
  private musicLayer = 0;
  sound = true;
  musicOn = true;
  private paused = false;

  /** Вызывать из обработчика жеста пользователя. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolume();
      if (this.musicLayer) this.playMusic(this.musicLayer);
    }
    if (this.ctx.state === 'suspended' && !this.paused) void this.ctx.resume();
  }

  /** Пауза платформы (реклама, вкладка, окно покупки): полная тишина. */
  setPaused(p: boolean): void {
    this.paused = p;
    if (!this.ctx) return;
    if (p) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  setSound(on: boolean): void {
    this.sound = on;
    this.applyVolume();
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (this.sfxGain) this.sfxGain.gain.value = this.sound ? 0.55 : 0;
    if (this.musicGain) this.musicGain.gain.value = this.musicOn ? 0.16 : 0;
  }

  private ok(): boolean {
    return !!this.ctx && this.sound && !this.paused && this.ctx.state === 'running';
  }

  private noiseHit(freq: number, dur: number, vol: number, type: BiquadFilterType = 'bandpass', q = 1.2, sweep = 0): void {
    if (!this.ok()) return;
    const c = this.ctx!, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.sfxGain!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'triangle', delay = 0, slide = 0): void {
    if (!this.ok()) return;
    const c = this.ctx!, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxGain!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  dig(hardness: number): void {
    this.noiseHit(260 + hardness * 420 + Math.random() * 80, 0.07 + Math.min(0.06, hardness * 0.02), 0.5, 'bandpass', 1.4);
  }

  ore(gem: boolean, combo = 0): void {
    const semis = Math.min(24, combo);
    const f = (gem ? 880 : 660) * 2 ** (semis / 12);
    this.tone(f, 0.18, 0.22, 'triangle');
    this.tone(f * 1.5, 0.14, 0.1, 'sine', 0.04);
    if (gem) this.tone(f * 2, 0.25, 0.08, 'sine', 0.08);
  }

  /** Кирка не берёт породу. */
  clang(): void {
    this.tone(1800, 0.09, 0.12, 'square', 0, 0.7);
    this.noiseHit(3200, 0.08, 0.25, 'bandpass', 4);
  }

  swing(): void {
    this.noiseHit(1800, 0.12, 0.22, 'bandpass', 0.9, 0.35);
  }

  squish(big = false): void {
    this.noiseHit(big ? 300 : 700, big ? 0.35 : 0.15, big ? 0.6 : 0.35, 'lowpass', 1, 0.4);
    this.tone(big ? 110 : 220, big ? 0.3 : 0.12, 0.18, 'sine', 0, 0.5);
  }

  zap(): void {
    this.tone(1400, 0.08, 0.08, 'sawtooth', 0, 0.3);
    this.noiseHit(5000, 0.06, 0.12, 'highpass', 0.7);
  }

  ability(): void {
    this.tone(330, 0.2, 0.16, 'square', 0, 2);
    this.tone(495, 0.2, 0.1, 'triangle', 0.05, 2);
  }

  torch(): void {
    this.noiseHit(2600, 0.25, 0.18, 'highpass', 0.6, 0.5);
    this.tone(440, 0.12, 0.06, 'sine', 0.05, 1.5);
  }

  rumble(): void {
    this.noiseHit(140, 0.9, 0.6, 'lowpass', 0.7);
    this.tone(48, 0.8, 0.3, 'sine', 0, 0.8);
  }

  roar(): void {
    this.tone(90, 0.7, 0.3, 'sawtooth', 0, 0.6);
    this.noiseHit(400, 0.6, 0.4, 'lowpass', 1.5, 0.5);
  }

  coin(): void {
    this.tone(990, 0.08, 0.15, 'square');
    this.tone(1320, 0.12, 0.12, 'square', 0.06);
  }

  thud(): void {
    this.noiseHit(180, 0.3, 0.7, 'lowpass', 0.8);
    this.tone(70, 0.25, 0.3, 'sine', 0, 0.6);
  }

  rattle(): void {
    for (let k = 0; k < 4; k++) setTimeout(() => this.noiseHit(900, 0.04, 0.18, 'bandpass', 3), k * 70);
  }

  hurt(): void {
    this.tone(320, 0.25, 0.25, 'square', 0, 0.4);
    this.noiseHit(500, 0.15, 0.3);
  }

  boom(): void {
    this.noiseHit(1400, 0.7, 0.9, 'lowpass', 0.7, 0.08);
    this.tone(60, 0.6, 0.5, 'sine', 0, 0.5);
  }

  splash(): void {
    this.noiseHit(1200, 0.25, 0.25, 'highpass', 0.8);
  }

  pickup(): void {
    [523, 659, 784].forEach((f, k) => this.tone(f, 0.12, 0.14, 'triangle', k * 0.05));
  }

  fanfare(): void {
    [523, 659, 784, 1047].forEach((f, k) => this.tone(f, 0.22, 0.16, 'triangle', k * 0.09));
  }

  fail(): void {
    [392, 330, 262].forEach((f, k) => this.tone(f, 0.3, 0.16, 'triangle', k * 0.15));
  }

  click(): void {
    this.tone(1200, 0.04, 0.08, 'square');
  }

  sizzle(): void {
    this.noiseHit(3000, 0.2, 0.08, 'highpass', 0.5);
  }

  /** Удар света: колокольчик с искрами. */
  holy(): void {
    this.tone(1320, 0.45, 0.09, 'sine');
    this.tone(1980, 0.35, 0.05, 'sine', 0.01);
    this.tone(2640, 0.25, 0.03, 'sine', 0.02);
    this.noiseHit(6000, 0.2, 0.06, 'highpass', 0.6);
  }

  /** Сбой реальности: рваные писки. */
  glitch(): void {
    for (let k = 0; k < 4; k++) this.tone(200 + Math.random() * 1800, 0.035, 0.07, 'square', k * 0.035);
    this.noiseHit(2400, 0.12, 0.12, 'bandpass', 8);
  }

  beam(): void {
    this.tone(220, 0.5, 0.06, 'sawtooth', 0, 3);
    this.noiseHit(900, 0.35, 0.08, 'bandpass', 2);
  }

  /** Смена фазы босса: удар и короткий хор. */
  phase(): void {
    this.boom();
    this.choir([220, 277, 330, 440], 1.6, 0.05, false);
  }

  /** Явление бога: гул, хор ангелов, у Истинного - крик и удар колокола. */
  godAppear(truth: boolean, dur = truth ? 6.5 : 3.8): void {
    if (!this.ok()) return;
    const c = this.ctx!, t = c.currentTime;
    // гул снизу
    for (const f of [55, 110]) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.5);
      o.connect(g).connect(this.sfxGain!);
      o.start(t);
      o.stop(t + dur + 1.6);
    }
    this.choir(truth ? [220, 277.2, 329.6, 440, 554.4, 659.3] : [220, 261.6, 329.6, 440], dur + 1.2, truth ? 0.09 : 0.07, truth);
    if (truth) {
      // крик: высокие голоса взмывают вверх
      for (let k = 0; k < 3; k++) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        const s0 = Math.min(1.5, dur * 0.3);
        o.frequency.setValueAtTime(700 + k * 140, t + s0);
        o.frequency.exponentialRampToValueAtTime(1600 + k * 300, t + dur);
        const f = c.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 2400;
        f.Q.value = 3;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t + s0);
        g.gain.exponentialRampToValueAtTime(0.06, t + dur - 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
        const lfo = c.createOscillator();
        lfo.frequency.value = 7 + k;
        const lg = c.createGain();
        lg.gain.value = 18;
        lfo.connect(lg).connect(o.frequency);
        o.connect(f).connect(g).connect(this.sfxGain!);
        o.start(t + s0);
        o.stop(t + dur + 0.7);
        lfo.start(t + s0);
        lfo.stop(t + dur + 0.7);
      }
    }
    // нарастающий шум и удар в момент явления
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(400, t);
    hp.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(truth ? 0.35 : 0.2, t + dur - 0.05);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
    src.connect(hp).connect(ng).connect(this.sfxGain!);
    src.start(t);
    src.stop(t + dur + 0.2);
    setTimeout(() => {
      this.boom();
      for (const [f, d] of [[440, 2.5], [1214, 1.8], [2376, 1.2]] as const) this.tone(f, d, 0.12, 'sine');
    }, dur * 1000);
  }

  /** Хор: на каждую ноту два расстроенных голоса через фильтры гласной «а» с вибрато. */
  private choir(notes: number[], dur: number, vol: number, swell: boolean): void {
    if (!this.ok()) return;
    const c = this.ctx!, t = c.currentTime;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + (swell ? dur * 0.5 : 0.25));
    out.gain.setValueAtTime(vol, t + dur - 0.6);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.8);
    out.connect(this.sfxGain!);
    const f1 = c.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 800;
    f1.Q.value = 2;
    const f2 = c.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 1150;
    f2.Q.value = 3;
    f1.connect(out);
    f2.connect(out);
    const vib = c.createOscillator();
    vib.frequency.value = 5.5;
    vib.start(t);
    vib.stop(t + dur + 1);
    for (const n of notes) for (const det of [-6, 7]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = n;
      o.detune.value = det;
      const vg = c.createGain();
      vg.gain.value = n * 0.004;
      vib.connect(vg).connect(o.frequency);
      const g = c.createGain();
      g.gain.value = 0.5 / notes.length;
      o.connect(g);
      g.connect(f1);
      g.connect(f2);
      o.start(t);
      o.stop(t + dur + 1);
    }
  }

  /** Тихий эмбиент пласта: пара расстроенных осцилляторов и медленный фильтр. */
  playMusic(layer: number): void {
    this.musicLayer = layer;
    if (!this.ctx || !this.musicGain) return;
    this.music?.stop();
    const c = this.ctx;
    const roots = [110, 98, 82.4, 87.3, 104, 92.5, 123, 73.4, 116.5, 65.4];
    const root = roots[(layer - 1) % roots.length];
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.connect(this.musicGain);
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    const oscs = [1, 1.5, 2.005, 3.01].map((m, k) => {
      const o = c.createOscillator();
      o.type = k % 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = root * m;
      const g = c.createGain();
      g.gain.value = [0.35, 0.18, 0.12, 0.05][k];
      o.connect(g).connect(filter);
      o.start();
      return o;
    });
    this.music = {
      stop: () => {
        for (const o of oscs) o.stop();
        lfo.stop();
        filter.disconnect();
      },
    };
  }

  stopMusic(): void {
    this.music?.stop();
    this.music = null;
    this.musicLayer = 0;
  }
}
