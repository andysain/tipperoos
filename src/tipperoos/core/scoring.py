from __future__ import annotations


def sign(value: int) -> int:
    if value > 0:
        return 1
    if value < 0:
        return -1
    return 0


def score_prediction(match: dict, prediction: dict | None) -> int:
    return score_prediction_details(match, prediction)["total_points"]


def score_prediction_details(match: dict, prediction: dict | None) -> dict:
    empty = {
        "score_points": 0,
        "advancement_points": 0,
        "total_points": 0,
        "tier": "No score",
    }
    if not prediction or match.get("status") != "completed":
        return empty
    if match.get("team_a_score") is None or match.get("team_b_score") is None:
        return empty

    actual_a = int(match["team_a_score"])
    actual_b = int(match["team_b_score"])
    pred_a = int(prediction["pred_team_a_score"])
    pred_b = int(prediction["pred_team_b_score"])

    actual_diff = actual_a - actual_b
    pred_diff = pred_a - pred_b

    if pred_a == actual_a and pred_b == actual_b:
        score_points = 5
        tier = "Exact"
    elif actual_diff == pred_diff:
        score_points = 4
        tier = "Goal diff"
    elif sign(actual_diff) == sign(pred_diff):
        score_points = 3
        tier = "Result"
    else:
        score_points = 0
        tier = "Wrong"

    advancement_points = 0
    if match.get("is_knockout") and prediction.get("pred_advance_team") == match.get("advance_team"):
        advancement_points = 2
    return {
        "score_points": score_points,
        "advancement_points": advancement_points,
        "total_points": score_points + advancement_points,
        "tier": tier,
    }


def score_winner_pick(settings: dict, pick: dict | None) -> int:
    if not pick or not settings.get("final_winner"):
        return 0
    return 10 if pick.get("team") == settings.get("final_winner") else 0
