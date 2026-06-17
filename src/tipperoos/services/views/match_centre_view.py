from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from tipperoos.core.domain import prediction_lookup, prediction_summary
from tipperoos.core.timing import timed
from tipperoos.data.store import (
    load_match_centre_open_payload,
    load_match_fixtures,
    load_match_results,
    load_players,
    load_player_predictions,
    load_predictions,
    load_settings,
    merge_match_results,
)
from tipperoos.services.actions import match_centre_status


@dataclass(frozen=True)
class MatchCentreMatchView:
    match: dict
    status: str
    current_prediction: dict | None
    pick_text: str
    predictions: list[dict]
    completed: bool
    reveal: bool
    row_html: str


@dataclass(frozen=True)
class MatchCentrePageView:
    settings: dict
    players: dict[str, dict]
    matches: list[MatchCentreMatchView]


def get_match_centre_page(player_id: str, filter_choice: str = "Open") -> MatchCentrePageView:
    with timed("view.match_centre.total"):
        with timed("view.match_centre.load"):
            needs_social_data = filter_choice in ("Open", "Locked", "Completed", "All")
            payload = None if needs_social_data else load_match_centre_open_payload(player_id)
            if payload:
                settings = payload["settings"]
                matches = payload["matches"]
                current_predictions = payload["player_predictions"]
                players_list = []
                all_predictions = current_predictions
            else:
                settings = load_settings()
                matches = merge_match_results(load_match_fixtures(), load_match_results())
                current_predictions = load_player_predictions(player_id)
                players_list = load_players() if needs_social_data else []
                all_predictions = load_predictions() if needs_social_data else current_predictions

        with timed("view.match_centre.build"):
            players = {p["id"]: p for p in players_list}
            prediction_by_player_match = prediction_lookup(current_predictions)
            predictions_by_match = defaultdict(list)
            if needs_social_data:
                for pred in all_predictions:
                    predictions_by_match[pred["match_id"]].append(pred)

            match_views = []
            for match in matches:
                status = match_centre_status(match, settings)
                current_prediction = prediction_by_player_match.get((player_id, match["id"]))
                completed = status == "Completed"
                reveal = status in ("Open", "Locked", "Completed")
                row_html = ""
                if status != "Open" and not reveal:
                    row_html = '<div class="tr-centre-empty">Teams are not set for this fixture yet.</div>'
                match_views.append(
                    MatchCentreMatchView(
                        match=match,
                        status=status,
                        current_prediction=current_prediction,
                        pick_text=prediction_summary(current_prediction) or "Your pick: -",
                        predictions=predictions_by_match.get(match["id"], []),
                        completed=completed,
                        reveal=reveal,
                        row_html=row_html,
                    )
                )

        return MatchCentrePageView(settings=settings, players=players, matches=match_views)
