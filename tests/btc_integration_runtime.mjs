// Browserless integration test for the existing KORRIDOT canvas runtime.
// Tests state ingestion, OBS-01 model, simulated flight and full orbit controls.
// Real Chrome inspection remains a separate acceptance step.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const src=fs.readFileSync('src/garden_live.js','utf8');
const noop=()=>{};
const listeners=new Map();
const ctx=new Proxy({
  createRadialGradient:()=>({addColorStop:noop}),
  measureText:(text)=>({width:String(text).length*6.2})
},{get:(o,p)=>(p in o?o[p]:noop),set:(o,p,v)=>{o[p]=v;return true;}});
function element(id){
  const n={id,style:{},dataset:{},value:'0',textContent:'',hidden:false,children:[],disabled:false,
    classList:{add:noop,remove:noop,toggle:noop},
    addEventListener:(name,fn)=>listeners.set(`${id}:${name}`,fn),
    setAttribute:noop,
    replaceChildren(){this.children=[]},
    append(...children){this.children.push(...children)},
    focus:noop,
    getBoundingClientRect:()=>({width:1050,height:620,left:0,top:0}),
    hasPointerCapture:()=>false,
    setPointerCapture:noop,releasePointerCapture:noop,
    querySelectorAll:()=>[]};
  if(id==='world'){n.getContext=()=>ctx;n.width=1050;n.height=620;}
  return n;
}
const map=new Map();
const get=id=>map.get(id)||map.set(id,element(id)).get(id);
const document={hidden:false,getElementById:get,createElement:element,addEventListener:noop};
let frame=noop;
const window={matchMedia:()=>({matches:false}),location:{hostname:'127.0.0.1'},
  devicePixelRatio:1,addEventListener:noop};
const hashes=['a'.repeat(64),'b'.repeat(64),'c'.repeat(64),'d'.repeat(64)];
const timestamps=['2026-11-15T16:34:27+00:00','2026-11-15T16:41:45+00:00',
  '2026-11-15T16:46:54+00:00','2026-11-15T16:51:03+00:00'];
const garden=[
  {seq:1,kind:'seed',name:'Konsole',parent:null,at:'2026-11-15T18:00:00+00:00',hash:'00'},
  {seq:2,kind:'branch',name:'Funktionsatlas',parent:'Konsole',at:'2026-11-15T18:00:01+00:00',hash:'01'},
  {seq:3,kind:'branch',name:'OpenSpace DNA',parent:'Funktionsatlas',at:'2026-11-15T18:00:02+00:00',hash:'02'},
  {seq:4,kind:'branch',name:'BTC 4D Beobachtung',parent:'Funktionsatlas',at:'2026-11-15T18:00:03+00:00',hash:'03'}
];
for(let i=0;i<4;i++){
  const h=975987+i;
  garden.push({seq:5+i*2,kind:'branch',name:`BTC H${h}`,
    parent:i?`BTC H${h-1}`:'BTC 4D Beobachtung',at:`2026-11-15T18:00:${String(4+i*2).padStart(2,'0')}+00:00`,hash:`b${i}`});
  garden.push({seq:6+i*2,kind:'note',name:`BTC H${h}`,
    text:`BITCOIN BLOCKHEADER | Hoehe ${h} | Blockzeit UTC ${timestamps[i]} | Hash ${hashes[i]} | Vorgaenger ${i?hashes[i-1]:'e'.repeat(64)} | API-TX-Anzahl 7000 | Header-PoW-Pruefung OK`,
    at:`2026-11-15T18:00:${String(5+i*2).padStart(2,'0')}+00:00`,hash:`n${i}`});
}
const state={garden,runs:[],jobs:[],gardenHead:'synthetic',runHead:'',jobHead:''};
const sandbox={document,window,console,Math,Date,Array,Map,Set,Number,String,
  navigator:{},setInterval:noop,performance:{now:()=>0},
  requestAnimationFrame:fn=>{frame=fn;},
  fetch:async()=>({ok:true,json:async()=>state})};

vm.runInNewContext(src,sandbox,{
  filename:'garden_live.js',
  importModuleDynamically:specifier=>{
    if(!['./field_physics.mjs','./openspace_dna.mjs','./btc_time_rail.mjs'].includes(specifier))
      throw Error('Unexpected runtime import: '+specifier);
    return import(pathToFileURL(path.resolve('src',specifier)).href);
  }
});

// Loader and /state poll complete asynchronously (not a browser UI screenshot).
for(let k=0;k<100 && (!window.__korridotProbe?.btc()?.playable);k++)
  await new Promise(resolve=>setTimeout(resolve,20));
const probe=window.__korridotProbe;
assert.ok(probe,'KORRIDOT probe unavailable');
const initial=probe.btc();
assert.equal(initial.playable,true,'Four linked BTC Garden headers not accepted: '+initial.reason);
assert.equal(initial.blocks.length,4);
assert.equal(get('btcTimeFlight').disabled,false,'Time flight button still disabled');

get('btcTimeFlight').onclick();
assert.equal(probe.btc().active,true,'BTC flight did not start');
assert.equal(probe.btc().playing,true,'BTC flight not playing');
const previousObserver=probe.observer();
for(let i=1;i<=30;i++)frame(i*16);
const result=probe.btc(),afterObserver=probe.observer();
assert.ok(result.elapsed>.35,'Simulated clock did not advance');
assert.ok(result.sourceTimeMs>Date.parse(timestamps[0]),'Header clock did not advance');
assert.ok(afterObserver.z>previousObserver.z+1,'OBS-01 did not follow real BTC path');

listeners.get('world:pointerdown')({pointerType:'mouse',button:0,pointerId:1,clientX:50,clientY:50,preventDefault:noop});
listeners.get('world:pointermove')({pointerType:'mouse',button:0,pointerId:1,clientX:850,clientY:260});
const orbit=probe.btc();
assert.ok(Math.abs(orbit.orbitYaw)>3.5,'Orbit horizontal range smaller than a full turn');
assert.ok(Math.abs(orbit.orbitPitch-.23)>.3,'Orbit vertical angle did not change');
listeners.get('world:pointerup')({pointerId:1,clientX:850,clientY:260,pointerType:'mouse'});

listeners.get('world:keydown')({key:'p',preventDefault:noop,repeat:false});
assert.equal(probe.btc().playing,false,'P did not pause');
get('btcTimeFlight').onclick();
assert.equal(probe.btc().active,false,'Flight stop did not restore normal camera mode');
console.log('BTC 4D RUNTIME OK: four source blocks, real timestamps, OBS-01 motion, 360-degree orbit, P pause, stop');
