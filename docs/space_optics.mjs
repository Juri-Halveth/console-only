/**
 * Shared direction optics for the KORRIDOT scene.
 *
 * The forward map is the exact special-relativistic aberration formula for a
 * source sight direction and an observer moving along `axis` at beta = v/c.
 * Its inverse uses -beta. No wall, material, ray-march hit or radial boundary
 * exists in this module. The application chooses how its visual flight speed
 * maps to beta; that choice does not measure a physical velocity.
 *
 * Vectors may be [x, y, z] or {x, y, z}; returned vectors are arrays. Camera
 * coordinates are right / up / forward. CSS pixels have a top-left origin.
 * Camera yaw/pitch/roll match the existing garden_live.js projection exactly.
 */

// KORRIDOT_SPUR_LINSE_V11
export const MAX_ABERRATION_BETA = 0.999999;
const PREPARED = Symbol('preparedSpaceOptics');
const FORWARD = Object.freeze([0, 0, 1]);

function components(value) {
  if (!value) return null;
  const result = Array.isArray(value) || ArrayBuffer.isView(value)
    ? [value[0], value[1], value[2]]
    : [value.x, value.y, value.z];
  return result.every(Number.isFinite) ? result : null;
}

/** Normalize without overflowing for very large finite inputs. */
export function normalizeDirection(value, fallback = FORWARD) {
  const v = components(value);
  if (!v) return normalizeFallback(fallback);
  const largest = Math.max(Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
  if (!(largest > 0)) return normalizeFallback(fallback);
  const x = v[0] / largest, y = v[1] / largest, z = v[2] / largest;
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

function normalizeFallback(value) {
  const v = components(value);
  if (!v) return [...FORWARD];
  const largest = Math.max(Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
  if (!(largest > 0)) return [...FORWARD];
  const length = Math.hypot(v[0] / largest, v[1] / largest, v[2] / largest);
  return v.map(n => n / largest / length);
}

/** Create once per frame and share the same state with Canvas and WebGL. */
export function createOpticsState({ beta = 0, axis = FORWARD, lensAxis = FORWARD, lensRadius = 0, focusDistance = Infinity, skyAxis = FORWARD, skyBend = 0 } = {}) {
  beta = Number.isFinite(beta)
    ? Math.max(-MAX_ABERRATION_BETA, Math.min(MAX_ABERRATION_BETA, beta)) : 0;
  skyBend = Number.isFinite(skyBend) ? Math.min(2.8,Math.max(0,skyBend)) : 0;
  return Object.freeze({
    beta,
    axis: Object.freeze(normalizeDirection(axis)),
    inverseGamma: Math.sqrt((1 - beta) * (1 + beta)),
    lensAxis: Object.freeze(normalizeDirection(lensAxis)),
    lensRadius: Number.isFinite(lensRadius) ? Math.max(0,Math.min(.24,lensRadius)) : 0,
    focusDistance: Number.isFinite(focusDistance)?Math.max(0,focusDistance):Infinity,
    skyAxis: Object.freeze(normalizeDirection(skyAxis)),
    skyBend,
    skyWarp: Object.freeze([Math.cosh(skyBend)-1,Math.sinh(skyBend)]),
    [PREPARED]: true,
  });
}

export const IDENTITY_OPTICS = createOpticsState();

function prepared(state) {
  return state && state[PREPARED] ? state : createOpticsState(state || {});
}

function aberrate(direction, state, reverse) {
  const n = normalizeDirection(direction);
  const s = prepared(state), axis = s.axis;
  const beta = reverse ? -s.beta : s.beta;
  if (beta === 0) return n;
  const mu = Math.max(-1, Math.min(1,
    n[0] * axis[0] + n[1] * axis[1] + n[2] * axis[2]));
  const denominator = Math.max(1e-12, 1 + beta * mu);
  const parallel = (mu + beta) / denominator;
  const transverse = s.inverseGamma / denominator;
  return normalizeDirection([
    (n[0] - axis[0] * mu) * transverse + axis[0] * parallel,
    (n[1] - axis[1] * mu) * transverse + axis[1] * parallel,
    (n[2] - axis[2] * mu) * transverse + axis[2] * parallel,
  ], n);
}


/** Point-lens angular map for the apparent background; no tube geometry.
 * theta_E is a model angle, not a calibrated physical Einstein radius.
 * The inverse ray map includes the inner (secondary-image) branch.
 */
export function lensForwardDirection(source, axis, thetaE=0){
  const n=normalizeDirection(source),k=normalizeDirection(axis);
  if(!(thetaE>0))return n;
  const mu=Math.max(-1,Math.min(1,n[0]*k[0]+n[1]*k[1]+n[2]*k[2]));
  const tangent=[n[0]-mu*k[0],n[1]-mu*k[1],n[2]-mu*k[2]];
  const st=Math.hypot(...tangent),b=Math.atan2(st,mu);
  const theta=.5*(b+Math.sqrt(b*b+4*thetaE*thetaE));
  const e=st>1e-12?tangent.map(v=>v/st):normalizeDirection(Math.abs(k[2])<.9?[-k[1],k[0],0]:[0,-k[2],k[1]]);
  return normalizeDirection(k.map((v,i)=>v*Math.cos(theta)+e[i]*Math.sin(theta)));
}
export function lensInverseDirection(observed,axis,thetaE=0){
  const n=normalizeDirection(observed),k=normalizeDirection(axis);
  if(!(thetaE>0))return n;
  const mu=Math.max(-1,Math.min(1,n[0]*k[0]+n[1]*k[1]+n[2]*k[2]));
  const tangent=[n[0]-mu*k[0],n[1]-mu*k[1],n[2]-mu*k[2]];
  const st=Math.hypot(...tangent),theta=Math.atan2(st,mu);
  const b=theta-thetaE*thetaE/Math.max(theta,.001);
  const e=st>1e-12?tangent.map(v=>v/st):normalizeDirection(Math.abs(k[2])<.9?[-k[1],k[0],0]:[0,-k[2],k[1]]);
  return normalizeDirection(k.map((v,i)=>v*Math.cos(b)+e[i]*Math.sin(b)));
}

/** Rest-frame source direction -> apparent camera direction. */
export function forwardDirection(direction, state = IDENTITY_OPTICS) {
  return aberrate(direction, state, false);
}

/** Apparent camera direction -> rest-frame source direction. */
export function inverseDirection(direction, state = IDENTITY_OPTICS) {
  return aberrate(direction, state, true);
}

/** Frequency ratio for the given rest-frame source direction. No RGB shift. */
export function dopplerFactor(direction, state = IDENTITY_OPTICS) {
  const n = normalizeDirection(direction), s = prepared(state);
  const mu = Math.max(-1, Math.min(1,
    n[0] * s.axis[0] + n[1] * s.axis[1] + n[2] * s.axis[2]));
  return (1 + s.beta * mu) / s.inverseGamma;
}

function angles(camera = {}) {
  return [camera.yaw, camera.pitch, camera.roll].map(a => Number.isFinite(a) ? a : 0);
}

/** Rotate a vector only; positions must have the camera position subtracted. */
export function worldToCameraVector(vector, camera = {}) {
  const [x, y, z] = components(vector) || [0, 0, 0];
  const [yaw, pitch, roll] = angles(camera);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const xx = x * cy - z * sy, zz = x * sy + z * cy;
  const yy = y * cp - zz * sp, depth = y * sp + zz * cp;
  return [xx * cr - yy * sr, xx * sr + yy * cr, depth];
}

/** Exact inverse of worldToCameraVector. */
export function cameraToWorldVector(vector, camera = {}) {
  const [x, y, z] = components(vector) || [0, 0, 0];
  const [yaw, pitch, roll] = angles(camera);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const xx = x * cr + y * sr, yy = -x * sr + y * cr;
  const wy = yy * cp + z * sp, zz = -yy * sp + z * cp;
  return [xx * cy + zz * sy, wy, -xx * sy + zz * cy];
}

export function cameraBasis(camera = {}) {
  return {
    right: cameraToWorldVector([1, 0, 0], camera),
    up: cameraToWorldVector([0, 1, 0], camera),
    forward: cameraToWorldVector([0, 0, 1], camera),
  };
}

export function focalLength(width, height, lens = 1) {
  if (!(width > 0 && height > 0 && lens > 0) ||
      ![width, height, lens].every(Number.isFinite)) return null;
  return Math.min(width * 0.94, height * 1.03) * lens;
}

/** Finite source/lens geometry. lensRadius is the angle for a source at infinity.
 * The thin-lens efficiency D_ls/D_s vanishes continuously at the lens plane.
 * It is a declared angular model, not null-geodesic integration.
 */
export function lensRadiusAtDistance(distance,state=IDENTITY_OPTICS){
  const s=prepared(state);
  if(!(s.lensRadius>0))return 0;
  if(distance===Infinity)return s.lensRadius;
  if(!Number.isFinite(distance)||distance<=s.focusDistance||!Number.isFinite(s.focusDistance))return 0;
  return s.lensRadius*Math.sqrt(Math.max(0,1-s.focusDistance/distance));
}
export function lensImageDirections(source,axis,thetaE=0){
  const n=normalizeDirection(source),k=normalizeDirection(axis);
  if(!(thetaE>0))return[{direction:n,branch:'primary'}];
  const mu=Math.max(-1,Math.min(1,n[0]*k[0]+n[1]*k[1]+n[2]*k[2]));
  const t=n.map((v,i)=>v-mu*k[i]),st=Math.hypot(...t),b=Math.atan2(st,mu);
  const e=st>1e-12?t.map(v=>v/st):normalizeDirection(Math.abs(k[2])<.9?[-k[1],k[0],0]:[0,-k[2],k[1]]);
  return[1,-1].map((sign,i)=>{const theta=.5*(b+sign*Math.sqrt(b*b+4*thetaE*thetaE));
    return{direction:normalizeDirection(k.map((v,j)=>v*Math.cos(theta)+e[j]*Math.sin(theta))),branch:i?'secondary':'primary'};});
}

// Interior display geometry: tan(apparentAngle/2) = exp(bend)*tan(sourceAngle/2).
// This form stays finite at both poles. Reversing sinh(bend) inverts the map.
function skyImage(n, state, inverse=false) {
  if (state.skyBend === 0) return {direction:n, magnification:1};
  const axis=state.skyAxis, [coshMinusOne,sinh]=state.skyWarp;
  const s=inverse?-sinh:sinh;
  const mu=Math.max(-1,Math.min(1,n[0]*axis[0]+n[1]*axis[1]+n[2]*axis[2]));
  const along=coshMinusOne*mu-s;
  return {
    direction: normalizeDirection(n.map((v,i)=>v+along*axis[i])),
    magnification: 1/(1+coshMinusOne-s*mu),
  };
}
/** Project all image branches of one stable world source. */
export function projectPointImages(point,camera,width,height,lens=1,state=IDENTITY_OPTICS,{near=.8,far=310,sourceId=''}={}){
  const p=components(point),position=components(camera),focal=focalLength(width,height,lens);
  if(!p||!position||focal===null)return[];
  const relative=p.map((v,i)=>v-position[i]),distance=Math.hypot(...relative);
  near=Number.isFinite(near)?Math.max(0,near):.8;
  far=far===Infinity?Infinity:Number.isFinite(far)?far:310;
  if(!(distance>0)||!Number.isFinite(distance)||distance<near||distance>far)return[];
  const local=worldToCameraVector(relative,camera),restDirection=normalizeDirection(local),s=prepared(state);
  const apparent=forwardDirection(restDirection,s),radius=lensRadiusAtDistance(distance,s),doppler=dopplerFactor(restDirection,s);
  return lensImageDirections(apparent,s.lensAxis,radius).flatMap(image=>{
    const {direction:n,magnification}=skyImage(image.direction,s);
    if(n[2]<=1e-9)return [];
    const depth=distance*n[2];
    return{x:width*.5+n[0]*focal/n[2],y:height*.5-n[1]*focal/n[2],depth,distance,cameraDepth:local[2],doppler,
      scale:focal/depth/doppler*magnification,branch:image.branch,sourceId,observationId:sourceId+':image:'+image.branch,lensRadius:radius};
  });
}
/** Backwards compatible primary image; callers needing multiplicity use images. */
export function projectPoint(...args){return projectPointImages(...args)[0]||null;}

/** A CSS pixel -> rest-frame world sight direction; null for invalid input. */
export function worldRayFromPixel(x, y, camera, width, height, lens = 1,
    state = IDENTITY_OPTICS, {distance=Infinity}={}) {
  const focal = focalLength(width, height, lens);
  if (focal === null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const s=prepared(state);
  const pixelDirection = normalizeDirection([
    (x - width * 0.5) / focal, (height * 0.5 - y) / focal, 1,
  ]);
  const unbent=skyImage(pixelDirection,s,true).direction;
  const apparent=lensInverseDirection(unbent,s.lensAxis,lensRadiusAtDistance(distance,s));
  return normalizeDirection(cameraToWorldVector(inverseDirection(apparent, s), camera));
}

/**
 * GLSL ES 3.00 equivalents. Include after the shader precision declarations.
 * `soRayFromPixel` accepts TOP-LEFT CSS pixels. For gl_FragCoord use
 * vec2(gl_FragCoord.x / resolution.x, 1. - gl_FragCoord.y / resolution.y)*css.
 * `angles` is vec3(yaw,pitch,roll), identical to garden_live.js.
 */
export const OPTICS_GLSL = `
const float SO_MAX_BETA = 0.999999;
vec3 soUnit(vec3 v) {
  float biggest=max(max(abs(v.x),abs(v.y)),abs(v.z));
  if(!(biggest>0.0))return vec3(0.0,0.0,1.0);
  v/=biggest;
  return v*inversesqrt(dot(v,v));
}

// warp = (cosh(bend)-1, sinh(bend)); the inverse flips only the second term.
// Zero-valued uniforms retain the original projection for older consumers.
vec4 soSkyImage(vec3 n, vec3 axis, vec2 warp) {
  if(warp.y==0.0) return vec4(n,1.0);
  float mu=clamp(dot(n,axis),-1.0,1.0);
  return vec4(soUnit(n+axis*(warp.x*mu-warp.y)),1.0/(1.0+warp.x-warp.y*mu));
}

vec3 soLensForward(vec3 source,vec3 axis,float r){
  if(r<=0.0)return source;
  vec3 k=soUnit(axis);float mu=clamp(dot(source,k),-1.0,1.0);
  vec3 t=source-mu*k;float st=length(t);float b=atan(st,mu);
  float theta=.5*(b+sqrt(b*b+4.0*r*r));
  vec3 e=st>1e-8?t/st:soUnit(abs(k.z)<.9?vec3(-k.y,k.x,0.0):vec3(0.0,-k.z,k.y));
  return soUnit(k*cos(theta)+e*sin(theta));
}
float soLensRadiusAtDistance(float distance,float radius,float focus){
  return radius>0.0&&distance>focus?radius*sqrt(max(0.0,1.0-focus/distance)):0.0;
}
vec3 soLensImage(vec3 source,vec3 axis,float r,float branch){
  if(r<=0.0)return source;
  vec3 k=soUnit(axis);float mu=clamp(dot(source,k),-1.0,1.0);
  vec3 t=source-mu*k;float st=length(t);float b=atan(st,mu);
  float theta=.5*(b+(branch>.5?-1.0:1.0)*sqrt(b*b+4.0*r*r));
  vec3 e=st>1e-8?t/st:soUnit(abs(k.z)<.9?vec3(-k.y,k.x,0.0):vec3(0.0,-k.z,k.y));
  return soUnit(k*cos(theta)+e*sin(theta));
}
vec3 soLensInverse(vec3 observed,vec3 axis,float r){
  if(r<=0.0)return observed;
  vec3 k=soUnit(axis);float mu=clamp(dot(observed,k),-1.0,1.0);
  vec3 t=observed-mu*k;float st=length(t);float theta=atan(st,mu);
  float b=theta-r*r/max(theta,.001);
  vec3 e=st>1e-8?t/st:soUnit(abs(k.z)<.9?vec3(-k.y,k.x,0.0):vec3(0.0,-k.z,k.y));
  return soUnit(k*cos(b)+e*sin(b));
}

vec3 soForwardDirection(vec3 direction,float beta,vec3 velocityAxis) {
  vec3 n=soUnit(direction),axis=soUnit(velocityAxis);
  beta=clamp(beta,-SO_MAX_BETA,SO_MAX_BETA);
  float mu=clamp(dot(n,axis),-1.0,1.0);
  float denominator=max(1e-12,1.0+beta*mu);
  float inverseGamma=sqrt((1.0-beta)*(1.0+beta));
  return soUnit((n-axis*mu)*(inverseGamma/denominator)
    +axis*((mu+beta)/denominator));
}
vec3 soInverseDirection(vec3 direction,float beta,vec3 velocityAxis) {
  return soForwardDirection(direction,-beta,velocityAxis);
}
float soDopplerFactor(vec3 restDirection,float beta,vec3 velocityAxis) {
  beta=clamp(beta,-SO_MAX_BETA,SO_MAX_BETA);
  float mu=clamp(dot(soUnit(restDirection),soUnit(velocityAxis)),-1.0,1.0);
  return (1.0+beta*mu)/sqrt((1.0-beta)*(1.0+beta));
}
vec3 soWorldToCamera(vec3 v,vec3 angles) {
  float cy=cos(angles.x),sy=sin(angles.x);
  float cp=cos(angles.y),sp=sin(angles.y);
  float cr=cos(angles.z),sr=sin(angles.z);
  float xx=v.x*cy-v.z*sy,zz=v.x*sy+v.z*cy;
  float yy=v.y*cp-zz*sp,depth=v.y*sp+zz*cp;
  return vec3(xx*cr-yy*sr,xx*sr+yy*cr,depth);
}
vec3 soCameraToWorld(vec3 v,vec3 angles) {
  float cy=cos(angles.x),sy=sin(angles.x);
  float cp=cos(angles.y),sp=sin(angles.y);
  float cr=cos(angles.z),sr=sin(angles.z);
  float xx=v.x*cr+v.y*sr,yy=-v.x*sr+v.y*cr;
  float wy=yy*cp+v.z*sp,zz=-yy*sp+v.z*cp;
  return vec3(xx*cy+zz*sy,wy,-xx*sy+zz*cy);
}
vec3 soRayFromPixel(vec2 pixel,vec2 cssSize,float lens,vec3 angles,
                    float beta,vec3 velocityAxis) {
  float focal=min(cssSize.x*.94,cssSize.y*1.03)*lens;
  vec3 apparent=soUnit(vec3((pixel.x-cssSize.x*.5)/focal,
                          (cssSize.y*.5-pixel.y)/focal,1.0));
  return soUnit(soCameraToWorld(soInverseDirection(apparent,beta,velocityAxis),angles));
}
`;
