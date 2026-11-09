"""Load HistData XAUUSD M1, detect per-gap DST convention, convert to German time (Europe/Berlin)."""
import glob, sys
import numpy as np, pandas as pd
from datetime import datetime, timedelta

D = sys.argv[1]
frames = []
for f in sorted(glob.glob(f"{D}/XAU_*.csv")):
    frames.append(pd.read_csv(f, header=None, names="d t o h l c v".split(),
                              dtype={"d": str, "t": str}))
df = pd.concat(frames, ignore_index=True)
df["ts"] = pd.to_datetime(df.d + " " + df.t, format="%Y.%m.%d %H:%M")
df = df.drop(columns=["d", "t", "v"]).drop_duplicates("ts").sort_values("ts").reset_index(drop=True)

def nth_sunday(y, m, n):
    d = datetime(y, m, 1)
    d += timedelta(days=(6 - d.weekday()) % 7)
    return d + timedelta(weeks=n - 1)

def last_sunday(y, m):
    d = datetime(y, m + 1, 1) - timedelta(days=1)
    return d - timedelta(days=(d.weekday() - 6) % 7)

# Gap periods (calendar dates) where US and EU DST differ
gaps = []
for y in range(2009, 2027):
    us_start, us_end = nth_sunday(y, 3, 2), nth_sunday(y, 11, 1)
    eu_start, eu_end = last_sunday(y, 3), last_sunday(y, 10)
    gaps.append((y, "spring", us_start, eu_start))
    gaps.append((y, "autumn", eu_end, us_end))

df["date"] = df.ts.dt.normalize()
df["rng"] = df.h - df.l
hm = df.ts.dt.hour * 100 + df.ts.dt.minute
conv = {}  # (y, season) -> "NY" or "DE6"
for y, season, a, b in gaps:
    m = (df.ts >= a) & (df.ts < b) & (df.ts.dt.weekday < 5)
    if m.sum() == 0:
        continue
    r730 = df.loc[m & (hm == 730), "rng"].mean()
    r830 = df.loc[m & (hm == 830), "rng"].mean()
    conv[(y, season)] = "NY" if r830 > r730 else "DE6"
    print(y, season, a.date(), b.date(), f"07:30={r730:.2f} 08:30={r830:.2f} ->", conv[(y, season)])

# Default: data = German - 6h. Inside a gap whose convention is NY: German = data + 5h.
de = df.ts + pd.Timedelta(hours=6)
for y, season, a, b in gaps:
    if conv.get((y, season)) == "NY":
        m = (df.ts >= a) & (df.ts < b)
        de[m] = df.ts[m] + pd.Timedelta(hours=5)
df["de"] = de
gap = pd.Series(False, index=df.index)
for y, season, a, b in gaps:
    gap |= (df.ts >= a - pd.Timedelta(days=1)) & (df.ts < b + pd.Timedelta(days=1))
df["gap"] = gap
out = df[["de", "o", "h", "l", "c", "gap"]].sort_values("de").drop_duplicates("de")
out.to_pickle(f"{D}/xau_m1_de.pkl")
print(len(out), out.de.min(), out.de.max())
