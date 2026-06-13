from __future__ import annotations

from pathlib import Path
from zoneinfo import ZoneInfo

APP_TITLE = "Tipperoos"
SESSION_COOKIE_NAME = "tipperoos_session"
SESSION_QUERY_PARAM = "tr_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 60
SYDNEY = ZoneInfo("Australia/Sydney")
ARCHIVE_DIR = Path(__file__).resolve().parents[3] / "archive"
ELO_BOT_DIR = Path(__file__).resolve().parents[3] / "elo_bot"

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
    "elo": {"username": "bot_elo", "display_name": "Elo Bot"},
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
