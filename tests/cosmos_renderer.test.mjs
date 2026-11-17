import test from 'node:test';
import assert from 'node:assert/strict';
import * as rendererModule from '../src/cosmos_renderer.mjs';
import { createOpticsState } from '../src/space_optics.mjs';

const { createCosmosRenderer, createStarGeometry, createLocalStars,
  CELL_SIZE, CELL_RADIUS } = rendererModule;
const CAMERA = Object.freeze({x:0,y:0,z:0,yaw:0,pitch:0,roll:0});
const close = (a,b,epsilon=1e-9) => assert.ok(Math.abs(a-b)<=epsilon,
  `${a} differs from ${b} by ${Math.abs(a-b)}`);

// A recording WebGL surface checks application behavior, not shader execution.
// Shader compilation/projection needs the separate real EGL/browser checks.
function recordingCanvas({failCompileAt=0,failAllocation=null}={}) {
  let next=1,currentProgram=null,currentVAO=null,currentBuffer=null;
  const shaders=[],programs=[],buffers=[],arrays=[],draws=[],uploads=[];
  const deleted={shader:[],program:[],buffer:[],vao:[]};
  const listeners=new Map();
  const gl={
    VERTEX_SHADER:0x8b31,FRAGMENT_SHADER:0x8b30,COMPILE_STATUS:0x8b81,
    LINK_STATUS:0x8b82,ARRAY_BUFFER:0x8892,STATIC_DRAW:0x88e4,
    FLOAT:0x1406,TRIANGLES:4,POINTS:0,DEPTH_TEST:0xb71,BLEND:0xbe2,ONE:1,
    createShader(type){
      if(failAllocation==='shader')return null;
      const s={id:next++,type,source:'',ordinal:shaders.length+1};shaders.push(s);return s;
    },
    shaderSource(shader,source){shader.source=source;},compileShader(){},
    getShaderParameter(shader){return shader.ordinal!==failCompileAt;},
    getShaderInfoLog(){return 'test compile failure';},
    deleteShader(s){if(s)deleted.shader.push(s);},
    createProgram(){
      if(failAllocation==='program')return null;
      const p={id:next++,shaders:[],uniforms:{}};programs.push(p);return p;
    },
    attachShader(p,s){p.shaders.push(s);},linkProgram(){},
    getProgramParameter(){return true;},getProgramInfoLog(){return '';},
    deleteProgram(p){if(p)deleted.program.push(p);},
    createVertexArray(){
      if(failAllocation==='vao')return null;
      const v={id:next++,attributes:new Map()};arrays.push(v);return v;
    },
    createBuffer(){
      if(failAllocation==='buffer')return null;
      const b={id:next++,data:null};buffers.push(b);return b;
    },
    bindVertexArray(v){currentVAO=v;},bindBuffer(_target,b){currentBuffer=b;},
    bufferData(_target,data){
      // WebGL errors do not throw JavaScript exceptions. A missing allocation
      // must be caught by the renderer rather than by this recording surface.
      if(!currentBuffer)return;
      currentBuffer.data=new Float32Array(data);
      uploads.push({buffer:currentBuffer,data:currentBuffer.data});
    },
    enableVertexAttribArray(){},
    vertexAttribPointer(location,size,type,normalized,stride,offset){
      currentVAO?.attributes.set(location,{buffer:currentBuffer,size,type,normalized,stride,offset});
    },
    deleteBuffer(b){if(b)deleted.buffer.push(b);},
    deleteVertexArray(v){if(v)deleted.vao.push(v);},
    getUniformLocation(p,name){
      const source=p.shaders.map(s=>s.source).join('\n');
      // Optimized-out/undeclared uniforms legitimately return null.
      return (source.match(new RegExp(`\\b${name}\\b`,'g'))||[]).length>1?{p,name}:null;
    },
    useProgram(p){currentProgram=p;},
    uniform1f(loc,...values){setUniform(loc,values);},
    uniform2f(loc,...values){setUniform(loc,values);},
    uniform3f(loc,...values){setUniform(loc,values);},
    viewport(x,y,w,h){gl.lastViewport=[x,y,w,h];},
    disable(){},enable(){},blendFunc(){},isContextLost(){return false;},
    drawArrays(mode,first,count){
      assert.ok(currentProgram,'draw requires a linked program');
      assert.ok(currentVAO,'draw requires a vertex array');
      const attributes=[...currentVAO.attributes.values()];
      for(const a of attributes)assert.ok(a.buffer?.data,'attribute requires initialized data');
      draws.push({mode,first,count,program:currentProgram,vao:currentVAO,
        data:attributes[0]?.buffer.data,
        uniforms:Object.fromEntries(Object.entries(currentProgram.uniforms).map(([k,v])=>[k,[...v]]))});
    },
  };
  function setUniform(loc,values){
    if(loc===null)return;
    assert.equal(loc.p,currentProgram,'uniform belongs to the current program');
    assert.ok(values.every(Number.isFinite),'GPU uniforms must all be finite');
    loc.p.uniforms[loc.name]=values;
  }
  const canvas={width:0,height:0,contextRequests:[],
    getContext(kind,options){canvas.contextRequests.push({kind,options});return gl;},
    addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
    removeEventListener(name,fn){listeners.get(name)?.delete(fn);},
    dispatch(name,event={}){for(const fn of listeners.get(name)||[])fn(event);},
  };
  return {canvas,gl,draws,uploads,deleted,shaders,programs,buffers,arrays,listeners};
}

test('unavailable WebGL returns null; partial shader failures release allocations',()=>{
  for(const canvas of [null,{}, {getContext:()=>null},
      {getContext(){throw new Error('unavailable');}}]) {
    assert.equal(createCosmosRenderer(canvas),null);
  }
  const q=recordingCanvas({failCompileAt:3});
  assert.throws(()=>createCosmosRenderer(q.canvas),/compile failure/);
  assert.equal(q.deleted.shader.length,q.shaders.length);
  assert.equal(q.deleted.program.length,q.programs.length);
  assert.equal(q.listeners.size,0);
});

test('allocation failures are reported rather than pretending to render',()=>{
  for(const failAllocation of ['shader','program','buffer','vao']) {
    const q=recordingCanvas({failAllocation});
    assert.throws(()=>createCosmosRenderer(q.canvas),/allocat/i,failAllocation);
    assert.equal(q.deleted.shader.length,q.shaders.length);
    assert.equal(q.deleted.program.length,q.programs.length);
    assert.equal(q.deleted.buffer.length,q.buffers.length);
    assert.equal(q.deleted.vao.length,q.arrays.length);
  }
});

test('seeded celestial geometry is finite and exactly reproducible',()=>{
  const first=createStarGeometry(0x4b4f5252),again=createStarGeometry(0x4b4f5252);
  assert.ok(first instanceof Float32Array && first.length>0 && first.length%8===0);
  assert.deepEqual(first,again);
  assert.notDeepEqual(first,createStarGeometry(0x4b4f5253));
  let minimum=Infinity,maximum=0;
  for(let i=0;i<first.length;i+=8){
    const star=first.subarray(i,i+8);
    assert.ok([...star].every(Number.isFinite));
    assert.ok(star[3]>=0&&star[4]>=0&&star[5]>=0&&star[6]>0);
    assert.equal(star[7],0,'celestial positions must not gain translational parallax');
    const radius=Math.hypot(star[0],star[1],star[2]);
    minimum=Math.min(minimum,radius);maximum=Math.max(maximum,radius);
  }
  assert.ok(minimum>1 && maximum/minimum<1.000001,'distant points occupy one celestial sphere');
});

function worldCells(geometry){
  const cells=new Map();
  for(let i=0;i<geometry.data.length;i+=8){
    const row=Array.from(geometry.data.subarray(i,i+8));
    for(let k=0;k<3;k++)row[k]+=geometry.origin[k];
    assert.ok(row.every(Number.isFinite));
    assert.equal(row[7],1,'local sources need camera-relative parallax');
    const key=row.slice(0,3).map(v=>Math.floor(v/CELL_SIZE)).join(':');
    if(!cells.has(key))cells.set(key,[]);
    cells.get(key).push(row);
  }
  for(const rows of cells.values())rows.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
  return cells;
}

test('reanchoring in positive and negative X/Y/Z preserves overlapping world stars',()=>{
  const camera={x:5.5,y:18.25,z:-31.75},seed=0x63756e65;
  const original=createLocalStars(camera,seed),base=worldCells(original);
  assert.deepEqual(original,createLocalStars(camera,seed));
  assert.deepEqual(original,createLocalStars({...camera,x:camera.x+1,y:camera.y+1,z:camera.z+1},seed));
  assert.notDeepEqual(original.data,createLocalStars(camera,seed+1).data);
  assert.equal(base.size,(2*CELL_RADIUS+1)**3);
  for(const shift of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[1,-1,1]]){
    const moved=createLocalStars({x:camera.x+shift[0]*CELL_SIZE,
      y:camera.y+shift[1]*CELL_SIZE,z:camera.z+shift[2]*CELL_SIZE},seed);
    const next=worldCells(moved);
    let sharedCells=0;
    for(const [key,stars] of base){
      const matching=next.get(key);if(!matching)continue;
      sharedCells++;
      assert.equal(stars.length,matching.length,`star count changed in world cell ${key}`);
      stars.forEach((a,i)=>{
        const b=matching[i];
        for(let k=0;k<3;k++)close(a[k],b[k],CELL_SIZE*1e-6);
        assert.deepEqual(a.slice(3),b.slice(3),'the same world source changed color/size');
      });
    }
    assert.equal(sharedCells,shift.reduce((n,s)=>n*(2*CELL_RADIUS+1-Math.abs(s)),1));
  }
});

test('the complete visible local volume is present before a cell enters',()=>{
  // This checks the geometric coverage invariant when the renderer exposes its
  // fade distance. It avoids coupling the test to shader string formatting.
  const end=rendererModule.LOCAL_FADE_END;
  assert.ok(Number.isFinite(end),'export the local fade limit used by the shader');
  assert.ok(end>0 && end<CELL_RADIUS*CELL_SIZE,
    'every visible radial shell must fit inside every streamed camera cell');
});

test('invalid frame inputs neither draw nor send nonfinite values to WebGL',()=>{
  const q=recordingCanvas(),renderer=createCosmosRenderer(q.canvas);
  assert.ok(renderer.render(CAMERA,1200,700));
  const before=q.draws.length;
  const invalid=[
    [null,1200,700,1],
    [{...CAMERA,x:NaN},1200,700,1],
    [{...CAMERA,z:Infinity},1200,700,1],
    [{...CAMERA,pitch:NaN},1200,700,1],
    [CAMERA,0,700,1], [CAMERA,1200,-1,1], [CAMERA,NaN,700,1],
    [CAMERA,1200,Infinity,1], [CAMERA,1200,700,0], [CAMERA,1200,700,NaN],
  ];
  for(const args of invalid)assert.equal(renderer.render(...args),false);
  assert.equal(q.draws.length,before);
  for(const optics of [null,{beta:NaN,axis:[0,0,0]},{beta:Infinity,axis:[NaN,0,1]}]){
    let result;
    assert.doesNotThrow(()=>{result=renderer.render(CAMERA,1200,700,1,1,optics);});
    assert.equal(typeof result,'boolean');
  }
  renderer.dispose();
});

test('sky and stars receive one camera/optics state, with floating-origin local positions',()=>{
  const q=recordingCanvas(),renderer=createCosmosRenderer(q.canvas);
  const camera={x:123.25,y:-202.5,z:314.75,yaw:0.2,pitch:-0.1,roll:0.3};
  const optics={beta:0.72,axis:[3,-4,0]},state=createOpticsState(optics);
  assert.equal(renderer.render(camera,1200,700,0.9,1,optics),true);
  assert.equal(q.draws.length,3);
  assert.equal(q.draws[0].mode,q.gl.TRIANGLES);
  assert.equal(q.draws[1].mode,q.gl.POINTS);
  assert.equal(q.draws[2].mode,q.gl.POINTS);
  for(const draw of q.draws){
    assert.deepEqual(draw.uniforms.u_angles,[camera.yaw,camera.pitch,camera.roll]);
    assert.deepEqual(draw.uniforms.u_css,[1200,700]);
    assert.deepEqual(draw.uniforms.u_resolution,[q.canvas.width,q.canvas.height]);
    assert.deepEqual(draw.uniforms.u_lens,[0.9]);
    assert.deepEqual(draw.uniforms.u_beta,[state.beta],
      'inverse sky lookup performs its own sign reversal; do not negate its uniform');
    assert.deepEqual(draw.uniforms.u_axis,state.axis);
  }
  assert.deepEqual(q.draws[2].uniforms.u_camera,[27.25,85.5,26.75]);
  assert.equal(q.draws[1].data[7],0);
  assert.equal(q.draws[2].data[7],1);
  assert.deepEqual(q.gl.lastViewport,[0,0,q.canvas.width,q.canvas.height]);
  renderer.dispose();
});

test('moving inside a cell does not regenerate stars; crossing replaces only local geometry',()=>{
  const q=recordingCanvas(),renderer=createCosmosRenderer(q.canvas);
  renderer.render({...CAMERA,x:1,y:2,z:3},800,600);
  const originalUploads=q.uploads.length;
  const celestialBuffer=q.draws.at(-2).vao.attributes.get(0).buffer;
  const celestialData=celestialBuffer.data;
  renderer.render({...CAMERA,x:40,y:20,z:80},800,600);
  assert.equal(q.uploads.length,originalUploads);
  renderer.render({...CAMERA,x:CELL_SIZE+1,y:20,z:80},800,600);
  assert.equal(q.uploads.length,originalUploads+1);
  assert.equal(celestialBuffer.data,celestialData);
  assert.notEqual(q.uploads.at(-1).buffer,celestialBuffer);
  renderer.dispose();
});

test('context loss stops drawing; disposal is complete and idempotent',()=>{
  const q=recordingCanvas(),renderer=createCosmosRenderer(q.canvas);
  renderer.render(CAMERA,800,600);
  const before=q.draws.length;
  let prevented=false;
  q.canvas.dispatch('webglcontextlost',{preventDefault(){prevented=true;}});
  assert.ok(prevented);
  assert.equal(renderer.render(CAMERA,800,600),false);
  assert.equal(renderer.stats().lost,true);
  q.canvas.dispatch('webglcontextrestored');
  assert.equal(renderer.render(CAMERA,800,600),false,'caller replaces the renderer after restoration');
  assert.equal(q.draws.length,before);
  renderer.dispose();renderer.dispose();
  assert.equal(renderer.render(CAMERA,800,600),false);
  assert.equal(renderer.stats().disposed,true);
  assert.equal(q.deleted.program.length,q.programs.length);
  assert.equal(q.deleted.buffer.length,q.buffers.length);
  assert.equal(q.deleted.vao.length,q.arrays.length);
  for(const set of q.listeners.values())assert.equal(set.size,0);
});
