import { DevPlatform } from './dev';
import type { Platform } from './types';
import { loadYandexSdk, YandexPlatform } from './yandex';

export type { Platform, Product } from './types';

export async function createPlatform(): Promise<Platform> {
  const forceDev = new URLSearchParams(location.search).get('platform') === 'dev';
  if (!import.meta.env.DEV && !forceDev && (await loadYandexSdk())) {
    try {
      const p = new YandexPlatform();
      await p.init();
      return p;
    } catch (e) {
      console.warn('Yandex SDK init failed, using dev platform', e);
    }
  }
  return new DevPlatform();
}
