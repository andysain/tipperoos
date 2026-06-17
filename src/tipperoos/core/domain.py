from __future__ import annotations

from html import escape

from tipperoos.core.constants import FIFA_FLAG_EMOJIS
from tipperoos.core.time_utils import local_label


def flag_for_code(code: str | None) -> str | None:
    if not code:
        return None
    return FIFA_FLAG_EMOJIS.get(str(code).strip().upper())


def prediction_lookup(predictions: list[dict]) -> dict[tuple[str, str], dict]:
    return {(p["player_id"], p["match_id"]): p for p in predictions}


def winner_lookup(winner_picks: list[dict]) -> dict[str, dict]:
    return {p["player_id"]: p for p in winner_picks}


def result_lookup(results: list[dict]) -> dict[str, dict]:
    return {r["match_id"]: r for r in results}


def team_lookup(teams: list[dict]) -> dict[str, dict]:
    return {t["name"]: t for t in teams}


def team_format_from_lookup(teams_by_name: dict[str, dict]):
    def _format(name: str) -> str:
        team = teams_by_name.get(name)
        if not team:
            return name
        return team_display(name, team.get("icon") or flag_for_code(team.get("fifa_code")))

    return _format


def has_teams(match: dict) -> bool:
    return bool(match.get("team_a") and match.get("team_b"))


def player_joined_after_match(player: dict | None, match: dict) -> bool:
    if not player:
        return False
    start = player.get("late_join_match_number")
    match_number = match.get("match_number")
    if start in (None, "") or match_number in (None, ""):
        return False
    try:
        return int(match_number) < int(start)
    except (TypeError, ValueError):
        return False


def uses_advancement_pick(match: dict) -> bool:
    return bool(match.get("is_knockout"))


def team_display(name: str | None, icon: str | None = None) -> str:
    if not name:
        return "TBC"
    return f"{icon} {name}".strip() if icon else name


def matchup_label(match: dict) -> str:
    if has_teams(match):
        left = team_display(match["team_a"], match.get("team_a_icon") or flag_for_code(match.get("team_a_code")))
        right = team_display(match["team_b"], match.get("team_b_icon") or flag_for_code(match.get("team_b_code")))
        return f"{left} vs {right}"
    return match.get("match_label") or "Fixture to be confirmed"


def status_badge(status: str, compact: bool = False) -> str:
    colors = {
        "Open": ("#ecfdf5", "#047857", "#a7f3d0"),
        "Needs tip": ("#fffbeb", "#92400e", "#f59e0b"),
        "Saved": ("#eff6ff", "#1d4ed8", "#93c5fd"),
        "Locked": ("#f8fafc", "#64748b", "#cbd5e1"),
        "Missed": ("#fff1f2", "#9f1239", "#fda4af"),
        "Joined later": ("#f8fafc", "#64748b", "#cbd5e1"),
        "Completed": ("#f1f5f9", "#334155", "#64748b"),
        "To be confirmed": ("#f8fafc", "#475569", "#cbd5e1"),
    }
    background, color, border = colors.get(status, colors["Locked"])
    min_width = "auto" if compact else "84px"
    padding = "0.18rem 0.55rem" if compact else "0.25rem 0.65rem"
    font_size = "0.78rem" if compact else "0.82rem"
    return (
        f'<span style="display:inline-flex;align-items:center;justify-content:center;'
        f'min-width:{min_width};padding:{padding};border-radius:999px;'
        f'font-size:{font_size};font-weight:750;white-space:nowrap;'
        f'background:{background};color:{color};border:1px solid {border};">{status}</span>'
    )


def match_time_summary(match: dict) -> str:
    sydney = local_label(match.get("kickoff_time"))
    stage = match.get("group_name") or match.get("stage") or "Match"
    city = match.get("city") or "Host city"
    return f"{stage} · {sydney} · {city}"


def prediction_summary(prediction: dict | None) -> str:
    if not prediction:
        return ""
    summary = f"Your pick: {prediction['pred_team_a_score']}-{prediction['pred_team_b_score']}"
    if prediction.get("pred_advance_team"):
        summary = f"{summary} · advances {prediction['pred_advance_team']}"
    return summary


def prediction_scoreline(prediction: dict | None) -> str:
    if not prediction:
        return "-"
    return f"{prediction['pred_team_a_score']}-{prediction['pred_team_b_score']}"


def ordinal(value: int) -> str:
    if 10 <= value % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(value % 10, "th")
    return f"{value}{suffix}"


def leaderboard_rank_label(rank: int, tied: bool) -> str:
    return f"={rank}" if tied else ordinal(rank)


def leaderboard_player_name(row: dict) -> str:
    if row.get("Bot"):
        return str(row.get("Player") or "")
    emoji = str(row.get("Emoji") or "").strip()
    player = str(row.get("Player") or "").strip()
    return f"{emoji} {player}".strip()


def score_reason(details: dict) -> str:
    tier = details.get("tier")
    if tier == "Exact":
        reason = "Exact score"
    elif tier == "Goal diff":
        reason = "Correct goal difference"
    elif tier == "Result":
        reason = "Correct result"
    else:
        reason = "Wrong result"
    if details.get("advancement_points"):
        return f"{reason} + advancement" if details.get("score_points") else "Correct advancement"
    return reason


def match_result_line(match: dict) -> str:
    if (
        match.get("status") != "completed"
        or match.get("team_a_score") is None
        or match.get("team_b_score") is None
    ):
        return matchup_label(match)
    team_a = team_display(match.get("team_a"), match.get("team_a_icon") or flag_for_code(match.get("team_a_code")))
    team_b = team_display(match.get("team_b"), match.get("team_b_icon") or flag_for_code(match.get("team_b_code")))
    return f"{team_a} {match.get('team_a_score')} - {match.get('team_b_score')} {team_b}"


def player_display_for_centre(player: dict) -> str:
    name = str(player.get("display_name") or "")
    if player.get("is_bot"):
        return escape(name)
    emoji = str(player.get("emoji") or "").strip()
    return escape(f"{emoji} {name}".strip())
