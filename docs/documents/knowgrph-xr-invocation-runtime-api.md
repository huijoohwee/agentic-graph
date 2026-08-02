---
title: "Knowgrph XR Invocation Runtime API"
id: "md:knowgrph-xr-invocation-runtime-api"
doc_type: "API Contract And Runtime Evidence"
date: "2026-07-22"
updated: "2026-08-02"
version: "1.2.0"
status: "runtime-ready"
lang: "en-US"
frontmatter_contract: "required"
execution_boundary: "dev-only"
publish_scope: "local-only"
source_revision: "df312d72d3e163bbcc3e9f19ca299223f9a54431"
protected_pull_request: "https://github.com/huijoohwee/knowgrph/pull/307"
protected_integration_run: "https://github.com/huijoohwee/knowgrph/actions/runs/29895795869"
deployment: "not authorized"
candidate_pull_request: "https://github.com/huijoohwee/knowgrph/pull/406"
---

# Knowgrph XR Invocation Runtime API

## Surface contract

FloatingPanel **Skills & Commands** hydrates the exact-revision Agentic Canvas OS `/`, `@`, and `#` dictionary as authoring metadata. A row inserts its token byte-for-byte into the active card editor; it does not execute an incomplete bare command.

Repo-local run-ready surfaces hydrate through the same-origin `/knowgrph/control-plane/mcp` route. They never suppress hydration or fall through to the production control plane. One shared, epoch-fenced group hydrator deduplicates `/`, `@`, and `#` requests, retries only sigils that resolved on a losing docs revision, and settles as `fresh`, `stale`, or `blocked` rather than retaining `loading` after work completes. The panel exposes its hydration status, catalog version, and exact source revision as runtime data attributes.

FloatingPanel **Media** owns complete dynamic XR invocations. Every visible invocation chip sends the identical displayed string, as the sole `invocation` input field, to `knowgrph.control_local_xr_scene`.

XR scene, Animation, and Camera MCP controls share Source Files document authority. While bootstrap or a document intent is resolving or failed, MCP inspection reports the scene as not ready, Media and Animation controls stay disabled, and Camera choreography rejects mutation without changing runtime state or graph metadata.

## Immersive media candidate extension

FloatingPanel **Media**, **Animation**, **Motion Control**, **Game Mode**, **Flight Sim**, and **Camera** project one browser-local immersive media controller above their existing panel content. The projection never creates a second Canvas, renderer, Camera, scene store, persistence owner, or network route.

The default source is a procedural panorama generated in-browser with zero configuration, zero model calls, and zero network requests. An operator may opt into an approved image, direct video, or privacy-enhanced YouTube marker URL. Remote media is never required for the default runtime.

The strict native invocation is:

```text
/media.immersive @canvas #canvas-media operation=<operation>
```

`@media-url` is admitted only for `source` and `marker-add` operations carrying an encoded URL. Native invocations now carry the same bounded configuration, view, marker, layer, overlay, and capture fields as the structured browser tool; each operation admits only its own fields. Duplicate commands, bindings, semantics, parameters, unknown parameters, and cross-operation parameters fail closed.

| Capability | Browser-local owner |
|---|---|
| Full or cropped panorama, description, custom navbar, radial lens distortion, intro, and transition | `immersiveMediaRuntime.ts`, `ImmersiveMediaStage.tsx`, and the existing R3F Canvas |
| Pointer look, keyboard actions, wheel and double-click zoom | `useImmersiveMediaCameraControls.ts` under shared `Controls.tsx` ownership |
| Pin, custom element, direct video, YouTube, and chroma markers | `ImmersiveMediaStage.tsx`; remote media remains opt-in |
| Compass, map, and plan projections; hover scaling; tooltips; layers; polygon pattern | `ImmersiveMediaMarkerProjections.tsx` plus one immutable browser-local snapshot projected into the six existing panels |
| Partial overlay and screenshot | `ImmersiveMediaHud.tsx` and the existing `captureCanvasPngSnapshot("3d")` owner |
| MCP inspection and mutation | `knowgrph.inspect_local_immersive_media` and `knowgrph.control_local_immersive_media` |

The implementation is an active draft candidate in PR `#406`. TypeScript and focused source/runtime tests are evidence for the candidate; canonical browser proof, protected integration, and any production release remain separate gates.

## Capability-detected capture and viewer contract

The browser-native capability slice is defined in
`docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md`. Runtime surfaces that expose XR entry,
camera capture, or viewer promotion must resolve one capability snapshot before
opening a viewer or recording capture state.

| Contract | Purpose | Required outcome |
|---|---|---|
| `knowgrph-xr-capability-snapshot/v1` | Declares what the current browser can do | one exact `recommended_entry_mode` plus downgrade `reason_codes` |
| `knowgrph-xr-capture-draft/v1` | Records the first-slice phone capture intent | first slice admits `capture_mode: monocular-camera` only |
| `knowgrph-xr-viewer-handoff/v1` | Records how the source opened | exact `selected_mode`, `fallback_mode`, and `target_route` |

Runtime projections should expose the selected entry mode and capability booleans
as readable data attributes so browser and harness checks can verify fallback
behavior without reverse-engineering UI state.

The current repo-owned acceptance command for this slice is:

```bash
npm run xr:runtime-ready
```

The repo-owned source proof command for the same slice is:

```bash
npm run xr:source-runner:test
```

The one-command review path for the same slice is:

```bash
npm run xr:review-ready
```

The proof boundary and local acceptance contract are documented in
`docs/documents/knowgrph-xr-spatial-capture-fallback-readiness.md`.

That command is intentionally scoped to the native XR session policy source
bundle `test:smoke:xr-spatial-capture-fallback:source` and the dedicated Dev
browser smoke `test:smoke:xr-spatial-capture-fallback:browser` for
`monocular-capture` fallback. The source bundle covers
`scripts/run-xr-spatial-capture-fallback-source-smoke.mjs`, which runs
`canvas.xrMode.nativeSessionPolicy` and
`xr.spatialCaptureFallback.browserSmokeContract`.

## Integrated readiness contract

- The `/`, `@`, and `#` catalog reconciles as one exact-revision transaction. A response is admitted only when its top-level `sourceRevision` matches the configured revision; an epoch change retries only sigils resolved by the losing revision and ends in `fresh`, `stale`, or `blocked`.
- Browser WebMCP registration is lifecycle-owned and late-bind safe: native-host attachment is bounded, detach releases owned registrations, and a readable local fallback remains available until native context is installed. The fallback is not a remote dependency or privileged bridge.
- Surface and operator ownership remain independent. Moving from Surface Mode to XR Mode retains an open Media or Skills & Commands panel; Camera opens a panel only when neither operator surface is already open.
- XR physics delegates fixed stepping to Knowgrph's independently authored spatial engine. The Rapier repository informed domain-separation principles only; no external source, prose, schema, algorithm, example, fixture, package, compatibility layer, service, or runtime dependency is admitted.

- Placement labels are URI-encoded in `/xr.place` and decoded before bounded scene mutation.
- `/xr.transform` retains the selected asset, position, yaw, scale, and color.
- Static placements retain `transition=hold`.
- Capability detection runs before XR viewer entry or browser-local capture and
  must settle to one explicit `recommended_entry_mode`.
- Monocular phone capture is the first admitted capture fallback when immersive
  viewer support is absent; native handoff remains explicit and typed.
- Camera WebMCP framing preserves an already-open Media or Skills & Commands panel; Camera opens only when no operator panel is open.
- Surface Mode to XR Mode preserves an already-open Media scene panel and an already-open Skills & Commands operator panel. Closed, unrelated, or Game Mode panels enter through Motion Control.

## WebMCP readiness markers

The app and published HTML fallback expose two independent diagnostics:

| Marker | Meaning |
|---|---|
| `data-kg-webmcp-context` | Usable tools: `fallback-readable`, `awaiting-model-context`, or `installed`. |
| `data-kg-webmcp-host-context` | Native host binding: `installing`, `awaiting-model-context`, `retry-exhausted`, or `installed`. |

A bounded native-host retry cannot overwrite a functional `fallback-readable` context as an apparent runtime failure. Assigning a native model context after retry exhaustion still installs the complete tool set.

If a native host detaches, its AbortSignal-backed registrations are released, the owned fallback becomes readable again, and a fresh bounded binding cycle begins. Test reset detaches the owned `navigator.modelContext` and `document.modelContext` descriptors before clearing fallback identity, so reinstalling in the same document cannot misclassify the old fallback as native.

## Evidence boundary

| Evidence | Result |
|---|---|
| Protected source and build | PR #307 merged as `df312d72d3e163bbcc3e9f19ca299223f9a54431`; Integration Gate run `29895795869` passed on reviewed head `f914723570a126fdc6262d1efddfdc994a2c0eb5`. |
| Focused runtime | XR surface routing, literal Media dispatch, exact-revision grammar, WebMCP lifecycle, Source Files fencing, TypeScript, hygiene, MCP docs, and production-readiness selectors passed. |
| Browser | Same-origin MCP requests, panel continuity, literal `/xr.place` dispatch, readable WebMCP fallback, and zero browser/runtime errors passed on the behavior-equivalent pre-final feature state. The final merge itself was not re-run through browser acceptance. |
| Production | No Prod, Cloudflare, provider-spend, or live-public-runtime claim is made by this Dev evidence. |

## Ownership and boundary

- Runtime owner: `canvas/src/features/three/xrSceneMcpRuntime.ts`.
- Invocation grammar owner: `canvas/src/features/three/xrSceneMcpContract.mjs`.
- Exact-revision dictionary metadata owner: Agentic Canvas OS `DICTIONARY-COMMAND.md`, `DICTIONARY-SEMANTIC.md`, and `DICTIONARY-BINDING.md`.
- Local docs discovery owner: `mcp/agentic-canvas-os-docs-runtime.js`; explicit roots win, otherwise a marker-backed ancestor search resolves the canonical sibling checkout, with Git common-directory recovery for registered worktrees outside the workspace tree. Configured revisions must equal checkout `HEAD`, and the docs tree must be clean.
- Browser registration owner: `canvas/src/features/agent-ready/webMcpRuntime.ts`.
- Lifecycle owner: `canvas/src/features/agent-ready/webMcpLifecycle.mjs`; the published fallback serializes this owner through `webMcpLifecycleBrowserSource.mjs` instead of maintaining a second implementation.
- Workspace mutation diagnostics stay in the shared in-memory runtime trace; XR Media persistence performs no hardcoded localhost debug-collector requests.
- Published projection owner: `cloudflare/pages/knowgrph-agent-ready.mjs`.

The native 2D/3D physics contract is documented in `docs/documents/knowgrph-native-physics-engines-prd-tad.md`. Rapier remains a principles-only reference, not a dependency; this runtime copies no external implementation, schema, prose, algorithm, example, fixture, or test and introduces no external renderer, physics runtime, storage, deployment, or mutation owner.
