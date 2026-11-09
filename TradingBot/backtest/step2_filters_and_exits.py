"""Step 2: filters (day-range position, Asia breakout, volatility regime) and exit management
(break-even, trailing stop) on top of the momentum rule from step 1."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, pandas as pd, backtester as bt, itertools, warnings
warnings.filterwarnings("ignore")
days, g, gap = bt.load(os.environ.get("XAU_DATA", "data/xau_m1_de.pkl"))
f = bt.daily_features(days, g)
E = bt.hm(13, 15); X = bt.hm(22, 45)
entry = g["o"][:, E]; atr = f.atr14.values
o00, dhi, dlo = bt.window(g, 0, E)
_, ahi, alo = bt.window(g, 0, bt.hm(8, 0))      # Asia session
mom = (entry - o00) / atr
pos = (entry - dlo) / (dhi - dlo)                  # 0 = at day low, 1 = at day high
atr100 = f.tr.rolling(100).mean().shift(1).values
cost = 0.35 + 0.00005 * entry
yrs = days.year; IS = (yrs < 2020) & ~gap; OOS = (yrs >= 2020) & ~gap
base = np.where(abs(mom) > 0.4, np.sign(mom), 0)
filters = {
    "none": np.ones(len(days), bool),
    "pos_strong": np.where(base > 0, pos > 0.7, pos < 0.3),
    "asia_break": np.where(base > 0, entry > ahi, entry < alo),
    "vol_up": atr / atr100 > 1.0,
    "vol_down": atr / atr100 <= 1.0,
}
for th in [0.3, 0.4, 0.5]:
    filters[f"mom>{th}"] = abs(mom) > th
rows = []
for (fn, fm), slk, (be, ts, tr) in itertools.product(filters.items(), [0.5, 0.75, 1.0],
        [(None, None, None), (1.0, None, None), (None, 1.0, 1.0), (None, 1.5, 1.0), (1.0, 2.0, 1.5), (None, 2.0, 2.0)]):
    d = np.where(fm, np.sign(mom) if fn.startswith("mom>") else base, 0)
    sl = slk * atr
    _, r = bt.simulate2(g, E, X, np.nan_to_num(d), sl, sl * 99, cost, be, ts, tr)
    a, b = bt.stats(r[IS]), bt.stats(r[OOS])
    rows.append(dict(filt=fn, sl=slk, be=be, trail=f"{ts}/{tr}", **{f"IS_{k}": v for k, v in a.items()}, **{f"OOS_{k}": v for k, v in b.items()}))
res = pd.DataFrame(rows)
pd.set_option("display.width", 250)
cols = ["filt","sl","be","trail","IS_n","IS_win","IS_avgR","IS_pf","IS_maxddR","OOS_n","OOS_win","OOS_avgR","OOS_pf","OOS_maxddR"]
print(res.sort_values("IS_avgR", ascending=False)[cols].head(30).to_string(index=False))
print("\nmedian by filter:"); print(res.groupby("filt")[["IS_avgR","OOS_avgR","IS_pf","OOS_pf"]].median().round(3).to_string())
print("\nmedian by exit mgmt:"); print(res.groupby(["be","trail"], dropna=False)[["IS_avgR","OOS_avgR"]].median().round(3).to_string())
