"""Step 4: final rule (momentum > 0.4 ATR, ATR14/ATR100 <= 1.0, stop 0.75 ATR, exit 22:45):
per-year results, cost and timing sensitivity, equity curve with 1% risk per trade."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, pandas as pd, backtester as bt, warnings
warnings.filterwarnings("ignore")
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "step3_robustness.py")).read().split('print("== grid')[0])
r = run()
valid = np.isfinite(r) & ~gap
print("== per year (default: mom>0.4, vol<=1.0, SL 0.75 ATR, exit 22:45)")
t = pd.DataFrame({"y": yrs[valid], "r": r[valid]}).groupby("y").r.agg(["count", "sum", "mean"]).round(2)
t["win%"] = pd.DataFrame({"y": yrs[valid], "w": r[valid] > 0}).groupby("y").w.mean().mul(100).round(0)
print(t.to_string()); print("positive years:", (t["sum"] > 0).sum(), "of", len(t))
print("\n== sensitivity (all years excl. gap weeks)")
for name, kw in [("default", {}), ("cost x2", dict(cmul=2)), ("cost x3", dict(cmul=3)), ("entry 13:00", dict(E=bt.hm(13,0))),
                 ("entry 13:30", dict(E=bt.hm(13,30))), ("entry 12:15", dict(E=bt.hm(12,15))), ("entry 14:15", dict(E=bt.hm(14,15))),
                 ("exit 20:00", dict(X=bt.hm(20,0))), ("exit 21:30", dict(X=bt.hm(21,30)))]:
    rr = run(**kw); s = bt.stats(rr[~gap]); print(f"{name:12s}", s)
print("\n== money curve, 1% risk per trade compounded, all days incl. gap weeks")
rr = run(); m = np.isfinite(rr)
eq = np.cumprod(1 + 0.01 * rr[m]); peak = np.maximum.accumulate(eq)
print("trades", m.sum(), "final x", eq[-1].round(2), "maxDD %", ((1 - eq / peak).max() * 100).round(1),
      "CAGR %", ((eq[-1] ** (1 / ((days[m][-1] - days[m][0]).days / 365.25)) - 1) * 100).round(1))
# longest losing streak
l = (rr[m] < 0).astype(int); best = cur = 0
for v in l: cur = cur + 1 if v else 0; best = max(best, cur)
print("longest losing streak:", best, " long/short trades:", int((np.sign((g['o'][:, bt.hm(13,15)] - bt.window(g,0,bt.hm(13,15))[0]))[m] > 0).sum()), "/", int(m.sum() - (np.sign((g['o'][:, bt.hm(13,15)] - bt.window(g,0,bt.hm(13,15))[0]))[m] > 0).sum()))
pd.DataFrame({"day": days[m], "R": rr[m], "equity_1pct": eq}).to_csv(os.environ.get("XAU_EQUITY_CSV", "equity.csv"), index=False)
