# Fort Charlotte Wayfinding Study

**Does a site map help people find their way around a virtual heritage site, and does it change how well they remember it?**

I built a browser-based 3D model of Fort Charlotte, the hilltop fort above Kingstown in my home country, St. Vincent and the Grenadines, and designed a small user study around it.

**Try it:** [jody2905.github.io/fort-charlotte-study](https://jody2905.github.io/fort-charlotte-study/) (laptop or desktop, Chrome or Edge, about 10 minutes)

## Why

Navigation aids make it easier to get from A to B, but they may come at a cost. GPS users have been found to learn routes and layouts less well than people who navigate with a map or from direct experience [1, 2]. Virtual heritage sites are meant both to be explored and to be remembered, so I wanted to see whether the same trade-off shows up there: does a site map speed people up while weakening their memory of the place?

## What participants do

1. Answer three background questions: age band, 3D gaming experience, and whether they have visited the real fort.
2. Practise walking with the keyboard and mouse.
3. Find five landmarks in order: the Main Barracks, Officers' Quarters, Signal Station, Cannon Battery and Lookout. Each one shows a short fact about the real fort once found.
4. Drag the five names onto a blank outline of the fort's walls, from memory.
5. Rate the experience on the System Usability Scale (SUS) [3].

Half the participants see a site map in the corner with the building names and their own position; half do not.

## What I measure

| Measure | How |
|---|---|
| Time | Seconds to find each landmark, 3-minute limit each |
| Path efficiency | Shortest possible walking route ÷ route actually walked, from position logs taken 5 times a second |
| Spatial memory | Metres between where each landmark was placed on the outline and where it really is |
| Usability | SUS score, 0–100 |

The two groups are compared with Mann–Whitney U tests and rank-biserial effect sizes, which suit small samples.

## Results

Data collection is in progress. Results will be added here.

## How it's built

- **The model:** [three.js](https://threejs.org) 0.160.0, plain JavaScript and HTML, hosted free on GitHub Pages. The layout lives in one file, `layout.json`, shared by the web page and the analysis, so both use exactly the same walls and landmarks.
- **Privacy:** no names, emails or IP addresses are collected and nothing is uploaded. Each participant downloads a small results file at the end and sends it to me.
- **Analysis:** Python (pandas, SciPy, matplotlib). Shortest routes are computed on a 0.5 m grid of the fort with the same collision rules the browser uses.
- **Testing:** the analysis has automated tests, and a simulator produces clearly labelled synthetic sessions for checking the pipeline before real data arrives.

The fort is simplified and not to scale. The landmark facts come from the [St. Vincent and the Grenadines Tourism Authority](https://tourism.gov.vc/tourism/index.php/national-sites-of-svg/fort-charlotte) and [Wikipedia](https://en.wikipedia.org/wiki/Fort_Charlotte,_Saint_Vincent).

## Running it yourself

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r analysis\requirements.txt
pytest
python analysis\analyze.py
```

My full notes on hosting the study, running sessions and analysing results are in [docs/running-the-study.md](docs/running-the-study.md).

## Project layout

```
index.html            the study page
js/world.js           3D scene, walking, collisions, site map
js/study.js           study steps, logging, memory test, SUS, results file
layout.json           fort layout and landmarks
analysis/             geometry, analysis and simulator
tests/                layout and analysis tests
docs/                 notes for running the study
```

## Limitations

- This is a pilot: with small groups, only large differences will show up.
- Participants use a keyboard and mouse on a screen, not a headset, so this measures desktop virtual navigation.
- The fort is simplified, and people who know the real fort may have an advantage. I record prior visits so this can be checked.

## References

1. T. Ishikawa, H. Fujiwara, O. Imai, A. Okabe. Wayfinding with a GPS-based mobile navigation system: A comparison with maps and direct experience. *Journal of Environmental Psychology* 28(1), 2008.
2. L. Dahmani, V. D. Bohbot. Habitual use of GPS negatively impacts spatial memory during self-guided navigation. *Scientific Reports* 10, 2020.
3. J. Brooke. SUS: A "quick and dirty" usability scale. In *Usability Evaluation in Industry*, 1996.

Jody-Ann Trimmingham · [github.com/Jody2905](https://github.com/Jody2905)
