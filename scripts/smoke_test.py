from __future__ import annotations

import compileall
import importlib
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


def main() -> int:
    sys.path.insert(0, str(ROOT))
    sys.path.insert(0, str(SRC))

    ok = compileall.compile_file(str(ROOT / "app.py"), quiet=1)
    ok = compileall.compile_dir(str(SRC), quiet=1) and ok
    if not ok:
        return 1

    for module in (
        "app",
        "tipperoos.core.scoring",
        "tipperoos.core.timing",
        "tipperoos.data.store",
        "tipperoos.services.actions",
        "tipperoos.services.analytics",
        "tipperoos.services.views.predictions_view",
        "tipperoos.services.views.match_centre_view",
    ):
        importlib.import_module(module)

    print("smoke test ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
