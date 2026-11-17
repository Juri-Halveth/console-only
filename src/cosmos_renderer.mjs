// KORRIDOT_SPUR_LINSE_V11
// KORRIDOT SPACEFLIGHT 1.0 — a camera in an open, deterministic star volume.
// Scene distances are model units. The camera optics use special-relativistic
// aberration; no claim is made that the flight controls measure a physical c.
import { OPTICS_GLSL, createOpticsState } from './space_optics.mjs';

export const CELL_SIZE=96;
export const CELL_RADIUS=4;
export const LOCAL_FADE_END=380;

export const VERT = `#version 300 es
precision highp float;
void main(){
  vec2 v=vec2(gl_VertexID==1?3.0:-1.0,gl_VertexID==2?3.0:-1.0);
  gl_Position=vec4(v,0.0,1.0);
}`;

export const FRAG = `#version 300 es
precision highp float;
precision highp int;
out vec4 pixel;
uniform vec2 u_resolution;
uniform vec2 u_css;
uniform vec3 u_angles;
uniform float u_lens;
uniform float u_beta;
uniform vec3 u_axis;
uniform vec3 u_lensAxis;
uniform float u_lensRadius;
uniform float u_focusDistance;
${OPTICS_GLSL}
float hash3(vec3 p){
  p=fract(p*.1031);p+=dot(p,p.yzx+33.33);
  return fract((p.x+p.y)*p.z);
}
float noise3(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),
                 mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),
                 mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float clouds(vec3 p){
  float n=.53*noise3(p);p=p*2.07+vec3(7.1,3.9,2.8);
  n+=.27*noise3(p);p=p*2.03+vec3(2.3,6.1,9.2);
  n+=.13*noise3(p);return n+.07*noise3(p*2.09);
}
void main(){
  // Pixels and Garden projectPoint use the same top-left CSS convention.
  vec2 px=vec2(gl_FragCoord.x/u_resolution.x*u_css.x,
    (1.0-gl_FragCoord.y/u_resolution.y)*u_css.y);
  float focal=min(u_css.x*.94,u_css.y*1.03)*u_lens;
  vec3 observed=soUnit(vec3((px.x-u_css.x*.5)/focal,(u_css.y*.5-px.y)/focal,1.0));
  vec3 lensed=soLensInverse(observed,u_lensAxis,u_lensRadius);
  vec3 ray=soUnit(soCameraToWorld(soInverseDirection(lensed,u_beta,u_axis),u_angles));
  // A celestial band occupies a fixed direction on the unit sphere. Its 3-D
  // noise is continuous across all longitudes: no atan seam, no tunnel wall.
  vec3 normal=normalize(vec3(.36,.80,-.48));
  float latitude=dot(ray,normal);
  float broad=exp(-latitude*latitude*42.0);
  float band=exp(-latitude*latitude*125.0);
  float dust=clouds(ray*18.0+vec3(4.2,11.7,3.1));
  float fine=clouds(ray*55.0+vec3(12.0,1.7,2.1));
  float lane=exp(-pow((latitude+.018+.025*(dust-.5))*45.0,2.0));
  float light=band*(.013+.072*pow(dust,2.0)+.032*fine);
  light*=1.0-lane*(.45+.42*smoothstep(.22,.73,fine));
  vec3 tint=mix(vec3(.55,.65,.84),vec3(1.0,.84,.64),smoothstep(.3,.75,dust));
  vec3 col=vec3(.00065,.0010,.0018)+tint*light+vec3(.006,.009,.016)*broad;
  // Compact distant galaxies. They are angular sky sources, not foreground
  // density samples, and remain anchored while looking around or braking.
  vec3 g=normalize(vec3(-.48,.20,.85));
  vec3 gx=normalize(cross(normal,g));vec3 gy=cross(g,gx);
  float face=max(0.0,dot(ray,g));
  float x=dot(ray,gx),y=dot(ray,gy);
  float ellipse=sqrt(x*x*1800.0+y*y*24000.0);
  float galaxy=exp(-ellipse*2.1)*pow(face,10.0);
  col+=vec3(.43,.49,.63)*galaxy;
  // A restrained display transfer; stars carry the brightest pixels.
  col=pow(max(col,vec3(0.0)),vec3(.72));
  pixel=vec4(col,1.0);
}`;

export const STAR_VERT = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_color;
layout(location=2) in float a_size;
layout(location=3) in float a_local;
uniform vec2 u_resolution;
uniform vec2 u_css;
uniform vec3 u_angles;
uniform vec3 u_camera;
uniform vec3 u_velocity;
uniform float u_lens;
uniform float u_beta;
uniform vec3 u_axis;
uniform vec3 u_lensAxis;
uniform float u_lensRadius;
uniform float u_focusDistance;
uniform float u_imageBranch;
out vec3 v_color;
out float v_size;
${OPTICS_GLSL}
void main(){
  vec3 relative=a_position-u_camera*a_local;
  float distance=length(relative);
  vec3 direction=soWorldToCamera(relative/max(distance,1.e-8),u_angles);
  vec3 aberrated=soForwardDirection(direction,u_beta,u_axis);
  float effectiveLens=soLensRadiusAtDistance(distance,u_lensRadius,u_focusDistance);
  if(u_imageBranch>.5&&effectiveLens<=0.0){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;v_color=vec3(0.);v_size=1.;return;}
  vec3 apparent=soLensImage(aberrated,u_lensAxis,effectiveLens,u_imageBranch);
  float focal=min(u_css.x*.94,u_css.y*1.03)*u_lens;
  float nearFade=smoothstep(1.8,7.0,distance);
  float farFade=1.0-smoothstep(310.0,${LOCAL_FADE_END.toFixed(1)},distance);
  float opacity=mix(1.0,nearFade*farFade,a_local);
  float d=1.0/max(.06,sqrt(1.0-u_beta*u_beta))*(1.0+u_beta*dot(direction,u_axis));
  // The display exposure is deliberately bounded; Doppler factor is not
  // presented as a calibrated spectral or radiometric measurement.
  float energy=clamp(pow(d,.48),.28,2.3);
  float size=a_size*mix(1.0,clamp(72.0/max(distance,1.0),.35,2.8),a_local);
  size*=clamp(sqrt(d),.7,1.65);
  v_color=a_color*opacity*energy;
  v_size=clamp(size,1.0,7.0)*u_resolution.y/u_css.y;
  gl_PointSize=max(1.0,v_size*3.0);
  if(apparent.z<.0001||opacity<.001){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
  vec2 xy=apparent.xy/apparent.z*focal;
  gl_Position=vec4(2.0*xy.x/u_css.x,2.0*xy.y/u_css.y,0.0,1.0);
}`;

export const STAR_FRAG = `#version 300 es
precision highp float;
in vec3 v_color;
in float v_size;
out vec4 pixel;
void main(){
  vec2 q=(gl_PointCoord-.5)*3.0;
  float r2=dot(q,q);
  float core=exp(-r2*9.0);
  float halo=exp(-r2*2.0)*.085;
  float aa=1.0-smoothstep(1.65,2.20,r2);
  pixel=vec4(v_color*(core+halo)*aa,1.0);
}`;

const UINT_SCALE=1/4294967296;
function hash(x,y,z,seed){
  let n=Math.imul(x|0,0x1f123bb5)^Math.imul(y|0,0x5f356495)^Math.imul(z|0,0x6c8e9cf5)^seed;
  n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);
  return (n^(n>>>16))>>>0;
}
function randomGenerator(seed){
  let n=seed>>>0;
  return ()=>{n=(n+0x6d2b79f5)>>>0;let t=Math.imul(n^(n>>>15),n|1);
    t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)*UINT_SCALE;};
}
function starColor(r,bright){
  const c=r<.16?[.64,.77,1.0]:r>.88?[1.0,.72,.48]:r>.7?[1.0,.91,.78]:[.92,.95,1.0];
  return c.map(v=>v*bright);
}

// This geometry is exported so an independent EGL test renders the very same
// positions and colors as the WebGL implementation, not a concept illustration.
export function createStarGeometry(seed=0x4b4f5252){
  const out=[];const rng=randomGenerator(seed);
  const normal=[.36,.80,-.48],nl=Math.hypot(...normal);normal.forEach((v,i)=>normal[i]=v/nl);
  const tangent=[normal[2],0,-normal[0]],tl=Math.hypot(...tangent);tangent.forEach((v,i)=>tangent[i]=v/tl);
  const binormal=[normal[1]*tangent[2]-normal[2]*tangent[1],normal[2]*tangent[0]-normal[0]*tangent[2],normal[0]*tangent[1]-normal[1]*tangent[0]];
  const count=12500;
  for(let i=0;i<count;i++){
    let dir;
    if(i<7000){
      const z=rng()*2-1,a=rng()*Math.PI*2,r=Math.sqrt(1-z*z);
      dir=[r*Math.cos(a),r*Math.sin(a),z];
    }else{
      const a=rng()*Math.PI*2,lat=(rng()+rng()+rng()-1.5)*.105;
      dir=tangent.map((v,k)=>v*Math.cos(a)+binormal[k]*Math.sin(a)+normal[k]*lat);
      const l=Math.hypot(...dir);dir=dir.map(v=>v/l);
    }
    const magnitude=rng(),brightness=.13+.80*Math.pow(magnitude,5);
    const color=starColor(rng(),brightness);
    const size=.70+1.85*Math.pow(magnitude,7);
    out.push(...dir.map(v=>v*1000000),...color,size,0);
  }
  return new Float32Array(out);
}

export function createLocalStars(camera,seed=0x4b4f5252){
  const cell=[camera.x,camera.y,camera.z].map(v=>Math.floor(v/CELL_SIZE));
  const origin=cell.map(v=>v*CELL_SIZE);
  const data=new Float32Array((2*CELL_RADIUS+1)**3*11*8);let k=0;
  for(let z=-CELL_RADIUS;z<=CELL_RADIUS;z++)
  for(let y=-CELL_RADIUS;y<=CELL_RADIUS;y++)
  for(let x=-CELL_RADIUS;x<=CELL_RADIUS;x++){
    const rng=randomGenerator(hash(cell[0]+x,cell[1]+y,cell[2]+z,seed));
    for(let j=0;j<11;j++){
      data[k++]=(x+rng())*CELL_SIZE;data[k++]=(y+rng())*CELL_SIZE;data[k++]=(z+rng())*CELL_SIZE;
      const mag=rng(),tint=rng(),brightness=.23+.90*Math.pow(mag,3);
      data[k++]=brightness*(tint<.16?.64:tint>.7?1:.92);
      data[k++]=brightness*(tint<.16?.77:tint>.88?.72:tint>.7?.91:.95);
      data[k++]=brightness*(tint<.16?1:tint>.88?.48:tint>.7?.78:1);
      data[k++]=.9+1.5*Math.pow(mag,3);data[k++]=1;
    }
  }
  return {data,origin,cell:cell.join(':')};
}

function makeProgram(gl,vertex,fragment){
  const shaders=[];let program=null;
  try{
    for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
      const shader=gl.createShader(type);if(!shader)throw new Error('Shader allocation failed');
      shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'Shader compile failed');
    }
    program=gl.createProgram();if(!program)throw new Error('Program allocation failed');
    shaders.forEach(s=>gl.attachShader(program,s));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'Program link failed');
    return program;
  }catch(error){if(program)gl.deleteProgram(program);throw error;}
  finally{shaders.forEach(s=>gl.deleteShader(s));}
}

export function createCosmosRenderer(canvas,{seed=0x4b4f5252}={}){
  if(!canvas||typeof canvas.getContext!=='function')return null;
  let gl;
  try{gl=canvas.getContext('webgl2',{alpha:false,depth:false,stencil:false,antialias:false,powerPreference:'high-performance'});}catch{return null;}
  if(!gl)return null;
  const programs=[],buffers=[],arrays=[];let disposed=false,lost=false;
  const cleanup=()=>{buffers.forEach(b=>gl.deleteBuffer(b));arrays.forEach(v=>gl.deleteVertexArray(v));programs.forEach(p=>gl.deleteProgram(p));};
  try{
    const sky=makeProgram(gl,VERT,FRAG);programs.push(sky);
    const stars=makeProgram(gl,STAR_VERT,STAR_FRAG);programs.push(stars);
    const empty=gl.createVertexArray();if(!empty)throw new Error('Vertex array allocation failed');arrays.push(empty);
    const makeStarBuffer=data=>{
      const vao=gl.createVertexArray();if(!vao)throw new Error('Vertex array allocation failed');arrays.push(vao);
      const buffer=gl.createBuffer();if(!buffer)throw new Error('Buffer allocation failed');buffers.push(buffer);
      gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
      for(const [location,size,offset] of [[0,3,0],[1,3,3],[2,1,6],[3,1,7]]){
        gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,32,offset*4);
      }
      return {vao,buffer,count:data.length/8};
    };
    const far=makeStarBuffer(createStarGeometry(seed));
    let local=createLocalStars({x:0,y:0,z:0},seed),near=makeStarBuffer(local.data);
    const names=['u_resolution','u_css','u_angles','u_lens','u_beta','u_axis','u_camera','u_velocity','u_lensAxis','u_lensRadius','u_focusDistance','u_imageBranch'];
    const locations=programs.map(p=>Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(p,n)])));
    const onLost=event=>{event.preventDefault();lost=true;};
    const onRestored=()=>{lost=true;}; // caller replaces this renderer after restoration
    canvas.addEventListener?.('webglcontextlost',onLost,false);
    canvas.addEventListener?.('webglcontextrestored',onRestored,false);
    let stats={stars:far.count+near.count,draws:0,width:0,height:0};
    return Object.freeze({
      render(camera,width,height,lens=1,quality=1,optics={beta:0,axis:[0,0,1]}){
        if(disposed||lost||gl.isContextLost?.())return false;
        if(!camera||![camera.x,camera.y,camera.z,camera.yaw,camera.pitch,camera.roll,width,height,lens].every(Number.isFinite)||width<1||height<1||lens<=0)return false;
        const state=createOpticsState(optics||{});
        const scale=quality<.65?.72:Math.min(1.25,globalThis.devicePixelRatio||1);
        const w=Math.max(32,Math.round(width*scale)),h=Math.max(32,Math.round(height*scale));
        if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
        gl.viewport(0,0,w,h);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
        const cell=[camera.x,camera.y,camera.z].map(v=>Math.floor(v/CELL_SIZE)).join(':');
        if(cell!==local.cell){
          local=createLocalStars(camera,seed);gl.bindBuffer(gl.ARRAY_BUFFER,near.buffer);
          gl.bufferData(gl.ARRAY_BUFFER,local.data,gl.STATIC_DRAW);near.count=local.data.length/8;
        }
        const set=(p,U)=>{
          gl.useProgram(p);gl.uniform2f(U.u_resolution,w,h);gl.uniform2f(U.u_css,width,height);
          gl.uniform3f(U.u_angles,camera.yaw,camera.pitch,camera.roll);gl.uniform1f(U.u_lens,lens);
          gl.uniform1f(U.u_beta,state.beta);gl.uniform3f(U.u_axis,...state.axis);
          if(U.u_lensAxis!==null)gl.uniform3f(U.u_lensAxis,...state.lensAxis);
          if(U.u_lensRadius!==null)gl.uniform1f(U.u_lensRadius,state.lensRadius);
          if(U.u_focusDistance!==null)gl.uniform1f(U.u_focusDistance,Number.isFinite(state.focusDistance)?state.focusDistance:1e12);
          if(U.u_camera!==null)gl.uniform3f(U.u_camera,camera.x-local.origin[0],camera.y-local.origin[1],camera.z-local.origin[2]);
          if(U.u_velocity!==null)gl.uniform3f(U.u_velocity,0,0,0);
        };
        set(sky,locations[0]);gl.bindVertexArray(empty);gl.drawArrays(gl.TRIANGLES,0,3);
        set(stars,locations[1]);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
        const branches=state.lensRadius>0?2:1;
        for(let image=0;image<branches;image++){
          if(locations[1].u_imageBranch!==null)gl.uniform1f(locations[1].u_imageBranch,image);
          gl.bindVertexArray(far.vao);gl.drawArrays(gl.POINTS,0,far.count);
          gl.bindVertexArray(near.vao);gl.drawArrays(gl.POINTS,0,near.count);
        }
        gl.disable(gl.BLEND);gl.bindVertexArray(null);
        stats={stars:far.count+near.count,draws:1+branches*2,width:w,height:h};return true;
      },
      stats:()=>Object.freeze({...stats,lost,disposed}),
      dispose(){if(disposed)return;disposed=true;canvas.removeEventListener?.('webglcontextlost',onLost);canvas.removeEventListener?.('webglcontextrestored',onRestored);cleanup();}
    });
  }catch(error){cleanup();throw new Error('KORRIDOT Raumflug: '+error.message);}
}
