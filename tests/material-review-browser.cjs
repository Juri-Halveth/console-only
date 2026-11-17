/* Source-bound review regressions. Synthetic, loopback-only browser fixtures. */
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'..'),OUT=path.resolve(process.env.HALVETH_TEST_OUTPUT||path.join(ROOT,'evidence/review'));fs.mkdirSync(OUT,{recursive:true});
const pw=require(process.env.HALVETH_PLAYWRIGHT||'playwright'),label=process.env.REVIEW_LABEL||'current';
const rootConsole=path.resolve(process.env.HALVETH_CONSOLE_ROOT||ROOT),rootWeb='';
const consoleHook=`globalThis.__review={tick:simulationTick,frame:animate,payload:simulationPayload,recordState:()=>recorder?.state||'none',capture:captureRecordingFrame,ready:()=>!!cosmosModule&&!!spaceOptics,
 cpuSample:(position,q)=>{const saved={view,quality,spaceOptics,fallbackLocal};const points=[];try{view={...camera(),...position,yaw:0,pitch:0,roll:0};quality=q;opticalState=spaceOptics.createOpticsState({beta:0,lensRadius:0});const actual=spaceOptics;spaceOptics={...actual,projectPointImages:(p,c,w,h,l,o,options)=>{const images=actual.projectPointImages(p,c,w,h,l,o,options);if(options.far===380&&images.some(v=>v.x>=0&&v.x<=w&&v.y>=0&&v.y<=h&&v.distance<300))points.push({...p});return images;}};drawStars();return points;}finally{view=saved.view;quality=saved.quality;spaceOptics=saved.spaceOptics;fallbackLocal=saved.fallbackLocal;}},
 compose:position=>{const saved={view,opticalState};try{view={...camera(),...position};opticalState=spaceOptics.createOpticsState({beta:0,lensRadius:0});const bendAt=bend(DARK_WORLD.z),body={x:bendAt.x+DARK_WORLD.offsetX,y:bendAt.y+DARK_WORLD.offsetY,z:DARK_WORLD.z},planet=project(body),radius=clamp(planet.scale*DARK_WORLD.radius,4,110);ctx.setTransform(resolution,0,0,resolution,0,0);ctx.fillStyle='#010205';ctx.fillRect(0,0,width,height);drawSimulation();const raw=ctx.getImageData(0,0,canvas.width,canvas.height),candidates=materialObservations.filter(p=>Math.hypot(p.x-planet.x,p.y-planet.y)<radius-4),pixels=[];
 for(const c of candidates){let best=null;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=Math.round((c.x+dx)*resolution),y=Math.round((c.y+dy)*resolution),i=(y*raw.width+x)*4,m=Math.max(raw.data[i],raw.data[i+1],raw.data[i+2]);if(!best||m>best.m)best={x,y,m};}if(best.m>100)pixels.push({id:c.id,...best});}
 ctx.fillStyle='#010205';ctx.fillRect(0,0,width,height);if(typeof drawSimulationWithPlanet==='function')drawSimulationWithPlanet();else{drawSimulation();drawDarkWorld();}const result=ctx.getImageData(0,0,canvas.width,canvas.height);return{planet:{x:planet.x,y:planet.y,depth:planet.depth,radius},cells:pixels.length,visible:pixels.filter(p=>{const i=(p.y*result.width+p.x)*4;return Math.max(result.data[i],result.data[i+1],result.data[i+2])>80;}).length,ids:pixels.map(p=>p.id)};}finally{view=saved.view;opticalState=saved.opticalState;drawScene();}}
};`;
const studioHook=`globalThis.__reviewStudio={camera:x=>Object.assign(camera,x)};`;
function firstDifference(a,b,at='$'){
 if(Object.is(a,b))return null;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return{path:at,left:a,right:b};
 const keys=new Set([...Object.keys(a),...Object.keys(b)]);
 for(const key of keys){const difference=firstDifference(a[key],b[key],at+'.'+key);if(difference)return difference;}
 return null;
}
function serve(req,res){let rel=decodeURIComponent(req.url.split('?')[0]),root,local;if(rel==='/state'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({garden:[],runs:[],jobs:[],gardenHead:'fixture',runHead:'fixture',jobHead:'fixture'}));}if(rel.startsWith('/console/')){root=path.join(rootConsole,'docs');local=rel.slice('/console'.length);}else if(rel.startsWith('/web/')){root=rootWeb;local=rel.slice('/web'.length);}else{res.writeHead(404);return res.end();}const f=path.resolve(root,'.'+local);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}let data=fs.readFileSync(f);if(f.endsWith('preview.js'))data=Buffer.from(data.toString().replace('window.__korridotProbe=Object.freeze({',consoleHook+'window.__korridotProbe=Object.freeze({'));if(f.endsWith(path.sep+'studio.js'))data=Buffer.from(data.toString().replace('})();',studioHook+'})();'));res.setHeader('Content-Type',f.endsWith('.js')||f.endsWith('.mjs')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html;charset=utf-8');res.end(data);}
async function main(){const result={label,scope:'reported Console integration cases, synthetic loopback fixtures; no remote code execution or product stores',checks:[]},server=http.createServer(serve);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;let browser;
 try{browser=await pw.chromium.launch({headless:true,...(process.env.HALVETH_BROWSER?{executablePath:process.env.HALVETH_BROWSER}:{})});}catch(error){server.close();throw error;}result.browser=browser.version();
 async function page(kind,reduced='reduce'){const p=await browser.newPage({viewport:{width:1050,height:800},reducedMotion:reduced,acceptDownloads:true});await p.addInitScript(()=>{requestAnimationFrame=()=>0;});await p.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());p.on('download',d=>{void d.cancel().catch(()=>{});});p.on('pageerror',e=>console.log('PAGE_ERROR '+e.message));await p.goto(origin+(kind==='console'?'/console/index.html':kind==='studio'?'/web/studio/index.html':'/web/forschung.html'));try{await p.waitForFunction(kind=>kind==='console'?globalThis.__review?.ready()&&globalThis.__korridotProbe?.simulation().state?.materialCells?.length===960:globalThis.HALVETHScenes?.length,kind,{timeout:5000,polling:50});}catch(e){console.log('READY_DIAGNOSTIC '+JSON.stringify(await p.evaluate(()=>({review:typeof __review,probe:typeof __korridotProbe,scripts:[...document.scripts].map(s=>new URL(s.src).origin+new URL(s.src).pathname),model:globalThis.__korridotProbe?.simulation()?.mode,ready:globalThis.__review?.ready(),status:document.querySelector('#watchStatus')?.textContent}))));throw e;}return p;}
 async function check(id,fn){if(process.env.REVIEW_CASE&&!id.includes(process.env.REVIEW_CASE))return;try{const metrics=await fn();result.checks.push({id,status:metrics.ok?'PASS':'FAIL',metrics});console.log(`${metrics.ok?'PASS':'FAIL'} ${id}`);}catch(e){result.checks.push({id,status:'ERROR',error:e.stack});console.log('ERROR '+id+' '+e.message);}}
 try{
 await check('C-IMPORT-01',async()=>{const p=await page('console');try{const before=await p.evaluate(()=>JSON.stringify(__korridotProbe.simulation().state));await p.locator('#simulationImportFile').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{bad')});await p.waitForFunction(()=>document.querySelector('#watchStatus').textContent.includes('Import'),null,{polling:50,timeout:5000});const retained=await p.evaluate(()=>JSON.stringify(__korridotProbe.simulation().state)),tick=await p.evaluate(()=>__korridotProbe.simulation().state.tick);await p.locator('#watchPause').dispatchEvent('click');await p.evaluate(()=>{__review.tick(1000);__review.tick(1100);});const after=await p.evaluate(()=>__korridotProbe.simulation());return{ok:before===retained&&after.playing&&after.state.tick>tick,retained:before===retained,playing:after.playing,tickBefore:tick,tickAfter:after.state.tick};}finally{await p.close();}});
 await check('C-REC-01',async()=>{const p=await page('console','no-preference');try{await p.locator('#watchRecord').dispatchEvent('click');await p.waitForTimeout(100);await p.locator('#watchPause').dispatchEvent('click');const paused=await p.evaluate(()=>__review.recordState());await p.locator('#watchReset').dispatchEvent('click');const after=await p.evaluate(()=>({playing:__korridotProbe.simulation().playing,record:__review.recordState()}));await p.locator('#watchRecord').dispatchEvent('click');return{ok:paused==='paused'&&after.playing&&after.record==='recording',paused,...after};}finally{await p.close();}});
 await check('C-PENDING-01',async()=>{const p=await page('console');try{const doc=await p.evaluate(()=>{for(const[id,value]of[['materialDrive','.35'],['materialCoupling','.004']]){const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('change'));}return __review.payload();});await p.locator('#watchPause').dispatchEvent('click');const original=await p.evaluate(()=>{__review.tick(1000);__review.tick(1100);return JSON.stringify(__korridotProbe.simulation().state.rawEngine);});await p.locator('#simulationImportFile').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await p.waitForFunction(()=>!__korridotProbe.simulation().playing&&__korridotProbe.simulation().state.tick===0,null,{polling:50,timeout:5000});await p.locator('#watchPause').dispatchEvent('click');const restored=await p.evaluate(()=>{__review.tick(2000);__review.tick(2100);return{raw:JSON.stringify(__korridotProbe.simulation().state.rawEngine),drive:document.getElementById('materialDrive').value,coupling:document.getElementById('materialCoupling').value};});return{ok:original===restored.raw,exportedPending:doc.pendingMaterialInputs||null,restoredControls:{drive:restored.drive,coupling:restored.coupling},trajectoriesEqual:original===restored.raw};}finally{await p.close();}});
 await check('C-PENDING-RANGE',async()=>{
  const p=await page('console');
  try{return await p.evaluate(()=>{
    const initial=__review.payload();
    for(const [id,bad] of [['materialDrive','2'],['materialCoupling','-.1']]){
      const input=document.getElementById(id);input.value=bad;input.dispatchEvent(new Event('change'));
    }
    const pending=__review.payload().pendingMaterialInputs;
    document.getElementById('watchPause').click();__review.tick(1000);__review.tick(1100);
    return {ok:JSON.stringify(initial.pendingMaterialInputs)===JSON.stringify(pending)&&__review.payload().model.tick>initial.model.tick,pending};
  });}finally{await p.close();}
 });
 await check('C-SAVED-CAMERA',async()=>{
  const p=await page('console');
  try{
   const doc=await p.evaluate(()=>__review.payload());
   Object.assign(doc.observation,{camera:{x:2,y:3,z:40,yaw:.15,pitch:.05,roll:0},lens:1.4});
   await p.locator('#simulationImportFile').setInputFiles({name:'state.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
   await p.waitForFunction(()=>!document.getElementById('simulationImportFile').value,null,{polling:50});
   const actual=await p.evaluate(()=>__review.payload());
   return {ok:JSON.stringify(doc.observation.camera)===JSON.stringify(actual.observation.camera)&&doc.observation.lens===actual.observation.lens&&
    JSON.stringify(doc.model)===JSON.stringify(actual.model),pose:actual.observation.camera,lens:actual.observation.lens};
  }finally{await p.close();}
 });
 await check('C-D8-FOLLOW-IMPORT',async()=>{
  const p=await page('console');
  try{
   const saved=await p.evaluate(()=>{
    const select=document.getElementById('simulationMode');select.value='doppelacht';select.dispatchEvent(new Event('change'));
    const follow=document.querySelector('[data-d8-follow]');follow.checked=true;follow.dispatchEvent(new Event('change'));
    return __review.payload();
   });
   await p.evaluate(()=>{document.getElementById('watchPause').click();__review.tick(1000);__review.tick(13000);__korridotProbe.redraw();});
   const moved=await p.evaluate(()=>__review.payload());
   assert.notDeepEqual(moved.observation.camera,saved.observation.camera);
   await p.locator('#simulationImportFile').setInputFiles({name:'follow.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
   await p.waitForFunction(()=>!document.getElementById('simulationImportFile').value,null,{polling:20});
   const restored=await p.evaluate(()=>{__korridotProbe.redraw();return __review.payload();});
   return {ok:JSON.stringify(restored.observation.camera)===JSON.stringify(saved.observation.camera)&&restored.observation.view.followId===saved.observation.view.followId&&!restored.clock.playing&&restored.model.tick===saved.model.tick,
    savedCamera:saved.observation.camera,restoredCamera:restored.observation.camera,followId:restored.observation.view.followId};
  }finally{await p.close();}
 });
 await check('C-D8-VIEW-KEYS',async()=>{
  const p=await page('console');
  try{
   const before=await p.evaluate(()=>{
    const select=document.getElementById('simulationMode');select.value='doppelacht';select.dispatchEvent(new Event('change'));
    return __review.payload().observation.view.distance;
   });
   await p.locator('#world').focus();await p.keyboard.down('f');
   const focused=await p.evaluate(()=>{__review.frame(1000);return __review.payload().observation.view.distance;});
   await p.keyboard.up('f');await p.keyboard.down('w');
   const flying=await p.evaluate(()=>{__review.frame(1016);return __review.payload().observation.view.distance;});
   await p.keyboard.up('w');
   return {ok:Number.isFinite(before)&&focused===before&&flying===undefined,before,focused,navigationExited:flying===undefined};
  }finally{await p.close();}
 });
 await check('C-D8-ASYNC-IMPORT',async()=>{
  require(path.join(rootConsole,'src/doppelacht-source.js'));
  const model=require(path.join(rootConsole,'src/doppelacht.js')).create({layout:'shell'});
  for(let i=0;i<15;i++)model.step(60);
  const nodeSaved=model.snapshot(),p=await page('console');
  let start=Date.now(),crossRuntimeDifference=null;
  try{
   // A browser JSON round trip starts with a checkpoint produced by that browser.
   // Math transcendental implementations can differ between Node and Chromium;
   // record that comparison instead of silently relaxing the solver's exact check.
   const generated=await p.evaluate(()=>{
    const start=performance.now(),model=HALVETHDoubleEight.create({layout:'shell'});
    for(let i=0;i<15;i++)model.step(60);
    return{saved:model.snapshot(),elapsedMs:performance.now()-start};
   });
   const saved=generated.saved;crossRuntimeDifference=firstDifference(nodeSaved,saved);
   console.log('D8_CHECKPOINT_RUNTIME_COMPARISON '+JSON.stringify({nodeBrowserFirstDifference:crossRuntimeDifference,browserGenerationMs:generated.elapsedMs}));
   start=Date.now();
   await p.evaluate(()=>{
    globalThis.__importHeartbeat=0;globalThis.__importDraws=[];
    // RAF is intentionally disabled by this deterministic fixture. A heartbeat
    // must measure event-loop availability, not force a full software-GPU render
    // every16ms for the entire seed replay. Sample three explicit redraws instead.
    globalThis.__importTimer=setInterval(()=>{
     __importHeartbeat++;
     if(__importDraws.length<3&&document.getElementById('watchStatus').textContent.includes('wird geprüft')){
      const before=performance.now();__korridotProbe.redraw();__importDraws.push(performance.now()-before);
     }
    },16);
   });
   await p.locator('#simulationImportFile').setInputFiles({name:'900-seconds.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
   await p.waitForFunction(()=>document.getElementById('watchStatus').textContent.includes('wird geprüft'),null,{polling:20});
   const during=await p.evaluate(()=>({heartbeat:__importHeartbeat,status:document.getElementById('watchStatus').textContent,mode:__review.payload().mode}));
   const interactionStart=Date.now();await p.locator('#workshopToggle').dispatchEvent('click');
   const interactionMs=Date.now()-interactionStart,opened=await p.locator('#workshopToggle').getAttribute('aria-expanded');
   await p.waitForFunction(()=>!document.getElementById('simulationImportFile').value,null,{polling:20,timeout:90000});
   const after=await p.evaluate(()=>{clearInterval(__importTimer);return{heartbeat:__importHeartbeat,redrawMs:__importDraws,payload:__review.payload(),status:document.getElementById('watchStatus').textContent};});
   const conditions={retainedDuring: during.mode==='material',heartbeat:after.heartbeat>during.heartbeat+5,redraws:after.redrawMs.length===3,
    workshopOpened:opened==='true',responsiveClick:interactionMs<2000,restoredTick:after.payload.model.tick===saved.tick,exact:JSON.stringify(after.payload.model)===JSON.stringify(saved)};
   const metrics={ok:Object.values(conditions).every(Boolean),conditions,
    replayTicks:saved.tick,actualTick:after.payload.model.tick,elapsedMs:Date.now()-start,interactionMs,heartbeatDuring:during.heartbeat,heartbeatAfter:after.heartbeat,redrawMs:after.redrawMs,
    progress:during.status,finalStatus:after.status,nodeBrowserFirstDifference:crossRuntimeDifference,importFirstDifference:firstDifference(saved,after.payload.model)};
   console.log('D8_IMPORT_RESULT '+JSON.stringify(metrics));return metrics;
  }catch(error){
   const diagnostic=await p.evaluate(()=>({heartbeat:globalThis.__importHeartbeat,redrawMs:globalThis.__importDraws,
    status:document.getElementById('watchStatus').textContent,inputPending:!!document.getElementById('simulationImportFile').value,
    modelMode:__korridotProbe.simulation().mode,tick:__korridotProbe.simulation().state?.tick})).catch(e=>({unavailable:e.message}));
   throw Error(error.message+'; import diagnostic '+JSON.stringify({elapsedMs:Date.now()-start,nodeBrowserFirstDifference:crossRuntimeDifference,...diagnostic}));
  }finally{await p.close();}
 });
 await check('C-D8-IMPORT-CANCEL',async()=>{
  const p=await page('console');
  try{
   const saved=await p.evaluate(()=>{const model=HALVETHDoubleEight.create({count:64,layout:'shell'});model.step(30);return model.snapshot();});
   const file={name:'cancelled.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))};
   await p.locator('#simulationImportFile').setInputFiles(file);
   await p.waitForFunction(()=>document.getElementById('watchStatus').textContent.includes('wird geprüft'),null,{polling:10});
   await p.locator('#watchReset').dispatchEvent('click');
   await p.waitForTimeout(100);
   const reset=await p.evaluate(()=>({mode:__review.payload().mode,empty:!document.getElementById('simulationImportFile').value,status:document.getElementById('watchStatus').textContent}));
   // The same filename must be selectable after cancellation.
   await p.locator('#simulationImportFile').setInputFiles(file);
   await p.waitForFunction(()=>document.getElementById('watchStatus').textContent.includes('wird geprüft'),null,{polling:10});
   const fresh=await p.evaluate(()=>HALVETHDoubleEight.create({count:16}).snapshot());
   await p.locator('#simulationImportFile').setInputFiles({name:'newer.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fresh))});
   await p.waitForFunction(()=>!document.getElementById('simulationImportFile').value,null,{polling:10});
   await p.waitForTimeout(100);
   const latest=await p.evaluate(()=>__review.payload());
   return {ok:reset.mode==='material'&&reset.empty&&!reset.status.includes('wird geprüft')&&latest.mode==='doppelacht'&&latest.model.configuration.count===16&&latest.model.tick===0,reset,latestCount:latest.model.configuration.count};
  }finally{await p.close();}
 });
 await check('C-STARS-01',async()=>{const p=await page('console');try{const cases=await p.evaluate(()=>{const out=[];for(const axis of['x','y','z'])for(const q of[1,.5]){const first={x:0,y:0,z:42,[axis]:95.999},last={...first,[axis]:96.001},a=__review.cpuSample(first,q),b=__review.cpuSample(last,q),retained=a.filter(p=>b.some(v=>Math.hypot(p.x-v.x,p.y-v.y,p.z-v.z)<.001));out.push({axis,quality:q,before:a.length,after:b.length,retained:retained.length});}return out;});return{ok:cases.every(c=>c.before>5&&c.retained>=c.before-1),cases};}finally{await p.close();}});
 await check('C-DEPTH-01',async()=>{const p=await page('console');try{const data=await p.evaluate(()=>({front:__review.compose({x:0,y:0,z:42,yaw:0,pitch:0,roll:0}),rear:__review.compose({x:12,y:6,z:165,yaw:Math.PI,pitch:0,roll:0})}));return{ok:data.front.cells>5&&data.front.visible===data.front.cells&&data.rear.cells>0&&data.rear.visible===0,...data};}finally{await p.close();}});
 }finally{await browser.close();server.close();}
 fs.writeFileSync(path.join(OUT,`PROBES_${label}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify({label,passed:result.checks.filter(x=>x.status==='PASS').length,failed:result.checks.filter(x=>x.status==='FAIL').length,errors:result.checks.filter(x=>x.status==='ERROR').length},null,2));if(result.checks.some(x=>x.status!=='PASS'))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=2;});
