"""Load HistData XAUUSD M1, detect per-gap DST convention, convert to German time (Europe/Berlin).

HistData timestamps are New York wall clock (= German time - 6h). Only in the weeks where the US and
the EU switch daylight saving time on different dates the files follow the US rule in some years and
the EU rule in others. The convention of each such gap is detected from the US 08:30 data releases
(NFP, CPI): the biggest one-minute candles appear at 08:30 (US rule) or at 07:30 (EU rule).
"""
import glob, sys
import numpy as np, pandas as pd
from datetime import datetime, timedelta


def nth_sunday(y, m, n):
    d = datetime(y, m, 1)
    d += timedelta(days=(6 - d.weekday()) % 7)
    return d + timedelta(weeks=n - 1)


def last_sunday(y, m):
    d = datetime(y, m + 1, 1) - timedelta(days=1)
    return d - timedelta(days=(d.weekday() - 6) % 7)


def gap_periods(first_year=2000, last_year=2026):
    """Calendar periods where US and EU daylight saving time differ: (year, season, start, end)."""
    gaps = []
    for y in range(first_year, last_year + 1):
        gaps.append((y, "spring", nth_sunday(y, 3, 2), last_sunday(y, 3)))
        gaps.append((y, "autumn", last_sunday(y, 10), nth_sunday(y, 11, 1)))
    return gaps


def detect_conventions(ts, rng, verbose=True):
    """ts: naive HistData timestamps (New York wall clock), rng: high-low per bar. -> {(year, season): 'NY'|'DE6'}"""
    ts = pd.Series(pd.to_datetime(ts)).reset_index(drop=True)
    rng = pd.Series(np.asarray(rng, float))
    hm = ts.dt.hour * 100 + ts.dt.minute
    conv = {}
    for y, season, a, b in gap_periods(int(ts.dt.year.min()), int(ts.dt.year.max())):
        m = (ts >= a) & (ts < b) & (ts.dt.weekday < 5)
        if m.sum() == 0:
            continue
        r730 = rng[m & (hm == 730)].mean()
        r830 = rng[m & (hm == 830)].mean()
        conv[(y, season)] = "NY" if r830 > r730 else "DE6"
        if verbose:
            print(y, season, a.date(), b.date(), f"07:30={r730:.5g} 08:30={r830:.5g} ->", conv[(y, season)])
    return conv


def to_german(ts, conv):
    """Convert naive HistData timestamps to German wall clock; returns (german_ts, in_gap_flag)."""
    ts = pd.Series(pd.to_datetime(ts)).reset_index(drop=True)
    de = ts + pd.Timedelta(hours=6)
    gap = pd.Series(False, index=ts.index)
    for y, season, a, b in gap_periods(int(ts.dt.year.min()), int(ts.dt.year.max())):
        m = (ts >= a) & (ts < b)
        if conv.get((y, season)) == "NY":
            de[m] = ts[m] + pd.Timedelta(hours=5)
        gap |= (ts >= a - pd.Timedelta(days=1)) & (ts < b + pd.Timedelta(days=1))
    return de, gap


def main(D):
    frames = []
    for f in sorted(glob.glob(f"{D}/XAU_*.csv")):
        frames.append(pd.read_csv(f, header=None, names="d t o h l c v".split(), dtype={"d": str, "t": str}))
    df = pd.concat(frames, ignore_index=True)
    df["ts"] = pd.to_datetime(df.d + " " + df.t, format="%Y.%m.%d %H:%M")
    df = df.drop(columns=["d", "t", "v"]).drop_duplicates("ts").sort_values("ts").reset_index(drop=True)
    conv = detect_conventions(df.ts, df.h - df.l)
    df["de"], df["gap"] = to_german(df.ts, conv)
    out = df[["de", "o", "h", "l", "c", "gap"]].sort_values("de").drop_duplicates("de")
    out.to_pickle(f"{D}/xau_m1_de.pkl")
    print(len(out), out.de.min(), out.de.max())


if __name__ == "__main__":
    main(sys.argv[1])
