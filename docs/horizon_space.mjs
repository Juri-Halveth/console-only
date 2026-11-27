// A KORRIDOT navigation model. Distance travelled inside is independent of
// the compressed radius used to draw the camera in the exterior scene.
export const horizonRadius = 5;
const shellLength = 18;
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const unit = (a) => { const n = Math.hypot(...a); return a.map(x => x / n); };
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function enterHorizon(position, step, center) {
  const origin = position.map((x, i) => x - center[i]);
  const radius = Math.hypot(...origin);
  let bearing, depth = 0, remaining = step;
  if (radius < horizonRadius) {
    // Older saved cameras only have XYZ. At a rounded center we start at
    // the resolution floor, since those bytes contain no precise depth.
    const ratio = horizonRadius / radius;
    depth = Number.isFinite(ratio) ? Math.log2(ratio) :
      Math.log2(horizonRadius) - Math.log2(Math.max(Number.MIN_VALUE, radius));
    bearing = radius > 0 ? unit(origin.map(x => -x)) :
      (Math.hypot(...step) > 0 ? unit(step) : [0, 0, 1]);
  } else {
    // Intersect the whole segment so even a warp step with both endpoints
    // outside the sphere enters at the first inward crossing.
    const a = dot(step, step), b = dot(origin, step);
    if (a === 0 || b >= 0) return null;
    const c = dot(origin, origin) - horizonRadius ** 2;
    const discriminant = b * b - a * c;
    if (discriminant <= 0) return null;
    const t = c / (-b + Math.sqrt(discriminant));
    if (t < 0 || t > 1) return null;
    bearing = unit(origin.map((x, i) => -x - t * step[i]));
    remaining = step.map(x => x * (1 - t));
  }
  const whole = Math.floor(depth);
  const state = {center: [...center], bearing, axis: [...bearing], shell: BigInt(whole), fraction: depth - whole};
  advanceInside(state, remaining);
  return state;
}

export function advanceInside(state, step) {
  // Every translated unit counts as interior path length. A stationary
  // camera can look all around without advancing to the next shell.
  const depth = state.fraction + Math.hypot(...step) / shellLength;
  const whole = Math.floor(depth);
  state.shell += BigInt(whole);
  state.fraction = depth - whole;

  // Transport the optical axis; the entry basis remains available even
  // when exterior XYZ can no longer distinguish two neighboring shells.
  const rotationAxis = cross(state.bearing, step);
  const length = Math.hypot(...rotationAxis);
  if (length < 1e-12) return;
  const pole = rotationAxis.map(x => x / length);
  const angle = -length / (horizonRadius + shellLength * (1 - radiusRatio(state)));
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const axis = state.axis, turn = cross(pole, axis), parallel = dot(pole, axis);
  state.axis = unit(axis.map((x, i) => x * cos + turn[i] * sin + pole[i] * parallel * (1 - cos)));
}

function radiusRatio(state) {
  return state.shell > 1074n ? 0 : 2 ** (-Number(state.shell) - state.fraction);
}

export function interiorPosition(state) {
  const radius = horizonRadius * radiusRatio(state);
  return state.center.map((x, i) => x - radius * state.axis[i]);
}

export function horizonBend(distance, state) {
  if (state) {
    const phase = (Number(state.shell % 12n) + state.fraction) * Math.PI / 6;
    return 2.4 + (1 - radiusRatio(state)) * (.23 + .12 * Math.sin(phase));
  }
  const t = Math.max(0, Math.min(1, (28 - distance) / (28 - horizonRadius)));
  return 2.4 * t * t * (3 - 2 * t);
}

export function saveInterior(state) {
  if (!state) return null;
  return {center: [...state.center], bearing: [...state.bearing], axis: [...state.axis],
    shell: state.shell.toString(), fraction: state.fraction};
}

export function validInterior(state) {
  const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  const direction = v => vector(v) && Math.abs(Math.hypot(...v) - 1) < 1e-8;
  return state === null || !!(state && vector(state.center) && direction(state.axis) && direction(state.bearing) &&
    typeof state.shell === 'string' && /^(0|[1-9][0-9]*)$/.test(state.shell) &&
    Number.isFinite(state.fraction) && state.fraction >= 0 && state.fraction < 1);
}
