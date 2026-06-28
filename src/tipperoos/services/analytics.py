from __future__ import annotations

from collections import defaultdict

import pandas as pd

from tipperoos.core.domain import prediction_lookup, winner_lookup
from tipperoos.core.scoring import score_prediction_details, score_winner_pick
from tipperoos.core.timing import timed
from tipperoos.data.store import (
    load_matches,
    load_players,
    load_predictions,
    load_settings,
    load_teams,
    load_winner_picks,
)


def calculate_player_stats(player_id: str) -> dict:
    with timed("analytics.player_stats"):
        matches = load_matches()
        players = load_players()
        settings = load_settings()
        completed_matches = [
            match for match in matches
            if match.get("status") == "completed"
            and match.get("team_a_score") is not None
            and match.get("team_b_score") is not None
        ]
        predictions = prediction_lookup(load_predictions())
        winners = winner_lookup(load_winner_picks())

        exact_count = 0
        goal_diff_count = 0
        result_count = 0
        all_tips_count = 0

        match_differences = {}
        player_team_points = defaultdict(list)

        for match in completed_matches:
            prediction = predictions.get((player_id, match["id"]))
            details = score_prediction_details(match, prediction)
            pts = int(details["total_points"])

            if prediction:
                if details["tier"] == "Exact":
                    exact_count += 1
                    all_tips_count += 1
                elif details["tier"] == "Goal diff":
                    goal_diff_count += 1
                    all_tips_count += 1
                elif details["tier"] == "Result":
                    result_count += 1
                    all_tips_count += 1

                pred_a = int(prediction.get("pred_team_a_score", 0))
                pred_b = int(prediction.get("pred_team_b_score", 0))

                other_match_scores = []
                for p in players:
                    other_pred = predictions.get((p["id"], match["id"]))
                    if other_pred:
                        other_details = score_prediction_details(match, other_pred)
                        other_match_scores.append(int(other_details["total_points"]))

                avg_other = sum(other_match_scores) / len(other_match_scores) if other_match_scores else 0
                difference = pts - avg_other

                match_differences[match["id"]] = {
                    "difference": difference,
                    "points": pts,
                    "avg_other": avg_other,
                    "match": match,
                    "prediction": prediction,
                }

                player_team_points[match["team_a"]].append(pts)
                player_team_points[match["team_b"]].append(pts)

        winner_team = None
        winner_pick = winners.get(player_id)
        if winner_pick:
            winner_team = winner_pick.get("team")

        best_tip = None
        worst_tip = None
        for match_id, data in match_differences.items():
            if best_tip is None or data["difference"] > best_tip["difference"]:
                best_tip = data
            if worst_tip is None or data["difference"] < worst_tip["difference"]:
                worst_tip = data

        lucky_team = None
        lucky_avg = 0
        bogey_team = None
        bogey_avg = 0
        for team, pts_list in player_team_points.items():
            if not pts_list:
                continue
            avg = sum(pts_list) / len(pts_list)
            if lucky_team is None or avg > lucky_avg:
                lucky_team = team
                lucky_avg = avg
            if bogey_team is None or avg < bogey_avg:
                bogey_team = team
                bogey_avg = avg

        return {
            "winner_pick": winner_team,
            "exact_count": exact_count,
            "goal_diff_count": goal_diff_count,
            "result_count": result_count,
            "all_tips_count": all_tips_count,
            "best_tip": best_tip,
            "worst_tip": worst_tip,
            "lucky_team": lucky_team,
            "lucky_team_points": lucky_avg,
            "bogey_team": bogey_team,
            "bogey_team_points": bogey_avg,
        }


def calculate_player_match_history(player_id: str, limit: int = 5) -> list[dict]:
    with timed("analytics.player_match_history"):
        matches = load_matches()
        completed_matches = [
            match for match in matches
            if match.get("status") == "completed"
            and match.get("team_a_score") is not None
            and match.get("team_b_score") is not None
        ]
        completed_matches.sort(key=lambda m: int(m.get("match_number") or 0), reverse=True)
        predictions = prediction_lookup(load_predictions())
        history = []
        for match in completed_matches[:limit]:
            prediction = predictions.get((player_id, match["id"]))
            details = score_prediction_details(match, prediction)
            pred_a = int(prediction.get("pred_team_a_score", 0)) if prediction else 0
            pred_b = int(prediction.get("pred_team_b_score", 0)) if prediction else 0
            history.append({
                "match_number": int(match.get("match_number") or 0),
                "team_a": match.get("team_a"),
                "team_b": match.get("team_b"),
                "actual_score": f"{match.get('team_a_score')}-{match.get('team_b_score')}",
                "predicted_score": f"{pred_a}-{pred_b}" if prediction else "- -",
                "points": int(details["total_points"]),
                "tier": details["tier"],
            })
        return history


def calculate_leaderboard() -> pd.DataFrame:
    with timed("analytics.leaderboard.total"):
        with timed("analytics.leaderboard.load"):
            players = load_players()
            matches = load_matches()
            settings = load_settings()

            completed_matches = [
                match
                for match in matches
                if match.get("status") == "completed"
                and match.get("team_a_score") is not None
                and match.get("team_b_score") is not None
            ]
            completed_matches.sort(key=lambda m: int(m.get("match_number") or 0))
            predictions = {}
            winners = {}
            if completed_matches:
                predictions = prediction_lookup(load_predictions())
            if settings.get("final_winner"):
                winners = winner_lookup(load_winner_picks())

        with timed("analytics.leaderboard.build"):
            rows = []
            for player in players:
                score_points = 0
                advancement_points = 0
                starting_points = int(player.get("starting_points") or 0)
                exact_count = 0
                goal_diff_count = 0
                result_count = 0
                streak_points = []
                for match in completed_matches:
                    details = score_prediction_details(match, predictions.get((player["id"], match["id"])))
                    streak_points.append(int(details["total_points"]))
                    score_points += details["score_points"]
                    advancement_points += details["advancement_points"]
                    if details["tier"] == "Exact":
                        exact_count += 1
                    elif details["tier"] == "Goal diff":
                        goal_diff_count += 1
                    elif details["tier"] == "Result":
                        result_count += 1

                current_streak, best_streak = calculate_streaks(streak_points)
                winner_bonus = score_winner_pick(settings, winners.get(player["id"]))
                rows.append(
                    {
                        "Player ID": player["id"],
                        "Player": player["display_name"],
                        "Emoji": player.get("emoji") or "",
                        "Bot": bool(player.get("is_bot")),
                        "Bot sort": 1 if player.get("is_bot") else 0,
                        "Starting points": starting_points,
                        "Score points": score_points,
                        "Advancement": advancement_points,
                        "Winner bonus": winner_bonus,
                        "Total points": starting_points + score_points + advancement_points + winner_bonus,
                        "Exact": exact_count,
                        "Goal diff": goal_diff_count,
                        "Result": result_count,
                        "Current streak": current_streak,
                        "Best streak": best_streak,
                    }
                )
            df = pd.DataFrame(rows)
            if df.empty:
                return df
            df = df.sort_values(
                ["Total points", "Score points", "Bot sort", "Player"],
                ascending=[False, False, True, True],
            ).reset_index(drop=True)
            df["Rank"] = df["Total points"].rank(method="min", ascending=False).astype(int)
            return df


def calculate_streaks(points: list[int]) -> tuple[int, int]:
    current_streak = 0
    best_streak = 0
    for pts in points:
        if pts > 0:
            current_streak += 1
            best_streak = max(best_streak, current_streak)
        else:
            current_streak = 0
    return current_streak, best_streak


def unique_chart_name(player: dict, used_names: set[str]) -> str:
    emoji = str(player.get("emoji") or "").strip()
    base = f"{emoji} {player.get('display_name') or 'Player'}".strip()
    name = base
    suffix = 2
    while name in used_names:
        name = f"{base} {suffix}"
        suffix += 1
    used_names.add(name)
    return name


def cumulative_human_scores() -> pd.DataFrame:
    with timed("analytics.cumulative_human_scores"):
        humans = [player for player in load_players() if not player.get("is_bot")]
        completed_matches = [
            match
            for match in load_matches()
            if match.get("status") == "completed"
            and match.get("team_a_score") is not None
            and match.get("team_b_score") is not None
        ]
        if not humans or not completed_matches:
            return pd.DataFrame()

        predictions = prediction_lookup(load_predictions())
        used_names: set[str] = set()
        player_names = {player["id"]: unique_chart_name(player, used_names) for player in humans}
        totals = {player["id"]: int(player.get("starting_points") or 0) for player in humans}
        rows = []

        for index, match in enumerate(completed_matches, start=1):
            try:
                match_number = int(match.get("match_number") or index)
            except (TypeError, ValueError):
                match_number = index
            for player in humans:
                details = score_prediction_details(match, predictions.get((player["id"], match["id"])))
                totals[player["id"]] += int(details["total_points"])
            row = {"Match": match_number}
            for player in humans:
                row[player_names[player["id"]]] = totals[player["id"]]
            rows.append(row)

        return pd.DataFrame(rows)


def group_standings() -> dict[str, list[dict]]:
    with timed("analytics.group_standings"):
        teams = {t["name"]: t for t in load_teams()}
        standings = defaultdict(dict)
        for team in teams.values():
            group = team.get("group_letter")
            if group:
                standings[group][team["name"]] = {
                    "Team": team["name"],
                    "P": 0,
                    "W": 0,
                    "D": 0,
                    "L": 0,
                    "GF": 0,
                    "GA": 0,
                    "GD": 0,
                    "Pts": 0,
                }

        for match in load_matches():
            if match.get("stage") != "Group Stage" or match.get("status") != "completed":
                continue
            if match.get("team_a_score") is None or match.get("team_b_score") is None:
                continue
            group = (match.get("group_name") or "").replace("Group ", "")
            a = standings[group].setdefault(
                match["team_a"],
                {"Team": match["team_a"], "P": 0, "W": 0, "D": 0, "L": 0, "GF": 0, "GA": 0, "GD": 0, "Pts": 0},
            )
            b = standings[group].setdefault(
                match["team_b"],
                {"Team": match["team_b"], "P": 0, "W": 0, "D": 0, "L": 0, "GF": 0, "GA": 0, "GD": 0, "Pts": 0},
            )
            sa, sb = int(match["team_a_score"]), int(match["team_b_score"])
            for row, gf, ga in ((a, sa, sb), (b, sb, sa)):
                row["P"] += 1
                row["GF"] += gf
                row["GA"] += ga
                row["GD"] = row["GF"] - row["GA"]
            if sa > sb:
                a["W"] += 1
                b["L"] += 1
                a["Pts"] += 3
            elif sb > sa:
                b["W"] += 1
                a["L"] += 1
                b["Pts"] += 3
            else:
                a["D"] += 1
                b["D"] += 1
                a["Pts"] += 1
                b["Pts"] += 1

        return {
            group: sorted(rows.values(), key=lambda r: (-r["Pts"], -r["GD"], -r["GF"], r["Team"]))
            for group, rows in sorted(standings.items())
        }