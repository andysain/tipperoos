from __future__ import annotations

import random
import re

import bcrypt

from tipperoos.core.constants import BOT_SPECS
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
