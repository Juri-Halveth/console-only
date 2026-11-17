import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync('src/garden_live.js','utf8');
const start=src.indexOf('  // KORRIDOT_OPTIC_RAYS_V1_BEGIN');
const end=src.indexOf('  // KORRIDOT_OPTIC_RAYS_V1_END',start);
assert.ok(start>=0 && end>start);
const snippet=src.slice(start,end+'  // KORRIDOT_OPTIC_RAYS_V1_END'.length);
const doc={
  createElement:()=>({setAttribute(){},parentElement:null}),
  getElementById:()=>null
};
const state={document:doc,console,Math};
vm.runInNewContext(snippet+`
this.probe={
  rays:opticRays, refs:opticReferences, trace:opticTrace, world:opticWorld,
  hitSegment:opticHitsSegment, worldPoint:opticWorldPoint,
  set:()=>opticButton.onclick(),draw:drawOpticalField
};`,state,{timeout:3500});
const {probe}=state;
const ray=(off,wave)=>probe.rays.find(r=>r.wave===wave&&r.offset===off);

test('12 world-space rays: four offsets and three wavelengths',()=>{
  assert.equal(probe.rays.length,12);
  assert.equal(probe.refs.length,4);
  assert.deepEqual(JSON.parse(JSON.stringify(probe.rays.filter(r=>r.offset===.7).map(r=>r.wave))),[450,550,650]);
});
test('actual dark-body occlusion agrees with recorded Python synthetic model',()=>{
  assert.equal(ray(0,450).hit,true);
  assert.equal(ray(.7,450).hit,true);
  assert.equal(ray(.7,550).hit,true);
  assert.equal(ray(.7,650).hit,false);
  assert.equal(ray(.8,450).hit,false);
});
test('numeric wavelengths match existing local script within 0.003 degrees',()=>{
  const expected={450:2.226,550:3.399,650:4.874};
  for(const [nm,angle] of Object.entries(expected))
    assert.ok(Math.abs(ray(1.4,Number(nm)).angleDeg-angle)<0.003);
});
test('symmetric central ray hits; no artificial light-through-body',()=>{
  assert.equal(probe.trace(550,0,0).hit,true);
  assert.equal(probe.trace(550,0,.06).hit,true);
  assert.equal(probe.trace(550,1.4,0).hit,false);
});
test('segment-sphere intersection detects crossing between sparse samples',()=>{
  assert.equal(probe.hitSegment([-2,0,0],[2,0,0],0.75),true);
  assert.equal(probe.hitSegment([-2,1,0],[2,1,0],0.75),false);
});
test('same input produces exact same synthetic paths and stable world coordinates',()=>{
  const a=probe.trace(650,.7),b=probe.trace(650,.7);
  assert.equal(JSON.stringify(a),JSON.stringify(b));
  assert.equal(probe.world.z,236);
});
test('source and public preview have same optical source, with no private-data requests',()=>{
  const pub=fs.readFileSync('docs/preview.js','utf8');
  assert.ok(pub.includes('KORRIDOT_OPTIC_RAYS_V1_BEGIN'));
  assert.ok(pub.includes('drawOpticalField();'));
  for(const term of ['Date.now(', 'Math.random(', 'fetch(', '.zero/garden', 'localStorage'])
    assert.ok(!snippet.includes(term),'Forbidden optical dependency: '+term);
});
test('rendered data is on world XYZ, not attached to OBS-01 or the screen',()=>{
  assert.ok(snippet.includes('project(opticWorldPoint(local))'));
  assert.ok(!snippet.includes('observer.x'));
  assert.ok(!snippet.includes('observer.y'));
  assert.ok(!snippet.includes('observer.z'));
});
