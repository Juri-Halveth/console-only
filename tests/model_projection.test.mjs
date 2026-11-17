import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createOpticsState,projectPointImages,worldToCameraVector} from '../src/space_optics.mjs';
const source=Object.freeze([
 Object.freeze({id:'MODEL_MINUS',x:-8,y:3,z:70}),
 Object.freeze({id:'MODEL_PLUS',x:8,y:-3,z:70}),
 Object.freeze({id:'GARDEN_SYNTHETIC_0',x:2,y:6,z:90})]);
const cameras=[
 {id:'reference',x:0,y:0,z:0,yaw:0,pitch:0,roll:0},
 {id:'side',x:18,y:0,z:0,yaw:-.25,pitch:0,roll:0},
 {id:'opposite',x:0,y:0,z:145,yaw:Math.PI,pitch:0,roll:0},
 {id:'rotated',x:0,y:0,z:0,yaw:0,pitch:0,roll:Math.PI/2}];
test('same frozen 3D source IDs survive four bound camera operators',()=>{
 const before=JSON.stringify(source);const receipt=[];
 for(const camera of cameras){
  const state=createOpticsState();
  const images=source.flatMap(p=>projectPointImages(p,camera,1280,720,1,state,{near:0,far:Infinity,sourceId:p.id}));
  assert.equal(images.length,source.length);
  assert.deepEqual(images.map(p=>p.sourceId),source.map(p=>p.id));
  assert(images.every(p=>[p.x,p.y,p.depth].every(Number.isFinite)&&p.depth>0));
  receipt.push({camera,images});
 }
 assert.equal(JSON.stringify(source),before);
 const evidence=new URL('../evidence/',import.meta.url);fs.mkdirSync(evidence,{recursive:true});
 fs.writeFileSync(new URL('console-four-camera.json',evidence),JSON.stringify({scope:'synthetic fixed 3D coordinates, four actual camera transforms, identity optics; not physical-world validation',source,receipt},null,2));
});
