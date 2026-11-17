/**
 * KORRIDOT COSMOS FIELD: deterministic synthetic world, not a renderer.
 * No clock, storage, network, DOM, Garden or Bitcoin dependency.
 * Numeric domain is intentionally finite: +/- 1,000,000 model units.
 */
export const WORLD_LIMIT = 1_000_000;
export const DEFAULT_SEED = 0x4b4f5252;
export const DEFAULT_CHUNK_SIZE = 64;
export const DEPTH_BANDS = Object.freeze([
  Object.freeze({ id: 'near', distance: 12 }),
  Object.freeze({ id: 'middle', distance: 60 }),
  Object.freeze({ id: 'far', distance: 240 })
]);

function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}
function vector(point, name = 'position') {
  if (!point || typeof point !== 'object') throw new TypeError(`${name} is required`);
  for (const axis of ['x', 'y', 'z']) {
    finite(point[axis], `${name}.${axis}`);
    if (Math.abs(point[axis]) > WORLD_LIMIT) {
      throw new RangeError(`${name}.${axis} exceeds +/- ${WORLD_LIMIT}`);
    }
  }
  return point;
}
function seedValue(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('seed must be an unsigned 32-bit integer');
  }
  return seed >>> 0;
}
const mix = (a, b, t) => a + (b - a) * t;
const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);
const clamp01 = x => Math.max(0, Math.min(1, x));
function hash3(x, y, z, seed) {
  let h = (seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ Math.imul(z, 0xc2b2ae3d)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
function lattice(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const tx = smoother(x - ix), ty = smoother(y - iy), tz = smoother(z - iz);
  const n = (a, b, c) => hash3(a, b, c, seed) / 0xffffffff;
  const a = mix(n(ix, iy, iz), n(ix + 1, iy, iz), tx);
  const b = mix(n(ix, iy + 1, iz), n(ix + 1, iy + 1, iz), tx);
  const c = mix(n(ix, iy, iz + 1), n(ix + 1, iy, iz + 1), tx);
  const d = mix(n(ix, iy + 1, iz + 1), n(ix + 1, iy + 1, iz + 1), tx);
  return mix(mix(a, b, ty), mix(c, d, ty), tz);
}

export function chunkAt(position, size = DEFAULT_CHUNK_SIZE) {
  vector(position); finite(size, 'chunk size');
  if (size < 1 || size > WORLD_LIMIT) throw new RangeError('invalid chunk size');
  return Object.freeze({
    x: Math.floor(position.x / size),
    y: Math.floor(position.y / size),
    z: Math.floor(position.z / size)
  });
}

/** Density is sampled in WORLD coordinates, never restarted at chunk boundaries. */
export function densityAt(position, seed = DEFAULT_SEED) {
  vector(position); seedValue(seed);
  const large = lattice(position.x / 96, position.y / 96, position.z / 96, seed);
  const fold = lattice(position.x / 32 + 17.3, position.y / 32 - 5.7, position.z / 32 + 9.1, seed ^ 0x726f6f6d);
  const fine = lattice(position.x / 10 - 2.1, position.y / 10 + 7.9, position.z / 10, seed ^ 0x64657461);
  const field = .64 * large + .26 * fold + .10 * fine;
  // Empty regions and sparse density, not uniform fog over the whole screen.
  const density = clamp01((field - .37) / .46);
  return density * density;
}

export function materialAt(position, seed = DEFAULT_SEED) {
  const density = densityAt(position, seed);
  const hue = lattice(position.x / 150, position.y / 150, position.z / 150, seed ^ 0x636f6c72);
  return Object.freeze({ density, hue, synthetic: true, unit: 'model-u' });
}

/** Smooth distance support for a future cached cloud/impostor. No hard pop edge. */
export function supportWeight(distance, innerRadius, outerRadius) {
  finite(distance, 'distance'); finite(innerRadius, 'inner radius'); finite(outerRadius, 'outer radius');
  if (distance < 0 || innerRadius < 0 || outerRadius <= innerRadius) throw new RangeError('invalid radii');
  if (distance <= innerRadius) return 1;
  if (distance >= outerRadius) return 0;
  return 1 - smoother((distance - innerRadius) / (outerRadius - innerRadius));
}

/** Same yaw/pitch/roll convention as the existing KORRIDOT projection. */
export function projectPoint(point, camera, viewport) {
  vector(point, 'point'); vector(camera, 'camera');
  if (!viewport || typeof viewport !== 'object') throw new TypeError('viewport is required');
  const { width, height, lens = 1, near = .8, far = 310 } = viewport;
  for (const [k, v] of Object.entries({ width, height, lens, near, far })) finite(v, k);
  if (width <= 0 || height <= 0 || lens <= 0 || near <= 0 || far <= near) throw new RangeError('invalid viewport');
  const { yaw = 0, pitch = 0, roll = 0 } = camera;
  for (const [k, v] of Object.entries({ yaw, pitch, roll })) finite(v, k);
  const dx = point.x - camera.x, dy = point.y - camera.y, dz = point.z - camera.z;
  const xx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const zz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const yy = dy * Math.cos(pitch) - zz * Math.sin(pitch);
  const depth = dy * Math.sin(pitch) + zz * Math.cos(pitch);
  if (depth < near || depth > far) return null;
  const hx = xx * Math.cos(roll) - yy * Math.sin(roll);
  const hy = xx * Math.sin(roll) + yy * Math.cos(roll);
  const focal = Math.min(width * .94, height * 1.03) * lens;
  return Object.freeze({ x: width * .5 + hx * focal / depth,
    y: height * .5 - hy * focal / depth, depth, scale: focal / depth });
}
