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

  ore(combo: number, gem: boolean): void {
    const semis = Math.min(24, combo);
    const f = (gem ? 880 : 660) * 2 ** (semis / 12);
    this.tone(f, 0.18, 0.22, 'triangle');
    this.tone(f * 1.5, 0.14, 0.1, 'sine', 0.04);
    if (gem) this.tone(f * 2, 0.25, 0.08, 'sine', 0.08);
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
