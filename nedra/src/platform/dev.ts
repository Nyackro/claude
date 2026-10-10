// Заглушка для локальной разработки и сборок вне Яндекса: реклама и покупки имитируются.
import type { Platform, Product } from './types';

function overlay(text: string, ms: number, button?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'dev-ad';
    el.innerHTML = `<div class="dev-ad-box"><b>${text}</b><small>тестовый режим, не Яндекс</small></div>`;
    document.body.appendChild(el);
    const done = (ok: boolean) => {
      el.remove();
      resolve(ok);
    };
    if (button) {
      const ok = document.createElement('button');
      ok.textContent = button;
      ok.className = 'btn';
      ok.onclick = () => done(true);
      const cancel = document.createElement('button');
      cancel.textContent = 'Отмена';
      cancel.className = 'btn ghost';
      cancel.onclick = () => done(false);
      el.firstElementChild!.append(ok, cancel);
    } else {
      setTimeout(() => done(true), ms);
    }
  });
}

export class DevPlatform implements Platform {
  readonly name = 'dev' as const;
  private pauseCbs: (() => void)[] = [];
  private resumeCbs: (() => void)[] = [];
  private bought = new Set<string>(JSON.parse(localStorage.getItem('nedra_dev_purchases') ?? '[]') as string[]);
  private fast = new URLSearchParams(location.search).has('fastads');

  lang(): string {
    return 'ru';
  }
  ready(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  onPause(cb: () => void): void {
    this.pauseCbs.push(cb);
  }
  onResume(cb: () => void): void {
    this.resumeCbs.push(cb);
  }

  private async ad(text: string): Promise<boolean> {
    this.pauseCbs.forEach((f) => f());
    const ok = await overlay(text, this.fast ? 50 : 900);
    this.resumeCbs.forEach((f) => f());
    return ok;
  }

  interstitial(): Promise<boolean> {
    return this.ad('Полноэкранная реклама');
  }

  rewarded(): Promise<boolean> {
    return this.ad('Реклама за награду');
  }

  async catalog(): Promise<Product[]> {
    return [];
  }

  async purchase(id: string): Promise<boolean> {
    const ok = this.fast ? true : await overlay(`Покупка: ${id}`, 0, 'Купить');
    if (ok) {
      this.bought.add(id);
      localStorage.setItem('nedra_dev_purchases', JSON.stringify([...this.bought]));
    }
    return ok;
  }

  async owned(): Promise<string[]> {
    return [...this.bought];
  }

  async loadCloud(): Promise<unknown | null> {
    return null;
  }
  async saveCloud(): Promise<void> {}
  async flags(): Promise<Record<string, string>> {
    return {};
  }
  async submitScore(): Promise<void> {}
  async requestReview(): Promise<void> {}
  serverTime(): number {
    return Date.now();
  }
}
