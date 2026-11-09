"""Step 7: untouched data from a second source + pre-registered improvement candidates.

PROTOCOL - written and committed BEFORE the first run of this script. Nothing below may be changed
after seeing results; if something has to change, the change and the reason go into the README.

Data: OANDA XAUUSD 1-minute candles (Hugging Face dataset bunqi/OANDA_XAUUSD_Gold), UTC timestamps,
converted to Europe/Berlin with the IANA time zone database. This is a different data source than
the research data (HistData), so it also tests whether results depend on the data vendor.

Periods:
  P0 "pre"   2006-03-20 .. 2009-03-13   before the research data started  -> never looked at
  P1 "IS"    2009-03-16 .. 2019-12-31   research in-sample, other data source
  P2 "OOS"   2020-01-01 .. 2026-01-09   research out-of-sample, other data source
  P3 "fresh" 2026-01-12 .. today        after the research data ended      -> never looked at

B0  baseline = Gold1315 1.10 rule unchanged (entry 13:15, |move since 00:00| > 0.4 ATR14,
    ATR14/ATR100 <= 1.0, stop 0.75 ATR14, exit 22:45, cost 0.35 USD + 0.005 % of price).
Candidates, all parameters fixed in advance (no tuning):
  C1  hold 24 h: same signal and stop, but exit at the next trading day's 13:15 instead of 22:45.
      Overnight financing (swap) 0.02 % of price per night, both directions (also reported: 0.01 %).
  C2  strength sizing: risk multiplied by min(|move| / 0.4, 2) - a stronger move gets up to twice the risk.
  C3  trend at 13:15 (time-series momentum): position = (sign(20-day change) + sign(60-day change)) / 2,
      prices taken at 13:15, rebalanced once a day at 13:15, no stop; one unit = the lot size of a B0 trade
      (1 R = 0.75 ATR14). Costs: B0 cost per unit of position change, swap 0.02 % per night per unit.
  C4  B0 + C3 together (sum of both daily results).

Score per period: return/maxDD (sum of daily R / largest drawdown in R) and daily Sharpe
(mean / std of daily R * sqrt(252)).
Adoption rule: a candidate replaces or extends B0 only if BOTH scores are better than B0's in at least
3 of the 4 periods (swap 0.02 %), and its sum over P2 + P3 is positive. Otherwise B0 stays unchanged.
"""
import glob
import os
import sys
import warnings

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import pandas as pd
import backtester as bt

warnings.filterwarnings("ignore")

DIR = os.environ.get("OANDA_DATA", "data/oanda")
E, X = bt.hm(13, 15), bt.hm(22, 45)
SWAP = float(os.environ.get("SWAP_PER_NIGHT", "0.0002"))
PERIODS = [("P0 pre 2006-09", "2006-03-20", "2009-03-13"), ("P1 IS 2009-19", "2009-03-16", "2019-12-31"),
           ("P2 OOS 2020-26", "2020-01-01", "2026-01-09"), ("P3 fresh 2026", "2026-01-12", "2099-01-01")]


def load_oanda(path):
    files = sorted(glob.glob(f"{path}/*.parquet"))
    df = pd.concat([pd.read_parquet(p) for p in files], ignore_index=True).drop_duplicates("time").sort_values("time")
    de = pd.to_datetime(df.time, unit="s", utc=True).dt.tz_convert("Europe/Berlin").dt.tz_localize(None)
    out = pd.DataFrame({"de": de.values, "o": df.open.values, "h": df.high.values, "l": df.low.values,
                        "c": df.close.values, "gap": False})
    return out.drop_duplicates("de")


def two_day_grid(g, start):
    """Per day d: minutes from `start` of day d to the end of day d, followed by day d+1 until `start`."""
    out = {}
    for k in "ohlc":
        a = g[k]
        nxt = np.vstack([a[1:, :start], np.full((1, start), np.nan)])
        out[k] = np.hstack([a[:, start:], nxt])
    return out


def series_stats(daily):
    x = np.asarray(daily, float)
    eq = np.cumsum(x)
    dd = np.max(np.maximum.accumulate(eq) - eq) if len(eq) else 0.0
    sd = x.std()
    return dict(sumR=round(x.sum(), 1), maxdd=round(dd, 1), ret_dd=round(x.sum() / dd, 2) if dd > 0 else np.nan,
                sharpe=round(x.mean() / sd * np.sqrt(252), 2) if sd > 0 else np.nan)


def main():
    days, g, _ = bt.load(load_oanda(DIR))
    f = bt.daily_features(days, g)
    atr = f.atr14.values
    vr = atr / f.tr.rolling(100).mean().shift(1).values
    entry = g["o"][:, E]
    o00, _, _ = bt.window(g, 0, E)
    mom = (entry - o00) / atr
    cost = 0.35 + 0.00005 * entry
    sig = np.where((abs(mom) > 0.4) & (vr <= 1.0), np.sign(mom), 0.0)
    sig = np.nan_to_num(sig)
    sl = 0.75 * atr
    nights = np.r_[np.diff(days.values).astype("timedelta64[D]").astype(float), np.nan]

    # B0 baseline
    _, r0 = bt.simulate2(g, E, X, sig, sl, sl * 99, cost)
    # C1 hold until next trading day's 13:15, with swap
    g2 = two_day_grid(g, E)
    _, r1 = bt.simulate2(g2, 0, g2["o"].shape[1], sig, sl, sl * 99, cost + SWAP * entry * np.nan_to_num(nights, nan=1.0))
    # C2 strength sizing
    r2 = r0 * np.minimum(abs(mom) / 0.4, 2.0)
    # C3 trend at 13:15
    p = pd.Series(entry).ffill().values
    s20 = np.sign(p - np.r_[np.full(20, np.nan), p[:-20]])
    s60 = np.sign(p - np.r_[np.full(60, np.nan), p[:-60]])
    pos = np.nan_to_num((s20 + s60) / 2.0)
    move_next = np.r_[p[1:] - p[:-1], np.nan]
    unit = 0.75 * atr
    turnover = np.abs(np.diff(np.r_[0.0, pos]))
    r3 = (pos * move_next - turnover * cost - np.abs(pos) * SWAP * p * np.nan_to_num(nights, nan=1.0)) / unit

    daily = pd.DataFrame({"B0": r0, "C1": r1, "C2": r2, "C3": r3}, index=days)
    daily = daily.where(np.isfinite(daily), 0.0)
    daily["C4"] = daily.B0 + daily.C3

    print(f"OANDA data {days[0].date()} .. {days[-1].date()}, {len(days)} trading days, swap {SWAP*100:.3f} %/night\n")
    rows = []
    for name, a, b in PERIODS:
        m = (days >= a) & (days <= b)
        for cand in daily.columns:
            s = series_stats(daily.loc[m, cand])
            trades = int(np.isfinite({"B0": r0, "C1": r1, "C2": r2}[cand][m]).sum()) if cand in ("B0", "C1", "C2") else np.nan
            rows.append(dict(period=name, cand=cand, trades=trades, **s))
        x = r0[m & np.isfinite(r0)]
        if len(x):
            print(f"{name}: B0 trades {len(x)}, win {np.mean(x > 0)*100:.0f} %, avgR {x.mean():+.3f}, "
                  f"profit factor {x[x > 0].sum() / -x[x < 0].sum():.2f}")
    res = pd.DataFrame(rows)
    pd.set_option("display.width", 200)
    print("\n" + res.pivot(index="cand", columns="period", values="sumR").to_string())
    print("\nreturn / maxDD:\n" + res.pivot(index="cand", columns="period", values="ret_dd").to_string())
    print("\ndaily Sharpe:\n" + res.pivot(index="cand", columns="period", values="sharpe").to_string())

    print("\nAdoption rule (both scores better than B0 in >= 3 of 4 periods, P2+P3 positive):")
    base = res[res.cand == "B0"].set_index("period")
    for cand in ["C1", "C2", "C3", "C4"]:
        c = res[res.cand == cand].set_index("period")
        better = ((c.ret_dd > base.ret_dd) & (c.sharpe > base.sharpe)).sum()
        late = daily.loc[days >= "2020-01-01", cand].sum()
        verdict = "ADOPT" if better >= 3 and late > 0 else "reject"
        print(f"  {cand}: better in {better} of 4 periods, P2+P3 sum {late:+.1f} R -> {verdict}")

    # untouched periods P0 + P3 together: how sure is the baseline edge there?
    m = ((days <= "2009-03-13") | (days >= "2026-01-12")) & np.isfinite(r0)
    x = r0[m]
    bs = np.random.default_rng(1315).choice(x, size=(10000, len(x))).mean(1)
    print(f"\nB0 on untouched data (P0 + P3): {len(x)} trades, avgR {x.mean():+.3f}, "
          f"95 % interval [{np.percentile(bs, 2.5):+.3f}, {np.percentile(bs, 97.5):+.3f}], P(edge <= 0) {np.mean(bs <= 0)*100:.0f} %")
    print("correlation of daily results B0 vs C3:", round(np.corrcoef(daily.B0, daily.C3)[0, 1], 3))
    out = os.environ.get("STEP7_CSV")
    if out:
        daily.to_csv(out)


if __name__ == "__main__":
    main()
