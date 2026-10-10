// Яндекс Игры: SDK грузится с /sdk.js (так требует площадка для игр, загруженных архивом).
import type { Platform, Product } from './types';

type Any = any;

declare global {
  interface Window {
    YaGames?: { init(opts?: object): Promise<Any> };
  }
}

export function loadYandexSdk(timeoutMs = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = '/sdk.js';
    s.async = true;
    const timer = setTimeout(() => resolve(false), timeoutMs);
    s.onload = () => {
      clearTimeout(timer);
      resolve(typeof window.YaGames?.init === 'function');
    };
    s.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    document.head.appendChild(s);
  });
}

export class YandexPlatform implements Platform {
  readonly name = 'yandex' as const;
  private ysdk: Any;
  private player: Any = null;
  private payments: Any = null;
  private pauseCbs: (() => void)[] = [];
  private resumeCbs: (() => void)[] = [];

  async init(): Promise<void> {
    this.ysdk = await window.YaGames!.init();
    this.ysdk.on?.('game_api_pause', () => this.pauseCbs.forEach((f) => f()));
    this.ysdk.on?.('game_api_resume', () => this.resumeCbs.forEach((f) => f()));
    try {
      this.player = await this.ysdk.getPlayer({ scopes: false });
    } catch {
      this.player = null;
    }
    try {
      this.payments = await this.ysdk.getPayments({ signed: false });
    } catch {
      this.payments = null;
    }
  }

  lang(): string {
    return this.ysdk?.environment?.i18n?.lang ?? 'ru';
  }

  ready(): void {
    this.ysdk?.features?.LoadingAPI?.ready?.();
  }

  gameplayStart(): void {
    this.ysdk?.features?.GameplayAPI?.start?.();
  }

  gameplayStop(): void {
    this.ysdk?.features?.GameplayAPI?.stop?.();
  }

  onPause(cb: () => void): void {
    this.pauseCbs.push(cb);
  }

  onResume(cb: () => void): void {
    this.resumeCbs.push(cb);
  }

  interstitial(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.ysdk.adv.showFullscreenAdv({
          callbacks: {
            onOpen: () => this.pauseCbs.forEach((f) => f()),
            onClose: (wasShown: boolean) => {
              this.resumeCbs.forEach((f) => f());
              resolve(!!wasShown);
            },
            onError: () => {
              this.resumeCbs.forEach((f) => f());
              resolve(false);
            },
            onOffline: () => resolve(false),
          },
        });
      } catch {
        resolve(false);
      }
    });
  }

  rewarded(): Promise<boolean> {
    return new Promise((resolve) => {
      let rewarded = false;
      try {
        this.ysdk.adv.showRewardedVideo({
          callbacks: {
            onOpen: () => this.pauseCbs.forEach((f) => f()),
            onRewarded: () => { rewarded = true; },
            onClose: () => {
              this.resumeCbs.forEach((f) => f());
              resolve(rewarded);
            },
            onError: () => {
              this.resumeCbs.forEach((f) => f());
              resolve(false);
            },
          },
        });
      } catch {
        resolve(false);
      }
    });
  }

  async catalog(): Promise<Product[]> {
    if (!this.payments) return [];
    try {
      const list: Any[] = await this.payments.getCatalog();
      return list.map((p) => ({
        id: p.id,
        title: p.title,
        price: String(p.priceValue ?? p.price?.value ?? p.price ?? ''),
        icon: typeof p.getPriceCurrencyImage === 'function' ? p.getPriceCurrencyImage('svg') : undefined,
      }));
    } catch {
      return [];
    }
  }

  async purchase(id: string): Promise<boolean> {
    if (!this.payments) return false;
    try {
      const p = await this.payments.purchase({ id });
      return !!p;
    } catch {
      return false;
    }
  }

  /** Все товары игры постоянные (не потребляются), поэтому просто читаем список. */
  async owned(): Promise<string[]> {
    if (!this.payments) return [];
    try {
      const list: Any[] = await this.payments.getPurchases();
      return list.map((p) => p.productID ?? p.product?.id).filter(Boolean);
    } catch {
      return [];
    }
  }

  async loadCloud(): Promise<unknown | null> {
    if (!this.player) return null;
    try {
      const d = await this.player.getData(['save']);
      return d?.save ?? null;
    } catch {
      return null;
    }
  }

  async saveCloud(data: unknown): Promise<void> {
    if (!this.player) return;
    try {
      await this.player.setData({ save: data }, false);
    } catch {
      /* сеть: локальная копия уже сохранена */
    }
  }

  async flags(): Promise<Record<string, string>> {
    try {
      return (await this.ysdk.getFlags({ defaultFlags: {} })) ?? {};
    } catch {
      return {};
    }
  }

  async submitScore(board: string, score: number): Promise<void> {
    try {
      const ok = await this.ysdk.isAvailableMethod?.('leaderboards.setScore');
      if (ok) await this.ysdk.leaderboards.setScore(board, Math.floor(score));
    } catch {
      /* лидерборд не настроен или игрок не авторизован */
    }
  }

  async requestReview(): Promise<void> {
    try {
      const r = await this.ysdk.feedback.canReview();
      if (r?.value) await this.ysdk.feedback.requestReview();
    } catch {
      /* не поддерживается */
    }
  }

  serverTime(): number {
    try {
      return this.ysdk.serverTime?.() ?? Date.now();
    } catch {
      return Date.now();
    }
  }
}
