// KORRIDOT · OpenSpace-inspired scene graph experiment.
// Independent implementation: no OpenSpace source code has been copied.
// Everything in DEMO_CATALOG is synthetic, not an astronomical ephemeris.
export const DEMO_CATALOG = Object.freeze({
  schema: 'korridot.scenegraph.v1',
  identifier: 'openspace-dna-synthetic-v1',
  source: 'SYNTHETIC',
  frame: 'KORRIDOT_LOCAL_MODEL',
  unit: 'model-u',
  timeUnit: 'model-step',
  timeBounds: [0, 100],
  nodes: [
    {id: 'CORE', label: 'KERN', parent: null, radius: 1.1,
      keyframes: [{t: 0, p: [0, 0, 0]}, {t: 100, p: [0, 0, 0]}]},
    {id: 'A', label: 'KNOTEN A', parent: 'CORE', radius: .6,
      keyframes: [{t: 0, p: [-6, -1, 6]}, {t: 100, p: [5, 3, 8]}]},
    {id: 'B', label: 'KNOTEN B', parent: 'CORE', radius: .7,
      keyframes: [{t: 0, p: [7, 3, 10]}, {t: 100, p: [-3, -3, 8]}]},
    {id: 'A1', label: 'FELD A1', parent: 'A', radius: .35,
      keyframes: [{t: 0, p: [-2, 3, 5]}, {t: 100, p: [2, -2, 5]}]},
    {id: 'A2', label: 'FELD A2', parent: 'A', radius: .25,
      keyframes: [{t: 0, p: [1, -3, 7]}, {t: 100, p: [2, 2, 7]}]},
    {id: 'B1', label: 'FELD B1', parent: 'B', radius: .4,
      keyframes: [{t: 0, p: [3, 1, 7]}, {t: 100, p: [-1, 3, 7]}]},
  ]
});

const finite = (v, label) => {
  if (!Number.isFinite(v) || Math.abs(v) > 1e12) {
    throw new TypeError(`${label}: finite coordinate/value required within model bounds`);
  }
  return v;
};
const vec = (v, label) => {
  if (!Array.isArray(v) || v.length !== 3) throw new TypeError(`${label}: expected vec3`);
  return v.map((n, i) => finite(n, `${label}[${i}]`));
};
const add = (a, b) => a.map((v, i) => v + b[i]);
const subtract = (a, b) => a.map((v, i) => v - b[i]);

// Assets form an explicit parent tree; missing parents and cycles are rejected.
export function compileCatalog(source) {
  if (!source || source.schema !== 'korridot.scenegraph.v1' ||
      source.source !== 'SYNTHETIC' || source.frame !== 'KORRIDOT_LOCAL_MODEL' ||
      source.unit !== 'model-u' || source.timeUnit !== 'model-step') {
    throw new TypeError('Unsupported catalog schema, source, frame, or unit');
  }
  if (!Array.isArray(source.timeBounds) || source.timeBounds.length !== 2 ||
      source.timeBounds[0] !== 0 || source.timeBounds[1] !== 100) {
    throw new TypeError('Time bounds must be [0, 100] for this first demo');
  }
  if (!Array.isArray(source.nodes) || source.nodes.length < 2 || source.nodes.length > 256) {
    throw new RangeError('Invalid catalog node count');
  }
  const nodes = source.nodes.map(n => {
    if (!n || typeof n.id !== 'string' || !/^[A-Z0-9_-]{1,32}$/.test(n.id) ||
        typeof n.label !== 'string' || n.label.length > 50 || !n.label.trim() ||
        !(n.parent === null || typeof n.parent === 'string')) {
      throw new TypeError('Invalid node identifier, parent, or label');
    }
    const radius = finite(n.radius, `${n.id}.radius`);
    if (radius <= 0) throw new RangeError('Radius must be positive');
    if (!Array.isArray(n.keyframes) || n.keyframes.length < 1 || n.keyframes.length > 128) {
      throw new RangeError('Missing or excessive keyframes');
    }
    let last = -Infinity;
    const keyframes = n.keyframes.map(k => {
      if (!k || typeof k.t !== 'number' || !Number.isFinite(k.t) ||
          k.t < 0 || k.t > 100 || k.t <= last) throw new RangeError('Non-increasing keyframe times');
      last = k.t;
      return Object.freeze({t: k.t, p: Object.freeze(vec(k.p, `${n.id}.p`))});
    });
    return Object.freeze({id: n.id, label: n.label, parent: n.parent,
      radius, keyframes: Object.freeze(keyframes)});
  });
  const byId = new Map();
  for (const n of nodes) {
    if (byId.has(n.id)) throw new TypeError('Duplicate node identifier: ' + n.id);
    byId.set(n.id, n);
  }
  const colors = new Map();
  function visit(id) {
    if (colors.get(id) === 'done') return;
    if (colors.get(id) === 'visiting') throw new TypeError('Cycle in scene graph');
    const n = byId.get(id);
    if (!n) throw new TypeError('Missing scene graph parent: ' + id);
    colors.set(id, 'visiting');
    if (n.parent !== null) visit(n.parent);
    colors.set(id, 'done');
  }
  for (const n of nodes) visit(n.id);
  if (nodes.filter(n => n.parent === null).length !== 1) throw new TypeError('Exactly one root required');
  return Object.freeze({schema: source.schema, source: source.source, frame: source.frame,
    unit: source.unit, timeUnit: source.timeUnit,
    timeBounds: Object.freeze([0, 100]), nodes: Object.freeze(nodes), byId});
}

function localPosition(n, t) {
  const keys = n.keyframes;
  if (t <= keys[0].t) return keys[0].p;
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1].p;
  let lo = 0, hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (keys[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = keys[lo], b = keys[hi], u = (t - a.t) / (b.t - a.t);
  return a.p.map((v, i) => v + (b.p[i] - v) * u);
}

export function snapshotScene(scene, time, cameraPosition = [0, 0, 0],
                              {maxDistance = 1e9, minRelativeRadius = 0} = {}) {
  if (!scene || !Array.isArray(scene.nodes) || !(scene.byId instanceof Map)) {
    throw new TypeError('Compile catalog before sampling');
  }
  finite(time, 'time');
  if (time < 0 || time > 100) throw new RangeError('Time out of model bounds');
  const camera = vec(cameraPosition, 'camera');
  finite(maxDistance, 'maxDistance');
  finite(minRelativeRadius, 'minRelativeRadius');
  if (maxDistance <= 0 || minRelativeRadius < 0) throw new RangeError('Invalid LOD settings');
  const positions = new Map();
  function resolve(n) {
    if (positions.has(n.id)) return positions.get(n.id);
    const local = localPosition(n, time);
    const global = n.parent === null ? [...local] : add(resolve(scene.byId.get(n.parent)), local);
    for (let i = 0; i < 3; i++) finite(global[i], `${n.id}.world`);
    positions.set(n.id, global);
    return global;
  }
  // All positions are computed, including those hidden by LOD; this preserves parent frames.
  return scene.nodes.map(n => {
    const position = resolve(n);
    const relative = subtract(position, camera); // floating camera origin
    const distance = Math.hypot(...relative);
    const relativeRadius = n.radius / Math.max(1e-6, distance);
    return {id: n.id, parent: n.parent, label: n.label,
      position, relative, radius: n.radius, distance, relativeRadius,
      visible: distance <= maxDistance && relativeRadius >= minRelativeRadius};
  });
}
