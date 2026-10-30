# Running the study

My step-by-step notes for hosting the study, running sessions and analysing the results.

## Put it online (GitHub Pages, free)

1. Create a public GitHub repository named `fort-charlotte-study` and push this folder to it.
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main, folder: / (root) → Save**.
3. After a minute the study is live at `https://jody2905.github.io/fort-charlotte-study/`.

## Run a session

Send each participant one of two links, alternating so the groups stay the same size:

```
https://jody2905.github.io/fort-charlotte-study/?c=map
https://jody2905.github.io/fort-charlotte-study/?c=nomap
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

With 6–8 participants per group, only large differences will show up, and the p-values are exploratory. I report medians, ranges and effect sizes alongside them.
