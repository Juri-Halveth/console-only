const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../src/material-model.js');
require('../src/doppelacht-source.js');const S=require('../src/doppelacht.js');

test('material checkpoints survive one million ticks while seed replay retains its work limit',()=>{
  const live=M.create({particles:0});
  for(let i=0;i<8334;i++)live.step(1);
  const saved=JSON.parse(JSON.stringify(live.snapshot()));
  assert.equal(saved.tick,1000080);
  const copy=M.create({particles:0});copy.restore(saved);assert.deepEqual(copy.snapshot(),saved);
  assert.throws(()=>copy.replay(saved,{maxTicks:1000000}),/Replay tick limit/);
  copy.step(.5);live.step(.5);assert.deepEqual(copy.snapshot(),live.snapshot());
});
test('long 3D checkpoints preserve fields and subsequent motion beyond the seed replay window',()=>{
  const live=S.create({count:16});for(let i=0;i<17;i++)live.step(60);
  const saved=JSON.parse(JSON.stringify(live.snapshot()));assert.equal(saved.tick,122400);
  const copy=S.create(saved.configuration);assert.throws(()=>copy.replay(saved),/replay limited/);
  copy.restore(saved);assert.deepEqual(copy.snapshot(),saved);
  const invalid=structuredClone(saved);invalid.materialCells[0].density+=.01;assert.throws(()=>copy.restore(invalid));
  assert.deepEqual(copy.snapshot(),saved);copy.step(.5);live.step(.5);assert.deepEqual(copy.snapshot(),live.snapshot());
});
