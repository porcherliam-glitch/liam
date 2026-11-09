"""Behaviour tests for the Python port of Gold1315.mq5 (ea_simulator.py) on constructed price paths.

Every test builds minute candles in German time (Mon-Fri, 00:00-22:59), converts them to the server
time of a usual MT5 broker (New York + 7 h) and runs the EA port with its default settings.
Known answers: quiet history -> ATR14 = 8, ATR100 > ATR14; a test day that rises 6 USD by 13:15
(= 0.75 ATR) must be bought with risk factor 0.75 / 0.4 = 1.875.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import pandas as pd
import ea_simulator as ea

TEST_DAY = pd.Timestamp("2025-02-12")          # a Wednesday in winter, no daylight-saving gap nearby


def build(test_path=None, drop_minutes=()):
    """History of 125 weekdays before TEST_DAY plus TEST_DAY itself. test_path(minute) -> price."""
    days = pd.bdate_range(end=TEST_DAY, periods=126)
    frames = []
    for n, day in enumerate(days):
        minutes = np.arange(23 * 60)
        if day == TEST_DAY and test_path is not None:
            price = np.array([test_path(m) for m in minutes], float)
        else:
            amp = 6.0 if n < len(days) - 15 else 4.0       # older days range 12, last 14 days range 8
            price = 1000.0 + amp * np.sin(2 * np.pi * minutes / (23 * 60))
        local = pd.DatetimeIndex(day + pd.to_timedelta(minutes, unit="min")).tz_localize("Europe/Berlin")
        df = pd.DataFrame({"time": local.tz_convert("UTC").as_unit("s").asi8, "open": price, "high": price,
                           "low": price, "close": price})
        if day == TEST_DAY and drop_minutes:
            df = df[~np.isin(minutes, drop_minutes)]
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


def run(df, **inputs):
    sim = ea.Simulator(*ea.server_bars_from_utc(df, "US"), inp=ea.Inputs(**inputs))
    trades, decisions = sim.run()
    return sim, trades, decisions


def rise_then(after):
    """0:00 -> 13:15 linear rise from 1000 to 1006, afterwards after(minute)."""
    return lambda m: 1000.0 + 6.0 * m / 795.0 if m <= 795 else after(m)


def test_read_atr_uses_german_trading_days():
    sim, _, _ = run(build(rise_then(lambda m: 1006.0)))
    i = int(np.flatnonzero((sim.gday == int(TEST_DAY.timestamp())) & (sim.gmin == 795))[0])
    atr14, atr100 = sim.read_atr(i)
    assert abs(atr14 - 8.0) < 0.05, atr14          # last 14 days: range 8
    assert atr100 > atr14 * 1.3                     # older days were wider -> quiet market
    assert sim.german_midnight_price(i) == 1000.0


def test_strong_move_is_bought_and_closed_at_2245():
    _, trades, _ = run(build(rise_then(lambda m: 1006.0)))
    assert len(trades) == 1
    t = trades.iloc[0]
    assert t.dir == 1 and t.reason == "time"
    assert abs(t.factor - 1.875) < 1e-9
    assert abs(t.move - 0.75) < 0.01
    spread = ea.spread_of(1006.0)
    assert abs(t.entry - (1006.0 + spread)) < 1e-9 and abs(t.exit - 1006.0) < 1e-9
    # lot size: 10,000 * 0.35 % * 1.875 risk / ((0.75 * 8 + spread) * 100 oz)
    expect = np.floor(10_000 * 0.0035 * 1.875 / ((6.0 + spread) * 100) / 0.01 + 1e-9) * 0.01
    assert abs(t.lots - expect) < 1e-9


def _minute_row(df, minute):
    local = (TEST_DAY + pd.Timedelta(minutes=minute)).tz_localize("Europe/Berlin")
    return df.index[df.time == int(local.timestamp())][0]


def test_stop_loss_inside_a_candle_fills_at_the_stop():
    df = build(rise_then(lambda m: 1006.0 if m < 900 else 995.0))
    k = _minute_row(df, 900)                                  # 15:00 candle trades from 1006 down to 995
    df.loc[k, ["open", "high"]] = 1006.0
    _, trades, _ = run(df)
    t = trades.iloc[0]
    assert t.reason == "stop"
    assert abs(t.exit - round(1006.0 - 6.0, 2)) < 1e-9     # stop 0.75 ATR below the bid
    assert -1.0 <= t.R < -0.9


def test_stop_loss_through_a_price_gap_fills_worse():
    _, trades, _ = run(build(rise_then(lambda m: 1006.0 if m < 900 else 995.0)))   # jump 1006 -> 995
    t = trades.iloc[0]
    assert t.reason == "stop_gap" and t.exit == 995.0
    assert t.R < -1.0


def test_falling_day_is_sold():
    _, trades, _ = run(build(lambda m: 1000.0 - 6.0 * min(m, 795) / 795.0))
    assert len(trades) == 1 and trades.iloc[0].dir == -1


def test_weak_move_is_not_traded():
    _, trades, decisions = run(build(lambda m: 1000.0 + 2.0 * min(m, 795) / 795.0))   # 0.25 ATR
    assert len(trades) == 0
    assert decisions[-1][1] == 0


def test_missing_1315_candle_uses_first_tick_in_window():
    _, trades, _ = run(build(rise_then(lambda m: 1006.0), drop_minutes=(795, 796)))
    assert len(trades) == 1 and trades.iloc[0].dir == 1


def test_no_candle_in_window_means_no_trade():
    _, trades, _ = run(build(rise_then(lambda m: 1006.0), drop_minutes=tuple(range(795, 800))))
    assert len(trades) == 0


def test_strength_sizing_can_be_switched_off():
    _, trades, _ = run(build(rise_then(lambda m: 1006.0)), strength_sizing=False)
    assert trades.iloc[0].factor == 1.0


def test_volatility_filter_blocks_the_trade():
    # ATR14 / ATR100 is about 0.7 here; with the limit lowered to 0.5 the strong move must not be traded
    df = build(rise_then(lambda m: 1006.0))
    sim, trades, _ = run(df, max_vol_ratio=0.5)
    assert len(trades) == 0


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok ", name)
