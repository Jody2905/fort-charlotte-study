// Study flow: consent -> about you -> practice -> five wayfinding targets -> recall map -> SUS -> download.
import { World, drawMinimap } from './world.js';

const STUDY = 'fort-charlotte-wayfinding';
const VERSION = '1.0';
const SAMPLE_MS = 200;     // telemetry: position and heading 5 times a second
const FACT_MS = 4500;      // how long a found landmark's fact stays on screen

const SUS = [
  'I think that I would like to use this system frequently.',
  'I found the system unnecessarily complex.',
  'I thought the system was easy to use.',
  'I think that I would need the support of a technical person to be able to use this system.',
  'I found the various functions in this system were well integrated.',
  'I thought there was too much inconsistency in this system.',
  'I would imagine that most people would learn to use this system very quickly.',
  'I found the system very cumbersome to use.',
  'I felt very confident using the system.',
  'I needed to learn a lot of things before I could get going with this system.',
];

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);

function makePid() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = new Uint32Array(6);
  crypto.getRandomValues(b);
  return 'FC-' + Array.from(b, v => a[v % a.length]).join('');
}

function chooseCondition() {
  const c = (params.get('c') || '').toLowerCase();
  if (c === 'map' || c === 'nomap') return { condition: c, assigned_by: 'link' };
  const b = new Uint32Array(1); crypto.getRandomValues(b);
  return { condition: b[0] % 2 ? 'map' : 'nomap', assigned_by: 'random' };
}

function show(step) {
  for (const s of document.querySelectorAll('#panel section')) s.hidden = s.dataset.step !== step;
  $('panel').hidden = false;
  $('hud').hidden = true;
  $('panel').scrollTop = 0;
}

function hidePanel() { $('panel').hidden = true; $('hud').hidden = false; }

async function main() {
  const layout = await (await fetch('layout.json')).json();
  const { condition, assigned_by } = chooseCondition();
  const data = {
    study: STUDY, version: VERSION, layout_version: layout.version,
    pid: (params.get('pid') || makePid()).slice(0, 32), condition, assigned_by,
    started_at: new Date().toISOString(), finished_at: null,
    client: { user_agent: navigator.userAgent, screen: [screen.width, screen.height], window: [innerWidth, innerHeight] },
    about: {}, practice: null, targets: [], telemetry_columns: ['t_ms', 'x', 'z', 'yaw_deg', 'phase'],
    telemetry: [], recall: [], sus: null,
  };
  const world = new World($('scene'), layout);
  const debug = params.get('debug') === '1';
  if (debug) {
    $('debug').hidden = false;
    window.__study = { data, world, teleport: (x, z) => { world.pos.x = x; world.pos.z = z; } };
  }

  // ---- render loop + telemetry ----
  let phase = null, t0 = 0, lastSample = -Infinity, last = performance.now();
  let onTick = null, factToken = 0;
  function frame(now) {
    const dt = Math.min(0.2, (now - last) / 1000); last = now;
    world.step(dt);
    if (phase !== null) {
      const t = now - t0;
      if (t - lastSample >= SAMPLE_MS) {
        lastSample = t;
        data.telemetry.push([Math.max(0, Math.round(t)), +world.pos.x.toFixed(2), +world.pos.z.toFixed(2), Math.round(world.yawDeg()), phase]);
      }
      if (onTick) onTick(now);
    }
    if (condition === 'map' && phase !== null && phase !== 'p') drawMinimap($('minimap'), layout, world.pos, world.yaw);
    if (debug) $('debug').textContent = `x ${world.pos.x.toFixed(1)}  z ${world.pos.z.toFixed(1)}  yaw ${world.yawDeg().toFixed(0)}  ${condition}`;
    world.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const near = p => Math.hypot(world.pos.x - p.x, world.pos.z - p.z) < p.radius;

  // ---- consent ----
  show('consent');
  $('consent-box').addEventListener('change', e => { $('consent-next').disabled = !e.target.checked; });
  $('consent-next').addEventListener('click', () => show('about'));

  // ---- about you ----
  const aboutDone = () => ['age', 'gaming', 'visited'].every(n => document.querySelector(`input[name=${n}]:checked`));
  document.querySelectorAll('[data-step=about] input').forEach(i => i.addEventListener('change', () => { $('about-next').disabled = !aboutDone(); }));
  $('about-next').addEventListener('click', () => {
    for (const n of ['age', 'gaming', 'visited']) data.about[n] = document.querySelector(`input[name=${n}]:checked`).value;
    show('practice-intro');
  });

  // ---- practice ----
  $('practice-start').addEventListener('click', () => {
    hidePanel();
    $('task-step').textContent = 'Practice';
    $('task-name').textContent = 'Walk to the flag at the gate';
    $('minimap').hidden = true;
    world.enabled = true;
    phase = 'p'; t0 = performance.now(); lastSample = -Infinity;
    onTick = now => {
      if (near(layout.practice)) {
        data.practice = { time_s: +((now - t0) / 1000).toFixed(2) };
        world.enabled = false; world.keys.clear(); phase = null; onTick = null;
        $('map-note').hidden = condition !== 'map';
        show('task-intro');
      }
    };
  });

  // ---- wayfinding task ----
  $('task-start').addEventListener('click', () => {
    hidePanel();
    $('minimap').hidden = condition !== 'map';
    world.enabled = true;
    t0 = performance.now(); lastSample = -Infinity;
    let i = 0, start = 0;
    const begin = now => {
      const tg = layout.targets[i];
      phase = i; start = now - t0;
      $('task-step').textContent = `Place ${i + 1} of ${layout.targets.length}`;
      $('task-name').textContent = `Find the ${tg.name}`;
    };
    const finish = (now, found) => {
      const tg = layout.targets[i];
      data.targets.push({ id: tg.id, name: tg.name, order: i + 1, found,
        start_ms: Math.round(start), end_ms: Math.round(now - t0), time_s: +((now - t0 - start) / 1000).toFixed(2) });
      if (found) {
        $('fact-card').textContent = `${tg.name}: ${tg.fact}`;
        $('fact-card').hidden = false;
        const token = ++factToken;
        setTimeout(() => { if (token === factToken) $('fact-card').hidden = true; }, FACT_MS);
      }
      i += 1;
      if (i < layout.targets.length) { begin(now); return; }
      world.enabled = false; world.keys.clear(); phase = null; onTick = null;
      $('fact-card').hidden = true;
      setTimeout(startRecall, found ? 1500 : 0);
    };
    begin(performance.now());
    onTick = now => {
      const tg = layout.targets[i];
      if (near(tg)) finish(now, true);
      else if (now - t0 - start > layout.target_timeout_s * 1000) finish(now, false);
    };
  });

  // ---- recall map ----
  function startRecall() {
    show('recall');
    const svg = $('recall-map');
    const [vx1, vz1, vx2, vz2] = [-94, -44, 64, 44];
    svg.setAttribute('viewBox', `${vx1} ${vz1} ${vx2 - vx1} ${vz2 - vz1}`);
    const NS = 'http://www.w3.org/2000/svg';
    const rect = ([x1, z1, x2, z2], fill) => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', x1); r.setAttribute('y', z1); r.setAttribute('width', x2 - x1); r.setAttribute('height', z2 - z1);
      r.setAttribute('fill', fill); svg.appendChild(r);
    };
    rect(layout.plateau, '#dfe3c4');
    rect(layout.causeway, '#d6cfc0');
    for (const w of layout.walls) rect(w.rect, '#6b5f4c');
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', -88); label.setAttribute('y', -6); label.setAttribute('font-size', 4); label.setAttribute('fill', '#6b7280');
    label.textContent = 'Entrance'; svg.appendChild(label);

    const placed = {};
    const toMap = (cx, cy) => {
      const p = svg.createSVGPoint(); p.x = cx; p.y = cy;
      const q = p.matrixTransform(svg.getScreenCTM().inverse());
      return { x: Math.max(vx1, Math.min(vx2, q.x)), z: Math.max(vz1, Math.min(vz2, q.y)) };
    };
    const inside = (cx, cy) => { const b = svg.getBoundingClientRect(); return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom; };
    const update = () => { $('recall-next').disabled = Object.keys(placed).length < layout.targets.length; };
    const pinFor = tg => {
      let g = svg.querySelector(`[data-id="${tg.id}"]`);
      if (!g) {
        g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'pin'); g.dataset.id = tg.id;
        const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', 2.2);
        const t = document.createElementNS(NS, 'text'); t.setAttribute('x', 3); t.setAttribute('y', 1.4); t.textContent = tg.name;
        g.append(c, t); svg.appendChild(g);
        c.addEventListener('pointerdown', e => drag(e, tg));
      }
      return g;
    };
    const place = (tg, p) => {
      placed[tg.id] = p;
      const g = pinFor(tg), t = g.querySelector('text'), flip = p.x > 25;  // keep the name inside the map
      t.setAttribute('x', flip ? -3 : 3); t.setAttribute('text-anchor', flip ? 'end' : 'start');
      g.setAttribute('transform', `translate(${p.x} ${p.z})`);
      document.querySelector(`.chip[data-id="${tg.id}"]`).classList.add('placed');
      update();
    };
    const drag = (e, tg) => {
      e.preventDefault();
      const move = ev => { if (inside(ev.clientX, ev.clientY)) place(tg, toMap(ev.clientX, ev.clientY)); };
      const up = ev => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
        if (inside(ev.clientX, ev.clientY)) place(tg, toMap(ev.clientX, ev.clientY));
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    };
    for (const tg of layout.targets) {
      const chip = document.createElement('div');
      chip.className = 'chip'; chip.dataset.id = tg.id; chip.textContent = tg.name;
      chip.addEventListener('pointerdown', e => drag(e, tg));
      $('recall-chips').appendChild(chip);
    }
    if (debug) window.__study.placeRecall = (id, x, z) => place(layout.targets.find(t => t.id === id), { x, z });
    $('recall-next').addEventListener('click', () => {
      data.recall = layout.targets.map(tg => {
        const p = placed[tg.id];
        return { id: tg.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), error_m: +Math.hypot(p.x - tg.x, p.z - tg.z).toFixed(2) };
      });
      startSus();
    }, { once: true });
  }

  // ---- SUS ----
  function startSus() {
    show('sus');
    const ol = $('sus-items');
    const anchors = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
    SUS.forEach((q, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<div>${q}</div><div class="likert">${anchors.map((a, v) =>
        `<label><input type="radio" name="sus${i}" value="${v + 1}">${a}</label>`).join('')}</div>`;
      ol.appendChild(li);
    });
    const answers = () => SUS.map((_, i) => document.querySelector(`input[name=sus${i}]:checked`));
    ol.addEventListener('change', () => { $('sus-next').disabled = answers().some(a => !a); });
    $('sus-next').addEventListener('click', () => {
      const a = answers().map(x => Number(x.value));
      const score = a.reduce((s, v, i) => s + (i % 2 === 0 ? v - 1 : 5 - v), 0) * 2.5;
      data.sus = { answers: a, score };
      data.finished_at = new Date().toISOString();
      try { localStorage.setItem(`fc-result-${data.pid}`, JSON.stringify(data)); } catch (e) { /* storage blocked: the download still works */ }
      $('pid-show').textContent = data.pid;
      show('done');
    }, { once: true });
  }

  // ---- download ----
  $('download').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fort-charlotte-${data.pid}.json`;
    document.body.appendChild(a); a.click(); a.remove();
  });
}

main().catch(err => {
  document.body.innerHTML = `<main style="padding:40px;font-family:system-ui"><h2>Something went wrong loading the study</h2><p>${err}</p><p>Please tell the researcher, and try another browser (Chrome or Edge work best).</p></main>`;
});
