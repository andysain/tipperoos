from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import timedelta

from tipperoos.core.constants import SESSION_MAX_AGE_SECONDS
from tipperoos.core.time_utils import now_utc


def make_session_token(player_id: str, secret: bytes) -> str:
    payload = {
        "player_id": player_id,
        "exp": int((now_utc() + timedelta(seconds=SESSION_MAX_AGE_SECONDS)).timestamp()),
    }
    payload_raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_raw).decode("ascii").rstrip("=")
    signature = hmac.new(secret, payload_b64.encode("ascii"), hashlib.sha256).digest()
    signature_b64 = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"{payload_b64}.{signature_b64}"


def validate_session_token(token: str | None, secret: bytes) -> str | None:
    if not token or "." not in token:
        return None
    try:
        payload_b64, signature_b64 = token.split(".", 1)
        expected = hmac.new(secret, payload_b64.encode("ascii"), hashlib.sha256).digest()
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
