from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pandas as pd
from dateutil import parser

from tipperoos.core.constants import HOST_CITY_TIMEZONES, SYDNEY


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def parse_dt(value) -> datetime | None:
    if value in (None, "") or pd.isna(value):
        return None
    dt = parser.parse(str(value))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=SYDNEY)
    return dt.astimezone(timezone.utc)


def parse_host_kickoff(value, city_name: str) -> datetime | None:
    if value in (None, "") or pd.isna(value):
        return None
    dt = parser.parse(str(value))
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc)

    host_tz_name = HOST_CITY_TIMEZONES.get(city_name)
    if not host_tz_name:
        return parse_dt(value)

    # Older fixture exports used host-local wall-clock values without a reliable
    # timezone. Attach the named host timezone for those naive timestamps.
    return dt.replace(tzinfo=ZoneInfo(host_tz_name)).astimezone(timezone.utc)


def iso_dt(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).isoformat()


def local_label(value) -> str:
    dt = parse_dt(value)
    if not dt:
        return "-"
    return dt.astimezone(SYDNEY).strftime("%a %d %b, %I:%M %p")


def host_local_label(value, city_name: str | None) -> str:
    dt = parse_dt(value)
    if not dt or not city_name:
        return "-"
    tz_name = HOST_CITY_TIMEZONES.get(city_name)
    if not tz_name:
        return "-"
    return dt.astimezone(ZoneInfo(tz_name)).strftime("%a %d %b, %I:%M %p")
