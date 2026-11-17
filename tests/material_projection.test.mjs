import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import '../src/material-engine.js';
import '../src/material-model.js';
import '../src/material-view.js';
import {createOpticsState,projectPointImages} from '../src/space_optics.mjs';
const context=new Proxy({canvas:{width:1440,height:900},createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]||(()=>{})});
const state=()=>{const m=HALVETHMaterial.create({particles:960,seed:170117,nematic:true,drive:.95});m.step(.125);return m.snapshot();};
const cameras=[{id:'front',x:0,y:0,z:42,yaw:0,pitch:0,roll:0},{id:'side',x:22,y:0,z:42,yaw:-.5,pitch:0,roll:0},{id:'opposite',x:0,y:0,z:98,yaw:Math.PI,pitch:0,roll:0},{id:'rolled',x:0,y:0,z:42,yaw:0,pitch:0,roll:Math.PI/2}];
const project=(camera,lens=1)=>(p,id)=>projectPointImages({x:p.x*3.2,y:p.y*3.2,z:70+(p.z||0)*3.2},camera,1440,900,lens,createOpticsState(),{far:Infinity,near:0,sourceId:'simulation:material:'+id});
test('all960 actual material identities and true orientations survive four camera operators',()=>{
 const s=state(),before=JSON.stringify(s),records=[];assert.equal(s.materialCells.length,960);assert(s.materialCells.every(c=>c.z===0));
 for(const camera of cameras){const out=HALVETHMaterialView.draw(context,s,{background:false,project:project(camera),mode:'rods',colorMode:'rgb'},1440,900);assert.equal(out.observations.length,960);assert.deepEqual(out.observations.map(p=>p.id),s.materialCells.map(p=>p.id));assert.deepEqual(out.observations.map(p=>p.theta),s.materialCells.map(p=>p.theta));assert(out.observations.every(p=>Number.isFinite(p.renderLength)&&p.renderLength>0));records.push({camera,observations:out.observations});}
 assert.equal(JSON.stringify(s),before);fs.mkdirSync('../evidence',{recursive:true});fs.writeFileSync('../evidence/material-console-four-camera.json',JSON.stringify({scope:'Actual960-cell frozen2D solver state observed with four declared3D cameras, not3D material physics',modelSource:s.sourceHash,stateSHA256:crypto.createHash('sha256').update(before).digest('hex'),records},null,2));
});
test('symbol size RGB classes and camera zoom leave every mass energy clock and raw state unchanged',()=>{
 const s=state(),before=JSON.stringify(s),base=HALVETHMaterialView.draw(context,s,{background:false,project:project(cameras[0]),symbolScale:.5,mode:'rods'},1440,900);
 for(const mode of ['rods','field','cells'])for(const colorMode of ['rgb','bluegold']){const out=HALVETHMaterialView.draw(context,s,{background:false,project:project(cameras[0],1.2),symbolScale:1.8,mode,colorMode,annotations:true},1440,900);assert.equal(out.observations.length,960);assert.equal(JSON.stringify(s),before);assert(out.observations[0].renderLength>base.observations[0].renderLength);}
 assert.equal(new Set(s.materialCells.map(c=>c.mass)).size,1);assert.deepEqual([...new Set(s.materialCells.map(c=>c.channel))],[0,1,2]);
});
