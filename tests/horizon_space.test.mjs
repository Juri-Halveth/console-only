import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceInside, enterHorizon, horizonBend, interiorPosition, saveInterior, validInterior} from '../src/horizon_space.mjs';

const center = [0, 0, 0];
const atEntry = () => enterHorizon([0, 0, -8], [0, 0, 3], center);
const close = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-9, `${value} vs ${expected}`);

test('crossing uses first inward intersection including a step across the entire sphere', () => {
  const deep = enterHorizon([0, 0, -10], [0, 0, 20], center);
  close(deep.fraction, 15 / 18);
  const entry = atEntry();
  close(entry.fraction, 0);
  close(interiorPosition(entry)[2], -5);
  close(horizonBend(5, null), horizonBend(5, entry));
  assert.equal(horizonBend(28, null), 0);
  for (const x of [5, 5.001]) assert.equal(enterHorizon([x, 0, -10], [0, 0, 20], center), null);
  assert.equal(enterHorizon([0, 0, -5], [0, 0, -2], center), null);
});

test('forward, lateral and reverse translation count distance while a stationary camera keeps its shell', () => {
  const s = atEntry();
  advanceInside(s, [0, 0, 18]);
  close(interiorPosition(s)[2], -2.5);
  const before = saveInterior(s);
  advanceInside(s, [0, 0, 0]);
  assert.deepEqual(saveInterior(s), before);
  advanceInside(s, [18, 0, 0]);
  assert.equal(s.shell, 2n);
  assert.ok(Math.abs(s.axis[0]) > .1);
  advanceInside(s, [0, 0, -18]);
  assert.equal(s.shell, 3n);
  close(Math.hypot(...s.axis), 1);
});

test('shell and optical direction outlive floating point position precision', () => {
  const s = atEntry();
  s.shell = 10n ** 100n;
  advanceInside(s, [0, 0, 18]);
  assert.equal(s.shell, 10n ** 100n + 1n);
  assert.ok(interiorPosition(s).every(x => x === 0));
  assert.ok(horizonBend(0, s) >= 2.4);
  const json = JSON.parse(JSON.stringify(saveInterior(s)));
  assert.ok(validInterior(json));
  assert.equal(BigInt(json.shell), s.shell);
  for (const bad of [{shell:'1.5'}, {fraction:1}, {axis:[0,0,0]}, {center:[Infinity,0,0]}]) {
    assert.equal(validInterior({...json, ...bad}), false);
  }
});

test('old XYZ-only cameras reconstruct a finite chart on their first interior frame', () => {
  const s = enterHorizon([0, 0, -1.25], [0, 0, 0], center);
  assert.equal(s.shell, 2n);
  close(interiorPosition(s)[2], -1.25);
  const atCenter = enterHorizon(center, [0, 0, 0], center);
  assert.ok(validInterior(saveInterior(atCenter)));
});
