(() => {
  'use strict';
  // KORRIDOT: a single projected 3D scene. All geometry, membranes and receipts
  // inhabit the same XYZ frame. T is the ORDER of recorded receipts, not invented data.
  const fundingRail=!!window.location?.search&&new URLSearchParams(window.location.search).get('spur')==='gg24';
  const canvas = document.getElementById('world');
  // KORRIDOT_SPACEFLIGHT_V1 — shared optics, open star volume, free camera.
  const ctx = canvas.getContext('2d', { alpha: true });
  const cosmosCanvas = document.getElementById('cosmos');
  const cosmosToggle = document.getElementById('cosmosToggle');
  const evidenceToggle = document.getElementById('evidenceToggle');
  const focusToggle = document.getElementById('focusToggle');
  let cosmosRenderer = null, cosmosModule = null, spaceOptics = null;
  let horizonSpace=null, interior=null;
  let cosmosEnabled = true, cosmosError = '', evidenceVisible = false;
  let opticalBeta = 0, opticalState = {beta:0,axis:[0,0,1]};
  let shipVZ = 0, fallbackFar = null, fallbackLocal = null;
  let rendererGeneration = 0;
  function updateCosmosButton() {
    if (cosmosToggle) {
      const ready=!!cosmosRenderer&&!cosmosRenderer.stats?.().lost;
      cosmosToggle.textContent = ready && cosmosEnabled ? 'Raum: GPU' : 'Raum: CPU';
      cosmosToggle.title = cosmosError || 'Darstellung zwischen GPU und CPU umschalten';
      cosmosToggle.setAttribute('aria-pressed',String(ready && cosmosEnabled));
    }
    if (evidenceToggle) {
      evidenceToggle.textContent = evidenceVisible ? 'Belege AN · V' : 'Belege AUS · V';
      evidenceToggle.setAttribute('aria-pressed',String(evidenceVisible));
    }
  }
  function showEvidence(value) {
    evidenceVisible=!!value;updateCosmosButton();
  }
  async function bootSpaceRenderer() {
    const generation=++rendererGeneration;
    try {
      spaceOptics=await import('./space_optics.mjs');
      horizonSpace=await import('./horizon_space.mjs');
      const module=await import('./cosmos_renderer.mjs');
      if(generation!==rendererGeneration)return;
      cosmosModule=module;
      if(cosmosRenderer)cosmosRenderer.dispose();
      cosmosRenderer=null;
      cosmosRenderer=cosmosCanvas?module.createCosmosRenderer(cosmosCanvas):null;
      cosmosError=cosmosRenderer?'':'WebGL2 fehlt; Sternraum auf CPU aktiv';
    }catch(error){cosmosError='Raumansicht: '+error.message;console.warn(cosmosError);}
    updateCosmosButton();redraw();
  }
  if(cosmosToggle)cosmosToggle.onclick=()=>{cosmosEnabled=!cosmosEnabled;updateCosmosButton();redraw();};
  if(evidenceToggle)evidenceToggle.onclick=()=>{showEvidence(!evidenceVisible);redraw();};
  if(focusToggle)focusToggle.onclick=()=>{
    const active=document.body?.classList.toggle('flight-focus');
    focusToggle.textContent=active?'Cockpit · F':'Großansicht · F';
    focusToggle.setAttribute('aria-pressed',String(!!active));redraw();canvas.focus({preventScroll:true});
  };
  cosmosCanvas?.addEventListener?.('webglcontextlost',()=>{cosmosError='Grafik neu verbinden; CPU-Raum aktiv';updateCosmosButton();});
  cosmosCanvas?.addEventListener?.('webglcontextrestored',()=>{bootSpaceRenderer();});
  updateCosmosButton();bootSpaceRenderer();
  const detail = document.getElementById('detail');
  const timeline = document.getElementById('timeline');
  const slider = document.getElementById('timeSlider');
  const timeLabel = document.getElementById('timeLabel');
  const connection = document.getElementById('connection');
  const follow = document.getElementById('follow');
  const flightStatus = document.getElementById('flightStatus');
  const motionToggle = document.getElementById('motionToggle');
  const heads = document.getElementById('heads');
  const coords = document.getElementById('coords');
  // KORRIDOT_HYPERSPEED_V1: view-only speed controls. No Garden events or source timestamps modified.
  const speedCycleButton = document.getElementById('speedCycle');
  const warpRampButton = document.getElementById('warpRamp');
  const speedLevels = Object.freeze([1,2,4,8]);
  let speedIndex = 0;
  let warpRampEnabled = true;
  let cruiseAge = 0;
  let observerAge = 0;
  let currentRamp = 1;
  function rampAt(seconds) { return Math.min(4,1+Math.max(0,seconds-1)*0.12); }
  function updateSpeedControls() {
    speedCycleButton.textContent='⚡ Tempo ×'+speedLevels[speedIndex];
    speedCycleButton.title='Wiedergabe- und Flugtempo: ×1, ×2, ×4, ×8';
    warpRampButton.textContent=warpRampEnabled?'🚀 WARP AN':'🚀 WARP AUS';
    warpRampButton.setAttribute('aria-pressed',String(warpRampEnabled));
    warpRampButton.title='Sanfte Beschleunigung beim anhaltenden freien Flug, maximal zusätzlich ×4';
  }
  speedCycleButton.onclick=()=>{speedIndex=(speedIndex+1)%speedLevels.length;updateSpeedControls();redraw();};
  warpRampButton.onclick=()=>{warpRampEnabled=!warpRampEnabled;cruiseAge=observerAge=0;currentRamp=1;updateSpeedControls();redraw();};
  updateSpeedControls();

  // BTC_TIMEFLIGHT_V1. A separate temporal lane inside the SAME KORRIDOT scene.
  // BTC block time and Garden receipt time remain separate values.
  const btcFlyButton = document.getElementById('btcTimeFlight');
  let btcModel = null;
  let btcBlocks = [];
  let btcRailStatus = 'BTC-Leseansicht wird geladen';
  let btcPlayable = false;
  const btcFlight = {active:false, playing:false, elapsed:0, duration:20,
    orbitYaw:0, orbitPitch:.23, orbitDistance:24, sourceTimeMs:null,
    from:null, to:null};
  if (window.location.hostname === '127.0.0.1') {
    import('./btc_time_rail.mjs').then(module => {
      btcModel = module;
      rebuildBitcoinRail();
      redraw();
    }).catch(error => {
      btcRailStatus = 'BTC-Zeitmodul nicht geladen: ' + error.message;
      console.warn(btcRailStatus);
    });
  }

  // The new scene graph uses a separate synthetic model time, never the evidence time T.
  let dnaModule = null;
  let dnaScene = null;
  let dnaModelTime = 0;
  if (window.location.hostname === '127.0.0.1') {
    import('./openspace_dna.mjs').then(module => {
      dnaModule = module;
      dnaScene = module.compileCatalog(module.DEMO_CATALOG);
      if (selected) showDetail();
      redraw();
    }).catch(error => console.warn('OpenSpace DNA unavailable:', error.message));
  }

  const fieldPanel = document.getElementById('fieldLab');
  const fieldSlider = document.getElementById('fieldKappa');
  const fieldValue = document.getElementById('fieldValue');
  const fieldStatus = document.getElementById('fieldStatus');
  let fieldModel = null;
  let fieldTrajectory = null;
  function recalculateField() {
    if (!fieldModel) return;
    const kappa = Number(fieldSlider.value);
    if (!Number.isFinite(kappa)) return;
    const [ax, ay] = fieldModel.centralAcceleration([1, 0], kappa);
    fieldTrajectory = fieldModel.simulateCentral(kappa);
    fieldValue.textContent = kappa.toFixed(2).replace('.', ',');
    fieldStatus.textContent = `aₓ = ${ax.toFixed(6)} · aᵧ = ${ay.toFixed(6)} · ${fieldTrajectory.length} Stützpunkte`;
    if (view) redraw();
  }
  fieldSlider.addEventListener('input', recalculateField);
  // Public demo stays offline/synthetic. The original model is only served locally.
  if (window.location.hostname === '127.0.0.1') {
    import('./field_physics.mjs').then(model => {
      fieldModel = model;
      recalculateField();
    }).catch(() => { fieldStatus.textContent = 'Rechenkern nicht geladen'; });
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // HALVETH_INTEGRATED_MODELS_V1: model time is separate from Garden/BTC source time.
  const simulationSelect=document.getElementById('simulationMode');
  const simulationPause=document.getElementById('simulationPause');
  const simulationReadout=document.getElementById('simulationReadout');
  const simulationSpeed=document.getElementById('simulationSpeed');
  let simulationAPI=null,simulationModel=null,simulationMode=fundingRail?'off':window.location?.search && new URLSearchParams(window.location.search).get('modell')==='doppelacht'?'doppelacht':'material';
  let simulationError='',simulationNotice='',watchStarted=false;
  let pendingImport=null;
  function cancelImport(){
    if(pendingImport){pendingImport.abort();const input=document.getElementById('simulationImportFile');if(input)input.value='';}
    pendingImport=null;
  }
  // Existing solver preset: only damping changes from .12 to .04; fixed step remains 1/90.
  const simulationPreset=Object.freeze({id:'movement-first-20261117',seed:20261117,damping:.04});
  let simulationPlaying=!reducedMotion,simulationDebt=0,simulationLast=null;
  const simulationOrigin={x:0,y:0,z:70},simulationScale=8,materialScale=3.2;
  const materialView={mode:'rods',colorMode:'rgb',symbolScale:1,annotations:false};
  let materialObservations=[];
  const isMaterialMode=()=>simulationMode==='material'||simulationMode==='doppelacht';
  const simulationStep=()=>isMaterialMode()?1/120:1/90;
  let spatialConfig={coupling:1},spatialTools=null,followOrigin=null,approach=null;
  const pointView=()=>simulationMode==='doppelacht'&&spatialConfig.layout==='shell'&&Number.isFinite(materialView.distance)&&!evidenceVisible&&!btcFlight.active;
  function applyDistance(d){
    approach.stop();materialView.distance=d;positionSpatial({yaw:yawOffset,pitch:pitchOffset});spatialTools.meter(d);drawScene();
  }
  const renderMaterial=(ctx,state,options,w,h)=>simulationMode==='doppelacht'
    ?simulationAPI.spatialView.draw(ctx,state,options,w,h):simulationAPI.materialDraw(ctx,state,options,w,h);
  function syncMaterialControls(){
    const is3D=simulationMode==='doppelacht';
    if(simulationSelect)simulationSelect.value=simulationMode;
    const controls=document.getElementById('materialControls');if(controls)controls.hidden=!isMaterialMode();
    const png=document.getElementById('simulationPNG');if(png)png.disabled=!isMaterialMode();
    const caption=document.getElementById('materialCaption');if(caption)caption.textContent=is3D?'Doppelacht · '+(spatialConfig.count??960)+' Zellen im Raum':'Material · 2D-Rechnung, räumliche Beobachtung';
    const note=document.getElementById('legacyMaterialNote');if(note)note.hidden=is3D;
    for(const id of ['materialDrive','materialCoupling','materialAnnotations']){
      const row=document.getElementById(id)?.closest?.('label');if(row)row.hidden=is3D;
    }
    const color=document.getElementById('materialColor');if(color)color.value=materialView.colorMode;
    spatialTools?.sync(is3D,spatialConfig.coupling,materialView.followId,spatialConfig.count??960,{yaw:yawOffset,pitch:pitchOffset,layout:spatialConfig.layout??'classic',distance:materialView.distance});
  }
  function spatialCamera(name) {
    approach?.stop();
    if(spatialConfig.layout==='shell'&&(!Number.isFinite(materialView.distance)||materialView.followId&&materialView.distance>32))
      materialView.distance=simulationAPI.spatialView.overviewDistance;
    positionSpatial(simulationAPI.spatialView.presets[name]);drawScene();
  }
  function positionSpatial(angles) {
    interior=null;
    const at=materialView.followId?simulationModel?.point(Number(materialView.followId.slice(1))):null;
    const cx=simulationOrigin.x+(at?.x??0)*materialScale,cy=simulationOrigin.y+(at?.y??0)*materialScale,cz=simulationOrigin.z+(at?.z??0)*materialScale;
    const d=Number.isFinite(materialView.distance)?materialScale*materialView.distance:32,cp=Math.cos(angles.pitch);shipX=cx-d*Math.sin(angles.yaw)*cp;
    shipY=cy-d*Math.sin(angles.pitch);cameraZ=cz-d*Math.cos(angles.yaw)*cp;
    yawOffset=targetYaw=angles.yaw;pitchOffset=targetPitch=angles.pitch;roll=0;
    targetZ=null;motion=false;routeAutopilot=false;shipVX=shipVY=shipVZ=flightSpeed=wheelImpulse=opticalBeta=0;
    followOrigin=at??null;
  }
  function setupSpatialTools(){
    spatialConfig=simulationAPI.spatial.entryConfiguration();
    const optics=simulationAPI.spatialView;approach=optics.approach();
    optics.distanceControls(canvas,{active:pointView,read:()=>materialView.distance,set:applyDistance,
      rotate:(dx,dy)=>{approach.stop();positionSpatial({yaw:yawOffset+dx*.008,pitch:clamp(pitchOffset+dy*.008,-Math.PI/2,Math.PI/2)});spatialTools.manual();drawScene();},
      tap:e=>{if(materialView.distance>4*optics.overviewDistance){applyDistance(optics.overviewDistance);return;}
        const rect=canvas.getBoundingClientRect(),px=e.clientX-rect.left,py=e.clientY-rect.top;let nearest=null,limit=12;
        for(const p of materialObservations){const d=Math.hypot(p.x-px,p.y-py);if(d<limit){limit=d;nearest=p;}}
        if(nearest)spatialTools.pick(nearest.id);}
    });
    spatialTools=simulationAPI.spatialView.controls(document.querySelector?.('[data-d8-controls]'),{
      layout:name=>{const {layout,...rest}=spatialConfig;spatialConfig=name==='shell'?{...rest,layout:'shell'}:rest;resetSimulation();},
      distance:applyDistance,
      coupling:value=>{spatialConfig={...spatialConfig,coupling:value};resetSimulation();},
      camera:spatialCamera,follow:id=>{materialView.followId=id;followOrigin=null;if(id)spatialCamera('oblique');else drawScene();}
    });
  }
  function trackSpatialFrame(){
    if(simulationMode!=='doppelacht'||!materialView.followId||!simulationModel)return;
    const p=simulationModel.point(Number(materialView.followId.slice(1)));if(!p)return;
    if(followOrigin){shipX+=(p.x-followOrigin.x)*materialScale;shipY+=(p.y-followOrigin.y)*materialScale;cameraZ+=(p.z-followOrigin.z)*materialScale;}
    followOrigin=p;
  }
  const materialConfig={particles:960,seed:170117,nematic:true,drive:.95};
  let materialDriveValue=.95,materialCouplingValue=.0015;
  const materialStartConfig=()=>({...materialConfig,drive:materialDriveValue,rodCoupling:materialCouplingValue});
  const simulationCodeVersion=Object.freeze({"releaseId":"HALVETH_INTEGRATION_RC_20261117","codeHashes":{"models.js":"8f4c0d9174a53681bab50bb74549fd28c4cd44c7c9569d4c3f4086c5fdb61383","reference-physics.js":"ae587d572d23818fb3974f7644abe150ca246e492a71f4e46d19352d935e06c9","particle-dynamics.js":"cbf8d00c18ffcb8fc4d2d0416562b9bbedc7fdba07a998b14bf93bd9e76ab701","material-engine.js":"7f6225646e7296259e4a4ffb66497d23f061801b349db05d8d7fc7f42575e19f","material-model.js":"072d81f3ff8020647fa84695912e7cac9cb952846a99f18c57021b8f157a3870","material-view.js":"940304fef5da33b7a90f39c7215d09c60ae10a4fa19b96d90b1be56823446203"}});
  function simulationState(options){return simulationModel?simulationModel.snapshot(options):null;}
  const watchPause=document.getElementById('watchPause'),watchReset=document.getElementById('watchReset');
  const watchStatus=document.getElementById('watchStatus'),workshop=document.getElementById('consoleWorkshop');
  const workshopToggle=document.getElementById('workshopToggle'),watchRecord=document.getElementById('watchRecord');
  const recordStatus=document.getElementById('recordStatus');
  const words={de:{pause:'Pause',continue:'Weiter',start:'Bewegung starten',reset:'Neu starten',record:'Aufnehmen',stop:'Aufnahme stoppen',more:'Mehr',close:'Werkstatt schließen',limit:'Modellgrenze erreicht',simulation:'Simulation'},en:{pause:'Pause',continue:'Continue',start:'Start movement',reset:'Restart',record:'Record',stop:'Stop recording',more:'More',close:'Close workshop',limit:'Model limit reached',simulation:'Simulation'},ru:{pause:'Пауза',continue:'Продолжить',start:'Начать движение',reset:'Начать заново',record:'Запись',stop:'Остановить запись',more:'Ещё',close:'Закрыть мастерскую',limit:'Достигнут предел модели',simulation:'Симуляция'}};
  let language='de',recorder=null,recordChunks=[],recordCanvas=null,recordContext=null,recordError='';
  function setWorkshop(open){
    if(!workshop||!workshopToggle)return;
    workshop.hidden=!open;workshopToggle.setAttribute('aria-expanded',String(open));
    if(open)document.getElementById('workshopTitle')?.focus?.({preventScroll:true});
    else workshopToggle.focus?.({preventScroll:true});
  }
  workshopToggle?.addEventListener('click',()=>setWorkshop(workshop.hidden));
  document.getElementById('workshopClose')?.addEventListener('click',()=>setWorkshop(false));
  workshop?.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();setWorkshop(false);}});
  document.getElementById('consoleLanguage')?.addEventListener('change',event=>{language=words[event.target.value]?event.target.value:'de';spatialTools?.translate(language);simulationStatus();});
  function simulationStatus(){
    const d=simulationModel?.diagnostics(),w=words[language];
    const label={doppelacht:'Doppelacht · 3D',material:'Material / Nematik · 2D',experimental:'Medium / Kopplung',newton:'Newton',inspiral:'GW-Inspiral'}[simulationMode]||'Modell aus';
    const time=Number.isFinite(d?.time)?d.time:(simulationState({field:false})?.time||0),speed=Number(simulationSpeed?.value||1);
    const message=simulationError?'Modellfehler: '+simulationError:d?`${w.simulation} · ${label} · t=${time.toFixed(3)} s · ×${speed}`+(d.status==='MODEL_LIMIT'?` · ${w.limit} · ${w.reset}`:'')+(simulationDebt>simulationStep()?` · Rückstand ${simulationDebt.toFixed(2)} s`:''):simulationAPI?'Modell AUS · Garden-Daten bleiben getrennt':'Simulation wird geladen …';
    if(simulationReadout)simulationReadout.textContent=message+(d&&simulationMode!=='doppelacht'?` · Umläufe ${(d.orbitalTurns||0).toFixed(3)}`:'');
    if(watchStatus)watchStatus.textContent=message+(simulationNotice?' · '+simulationNotice:'');
    if(simulationPause)simulationPause.textContent=simulationPlaying?'Modell pausieren':'Modell fortsetzen';
    if(watchPause){watchPause.textContent=simulationPlaying?w.pause:reducedMotion&&!watchStarted?w.start:w.continue;watchPause.setAttribute('aria-pressed',String(!simulationPlaying));}
    if(watchReset)watchReset.textContent=w.reset;
    if(workshopToggle)workshopToggle.textContent=w.more;
    const close=document.getElementById('workshopClose');if(close)close.textContent=w.close;
    if(watchRecord)watchRecord.textContent=recorder&&recorder.state!=='inactive'?w.stop:w.record;
  }
  function syncRecordingState(){
    if(!recorder||recorder.state==='inactive')return;
    if(simulationPlaying&&recorder.state==='paused')recorder.resume();
    else if(!simulationPlaying&&recorder.state==='recording')recorder.pause();
  }
  function toggleSimulation(){
    if(simulationError||simulationModel?.diagnostics().status==='MODEL_LIMIT')return;
    simulationPlaying=!simulationPlaying;watchStarted=watchStarted||simulationPlaying;simulationLast=null;
    syncRecordingState();
    simulationStatus();
  }
  watchPause?.addEventListener('click',toggleSimulation);
  watchReset?.addEventListener('click',()=>{simulationPlaying=!reducedMotion;watchStarted=false;resetSimulation();});
  function captureRecordingFrame(){
    if(!recordContext||!recorder||recorder.state==='inactive')return;
    if(recordCanvas.width!==canvas.width||recordCanvas.height!==canvas.height){recordCanvas.width=canvas.width;recordCanvas.height=canvas.height;}
    recordContext.fillStyle='#010205';recordContext.fillRect(0,0,recordCanvas.width,recordCanvas.height);
    if(cosmosCanvas?.style.visibility==='visible')recordContext.drawImage(cosmosCanvas,0,0,recordCanvas.width,recordCanvas.height);
    recordContext.drawImage(canvas,0,0,recordCanvas.width,recordCanvas.height);
  }
  const recordingSupported=typeof MediaRecorder!=='undefined'&&typeof canvas.captureStream==='function';
  if(watchRecord){
    watchRecord.disabled=!recordingSupported;
    if(!recordingSupported&&recordStatus)recordStatus.textContent='Aufnahme in diesem Browser nicht unterstützt: MediaRecorder / Canvas-Aufnahme fehlt.';
    watchRecord.addEventListener('click',()=>{
      if(recorder&&recorder.state!=='inactive'){recorder.stop();return;}
      if(!recordingSupported)return;
      try{
        recordError='';recordChunks=[];recordCanvas=document.createElement('canvas');recordCanvas.width=canvas.width;recordCanvas.height=canvas.height;recordContext=recordCanvas.getContext('2d');
        const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
        const stream=recordCanvas.captureStream(30);recorder=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:10000000}:{videoBitsPerSecond:10000000});
        recorder.ondataavailable=event=>{if(event.data.size)recordChunks.push(event.data);};
        recorder.onerror=event=>{recordError=event.error?.message||'Aufnahmefehler';if(recordStatus)recordStatus.textContent=recordError;};
        recorder.onstop=()=>{
          stream.getTracks().forEach(track=>track.stop());
          if(!recordError){const blob=new Blob(recordChunks,{type:recorder.mimeType||'video/webm'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='HALVETH_KORRIDOT_capture.webm';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);if(recordStatus)recordStatus.textContent=`Aufnahme gespeichert · ${recordCanvas.width} × ${recordCanvas.height} · 30 FPS angefordert, tatsächliche Bildrate im Film messen.`;}
          recordContext=null;simulationStatus();
        };
        recorder.start(250);captureRecordingFrame();if(!simulationPlaying)recorder.pause();
        if(recordStatus)recordStatus.textContent='Aufnahme aktiv · Pause hält Modell und Aufnahme an · Stop speichert WebM.';simulationStatus();
      }catch(error){recordError=error.message;if(recordStatus)recordStatus.textContent='Aufnahmefehler: '+recordError;recordContext=null;}
    });
  }
  function resetSimulation(){
    cancelImport();
    simulationDebt=0;simulationLast=null;
    simulationError='';simulationNotice='';
    simulationModel=simulationMode==='off'||!simulationAPI?null:simulationAPI.create(simulationMode,simulationMode==='doppelacht'?spatialConfig:simulationMode==='material'?materialStartConfig():simulationMode==='experimental'?{seed:simulationPreset.seed}:{});
    if(simulationMode==='doppelacht'&&simulationModel){materialView.colorMode='bluegold';materialView.followId=null;approach.begin(materialView,spatialConfig);positionSpatial(simulationAPI.spatialView.presets.oblique);}else{approach?.stop();delete materialView.distance;}
    syncMaterialControls();
    syncRecordingState();simulationStatus();drawScene();
  }
  import('./simulation_models.mjs').then(api=>{
    simulationAPI=api;setupSpatialTools();
    if(simulationMode!=='off')resetSimulation();
    else{syncMaterialControls();simulationStatus();}
  })
    .catch(error=>{simulationError='Modul nicht geladen: '+error.message;simulationPlaying=false;simulationStatus();});
  if(simulationSelect)simulationSelect.addEventListener('change',()=>{simulationMode=simulationSelect.value;resetSimulation();});
  if(simulationPause)simulationPause.addEventListener('click',toggleSimulation);
  simulationSpeed?.addEventListener('input',()=>{simulationLast=null;simulationStatus();});
  simulationStatus();
  document.getElementById('simulationReset')?.addEventListener('click',resetSimulation);
  document.getElementById('simulationHome')?.addEventListener('click',()=>{
    interior=null;
    if(btcFlight.active)stopBitcoinFlight();
    if(approach){approach.stop();delete materialView.distance;syncMaterialControls();}
    motion=false;routeAutopilot=false;targetZ=null;cameraZ=simulationOrigin.z-28;shipX=shipY=shipVX=shipVY=shipVZ=flightSpeed=wheelImpulse=opticalBeta=0;
    yawOffset=pitchOffset=targetYaw=targetPitch=roll=0;drawScene();canvas.focus({preventScroll:true});
  });
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function validCamera(observation){
    return observation && (observation.interior==null || horizonSpace?.validInterior(observation.interior)) &&
      ['x','y','z','yaw','pitch','roll'].every(k=>Number.isFinite(observation.camera?.[k])) &&
      Number.isFinite(observation.lens) && observation.lens>0;
  }
  function restoreCamera(observation){
    if(btcFlight.active)stopBitcoinFlight();
    motion=false;routeAutopilot=false;targetZ=null;keys.clear();
    thrustHeld=reverseHeld=brakeHeld=false;pointerStart=null;
    shipVX=shipVY=shipVZ=flightSpeed=wheelImpulse=opticalBeta=0;
    const p=observation.camera;shipX=p.x;shipY=p.y;cameraZ=p.z;
    const s=observation.interior;
    interior=s?{...s,shell:BigInt(s.shell),axis:[...s.axis],center:[...s.center],bearing:[...s.bearing]}:null;
    yawOffset=targetYaw=p.yaw;pitchOffset=targetPitch=p.pitch;roll=p.roll;lens=observation.lens;
    updateMotionButton();
  }
  function simulationPayload(){
    if(simulationMode==='doppelacht')return {schema:'halveth.console-doppelacht/1',mode:simulationMode,model:simulationState(),
      clock:{credit:simulationDebt,step:simulationStep(),speed:Number(simulationSpeed.value),playing:simulationPlaying},
      observation:{view:{...materialView},camera:{...camera()},...(interior?{interior:horizonSpace.saveInterior(interior)}:{}),lens},sourceClass:'SYNTHETIC_MODEL_NOT_GARDEN'};
    return {schema:'halveth.console-model/2',releaseId:simulationCodeVersion.releaseId,featureRevision:'HALVETH_MATERIAL_INTEGRATION_20261117',codeHashes:simulationCodeVersion.codeHashes,mode:simulationMode,origin:simulationOrigin,scale:simulationMode==='material'?materialScale:simulationScale,preset:simulationMode==='experimental'?simulationPreset:simulationMode==='material'?materialConfig:null,pendingMaterialInputs:simulationMode==='material'?{drive:materialDriveValue,rodCoupling:materialCouplingValue}:undefined,clock:{credit:simulationDebt,step:simulationStep(),speed:Number(simulationSpeed.value),playing:simulationPlaying},observation:{physicalDomain:simulationMode==='material'?'2D material plane; 3D observation camera':'declared model',camera:{...camera()},...(interior?{interior:horizonSpace.saveInterior(interior)}:{}),lens,view:{...materialView}},model:simulationState(),diagnostics:simulationModel.diagnostics(),sourceClass:'SYNTHETIC_MODEL_NOT_GARDEN'};}
  document.getElementById('simulationJSON')?.addEventListener('click',()=>{if(simulationModel)downloadBlob(new Blob([JSON.stringify(simulationPayload(),null,2)],{type:'application/json'}),'HALVETH_'+simulationMode+'_model.json');});
  function projectMaterial(point,id,outWidth=width,outHeight=height){
    const world={x:simulationOrigin.x+point.x*materialScale,y:simulationOrigin.y+point.y*materialScale,z:simulationOrigin.z+(point.z||0)*materialScale};
    if(spaceOptics)return spaceOptics.projectPointImages(world,view,outWidth,outHeight,lens,opticalState,{near:simulationMode==='doppelacht'&&spatialConfig.layout==='shell'?.12:.8,far:simulationMode==='doppelacht'&&spatialConfig.layout==='shell'?24000:10000,sourceId:'simulation:material:'+id});
    return outWidth===width&&outHeight===height?[project(world)].filter(Boolean):[];
  }
  function materialRenderOptions(w=width,h=height){return {...materialView,mode:materialView.mode==='flight'?'rods':materialView.mode,background:false,project:(point,id)=>projectMaterial(point,id,w,h)};}
  for(const [id,key]of [['materialView','mode'],['materialColor','colorMode'],['materialSize','symbolScale'],['materialAnnotations','annotations']]){
    document.getElementById(id)?.addEventListener('input',event=>{materialView[key]=key==='annotations'?!!event.target.checked:key==='symbolScale'?Number(event.target.value):event.target.value;drawScene();});
    document.getElementById(id)?.addEventListener('change',event=>{materialView[key]=key==='annotations'?!!event.target.checked:key==='symbolScale'?Number(event.target.value):event.target.value;drawScene();});
  }
  for(const [id,key] of [['materialDrive','drive'],['materialCoupling','rodCoupling']]){
    document.getElementById(id)?.addEventListener('change',event=>{
      const input=event.target, value=Number(input.value), drive=key==='drive';
      if(!input.value.trim()||!Number.isFinite(value)||(drive?Math.abs(value)>1.6:value<0||value>.02)){
        input.value=String(drive?materialDriveValue:materialCouplingValue);
        simulationNotice=drive?'Antrieb muss zwischen −1,6 und 1,6 liegen.':'Kopplung muss zwischen 0 und 0,02 liegen.';
      }else{
        if(drive)materialDriveValue=value;else materialCouplingValue=value;
        simulationNotice='';
      }
      simulationStatus();
    });
  }
  document.getElementById('simulationPNG')?.addEventListener('click',()=>{
    if(!isMaterialMode()||!simulationModel||!spaceOptics)return;
    const state=simulationState(),before=JSON.stringify(state),out=document.createElement('canvas');out.width=3840;out.height=2160;
    renderMaterial(out.getContext('2d'),state,{...materialRenderOptions(out.width,out.height),background:true},out.width,out.height);
    if(before!==JSON.stringify(simulationState())){simulationError='PNG veränderte Modellzustand';simulationPlaying=false;simulationStatus();return;}
    out.toBlob(blob=>{if(blob)downloadBlob(blob,'HALVETH_MATERIAL_4K_T'+state.tick+'.png');},'image/png');
  });
  const importFile=document.getElementById('simulationImportFile');
  document.getElementById('simulationImport')?.addEventListener('click',()=>importFile?.click());
  importFile?.addEventListener('change',async()=>{
    const file=importFile.files?.[0];if(!file)return;
    cancelImport();
    const request=new AbortController();pendingImport=request;
    try{
      if(file.size>5000000)throw Error('Material-JSON überschreitet 5 MB');
      const doc=JSON.parse(await file.text());
      if(request.signal.aborted)return;
      const packet=simulationAPI.spatial.packetFrom(doc);
      if(packet){
        const next=simulationAPI.spatial.create(packet.configuration);
        const native=doc.schema==='halveth.console-doppelacht/1';
        const observation=native?doc.observation:null,restoredView=observation?.view,clock=native?doc.clock:{credit:0,speed:1,step:1/120};
        if(!clock||clock.step!==1/120||!Number.isFinite(clock.credit)||clock.credit<0||clock.credit>3600||
           !Number.isFinite(clock.speed)||clock.speed<0||clock.speed>16)throw Error('Ungültige 3D-Uhr');
        if(native&&(!observation||!restoredView||!['rods','field','cells','flight'].includes(restoredView.mode)||
           !['bluegold','rgb'].includes(restoredView.colorMode)||!Number.isFinite(restoredView.symbolScale)||restoredView.symbolScale<.4||restoredView.symbolScale>2||
           (Object.hasOwn(restoredView,'distance')&&(!simulationAPI.spatialView.validDistance(restoredView.distance)||packet.configuration.layout!=='shell'))||
           (restoredView.followId!=null&&!packet.materialCells?.some(c=>c.id===restoredView.followId))||
           !validCamera(observation)))throw Error('Ungültige 3D-Ansicht');
        await next.restoreAsync(packet,{signal:request.signal,onProgress:({tick,total})=>{
          simulationNotice='3D-Import wird geprüft · '+tick+' / '+total+' Schritte';simulationStatus();
        }});
        if(request.signal.aborted)return;
        simulationMode='doppelacht';simulationModel=next;spatialConfig={...packet.configuration};simulationDebt=clock.credit;
        simulationSpeed.value=String(clock.speed);simulationLast=null;simulationPlaying=false;simulationError='';simulationNotice='';watchStarted=true;
        approach.stop();delete materialView.distance;
        Object.assign(materialView,{mode:'rods',colorMode:'bluegold',symbolScale:1,followId:null},restoredView??{});
        followOrigin=null;
        if(native)restoreCamera(observation);else spatialCamera('oblique');
        document.getElementById('materialView').value=materialView.mode;document.getElementById('materialSize').value=String(materialView.symbolScale);
        syncRecordingState();syncMaterialControls();simulationStatus();drawScene();return;
      }
      if(doc.schema!=='halveth.console-model/2'||doc.mode!=='material'||doc.sourceClass!=='SYNTHETIC_MODEL_NOT_GARDEN')throw Error('Unpassender Materialvertrag');
      for(const [name,hash] of Object.entries(simulationCodeVersion.codeHashes)){
        const actual=doc.codeHashes?.[name];
        if(actual!==hash && !(name==='material-model.js'&&actual==='4f8669e83a0ab22c038f2f05f38e347c488c4ae7d949a051df8e81197ede3bf2'))throw Error('Quellstand weicht ab: '+name);
      }
      const credit=doc.clock?.credit,speed=doc.clock?.speed;if(!Number.isFinite(credit)||credit<0||credit>3600||!Number.isFinite(speed)||speed<0||speed>16||doc.clock.step!==1/120)throw Error('Ungültiger gespeicherter Modellzeittakt');
      const obs=doc.observation?.view;if(!obs||!['rods','field','cells','flight'].includes(obs.mode)||!['rgb','bluegold'].includes(obs.colorMode)||!Number.isFinite(obs.symbolScale)||obs.symbolScale<.4||obs.symbolScale>2||typeof obs.annotations!=='boolean')throw Error('Ungültige gespeicherte Darstellungswahl');
      if(!validCamera(doc.observation))throw Error('Ungültige gespeicherte Kamera');
      const next=simulationAPI.create('material',materialConfig);next.restore(doc.model);
      const restored=next.snapshot({exact:false}),hasPending=Object.hasOwn(doc,'pendingMaterialInputs');
      const pending=hasPending?doc.pendingMaterialInputs:{drive:restored.rawEngine.drive,rodCoupling:restored.rawEngine.params.rodCoupling};
      if(!pending||Array.isArray(pending)||Object.keys(pending).sort().join(',')!=='drive,rodCoupling'||!Number.isFinite(pending.drive)||Math.abs(pending.drive)>1.6||!Number.isFinite(pending.rodCoupling)||pending.rodCoupling<0||pending.rodCoupling>.02)throw Error('Ungültige vorgemerkte Materialeingaben');
      materialDriveValue=pending.drive;materialCouplingValue=pending.rodCoupling;
      document.getElementById('materialDrive').value=String(materialDriveValue);document.getElementById('materialCoupling').value=String(materialCouplingValue);
      Object.assign(materialView,obs);document.getElementById('materialView').value=materialView.mode;document.getElementById('materialColor').value=materialView.colorMode;document.getElementById('materialSize').value=String(materialView.symbolScale);document.getElementById('materialAnnotations').checked=materialView.annotations;
      simulationModel=next;simulationMode='material';simulationSelect.value='material';simulationDebt=credit;simulationLast=null;simulationSpeed.value=String(speed);simulationPlaying=false;simulationError='';simulationNotice=hasPending?'':'Älterer Export: keine vorgemerkten Eingaben enthalten; zuletzt berechnete Werte übernommen';watchStarted=true;syncRecordingState();
      delete materialView.followId;restoreCamera(doc.observation);syncMaterialControls();
      simulationStatus();drawScene();
    }catch(error){if(!request.signal.aborted){simulationNotice='Import abgelehnt, bisheriger Zustand erhalten: '+error.message;simulationStatus();}}
    finally{if(pendingImport===request){pendingImport=null;importFile.value='';}}
  });
  function simulationTick(time){
    if(document.hidden){simulationLast=null;return;}
    const dt=simulationLast===null?0:Math.max(0,(time-simulationLast)/1000);simulationLast=time;
    const speed=Number(simulationSpeed?.value||1);
    if(!simulationModel||!simulationPlaying||!(speed>0))return;
    if(pointView()&&approach.update(materialView,dt)){positionSpatial({yaw:yawOffset,pitch:pitchOffset});spatialTools.meter(materialView.distance);}
    const rate=simulationMode==='doppelacht'&&spatialConfig.layout==='shell'?simulationAPI.spatialView.presentationRate:1;
    simulationDebt+=dt*speed*rate;let count=0;
    const h=simulationStep();
    while(simulationDebt+1e-12>=h&&count<240){
      const inputs=simulationMode==='material'?{drive:materialDriveValue,rodCoupling:materialCouplingValue}:simulationMode==='experimental'?{damping:simulationPreset.damping}:{};
      let outcome;try{outcome=simulationModel.step(h,inputs);}catch(error){simulationError=error.message;simulationPlaying=false;break;}simulationDebt-=h;if(simulationDebt<0&&simulationDebt>-1e-10)simulationDebt=0;count++;
      const current=outcome||simulationModel.diagnostics();if(current.status==='MODEL_ERROR'){simulationError=current.error||'Materialmodell angehalten';simulationPlaying=false;break;}
      if(current.status==='MODEL_LIMIT'){simulationPlaying=false;break;}
    }
    syncRecordingState();simulationStatus();
  }
  function modelPoint(p){return{x:simulationOrigin.x+p.x*simulationScale,y:simulationOrigin.y+p.y*simulationScale,z:simulationOrigin.z+(p.z||0)*simulationScale};}
  function drawSimulation(materialFilter=null,appendObservations=false,occluder=null){
    const state=simulationState({exact:false});if(!state)return;
    if(isMaterialMode()){
      const options=materialRenderOptions();
      if(materialFilter){const baseProject=options.project;options.project=(point,id)=>baseProject(point,id).filter(p=>materialFilter(p,id));}
      const rendered=renderMaterial(ctx,state,options,width,height),observations=rendered.observations||[];
      materialObservations=appendObservations?materialObservations.concat(observations):observations;
      for(const p of observations){if(p.x<0||p.x>width||p.y<0||p.y>height||(occluder&&Math.hypot(p.x-occluder.p.x,p.y-occluder.p.y)<occluder.size))continue;targets.push({key:'simulation:material:'+p.id,observationId:p.observationId,branch:p.branch,x:p.x,y:p.y,r:Math.max(2,Math.min(7,(p.renderLength||6)*.4)),depth:p.depth});}
      return;
    }
    materialObservations=[];
    const colors=['#83d6ff','#ffd28e'];
    (state.trails||[]).forEach((trail,index)=>{ctx.strokeStyle=colors[index%2]+'88';ctx.lineWidth=1.3;ctx.beginPath();let connected=false;
      for(const q of trail){const p=project(modelPoint(q));if(!p){connected=false;continue;}if(connected)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);connected=true;}ctx.stroke();});
    (state.bodies||[]).forEach((body,index)=>{
      const point=modelPoint(body),key='simulation:'+body.id;
      const images=spaceOptics?spaceOptics.projectPointImages(point,view,width,height,lens,opticalState,{near:.8,far:10000,sourceId:key}):[project(point)].filter(Boolean);
      for(const p of images){if(p.x<0||p.x>width||p.y<0||p.y>height)continue;const radius=clamp(p.scale*.18,4,19);
        const glow=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,radius*4);glow.addColorStop(0,colors[index%2]);glow.addColorStop(1,colors[index%2]+'00');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(p.x,p.y,radius*4,0,TAU);ctx.fill();
        ctx.fillStyle=colors[index%2];ctx.beginPath();ctx.arc(p.x,p.y,radius,0,TAU);ctx.fill();ctx.fillStyle='#fff';ctx.font='15px system-ui';ctx.textAlign='center';ctx.fillText(index?'+':'−',p.x,p.y+5);
        targets.push({key,observationId:p.observationId,branch:p.branch,x:p.x,y:p.y,r:Math.max(16,radius),depth:p.depth});
      }
    });
  }
  document.getElementById('runtime').textContent = '● KORRIDOT · RAUMFLUG 1.0';
  const CORE = 'navigation:singularity';
  const TAU = Math.PI * 2;
  const STEP = 20;
  const FIRST = 32;
  let snapshot = null;
  let ordered = [];
  let selected = null;
  let auto = true;
  // Manual flight is the default. Auto-cruise is now opt-in, not invisible thrust.
  let motion = false;
  let deformation = true;
  let cameraZ = 42; // Initial observation position; no camera flight or thrust.
  let targetZ = null;
  let phase = 0;
  let lastFrame = 0;
  let yawOffset = 0;
  let pitchOffset = 0;
  let lens = 1.0;
  let width = 1000;
  let height = 650;
  let resolution = 1;
  let targets = [];
  let pointerStart = null;
  let dragged = false;
  let view = null;
  let lastHover = null;
  let frameCount = 0;
  // All input devices feed one continuously integrated flight state.
  let thrustHeld = false;
  let reverseHeld = false;
  let brakeHeld = false;
  let wheelImpulse = 0;
  let flightSpeed = 0;
  let shipX = 0, shipY = 0;
  let shipVX = 0, shipVY = 0;
  let targetYaw = 0, targetPitch = 0;
  let roll = 0;
  let fps = 0, fpsCounter = 0, fpsLast = 0;
  let quality = 1;
  const keys = new Set();
  // KORRIDOT OBS-01: a distinct scene entity with its own XYZ and local model age.
  // Event index T is read from the existing timeSlider; it is not wall time.
  const OBSERVER_KEY = 'observer:obs-01';
  const observer = {id:'OBS-01', x:0, y:0, z:0, seconds:0, ready:false, visible:true};
  let observerDetail = null;
  function observerHome() {
    const c=camera(),sy=Math.sin(c.yaw),cy=Math.cos(c.yaw),cp=Math.cos(c.pitch),sp=Math.sin(c.pitch);
    observer.x=c.x+sy*cp*43+cy*3.5;observer.y=c.y+sp*43+.5;
    observer.z=c.z+cy*cp*43-sy*3.5;
    observer.seconds=0;observer.ready=true;observer.visible=true;
  }
  function observerInfo() {
    return `X ${observer.x.toFixed(3)} · Y ${observer.y.toFixed(3)} · Z ${observer.z.toFixed(3)}` +
      `\nT ${Number(slider.value)}/${ordered.length} (Garden-Belegindex) · τ ${observer.seconds.toFixed(2)} s (Modell)` +
      (btcFlight.active && Number.isFinite(btcFlight.sourceTimeMs) && btcModel
        ? `\nBTC Headerzeit ${btcModel.formatBitcoinUTC(btcFlight.sourceTimeMs)}` +
          `\nSegment H${btcFlight.from} → H${btcFlight.to} · Quelle: Garden-BTC-Import`
        : '');
  }
  function observerTick(dt) {
    if (!observer.ready || !dt) return;
    observer.seconds += dt;
    const freeKeys=['i','j','k','l','u','o'];
    const flying=freeKeys.some(key=>keys.has(key));
    observerAge=flying && warpRampEnabled ? Math.min(60,observerAge+dt) : 0;
    const observerRamp=flying && warpRampEnabled ? rampAt(observerAge) : 1;
    const speed=(keys.has('Shift') ? 22 : 10)*speedLevels[speedIndex]*observerRamp;
    observer.x += ((keys.has('l') ? 1 : 0) - (keys.has('j') ? 1 : 0)) * speed * dt;
    observer.y += ((keys.has('u') ? 1 : 0) - (keys.has('o') ? 1 : 0)) * speed * dt;
    observer.z += ((keys.has('i') ? 1 : 0) - (keys.has('k') ? 1 : 0)) * speed * dt;
    // The observer shares the open world; no longitudinal cage.
  }

  const hashName = str => {
    let hash = 2166136261;
    for (const c of String(str)) hash = Math.imul(hash ^ c.codePointAt(0), 16777619);
    return hash >>> 0;
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const sample = n => { const v = Math.sin(n * 127.1 + 83.72) * 43758.545; return v - Math.floor(v); };
  // Deterministic, authored 3D star volumes. These are visual stars, not an astronomy catalogue.
  // Partitioning by Z means only nearby star cells are projected each frame.
  const starCells = Array.from({ length: 315 }, (_, cell) =>
    Array.from({ length: 52 }, (_, j) => {
      const id = cell * 52 + j;
      const z = cell * 16 + sample(id + 7) * 16;
      const a = sample(id + 201) * TAU;
      const radius = 2.5 + Math.sqrt(sample(id + 701)) * 35;
      const c = bend(z);
      return {x:c.x + radius * Math.cos(a), y:c.y + radius * Math.sin(a), z,
        size:.55 + sample(id + 1301) * 1.55,
        tint:sample(id + 1701), phase:sample(id + 2101) * TAU};
    }));

  function entryList(data) {
    const rows = [
      ...data.garden.map(e => ({ key: 'g-' + e.seq, at: e.at, source: 'GARTEN', entry: e })),
      ...data.runs.map(e => ({ key: 'r-' + e.seq, at: e.at, source: 'LAUF', entry: e })),
      ...(data.jobs || []).map(e => ({ key: 'j-' + e.seq, at: e.at, source: 'AUFTRAG', entry: e }))
    ];
    rows.sort((a, b) => a.at.localeCompare(b.at) || a.source.localeCompare(b.source) || a.entry.seq - b.entry.seq);
    return rows;
  }
  function label(row) {
    const e = row.entry;
    if (e.kind.startsWith('funding-')) return e.name;
    if (e.kind === 'seed') return 'Keim · ' + e.name;
    if (e.kind === 'branch') return 'Ast · ' + e.name;
    if (e.kind === 'note') return 'Beschreibung · ' + e.name;
    if (e.kind === 'portal') return 'Portal · ' + e.name;
    if (e.kind === 'job-start') return 'Auftrag · ' + e.node;
    if (e.kind === 'job-progress') return 'Fortschritt · ' + e.elapsedSeconds + 's';
    if (e.kind === 'job-end') return 'Auftrag · ' + (e.result === 'EXITED' && e.exitCode === 0 ? 'OK' : e.result);
    if (e.kind === 'run-start') return 'Start · ' + e.argv[0];
    return e.result === 'EXITED' && e.exitCode === 0 ? 'Ergebnis · OK' : 'Ergebnis · ' + e.result;
  }
  function prefix(row) {
    if (row.entry.kind.startsWith('job-')) return 'LANGAUFTRAG';
    return row.entry.kind.startsWith('run-') ? 'AUSFÜHRUNG' : row.entry.kind.toUpperCase();
  }
  function line(parent, value, tag = 'p') {
    const item = document.createElement(tag);
    item.textContent = String(value);
    parent.append(item);
    return item;
  }
  function showDetail() {
    if(selected?.startsWith('simulation:')){
      detail.replaceChildren();line(detail,'MODELLENTITÄT · KEIN GARDEN-BELEG','small');line(detail,selected,'h3');
      line(detail,'Modellzeit, Einheiten und Grenzen stammen aus dem ausgewählten Rechenmodell.');
      if(selected.startsWith('simulation:material:')){const id=selected.slice('simulation:material:'.length),cell=simulationState()?.materialCells?.find(c=>c.id===id);if(cell){line(detail,'Material-ID '+id+' · Orientierung ist gespeicherter Zustand, kein Geschwindigkeitsglyph.');line(detail,JSON.stringify(cell,null,2),'pre');}}
      line(detail,JSON.stringify(simulationModel?.diagnostics()||{},null,2),'pre');return;
    }
    detail.replaceChildren();
    fieldPanel.hidden = true;
    observerDetail = null;
    if (selected === OBSERVER_KEY) {
      line(detail, 'SIMULIERTE RAUMENTITÄT · NICHT BELEG', 'small');
      line(detail, 'OBS-01 · Mini-Beobachter', 'h3');
      observerDetail = line(detail, observerInfo(), 'pre');
      line(detail, 'I/K vor/zurück · J/L seitlich · U/O hoch/runter. Shift beschleunigt.');
      line(detail, 'B: vor der Kamera positionieren · N: sichtbar/unsichtbar.');
      line(detail, 'Koordinaten in KORRIDOT-Modell-u, nicht astronomische Messwerte.');
      return;
    }
    if (selected === CORE) {
      line(detail, 'NAVIGATION · RAUMGEOMETRIE', 'small');
      line(detail, 'Schwarzes Loch · KORRIDOT', 'h3');
      line(detail, 'Mit W näherst du dich dem Horizont. Auf dem Touchscreen halte die Szene gedrückt. Im Innenraum zählt jede zurückgelegte Strecke zur nächsten Schale.');
      line(detail, 'Beim Umschauen folgt der gekrümmte Sternhimmel deiner Blickrichtung. Home bringt dich zum Eingang zurück.');
      line(detail, 'Der Horizont ist eine Position im Modell. Über die Navigation startest du kein laufendes Programm auf einem anderen Rechner.');
      return;
    }
    if (!selected) {
      line(detail, 'Klicke einen Raumkörper oder wähle einen Zeitpunkt in der Spur.');
      line(detail, 'Die Ansicht zeigt gespeicherte Ereignisse, keine unbeobachtete Außenwelt.');
      return;
    }
    const row = ordered.find(x => x.key === selected);
    if (!row) { selected = null; showDetail(); return; }
    const e = row.entry;
    if(e.kind.startsWith('funding-')){
      const tx=e.kind!=='funding-report';
      line(detail,tx?'OP MAINNET · TRANSAKTIONSBELEG':'GITCOIN GOVERNANCE · VERÖFFENTLICHTER BERICHT','small');
      line(detail,e.name,'h3');
      line(detail,(tx?'Blockzeit ':'Veröffentlicht ')+new Date(e.at).toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC'));
      if(e.asOf)line(detail,'Zahlenstand '+e.asOf);
      for(const [key,value] of e.metrics)line(detail,key+' · '+value);
      const a=document.createElement('a');a.textContent=tx?'Transaktion im Blockexplorer öffnen ↗':'Originalbericht lesen ↗';a.href=e.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';detail.append(a);
      line(detail,(tx?'Blockhash ':'SHA-256 des Forum-Beitrags (HTML) ')+e.sourceDigest,'code');return;
    }
    fieldPanel.hidden = !(e.name === 'Funktionsatlas' || e.node === 'Funktionsatlas');
    line(detail, prefix(row), 'small');
    line(detail, label(row), 'h3');
    line(detail, 'UTC ' + e.at);
    line(detail, 'SHA-256 ' + e.hash, 'code');
    const index = ordered.indexOf(row);
    line(detail, 'Raumzeitpunkt T' + (index + 1) + ' · Z ' + (FIRST + STEP * index));
    if (e.kind === 'branch') line(detail, 'Herkunft: ' + e.parent);
    if (e.kind === 'branch' && e.name === 'OpenSpace DNA') {
      line(detail, 'SYNTHETISCHE SZENENPROBE · Elternknoten + Zeit-Keyframes + distanzabhaengige Sichtbarkeit.', 'small');
      line(detail, 'Modellzeit ist NICHT Ereigniszeit. Keine NASA-Positionsdaten.');
      const modelTime = line(detail, `MODELL t = ${dnaModelTime} / 100`, 'p');
      const timelineControl = document.createElement('input');
      timelineControl.type = 'range';
      timelineControl.min = '0'; timelineControl.max = '100';
      timelineControl.step = '1'; timelineControl.value = String(dnaModelTime);
      timelineControl.setAttribute('aria-label', 'OpenSpace DNA: synthetische Modellzeit');
      timelineControl.style.width = '100%';
      timelineControl.addEventListener('input', () => {
        dnaModelTime = Number(timelineControl.value);
        modelTime.textContent = `MODELL t = ${dnaModelTime} / 100`;
        redraw();
      });
      detail.append(timelineControl);
      line(detail, dnaScene ? 'Katalog geladen: 6 Objekte · Quelle: SYNTHETISCH · Einheiten: Modell-u' :
        'Katalog wird geladen …');
    }
    if (e.kind === 'note') line(detail, e.text);
    if (e.kind === 'portal') {
      line(detail, 'Nur auf ausdrücklichen Klick öffnet sich die gespeicherte externe Website.');
      const a = document.createElement('a');
      a.href = e.url; a.rel = 'noopener noreferrer'; a.target = '_blank';
      a.textContent = 'HALVETH NETZ betreten ↗';
      detail.append(a);
    }
    if (e.kind.startsWith('job-')) {
      line(detail, 'Auftrag: ' + e.node + ' · ID ' + e.jobId);
      if (e.kind === 'job-start') line(detail, 'Programm: ' + e.program + ' · Limit: ' + e.timeoutSeconds + 's');
      if (e.kind === 'job-progress') line(detail, 'Beobachtet: ' + e.elapsedSeconds + 's · Ausgabevolumen: ' + e.outputBytes + ' Bytes (Inhalt bleibt lokal)');
      if (e.kind === 'job-end') line(detail, 'Ergebnis: ' + e.result + ' · Exit: ' + e.exitCode + ' · Zeit: ' + e.elapsedSeconds + 's · Log-SHA-256: ' + e.logHash);
    }
    if (e.kind === 'run-start') {
      line(detail, 'Erfasster Prozessstart. Die Sichtbahn ist keine laufende Terminalausgabe.');
      line(detail, 'Programm + Argumente: ' + JSON.stringify(e.argv), 'pre');
    }
    if (e.kind === 'run-end') {
      const start = snapshot.runs.find(x => x.kind === 'run-start' && x.runId === e.runId);
      line(detail, 'Exit: ' + (e.exitCode == null ? 'offen' : e.exitCode) + ' · ' + e.result);
      if (start) line(detail, 'Befehl: ' + JSON.stringify(start.argv), 'pre');
      if (e.output) line(detail, e.output, 'pre');
    }
    [...timeline.querySelectorAll('button')].forEach(b => b.classList.toggle('active', b.dataset.key === selected));
  }
  function zFor(index) { return FIRST + Math.max(0, index) * STEP; }
  function maxTravel() { return Math.max(240, zFor(ordered.length - 1) + 140); }
  function bend(z) {
    // This curved centerline is shared by geometry, camera and recorded anchors.
    return { x: 4.7 * Math.sin(z * .013) + 1.2 * Math.sin(z * .040),
             y: 2.7 * Math.cos(z * .015 + .72) + 1.2 * Math.sin(z * .034) };
  }
  function radius(z, a) {
    // Static positions keep event identities stable while the observer moves.
    return 9.4*(1+.06*Math.sin(z*.056)+.035*Math.sin(z*.128+a*3));
  }
  function surface(z, angle, fraction = 1) {
    const c=bend(z),twist=angle+z*.012,r=radius(z,angle)*fraction;
    return {x:c.x+Math.cos(twist)*r,y:c.y+Math.sin(twist)*r*.84,z};
  }
  function camera() {
    if (btcFlight.active && observer.ready) {
      const d=btcFlight.orbitDistance,cp=Math.cos(btcFlight.orbitPitch);
      const x=observer.x+Math.sin(btcFlight.orbitYaw)*d*cp;
      const y=observer.y+Math.sin(btcFlight.orbitPitch)*d;
      const z=observer.z-Math.cos(btcFlight.orbitYaw)*d*cp;
      return {x,y,z,yaw:Math.atan2(observer.x-x,observer.z-z),
        pitch:Math.atan2(observer.y-y,Math.hypot(observer.x-x,observer.z-z)),roll:0};
    }
    return {x:shipX,y:shipY,z:cameraZ,yaw:yawOffset,pitch:pitchOffset,roll};
  }
  function project(p) {
    if(spaceOptics)return spaceOptics.projectPoint(p,view,width,height,lens,opticalState,{near:.8,far:390});
    const dx=p.x-view.x,dy=p.y-view.y,dz=p.z-view.z;
    const a=Math.cos(view.yaw),b=Math.sin(view.yaw),xx=dx*a-dz*b,zz=dx*b+dz*a;
    const c=Math.cos(view.pitch),d=Math.sin(view.pitch),yy=dy*c-zz*d,depth=dy*d+zz*c;
    const cr=Math.cos(view.roll),sr=Math.sin(view.roll),hx=xx*cr-yy*sr,hy=xx*sr+yy*cr;
    if(depth<.8||Math.hypot(dx,dy,dz)>390)return null;
    const focal=Math.min(width*.94,height*1.03)*lens;
    return {x:width*.5+hx*focal/depth,y:height*.5-hy*focal/depth,depth,scale:focal/depth};
  }
  function setCanvasSize() {
    const box = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width)), h = Math.max(1, Math.round(box.height));
    const dpr = Math.min(1.7, window.devicePixelRatio || 1);
    if (width === w && height === h && resolution === dpr && canvas.width) return;
    width = w; height = h; resolution = dpr;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  function pathThrough(points, closed = false) {
    let started = false;
    ctx.beginPath();
    for (const p of points) {
      if (!p) { started = false; continue; }
      if (!started) { ctx.moveTo(p.x, p.y); started = true; }
      else ctx.lineTo(p.x, p.y);
    }
    if (closed && started) ctx.closePath();
  }
  function fade(depth) { return clamp(1 - depth / 280, .03, 1); }
  function drawBackdrop() {
    ctx.fillStyle='#010205';ctx.fillRect(0,0,width,height);
  }
  function drawStars() {
    if(!spaceOptics||!cosmosModule)return;
    if(!fallbackFar)fallbackFar=cosmosModule.createStarGeometry();
    const cell=[view.x,view.y,view.z].map(v=>Math.floor(v/cosmosModule.CELL_SIZE)).join(':');
    if(!fallbackLocal||fallbackLocal.cell!==cell)fallbackLocal=cosmosModule.createLocalStars(view);
    const draw=(data,local,stride)=>{
      for(let i=0;i<data.length;i+=8){
        const sample=local?(i/8)%cosmosModule.LOCAL_STARS_PER_CELL:i/8;if(sample%stride)continue;
        const world=local?{x:data[i]+fallbackLocal.origin[0],y:data[i+1]+fallbackLocal.origin[1],z:data[i+2]+fallbackLocal.origin[2]}:
          {x:view.x+data[i],y:view.y+data[i+1],z:view.z+data[i+2]};
        for(const p of spaceOptics.projectPointImages(world,view,width,height,lens,opticalState,{near:2,far:local?380:Infinity})){
        if(!p||p.x<0||p.x>width||p.y<0||p.y>height)continue;
        const fade=local?clamp((380-p.distance)/70,0,1)*clamp((p.distance-2)/5,0,1):1;
        const size=clamp(data[i+6]*(local?72/Math.max(1,p.distance):1),.65,3.2);
        const rgb=[data[i+3],data[i+4],data[i+5]].map(v=>Math.round(clamp(v*1.8,0,1)*255));
        ctx.fillStyle=`rgba(${rgb.join(',')},${fade.toFixed(3)})`;
        ctx.fillRect(p.x-size*.5,p.y-size*.5,size,size);
        }
      }
    };
    draw(fallbackFar,false,quality<.65?8:4);draw(fallbackLocal.data,true,quality<.65?6:3);
  }
  function drawFilaments() {
    // Elastic strands share the SAME bend/surface/project math as receipt markers.
    // They read as a distant spatial fabric, rather than stacked transverse bars.
    const count=quality<.65?8:13;
    const step=quality<.65?11:7;
    for(let filament=0;filament<count;filament++){
      const origin=TAU*filament/count;
      const points=[];
      for(let z=cameraZ+282;z>cameraZ+2;z-=step){
        const spiral=origin + z*.006 + Math.sin(z*.012+origin)*.17;
        points.push(project(surface(z,spiral,.82+Math.sin(z*.025+origin)*.12)));
      }
      pathThrough(points);
      ctx.lineWidth=filament%4===0?1.2:.7;
      ctx.strokeStyle=filament%3===0?'rgba(163,127,235,.22)':'rgba(83,209,217,.15)';
      ctx.stroke();
    }
  }
  function drawGate(row, index) {
    const z = zFor(index), dep = z - cameraZ;
    if (dep < 1 || dep > 274) return;
    const a = fade(dep);
    // A partial, spatially localized time membrane, not another tunnel hoop.
    const angle = (hashName(row.key) % 628) / 100;
    const pts = [];
    for (let k = 0; k <= 20; k++) pts.push(project(surface(z, angle + (k-10)*.038, .67)));
    pathThrough(pts);
    const e = row.entry;
    const color = e.kind === 'run-end' ? [123,243,181] : e.kind === 'run-start' ? [248,189,124]
      : e.kind === 'portal' ? [215,149,255] : [115,225,239];
    ctx.strokeStyle = `rgba(${color.join(',')},${(.07 + a * .28).toFixed(3)})`;
    ctx.lineWidth = 1.0 + 1.2*a; ctx.stroke();
  }
  function place(row, index) {
    const z = zFor(index);
    const key = row.source === 'LAUF' || row.source === 'AUFTRAG' ? row.entry.node : row.entry.name;
    const id = hashName(key);
    const angle = (id % 628) / 100 + index * 1.53;
    return surface(z, angle, .48);
  }
  function drawTrace(a, b) {
    const pts=[];
    for (let i=0;i<=12;i++) {
      const t=i/12;
      const z=mix(a.z,b.z,t), c=bend(z);
      pts.push(project({x:mix(a.x,b.x,t)*.95+c.x*.05,
        y:mix(a.y,b.y,t)*.95+c.y*.05-1.5*Math.sin(t*Math.PI),z}));
    }
    pathThrough(pts);
    ctx.strokeStyle='rgba(125,224,236,.31)';ctx.lineWidth=1.3;ctx.stroke();
  }
  // Receipt date belongs to the event. Never derived from the current clock.
  // Europe/Berlin handles historical MEZ/MESZ offsets; cache avoids per-frame parsing.
  const eventStampFormatter = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    timeZoneName: 'short'
  });
  const eventStampCache = new Map();
  function eventTimeLabel(at) {
    if (eventStampCache.has(at)) return eventStampCache.get(at);
    const time = new Date(at);
    if (!Number.isFinite(time.getTime())) return 'Zeit nicht verfügbar';
    const parts = Object.fromEntries(eventStampFormatter.formatToParts(time)
      .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    const label = `${parts.day}.${parts.month}.${parts.year} · ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}`;
    eventStampCache.set(at, label);
    return label;
  }
  function drawBeacon(row, index) {
    const loc=place(row,index);
    const images=spaceOptics?spaceOptics.projectPointImages(loc,view,width,height,lens,opticalState,{near:.8,far:390,sourceId:row.key}):[project(loc)].filter(Boolean);
    for(const image of images)drawBeaconImage(row,index,image);
  }
  function drawBeaconImage(row,index,p){
    if (!p || p.x < -180 || p.x > width+180 || p.y < -120 || p.y > height+120) return;
    const type = row.entry.kind;
    const good = (type === 'run-end' || type === 'job-end') && row.entry.result === 'EXITED' && row.entry.exitCode === 0;
    const col = type === 'job-progress' ? '#91b8ff' : type === 'job-start' ? '#ffc78a' : type === 'job-end' ? good ? '#85ffce' : '#ff7f99'
      : type === 'run-start' ? '#ffc78a' : type === 'run-end' ? good ? '#85ffce' : '#ff7f99'
      : type === 'portal' ? '#e1aeff' : type === 'note' ? '#91b8ff' : '#91f3dd';
    const radius = clamp(p.scale * (type === 'seed' || type === 'branch' ? .37 : .25), 5, 25);
    const focus = selected === row.key;
    const halo = ctx.createRadialGradient(p.x,p.y,1,p.x,p.y,radius*3.4);
    halo.addColorStop(0, col+'ae'); halo.addColorStop(.25,col+'4e'); halo.addColorStop(1,col+'00');
    ctx.fillStyle=halo;ctx.beginPath();ctx.arc(p.x,p.y,radius*3.4,0,TAU);ctx.fill();
    ctx.beginPath();ctx.arc(p.x,p.y,radius,0,TAU);
    ctx.fillStyle='#081b2d';ctx.fill();
    ctx.strokeStyle=focus?'#fff':col;ctx.lineWidth=focus?3:2.2;ctx.stroke();
    ctx.fillStyle=col;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(2.5,radius*.27),0,TAU);ctx.fill();
    // Billboards are screen-space text anchored to each projected 3D event body.
    // No standalone clock HUD or painted label boxes.
    if (p.depth < 140 && (width >= 600 || p.depth < 49 || focus)) {
      const title = label(row);
      const stamp = eventTimeLabel(row.entry.at);
      const leftSide = p.x > width * .62;
      const side = leftSide ? -1 : 1;
      const fontSize = clamp(10.5 + 75 / p.depth, 11, 14);
      const textX = p.x + side * (radius + 16);
      const textY = p.y - 2;
      const available = leftSide ? textX - 7 : width - textX - 7;
      const textWidth = Math.min(230, available);
      if (textWidth > 78 && textY > 18 && textY + 22 < height) {
        const alpha = focus ? 1 : clamp((165 - p.depth) / 70, .53, 1);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1;
        ctx.strokeStyle = focus ? '#d5fff3' : 'rgba(108,230,221,.5)';
        ctx.beginPath();
        ctx.moveTo(p.x + side * radius * .58, p.y);
        ctx.lineTo(textX - side * 5, textY + 1);
        ctx.stroke();
        ctx.textAlign = leftSide ? 'right' : 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `500 ${fontSize}px ui-monospace,Consolas,monospace`;
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = 'rgba(2,9,20,.92)';
        ctx.strokeText(title, textX, textY, textWidth);
        ctx.fillStyle = focus ? '#ffffff' : '#dcfff8';
        ctx.fillText(title, textX, textY, textWidth);
        ctx.font = '300 10px ui-monospace,Consolas,monospace';
        ctx.strokeText(stamp, textX, textY + 15, textWidth);
        ctx.fillStyle = focus ? '#b8fdef' : '#94cdd3';
        ctx.fillText(stamp, textX, textY + 15, textWidth);
        ctx.restore();
        const labelLeft = leftSide ? textX - textWidth : textX;
        targets.push({key:row.key,observationId:p.observationId,branch:p.branch,x:labelLeft+textWidth/2,y:textY+7,
          r:Math.max(18,textWidth/2),
          rect:{left:labelLeft,top:textY-14,right:labelLeft+textWidth,bottom:textY+21},
          depth:p.depth});
      }
    }
    targets.push({key:row.key,observationId:p.observationId,branch:p.branch,x:p.x,y:p.y,r:Math.max(19,radius+9),depth:p.depth});
  }
  function drawCore() {
    const z=Math.max(198,zFor(ordered.length-1)+60),c=bend(z),p=project({x:c.x,y:c.y,z});
    if(!p)return;
    const s=clamp(p.scale*.25,2,7);
    ctx.fillStyle='#e4eeff';ctx.beginPath();ctx.arc(p.x,p.y,s,0,TAU);ctx.fill();
    ctx.font='11px ui-monospace,monospace';ctx.textAlign='center';
    ctx.fillText('ENDE DER BELEGSPUR',p.x,p.y-15);
    targets.push({key:CORE,x:p.x,y:p.y,r:Math.max(20,s+8),depth:p.depth});
  }
  // Model t is not a new receipt. Curve is anchored beside the EXISTING
  // Funktionsatlas branch in KORRIDOT's projected 3D model space.
  function drawFieldTrajectory() {
    if (!fieldTrajectory || fieldPanel.hidden) return;
    const index = ordered.findIndex(row =>
      row.entry.kind === 'branch' && row.entry.name === 'Funktionsatlas');
    if (index < 0 || Number(slider.value) <= index) return;
    const anchor = place(ordered[index], index);
    const pts = fieldTrajectory.filter((_, i) => i % 4 === 0).map(point => project({
      x: anchor.x + (point.x - 1) * 2.7,
      y: anchor.y + point.y * 2.7,
      z: anchor.z + 3 + point.t * 9
    }));
    pathThrough(pts);
    ctx.strokeStyle = '#9bffdc';
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }
  // OpenSpace-inspired scene graph: its own parent transforms and time samples,
  // projected into KORRIDOT's EXISTING camera. No second canvas or data upload.
  function drawOpenSpaceDNA() {
    if (!dnaModule || !dnaScene) return;
    const index = ordered.findIndex(r =>
      r.entry.kind === 'branch' && r.entry.name === 'OpenSpace DNA');
    if (index < 0 || selected !== ordered[index].key || Number(slider.value) <= index) return;
    const anchor = place(ordered[index], index);
    const objects = dnaModule.snapshotScene(dnaScene, dnaModelTime, [0, 0, 0],
      {maxDistance: 50, minRelativeRadius: 0.005}).filter(o => o.visible);
    const projections = new Map();
    for (const object of objects) {
      const local = object.relative;
      const projection = project({
        x: anchor.x + local[0] * 1.2,
        y: anchor.y + local[1] * 1.2,
        z: anchor.z + 8 + local[2] * 1.2
      });
      if (projection) projections.set(object.id, projection);
    }
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(133,239,221,.42)';
    for (const object of objects) {
      const p = projections.get(object.id), parent = projections.get(object.parent);
      if (!p || !parent) continue;
      ctx.beginPath(); ctx.moveTo(parent.x, parent.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    for (const object of objects) {
      const p = projections.get(object.id);
      if (!p || p.x < 0 || p.x > width || p.y < 0 || p.y > height) continue;
      const radius = clamp(p.scale * object.radius * .25, 3, 11);
      ctx.fillStyle = '#a7ffe8';
      ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, TAU); ctx.fill();
      if (p.depth < 115) {
        ctx.font = '300 10px ui-monospace,monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#c8f4f0';
        ctx.fillText(object.label + ' · t' + dnaModelTime, p.x + radius + 7, p.y, 130);
      }
      targets.push({key:ordered[index].key,x:p.x,y:p.y,r:Math.max(radius + 8, 15),depth:p.depth});
    }
    ctx.restore();
  }
  function drawObserver() {
    if (!observer.visible || !observer.ready) return;
    const p = project(observer);
    if (!p || p.x < -85 || p.x > width+85 || p.y < -70 || p.y > height+70) return;
    const s = clamp(p.scale * .48, 3.5, 14);
    ctx.save();
    ctx.translate(p.x, p.y);
    // Tiny flying observer. Original vector silhouette, no external sprite or asset.
    ctx.rotate(Math.sin(observer.seconds * 1.4) * .065);
    ctx.fillStyle = '#8a74dd'; // miniature cloak trails behind the pilot
    ctx.beginPath();ctx.moveTo(-s*.3,-s*.2);
    ctx.lineTo(-s*1.55,s*.9);ctx.lineTo(-s*.8,-s*1.0);ctx.closePath();ctx.fill();
    ctx.lineWidth = Math.max(1,s*.16);
    ctx.strokeStyle = '#061a2d';
    ctx.fillStyle = '#7be8cf';
    ctx.beginPath();ctx.ellipse(0,s*.12,s*.52,s*.8,-.22,0,TAU);ctx.fill();ctx.stroke();
    ctx.strokeStyle = '#7be8cf';ctx.lineCap='round';
    for (const a of [-1,1]) {
      ctx.beginPath();ctx.moveTo(a*s*.28,s*.48);ctx.lineTo(a*s*.56,s*1.2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(a*s*.32,-s*.25);ctx.lineTo(a*s*.80,-s*.52);ctx.stroke();
    }
    ctx.fillStyle = '#f0d2aa';ctx.strokeStyle='#061a2d';ctx.lineWidth=Math.max(1,s*.13);
    ctx.beginPath();ctx.arc(0,-s*.95,s*.54,0,TAU);ctx.fill();ctx.stroke();
    ctx.fillStyle='#052638';
    ctx.beginPath();ctx.arc(s*.18,-s*.97,Math.max(.8,s*.08),0,TAU);ctx.fill();
    ctx.restore();
    // Ultra-thin camera-projected text, attached to the observer, not the HUD.
    const left = p.x + s*1.3+8 > width-210 ? p.x-s*1.3-218 : p.x+s*1.3+8;
    const top = Math.max(24,Math.min(height-36,p.y-s));
    const textLines = ['BEOBACHTER · OBS-01',
      `X ${observer.x.toFixed(3)}  Y ${observer.y.toFixed(3)}  Z ${observer.z.toFixed(3)}`,
      `T ${Number(slider.value)}/${ordered.length} · τ ${observer.seconds.toFixed(2)}s`];
    ctx.save();ctx.textAlign='left';ctx.textBaseline='alphabetic';
    ctx.font='500 10px ui-monospace,Consolas,monospace';
    ctx.lineJoin='round';ctx.lineWidth=2.5;
    const alpha=clamp((180-p.depth)/130,.48,1);
    ctx.globalAlpha=alpha;
    for (let i=0; i<textLines.length; i++) {
      const y=top+i*13;
      ctx.strokeStyle='rgba(2,10,24,.95)';ctx.strokeText(textLines[i],left,y,215);
      ctx.fillStyle=i===0?'#b8fff0':i===1?'#d8edf3':'#8bd6ce';
      ctx.fillText(textLines[i],left,y,215);
    }
    ctx.restore();
    targets.push({key:OBSERVER_KEY,x:p.x,y:p.y,r:Math.max(18,s*2.2),depth:p.depth});
  }
  function rebuildBitcoinRail() {
    if (!btcModel) return;
    const out=btcModel.extractBitcoinRail(ordered);
    btcBlocks=out.blocks.map(row=>({...row,position:place(ordered[row.index],row.index)}));
    btcPlayable=out.playable;
    btcRailStatus=out.reason;
    if (btcFlight.active && !btcPlayable) {
      btcFlight.active=false; btcFlight.playing=false;
    }
    updateBitcoinFlightButton();
  }
  function updateBitcoinFlightButton() {
    if (!btcFlyButton) return;
    btcFlyButton.disabled=!btcPlayable;
    btcFlyButton.textContent=btcFlight.active?'■ BTC-Flug verlassen':
      '▶ BTC-Zeitflug' + (btcBlocks.length ? ` (${btcBlocks.length})` : '');
    btcFlyButton.title=btcRailStatus;
  }
  function btcTick(dt) {
    if (!btcFlight.active || !btcModel || !btcPlayable) return;
    const first=btcBlocks[0].timeMs, last=btcBlocks[btcBlocks.length-1].timeMs;
    if (btcFlight.playing) {
      btcFlight.elapsed=Math.min(btcFlight.duration,btcFlight.elapsed+dt*speedLevels[speedIndex]);
      if (btcFlight.elapsed >= btcFlight.duration) btcFlight.playing=false;
    }
    const timeMs=first+(last-first)*btcFlight.elapsed/btcFlight.duration;
    const p=btcModel.sampleBitcoinRail(btcBlocks,timeMs);
    if (!p) {btcFlight.active=false;btcFlight.playing=false;updateBitcoinFlightButton();return;}
    observer.x=p.x;observer.y=p.y;observer.z=p.z;
    observer.visible=true;observer.ready=true;observer.seconds=btcFlight.elapsed;
    btcFlight.sourceTimeMs=p.timeMs;
    btcFlight.from=p.from;btcFlight.to=p.to;
    // cameraZ only controls depth culling/star cells. The view itself comes from camera().
    const orbit=camera();
    cameraZ=clamp(orbit.z,0,maxTravel());
  }
  function drawBitcoinRail() {
    if (!btcPlayable || !btcModel) return;
    const visible=btcBlocks.filter(b=>b.index<Number(slider.value));
    if (visible.length < 1) return;
    ctx.save();
    ctx.lineWidth=2.2;
    ctx.strokeStyle='rgba(255,198,109,.78)';
    for(let i=1;i<visible.length;i++) {
      const a=visible[i-1].position,b=visible[i].position, segment=[];
      for(let k=0;k<=18;k++) {
        const f=k/18;
        segment.push(project({x:mix(a.x,b.x,f),y:mix(a.y,b.y,f),z:mix(a.z,b.z,f)}));
      }
      pathThrough(segment);
      ctx.stroke();
    }
    for(const b of visible) {
      const p=project(b.position);
      if (!p || p.x<0 || p.x>width || p.y<0 || p.y>height) continue;
      const s=clamp(p.scale*.16,3,10);
      ctx.fillStyle='#ffcd81';
      ctx.beginPath();ctx.arc(p.x,p.y,s,0,TAU);ctx.fill();
      ctx.strokeStyle='#382412';ctx.lineWidth=1;ctx.stroke();
      if(btcFlight.active && p.depth<145) {
        ctx.font='600 10px ui-monospace,monospace';
        ctx.textAlign='left';ctx.fillStyle='#ffe4b8';
        ctx.fillText('BTC H'+b.height,p.x+s+7,p.y-6,95);
      }
    }
    ctx.restore();
  }
  function startBitcoinFlight() {
    routeAutopilot=false;
    showEvidence(true);
    if (!btcPlayable || !btcModel) return;
    interior=null;
    btcFlight.active=true;btcFlight.playing=true;btcFlight.elapsed=0;
    btcFlight.orbitYaw=0;btcFlight.orbitPitch=.23;
    observer.visible=true;observer.ready=true;
    motion=false;flightSpeed=0;wheelImpulse=0;thrustHeld=false;cruiseAge=0;currentRamp=1;
    reverseHeld=false;brakeHeld=false;targetZ=null;
    auto=false;follow.setAttribute('aria-pressed','false');follow.textContent='○ Live folgen';
    slider.value=String(ordered.length);
    selected=OBSERVER_KEY;
    btcTick(0);showDetail();updateMotionButton();updateBitcoinFlightButton();drawScene();
    canvas.focus({preventScroll:true});
  }
  function stopBitcoinFlight() {
    btcFlight.active=false;btcFlight.playing=false;
    updateBitcoinFlightButton();updateMotionButton();
  }
  btcFlyButton.onclick=()=>{
    if(btcFlight.active) {stopBitcoinFlight();drawScene();}
    else startBitcoinFlight();
  };
  // KORRIDOT_SENSOR_OCCLUSION_V1: synthetic world body, independent of Garden evidence.
  const SENSOR_MODES = ['OPTISCH', 'INFRAROT', 'RADAR'];
  let sensorMode = 0;
  const sensorButton = document.createElement('button');
  sensorButton.type = 'button';
  sensorButton.id = 'sensorModeToggle';
  sensorButton.title = 'Ein existierender Modellplanet, drei unterschiedliche Sensoren';
  function sensorButtonText() {
    sensorButton.textContent = '◉ SENSOR: ' + SENSOR_MODES[sensorMode];
  }
  sensorButtonText();
  sensorButton.onclick = () => {
    sensorMode = (sensorMode + 1) % SENSOR_MODES.length;
    sensorButtonText();
    redraw();
  };
  const sensorAnchor = document.getElementById('warpRamp');
  if (sensorAnchor && sensorAnchor.parentElement) {
    sensorAnchor.parentElement.appendChild(sensorButton);
  }
  const DARK_WORLD = Object.freeze({z:125, offsetX:12, offsetY:6, radius:6});
  function darkWorldProjection(){
    const bendAt=bend(DARK_WORLD.z),body={x:bendAt.x+DARK_WORLD.offsetX,y:bendAt.y+DARK_WORLD.offsetY,z:DARK_WORLD.z},p=project(body);
    if(!p||p.x < -170||p.x > width+170||p.y < -170||p.y > height+170)return null;
    return{body,p,distance:Math.hypot(body.x-view.x,body.y-view.y,body.z-view.z),size:clamp(p.scale*DARK_WORLD.radius,4,110)};
  }
  function drawSimulationWithPlanet(){
    const planet=darkWorldProjection();
    if(!planet){drawSimulation();return;}
    const state=simulationState({exact:false});
    if(!isMaterialMode()||!state){const p=project(simulationOrigin);if(p&&p.depth>planet.p.depth){drawSimulation();drawDarkWorld();}else{drawDarkWorld();drawSimulation();}return;}
    const centers=new Map(state.materialCells.map(cell=>[cell.id,new Map(projectMaterial(cell,cell.id).map(p=>[p.branch,p.depth]))]));
    const behind=(p,id)=>(centers.get(id)?.get(p.branch)??p.depth)>planet.p.depth;
    drawSimulation(behind,false,planet);drawDarkWorld();drawSimulation((p,id)=>!behind(p,id),true);
  }
  function drawDarkWorld() {
    const projection=darkWorldProjection();if(!projection)return;
    const {body,p,distance,size}=projection;
    const attenuation = Math.pow(90/Math.max(distance,1),2);
    const reflected = .028*attenuation;
    const thermal = .32*attenuation;
    const opticalDetected = reflected > .05;
    const irDetected = thermal > .055;
    const radarDetected = distance < 250;
    const detected = sensorMode === 0 ? opticalDetected :
      sensorMode === 1 ? irDetected : radarDetected;
    ctx.save();
    ctx.beginPath();ctx.arc(p.x,p.y,size,0,TAU);
    ctx.fillStyle='#020916';ctx.fill();
    if (sensorMode===1 && irDetected) {
      const g=ctx.createRadialGradient(p.x,p.y,1,p.x,p.y,size*2.5);
      g.addColorStop(0,'rgba(255,147,105,.22)');
      g.addColorStop(.5,'rgba(255,113,161,.15)');
      g.addColorStop(1,'rgba(255,113,161,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,size*2.5,0,TAU);ctx.fill();
      ctx.strokeStyle='#ffa994';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(p.x,p.y,size,0,TAU);ctx.stroke();
    }
    if (sensorMode===2 && radarDetected) {
      ctx.strokeStyle='#82f5da';ctx.lineWidth=1.4;
      ctx.beginPath();ctx.arc(p.x,p.y,size,0,TAU);ctx.stroke();
      ctx.setLineDash([4,6]);
      ctx.beginPath();ctx.arc(p.x,p.y,size+10,0,TAU);ctx.stroke();
      ctx.setLineDash([]);
    }
    if (sensorMode===0 && opticalDetected) {
      ctx.strokeStyle='rgba(150,195,220,.6)';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(p.x,p.y,size,0,TAU);ctx.stroke();
    }
    if (detected) {
      ctx.fillStyle=sensorMode===1?'#ffb7a2':'#a6ffe9';
      ctx.font='11px ui-monospace,monospace';
      ctx.textAlign='left';
      ctx.fillText('SYNTHETISCHER DUNKELPLANET',p.x+size+12,p.y-4);
      ctx.fillText('Abstand '+distance.toFixed(1)+' Modell-u',p.x+size+12,p.y+11);
      if (distance < 32) {
        ctx.fillStyle='#ffc28c';
        ctx.fillText('ANNAEHERUNG: Modell-Sicherheitszone',p.x+size+12,p.y+27);
      }
    }
    ctx.restore();
  }

  // KORRIDOT_OPTIC_RAYS_V1_BEGIN
  // READ-ONLY SYNTHETIC OPTICS. World-anchored, never written to Garden.
  // 3D positions and ray integration are in model units, not solar measurements.
  const opticWorld = Object.freeze({z:236, scale:4.4, radius:0.75, fieldRadius:3.5, fieldStrength:0.06});
  const opticWaves = Object.freeze([450,550,650]);
  const opticOffsets = Object.freeze([0,0.7,0.8,1.4]);
  const opticColours = Object.freeze({450:'145,176,255',550:'136,255,188',650:'255,134,153'});
  const opticButton = document.createElement('button');
  opticButton.type = 'button';
  opticButton.id = 'opticRayToggle';
  opticButton.title = 'Synthetische Lichtwege im Weltkoordinatenraum: AUS / BRECHUNG / A-B';
  let opticMode = 0; // 0 hidden, 1 bent rays, 2 A/B with straight reference rays
  const opticN = v => {
    const len=Math.hypot(...v);
    if (!(len>0)) throw Error('Optic: nonfinite or zero direction');
    return v.map(x=>x/len);
  };
  function opticGradient(pos, wave, strength) {
    const rr=opticWorld.fieldRadius;
    const d=Math.exp(-(pos[0]**2+pos[1]**2+pos[2]**2)/(2*rr*rr));
    const a=strength*(wave/550)**2;
    const n=1-a*d;
    return {n,grad:pos.map(v=>a*d*v/(rr*rr))};
  }
  function opticCurvature(pos, dir, wave, strength) {
    const {n,grad}=opticGradient(pos,wave,strength);
    const parallel=grad.reduce((sum,v,i)=>sum+v*dir[i],0);
    return grad.map((v,i)=>(v-dir[i]*parallel)/n);
  }
  function opticHitsSegment(a,b,radius) {
    // Avoid skipping a small opaque body between two numerical samples.
    const dx=b.map((v,i)=>v-a[i]);
    const dd=dx.reduce((s,v)=>s+v*v,0);
    const u=dd>0?Math.max(0,Math.min(1,-a.reduce((s,v,i)=>s+v*dx[i],0)/dd)):0;
    return a.reduce((s,v,i)=>s+(v+dx[i]*u)**2,0)<=radius*radius;
  }
  function opticTrace(wave,offset,strength=opticWorld.fieldStrength) {
    if(!opticWaves.includes(wave)||!Number.isFinite(offset)||!Number.isFinite(strength)||strength<0||strength>=1)
      throw Error('Optic: invalid parameters');
    const step=0.03, limit=1300;
    let p=[offset,0,-14],dir=[0,0,1];
    const points=[p.slice()];
    for(let i=0;i<limit;i++) {
      if(Math.hypot(...p)<=opticWorld.radius)
        return {wave,offset,hit:true,points,angleDeg:null};
      if(p[2]>=14) return {wave,offset,hit:false,points,
        angleDeg:Math.atan2(dir[0],dir[2])*180/Math.PI};
      const k1=opticCurvature(p,dir,wave,strength);
      const midDir=opticN(dir.map((v,j)=>v+step*k1[j]/2));
      const midPos=p.map((v,j)=>v+step*midDir[j]/2);
      const k2=opticCurvature(midPos,midDir,wave,strength);
      const newDir=opticN(dir.map((v,j)=>v+step*k2[j]));
      const next=p.map((v,j)=>v+step*midDir[j]);
      if(opticHitsSegment(p,next,opticWorld.radius)) {
        points.push(next);
        return {wave,offset,hit:true,points,angleDeg:null};
      }
      p=next;dir=newDir;
      if(i%4===0) points.push(p.slice());
    }
    throw Error('Optic: step limit');
  }
  const opticRays = opticOffsets.flatMap(offset=>opticWaves.map(wave=>opticTrace(wave,offset)));
  const opticReferences = opticOffsets.map(offset=>opticTrace(550,offset,0));
  function opticButtonText() {
    opticButton.textContent=['🌈 OPTIK AUS','🌈 OPTIK BRECHUNG','🌈 OPTIK A/B'][opticMode];
    opticButton.setAttribute('aria-pressed',String(opticMode>0));
  }
  opticButtonText();
  opticButton.onclick=()=>{
    opticMode=(opticMode+1)%3;
    if(opticMode===1) {
      // Explicit user action: approach this fixed synthetic world region.
      interior=null;
      cameraZ=opticWorld.z-95;
      shipX=0;shipY=0;shipVX=0;shipVY=0;
      yawOffset=0;pitchOffset=0;targetYaw=0;targetPitch=0;roll=0;
      targetZ=null;flightSpeed=0;wheelImpulse=0;
      motion=false;thrustHeld=false;reverseHeld=false;brakeHeld=false;
      updateMotionButton();
    }
    opticButtonText();redraw();
  };
  const opticAnchor=document.getElementById('cosmosToggle') || document.getElementById('warpRamp');
  if(opticAnchor?.parentElement) opticAnchor.parentElement.appendChild(opticButton);
  let opticWorldCenter=null;
  function opticWorldPoint(p) {
    const c=opticWorldCenter || (opticWorldCenter=bend(opticWorld.z));
    return {x:c.x+p[0]*opticWorld.scale,
            y:c.y+p[1]*opticWorld.scale,
            z:opticWorld.z+p[2]*opticWorld.scale};
  }
  function opticDrawPolyline(points,colour,alpha,widthValue,dashed=false) {
    ctx.save();ctx.lineWidth=widthValue;
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.strokeStyle=`rgba(${colour},${alpha})`;
    if(dashed)ctx.setLineDash([4,6]);
    ctx.beginPath();let open=false,count=0;
    for(const local of points) {
      const proj=project(opticWorldPoint(local));
      if(!proj){open=false;continue;}
      if(!open){ctx.moveTo(proj.x,proj.y);open=true;}
      else ctx.lineTo(proj.x,proj.y);
      count++;
    }
    if(count>1)ctx.stroke();
    ctx.restore();
  }
  function drawOpticalField() {
    if(!opticMode) return;
    const body=project(opticWorldPoint([0,0,0]));
    if(!body) return;
    if(opticMode===2) {
      for(const ref of opticReferences)
        opticDrawPolyline(ref.points,'193,208,216',0.32,1.1,true);
    }
    for(const ray of opticRays) {
      const colour=opticColours[ray.wave];
      opticDrawPolyline(ray.points,colour,0.14,4.6);
      opticDrawPolyline(ray.points,colour,0.86,1.65);
    }
    const size=Math.max(5,Math.min(72,opticWorld.radius*opticWorld.scale*body.scale));
    ctx.save();
    const halo=ctx.createRadialGradient(body.x,body.y,0,body.x,body.y,size*2.6);
    halo.addColorStop(0,'rgba(188,220,243,.13)');
    halo.addColorStop(1,'rgba(188,220,243,0)');
    ctx.fillStyle=halo;ctx.beginPath();ctx.arc(body.x,body.y,size*2.6,0,TAU);ctx.fill();
    ctx.fillStyle='#030b14';ctx.strokeStyle='rgba(160,219,248,.68)';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(body.x,body.y,size,0,TAU);ctx.fill();ctx.stroke();
    ctx.textAlign='left';ctx.font='11px ui-monospace,monospace';
    ctx.fillStyle='#b5f9ea';
    ctx.fillText('OPTISCHE MODELLWELT · XYZ',Math.min(width-230,body.x+size+10),body.y-size-7);
    ctx.fillStyle='#a3b9c8';
    ctx.fillText('450 / 550 / 650 nm · SYNTHETISCH',Math.min(width-230,body.x+size+10),body.y-size+8);
    ctx.restore();
  }
  // KORRIDOT_OPTIC_RAYS_V1_END

  // KORRIDOT_SPUR_LINSE_V11: stable evidence-based waypoints; no new receipts.
  let flightRouteVisible = true, routeAutopilot = false;
  function routeTarget() {
    const lo=Math.max(0,Math.floor((cameraZ-FIRST)/STEP)-2);
    for(let i=lo;i<ordered.length;i++) {
      const p=place(ordered[i],i);
      if(p.z>cameraZ+9 && Math.hypot(p.x-shipX,p.y-shipY,p.z-cameraZ)<380)
        return {position:p,index:i,key:ordered[i].key};
    }
    const z=Math.max(198,zFor(ordered.length-1)+60),c=bend(z);
    return {position:{x:c.x,y:c.y,z},index:-1,key:CORE};
  }
  function drawEvidenceRoute() {
    if(!flightRouteVisible) return;
    const count=Number(slider.value);
    // Only spatially nearby source events; a long ledger stays fast.
    const lo=Math.max(0,Math.floor((cameraZ-390-FIRST)/STEP)-2);
    const hi=Math.min(count,Math.max(0,Math.ceil((cameraZ+390-FIRST)/STEP)+2));
    ctx.save();ctx.lineCap='round';
    let previous=null,previousIndex=-1;
    for(let i=lo;i<hi;i++) {
      const row=ordered[i],e=row.entry,p=project(place(row,i));
      if(!p||p.x<-80||p.x>width+80||p.y<-80||p.y>height+80){previous=null;continue;}
      const bitcoin=btcBlocks.find(b=>b.index===i);
      const link=(previous && previousIndex===i-1);
      if(link){
        const glow=.13+Math.max(.04,1-Math.max(p.distance,previous.distance)/360)*.3;
        ctx.strokeStyle=bitcoin?'rgba(255,198,105,'+glow.toFixed(3)+')':'rgba(97,237,226,'+glow.toFixed(3)+')';
        ctx.lineWidth=Math.max(.7,2.1-Math.max(p.distance,previous.distance)/300);
        ctx.beginPath();ctx.moveTo(previous.x,previous.y);ctx.lineTo(p.x,p.y);ctx.stroke();
      }
      const origin=row.source==='GARTEN'?'GARTEN':row.source==='LAUF'?'LAUF':'AUFTRAG';
      const color=bitcoin?'#ffcb78':origin==='GARTEN'?'#71f8dd':origin==='LAUF'?'#a9c8ff':'#c7a5ff';
      const s=clamp(2.4+20/Math.max(p.distance,6),2,6.5),opacity=clamp((390-p.distance)/105,.24,1);
      ctx.globalAlpha=opacity;
      ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=12;
      ctx.beginPath();ctx.arc(p.x,p.y,s,0,TAU);ctx.fill();ctx.shadowBlur=0;
      if((bitcoin||e.kind==='branch'||e.kind==='job-end')&&p.distance<170){
        let name=bitcoin?'BTC H'+bitcoin.height:'['+origin+'] '+label(row);
        const code=bitcoin?bitcoin.hash:(typeof e.hash==='string'?e.hash:'');
        ctx.font='11px ui-monospace,Consolas,monospace';ctx.textAlign='left';ctx.textBaseline='middle';
        ctx.lineWidth=3;ctx.strokeStyle='rgba(1,4,10,.94)';ctx.strokeText(name,p.x+s+6,p.y,184);
        ctx.fillStyle=color;ctx.fillText(name,p.x+s+6,p.y,210);
        if(code){ctx.font='9px ui-monospace,Consolas,monospace';
          const digestLabel=(bitcoin?'BLOCKHASH ':'EREIGNIS-ID ')+code.slice(0,16);
          ctx.strokeText(digestLabel,p.x+s+6,p.y+13,205);
          ctx.fillText(digestLabel,p.x+s+6,p.y+13,205);}
      }
      targets.push({key:row.key,x:p.x,y:p.y,r:Math.max(14,s+8),depth:p.depth});
      previous=p;previousIndex=i;
    }
    ctx.globalAlpha=1;
    if(!evidenceVisible&&btcBlocks.length){
      // The gold rail uses the same verified Garden-backed source positions.
      drawBitcoinRail();
    }
    ctx.restore();
  }
  function routeSteering(dt) {
    if(!routeAutopilot||btcFlight.active||!dt)return;
    const goal=routeTarget(),p=goal.position;
    const dx=p.x-shipX,dy=p.y-shipY,dz=p.z-cameraZ;
    const distance=Math.hypot(dx,dy,dz);
    if(goal.index<0&&(distance<8||p.z<=cameraZ+4)){routeAutopilot=false;motion=false;updateMotionButton();return;}
    const yaw=Math.atan2(dx,dz),pitch=Math.atan2(dy,Math.hypot(dx,dz));
    const turn=Math.atan2(Math.sin(yaw-targetYaw),Math.cos(yaw-targetYaw));
    targetYaw+=clamp(turn,-dt*.65,dt*.65);
    targetPitch+=clamp(pitch-targetPitch,-dt*.5,dt*.5);
  }
  function horizonCenter() {
    const z=Math.max(198,zFor(ordered.length-1)+60), c=bend(z);
    return [c.x,c.y,z];
  }
  function drawScene() {
    if (!ctx) return;
    setCanvasSize();
    ctx.setTransform(resolution,0,0,resolution,0,0);
    trackSpatialFrame();view = camera(); targets=[];
    if(spaceOptics){
      const center=interior?.center || horizonCenter();
      const rel=[center[0]-view.x,center[1]-view.y,center[2]-view.z];
      const d=Math.hypot(...rel),direction=spaceOptics.worldToCameraVector(interior?.axis || rel,view);
      const base=spaceOptics.createOpticsState({beta:btcFlight.active?0:opticalBeta,
        axis:spaceOptics.worldToCameraVector([shipVX,shipVY,shipVZ],view)});
      const apparent=spaceOptics.forwardDirection(direction,base);
      const skyBend=horizonSpace?.horizonBend(d,interior) || 0;
      // Close to the focus the same angular sky surrounds the observer, so
      // turning the view across 90 degrees must not switch the lens off.
      const cosine=direction[2]/(Math.hypot(...direction)||1);
      const blend=clamp((cosine+.12)/.24,0,1),front=blend*blend*(3-2*blend);
      const visible=front+(1-front)*Math.min(1,skyBend/2.4);
      const radius=visible*Math.min(.18,.72/Math.sqrt(d+18));
      opticalState=spaceOptics.createOpticsState({beta:base.beta,axis:base.axis,
        lensAxis:apparent,lensRadius:radius,focusDistance:d,skyAxis:apparent,skyBend});
    }
    if (!observer.ready) observerHome();
    let usingCosmos=false;
    const viewingPoint=pointView();
    if(cosmosRenderer&&cosmosEnabled&&!viewingPoint){
      try{usingCosmos=cosmosRenderer.render(view,width,height,lens,fps>0&&fps<42?.5:quality,opticalState);}
      catch(error){cosmosRenderer.dispose();cosmosRenderer=null;cosmosError=error.message;updateCosmosButton();}
    }
    if(cosmosCanvas)cosmosCanvas.style.visibility=usingCosmos?'visible':'hidden';
    if(viewingPoint){ctx.fillStyle='#030509';ctx.fillRect(0,0,width,height);}else if(usingCosmos)ctx.clearRect(0,0,width,height);else drawBackdrop();
    const visible=ordered.slice(0,Number(slider.value));
    const drawable=[];

    if(!usingCosmos&&!viewingPoint)drawStars();
    if(evidenceVisible)drawSimulationWithPlanet();else drawSimulation();
    if(!isMaterialMode()||evidenceVisible)drawEvidenceRoute();
    if(evidenceVisible){
    drawOpticalField();
    drawFieldTrajectory();
    drawBitcoinRail();
    drawOpenSpaceDNA();
    const points=visible.map((row,i)=>place(row,i));
    const indexByName=new Map();
    visible.forEach((row,i)=>{if(row.entry.kind==='seed'||row.entry.kind==='branch') indexByName.set(row.entry.name,i);});
    for (let i=0;i<visible.length;i++) {
      const row=visible[i], e=row.entry,z=zFor(i);
      drawable.push({z:z-.12,draw:()=>drawGate(row,i)});
      drawable.push({z:z-.34,draw:()=>drawBeacon(row,i)});
      if (e.kind==='branch' && indexByName.has(e.parent)) {
        const parent=points[indexByName.get(e.parent)], child=points[i];
        drawable.push({z:z-.17,draw:()=>drawTrace(parent,child)});
      }
    }
    const coreZ=Math.max(198,zFor(ordered.length-1)+60);
    drawable.push({z:coreZ,draw:drawCore});
    if (observer.visible) drawable.push({z:observer.z,draw:drawObserver});
    drawable.sort((a,b)=>b.z-a.z);
    for (const d of drawable) d.draw();
    }
    if (observerDetail) observerDetail.textContent = observerInfo();
    const behind=ordered.reduce((n,row,i)=>n+(zFor(i)<cameraZ?1:0),0);
    const speedText=btcFlight.active ? `BTC ×${speedLevels[speedIndex]}` :
      `×${speedLevels[speedIndex]} · WARP ${warpRampEnabled?currentRamp.toFixed(1)+'×':'AUS'}`;
    coords.textContent=`X ${shipX.toFixed(1)} · Y ${shipY.toFixed(1)} · Z ${cameraZ.toFixed(1)} · ${Math.round(flightSpeed)} u/s · ${speedText} · ${fps||'…'} FPS · T ${behind}/${ordered.length}`;
    if(interior)coords.textContent+=' · Innenraum · Schale '+interior.shell.toString()+' · Home zum Ausgang';
    timeLabel.textContent=slider.value+' / '+ordered.length;
    timeLabel.title=Number(slider.value)?ordered[Number(slider.value)-1].at:'';
    captureRecordingFrame();
  }
  function redraw() { drawScene(); }
  function refreshTimeline() {
    timeline.replaceChildren();
    ordered.forEach((row,index)=>{
      const li=document.createElement('li'),button=document.createElement('button');
      button.dataset.key=row.key;
      const num=document.createElement('b');num.textContent=String(index+1).padStart(2,'0');
      const body=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');
      strong.textContent=label(row);small.textContent=row.entry.kind.startsWith('funding-')?new Date(row.at).toLocaleDateString('de-DE',{timeZone:'UTC'})+(row.entry.kind!=='funding-report'?' · Blockzeit':' · Veröffentlichung'):new Date(row.at).toLocaleString('de-DE')+' · lokal';
      body.append(strong,small);button.append(num,body);li.append(button);timeline.append(li);
      button.onclick=()=>focusRow(index);
    });
  }
  function focusRow(index) {
    if (btcFlight.active) stopBitcoinFlight();
    if (index<0||index>=ordered.length) return;
    interior=null;
    showEvidence(true);
    auto=false;motion=false;updateMotionButton();
    follow.setAttribute('aria-pressed','false');follow.textContent='○ Live folgen';
    slider.value=String(index+1); selected=ordered[index].key;
    targetZ=clamp(zFor(index)-18,0,maxTravel());
    showDetail();drawScene();
  }
  slider.addEventListener('input',()=>{
    if (!ordered.length) return;
    focusRow(Number(slider.value)-1);
  });
  follow.onclick=()=>{
    if (btcFlight.active) stopBitcoinFlight();
    auto=true;follow.setAttribute('aria-pressed','true');follow.textContent='● Live folgen';
    slider.value=String(ordered.length); targetZ=null;drawScene();
  };
  function updateMotionButton() {
    motionToggle.textContent=motion?'Ⅱ Flug halten':'▶ Reiseflug';
    motionToggle.setAttribute('aria-pressed',String(motion));
    flightStatus.textContent=motion?'KORRIDOT · REISEFLUG':'KORRIDOT · FREIER RAUM';
  }
  motionToggle.onclick=()=>{motion=!motion;targetZ=null;updateMotionButton();};
  // Hold-to-fly surfaces work for touch, mouse, pen, and keyboard without
  // generating synthetic garden events or relying on click-toggle state.
  function bindHold(id, setHeld) {
    const button=document.getElementById(id);
    const change=down=>{setHeld(down);button.classList.toggle('held',down);
      button.setAttribute('aria-pressed',String(down));
      if(down)targetZ=null;
    };
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      event.preventDefault();change(true);
      try{button.setPointerCapture(event.pointerId);}catch(_){}
    });
    const release=()=>change(false);
    button.addEventListener('pointerup',release);
    button.addEventListener('pointercancel',release);
    button.addEventListener('lostpointercapture',release);
    button.addEventListener('keydown',event=>{
      if(event.key===' '||event.key==='Enter'){
        event.preventDefault();if(!event.repeat)change(true);
      }
    });
    button.addEventListener('keyup',event=>{
      if(event.key===' '||event.key==='Enter'){event.preventDefault();release();}
    });
    button.addEventListener('blur',release);
    return release;
  }
  document.getElementById('observerHome').onclick=()=>{
    if (btcFlight.active) stopBitcoinFlight();
    showEvidence(true);observerHome();observer.visible=true;selected=OBSERVER_KEY;showDetail();drawScene();
    canvas.focus({preventScroll:true});
  };
  const releaseReverse=bindHold('reverseHold',value=>{reverseHeld=value;});
  const releaseBrake=bindHold('brakeHold',value=>{brakeHeld=value;});
  document.getElementById('zoomIn').onclick=()=>{lens=clamp(lens*1.15,.55,1.9);drawScene();};
  document.getElementById('zoomOut').onclick=()=>{lens=clamp(lens/1.15,.55,1.9);drawScene();};
  document.getElementById('home').onclick=()=>{
    interior=null;
    motion=false;updateMotionButton();cameraZ=0;targetZ=null;
    shipX=shipY=shipVX=shipVY=shipVZ=flightSpeed=wheelImpulse=opticalBeta=0;
    yawOffset=pitchOffset=targetYaw=targetPitch=roll=0;drawScene();
  };
  document.getElementById('horizon').onclick=()=>{
    interior=null;
    if(btcFlight.active)stopBitcoinFlight();
    routeAutopilot=false;motion=false;updateMotionButton();targetZ=horizonCenter()[2]-22;
    selected=CORE;showDetail();drawScene();
    canvas.focus({preventScroll:true});
  };
  const warpToggle=document.getElementById('warpToggle');
  warpToggle.onclick=()=>{
    deformation=!deformation;warpToggle.setAttribute('aria-pressed',String(deformation));
    warpToggle.textContent=deformation?'Flugoptik AN':'Flugoptik AUS';drawScene();
  };
  function pick(x,y) {
    const candidates=targets.filter(p=>p.rect ? x>=p.rect.left&&x<=p.rect.right&&y>=p.rect.top&&y<=p.rect.bottom
      : Math.hypot(x-p.x,y-p.y)<=p.r);
    // Select the nearest visible surface rather than an event hidden behind another marker.
    candidates.sort((a,b)=>a.depth-b.depth);
    return candidates.length ? candidates[0].key : null;
  }
  function localPoint(event) {
    const rect=canvas.getBoundingClientRect();
    return {x:event.clientX-rect.left,y:event.clientY-rect.top};
  }
  function steerTo(point,weight=1) {
    // Hold-to-fly changes orientation relative to the current view, not an
    // invisible forward-facing cone. Mouse drag and arrow keys turn freely.
    const nx=point.x/Math.max(1,width)-.5,ny=.5-point.y/Math.max(1,height);
    targetYaw=yawOffset+nx*1.4*weight;
    targetPitch=clamp(pitchOffset+ny*.8*weight,-1.48,1.48);
  }
  function endPointer(event) {
    if(!pointerStart || pointerStart.id!==event.pointerId)return;
    const initial=pointerStart;
    pointerStart=null;
    if(initial.mode==='pilot')thrustHeld=false;
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    if(dragged){dragged=false;return;}
    // Touch tap still selects receipt markers; touch hold/drag flies.
    if(initial.mode==='pilot' && !(event.pointerType==='touch' && !dragged &&
      performance.now()-initial.at<260)) return;
    const p=localPoint(event),key=pick(p.x,p.y);
    if(key){selected=key;motion=false;targetZ=null;updateMotionButton();showDetail();}
    else {selected=null;showDetail();}
    drawScene();
  }
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='touch'&&event.button!==0&&event.button!==2)return;
    const p=localPoint(event);
    // Right-held mouse and touch both control live thrust + direction.
    const mode=event.pointerType==='touch'||event.button===2?'pilot':'look';
    pointerStart={id:event.pointerId,x:p.x,y:p.y,startYaw:targetYaw,startPitch:targetPitch,
      startBtcYaw:btcFlight.orbitYaw,startBtcPitch:btcFlight.orbitPitch,mode,at:performance.now()};
    dragged=false;
    if(mode==='pilot'){
      thrustHeld=true;
      steerTo(p,.6);
    }
    canvas.focus({preventScroll:true});
    canvas.setPointerCapture(event.pointerId);
    if(event.pointerType==='touch')event.preventDefault();
  });
  canvas.addEventListener('pointermove',event=>{
    const p=localPoint(event);
    if(pointerStart&&pointerStart.id===event.pointerId){
      const dx=p.x-pointerStart.x,dy=p.y-pointerStart.y;
      if(Math.hypot(dx,dy)>6)dragged=true;
      if(pointerStart.mode==='pilot') steerTo(p);
      else if(dragged && btcFlight.active){
        btcFlight.orbitYaw=pointerStart.startBtcYaw-dx*.007;
        btcFlight.orbitPitch=clamp(pointerStart.startBtcPitch+dy*.005,-1.27,1.27);
      }
      else if(dragged){
        targetYaw=pointerStart.startYaw-dx*.0032;
        targetPitch=clamp(pointerStart.startPitch+dy*.0026,-1.48,1.48);
      }
    }else{
      const hit=pick(p.x,p.y);
      if(hit!==lastHover){lastHover=hit;canvas.style.cursor=hit?'pointer':'crosshair';}
    }
  });
  canvas.addEventListener('pointerup',endPointer);
  canvas.addEventListener('pointercancel',event=>{
    if(pointerStart&&pointerStart.id===event.pointerId){pointerStart=null;dragged=false;thrustHeld=false;}
  });
  canvas.addEventListener('lostpointercapture',()=>{if(pointerStart){pointerStart=null;thrustHeld=false;dragged=false;}});
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();
    // Wheel contributes a decaying velocity impulse instead of stepping cameraZ.
    wheelImpulse=clamp(wheelImpulse+Math.sign(event.deltaY)*7,-25,25);
  },{passive:false});
  const allowed=new Set(['w','s','a','d','q','e','x','i','j','k','l','u','o','b','n','p','v','f','g','r','Shift','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Home','Enter']);
  const navigationKeys=['w','s','a','d','q','e','x','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home'];
  canvas.addEventListener('keydown',event=>{
    const key=event.key.length===1&&event.key!==' '?event.key.toLowerCase():event.key;
    if(!allowed.has(key))return;
    event.preventDefault();keys.add(key);
    if(event.repeat)return;
    if(key==='g'){routeAutopilot=!routeAutopilot;motion=routeAutopilot;if(routeAutopilot)targetZ=null;updateMotionButton();}
    else if(key==='r'){flightRouteVisible=!flightRouteVisible;}
    else if(key==='v'){showEvidence(!evidenceVisible);}
    else if(key==='f'){focusToggle?.onclick();}
    else if(key==='b'){showEvidence(true);if(btcFlight.active)stopBitcoinFlight();observerHome();selected=OBSERVER_KEY;showDetail();}
    else if(key==='p'&&btcFlight.active){btcFlight.playing=!btcFlight.playing;}
    else if(key==='n'){observer.visible=!observer.visible;}
    else if(key==='Home'){if(btcFlight.active)stopBitcoinFlight();
      interior=null;
      cameraZ=0;shipX=shipY=shipVX=shipVY=shipVZ=flightSpeed=wheelImpulse=opticalBeta=0;
      yawOffset=pitchOffset=targetYaw=targetPitch=roll=0;targetZ=null;motion=false;routeAutopilot=false;
    }else if(key===' '){motion=!motion;targetZ=null;}
    else if(key==='Enter'){
      const p=targets.filter(p=>p.key!==CORE).sort((a,b)=>a.depth-b.depth)[0];
      if(p){selected=p.key;showDetail();}
    }
    updateMotionButton();drawScene();
  });
  canvas.addEventListener('keyup',event=>{
    const key=event.key.length===1&&event.key!==' '?event.key.toLowerCase():event.key;
    keys.delete(key);
  });
  canvas.addEventListener('blur',()=>{keys.clear();thrustHeld=false;pointerStart=null;});
  window.addEventListener('blur',()=>{
    keys.clear();thrustHeld=false;pointerStart=null;releaseReverse();releaseBrake();
  });
  window.addEventListener('resize',drawScene);
  document.addEventListener('visibilitychange',()=>{
    lastFrame=0;simulationLast=null;
    if(document.hidden){thrustHeld=false;keys.clear();pointerStart=null;
      releaseReverse();releaseBrake();}
  });
  function animate(time) {
    if(simulationMode==='doppelacht'&&Number.isFinite(materialView.distance)&&
       (navigationKeys.some(key=>keys.has(key))||thrustHeld||reverseHeld||motion||routeAutopilot||btcFlight.active||evidenceVisible)){
      approach.stop();delete materialView.distance;spatialTools.meter(undefined);
    }
    simulationTick(time);
    const dt=lastFrame?clamp((time-lastFrame)/1000,0,.05):0;
    lastFrame=time;
    if(document.hidden){requestAnimationFrame(animate);return;}
    if(btcFlight.active){
      const yr=(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0);
      const pr=(keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0);
      btcFlight.orbitYaw+=yr*dt*1.8;
      btcFlight.orbitPitch=clamp(btcFlight.orbitPitch+pr*dt*1.2,-1.27,1.27);
      btcTick(dt);opticalBeta*=Math.exp(-dt*6);
      fpsCounter++;if(!fpsLast)fpsLast=time;
      if(time-fpsLast>=700){fps=Math.round(fpsCounter*1000/(time-fpsLast));fpsCounter=0;fpsLast=time;}
      phase+=dt*350;drawScene();requestAnimationFrame(animate);return;
    }
    if(routeAutopilot && (keys.has('ArrowLeft')||keys.has('ArrowRight')||keys.has('ArrowUp')||keys.has('ArrowDown')||keys.has('s'))){routeAutopilot=false;motion=false;}
    routeSteering(dt);
    const damping=1-Math.exp(-dt*7.5);
    const keyYaw=(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0);
    const keyPitch=(keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0);
    targetYaw+=keyYaw*dt*1.35;
    if(keyPitch)targetPitch=clamp(targetPitch+keyPitch*dt*1.05,-1.48,1.48);
    const bank=clamp(-(targetYaw-yawOffset)*.28,-.19,.19);
    yawOffset+=(targetYaw-yawOffset)*damping;
    pitchOffset+=(targetPitch-pitchOffset)*damping;
    roll+=(bank-roll)*damping;
    const forward=thrustHeld||keys.has('w'),reverse=reverseHeld||keys.has('s');
    const boost=keys.has('Shift'),braking=brakeHeld||keys.has('x');
    const cruising=!braking&&!reverse&&(forward||motion);
    cruiseAge=cruising&&warpRampEnabled?Math.min(60,cruiseAge+dt):0;
    currentRamp=cruising&&warpRampEnabled?rampAt(cruiseAge):1;
    const baseWanted=braking?0:reverse?(boost?-78:-55):forward?(boost?53:36):motion?12:0;
    const wanted=baseWanted*speedLevels[speedIndex]*currentRamp;
    const reversing=(flightSpeed>0&&wanted<0)||(flightSpeed<0&&wanted>0);
    const response=braking?14:reversing?11:wanted?5.3:9;
    flightSpeed+=(wanted-flightSpeed)*(1-Math.exp(-dt*response));
    if(braking)wheelImpulse*=Math.exp(-dt*18);
    if(braking&&Math.abs(flightSpeed)<.1){flightSpeed=0;wheelImpulse=0;}
    if(forward||reverse||braking)targetZ=null;
    const sidestep=(keys.has('d')?1:0)-(keys.has('a')?1:0);
    const lift=(keys.has('e')?1:0)-(keys.has('q')?1:0);
    const cy=Math.cos(yawOffset),sy=Math.sin(yawOffset),cp=Math.cos(pitchOffset),sp=Math.sin(pitchOffset);
    const thrust=flightSpeed+wheelImpulse,lateral=(boost?24:13);
    const vx=braking?0:sy*cp*thrust+cy*sidestep*lateral;
    const vy=braking?0:sp*thrust+lift*lateral;
    const vz=braking?0:cy*cp*thrust-sy*sidestep*lateral;
    const oldVX=shipVX,oldVY=shipVY,oldVZ=shipVZ;
    const drift=1-Math.exp(-dt*(braking?15:7));
    shipVX+=(vx-shipVX)*drift;shipVY+=(vy-shipVY)*drift;shipVZ+=(vz-shipVZ)*drift;
    if(targetZ!==null){
      const t=1-Math.exp(-dt*5.5),diff=targetZ-cameraZ;
      const [goalX,goalY]=selected===CORE?horizonCenter():[0,0];
      cameraZ+=diff*t;shipX+=(goalX-shipX)*t;shipY+=(goalY-shipY)*t;
      yawOffset*=1-t;pitchOffset*=1-t;targetYaw=yawOffset;targetPitch=pitchOffset;
      shipVX=shipVY=shipVZ=flightSpeed=wheelImpulse=0;
      if(Math.abs(diff)<.04){cameraZ=targetZ;shipX=goalX;shipY=goalY;targetZ=null;}
    }else{
      const step=[(oldVX+shipVX)*.5*dt,(oldVY+shipVY)*.5*dt,(oldVZ+shipVZ)*.5*dt];
      if(interior)horizonSpace.advanceInside(interior,step);
      else if(horizonSpace)interior=horizonSpace.enterHorizon([shipX,shipY,cameraZ],step,horizonCenter());
      if(interior)[shipX,shipY,cameraZ]=horizonSpace.interiorPosition(interior);
      else {shipX+=step[0];shipY+=step[1];cameraZ+=step[2];}
    }
    if(braking&&Math.hypot(shipVX,shipVY,shipVZ)<.03)shipVX=shipVY=shipVZ=0;
    wheelImpulse*=Math.exp(-dt*4.7);if(Math.abs(wheelImpulse)<.02)wheelImpulse=0;
    const speed=Math.hypot(shipVX,shipVY,shipVZ);
    const opticalTarget=deformation?.96*(1-Math.exp(-speed/170)):0;
    opticalBeta+=(opticalTarget-opticalBeta)*(1-Math.exp(-dt*4));
    if(opticalBeta<1e-6)opticalBeta=0;
    observerTick(dt);
    if(motion||thrustHeld||deformation||Math.abs(flightSpeed)>.1)phase+=dt*1000;
    fpsCounter++;if(!fpsLast)fpsLast=time;
    if(time-fpsLast>=700){fps=Math.round(fpsCounter*1000/(time-fpsLast));fpsCounter=0;fpsLast=time;}
    const start=performance.now();drawScene();const renderMs=performance.now()-start;
    if(renderMs>24)quality=.55;else if(renderMs<13)quality=Math.min(1,quality+.015);
    requestAnimationFrame(animate);
  }
  updateMotionButton();
  redraw();
  requestAnimationFrame(animate);
  // A read-only geometry probe for local reproducible interaction tests.
  window.__korridotProbe=Object.freeze({
    redraw:()=>drawScene(),
    simulation:()=>({mode:simulationMode,playing:simulationPlaying,debt:simulationDebt,state:simulationState(),diagnostics:simulationModel?.diagnostics()||null}),
    material:()=>({view:{...materialView},observations:materialObservations.map(p=>({...p})),physicalDomain:simulationMode==='doppelacht'?'3D free material, 3D observation camera':'2D material plane, 3D observation camera',physicalScale:materialScale}),
    route:()=>Object.freeze({visible:flightRouteVisible,autopilot:routeAutopilot,waypoint:routeTarget().index,lensRadius:opticalState.lensRadius||0,btcBlocks:btcBlocks.length}),
    spaceflight:()=>Object.freeze({version:'1.0.0',beta:opticalBeta,interior:horizonSpace?.saveInterior(interior)??null,skyBend:opticalState.skyBend||0,
      velocity:{x:shipVX,y:shipVY,z:shipVZ},camera:camera(),evidenceVisible,
      opticsReady:!!spaceOptics,renderer:cosmosRenderer?.stats?.()||null}),
    cosmos:()=>Object.freeze({ready:!!cosmosRenderer,enabled:cosmosEnabled,error:cosmosError}),
    optics:()=>Object.freeze({mode:opticMode, rays:opticRays.map(r=>({wave:r.wave,offset:r.offset,hit:r.hit,angleDeg:r.angleDeg}))}),
    hyperspeed:()=>Object.freeze({preset:speedLevels[speedIndex],warpEnabled:warpRampEnabled,
      cruiseAge,observerAge,ramp:currentRamp,btcPlayback:btcFlight.active,btcElapsed:btcFlight.elapsed}),
    btc:()=>Object.freeze({active:btcFlight.active,playing:btcFlight.playing,
      blocks:btcBlocks.map(b=>({height:b.height,hash:b.hash,previous:b.previous,time:b.time,
        x:b.position.x,y:b.position.y,z:b.position.z})),
      playable:btcPlayable,reason:btcRailStatus,elapsed:btcFlight.elapsed,
      sourceTimeMs:btcFlight.sourceTimeMs,orbitYaw:btcFlight.orbitYaw,orbitPitch:btcFlight.orbitPitch}),
    observer:()=>Object.freeze({id:observer.id,x:observer.x,y:observer.y,z:observer.z,
      t:observer.seconds,T:Number(slider.value),visible:observer.visible,ready:observer.ready}),
    snapshot:()=>({z:cameraZ,x:shipX,y:shipY,speed:flightSpeed,thrust:thrustHeld,
      reverse:reverseHeld,brake:brakeHeld,autopilot:motion,
      yaw:yawOffset,pitch:pitchOffset,fps,quality,
      targets:targets.map(({key,x,y,depth,branch,observationId})=>({key,x,y,depth,branch,observationId})),
      deformation,flight:motion,events:ordered.length,selected}),
    projection:()=>{const p=project(surface(cameraZ+40,.8));return p ? {x:p.x,y:p.y,depth:p.depth}:null;}
  });

  async function openFundingRail(){
    try{
      const {reports}=await import('./gg24-funding.mjs');
      ordered=reports.map((r,i)=>({key:'gg24-'+i,at:r.at,source:r.kind!=='funding-report'?'OP MAINNET':'GITCOIN',entry:{...r,seq:i+1}}));
      slider.max=String(ordered.length);slider.value=String(ordered.length);selected=ordered[ordered.length-1].key;
      showEvidence(true);setWorkshop(true);
      const title=timeline.previousElementSibling;if(title?.tagName==='H2')title.textContent='GG24 · Zeitspur der Berichte';
      const intro=document.querySelector('.public-ready');if(intro)intro.hidden=true;
      connection.textContent='GG24 · Gitcoin und OP Mainnet';connection.classList.remove('off');
      heads.textContent='Zwei Berichte (USD) · Antrag und Übertragung (DAI) · T nach Quelle';
      refreshTimeline();redraw();showDetail();
    }catch(error){connection.textContent='Förder-Zeitspur konnte nicht geladen werden · '+error.message;}
  }

  async function poll() {
    try {
      const reply=await fetch('/state',{cache:'no-store'});
      const data=await reply.json();
      if(!reply.ok)throw new Error(data.error||'Belegprüfung fehlgeschlagen');
      if(!Array.isArray(data.garden)||!Array.isArray(data.runs)||!Array.isArray(data.jobs))throw new Error('Ungültiger Belegzustand');
      connection.textContent='● LOKAL LIVE · 2 S';connection.classList.remove('off');
      if(!snapshot||snapshot.gardenHead!==data.gardenHead||snapshot.runHead!==data.runHead||snapshot.jobHead!==data.jobHead){
        snapshot=data;ordered=entryList(data);
        rebuildBitcoinRail();
        slider.max=String(ordered.length);
        if(auto)slider.value=String(ordered.length);
        else slider.value=String(Math.min(Number(slider.value),ordered.length));
        refreshTimeline();redraw();showDetail();
      }
      heads.textContent='GARTEN '+data.garden.length+' EREIGNISSE · '+String(data.gardenHead).slice(0,16)+
        ' / LÄUFE '+data.runs.length+' EREIGNISSE · '+String(data.runHead).slice(0,16)+
        ' / AUFTRÄGE '+data.jobs.length+' EREIGNISSE · '+String(data.jobHead).slice(0,16)+
        ' · X/Y/Z = MODELL · T = BELEGZEIT · KEIN AUTOMATISCHER GITHUB-ABRUF';
    } catch(error) {
      connection.textContent='● ANGEHALTEN · '+error.message;connection.classList.add('off');
    }
  }
  if(fundingRail)openFundingRail();else{poll();setInterval(poll,2000);}
})();
