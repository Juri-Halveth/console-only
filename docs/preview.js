(() => {
  'use strict';
  // KORRIDOT: a single projected 3D scene. All geometry, membranes and receipts
  // inhabit the same XYZ frame. T is the ORDER of recorded receipts, not invented data.
  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d', { alpha: false });
  const detail = document.getElementById('detail');
  const timeline = document.getElementById('timeline');
  const slider = document.getElementById('timeSlider');
  const timeLabel = document.getElementById('timeLabel');
  const connection = document.getElementById('connection');
  const follow = document.getElementById('follow');
  const flightStatus = document.getElementById('flightStatus');
  const motionToggle = document.getElementById('motionToggle');
  const heads = document.getElementById('heads');
  const coords = document.getElementById('coords');
  // KORRIDOT_HYPERSPEED_V1: view-only speed controls. No Garden events or source timestamps modified.
  const speedCycleButton = document.getElementById('speedCycle');
  const warpRampButton = document.getElementById('warpRamp');
  const speedLevels = Object.freeze([1,2,4,8]);
  let speedIndex = 0;
  let warpRampEnabled = true;
  let cruiseAge = 0;
  let observerAge = 0;
  let currentRamp = 1;
  function rampAt(seconds) { return Math.min(4,1+Math.max(0,seconds-1)*0.12); }
  function updateSpeedControls() {
    speedCycleButton.textContent='⚡ Tempo ×'+speedLevels[speedIndex];
    speedCycleButton.title='Wiedergabe- und Flugtempo: ×1, ×2, ×4, ×8';
    warpRampButton.textContent=warpRampEnabled?'🚀 WARP AN':'🚀 WARP AUS';
    warpRampButton.setAttribute('aria-pressed',String(warpRampEnabled));
    warpRampButton.title='Sanfte Beschleunigung beim anhaltenden freien Flug, maximal zusätzlich ×4';
  }
  speedCycleButton.onclick=()=>{speedIndex=(speedIndex+1)%speedLevels.length;updateSpeedControls();redraw();};
  warpRampButton.onclick=()=>{warpRampEnabled=!warpRampEnabled;cruiseAge=observerAge=0;currentRamp=1;updateSpeedControls();redraw();};
  updateSpeedControls();

  // BTC_TIMEFLIGHT_V1. A separate temporal lane inside the SAME KORRIDOT scene.
  // BTC block time and Garden receipt time remain separate values.
  const btcFlyButton = document.getElementById('btcTimeFlight');
  let btcModel = null;
  let btcBlocks = [];
  let btcRailStatus = 'BTC-Leseansicht wird geladen';
  let btcPlayable = false;
  const btcFlight = {active:false, playing:false, elapsed:0, duration:20,
    orbitYaw:0, orbitPitch:.23, orbitDistance:24, sourceTimeMs:null,
    from:null, to:null};
  if (window.location.hostname === '127.0.0.1') {
    import('./btc_time_rail.mjs').then(module => {
      btcModel = module;
      rebuildBitcoinRail();
      redraw();
    }).catch(error => {
      btcRailStatus = 'BTC-Zeitmodul nicht geladen: ' + error.message;
      console.warn(btcRailStatus);
    });
  }

  // The new scene graph uses a separate synthetic model time, never the evidence time T.
  let dnaModule = null;
  let dnaScene = null;
  let dnaModelTime = 0;
  if (window.location.hostname === '127.0.0.1') {
    import('./openspace_dna.mjs').then(module => {
      dnaModule = module;
      dnaScene = module.compileCatalog(module.DEMO_CATALOG);
      if (selected) showDetail();
      redraw();
    }).catch(error => console.warn('OpenSpace DNA unavailable:', error.message));
  }

  const fieldPanel = document.getElementById('fieldLab');
  const fieldSlider = document.getElementById('fieldKappa');
  const fieldValue = document.getElementById('fieldValue');
  const fieldStatus = document.getElementById('fieldStatus');
  let fieldModel = null;
  let fieldTrajectory = null;
  function recalculateField() {
    if (!fieldModel) return;
    const kappa = Number(fieldSlider.value);
    if (!Number.isFinite(kappa)) return;
    const [ax, ay] = fieldModel.centralAcceleration([1, 0], kappa);
    fieldTrajectory = fieldModel.simulateCentral(kappa);
    fieldValue.textContent = kappa.toFixed(2).replace('.', ',');
    fieldStatus.textContent = `aₓ = ${ax.toFixed(6)} · aᵧ = ${ay.toFixed(6)} · ${fieldTrajectory.length} Stützpunkte`;
    if (view) redraw();
  }
  fieldSlider.addEventListener('input', recalculateField);
  // Public demo stays offline/synthetic. The original model is only served locally.
  if (window.location.hostname === '127.0.0.1') {
    import('./field_physics.mjs').then(model => {
      fieldModel = model;
      recalculateField();
    }).catch(() => { fieldStatus.textContent = 'Rechenkern nicht geladen'; });
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById('runtime').textContent = '● JAVASCRIPT AKTIV · KORRIDOT 0.9';
  const CORE = 'navigation:singularity';
  const TAU = Math.PI * 2;
  const STEP = 20;
  const FIRST = 32;
  let snapshot = null;
  let ordered = [];
  let selected = null;
  let auto = true;
  // Manual flight is the default. Auto-cruise is now opt-in, not invisible thrust.
  let motion = false;
  let deformation = true;
  let cameraZ = 0;
  let targetZ = null;
  let phase = 0;
  let lastFrame = 0;
  let yawOffset = 0;
  let pitchOffset = 0;
  let lens = 1.0;
  let width = 1000;
  let height = 650;
  let resolution = 1;
  let targets = [];
  let pointerStart = null;
  let dragged = false;
  let view = null;
  let lastHover = null;
  let frameCount = 0;
  // All input devices feed one continuously integrated flight state.
  let thrustHeld = false;
  let reverseHeld = false;
  let brakeHeld = false;
  let wheelImpulse = 0;
  let flightSpeed = 0;
  let shipX = 0, shipY = 0;
  let shipVX = 0, shipVY = 0;
  let targetYaw = 0, targetPitch = 0;
  let roll = 0;
  let fps = 0, fpsCounter = 0, fpsLast = 0;
  let quality = 1;
  const keys = new Set();
  // KORRIDOT OBS-01: a distinct scene entity with its own XYZ and local model age.
  // Event index T is read from the existing timeSlider; it is not wall time.
  const OBSERVER_KEY = 'observer:obs-01';
  const observer = {id:'OBS-01', x:0, y:0, z:0, seconds:0, ready:false, visible:true};
  let observerDetail = null;
  function observerHome() {
    const z = cameraZ + 43;
    const center = bend(z);
    observer.x = center.x + 3.5;
    observer.y = center.y + 0.5;
    observer.z = z;
    observer.seconds = 0;
    observer.ready = true;
    observer.visible = true;
  }
  function observerInfo() {
    return `X ${observer.x.toFixed(3)} · Y ${observer.y.toFixed(3)} · Z ${observer.z.toFixed(3)}` +
      `\nT ${Number(slider.value)}/${ordered.length} (Garden-Belegindex) · τ ${observer.seconds.toFixed(2)} s (Modell)` +
      (btcFlight.active && Number.isFinite(btcFlight.sourceTimeMs) && btcModel
        ? `\nBTC Headerzeit ${btcModel.formatBitcoinUTC(btcFlight.sourceTimeMs)}` +
          `\nSegment H${btcFlight.from} → H${btcFlight.to} · Quelle: Garden-BTC-Import`
        : '');
  }
  function observerTick(dt) {
    if (!observer.ready || !dt) return;
    observer.seconds += dt;
    const freeKeys=['i','j','k','l','u','o'];
    const flying=freeKeys.some(key=>keys.has(key));
    observerAge=flying && warpRampEnabled ? Math.min(60,observerAge+dt) : 0;
    const observerRamp=flying && warpRampEnabled ? rampAt(observerAge) : 1;
    const speed=(keys.has('Shift') ? 22 : 10)*speedLevels[speedIndex]*observerRamp;
    observer.x += ((keys.has('l') ? 1 : 0) - (keys.has('j') ? 1 : 0)) * speed * dt;
    observer.y += ((keys.has('u') ? 1 : 0) - (keys.has('o') ? 1 : 0)) * speed * dt;
    observer.z += ((keys.has('i') ? 1 : 0) - (keys.has('k') ? 1 : 0)) * speed * dt;
    observer.z = clamp(observer.z, 1, maxTravel() + 240);
  }

  const hashName = str => {
    let hash = 2166136261;
    for (const c of String(str)) hash = Math.imul(hash ^ c.codePointAt(0), 16777619);
    return hash >>> 0;
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const sample = n => { const v = Math.sin(n * 127.1 + 83.72) * 43758.545; return v - Math.floor(v); };
  // Deterministic, authored 3D star volumes. These are visual stars, not an astronomy catalogue.
  // Partitioning by Z means only nearby star cells are projected each frame.
  const starCells = Array.from({ length: 315 }, (_, cell) =>
    Array.from({ length: 52 }, (_, j) => {
      const id = cell * 52 + j;
      const z = cell * 16 + sample(id + 7) * 16;
      const a = sample(id + 201) * TAU;
      const radius = 2.5 + Math.sqrt(sample(id + 701)) * 35;
      const c = bend(z);
      return {x:c.x + radius * Math.cos(a), y:c.y + radius * Math.sin(a), z,
        size:.55 + sample(id + 1301) * 1.55,
        tint:sample(id + 1701), phase:sample(id + 2101) * TAU};
    }));

  function entryList(data) {
    const rows = [
      ...data.garden.map(e => ({ key: 'g-' + e.seq, at: e.at, source: 'GARTEN', entry: e })),
      ...data.runs.map(e => ({ key: 'r-' + e.seq, at: e.at, source: 'LAUF', entry: e })),
      ...(data.jobs || []).map(e => ({ key: 'j-' + e.seq, at: e.at, source: 'AUFTRAG', entry: e }))
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
    if (e.kind === 'job-start') return 'Auftrag · ' + e.node;
    if (e.kind === 'job-progress') return 'Fortschritt · ' + e.elapsedSeconds + 's';
    if (e.kind === 'job-end') return 'Auftrag · ' + (e.result === 'EXITED' && e.exitCode === 0 ? 'OK' : e.result);
    if (e.kind === 'run-start') return 'Start · ' + e.argv[0];
    return e.result === 'EXITED' && e.exitCode === 0 ? 'Ergebnis · OK' : 'Ergebnis · ' + e.result;
  }
  function prefix(row) {
    if (row.entry.kind.startsWith('job-')) return 'LANGAUFTRAG';
    return row.entry.kind.startsWith('run-') ? 'AUSFÜHRUNG' : row.entry.kind.toUpperCase();
  }
  function line(parent, value, tag = 'p') {
    const item = document.createElement(tag);
    item.textContent = String(value);
    parent.append(item);
    return item;
  }
  function showDetail() {
    detail.replaceChildren();
    fieldPanel.hidden = true;
    observerDetail = null;
    if (selected === OBSERVER_KEY) {
      line(detail, 'SIMULIERTE RAUMENTITÄT · NICHT BELEG', 'small');
      line(detail, 'OBS-01 · Mini-Beobachter', 'h3');
      observerDetail = line(detail, observerInfo(), 'pre');
      line(detail, 'I/K vor/zurück · J/L seitlich · U/O hoch/runter. Shift beschleunigt.');
      line(detail, 'B: vor der Kamera positionieren · N: sichtbar/unsichtbar.');
      line(detail, 'Koordinaten in KORRIDOT-Modell-u, nicht astronomische Messwerte.');
      return;
    }
    if (selected === CORE) {
      line(detail, 'NAVIGATION · RAUMGEOMETRIE', 'small');
      line(detail, 'Singularität / Horizont', 'h3');
      line(detail, 'Hier liegt die modellierte Fluchtrichtung des Korridors. Die geometrische Bewegung ist kein laufendes Programm und stellt keine automatische Außenverbindung her.');
      line(detail, 'Nur eine aufgezeichnete Portalbeziehung kann zu einer verlinkten Außenquelle führen.');
      return;
    }
    if (!selected) {
      line(detail, 'Klicke einen Raumkörper oder wähle einen Zeitpunkt in der Spur.');
      line(detail, 'Dies sind erfundene Beispielereignisse. Lokale Belege erscheinen hier nicht.');
      return;
    }
    const row = ordered.find(x => x.key === selected);
    if (!row) { selected = null; showDetail(); return; }
    const e = row.entry;
    fieldPanel.hidden = !(e.name === 'Funktionsatlas' || e.node === 'Funktionsatlas');
    line(detail, prefix(row), 'small');
    line(detail, label(row), 'h3');
    line(detail, 'UTC ' + e.at);
    line(detail, 'DEMO-ID ' + e.hash + ' · kein SHA-256-Beleg', 'code');
    const index = ordered.indexOf(row);
    line(detail, 'Raumzeitpunkt T' + (index + 1) + ' · Z ' + (FIRST + STEP * index));
    if (e.kind === 'branch') line(detail, 'Herkunft: ' + e.parent);
    if (e.kind === 'branch' && e.name === 'OpenSpace DNA') {
      line(detail, 'SYNTHETISCHE SZENENPROBE · Elternknoten + Zeit-Keyframes + distanzabhaengige Sichtbarkeit.', 'small');
      line(detail, 'Modellzeit ist NICHT Ereigniszeit. Keine NASA-Positionsdaten.');
      const modelTime = line(detail, `MODELL t = ${dnaModelTime} / 100`, 'p');
      const timelineControl = document.createElement('input');
      timelineControl.type = 'range';
      timelineControl.min = '0'; timelineControl.max = '100';
      timelineControl.step = '1'; timelineControl.value = String(dnaModelTime);
      timelineControl.setAttribute('aria-label', 'OpenSpace DNA: synthetische Modellzeit');
      timelineControl.style.width = '100%';
      timelineControl.addEventListener('input', () => {
        dnaModelTime = Number(timelineControl.value);
        modelTime.textContent = `MODELL t = ${dnaModelTime} / 100`;
        redraw();
      });
      detail.append(timelineControl);
      line(detail, dnaScene ? 'Katalog geladen: 6 Objekte · Quelle: SYNTHETISCH · Einheiten: Modell-u' :
        'Katalog wird geladen …');
    }
    if (e.kind === 'note') line(detail, e.text);
    if (e.kind === 'portal') {
      line(detail, 'Nur auf ausdrücklichen Klick öffnet sich die gespeicherte externe Website.');
      const a = document.createElement('a');
      a.href = e.url; a.rel = 'noopener noreferrer'; a.target = '_blank';
      a.textContent = 'HALVETH NETZ betreten ↗';
      detail.append(a);
    }
    if (e.kind.startsWith('job-')) {
      line(detail, 'Auftrag: ' + e.node + ' · ID ' + e.jobId);
      if (e.kind === 'job-start') line(detail, 'Programm: ' + e.program + ' · Limit: ' + e.timeoutSeconds + 's');
      if (e.kind === 'job-progress') line(detail, 'Beobachtet: ' + e.elapsedSeconds + 's · Ausgabevolumen: ' + e.outputBytes + ' Bytes (Inhalt bleibt lokal)');
      if (e.kind === 'job-end') line(detail, 'Ergebnis: ' + e.result + ' · Exit: ' + e.exitCode + ' · Zeit: ' + e.elapsedSeconds + 's · Log-SHA-256: ' + e.logHash);
    }
    if (e.kind === 'run-start') {
      line(detail, 'Erfasster Prozessstart. Die Sichtbahn ist keine laufende Terminalausgabe.');
      line(detail, 'Programm + Argumente: ' + JSON.stringify(e.argv), 'pre');
    }
    if (e.kind === 'run-end') {
      const start = snapshot.runs.find(x => x.kind === 'run-start' && x.runId === e.runId);
      line(detail, 'Exit: ' + (e.exitCode == null ? 'offen' : e.exitCode) + ' · ' + e.result);
      if (start) line(detail, 'Befehl: ' + JSON.stringify(start.argv), 'pre');
      if (e.output) line(detail, e.output, 'pre');
    }
    [...timeline.querySelectorAll('button')].forEach(b => b.classList.toggle('active', b.dataset.key === selected));
  }
  function zFor(index) { return FIRST + Math.max(0, index) * STEP; }
  function maxTravel() { return Math.max(240, zFor(ordered.length - 1) + 140); }
  function bend(z) {
    // This curved centerline is shared by geometry, camera and recorded anchors.
    return { x: 4.7 * Math.sin(z * .013) + 1.2 * Math.sin(z * .040),
             y: 2.7 * Math.cos(z * .015 + .72) + 1.2 * Math.sin(z * .034) };
  }
  function radius(z, a) {
    const phi = deformation ? phase : 0;
    const gate = Math.round((z - FIRST) / STEP);
    const cap = Number(slider.value);
    // A real recorded time slice locally deforms the *same* 3D surface.
    const d = (z - zFor(gate)) / 7.5;
    const membrane = gate >= 0 && gate < cap && deformation
      ? .17 * Math.exp(-d * d) * Math.cos(a * 4 - phi * .00074) : 0;
    return 9.4 * (1 + (deformation ? .12 * Math.sin(z * .056 - phi * .00067)
      + .075 * Math.sin(z * .128 + phi * .00037 + a * 3) : 0) + membrane);
  }
  function surface(z, angle, fraction = 1) {
    const c = bend(z);
    const phi = deformation ? phase : 0;
    const twist = angle + z * .012 + phi * .00018;
    const r = radius(z, angle) * fraction;
    return { x: c.x + Math.cos(twist) * r,
             y: c.y + Math.sin(twist) * r * .84, z };
  }
  function camera() {
    // Orbit camera can freely go around the pilot; the regular camera remains intact.
    if (btcFlight.active && observer.ready) {
      const d=btcFlight.orbitDistance, cp=Math.cos(btcFlight.orbitPitch);
      const x=observer.x+Math.sin(btcFlight.orbitYaw)*d*cp;
      const y=observer.y+Math.sin(btcFlight.orbitPitch)*d;
      const z=observer.z-Math.cos(btcFlight.orbitYaw)*d*cp;
      return {x,y,z,
        yaw:Math.atan2(observer.x-x,observer.z-z),
        pitch:Math.atan2(observer.y-y,Math.hypot(observer.x-x,observer.z-z)),roll:0};
    }
    const c = bend(cameraZ), next = bend(cameraZ + .3);
    return { x: c.x + shipX, y: c.y + shipY, z: cameraZ,
      yaw: Math.atan2(next.x - c.x, .3) + yawOffset,
      pitch: Math.atan2(next.y - c.y, .3) + pitchOffset, roll };
  }
  function project(p) {
    const dx = p.x - view.x, dy = p.y - view.y, dz = p.z - view.z;
    const a = Math.cos(view.yaw), b = Math.sin(view.yaw);
    const xx = dx * a - dz * b;
    const zz = dx * b + dz * a;
    const c = Math.cos(view.pitch), d = Math.sin(view.pitch);
    const yy = dy * c - zz * d;
    const depth = dy * d + zz * c;
    const rr = Math.cos(view.roll), rs = Math.sin(view.roll);
    const hx = xx*rr - yy*rs, hy = xx*rs + yy*rr;
    if (depth < .8 || depth > 310) return null;
    const focal = Math.min(width * .94, height * 1.03) * lens;
    return { x: width * .5 + hx * focal / depth,
      y: height * .5 - hy * focal / depth, depth,
      scale: focal / depth };
  }
  function setCanvasSize() {
    const box = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width)), h = Math.max(1, Math.round(box.height));
    const dpr = Math.min(1.7, window.devicePixelRatio || 1);
    if (width === w && height === h && resolution === dpr && canvas.width) return;
    width = w; height = h; resolution = dpr;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  function pathThrough(points, closed = false) {
    let started = false;
    ctx.beginPath();
    for (const p of points) {
      if (!p) { started = false; continue; }
      if (!started) { ctx.moveTo(p.x, p.y); started = true; }
      else ctx.lineTo(p.x, p.y);
    }
    if (closed && started) ctx.closePath();
  }
  function fade(depth) { return clamp(1 - depth / 280, .03, 1); }
  function drawBackdrop() {
    ctx.fillStyle = '#020914'; ctx.fillRect(0, 0, width, height);
    const c = project({ ...bend(cameraZ + 245), z: cameraZ + 245 }) || {x:width/2,y:height/2};
    const bg = ctx.createRadialGradient(c.x, c.y, 1, c.x, c.y, Math.max(width, height) * .75);
    bg.addColorStop(0, '#1d4266'); bg.addColorStop(.17, '#112d48');
    bg.addColorStop(.48, '#06172a'); bg.addColorStop(1, '#010610');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    // Horizon and vanishing point are projected from the camera's path.
    const core = ctx.createRadialGradient(c.x, c.y, 1, c.x, c.y, 110);
    core.addColorStop(0, '#b9ffea65'); core.addColorStop(.09, '#7efbdd46');
    core.addColorStop(.38, '#4d59b42b'); core.addColorStop(1, '#14264a00');
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(c.x,c.y,110,0,TAU); ctx.fill();
  }
  function drawStars() {
    // Stars are fixed world-space points: parallax is caused by camera translation,
    // not a scrolling texture or a separate layer.
    const first = Math.max(0, Math.floor(cameraZ / 16));
    const last = Math.min(starCells.length-1, Math.ceil((cameraZ+290)/16));
    const stride = quality < .65 ? 2 : 1;
    const motionBlur = Math.min(1,Math.abs(flightSpeed)/32);
    for (let cell=last;cell>=first;cell--) {
      for (let j=0;j<starCells[cell].length;j+=stride) {
        const star=starCells[cell][j];
        const p=project(star);
        if(!p||p.x<0||p.y<0||p.x>=width||p.y>=height)continue;
        const intensity=clamp((1-p.depth/310)*.66 + .13, .07, .8);
        const twinkle=.92+.08*Math.sin(phase*.0013+star.phase);
        const size=clamp(star.size*p.scale*.12,.4,2.4);
        const rgb=star.tint>.88?'255,205,170':star.tint<.13?'150,200,255':'225,243,255';
        ctx.fillStyle=`rgba(${rgb},${(intensity*twinkle).toFixed(3)})`;
        if(motionBlur>.16&&p.depth<105){
          // Lens-space star streaks reflect speed, but never imply physical star motion.
          ctx.strokeStyle=`rgba(${rgb},${(intensity*.42*motionBlur).toFixed(3)})`;
          ctx.lineWidth=Math.max(.6,size*.6);
          ctx.beginPath();ctx.moveTo(p.x,p.y);
          ctx.lineTo(p.x+(p.x-width*.5)*.012*motionBlur,
            p.y+(p.y-height*.5)*.012*motionBlur);ctx.stroke();
        }
        ctx.fillRect(p.x-size*.5,p.y-size*.5,size,size);
        if(star.tint>.967&&p.depth<175&&quality>.65){
          ctx.strokeStyle=`rgba(${rgb},${(intensity*.37).toFixed(3)})`;
          ctx.lineWidth=.6;
          ctx.beginPath();ctx.moveTo(p.x-size*2.8,p.y);ctx.lineTo(p.x+size*2.8,p.y);
          ctx.moveTo(p.x,p.y-size*2.8);ctx.lineTo(p.x,p.y+size*2.8);ctx.stroke();
        }
      }
    }
  }
  function drawFilaments() {
    // Elastic strands share the SAME bend/surface/project math as receipt markers.
    // They read as a distant spatial fabric, rather than stacked transverse bars.
    const count=quality<.65?8:13;
    const step=quality<.65?11:7;
    for(let filament=0;filament<count;filament++){
      const origin=TAU*filament/count;
      const points=[];
      for(let z=cameraZ+282;z>cameraZ+2;z-=step){
        const spiral=origin + z*.006 + Math.sin(z*.012+origin)*.17;
        points.push(project(surface(z,spiral,.82+Math.sin(z*.025+origin)*.12)));
      }
      pathThrough(points);
      ctx.lineWidth=filament%4===0?1.2:.7;
      ctx.strokeStyle=filament%3===0?'rgba(163,127,235,.22)':'rgba(83,209,217,.15)';
      ctx.stroke();
    }
  }
  function drawGate(row, index) {
    const z = zFor(index), dep = z - cameraZ;
    if (dep < 1 || dep > 274) return;
    const a = fade(dep);
    // A partial, spatially localized time membrane, not another tunnel hoop.
    const angle = (hashName(row.key) % 628) / 100;
    const pts = [];
    for (let k = 0; k <= 20; k++) pts.push(project(surface(z, angle + (k-10)*.038, .67)));
    pathThrough(pts);
    const e = row.entry;
    const color = e.kind === 'run-end' ? [123,243,181] : e.kind === 'run-start' ? [248,189,124]
      : e.kind === 'portal' ? [215,149,255] : [115,225,239];
    ctx.strokeStyle = `rgba(${color.join(',')},${(.07 + a * .28).toFixed(3)})`;
    ctx.lineWidth = 1.0 + 1.2*a; ctx.stroke();
  }
  function place(row, index) {
    const z = zFor(index);
    const key = row.source === 'LAUF' || row.source === 'AUFTRAG' ? row.entry.node : row.entry.name;
    const id = hashName(key);
    const angle = (id % 628) / 100 + index * 1.53;
    return surface(z, angle, .48);
  }
  function drawTrace(a, b) {
    const pts=[];
    for (let i=0;i<=12;i++) {
      const t=i/12;
      const z=mix(a.z,b.z,t), c=bend(z);
      pts.push(project({x:mix(a.x,b.x,t)*.95+c.x*.05,
        y:mix(a.y,b.y,t)*.95+c.y*.05-1.5*Math.sin(t*Math.PI),z}));
    }
    pathThrough(pts);
    ctx.strokeStyle='rgba(125,224,236,.31)';ctx.lineWidth=1.3;ctx.stroke();
  }
  // Receipt date belongs to the event. Never derived from the current clock.
  // Europe/Berlin handles historical MEZ/MESZ offsets; cache avoids per-frame parsing.
  const eventStampFormatter = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    timeZoneName: 'short'
  });
  const eventStampCache = new Map();
  function eventTimeLabel(at) {
    if (eventStampCache.has(at)) return eventStampCache.get(at);
    const time = new Date(at);
    if (!Number.isFinite(time.getTime())) return 'Zeit nicht verfügbar';
    const parts = Object.fromEntries(eventStampFormatter.formatToParts(time)
      .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    const label = `${parts.day}.${parts.month}.${parts.year} · ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}`;
    eventStampCache.set(at, label);
    return label;
  }
  function drawBeacon(row, index) {
    const loc=place(row,index), p=project(loc);
    if (!p || p.x < -180 || p.x > width+180 || p.y < -120 || p.y > height+120) return;
    const type = row.entry.kind;
    const good = (type === 'run-end' || type === 'job-end') && row.entry.result === 'EXITED' && row.entry.exitCode === 0;
    const col = type === 'job-progress' ? '#91b8ff' : type === 'job-start' ? '#ffc78a' : type === 'job-end' ? good ? '#85ffce' : '#ff7f99'
      : type === 'run-start' ? '#ffc78a' : type === 'run-end' ? good ? '#85ffce' : '#ff7f99'
      : type === 'portal' ? '#e1aeff' : type === 'note' ? '#91b8ff' : '#91f3dd';
    const radius = clamp(p.scale * (type === 'seed' || type === 'branch' ? .37 : .25), 5, 25);
    const focus = selected === row.key;
    const halo = ctx.createRadialGradient(p.x,p.y,1,p.x,p.y,radius*3.4);
    halo.addColorStop(0, col+'ae'); halo.addColorStop(.25,col+'4e'); halo.addColorStop(1,col+'00');
    ctx.fillStyle=halo;ctx.beginPath();ctx.arc(p.x,p.y,radius*3.4,0,TAU);ctx.fill();
    ctx.beginPath();ctx.arc(p.x,p.y,radius,0,TAU);
    ctx.fillStyle='#081b2d';ctx.fill();
    ctx.strokeStyle=focus?'#fff':col;ctx.lineWidth=focus?3:2.2;ctx.stroke();
    ctx.fillStyle=col;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(2.5,radius*.27),0,TAU);ctx.fill();
    // Billboards are screen-space text anchored to each projected 3D event body.
    // No standalone clock HUD or painted label boxes.
    if (p.depth < 140 && (width >= 600 || p.depth < 49 || focus)) {
      const title = label(row);
      const stamp = eventTimeLabel(row.entry.at);
      const leftSide = p.x > width * .62;
      const side = leftSide ? -1 : 1;
      const fontSize = clamp(10.5 + 75 / p.depth, 11, 14);
      const textX = p.x + side * (radius + 16);
      const textY = p.y - 2;
      const available = leftSide ? textX - 7 : width - textX - 7;
      const textWidth = Math.min(230, available);
      if (textWidth > 78 && textY > 18 && textY + 22 < height) {
        const alpha = focus ? 1 : clamp((165 - p.depth) / 70, .53, 1);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1;
        ctx.strokeStyle = focus ? '#d5fff3' : 'rgba(108,230,221,.5)';
        ctx.beginPath();
        ctx.moveTo(p.x + side * radius * .58, p.y);
        ctx.lineTo(textX - side * 5, textY + 1);
        ctx.stroke();
        ctx.textAlign = leftSide ? 'right' : 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `500 ${fontSize}px ui-monospace,Consolas,monospace`;
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = 'rgba(2,9,20,.92)';
        ctx.strokeText(title, textX, textY, textWidth);
        ctx.fillStyle = focus ? '#ffffff' : '#dcfff8';
        ctx.fillText(title, textX, textY, textWidth);
        ctx.font = '300 10px ui-monospace,Consolas,monospace';
        ctx.strokeText(stamp, textX, textY + 15, textWidth);
        ctx.fillStyle = focus ? '#b8fdef' : '#94cdd3';
        ctx.fillText(stamp, textX, textY + 15, textWidth);
        ctx.restore();
        const labelLeft = leftSide ? textX - textWidth : textX;
        targets.push({key:row.key,x:labelLeft+textWidth/2,y:textY+7,
          r:Math.max(18,textWidth/2),
          rect:{left:labelLeft,top:textY-14,right:labelLeft+textWidth,bottom:textY+21},
          depth:p.depth});
      }
    }
    targets.push({key:row.key,x:p.x,y:p.y,r:Math.max(19,radius+9),depth:p.depth});
  }
  function drawCore() {
    const z=Math.max(198,zFor(ordered.length-1)+60), c=bend(z);
    const p=project({x:c.x,y:c.y,z});
    if (!p) return;
    const s=clamp(p.scale*2.8,8,48);
    const glow=ctx.createRadialGradient(p.x,p.y,2,p.x,p.y,s*3.6);
    glow.addColorStop(0,'#05091d');glow.addColorStop(.27,'#240c40');
    glow.addColorStop(.45,'#a37ffb99');glow.addColorStop(.7,'#6cfde333');
    glow.addColorStop(1,'#9dc4fd00');
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(p.x,p.y,s*3.6,0,TAU);ctx.fill();
    ctx.strokeStyle='#cda9ff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,s*1.5,0,TAU);ctx.stroke();
    ctx.font='700 11px ui-monospace,monospace';ctx.textAlign='center';ctx.fillStyle='#f4ddff';
    if (s>=10) ctx.fillText('HORIZONT',p.x,p.y-s*2);
    targets.push({key:CORE,x:p.x,y:p.y,r:Math.max(24,s*1.6),depth:p.depth});
  }
  // Model t is not a new receipt. Curve is anchored beside the EXISTING
  // Funktionsatlas branch in KORRIDOT's projected 3D model space.
  function drawFieldTrajectory() {
    if (!fieldTrajectory || fieldPanel.hidden) return;
    const index = ordered.findIndex(row =>
      row.entry.kind === 'branch' && row.entry.name === 'Funktionsatlas');
    if (index < 0 || Number(slider.value) <= index) return;
    const anchor = place(ordered[index], index);
    const pts = fieldTrajectory.filter((_, i) => i % 4 === 0).map(point => project({
      x: anchor.x + (point.x - 1) * 2.7,
      y: anchor.y + point.y * 2.7,
      z: anchor.z + 3 + point.t * 9
    }));
    pathThrough(pts);
    ctx.strokeStyle = '#9bffdc';
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }
  // OpenSpace-inspired scene graph: its own parent transforms and time samples,
  // projected into KORRIDOT's EXISTING camera. No second canvas or data upload.
  function drawOpenSpaceDNA() {
    if (!dnaModule || !dnaScene) return;
    const index = ordered.findIndex(r =>
      r.entry.kind === 'branch' && r.entry.name === 'OpenSpace DNA');
    if (index < 0 || selected !== ordered[index].key || Number(slider.value) <= index) return;
    const anchor = place(ordered[index], index);
    const objects = dnaModule.snapshotScene(dnaScene, dnaModelTime, [0, 0, 0],
      {maxDistance: 50, minRelativeRadius: 0.005}).filter(o => o.visible);
    const projections = new Map();
    for (const object of objects) {
      const local = object.relative;
      const projection = project({
        x: anchor.x + local[0] * 1.2,
        y: anchor.y + local[1] * 1.2,
        z: anchor.z + 8 + local[2] * 1.2
      });
      if (projection) projections.set(object.id, projection);
    }
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(133,239,221,.42)';
    for (const object of objects) {
      const p = projections.get(object.id), parent = projections.get(object.parent);
      if (!p || !parent) continue;
      ctx.beginPath(); ctx.moveTo(parent.x, parent.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    for (const object of objects) {
      const p = projections.get(object.id);
      if (!p || p.x < 0 || p.x > width || p.y < 0 || p.y > height) continue;
      const radius = clamp(p.scale * object.radius * .25, 3, 11);
      ctx.fillStyle = '#a7ffe8';
      ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, TAU); ctx.fill();
      if (p.depth < 115) {
        ctx.font = '300 10px ui-monospace,monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#c8f4f0';
        ctx.fillText(object.label + ' · t' + dnaModelTime, p.x + radius + 7, p.y, 130);
      }
      targets.push({key:ordered[index].key,x:p.x,y:p.y,r:Math.max(radius + 8, 15),depth:p.depth});
    }
    ctx.restore();
  }
  function drawObserver() {
    if (!observer.visible || !observer.ready) return;
    const p = project(observer);
    if (!p || p.x < -85 || p.x > width+85 || p.y < -70 || p.y > height+70) return;
    const s = clamp(p.scale * .48, 3.5, 14);
    ctx.save();
    ctx.translate(p.x, p.y);
    // Tiny flying observer. Original vector silhouette, no external sprite or asset.
    ctx.rotate(Math.sin(observer.seconds * 1.4) * .065);
    ctx.fillStyle = '#8a74dd'; // miniature cloak trails behind the pilot
    ctx.beginPath();ctx.moveTo(-s*.3,-s*.2);
    ctx.lineTo(-s*1.55,s*.9);ctx.lineTo(-s*.8,-s*1.0);ctx.closePath();ctx.fill();
    ctx.lineWidth = Math.max(1,s*.16);
    ctx.strokeStyle = '#061a2d';
    ctx.fillStyle = '#7be8cf';
    ctx.beginPath();ctx.ellipse(0,s*.12,s*.52,s*.8,-.22,0,TAU);ctx.fill();ctx.stroke();
    ctx.strokeStyle = '#7be8cf';ctx.lineCap='round';
    for (const a of [-1,1]) {
      ctx.beginPath();ctx.moveTo(a*s*.28,s*.48);ctx.lineTo(a*s*.56,s*1.2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(a*s*.32,-s*.25);ctx.lineTo(a*s*.80,-s*.52);ctx.stroke();
    }
    ctx.fillStyle = '#f0d2aa';ctx.strokeStyle='#061a2d';ctx.lineWidth=Math.max(1,s*.13);
    ctx.beginPath();ctx.arc(0,-s*.95,s*.54,0,TAU);ctx.fill();ctx.stroke();
    ctx.fillStyle='#052638';
    ctx.beginPath();ctx.arc(s*.18,-s*.97,Math.max(.8,s*.08),0,TAU);ctx.fill();
    ctx.restore();
    // Ultra-thin camera-projected text, attached to the observer, not the HUD.
    const left = p.x + s*1.3+8 > width-210 ? p.x-s*1.3-218 : p.x+s*1.3+8;
    const top = Math.max(24,Math.min(height-36,p.y-s));
    const textLines = ['BEOBACHTER · OBS-01',
      `X ${observer.x.toFixed(3)}  Y ${observer.y.toFixed(3)}  Z ${observer.z.toFixed(3)}`,
      `T ${Number(slider.value)}/${ordered.length} · τ ${observer.seconds.toFixed(2)}s`];
    ctx.save();ctx.textAlign='left';ctx.textBaseline='alphabetic';
    ctx.font='500 10px ui-monospace,Consolas,monospace';
    ctx.lineJoin='round';ctx.lineWidth=2.5;
    const alpha=clamp((180-p.depth)/130,.48,1);
    ctx.globalAlpha=alpha;
    for (let i=0; i<textLines.length; i++) {
      const y=top+i*13;
      ctx.strokeStyle='rgba(2,10,24,.95)';ctx.strokeText(textLines[i],left,y,215);
      ctx.fillStyle=i===0?'#b8fff0':i===1?'#d8edf3':'#8bd6ce';
      ctx.fillText(textLines[i],left,y,215);
    }
    ctx.restore();
    targets.push({key:OBSERVER_KEY,x:p.x,y:p.y,r:Math.max(18,s*2.2),depth:p.depth});
  }
  function rebuildBitcoinRail() {
    if (!btcModel) return;
    const out=btcModel.extractBitcoinRail(ordered);
    btcBlocks=out.blocks.map(row=>({...row,position:place(ordered[row.index],row.index)}));
    btcPlayable=out.playable;
    btcRailStatus=out.reason;
    if (btcFlight.active && !btcPlayable) {
      btcFlight.active=false; btcFlight.playing=false;
    }
    updateBitcoinFlightButton();
  }
  function updateBitcoinFlightButton() {
    if (!btcFlyButton) return;
    btcFlyButton.disabled=!btcPlayable;
    btcFlyButton.textContent=btcFlight.active?'■ BTC-Flug verlassen':
      '▶ BTC-Zeitflug' + (btcBlocks.length ? ` (${btcBlocks.length})` : '');
    btcFlyButton.title=btcRailStatus;
  }
  function btcTick(dt) {
    if (!btcFlight.active || !btcModel || !btcPlayable) return;
    const first=btcBlocks[0].timeMs, last=btcBlocks[btcBlocks.length-1].timeMs;
    if (btcFlight.playing) {
      btcFlight.elapsed=Math.min(btcFlight.duration,btcFlight.elapsed+dt*speedLevels[speedIndex]);
      if (btcFlight.elapsed >= btcFlight.duration) btcFlight.playing=false;
    }
    const timeMs=first+(last-first)*btcFlight.elapsed/btcFlight.duration;
    const p=btcModel.sampleBitcoinRail(btcBlocks,timeMs);
    if (!p) {btcFlight.active=false;btcFlight.playing=false;updateBitcoinFlightButton();return;}
    observer.x=p.x;observer.y=p.y;observer.z=p.z;
    observer.visible=true;observer.ready=true;observer.seconds=btcFlight.elapsed;
    btcFlight.sourceTimeMs=p.timeMs;
    btcFlight.from=p.from;btcFlight.to=p.to;
    // cameraZ only controls depth culling/star cells. The view itself comes from camera().
    const orbit=camera();
    cameraZ=clamp(orbit.z,0,maxTravel());
  }
  function drawBitcoinRail() {
    if (!btcPlayable || !btcModel) return;
    const visible=btcBlocks.filter(b=>b.index<Number(slider.value));
    if (visible.length < 1) return;
    ctx.save();
    ctx.lineWidth=2.2;
    ctx.strokeStyle='rgba(255,198,109,.78)';
    for(let i=1;i<visible.length;i++) {
      const a=visible[i-1].position,b=visible[i].position, segment=[];
      for(let k=0;k<=18;k++) {
        const f=k/18;
        segment.push(project({x:mix(a.x,b.x,f),y:mix(a.y,b.y,f),z:mix(a.z,b.z,f)}));
      }
      pathThrough(segment);
      ctx.stroke();
    }
    for(const b of visible) {
      const p=project(b.position);
      if (!p || p.x<0 || p.x>width || p.y<0 || p.y>height) continue;
      const s=clamp(p.scale*.16,3,10);
      ctx.fillStyle='#ffcd81';
      ctx.beginPath();ctx.arc(p.x,p.y,s,0,TAU);ctx.fill();
      ctx.strokeStyle='#382412';ctx.lineWidth=1;ctx.stroke();
      if(btcFlight.active && p.depth<145) {
        ctx.font='600 10px ui-monospace,monospace';
        ctx.textAlign='left';ctx.fillStyle='#ffe4b8';
        ctx.fillText('BTC H'+b.height,p.x+s+7,p.y-6,95);
      }
    }
    ctx.restore();
  }
  function startBitcoinFlight() {
    if (!btcPlayable || !btcModel) return;
    btcFlight.active=true;btcFlight.playing=true;btcFlight.elapsed=0;
    btcFlight.orbitYaw=0;btcFlight.orbitPitch=.23;
    observer.visible=true;observer.ready=true;
    motion=false;flightSpeed=0;wheelImpulse=0;thrustHeld=false;cruiseAge=0;currentRamp=1;
    reverseHeld=false;brakeHeld=false;targetZ=null;
    auto=false;follow.setAttribute('aria-pressed','false');follow.textContent='○ Letztem Punkt folgen';
    slider.value=String(ordered.length);
    selected=OBSERVER_KEY;
    btcTick(0);showDetail();updateMotionButton();updateBitcoinFlightButton();drawScene();
    canvas.focus({preventScroll:true});
  }
  function stopBitcoinFlight() {
    btcFlight.active=false;btcFlight.playing=false;
    updateBitcoinFlightButton();updateMotionButton();
  }
  btcFlyButton.onclick=()=>{
    if(btcFlight.active) {stopBitcoinFlight();drawScene();}
    else startBitcoinFlight();
  };
  function drawScene() {
    if (!ctx) return;
    setCanvasSize();
    ctx.setTransform(resolution,0,0,resolution,0,0);
    view = camera(); targets=[];
    if (!observer.ready) observerHome();
    drawBackdrop();
    const visible=ordered.slice(0,Number(slider.value));
    const drawable=[];
    drawFilaments();
    drawStars();
    drawFieldTrajectory();
    drawBitcoinRail();
    drawOpenSpaceDNA();
    const points=visible.map((row,i)=>place(row,i));
    const indexByName=new Map();
    visible.forEach((row,i)=>{if(row.entry.kind==='seed'||row.entry.kind==='branch') indexByName.set(row.entry.name,i);});
    for (let i=0;i<visible.length;i++) {
      const row=visible[i], e=row.entry,z=zFor(i);
      drawable.push({z:z-.12,draw:()=>drawGate(row,i)});
      drawable.push({z:z-.34,draw:()=>drawBeacon(row,i)});
      if (e.kind==='branch' && indexByName.has(e.parent)) {
        const parent=points[indexByName.get(e.parent)], child=points[i];
        drawable.push({z:z-.17,draw:()=>drawTrace(parent,child)});
      }
    }
    const coreZ=Math.max(198,zFor(ordered.length-1)+60);
    drawable.push({z:coreZ,draw:drawCore});
    if (observer.visible) drawable.push({z:observer.z,draw:drawObserver});
    drawable.sort((a,b)=>b.z-a.z);
    for (const d of drawable) d.draw();
    if (observerDetail) observerDetail.textContent = observerInfo();
    const behind=ordered.reduce((n,row,i)=>n+(zFor(i)<cameraZ?1:0),0);
    const speedText=btcFlight.active ? `BTC ×${speedLevels[speedIndex]}` :
      `×${speedLevels[speedIndex]} · WARP ${warpRampEnabled?currentRamp.toFixed(1)+'×':'AUS'}`;
    coords.textContent=`X ${shipX.toFixed(1)} · Y ${shipY.toFixed(1)} · Z ${cameraZ.toFixed(1)} · ${Math.round(flightSpeed)} u/s · ${speedText} · ${fps||'…'} FPS · T ${behind}/${ordered.length}`;
    timeLabel.textContent=slider.value+' / '+ordered.length;
    timeLabel.title=Number(slider.value)?ordered[Number(slider.value)-1].at:'';
  }
  function redraw() { drawScene(); }
  function refreshTimeline() {
    timeline.replaceChildren();
    ordered.forEach((row,index)=>{
      const li=document.createElement('li'),button=document.createElement('button');
      button.dataset.key=row.key;
      const num=document.createElement('b');num.textContent=String(index+1).padStart(2,'0');
      const body=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');
      strong.textContent=label(row);small.textContent=new Date(row.at).toLocaleString('de-DE')+' · Demo';
      body.append(strong,small);button.append(num,body);li.append(button);timeline.append(li);
      button.onclick=()=>focusRow(index);
    });
  }
  function focusRow(index) {
    if (btcFlight.active) stopBitcoinFlight();
    if (index<0||index>=ordered.length) return;
    auto=false;motion=false;updateMotionButton();
    follow.setAttribute('aria-pressed','false');follow.textContent='○ Letztem Punkt folgen';
    slider.value=String(index+1); selected=ordered[index].key;
    targetZ=clamp(zFor(index)-18,0,maxTravel());
    showDetail();drawScene();
  }
  slider.addEventListener('input',()=>{
    if (!ordered.length) return;
    focusRow(Number(slider.value)-1);
  });
  follow.onclick=()=>{
    if (btcFlight.active) stopBitcoinFlight();
    auto=true;follow.setAttribute('aria-pressed','true');follow.textContent='● Letztem Punkt folgen';
    slider.value=String(ordered.length); targetZ=null;drawScene();
  };
  function updateMotionButton() {
    motionToggle.textContent=motion?'Ⅱ Autopilot stoppen':'▶ Autopilot starten';
    motionToggle.setAttribute('aria-pressed',String(motion));
    flightStatus.textContent=motion?'KORRIDOT · AUTOPILOT AKTIV':'KORRIDOT · MANUELLER FLUG · KEIN DAUERSCHUB';
  }
  motionToggle.onclick=()=>{motion=!motion;targetZ=null;updateMotionButton();};
  // Hold-to-fly surfaces work for touch, mouse, pen, and keyboard without
  // generating synthetic garden events or relying on click-toggle state.
  function bindHold(id, setHeld) {
    const button=document.getElementById(id);
    const change=down=>{setHeld(down);button.classList.toggle('held',down);
      button.setAttribute('aria-pressed',String(down));
      if(down)targetZ=null;
    };
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      event.preventDefault();change(true);
      try{button.setPointerCapture(event.pointerId);}catch(_){}
    });
    const release=()=>change(false);
    button.addEventListener('pointerup',release);
    button.addEventListener('pointercancel',release);
    button.addEventListener('lostpointercapture',release);
    button.addEventListener('keydown',event=>{
      if(event.key===' '||event.key==='Enter'){
        event.preventDefault();if(!event.repeat)change(true);
      }
    });
    button.addEventListener('keyup',event=>{
      if(event.key===' '||event.key==='Enter'){event.preventDefault();release();}
    });
    button.addEventListener('blur',release);
    return release;
  }
  document.getElementById('observerHome').onclick=()=>{
    if (btcFlight.active) stopBitcoinFlight();
    observerHome();observer.visible=true;selected=OBSERVER_KEY;showDetail();drawScene();
    canvas.focus({preventScroll:true});
  };
  const releaseReverse=bindHold('reverseHold',value=>{reverseHeld=value;});
  const releaseBrake=bindHold('brakeHold',value=>{brakeHeld=value;});
  document.getElementById('zoomIn').onclick=()=>{lens=clamp(lens*1.15,.55,1.9);drawScene();};
  document.getElementById('zoomOut').onclick=()=>{lens=clamp(lens/1.15,.55,1.9);drawScene();};
  document.getElementById('home').onclick=()=>{
    motion=false;updateMotionButton();cameraZ=0;targetZ=null;
    shipX=shipY=shipVX=shipVY=flightSpeed=wheelImpulse=0;
    yawOffset=pitchOffset=targetYaw=targetPitch=roll=0;drawScene();
  };
  document.getElementById('horizon').onclick=()=>{
    const end=Math.max(198,zFor(ordered.length-1)+60);
    motion=false;updateMotionButton();targetZ=clamp(end-22,0,maxTravel());
    selected=CORE;showDetail();drawScene();
  };
  const warpToggle=document.getElementById('warpToggle');
  warpToggle.onclick=()=>{
    deformation=!deformation;warpToggle.setAttribute('aria-pressed',String(deformation));
    warpToggle.textContent=deformation?'◇ Raumdehnung AN':'◇ Raumdehnung AUS';drawScene();
  };
  function pick(x,y) {
    const candidates=targets.filter(p=>p.rect ? x>=p.rect.left&&x<=p.rect.right&&y>=p.rect.top&&y<=p.rect.bottom
      : Math.hypot(x-p.x,y-p.y)<=p.r);
    // Select the nearest visible surface rather than an event hidden behind another marker.
    candidates.sort((a,b)=>a.depth-b.depth);
    return candidates.length ? candidates[0].key : null;
  }
  function localPoint(event) {
    const rect=canvas.getBoundingClientRect();
    return {x:event.clientX-rect.left,y:event.clientY-rect.top};
  }
  function steerTo(point,weight=1) {
    targetYaw=clamp(((point.x/Math.max(1,width))-.5)*1.65*weight,-.85,.85);
    targetPitch=clamp((.5-(point.y/Math.max(1,height)))*1.14*weight,-.58,.58);
  }
  function endPointer(event) {
    if(!pointerStart || pointerStart.id!==event.pointerId)return;
    const initial=pointerStart;
    pointerStart=null;
    if(initial.mode==='pilot')thrustHeld=false;
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    if(dragged){dragged=false;return;}
    // Touch tap still selects receipt markers; touch hold/drag flies.
    if(initial.mode==='pilot' && !(event.pointerType==='touch' && !dragged &&
      performance.now()-initial.at<260)) return;
    const p=localPoint(event),key=pick(p.x,p.y);
    if(key){selected=key;motion=false;targetZ=null;updateMotionButton();showDetail();}
    else {selected=null;showDetail();}
    drawScene();
  }
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='touch'&&event.button!==0&&event.button!==2)return;
    const p=localPoint(event);
    // Right-held mouse and touch both control live thrust + direction.
    const mode=event.pointerType==='touch'||event.button===2?'pilot':'look';
    pointerStart={id:event.pointerId,x:p.x,y:p.y,startYaw:targetYaw,startPitch:targetPitch,
      startBtcYaw:btcFlight.orbitYaw,startBtcPitch:btcFlight.orbitPitch,mode,at:performance.now()};
    dragged=false;
    if(mode==='pilot'){
      thrustHeld=true;
      steerTo(p,.6);
    }
    canvas.focus({preventScroll:true});
    canvas.setPointerCapture(event.pointerId);
    if(event.pointerType==='touch')event.preventDefault();
  });
  canvas.addEventListener('pointermove',event=>{
    const p=localPoint(event);
    if(pointerStart&&pointerStart.id===event.pointerId){
      const dx=p.x-pointerStart.x,dy=p.y-pointerStart.y;
      if(Math.hypot(dx,dy)>6)dragged=true;
      if(pointerStart.mode==='pilot') steerTo(p);
      else if(dragged && btcFlight.active){
        btcFlight.orbitYaw=pointerStart.startBtcYaw-dx*.007;
        btcFlight.orbitPitch=clamp(pointerStart.startBtcPitch+dy*.005,-1.27,1.27);
      }
      else if(dragged){
        targetYaw=clamp(pointerStart.startYaw-dx*.0022,-.85,.85);
        targetPitch=clamp(pointerStart.startPitch+dy*.0019,-.58,.58);
      }
    }else{
      const hit=pick(p.x,p.y);
      if(hit!==lastHover){lastHover=hit;canvas.style.cursor=hit?'pointer':'crosshair';}
    }
  });
  canvas.addEventListener('pointerup',endPointer);
  canvas.addEventListener('pointercancel',event=>{
    if(pointerStart&&pointerStart.id===event.pointerId){pointerStart=null;dragged=false;thrustHeld=false;}
  });
  canvas.addEventListener('lostpointercapture',()=>{if(pointerStart){pointerStart=null;thrustHeld=false;dragged=false;}});
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();
    // Wheel contributes a decaying velocity impulse instead of stepping cameraZ.
    wheelImpulse=clamp(wheelImpulse+Math.sign(event.deltaY)*7,-25,25);
  },{passive:false});
  const allowed=new Set(['w','s','a','d','q','e','x','i','j','k','l','u','o','b','n','p','Shift','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Home','Enter']);
  canvas.addEventListener('keydown',event=>{
    const key=event.key.length===1&&event.key!==' '?event.key.toLowerCase():event.key;
    if(!allowed.has(key))return;
    event.preventDefault();keys.add(key);
    if(event.repeat)return;
    if(key==='b'){if(btcFlight.active)stopBitcoinFlight();observerHome();selected=OBSERVER_KEY;showDetail();}
    else if(key==='p'&&btcFlight.active){btcFlight.playing=!btcFlight.playing;}
    else if(key==='n'){observer.visible=!observer.visible;}
    else if(key==='Home'){if(btcFlight.active)stopBitcoinFlight();
      cameraZ=0;shipX=shipY=shipVX=shipVY=flightSpeed=wheelImpulse=0;
      yawOffset=pitchOffset=targetYaw=targetPitch=roll=0;targetZ=null;motion=false;
    }else if(key===' '){motion=!motion;targetZ=null;}
    else if(key==='Enter'){
      const p=targets.filter(p=>p.key!==CORE).sort((a,b)=>a.depth-b.depth)[0];
      if(p){selected=p.key;showDetail();}
    }
    updateMotionButton();drawScene();
  });
  canvas.addEventListener('keyup',event=>{
    const key=event.key.length===1&&event.key!==' '?event.key.toLowerCase():event.key;
    keys.delete(key);
  });
  canvas.addEventListener('blur',()=>{keys.clear();thrustHeld=false;pointerStart=null;});
  window.addEventListener('blur',()=>{
    keys.clear();thrustHeld=false;pointerStart=null;releaseReverse();releaseBrake();
  });
  window.addEventListener('resize',drawScene);
  document.addEventListener('visibilitychange',()=>{
    lastFrame=0;
    if(document.hidden){thrustHeld=false;keys.clear();pointerStart=null;
      releaseReverse();releaseBrake();}
  });
  function animate(time) {
    const dt=lastFrame?clamp((time-lastFrame)/1000,0,.05):0;
    lastFrame=time;
    if(document.hidden){requestAnimationFrame(animate);return;}
    if(btcFlight.active) {
      // The pilot follows real source-time intervals at an accelerated playback rate.
      // Orbit keys are decoupled from the existing normal-flight steering.
      const yr=(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0);
      const pr=(keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0);
      btcFlight.orbitYaw+=yr*dt*1.8;
      btcFlight.orbitPitch=clamp(btcFlight.orbitPitch+pr*dt*1.2,-1.27,1.27);
      btcTick(dt);
      fpsCounter++;
      if(!fpsLast)fpsLast=time;
      if(time-fpsLast>=700){fps=Math.round(fpsCounter*1000/(time-fpsLast));fpsCounter=0;fpsLast=time;}
      phase+=dt*350;
      drawScene();
      requestAnimationFrame(animate);
      return;
    }
    // dt-based input integration is independent of monitor refresh rate.
    const damping=1-Math.exp(-dt*7.5);
    const keyYaw=(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0);
    const keyPitch=(keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0);
    if(keyYaw)targetYaw=clamp(targetYaw+keyYaw*dt*.95,-.85,.85);
    if(keyPitch)targetPitch=clamp(targetPitch+keyPitch*dt*.75,-.58,.58);
    yawOffset+= (targetYaw-yawOffset)*damping;
    pitchOffset+=(targetPitch-pitchOffset)*damping;
    roll+=(clamp(-yawOffset*.32,-.25,.25)-roll)*damping;
    const forward=thrustHeld||keys.has('w');
    const reverse=reverseHeld||keys.has('s');
    const boost=keys.has('Shift');
    const braking=brakeHeld||keys.has('x');
    // Reverse wins over held forward thrust. Fast braking crosses 0 promptly.
    // No auto-cruise after release unless the user explicitly enabled autopilot.
    const cruising=!braking && !reverse && (forward || motion);
    cruiseAge=cruising && warpRampEnabled ? Math.min(60,cruiseAge+dt) : 0;
    currentRamp=cruising && warpRampEnabled ? rampAt(cruiseAge) : 1;
    const baseWanted=braking?0:reverse?(boost?-78:-55):forward?(boost?53:36):motion?12:0;
    const wanted=baseWanted*speedLevels[speedIndex]*currentRamp;
    const reversing=(flightSpeed>0&&wanted<0)||(flightSpeed<0&&wanted>0);
    const response=braking?14:reversing?11:wanted?5.3:9;
    flightSpeed+=(wanted-flightSpeed)*(1-Math.exp(-dt*response));
    if(braking)wheelImpulse*=Math.exp(-dt*18);
    if(braking&&Math.abs(flightSpeed)<.1){flightSpeed=0;wheelImpulse=0;}
    if(forward||reverse||braking)targetZ=null;
    if(targetZ!==null){
      const diff=targetZ-cameraZ;
      if(Math.abs(diff)>.04) cameraZ+=diff*(1-Math.exp(-dt*5.5));
      else{cameraZ=targetZ;targetZ=null;}
    }else{
      cameraZ+=dt*(flightSpeed+wheelImpulse);
      if(cameraZ>maxTravel()){
        cameraZ=0;shipX=shipY=shipVX=shipVY=0; // visual looping never creates log events
      }
      cameraZ=Math.max(0,cameraZ);
      if(cameraZ===0 && flightSpeed<0) flightSpeed=0;
    }
    wheelImpulse*=Math.exp(-dt*4.7);
    if(Math.abs(wheelImpulse)<.02)wheelImpulse=0;
    const sidestep=(keys.has('d')?1:0)-(keys.has('a')?1:0);
    const lift=(keys.has('e')?1:0)-(keys.has('q')?1:0);
    const sideways=Math.sin(yawOffset)*flightSpeed*.32+sidestep*13;
    const upward=Math.sin(pitchOffset)*flightSpeed*.32+lift*13;
    const driftDamping=braking?15:5;
    shipVX+=(sideways-shipVX)*(1-Math.exp(-dt*driftDamping));
    shipVY+=(upward-shipVY)*(1-Math.exp(-dt*driftDamping));
    shipX=clamp(shipX+shipVX*dt,-7.2,7.2);
    shipY=clamp(shipY+shipVY*dt,-6,6);
    if(Math.abs(shipX)>=7.2)shipVX=0;
    if(Math.abs(shipY)>=6)shipVY=0;
    observerTick(dt);
    if(motion||thrustHeld||deformation||Math.abs(flightSpeed)>.1)phase+=dt*1000;
    fpsCounter++;
    if(!fpsLast)fpsLast=time;
    if(time-fpsLast>=700){fps=Math.round(fpsCounter*1000/(time-fpsLast));fpsCounter=0;fpsLast=time;}
    // Browser chooses its own refresh schedule; do not deliberately discard every second frame.
    const start=performance.now();
    drawScene();
    const renderMs=performance.now()-start;
    if(renderMs>24)quality=.55;
    else if(renderMs<13)quality=Math.min(1,quality+.015);
    requestAnimationFrame(animate);
  }
  updateMotionButton();
  redraw();
  requestAnimationFrame(animate);
  // A read-only geometry probe for local reproducible interaction tests.
  window.__korridotProbe=Object.freeze({
    hyperspeed:()=>Object.freeze({preset:speedLevels[speedIndex],warpEnabled:warpRampEnabled,
      cruiseAge,observerAge,ramp:currentRamp,btcPlayback:btcFlight.active,btcElapsed:btcFlight.elapsed}),
    btc:()=>Object.freeze({active:btcFlight.active,playing:btcFlight.playing,
      blocks:btcBlocks.map(b=>({height:b.height,hash:b.hash,previous:b.previous,time:b.time,
        x:b.position.x,y:b.position.y,z:b.position.z})),
      playable:btcPlayable,reason:btcRailStatus,elapsed:btcFlight.elapsed,
      sourceTimeMs:btcFlight.sourceTimeMs,orbitYaw:btcFlight.orbitYaw,orbitPitch:btcFlight.orbitPitch}),
    observer:()=>Object.freeze({id:observer.id,x:observer.x,y:observer.y,z:observer.z,
      t:observer.seconds,T:Number(slider.value),visible:observer.visible,ready:observer.ready}),
    snapshot:()=>({z:cameraZ,x:shipX,y:shipY,speed:flightSpeed,thrust:thrustHeld,
      reverse:reverseHeld,brake:brakeHeld,autopilot:motion,
      yaw:yawOffset,pitch:pitchOffset,fps,quality,
      targets:targets.map(({key,x,y,depth})=>({key,x,y,depth})),
      deformation,flight:motion,events:ordered.length,selected}),
    projection:()=>{const p=project(surface(cameraZ+40,.8));return p ? {x:p.x,y:p.y,depth:p.depth}:null;}
  });

  const data = {"garden":[{"seq":1,"kind":"seed","name":"Konsole","at":"2026-11-13T17:01:00+00:00","hash":"beispiel-g1"},{"seq":2,"kind":"branch","name":"Welten","at":"2026-11-13T17:02:00+00:00","hash":"beispiel-g2","parent":"Konsole"},{"seq":3,"kind":"branch","name":"Quellen","at":"2026-11-13T17:03:00+00:00","hash":"beispiel-g3","parent":"Konsole"},{"seq":4,"kind":"note","name":"Welten","at":"2026-11-13T17:04:00+00:00","hash":"beispiel-g4","text":"Ein Raum für ausdrücklich gestartete Experimente."},{"seq":5,"kind":"branch","name":"Erster Versuch","at":"2026-11-13T17:05:00+00:00","hash":"beispiel-g5","parent":"Welten"},{"seq":6,"kind":"note","name":"Quellen","at":"2026-11-13T17:06:00+00:00","hash":"beispiel-g6","text":"Quellen werden erst nach lokaler Aufnahme sichtbar."}],"runs":[{"seq":1,"kind":"run-start","node":"Welten","at":"2026-11-13T17:07:00+00:00","hash":"beispiel-r1","runId":"beispiel-lauf","argv":["python","-B","-c","print(\"Hallo aus einem Lauf\")"]},{"seq":2,"kind":"run-end","node":"Welten","at":"2026-11-13T17:08:00+00:00","hash":"beispiel-r2","runId":"beispiel-lauf","result":"EXITED","exitCode":0,"output":"Hallo aus einem Lauf\n"}],"gardenHead":"beispiel-g6","runHead":"beispiel-r2"};
  snapshot = data; ordered = entryList(data);
  slider.max = String(ordered.length); slider.value = String(ordered.length);
  refreshTimeline(); redraw(); showDetail();
  document.getElementById('heads').textContent = 'DEMO · ' + data.garden.length +
    ' BEISPIELEREIGNISSE · ' + data.runs.length + ' BEISPIEL-LAUFPUNKTE · OFFLINE';
})();
