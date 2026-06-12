from __future__ import annotations

import copy
from functools import wraps
from threading import RLock
from time import monotonic
from typing import Callable, ParamSpec, TypeVar


P = ParamSpec("P")
T = TypeVar("T")

_lock = RLock()
_stores: list[dict] = []


def ttl_cache(seconds: float):
    def _decorator(func: Callable[P, T]) -> Callable[P, T]:
        store: dict[tuple, tuple[float, T]] = {}
        _stores.append(store)

        @wraps(func)
        def _wrapped(*args: P.args, **kwargs: P.kwargs) -> T:
            key = (args, tuple(sorted(kwargs.items())))
            now = monotonic()
            with _lock:
                cached = store.get(key)
                if cached and now - cached[0] < seconds:
                    return copy.deepcopy(cached[1])
            value = func(*args, **kwargs)
            with _lock:
                store[key] = (now, copy.deepcopy(value))
            return value

        return _wrapped

    return _decorator


def clear_ttl_caches() -> None:
    with _lock:
        for store in _stores:
            store.clear()
