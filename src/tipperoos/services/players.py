from __future__ import annotations

import random
import re

import bcrypt

from tipperoos.core.constants import BOT_SPECS
from tipperoos.core.time_utils import iso_dt, now_utc
from tipperoos.data.store import clear_data_cache, db, load_players


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


def update_player_identity(player_id: str, display_name: str, emoji: str = "") -> None:
    if not display_name.strip():
        raise ValueError("Display name is required.")
    db().table("players").update(
        {
            "display_name": display_name.strip(),
            "emoji": emoji.strip() or None,
            "updated_at": iso_dt(now_utc()),
        }
    ).eq("id", player_id).execute()
    clear_data_cache()


def update_player_access(player_id: str, active: bool, inactive_reason: str = "") -> None:
    db().table("players").update(
        {
            "active": active,
            "inactive_reason": None if active else inactive_reason.strip() or None,
            "updated_at": iso_dt(now_utc()),
        }
    ).eq("id", player_id).execute()
    clear_data_cache()


def update_player_late_join(player_id: str, late_join_match_number: int | None, starting_points: int) -> None:
    if late_join_match_number is not None and late_join_match_number < 1:
        raise ValueError("Starting match must be 1 or later.")
    db().table("players").update(
        {
            "late_join_match_number": late_join_match_number,
            "starting_points": int(starting_points),
            "updated_at": iso_dt(now_utc()),
        }
    ).eq("id", player_id).execute()
    clear_data_cache()


def reset_player_pin(player_id: str, pin: str) -> None:
    if not (pin.isdigit() and len(pin) in (4, 6)):
        raise ValueError("PIN must be 4 or 6 digits.")
    db().table("players").update(
        {
            "pin_hash": hash_pin(pin),
            "updated_at": iso_dt(now_utc()),
        }
    ).eq("id", player_id).execute()
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
