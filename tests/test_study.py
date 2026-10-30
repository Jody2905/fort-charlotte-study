import json
import math
import re
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "analysis"))
import analyze  # noqa: E402
import simulate  # noqa: E402
from geometry import Grid, load_layout, obstacles  # noqa: E402


@pytest.fixture(scope="module")
def layout():
    return load_layout()


@pytest.fixture(scope="module")
def grid(layout):
    return Grid(layout)


def test_layout_targets_are_reachable_and_clear(layout, grid):
    start = (layout["start"]["x"], layout["start"]["z"])
    for t in layout["targets"] + [layout["practice"]]:
        assert not any(a < t["x"] < c and b < t["z"] < d for a, b, c, d in obstacles(layout)), t["id"]
        d = grid.shortest(*start, t if "id" in t else {**t, "id": "practice"})
        assert math.isfinite(d) and d > 0, t.get("id")
    # the signal station is only reachable through the gap in the southern inner wall: longer than straight line
    sig = next(t for t in layout["targets"] if t["id"] == "signal")
    assert grid.shortest(45, 0, sig) > 19 + 5   # from straight above it, the wall forces a detour via the gap


def test_python_and_browser_agree_on_player_radius():
    js = (ROOT / "js" / "world.js").read_text()
    from geometry import PLAYER_RADIUS
    assert float(re.search(r"const RADIUS = ([\d.]+)", js).group(1)) == PLAYER_RADIUS


def test_html_references_exist():
    html = (ROOT / "index.html").read_text()
    for ref in re.findall(r'(?:src|href)="([^"]+)"', html):
        if not ref.startswith("http"):
            assert (ROOT / ref).exists(), ref
    assert "three@0.160.0" in html  # pinned version


@pytest.fixture(scope="module")
def synthetic(tmp_path_factory):
    d = tmp_path_factory.mktemp("sessions")
    simulate.main(["--n", "4", "--out", str(d), "--seed", "3"])
    return d


def test_analysis_ignores_synthetic_unless_asked(synthetic, tmp_path):
    assert analyze.main(["--sessions", str(synthetic), "--out", str(tmp_path)]) == 1


def test_full_analysis_on_synthetic(synthetic, tmp_path):
    assert analyze.main(["--sessions", str(synthetic), "--out", str(tmp_path), "--include-synthetic"]) == 0
    summary = (tmp_path / "summary.md").read_text()
    assert "SYNTHETIC TEST DATA" in summary and "Mann-Whitney" in summary
    import pandas as pd
    p = pd.read_csv(tmp_path / "participants.csv")
    assert len(p) == 8 and set(p.condition) == {"map", "nomap"}
    assert p.path_efficiency.between(0, 1).all() and (p.recall_error_m > 0).all()
    for f in ("metrics_by_condition.png", "paths_by_condition.png", "recall_by_condition.png"):
        assert (tmp_path / f).stat().st_size > 5000


def test_skips_bad_unfinished_and_duplicate_files(synthetic, tmp_path):
    folder = tmp_path / "s"
    folder.mkdir()
    good = sorted(synthetic.glob("*.json"))[0]
    d = json.loads(good.read_text())
    (folder / "a.json").write_text(json.dumps(d))
    (folder / "b.json").write_text(json.dumps(d))                       # duplicate pid
    (folder / "c.json").write_text(json.dumps({**d, "pid": "X", "sus": None, "finished_at": None}))
    (folder / "d.json").write_text("not json")
    (folder / "e.json").write_text(json.dumps({"study": "something else"}))
    assert len(analyze.load_sessions(folder, include_synthetic=True)) == 1


def test_path_metrics_exclude_jumps(layout, grid):
    t = layout["targets"][0]
    session = {"pid": "P", "condition": "map", "telemetry_columns": ["t_ms", "x", "z", "yaw_deg", "phase"],
               "telemetry": [[0, -60, 0, 90, 0], [200, -59, 0, 90, 0], [400, t["x"], t["z"], 90, 0]],
               "targets": [{"id": t["id"], "order": 1, "found": True, "time_s": 0.4}]}
    row = analyze.per_target_rows(session, layout, grid)[0]
    assert row["walked_m"] == 1.0            # the 30 m teleport is not counted as walking
    assert row["path_efficiency"] == 1.0     # capped at 1
