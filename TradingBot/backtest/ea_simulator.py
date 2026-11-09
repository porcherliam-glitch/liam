"""Python port of the Gold1315.mq5 (1.20) trading logic, run against a simulated MT5 broker.

Why: the research backtest (backtester.py) works on German-time minute grids. The EA works on broker
server time, the broker's own D1 bars (iATR), an entry window, broker-side stop-losses and an exit
check on every tick. This port follows the MQL5 functions (GetClock, ReadAtr, GermanMidnightPrice,
TryEntry, SizeFactor, CalcLots, ManagePositions) so the two can be compared day by day.

Broker model:
  * server time = New York wall clock + 7 h (GMT+2 winter / GMT+3 summer on US dates, the usual MT5 setup)
  * ticks from M1 candles in the order open, low, high, close (rising candle) or open, high, low, close
  * bid = candle price, ask = bid + spread; spread = research cost model (0.35 USD + 0.005 % of price)
  * stop-loss filled at the stop price, or at the open if the market gaps through it
  * 1 lot = 100 oz, volume step 0.01, minimum 0.01
"""
import numpy as np
import pandas as pd

from test_time_logic import DST_EU, DST_NONE, DST_US, get_clock  # line-by-line ports of the MQL5 helpers

CONTRACT = 100.0


class Inputs:
    """Defaults = EA 1.20 defaults."""
    entry_hour, entry_minute, window_min = 13, 15, 5
    exit_hour, exit_minute = 22, 45
    gmt_winter, dst_rule = 2, DST_US
    momentum_atr, max_vol_ratio, atr_fast, atr_slow = 0.4, 1.0, 14, 100
    risk_percent, strength_sizing, max_size_factor, fixed_lots = 0.35, True, 2.0, 0.0
    stop_atr, max_spread, max_dd_pct = 0.75, 0.80, 20.0
    vol_min, vol_step, vol_max = 0.01, 0.01, 100.0

    def __init__(self, **kw):
        for k, v in kw.items():
            if not hasattr(self, k):
                raise AttributeError(k)
            setattr(self, k, v)


def spread_of(price):
    return 0.35 + 0.00005 * price


def server_bars_from_utc(df, server="US"):
    """df with columns time (UTC epoch s), open, high, low, close -> server epoch seconds + OHLC arrays."""
    utc = pd.to_datetime(df.time.values, unit="s", utc=True)
    if server == "US":     # New York + 7 h
        wall = utc.tz_convert("America/New_York").tz_localize(None) + pd.Timedelta(hours=7)
    elif server == "EU":   # Berlin + 1 h
        wall = utc.tz_convert("Europe/Berlin").tz_localize(None) + pd.Timedelta(hours=1)
    elif server == "UTC":
        wall = utc.tz_localize(None)
    else:
        raise ValueError(server)
    srv = (wall.values.astype("datetime64[s]").astype(np.int64))
    order = np.argsort(srv, kind="stable")
    srv, idx = np.unique(srv[order], return_index=True)
    take = order[idx]
    return srv, df.open.values[take], df.high.values[take], df.low.values[take], df.close.values[take]


# ---------------------------------------------------------------------------------------------- EA port
def size_factor(inp, move):                       # SizeFactor()
    if not inp.strength_sizing or inp.momentum_atr <= 0.0:
        return 1.0
    return max(1.0, min(abs(move) / inp.momentum_atr, inp.max_size_factor))


def calc_lots(inp, equity, price, sl, factor):     # CalcLots() without the margin check (high leverage)
    lots = inp.fixed_lots
    if lots <= 0.0:
        profit_per_lot = -abs(price - sl) * CONTRACT  # OrderCalcProfit(type, 1 lot, price -> sl)
        if profit_per_lot >= 0.0:
            return 0.0
        risk_money = equity * inp.risk_percent * factor / 100.0
        lots = risk_money / abs(profit_per_lot)
    lots = np.floor(lots / inp.vol_step + 1e-9) * inp.vol_step
    if lots < inp.vol_min:
        return 0.0
    return round(min(lots, inp.vol_max), 2)


class Simulator:
    def __init__(self, srv, o, h, l, c, inp=None, equity=10_000.0):
        self.inp = inp or Inputs()
        self.srv, self.o, self.h, self.l, self.c = srv, o, h, l, c
        self.equity, self.peak = equity, equity
        self._clock_arrays()
        self._german_days()

    # GetClock for every bar. Offsets only change on full hours -> evaluate the port once per server hour.
    def _clock_arrays(self):
        inp = self.inp
        hours = np.unique(self.srv // 3600)
        srv_off, de_off = {}, {}
        for hr in hours:
            t = int(hr) * 3600
            ck = get_clock(t, inp.gmt_winter, inp.dst_rule)
            srv_off[hr] = t - ck["gmt"]
            de_off[hr] = ck["german"] - ck["gmt"]
        hr = self.srv // 3600
        so = np.array([srv_off[x] for x in hr], dtype=np.int64)
        do = np.array([de_off[x] for x in hr], dtype=np.int64)
        self.srv_off, self.de_off = so, do
        german = self.srv - so + do
        self.gday = german - german % 86400
        self.gmin = (german - self.gday) // 60
        self.gdow = ((german // 86400) + 4) % 7

    # port of ReadAtr(): true range per German trading day (Mon-Fri, 00:00-23:00 German time), the EA builds it
    # from H1 bars (same highs, lows and closes as the M1 bars used here); ATR = mean of the n previous days
    def _german_days(self):
        idx = np.flatnonzero((self.gdow != 0) & (self.gdow != 6) & (self.gmin < 23 * 60))
        keys, first = np.unique(self.gday[idx], return_index=True)
        last = np.r_[first[1:], len(idx)] - 1
        hi = np.maximum.reduceat(self.h[idx], first)
        lo = np.minimum.reduceat(self.l[idx], first)
        cl = self.c[idx][last]
        prev = np.r_[np.nan, cl[:-1]]
        tr = np.maximum(hi, prev) - np.minimum(lo, prev)
        tr[0] = 0.0                                   # never used: read_atr needs a previous close
        self.gd_keys, self.gd_cs = keys, np.r_[0.0, np.cumsum(tr)]

    def read_atr(self, i):                         # ReadAtr()
        k = np.searchsorted(self.gd_keys, self.gday[i])            # German trading days before today
        n1, n2 = self.inp.atr_fast, self.inp.atr_slow
        if k - n2 < 1:
            return None
        a1 = (self.gd_cs[k] - self.gd_cs[k - n1]) / n1
        a2 = (self.gd_cs[k] - self.gd_cs[k - n2]) / n2
        return a1, a2

    def german_midnight_price(self, i):            # GermanMidnightPrice(): first M1 bar at/after German 00:00
        frm = self.gday[i] - self.de_off[i] + self.srv_off[i]
        j = np.searchsorted(self.srv, frm)
        return self.o[j] if j <= i else None

    def run(self):
        inp = self.inp
        entry_min = inp.entry_hour * 60 + inp.entry_minute
        exit_min = inp.exit_hour * 60 + inp.exit_minute
        in_window = (self.gmin >= entry_min) & (self.gmin < entry_min + inp.window_min)
        cand = np.flatnonzero(in_window)
        days, first = np.unique(self.gday[cand], return_index=True)
        trades, decisions = [], []
        busy_until = -1                              # bar index until which a position is open
        for day, i in zip(days, cand[first]):
            if i <= busy_until:                      # HasOwnPosition(): previous trade still open
                continue
            if self.gdow[i] in (0, 6):
                continue
            self.peak = max(self.peak, self.equity)   # DrawdownAllowsTrading()
            if inp.max_dd_pct > 0 and self.equity < self.peak * (1 - inp.max_dd_pct / 100):
                decisions.append((day, 0, "safety_stop"))
                continue
            atr = self.read_atr(i)
            mid = self.german_midnight_price(i)
            if atr is None or mid is None:
                continue
            atr_fast, atr_slow = atr
            bid = self.o[i]
            spread = spread_of(bid)
            ask = bid + spread
            move = (bid - mid) / atr_fast
            vol_ratio = atr_fast / atr_slow
            d = 0
            if abs(move) > inp.momentum_atr and vol_ratio <= inp.max_vol_ratio:
                d = 1 if move > 0 else -1
            decisions.append((day, d, f"{move:+.3f}"))
            if d == 0 or spread > inp.max_spread:
                continue
            stop_dist = max(inp.stop_atr * atr_fast, spread)
            sl = round(bid - stop_dist, 2) if d > 0 else round(ask + stop_dist, 2)
            price = ask if d > 0 else bid
            factor = size_factor(inp, move)
            lots = calc_lots(inp, self.equity, price, sl, factor)
            if lots <= 0:
                decisions[-1] = (day, d, "lots_too_small")
                continue
            exit_price, reason, j = self._manage(i, d, sl, day, exit_min)
            pnl = (exit_price - price) * d * lots * CONTRACT
            risk = abs(price - sl) * lots * CONTRACT
            self.equity += pnl
            busy_until = j
            trades.append(dict(day=pd.Timestamp(day, unit="s"), dir=d, move=move, factor=factor, lots=lots,
                               entry=price, sl=sl, exit=exit_price, reason=reason, pnl=pnl, R=pnl / risk,
                               equity=self.equity))
        return pd.DataFrame(trades), decisions

    def _manage(self, i, d, sl, open_day, exit_min):
        """Broker stop-loss on every tick, ManagePositions() exit at the first tick at/after the exit time
        or on a later German day. Returns (exit price, reason, bar index)."""
        n = len(self.srv)
        for j in range(i, n):
            o, h, l, c = self.o[j], self.h[j], self.l[j], self.c[j]
            sp = spread_of(o)
            if j > i:
                # first tick of the candle: broker gap check, then the EA's exit check
                if d > 0 and o <= sl:
                    return o, "stop_gap", j
                if d < 0 and o + sp >= sl:
                    return o + sp, "stop_gap", j
                if self.gmin[j] >= exit_min or self.gday[j] > open_day:
                    return (o, "time", j) if d > 0 else (o + sp, "time", j)
            ticks = (l, h) if c >= o else (h, l)
            for t in ticks:
                if d > 0 and t <= sl:
                    return sl, "stop", j
                if d < 0 and t + sp >= sl:
                    return sl, "stop", j
        return (self.c[-1], "end", n - 1) if d > 0 else (self.c[-1] + spread_of(self.c[-1]), "end", n - 1)
