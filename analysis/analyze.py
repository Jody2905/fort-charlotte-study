"""Analyse the participants' results files.

    python analysis/analyze.py                         # reads data/sessions/*.json
    python analysis/analyze.py --sessions some/folder --out analysis_output

Per participant: time to find each place, distance walked, path efficiency
(shortest possible walk / actual walk), recall error (metres between where they
placed each name and where it really is) and SUS score. Then a comparison of the
site-map and no-map groups with Mann-Whitney U tests, which suit small samples.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import mannwhitneyu

sys.path.insert(0, str(Path(__file__).resolve().parent))
from geometry import ROOT, Grid, load_layout  # noqa: E402

STUDY = "fort-charlotte-wayfinding"
JUMP_M = 3.0  # a step longer than this between 0.2 s samples is not walking (e.g. a frozen tab); excluded
METRICS = {  # column -> (label, lower is better)
    "total_time_s": ("Total time to find all five places (s)", True),
    "path_efficiency": ("Path efficiency (shortest / walked)", False),
    "recall_error_m": ("Mean recall error (m)", True),
    "sus": ("SUS score (0-100)", False),
}
GROUPS = ("map", "nomap")
GROUP_LABEL = {"map": "Site map", "nomap": "No map"}


def load_sessions(folder: Path, include_synthetic: bool = False) -> list[dict]:
    sessions, seen = [], set()
    for f in sorted(Path(folder).glob("*.json")):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            print(f"  skipped {f.name}: not a valid JSON file")
            continue
        if d.get("study") != STUDY:
            print(f"  skipped {f.name}: not a results file from this study")
            continue
        if d.get("synthetic") and not include_synthetic:
            print(f"  skipped {f.name}: synthetic test data")
            continue
        if not d.get("finished_at") or not d.get("sus"):
            print(f"  skipped {f.name}: participant did not finish")
            continue
        if d["pid"] in seen:
            print(f"  skipped {f.name}: duplicate participant code {d['pid']}")
            continue
        seen.add(d["pid"])
        d["_file"] = f.name
        sessions.append(d)
    return sessions


def per_target_rows(session: dict, layout: dict, grid: Grid) -> list[dict]:
    cols = session["telemetry_columns"]
    tel = pd.DataFrame(session["telemetry"], columns=cols)
    targets = {t["id"]: t for t in layout["targets"]}
    rows = []
    for rec in session["targets"]:
        phase = rec["order"] - 1
        seg = tel[tel["phase"] == phase]
        if len(seg) < 2:
            walked, start = np.nan, None
        else:
            steps = np.hypot(np.diff(seg["x"]), np.diff(seg["z"]))
            walked = float(steps[steps <= JUMP_M].sum())
            start = (float(seg["x"].iloc[0]), float(seg["z"].iloc[0]))
        shortest = grid.shortest(*start, targets[rec["id"]]) if start else np.nan
        eff = shortest / walked if rec["found"] and walked and walked > 0 else np.nan
        rows.append({
            "pid": session["pid"], "condition": session["condition"], "order": rec["order"], "target": rec["id"],
            "found": rec["found"], "time_s": rec["time_s"], "walked_m": round(walked, 2) if walked == walked else np.nan,
            "shortest_m": round(shortest, 2) if shortest == shortest else np.nan,
            "path_efficiency": round(min(eff, 1.0), 3) if eff == eff else np.nan,
        })
    return rows


def participant_row(session: dict, targets: pd.DataFrame) -> dict:
    t = targets[targets["pid"] == session["pid"]]
    walked, shortest = t["walked_m"].sum(), t.loc[t["found"], "shortest_m"].sum()
    recall = session["recall"]
    return {
        "pid": session["pid"], "condition": session["condition"], "assigned_by": session.get("assigned_by"),
        **{f"about_{k}": v for k, v in session.get("about", {}).items()},
        "practice_time_s": (session.get("practice") or {}).get("time_s"),
        "targets_found": int(t["found"].sum()),
        "total_time_s": round(float(t["time_s"].sum()), 2),
        "walked_m": round(float(walked), 1),
        "path_efficiency": round(float(min(shortest / walked, 1.0)), 3) if walked else np.nan,
        "recall_error_m": round(float(np.mean([r["error_m"] for r in recall])), 2) if recall else np.nan,
        "sus": session["sus"]["score"],
        "file": session["_file"],
    }


def compare(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for col, (label, lower_better) in METRICS.items():
        a = df.loc[df["condition"] == "map", col].dropna()
        b = df.loc[df["condition"] == "nomap", col].dropna()
        row = {"metric": label}
        for g, s in (("map", a), ("nomap", b)):
            row[f"{g}_n"] = len(s)
            row[f"{g}_median"] = round(float(s.median()), 2) if len(s) else np.nan
            row[f"{g}_iqr"] = (f"{s.quantile(0.25):.2f}-{s.quantile(0.75):.2f}" if len(s) else "")
        if len(a) >= 2 and len(b) >= 2:
            u, p = mannwhitneyu(a, b, alternative="two-sided")
            row["U"], row["p"] = float(u), round(float(p), 4)
            row["rank_biserial"] = round(float(1 - 2 * u / (len(a) * len(b))), 3)  # >0: map values tend to be lower
        else:
            row["U"] = row["p"] = row["rank_biserial"] = np.nan
        rows.append(row)
    return pd.DataFrame(rows)


def figures(df: pd.DataFrame, sessions: list[dict], layout: dict, out: Path, banner: str = "") -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
    colors = {"map": "#1d4ed8", "nomap": "#9ca3af"}
    rng = np.random.default_rng(0)

    fig, axes = plt.subplots(1, len(METRICS), figsize=(13, 3.8))
    for ax, (col, (label, _)) in zip(axes, METRICS.items()):
        for k, g in enumerate(GROUPS):
            v = df.loc[df["condition"] == g, col].dropna().to_numpy()
            if len(v):
                ax.boxplot([v], positions=[k], widths=0.5, showfliers=False,
                           medianprops={"color": "#111827"}, boxprops={"color": "#6b7280"},
                           whiskerprops={"color": "#6b7280"}, capprops={"color": "#6b7280"})
                ax.scatter(k + rng.uniform(-0.12, 0.12, len(v)), v, color=colors[g], s=22, zorder=3, alpha=0.85)
        ax.set_xticks(range(len(GROUPS)), [f"{GROUP_LABEL[g]}\n(n={int((df['condition'] == g).sum())})" for g in GROUPS])
        ax.set_title(label, fontsize=10)
    fig.suptitle(("SYNTHETIC TEST DATA - " if banner else "") + "Wayfinding results by condition", fontweight="bold")
    fig.tight_layout()
    _save(fig, out / "metrics_by_condition.png")

    fig, axes = plt.subplots(1, 2, figsize=(13, 4.2), sharey=True)
    for ax, g in zip(axes, GROUPS):
        _draw_map(ax, layout)
        for s in sessions:
            if s["condition"] != g:
                continue
            tel = pd.DataFrame(s["telemetry"], columns=s["telemetry_columns"])
            tel = tel[tel["phase"] != "p"]
            x, z = tel["x"].to_numpy(float), tel["z"].to_numpy(float)
            jump = np.r_[False, np.hypot(np.diff(x), np.diff(z)) > JUMP_M]   # break the line at jumps
            x, z = x.copy(), z.copy()
            x[jump], z[jump] = np.nan, np.nan
            ax.plot(x, z, color=colors[g], lw=0.9, alpha=0.35)
        for t in layout["targets"]:
            ax.plot(t["x"], t["z"], "o", ms=7, mfc="white", mec="#111827")
            ax.annotate(t["name"], (t["x"], t["z"]), xytext=(5, 5), textcoords="offset points", fontsize=8)
        ax.set_title(f"{GROUP_LABEL[g]}: walking paths (n={sum(s['condition'] == g for s in sessions)})")
    fig.suptitle(("SYNTHETIC TEST DATA - " if banner else "") + "Where participants walked", fontweight="bold")
    fig.tight_layout()
    _save(fig, out / "paths_by_condition.png")

    fig, axes = plt.subplots(1, 2, figsize=(13, 4.2), sharey=True)
    for ax, g in zip(axes, GROUPS):
        _draw_map(ax, layout, walls_only=True)
        for s in sessions:
            if s["condition"] != g:
                continue
            for r in s["recall"]:
                t = next(t for t in layout["targets"] if t["id"] == r["id"])
                ax.plot([t["x"], r["x"]], [t["z"], r["z"]], color=colors[g], lw=0.8, alpha=0.5)
                ax.plot(r["x"], r["z"], ".", color=colors[g], alpha=0.7)
        for t in layout["targets"]:
            ax.plot(t["x"], t["z"], "o", ms=7, mfc="white", mec="#111827")
        ax.set_title(f"{GROUP_LABEL[g]}: recalled positions (lines join each guess to the true place)")
    fig.suptitle(("SYNTHETIC TEST DATA - " if banner else "") + "Spatial memory after the task", fontweight="bold")
    fig.tight_layout()
    _save(fig, out / "recall_by_condition.png")


def _draw_map(ax, layout, walls_only=False):
    from geometry import obstacles
    from matplotlib.patches import Rectangle
    x1, z1, x2, z2 = layout["plateau"]
    ax.add_patch(Rectangle((x1, z1), x2 - x1, z2 - z1, color="#eef0dc", zorder=0))
    rects = [w["rect"] for w in layout["walls"]] if walls_only else obstacles(layout)
    for a, b, c, d in rects:
        ax.add_patch(Rectangle((a, b), c - a, d - b, color="#6b5f4c", zorder=1))
    bx1, bz1, bx2, bz2 = layout["bounds"]
    ax.set_xlim(bx1, bx2); ax.set_ylim(bz2, bz1)  # north up (z grows southward)
    ax.set_aspect("equal"); ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_visible(False)


def _save(fig, path):
    import matplotlib.pyplot as plt
    try:
        fig.savefig(path, dpi=180, bbox_inches="tight")
    except OSError as e:
        print(f"Could not save {path.name}: {e}. Close the image if it is open and run again.")
    plt.close(fig)


def summary_md(df: pd.DataFrame, comp: pd.DataFrame, banner: str) -> str:
    lines = []
    if banner:
        lines += [f"> **{banner}**", ""]
    lines += ["# Fort Charlotte wayfinding study: results", "",
              f"{len(df)} participants: {int((df.condition == 'map').sum())} with the site map, "
              f"{int((df.condition == 'nomap').sum())} without. "
              f"{int((df.targets_found < 5).sum())} did not find all five places within the time limit.", "",
              "## Map vs no map", "",
              "| Measure | Site map: median (IQR) | No map: median (IQR) | Mann-Whitney U | p | Rank-biserial r |",
              "|---|---|---|---|---|---|"]
    for _, r in comp.iterrows():
        u = "" if pd.isna(r["U"]) else f"{r['U']:.1f}"
        p = "" if pd.isna(r["p"]) else f"{r['p']:.3f}"
        rb = "" if pd.isna(r["rank_biserial"]) else f"{r['rank_biserial']:+.2f}"
        lines.append(f"| {r['metric']} | {r['map_median']} ({r['map_iqr']}), n={r['map_n']} | "
                     f"{r['nomap_median']} ({r['nomap_iqr']}), n={r['nomap_n']} | {u} | {p} | {rb} |")
    lines += ["", "Rank-biserial r above 0 means the site-map group's values tend to be lower. "
              "With small groups, treat p-values as exploratory.", "",
              "## Participants", "", _table(df.drop(columns=["file"])), ""]
    return "\n".join(lines)


def _table(df: pd.DataFrame) -> str:
    head = "| " + " | ".join(df.columns) + " |"
    sep = "|" + "---|" * len(df.columns)
    body = ["| " + " | ".join("" if pd.isna(v) else str(v) for v in row) + " |" for row in df.itertuples(index=False)]
    return "\n".join([head, sep, *body])


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Analyse Fort Charlotte study results files.")
    ap.add_argument("--sessions", type=Path, default=ROOT / "data" / "sessions")
    ap.add_argument("--out", type=Path, default=ROOT / "analysis_output")
    ap.add_argument("--include-synthetic", action="store_true", help="for testing only")
    args = ap.parse_args(argv)

    layout = load_layout()
    print(f"Reading results files from {args.sessions}")
    sessions = load_sessions(args.sessions, args.include_synthetic)
    if not sessions:
        print("No usable results files found. Put participants' .json files in data/sessions/.")
        return 1
    grid = Grid(layout)
    targets = pd.DataFrame([r for s in sessions for r in per_target_rows(s, layout, grid)])
    df = pd.DataFrame([participant_row(s, targets) for s in sessions]).sort_values(["condition", "pid"])
    comp = compare(df)
    banner = "SYNTHETIC TEST DATA - NOT REAL PARTICIPANTS" if any(s.get("synthetic") for s in sessions) else ""

    args.out.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.out / "participants.csv", index=False)
    targets.to_csv(args.out / "per_target.csv", index=False)
    comp.to_csv(args.out / "comparison.csv", index=False)
    (args.out / "summary.md").write_text(summary_md(df, comp, banner), encoding="utf-8")
    figures(df, sessions, layout, args.out, banner)
    print(f"{len(sessions)} participants analysed. Results in {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
