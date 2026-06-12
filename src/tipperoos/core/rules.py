from __future__ import annotations

from datetime import timedelta

from tipperoos.core.time_utils import now_utc, parse_dt


def is_match_locked(match: dict, settings: dict) -> bool:
    kickoff = parse_dt(match.get("kickoff_time"))
    if not kickoff:
        return True
    minutes = int(settings.get("lock_minutes_before_kickoff") or 30)
    return now_utc() >= kickoff - timedelta(minutes=minutes)


def can_edit_winner_pick(settings: dict) -> bool:
    deadline = parse_dt(settings.get("winner_pick_deadline"))
    if not deadline:
        return True
    return now_utc() < deadline
