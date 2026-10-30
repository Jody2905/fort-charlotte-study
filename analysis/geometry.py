"""Fort layout in Python: obstacles (the same ones the web page uses) and shortest walking distances."""

from __future__ import annotations

import heapq
import json
from functools import lru_cache
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
LAYOUT_PATH = ROOT / "layout.json"
PLAYER_RADIUS = 0.45   # must match RADIUS in js/world.js
CELL = 0.5             # grid resolution for shortest paths, metres


def load_layout(path: Path = LAYOUT_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def obstacles(layout: dict) -> list[list[float]]:
    """Walls + solid buildings as rectangles [x1, z1, x2, z2] (as in js/world.js rectCollides)."""
    rects = [w["rect"] for w in layout["walls"]]
    for b in layout["buildings"]:
        if "rect" in b and b["style"] not in ("battery", "lookout"):
            rects.append(b["rect"])
        if "circle" in b:
            cx, cz, r = b["circle"]
            rects.append([cx - r, cz - r, cx + r, cz + r])
    return rects


class Grid:
    """Walkable grid over the layout bounds; distance fields give shortest walking distances."""

    def __init__(self, layout: dict, cell: float = CELL):
        self.layout, self.cell = layout, cell
        self.x0, self.z0, x1, z1 = layout["bounds"]
        self.nx = int(round((x1 - self.x0) / cell)) + 1
        self.nz = int(round((z1 - self.z0) / cell)) + 1
        xs = self.x0 + np.arange(self.nx) * cell
        zs = self.z0 + np.arange(self.nz) * cell
        X, Z = np.meshgrid(xs, zs, indexing="ij")
        free = np.ones_like(X, dtype=bool)
        r = PLAYER_RADIUS
        for a, b, c, d in obstacles(layout):
            free &= ~((X > a - r) & (X < c + r) & (Z > b - r) & (Z < d + r))
        self.free, self.X, self.Z = free, X, Z
        self._fields: dict[str, np.ndarray] = {}

    def index(self, x: float, z: float) -> tuple[int, int]:
        i = int(round((x - self.x0) / self.cell))
        j = int(round((z - self.z0) / self.cell))
        return min(max(i, 0), self.nx - 1), min(max(j, 0), self.nz - 1)

    def nearest_free(self, x: float, z: float) -> tuple[int, int]:
        i, j = self.index(x, z)
        if self.free[i, j]:
            return i, j
        fi, fj = np.nonzero(self.free)
        k = np.argmin((fi - i) ** 2 + (fj - j) ** 2)
        return int(fi[k]), int(fj[k])

    def field(self, target: dict) -> np.ndarray:
        """Walking distance (m) from every cell to the edge of the target's 'found' circle (8-connected Dijkstra)."""
        key = target["id"]
        if key in self._fields:
            return self._fields[key]
        dist = np.full(self.free.shape, np.inf)
        inside = self.free & (np.hypot(self.X - target["x"], self.Z - target["z"]) <= target["radius"])
        heap = []
        for i, j in zip(*np.nonzero(inside)):
            dist[i, j] = 0.0
            heap.append((0.0, int(i), int(j)))
        heapq.heapify(heap)
        steps = [(di, dj, self.cell * (2 ** 0.5 if di and dj else 1.0))
                 for di in (-1, 0, 1) for dj in (-1, 0, 1) if di or dj]
        free, nx, nz = self.free, self.nx, self.nz
        while heap:
            d, i, j = heapq.heappop(heap)
            if d > dist[i, j]:
                continue
            for di, dj, w in steps:
                a, b = i + di, j + dj
                if 0 <= a < nx and 0 <= b < nz and free[a, b]:
                    if di and dj and not (free[i + di, j] and free[i, j + dj]):
                        continue  # no corner cutting
                    nd = d + w
                    if nd < dist[a, b]:
                        dist[a, b] = nd
                        heapq.heappush(heap, (nd, a, b))
        self._fields[key] = dist
        return dist

    def shortest(self, x: float, z: float, target: dict) -> float:
        return float(self.field(target)[self.nearest_free(x, z)])


@lru_cache(maxsize=2)
def default_grid() -> Grid:
    return Grid(load_layout())
