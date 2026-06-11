from __future__ import annotations

import base64
import hashlib
import hmac
import json
import random
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from html import escape
from pathlib import Path
from statistics import median
from zoneinfo import ZoneInfo

import bcrypt
import pandas as pd
import streamlit as st
import streamlit.components.v1 as components
from dateutil import parser
from supabase import Client, create_client

APP_TITLE = "Tipperoos"
SESSION_COOKIE_NAME = "tipperoos_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 60
SYDNEY = ZoneInfo("Australia/Sydney")
ARCHIVE_DIR = Path(__file__).parent / "archive"
HOST_CITY_TIMEZONES = {
    "Atlanta": "America/New_York",
    "Boston": "America/New_York",
    "Dallas": "America/Chicago",
    "Houston": "America/Chicago",
    "Kansas City": "America/Chicago",
    "Los Angeles": "America/Los_Angeles",
    "Miami": "America/New_York",
    "New York/New Jersey": "America/New_York",
    "Philadelphia": "America/New_York",
    "San Francisco Bay Area": "America/Los_Angeles",
    "Seattle": "America/Los_Angeles",
    "Toronto": "America/Toronto",
    "Vancouver": "America/Vancouver",
    "Guadalajara": "America/Mexico_City",
    "Mexico City": "America/Mexico_City",
    "Monterrey": "America/Monterrey",
}
FIFA_FLAG_EMOJIS = {
    "ALG": "🇩🇿",
    "ARG": "🇦🇷",
    "AUS": "🇦🇺",
    "AUT": "🇦🇹",
    "BEL": "🇧🇪",
    "BIH": "🇧🇦",
    "BRA": "🇧🇷",
    "CAN": "🇨🇦",
    "CIV": "🇨🇮",
    "COD": "🇨🇩",
    "COL": "🇨🇴",
    "CPV": "🇨🇻",
    "CRO": "🇭🇷",
    "CUR": "🇨🇼",
    "CZE": "🇨🇿",
    "ECU": "🇪🇨",
    "EGY": "🇪🇬",
    "ENG": "🏴",
    "ESP": "🇪🇸",
    "FRA": "🇫🇷",
    "GER": "🇩🇪",
    "GHA": "🇬🇭",
    "HAI": "🇭🇹",
    "IRN": "🇮🇷",
    "IRQ": "🇮🇶",
    "JOR": "🇯🇴",
    "JPN": "🇯🇵",
    "KOR": "🇰🇷",
    "KSA": "🇸🇦",
    "MAR": "🇲🇦",
    "MEX": "🇲🇽",
    "NED": "🇳🇱",
    "NOR": "🇳🇴",
    "NZL": "🇳🇿",
    "PAN": "🇵🇦",
    "PAR": "🇵🇾",
    "POR": "🇵🇹",
    "QAT": "🇶🇦",
    "RSA": "🇿🇦",
    "SCO": "🏴",
    "SEN": "🇸🇳",
    "SUI": "🇨🇭",
    "SWE": "🇸🇪",
    "TUN": "🇹🇳",
    "TUR": "🇹🇷",
    "URU": "🇺🇾",
    "USA": "🇺🇸",
    "UZB": "🇺🇿",
}
BOT_SPECS = {
    "random": {"username": "bot_random", "display_name": "Random Bot"},
    "median": {"username": "bot_median", "display_name": "Median Bot"},
    "one_one": {"username": "bot_one_one", "display_name": "1-1 Bot"},
}
SCORE_POOL = [0, 0, 1, 1, 1, 2, 2, 3]
PLAYER_EMOJIS = [
    "",
    "😈",
    "🏆",
    "⚽",
    "🔥",
    "⭐",
    "🎯",
    "🦘",
    "🇦🇺",
    "🇳🇿",
    "🇧🇷",
    "🇦🇷",
    "🇯🇵",
    "🇫🇷",
    "🇮🇹",
    "🇪🇸",
    "🇬🇧",
    "Other",
]


st.set_page_config(page_title=APP_TITLE, page_icon="T", layout="wide")


def inject_styles() -> None:
    st.markdown(
        """
        <style>
        .block-container {
            max-width: 1180px;
            padding-top: 2.4rem;
            padding-bottom: 4rem;
        }
        h1, h2, h3 {
            letter-spacing: 0;
        }
        div[data-testid="stForm"] {
            border-radius: 8px;
        }
        div[data-testid="stMetricValue"] {
            font-size: 1.75rem;
        }
        .tr-card-title {
            font-size: 1.28rem;
            font-weight: 750;
            margin-bottom: 0.25rem;
        }
        .tr-card-meta {
            color: #6b7280;
            font-size: 0.95rem;
            line-height: 1.35;
            margin-bottom: 0;
        }
        .tr-card-pick {
            color: #9ca3af;
            font-size: 0.98rem;
            font-weight: 650;
            line-height: 1.35;
            margin-bottom: 0.8rem;
        }
        .tr-team-label {
            font-size: 1.35rem;
            font-weight: 800;
            color: #111827;
            margin-bottom: 0.35rem;
        }
        .tr-card-top {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            flex-wrap: wrap;
            gap: 0.5rem 0.75rem;
            margin-bottom: 0.35rem;
        }
        .tr-muted {
            color: #6b7280;
            font-size: 0.92rem;
            line-height: 1.35;
        }
        .tr-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 84px;
            padding: 0.25rem 0.65rem;
            border-radius: 999px;
            font-size: 0.82rem;
            font-weight: 750;
            border: 1px solid transparent;
            white-space: nowrap;
        }
        .tr-badge-open {
            background: #ecfdf5;
            color: #047857;
            border-color: #a7f3d0;
        }
        .tr-badge-saved {
            background: #eff6ff;
            color: #1d4ed8;
            border-color: #bfdbfe;
        }
        .tr-badge-locked {
            background: #f3f4f6;
            color: #374151;
            border-color: #d1d5db;
        }
        .tr-badge-missed {
            background: #fef2f2;
            color: #b91c1c;
            border-color: #fecaca;
        }
        .tr-badge-completed {
            background: #fff7ed;
            color: #c2410c;
            border-color: #fed7aa;
        }
        .tr-badge-tbc {
            background: #f8fafc;
            color: #475569;
            border-color: #cbd5e1;
        }
        .tr-score-preview {
            font-size: 1.75rem;
            font-weight: 800;
            text-align: center;
            padding-top: 0.85rem;
        }
        @media (max-width: 640px) {
            .block-container {
                padding-left: 1rem;
                padding-right: 1rem;
                padding-top: 1.2rem;
            }
            .tr-card-title {
                font-size: 1rem;
            }
            .tr-score-preview {
                font-size: 1.25rem;
                padding-top: 0;
            }
            .tr-card-top {
                align-items: center;
                gap: 0.4rem 0.55rem;
            }
            .tr-team-label {
                font-size: 1.12rem;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def parse_dt(value) -> datetime | None:
    if value in (None, "") or pd.isna(value):
        return None
    dt = parser.parse(str(value))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=SYDNEY)
    return dt.astimezone(timezone.utc)


def parse_host_kickoff(value, city_name: str) -> datetime | None:
    if value in (None, "") or pd.isna(value):
        return None
    host_tz_name = HOST_CITY_TIMEZONES.get(city_name)
    if not host_tz_name:
        return parse_dt(value)
    # The archive stores host-local wall-clock kickoff times with numeric offsets.
    # Re-attach the named host timezone so daylight saving rules come from the city,
    # not from a potentially stale CSV offset.
    naive = parser.parse(str(value)).replace(tzinfo=None)
    return naive.replace(tzinfo=ZoneInfo(host_tz_name)).astimezone(timezone.utc)


def iso_dt(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).isoformat()


def local_label(value) -> str:
    dt = parse_dt(value)
    if not dt:
        return "-"
    return dt.astimezone(SYDNEY).strftime("%a %d %b, %I:%M %p")


def host_local_label(value, city_name: str | None) -> str:
    dt = parse_dt(value)
    if not dt or not city_name:
        return "-"
    tz_name = HOST_CITY_TIMEZONES.get(city_name)
    if not tz_name:
        return "-"
    return dt.astimezone(ZoneInfo(tz_name)).strftime("%a %d %b, %I:%M %p")


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
    return execute(db().table("matches").select("*").order("kickoff_time"))


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
    rows = execute(db().table("matches").select("*").eq("id", match_id).limit(1))
    return rows[0] if rows else None


def prediction_lookup(predictions: list[dict]) -> dict[tuple[str, str], dict]:
    return {(p["player_id"], p["match_id"]): p for p in predictions}


def winner_lookup(winner_picks: list[dict]) -> dict[str, dict]:
    return {p["player_id"]: p for p in winner_picks}


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


def status_badge(status: str) -> str:
    colors = {
        "Open": ("#ecfdf5", "#047857", "#a7f3d0"),
        "Saved": ("#eff6ff", "#1d4ed8", "#bfdbfe"),
        "Locked": ("#f3f4f6", "#374151", "#d1d5db"),
        "Missed": ("#fef2f2", "#b91c1c", "#fecaca"),
        "Completed": ("#fff7ed", "#c2410c", "#fed7aa"),
        "To be confirmed": ("#f8fafc", "#475569", "#cbd5e1"),
    }
    background, color, border = colors.get(status, colors["Locked"])
    return (
        f'<span style="display:inline-flex;align-items:center;justify-content:center;'
        f'min-width:84px;padding:0.25rem 0.65rem;border-radius:999px;'
        f'font-size:0.82rem;font-weight:750;white-space:nowrap;'
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
    points = 0

    if sign(actual_diff) == sign(pred_diff):
        points += 3
    if actual_diff == pred_diff:
        points += 2
    if pred_a == actual_a:
        points += 1
    if pred_b == actual_b:
        points += 1
    if pred_a == actual_a and pred_b == actual_b:
        points += 5
    if match.get("is_knockout") and prediction.get("pred_advance_team") == match.get("advance_team"):
        points += 2
    return points


def score_winner_pick(settings: dict, pick: dict | None) -> int:
    if not pick or not settings.get("final_winner"):
        return 0
    return 10 if pick.get("team") == settings.get("final_winner") else 0


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
            "emoji": "Bot",
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

    pages = ["My Predictions", "Rules"]
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
        match_points = sum(score_prediction(m, predictions.get((player["id"], m["id"]))) for m in matches)
        winner_bonus = score_winner_pick(settings, winners.get(player["id"]))
        name = player["display_name"]
        if player.get("is_bot"):
            name = f"{name} (Bot)"
        rows.append(
            {
                "Player": name,
                "Match points": match_points,
                "Winner bonus": winner_bonus,
                "Total points": match_points + winner_bonus,
            }
        )
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df = df.sort_values(["Total points", "Player"], ascending=[False, True]).reset_index(drop=True)
    df.insert(0, "Rank", range(1, len(df) + 1))
    return df


def leaderboard_page() -> None:
    st.title("Leaderboard")
    df = calculate_leaderboard()
    if df.empty:
        st.info("No players yet.")
    else:
        st.dataframe(df, hide_index=True, use_container_width=True)


def match_centre_page() -> None:
    st.title("Match Centre")
    settings = load_settings()
    players = {p["id"]: p for p in load_players()}
    predictions = load_predictions()
    predictions_by_match = defaultdict(list)
    for pred in predictions:
        predictions_by_match[pred["match_id"]].append(pred)

    for match in load_matches():
        with st.expander(f"Sydney {local_label(match.get('kickoff_time'))} | {matchup_label(match)}"):
            st.caption(f"{match.get('stage')} | {match.get('match_label') or ''}")
            st.write(f"Host kickoff: {host_local_label(match.get('kickoff_time'), match.get('city'))} ({match.get('city') or 'host city'})")
            if match.get("status") == "completed":
                st.write(f"Result: {match.get('team_a_score')} - {match.get('team_b_score')}")
                if match.get("advance_team"):
                    st.write(f"Advanced: {match['advance_team']}")

            locked = is_match_locked(match, settings)
            rows = []
            for pred in predictions_by_match.get(match["id"], []):
                player = players.get(pred["player_id"])
                if not player:
                    continue
                if not locked and pred["player_id"] != st.session_state.player_id:
                    continue
                rows.append(
                    {
                        "Player": f"{player['display_name']}{' (Bot)' if player.get('is_bot') else ''}",
                        "Prediction": f"{pred['pred_team_a_score']}-{pred['pred_team_b_score']}",
                        "Advance": pred.get("pred_advance_team") or "",
                        "Points": score_prediction(match, pred),
                    }
                )
            if rows:
                st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
            elif not locked:
                st.info("Other predictions hidden until this match locks.")
            else:
                st.info("No predictions for this match.")


def rules_page() -> None:
    st.title("Rules")
    st.markdown(
        """
        Make a score prediction for each match before it locks. Matches lock 30 minutes before kickoff.

        The score is the score at the end of the match, including extra time if extra time is played.
        Penalty shootout goals do not count in the score.

        For knockout matches, if you predict a draw, choose who progresses.

        Points:

        | Prediction item | Points |
        | --- | ---: |
        | Correct result | 3 |
        | Correct goal difference | 2 |
        | Correct Team A score | 1 |
        | Correct Team B score | 1 |
        | Exact full score bonus | 5 |
        | Correct knockout advancement | 2 |
        | Correct overall winner | 10 |

        Bots are computer players for fun and appear on the leaderboard.
        """
    )


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

    db().table("matches").update(
        {
            "status": status,
            "team_a_score": score_a if status == "completed" else None,
            "team_b_score": score_b if status == "completed" else None,
            "advance_team": advance_team,
            "result_updated_at": result_updated_at,
            "updated_at": iso_dt(now_utc()),
        }
    ).eq("id", match["id"]).execute()
    clear_data_cache()

    if status == "completed":
        generate_bot_predictions(only_match_id=match["id"])
        generate_bot_winner_picks()
        propagate_knockout_matchups()


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
    labels = [
        f"{m.get('match_number')}: {matchup_label(m)} (Sydney {local_label(m.get('kickoff_time'))})"
        for m in matches
    ]
    if not labels:
        st.info("No matches yet.")
        return
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
