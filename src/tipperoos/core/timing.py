from __future__ import annotations

from concurrent.futures import Executor, Future
from contextlib import contextmanager
from contextvars import ContextVar, copy_context
from dataclasses import dataclass
from functools import wraps
from time import perf_counter
from typing import Callable, Iterator, ParamSpec, TypeVar


F = TypeVar("F", bound=Callable)
P = ParamSpec("P")
T = TypeVar("T")


@dataclass(frozen=True)
class TimingRecord:
    label: str
    elapsed_ms: float


_records: ContextVar[list[TimingRecord] | None] = ContextVar("tipperoos_timing_records", default=None)


def reset_timings() -> None:
    _records.set([])


def get_timings() -> list[TimingRecord]:
    return list(_records.get() or [])


def record_timing(label: str, elapsed_ms: float) -> None:
    records = _records.get()
    if records is not None:
        records.append(TimingRecord(label=label, elapsed_ms=elapsed_ms))


@contextmanager
def timed(label: str) -> Iterator[None]:
    start = perf_counter()
    try:
        yield
    finally:
        record_timing(label, (perf_counter() - start) * 1000)


def timed_function(label: str):
    def _decorator(func: F) -> F:
        @wraps(func)
        def _wrapped(*args, **kwargs):
            with timed(label):
                return func(*args, **kwargs)

        return _wrapped  # type: ignore[return-value]

    return _decorator


def submit_with_timing(
    executor: Executor,
    func: Callable[P, T],
    *args: P.args,
    **kwargs: P.kwargs,
) -> Future[T]:
    context = copy_context()
    return executor.submit(lambda: context.run(func, *args, **kwargs))
