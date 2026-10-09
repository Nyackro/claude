// Минимальный помощник для DOM-интерфейса: меню рисуются HTML, шахта - на canvas.

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

export function h(tag: string, attrs: Attrs | null = null, ...children: (Child | Child[])[]): HTMLElement {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'html') el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function icon(name: keyof typeof ICONS, cls = ''): HTMLElement {
  return h('span', { class: `ico ${cls}`, html: ICONS[name] });
}

const svg = (body: string, vb = '0 0 16 16') =>
  `<svg viewBox="${vb}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  bolt: svg('<path fill="#ffd34d" d="M9 0h3L8 7h4l-7 9 2-7H3z"/>'),
  heart: svg('<path fill="#ff5a4e" d="M2 2h4v1h1v1h2V3h1V2h4v1h1v5h-1v1h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4V9H3V8H2V7H1V3h1z"/><path fill="#ffb0a8" d="M3 3h2v2H3z"/>'),
  heartEmpty: svg('<path fill="#4a3a36" d="M2 2h4v1h1v1h2V3h1V2h4v1h1v5h-1v1h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4V9H3V8H2V7H1V3h1z"/>'),
  coin: svg('<path fill="#f2b632" d="M5 1h6v1h2v2h1v8h-1v2h-2v1H5v-1H3v-2H2V4h1V2h2z"/><path fill="#ffe08a" d="M5 3h4v1H5zM4 4h1v5H4z"/><path fill="#b87a12" d="M7 5h2v6H7z"/>'),
  ingot: svg('<path fill="#e8b640" d="M3 5h10l2 6H1z"/><path fill="#fff0a8" d="M4 6h6v1H4z"/><path fill="#a3741a" d="M1 11h14v1H1z"/>'),
  pick: svg('<path fill="#8a5a30" d="M7 6h2v9H7z"/><path fill="#b8c0c6" d="M2 3h12v2h-2v1H4V5H2z"/><path fill="#e8eef2" d="M3 3h5v1H3z"/>'),
  depth: svg('<path fill="#9fb3c8" d="M7 1h2v10h3l-4 4-4-4h3z"/>'),
  dynamite: svg('<path fill="#d93a2e" d="M3 6h10v7H3z"/><path fill="#ff7a6b" d="M3 6h10v1H3z"/><path fill="#f2e6c8" d="M7 3h1v3H7z"/><path fill="#ffd34d" d="M8 1h2v2H8z"/>'),
  ladder: svg('<path fill="#b07a40" d="M3 0h2v16H3zM11 0h2v16h-2zM5 3h6v1H5zM5 8h6v1H5zM5 13h6v1H5z"/>'),
  stew: svg('<path fill="#9aa6ad" d="M3 5h10v9H3z"/><path fill="#d1d9de" d="M3 5h10v1H3z"/><path fill="#d94a3a" d="M3 8h10v3H3z"/>'),
  scan: svg('<path fill="#5fd0ff" d="M6 1h4v1h2v1h1v2h1v4h-1v2h-1v1h-2v1H6v-1H4v-1H3V9H2V5h1V3h1V2h2z"/><path fill="#103040" d="M6 4h4v6H6z"/><path fill="#9ff0ff" d="M7 5h1v1H7z"/>'),
  bomb: svg('<path fill="#4a4f55" d="M5 4h6v10H5z"/><path fill="#8a9097" d="M5 4h1v10H5z"/><path fill="#d0d6db" d="M6 14h4v2H6z"/><path fill="#ffd34d" d="M7 1h2v3H7z"/>'),
  ad: svg('<path fill="#fff" d="M4 2h2v1h2v1h2v1h2v2h1v2h-1v2h-2v1H8v1H6v1H4z"/>'),
  lock: svg('<path fill="#b8a894" d="M4 7h8v8H4z"/><path fill="#b8a894" d="M5 3h1v4H5zM10 3h1v4h-1zM6 2h4v1H6z"/><path fill="#3a2a1f" d="M7 9h2v3H7z"/>'),
  sound: svg('<path fill="#f3e9dc" d="M2 6h3l4-4v12l-4-4H2z"/><path fill="#f3e9dc" d="M11 5h1v6h-1zM13 3h1v10h-1z"/>'),
  pause: svg('<path fill="#f3e9dc" d="M4 3h3v10H4zM9 3h3v10H9z"/>'),
  gem: svg('<path fill="#5fd0ff" d="M4 2h8l3 4-7 9-7-9z"/><path fill="#c8f4ff" d="M5 3h3v3H5z"/>'),
};

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function fmt(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`;
  return String(Math.floor(n));
}
