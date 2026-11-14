(() => {
  'use strict';
  // One read-only viewport. The spiral is an animation, never a claim of external activity.
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('world');
  const canvas = document.getElementById('vortexBackground');
  const context = canvas.getContext('2d', { alpha: true });
  const detail = document.getElementById('detail');
  const timeline = document.getElementById('timeline');
  const slider = document.getElementById('timeSlider');
  const timeLabel = document.getElementById('timeLabel');
  const connection = document.getElementById('connection');
  const follow = document.getElementById('follow');
  const flightStatus = document.getElementById('flightStatus');
  const motionToggle = document.getElementById('motionToggle');
  document.getElementById('runtime').textContent = '● JAVASCRIPT AKTIV · VORTEX 0.5.1';
  let snapshot = null;
  let ordered = [];
  let selected = null;
  let auto = true;
  let camera = { x: 0, y: 0, w: 1200, h: 680 };
  let drag = null;
  let moved = false;
  let elements = { nodes: new Map(), satellites: [], edges: [], center: null };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let motion = !reducedMotion;
  let phase = 0;
  let lastFrame = 0;
  let lastDraw = -1000;
  let lastMeasuredWidth = 0;
  let lastMeasuredHeight = 0;
  let locked = new Map();
  const CORE = 'navigation:singularity';
  const cx = 600, cy = 337;

  const random = (n) => { let x = Math.sin(n * 127.1 + 83.7) * 43758.5453; return x - Math.floor(x); };
  const stars = Array.from({ length: 116 }, (_, i) => ({ x: random(i + 1) * 1200, y: random(i + 501) * 680, r: 0.45 + random(i + 1001) * 1.4 }));
  const streaks = Array.from({ length: 160 }, (_, i) => ({ a: i * 2.3999632, f: random(i + 1521), speed: .55 + random(i + 2400) * 1.25 }));

  function element(tag, attrs = {}, parent = svg) {
    const item = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, String(value));
    parent.append(item);
    return item;
  }
  function line(parent, value, tag = 'p') {
    const item = document.createElement(tag);
    item.textContent = String(value);
    parent.append(item);
    return item;
  }
  function cameraApply() {
    svg.setAttribute('viewBox', `${camera.x} ${camera.y} ${camera.w} ${camera.h}`);
  }
  function zoom(factor) {
    const w = Math.max(430, Math.min(2350, camera.w * factor));
    const h = w * 680 / 1200;
    camera.x += (camera.w - w) / 2;
    camera.y += (camera.h - h) / 2;
    camera.w = w; camera.h = h;
    cameraApply();
  }
  document.getElementById('zoomIn').onclick = () => zoom(.80);
  document.getElementById('zoomOut').onclick = () => zoom(1.25);
  document.getElementById('home').onclick = () => { camera = {x: 0, y: 0, w: 1200, h: 680}; cameraApply(); };
  svg.addEventListener('wheel', event => { event.preventDefault(); zoom(event.deltaY > 0 ? 1.11 : .90); }, { passive: false });
  svg.addEventListener('pointerdown', event => {
    // Native interactive targets never enter pan mode; clicking stays clicking.
    if (event.target.closest('.hit')) return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: camera.x, top: camera.y };
    moved = false;
  });
  svg.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!moved && Math.abs(dx) + Math.abs(dy) > 6) {
      moved = true;
      try { svg.setPointerCapture(event.pointerId); } catch (_) { /* already released */ }
    }
    if (!moved) return;
    camera.x = drag.left - dx * camera.w / Math.max(1, svg.clientWidth);
    camera.y = drag.top - dy * camera.h / Math.max(1, svg.clientHeight);
    cameraApply();
  });
  function stopDrag(event) {
    if (drag && drag.pointerId === event.pointerId) {
      drag = null;
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    }
  }
  svg.addEventListener('pointerup', stopDrag);
  svg.addEventListener('pointercancel', stopDrag);
  svg.addEventListener('click', event => {
    if (moved) { moved = false; return; }
    if (event.target === svg) { selected = null; showDetail(); }
  });

  function entryList(data) {
    const rows = [
      ...data.garden.map(e => ({ key: 'g-' + e.seq, at: e.at, source: 'GARTEN', entry: e })),
      ...data.runs.map(e => ({ key: 'r-' + e.seq, at: e.at, source: 'LAUF', entry: e }))
    ];
    rows.sort((a, b) => a.at.localeCompare(b.at) || a.source.localeCompare(b.source) || a.entry.seq - b.entry.seq);
    return rows;
  }
  function label(row) {
    const e = row.entry;
    if (e.kind === 'seed') return 'Keim · ' + e.name;
    if (e.kind === 'branch') return 'Ast · ' + e.name;
    if (e.kind === 'note') return 'Beschreibung · ' + e.name;
    if (e.kind === 'portal') return 'Portal · ' + e.name;
    if (e.kind === 'run-start') return 'Start · ' + e.argv[0];
    return (e.result === 'EXITED' && e.exitCode === 0 ? 'Ergebnis · OK' : 'Ergebnis · ' + e.result);
  }
  function prefix(row) {
    const e = row.entry;
    if (e.kind === 'run-start' || e.kind === 'run-end') return 'AUSFÜHRUNG';
    return e.kind.toUpperCase();
  }
  function showDetail() {
    detail.replaceChildren();
    if (selected === CORE) {
      line(detail, 'NAVIGATION · VISUALISIERUNG', 'small');
      line(detail, 'Singularität', 'h3');
      line(detail, 'Der Kern visualisiert Beziehungen und die Richtung des Flusses. Er ist kein laufendes Programm und stellt keine automatische Außenverbindung her.');
      line(detail, 'Außenquellen werden erst sichtbar, wenn ein eigener prüfbarer Beleg dafür aufgezeichnet ist.');
      return;
    }
    if (!selected) {
      line(detail, 'Wähle einen beweglichen Knoten, ein Ereignis oder die Singularität.');
      line(detail, 'Die Ansicht zeigt gespeicherte Ereignisse, keine unbeobachtete Außenwelt.');
      return;
    }
    const row = ordered.find(x => x.key === selected);
    if (!row) { selected = null; showDetail(); return; }
    const e = row.entry;
    line(detail, prefix(row), 'small');
    line(detail, label(row), 'h3');
    line(detail, 'UTC ' + e.at);
    line(detail, 'SHA-256 ' + e.hash, 'code');
    if (e.kind === 'branch') line(detail, 'Herkunft: ' + e.parent);
    if (e.kind === 'note') line(detail, e.text);
    if (e.kind === 'portal') {
      line(detail, 'Öffentliche Seite. Erst dein Klick lädt die externe Website.');
      const a = document.createElement('a');
      a.href = e.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = 'HALVETH NETZ betreten ↗';
      detail.append(a);
    }
    if (e.kind === 'run-start') {
      line(detail, 'Erfasster Prozessstart; Ergebnis kann noch offen sein.');
      line(detail, 'Programm + Argumente: ' + JSON.stringify(e.argv), 'pre');
    }
    if (e.kind === 'run-end') {
      const start = snapshot.runs.find(x => x.kind === 'run-start' && x.runId === e.runId);
      line(detail, 'Exit: ' + (e.exitCode === null ? 'offen' : e.exitCode) + ' · ' + e.result);
      if (start) line(detail, 'Befehl: ' + JSON.stringify(start.argv), 'pre');
      if (e.output) line(detail, e.output, 'pre');
    }
    [...timeline.querySelectorAll('button')].forEach(b => b.classList.toggle('active', b.dataset.key === selected));
  }
  function bindButton(group, key, labelText) {
    group.setAttribute('class', 'hit');
    group.setAttribute('role', 'button');
    group.setAttribute('tabindex', '0');
    group.setAttribute('aria-label', labelText);
    element('title', {}, group).textContent = labelText;
    const activate = event => { event.stopPropagation(); selected = key; showDetail(); redraw(); };
    group.addEventListener('click', activate);
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(event); }
    });
    group.addEventListener('pointerenter', () => { locked.set(key, true); });
    group.addEventListener('pointerleave', () => { locked.delete(key); });
  }
  function nodeCoordinates(nodes, tick) {
    const positions = new Map();
    const depths = new Map();
    for (const n of nodes) depths.set(n.name, n.parent ? (depths.get(n.parent) || 0) + 1 : 0);
    nodes.forEach((n, index) => {
      const depth = depths.get(n.name);
      const theta = index * 2.399963 + depth * .31 + tick * (.000012 + (index % 3) * .0000015);
      const radial = Math.min(443, 152 + depth * 72 + Math.sqrt(index + 1) * 38);
      const wave = 11 * Math.sin(tick * .00040 + index);
      const front = Math.sin(theta);
      const scale = .78 + .20 * (front + 1) * .5;
      positions.set(n.name, { x: cx + Math.cos(theta) * (radial + wave),
        y: cy + Math.sin(theta) * (radial + wave) * .54 - depth * 17,
        scale, front, theta, depth });
    });
    return positions;
  }
  function drawGeometry(tick) {
    // Preserve round click targets on portrait screens without shrinking them to dots.
    const width = Math.max(1, svg.clientWidth), height = Math.max(1, svg.clientHeight);
    const pixelRatio = (width / camera.w) / (height / camera.h);
    const touchBoost = Math.min(2.4, Math.max(1, 1 + (850 - width) / 340));
    const nodes = [...elements.nodes.values()].map(item => item.entry);
    if (!nodes.length && !elements.center) return;
    const positions = nodeCoordinates(nodes, tick);
    for (const [name, item] of elements.nodes) {
      const key = 'g-' + item.entry.seq;
      if (locked.has(key)) {
        if (locked.get(key) === true) locked.set(key, positions.get(name));
        else positions.set(name, locked.get(key));
      }
    }
    for (const [name, item] of elements.nodes) {
      const p = positions.get(name);
      item.group.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) scale(${(p.scale * touchBoost).toFixed(3)} ${(p.scale * touchBoost * pixelRatio).toFixed(3)})`);
      item.group.setAttribute('opacity', String(Math.max(.65, .84 + p.front * .13)));
    }
    for (const item of elements.edges) {
      const a = positions.get(item.parent), b = positions.get(item.name);
      if (!a || !b) continue;
      item.path.setAttribute('d', `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`);
    }
    for (const item of elements.satellites) {
      const p = positions.get(item.node);
      if (!p) continue;
      const a = item.index * 1.07 - 1.1 + tick * .000025;
      const r = 43 + Math.floor(item.index / 5) * 15;
      let x = p.x + Math.cos(a) * r;
      let y = p.y + Math.sin(a) * r * .79;
      if (locked.has(item.key)) {
        if (locked.get(item.key) === true) locked.set(item.key, { x, y });
        else ({ x, y } = locked.get(item.key));
      }
      item.group.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${touchBoost.toFixed(3)} ${(touchBoost * pixelRatio).toFixed(3)})`);
    }
    if (elements.center) {
      const pulse = 1 + Math.sin(tick * .0006) * .06;
      elements.center.setAttribute('transform', `translate(${cx} ${cy}) scale(${(pulse * touchBoost).toFixed(3)} ${(pulse * touchBoost * pixelRatio).toFixed(3)})`);
    }
  }
  function redraw() {
    svg.replaceChildren();
    elements = { nodes: new Map(), satellites: [], edges: [], center: null };
    locked.clear();
    // The core is a real focusable button, but deliberately not a fabricated log event.
    const core = element('g');
    bindButton(core, CORE, 'Singularität · Erklärung öffnen');
    element('circle', {r: 44, class: 'core-outer'}, core);
    element('circle', {r: 31, class: 'core-inner'}, core);
    element('circle', {r: 51, class: 'touch-target'}, core);
    const coreText = element('text', {class: 'core-text', y: 4}, core);
    coreText.textContent = 'NEXUS';
    elements.center = core;
    if (!snapshot) { drawGeometry(phase); return; }
    const cap = Number(slider.value);
    const visible = ordered.slice(0, cap);
    const gEvents = visible.filter(x => x.source === 'GARTEN').map(x => x.entry);
    const nodes = gEvents.filter(e => e.kind === 'seed' || e.kind === 'branch');
    const portals = new Set(gEvents.filter(e => e.kind === 'portal').map(e => e.name));
    const edgesGroup = element('g');
    for (const n of nodes) {
      if (n.parent) elements.edges.push({ parent: n.parent, name: n.name, path: element('path', {class:'edge'}, edgesGroup) });
    }
    for (const n of nodes) {
      const key = 'g-' + n.seq;
      const group = element('g');
      bindButton(group, key, label({entry:n}));
      const ring = element('circle', {r: portals.has(n.name) ? 34 : 31,
        class: 'ring' + (portals.has(n.name) ? ' portal' : '') + (selected === key ? ' selected' : '')}, group);
      const hit = element('circle', {r: 40, class: 'touch-target'}, group);
      const mark = element('text', {class: 'mark', y: 1}, group);
      mark.textContent = portals.has(n.name) ? '◇' : n.parent ? '✦' : '◎';
      const width = Math.max(73, Math.min(225, n.name.length * 8.6 + 26));
      element('rect', {class: 'label-hit', x: -width / 2, y: 39, width, height: 30, rx: 13}, group);
      const caption = element('text', {class: 'label', y: 59}, group);
      caption.textContent = n.name.length > 20 ? n.name.slice(0, 19) + '…' : n.name;
      // Keep the label visually above the hit area, but never select text while clicking.
      elements.nodes.set(n.name, { group, ring, hit, entry:n });
    }
    const counters = new Map();
    for (const row of visible) {
      const e = row.entry;
      if (e.kind === 'seed' || e.kind === 'branch') continue;
      const name = row.source === 'LAUF' ? e.node : e.name;
      if (!elements.nodes.has(name)) continue;
      const index = counters.get(name) || 0;
      counters.set(name, index + 1);
      const type = e.kind === 'run-end' && (e.result !== 'EXITED' || e.exitCode !== 0) ? 'failed' : e.kind;
      const group = element('g');
      bindButton(group, row.key, label(row));
      element('circle', {r: 8.5, class: 'event-dot ' + type}, group);
      element('circle', {r: 17, class: 'touch-target'}, group);
      elements.satellites.push({node:name, index, group, key:row.key});
    }
    // Reappend core to put its click target above the orbiting edges, not over nodes.
    svg.append(core);
    timeLabel.textContent = cap + ' / ' + ordered.length;
    timeLabel.title = cap ? ordered[cap - 1].at : '';
    drawGeometry(phase);
  }
  function refreshTimeline() {
    timeline.replaceChildren();
    ordered.forEach((row, index) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.dataset.key = row.key;
      const num = document.createElement('b');
      num.textContent = String(index + 1).padStart(2, '0');
      const body = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = label(row);
      const small = document.createElement('small');
      small.textContent = new Date(row.at).toLocaleString('de-DE')+' · lokal';
      body.append(strong, small); button.append(num, body); li.append(button); timeline.append(li);
      button.onclick = () => {
        auto = false; follow.setAttribute('aria-pressed','false'); follow.textContent = '○ Live folgen';
        slider.value = String(index + 1); selected = row.key; redraw(); showDetail();
      };
    });
  }
  slider.addEventListener('input', () => {
    auto = false; follow.setAttribute('aria-pressed', 'false');
    follow.textContent = '○ Live folgen';
    selected = ordered[Number(slider.value) - 1]?.key || null;
    redraw(); showDetail();
  });
  follow.onclick = () => {
    auto = true; follow.setAttribute('aria-pressed', 'true');
    follow.textContent = '● Live folgen';
    slider.value = String(ordered.length); redraw(); showDetail();
  };
  function updateMotionButton() {
    motionToggle.setAttribute('aria-pressed', String(motion));
    motionToggle.textContent = motion ? 'Ⅱ Flug stoppen' : '▶ Flug starten';
    flightStatus.textContent = motion ? 'VORTEX · RÄUMLICHE BEWEGUNG' : 'VORTEX · BEWEGUNG PAUSIERT';
  }
  motionToggle.onclick = () => { motion = !motion; updateMotionButton(); drawBackground(phase); drawGeometry(phase); };
  updateMotionButton();

  function sizeCanvas() {
    if (!context) return;
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(bounds.width * dpr));
    const h = Math.max(1, Math.round(bounds.height * dpr));
    if (w === lastMeasuredWidth && h === lastMeasuredHeight) return;
    canvas.width = lastMeasuredWidth = w;
    canvas.height = lastMeasuredHeight = h;
  }
  function drawBackground(tick) {
    if (!context) return;
    sizeCanvas();
    const ctx = context;
    ctx.setTransform(canvas.width / 1200, 0, 0, canvas.height / 680, 0, 0);
    ctx.clearRect(0, 0, 1200, 680);
    ctx.save();
    for (const s of stars) {
      ctx.globalAlpha = .21 + .36 * (.5 + Math.sin(tick * .001 + s.x) * .5);
      ctx.fillStyle = '#c4eefb'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const haze = ctx.createRadialGradient(cx, cy, 24, cx, cy, 390);
    haze.addColorStop(0, '#44275b7b'); haze.addColorStop(.20, '#15395662');
    haze.addColorStop(.55, '#10506f32'); haze.addColorStop(1, '#0a234100');
    ctx.fillStyle = haze; ctx.fillRect(10, 0, 1180, 680);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, .50);
    for (let r = 88; r <= 495; r += 54) {
      ctx.beginPath(); ctx.ellipse(0, 0, r, r, -.25, 0, Math.PI * 2);
      ctx.strokeStyle = r % 2 === 0 ? '#70eadc24' : '#8a74ed28';
      ctx.lineWidth = r < 200 ? 3.0 : 1.5; ctx.stroke();
    }
    ctx.restore();
    for (const streak of streaks) {
      const travel = (streak.f + tick * .000007 * streak.speed) % 1;
      const radius = 510 * Math.pow(1 - travel, .9) + 35;
      const a = streak.a + travel * 9.5 + tick * .00003;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius * .5;
      ctx.fillStyle = streak.speed > 1.35 ? '#c4a2ff' : '#93eaff';
      ctx.globalAlpha = .12 + .57 * Math.sin(travel * Math.PI);
      ctx.beginPath(); ctx.arc(x, y, 1.3 + travel * 1.7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 83);
    glow.addColorStop(0, '#02040d'); glow.addColorStop(.30, '#02050e');
    glow.addColorStop(.55, '#593c91c9'); glow.addColorStop(.64, '#a179d17a'); glow.addColorStop(1, '#9c8bf100');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, 84, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function animate(now) {
    const dt = lastFrame ? Math.max(0, Math.min(70, now - lastFrame)) : 0;
    lastFrame = now;
    if (motion) phase += dt;
    if (now - lastDraw >= 32 && motion) {
      drawBackground(phase);
      drawGeometry(phase);
      lastDraw = now;
    }
    requestAnimationFrame(animate);
  }
  window.addEventListener('resize', () => { drawBackground(phase); drawGeometry(phase); });
  drawBackground(phase);
  redraw();
  requestAnimationFrame(animate);

  async function poll() {
    try {
      const reply = await fetch('/state', {cache: 'no-store'});
      const data = await reply.json();
      if (!reply.ok) throw new Error(data.error || 'Belegprüfung fehlgeschlagen');
      if (!Array.isArray(data.garden) || !Array.isArray(data.runs)) throw new Error('Ungültiger Belegzustand');
      connection.textContent = '● LOKAL LIVE · 2 S';
      connection.classList.remove('off');
      if (!snapshot || snapshot.gardenHead !== data.gardenHead || snapshot.runHead !== data.runHead) {
        snapshot = data; ordered = entryList(data);
        slider.max = String(ordered.length);
        if (auto) slider.value = String(ordered.length);
        else slider.value = String(Math.min(Number(slider.value), ordered.length));
        refreshTimeline(); redraw(); showDetail();
      }
      document.getElementById('heads').textContent =
        'GARTEN ' + data.garden.length + ' EREIGNISSE · ' + String(data.gardenHead).slice(0, 16) +
        ' / LÄUFE ' + data.runs.length + ' EREIGNISSE · ' + String(data.runHead).slice(0, 16) +
        ' · ZEIT = AUFGEZEICHNETE EREIGNISSE · KEIN AUTOMATISCHER GITHUB-ABRUF';
    } catch (error) {
      connection.textContent = '● ANGEHALTEN · ' + error.message;
      connection.classList.add('off');
    }
  }
  poll(); setInterval(poll,2000);
})();
