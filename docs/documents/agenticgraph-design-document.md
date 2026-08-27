---
title: "Reference implementation: AgenticGraph Design Document Index"
id: "md:agenticgraph-design-document"
doc_type: "Design Index"
version: "2.0.1"
date: "2026-07-30"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.design.index"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/agenticgraph-design-document.md"
---

# Reference implementation: AgenticGraph Design Document Index

## Purpose

This is the authored entry point for current product and architecture documentation. It does
not duplicate component registries or release evidence.

## Canonical reading order

1. Product requirements: `agenticgraph-prd.md`
2. Technical architecture: `agenticgraph-tad.md`
3. Core decisions: `agenticgraph-architecture-decisions.md`
4. Pipeline overview: `agenticgraph-pipeline-document.md`
5. Parser: `agenticgraph-parser-document.md`
6. Renderer and Canvas UX: `agenticgraph-renderer-document.md` and
   `agenticgraph-ui-ux-design-document.md`
7. Storage and synchronization: `agenticgraph-storage-sync-document.md`
8. MCP topology: `agenticgraph-mcp/agenticgraph-mcp.md`
9. Cross-repository publication: `agenticgraph-cross-repo-publish-topology.md`

## End-to-end design

`authored Markdown/frontmatter → Source Files → parser → GraphData/state → selected canvas
projection → bounded tool/harness result → source/artifact review → protected promotion`

Supporting browser and shared stores preserve continuity, indexes, media, and collaboration.
They remain explicit projections/supporting records rather than a second authored source.

## Generated views

- `docs/agenticgraph-design-document.md` is a generated pointer to this authored index.
- `docs/agenticgraph-technical-architecture.md` is a generated settings/owner registry.
- Generated views are updated through their owning generator, not used as competing prose
  architecture.

## Evidence and delivery boundary

The core PRD/TAD/ADR Evidence Reference Registers own readiness claims. Authoring, Mirror,
and Delivery remain independent; this index neither authorizes publication nor advances a
readiness rung. This index has no independently owned VCC, so its local and delivered rungs both
remain `undocumented`.
