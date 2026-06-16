from __future__ import annotations

from tipperoos.core.domain import has_teams, uses_advancement_pick
from tipperoos.core.rules import can_edit_winner_pick, is_match_locked
from tipperoos.core.timing import timed
from tipperoos.data.store import clear_data_cache, db, get_match, load_settings
from tipperoos.core.time_utils import iso_dt, now_utc


def upsert_winner_pick(player_id: str, team: str) -> None:
    with timed("service.upsert_winner_pick"):
        settings = load_settings()
        if not can_edit_winner_pick(settings):
            raise ValueError("Winner picks are locked.")
        db().table("winner_picks").upsert(
            {"player_id": player_id, "team": team, "updated_at": iso_dt(now_utc())},
            on_conflict="player_id",
        ).execute()
        clear_data_cache()


def save_prediction(player_id: str, match_id: str, pred_a: int, pred_b: int, advance_team: str | None) -> None:
    with timed("service.save_prediction"):
        settings = load_settings()
        match = get_match(match_id)
        if not match:
            raise ValueError("Match not found.")
        if not has_teams(match):
            raise ValueError("This fixture is not ready yet.")
        if is_match_locked(match, settings):
            raise ValueError("This match is locked.")
        if pred_a < 0 or pred_b < 0:
            raise ValueError("Scores must be zero or higher.")

        if uses_advancement_pick(match):
            if pred_a > pred_b:
                advance_team = match["team_a"]
            elif pred_b > pred_a:
                advance_team = match["team_b"]
            elif not advance_team:
                raise ValueError("Choose who advances for a drawn score.")
        else:
            advance_team = None

        db().table("predictions").upsert(
            {
                "player_id": player_id,
                "match_id": match_id,
                "pred_team_a_score": pred_a,
                "pred_team_b_score": pred_b,
                "pred_advance_team": advance_team,
                "updated_at": iso_dt(now_utc()),
            },
            on_conflict="player_id,match_id",
        ).execute()
        clear_data_cache()


def match_status(match: dict, prediction: dict | None, settings: dict) -> str:
    if match.get("status") == "completed":
        return "Completed"
    if not has_teams(match):
        return "To be confirmed"
    if is_match_locked(match, settings):
        return "Locked" if prediction else "Missed"
    return "Saved" if prediction else "Open"


def match_centre_status(match: dict, settings: dict) -> str:
    if match.get("status") == "completed":
        return "Completed"
    if not has_teams(match):
        return "To be confirmed"
    return "Locked" if is_match_locked(match, settings) else "Open"
