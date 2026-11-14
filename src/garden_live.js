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
  document.getElementById('runtime').textContent = '● JAVASCRIPT AKTIV · KORRIDOT 0.8';
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
    drawFilaments();
    drawStars();
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
    coords.textContent=`X ${shipX.toFixed(1)} · Y ${shipY.toFixed(1)} · Z ${cameraZ.toFixed(1)} · ${Math.round(flightSpeed)} u/s · ${fps||'…'} FPS · T ${behind}/${ordered.length}`;
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
      strong.textContent=label(row);small.textContent=new Date(row.at).toLocaleString('de-DE')+' · lokal';
      body.append(strong,small);button.append(num,body);li.append(button);timeline.append(li);
      button.onclick=()=>focusRow(index);
    });
  }
  function focusRow(index) {
    if (index<0||index>=ordered.length) return;
    auto=false;motion=false;updateMotionButton();
    follow.setAttribute('aria-pressed','false');follow.textContent='○ Live folgen';
    slider.value=String(index+1); selected=ordered[index].key;
    targetZ=clamp(zFor(index)-18,0,maxTravel());
    showDetail();drawScene();
  }
  slider.addEventListener('input',()=>{
    if (!ordered.length) return;
    focusRow(Number(slider.value)-1);
  });
  follow.onclick=()=>{
    auto=true;follow.setAttribute('aria-pressed','true');follow.textContent='● Live folgen';
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
    pointerStart={id:event.pointerId,x:p.x,y:p.y,startYaw:targetYaw,startPitch:targetPitch,mode,at:performance.now()};
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
  const allowed=new Set(['w','s','a','d','q','e','x','Shift','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Home','Enter']);
  canvas.addEventListener('keydown',event=>{
    const key=event.key.length===1&&event.key!==' '?event.key.toLowerCase():event.key;
    if(!allowed.has(key))return;
    event.preventDefault();keys.add(key);
    if(event.repeat)return;
    if(key==='Home'){
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
    const wanted=braking?0:reverse?(boost?-78:-55):forward?(boost?53:36):motion?12:0;
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
    snapshot:()=>({z:cameraZ,x:shipX,y:shipY,speed:flightSpeed,thrust:thrustHeld,
      reverse:reverseHeld,brake:brakeHeld,autopilot:motion,
      yaw:yawOffset,pitch:pitchOffset,fps,quality,
      targets:targets.map(({key,x,y,depth})=>({key,x,y,depth})),
      deformation,flight:motion,events:ordered.length,selected}),
    projection:()=>{const p=project(surface(cameraZ+40,.8));return p ? {x:p.x,y:p.y,depth:p.depth}:null;}
  });

  async function poll() {
    try {
      const reply=await fetch('/state',{cache:'no-store'});
      const data=await reply.json();
      if(!reply.ok)throw new Error(data.error||'Belegprüfung fehlgeschlagen');
      if(!Array.isArray(data.garden)||!Array.isArray(data.runs))throw new Error('Ungültiger Belegzustand');
      connection.textContent='● LOKAL LIVE · 2 S';connection.classList.remove('off');
      if(!snapshot||snapshot.gardenHead!==data.gardenHead||snapshot.runHead!==data.runHead){
        snapshot=data;ordered=entryList(data);
        slider.max=String(ordered.length);
        if(auto)slider.value=String(ordered.length);
        else slider.value=String(Math.min(Number(slider.value),ordered.length));
        refreshTimeline();redraw();showDetail();
      }
      heads.textContent='GARTEN '+data.garden.length+' EREIGNISSE · '+String(data.gardenHead).slice(0,16)+
        ' / LÄUFE '+data.runs.length+' EREIGNISSE · '+String(data.runHead).slice(0,16)+
        ' · X/Y/Z = MODELL · T = BELEGZEIT · KEIN AUTOMATISCHER GITHUB-ABRUF';
    } catch(error) {
      connection.textContent='● ANGEHALTEN · '+error.message;connection.classList.add('off');
    }
  }
  poll();setInterval(poll,2000);
})();
