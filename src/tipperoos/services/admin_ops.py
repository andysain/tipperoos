from __future__ import annotations

import random
from collections import Counter
from statistics import median

import pandas as pd

from tipperoos.core.constants import ARCHIVE_DIR, SCORE_POOL
from tipperoos.core.domain import flag_for_code, has_teams, matchup_label, prediction_lookup, team_lookup, winner_lookup
from tipperoos.services.players import ensure_default_bots
from tipperoos.core.rules import is_match_locked
from tipperoos.data.store import (
    clear_data_cache,
    db,
    execute,
    load_matches,
    load_players,
    load_predictions,
    load_settings,
    load_teams,
    load_winner_picks,
)
from tipperoos.core.time_utils import iso_dt, local_label, now_utc, parse_host_kickoff


def import_archive_fixture_csvs() -> tuple[int, int]:
    teams_path = ARCHIVE_DIR / "teams.csv"
    matches_path = ARCHIVE_DIR / "matches.csv"
    stages_path = ARCHIVE_DIR / "tournament_stages.csv"
    cities_path = ARCHIVE_DIR / "host_cities.csv"
    if not all(p.exists() for p in (teams_path, matches_path, stages_path, cities_path)):
        raise FileNotFoundError("Missing one or more archive CSV files.")

    teams_df = pd.read_csv(teams_path)
    stages_df = pd.read_csv(stages_path)
    cities_df = pd.read_csv(cities_path)
    matches_df = pd.read_csv(matches_path)

    team_rows = []
    team_by_id = {}
    for row in teams_df.to_dict("records"):
        name = str(row["team_name"]).strip()
        team = {
            "external_id": int(row["id"]),
            "name": name,
            "fifa_code": str(row.get("fifa_code") or "").strip() or None,
            "group_letter": str(row.get("group_letter") or "").strip() or None,
            "icon": flag_for_code(row.get("fifa_code")),
            "active": True,
            "updated_at": iso_dt(now_utc()),
        }
        team_rows.append(team)
        team_by_id[int(row["id"])] = team
    db().table("teams").upsert(team_rows, on_conflict="external_id").execute()

    stages = {
        int(row["id"]): {"stage": row["stage_name"], "stage_order": int(row["stage_order"])}
        for row in stages_df.to_dict("records")
    }
    cities = {
        int(row["id"]): {"city": row["city_name"], "venue": row["venue_name"]}
        for row in cities_df.to_dict("records")
    }

    match_rows = []
    for row in matches_df.to_dict("records"):
        stage = stages[int(row["stage_id"])]
        city = cities.get(int(row["city_id"]), {})

        team_a = team_by_id.get(int(row["home_team_id"])) if not pd.isna(row.get("home_team_id")) else None
        team_b = team_by_id.get(int(row["away_team_id"])) if not pd.isna(row.get("away_team_id")) else None

        match_rows.append(
            {
                "match_id": f"M{int(row['match_number']):03d}",
                "match_number": int(row["match_number"]),
                "stage": stage["stage"],
                "stage_order": stage["stage_order"],
                "group_name": row["match_label"] if stage["stage"] == "Group Stage" else None,
                "match_label": row["match_label"],
                "team_a": team_a["name"] if team_a else None,
                "team_b": team_b["name"] if team_b else None,
                "team_a_code": team_a.get("fifa_code") if team_a else None,
                "team_b_code": team_b.get("fifa_code") if team_b else None,
                "team_a_icon": team_a.get("icon") if team_a else None,
                "team_b_icon": team_b.get("icon") if team_b else None,
                "kickoff_time": iso_dt(parse_host_kickoff(row["kickoff_at"], city.get("city"))),
                "is_knockout": stage["stage"] != "Group Stage",
                "city": city.get("city"),
                "venue": city.get("venue"),
                "updated_at": iso_dt(now_utc()),
            }
        )
    db().table("matches").upsert(match_rows, on_conflict="match_id").execute()
    clear_data_cache()
    return len(team_rows), len(match_rows)


def prediction_count_for_match(match_id: str) -> int:
    return len(execute(db().table("predictions").select("id").eq("match_id", match_id)))


def team_fields(name: str | None, teams_by_name: dict[str, dict], side: str) -> dict:
    team = teams_by_name.get(name or "")
    return {
        side: name,
        f"{side}_code": team.get("fifa_code") if team else None,
        f"{side}_icon": team.get("icon") if team else None,
    }


def assign_round_of_32_match(match: dict, team_a: str, team_b: str) -> None:
    if prediction_count_for_match(match["id"]) and (match.get("team_a") != team_a or match.get("team_b") != team_b):
        raise ValueError("This match already has predictions. Do not change teams without a reset.")
    teams_by_name = team_lookup(load_teams())
    update = {"updated_at": iso_dt(now_utc())}
    update.update(team_fields(team_a, teams_by_name, "team_a"))
    update.update(team_fields(team_b, teams_by_name, "team_b"))
    db().table("matches").update(update).eq("id", match["id"]).execute()
    clear_data_cache()


def loser_for_match(match: dict) -> str | None:
    advanced = match.get("advance_team")
    if not advanced:
        return None
    if advanced == match.get("team_a"):
        return match.get("team_b")
    if advanced == match.get("team_b"):
        return match.get("team_a")
    return None


def resolve_source_token(token: str, matches_by_number: dict[int, dict]) -> str | None:
    token = token.strip()
    if token.startswith("W") and token[1:].isdigit():
        source = matches_by_number.get(int(token[1:]))
        return source.get("advance_team") if source and source.get("status") == "completed" else None
    if token.startswith("RU") and token[2:].isdigit():
        source = matches_by_number.get(int(token[2:]))
        return loser_for_match(source) if source and source.get("status") == "completed" else None
    return None


def propagate_knockout_matchups() -> int:
    matches = load_matches()
    teams_by_name = team_lookup(load_teams())
    matches_by_number = {int(m["match_number"]): m for m in matches if m.get("match_number") is not None}
    changed = 0

    for match in matches:
        if not match.get("is_knockout") or not match.get("match_label") or match.get("stage") == "Round of 32":
            continue
        if not any(token in match["match_label"] for token in ("W", "RU")):
            continue
        parts = [p.strip() for p in match["match_label"].split(" vs ")]
        if len(parts) != 2:
            continue
        resolved = [resolve_source_token(part, matches_by_number) for part in parts]
        if not any(resolved):
            continue
        if prediction_count_for_match(match["id"]):
            continue
        update = {"updated_at": iso_dt(now_utc())}
        if resolved[0] and resolved[0] != match.get("team_a"):
            update.update(team_fields(resolved[0], teams_by_name, "team_a"))
        if resolved[1] and resolved[1] != match.get("team_b"):
            update.update(team_fields(resolved[1], teams_by_name, "team_b"))
        if len(update) > 1:
            db().table("matches").update(update).eq("id", match["id"]).execute()
            changed += 1
    if changed:
        clear_data_cache()
    return changed


def choose_advance(match: dict, pred_a: int, pred_b: int) -> str | None:
    if not match.get("is_knockout"):
        return None
    if pred_a > pred_b:
        return match.get("team_a")
    if pred_b > pred_a:
        return match.get("team_b")
    return random.choice([match["team_a"], match["team_b"]])


def bot_prediction_for_match(bot_type: str, match: dict, human_predictions: list[dict]) -> tuple[int, int, str | None]:
    if bot_type == "random":
        pred_a = random.choice(SCORE_POOL)
        pred_b = random.choice(SCORE_POOL)
    elif bot_type == "one_one":
        pred_a = pred_b = 1
    else:
        if human_predictions:
            pred_a = int(round(median([int(p["pred_team_a_score"]) for p in human_predictions])))
            pred_b = int(round(median([int(p["pred_team_b_score"]) for p in human_predictions])))
        else:
            pred_a = pred_b = 1

    advance = choose_advance(match, pred_a, pred_b)
    if bot_type == "median" and match.get("is_knockout") and pred_a == pred_b and human_predictions:
        votes = [p.get("pred_advance_team") for p in human_predictions if p.get("pred_advance_team")]
        if votes:
            advance = Counter(votes).most_common(1)[0][0]
    return pred_a, pred_b, advance


def generate_bot_predictions(bot_type: str | None = None, only_match_id: str | None = None) -> int:
    ensure_default_bots()
    players = load_players()
    bots = [p for p in players if p.get("is_bot") and (bot_type is None or p.get("bot_type") == bot_type)]
    humans = [p["id"] for p in players if not p.get("is_bot")]
    matches = [m for m in load_matches() if has_teams(m)]
    if only_match_id:
        matches = [m for m in matches if m["id"] == only_match_id]
    settings = load_settings()
    all_predictions = load_predictions()
    existing = prediction_lookup(all_predictions)
    generated = 0

    for bot in bots:
        for match in matches:
            if (bot["id"], match["id"]) in existing:
                continue
            if bot.get("bot_type") == "median" and not is_match_locked(match, settings):
                continue
            human_predictions = [
                p for p in all_predictions if p["match_id"] == match["id"] and p["player_id"] in humans
            ]
            pred_a, pred_b, advance = bot_prediction_for_match(bot["bot_type"], match, human_predictions)
            db().table("predictions").insert(
                {
                    "player_id": bot["id"],
                    "match_id": match["id"],
                    "pred_team_a_score": pred_a,
                    "pred_team_b_score": pred_b,
                    "pred_advance_team": advance,
                }
            ).execute()
            generated += 1
    if generated:
        clear_data_cache()
    return generated


def generate_bot_winner_picks() -> int:
    ensure_default_bots()
    teams = [t["name"] for t in load_teams()]
    if not teams:
        return 0
    players = load_players()
    bots = [p for p in players if p.get("is_bot")]
    humans = [p["id"] for p in players if not p.get("is_bot")]
    picks = winner_lookup(load_winner_picks())
    generated = 0
    human_picks = [picks[p]["team"] for p in humans if p in picks]

    for bot in bots:
        if bot["id"] in picks:
            continue
        if bot.get("bot_type") == "median" and human_picks:
            team = Counter(human_picks).most_common(1)[0][0]
        else:
            team = random.choice(teams)
        db().table("winner_picks").insert({"player_id": bot["id"], "team": team}).execute()
        generated += 1
    if generated:
        clear_data_cache()
    return generated


def save_result(match: dict, score_a: int, score_b: int, advance_team: str | None, status: str) -> None:
    if status == "completed":
        if match.get("is_knockout") and not advance_team:
            raise ValueError("Choose who advanced.")
        result_updated_at = iso_dt(now_utc())
    else:
        advance_team = None
        result_updated_at = None

    db().table("match_results").upsert(
        {
            "match_id": match["id"],
            "status": status,
            "team_a_score": score_a if status == "completed" else None,
            "team_b_score": score_b if status == "completed" else None,
            "advance_team": advance_team,
            "source": "manual",
            "confirmed_at": result_updated_at or iso_dt(now_utc()),
            "updated_at": iso_dt(now_utc()),
        },
        on_conflict="match_id",
    ).execute()
    clear_data_cache()

    if status == "completed":
        generate_bot_predictions(only_match_id=match["id"])
        generate_bot_winner_picks()
        propagate_knockout_matchups()


RESULT_SCORE_A_COLUMNS = ("team_a_score", "score_a")
RESULT_SCORE_B_COLUMNS = ("team_b_score", "score_b")
RESULT_TEAM_A_COLUMNS = ("team_a_code", "a_code")
RESULT_TEAM_B_COLUMNS = ("team_b_code", "b_code")
RESULT_ADVANCE_COLUMNS = ("advance_team_code", "advance_team", "advanced_team_code", "winner_code", "winner")
RESULT_STATUS_COLUMNS = ("status", "result_status")
RESULT_STATUSES = ("scheduled", "completed", "cancelled", "postponed")


def csv_column(row: dict, aliases: tuple[str, ...]):
    lower = {str(key).strip().lower(): key for key in row}
    for alias in aliases:
        key = lower.get(alias)
        if key is not None:
            return row.get(key)
    return None


def blank(value) -> bool:
    return value in (None, "") or pd.isna(value)


def parse_score_value(value, label: str) -> int:
    if blank(value):
        raise ValueError(f"{label} is blank.")
    try:
        score = int(float(str(value).strip()))
    except ValueError as exc:
        raise ValueError(f"{label} must be a whole number.") from exc
    if score < 0:
        raise ValueError(f"{label} must be 0 or more.")
    return score


def resolve_advance_value(value, match: dict, score_a: int, score_b: int) -> str | None:
    if not match.get("is_knockout"):
        return None
    options = [match.get("team_a"), match.get("team_b")]
    if score_a > score_b:
        return match.get("team_a")
    if score_b > score_a:
        return match.get("team_b")
    if blank(value):
        raise ValueError("advance_team is required for tied knockout results.")

    raw = str(value).strip()
    normalized = raw.casefold()
    if normalized in ("team_a", "a", "home"):
        return match.get("team_a")
    if normalized in ("team_b", "b", "away"):
        return match.get("team_b")
    for team in options:
        if team and normalized == team.casefold():
            return team
    if match.get("team_a_code") and normalized == str(match["team_a_code"]).casefold():
        return match.get("team_a")
    if match.get("team_b_code") and normalized == str(match["team_b_code"]).casefold():
        return match.get("team_b")
    raise ValueError("advance_team must be team_a, team_b, a team name, or a team code.")


def result_snapshot(match: dict) -> str:
    if match.get("team_a_score") is None or match.get("team_b_score") is None:
        return "-"
    return f"{match['team_a_score']}-{match['team_b_score']}"


def advance_code_for_match(match: dict) -> str:
    advanced = match.get("advance_team")
    if advanced == match.get("team_a"):
        return match.get("team_a_code") or ""
    if advanced == match.get("team_b"):
        return match.get("team_b_code") or ""
    return ""


def result_update_from_values(
    match: dict,
    score_a_raw,
    score_b_raw,
    status_raw,
    advance_raw,
    source_label: str,
) -> tuple[dict | None, str | None, bool]:
    row_has_scores = not blank(score_a_raw) or not blank(score_b_raw)
    row_has_status = not blank(status_raw)
    if not row_has_scores and not row_has_status:
        return None, None, False

    status = str(status_raw).strip().lower() if row_has_status else "completed"
    if row_has_scores and status == "scheduled":
        status = "completed"
    if status not in RESULT_STATUSES:
        return None, f"status must be one of {', '.join(RESULT_STATUSES)}.", False

    try:
        score_a = score_b = None
        advance_team = None
        if status == "completed":
            score_a = parse_score_value(score_a_raw, "team_a_score")
            score_b = parse_score_value(score_b_raw, "team_b_score")
            advance_team = resolve_advance_value(advance_raw, match, score_a, score_b)
        elif row_has_scores:
            return None, "Rows with scores should use status completed, or leave status as scheduled.", False
    except ValueError as exc:
        return None, str(exc), False

    current_status = match.get("status") or "scheduled"
    current_advance = match.get("advance_team")
    current_result = result_snapshot(match)
    new_result = f"{score_a}-{score_b}" if status == "completed" else "-"
    changed = (
        current_status != status
        or current_result != new_result
        or (current_advance or "") != (advance_team or "")
    )
    if not changed:
        return None, None, True

    action = "Add result" if current_result == "-" and status == "completed" else "Change result"
    if status != "completed":
        action = "Clear result/status" if current_result != "-" else "Change status"

    return (
        {
            "match_id": match["id"],
            "match_number": int(match["match_number"]),
            "score_a": score_a,
            "score_b": score_b,
            "advance_team": advance_team,
            "status": status,
            "source": source_label,
            "preview": {
                "Action": action,
                "Match": int(match["match_number"]),
                "Codes": f"{match.get('team_a_code')} vs {match.get('team_b_code')}",
                "Fixture": matchup_label(match),
                "Current": f"{current_status} {current_result}".strip(),
                "New": f"{status} {new_result}".strip(),
                "Current advanced": current_advance or "-",
                "New advanced": advance_team or "-",
            },
        },
        None,
        False,
    )


def build_result_updates_from_csv(uploaded_file) -> tuple[list[dict], list[dict], int]:
    df = pd.read_csv(uploaded_file)
    matches = load_matches()
    matches_by_number = {int(m["match_number"]): m for m in matches if m.get("match_number") is not None}
    updates: list[dict] = []
    errors: list[dict] = []
    unchanged = 0

    columns = {str(column).strip().lower() for column in df.columns}
    has_score_columns = bool(columns.intersection(RESULT_SCORE_A_COLUMNS)) and bool(columns.intersection(RESULT_SCORE_B_COLUMNS))
    has_status_column = bool(columns.intersection(RESULT_STATUS_COLUMNS))
    if "match_number" not in columns:
        return [], [{"Row": "-", "Match": "-", "Problem": "CSV needs a match_number column."}], 0
    if not columns.intersection(RESULT_TEAM_A_COLUMNS) or not columns.intersection(RESULT_TEAM_B_COLUMNS):
        return [], [
            {
                "Row": "-",
                "Match": "-",
                "Problem": "CSV needs team_a_code and team_b_code columns so scores can be validated against fixtures.",
            }
        ], 0
    if not has_score_columns and not has_status_column:
        return [], [
            {
                "Row": "-",
                "Match": "-",
                "Problem": "Add team_a_score and team_b_score columns, or a status column, before uploading.",
            }
        ], 0

    for index, row in enumerate(df.to_dict("records"), start=2):
        match_number_raw = csv_column(row, ("match_number",))
        if blank(match_number_raw):
            continue
        try:
            match_number = int(float(str(match_number_raw).strip()))
        except ValueError:
            errors.append({"Row": index, "Match": "-", "Problem": "match_number must be a number."})
            continue

        match = matches_by_number.get(match_number)
        if not match:
            errors.append({"Row": index, "Match": match_number, "Problem": "No matching fixture in Supabase."})
            continue
        if not has_teams(match):
            errors.append({"Row": index, "Match": match_number, "Problem": "Fixture teams are not set yet."})
            continue

        team_a_code_raw = csv_column(row, RESULT_TEAM_A_COLUMNS)
        team_b_code_raw = csv_column(row, RESULT_TEAM_B_COLUMNS)
        team_a_code = "" if blank(team_a_code_raw) else str(team_a_code_raw).strip().casefold()
        team_b_code = "" if blank(team_b_code_raw) else str(team_b_code_raw).strip().casefold()
        expected_a_code = str(match.get("team_a_code") or "").strip().casefold()
        expected_b_code = str(match.get("team_b_code") or "").strip().casefold()
        if not team_a_code or not team_b_code:
            errors.append({"Row": index, "Match": match_number, "Problem": "team_a_code and team_b_code are required."})
            continue
        if team_a_code != expected_a_code or team_b_code != expected_b_code:
            expected = f"{match.get('team_a_code') or '-'} vs {match.get('team_b_code') or '-'}"
            supplied = f"{team_a_code_raw or '-'} vs {team_b_code_raw or '-'}"
            errors.append(
                {
                    "Row": index,
                    "Match": match_number,
                    "Problem": f"Team codes do not match fixture. Expected {expected}; uploaded {supplied}.",
                }
            )
            continue

        status_raw = csv_column(row, RESULT_STATUS_COLUMNS)
        score_a_raw = csv_column(row, RESULT_SCORE_A_COLUMNS)
        score_b_raw = csv_column(row, RESULT_SCORE_B_COLUMNS)
        advance_raw = csv_column(row, RESULT_ADVANCE_COLUMNS)

        update, problem, unchanged_row = result_update_from_values(
            match,
            score_a_raw,
            score_b_raw,
            status_raw,
            advance_raw,
            "csv_upload",
        )
        if problem:
            errors.append({"Row": index, "Match": match_number, "Problem": problem})
            continue
        if unchanged_row:
            unchanged += 1
            continue
        if update:
            updates.append(update)

    return updates, errors, unchanged


def result_editor_rows(matches: list[dict]) -> list[dict]:
    rows = []
    for match in matches:
        if not has_teams(match):
            continue
        rows.append(
            {
                "match_number": int(match["match_number"]),
                "kickoff": local_label(match.get("kickoff_time")),
                "stage": match.get("group_name") or match.get("stage"),
                "team_a": match.get("team_a"),
                "team_a_code": match.get("team_a_code") or "",
                "team_a_score": None if match.get("team_a_score") is None else int(match["team_a_score"]),
                "team_b_score": None if match.get("team_b_score") is None else int(match["team_b_score"]),
                "team_b_code": match.get("team_b_code") or "",
                "team_b": match.get("team_b"),
                "status": match.get("status") or "scheduled",
                "advance_team_code": advance_code_for_match(match),
            }
        )
    return rows


def build_result_updates_from_table(rows) -> tuple[list[dict], list[dict], int]:
    data = rows.to_dict("records") if hasattr(rows, "to_dict") else list(rows)
    matches = load_matches()
    matches_by_number = {int(m["match_number"]): m for m in matches if m.get("match_number") is not None}
    updates: list[dict] = []
    errors: list[dict] = []
    unchanged = 0

    for index, row in enumerate(data, start=1):
        match_number_raw = row.get("match_number")
        if blank(match_number_raw):
            continue
        try:
            match_number = int(float(str(match_number_raw).strip()))
        except ValueError:
            errors.append({"Row": index, "Match": "-", "Problem": "match_number must be a number."})
            continue

        match = matches_by_number.get(match_number)
        if not match:
            errors.append({"Row": index, "Match": match_number, "Problem": "No matching fixture in Supabase."})
            continue

        supplied_a = "" if blank(row.get("team_a_code")) else str(row.get("team_a_code")).strip().casefold()
        supplied_b = "" if blank(row.get("team_b_code")) else str(row.get("team_b_code")).strip().casefold()
        expected_a = str(match.get("team_a_code") or "").strip().casefold()
        expected_b = str(match.get("team_b_code") or "").strip().casefold()
        if supplied_a != expected_a or supplied_b != expected_b:
            errors.append({"Row": index, "Match": match_number, "Problem": "Team codes changed unexpectedly. Refresh and try again."})
            continue

        update, problem, unchanged_row = result_update_from_values(
            match,
            row.get("team_a_score"),
            row.get("team_b_score"),
            row.get("status"),
            row.get("advance_team_code"),
            "table_editor",
        )
        if problem:
            errors.append({"Row": index, "Match": match_number, "Problem": problem})
            continue
        if unchanged_row:
            unchanged += 1
            continue
        if update:
            updates.append(update)

    return updates, errors, unchanged


def apply_result_updates(updates: list[dict], imported_by: str | None = None) -> int:
    completed_match_ids = []
    timestamp = iso_dt(now_utc())
    for update in updates:
        status = update["status"]
        db().table("match_results").upsert(
            {
                "match_id": update["match_id"],
                "status": status,
                "team_a_score": update["score_a"] if status == "completed" else None,
                "team_b_score": update["score_b"] if status == "completed" else None,
                "advance_team": update["advance_team"] if status == "completed" else None,
                "source": update.get("source") or "admin",
                "confirmed_at": timestamp,
                "updated_at": timestamp,
            },
            on_conflict="match_id",
        ).execute()
        if status == "completed":
            completed_match_ids.append(update["match_id"])

    clear_data_cache()
    for match_id in completed_match_ids:
        generate_bot_predictions(only_match_id=match_id)
    if completed_match_ids:
        generate_bot_winner_picks()
    propagate_knockout_matchups()
    try:
        db().table("result_imports").insert(
            {
                "row_count": len(updates),
                "changed_count": len(updates),
                "error_count": 0,
                "imported_by": imported_by,
            }
        ).execute()
    except Exception:
        pass
    return len(updates)
