import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ABERRATION_BETA, createOpticsState, normalizeDirection,
  forwardDirection, inverseDirection, dopplerFactor, cameraBasis,
  worldToCameraVector, cameraToWorldVector, projectPoint, worldRayFromPixel,
} from '../src/space_optics.mjs';

const close = (a, b, tolerance = 1e-11) =>
  assert.ok(Math.abs(a-b) <= tolerance, `${a} differs from ${b} by ${Math.abs(a-b)}`);
const vectorClose = (a, b, tolerance = 1e-11) => {
  assert.equal(a.length, 3);
  a.forEach((v, i) => close(v, b[i], tolerance));
};
const dot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
let randomState = 0x4b4f5252;
function random() {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 4294967296;
}
const randomUnit = () => normalizeDirection([random()*2-1,random()*2-1,random()*2-1]);

test('known aberration at 0, 90 and 180 degrees; reverse flight', () => {
  const state = createOpticsState({beta:0.6});
  vectorClose(forwardDirection([1,0,0],state),[0.8,0,0.6]);
  vectorClose(forwardDirection([0,0,1],state),[0,0,1]);
  vectorClose(forwardDirection([0,0,-1],state),[0,0,-1]);
  vectorClose(inverseDirection([1,0,0],state),[0.8,0,-0.6]);
  close(dopplerFactor([1,0,0],state),1.25);
  close(dopplerFactor([0,0,1],state),2);
  close(dopplerFactor([0,0,-1],state),0.5);
});

test('aberration agrees with independent half-angle identity', () => {
  for (const beta of [-0.95,-0.6,0,0.6,0.95]) {
    const state=createOpticsState({beta});
    for(let degrees=3;degrees<180;degrees+=3) {
      const theta=degrees*Math.PI/180;
      const expected=2*Math.atan(Math.sqrt((1-beta)/(1+beta))*Math.tan(theta/2));
      const result=forwardDirection([Math.sin(theta),0,Math.cos(theta)],state);
      close(Math.atan2(Math.abs(result[0]),result[2]),expected,2e-13);
    }
  }
});

test('forward and inverse preserve arbitrary directions on the entire sphere', () => {
  for (const beta of [-0.98,-0.7,0,0.7,0.98]) {
    for(let i=0;i<400;i++) {
      const state=createOpticsState({beta,axis:randomUnit()});
      const n=randomUnit(),mapped=forwardDirection(n,state);
      close(Math.hypot(...mapped),1,4e-15);
      vectorClose(inverseDirection(mapped,state),n,8e-13);
    }
  }
});

test('Lorentz boost composition uses velocity addition, not an arbitrary lens', () => {
  const first=0.31,second=0.52,combined=(first+second)/(1+first*second);
  for(let i=0;i<100;i++) {
    const axis=randomUnit(),n=randomUnit();
    const a=forwardDirection(n,createOpticsState({beta:first,axis}));
    const b=forwardDirection(a,createOpticsState({beta:second,axis}));
    vectorClose(b,forwardDirection(n,createOpticsState({beta:combined,axis})),2e-14);
  }
});

test('local angular scaling is the reciprocal Doppler factor', () => {
  const theta=0.9,epsilon=1e-5,state=createOpticsState({beta:0.73});
  const n=[Math.sin(theta),0,Math.cos(theta)];
  const angle=t=>{
    const a=forwardDirection([Math.sin(t),0,Math.cos(t)],state);
    return Math.atan2(a[0],a[2]);
  };
  close((angle(theta+epsilon)-angle(theta-epsilon))/(2*epsilon),
    1/dopplerFactor(n,state),2e-10);
});

test('camera axes use the existing garden yaw / pitch / roll convention', () => {
  vectorClose(cameraBasis({yaw:Math.PI/2}).forward,[1,0,0]);
  vectorClose(cameraBasis({pitch:Math.PI/2}).forward,[0,1,0]);
  vectorClose(cameraBasis({roll:Math.PI/2}).right,[0,-1,0]);
  for(let i=0;i<200;i++) {
    const camera={yaw:random()*6,pitch:random()*6,roll:random()*6};
    const p=[random()*100-50,random()*100-50,random()*100-50];
    vectorClose(cameraToWorldVector(worldToCameraVector(p,camera),camera),p,5e-14);
    const basis=cameraBasis(camera);
    close(dot(basis.right,basis.up),0,5e-16);
    close(dot(basis.right,basis.forward),0,5e-16);
    close(dot(basis.up,basis.forward),0,5e-16);
  }
});

test('zero beta reproduces the legacy finite-point projection', () => {
  const camera={x:2,y:-3,z:4,yaw:0.4,pitch:-0.2,roll:0.15};
  const point={x:10,y:4,z:65},width=1440,height=810,lens=1.1;
  const dx=point.x-camera.x,dy=point.y-camera.y,dz=point.z-camera.z;
  const xx=dx*Math.cos(camera.yaw)-dz*Math.sin(camera.yaw);
  const zz=dx*Math.sin(camera.yaw)+dz*Math.cos(camera.yaw);
  const yy=dy*Math.cos(camera.pitch)-zz*Math.sin(camera.pitch);
  const depth=dy*Math.sin(camera.pitch)+zz*Math.cos(camera.pitch);
  const hx=xx*Math.cos(camera.roll)-yy*Math.sin(camera.roll);
  const hy=xx*Math.sin(camera.roll)+yy*Math.cos(camera.roll);
  const focal=Math.min(width*.94,height*1.03)*lens;
  const result=projectPoint(point,camera,width,height,lens);
  close(result.x,width/2+hx*focal/depth,2e-12);
  close(result.y,height/2-hy*focal/depth,2e-12);
  close(result.depth,depth,2e-14);
  close(result.scale,focal/depth,2e-14);
});

test('pixel rays and event projection are aligned across arbitrary camera poses', () => {
  const width=1200,height=720,lens=0.9;
  for(let i=0;i<400;i++) {
    const camera={x:random()*100-50,y:random()*100-50,z:random()*100-50,
      yaw:random()*6,pitch:random()*2-1,roll:random()*2-1};
    const state=createOpticsState({beta:random()*.95,axis:randomUnit()});
    const pixel=[random()*width,random()*height];
    const ray=worldRayFromPixel(...pixel,camera,width,height,lens,state);
    const distance=1+random()*200;
    const point={x:camera.x+ray[0]*distance,y:camera.y+ray[1]*distance,z:camera.z+ray[2]*distance};
    const projected=projectPoint(point,camera,width,height,lens,state);
    assert.ok(projected);
    close(projected.x,pixel[0],2e-9);
    close(projected.y,pixel[1],2e-9);
  }
});

test('radial near/far culling permits originally rearward sources aberrated into view', () => {
  const camera={x:0,y:0,z:0},state=createOpticsState({beta:0.9});
  const p={x:Math.sqrt(3)*5,y:0,z:-5};
  const projected=projectPoint(p,camera,1200,720,1,state);
  assert.ok(projected);
  close(projected.distance,10);
  assert.ok(projected.cameraDepth<0 && projected.depth>0);
  assert.equal(projectPoint({x:0,y:0,z:0.1},camera,1200,720,1,state),null);
  assert.equal(projectPoint({x:300,y:0,z:200},camera,1200,720,1,state),null);
  assert.ok(projectPoint({x:1e6,y:0,z:1e6},camera,1200,720,1,state,{far:Infinity}));
});

test('finite states at the optical poles and numerical beta limit; deterministic degeneracies', () => {
  const state=createOpticsState({beta:9,axis:[0,0,0]});
  assert.equal(state.beta,MAX_ABERRATION_BETA);
  vectorClose(state.axis,[0,0,1]);
  for(const n of [[0,0,1],[0,0,-1],[1e-9,0,-1],[0,0,0],[1e300,1e300,1e300]]) {
    const result=forwardDirection(n,state);
    assert.ok(result.every(Number.isFinite));
    close(Math.hypot(...result),1,3e-15);
  }
  vectorClose(forwardDirection([1,2,3],{beta:NaN}),normalizeDirection([1,2,3]));
  assert.equal(projectPoint({x:NaN,y:0,z:1},{x:0,y:0,z:0},1200,720),null);
  assert.equal(worldRayFromPixel(0,0,{},0,720),null);
});
