// Минимум из Node для тестов-симуляций (без @types/node).
declare const process: { env: Record<string, string | undefined> };
declare module 'node:fs' {
  export function appendFileSync(path: string, data: string): void;
  export function writeFileSync(path: string, data: string): void;
}
