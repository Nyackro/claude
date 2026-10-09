#!/usr/bin/env python3
"""Грубая модель темпа прогрессии "Недр" для среднего игрока (матожидания, без случайности).

Считает, через сколько часов игрок впервые проходит Разлом каждого пласта.
Нужна для калибровки формул из GDD, а не как точный прогноз: после плейтестов
подставьте реальные значения (время яруса, доля руды, доля эвакуаций).

Запуск: python3 pacing_sim.py
"""

LAYERS = 10
STEPS = 2                       # обычных ярусов перед Разломом
HP0, HP_GROWTH = 1.5, 1.72      # средняя прочность блока: HP0 * HP_GROWTH^(L-1)
V0, V_GROWTH = 3.0, 2.2         # средняя цена блока руды: V0 * V_GROWTH^(L-1)
DESCENT = 20                    # твёрдых блоков на проход яруса сверху вниз
ORE_AVAIL = 22                  # блоков руды на ярусе
OVERHEAD = 0.8                  # блоков породы на подход к 1 блоку руды
FOOD = 0.08                     # еда на ярусе, доля макс. энергии
REFILL, REFILL_PRICE, REFILLS = 0.20, 4.0, 2   # энергетик: +20% энергии, цена 4 руды пласта, 2 на станцию
BUILD_GROWTH = 0.07             # рост билда за ярус (артефакты, заточка)
KIT = 0.10                      # стартовый набор при старте с лифта, за каждый пропущенный пласт (макс. 3)
BOSS_MULT = 1.6                 # Разлом дороже обычного яруса
MIN_STATION, MIN_RUN = 0.3, 1.0
INGOT_RATE = 0.05               # 1 слиток за 20 монет добычи
END_MULT = 0.85                 # смесь подъёмов (100%) и эвакуаций (50%)
NEWBIE_RUNS, NEWBIE_MULT = 10, 3.0   # "Удача новичка": x3 слитков в первых забегах

UPGRADES = {  # здание: (база цены, рост цены, макс. уровень)
    'power':   (20, 1.56, 60),  # Кузница: сила x1.18 за уровень
    'energy':  (10, 1.50, 25),  # Столовая: +12% энергии
    'smelter': (40, 1.75, 20),  # Плавильня: +10% слитков
    'value':   (25, 1.65, 25),  # Геологоразведка: +6% к цене руды
}
GEAR = {3: 40, 4: 150, 6: 1_500, 7: 5_000, 8: 20_000, 10: 80_000}  # снаряжение порога, слитки


def hp(L): return HP0 * HP_GROWTH ** (L - 1)
def ore_value(L): return V0 * V_GROWTH ** (L - 1)
def tier_minutes(eb): return min(2.0, 0.6 + 0.35 * eb)


def stats(meta):
    return dict(power=1.18 ** meta['power'], energy=100 * (1 + 0.12 * meta['energy']),
                ingots=1 + 0.10 * meta['smelter'], value=1 + 0.06 * meta['value'])


def gate(meta):
    """Последний пласт, куда пускает текущее снаряжение."""
    for L in range(2, LAYERS + 1):
        if L in GEAR and not meta.get(f'gear{L}'):
            return L - 1
    return LAYERS


def run(meta, start):
    s = stats(meta)
    energy, coins, haul, minutes, tiers = s['energy'], 0.0, 0.0, MIN_RUN, 0
    build = 1 + KIT * min(3, start - 1)
    bosses = []
    for L in range(start, gate(meta) + 1):
        for step in range(STEPS + 1):
            boss = step == STEPS
            eb = max(1.0, hp(L) / (s['power'] * build))   # энергия на блок
            need = DESCENT * eb * (BOSS_MULT if boss else 1)
            price, bought = REFILL_PRICE * ore_value(L), 0
            while bought < REFILLS and coins >= price and energy < need * 2.2:
                coins -= price
                energy = min(energy + REFILL * s['energy'], s['energy'] * 1.5)
                bought += 1
            if energy < need:
                return haul, minutes, bosses
            energy -= need
            next_eb = max(1.0, hp(L + boss) / (s['power'] * (build + BUILD_GROWTH)))
            per_ore = (1 + OVERHEAD) * eb
            ore = max(0.0, min(ORE_AVAIL, (energy - 0.9 * DESCENT * next_eb) / per_ore))
            energy += FOOD * s['energy'] - ore * per_ore
            gain = ore * ore_value(L) * s['value']
            haul += gain
            coins += gain
            minutes += tier_minutes(eb) + MIN_STATION
            tiers += 1
            build += BUILD_GROWTH
            if boss:
                bosses.append(L)
    return haul, minutes, bosses


def simulate(ad_mult):
    meta = {k: 0 for k in UPGRADES}
    bank = hours = 0.0
    beaten, first, runs = set(), {}, 0
    while LAYERS not in beaten and hours < 200:
        front = min(max(beaten, default=0) + 1, gate(meta))
        best = None
        for start in range(max(1, front - 2), front + 1):   # игрок выбирает лифт
            haul, minutes, bosses = run(meta, start)
            ingots = haul * INGOT_RATE * stats(meta)['ingots'] * END_MULT * ad_mult
            if runs < NEWBIE_RUNS:
                ingots *= NEWBIE_MULT
            key = (any(b not in beaten for b in bosses), ingots / minutes)
            if best is None or key > best[0]:
                best = (key, ingots, minutes, bosses)
        _, ingots, minutes, bosses = best
        hours += minutes / 60
        runs += 1
        bank += ingots
        for b in bosses:
            if b not in beaten:
                beaten.add(b)
                first[b] = hours
        while True:   # покупки на базе
            nxt = max(beaten, default=1) + 1
            cost_gear = GEAR.get(nxt)
            need_gear = cost_gear and not meta.get(f'gear{nxt}') and nxt - 1 in beaten
            if need_gear and bank >= cost_gear:
                bank -= cost_gear
                meta[f'gear{nxt}'] = 1
                continue
            if need_gear and cost_gear <= 5 * ingots:
                break     # копим на снаряжение
            options = [(b * g ** meta[k], k) for k, (b, g, cap) in UPGRADES.items() if meta[k] < cap]
            if not options:
                break
            price, k = min(options)
            if bank < price:
                break
            bank -= price
            meta[k] += 1
    return first


if __name__ == '__main__':
    no_ads, with_ads = simulate(1.0), simulate(1.3)
    print('Пласт  Прочность  Руда  Снаряжение  Разлом пройден, ч (без рекламы / с x2 в 30% забегов)')
    for L in range(1, LAYERS + 1):
        print(f'{L:5d}  {hp(L):9.1f}  {ore_value(L):5.0f}  {GEAR.get(L, "-")!s:>10}'
              f'  {no_ads.get(L, float("nan")):5.1f} / {with_ads.get(L, float("nan")):4.1f}')
