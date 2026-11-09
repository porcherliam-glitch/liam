"""Step 1: which direction rule at 13:15 works? Grid over rule x stop x take-profit x exit time.
Selection data: 2009-2019 (in-sample). 2020-2026 (out-of-sample) is only reported."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, pandas as pd, backtester as bt, itertools
days, g, gap = bt.load(os.environ.get("XAU_DATA", "data/xau_m1_de.pkl"))
f = bt.daily_features(days, g)
E = bt.hm(13, 15)
entry = g["o"][:, E]
atr = f.atr14.values
o00, _, _ = bt.window(g, 0, E)
o08, mh, ml = bt.window(g, bt.hm(8, 0), E)
mom = (entry - o00) / atr            # move since 00:00 in ATR
trend20 = np.sign(f.prevclose.values - f.sma20.values)
trend50 = np.sign(f.prevclose.values - f.sma50.values)
cost = 0.35 + 0.00005 * entry
yrs = days.year
IS = (yrs < 2020) & ~gap
OOS = (yrs >= 2020) & ~gap

rules = {
    "long": np.ones(len(days)),
    "mom_day": np.sign(mom),
    "rev_day": -np.sign(mom),
    "mom_ldn": np.sign(entry - o08),
    "trend20": trend20,
    "trend50": trend50,
    "mom_and_t20": np.where(np.sign(mom) == trend20, trend20, 0),
    "mom_and_t50": np.where(np.sign(mom) == trend50, trend50, 0),
}
for th in [0.2, 0.4, 0.6]:
    rules[f"mom_day>{th}"] = np.where(abs(mom) > th, np.sign(mom), 0)
    rules[f"mom_t50>{th}"] = np.where((abs(mom) > th) & (np.sign(mom) == trend50), trend50, 0)

rows = []
for (rn, d), slk, tpm, xh in itertools.product(rules.items(), [0.25, 0.5, 0.75, 1.0], [1, 1.5, 2, 3, 99], [16, 18, 20, 22.75]):
    xm = int(xh * 60)
    sl = slk * atr
    _, r, _ = bt.simulate(g, E, xm, np.nan_to_num(d), sl, sl * tpm, cost)
    a, b = bt.stats(r[IS]), bt.stats(r[OOS])
    rows.append(dict(rule=rn, sl=slk, tp=tpm, exit=xh, **{f"IS_{k}": v for k, v in a.items()}, **{f"OOS_{k}": v for k, v in b.items()}))
res = pd.DataFrame(rows)
pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30)
cols = ["rule","sl","tp","exit","IS_n","IS_win","IS_avgR","IS_pf","IS_sharpe","IS_maxddR","OOS_n","OOS_win","OOS_avgR","OOS_pf","OOS_sharpe","OOS_maxddR"]
print("TOP 25 by IS sharpe (min 400 trades IS):")
top = res[res.IS_n >= 400].sort_values("IS_sharpe", ascending=False)
print(top[cols].head(25).to_string(index=False))
print("\nIS-sharpe vs OOS-sharpe correlation across all configs:", round(res[["IS_sharpe","OOS_sharpe"]].corr().iloc[0,1],3))
print("\nPer rule: median IS / OOS sharpe across exit grid")
print(res.groupby("rule")[["IS_sharpe","OOS_sharpe"]].median().sort_values("IS_sharpe", ascending=False).round(2).to_string())
