export interface Product {
  id: string;
  title: string;
  price: string;
  icon?: string;
}

/** Всё, что зависит от площадки (Яндекс Игры, RuStore, локальная разработка). */
export interface Platform {
  readonly name: 'yandex' | 'dev';
  lang(): string;
  ready(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;
  interstitial(): Promise<boolean>;
  rewarded(): Promise<boolean>;
  catalog(): Promise<Product[]>;
  purchase(id: string): Promise<boolean>;
  owned(): Promise<string[]>;
  loadCloud(): Promise<unknown | null>;
  saveCloud(data: unknown): Promise<void>;
  flags(): Promise<Record<string, string>>;
  submitScore(board: string, score: number): Promise<void>;
  requestReview(): Promise<void>;
  serverTime(): number;
}
