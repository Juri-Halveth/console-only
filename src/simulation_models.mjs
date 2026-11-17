import './particle-dynamics.js';
import './reference-physics.js';
import './models.js';
import './material-engine.js';
import './material-model.js';
import './material-view.js';
import './doppelacht-source.js';
import './doppelacht.js';
import './doppelacht-view.js';
export const spatial = globalThis.HALVETHDoubleEight;
export const spatialView = globalThis.HALVETHDoubleEightView;
export function create(mode,...args) {
  if(mode==='doppelacht')return spatial.create(...args);
  if(mode==='material')return globalThis.HALVETHMaterial.create(...args);
  return globalThis.HALVETHModels.create(mode,...args);
}
export const materialDraw=(...args)=>globalThis.HALVETHMaterialView.draw(...args);
