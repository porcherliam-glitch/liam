"""Synthetic checks for backtester.simulate2 (stop/target order, costs, time exit, no look-ahead)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import backtester as bt


def grid_from_path(rows):
    """rows: list of per-day lists of (o, h, l, c) for minutes 0..n-1."""
    n = max(len(r) for r in rows)
    g = {k: np.full((len(rows), n), np.nan) for k in "ohlc"}
    for i, r in enumerate(rows):
        for j, (o, h, l, c) in enumerate(r):
            g["o"][i, j], g["h"][i, j], g["l"][i, j], g["c"][i, j] = o, h, l, c
    return g


def run(rows, d, sl, tp, cost=0.0, **kw):
    g = grid_from_path(rows)
    n = len(rows)
    return bt.simulate2(g, 0, g["o"].shape[1], np.array(d, float), np.full(n, sl), np.full(n, tp), np.full(n, cost), **kw)


def test_time_exit_long_and_short():
    path = [(100, 100.5, 99.5, 100), (100, 101, 99.8, 101), (101, 102, 100.5, 102)]
    pnl, r = run([path, path], [1, -1], sl=5, tp=99)
    assert pnl.tolist() == [2.0, -2.0] and r.tolist() == [0.4, -0.4]


def test_stop_and_target():
    up = [(100, 100.2, 99.9, 100), (100, 103.5, 100, 103), (103, 103, 98, 98)]
    pnl, _ = run([up], [1], sl=1.5, tp=3)          # target at 103 reached first
    assert pnl[0] == 3
    pnl, _ = run([up], [-1], sl=1.5, tp=3)         # short is stopped at +1.5 in minute 1
    assert pnl[0] == -1.5


def test_stop_wins_when_both_in_same_bar():
    wide = [(100, 100, 100, 100), (100, 105, 95, 100)]
    pnl, _ = run([wide], [1], sl=2, tp=2)
    assert pnl[0] == -2


def test_cost_and_no_trade():
    path = [(100, 100, 100, 100), (100, 101, 100, 101)]
    pnl, r = run([path, path], [1, 0], sl=2, tp=99, cost=0.3)
    assert abs(pnl[0] - 0.7) < 1e-12 and np.isnan(pnl[1])


def test_break_even_uses_previous_bars_only():
    # minute 1 reaches +2 (= 1R) and falls back to entry in the SAME bar -> break-even not active yet
    path = [(100, 100, 100, 100), (100, 102, 99.5, 100), (100, 100.2, 99.0, 99.0)]
    pnl, _ = run([path], [1], sl=2, tp=99, be_R=1.0)
    assert pnl[0] == 0.0       # stopped at entry in minute 2 (break-even became active after minute 1)
    pnl, _ = run([path], [1], sl=2, tp=99)
    assert pnl[0] == -1.0      # without break-even: time exit at 99


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("ok ", name)
