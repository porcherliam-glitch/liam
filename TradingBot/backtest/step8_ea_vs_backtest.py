"""Step 8: does the EA as written trade like the research backtest?

Runs the Python port of Gold1315.mq5 1.20 (ea_simulator.py) on OANDA M1 data 2006-2026 against a
simulated MT5 broker in server time, and compares every day with the vectorised research backtest
on German-time candles (same data, same rule).

Scenarios:
  A  usual broker (server = New York + 7 h) with the EA default settings (GMT+2, US summer time)
  B  broker on UTC, but the EA left on its defaults (wrong time zone setting)
  C  broker on UTC with the matching settings (GMT+0, no summer time)
"""
import glob
import os
import sys
import warnings

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import pandas as pd
import backtester as bt
import ea_simulator as ea
import step7_fresh_data_and_candidates as s7

warnings.filterwarnings("ignore")
DIR = os.environ.get("OANDA_DATA", "data/oanda")


def research_signals():
    days, g, _ = bt.load(s7.load_oanda(DIR))
    f = bt.daily_features(days, g)
    atr = f.atr14.values
    vr = atr / f.tr.rolling(100).mean().shift(1).values
    E, X = bt.hm(13, 15), bt.hm(22, 45)
    entry = g["o"][:, E]
    o00, _, _ = bt.window(g, 0, E)
    mom = (entry - o00) / atr
    sig = np.nan_to_num(np.where((abs(mom) > 0.4) & (vr <= 1.0), np.sign(mom), 0.0))
    _, r = bt.simulate2(g, E, X, sig, 0.75 * atr, 0.75 * atr * 99, 0.35 + 0.00005 * entry)
    return pd.DataFrame({"sig": sig, "R": r, "move": mom}, index=days)


def compare(name, trades, decisions, ref):
    sim_dir = pd.Series({pd.Timestamp(d, unit="s"): v for d, v, _ in decisions}, dtype=float)
    joined = ref.join(sim_dir.rename("sim"), how="left").fillna({"sim": 0.0})
    traded = (joined.sig != 0) | (joined.sim != 0)
    same = (joined.sig == joined.sim) & traded
    t = trades.set_index("day")
    both = joined.index[(joined.sig != 0) & (joined.sig == joined.sim)].intersection(t.index)
    print(f"\n== {name}")
    print(f"days with a signal (research or EA): {traded.sum()}, same direction: {same.sum()} "
          f"({same.sum() / traded.sum() * 100:.1f} %), only research: {((joined.sig != 0) & (joined.sim == 0)).sum()}, "
          f"only EA: {((joined.sig == 0) & (joined.sim != 0)).sum()}, opposite: {((joined.sig * joined.sim) < 0).sum()}")
    if len(both):
        a, b = joined.loc[both, "R"].values, t.loc[both, "R"].values
        ok = np.isfinite(a) & np.isfinite(b)
        print(f"trades on the same days: {len(both)}, correlation of R {np.corrcoef(a[ok], b[ok])[0, 1]:.3f}, "
              f"mean |difference| {np.mean(np.abs(a[ok] - b[ok])):.3f} R")
    print(f"EA trades {len(trades)}, sum R {trades.R.sum():+.1f}, avg R {trades.R.mean():+.3f}, "
          f"research trades {int((ref.sig != 0).sum())}, sum R {np.nansum(ref.R):+.1f}")
    if len(trades):
        eq = trades.equity.values
        peak = np.maximum.accumulate(np.r_[10_000.0, eq])[1:]
        years = (trades.day.iloc[-1] - trades.day.iloc[0]).days / 365.25
        print(f"account 10,000 -> {eq[-1]:,.0f} USD ({((eq[-1] / 1e4) ** (1 / years) - 1) * 100:+.2f} %/year), "
              f"max drawdown {((1 - eq / peak).max()) * 100:.1f} %, exits: {trades.reason.value_counts().to_dict()}, "
              f"average size factor {trades.factor.mean():.2f}")
    return joined, trades


def main():
    raw = pd.concat([pd.read_parquet(p) for p in sorted(glob.glob(f"{DIR}/*.parquet"))], ignore_index=True)
    raw = raw.drop_duplicates("time").sort_values("time")
    ref = research_signals()
    out = {}
    for name, server, inputs in [("A usual broker, default settings", "US", ea.Inputs()),
                                 ("B UTC broker, settings left on default (WRONG)", "UTC", ea.Inputs()),
                                 ("C UTC broker, matching settings", "UTC", ea.Inputs(gmt_winter=0, dst_rule=ea.DST_NONE))]:
        sim = ea.Simulator(*ea.server_bars_from_utc(raw, server), inp=inputs)
        trades, decisions = sim.run()
        out[name] = compare(name, trades, decisions, ref)
    csv = os.environ.get("STEP8_CSV")
    if csv:
        out["A usual broker, default settings"][1].to_csv(csv, index=False)


if __name__ == "__main__":
    main()
