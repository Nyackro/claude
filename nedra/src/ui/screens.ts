// Экраны: посёлок, выбор героя, привал (кузница, лавка, припасы), комнаты этажа, пауза, итоги.
import { computeIngots } from '../core/economy';
import { PICK_TIER_NAME } from '../core/blocks';
import { availableLifts, buyNpcUpgrade, buyShopItem, buySupply, chooseReward, evacKeep, forge, forgeInfo, itemPrice, merchantStock, npcUpgrades, priceMult, reroll,
  rerollPrice, sellable, sellOre, sharpen, shrineOffers, supplyBlocked, supplyPrice, useAnvil, useShrine, addItem, randomItems,
  type ForgeInfo, type Supply, type ToolKind } from '../core/run';
import { stack } from '../core/state';
import { computeStats } from '../core/stats';
import { enemyDef } from '../data/enemies';
import { HEROES, heroDef, type HeroDef } from '../data/heroes';
import { ITEMS, itemDef, RARITY_NAME } from '../data/items';
import { layerDef } from '../data/layers';
import { BUILDINGS, buildingCost, buildingLevel, PRODUCTS } from '../data/meta';
import { NPCS, npcDef, nextCaptive, type NpcDef } from '../data/npcs';
import { oreByKey } from '../data/ores';
import type { PropState } from '../game/floor';
import type { Game } from '../game/game';
import { fmt, h, icon, type ICONS } from './dom';

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

export function itemCard(id: string, extra: (HTMLElement | null)[] = [], onclick?: () => void, count = 0): HTMLElement {
  const d = itemDef(id);
  return h(onclick ? 'button' : 'div', { class: `card ${d.rarity}`, onclick },
    h('div', { class: 'row' }, h('span', { class: 'name' }, d.name + (count > 1 ? ` x${count}` : '')), h('span', { class: `rar ${d.rarity}` }, RARITY_NAME[d.rarity])),
    h('div', { class: 'desc' }, d.desc),
    ...extra);
}

/** Портрет героя: спрайт гнома, увеличенный без сглаживания. */
function portrait(game: Game, hero: HeroDef, size = 64): HTMLElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.className = 'portrait';
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(game.heroSprite(hero).portrait, 0, 0, size, size);
  return c;
}

/** Портрет спасённого мастера (или чёрный силуэт того, кто ещё в плену). */
function npcPortrait(game: Game, id: string, size = 48, shadow = false): HTMLElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.className = 'portrait';
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  if (shadow) ctx.filter = 'brightness(0)';
  const spr = game.npcSprite(id);
  if (spr) ctx.drawImage(spr, 0, 0, size, size);
  return c;
}

function npcCard(game: Game, n: NpcDef): HTMLElement {
  const m = game.meta;
  if (m.rescued.includes(n.id)) {
    const ups = npcUpgrades(m, n.id);
    const done = ups.reduce((a, u) => a + u.lvl, 0), total = ups.reduce((a, u) => a + u.max, 0);
    const can = ups.some((u) => u.next && m.ingots >= u.cost);
    return h('button', { class: `card npc ${can ? 'can' : ''}`, onclick: () => showNpc(game, n.id) },
      h('div', { class: 'hero-head' }, npcPortrait(game, n.id),
        h('div', null, h('div', { class: 'name' }, `${n.name}, ${n.title}`), h('div', { class: 'level' }, `${n.hall} · ${done}/${total}`))),
      can ? h('div', { class: 'desc good' }, 'Есть что улучшить') : null);
  }
  const next = nextCaptive(m)?.id === n.id;
  const L = layerDef(n.layer);
  return h('div', { class: 'card locked' },
    h('div', { class: 'hero-head' }, npcPortrait(game, n.id, 48, true),
      h('div', null, h('div', { class: 'name' }, next ? `${n.name}, ${n.title}` : '???'),
        h('div', { class: 'desc' }, next ? `В плену: пласт ${n.layer} «${L.name}», этаж ${n.floor + 1}. Перебей стражу и коснись клетки.`
          : 'Сначала спаси предыдущего пленника.'))));
}

function showNpc(game: Game, id: string): void {
  const m = game.meta, n = npcDef(id);
  const draw = (): void => {
    game.closeModal();
    modal(game,
      h('div', { class: 'hero-head' }, npcPortrait(game, id, 56), h('div', null, h('h3', null, n.hall), h('div', { class: 'note' }, `«${n.greet}»`))),
      h('div', { class: 'title' }, h('span', { class: 'note' }, 'Улучшения навсегда'), ingotsTxt(m.ingots)),
      h('div', { class: 'shop' }, ...npcUpgrades(m, id).map((u) => h('div', { class: 'shop-row' },
        h('div', { class: 'shop-txt' },
          h('div', { class: 'name' }, `${u.name} `, h('span', { class: 'level' }, `${u.lvl}/${u.max}`)),
          h('div', { class: 'desc' }, u.next ? (u.lvl ? `${u.now} → ${u.next}` : u.next) : u.now)),
        h('button', {
          class: 'btn small', disabled: !u.next || m.ingots < u.cost,
          onclick: () => {
            if (!buyNpcUpgrade(m, u.id)) return;
            game.audio.coin();
            game.save();
            renderBase(game);
            draw();
          },
        }, u.next ? h('span', null, icon('ingot'), fmt(u.cost)) : 'Макс.')))),
      h('button', { class: 'btn ghost', onclick: () => game.closeModal() }, 'Назад'));
  };
  draw();
}

// ---------------- Посёлок ----------------

export function renderBase(game: Game): void {
  const m = game.meta;
  const buildings = BUILDINGS.map((b) => {
    const lvl = buildingLevel(m, b.id);
    const max = lvl >= b.max;
    const cost = buildingCost(b, lvl);
    return h('div', { class: 'card' },
      h('div', { class: 'row' }, h('span', { class: 'name' }, b.name), h('span', { class: 'level' }, `ур. ${lvl}/${b.max}`)),
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
  const hero = heroDef(m.hero);
  const lifts = availableLifts(m);
  mount(game, page(
    h('div', { class: 'logo' }, 'НЕДРА'),
    h('div', { class: 'title' }, h('h2', null, 'Посёлок Кирковичей'), ingotsTxt(m.ingots)),
    h('div', { class: 'panel hero-pick' },
      portrait(game, hero, 72),
      h('div', { class: 'hero-txt' },
        h('div', { class: 'name' }, `${hero.name}, ${hero.title.toLowerCase()}`),
        h('div', { class: 'desc' }, hero.desc),
        h('button', { class: 'btn ghost small', onclick: () => showHeroes(game) }, `Герои: ${m.heroes.length}/${HEROES.length}`))),
    h('button', { class: 'btn big', onclick: () => chooseLift(game) }, icon('pick'), 'В шахту'),
    h('p', { class: 'note' }, `Рекорд глубины: ${m.stats.bestDepth} м · Экспедиций: ${m.stats.runs} · Разломов: ${m.bosses.length} · Лифтов: ${lifts.length}`),
    m.stats.runs < 10 ? h('p', { class: 'note good' }, `Удача новичка: x3 слитков ещё ${10 - m.stats.runs} экспедиций.`) : null,
    h('div', { class: 'panel' }, h('h3', null, `Мастера из плена: ${m.rescued.length}/${NPCS.length}`),
      h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(220px,1fr))' }, ...NPCS.map((n) => npcCard(game, n)))),
    h('div', { class: 'panel buildings' }, h('h3', null, 'Постройки (навсегда)'), h('div', { class: 'grid' }, ...buildings)),
    h('div', { class: 'panel' }, h('h3', null, 'Как играть'),
      h('p', { class: 'note' }, 'Копай путь вниз, к лестнице в конце этажа. Темнота скрывает всё, кроме откопанного: ставь факелы (1 уголь = 1 факел). Меч бьёт сам, когда враг рядом. Руду неси на привал: из неё куются кирки и мечи, а монеты идут на заточку и предметы. Боковые комнаты - сундуки, испытания, торговцы и мини-боссы. Каждый пласт заканчивается Разломом с боссом, на самом дне ждёт Богомирон. В темницах томятся мастера: спаси их, и в посёлке они научат героя новому. Предметы складываются и цепляются друг за друга: собери сборку, которая сломает шахту.')),
    h('div', { class: 'btns' },
      h('button', { class: 'btn ghost', onclick: () => showShop(game) }, icon('gem'), 'Лавка'),
      h('button', { class: 'btn ghost', onclick: () => showSettings(game) }, icon('sound'), 'Настройки')),
  ));
}

export function showHeroes(game: Game): void {
  const m = game.meta;
  modal(game,
    h('h3', null, 'Герои'),
    h('div', { class: 'grid', style: 'grid-template-columns:1fr' }, ...HEROES.map((hero) => {
      const open = m.heroes.includes(hero.id);
      const chosen = m.hero === hero.id;
      return h(open ? 'button' : 'div', {
        class: `card hero ${chosen ? 'chosen' : ''} ${open ? '' : 'locked'}`,
        onclick: open ? () => { m.hero = hero.id; game.save(); game.closeModal(); renderBase(game); } : undefined,
      },
      h('div', { class: 'hero-head' }, portrait(game, hero, 48),
        h('div', null, h('div', { class: 'name' }, `${hero.name}, ${hero.title.toLowerCase()}`), h('div', { class: 'desc' }, hero.desc))),
      h('div', { class: 'desc' }, h('b', null, `${hero.ability.name} (${hero.ability.cd} с): `), hero.ability.desc),
      h('div', { class: 'desc' }, h('b', null, 'Пассивка: '), hero.passive),
      open ? (chosen ? h('div', { class: 'good' }, 'Выбран') : null)
        : h('div', { class: 'note' }, icon('lock'), ` Открыть: ${hero.unlock?.text ?? ''}`));
    })),
    h('button', { class: 'btn ghost', onclick: () => game.closeModal() }, 'Назад'));
}

function chooseLift(game: Game): void {
  const lifts = availableLifts(game.meta);
  if (lifts.length <= 1) {
    game.beginRun(game.meta.hero, 1);
    return;
  }
  modal(game,
    h('h3', null, 'Откуда начать?'),
    h('div', { class: 'grid', style: 'grid-template-columns:1fr' }, ...[...lifts].reverse().map((L) => {
      const def = layerDef(L);
      const coins = Math.round(40 * (L - 1) * Math.max(1, priceMult(L) / 2));
      const bosses = def.bosses.map((b) => enemyDef(b).name).join(' и ');
      return h('button', { class: `card ${def.cycle ? 'endless' : ''}`, onclick: () => { game.closeModal(); game.beginRun(game.meta.hero, L); } },
        h('div', { class: 'row' }, h('span', { class: 'name' }, `Пласт ${L} · ${def.name}`), h('span', { class: 'level' }, def.depth)),
        h('div', { class: 'desc' }, L === 1 ? 'С поверхности: +25% слитков, если пройти хотя бы один пласт.'
          : `Лифт: ${PICK_TIER_NAME[def.kit]} кирка и меч, ${fmt(coins)} монет, ${def.cycle ? `${1 + def.cycle} редких предмета` : 'предмет'} на выбор. Разлом: ${bosses}.`));
    })),
    h('button', { class: 'btn ghost', onclick: () => game.closeModal() }, 'Назад'));
}

// ---------------- Привал ----------------

function forgeRow(game: Game, f: ForgeInfo, rerender: () => void): HTMLElement {
  const run = game.run!;
  const isPick = f.kind === 'pick';
  const recipe = f.next ? Object.entries(f.next.recipe).map(([k, n]) => {
    const have = run.bag[k] ?? 0;
    return h('span', { class: `chip ${have >= n ? 'good' : 'bad'}` }, `${oreByKey(k).name} ${have}/${n}`);
  }) : [];
  const power = isPick ? `сила ${(f.cur.power * (1 + 0.15 * f.sharpen)).toFixed(1)}` : `урон ${(f.cur.power * (1 + 0.15 * f.sharpen)).toFixed(1)}`;
  return h('div', { class: 'forge-row' },
    h('div', { class: 'row' }, h('span', { class: 'name' }, icon(isPick ? 'pick' : 'sword'), ` ${f.cur.name}${f.sharpen ? ` +${f.sharpen}` : ''}`), h('span', { class: 'note' }, power)),
    f.next ? h('div', { class: 'forge-next' },
      h('div', { class: 'desc' }, `Выковать: ${f.next.name} (${isPick ? 'сила' : 'урон'} ${f.next.power}${isPick ? `, берёт породу уровня ${f.next.tier}` : ''})`),
      h('div', { class: 'stat-row' }, ...recipe),
      h('button', {
        class: 'btn small', disabled: !f.can, onclick: () => {
          if (forge(run, f.kind)) {
            game.audio.fanfare();
            game.toast(`${f.next!.name} готова!`, 'good');
            game.save();
            rerender();
          }
        },
      }, 'Выковать')) : h('div', { class: 'note' }, 'Лучше уже не выковать.'),
    h('button', {
      class: 'btn ghost small', disabled: f.sharpen >= f.sharpenMax || run.coins < f.sharpenCost, onclick: () => {
        if (sharpen(run, f.kind)) {
          game.audio.coin();
          game.save();
          rerender();
        }
      },
    }, f.sharpen >= f.sharpenMax ? 'Заточено до предела' : h('span', null, `Заточить +15% (${f.sharpen}/${f.sharpenMax}) `, icon('coin'), fmt(f.sharpenCost))));
}

const SUPPLY: Record<Supply, { name: string; desc: string; ico: keyof typeof ICONS }> = {
  heal: { name: 'Лекарь', desc: '+50% здоровья', ico: 'heart' },
  bomb: { name: 'Бомба', desc: 'Кидается кнопкой: рушит породу и бьёт врагов', ico: 'bomb' },
  coal: { name: 'Уголь x3', desc: 'Три факела', ico: 'coal' },
  scanner: { name: 'Сканер руды', desc: 'Подсвечивает руду и сундуки вокруг', ico: 'scan' },
};

export function renderStation(game: Game): void {
  const run = game.run;
  if (!run?.station) return;
  const meta = game.meta;
  const st = run.station;
  const s = computeStats(meta, run);
  const L = layerDef(run.layer);
  const rerender = () => renderStation(game);
  const parts: (HTMLElement | null)[] = [];

  const title = st.kind === 'start' ? 'Начало экспедиции' : st.kind === 'boss' ? `Разлом пласта ${run.layer} пройден!` : 'Привал';
  parts.push(h('div', { class: 'title' }, h('h2', null, title), coinsTxt(run.coins)));
  parts.push(h('div', { class: 'stat-row' },
    h('span', { class: 'chip' }, icon('heart'), `${Math.ceil(run.hp)}/${s.maxHp}`),
    h('span', { class: 'chip' }, icon('bag'), `Добыча ${fmt(run.haul)}`),
    h('span', { class: 'chip' }, icon('coal'), String(run.bag.coal ?? 0)),
    h('span', { class: 'chip' }, icon('bomb'), String(run.bombs)),
    h('span', { class: 'chip' }, icon('depth'), `${(run.layer - 1) * 300 + run.floor * 100 + (st.kind === 'start' ? 0 : 100)} м`)));
  const nextFloor = st.kind === 'start' ? 0 : run.floor + 1;
  parts.push(h('div', { class: 'note' }, st.kind === 'boss'
    ? `${L.name} позади. Можно подняться с полной добычей или спуститься глубже.`
    : `${L.name}. Дальше: ${nextFloor >= 2 ? `Разлом: ${L.bosses.map((b) => enemyDef(b).name).join(' и ')}` : `этаж ${nextFloor + 1} из 2`}.`));

  if (st.reward && st.reward.length) {
    parts.push(h('div', { class: 'panel' }, h('h3', null, `${st.kind === 'boss' ? 'Награда Разлома' : 'Набор экспедиции'}: ${st.rewardLeft > 1 ? `выбери ${st.rewardLeft} из ${st.reward?.length ?? 0}` : 'выбери предмет'}`),
      h('div', { class: 'grid' }, ...st.reward.map((id) => itemCard(id, [], () => {
        chooseReward(meta, run, id);
        game.audio.pickup();
        game.save();
        rerender();
      }))),
      h('div', { class: 'btns', style: 'margin-top:8px' },
        h('button', {
          class: 'btn ad small', onclick: async () => {
            if (!(await game.rewarded())) return;
            const more = randomItems(meta, run, game.rng(), 1, st.kind === 'boss' ? 'rare' : 'common').filter((x) => !st.reward!.includes(x));
            st.reward = [...st.reward!, ...more];
            rerender();
          },
        }, icon('ad'), 'Ещё вариант'))));
  }

  parts.push(h('div', { class: 'panel' }, h('h3', null, 'Кузница'),
    h('p', { class: 'note' }, 'Руда - новый уровень (сильный скачок и более твёрдая порода). Монеты - заточка.'),
    forgeRow(game, forgeInfo(run, 'pick'), rerender), forgeRow(game, forgeInfo(run, 'sword'), rerender)));

  // лавка предметов
  const rp = rerollPrice(run);
  parts.push(h('div', { class: 'panel' }, h('h3', null, 'Лавка предметов'),
    h('div', { class: 'grid' }, ...st.shop.map((id, k) => {
      if (!id) return h('div', { class: 'card sold' }, h('div', { class: 'note' }, 'Продано'));
      const price = itemPrice(run, id);
      return itemCard(id, [h('button', {
        class: 'btn small', disabled: run.coins < price, onclick: () => {
          if (buyShopItem(meta, run, k)) {
            game.audio.coin();
            game.save();
            rerender();
          }
        },
      }, h('span', null, 'Купить ', icon('coin'), fmt(price)))], undefined, 0);
    })),
    h('div', { class: 'btns', style: 'margin-top:8px' },
      h('button', {
        class: 'btn ghost small', disabled: run.coins < rp, onclick: () => {
          if (reroll(meta, run, game.rng())) {
            game.audio.click();
            rerender();
          }
        },
      }, h('span', null, 'Обновить ', icon('coin'), fmt(rp))),
      h('button', {
        class: 'btn ad small', onclick: async () => {
          if (!(await game.rewarded())) return;
          st.shop = randomItems(meta, run, game.rng(), 3, null);
          rerender();
        },
      }, icon('ad'), 'Обновить бесплатно'))));

  // припасы
  parts.push(h('div', { class: 'panel' }, h('h3', null, 'Припасы'),
    h('div', { class: 'shop' }, ...(['heal', 'bomb', 'coal', 'scanner'] as Supply[]).map((it) => {
      const why = supplyBlocked(meta, run, it);
      return h('div', { class: 'shop-row' },
        icon(SUPPLY[it].ico, 'big'),
        h('div', { class: 'shop-txt' }, h('div', { class: 'name' }, SUPPLY[it].name), h('div', { class: 'desc' }, SUPPLY[it].desc)),
        h('button', {
          class: 'btn small', disabled: !!why, onclick: () => {
            if (buySupply(meta, run, it)) {
              game.audio.coin();
              game.save();
              rerender();
            }
          },
        }, why && why !== 'Мало монет' ? why : h('span', null, icon('coin'), fmt(supplyPrice(run, it)))));
    }))));

  // скупщик и сумка
  const sell = sellable(run);
  const bag = Object.entries(run.bag).filter(([, n]) => n > 0);
  parts.push(h('div', { class: 'panel' }, h('h3', null, 'Сумка и скупщик'),
    bag.length ? h('div', { class: 'stat-row' }, ...bag.map(([k, n]) => h('span', { class: 'chip ore-chip', style: `border-color:${oreByKey(k).color}` }, `${oreByKey(k).name} ${n}`)))
      : h('p', { class: 'note' }, 'Сумка пуста.'),
    sell.length ? h('div', { class: 'btns', style: 'margin-top:8px' },
      h('button', {
        class: 'btn small', onclick: () => {
          let got = 0;
          for (const x of sell) got += sellOre(run, x.key);
          game.audio.coin();
          game.toast(`Продано на ${got} монет`, 'good');
          game.save();
          rerender();
        },
      }, h('span', null, `Продать лишнее (${sell.map((x) => x.key === 'coal' ? '' : oreByKey(x.key).name).filter(Boolean).join(', ')}) `, icon('coin'), fmt(sell.reduce((a, x) => a + x.value, 0)))))
      : h('p', { class: 'note' }, 'Руда для ближайшей ковки и уголь не продаются.')));

  // предметы
  const owned = ITEMS.filter((d) => stack(run, d.id) > 0);
  parts.push(h('div', { class: 'panel' }, h('h3', null, `Предметы (${owned.reduce((a, d) => a + stack(run, d.id), 0)})`),
    owned.length ? h('div', { class: 'belt' }, ...owned.map((d) => itemCard(d.id, [], undefined, stack(run, d.id))))
      : h('p', { class: 'note' }, 'Пока пусто. Предметы дают сундуки, мини-боссы, испытания, торговцы и Разломы.')));

  // куда дальше
  const full = computeIngots(meta, run, 1).ingots;
  const keep = evacKeep(meta);
  if (st.kind === 'boss') {
    parts.push(h('div', { class: 'panel' },
      st.forced ? h('p', { class: 'note' }, st.forced)
        : h('button', { class: 'btn big', style: 'width:100%', onclick: () => game.descend() }, icon('depth'), `Спуститься в пласт ${run.layer + 1}: ${layerDef(run.layer + 1).name}`),
      h('button', { class: 'btn red', style: 'width:100%;margin-top:8px', onclick: () => confirmCashOut(game, full) }, icon('ingot'), `Подняться с добычей: ${fmt(full)} слитков`)));
  } else {
    parts.push(h('div', { class: 'panel' },
      h('button', { class: 'btn big', style: 'width:100%', onclick: () => game.descend() }, icon('depth'),
        st.kind === 'start' ? 'Спуститься в шахту' : nextFloor >= 2 ? 'К Разлому' : `Спуститься на этаж ${nextFloor + 1}`),
      st.kind !== 'start' ? h('button', {
        class: 'btn ghost small', style: 'width:100%;margin-top:8px', onclick: () => confirmEvac(game, keep),
      }, `Вызвать спасателей (сохранится ${Math.round(keep * 100)}% добычи)`) : null));
  }
  mount(game, page(...parts));
}

function confirmCashOut(game: Game, ingots: number): void {
  modal(game, h('h3', null, 'Подняться наверх?'),
    h('p', { class: 'note' }, `Экспедиция закончится, добыча превратится в ${fmt(ingots)} слитков.`),
    h('div', { class: 'btns' },
      h('button', { class: 'btn', onclick: () => { game.closeModal(); game.endRun('cashout'); } }, 'Подняться'),
      h('button', { class: 'btn ghost', onclick: () => game.closeModal() }, 'Остаться')));
}

function confirmEvac(game: Game, keep: number): void {
  modal(game, h('h3', null, 'Вызвать спасателей?'),
    h('p', { class: 'note' }, `Экспедиция закончится, сохранится ${Math.round(keep * 100)}% добычи. Полная добыча - только после Разлома.`),
    h('div', { class: 'btns' },
      h('button', { class: 'btn red', onclick: () => { game.closeModal(); game.endRun('evac'); } }, 'Да'),
      h('button', { class: 'btn ghost', onclick: () => game.closeModal() }, 'Нет')));
}

// ---------------- Комнаты этажа ----------------

export function showProp(game: Game, kind: 'merchant' | 'shrine' | 'anvil', prop: PropState): void {
  if (kind === 'merchant') showMerchant(game, prop);
  else if (kind === 'shrine') showShrine(game, prop);
  else showAnvil(game, prop);
}

function showMerchant(game: Game, prop: PropState): void {
  const run = game.run!, meta = game.meta;
  if (!prop.stock.length && !prop.used) prop.stock = merchantStock(meta, run, game.rng());
  const draw = () => {
    game.closeModal();
    modal(game, h('h3', null, 'Бродячий торговец'),
      h('p', { class: 'note' }, 'Подземная цена: на 20% дешевле лавки привала.'),
      h('div', { class: 'stat-row' }, coinsTxt(run.coins)),
      prop.stock.length ? h('div', { class: 'grid', style: 'grid-template-columns:1fr' }, ...prop.stock.map((id, k) => {
        const price = itemPrice(run, id, 0.8);
        return itemCard(id, [h('button', {
          class: 'btn small', disabled: run.coins < price, onclick: () => {
            run.coins -= price;
            prop.stock.splice(k, 1);
            addItem(meta, run, id);
            game.floor?.refreshStats();
            game.audio.coin();
            game.hud.itemCard(id);
            draw();
          },
        }, h('span', null, 'Купить ', icon('coin'), fmt(price)))]);
      })) : h('p', { class: 'note' }, 'Всё распродано.'),
      h('div', { class: 'btns' },
        h('button', {
          class: 'btn small', disabled: run.coins < supplyPrice(run, 'bomb'), onclick: () => {
            run.coins -= supplyPrice(run, 'bomb');
            run.bombs++;
            game.audio.coin();
            draw();
          },
        }, h('span', null, 'Бомба ', icon('coin'), fmt(supplyPrice(run, 'bomb')))),
        h('button', { class: 'btn ghost', onclick: () => game.closeModal() }, 'Уйти')));
  };
  draw();
}

function showShrine(game: Game, prop: PropState): void {
  const run = game.run!, meta = game.meta;
  modal(game, h('h3', null, 'Древний алтарь'),
    h('p', { class: 'note' }, 'Алтарь примет одно подношение.'),
    h('div', { class: 'grid', style: 'grid-template-columns:1fr' }, ...shrineOffers(meta, run).map((o) => h('button', {
      class: `card ${o.id === 'dark' ? 'cursed' : o.id === 'blood' ? 'rare' : ''}`,
      disabled: (o.id === 'blood' && run.hp <= o.price) || (o.id === 'gold' && run.coins < o.price),
      onclick: () => {
        const got = useShrine(meta, run, o.id, game.rng());
        if (!got) return;
        prop.used = true;
        game.floor?.refreshStats();
        game.closeModal();
        game.audio.fanfare();
        for (const id of got) game.toast(`Получено: ${itemDef(id).name}`, itemDef(id).rarity === 'cursed' ? 'bad' : 'good');
        if (got[0]) game.hud.itemCard(got[got.length - 1]);
      },
    }, h('div', { class: 'name' }, o.title), h('div', { class: 'desc' }, o.desc),
    o.id === 'gold' ? h('div', { class: 'note' }, icon('coin'), ` ${o.price}`) : null))),
    h('button', { class: 'btn ghost', onclick: () => game.closeModal() }, 'Уйти'));
}

function showAnvil(game: Game, prop: PropState): void {
  const run = game.run!;
  if (prop.used) {
    game.toast('Наковальня остыла', 'info');
    return;
  }
  const choose = (kind: ToolKind) => {
    useAnvil(run, kind);
    prop.used = true;
    game.floor?.refreshStats();
    game.closeModal();
    game.audio.fanfare();
    game.toast(kind === 'pick' ? 'Кирка заточена: +2' : 'Меч заточен: +2', 'good');
  };
  modal(game, h('h3', null, 'Наковальня мастера'),
    h('p', { class: 'note' }, 'Горячий металл: бесплатная заточка, два уровня сразу.'),
    h('div', { class: 'btns' },
      h('button', { class: 'btn', onclick: () => choose('pick') }, icon('pick'), 'Кирка +2'),
      h('button', { class: 'btn', onclick: () => choose('sword') }, icon('sword'), 'Меч +2')),
    h('button', { class: 'btn ghost', onclick: () => game.closeModal() }, 'Потом'));
}

// ---------------- Пауза, гибель ----------------

export function showDeath(game: Game): void {
  const run = game.run!;
  const keep = Math.round(evacKeep(game.meta) * 100);
  modal(game,
    h('h3', { class: 'bad' }, 'Гном без сил'),
    h('p', { class: 'note' }, `Спасатели вытащат ${heroDef(run.hero).name} наверх, но сохранится только ${keep}% добычи.`),
    h('div', { class: 'btns' },
      !run.revived ? h('button', { class: 'btn ad', onclick: () => game.revive() }, icon('ad'), 'Второе дыхание: встать с половиной здоровья') : null,
      h('button', { class: 'btn ghost', onclick: () => { game.closeModal(); game.endRun('evac'); } }, `Эвакуироваться (${keep}%)`)));
}

export function showPause(game: Game): void {
  const run = game.run!;
  const keep = Math.round(evacKeep(game.meta) * 100);
  const owned = ITEMS.filter((d) => stack(run, d.id) > 0);
  modal(game,
    h('h3', null, 'Пауза'),
    h('div', { class: 'grid', style: 'grid-template-columns:1fr' },
      h('button', { class: 'btn', onclick: () => game.closeModal() }, 'Продолжить'),
      owned.length ? h('details', null, h('summary', null, `Предметы (${owned.length})`),
        h('div', { class: 'belt' }, ...owned.map((d) => itemCard(d.id, [], undefined, stack(run, d.id))))) : null,
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
