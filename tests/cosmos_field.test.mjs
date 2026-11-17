import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_SEED, WORLD_LIMIT, DEPTH_BANDS, chunkAt, densityAt, materialAt,
  supportWeight, projectPoint } from '../src/cosmos_field.mjs';
const P = Object.freeze({ x: 17.2, y: -8.4, z: 102.5 });
const C = Object.freeze({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 });
const V = Object.freeze({ width: 1200, height: 700, lens: 1 });
const near = (a,b,e=1e-9) => assert.ok(Math.abs(a-b)<e, `${a} != ${b}`);

test('same world point and seed reproduce the exact numeric sample', () => {
  const expected = materialAt(P);
  for (let i=0;i<20;i++) assert.deepEqual(materialAt(P), expected);
});
test('A to B to A preserves the field, independent of traversal order', () => {
  const a=materialAt(P); materialAt({x:-500,y:700,z:99});
  assert.deepEqual(materialAt(P),a);
});
test('changing the visual seed changes material samples', () => {
  assert.notDeepEqual(materialAt(P,DEFAULT_SEED),materialAt(P,DEFAULT_SEED+1));
});
test('negative positions use floor, not truncation toward zero', () => {
  assert.deepEqual(chunkAt({x:-.1,y:-64,z:64}),{x:-1,y:-1,z:1});
});
test('chunk limits are correct on both sides of a boundary', () => {
  assert.equal(chunkAt({x:63.9999,y:0,z:0}).x,0);
  assert.equal(chunkAt({x:64,y:0,z:0}).x,1);
});
test('density is continuous across positive, zero and negative chunk faces', () => {
  for (const axis of ['x','y','z']) for (const edge of [-128,-64,0,64,128]) {
    const a={x:11.3,y:22.7,z:48.1},b={...a};a[axis]=edge-1e-6;b[axis]=edge+1e-6;
    near(densityAt(a),densityAt(b),1e-6);
  }
});
test('density remains finite in [0,1] across a deterministic test grid', () => {
  let min=1,max=0;
  for(let i=0;i<600;i++) {
    const d=densityAt({x:(i%19)*25-210,y:(i%23)*31-370,z:i*1.7-410});
    assert.ok(Number.isFinite(d)&&d>=0&&d<=1);min=Math.min(min,d);max=Math.max(max,d);
  }
  assert.ok(max-min>.15,'field must contain visible density variation');
});
test('NaN, Infinity and incomplete world positions are rejected', () => {
  for(const p of [null,{}, {x:0,y:0,z:NaN},{x:Infinity,y:0,z:0}]) assert.throws(()=>densityAt(p));
});
test('finite numeric world bounds are explicit', () => {
  assert.throws(()=>densityAt({x:WORLD_LIMIT+1,y:0,z:0}),RangeError);
  assert.ok(Number.isFinite(densityAt({x:WORLD_LIMIT,y:-WORLD_LIMIT,z:0})));
});
test('bad seeds and chunk sizes are rejected', () => {
  for(const seed of [-1,1.5,2**32,NaN]) assert.throws(()=>densityAt(P,seed));
  for(const size of [0,-10,NaN]) assert.throws(()=>chunkAt(P,size));
});
test('returned material and chunk objects cannot mutate world state', () => {
  const m=materialAt(P),c=chunkAt(P);
  assert.ok(Object.isFrozen(m));assert.ok(Object.isFrozen(c));
  assert.throws(()=>{m.density=1;},TypeError);
});
test('support fades continuously to zero before a culling boundary', () => {
  assert.equal(supportWeight(10,10,20),1);assert.equal(supportWeight(20,10,20),0);
  near(supportWeight(15,10,20),.5);
  assert.ok(supportWeight(19.999,10,20)<1e-8);
  let prev=1;for(let i=100;i<=200;i++){const a=supportWeight(i/10,10,20);assert.ok(a<=prev);prev=a;}
});
test('invalid support intervals are rejected', () => {
  assert.throws(()=>supportWeight(5,10,10)); assert.throws(()=>supportWeight(-1,0,10));
});
test('differential parallax: near > middle > far for the same sideways move', () => {
  const shifted={...C,x:2};
  const shifts=DEPTH_BANDS.map(b=> {
    const p={x:0,y:0,z:b.distance};
    return Math.abs(projectPoint(p,C,V).x-projectPoint(p,shifted,V).x);
  });
  assert.ok(shifts[0]>shifts[1]&&shifts[1]>shifts[2]);
  near(shifts[0]/shifts[1],5);near(shifts[1]/shifts[2],4);
});
test('projection roundtrip A-B-A returns the original screen coordinate', () => {
  const a=projectPoint(P,C,V);projectPoint(P,{...C,x:30},V);assert.deepEqual(projectPoint(P,C,V),a);
});
test('a full yaw rotation closes at the same projected position', () => {
  const a=projectPoint(P,C,V),b=projectPoint(P,{...C,yaw:Math.PI*2},V);
  near(a.x,b.x);near(a.y,b.y);near(a.depth,b.depth);
});
test('near, far and behind-camera points are culled explicitly', () => {
  for(const z of [-1,0,.5,311])assert.equal(projectPoint({x:0,y:0,z},C,V),null);
});
test('invalid camera and viewport parameters are rejected', () => {
  assert.throws(()=>projectPoint(P,{...C,yaw:NaN},V));
  assert.throws(()=>projectPoint(P,C,{...V,width:0}));
  assert.throws(()=>projectPoint(P,C,{...V,near:10,far:5}));
});
test('camera movement does not change material or input objects', () => {
  const original=JSON.stringify({P,C,V}); const m=materialAt(P);
  for(const x of [-10,0,10])projectPoint(P,{...C,x},V);
  assert.deepEqual(materialAt(P),m);assert.equal(JSON.stringify({P,C,V}),original);
});
test('three immutable depth reference distances are ordered', () => {
  assert.equal(DEPTH_BANDS.length,3);assert.ok(Object.isFrozen(DEPTH_BANDS));
  assert.ok(DEPTH_BANDS[0].distance<DEPTH_BANDS[1].distance&&DEPTH_BANDS[1].distance<DEPTH_BANDS[2].distance);
});
test('field module has no clock, random, DOM, network or evidence dependency', () => {
  const code=fs.readFileSync(new URL('../src/cosmos_field.mjs',import.meta.url),'utf8')
    .replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  assert.doesNotMatch(code,/Date\b|performance\b|Math\.random\b|fetch\s*\(|document\b|window\b|localStorage\b|\.zero|bitcoin|garden|\bimport\b/i);
});
