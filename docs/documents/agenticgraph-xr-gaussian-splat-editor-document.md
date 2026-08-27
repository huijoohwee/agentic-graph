---
title: "AgenticGraph XR Gaussian Splat Editor"
doc_type: "Runtime Design and Clean-Room Boundary"
status: "runtime-ready"
lang: "en-US"
frontmatter_contract: "required"
runtime_scope: "Toolbar Surface Mode XR Gaussian PLY inspection, non-destructive editing, optimization, and publication"
deploy_boundary: "Dev-only"
---

# AgenticGraph XR Gaussian Splat Editor

## Scope

Toolbar → Surface Mode → XR Mode extends the existing spatial-capture stage with one source-owned Gaussian PLY workflow:

1. Load the existing preview-first, worker-parsed PLY payload.
2. Inspect source, loaded, rendered, and visible splat counts; source bytes; estimated GPU bytes; bounds; opacity; and scale.
3. Edit a non-destructive local draft with render, center, and footprint views plus opacity, crop, scale, brightness, and saturation controls.
4. Optimize the artifact deterministically with the same visibility filters and a bounded point-budget ratio.
5. Download an independently serialized Gaussian PLY and provider-neutral edit manifest, or explicitly publish the optimized PLY through configured AgenticGraph storage.

glTF and GLB remain separate Three.js model-asset formats. They are not treated as Gaussian encodings. SPZ sources remain recognizable import manifests but are reported as unsupported until AgenticGraph owns an independently implemented codec.

## Clean-Room Reference Boundary

The public [SuperSplat overview](https://developer.playcanvas.com/user-manual/supersplat/), [editor overview](https://developer.playcanvas.com/user-manual/supersplat/editor/), [import and export guide](https://developer.playcanvas.com/user-manual/supersplat/editor/import-export/), and [publishing guide](https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/supersplat/publishing/) inform only the product-level taxonomy of inspect, edit, optimize, and publish. The hosted editor is reference evidence only.

The AgenticGraph implementation is independently authored. It must not copy, translate, port, or import upstream source, algorithms, shaders, workers, codecs, data structures, schemas, UI markup, CSS, icons, keyboard mappings, assets, screenshots, tests, sample files, filenames, documentation prose, or publishing layouts. It must not add a package, Git dependency, submodule, binary, iframe, local bridge, API call, runtime fetch, telemetry call, storage call, or authentication dependency tied to the reference project or its hosted editor.

Runtime modules and dependency manifests must not contain reference-project identifiers. Documentation may retain the public links above to make the clean-room boundary auditable.

## Native Owners

| Concern | Owner | Contract |
|---|---|---|
| PLY ingest | `spatialCaptureAssetRuntime.ts` and `plyPointCloudWorker.ts` | Source-owned, range-previewed, bounded, transferable parsing with no remote editor runtime. |
| Gaussian decode | `plyPointCloud.ts` | Normalizes degree-zero color, sigmoid opacity, exponential scale, quaternion, position, and bounds. |
| Draft model | `gaussianSplatEditorModel.ts` | Normalizes edit settings, computes inspection data, selects visible indices, serializes optimized PLY, and builds a provider-neutral manifest. |
| Draft runtime | `gaussianSplatEditorRuntime.ts` | Holds one scene-keyed external-store snapshot shared by the stage and FloatingPanel. |
| Panel projection | `GaussianSplatEditorSection.tsx` inside Media 3D `SpatialAssetToolsPanel.tsx` | Projects inspect, edit, optimize, download, reset, and explicit publish actions without a separate XR FloatingPanel route. |
| Geometry | `spatialCaptureGeometryRuntime.ts` | Reuses source arrays, progressive attribute views, adaptive budgets, and bounded direction sorting. |
| Material | `spatialCaptureGaussianMaterial.ts` | Applies crop, opacity, scale, appearance, center, and footprint draft settings without mutating source arrays. |
| Stage | `SpatialCaptureManifestStage.tsx` | Hydrates the draft runtime, consumes its settings, and preserves camera/stage ownership. |
| Download | `downloadBlob` | Reuses the delayed-revoke local artifact path. |
| Optional publish | `uploadGeneratedWorkspaceBlobToAgenticGraphStorage` | Runs only after an explicit Publish action and only when repository-owned storage sync is configured. |

## Runtime Truth

| Capability | State |
|---|---|
| Three.js / React Three Fiber | Active scene runtime. |
| WebGL / WebGL2 | Active renderer and Gaussian shader path. |
| WebGPU | Browser capability probe only; not the active renderer. |
| WebXR | Native AR-first, VR-fallback session entry when supported. |
| glTF / GLB | Supported model-asset sources, independent of the splat pipeline. |
| Gaussian PLY | Supported editor and optimized-export source. |
| SPZ | Recognized source, unsupported decoder/editor. |

The panel must not describe an available browser API as an active renderer. Unsupported source formats must not fall through to retained graph or model content.

## Non-Destructive Edit Contract

The source arrays remain immutable. Live settings are shader uniforms and a deterministic per-instance visibility mask:

- opacity floor rejects low-alpha splats;
- crop inset contracts all six bounds symmetrically;
- scale ceiling rejects oversized footprints relative to the source maximum;
- brightness and saturation alter only displayed/exported degree-zero color;
- render, center, and footprint modes change inspection visualization;
- point-budget ratio bounds both the live visible set and deterministic exported set.

Reset restores the normalized defaults. Preview-to-full promotion preserves the scene-keyed draft.

## Optimized PLY Contract

The exporter writes a binary little-endian PLY with the independently defined properties required by the current AgenticGraph Gaussian decoder: position, degree-zero color, opacity logit, logarithmic scale, and quaternion. It reverses the parser's coordinate/quaternion normalization, applies current visibility and appearance edits, and samples deterministically when the point budget is below the visible count.

The edit-manifest JSON records the schema version, normalized settings, input/output counts, bounds, estimated bytes, and source fidelity without wall-clock fields or provider identifiers. Equal input arrays and settings produce equal output bytes.

## Mutation and Cost Boundaries

- Inspection and edits are local, in-memory, and token-free.
- Download creates browser blobs only.
- Publish is an explicit user action. It uses only configured AgenticGraph storage and falls back to local download when storage is unavailable.
- No reference editor, model provider, paid API, telemetry endpoint, iframe, or external asset host is contacted.
- This change does not deploy, mirror to production, or add a Cloudflare mutation outside the existing opt-in storage contract.

## VCC

Given a valid Gaussian PLY spatial-capture document in XR Mode, when the operator changes visibility, appearance, visualization, and point-budget settings, then the stage updates without replacing source arrays; inspection counts and byte estimates update; reset restores defaults; optimized PLY export reparses as a Gaussian splat with the expected filtered count; and explicit publish either returns a configured AgenticGraph URL or downloads the same optimized artifact locally.

VCC: Verify model round-trip tests, runtime-store tests, source/dependency clean-room guards, Canvas TypeScript and lint checks, spatial WebXR entry, and the local browser workflow; stop without deployment.
