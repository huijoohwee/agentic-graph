---
title: "AgenticGraph Image To Three.js Skill API"
graphId: "md:agenticgraph-image-to-threejs-api"
doc_type: "API Contract"
date: "2026-07-22"
lang: "en-US"
schema: "agenticgraph-image-to-threejs-api/v1"
frontmatter_contract: "required"
status: "runtime-ready-dev"
runtime_scope: "AgenticGraph Canvas Card, Widget, Storyboard, overlay, and Rich Media Panel surfaces"
runtime_claim: "provider-free Dev conversion and browser render proof only"
publish_policy: "Dev-only until explicit operator approval"
source_owner: "canvas/src/features/image-to-threejs and canvas/src/features/image-to-glb"
external_pattern_sources:
  - "https://github.com/hoainho/img2threejs"
  - "https://github.com/microsoft/TRELLIS.2"
copy_policy: "conceptual inspiration only; forbid external code, prompt, schema, example, fixture, test, prose, asset, model, weight, package, or runtime dependency"
---

# Image To Three.js Skill API

`image.to-threejs` is a model-free skill, not an agent variant. It converts supported image sources into one typed Three.js projection that existing Card, Widget, Storyboard, overlay, and Rich Media Panel owners can render.

## Invocation

Use the shared route grammar:

```text
/skill.load image.to-threejs #skill-system @image @runtime-proof
```

`/image.to-threejs` in a Card or Widget resolves through the same native contract before the generic text/provider route. `#image-to-threejs` describes the capability and an inline `@` image supplies source context; neither tag executes by itself. No skill-specific command parser, alias registry, provider route, or agent definition is added.

## Input

```ts
type ImageToThreeJsInput = {
  sourceUrl: string
}
```

`sourceUrl` must identify `.png`, `.jpg`, `.jpeg`, or `.svg`, or an equivalent supported image data URL. A connected Widget input takes precedence over the local property fallback as the conversion source; it does not redirect a manual inline `/image.to-threejs` Card Run away from its invoking Widget Card.

## Output

```ts
type ImageToThreeJsManifest = {
  schema: 'agenticgraph-image-to-threejs/v1'
  source: {
    url: string
    kind: 'raster' | 'svg'
    extension: 'jpg' | 'png' | 'svg'
  }
  render: {
    engine: 'three'
    primitive: 'textured-plane' | 'shape-geometry'
  }
  cost: {
    model: 'local-threejs'
    prompt_tokens: 0
    completion_tokens: 0
    cache_hits: 0
    estimated_cost_usd: 0
  }
}
```

The success patch carries `mediaRenderMode: threejs`, the manifest, output MIME, source URL, image tab selection, and run timestamp. Missing and unsupported inputs return typed `missing-source` or `unsupported-format` errors before render work or spend.

## Native Render Lifecycle

- Raster images use `THREE.TextureLoader`, `THREE.SRGBColorSpace`, a textured plane, and explicit texture disposal.
- SVG images use `SVGLoader`, fill `ShapeGeometry`, stroke geometry, bounded group fitting, abortable fetch, and explicit geometry/material disposal.
- The shared `frameloop="demand"` renderer invalidates after asynchronous raster or SVG state becomes renderable.
- Source replacement remounts the keyed raster or SVG loader, disposing the prior resource before the next conversion can render.
- A loader failure returns visibly to the original image surface without provider calls, retry loops, or generated-media backfill.

## Shared Surface Projection

The Storyboard workflow runner resolves either a source-backed skill node or an inline `/image.to-threejs` Card/Widget command before generic text/provider execution. A manual inline Card Run remains scoped to that Widget Card even when it has a connected input Rich Media Panel. Attached album media, inline Markdown image media, and connected inputs share the same source resolver.

For an inline Card invocation, publication creates or reuses a marker-scoped `Three.js Rich Media Panel` owned by the invoking Card. The output panel is identified by its owner anchor and Three.js-output marker; its generated `mediaRenderMode: threejs` patch, manifest, output MIME, source URL, image tab selection, and timestamp live there. Fresh runs never mutate the input Widget Card or its input Rich Media Panel. An explicit rerun can repair only the prior legacy derived-output signature, preserving the Card prompt and raw input media while leaving marker-owned and authored Three.js panels untouched. Shared media specs preserve `mediaRenderMode: threejs` through Card, Widget, Storyboard, 2D overlay, Three overlay, and Rich Media Panel call sites.

The public Card chrome suppresses the legacy `Text Generation` metadata rail for this default Widget Card projection, leaving the visible card identity as `Widget Card` while preserving `/`, `#`, and `@` invocation chips.

## External Boundary

The named provenance sources inform only neutral staged-reconstruction, compact-planning, and separated-quality principles. AgenticGraph uses independently authored code, prompts, schemas, fixtures, tests, prose, packages, algorithms, hierarchy, and runtime contracts. Neither external project is a runtime, build, service, model, or asset dependency. The skill uses the Three.js and React Three Fiber versions already owned by Canvas.

## Reference-driven GLB and glTF fidelity

`/image.to-glb`, `@image-to-glb`, and `#image-to-glb` reuse the same source resolver and a 192-pixel bounded reference reader. The native owner turns connected silhouette runs into quantized, beveled `ExtrudeGeometry` volumes, keeps disconnected negative spaces open, compacts repeated evidence into semantic components, and records hidden depth as inferred with bounded confidence. The object-specific ring template and generic `BoxGeometry` band fallback were removed.

One result owns the compact reconstruction plan, reviewable TypeScript, Three.js scene, program digest, reference digest, named-part manifest, rigid-part pivots, attachment sockets, inspection clip, and separated quality report. Deterministic evidence uses `validated`, not an unperformed visual approval. Admission compares a bounded rasterization of the actual model front with the reference silhouette, checks reference-to-PBR color retention, fingerprints geometry plus all supported export-affecting material, visibility, action-node, hierarchy, and animation state, and exports from a synchronously owned snapshot so caller mutation cannot race serialization. The same trusted scene is serialized as a binary GLB and editable glTF JSON with an external `.bin` buffer. The detailed owner and thresholds live in [agenticgraph-image-to-glb-api.md](agenticgraph-image-to-glb-api.md).

The GLB Rich Media surface reports `ready` only after the installed Three.js `GLTFLoader` parses a renderable scene. Reference colors enter Three.js as sRGB, then use the renderer's explicit sRGB/ACES output policy and a scoped neutral-warm studio rig. A bounds-driven camera recomputes distance after load and resize so landscape, square, and portrait panels keep the model inside the viewport without reducing it to a thumbnail. Native in-repo `OrbitControls` then own left-drag orbit, right-drag pan, wheel/pinch zoom, damping, and cursor-centred dolly inside the selected or otherwise interactive GLB panel. Bounds-derived clipping and distance limits preserve close inspection, while shared pointer, wheel, and gesture guards keep those model-local actions from moving or zooming the Storyboard canvas. Model-payload caching hashes artifact content, preventing a same-length rerun from reusing stale GLB or glTF bytes. Export uses only options supported by the in-repo Three.js r170 `GLTFExporter`, so GLB and external-buffer glTF retain the same transforms, PBR materials, geometry, and named part structure.

## Dev Proof

| Gate | Proof |
|---|---|
| Typed conversion | Thirteen focused `imageToThreeJs` unit selectors pass for format bounds, zero-cost manifests, inline Card/Widget invocation, Card-owned `Three.js Rich Media Panel` publication without input mutation, legacy derived-output recovery, connected input precedence, shared render mode, real SVG geometry, disposal, and the no-dependency boundary. |
| Compile | Canvas TypeScript exits zero. |
| PNG render | The Rich Media browser smoke derives a typed conversion and proves a non-fallback WebGL Rich Media Panel surface. |
| JPG render | The same smoke generates a real JPEG image in-browser, derives the typed conversion, and proves a non-fallback shared Card WebGL surface. |
| SVG render | The same smoke derives the typed conversion and proves non-fallback SVG geometry in both the Rich Media Panel and Storyboard Widget panel owner. |
| Fallback render | A text-only SVG fixture intentionally yields no Three.js shape or stroke geometry; browser proof observes the original SVG image fallback and no remaining Three.js canvas surface. |
| Resource lifecycle | Focused unit proof creates real SVG fill and stroke meshes, verifies bounded fitting, and observes every geometry and material disposal event. |
| GLB and glTF fidelity | Thirty-three focused `imageToGlb` selectors prove reference-pixel-dependent connected contours, one-piece admission, negative-space retention, compact source and geometry budgets, generated-code execution parity, measured front-IoU and color rejection, exact part manifests, filename invariance, rigid pivots and sockets, exact loop animation, export-state drift and race rejection, responsive camera fitting, local orbit/pan/zoom ownership, GLB loading, external-buffer glTF structure, bounded digest-only source provenance, source-card immutability, idempotent publication, and the external-inspiration boundary. |
| Deployment | Prod mirror and Cloudflare remain untouched. |
