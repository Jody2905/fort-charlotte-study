"""Make SYNTHETIC results files, only to test the analysis before real data arrives.

    python analysis/simulate.py --n 8 --out data/synthetic

Every file is marked "synthetic": true, and analyze.py ignores such files unless
--include-synthetic is given. Never report results from these files.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from geometry import ROOT, Grid, load_layout  # noqa: E402

DT, SPEED = 0.2, 5.0


def walk(grid: Grid, rng, pos, target, wander_prob: float, timeout_s: float):
    """Greedy descent on the target's distance field, with random wandering spells."""
    field = grid.field(target)
    x, z, t, track, wander = *pos, 0.0, [], 0
    yaw = 90.0
    while t < timeout_s:
        if math.hypot(x - target["x"], z - target["z"]) < target["radius"]:
            return (x, z), t, track, True
        if wander == 0 and rng.random() < wander_prob:
            wander, yaw = int(rng.integers(5, 25)), float(rng.uniform(0, 360))
        if wander:
            wander -= 1
            nx_, nz_ = x + math.sin(math.radians(yaw)) * SPEED * DT, z - math.cos(math.radians(yaw)) * SPEED * DT
            i, j = grid.index(nx_, nz_)
            if grid.free[i, j]:
                x, z = nx_, nz_
            else:
                yaw = float(rng.uniform(0, 360))
        else:
            i, j = grid.nearest_free(x, z)
            best = (field[i, j], i, j)
            for di in (-2, -1, 0, 1, 2):
                for dj in (-2, -1, 0, 1, 2):
                    a, b = i + di, j + dj
                    if 0 <= a < grid.nx and 0 <= b < grid.nz and field[a, b] < best[0]:
                        best = (field[a, b], a, b)
            nxp, nzp = grid.X[best[1], best[2]], grid.Z[best[1], best[2]]
            step = math.hypot(nxp - x, nzp - z)
            if step > 0:
                k = min(1.0, SPEED * DT / step)
                yaw = math.degrees(math.atan2(nxp - x, -(nzp - z))) % 360
                x, z = x + (nxp - x) * k, z + (nzp - z) * k
        t += DT
        if rng.random() < 0.03:
            t += float(rng.uniform(0.5, 3))  # stops to look around
        track.append((x, z, yaw, t))
    return (x, z), t, track, False


def session(grid: Grid, layout: dict, pid: str, condition: str, rng) -> dict:
    wander = 0.015 if condition == "map" else 0.04
    pos, clock, tel, targets = (-66.5, 0.0), 0.0, [], []
    for k, tg in enumerate(layout["targets"]):
        pos, dt, track, found = walk(grid, rng, pos, tg, wander, layout["target_timeout_s"])
        for x, z, yaw, tt in track:
            tel.append([round((clock + tt) * 1000), round(x, 2), round(z, 2), round(yaw), k])
        targets.append({"id": tg["id"], "name": tg["name"], "order": k + 1, "found": found,
                        "start_ms": round(clock * 1000), "end_ms": round((clock + dt) * 1000), "time_s": round(dt, 2)})
        clock += dt
    spread = 7 if condition == "map" else 5
    recall = []
    for tg in layout["targets"]:
        x, z = tg["x"] + rng.normal(0, spread), tg["z"] + rng.normal(0, spread)
        recall.append({"id": tg["id"], "x": round(x, 2), "z": round(z, 2), "error_m": round(math.hypot(x - tg["x"], z - tg["z"]), 2)})
    answers = [int(v) for v in rng.integers(3, 6, 10)]
    answers = [a if i % 2 == 0 else 6 - a for i, a in enumerate(answers)]
    score = sum((a - 1) if i % 2 == 0 else (5 - a) for i, a in enumerate(answers)) * 2.5
    return {"study": "fort-charlotte-wayfinding", "version": "1.0", "layout_version": layout["version"], "synthetic": True,
            "pid": pid, "condition": condition, "assigned_by": "simulated",
            "started_at": "2026-01-01T00:00:00Z", "finished_at": "2026-01-01T00:10:00Z", "client": {},
            "about": {"age": str(rng.choice(["18-24", "25-34", "35-44"])), "gaming": str(rng.choice(["never", "sometimes", "often"])),
                      "visited": str(rng.choice(["never", "once", "several"]))},
            "practice": {"time_s": round(float(rng.uniform(4, 12)), 2)}, "targets": targets,
            "telemetry_columns": ["t_ms", "x", "z", "yaw_deg", "phase"], "telemetry": tel,
            "recall": recall, "sus": {"answers": answers, "score": score}}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--n", type=int, default=8, help="participants per condition")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "synthetic")
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args(argv)
    layout, rng = load_layout(), np.random.default_rng(args.seed)
    grid = Grid(layout)
    args.out.mkdir(parents=True, exist_ok=True)
    for cond in ("map", "nomap"):
        for i in range(args.n):
            pid = f"SIM-{cond.upper()}-{i + 1:02d}"
            (args.out / f"fort-charlotte-{pid}.json").write_text(json.dumps(session(grid, layout, pid, cond, rng)), encoding="utf-8")
    print(f"Wrote {2 * args.n} SYNTHETIC sessions to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
