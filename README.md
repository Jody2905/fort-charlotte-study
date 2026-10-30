# Fort Charlotte Wayfinding Study

**Does a site map help people find their way around a virtual heritage site, and does it change how well they remember the layout?**

A browser-based 3D model of Fort Charlotte, St. Vincent and the Grenadines, built for a small between-subjects user study. Participants explore the fort to find five landmarks, then place those landmarks on a blank outline from memory and rate the experience on the System Usability Scale (SUS). Half get an on-screen site map; half do not.

Navigation aids can weaken the mental map people build of a place: GPS users have been found to learn routes and layouts less well than people who navigate with maps or from experience [Ishikawa et al. 2008; Dahmani and Bohbot 2020]. This study tests whether that trade-off appears in a virtual heritage site, where both finding your way and remembering the place matter.

## The study

| | |
|---|---|
| Design | Between subjects, 2 conditions: **site map** (corner map with building names and your position) vs **no map** |
| Task | Practice walk, then find 5 landmarks in a fixed order: Main Barracks, Officers' Quarters, Signal Station, Cannon Battery, Lookout. 3-minute limit per landmark |
| Measures | Time per landmark; distance walked; **path efficiency** (shortest possible route ÷ route walked); **recall error** (metres between where a participant places each landmark and where it is); SUS score (0–100) |
| Covariates | Age band, 3D gaming experience, whether they have visited the real fort |
| Logging | Position and heading 5 times a second, saved in each participant's results file |
| Time | About 10 minutes, on a laptop or desktop with keyboard and mouse |
| Privacy | No names, emails or IP addresses; nothing is uploaded. Participants download a results file and send it to the researcher |

The fort layout is simplified and not to scale. The landmark facts shown in the model come from the [St. Vincent and the Grenadines Tourism Authority](https://tourism.gov.vc/tourism/index.php/national-sites-of-svg/fort-charlotte) and [Wikipedia](https://en.wikipedia.org/wiki/Fort_Charlotte,_Saint_Vincent).

## Put it online (GitHub Pages, free)

1. Create a public GitHub repository named `fort-charlotte-study` and push this folder to it.
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main, folder: / (root) → Save**.
3. After a minute the study is live at `https://<your-username>.github.io/fort-charlotte-study/`.

## Run a session

Send each participant one of two links, alternating so the groups stay the same size:

```
https://<your-username>.github.io/fort-charlotte-study/?c=map
https://<your-username>.github.io/fort-charlotte-study/?c=nomap
```

Without `?c=`, the page picks a condition at random. Ask participants to:

- use Chrome or Edge on a laptop or desktop (not a phone),
- finish in one sitting,
- click **Download my results** at the end and send you the file (email or WhatsApp).

Put every results file you receive in `data/sessions/`.

**Try it yourself first:** add `&debug=1` to a link to see your coordinates while you walk. Don't send debug links to participants, and don't put your own test files in `data/sessions/`.

**Before recruiting:** this is set up as an informal pilot. If you plan to publish the results or run the study through a university, it will need approval from that university's ethics board (IRB) first.

## Analyse the results

Requires Python 3.10 or newer.

```powershell
cd C:\Projects\fort-charlotte-study
python -m venv .venv
.venv\Scripts\activate
pip install -r analysis\requirements.txt
pytest
python analysis\analyze.py
```

Results go to `analysis_output\`:

| File | What it holds |
|---|---|
| `summary.md` | Map vs no-map comparison (medians, IQR, Mann–Whitney U, rank-biserial effect size) and a row per participant |
| `participants.csv`, `per_target.csv`, `comparison.csv` | The same numbers for a spreadsheet |
| `metrics_by_condition.png` | Time, path efficiency, recall error and SUS by condition |
| `paths_by_condition.png` | Every participant's walking route, by condition |
| `recall_by_condition.png` | Where participants placed each landmark from memory |

**To see what the output looks like before you have participants:**

```powershell
python analysis\simulate.py
python analysis\analyze.py --sessions data\synthetic --out analysis_output_synthetic --include-synthetic
```

These files are made up by a simple simulated walker and every chart is stamped "SYNTHETIC TEST DATA". Never report them.

## Sample size

With 6–8 participants per group, the study can show large differences only, and its p-values are exploratory. Report medians, ranges and effect sizes alongside them, and frame it as a pilot that motivates a larger study.

## Project layout

```
index.html            the study page
css/style.css
js/world.js           3D scene, walking, collisions, site map
js/study.js           study steps, logging, recall test, SUS, results file
layout.json           the fort layout and landmarks (shared by the page and the analysis)
analysis/geometry.py  obstacles and shortest walking distances
analysis/analyze.py   results files -> tables and charts
analysis/simulate.py  synthetic sessions for testing
tests/                layout and analysis tests
data/sessions/        participants' results files (not committed)
```

Built with [three.js](https://threejs.org) 0.160.0.

## References

- J. Brooke. SUS: A "quick and dirty" usability scale. In *Usability Evaluation in Industry*, 1996.
- T. Ishikawa, H. Fujiwara, O. Imai, A. Okabe. Wayfinding with a GPS-based mobile navigation system: A comparison with maps and direct experience. *Journal of Environmental Psychology* 28(1), 2008.
- L. Dahmani, V. D. Bohbot. Habitual use of GPS negatively impacts spatial memory during self-guided navigation. *Scientific Reports* 10, 2020.
