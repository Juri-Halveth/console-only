(() => {
  'use strict';
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('world');
  const detail = document.getElementById('detail');
  const timeline = document.getElementById('timeline');
  const slider = document.getElementById('timeSlider');
  const timeLabel = document.getElementById('timeLabel');
  const connection = document.getElementById('connection');
  const follow = document.getElementById('follow');
  let snapshot = null;
  let ordered = [];
  let selected = null;
  let auto = true;
  let camera = { x: 0, y: 0, w: 1200, h: 680 };
  let drag = null;
  let moved = false;

  function element(tag, attrs = {}, parent = svg) {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    parent.append(node);
    return node;
  }
  function line(parent, text, tag = 'p') {
    const item = document.createElement(tag);
    item.textContent = text;
    parent.append(item);
    return item;
  }
  function cameraApply() {
    svg.setAttribute('viewBox', `${camera.x} ${camera.y} ${camera.w} ${camera.h}`);
  }
  function zoom(factor) {
    const width = Math.max(200, Math.min(2400, camera.w * factor));
    const height = width * 680 / 1200;
    camera.x += (camera.w - width) / 2;
    camera.y += (camera.h - height) / 2;
    camera.w = width; camera.h = height;
    cameraApply();
  }
  document.getElementById('zoomIn').onclick = () => zoom(.75);
  document.getElementById('zoomOut').onclick = () => zoom(1.33);
  document.getElementById('home').onclick = () => { camera = {x:0,y:0,w:1200,h:680}; cameraApply(); };
  svg.addEventListener('wheel', event => { event.preventDefault(); zoom(event.deltaY > 0 ? 1.15 : .87); }, { passive: false });
  svg.addEventListener('pointerdown', event => {
    drag = { x: event.clientX, y: event.clientY, left: camera.x, top: camera.y };
    moved = false;
  });
  svg.addEventListener('pointermove', event => {
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!moved && Math.abs(dx) + Math.abs(dy) > 5) {
      moved = true;
      svg.setPointerCapture(event.pointerId);
    }
    if (!moved) return;
    camera.x = drag.left - dx * camera.w / svg.clientWidth;
    camera.y = drag.top - dy * camera.h / svg.clientHeight;
    cameraApply();
  });
  svg.addEventListener('pointerup', () => { drag = null; });
  svg.addEventListener('pointercancel', () => { drag = null; });
  svg.addEventListener('click', event => {
    if (moved) { moved = false; return; }
    if (event.target === svg) { selected = null; showDetail(); }
  });

  function entryList(data) {
    const rows = [
      ...data.garden.map(e => ({ key: 'g-' + e.seq, at: e.at, source: 'GARTEN', entry: e })),
      ...data.runs.map(e => ({ key: 'r-' + e.seq, at: e.at, source: 'LAUF', entry: e }))
    ];
    rows.sort((a,b) => a.at.localeCompare(b.at) || a.source.localeCompare(b.source) || a.entry.seq - b.entry.seq);
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
    if (!selected) { line(detail, 'Wähle einen Knoten oder einen Zeitpunkt. Die Ansicht zeigt gespeicherte Ereignisse, keine unbeobachtete Außenwelt.'); return; }
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
      line(detail, 'Direkt gestarteter Prozess; Ergebnis kann noch offen sein.');
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
  function layout(nodes) {
    const children = new Map(nodes.map(n => [n.name, []]));
    for (const node of nodes) if (node.parent && children.has(node.parent)) children.get(node.parent).push(node.name);
    const leaves = nodes.filter(n => !children.get(n.name).length);
    const x = new Map(leaves.map((n,i) => [n.name, leaves.length === 1 ? 600 : 110 + i * 980 / (leaves.length - 1)]));
    for (const n of [...nodes].reverse()) if (children.get(n.name).length)
      x.set(n.name, children.get(n.name).reduce((sum,c) => sum + x.get(c), 0) / children.get(n.name).length);
    const depth = new Map();
    for (const n of nodes) depth.set(n.name, n.parent ? (depth.get(n.parent) || 0) + 1 : 0);
    const maxDepth = Math.max(1, ...depth.values());
    return new Map(nodes.map(n => [n.name, { x:x.get(n.name), y:555 - depth.get(n.name) * Math.min(125,420 / maxDepth) }]));
  }
  function redraw() {
    svg.replaceChildren();
    if (!snapshot) return;
    const cap = Number(slider.value);
    const visible = ordered.slice(0, cap);
    const gEvents = visible.filter(x => x.source === 'GARTEN').map(x => x.entry);
    const nodes = gEvents.filter(e => e.kind === 'seed' || e.kind === 'branch');
    const pos = layout(nodes);
    const portals = new Set(gEvents.filter(e => e.kind === 'portal').map(e => e.name));
    const sky = element('g');
    let seed = 341;
    for (let i=0;i<95;i++) {
      seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
      const x = seed % 1200;
      seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
      const y = seed % 680;
      element('circle', {cx:x,cy:y,r:i%7===0?1.4:.7,fill:'#95d4dc',opacity:i%7===0?.6:.22}, sky);
    }
    for (const n of nodes) {
      if (!n.parent || !pos.has(n.parent)) continue;
      const p=pos.get(n.parent), q=pos.get(n.name);
      element('path', {d:`M ${p.x} ${p.y} C ${p.x} ${(p.y+q.y)/2}, ${q.x} ${(p.y+q.y)/2}, ${q.x} ${q.y}`,class:'edge'});
    }
    for (const n of nodes) {
      const p=pos.get(n.name), key='g-'+n.seq;
      const group=element('g',{class:'hit',tabindex:'0',role:'button','aria-label':label({entry:n}),transform:`translate(${p.x} ${p.y})`});
      element('circle',{r:portals.has(n.name)?32:27,class:'ring'+(portals.has(n.name)?' portal':'')+(selected===key?' selected':'')},group);
      const symbol=element('text',{class:'mark',y:1},group); symbol.textContent=portals.has(n.name)?'◇':n.parent?'✦':'◎';
      const caption=element('text',{class:'label',y:52},group); caption.textContent=n.name.length>20?n.name.slice(0,19)+'…':n.name;
      group.addEventListener('click',()=>{if(moved)return;selected=key;showDetail();redraw();});
      group.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();selected=key;showDetail();redraw();}});
    }
    const satellites = new Map();
    for (const row of visible) {
      const e=row.entry;
      if (e.kind==='seed'||e.kind==='branch') continue;
      const name=row.source==='LAUF'?e.node:e.name;
      const p=pos.get(name);
      if (!p) continue;
      const count=satellites.get(name)||0;
      satellites.set(name,count+1);
      const angle=-Math.PI/2 + count*.87;
      const radius=49+Math.floor(count/6)*17;
      const x=p.x+Math.cos(angle)*radius, y=p.y+Math.sin(angle)*radius;
      const type=e.kind==='run-end' && (e.result!=='EXITED'||e.exitCode!==0)?'failed':e.kind;
      const dot=element('circle',{cx:x,cy:y,r:selected===row.key?11:8,class:'event-dot '+type+' hit',tabindex:'0',role:'button','aria-label':label(row)});
      dot.addEventListener('click',()=>{if(moved)return;selected=row.key;showDetail();redraw();});
      dot.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();selected=row.key;showDetail();redraw();}});
    }
    timeLabel.textContent=cap+' / '+ordered.length;
    if (cap) timeLabel.title=ordered[cap-1].at;
    else timeLabel.title='';
  }
  function refreshTimeline() {
    timeline.replaceChildren();
    ordered.forEach((row,index)=>{
      const li=document.createElement('li'), button=document.createElement('button');
      button.dataset.key=row.key;
      const number=document.createElement('b'); number.textContent=String(index+1).padStart(2,'0');
      const body=document.createElement('span'), strong=document.createElement('strong'), small=document.createElement('small');
      strong.textContent=label(row); small.textContent=new Date(row.at).toLocaleString('de-DE')+' · lokal';
      body.append(strong,small); button.append(number,body); li.append(button); timeline.append(li);
      button.onclick=()=>{auto=false;follow.setAttribute('aria-pressed','false');follow.textContent='○ Live folgen';
        slider.value=String(index+1);selected=row.key;redraw();showDetail();};
    });
  }
  slider.addEventListener('input',()=>{auto=false;follow.setAttribute('aria-pressed','false');
    follow.textContent='○ Live folgen';selected=ordered[Number(slider.value)-1]?.key||null;redraw();showDetail();});
  follow.onclick=()=>{auto=true;follow.setAttribute('aria-pressed','true');follow.textContent='● Live folgen';
    slider.value=String(ordered.length);redraw();};

  async function poll() {
    try {
      const reply=await fetch('/state',{cache:'no-store'});
      const data=await reply.json();
      if (!reply.ok) throw new Error(data.error||'Belegprüfung fehlgeschlagen');
      connection.textContent='● LOKAL LIVE · 2 S';connection.classList.remove('off');
      if (!snapshot || snapshot.gardenHead!==data.gardenHead || snapshot.runHead!==data.runHead) {
        snapshot=data;ordered=entryList(data);
        slider.max=String(ordered.length);
        if (auto) slider.value=String(ordered.length);
        else slider.value=String(Math.min(Number(slider.value),ordered.length));
        refreshTimeline();redraw();showDetail();
      }
      document.getElementById('heads').textContent=
        'GARTEN '+data.garden.length+' EREIGNISSE · '+data.gardenHead.slice(0,16)+
        ' / LÄUFE '+data.runs.length+' EREIGNISSE · '+data.runHead.slice(0,16)+
        ' · KEIN AUTOMATISCHER GITHUB-ABRUF';
    } catch (error) {
      connection.textContent='● ANGEHALTEN · '+error.message;
      connection.classList.add('off');
    }
  }
  poll();setInterval(poll,2000);
})();
