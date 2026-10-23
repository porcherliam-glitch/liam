// 3D workshop module (docs/SPEC-3D.md): local text → 3D and image → 3D through ComfyUI.
// Wiring (src/daemon/app.ts):
//   s.threed = createThreeDService(s);                      // factory calls no other service
//   await step('3D-Werkstatt', () => s.threed.recover());   // after the DB/journal recovery
//   s.tools.register(createGenerate3dModelTool(s));         // agent tool (coder role lists 'generate_3d_model')
//   registerThreeDRpc(router, s);                           // threed.*
//   maintenance: (s.threed as ThreeDServiceImpl).prune(cutoff)
//   shutdown:    await timed('3D-Werkstatt', …, () => s.threed.shutdown())
// The ComfyUI integration module ("Werkzeuge" page) lives in src/daemon/integrations/modules-comfyui.ts and shares the
// layout detection of ./engine.ts.
export { createThreeDService, sanitizeName, groupPromptNodes, PHASES, RESTART_MESSAGE, SHUTDOWN_MESSAGE } from './threed-service';
export type { ThreeDServiceImpl, ThreeDServiceOptions, ComfyClientLike, WorkflowApi } from './threed-service';
export { registerThreeDRpc } from './rpc';
export { createGenerate3dModelTool } from './tool';
export { THREED_CATALOG, modelsWithPresence, filesExclusiveTo } from './catalog';
export type { CatalogFile, CatalogModel } from './catalog';
export { detectComfyLayouts, normalizeEngineUrl, endpointCandidates } from './engine';
export type { ComfyInstall, ComfyLayouts } from './engine';
export { ComfyClient } from './comfy-client';
