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
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById('runtime').textContent = '● JAVASCRIPT AKTIV · KORRIDOT 0.6';
  const CORE = 'navigation:singularity';
  const TAU = Math.PI * 2;
  const STEP = 20;
  const FIRST = 32;
  let snapshot = null;
  let ordered = [];
  let selected = null;
  let auto = true;
  let motion = !reducedMotion;
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
  const hashName = str => {
    let hash = 2166136261;
    for (const c of String(str)) hash = Math.imul(hash ^ c.codePointAt(0), 16777619);
    return hash >>> 0;
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const sample = n => { const v = Math.sin(n * 127.1 + 83.72) * 43758.545; return v - Math.floor(v); };
  const dust = Array.from({ length: 185 }, (_, i) => ({
    z: sample(i + 1) * 270, a: sample(i + 201) * TAU, radius: .16 + sample(i + 601) * .67,
    size: .55 + sample(i + 1001) * 1.4
  }));

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
    return e.result === 'EXITED' && e.exitCode === 0 ? 'Ergebnis · OK' : 'Ergebnis · ' + e.result;
  }
  function prefix(row) {
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
    line(detail, prefix(row), 'small');
    line(detail, label(row), 'h3');
    line(detail, 'UTC ' + e.at);
    line(detail, 'DEMO-ID ' + e.hash + ' · kein SHA-256-Beleg', 'code');
    const index = ordered.indexOf(row);
    line(detail, 'Raumzeitpunkt T' + (index + 1) + ' · Z ' + (FIRST + STEP * index));
    if (e.kind === 'branch') line(detail, 'Herkunft: ' + e.parent);
    if (e.kind === 'note') line(detail, e.text);
    if (e.kind === 'portal') {
      line(detail, 'Nur auf ausdrücklichen Klick öffnet sich die gespeicherte externe Website.');
      const a = document.createElement('a');
      a.href = e.url; a.rel = 'noopener noreferrer'; a.target = '_blank';
      a.textContent = 'HALVETH NETZ betreten ↗';
      detail.append(a);
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
    const c = bend(cameraZ), next = bend(cameraZ + .3);
    return { x: c.x, y: c.y, z: cameraZ,
      yaw: Math.atan2(next.x - c.x, .3) + yawOffset,
      pitch: Math.atan2(next.y - c.y, .3) + pitchOffset };
  }
  function project(p) {
    const dx = p.x - view.x, dy = p.y - view.y, dz = p.z - view.z;
    const a = Math.cos(view.yaw), b = Math.sin(view.yaw);
    const xx = dx * a - dz * b;
    const zz = dx * b + dz * a;
    const c = Math.cos(view.pitch), d = Math.sin(view.pitch);
    const yy = dy * c - zz * d;
    const depth = dy * d + zz * c;
    if (depth < .8 || depth > 310) return null;
    const focal = Math.min(width * .94, height * 1.03) * lens;
    return { x: width * .5 + xx * focal / depth,
      y: height * .5 - yy * focal / depth, depth,
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
  function drawWireRing(z, emphasis = false) {
    const pts = [];
    const n = width < 480 ? 28 : 42;
    for (let k = 0; k <= n; k++) pts.push(project(surface(z, k / n * TAU)));
    const depth = z - cameraZ;
    const a = fade(depth);
    pathThrough(pts);
    ctx.strokeStyle = emphasis ? `rgba(182,142,255,${(.19 + a * .32).toFixed(3)})`
      : `rgba(101,235,218,${(.07 + a * .32).toFixed(3)})`;
    ctx.lineWidth = emphasis ? 1.9 : .75 + a * .7;
    ctx.stroke();
    // A translucent elastic cross-section is *inside* the projected tube, not a separate background.
    if (emphasis && pts.every(Boolean)) {
      pathThrough(pts, true);
      ctx.fillStyle = `rgba(114,90,181,${(.014 + a * .018).toFixed(3)})`;
      ctx.fill();
    }
  }
  function drawTube(z, index) {
    const far = z + 4.6;
    const d = z - cameraZ;
    const alpha = fade(d);
    if (d > 284 || d < 1) return;
    // Elastic surface is tessellated in the same XYZ space as the event gates.
    // Translucent ribbons pass behind and in front of the recorded bodies by depth.
    for (let k = 0; k < 24; k += 1) {
      const a = TAU * k / 24, b = TAU * (k + 1) / 24;
      const p = project(surface(z,a)), q = project(surface(far,a));
      const s = project(surface(z,b)), t = project(surface(far,b));
      if (!p || !q || !s || !t) continue;
      if ((k + index) % 3 !== 1) {
        pathThrough([p,q,t,s],true);
        ctx.fillStyle = (k % 2 === 0) ? `rgba(53,175,192,${(.008 + alpha * .013).toFixed(3)})`
          : `rgba(94,77,181,${(.009 + alpha * .014).toFixed(3)})`;
        ctx.fill();
      }
      pathThrough([p,q]);
      ctx.strokeStyle = (k % 3 === 0) ? `rgba(120,243,230,${(.07 + alpha * .23).toFixed(3)})`
        : `rgba(91,126,202,${(.025 + alpha * .10).toFixed(3)})`;
      ctx.lineWidth = k % 3 === 0 ? 1.2 : .7;
      ctx.stroke();
    }
    if (index % 2 === 0) drawWireRing(z, index % 10 === 0);
  }
  function drawGate(row, index) {
    const z = zFor(index), dep = z - cameraZ;
    if (dep < 1 || dep > 274) return;
    const a = fade(dep);
    const pts = [];
    for (let k = 0; k <= 50; k++) pts.push(project(surface(z, TAU*k/50, .77)));
    pathThrough(pts);
    const e = row.entry;
    const color = e.kind === 'run-end' ? [123,243,181] : e.kind === 'run-start' ? [248,189,124]
      : e.kind === 'portal' ? [215,149,255] : [115,225,239];
    ctx.strokeStyle = `rgba(${color.join(',')},${(.12 + a * .35).toFixed(3)})`;
    ctx.lineWidth = 1.0 + 1.7*a; ctx.stroke();
    if (dep < 70 && pts.every(Boolean)) {
      pathThrough(pts, true);
      ctx.fillStyle = `rgba(${color.join(',')},${(.015 + .02*a).toFixed(3)})`;
      ctx.fill();
    }
  }
  function drawDust() {
    const length = 270;
    for (const v of dust) {
      const z = cameraZ + ((v.z - (cameraZ % length) + length) % length) + 2;
      const p = project(surface(z, v.a, v.radius));
      if (!p || p.x < -4 || p.y < -4 || p.x > width + 4 || p.y > height + 4) continue;
      const size = clamp(v.size * p.scale * .16, .45, 3.7);
      ctx.fillStyle = `rgba(183,238,254,${(.25 + fade(p.depth)*.37).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(p.x,p.y,size,0,TAU);ctx.fill();
    }
  }
  function place(row, index) {
    const z = zFor(index);
    const key = row.source === 'LAUF' ? row.entry.node : row.entry.name;
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
  function drawBeacon(row, index) {
    const loc=place(row,index), p=project(loc);
    if (!p || p.x < -180 || p.x > width+180 || p.y < -120 || p.y > height+120) return;
    const type = row.entry.kind;
    const good = type === 'run-end' && row.entry.result === 'EXITED' && row.entry.exitCode === 0;
    const col = type === 'run-start' ? '#ffc78a' : type === 'run-end' ? good ? '#85ffce' : '#ff7f99'
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
    if (p.depth < 110 && (width >= 600 || p.depth < 49 || selected === row.key)) {
      const title=label(row);
      const font=clamp(10+85/p.depth,10,14);
      ctx.font=`600 ${font}px system-ui, sans-serif`;
      const labelW=clamp(ctx.measureText(title).width+20,55,205);
      const left=clamp(p.x-labelW/2,3,width-labelW-3), top=p.y+radius+7;
      if (top<height-26 && top>5) {
        ctx.fillStyle=focus?'rgba(34,85,95,.96)':'rgba(8,28,43,.85)';
        ctx.strokeStyle=focus?'#d3fff6':'rgba(122,190,205,.54)';
        ctx.lineWidth=1;
        ctx.beginPath();ctx.roundRect(left,top,labelW,24,9);ctx.fill();ctx.stroke();
        ctx.fillStyle='#e9fffa';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(title.length>22?title.slice(0,21)+'…':title,left+labelW/2,top+12,labelW-13);
        targets.push({key:row.key,x:left+labelW/2,y:top+12,r:Math.max(labelW/2,16),
          rect:{left,top,right:left+labelW,bottom:top+24},depth:p.depth});
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
  function drawScene() {
    if (!ctx) return;
    setCanvasSize();
    ctx.setTransform(resolution,0,0,resolution,0,0);
    view = camera(); targets=[];
    drawBackdrop();
    const visible=ordered.slice(0,Number(slider.value));
    const drawable=[];
    const ringStep=4.6;
    for (let i=65;i>=1;i--) {
      const z=cameraZ+i*ringStep;
      if (z-cameraZ>290) continue;
      drawable.push({z,draw:()=>drawTube(z,i)});
    }
    // Dust uses this exact projection too; it is not an independent background animation.
    drawDust();
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
    drawable.sort((a,b)=>b.z-a.z);
    for (const d of drawable) d.draw();
    const behind=ordered.reduce((n,row,i)=>n+(zFor(i)<cameraZ?1:0),0);
    coords.textContent=`KAMERA Z ${cameraZ.toFixed(1)} · T ${behind}/${ordered.length} · ${motion?'FLUG':'HALT'}`;
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
    auto=true;follow.setAttribute('aria-pressed','true');follow.textContent='● Letztem Punkt folgen';
    slider.value=String(ordered.length); targetZ=null;drawScene();
  };
  function updateMotionButton() {
    motionToggle.textContent=motion?'Ⅱ Flug stoppen':'▶ Flug starten';
    motionToggle.setAttribute('aria-pressed',String(motion));
    flightStatus.textContent=motion?'KORRIDOT · FLUG DURCH EINEN GEKRÜMMTEN 3D-RAUM':'KORRIDOT · KAMERA ANGEHALTEN';
  }
  motionToggle.onclick=()=>{motion=!motion;targetZ=null;updateMotionButton();};
  document.getElementById('zoomIn').onclick=()=>{lens=clamp(lens*1.15,.55,1.9);drawScene();};
  document.getElementById('zoomOut').onclick=()=>{lens=clamp(lens/1.15,.55,1.9);drawScene();};
  document.getElementById('home').onclick=()=>{
    motion=false;updateMotionButton();cameraZ=0;targetZ=null;yawOffset=0;pitchOffset=0;drawScene();
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
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0) return;
    const p=localPoint(event);
    pointerStart={id:event.pointerId,x:p.x,y:p.y,startYaw:yawOffset,startPitch:pitchOffset};
    dragged=false;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    const p=localPoint(event);
    if(pointerStart&&pointerStart.id===event.pointerId){
      const dx=p.x-pointerStart.x,dy=p.y-pointerStart.y;
      if(Math.hypot(dx,dy)>5)dragged=true;
      if(dragged){
        motion=false;targetZ=null;updateMotionButton();
        yawOffset=clamp(pointerStart.startYaw-dx*.0021,-.78,.78);
        pitchOffset=clamp(pointerStart.startPitch+dy*.0018,-.65,.65);
        drawScene();
      }
    } else {
      const hit=pick(p.x,p.y);
      if(hit!==lastHover){lastHover=hit;canvas.style.cursor=hit?'pointer':'grab';}
    }
  });
  canvas.addEventListener('pointerup',event=>{
    if(!pointerStart||pointerStart.id!==event.pointerId)return;
    const p=localPoint(event);
    pointerStart=null;
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    if(dragged){dragged=false;return;}
    const key=pick(p.x,p.y);
    if(key){
      selected=key;motion=false;targetZ=null;updateMotionButton();
      showDetail();drawScene();
    } else {selected=null;showDetail();drawScene();}
  });
  canvas.addEventListener('pointercancel',()=>{pointerStart=null;dragged=false;});
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();motion=false;targetZ=null;updateMotionButton();
    cameraZ=clamp(cameraZ+Math.sign(event.deltaY)*9,0,maxTravel());drawScene();
  },{passive:false});
  canvas.addEventListener('keydown',event=>{
    if(['ArrowRight','ArrowLeft','ArrowUp','ArrowDown',' ','Enter','Home'].includes(event.key))event.preventDefault();
    if(event.key==='ArrowRight'||event.key==='w'){
      motion=false;cameraZ=clamp(cameraZ+8,0,maxTravel());
    } else if(event.key==='ArrowLeft'||event.key==='s'){
      motion=false;cameraZ=clamp(cameraZ-8,0,maxTravel());
    } else if(event.key==='ArrowUp'){pitchOffset=clamp(pitchOffset+.10,-.65,.65);}
    else if(event.key==='ArrowDown'){pitchOffset=clamp(pitchOffset-.10,-.65,.65);}
    else if(event.key==='Home'){cameraZ=0;pitchOffset=0;yawOffset=0;motion=false;}
    else if(event.key===' '){motion=!motion;targetZ=null;}
    else if(event.key==='Enter'){
      const p=targets.filter(p=>p.key!==CORE).sort((a,b)=>a.depth-b.depth)[0];
      if(p){selected=p.key;showDetail();}
    }
    updateMotionButton();drawScene();
  });
  window.addEventListener('resize',drawScene);
  document.addEventListener('visibilitychange',()=>{lastFrame=0;});
  function animate(time) {
    const dt=lastFrame?clamp((time-lastFrame)/1000,0,.06):0;
    lastFrame=time;
    if(document.visibilityState==='hidden'){requestAnimationFrame(animate);return;}
    let changed=false;
    if(targetZ!==null){
      const diff=targetZ-cameraZ;
      if(Math.abs(diff)>.035){cameraZ+=diff*Math.min(1,dt*5.5);changed=true;}
      else {cameraZ=targetZ;targetZ=null;changed=true;}
    }
    if(motion){
      cameraZ+=dt*11.5;
      if(cameraZ>maxTravel())cameraZ=0; // visual looping never creates log events
      changed=true;
    }
    if(motion||deformation){phase+=dt*1000;changed=true;}
    frameCount++;
    if(changed&&frameCount%2===0)drawScene();
    requestAnimationFrame(animate);
  }
  updateMotionButton();
  redraw();
  requestAnimationFrame(animate);
  // A read-only geometry probe for local reproducible interaction tests.
  window.__korridotProbe=Object.freeze({
    snapshot:()=>({z:cameraZ,targets:targets.map(({key,x,y,depth})=>({key,x,y,depth})),
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
