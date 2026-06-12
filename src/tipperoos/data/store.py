from __future__ import annotations

import streamlit as st
from supabase import Client, create_client

from tipperoos.core.cache import clear_ttl_caches, ttl_cache
from tipperoos.core.domain import result_lookup
from tipperoos.core.timing import record_timing, timed


@st.cache_resource
def get_supabase_client() -> Client:
    url = st.secrets.get("SUPABASE_URL")
    key = st.secrets.get("SUPABASE_KEY")
    if not url or not key:
        st.error("Missing Supabase secrets. Add SUPABASE_URL and SUPABASE_KEY.")
        st.stop()
    return create_client(url, key)


def db() -> Client:
    return get_supabase_client()


def execute(builder, label: str = "db.execute"):
    with timed(label):
        return builder.execute().data or []


def clear_data_cache() -> None:
    clear_ttl_caches()
    st.cache_data.clear()


@st.cache_data(ttl=20)
@ttl_cache(seconds=20)
def load_players(include_inactive: bool = False) -> list[dict]:
    query = db().table("players").select("*").order("display_name")
    if not include_inactive:
        query = query.eq("active", True)
    return execute(query, "store.load_players")


@st.cache_data(ttl=20)
@ttl_cache(seconds=300)
def load_teams(active_only: bool = True) -> list[dict]:
    query = db().table("teams").select("*").order("name")
    if active_only:
        query = query.eq("active", True)
    return execute(query, "store.load_teams")


@st.cache_data(ttl=20)
@ttl_cache(seconds=120)
def load_match_fixtures() -> list[dict]:
    return execute(db().table("matches").select("*").order("kickoff_time"), "store.load_match_fixtures")


def merge_match_results(matches: list[dict], results: list[dict]) -> list[dict]:
    result_by_match = result_lookup(results)
    merged = [dict(match) for match in matches]
    for match in merged:
        result = result_by_match.get(match["id"])
        if result:
            match["status"] = result.get("status") or "scheduled"
            match["team_a_score"] = result.get("team_a_score")
            match["team_b_score"] = result.get("team_b_score")
            match["advance_team"] = result.get("advance_team")
            match["result_updated_at"] = result.get("updated_at") or result.get("confirmed_at")
        else:
            match["status"] = match.get("status") or "scheduled"
    return merged


@st.cache_data(ttl=20)
def load_matches() -> list[dict]:
    with timed("store.load_matches"):
        return merge_match_results(load_match_fixtures(), load_match_results())


@st.cache_data(ttl=20)
@ttl_cache(seconds=20)
def load_match_results() -> list[dict]:
    return execute(db().table("match_results").select("*"), "store.load_match_results")


@st.cache_data(ttl=20)
@ttl_cache(seconds=20)
def load_predictions() -> list[dict]:
    return execute(db().table("predictions").select("*"), "store.load_predictions")


@st.cache_data(ttl=20)
@ttl_cache(seconds=20)
def load_player_predictions(player_id: str) -> list[dict]:
    return execute(
        db().table("predictions").select("*").eq("player_id", player_id),
        "store.load_player_predictions",
    )


@st.cache_data(ttl=20)
@ttl_cache(seconds=20)
def load_winner_picks() -> list[dict]:
    return execute(db().table("winner_picks").select("*"), "store.load_winner_picks")


@st.cache_data(ttl=20)
@ttl_cache(seconds=20)
def load_player_winner_pick(player_id: str) -> dict | None:
    rows = execute(
        db().table("winner_picks").select("*").eq("player_id", player_id).limit(1),
        "store.load_player_winner_pick",
    )
    return rows[0] if rows else None


@st.cache_data(ttl=20)
@ttl_cache(seconds=20)
def load_match_centre_open_payload(player_id: str) -> dict | None:
    if not st.secrets.get("ENABLE_MATCH_CENTRE_RPC", False):
        record_timing("store.match_centre_open_payload.disabled", 0)
        return None
    rows = execute(
        db().rpc("match_centre_open_payload", {"target_player_id": player_id}),
        "store.match_centre_open_payload",
    )
    if not rows:
        return None
    if isinstance(rows, dict):
        return rows
    return rows[0] if isinstance(rows[0], dict) else rows[0]


@st.cache_data(ttl=20)
@ttl_cache(seconds=60)
def load_settings() -> dict:
    rows = execute(db().table("settings").select("*").eq("id", 1).limit(1), "store.load_settings")
    if rows:
        settings = rows[0]
        settings.setdefault("allow_player_signup", True)
        return settings
    data = {
        "id": 1,
        "lock_minutes_before_kickoff": 30,
        "allow_player_signup": True,
        "timezone": "Australia/Sydney",
    }
    db().table("settings").insert(data).execute()
    clear_data_cache()
    return data


def app_setup_state() -> dict:
    state = {
        "schema_ok": False,
        "admin_count": 0,
        "team_count": 0,
        "match_count": 0,
        "winner_deadline_set": False,
        "bots_count": 0,
        "settings": {},
        "error": None,
    }
    try:
        players = load_players(include_inactive=True)
        teams = load_teams(active_only=False)
        matches = load_matches()
        settings = load_settings()
    except Exception as exc:
        state["error"] = exc
        return state

    state["schema_ok"] = True
    state["admin_count"] = len([p for p in players if p.get("is_admin")])
    state["bots_count"] = len([p for p in players if p.get("is_bot")])
    state["team_count"] = len(teams)
    state["match_count"] = len(matches)
    state["winner_deadline_set"] = bool(settings.get("winner_pick_deadline"))
    state["settings"] = settings
    return state


@st.cache_data(ttl=20)
@ttl_cache(seconds=20)
def get_player(player_id: str) -> dict | None:
    rows = execute(
        db()
        .table("players")
        .select("id,username,display_name,emoji,is_admin,is_bot,bot_type,active")
        .eq("id", player_id)
        .limit(1),
        "store.get_player",
    )
    return rows[0] if rows else None


def get_match(match_id: str) -> dict | None:
    return next((match for match in load_matches() if match["id"] == match_id), None)
