---
title: "Agentic Graph Storyboard Demo"
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "d3"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
kgSharedRendererContract: {"version": "shared-renderer-contract/v1", "semanticIdentity": "buildScopedGraphSemanticKey", "cardPreview": "CardMediaPreview + CardMarkdownPreview", "widgetCard": "canvas:widgetCard", "richMediaPanel": "RichMediaPanel", "storyboardDisplay": "2D Renderer: Storyboard Card (default) and Widget variants", "storyboardSurfaces": ["Cards", "Widgets", "Rich Media Panels"], "edgeModel": "active graph edges from the selected source graph", "timelineSurface": "TimelineTransportControls + shared bottom-panel surface", "rendererPolicy": "frontmatter and source payloads own data; renderers project view state only"}
source_provenance: {"repository": "huijoohwee/joohwee", "revision": "59e920337b5591943f10461d45af6b76ea24e1c5", "path": "huijoohwee-docs/agentic-graph-storyboard-demo-index.md", "sha256": "80e1b7d3dd28667519e7287a1484596d6dd57a9c77aec8f036a934c2d4c87174", "restoration": "Source recovery; historical readiness claims require current validation."}
---

# Agentic Graph Storyboard Demo

Use this document to validate the native `2D Renderer: Storyboard` surface.

## Typed Fixture Contract

- This file is an approved typed validation fixture for storyboard ingest -> parse -> render coverage.
- The opening YAML frontmatter block remains the first-block machine SSOT for renderer activation and graph-backed storyboard data.
- Normalized `{key, type, value}` envelopes in `flow.nodes[*]` are intentional here so the typed E2E path stays exercised during regression and manual validation.
- This document is not the canonical plain-YAML authoring example; canonical authored storyboard docs should still prefer plain YAML for frontmatter and related schema-bearing blocks.
- Parser warning, repair, or fallback behavior is recovery-only; malformed YAML frontmatter still remains invalid source that must be fixed upstream.

## Related Docs

- [Storyboard Demo Index](./agentic-graph-storyboard-demo-index.md)
- [Storyboard Product UI Demo](./agentic-graph-storyboard-product-ui-demo.md)
- [Storyboard Neutral Schema Contract Demo](./agentic-graph-storyboard-neutral-schema-contract-demo.md)

## Validation Goals

- Confirm the renderer activates from frontmatter via `kgCanvas2dRenderer: "storyboard"`.
- Confirm `2D Renderer: Storyboard` owns both display variants: `Card` remains the default card presentation, and `Widget` reuses the same shared renderer utilities with widget-only UI differences.
- Confirm Storyboard `Cards`, `Widgets`, and `Rich Media Panels` render from the same source graph, semantic key, pan/drag/zoom contract, and edge model without a Flow Editor renderer fork.
- Confirm the storyboard surface is repo-owned and native to Agentic Graph, not copied from Boords or any vendor storyboard runtime.
- Confirm existing graph nodes project into storyboard lanes through canonical fields such as `stage`, `status`, `lane`, `phase`, or `track`, without creating a second authoring schema.
- Confirm scene-like node types such as `Scene`, `Shot`, `Frame`, `Panel`, `Beat`, and `Story` are recognized as storyboard-friendly inputs while structural/root-only nodes stay secondary or are filtered when richer cards exist.
- `#EF4444:Confirm` the board reuses shared semantic-key infrastructure and does not introduce parallel identity assembly, stale local caches, or per-renderer duplicate graph derivation.
- Confirm storyboard cards reuse shared chip/theme primitives for lane status, tags, and metadata instead of **`bg#FEF08A:bespoke`** demo-only UI shells.
- Confirm card ordering follows explicit node properties like `order`, `sequence`, `sceneOrder`, `shotOrder`, `index`, or `rank` before falling back to stable source order.
- Confirm storyboard cards project native frame/index badges from properties such as `frame`, `frameNumber`, `sceneNumber`, `shotNumber`, or `panelNumber`.
- Confirm storyboard cards build slugline text from `slugline` directly or from `location` + `timeOfDay` when explicit slugline text is absent.
- Confirm storyboard cards surface native `Action` and `Dialogue` sections from graph/frontmatter fields instead of demo-only text formatting.
- Confirm storyboard, workspace Viewer kanban, and Workflow Manager kanban surface shared paragraph-style card content from canonical text fields instead of drifting per-surface card bodies.
- Confirm storyboard, workspace Viewer kanban, and Workflow Manager kanban allow double-click inline editing on shared card title/body text, committing back to the root markdown-table or graph-node source instead of local card state.
- Confirm storyboard cards surface a native `Visual Brief` block from shared properties such as `prompt`, `imagePrompt`, and `style`.
- Confirm storyboard cards surface a compact native `Reference Pack` from shared reference arrays such as `references` or `referenceUrls`.
- Confirm image, video, and link properties such as `image`, `imageUrl`, `videoUrl`, `media_url`, `src`, `url`, or `href` render as native media-rich storyboard cards without placeholder fixtures.
- Confirm clicking a storyboard card selects the source node in the active graph store instead of creating a parallel storyboard-only selection state.
- Confirm the storyboard surface stays source-backed during inline edits: card text commits directly to graph/frontmatter-owned fields with no storyboard-local persistence layer or parallel markdown format.
- Confirm the shared Viewer `Properties` panel now owns add, duplicate, rename, and delete column CRUD end-to-end so Layout / Properties / Filter / Sort / Group state does not drift after a property mutation.
- Confirm the storyboard renderer bypasses minimap-only D3 assumptions and does not inherit incompatible minimap behavior from unrelated 2D surfaces.
- Confirm the board keeps lane/card density compact, uses horizontal lane scrolling, and avoids oversized helper chrome or copied vendor interaction patterns.

## Native Contract

- Frontmatter remains the single authoring owner.
- `flow.nodes[*]` remains the canonical node source.
- Storyboard derives view-only lane/card presentation from node labels, types, and properties.
- Lane grouping prefers `stage`, then other shared lane-like fields.
- Card content prefers `label`, `summary`-like fields, tags, owner, priority, and media/link URLs already present on the node.
- Storyboard detail blocks also reuse shared graph properties for frame numbering, slugline, action, dialogue, prompt, style, and references.
- `Card` is the default Storyboard Display variant; `Widget` is the same Storyboard renderer surface with widget-form UI, not a separate Flow Editor renderer.
- Rich Media Panels remain first-class Storyboard surfaces for image, video, HTML/srcdoc, audio, and generated output nodes.

## Authoring Notes

- Use stable scene-like ids such as `SCENE_01`, `SHOT_01A`, or `PANEL_04`.
- Prefer `stage` for lane grouping when authoring storyboard demos because it reads cleanly as `Draft`, `Review`, and `Approved`.
- Prefer `order` for deterministic left-to-right narrative sequencing inside each lane.
- Prefer shared graph properties like `summary`, `owner`, `priority`, `tags`, `url`, `href`, `image`, `imageUrl`, `videoUrl`, `media_url`, `frame`, `slugline`, `location`, `timeOfDay`, `action`, `dialogue`, `prompt`, `style`, and `references` instead of renderer-local custom keys.
- Prefer canonical text properties such as `summary`, `description`, `content`, `text`, `note`, `notes`, `action`, `dialogue`, and `prompt` when authoring card body copy so storyboard and kanban surfaces project the same paragraph content.
- Keep storyboard content enhancement-first: edit the graph/frontmatter source, then let the renderer project the board.

## Expected Lanes

- `Draft` should contain `SCENE_01` and `SHOT_01A`.
- `Review` should contain `SCENE_02` and `SHOT_02A`.
- `Approved` should contain `SCENE_03` and `SCENE_04`.

## Expected Card Signals

- `SCENE_01` should show frame `1`, a generated slugline from `Conference Room - Monday`, an `Action` block, a `Dialogue` block, a Doodle-style `Visual Brief`, a two-item `Reference Pack`, and an external brief link.
- `SHOT_01A` should show frame `2`, explicit slugline text, workflow-pain tags, a style chip, and reference thumbnails while staying ordered after `SCENE_01`.
- `SCENE_02` should validate graph-to-storyboard projection language: native board, shared kanban visual language, no copied vendor shell, plus a product-UI visual brief.
- `SHOT_02A` should validate card-click selection sync back to the graph node and keep a compact selection-focused storyboard card body.
- `SCENE_03` should validate video preview support for approved media-rich cards together with references, style, owner, priority, and launch brief metadata.
- `SCENE_04` should validate approved CTA card rendering with compact chips, explicit end-card dialogue, and a brand-card visual brief.

## Demo Intent

- The cold open proves storyboard cards can represent narrative setup.
- The reveal proves current graph data can become a storyboard board without a second system.
- The approved cards prove media-rich review planning can stay inside the same Markdown + graph authoring pipeline.
- The overall demo proves the new storyboard-specific card sections remain graph-derived, kanban-shaped, and fully native in-repo.
