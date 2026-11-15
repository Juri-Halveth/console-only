import test from 'node:test';
import assert from 'node:assert/strict';
import {compileCatalog, snapshotScene, DEMO_CATALOG} from '../src/openspace_dna.mjs';

const scene = compileCatalog(DEMO_CATALOG);
const where = (rows, name) => rows.find(r => r.id === name);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('separate synthetic frames and model-time units are explicit', () => {
  assert.equal(scene.frame, 'KORRIDOT_LOCAL_MODEL');
  assert.equal(scene.source, 'SYNTHETIC');
  assert.equal(scene.timeUnit, 'model-step');
  assert.equal(scene.nodes.length, 6);
});
test('parent position is inherited, with interpolated keyframes', () => {
  const rows = snapshotScene(scene, 50);
  near(where(rows, 'A').position[0], -.5);
  near(where(rows, 'A1').position[0], -.5);
  near(where(rows, 'A1').position[1], 1.5);
});
test('model time does not alter source and produces reversible state', () => {
  const a = snapshotScene(scene, 0), b = snapshotScene(scene, 100), again = snapshotScene(scene, 0);
  assert.notDeepEqual(where(a, 'A').position, where(b, 'A').position);
  assert.deepEqual(where(a, 'A').position, where(again, 'A').position);
  assert.equal(DEMO_CATALOG.nodes[1].keyframes[0].p[0], -6);
});
test('camera-relative coordinates keep local differences at large offsets', () => {
  const c = {...DEMO_CATALOG, nodes: DEMO_CATALOG.nodes.map((n, i) =>
    i ? n : {...n, keyframes: [{t: 0, p: [1e9, 0, 0]}]})};
  const s = compileCatalog(c);
  const rel = where(snapshotScene(s, 50, [1e9, 0, 0]), 'A').relative;
  near(rel[0], -.5);
});
test('LOD filters nodes by distance or approximate relative size', () => {
  const far = snapshotScene(scene, 0, [0, 0, 0], {maxDistance: 1});
  assert.equal(where(far, 'A').visible, false);
  assert.equal(where(far, 'CORE').visible, true);
  const culled = snapshotScene(scene, 0, [0, 0, 100], {minRelativeRadius: .1});
  assert.equal(where(culled, 'A1').visible, false);
});
test('unknown parents, cycles and duplicates are rejected', () => {
  assert.throws(() => compileCatalog({...DEMO_CATALOG, nodes: DEMO_CATALOG.nodes.map((n,i) =>
    i === 1 ? {...n, parent: 'NONEXISTENT'} : n)}), /Missing/);
  assert.throws(() => compileCatalog({...DEMO_CATALOG, nodes: DEMO_CATALOG.nodes.map((n,i) =>
    i === 0 ? {...n, parent: 'B'} : n)}), /Cycle/);
  assert.throws(() => compileCatalog({...DEMO_CATALOG, nodes: [...DEMO_CATALOG.nodes, DEMO_CATALOG.nodes[0]]}), /Duplicate/);
});
test('invalid time and coordinates are rejected explicitly', () => {
  assert.throws(() => snapshotScene(scene, NaN), TypeError);
  assert.throws(() => snapshotScene(scene, 101), RangeError);
  assert.throws(() => compileCatalog({...DEMO_CATALOG, nodes: DEMO_CATALOG.nodes.map((n,i) =>
    i === 1 ? {...n, keyframes:[{t:0,p:[Infinity,0,0]}]} : n)}), TypeError);
  assert.throws(() => compileCatalog({...DEMO_CATALOG, nodes: DEMO_CATALOG.nodes.map((n,i) =>
    i === 1 ? {...n, keyframes:[{t:50,p:[0,0,0]},{t:50,p:[0,0,1]}]} : n)}), RangeError);
});
test('returned positions cannot mutate the compiled catalog', () => {
  const rows = snapshotScene(scene, 25);
  rows[1].position[0] = 999;
  assert.notEqual(where(snapshotScene(scene, 25), 'A').position[0], 999);
});
