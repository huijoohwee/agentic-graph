---
title: "AgenticGraph Procedural Image To 3D API"
graphId: "md:agenticgraph-image-to-glb-api"
doc_type: "API Contract"
date: "2026-07-22"
lang: "en-US"
schema: "agenticgraph-image-to-glb-api/v1"
frontmatter_contract: "required"
status: "runtime-ready-dev"
runtime_scope: "AgenticGraph Canvas image-to-GLB generation, editable glTF export, and native model surfaces"
runtime_claim: "single-reference, code-only procedural contour reconstruction with rigid-part action readiness"
publish_policy: "Dev-only until explicit operator approval"
source_owner: "canvas/src/features/image-to-glb"
external_pattern_sources:
  - "https://github.com/hoainho/img2threejs"
  - "https://github.com/microsoft/TRELLIS.2"
copy_policy: "conceptual inspiration only; forbid external code, prompt, schema, example, test, fixture, asset, weight, model, configuration, package, or runtime dependency"
---

# Procedural Image To 3D API

`/image.to-glb`, `@image-to-glb`, and `#image-to-glb` route one PNG, JPG, JPEG, or SVG reference through the native AgenticGraph reconstruction owner. The output is a reviewable TypeScript program, a trusted Three.js scene, a binary GLB, and editable glTF JSON with an external `.bin` buffer.

The lane is code-only. It does not admit a serialized mesh, baked vertex payload, model checkpoint, network loader, external runtime, or hidden asset download.

## Reference contract

The reference reader samples at a bounded maximum dimension of 192 pixels. Analysis records:

- foreground isolation method;
- normalized silhouette runs;
- aspect, coverage, upper and lower width, symmetry, and palette evidence;
- a deterministic dimension-and-pixel reference fingerprint;
- explicit front-observed and hidden-surface-inferred provenance.

A single image cannot prove rear, interior, or occluded geometry. AgenticGraph derives depth only from measured coverage and symmetry, records a confidence below `1`, and exposes multi-view capture as the path to stronger 360-degree evidence.

## Compact reconstruction plan

The native owner groups vertically connected silhouette runs into semantic components. Disconnected runs stay disconnected, so holes and negative spaces are not filled by a whole-object bounding volume. Each component becomes a quantized outline and one centered, beveled `THREE.ExtrudeGeometry` volume with a bounded native PBR material.

The compact plan is the source of truth for both the runtime scene and generated TypeScript. It is filename-invariant and changes when reference pixels change.

| Plan budget | Limit |
|---|---:|
| Connected components | 24 |
| Materials | 6 |
| Outline points per component | 48 |
| Estimated triangles | 16,000 |
| Generated procedural source | 28,000 bytes |

Generation keeps the largest evidence-bearing components when the input contains more tracks than the component budget. Admission then requires at least 90% retained contour area and 75% retained silhouette spans. Mechanical checks occur outside model context, so repeated validation does not spend prompt tokens.

## Reviewable procedural source

The TypeScript artifact imports only the installed `three` runtime. It reconstructs:

1. quantized shapes and beveled extrusions;
2. bounded `MeshStandardMaterial` instances;
3. stable mesh names;
4. a model root, per-part pivot, and attachment socket;
5. one loop-continuous quaternion inspection clip.

The source contains no typed-array literal, encoded binary, data URI, loader, provider call, or arbitrary module. Runtime export never evaluates untrusted source; trusted in-repo builders create the scene, while the source remains the auditable code artifact.

Focused proof transpiles and executes the generated TypeScript in a bounded test context where `three` is the only resolvable module, then requires its geometry, materials, hierarchy, names, action metadata, and animation evidence to match the trusted builder. Exportable scene extras retain only source kind and reference digest, never a copied `data:image` source.

## Rigid-part action readiness

Every generated mesh has one stable identity beneath this hierarchy:

```text
ImageToGlbModelRoot
└── ImageToGlbPivot-<part>
    ├── <semantic mesh>
    └── ImageToGlbSocket-<part>
```

Pivot insertion preserves each mesh world matrix within `1e-6`. Sockets are local nodes at the part's upper attachment point. Part metadata classifies the result as rigid, labels the visible front as observed, and labels hidden surfaces as inferred.

The exported inspection clip lasts four seconds, turns the model root no more than 12 degrees in either direction, and ends at the exact starting quaternion. GLB and glTF retain the clip, pivots, sockets, names, geometry, transforms, and PBR materials.

This contract does not claim character deformation. Skinned meshes, morph targets, deformable claims, pre-existing animations, unstable names, duplicate identities, malformed bindings, and non-finite transforms fail closed.

## Quality admission

The artifact-level gate is separate from the compact-plan budget.

| Artifact gate | Requirement |
|---|---:|
| 64x64 reference/model front-silhouette IoU | at least 0.72 |
| Reference/PBR color score | at least 0.82 |
| Retained contour area | at least 0.90 |
| Retained silhouette spans | at least 0.75 |
| Depth / dominant front dimension | at least 0.035 |
| Meshes | at most 96 |
| Triangles | at most 120,000 |
| PBR materials | at most 24 |
| Reviewable source | at most 32,000 characters |

Admission also requires finite geometry attributes, nondegenerate visible 3D bounds, exact manifest-to-mesh parity, valid texture-free PBR ranges, exactly one pivot and one socket per mesh, and one exact clip. The front score rasterizes the actual visible mesh triangles and compares their bounded projection with the measured reference spans; the material score compares reference-span colors with the attached scene materials. A same-aspect wrong shape or wrong palette cannot pass by supplying a score. Geometry, material, hierarchy, action, reference, and compactness metrics remain separate; an identity-critical failure cannot be hidden by an aggregate score.

Native scene evidence fingerprints complete position, normal, index, and other geometry buffers; mesh and ancestor visibility; local and world transforms; bounds; named action-node transforms and paths; exported PBR color, emissive, opacity, transparency, side, map presence, and render state; animation times, values, interpolation, and bindings. Export synchronously deep-clones an owned geometry/material/animation snapshot before its first asynchronous boundary, validates that snapshot, exports both forms, and checks the emitted mesh, action-node, and animation manifest. Caller mutation, hidden-part removal, material drift, socket movement, and interpolation changes fail closed.

Deterministic checks use the verdict `validated` with the exact projection digest as reviewer evidence. The native pipeline does not label its own mechanical evidence as an independent visual approval; `approved` requires a separately identified independent-provider receipt.

## External inspiration boundary

[hoainho/img2threejs](https://github.com/hoainho/img2threejs) informed only the neutral ideas of staged procedural construction and evidence-separated review. [microsoft/TRELLIS.2](https://github.com/microsoft/TRELLIS.2) informed only the neutral ideas of compact structure-first planning, geometry/material separation, and progressive quality allocation.

Neither project is installed, imported, cloned, vendored, invoked, or used as a runtime/service/model dependency. AgenticGraph uses independently authored names, types, algorithms, tests, fixtures, documentation, procedural source, hierarchy, and quality thresholds. A repository-wide regression permits the two exact canonical references only in the designated API provenance documents and rejects runtime, build, dependency, model, fixture, prompt, schema, asset, or configuration coupling.

## Dev proof boundary

Focused source proof covers connected-component gap retention, one-piece object admission, deterministic compact programs, generated-code execution parity, finite extruded geometry, triangle/material/source budgets, measured front-projection IoU and palette rejection, manifest parity, rigid pivots and sockets, world-transform preservation, exact clip yaw/binding/interpolation/loop continuity, complete export-state fingerprints, owned-snapshot race resistance, bounded digest-only source provenance, GLB export, editable external-buffer glTF, and external-inspiration isolation.

Canvas TypeScript and the focused image-to-GLB selector suite are required before protected publication. Browser proof and protected integration are reported separately. Prod and Cloudflare remain outside this task without explicit operator release authority.
