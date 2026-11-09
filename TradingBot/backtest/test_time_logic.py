"""Checks the time zone logic of Gold1315.mq5.

The functions below are a line-by-line Python copy of the MQL5 helpers
(MakeTime, DowOf, LastSunday, NthSunday, IsEuDst, IsUsDst, RuleServerOffset, GetClock).
They are compared with the IANA time zone database (zoneinfo) for every hour 2009-2030.

Run:  python3 -m pytest TradingBot/backtest/test_time_logic.py -q
  or  python3 TradingBot/backtest/test_time_logic.py
"""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

DST_US, DST_EU, DST_NONE = 0, 1, 2
EPOCH = datetime(1970, 1, 1)


# ---------- copy of the MQL5 helpers (datetime = seconds since 1970) ----------
def make_time(year, mon, day, hour):
    return int((datetime(year, mon, day, hour) - EPOCH).total_seconds())


def dow_of(t):  # 0 = Sunday like MqlDateTime.day_of_week
    return ((t // 86400) + 4) % 7  # 1970-01-01 was a Thursday


def year_of(t):
    return (EPOCH + timedelta(seconds=t)).year


def last_sunday(year, mon, hour):
    next_year = year + 1 if mon == 12 else year
    next_mon = 1 if mon == 12 else mon + 1
    last_day = make_time(next_year, next_mon, 1, hour) - 86400
    return last_day - dow_of(last_day) * 86400


def nth_sunday(year, mon, n, hour):
    first = make_time(year, mon, 1, hour)
    add = (7 - dow_of(first)) % 7
    return first + (add + 7 * (n - 1)) * 86400


def is_eu_dst(gmt):
    y = year_of(gmt)
    return last_sunday(y, 3, 1) <= gmt < last_sunday(y, 10, 1)


def is_us_dst(gmt):
    y = year_of(gmt)
    return nth_sunday(y, 3, 2, 7) <= gmt < nth_sunday(y, 11, 1, 6)


def rule_server_offset(server, gmt_winter, dst_rule):
    approx_gmt = server - gmt_winter * 3600
    dst = False
    if dst_rule == DST_US:
        dst = is_us_dst(approx_gmt)
    elif dst_rule == DST_EU:
        dst = is_eu_dst(approx_gmt)
    return (gmt_winter + (1 if dst else 0)) * 3600


def get_clock(server, gmt_winter, dst_rule):
    srv_offset = rule_server_offset(server, gmt_winter, dst_rule)
    gmt = server - srv_offset
    de_offset = 7200 if is_eu_dst(gmt) else 3600
    german = gmt + de_offset
    german_day = german - german % 86400
    return dict(gmt=gmt, german=german, german_day=german_day,
                german_minute=(german - german_day) // 60, german_dow=dow_of(german))


# ---------- ground truth ----------
BERLIN = ZoneInfo("Europe/Berlin")
NEW_YORK = ZoneInfo("America/New_York")


def to_epoch(dt_naive):
    return int((dt_naive - EPOCH).total_seconds())


def server_time(utc, kind):
    """Naive server wall clock for the usual broker setups."""
    if kind == "US":     # GMT+2 winter / GMT+3 summer on US dates (= New York + 7h)
        return utc.astimezone(NEW_YORK).replace(tzinfo=None) + timedelta(hours=7)
    if kind == "EU":     # GMT+2 winter / GMT+3 summer on EU dates (= Berlin + 1h)
        return utc.astimezone(BERLIN).replace(tzinfo=None) + timedelta(hours=1)
    if kind == "UTC":
        return utc.replace(tzinfo=None)
    raise ValueError(kind)


SETUPS = [("US", 2, DST_US), ("EU", 2, DST_EU), ("UTC", 0, DST_NONE)]


def hours(start_year=2009, end_year=2030):
    t = datetime(start_year, 1, 1, tzinfo=timezone.utc)
    end = datetime(end_year + 1, 1, 1, tzinfo=timezone.utc)
    while t < end:
        yield t
        t += timedelta(hours=1)


def test_calendar_helpers():
    assert dow_of(make_time(2026, 11, 9, 0)) == 1                           # Monday
    assert last_sunday(2026, 3, 1) == make_time(2026, 3, 29, 1)
    assert last_sunday(2026, 10, 1) == make_time(2026, 10, 25, 1)
    assert last_sunday(2025, 12, 0) == make_time(2025, 12, 28, 0)          # December -> next year
    assert nth_sunday(2026, 3, 2, 7) == make_time(2026, 3, 8, 7)
    assert nth_sunday(2026, 11, 1, 6) == make_time(2026, 11, 1, 6)          # month starting on Sunday
    assert nth_sunday(2024, 3, 2, 7) == make_time(2024, 3, 10, 7)


def test_german_time_matches_zoneinfo_on_trading_days():
    """German wall clock must be exact whenever gold trades (Sunday 23:00 .. Friday 23:00 German time)."""
    for kind, winter, rule in SETUPS:
        bad = []
        for utc in hours():
            truth = utc.astimezone(BERLIN).replace(tzinfo=None)
            if truth.weekday() >= 5:      # Saturday/Sunday: market closed, DST switches happen here
                continue
            c = get_clock(to_epoch(server_time(utc, kind)), winter, rule)
            if c["german"] != to_epoch(truth):
                bad.append((kind, utc, truth))
        assert not bad, f"{len(bad)} mismatches, first: {bad[:3]}"


def test_entry_minute_1315():
    """At 13:15 German time the clock must report minute 795 on weekdays in every setup."""
    for kind, winter, rule in SETUPS:
        for day in range(0, 365 * 3, 3):
            d = datetime(2024, 1, 1) + timedelta(days=day)
            if d.weekday() >= 5:
                continue
            local = datetime(d.year, d.month, d.day, 13, 15, tzinfo=BERLIN)
            c = get_clock(to_epoch(server_time(local.astimezone(timezone.utc), kind)), winter, rule)
            assert c["german_minute"] == 13 * 60 + 15, (kind, d)
            assert c["german_day"] == to_epoch(datetime(d.year, d.month, d.day))


def test_gap_week_example():
    """2025-03-12 (USA already summer time, Germany not): 13:15 German = 15:15 on a US-rule server."""
    c = get_clock(make_time(2025, 3, 12, 15) + 15 * 60, 2, DST_US)
    assert c["german_minute"] == 13 * 60 + 15
    c = get_clock(make_time(2025, 7, 15, 14) + 15 * 60, 2, DST_US)   # summer: server = German + 1h
    assert c["german_minute"] == 13 * 60 + 15
    c = get_clock(make_time(2025, 12, 15, 14) + 15 * 60, 2, DST_US)  # winter: server = German + 1h
    assert c["german_minute"] == 13 * 60 + 15


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok ", name)
