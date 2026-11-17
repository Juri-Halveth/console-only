const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const source=process.env.D8_SOURCE_DIR||path.resolve(__dirname,'../src');
require(path.join(source,'doppelacht-source.js'));
const D=require(path.join(source,'doppelacht.js'));
const measurements={};
const norm=a=>Math.hypot(...a);
const difference=(a,b)=>a.map((v,i)=>v-b[i]);
const rms=(a,b)=>Math.sqrt(a.reduce((sum,p,i)=>sum+(p.x-b[i].x)**2+(p.y-b[i].y)**2+(p.z-b[i].z)**2,0)/a.length);
const same=(a,b)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));

test('export identifies the actual solver bytes',()=>{
  assert.equal(globalThis.HALVETH_D8_SOURCE,crypto.createHash('sha256').update(fs.readFileSync(path.join(source,'doppelacht.js'))).digest('hex'));
});
test('pair potential, force, torque, finite overlap, and nematic sign symmetry',()=>{
  const c={...D.defaults,count:2}, calc=D.dynamics(c);
  const s={r:new Float64Array([.11,.09,.03,0,0,0]),n:new Float64Array([1,0,0,.6,.8,0])};
  const energy=()=>calc(s).energy, eps=1e-6;
  const result=calc(s), force=Array.from(result.force), torque=Array.from(result.torque);
  const errors=[];
  for(let k=0;k<3;k++){
    assert.ok(Math.abs(force[k]+force[3+k])<1e-11 && Math.abs(torque[k]+torque[3+k])<1e-11);
    s.r[k]+=eps;const plus=energy();s.r[k]-=2*eps;const minus=energy();s.r[k]+=eps;
    errors.push(Math.abs(force[k]+(plus-minus)/(2*eps)));
  }
  s.n[0]=Math.cos(eps);s.n[1]=Math.sin(eps);const plus=energy();
  s.n[1]=-Math.sin(eps);const minus=energy();errors.push(Math.abs(torque[2]+(plus-minus)/(2*eps)));
  assert.ok(Math.max(...errors)<1e-7);
  s.n[0]=1;s.n[1]=0;const base=energy();s.n[0]=-1;assert.equal(energy(),base);
  s.r.fill(0);const overlap=calc(s);assert.ok(Number.isFinite(overlap.energy));assert.ok([...overlap.force].every(x=>x===0));
  measurements.pairGradientMaxError=Math.max(...errors);
});
test('sparse pair search matches brute force and is independent of bin width',()=>{
  const c=D.configuration({count:64}),s=D.seedMaterial(c), result=D.dynamics(c)(s);
  const f=new Float64Array(s.r.length),t=f.slice();let e=0;
  for(let i=0;i<c.count;i++)for(let j=i+1;j<c.count;j++){
    const si={r:Float64Array.from([...s.r.slice(3*i,3*i+3),...s.r.slice(3*j,3*j+3)]),n:Float64Array.from([...s.n.slice(3*i,3*i+3),...s.n.slice(3*j,3*j+3)])};
    const pair=D.dynamics({...c,count:2})(si);e+=pair.energy;
    for(let k=0;k<3;k++){f[3*i+k]+=pair.force[k];f[3*j+k]+=pair.force[3+k];t[3*i+k]+=pair.torque[k];t[3*j+k]+=pair.torque[3+k];}
  }
  assert.deepEqual(result.force,f);assert.deepEqual(result.torque,t);assert.equal(result.energy,e);
  const a=D.create(),b=D.create({binWidth:D.defaults.binWidth/2});a.step(.5);b.step(.5);
  same(a.frame(),b.frame());measurements.binWidth=[D.defaults.binWidth,D.defaults.binWidth/2];
});
test('coupling changes actual positions at fixed initial conditions',()=>{
  const a=D.create(),b=D.create({coupling:0});same(a.frame(),b.frame());assert.ok(a.diagnostics().crossPairs>0);
  a.step(2);b.step(2);const value=rms(a.frame().materialCells,b.frame().materialCells);
  assert.ok(value>1e-5);measurements.rmsCrossCouplingAt2=value;
});
test('momentum, angular momentum, energy, heat and unit directors',()=>{
  measurements.balance=[];
  for(const damping of [0,.12]){
    const a=D.create({damping}),initial=a.diagnostics();let error=0,dp=0,dL=0;
    for(let i=0;i<240;i++){
      a.step(1/120);const m=a.diagnostics();
      error=Math.max(error,Math.abs(m.residual)/initial.kineticEnergy);
      dp=Math.max(dp,norm(difference(m.linearMomentum,initial.linearMomentum)));
      dL=Math.max(dL,norm(difference(m.angularMomentum,initial.angularMomentum)));
    }
    const d=a.diagnostics(),maxUnitError=Math.max(...a.frame().materialCells.map(q=>Math.abs(Math.hypot(q.nx,q.ny,q.nz)-1)));
    assert.ok(error<.002);assert.ok(maxUnitError<1e-10);assert.equal(d.totalMass,960);
    if(damping===0){assert.ok(dp<1e-8&&dL<1e-8);assert.equal(d.heat,0);}else assert.ok(d.heat>0);
    measurements.balance.push({damping,maxRelativeBalanceResidual:error,maxDeltaP:dp,maxDeltaL:dL,heat:d.heat,maxUnitError});
  }
});
test('time refinement, deterministic continuation, and rejected altered packet',()=>{
  const states=[120,240,480].map(rate=>{const m=D.create({h:1/rate});m.step(.5);return m.frame().materialCells;});
  const errors=[rms(states[0],states[2]),rms(states[1],states[2])];assert.ok(errors[0]>errors[1]&&errors[1]>0);measurements.refinementRMS=errors;
  const a=D.create(),b=D.create();a.step(.508);const saved=JSON.parse(JSON.stringify(a.snapshot()));b.restore(saved);same(a.snapshot(),b.snapshot());
  a.step(.18);b.step(.18);same(a.snapshot(),b.snapshot());const before=b.snapshot();saved.materialCells[7].z+=.01;
  assert.throws(()=>b.restore(saved));same(b.snapshot(),before);
});
test('async restore yields, retains exact continuation and rejects altered packets atomically',async()=>{
  const live=D.create({count:32,layout:'shell'});live.step(12.003);
  const saved=structuredClone(live.snapshot()),copy=D.create(saved.configuration),before=copy.snapshot();
  let timerTurns=0,progress=[];
  const timer=setInterval(()=>timerTurns++,0);
  try{
    await copy.restoreAsync(saved,{onProgress:p=>{
      progress.push(p);same(copy.snapshot(),before);
    }});
  }finally{clearInterval(timer);}
  assert.ok(timerTurns>1,'ordinary timers must execute during seed verification');
  assert.equal(progress[0].tick,0);assert.equal(progress.at(-1).tick,saved.tick);
  same(copy.snapshot(),saved);live.step(.18);copy.step(.18);same(copy.snapshot(),live.snapshot());
  const invalid=structuredClone(saved);invalid.materialCells[0].x+=.1;
  const retained=copy.snapshot();await assert.rejects(copy.restoreAsync(invalid),/replay differs/);same(copy.snapshot(),retained);
});
test('async restore can be cancelled without installing a partial state',async()=>{
  const live=D.create({count:16});live.step(8);
  const copy=D.create({count:16}),before=copy.snapshot(),controller=new AbortController();
  await assert.rejects(copy.restoreAsync(live.snapshot(),{signal:controller.signal,onProgress:p=>{
    if(p.tick>=120)controller.abort();
  }}),{name:'AbortError'});
  same(copy.snapshot(),before);
});
test('async verification owns its input and accepts the unchanged predecessor equations',async()=>{
  const live=D.create({count:16,layout:'shell'});live.step(2.001);
  const saved=live.snapshot(),expected=structuredClone(saved),copy=D.create(saved.configuration);
  const restoring=copy.restoreAsync(saved);
  saved.materialCells[0].x+=100;
  await restoring;same(copy.snapshot(),expected);
  expected.source='b67b0a71998812de55bdb2b068275b5835959f9fff4f597ca601471a1ff44e85';
  await copy.restoreAsync(expected);
  same(copy.snapshot(),live.snapshot());
});
test('free evolution measured against the initial finite tubes',()=>{
  const m=D.create(),curve=Array.from({length:4096},(_,i)=>{const s=i*2*Math.PI/4096;return [4.2*Math.sin(s),1.8*Math.sin(2*s)];});
  measurements.shape=[];
  let prior=0;
  for(const time of [0,.5,2,5,10,20]){
    m.step(time-prior);prior=time;
    const groups=[{inside:0,normal2:0},{inside:0,normal2:0}];
    for(const p of m.frame().materialCells){
      assert.ok(Object.values(p).every(x=>typeof x!=='number'||Number.isFinite(x)));
      const g=groups[p.family],u=p.family?p.y:p.x,v=p.family?p.z:p.y,normal=p.family?p.x:p.z;
      g.normal2+=normal*normal;
      if(Math.abs(normal)>.35)continue;
      if(curve.some(([a,b])=>(a-u)**2+(b-v)**2+normal**2<=.35**2))g.inside++;
    }
    measurements.shape.push({time,cellCount:960,crossPairs:m.diagnostics().crossPairs,
      families:groups.map(g=>({cellsInInitialTube:g.inside,fraction:g.inside/480,rmsOutOfInitialPlane:Math.sqrt(g.normal2/480)}))});
  }
  assert.ok(measurements.shape[0].families.every(g=>g.fraction===1));
});
after(()=>{if(process.env.D8_MEASUREMENTS)fs.writeFileSync(process.env.D8_MEASUREMENTS,JSON.stringify(measurements,null,2));});

test('shell starts at twelve antipodal sites of equal radius and evolves freely',()=>{
  const simulation=D.create({layout:'shell'}),initial=simulation.snapshot();
  const centres=Array.from({length:12},()=>[0,0,0]),counts=Array(12).fill(0);
  initial.materialCells.forEach((cell,i)=>{
    const site=(i%480)%12;counts[site]++;
    for(const [k,axis] of ['x','y','z'].entries())centres[site][k]+=cell[axis]/80;
    assert.ok(Math.abs(Math.hypot(cell.nx,cell.ny,cell.nz)-1)<1e-12);
  });
  assert.deepEqual(counts,Array(12).fill(80));
  for(const [i,c] of centres.entries()){
    assert.ok(Math.abs(Math.hypot(...c)-3.8)<1e-11);
    assert.ok(c.every((v,k)=>Math.abs(v-D.shellDirections[i][k]*D.shellRadius)<1e-11));
    assert.ok(centres.some(other=>c.every((v,k)=>Math.abs(v+other[k])<1e-11)));
  }
  simulation.step(.5);const frame=simulation.snapshot();
  assert.ok(frame.materialCells.every((p,i)=>p.id===initial.materialCells[i].id));
  assert.ok(frame.materialCells.every((p,i)=>Math.hypot(p.x-initial.materialCells[i].x,p.y-initial.materialCells[i].y,p.z-initial.materialCells[i].z)>1e-5));
  const restored=D.create(frame.configuration);restored.restore(frame);same(restored.snapshot(),frame);
  assert.throws(()=>D.create({layout:'other'}));assert.throws(()=>D.create({}).restore(frame));
});
test('optical distance changes perspective while preserving the source model',()=>{
  const V=require(path.join(source,'doppelacht-view.js')),s=D.create({layout:'shell'}),before=s.snapshot();
  const u={yaw:0,pitch:0},flight=V.approach();flight.begin(u,{layout:'shell'});
  const at=d=>V.projector({...u,distance:d},900,600);
  const a={x:1,y:1,z:2},b={x:1,y:1,z:-2};const zoom=at(V.overviewDistance);
  assert.ok(zoom(b).x>zoom(a).x);assert.equal(u.distance,6400);
  flight.update(u,.8);assert.equal(u.distance,6400);flight.update(u,6);assert.equal(u.distance,V.overviewDistance);
  assert.ok(at(.12)({x:0,y:0,z:-1})===null);
  flight.begin(u,{});assert.equal(u.distance,undefined);same(s.snapshot(),before);
});
