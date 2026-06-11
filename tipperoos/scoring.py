from __future__ import annotations


def sign(value: int) -> int:
    if value > 0:
        return 1
    if value < 0:
        return -1
    return 0


def score_prediction(match: dict, prediction: dict | None) -> int:
    if not prediction or match.get("status") != "completed":
        return 0
    if match.get("team_a_score") is None or match.get("team_b_score") is None:
        return 0

    actual_a = int(match["team_a_score"])
    actual_b = int(match["team_b_score"])
    pred_a = int(prediction["pred_team_a_score"])
    pred_b = int(prediction["pred_team_b_score"])

    actual_diff = actual_a - actual_b
    pred_diff = pred_a - pred_b

    if pred_a == actual_a and pred_b == actual_b:
        points = 6
    elif actual_diff == pred_diff:
        points = 4
    elif sign(actual_diff) == sign(pred_diff):
        points = 3
    else:
        points = 0

    if match.get("is_knockout") and prediction.get("pred_advance_team") == match.get("advance_team"):
        points += 2
    return points


def score_winner_pick(settings: dict, pick: dict | None) -> int:
    if not pick or not settings.get("final_winner"):
        return 0
    return 10 if pick.get("team") == settings.get("final_winner") else 0
