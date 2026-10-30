// 3D world: scene built from layout.json, walking controls, collisions and the site map.
import * as THREE from 'three';

const EYE = 1.7;            // camera height, metres
const SPEED = 5;            // walking speed, m/s
const TURN = 1.8;           // arrow-key turn speed, rad/s
const RADIUS = 0.45;        // player collision radius
const LABEL_RANGE = 12;     // building signs readable within this distance

const COLORS = {
  ground: 0x9fae6a, stone: 0xc9bea6, wall: 0xbdb19a, causeway: 0xa59c8a,
  barracks: 0xe7d9a8, officers: 0xf2efe6, roof: 0x9b3b2e, signal: 0xf5f5f0,
  lighthouseRed: 0xb22b2b, iron: 0x2b2b2b, wood: 0x8a6440, sea: 0x2f6f99, land: 0x6f8f4e, house: 0xe8e2d4,
};

export function rectCollides(layout) {
  // Obstacles = walls + solid buildings (battery and lookout are walkable platforms).
  const rects = layout.walls.map(w => w.rect);
  for (const b of layout.buildings) {
    if (b.rect && b.style !== 'battery' && b.style !== 'lookout') rects.push(b.rect);
    if (b.circle) { const [cx, cz, r] = b.circle; rects.push([cx - r, cz - r, cx + r, cz + r]); }
  }
  return rects;
}

export class World {
  constructor(canvas, layout) {
    this.layout = layout;
    this.obstacles = rectCollides(layout);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa9c8e0);
    this.scene.fog = new THREE.Fog(0xa9c8e0, 60, 420);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);
    this.pos = { x: layout.start.x, z: layout.start.z };
    this.yaw = layout.start.yaw_deg * Math.PI / 180;   // 0 = facing north (-z), 90 = east (+x)
    this.pitch = 0;
    this.keys = new Set();
    this.enabled = false;
    this.labels = [];
    this.flag = null;
    this._build();
    this._bindInput(canvas);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ---------- scene ----------
  _mat(color) { return new THREE.MeshLambertMaterial({ color }); }

  _box([x1, z1, x2, z2], h, color, y0 = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, h, z2 - z1), this._mat(color));
    m.position.set((x1 + x2) / 2, y0 + h / 2, (z1 + z2) / 2);
    this.scene.add(m);
    return m;
  }

  _build() {
    const L = this.layout, s = this.scene;
    s.add(new THREE.HemisphereLight(0xffffff, 0x8a8f70, 2.2));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.position.set(-60, 120, 40);
    s.add(sun);

    // Ridge top and causeway, sea and lowland far below
    const [px1, pz1, px2, pz2] = L.plateau;
    this._box([px1, pz1, px2, pz2], 60, COLORS.ground, -60);
    this._box(L.causeway, 58, COLORS.causeway, -58);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), this._mat(COLORS.sea));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -62; s.add(sea);
    const land = new THREE.Mesh(new THREE.CircleGeometry(420, 48), this._mat(COLORS.land));
    land.rotation.x = -Math.PI / 2; land.position.set(220, -60, -160); s.add(land);
    // Kingstown below, to the east (fixed pseudo-random positions so every participant sees the same view)
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) {
      const x = 90 + rnd() * 160, z = -60 + rnd() * 120, w = 4 + rnd() * 6, h = 3 + rnd() * 5;
      this._box([x, z, x + w, z + w * 0.8], h, i % 5 === 0 ? COLORS.roof : COLORS.house, -60);
    }

    // Walls
    for (const w of L.walls) this._box(w.rect, w.height, w.height < 2 ? COLORS.causeway : COLORS.wall);

    // Buildings and landmarks
    for (const b of L.buildings) {
      if (b.style === 'barracks' || b.style === 'officers' || b.style === 'signal') {
        const color = b.style === 'barracks' ? COLORS.barracks : b.style === 'officers' ? COLORS.officers : COLORS.signal;
        this._box(b.rect, b.height, color);
        const [x1, z1, x2, z2] = b.rect;
        this._box([x1 - 0.5, z1 - 0.5, x2 + 0.5, z2 + 0.5], 0.6, COLORS.roof, b.height);   // roof slab
        // a row of dark windows on each long side
        for (let x = x1 + 2; x < x2 - 1; x += 3) {
          this._box([x, z1 - 0.05, x + 1.2, z1], 1.6, 0x3a3f47, 1.6);
          this._box([x, z2, x + 1.2, z2 + 0.05], 1.6, 0x3a3f47, 1.6);
        }
        for (let z = z1 + 2; z < z2 - 1; z += 3) {
          this._box([x1 - 0.05, z, x1, z + 1.2], 1.6, 0x3a3f47, 1.6);
          this._box([x2, z, x2 + 0.05, z + 1.2], 1.6, 0x3a3f47, 1.6);
        }
      } else if (b.style === 'lighthouse') {
        const [cx, cz, r] = b.circle;
        for (let i = 0; i < 4; i++) {
          const m = new THREE.Mesh(new THREE.CylinderGeometry(r * (1 - i * 0.06), r * (1 - (i + 1) * 0.06), b.height / 4, 20),
            this._mat(i % 2 ? COLORS.signal : COLORS.lighthouseRed));
          m.position.set(cx, b.height / 8 + i * b.height / 4, cz); s.add(m);
        }
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
        lamp.position.set(cx, b.height + 0.8, cz); s.add(lamp);
      } else if (b.style === 'battery') {
        this._box(b.rect, b.height, COLORS.stone);
        const [x1, z1, x2] = b.rect;
        for (let x = x1 + 3; x < x2 - 1; x += 5) {       // cannon pointing north (inland)
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 3.2, 14), this._mat(COLORS.iron));
          barrel.rotation.x = Math.PI / 2; barrel.position.set(x, b.height + 0.9, z1 + 3); s.add(barrel);
          this._box([x - 0.7, z1 + 3, x + 0.7, z1 + 4.6], 0.6, COLORS.wood, b.height);
        }
      } else if (b.style === 'lookout') {
        this._box(b.rect, b.height, COLORS.wood);
        const [x1, z1, x2] = b.rect;
        this._box([x1, z1, x2, z1 + 0.3], 1.1, COLORS.wood, b.height);   // rail facing the fort
        this._box([x1 + 3, z1 + 3, x1 + 7, z1 + 3.8], 0.5, COLORS.wood, b.height); // bench
      }
    }

    // Signs: one per target, visible only up close
    for (const t of L.targets) this.labels.push({ ...t, sprite: this._sign(t.name, t.x, t.z) });

    // Practice flag
    const p = L.practice;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 8), this._mat(0xdddddd));
    pole.position.set(p.x, 2.5, p.z); s.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshLambertMaterial({ color: 0xf2c200, side: THREE.DoubleSide }));
    cloth.position.set(p.x, 4.4, p.z + 0.9); cloth.rotation.y = Math.PI / 2; s.add(cloth);
    this.flag = [pole, cloth];
  }

  _sign(text, x, z) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(30,30,30,0.85)'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = 'white'; g.font = 'bold 54px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 66);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c) }));
    sprite.scale.set(4, 1, 1); sprite.position.set(x, 3.2, z); sprite.visible = false;
    this.scene.add(sprite);
    return sprite;
  }

  // ---------- input ----------
  _bindInput(canvas) {
    const keyMap = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', KeyD: 'r', ArrowLeft: 'tl', ArrowRight: 'tr' };
    window.addEventListener('keydown', e => { if (keyMap[e.code] && this.enabled) { this.keys.add(keyMap[e.code]); e.preventDefault(); } });
    window.addEventListener('keyup', e => { if (keyMap[e.code]) this.keys.delete(keyMap[e.code]); });
    window.addEventListener('blur', () => this.keys.clear());
    let drag = null;
    canvas.addEventListener('pointerdown', e => { if (this.enabled) { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); } });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      this.yaw += (e.clientX - drag.x) * 0.005;
      this.pitch = Math.max(-0.9, Math.min(0.9, this.pitch - (e.clientY - drag.y) * 0.004));
      drag = { x: e.clientX, y: e.clientY };
    });
    const end = () => { drag = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  // ---------- movement ----------
  blocked(x, z) {
    for (const [x1, z1, x2, z2] of this.obstacles) {
      if (x > x1 - RADIUS && x < x2 + RADIUS && z > z1 - RADIUS && z < z2 + RADIUS) return true;
    }
    const [bx1, bz1, bx2, bz2] = this.layout.bounds;
    return x < bx1 || x > bx2 || z < bz1 || z > bz2;
  }

  step(dt) {
    if (!this.enabled) return 0;
    if (this.keys.has('tl')) this.yaw -= TURN * dt;
    if (this.keys.has('tr')) this.yaw += TURN * dt;
    let f = 0, r = 0;
    if (this.keys.has('f')) f += 1;
    if (this.keys.has('b')) f -= 1;
    if (this.keys.has('r')) r += 1;
    if (this.keys.has('l')) r -= 1;
    if (!f && !r) return 0;
    const n = Math.hypot(f, r), d = SPEED * dt / n;
    const sx = Math.sin(this.yaw), sz = -Math.cos(this.yaw);          // forward
    const dx = (f * sx - r * sz) * d, dz = (f * sz + r * sx) * d;
    const before = { ...this.pos };
    if (!this.blocked(this.pos.x + dx, this.pos.z)) this.pos.x += dx;   // slide along walls
    if (!this.blocked(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
    return Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
  }

  render() {
    const c = this.camera;
    c.position.set(this.pos.x, EYE, this.pos.z);
    const look = new THREE.Vector3(
      this.pos.x + Math.sin(this.yaw) * Math.cos(this.pitch), EYE + Math.sin(this.pitch),
      this.pos.z - Math.cos(this.yaw) * Math.cos(this.pitch));
    c.lookAt(look);
    for (const l of this.labels) l.sprite.visible = Math.hypot(l.x - this.pos.x, l.z - this.pos.z) < LABEL_RANGE;
    this.renderer.render(this.scene, c);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  yawDeg() { return ((this.yaw * 180 / Math.PI) % 360 + 360) % 360; }
}

// ---------- site map (map condition only) ----------
export function drawMinimap(canvas, layout, pos, yaw) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, pad = 10;
  const [bx1, bz1, bx2, bz2] = [-92, -42, 62, 42];
  const k = Math.min((W - 2 * pad) / (bx2 - bx1), (H - 2 * pad) / (bz2 - bz1));
  const X = x => pad + (x - bx1) * k, Z = z => pad + (z - bz1) * k;
  g.fillStyle = '#f3efe4'; g.fillRect(0, 0, W, H);
  const [px1, pz1, px2, pz2] = layout.plateau;
  g.fillStyle = '#dfe3c4'; g.fillRect(X(px1), Z(pz1), (px2 - px1) * k, (pz2 - pz1) * k);
  const [cx1, cz1, cx2, cz2] = layout.causeway;
  g.fillStyle = '#d6cfc0'; g.fillRect(X(cx1), Z(cz1), (cx2 - cx1) * k, (cz2 - cz1) * k);
  g.fillStyle = '#6b5f4c';
  for (const w of layout.walls) { const [x1, z1, x2, z2] = w.rect; g.fillRect(X(x1), Z(z1), Math.max(1, (x2 - x1) * k), Math.max(1, (z2 - z1) * k)); }
  g.font = 'bold 10px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const b of layout.buildings) {
    let cx, cz;
    if (b.rect) {
      const [x1, z1, x2, z2] = b.rect;
      g.fillStyle = b.style === 'battery' || b.style === 'lookout' ? '#c9b98f' : '#9aa5b1';
      g.fillRect(X(x1), Z(z1), (x2 - x1) * k, (z2 - z1) * k);
      cx = (x1 + x2) / 2; cz = (z1 + z2) / 2;
    } else {
      [cx, cz] = b.circle;
      g.fillStyle = '#b22b2b'; g.beginPath(); g.arc(X(cx), Z(cz), 3, 0, 7); g.fill();
      continue;
    }
    g.fillStyle = '#1f2937';
    const tw = g.measureText(b.name).width;
    g.fillText(b.name, Math.max(pad + tw / 2, Math.min(W - pad - tw / 2, X(cx))), Z(cz));
  }
  // player arrow
  g.save(); g.translate(X(pos.x), Z(pos.z)); g.rotate(yaw);
  g.fillStyle = '#1d4ed8'; g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = '#6b7280'; g.font = '10px system-ui, sans-serif'; g.textAlign = 'left';
  g.fillText('N ↑', 6, H - 8);
}
