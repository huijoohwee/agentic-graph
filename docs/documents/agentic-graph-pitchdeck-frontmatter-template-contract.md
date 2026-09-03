---
title: "agentic-graph Pitchdeck Frontmatter Template Contract"
doc_type: "Document"
date: "2026-05-27"
lang: "en-US"
frontmatter_contract: "required"
---

# agentic-graph Pitchdeck Frontmatter Template Contract

## Markdown YAML Frontmatter Enforcement

- Canonical pitchdeck template contracts, reusable template docs, and runtime-ready Markdown artifacts must start with a valid YAML frontmatter block as the first block in the file.
- Frontmatter is the SSOT for template identity, widget configuration ownership, active variants, and reusable placeholder metadata referenced by the body contract.
- Canonical authored template docs use plain YAML for frontmatter and related schema-bearing blocks; do not replace normal authoring syntax with normalized typed wrappers.
- Normalized `{key, type, value}` wrappers are permitted only in dedicated validation fixtures that explicitly test ingest -> parse -> render, ingest -> parse -> validate, or parser-fidelity behavior.
- Scalars that contain reserved punctuation, including inline `:` content, must be quoted so strict YAML parsers read template metadata deterministically.
- Parser warning, repair, or fallback behavior is recovery-only; malformed YAML frontmatter remains an upstream authoring defect that must be fixed at source.

## Purpose

Document the canonical frontmatter-first contract for the reusable pitchdeck templates.

Keep template structure, widget fields, panel writeback, and parser expectations aligned across `agentic-graph`, `huijoohwee.github.io`, and validation fixtures.

## Canonical Artifacts

| Artifact | Role | Directive |
| --- | --- | --- |
| `huijoohwee.github.io/template/pitchdeck-prd-tad-template-lite.md` | Minimal reusable template | Keep it frontmatter-first, generic, and parser-safe. |
| `huijoohwee.github.io/template/pitchdeck-prd-tad-template.md` | Full reusable template | Keep it frontmatter-first, generic, and parser-safe. |
| Operator-provided validation Markdown | Validation fixture | Pass it explicitly through the local test or CLI contract; do not hardcode sibling sandbox demo paths in repo-owned sources. |
| `canvas/src/features/storyboard-widget-manager/registryTemplates.ts` | Widget registry SSOT | Reuse canonical widget fields, ports, and `flow:widgetFormId` values. |
| `canvas/src/features/integrations/*Ssot*.ts` | Integration field SSOT | Reuse canonical integration field keys and row semantics. |
| `canvas/src/lib/render/richMediaSsot.ts` | Panel behavior SSOT | Reuse canonical Rich Media Panel writeback and tab behavior. |
| `canvas/src/__tests__/markdownFrontmatterFlowGraphImport.test.ts` | Parser fidelity SSOT | Keep canonical plain-YAML authoring and normalized typed-wrapper fixtures aligned to parser expectations. |

## Contract Rules

| Surface | Directive | Source |
| --- | --- | --- |
| Document shape | Keep one YAML frontmatter block as the machine SSOT and Markdown body as the human projection. | `kgc-pipeline/v1` templates |
| SSOT surfaces | Keep `widget_bundle`, `runner`, `pipeline`, `mermaid`, `flow`, and `graph_meta` mutually consistent. | frontmatter templates |
| Serialization | Keep canonical templates authored in plain YAML; use `{key, type, value}` only in normalized validation fixtures that audit parser fidelity. | parser fidelity tests |
| Text widget | Reuse canonical text keys `chatProvider`, `chatAuthMode`, `chatEndpointUrl`, `chatModel`, `prompt`. | text integration SSOT |
| Image widget | Reuse canonical image keys `model`, `prompt`, `size`, `output_format`, `response_format`, `optimize_prompt_options`, `aspect_ratio`, `stream`, `watermark`, `seed`, `guidance_scale`, `reference_image`. | image integration SSOT |
| Video widget | Reuse canonical video keys `model`, `prompt`, `content_json`, `resolution`, `ratio`, `duration`, `generate_audio`, `draft`, `camera_fixed`, `image_url_url`, `reference_image`. | video integration SSOT |
| Rich Media Panel | Reuse canonical panel keys `output`, `imageUrl`, `videoUrl`, `outputSrcDoc`, `media_interactive`. | panel registry + render SSOT |
| Widget identity | Keep canonical `flow:widgetFormId` values: `textGeneration`, `imageGeneration`, `videoGeneration`, `richMediaPanel`. | parser + registry SSOT |
| Handles | Keep canonical port names: `prompt_in`, `text_out`, `reference_image`, `imageUrl`, `videoUrl`, `output`, `outputSrcDoc`. | registry SSOT |
| Output surface | Keep Rich Media Panel as the only canonical final render surface for widget outputs. | rich media render SSOT |
| Graph execution | Keep the flow acyclic; forbid feedback arcs, infinite loops, and repeated derived writeback. | template contract |
| Content neutrality | Forbid validation-demo scripts, scene names, asset URLs, or provider-specific stories in reusable templates. | authoring rule |

## Reuse Matrix

| Consumer | Reuse rule |
| --- | --- |
| FloatingPanel Props Panel | Read and write the same canonical `properties.*` keys serialized in template `flow.nodes`. |
| MainPanel Integrations | Reuse the same field names and row semantics as the widget registry SSOT. |
| WidgetEditor KTV rows | Render declared canonical fields without local alias keys; normalized typed-wrapper fixtures must map to the same fields. |
| Frontmatter parser | Parse the same canonical `flow:widgetFormId` and handles from plain-YAML templates, while also accepting normalized typed-wrapper fixtures in validation paths. |
| Rich Media renderer | Apply connected values before display filtering or media dedupe. |

## Authoring Rules

| Context | Directive |
| --- | --- |
| Placeholder data | Keep project-specific content inside frontmatter placeholders only. |
| Defaults | Use generic defaults; do not pin demo-only subjects, brands, assets, or scenes. |
| Extensions | Add new nodes and edges through the same canonical field vocabulary; keep templates plain YAML and reserve typed wrappers for normalized fixtures only. |
| Drift prevention | Fix schema drift in shared TS SSOT sources, not in downstream docs or template prose. |
| Legacy cleanup | Remove stale or duplicate template formats instead of preserving compatibility shims. |

## Verification

| Check | Pass condition |
| --- | --- |
| Frontmatter fidelity | All declared SSOT surfaces describe the same graph. |
| Registry fidelity | Template field keys match shared widget and integration SSOT keys. |
| Panel fidelity | Widget outputs land on Rich Media Panel canonical properties. |
| Neutrality | Templates remain project-agnostic and validation-demo-agnostic. |
| Parser safety | Plain-YAML templates and normalized typed-wrapper fixtures both remain parser-safe and keep `flow:widgetFormId` values aligned. |
