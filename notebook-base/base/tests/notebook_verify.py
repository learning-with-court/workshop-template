"""Notebook-medium verification helpers, shared by every notebook workshop.

Synced from workshop-template's notebook-base. Do not edit in a member repo:
`validate-notebook-base` fails on local drift. Change it in the template and
cut a new notebook-base-vN.

Everything here is MECHANICAL: reading the state file a lesson writes, and
reading execution evidence out of the learner's saved notebook. Nothing here
knows what your workshop teaches, which SDK it calls, or how it grades.

Workshop-specific helpers (a platform client, a server-side artifact check)
belong in your own `tests/conftest.py`, which is not synced. The dividing
line: would a notebook workshop with the opposite teaching style, on a
different platform, still need this? If yes it belongs here; if no it belongs
in your conftest.

Verification is DIAGNOSTIC, not a grader. These helpers PRINT what they find
so the guide can judge and coach. Assert only on hard facts a completed lesson
must have produced.

Typical use, in a member's tests/conftest.py:

    import pytest
    from notebook_verify import (  # noqa: F401 — re-exported for tests
        ROOT, STATE_FILE, load_state, print_state, notebook_execution_report,
    )

    @pytest.fixture
    def state() -> dict:
        return load_state()
"""
from __future__ import annotations

import json
from pathlib import Path

# tests/ sits at the repo root once composed, so parents[1] is the repo root.
ROOT = Path(__file__).resolve().parents[1]
STATE_FILE = ROOT / "_workshop_state.json"


def load_state() -> dict:
    """The state a lesson has persisted, or {} when nothing has run yet."""
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


def print_state(keys: list[str] | None = None) -> dict:
    """Print the state file (or just `keys`) and return the parsed state.

    Prints rather than asserts: a missing key is information for the guide,
    not necessarily a failure.
    """
    state = load_state()
    print("── STATE ──")
    if not STATE_FILE.exists():
        print(f"{STATE_FILE.name} does not exist yet — no lesson has saved state.")
    elif keys:
        for k in keys:
            print(f"{k} = {state.get(k, '<missing>')}")
    else:
        print(json.dumps(state, indent=2))
    return state


def notebook_execution_report(module: str) -> dict:
    """Print execution evidence from the learner's saved notebook.

    Returns {"exists": bool, "executed": int, "unexecuted": int,
    "errors": [(cell_index, ename, evalue)]}.

    Missing outputs are NOT treated as "not attempted" — outputs may have been
    cleared, and in a presented workshop the guide drove the cells anyway. The
    guide judges with context; this only reports.
    """
    import nbformat

    nb_path = ROOT / "notebooks" / f"{module}.ipynb"
    report = {"exists": nb_path.exists(), "executed": 0, "unexecuted": 0, "errors": []}
    print("── NOTEBOOK ──")
    if not nb_path.exists():
        print(f"notebooks/{module}.ipynb not found — not materialized or not opened yet.")
        return report
    nb = nbformat.read(str(nb_path), as_version=4)
    for i, cell in enumerate(nb.cells):
        if cell.cell_type != "code":
            continue
        if cell.get("execution_count"):
            report["executed"] += 1
        else:
            report["unexecuted"] += 1
        for out in cell.get("outputs", []):
            if out.get("output_type") == "error":
                report["errors"].append((i, out.get("ename"), out.get("evalue")))
    print(
        f"code cells executed: {report['executed']}, "
        f"not yet executed: {report['unexecuted']}, "
        f"errors: {len(report['errors'])}"
    )
    for i, ename, evalue in report["errors"]:
        print(f"  cell {i}: {ename}: {evalue}")
    return report


def load_dotenv_into(environ, keys: list[str] | None = None) -> None:
    """Best-effort .env loader, for verify paths that run outside the kernel.

    Notebooks load .env through the workshop's own setup helper; pytest does
    not, so a verify path that needs a credential has to load it itself.
    Existing environment values always win (`setdefault`), so a real
    environment variable is never overwritten by a stale .env line.

    Mechanical on purpose: it does not know WHICH keys your workshop needs, and
    it never prints or logs a value.
    """
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"')
        if keys is None or k in keys:
            environ.setdefault(k, v)
