from __future__ import annotations

import base64
import hashlib
import hmac
import json
import random
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from html import escape
from statistics import median

import bcrypt
import pandas as pd
import streamlit as st
import streamlit.components.v1 as components
from supabase import Client, create_client

from tipperoos.constants import (
    APP_TITLE,
    ARCHIVE_DIR,
    BOT_SPECS,
    FIFA_FLAG_EMOJIS,
    PLAYER_EMOJIS,
    SCORE_POOL,
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE_SECONDS,
    SYDNEY,
)
from tipperoos.scoring import (
    score_prediction_details,
    score_winner_pick,
)
from tipperoos.styles import inject_styles
from tipperoos.time_utils import (
    iso_dt,
    local_label,
    now_utc,
    parse_dt,
    parse_host_kickoff,
)
from tipperoos.ui import (
    example_card,
    example_grid,
    muted,
    note,
    panel,
    points_grid,
    section_title,
)

st.set_page_config(page_title=APP_TITLE, page_icon="T", layout="wide")


def flag_for_code(code: str | None) -> str | None:
    if not code:
        return None
    return FIFA_FLAG_EMOJIS.get(str(code).strip().upper())


def clean_username(value: str) -> str:
    username = re.sub(r"[^a-z0-9_]+", "_", value.strip().lower())
    return username.strip("_") or "player"


def unique_username(display_name: str) -> str:
    base = clean_username(display_name)
    existing = {p["username"] for p in load_players(include_inactive=True)}
    if base not in existing:
        return base
    for index in range(2, 1000):
        candidate = f"{base}_{index}"
        if candidate not in existing:
            return candidate
    return f"{base}_{random.randint(1000, 9999)}"


def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def check_pin(pin: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pin.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def session_secret() -> bytes:
    secret = st.secrets.get("SESSION_SECRET")
    if not secret:
        st.error("Missing SESSION_SECRET. Add it to Streamlit secrets before deploying.")
        st.stop()
    return str(secret).encode("utf-8")


def make_session_token(player_id: str) -> str:
    payload = {
        "player_id": player_id,
        "exp": int((now_utc() + timedelta(seconds=SESSION_MAX_AGE_SECONDS)).timestamp()),
    }
    payload_raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_raw).decode("ascii").rstrip("=")
    signature = hmac.new(session_secret(), payload_b64.encode("ascii"), hashlib.sha256).digest()
    signature_b64 = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"{payload_b64}.{signature_b64}"


def validate_session_token(token: str | None) -> str | None:
    if not token or "." not in token:
        return None
    try:
        payload_b64, signature_b64 = token.split(".", 1)
        expected = hmac.new(session_secret(), payload_b64.encode("ascii"), hashlib.sha256).digest()
        actual = base64.urlsafe_b64decode(signature_b64 + "=" * (-len(signature_b64) % 4))
        if not hmac.compare_digest(expected, actual):
            return None
        payload_raw = base64.urlsafe_b64decode(payload_b64 + "=" * (-len(payload_b64) % 4))
        payload = json.loads(payload_raw.decode("utf-8"))
        if int(payload.get("exp", 0)) < int(now_utc().timestamp()):
            return None
        return payload.get("player_id")
    except Exception:
        return None


def set_session_cookie(token: str) -> None:
    safe_token = escape(token, quote=True)
    components.html(
        f"""
        <script>
        document.cookie = "{SESSION_COOKIE_NAME}={safe_token}; Max-Age={SESSION_MAX_AGE_SECONDS}; Path=/; SameSite=Lax";
        </script>
        """,
        height=0,
    )


def clear_session_cookie() -> None:
    components.html(
        f"""
        <script>
        document.cookie = "{SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax";
        </script>
        """,
        height=0,
    )


def queue_session_cookie(player_id: str) -> None:
    st.session_state.pending_session_cookie = make_session_token(player_id)


def emit_pending_cookie_update() -> bool:
    cleared_cookie = False
    if st.session_state.get("pending_session_cookie"):
        set_session_cookie(st.session_state.pending_session_cookie)
        st.session_state.pop("pending_session_cookie", None)
    if st.session_state.get("clear_session_cookie"):
        clear_session_cookie()
        st.session_state.pop("clear_session_cookie", None)
        cleared_cookie = True
    return cleared_cookie


def apply_player_session(player: dict, persist: bool = False) -> None:
    st.session_state.player_id = player["id"]
    st.session_state.display_name = player["display_name"]
    st.session_state.is_admin = bool(player.get("is_admin"))
    st.session_state.app_unlocked = True
    if persist:
        queue_session_cookie(player["id"])


def restore_session_from_cookie() -> bool:
    if st.session_state.get("player_id"):
        return True
    token = st.context.cookies.get(SESSION_COOKIE_NAME)
    player_id = validate_session_token(token)
    if not player_id:
        return False
    player = get_player(player_id)
    if not player or not player.get("active"):
        st.session_state.clear_session_cookie = True
        return False
    apply_player_session(player, persist=False)
    return True


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


def execute(builder):
    return builder.execute().data or []


def clear_data_cache() -> None:
    st.cache_data.clear()


@st.cache_data(ttl=20)
def load_players(include_inactive: bool = False) -> list[dict]:
    query = db().table("players").select("*").order("display_name")
    if not include_inactive:
        query = query.eq("active", True)
    return execute(query)


@st.cache_data(ttl=20)
def load_teams(active_only: bool = True) -> list[dict]:
    query = db().table("teams").select("*").order("name")
    if active_only:
        query = query.eq("active", True)
    return execute(query)


@st.cache_data(ttl=20)
def load_matches() -> list[dict]:
    matches = execute(db().table("matches").select("*").order("kickoff_time"))
    results = result_lookup(load_match_results())
    for match in matches:
        result = results.get(match["id"])
        if result:
            match["status"] = result.get("status") or "scheduled"
            match["team_a_score"] = result.get("team_a_score")
            match["team_b_score"] = result.get("team_b_score")
            match["advance_team"] = result.get("advance_team")
            match["result_updated_at"] = result.get("updated_at") or result.get("confirmed_at")
        else:
            match["status"] = match.get("status") or "scheduled"
    return matches


@st.cache_data(ttl=20)
def load_match_results() -> list[dict]:
    return execute(db().table("match_results").select("*"))


@st.cache_data(ttl=20)
def load_predictions() -> list[dict]:
    return execute(db().table("predictions").select("*"))


@st.cache_data(ttl=20)
def load_winner_picks() -> list[dict]:
    return execute(db().table("winner_picks").select("*"))


@st.cache_data(ttl=20)
def load_settings() -> dict:
    rows = execute(db().table("settings").select("*").eq("id", 1).limit(1))
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


def get_player(player_id: str) -> dict | None:
    rows = execute(db().table("players").select("*").eq("id", player_id).limit(1))
    return rows[0] if rows else None


def get_match(match_id: str) -> dict | None:
    return next((match for match in load_matches() if match["id"] == match_id), None)


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


def matchup_label(match: dict) -> str:
    if has_teams(match):
        left = team_display(match["team_a"], match.get("team_a_icon") or flag_for_code(match.get("team_a_code")))
        right = team_display(match["team_b"], match.get("team_b_icon") or flag_for_code(match.get("team_b_code")))
        return f"{left} vs {right}"
    return match.get("match_label") or "Fixture to be confirmed"


def team_display(name: str | None, icon: str | None = None) -> str:
    if not name:
        return "TBC"
    return f"{icon} {name}".strip() if icon else name


def status_badge(status: str, compact: bool = False) -> str:
    colors = {
        "Open": ("#ecfdf5", "#047857", "#a7f3d0"),
        "Saved": ("#eff6ff", "#1d4ed8", "#bfdbfe"),
        "Locked": ("#f3f4f6", "#374151", "#d1d5db"),
        "Missed": ("#fef2f2", "#b91c1c", "#fecaca"),
        "Completed": ("#fff7ed", "#c2410c", "#fed7aa"),
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
    return f"Your pick: {prediction['pred_team_a_score']}-{prediction['pred_team_b_score']}"


def prediction_scoreline(prediction: dict | None) -> str:
    if not prediction:
        return "-"
    return f"{prediction['pred_team_a_score']}-{prediction['pred_team_b_score']}"


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


def create_player(username: str, display_name: str, pin: str, emoji: str = "", is_admin: bool = False) -> None:
    db().table("players").insert(
        {
            "username": clean_username(username),
            "display_name": display_name.strip(),
            "pin_hash": hash_pin(pin),
            "emoji": emoji.strip() or None,
            "is_admin": is_admin,
            "is_bot": False,
            "active": True,
        }
    ).execute()
    clear_data_cache()


def create_bot(bot_type: str) -> None:
    spec = BOT_SPECS[bot_type]
    db().table("players").upsert(
        {
            "username": spec["username"],
            "display_name": spec["display_name"],
            "pin_hash": hash_pin(str(random.randint(100000, 999999))),
            "emoji": None,
            "is_admin": False,
            "is_bot": True,
            "bot_type": bot_type,
            "active": True,
        },
        on_conflict="username",
    ).execute()


def ensure_default_bots() -> None:
    players = load_players(include_inactive=True)
    existing = {p.get("bot_type") for p in players if p.get("is_bot")}
    for bot_type in BOT_SPECS:
        if bot_type not in existing:
            create_bot(bot_type)
    clear_data_cache()


def bootstrap_admin_if_needed() -> None:
    admins = [p for p in load_players(include_inactive=True) if p.get("is_admin")]
    if admins:
        return

    st.warning("No admin exists yet.")
    st.caption("Create the first admin from Streamlit secrets. This requires the admin bootstrap code.")
    with st.form("bootstrap_admin"):
        code = st.text_input("Admin bootstrap code", type="password")
        submitted = st.form_submit_button("Create first admin", type="primary")
    if submitted:
        expected = st.secrets.get("ADMIN_BOOTSTRAP_CODE")
        if not expected:
            st.error("Set ADMIN_BOOTSTRAP_CODE in Streamlit secrets before creating the first admin.")
            return
        if code != expected:
            st.error("That bootstrap code is not right.")
            return
        temp_pin = st.secrets.get("ADMIN_TEMP_PIN")
        if not temp_pin:
            st.error("Set ADMIN_TEMP_PIN in Streamlit secrets before creating the first admin.")
            return
        create_player(
            st.secrets.get("ADMIN_USERNAME", "admin"),
            st.secrets.get("ADMIN_DISPLAY_NAME", "admin"),
            temp_pin,
            is_admin=True,
        )
        st.success("First admin created. Log in with the configured username and PIN.")
        st.rerun()


def unlock_app_panel() -> None:
    _, panel, _ = st.columns([1, 1.15, 1])
    with panel:
        st.title(APP_TITLE)
        st.caption("World Cup predictions")
        with st.form("unlock_app"):
            code = st.text_input("Competition code", type="password")
            submitted = st.form_submit_button("Continue", type="primary", use_container_width=True)
        if submitted:
            if code == st.secrets.get("COMPETITION_CODE"):
                st.session_state.app_unlocked = True
                st.rerun()
            else:
                st.error("That competition code is not right.")


def login_page() -> None:
    if not st.session_state.get("app_unlocked"):
        unlock_app_panel()
        return

    _, panel, _ = st.columns([1, 1.4, 1])
    with panel:
        st.title(APP_TITLE)
        st.caption("World Cup predictions")

        setup = app_setup_state()
        if not setup["schema_ok"]:
            st.error("Setup needed: Supabase tables are not ready yet.")
            st.markdown(
                """
                1. Open Supabase.
                2. Go to the SQL editor.
                3. Run `sql/schema.sql`.
                4. Refresh this app.
                """
            )
            with st.expander("Technical detail"):
                st.code(str(setup["error"]))
            return

        bootstrap_admin_if_needed()
        settings = setup["settings"]
        players = [p for p in load_players() if not p.get("is_bot")]

        tab_login, tab_create = st.tabs(["Login", "Create player"])

        with tab_login:
            if not players:
                st.info("No players yet.")
            else:
                options = {f"{p.get('emoji') or ''} {p['display_name']}".strip(): p for p in players}
                label = st.selectbox("Player", list(options.keys()))
                pin = st.text_input("PIN", type="password", max_chars=6)
                if st.button("Login", type="primary", use_container_width=True):
                    player = options[label]
                    if check_pin(pin, player["pin_hash"]):
                        apply_player_session(player, persist=True)
                        st.rerun()
                    else:
                        st.error("That PIN did not match.")

        with tab_create:
            if not settings.get("allow_player_signup", True):
                st.info("Player creation is closed for now. Ask the family admin if you need access.")
            else:
                with st.form("create_player"):
                    display_name = st.text_input("Display name")
                    emoji_choice = st.selectbox("Player emoji (optional)", PLAYER_EMOJIS)
                    custom_emoji = ""
                    if emoji_choice == "Other":
                        custom_emoji = st.text_input("Custom emoji", max_chars=8, placeholder="😎")
                    pin = st.text_input("Choose a 4 or 6 digit PIN", type="password", max_chars=6)
                    confirm_pin = st.text_input("Confirm PIN", type="password", max_chars=6)
                    submitted = st.form_submit_button("Create player", use_container_width=True)
                if submitted:
                    emoji = custom_emoji.strip() if emoji_choice == "Other" else emoji_choice
                    if not display_name.strip():
                        st.error("Display name is required.")
                    elif pin != confirm_pin:
                        st.error("The PINs do not match.")
                    elif not (pin.isdigit() and len(pin) in (4, 6)):
                        st.error("PIN must be 4 or 6 digits.")
                    else:
                        try:
                            username = unique_username(display_name)
                            create_player(username, display_name, pin, emoji)
                            player = execute(
                                db().table("players").select("*").eq("username", username).limit(1)
                            )[0]
                            apply_player_session(player, persist=True)
                            st.rerun()
                        except Exception as exc:
                            st.error("Could not create that player. Please try a slightly different display name.")
                            with st.expander("Technical detail"):
                                st.code(str(exc))


def setup_status_page(setup: dict) -> None:
    st.title("Setup")
    st.caption("Competition readiness checklist")
    items = [
        ("Schema", setup["schema_ok"], "Supabase tables are available."),
        ("Admin", setup["admin_count"] > 0, f"{setup['admin_count']} admin player(s)."),
        ("Teams", setup["team_count"] > 0, f"{setup['team_count']} teams imported."),
        ("Matches", setup["match_count"] > 0, f"{setup['match_count']} matches imported."),
        ("Winner Deadline", setup["winner_deadline_set"], "Winner-pick deadline is set."),
        ("Bots", setup["bots_count"] >= len(BOT_SPECS), f"{setup['bots_count']} bot player(s)."),
    ]
    cols = st.columns(3)
    for index, (label, ok, detail) in enumerate(items):
        with cols[index % 3]:
            st.metric(label, "Ready" if ok else "Needed")
            st.caption(detail)
    if not setup["team_count"] or not setup["match_count"]:
        st.info("Next step: go to Admin > Import and import the archive fixture CSVs.")
    if not setup["winner_deadline_set"]:
        st.info("Set the winner-pick deadline before inviting family players.")
    if setup["bots_count"] < len(BOT_SPECS):
        st.info("Go to Admin > Bots and create the default bots.")


def sidebar() -> str:
    player = get_player(st.session_state.player_id)
    label = player["display_name"] if player else st.session_state.get("display_name", "Player")
    st.sidebar.subheader(f"Playing as: {label}")
    if st.sidebar.button("Switch player"):
        st.session_state.clear_session_cookie = True
        for key in ("player_id", "display_name", "is_admin"):
            st.session_state.pop(key, None)
        st.rerun()

    pages = ["My Predictions", "Rules", "Leaderboard", "Match Centre"]
    if st.session_state.get("is_admin"):
        pages.append("Admin")
    return st.sidebar.radio("Page", pages)


def upsert_winner_pick(player_id: str, team: str) -> None:
    settings = load_settings()
    if not can_edit_winner_pick(settings):
        raise ValueError("Winner picks are locked.")
    db().table("winner_picks").upsert(
        {"player_id": player_id, "team": team, "updated_at": iso_dt(now_utc())},
        on_conflict="player_id",
    ).execute()
    clear_data_cache()


def save_prediction(player_id: str, match_id: str, pred_a: int, pred_b: int, advance_team: str | None) -> None:
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

    if match.get("is_knockout"):
        if pred_a > pred_b:
            advance_team = match["team_a"]
        elif pred_b > pred_a:
            advance_team = match["team_b"]
        elif not advance_team:
            raise ValueError("Choose who advances for a drawn knockout score.")
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


def winner_pick_card(player_id: str, require_first: bool = False) -> bool:
    settings = load_settings()
    teams = load_teams()
    teams_by_name = team_lookup(teams)
    picks = winner_lookup(load_winner_picks())
    current_pick = picks.get(player_id)
    unlocked = can_edit_winner_pick(settings)

    st.subheader("Tournament winner pick")
    if not teams:
        if st.session_state.get("is_admin"):
            st.info("No teams have been imported yet. Go to Admin > Import to load the archive fixtures.")
        else:
            st.info("Competition setup is not finished yet. Check back once the teams are imported.")
        return False

    current_team = current_pick.get("team") if current_pick else None
    index = [t["name"] for t in teams].index(current_team) if current_team in [t["name"] for t in teams] else 0
    disabled = not unlocked
    if require_first and not current_pick and unlocked:
        st.info("Choose your overall winner first, then match predictions will unlock.")

    with st.container(border=True):
        if current_pick:
            team = teams_by_name.get(current_pick["team"])
            pick_label = team_display(current_pick["team"], team.get("icon") if team else None)
            st.markdown(f"**Saved pick:** {pick_label}")
        elif not unlocked:
            st.warning("Winner pick deadline has passed.")

        with st.form("winner_pick_form", border=False):
            selected = st.selectbox(
                "Overall winner",
                [t["name"] for t in teams],
                index=index,
                disabled=disabled,
                format_func=team_format_from_lookup(teams_by_name),
            )
            submitted = st.form_submit_button("Save winner pick", disabled=disabled, type="primary", use_container_width=True)
    if submitted:
        try:
            upsert_winner_pick(player_id, selected)
            st.success("Winner pick saved.")
            st.rerun()
        except Exception as exc:
            st.error(str(exc))

    return bool(current_pick) or not unlocked


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


def prediction_form(match: dict, prediction: dict | None, disabled: bool) -> None:
    player_id = st.session_state.player_id
    key = match["id"]
    existing_a = int(prediction["pred_team_a_score"]) if prediction else 0
    existing_b = int(prediction["pred_team_b_score"]) if prediction else 0
    team_a_label = team_display(match["team_a"], match.get("team_a_icon") or flag_for_code(match.get("team_a_code")))
    team_b_label = team_display(match["team_b"], match.get("team_b_icon") or flag_for_code(match.get("team_b_code")))
    score_options = list(range(0, 11))
    if existing_a not in score_options:
        score_options.append(existing_a)
    if existing_b not in score_options:
        score_options.append(existing_b)
    score_options = sorted(score_options)

    with st.form(f"prediction_{key}", border=False):
        c1, c2, c3 = st.columns([2, 0.35, 2], vertical_alignment="bottom")
        c1.markdown(f'<div class="tr-team-label">{team_a_label}</div>', unsafe_allow_html=True)
        pred_a = c1.selectbox(
            "Score",
            score_options,
            index=score_options.index(existing_a),
            key=f"a_{key}",
            disabled=disabled,
            label_visibility="collapsed",
        )
        c2.markdown('<div class="tr-score-preview">-</div>', unsafe_allow_html=True)
        c3.markdown(f'<div class="tr-team-label">{team_b_label}</div>', unsafe_allow_html=True)
        pred_b = c3.selectbox(
            "Score",
            score_options,
            index=score_options.index(existing_b),
            key=f"b_{key}",
            disabled=disabled,
            label_visibility="collapsed",
        )

        advance_team = prediction.get("pred_advance_team") if prediction else None
        if match.get("is_knockout"):
            options = [match["team_a"], match["team_b"]]
            index = options.index(advance_team) if advance_team in options else 0
            advance_team = st.selectbox("If level, who advances?", options, index=index, key=f"adv_{key}", disabled=disabled)
        submitted = st.form_submit_button("Save prediction", disabled=disabled, type="primary", use_container_width=True)

    if submitted:
        try:
            save_prediction(player_id, match["id"], int(pred_a), int(pred_b), advance_team)
            st.success("Prediction saved.")
            st.rerun()
        except Exception as exc:
            st.error(str(exc))


def my_predictions_page() -> None:
    player_id = st.session_state.player_id
    settings = load_settings()
    predictions = prediction_lookup(load_predictions())
    matches = load_matches()
    statuses = [match_status(match, predictions.get((player_id, match["id"])), settings) for match in matches]
    status_counts = Counter(statuses)
    saved_total = len([m for m in matches if predictions.get((player_id, m["id"]))])

    st.title("My Predictions")
    metric_cols = st.columns(4)
    metric_cols[0].metric("To tip", status_counts.get("Open", 0))
    metric_cols[1].metric("Saved", saved_total)
    metric_cols[2].metric("Locked", status_counts.get("Locked", 0))
    metric_cols[3].metric("Missed", status_counts.get("Missed", 0))

    winner_ready = winner_pick_card(player_id, require_first=True)

    st.divider()
    st.subheader("Match predictions")
    if not winner_ready:
        st.stop()

    filter_choice = st.segmented_control(
        "Filter",
        ["Open", "Missing", "All", "Completed"],
        default="Open",
    )

    rendered = 0
    for match in matches:
        prediction = predictions.get((player_id, match["id"]))
        status = match_status(match, prediction, settings)
        if filter_choice == "Open" and status not in ("Open", "Saved"):
            continue
        if filter_choice == "Missing" and (prediction or not has_teams(match) or match.get("status") == "completed"):
            continue
        if filter_choice == "Completed" and match.get("status") != "completed":
            continue

        rendered += 1
        with st.container(border=True):
            st.markdown(
                f'<div class="tr-card-top"><div>{status_badge(status)}</div>'
                f'<div class="tr-card-meta">{match_time_summary(match)}</div></div>',
                unsafe_allow_html=True,
            )
            pick_text = prediction_summary(prediction)
            if pick_text:
                st.markdown(f'<div class="tr-card-pick">{pick_text}</div>', unsafe_allow_html=True)

            if not has_teams(match):
                st.info("Teams are not set for this fixture yet.")
                continue

            disabled = status in ("Locked", "Completed", "Missed") or not has_teams(match)
            prediction_form(match, prediction, disabled)

    if rendered == 0:
        st.info("No matches in this view.")


def calculate_leaderboard() -> pd.DataFrame:
    players = load_players()
    matches = load_matches()
    settings = load_settings()
    predictions = prediction_lookup(load_predictions())
    winners = winner_lookup(load_winner_picks())

    rows = []
    for player in players:
        score_points = 0
        advancement_points = 0
        exact_count = 0
        goal_diff_count = 0
        result_count = 0
        for match in matches:
            details = score_prediction_details(match, predictions.get((player["id"], match["id"])))
            score_points += details["score_points"]
            advancement_points += details["advancement_points"]
            if details["tier"] == "Exact":
                exact_count += 1
            elif details["tier"] == "Goal diff":
                goal_diff_count += 1
            elif details["tier"] == "Result":
                result_count += 1
        winner_bonus = score_winner_pick(settings, winners.get(player["id"]))
        rows.append(
            {
                "Player ID": player["id"],
                "Player": player["display_name"],
                "Emoji": player.get("emoji") or "",
                "Bot": bool(player.get("is_bot")),
                "Bot sort": 1 if player.get("is_bot") else 0,
                "Score points": score_points,
                "Advancement": advancement_points,
                "Winner bonus": winner_bonus,
                "Total points": score_points + advancement_points + winner_bonus,
                "Exact": exact_count,
                "Goal diff": goal_diff_count,
                "Result": result_count,
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
    totals = {player["id"]: 0 for player in humans}
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


def leaderboard_page() -> None:
    st.title("Leaderboard")
    df = calculate_leaderboard()
    if df.empty:
        st.info("No players yet.")
        return

    matches = load_matches()
    completed_count = len([match for match in matches if match.get("status") == "completed"])
    player_count = len(df)
    current_player_id = st.session_state.get("player_id")
    current_rows = df[df["Player ID"] == current_player_id]
    top_score = int(df.iloc[0]["Total points"])
    if current_rows.empty:
        current_rank = "-"
    else:
        current_rank_value = int(current_rows.iloc[0]["Rank"])
        current_score = int(current_rows.iloc[0]["Total points"])
        current_tied = len(df[df["Total points"] == current_score]) > 1
        current_rank = leaderboard_rank_label(current_rank_value, current_tied)

    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Completed", completed_count)
    m2.metric("Entrants", player_count)
    m3.metric("Top score", top_score)
    m4.metric("Your rank", current_rank)

    if completed_count == 0:
        st.info("The leaderboard will start moving once the first result is entered. Everyone is tied for now.")
    st.caption("Match points come from exact scores, correct goal differences, and correct results. Winner bonuses are shown separately.")


    for row in df.to_dict("records"):
        is_current = row["Player ID"] == current_player_id
        classes = ["tr-leader-row"]
        if row["Bot"]:
            classes.append("tr-leader-row-bot")
        if is_current:
            classes.append("tr-leader-row-current")
        if int(row["Total points"]) == 0:
            classes.append("tr-leader-row-zero")
        rank = int(row["Rank"])
        tied = len(df[df["Total points"] == row["Total points"]]) > 1
        rank_display = leaderboard_rank_label(rank, tied)
        name = escape(leaderboard_player_name(row))
        bot_badge = '<span class="tr-leader-bot">Bot</span>' if row["Bot"] else ""
        you_badge = '<span class="tr-leader-you">You</span>' if is_current else ""
        html = (
            f'<div class="{" ".join(classes)}">'
            f'<div class="tr-leader-rank">{rank_display}</div>'
            '<div class="tr-leader-player">'
            f'<div class="tr-leader-name">{name} {bot_badge} {you_badge}</div>'
            f'<div class="tr-leader-breakdown">Exact {int(row["Exact"])} · '
            f'Goal diff {int(row["Goal diff"])} · Result {int(row["Result"])}</div>'
            "</div>"
            f'<div class="tr-leader-stat"><strong>{int(row["Score points"])}</strong><span>Match</span></div>'
            f'<div class="tr-leader-stat"><strong>{int(row["Winner bonus"])}</strong><span>Winner</span></div>'
            f'<div class="tr-leader-total"><strong>{int(row["Total points"])}</strong><span>Total</span></div>'
            "</div>"
        )
        st.markdown(html, unsafe_allow_html=True)


    progress_df = cumulative_human_scores()
    if not progress_df.empty:
        st.subheader("Score progression")
        st.line_chart(progress_df.set_index("Match"), height=280)


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


def match_centre_prediction_rows(match: dict, predictions: list[dict], players: dict[str, dict], completed: bool) -> str:
    if not predictions:
        return '<div class="tr-centre-empty">No predictions for this match.</div>'

    rows = []
    predictions = sorted(
        predictions,
        key=lambda pred: (
            bool(players.get(pred["player_id"], {}).get("is_bot")),
            str(players.get(pred["player_id"], {}).get("display_name") or "").lower(),
        ),
    )
    for pred in predictions:
        player = players.get(pred["player_id"])
        if not player:
            continue
        details = score_prediction_details(match, pred)
        bot_badge = '<span class="tr-leader-bot">Bot</span>' if player.get("is_bot") else ""
        if completed:
            points = int(details["total_points"])
            reason = score_reason(details)
            result_html = f'<div class="tr-centre-points"><strong>{points}</strong><span>{escape(reason)}</span></div>'
        else:
            result_html = '<div class="tr-centre-points tr-centre-points-pending"><strong>-</strong><span>Pending</span></div>'
        advance = ""
        if match.get("is_knockout") and pred.get("pred_advance_team"):
            advance = f'<div class="tr-centre-advance">Advances: {escape(str(pred["pred_advance_team"]))}</div>'
        rows.append(
            '<div class="tr-centre-row">'
            '<div>'
            f'<div class="tr-centre-player">{player_display_for_centre(player)} {bot_badge}</div>'
            f'<div class="tr-centre-tip">{prediction_scoreline(pred)}{advance}</div>'
            '</div>'
            f'{result_html}'
            '</div>'
        )
    return "".join(rows) if rows else '<div class="tr-centre-empty">No predictions for this match.</div>'


def match_centre_page() -> None:
    st.title("Match Centre")
    settings = load_settings()
    players = {p["id"]: p for p in load_players()}
    player_id = st.session_state.player_id
    all_predictions = load_predictions()
    prediction_by_player_match = prediction_lookup(all_predictions)
    predictions_by_match = defaultdict(list)
    for pred in all_predictions:
        predictions_by_match[pred["match_id"]].append(pred)

    filter_choice = st.segmented_control(
        "Filter",
        ["Open", "Locked", "Completed", "All"],
        default="Open",
    )

    rendered = 0
    for match in load_matches():
        status = match_centre_status(match, settings)
        if filter_choice == "Open" and status != "Open":
            continue
        if filter_choice == "Locked" and status != "Locked":
            continue
        if filter_choice == "Completed" and status != "Completed":
            continue

        rendered += 1
        current_prediction = prediction_by_player_match.get((player_id, match["id"]))
        completed = status == "Completed"
        reveal = status in ("Locked", "Completed")
        pick_text = prediction_summary(current_prediction) or "Your pick: -"
        predictions = predictions_by_match.get(match["id"], [])
        row_html = ""
        if reveal:
            row_html = match_centre_prediction_rows(match, predictions, players, completed)
        elif status != "Open":
            row_html = '<div class="tr-centre-empty">Teams are not set for this fixture yet.</div>'
        body_html = f'<div class="tr-centre-body">{row_html}</div>' if row_html else ""

        st.markdown(
            '<div class="tr-centre-card">'
            '<div class="tr-centre-head">'
            '<div>'
            f'<div class="tr-centre-meta">{status_badge(status, compact=True)} <span>{escape(match_time_summary(match))}</span></div>'
            f'<div class="tr-centre-title">{escape(match_result_line(match))}</div>'
            f'<div class="tr-card-pick">{escape(pick_text)}</div>'
            '</div>'
            '</div>'
            f'{body_html}'
            '</div>',
            unsafe_allow_html=True,
        )

    if rendered == 0:
        st.info("No matches in this view.")


def rules_page() -> None:
    st.title("Rules")
    html = "\n".join(
        [
            panel(
                "Tip the score before kickoff",
                "Matches lock 30 minutes before kickoff. The score is the score at the end of the match, "
                "including extra time if extra time is played. Penalty shootout goals do not count.",
            ),
            section_title("Match points", "For the match score, you get the highest one that applies."),
            points_grid(
                [
                    ("Exact score", "5"),
                    ("Correct goal difference", "4"),
                    ("Correct result", "3"),
                    ("Wrong result", "0"),
                ]
            ),
            section_title("Bonuses"),
            note("Knockout scoring is still under review and will be finalised before the knockout rounds kick off."),
            points_grid(
                [
                    ("Correct knockout advancement", "+2"),
                    ("Correct overall winner", "+10"),
                ]
            ),
            section_title("Examples"),
            example_grid(
                [
                    example_card(
                        "Actual: Australia 2-1 Japan",
                        [
                            ("Australia 2-1 Japan", "Exact score", "5"),
                            ("Australia 1-0 Japan", "Correct goal difference", "4"),
                            ("Australia 3-1 Japan", "Correct result", "3"),
                            ("Australia 1-1 Japan", "Wrong result", "0"),
                        ],
                    ),
                    example_card(
                        "Actual: England 1-1 USA",
                        [
                            ("England 1-1 USA", "Exact score", "5"),
                            ("England 0-0 USA", "Correct goal difference", "4"),
                            ("England 2-2 USA", "Correct goal difference", "4"),
                            ("England 2-1 USA", "Wrong result", "0"),
                        ],
                    ),
                ]
            ),
            section_title("Knockout matches"),
            panel(
                "Pick who progresses",
                "If you predict a draw in a knockout match, choose who progresses. Advancement points are "
                "added separately from score points.",
            ),
            muted("Bots are computer players for fun and appear on the leaderboard."),
        ]
    )
    st.markdown(html, unsafe_allow_html=True)


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


def group_standings() -> dict[str, list[dict]]:
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
        a = standings[group].setdefault(match["team_a"], {"Team": match["team_a"], "P": 0, "W": 0, "D": 0, "L": 0, "GF": 0, "GA": 0, "GD": 0, "Pts": 0})
        b = standings[group].setdefault(match["team_b"], {"Team": match["team_b"], "P": 0, "W": 0, "D": 0, "L": 0, "GF": 0, "GA": 0, "GD": 0, "Pts": 0})
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


def apply_result_updates(updates: list[dict]) -> int:
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
                "imported_by": st.session_state.get("player_id"),
            }
        ).execute()
    except Exception:
        pass
    return len(updates)


def settings_admin() -> None:
    settings = load_settings()
    teams = load_teams()
    st.subheader("Settings")
    with st.form("settings_form"):
        deadline_raw = settings.get("winner_pick_deadline")
        deadline_dt = parse_dt(deadline_raw).astimezone(SYDNEY) if deadline_raw else None
        date_value = deadline_dt.date() if deadline_dt else None
        time_value = deadline_dt.time() if deadline_dt else None
        d = st.date_input("Winner pick deadline date", value=date_value)
        t = st.time_input("Winner pick deadline time", value=time_value)
        final_options = [""] + [team["name"] for team in teams]
        current_final = settings.get("final_winner") or ""
        final_winner = st.selectbox(
            "Final tournament winner",
            final_options,
            index=final_options.index(current_final) if current_final in final_options else 0,
        )
        lock_minutes = st.number_input("Lock minutes before kickoff", min_value=0, max_value=240, value=int(settings.get("lock_minutes_before_kickoff") or 30))
        allow_player_signup = st.toggle(
            "Allow family members to create players",
            value=bool(settings.get("allow_player_signup", True)),
        )
        submitted = st.form_submit_button("Save settings")
    if submitted:
        local_deadline = datetime.combine(d, t, tzinfo=SYDNEY) if d and t else None
        payload = {
            "id": 1,
            "winner_pick_deadline": iso_dt(local_deadline),
            "final_winner": final_winner or None,
            "lock_minutes_before_kickoff": int(lock_minutes),
            "allow_player_signup": allow_player_signup,
            "timezone": "Australia/Sydney",
            "updated_at": iso_dt(now_utc()),
        }
        try:
            db().table("settings").upsert(payload, on_conflict="id").execute()
            clear_data_cache()
            st.success("Settings saved.")
            st.rerun()
        except Exception as exc:
            if "allow_player_signup" in str(exc):
                st.error("The settings table needs the latest schema migration. Re-run sql/schema.sql in Supabase.")
            else:
                st.error("Settings could not be saved.")
            with st.expander("Technical detail"):
                st.code(str(exc))


def import_admin() -> None:
    st.subheader("Archive import")
    st.write("Imports teams, stages, group matches, and knockout fixture shells from the local archive CSVs.")
    if st.button("Import archive fixture CSVs", type="primary"):
        try:
            team_count, match_count = import_archive_fixture_csvs()
            st.success(f"Imported {team_count} teams and {match_count} matches.")
        except Exception as exc:
            st.error("Import failed.")
            with st.expander("Technical detail"):
                st.code(str(exc))


def round_of_32_admin() -> None:
    st.subheader("Round of 32 setup")
    teams = [t["name"] for t in load_teams()]
    if not teams:
        st.info("Import teams first.")
        return
    r32_matches = [m for m in load_matches() if m.get("stage") == "Round of 32"]
    if not r32_matches:
        st.info("No Round of 32 fixtures found.")
        return
    for match in r32_matches:
        with st.expander(f"Match {match.get('match_number')}: {match.get('match_label')}"):
            with st.form(f"r32_{match['id']}"):
                options = [""] + teams
                idx_a = options.index(match.get("team_a")) if match.get("team_a") in options else 0
                idx_b = options.index(match.get("team_b")) if match.get("team_b") in options else 0
                team_a = st.selectbox("First team", options, index=idx_a, key=f"r32a_{match['id']}")
                team_b = st.selectbox("Second team", options, index=idx_b, key=f"r32b_{match['id']}")
                submitted = st.form_submit_button("Save teams")
            if submitted:
                if not team_a or not team_b or team_a == team_b:
                    st.error("Choose two different teams.")
                else:
                    try:
                        assign_round_of_32_match(match, team_a, team_b)
                        st.success("Round of 32 fixture updated.")
                        st.rerun()
                    except Exception as exc:
                        st.error(str(exc))


def result_admin() -> None:
    st.subheader("Results")
    matches = load_matches()
    if not matches:
        st.info("No matches yet.")
        return

    tab_edit, tab_upload, tab_single = st.tabs(["Edit Table", "Upload CSV", "Single match"])

    with tab_edit:
        rows = result_editor_rows(matches)
        if not rows:
            st.info("No fixtures with teams are ready for results yet.")
        else:
            st.caption("Edit scores directly, preview the changes, then confirm the save.")
            edited = st.data_editor(
                pd.DataFrame(rows),
                key="results_table_editor",
                use_container_width=True,
                hide_index=True,
                num_rows="fixed",
                disabled=[
                    "match_number",
                    "kickoff",
                    "stage",
                    "team_a",
                    "team_a_code",
                    "team_b_code",
                    "team_b",
                ],
                column_order=[
                    "match_number",
                    "kickoff",
                    "stage",
                    "team_a",
                    "team_a_code",
                    "team_a_score",
                    "team_b_score",
                    "team_b_code",
                    "team_b",
                    "status",
                    "advance_team_code",
                ],
                column_config={
                    "match_number": st.column_config.NumberColumn("Match", width="small"),
                    "kickoff": st.column_config.TextColumn("Kickoff", width="medium"),
                    "stage": st.column_config.TextColumn("Stage", width="small"),
                    "team_a": st.column_config.TextColumn("Team A", width="medium"),
                    "team_a_code": st.column_config.TextColumn("A code", width="small"),
                    "team_a_score": st.column_config.NumberColumn("A score", min_value=0, max_value=30, step=1),
                    "team_b_score": st.column_config.NumberColumn("B score", min_value=0, max_value=30, step=1),
                    "team_b_code": st.column_config.TextColumn("B code", width="small"),
                    "team_b": st.column_config.TextColumn("Team B", width="medium"),
                    "status": st.column_config.SelectboxColumn("Status", options=list(RESULT_STATUSES)),
                    "advance_team_code": st.column_config.TextColumn("Advances", width="small"),
                },
            )

            updates, errors, _unchanged = build_result_updates_from_table(edited)
            if errors:
                st.error("Fix these rows before saving.")
                st.dataframe(pd.DataFrame(errors), use_container_width=True, hide_index=True)

            if updates:
                st.write(f"{len(updates)} result change(s) ready to apply.")
                st.dataframe(
                    pd.DataFrame([update["preview"] for update in updates]),
                    use_container_width=True,
                    hide_index=True,
                )
            else:
                st.info("No result changes found in the table.")

            if st.button("Confirm and save table results", type="primary", disabled=bool(errors) or not updates):
                try:
                    saved = apply_result_updates(updates)
                    st.success(f"Saved {saved} result change(s).")
                    st.rerun()
                except Exception as exc:
                    st.error(str(exc))

    with tab_upload:
        st.caption(
            "Upload `archive/results.csv`. Required columns: `match_number`, `team_a_code`, "
            "`team_b_code`, `team_a_score`, `team_b_score`. For tied knockout matches, "
            "also set `advance_team_code`."
        )
        uploaded = st.file_uploader("Results CSV", type="csv")
        if uploaded:
            try:
                updates, errors, unchanged = build_result_updates_from_csv(uploaded)
            except Exception as exc:
                st.error("Could not read that CSV.")
                with st.expander("Technical detail"):
                    st.code(str(exc))
                return

            if errors:
                st.error("Fix these CSV rows before saving.")
                st.dataframe(pd.DataFrame(errors), use_container_width=True, hide_index=True)

            if updates:
                st.write(f"{len(updates)} result change(s) ready to apply.")
                st.dataframe(
                    pd.DataFrame([update["preview"] for update in updates]),
                    use_container_width=True,
                    hide_index=True,
                )
            else:
                st.info("No result changes found in that CSV.")

            if unchanged:
                st.caption(f"{unchanged} row(s) already matched the current saved result.")

            confirm_disabled = bool(errors) or not updates
            if st.button("Confirm and save CSV results", type="primary", disabled=confirm_disabled):
                try:
                    saved = apply_result_updates(updates)
                    st.success(f"Saved {saved} result change(s).")
                    st.rerun()
                except Exception as exc:
                    st.error(str(exc))

    with tab_single:
        labels = [
            f"{m.get('match_number')}: {matchup_label(m)} (Sydney {local_label(m.get('kickoff_time'))})"
            for m in matches
        ]
        selected_label = st.selectbox("Match", labels)
        match = matches[labels.index(selected_label)]
        if not has_teams(match):
            st.warning("Set both teams before entering a result.")
            return
        with st.form("result_form"):
            c1, c2, c3 = st.columns([2, 1, 2])
            score_a = c1.number_input(match["team_a"], min_value=0, max_value=30, value=int(match.get("team_a_score") or 0))
            c2.markdown("### -")
            score_b = c3.number_input(match["team_b"], min_value=0, max_value=30, value=int(match.get("team_b_score") or 0))
            status = st.selectbox(
                "Status",
                ["scheduled", "completed", "cancelled", "postponed"],
                index=["scheduled", "completed", "cancelled", "postponed"].index(match.get("status") or "scheduled"),
            )
            advance_team = None
            if match.get("is_knockout"):
                options = [match["team_a"], match["team_b"]]
                existing = match.get("advance_team")
                advance_team = st.selectbox("Team advanced", options, index=options.index(existing) if existing in options else 0)
            submitted = st.form_submit_button("Save result")
        if submitted:
            try:
                save_result(match, int(score_a), int(score_b), advance_team, status)
                st.success("Result saved.")
                st.rerun()
            except Exception as exc:
                st.error(str(exc))


def bot_admin() -> None:
    st.subheader("Bots")
    if st.button("Ensure default bots exist"):
        ensure_default_bots()
        st.success("Default bots are ready.")
    cols = st.columns(4)
    for i, (bot_type, spec) in enumerate(BOT_SPECS.items()):
        if cols[i].button(f"Generate {spec['display_name']} predictions"):
            count = generate_bot_predictions(bot_type)
            st.success(f"Generated {count} predictions.")
    if cols[3].button("Generate bot winner picks"):
        count = generate_bot_winner_picks()
        st.success(f"Generated {count} winner picks.")


def backup_admin() -> None:
    st.subheader("Backups")
    tables = {
        "players": load_players(include_inactive=True),
        "teams": load_teams(active_only=False),
        "matches": load_matches(),
        "predictions": load_predictions(),
        "winner_picks": load_winner_picks(),
        "settings": [load_settings()],
    }
    for name, rows in tables.items():
        df = pd.DataFrame(rows)
        st.download_button(
            f"Download {name}.csv",
            df.to_csv(index=False).encode("utf-8"),
            file_name=f"{name}.csv",
            mime="text/csv",
        )


def standings_admin() -> None:
    st.subheader("Group standings")
    standings = group_standings()
    if not standings:
        st.info("No teams imported yet.")
        return
    for group, rows in standings.items():
        st.write(f"Group {group}")
        st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)


def admin_page() -> None:
    st.title("Admin")
    tab_setup, tab_settings, tab_import, tab_results, tab_r32, tab_bots, tab_standings, tab_backups = st.tabs(
        ["Setup", "Settings", "Import", "Results", "Round of 32", "Bots", "Standings", "Backups"]
    )
    with tab_setup:
        setup_status_page(app_setup_state())
    with tab_settings:
        settings_admin()
    with tab_import:
        import_admin()
    with tab_results:
        result_admin()
    with tab_r32:
        round_of_32_admin()
    with tab_bots:
        bot_admin()
    with tab_standings:
        standings_admin()
    with tab_backups:
        backup_admin()


def main() -> None:
    inject_styles()
    cleared_cookie = emit_pending_cookie_update()
    if not cleared_cookie:
        restore_session_from_cookie()
    if "player_id" not in st.session_state:
        login_page()
        return

    page = sidebar()
    if page == "My Predictions":
        my_predictions_page()
    elif page == "Leaderboard":
        leaderboard_page()
    elif page == "Match Centre":
        match_centre_page()
    elif page == "Rules":
        rules_page()
    elif page == "Admin":
        admin_page()


if __name__ == "__main__":
    main()
