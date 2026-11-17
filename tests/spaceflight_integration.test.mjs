// Actual garden_live.js interaction/state QA under Node's VM.
// Canvas drawing is mocked; this is not evidence of browser/GPU visual output.
// Run from console-only root: node --experimental-vm-modules --test tests/spaceflight_integration.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

const project = path.resolve(process.env.KORRIDOT_ROOT || '.');
const sourceFile = process.env.KORRIDOT_LIVE_SOURCE ? path.resolve(process.env.KORRIDOT_LIVE_SOURCE) : path.join(project, 'src/garden_live.js');
const source = fs.readFileSync(sourceFile, 'utf8');
const noop = () => {};
const syntheticState = () => ({
  garden: [
    {seq:1,kind:'seed',name:'Konsole',parent:null,at:'2026-11-15T18:00:00Z',hash:'synthetic-1'},
    {seq:2,kind:'branch',name:'Welten',parent:'Konsole',at:'2026-11-15T18:00:01Z',hash:'synthetic-2'},
    {seq:3,kind:'note',name:'Welten',text:'Synthetic renderer QA evidence',at:'2026-11-15T18:00:02Z',hash:'synthetic-3'},
  ],
  runs:[], jobs:[], gardenHead:'synthetic-head', runHead:'', jobHead:''
});

async function runtime({search='',instrument=false}={}) {
  const listeners = new Map(), nodes = new Map(), imports = [], network = [];
  const ctx = new Proxy({
    createRadialGradient: () => ({addColorStop:noop}),
    createLinearGradient: () => ({addColorStop:noop}),
    measureText: text => ({width:String(text).length*6.2}),
    canvas:{width:1050,height:620}
  }, {get:(o,p)=>p in o ? o[p] : noop, set:(o,p,v)=>(o[p]=v,true)});
  const listen = (target, name, callback) => {
    const key = `${target}:${name}`;
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push(callback);
  };
  function element(id) {
    return {id,tagName:id==='world'||id==='cosmos'?'CANVAS':'DIV',style:{},dataset:{},
      value:'0',textContent:'',hidden:false,disabled:false,children:[],width:1050,height:620,
      classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
      addEventListener:(name,callback)=>listen(id,name,callback),
      removeEventListener:noop,setAttribute:noop,removeAttribute:noop,
      replaceChildren(){this.children=[];},append(...items){this.children.push(...items);},
      appendChild(item){this.children.push(item);return item;},
      focus:noop,blur:noop,getBoundingClientRect:()=>({width:1050,height:620,left:0,top:0}),
      hasPointerCapture:()=>false,setPointerCapture:noop,releasePointerCapture:noop,
      querySelectorAll:()=>[],
      getContext:type=>type==='2d'?ctx:null
    };
  }
  const get = id => nodes.get(id) || (nodes.set(id,element(id)),nodes.get(id));
  const document = {hidden:false,visibilityState:'visible',activeElement:null,
    getElementById:get,createElement:element,
    addEventListener:(name,callback)=>listen('document',name,callback)};
  let nextFrame = noop, clock = 0;
  const requestAnimationFrame = fn => (nextFrame=fn,1);
  const window = {devicePixelRatio:1,innerWidth:1050,innerHeight:620,
    matchMedia:()=>({matches:false,addEventListener:noop}),
    location:{hostname:'127.0.0.1',search},
    addEventListener:(name,callback)=>listen('window',name,callback),
    requestAnimationFrame};
  const state = syntheticState(), before = JSON.stringify(state), warnings=[];
  const sandbox = {document,window,console:{...console,warn:(...v)=>warnings.push(v.map(String).join(' '))},
    Math,Date,Array,Map,Set,Number,String,Object,Promise,Uint8Array,Uint32Array,Float32Array,AbortController,URLSearchParams,structuredClone,
    navigator:{hardwareConcurrency:4},setInterval:noop,clearInterval:noop,setTimeout,clearTimeout,
    performance:{now:()=>clock},requestAnimationFrame,cancelAnimationFrame:noop,
    fetch:async(url,options={})=>{
      network.push({url,method:options.method||'GET'});
      assert.equal(url,'/state','Unexpected network request in renderer');
      assert.equal(options.method||'GET','GET','Renderer attempted write');
      return {ok:true,json:async()=>state};
    }};
  const hook=`window.__importProbe={payload:simulationPayload,pending:()=>!!pendingImport,
    advance:seconds=>{simulationModel.step(seconds);drawScene();},
    follow:id=>{materialView.followId=id;followOrigin=null;spatialCamera('oblique');}};`;
  vm.runInNewContext(instrument?source.replace('window.__korridotProbe=Object.freeze({',hook+'window.__korridotProbe=Object.freeze({'):source, sandbox, {filename:sourceFile,
    importModuleDynamically:specifier=>{
      if (!/^\.\/[a-z0-9_-]+\.mjs$/i.test(specifier)) throw Error(`Nonlocal runtime import ${specifier}`);
      const promise=import(pathToFileURL(path.join(project,'src',specifier)).href);
      imports.push(promise);
      return promise;
    }});
  await Promise.all(imports);
  // Settle module `.then()` loaders and two awaited stages of the state poll.
  for(let i=0;i<6;i++) await Promise.resolve();
  const probe=window.__korridotProbe;
  assert.ok(probe?.spaceflight,'Spaceflight probe unavailable');
  assert.equal(probe.spaceflight().version,'1.0.0');
  function emit(target,type,properties={}) {
    const event={preventDefault:noop,stopPropagation:noop,repeat:false,target:get(target),
      currentTarget:get(target),...properties};
    return Promise.all((listeners.get(`${target}:${type}`)||[]).map(callback=>callback(event)));
  }
  function key(key,type='keydown') {emit('world',type,{key,code:key.length===1?`Key${key.toUpperCase()}`:key});}
  function step(dt=1/60) {clock+=dt*1000;nextFrame(clock);}
  function advance(seconds,hz=60,onFrame=noop) {
    for(let i=0;i<Math.round(seconds*hz);i++){step(1/hz);onFrame(probe.spaceflight(),probe.snapshot());}
  }
  step();  // Establish previous RAF timestamp before measurable integration.
  const finite=()=>{
    const state=probe.spaceflight();
    for(const group of ['camera','velocity']) {
      assert.ok(state[group],`Missing ${group}`);
      for(const axis of ['x','y','z']) assert.ok(Number.isFinite(state[group][axis]),`Nonfinite ${group}.${axis}`);
    }
    for(const angle of ['yaw','pitch','roll'])
      if(angle in state.camera)assert.ok(Number.isFinite(state.camera[angle]),`Nonfinite ${angle}`);
    assert.ok(Number.isFinite(state.beta) && state.beta>=0 && state.beta<1,`Invalid beta ${state.beta}`);
    for(const target of probe.snapshot().targets||[])
      for(const axis of ['x','y','depth'])assert.ok(Number.isFinite(target[axis]),`Nonfinite target ${axis}`);
    return state;
  };
  return {probe,get,key,emit,step,advance,finite,document,warnings,importProbe:window.__importProbe,
    unchanged:()=>assert.equal(JSON.stringify(state),before,'Renderer mutated synthetic Garden state'),
    network};
}

test('spaceflight initializes with finite camera and local read-only state',async()=>{
  const r=await runtime();r.finite();r.unchanged();
  assert.ok(r.network.length>=1,'Synthetic state not ingested');
  assert.equal(typeof r.probe.spaceflight().evidenceVisible,'boolean');
});

test('funding route finishes module loading with simulation off and matching controls',async()=>{
  const r=await runtime({search:'?spur=gg24'});
  assert.equal(r.probe.simulation().mode,'off');assert.equal(r.probe.simulation().state,null);
  assert.equal(r.get('simulationMode').value,'off');
  assert.equal(r.get('materialControls').hidden,true);assert.equal(r.get('simulationPNG').disabled,true);
  assert.match(r.get('watchStatus').textContent,/Modell AUS/);
  assert.doesNotMatch(r.get('watchStatus').textContent,/wird geladen/);
});

function importPacket(r,packet){
  const input=r.get('simulationImportFile'),text=JSON.stringify(packet);
  input.value='fixture.json';input.files=[{size:text.length,text:async()=>text}];
  return r.emit('simulationImportFile','change');
}

test('3D import restores a followed cell camera without a stale tracking delta',async()=>{
  const r=await runtime({search:'?modell=doppelacht',instrument:true});
  r.importProbe.follow('M00000');
  const saved=structuredClone(r.importProbe.payload());
  r.importProbe.advance(2);
  assert.notDeepEqual(structuredClone(r.importProbe.payload().observation.camera),saved.observation.camera);
  await importPacket(r,saved);r.probe.redraw();
  const restored=r.importProbe.payload();
  assert.deepEqual(structuredClone(restored.observation.camera),saved.observation.camera);
  assert.equal(restored.observation.view.followId,'M00000');
  assert.equal(restored.clock.playing,false);assert.equal(restored.model.tick,saved.model.tick);
});

test('3D import preserves the current scene while yielding and cancels on restart',async()=>{
  const r=await runtime({search:'?modell=doppelacht',instrument:true});
  r.importProbe.advance(4);const saved=structuredClone(r.importProbe.payload());
  const loading=importPacket(r,saved);
  for(let i=0;i<6;i++)await Promise.resolve();
  assert.ok(r.importProbe.pending());assert.match(r.get('watchStatus').textContent,/wird geprüft/);
  await r.emit('watchReset','click');await loading;
  assert.equal(r.importProbe.pending(),false);assert.equal(r.get('simulationImportFile').value,'');
  assert.equal(r.importProbe.payload().model.tick,0);
  assert.doesNotMatch(r.get('watchStatus').textContent,/wird geprüft|Import abgelehnt/);
});

test('a newer import supersedes pending replay without the old cleanup clearing it',async()=>{
  const r=await runtime({search:'?modell=doppelacht',instrument:true});
  const fresh=structuredClone(r.importProbe.payload());
  r.importProbe.advance(4);const old=structuredClone(r.importProbe.payload());
  const first=importPacket(r,old);for(let i=0;i<6;i++)await Promise.resolve();
  const second=importPacket(r,fresh);await Promise.all([first,second]);
  assert.equal(r.importProbe.pending(),false);assert.equal(r.get('simulationImportFile').value,'');
  assert.equal(r.importProbe.payload().model.tick,0);
  assert.deepEqual(structuredClone(r.importProbe.payload().observation.camera),fresh.observation.camera);
});

test('shell view shortcuts preserve optical distance while navigation exits it',async()=>{
  const r=await runtime({search:'?modell=doppelacht',instrument:true});
  const distance=r.probe.material().view.distance;assert.ok(Number.isFinite(distance));
  for(const key of ['f','Shift','r']){
    r.key(key);r.step();r.key(key,'keyup');
    assert.equal(r.probe.material().view.distance,distance,`${key} must preserve point-view optics`);
  }
  r.key('w');r.step();r.key('w','keyup');
  assert.equal(r.probe.material().view.distance,undefined,'forward navigation must exit point view');
});

test('W+Shift passes the old 240-unit end without teleporting back',async()=>{
  const r=await runtime();r.key('w');r.key('Shift');
  let previous=r.probe.snapshot().z,maximum=previous;
  r.advance(12,60,(_,snapshot)=>{
    assert.ok(snapshot.z>=previous-1e-7,`Forward flight reversed or wrapped: ${previous} -> ${snapshot.z}`);
    previous=snapshot.z;maximum=Math.max(maximum,snapshot.z);r.finite();
  });
  assert.ok(maximum>300,`Flight did not pass old travel boundary: ${maximum}`);
  r.key('w','keyup');r.key('Shift','keyup');r.unchanged();
});

test('D/E translation passes old ±7.2/±6 tube limits',async()=>{
  const r=await runtime();r.key('d');r.key('e');r.advance(4);
  const s=r.probe.snapshot();
  assert.ok(s.x>10,`Sideways motion still clamped at ${s.x}`);
  assert.ok(s.y>9,`Vertical motion still clamped at ${s.y}`);
  r.finite();r.key('d','keyup');r.key('e','keyup');r.unchanged();
});

test('yaw crosses pi; Home restores the origin and orientation',async()=>{
  const r=await runtime();r.key('ArrowRight');r.advance(6);r.key('ArrowRight','keyup');
  assert.ok(r.probe.snapshot().yaw>Math.PI,`Yaw remains bounded: ${r.probe.snapshot().yaw}`);
  r.key('w');r.key('d');r.advance(1);r.key('w','keyup');r.key('d','keyup');
  r.key('Home');r.key('Home','keyup');r.step();
  const s=r.probe.snapshot();
  for(const k of ['x','y','z','yaw','pitch','speed'])assert.ok(Math.abs(s[k])<1e-5,`Home did not reset ${k}: ${s[k]}`);
  r.finite();r.unchanged();
});

test('S reverses free flight, and X brakes actual velocity',async()=>{
  const r=await runtime();r.key('w');r.advance(3);r.key('w','keyup');
  const before=r.probe.snapshot().z;r.key('s');r.advance(3);r.key('s','keyup');
  assert.ok(r.probe.snapshot().z<before,'Reverse input failed to move back');
  assert.ok(r.probe.snapshot().speed<0,'Reverse velocity was not negative');
  r.key('x');r.advance(1.5);r.key('x','keyup');
  const v=r.finite().velocity;
  assert.ok(Math.hypot(v.x,v.y,v.z)<.2,`Brake left velocity ${JSON.stringify(v)}`);
  r.unchanged();
});

test('hidden page releases held input before resuming',async()=>{
  const r=await runtime();r.key('w');r.advance(2);
  assert.ok(r.probe.snapshot().speed>1);
  r.document.hidden=true;r.document.visibilityState='hidden';r.emit('document','visibilitychange');r.step();
  r.document.hidden=false;r.document.visibilityState='visible';r.emit('document','visibilitychange');
  r.advance(2);
  const v=r.finite().velocity;
  assert.ok(Math.hypot(v.x,v.y,v.z)<.2,`Held input survived hidden page: ${JSON.stringify(v)}`);
  r.unchanged();
});

test('60Hz and 120Hz input integration agree within 2 percent',async context=>{
  const positions=[];
  for(const hz of [60,120]){
    const r=await runtime();r.key('w');r.key('d');r.key('e');r.advance(6,hz);
    const s=r.finite().camera;positions.push([s.x,s.y,s.z]);r.unchanged();
  }
  const difference=Math.hypot(...positions[0].map((v,i)=>v-positions[1][i]));
  const reference=Math.max(1,Math.hypot(...positions[1]));
  assert.ok(difference/reference<.02,`Frame rate dependence ${(difference/reference*100).toFixed(3)}%; ${JSON.stringify(positions)}`);
  context.diagnostic(JSON.stringify({positions60Hz:positions[0],positions120Hz:positions[1],
    absoluteDifference:difference,relativeDifferencePercent:difference/reference*100}));
});
