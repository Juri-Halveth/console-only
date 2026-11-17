import './particle-dynamics.js';
import './reference-physics.js';
import './models.js';
import './material-engine.js';
import './material-model.js';
import './material-view.js';
export const create=(mode,...args)=>mode==='material'?globalThis.HALVETHMaterial.create(...args):globalThis.HALVETHModels.create(mode,...args);
export const materialDraw=(...args)=>globalThis.HALVETHMaterialView.draw(...args);
