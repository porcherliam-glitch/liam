"""Step 6: honesty checks for the final gold rule.
 a) long vs short trades (is it just 'gold went up'?), per period
 b) bootstrap confidence interval for the average R per trade + probability that the edge is <= 0
 c) walk-forward: each year pick the best grid setting from ALL previous years and trade it for one year,
    compared with the fixed default. This estimates what the *selection procedure* is worth.
 d) days with an early market close (US holidays): how many trades, what result
"""
import os, sys, itertools, warnings
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, pandas as pd, backtester as bt
warnings.filterwarnings("ignore")
days, g, gap = bt.load(os.environ.get("XAU_DATA", "data/xau_m1_de.pkl"))
f = bt.daily_features(days, g)
E, X = bt.hm(13, 15), bt.hm(22, 45)
atr = f.atr14.values; vr = atr / f.tr.rolling(100).mean().shift(1).values
entry = g["o"][:, E]; o00, _, _ = bt.window(g, 0, E); mom = (entry - o00) / atr
cost = 0.35 + 0.00005 * entry; yrs = days.year

def run(mth=0.4, vth=1.0, slk=0.75):
    d = np.where((abs(mom) > mth) & (vr <= vth), np.sign(mom), 0)
    _, r = bt.simulate2(g, E, X, np.nan_to_num(d), slk * atr, slk * atr * 99, cost)
    return r, d

r, d = run()
ok = np.isfinite(r)
print("== a) long vs short")
for per, m in (("2009-2019", yrs < 2020), ("2020-2026", yrs >= 2020), ("all", yrs > 0)):
    for side, s in (("long", d > 0), ("short", d < 0)):
        x = r[ok & m & s]; print(f"{per} {side:5s}: n={len(x):3d} avgR={x.mean():+.3f} sumR={x.sum():+6.1f} win={np.mean(x > 0)*100:.0f}%")
gold_ret = (g["c"][:, X - 1] - entry)
print("buy-and-hold 13:15->22:45 (all days, before costs, in ATR): IS %+.4f OOS %+.4f" %
      (np.nanmean((gold_ret / atr)[yrs < 2020]), np.nanmean((gold_ret / atr)[yrs >= 2020])))

print("\n== b) bootstrap (10,000 resamples of trades)")
rng = np.random.default_rng(1315)
for per, m in (("2009-2019", yrs < 2020), ("2020-2026", yrs >= 2020), ("all", yrs > 0)):
    x = r[ok & m]
    bs = rng.choice(x, size=(10000, len(x)), replace=True).mean(1)
    print(f"{per}: avgR {x.mean():+.3f}  95% interval [{np.percentile(bs, 2.5):+.3f}, {np.percentile(bs, 97.5):+.3f}]  "
          f"P(edge <= 0) = {np.mean(bs <= 0)*100:.1f}%  t = {x.mean()/x.std()*np.sqrt(len(x)):.2f}")

print("\n== c) walk-forward (grid re-chosen every January from all previous years)")
grid = list(itertools.product([0.3, 0.4, 0.5], [0.9, 1.0, 1.1, 1.2, 99], [0.5, 0.75, 1.0]))
R = {p: run(*p)[0] for p in grid}
rows = []
for Y in range(2012, 2026):
    past = (yrs < Y) & (yrs >= 2009)
    def score(p):
        x = R[p][past & np.isfinite(R[p])]; eq = np.cumsum(x); dd = np.max(np.maximum.accumulate(eq) - eq)
        return x.sum() / max(dd, 1.0)
    best = max(grid, key=score)
    cur = yrs == Y
    wf = R[best][cur & np.isfinite(R[best])].sum()
    fixed = R[(0.4, 1.0, 0.75)][cur & np.isfinite(R[(0.4, 1.0, 0.75)])].sum()
    rows.append(dict(year=Y, chosen=best, walkforward_R=round(wf, 1), fixed_default_R=round(fixed, 1)))
w = pd.DataFrame(rows); print(w.to_string(index=False))
print(f"sum 2012-2025: walk-forward {w.walkforward_R.sum():+.1f} R, fixed default {w.fixed_default_R.sum():+.1f} R; "
      f"walk-forward positive years {(w.walkforward_R > 0).sum()}/{len(w)}")

print("\n== d) early-close days (last bar of the day before 22:30 German time)")
lastbar = np.array([np.max(np.where(np.isfinite(row))[0]) if np.isfinite(row).any() else -1 for row in g["c"]])
early = (lastbar < bt.hm(22, 30)) & (lastbar >= E)
x = r[ok & early]
print(f"early-close days: {early.sum()}, traded on them: {len(x)}, sumR {x.sum():+.1f}, dates: "
      f"{[str(t.date()) for t in days[ok & early]][:20]}")
