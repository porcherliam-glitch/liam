"""Step 3: neighbourhood check: momentum threshold x volatility filter x stop distance.
A rule is only trusted if its neighbours are positive too."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, pandas as pd, backtester as bt, itertools, warnings
warnings.filterwarnings("ignore")
days, g, gap = bt.load(os.environ.get("XAU_DATA", "data/xau_m1_de.pkl"))
f = bt.daily_features(days, g)
atr = f.atr14.values; atr100 = f.tr.rolling(100).mean().shift(1).values; vr = atr / atr100
yrs = days.year; IS = (yrs < 2020) & ~gap; OOS = (yrs >= 2020) & ~gap
def run(E=bt.hm(13,15), X=bt.hm(22,45), mth=0.4, vth=1.0, slk=0.75, cmul=1.0, mask=None):
    entry = g["o"][:, E]
    o00, _, _ = bt.window(g, 0, E)
    mom = (entry - o00) / atr
    d = np.where((abs(mom) > mth) & (vr <= vth), np.sign(mom), 0)
    cost = cmul * (0.35 + 0.00005 * entry)
    _, r = bt.simulate2(g, E, X, np.nan_to_num(d), slk * atr, slk * atr * 99, cost)
    return r
print("== grid momentum x vol-ratio x SL (avgR IS | OOS)")
rows=[]
for mth, vth, slk in itertools.product([0.3,0.4,0.5],[0.9,1.0,1.1,1.2],[0.5,0.75,1.0]):
    r = run(mth=mth, vth=vth, slk=slk); a=bt.stats(r[IS]); b=bt.stats(r[OOS])
    rows.append(dict(mom=mth, vol=vth, sl=slk, IS_n=a["n"], IS_avgR=a["avgR"], IS_pf=a["pf"], IS_dd=a["maxddR"], IS_ret_dd=round(a["sumR"]/a["maxddR"],2),
                     OOS_n=b["n"], OOS_avgR=b["avgR"], OOS_pf=b["pf"], OOS_dd=b["maxddR"]))
res=pd.DataFrame(rows); pd.set_option("display.width",250)
print(res.to_string(index=False))
print("share of 36 configs positive: IS", (res.IS_avgR>0).mean().round(2), " OOS", (res.OOS_avgR>0).mean().round(2))
best = res.sort_values("IS_ret_dd", ascending=False).iloc[0]; print("\nIS-selected (by sumR/maxDD):", best.to_dict())
