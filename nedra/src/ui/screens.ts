// Экраны: посёлок, наследники, станция, итоги, модальные окна.
import { computeIngots } from '../core/economy';
import { NODE_INFO } from '../core/map';
import { addArtifact, artifactPrice, availableLifts, buy, canBuy, eventChoices, makeEventCtx, randomArtifacts,
  rerollPrice, rest, restOptions, rollHeirs, sellArtifact, shopPrice, type ShopItem } from '../core/run';
import { has, type Heir } from '../core/state';
import { computeStats } from '../core/stats';
import { artifactDef, RARITY_NAME, TAG_NAME } from '../data/artifacts';
import { consumableDef } from '../data/consumables';
import { professionDef, TOOLS, traitDef } from '../data/heirs';
import { layerDef } from '../data/layers';
import { BUILDINGS, buildingCost, buildingLevel, GEAR, PRODUCTS } from '../data/meta';
import type { Game } from '../game/game';
import { fmt, h, icon, ICONS } from './dom';

const page = (...children: (HTMLElement | null | false)[]) => h('div', { class: 'page' }, h('div', { class: 'wrap' }, ...children));
const coinsTxt = (n: number) => h('span', { class: 'chip' }, icon('coin'), fmt(n));
const ingotsTxt = (n: number) => h('span', { class: 'chip' }, icon('ingot'), fmt(n));

function mount(game: Game, el: HTMLElement): void {
  const old = game.screen.querySelector('.page');
  const scroll = old?.scrollTop ?? 0;
  game.screen.querySelectorAll('.page').forEach((p) => p.remove());
  game.screen.prepend(el);
  el.scrollTop = scroll;
}

function modal(game: Game, ...children: (HTMLElement | null | false)[]): HTMLElement {
  const m = h('div', { class: 'modal-bg' }, h('div', { class: 'modal panel' }, ...children));
  game.openModal(m);
  return m;
}

export function artifactCard(id: string, extra: (HTMLElement | null)[] = [], onclick?: () => void): HTMLElement {
  const a = artifactDef(id);
  return h(onclick ? 'button' : 'div', { class: `card ${a.rarity}`, onclick },
    h('div', { class: 'row' }, h('span', { class: 'name' }, a.name), h('span', { class: `rar ${a.rarity}` }, RARITY_NAME[a.rarity])),
    h('div', { class: 'desc' }, a.desc),
    h('div', { class: 'note' }, TAG_NAME[a.tag]),
    ...extra);
}

// ---------------- Посёлок ----------------

export function renderBase(game: Game): void {
  const m = game.meta;
  const buildings = BUILDINGS.map((b) => {
    const lvl = buildingLevel(m, b.id);
    const max = lvl >= b.max;
    const cost = buildingCost(b, lvl);
    return h('div', { class: 'card' },
      h('div', { class: 'row' }, h('span', { class: 'name' }, b.name), h('span', { class: 'level' }, `ур. ${lvl}`)),
      h('div', { class: 'desc' }, b.desc),
      h('div', { class: 'note' }, max ? b.effect(lvl) : `${b.effect(lvl)} → ${b.effect(lvl + 1)}`),
      h('button', {
        class: 'btn small', disabled: max || m.ingots < cost,
        onclick: () => {
          m.ingots -= cost;
          m.buildings[b.id] = lvl + 1;
          game.audio.coin();
          game.save();
          renderBase(game);
        },
      }, max ? 'Максимум' : h('span', null, 'Улучшить ', icon('ingot'), fmt(cost))));
  });
  const gear = GEAR.map((g) => {
    const owned = m.gear.includes(g.id);
    const bp = m.blueprints.includes(g.id);
    const ready = layerDef(g.layer).ready;
    return h('div', { class: 'card' },
      h('div', { class: 'row' }, h('span', { class: 'name' }, g.name), owned ? h('span', { class: 'good' }, 'есть') : icon('lock')),
      h('div', { class: 'desc' }, g.desc),
      owned ? null : !bp ? h('div', { class: 'note' }, `Чертёж выпадает в Разломе пласта ${g.from}.`)
        : !ready ? h('div', { class: 'note' }, `Пласт ${g.layer} откроется в обновлении.`)
          : h('button', {
            class: 'btn small', disabled: m.ingots < g.cost,
            onclick: () => {
              m.ingots -= g.cost;
              m.gear.push(g.id);
              game.audio.pickup();
              game.toast(`${g.name} готов!`, 'good');
              game.save();
              renderBase(game);
            },
          }, h('span', null, 'Собрать ', icon('ingot'), fmt(g.cost))));
  });
  const lifts = availableLifts(m);
  mount(game, page(
    h('div', { class: 'logo' }, 'НЕДРА'),
    h('div', { class: 'title' }, h('h2', null, 'Посёлок Кирковичей'), ingotsTxt(m.ingots)),
    h('div', { class: 'panel' },
      h('button', { class: 'btn big', style: 'width:100%', onclick: () => showHeirs(game) }, icon('pick'), 'В экспедицию'),
      h('p', { class: 'note' }, `Рекорд глубины: ${m.stats.bestDepth} м · Экспедиций: ${m.stats.runs} · Лифтов: ${lifts.length}`),
      m.stats.runs < 10 ? h('p', { class: 'note good' }, `Удача новичка: x3 слитков ещё ${10 - m.stats.runs} экспедиций.`) : null),
    h('div', { class: 'panel buildings' }, h('h3', null, 'Постройки'), h('div', { class: 'grid' }, ...buildings)),
    h('div', { class: 'panel' }, h('h3', null, 'Мастерская снаряжения'), h('div', { class: 'grid' }, ...gear)),
    h('div', { class: 'panel' }, h('h3', null, 'Как играть'),
      h('p', { class: 'note' }, 'Копай вниз до лифта. Каждый блок стоит энергию, руда даёт монеты. На станции между ярусами покупай припасы, выбирай артефакты и путь. Поднимись с добычей вовремя: при эвакуации теряется половина. Слитки из добычи тратятся здесь, в посёлке.')),
    h('div', { class: 'btns' },
      h('button', { class: 'btn ghost', onclick: () => showShop(game) }, icon('gem'), 'Лавка'),
      h('button', { class: 'btn ghost', onclick: () => showSettings(game) }, icon('sound'), 'Настройки')),
  ));
}

export function showHeirs(game: Game): void {
  let heirs = rollHeirs(game.meta, game.rng());
  let rerolled = false;
  const draw = () => {
    game.closeModal();
    modal(game,
      h('h3', null, 'Кто спустится в шахту?'),
      h('div', { class: 'grid', style: 'grid-template-columns:1fr' }, ...heirs.map((heir) => heirCard(heir, () => chooseLift(game, heir)))),
      h('div', { class: 'btns', style: 'margin-top:10px' },
        game.meta.tutorialDone && !rerolled ? h('button', {
          class: 'btn ad', onclick: async () => {
            if (await game.rewarded()) {
              rerolled = true;
              heirs = rollHeirs(game.meta, game.rng());
              draw();
            }
          },
        }, icon('ad'), 'Новые кандидаты') : null,
        h('button', { class: 'btn ghost', onclick: () => game.closeModal() }, 'Назад')));
  };
  draw();
}

function heirCard(heir: Heir, onclick: () => void): HTMLElement {
  const prof = professionDef(heir.profession);
  const trait = traitDef(heir.trait);
  return h('button', { class: 'card heir', onclick },
    h('div', { class: 'row' }, h('span', { class: 'name' }, heir.name), h('span', { class: 'level' }, prof.name)),
    h('div', { class: 'desc' }, prof.desc),
    h('div', { class: 'note' }, `Инструмент: ${TOOLS[prof.tool].name}`),
    trait ? h('div', { class: 'desc' }, h('b', { class: 'good' }, `${trait.name}: `), trait.desc) : h('div', { class: 'note' }, 'Без особенностей'));
}

function chooseLift(game: Game, heir: Heir): void {
  const lifts = availableLifts(game.meta);
  if (lifts.length <= 1) {
    game.closeModal();
    game.beginRun(heir, 1);
    return;
  }
  game.closeModal();
  modal(game,
    h('h3', null, 'Откуда начать?'),
    h('div', { class: 'grid', style: 'grid-template-columns:1fr' }, ...lifts.map((L) => {
      const def = layerDef(L);
      return h('button', { class: 'card', onclick: () => { game.closeModal(); game.beginRun(heir, L); } },
        h('div', { class: 'row' }, h('span', { class: 'name' }, `Пласт ${L}: ${def.name}`), h('span', { class: 'level' }, def.depth)),
        h('div', { class: 'desc' }, L === 1 ? 'С поверхности: +25% слитков («Честная экспедиция»).'
          : `Лифт: набор экспедиции (${Math.min(3, L - 1)} арт. на выбор) и монеты на первую лавку.`));
    })),
    h('button', { class: 'btn ghost', onclick: () => game.closeModal() }, 'Назад'));
}

// ---------------- Станция ----------------

export function renderStation(game: Game): void {
  const run = game.run;
  if (!run?.station) return;
  const meta = game.meta;
  const st = run.station;
  const s = computeStats(meta, run);
  const L = layerDef(run.layer);
  const rerender = () => renderStation(game);
  const parts: (HTMLElement | null)[] = [];

  const title = st.kind === 'start' ? 'Начало экспедиции' : `Станция: пласт ${run.layer}`;
  parts.push(h('div', { class: 'title' }, h('h2', null, title), coinsTxt(run.coins)));
  parts.push(h('div', { class: 'stat-row' },
    h('span', { class: 'chip' }, icon('bolt'), `${Math.round(run.energy)}/${s.maxEnergy}`),
    h('span', { class: 'chip' }, icon('heart'), `${run.hearts}/${s.maxHearts}`),
    h('span', { class: 'chip' }, 'Добыча ', fmt(run.haul)),
    h('span', { class: 'chip' }, icon('depth'), `${(run.startLayer - 1) * 300 + run.tiers * 100} м`),
    h('span', { class: 'chip' }, icon('pick'), `${TOOLS[s.tool].name} ${run.toolLevel}`)));
  parts.push(h('div', { class: 'note' }, `${L.name} (${L.depth}). Наследник: ${run.heir.name}, ${professionDef(run.heir.profession).name}${run.heir.trait ? `, ${traitDef(run.heir.trait)!.name}` : ''}.`));

  // Выбор артефакта: набор экспедиции, элита, Разлом
  if (st.offer && st.offer.length) {
    const label = st.kind === 'start' ? `Набор экспедиции: выбери артефакт (осталось ${st.kitLeft})`
      : st.kind === 'boss' ? 'Награда Разлома: выбери артефакт' : 'Сундук обвальной зоны: выбери артефакт';
    parts.push(h('div', { class: 'panel' }, h('h3', null, label),
      h('div', { class: 'grid' }, ...st.offer.map((id) => artifactCard(id, [], () => {
        if (!addArtifact(run, computeStats(meta, run), id)) {
          game.toast('Пояс полон: продай артефакт ниже', 'bad');
          return;
        }
        game.audio.pickup();
        if (st.kind === 'start' && st.kitLeft > 1) {
          st.kitLeft -= 1;
          st.offer = randomArtifacts(meta, run, game.rng(), 3, 'common');
        } else {
          st.kitLeft = 0;
          st.offer = null;
        }
        game.save();
        rerender();
      }))),
      h('div', { class: 'btns', style: 'margin-top:8px' },
        !st.offerExtra ? h('button', {
          class: 'btn ad small', onclick: async () => {
            if (!(await game.rewarded())) return;
            st.offerExtra = true;
            const more = randomArtifacts(meta, { ...run, artifacts: [...run.artifacts, ...st.offer!] }, game.rng(), 1,
              st.kind === 'start' ? 'common' : 'rare');
            st.offer = [...st.offer!, ...more];
            rerender();
          },
        }, icon('ad'), 'Ещё вариант') : null,
        h('button', { class: 'btn ghost small', onclick: () => { st.offer = null; st.kitLeft = 0; game.save(); rerender(); } }, 'Пропустить'))));
  }

  if (st.kind === 'rest' && !st.restDone) {
    parts.push(h('div', { class: 'panel' }, h('h3', null, 'Привал: выбери одно'),
      h('div', { class: 'grid', style: 'grid-template-columns:1fr' }, ...restOptions(run, s).map((o) => h('button', {
        class: 'btn ghost', disabled: !o.can, onclick: () => {
          rest(run, s, o.id);
          st.restDone = true;
          game.audio.pickup();
          game.save();
          rerender();
        },
      }, o.label)))));
  }

  if (st.kind === 'cache' && st.eventId) {
    const ev = eventChoices(st);
    if (ev) {
      const ctx = makeEventCtx(meta, run, game.rng());
      parts.push(h('div', { class: 'panel' }, h('h3', null, `Тайник: ${ev.title}`), h('p', { class: 'note' }, ev.text),
        st.eventResult ? h('p', { class: 'good' }, st.eventResult)
          : h('div', { class: 'grid', style: 'grid-template-columns:1fr' }, ...ev.choices.map((c) => h('button', {
            class: 'btn ghost', disabled: c.can ? !c.can(ctx) : false,
            onclick: () => {
              st.eventResult = c.act(makeEventCtx(meta, run, game.rng()));
              game.audio.click();
              game.save();
              rerender();
            },
          }, typeof c.label === 'function' ? c.label(ctx) : c.label)))));
    }
  }

  if (st.kind === 'fair') {
    const freeReroll = (has(run, 'dice') && !run.freeRerollUsed);
    const price = rerollPrice(run, s);
    parts.push(h('div', { class: 'panel' }, h('h3', null, 'Ярмарка'),
      h('div', { class: 'grid' }, ...st.shop.map((id) => {
        const p = artifactPrice(id, run.layer, s.shopMult);
        return artifactCard(id, [h('button', {
          class: 'btn small', disabled: run.coins < p,
          onclick: () => {
            if (!addArtifact(run, computeStats(meta, run), id)) { game.toast('Пояс полон', 'bad'); return; }
            run.coins -= p;
            st.shop = st.shop.filter((x) => x !== id);
            game.audio.coin();
            game.save();
            rerender();
          },
        }, h('span', null, 'Купить ', icon('coin'), fmt(p)))]);
      })),
      h('div', { class: 'btns', style: 'margin-top:8px' },
        h('button', {
          class: 'btn ghost small', disabled: !freeReroll && run.coins < price,
          onclick: () => {
            if (freeReroll) run.freeRerollUsed = true;
            else { run.coins -= price; run.rerolls += 1; }
            st.shop = randomArtifacts(meta, run, game.rng(), 3, 'common');
            game.audio.click();
            rerender();
          },
        }, freeReroll ? 'Переброс (Кости гнома)' : h('span', null, 'Переброс ', icon('coin'), fmt(price))),
        h('button', {
          class: 'btn ad small', onclick: async () => {
            if (!(await game.rewarded())) return;
            st.shop = randomArtifacts(meta, run, game.rng(), 3, 'common');
            rerender();
          },
        }, icon('ad'), 'Переброс бесплатно'))));
  }

  // Мини-лавка
  const items: ShopItem[] = ['drink', 'stew', 'dynamite', 'ladder', 'repair', ...(st.kind === 'fair' ? ['scan', 'bomb'] as ShopItem[] : [])];
  const ITEM: Record<ShopItem, { name: string; desc: string; ico: keyof typeof ICONS }> = {
    drink: { name: 'Энергетик', desc: `+20% энергии, осталось ${Math.max(0, 2 - run.drinksBought)}`, ico: 'bolt' },
    stew: { name: 'Тушёнка', desc: consumableDef('stew').desc, ico: 'stew' },
    dynamite: { name: 'Динамит', desc: consumableDef('dynamite').desc, ico: 'dynamite' },
    ladder: { name: 'Лестница', desc: consumableDef('ladder').desc, ico: 'ladder' },
    repair: { name: 'Ремонт каски', desc: '+1 сердце', ico: 'heart' },
    scan: { name: 'Сканер', desc: consumableDef('scan').desc, ico: 'scan' },
    bomb: { name: 'Бур-бомба', desc: consumableDef('bomb').desc, ico: 'bomb' },
  };
  let shopPanel: HTMLElement | null = null;
  if (st.kind !== 'start' || run.coins > 0) {
    shopPanel = h('div', { class: 'panel' }, h('h3', null, 'Лавка станции'),
      h('div', { class: 'shop' }, ...items.map((it) => {
        const why = canBuy(run, s, it);
        const p = shopPrice(run, s, it);
        return h('div', { class: 'shop-row' },
          icon(ITEM[it].ico, 'big'),
          h('div', { class: 'shop-txt' }, h('div', { class: 'name' }, ITEM[it].name), h('div', { class: 'desc' }, ITEM[it].desc)),
          h('button', {
            class: 'btn small', disabled: !!why,
            onclick: () => { if (buy(run, s, it)) { game.audio.coin(); game.save(); rerender(); } },
          }, why && why !== 'Мало монет' ? why : h('span', null, icon('coin'), fmt(p))));
      })));
  }

  // Пояс и расходники
  const beltPanel = h('div', { class: 'panel' }, h('h3', null, `Пояс артефактов (${run.artifacts.length}/${s.beltSlots})`),
    run.artifacts.length ? h('div', { class: 'belt' }, ...run.artifacts.map((id) => artifactCard(id, [h('button', {
      class: 'btn ghost small', onclick: () => {
        const got = sellArtifact(run, id);
        game.toast(`Продано за ${got}`, 'info');
        game.save();
        rerender();
      },
    }, `Продать за ${Math.round(artifactPrice(id, run.layer) / 2)}`)])))
      : h('p', { class: 'note' }, 'Пусто. Артефакты дают сундуки, Ярмарки, Разломы и обвальные зоны.'),
    run.consumables.length ? h('p', { class: 'note' }, 'Расходники: ', run.consumables.map((c) => `${consumableDef(c.id).name} x${c.n}`).join(', ')) : null);

  // Куда дальше
  if (st.forcedEnd) {
    parts.push(h('div', { class: 'panel' }, h('h3', null, 'Дальше пути нет'), h('p', { class: 'note' }, st.forcedEnd)));
  } else {
    const nextLayer = st.kind === 'boss' ? run.layer + 1 : run.layer;
    const rowLabel = st.kind === 'boss' ? `Пласт ${nextLayer}: ${layerDef(nextLayer).name}` : `Пласт ${run.layer}, ряд ${st.kind === 'start' ? 1 : run.step + 2} из 3`;
    parts.push(h('div', { class: 'panel' }, h('h3', null, 'Куда дальше?'), h('p', { class: 'note' }, rowLabel),
      h('div', { class: 'map' }, ...st.next.map((n) => h('button', {
        class: `card node ${n === 'boss' ? 'boss' : ''}`, onclick: () => game.chooseNode(n),
      },
      h('div', { class: 'name' }, n === 'boss' ? `Разлом: ${layerDef(nextLayer).boss.name}` : NODE_INFO[n].name),
      h('div', { class: 'desc' }, n === 'boss' ? layerDef(nextLayer).boss.desc : NODE_INFO[n].desc),
      h('div', { class: 'note' }, `После: ${NODE_INFO[n].reward}`)))),
    ));
  }

  // Подняться
  if (st.kind !== 'start') {
    const full = computeIngots(meta, run, 1).ingots;
    const evac = computeIngots(meta, run, Math.min(1, s.evacKeep)).ingots;
    parts.push(h('div', { class: 'panel' },
      h('button', { class: 'btn red', style: 'width:100%', onclick: () => confirmCashOut(game, full) },
        icon('ingot'), `Подняться с добычей: ${fmt(full)} слитков`),
      h('p', { class: 'note' }, `Если спуститься и не вернуться, при эвакуации останется ${fmt(evac)} слитков (${Math.round(s.evacKeep * 100)}%).`)));
  }
  parts.push(shopPanel, beltPanel);
  mount(game, page(...parts));
}

function confirmCashOut(game: Game, ingots: number): void {
  modal(game, h('h3', null, 'Подняться наверх?'),
    h('p', { class: 'note' }, `Экспедиция закончится, добыча превратится в ${fmt(ingots)} слитков.`),
    h('div', { class: 'btns' },
      h('button', { class: 'btn', onclick: () => { game.closeModal(); game.endRun('cashout'); } }, 'Подняться'),
      h('button', { class: 'btn ghost', onclick: () => game.closeModal() }, 'Остаться')));
}

// ---------------- Ярус: модальные окна ----------------

export function showEvac(game: Game, reason: 'energy' | 'hearts'): void {
  const run = game.run!;
  const s = computeStats(game.meta, run);
  const keep = Math.round(Math.min(1, s.evacKeep) * 100);
  modal(game,
    h('h3', { class: 'bad' }, reason === 'energy' ? 'Силы на исходе' : 'Каска разбита'),
    h('p', { class: 'note' }, `Спасатели вытащат ${run.heir.name} наверх, но сохранится только ${keep}% добычи.`),
    h('div', { class: 'btns' },
      !run.revived ? h('button', { class: 'btn ad', onclick: () => game.revive() }, icon('ad'), 'Второе дыхание: +50% энергии, +1 сердце') : null,
      h('button', { class: 'btn ghost', onclick: () => { game.closeModal(); game.endRun('evac'); } }, `Эвакуироваться (${keep}%)`)));
}

export function showPause(game: Game): void {
  const run = game.run!;
  const keep = Math.round(Math.min(1, computeStats(game.meta, run).evacKeep) * 100);
  modal(game,
    h('h3', null, 'Пауза'),
    h('div', { class: 'grid', style: 'grid-template-columns:1fr' },
      h('button', { class: 'btn', onclick: () => game.closeModal() }, 'Продолжить'),
      toggle(game, 'sound', 'Звук'),
      toggle(game, 'music', 'Музыка'),
      h('button', {
        class: 'btn ghost', onclick: () => {
          game.closeModal();
          modal(game, h('h3', null, 'Эвакуироваться?'), h('p', { class: 'note' }, `Сохранится ${keep}% добычи.`),
            h('div', { class: 'btns' },
              h('button', { class: 'btn red', onclick: () => { game.closeModal(); game.endRun('evac'); } }, 'Да'),
              h('button', { class: 'btn ghost', onclick: () => game.closeModal() }, 'Нет')));
        },
      }, `Эвакуироваться (${keep}%)`)));
}

function toggle(game: Game, key: 'sound' | 'music', label: string): HTMLElement {
  const on = game.meta.settings[key];
  return h('button', {
    class: 'btn ghost', onclick: (e: Event) => {
      game.setSetting(key, !game.meta.settings[key]);
      (e.currentTarget as HTMLElement).textContent = `${label}: ${game.meta.settings[key] ? 'вкл' : 'выкл'}`;
    },
  }, `${label}: ${on ? 'вкл' : 'выкл'}`);
}

export function showSettings(game: Game): void {
  modal(game, h('h3', null, 'Настройки'),
    h('div', { class: 'grid', style: 'grid-template-columns:1fr' },
      toggle(game, 'sound', 'Звук'), toggle(game, 'music', 'Музыка'),
      h('button', { class: 'btn', onclick: () => game.closeModal() }, 'Готово')));
}

export function showShop(game: Game): void {
  const p = game.meta.purchases;
  const owned: Record<string, boolean> = { no_ads: p.noAds, starter_pack: p.starter, golden_smelter: p.goldenSmelter };
  modal(game, h('h3', null, 'Лавка'),
    h('p', { class: 'note' }, 'Игра полностью проходится бесплатно. Покупки ускоряют прогресс и поддерживают разработку.'),
    h('div', { class: 'grid', style: 'grid-template-columns:1fr' }, ...PRODUCTS.map((prod) => {
      const cat = game.products.find((x) => x.id === prod.id);
      const price = h('span', null, cat?.icon ? h('img', { src: cat.icon, alt: '', style: 'width:1em;height:1em;vertical-align:-0.15em' }) : null,
        ` ${cat?.price ?? prod.fallbackPrice}${cat ? '' : ' ян'}`);
      return h('div', { class: 'card' },
        h('div', { class: 'row' }, h('span', { class: 'name' }, cat?.title ?? prod.name)),
        h('div', { class: 'desc' }, prod.desc),
        owned[prod.id] ? h('span', { class: 'good' }, 'Куплено')
          : h('button', { class: 'btn small', onclick: async () => { await game.buy(prod.id); game.closeModal(); renderBase(game); } }, 'Купить', price));
    })),
    h('button', { class: 'btn ghost', onclick: () => game.closeModal() }, 'Закрыть'));
}

export function showInfo(game: Game, title: string, text: string, after?: () => void): void {
  modal(game, h('h3', null, title), h('p', { class: 'note' }, text),
    h('button', { class: 'btn', onclick: () => { game.closeModal(); after?.(); } }, 'Отлично'));
}

// ---------------- Итоги ----------------

export function renderResults(game: Game): void {
  const o = game.outcome;
  if (!o) return;
  const ok = o.reason === 'cashout';
  const ingots = o.ingots * (game.outcomeDoubled ? 2 : 1);
  mount(game, page(
    h('div', { class: 'title' }, h('h1', null, ok ? 'Подъём с добычей!' : 'Эвакуация'), ingotsTxt(game.meta.ingots)),
    h('div', { class: 'panel' },
      h('p', { class: 'note' }, `Глубина: ${o.depth} м`),
      h('div', { class: 'lines' }, ...o.lines.map((l) => h('div', null, h('span', null, l.label), h('b', null, l.value)))),
      h('div', { class: 'total', style: 'margin-top:10px' }, icon('ingot'), ` +${fmt(ingots)}`),
      game.outcomeDoubled ? h('p', { class: 'note good', style: 'text-align:center' }, 'Удвоено!') : null),
    o.unlocks.length ? h('div', { class: 'panel' }, h('h3', null, 'Открыто'), ...o.unlocks.map((u) => h('p', { class: 'good' }, u))) : null,
    h('div', { class: 'btns' },
      !game.outcomeDoubled && o.ingots > 0 ? h('button', { class: 'btn ad big', onclick: () => game.doubleOutcome() }, icon('ad'), `x2 слитков: +${fmt(o.ingots)}`) : null,
      h('button', { class: 'btn big', onclick: () => game.leaveResults() }, 'В посёлок')),
  ));
}
