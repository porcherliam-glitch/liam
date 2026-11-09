"""Vectorised day-by-day backtester: one decision per day at a fixed German entry time."""
import numpy as np, pandas as pd

MIN_PER_DAY = 23 * 60  # trading day 00:00-22:59 German time

def load(path):
    df = pd.read_pickle(path)
    df["day"] = df.de.dt.normalize()
    df["mi"] = df.de.dt.hour * 60 + df.de.dt.minute
    df = df[(df.mi < MIN_PER_DAY) & (df.de.dt.weekday < 5)]
    days = np.sort(df.day.unique())
    di = np.searchsorted(days, df.day.values)
    shape = (len(days), MIN_PER_DAY)
    grid = {}
    for k in "ohlc":
        a = np.full(shape, np.nan); a[di, df.mi.values] = df[k].values; grid[k] = a
    gap = np.zeros(len(days), bool); gap[di[df.gap.values]] = True
    return pd.DatetimeIndex(days), grid, gap

def hm(h, m): return h * 60 + m

def daily_features(days, g):
    o, h, l, c = g["o"], g["h"], g["l"], g["c"]
    dh, dl = np.nanmax(h, 1), np.nanmin(l, 1)
    # last valid close of each day
    lastc = pd.DataFrame(c).ffill(axis=1).iloc[:, -1].values
    firsto = pd.DataFrame(o).bfill(axis=1).iloc[:, 0].values
    prevc = np.r_[np.nan, lastc[:-1]]
    tr = np.maximum(dh - dl, np.maximum(abs(dh - prevc), abs(dl - prevc)))
    f = pd.DataFrame({"open": firsto, "high": dh, "low": dl, "close": lastc, "tr": tr}, index=days)
    # indicators known BEFORE the current day (shifted by one day)
    f["atr14"] = f.tr.rolling(14).mean().shift(1)
    f["sma20"] = f.close.rolling(20).mean().shift(1)
    f["sma50"] = f.close.rolling(50).mean().shift(1)
    f["prevclose"] = f.close.shift(1)
    return f

def window(g, a, b):
    """high/low/open over minutes [a, b)"""
    hi = np.nanmax(g["h"][:, a:b], 1); lo = np.nanmin(g["l"][:, a:b], 1)
    op = pd.DataFrame(g["o"][:, a:b]).bfill(axis=1).iloc[:, 0].values
    return op, hi, lo

def simulate(g, entry_min, exit_min, direction, sl_dist, tp_dist, cost):
    """direction: +1/-1/0 per day. sl/tp in price distance (tp may be inf). Returns pnl in price and R."""
    n = len(direction)
    entry = g["o"][:, entry_min]
    H = g["h"][:, entry_min:exit_min]; L = g["l"][:, entry_min:exit_min]; C = g["c"][:, entry_min:exit_min]
    last = pd.DataFrame(C).ffill(axis=1).iloc[:, -1].values
    d = direction.astype(float)
    # adverse / favourable excursions per bar, relative to entry in trade direction
    fav = np.where(d[:, None] > 0, H - entry[:, None], entry[:, None] - L)
    adv = np.where(d[:, None] > 0, entry[:, None] - L, H - entry[:, None])
    fav = np.nan_to_num(fav, nan=-np.inf); adv = np.nan_to_num(adv, nan=-np.inf)
    sl_hit = adv >= sl_dist[:, None]; tp_hit = fav >= tp_dist[:, None]
    big = H.shape[1] + 1
    i_sl = np.where(sl_hit.any(1), sl_hit.argmax(1), big)
    i_tp = np.where(tp_hit.any(1), tp_hit.argmax(1), big)
    pnl = (last - entry) * d                       # time exit
    pnl = np.where(i_tp < big, tp_dist, pnl)       # TP first ...
    pnl = np.where(i_sl <= i_tp, np.where(i_sl < big, -sl_dist, pnl), pnl)  # SL wins ties (conservative)
    pnl = pnl - cost
    ok = (d != 0) & np.isfinite(entry) & np.isfinite(sl_dist) & (sl_dist > 0) & np.isfinite(last)
    pnl = np.where(ok, pnl, np.nan)
    return pnl, pnl / sl_dist, np.where(i_sl <= i_tp, "SL", np.where(i_tp < big, "TP", "TIME"))

def stats(r):
    r = r[np.isfinite(r)]
    if len(r) == 0: return dict(n=0)
    eq = np.cumsum(r); dd = np.max(np.maximum.accumulate(eq) - eq) if len(eq) else 0
    gp, gl = r[r > 0].sum(), -r[r < 0].sum()
    return dict(n=len(r), win=round((r > 0).mean() * 100, 1), avgR=round(r.mean(), 3), sumR=round(r.sum(), 1),
                pf=round(gp / gl, 2) if gl > 0 else np.inf, maxddR=round(dd, 1),
                sharpe=round(r.mean() / r.std() * np.sqrt(252), 2) if r.std() > 0 else 0)

def simulate2(g, entry_min, exit_min, direction, sl_dist, tp_dist, cost, be_R=None, trail_start_R=None, trail_R=None):
    """Like simulate, plus break-even and trailing stop (decided on previous bars only -> no look-ahead).
    Stops are evaluated on bar extremes; if stop and TP are both inside one bar, the stop wins."""
    entry = g["o"][:, entry_min]
    H = g["h"][:, entry_min:exit_min]; L = g["l"][:, entry_min:exit_min]; C = g["c"][:, entry_min:exit_min]
    last = pd.DataFrame(C).ffill(axis=1).iloc[:, -1].values
    d = direction.astype(float)
    fav = np.where(d[:, None] > 0, H - entry[:, None], entry[:, None] - L)
    adv = np.where(d[:, None] > 0, entry[:, None] - L, H - entry[:, None])
    fav = np.nan_to_num(fav, nan=-np.inf); adv = np.nan_to_num(adv, nan=-np.inf)
    cumfav_prev = np.maximum.accumulate(fav, axis=1)
    cumfav_prev = np.concatenate([np.full((len(d), 1), -np.inf), cumfav_prev[:, :-1]], axis=1)
    sl = sl_dist[:, None]
    thr = np.broadcast_to(sl, adv.shape).copy()          # adverse distance at which we are stopped
    if be_R is not None:
        thr = np.where(cumfav_prev >= be_R * sl, np.minimum(thr, 0.0), thr)
    if trail_R is not None:
        act = cumfav_prev >= trail_start_R * sl
        thr = np.where(act, np.minimum(thr, trail_R * sl - cumfav_prev), thr)
    stop_hit = adv >= thr
    tp_hit = fav >= tp_dist[:, None]
    big = H.shape[1] + 1
    i_sl = np.where(stop_hit.any(1), stop_hit.argmax(1), big)
    i_tp = np.where(tp_hit.any(1), tp_hit.argmax(1), big)
    stop_pnl = -thr[np.arange(len(d)), np.minimum(i_sl, H.shape[1] - 1)]
    pnl = (last - entry) * d
    pnl = np.where(i_tp < big, tp_dist, pnl)
    pnl = np.where((i_sl <= i_tp) & (i_sl < big), stop_pnl, pnl)
    pnl = pnl - cost
    ok = (d != 0) & np.isfinite(entry) & np.isfinite(sl_dist) & (sl_dist > 0) & np.isfinite(last)
    pnl = np.where(ok, pnl, np.nan)
    return pnl, pnl / sl_dist
