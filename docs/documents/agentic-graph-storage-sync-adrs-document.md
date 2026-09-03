---
title: "Reference implementation: Superseded agentic-graph Storage Decision Index"
id: "md:agentic-graph-storage-sync-adrs-document"
doc_type: "Architecture Decision Record Archive"
version: "2.1.0"
date: "2026-08-06"
lang: "en-US"
guideline_version: "1.7.0"
owner: "architecture.history.storage"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/agentic-graph-storage-sync-adrs-document.md"
document_lifecycle: "superseded"
superseded_by:
  - "docs/documents/agentic-graph-architecture-decisions.md#adr-004--reference-implementation-use-tiered-persistence-roles"
  - "docs/documents/agentic-graph-storage-sync-prd-tad-adr.md#architectural-decision-records"
  - "docs/documents/agentic-graph-artifact-media-storage-architecture.md"
---

# Reference implementation: Superseded agentic-graph Storage Decision Index

**Decision lifecycle**: Superseded
**Superseded on**: 2026-07-30
**Active-owner redirect updated**: 2026-08-06

## Context

The former index mixed accepted design choices, source-presence notes, planned providers,
production-gated claims, route declarations, and delivery statements across nineteen rows. Several
rows had no complete Context/Decision/Alternatives/TCO record, and the index duplicated decisions
now owned by the core ADR set and storage contracts.

## Archived decision families

| Family | Original direction | Current owner |
|---|---|---|
| Local working persistence | browser records and offline outbox/cursor | core ADR-004 and combined storage PRD/TAD/ADR |
| Shared structured storage | D1-compatible first shared store | core ADR-004 |
| Binary artifacts | R2 objects plus source-visible manifests | binary storage TAD |
| Collaboration | one Yjs CRDT/room provider; no raw concurrent JSON writes | combined storage PRD/TAD/ADR, ADR-2 |
| Git/file relay | server-side identity and path-scoped authority | storage owner appendix |
| Seed/mirror authority | authored source plus generated read-only projection | core ADR-001/007 |
| Deployment | separate Worker operation and protected lane boundaries | core ADR-006 and combined storage PRD/TAD/ADR |

## Decision

Supersede the incomplete index. Active storage decisions now live in:

1. the core ADR set for source authority, tiered persistence, and protected promotion;
2. the combined storage PRD/TAD/ADR for product, flow, topology, SSOT, Yjs-room, and Lark-projection decisions;
3. the binary storage TAD for actual blob/media security and overwrite semantics; and
4. the source-owner appendix for file-level mapping.

## Alternatives and TCO

| Alternative | 12-month cash estimate | Ops burden | Disposition |
|---|---:|---|---|
| keep nineteen mixed-status rows active | $0 cash; high recurring review cost | high | superseded |
| consolidated active owners + compact archive | $0 | low | chosen |
| external managed architecture registry | $120–720 | medium plus sync risk | rejected |

## Consequences

- Historical decisions remain visible by family and in Git history.
- No archived row grants implementation, runtime, delivery, or provider mutation authority.
- Active storage ADR-1, ADR-2, and ADR-3 exist only in the combined v5 PRD/TAD/ADR; this archive does not duplicate them.
- Exact route identities live in source, not in this archive.
- New storage decisions must use the complete ADR template with FOSS and TCO comparisons.
