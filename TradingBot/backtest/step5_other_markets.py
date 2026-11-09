"""Step 5: out-of-market test. The FINAL Gold1315 rule (no re-tuning) on 23 other HistData markets.

Pre-registered protocol (written before looking at any result):
  * identical parameters: entry 13:15, exit 22:45, |move since 00:00| > 0.4 ATR14, ATR14/ATR100 <= 1.0,
    stop 0.75 ATR14, no take profit, German time
  * cost per trade = typical retail spread + commission + slippage per market (COST below)
  * a market joins the portfolio only if its 2009-2019 result is positive (avgR > 0, >= 50 trades);
    the portfolio is then judged on 2020-2025 only.
Data: Hugging Face dataset vessel888/histdata_fx_1m (timestamps = HistData + 5h -> undone here).
"""
import os, sys, glob, warnings
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, pandas as pd
import backtester as bt, prepare_data as prep
warnings.filterwarnings("ignore")

DIR = os.environ.get("MULTI_DATA", "data/multi")
# all-in cost per trade in price units (spread + commission + slippage, typical retail ECN account)
COST = {"xauusd": 0.45, "eurusd": 0.00008, "gbpusd": 0.00012, "usdjpy": 0.010, "audusd": 0.00010,
        "usdcad": 0.00015, "usdchf": 0.00015, "nzdusd": 0.00015, "eurjpy": 0.015, "gbpjpy": 0.025,
        "eurgbp": 0.00012, "xagusd": 0.03, "wtiusd": 0.04, "bcousd": 0.04, "spxusd": 0.6, "nsxusd": 2.0,
        "grxeur": 1.5, "ukxgbp": 1.5, "frxeur": 1.5, "etxeur": 2.0, "jpxjpy": 10.0, "udxusd": 0.03,
        "auxaud": 2.0, "hkxhkd": 10.0}
E, X = bt.hm(13, 15), bt.hm(22, 45)


def load_symbol(sym, conv):
    raw = pd.read_parquet(f"{DIR}/{sym}.parquet")
    ts = raw.ts.dt.tz_localize(None) - pd.Timedelta(hours=5)      # undo the fixed +5h -> HistData wall clock
    de, gap = prep.to_german(ts, conv)
    df = pd.DataFrame({"de": de.values, "o": raw.open.values, "h": raw.high.values, "l": raw.low.values,
                       "c": raw.close.values, "gap": gap.values}).sort_values("de").drop_duplicates("de")
    return bt.load(df)


def gold1315(days, g, cost, cost_mult=1.0):
    f = bt.daily_features(days, g)
    atr = f.atr14.values
    vr = atr / f.tr.rolling(100).mean().shift(1).values
    entry = g["o"][:, E]
    o00, _, _ = bt.window(g, 0, E)
    mom = (entry - o00) / atr
    d = np.where((abs(mom) > 0.4) & (vr <= 1.0), np.sign(mom), 0)
    _, r = bt.simulate2(g, E, X, np.nan_to_num(d), 0.75 * atr, 0.75 * atr * 99, np.full(len(days), cost * cost_mult))
    return r


if __name__ == "__main__":
    gold = pd.read_parquet(f"{DIR}/xauusd.parquet")
    gts = gold.ts.dt.tz_localize(None) - pd.Timedelta(hours=5)
    conv = prep.detect_conventions(gts, gold.high - gold.low, verbose=False)
    eur = pd.read_parquet(f"{DIR}/eurusd.parquet")
    conv_eur = prep.detect_conventions(eur.ts.dt.tz_localize(None) - pd.Timedelta(hours=5), eur.high - eur.low, verbose=False)
    same = [k for k in conv if k in conv_eur and conv[k] == conv_eur[k]]
    print(f"DST-gap convention gold vs EURUSD agrees in {len(same)} of {len([k for k in conv if k in conv_eur])} gaps")

    rows, daily = [], {}
    for sym in COST:
        days, g, gap = load_symbol(sym, conv)
        out = {"market": sym}
        for cm in (1.0, 2.0):
            r = gold1315(days, g, COST[sym], cm)
            ok = np.isfinite(r) & ~gap
            yrs = days.year
            for name, m in (("IS", ok & (yrs < 2020)), ("OOS", ok & (yrs >= 2020))):
                s = bt.stats(r[m])
                key = name if cm == 1.0 else name + "_x2cost"
                out[f"{key}_n"], out[f"{key}_avgR"], out[f"{key}_pf"] = s.get("n", 0), s.get("avgR", np.nan), s.get("pf", np.nan)
            if cm == 1.0:
                daily[sym] = pd.Series(np.where(ok, r, 0.0), index=days)
        out["from"] = str(days[0].date())
        rows.append(out)
        print(f"{sym}: IS n={out['IS_n']} avgR={out['IS_avgR']} pf={out['IS_pf']} | OOS n={out['OOS_n']} avgR={out['OOS_avgR']} pf={out['OOS_pf']}", flush=True)
    res = pd.DataFrame(rows)
    pd.set_option("display.width", 250)
    print("\n" + res[["market", "from", "IS_n", "IS_avgR", "IS_pf", "OOS_n", "OOS_avgR", "OOS_pf", "IS_x2cost_avgR", "OOS_x2cost_avgR"]].to_string(index=False))
    print(f"\nmarkets positive IS: {(res.IS_avgR > 0).sum()}/{len(res)}, OOS: {(res.OOS_avgR > 0).sum()}/{len(res)}")
    both = res[(res.IS_avgR > 0)]
    print(f"of the IS-positive markets, OOS positive: {(both.OOS_avgR > 0).sum()}/{len(both)}")

    # pre-registered portfolio: markets with IS avgR > 0 and >= 50 IS trades, judged on 2020+ only
    sel = res[(res.IS_avgR > 0) & (res.IS_n >= 50)].market.tolist()
    P = pd.DataFrame(daily).fillna(0.0)
    for name, cols in (("gold only", ["xauusd"]), ("IS-selected portfolio", sel), ("all 24 markets", list(COST))):
        port = P[cols].sum(axis=1)
        for per, m in (("2009-2019", P.index.year < 2020), ("2020-2025", P.index.year >= 2020)):
            x = port[m]; tr = (P.loc[m, cols] != 0).sum().sum()
            eq = x.cumsum(); dd = (eq.cummax() - eq).max()
            yrs = (x.index[-1] - x.index[0]).days / 365.25
            print(f"{name:22s} {per}: trades {tr:5d}  sumR {x.sum():7.1f}  R/year {x.sum()/yrs:6.1f}  maxDD {dd:5.1f}R  "
                  f"return/DD {x.sum()/dd if dd > 0 else np.nan:5.2f}  daily-Sharpe {x.mean()/x.std()*np.sqrt(252):5.2f}")
    print("selected:", sel)
    res.to_csv(os.environ.get("MULTI_CSV", "other_markets.csv"), index=False)
