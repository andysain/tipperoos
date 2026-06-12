from __future__ import annotations

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from tipperoos.core.domain import prediction_lookup, prediction_summary, team_lookup
from tipperoos.core.timing import submit_with_timing, timed
from tipperoos.data.store import (
    load_match_fixtures,
    load_match_results,
    merge_match_results,
    load_player_predictions,
    load_player_winner_pick,
    load_settings,
    load_teams,
)
from tipperoos.services.actions import match_status
from tipperoos.core.rules import can_edit_winner_pick


@dataclass(frozen=True)
class WinnerPickView:
    teams: list[dict]
    teams_by_name: dict[str, dict]
    current_pick: dict | None
    unlocked: bool


@dataclass(frozen=True)
class PredictionMatchView:
    match: dict
    prediction: dict | None
    status: str
    pick_text: str
    disabled: bool


@dataclass(frozen=True)
class PredictionsPageView:
    player_id: str
    settings: dict
    winner_pick: WinnerPickView
    metrics: dict[str, int]
    matches: list[PredictionMatchView]


def get_predictions_page(player_id: str) -> PredictionsPageView:
    with timed("view.predictions.total"):
        with timed("view.predictions.load"):
            with ThreadPoolExecutor(max_workers=6) as executor:
                settings_future = submit_with_timing(executor, load_settings)
                teams_future = submit_with_timing(executor, load_teams)
                fixtures_future = submit_with_timing(executor, load_match_fixtures)
                results_future = submit_with_timing(executor, load_match_results)
                predictions_future = submit_with_timing(executor, load_player_predictions, player_id)
                winner_pick_future = submit_with_timing(executor, load_player_winner_pick, player_id)

                settings = settings_future.result()
                teams = teams_future.result()
                matches = merge_match_results(fixtures_future.result(), results_future.result())
                player_predictions = predictions_future.result()
                current_pick = winner_pick_future.result()

        with timed("view.predictions.build"):
            predictions = prediction_lookup(player_predictions)
            match_views = []
            statuses = []
            saved_total = 0
            for match in matches:
                prediction = predictions.get((player_id, match["id"]))
                status = match_status(match, prediction, settings)
                statuses.append(status)
                if prediction:
                    saved_total += 1
                match_views.append(
                    PredictionMatchView(
                        match=match,
                        prediction=prediction,
                        status=status,
                        pick_text=prediction_summary(prediction),
                        disabled=status in ("Locked", "Completed", "Missed") or not (match.get("team_a") and match.get("team_b")),
                    )
                )
            status_counts = Counter(statuses)
            metrics = {
                "Open": status_counts.get("Open", 0),
                "Saved": saved_total,
                "Locked": status_counts.get("Locked", 0),
                "Missed": status_counts.get("Missed", 0),
            }

        return PredictionsPageView(
            player_id=player_id,
            settings=settings,
            winner_pick=WinnerPickView(
                teams=teams,
                teams_by_name=team_lookup(teams),
                current_pick=current_pick,
                unlocked=can_edit_winner_pick(settings),
            ),
            metrics=metrics,
            matches=match_views,
        )
