import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.env.KORRIDOT_OPTICS_ROOT||'.');
const optics=await import(pathToFileURL(path.join(root,'src/space_optics.mjs')).href);
const camera={x:0,y:0,z:0,yaw:0,pitch:0,roll:0};
const point=(distance,angle=.08)=>({x:distance*Math.sin(angle),y:0,z:distance*Math.cos(angle)});
const state=optics.createOpticsState({lensRadius:.07,focusDistance:50});
test('OBS-01 both image branches retain one source identity',()=>{
 assert.equal(typeof optics.projectPointImages,'function');
 const images=optics.projectPointImages(point(1e8),camera,1280,720,1,state,{near:0,far:Infinity,sourceId:'SOURCE_0'});
 assert.deepEqual(images.map(i=>i.branch),['primary','secondary']);
 assert(images.every(i=>i.sourceId==='SOURCE_0'));
 assert.notEqual(images[0].observationId,images[1].observationId);
 assert(images[0].x>640&&images[1].x<640);
});
test('OBS-02 finite-source depth has no hard position jump at old boundary',()=>{
 const before=optics.projectPoint(point(50.999999),camera,1280,720,1,state,{far:Infinity});
 const after=optics.projectPoint(point(51.000001),camera,1280,720,1,state,{far:Infinity});
 const delta=Math.hypot(after.x-before.x,after.y-before.y);
 assert(delta<1e-3,`jump ${delta}px`);
});
test('finite source inverse rays recover both branches without duplicate lens',()=>{
 assert.equal(typeof optics.projectPointImages,'function');
 const distance=90,angle=.08;
 const images=optics.projectPointImages(point(distance,angle),camera,1280,720,1,state,{far:Infinity});
 for(const image of images){
  const ray=optics.worldRayFromPixel(image.x,image.y,camera,1280,720,1,state,{distance});
  assert(Math.hypot(ray[0]-Math.sin(angle),ray[1],ray[2]-Math.cos(angle))<1e-9);
 }
});
test('foreground sources stay unlensed; continuity at the lens plane',()=>{
 assert.equal(typeof optics.lensRadiusAtDistance,'function');
 assert.equal(optics.lensRadiusAtDistance(49,state),0);
 assert.equal(optics.lensRadiusAtDistance(50,state),0);
 assert(optics.lensRadiusAtDistance(50.000001,state)<1e-4);
});
