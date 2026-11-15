# KORRIDOT · OpenSpace-inspired DNA experiment

The experiment implements a small **original** JavaScript scene graph for KORRIDOT with
parent-child transforms, reversible temporal keyframes, camera-relative coordinates,
and a first distance/relative-radius culling rule. It does **not** copy or bundle
OpenSpace source code, assets, telescope data, or astronomical ephemerides.

Inspiration, read at OpenSpace tag `releases/v0.22.1`, commit
`eca66210da3a48c9287784ff6a35bb8231b7a5bd`:
- [OpenSpace scene graph structure](https://docs.openspaceproject.com/latest/contribute/development/structure/)
- [SceneGraphNode declarations](https://github.com/OpenSpace/OpenSpace/blob/releases/v0.22.1/include/openspace/scene/scenegraphnode.h)
- [Temporal translation example](https://github.com/OpenSpace/OpenSpace/blob/releases/v0.22.1/data/assets/examples/translation/timelinetranslation/timeline.asset)
- [RenderableGlobe level of detail](https://docs.openspaceproject.com/latest/reference/asset-components/Renderable/RenderableGlobe.html)
- [OpenSpace release notes](https://github.com/OpenSpace/OpenSpace/releases/tag/releases%2Fv0.22.1)

OpenSpace is an independent MIT-licensed project of its contributors. This
independent adaptation uses none of OpenSpace's implementation or image assets.
OpenSpace's large-scale astronomy, SPICE ephemerides, GPU rendering, and cluster
synchronization are **not** reproduced.

All initial positions are **synthetic KORRIDOT model-units**, not astronomical
coordinates. Model time (`model-step`, 0..100) is independent of the receipt
chronology `T` and is never written as a real Garden event.

New module and Node tests:
- `src/openspace_dna.mjs`
- `tests/openspace_dna.test.mjs`

New node after the user's explicit Garden command: `OpenSpace DNA` under
`Funktionsatlas`. No new app/site or additional persistent UI server.
