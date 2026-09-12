---
title: "Reference implementation: agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm section 2"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.4.1"
date: "2026-09-12"
lang: "en-US"
owner: "docs.codebase-responsibility-flow"
continuity_id: "PLAN-AGENTIC-GRAPH-CODEBASE-RESPONSIBILITY-FLOW-PRD-TAD-ADR-MVP-GTM"
prd_revision: "1.4.1"
tad_revision: "1.4.1"
adr_revision: "1.4.1"
mvp_revision: "1.4.1"
gtm_revision: "1.4.1"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
parent: "agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.md"
guideline_revision: "2.7.0"
source_section_lines: "472-593"
---

[Combined planning owner](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-CODEBASE-RESPONSIBILITY-FLOW-PRD-TAD-ADR-MVP-GTM@1.4.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

### TCO Impact

*Tailwind v4 is a FOSS, build-time library; its TCO is bundle-size and build cost, not egress or
per-request spend. HTMX's cost is the second runtime and per-interaction server round-trip it
introduces.*

| Dimension | Adopt Tailwind, defer HTMX (chosen) | Adopt both now | Adopt neither |
|---|---|---|---|
| Generator token cost | $0/mo (static scan) | $0/mo | $0/mo |
| Infra / egress cost | $0/mo (committed file; static-prerendered public pages) | + per-interaction server round-trips | $0/mo |
| Offline-first | Preserved | Broken by hypermedia interactions | Preserved |
| Ops burden | Low (one stack, one taxonomy) | High (second runtime + deploy/verify path) | Low |
| Vendor risk | Low (FOSS, no lock-in) | Low (FOSS) but higher coupling | Low |

### Consequences
- **Positive**: one stack; offline-first preserved; Tailwind-owned styling gets a correct single
  owner in the index at $0; time-to-value maximized for a solo team.
- **Negative**: the `Imports` set gains `tailwindcss`; scanners must recognize CSS-token/utility
  ownership.
- **Neutral**: HTMX remains a documented, reversible option gated behind an explicit reopen
  trigger; if adopted later it is shell-scoped and separately indexed.

### Quality Attributes

| Attribute | Scenario | Pattern | Validation |
|-----------|----------|---------|------------|
| Performance | 593 registered rows must open and be searchable on a mobile viewport | Compact static index plus bounded 200-row Markdown shards | Open on a 320px viewport; follow a local shard and find a row |
| Reproducibility | Same source must yield the same index | Deterministic extraction, stable ordering | Byte-identical diff across two generations |
| Traceability | Every concern resolves to an existing owner and line | Fixed-column contract; `file:line` references | Staleness check verifies references exist |
| Observability | Drift between source and any projection is detectable | Non-mutating `--check` mode runs before generating CI steps | Non-zero exit on stale output; output hashes unchanged |
| Token Cost | Local generation must not call a model | No LLM in generation | Generator model cost is zero; agent-consumer tokens are tracked separately |
| TCO | 12-month spend must stay at zero for offline-first use | FOSS extraction + committed file + zero egress | Monthly cost audit; ADR review |

### Deployment Strategy

Authoring and validation occur in the Dev repository under protected review. The projections are
regenerated on demand and committed; the non-mutating staleness check guards drift before any
generating build can mask it. Rollback is a normal file revert. Publishing to the Prod mirror or
deploying to Cloudflare requires separate owner authority.

| Lane | Function and residency | Mutation rights |
|---|---|---|
| Authoring | Dev repository; source, tests, and projections are local. | Full local authoring rights. |
| Mirror | Prod mirror; faithful copy of one approved authoring revision. | Publish-only from an approved authoring state. |
| Delivery | Cloudflare public surface. | Publish-only from an approved mirror state. |

### Deploy Boundary Register

| Boundary | From lane | To lane | Evidence Reference | Operator instruction | Rollback statement/check | State |
|---|---|---|---|---|---|---|
| `DB-CODE-AUTHORING-MIRROR` | Authoring | Mirror | `none recorded` | `none` | Restore the mirror checkout to its recorded prior revision; verify a clean checkout and `HEAD` equal that revision. | `closed` |
| `DB-CODE-MIRROR-DELIVERY` | Mirror | Delivery | `none recorded` | `none` | Redeploy the recorded prior Cloudflare Pages version; run `docs/agentic-graph-post-deploy-verification-checklist.md`. | `closed` |

### Architecture Diagrams

See the Topology `flowchart TB` above; the generation path is
`Source → Extractor → Markdown + JSON Projections → Consumers`, with `--check` comparing every
projection before a generating build.

### Component Inventory

| Layer | Component | File / Module | Local rung | Delivered rung |
|-------|-----------|---------------|---|---|
| Source | Settings Registry + Ownership Metadata | code-owned settings and provenance under `canvas/src/` | `spec-complete` | `undocumented` |
| Generation | Responsibility Extractor | repo extraction tooling (generate / `--check`) | `spec-complete` | `undocumented` |
| Styling Build | Tailwind v4 Vite plugin + CSS-first theme/source directives | `canvas/vite.config.ts`, `canvas/src/index.css` | `spec-complete` | `undocumented` |
| Backing Taxonomy | Typed source and styling backing metadata | `canvas/src/features/settings/types.ts`, `registry-ui.ui.ts` | `spec-complete` | `undocumented` |
| Artifacts | Responsibility Flow Projections | Markdown plus two JSON output paths defined above | `spec-complete` | `undocumented` |
| Runtime | Settings Flow Loader | `canvas/src/features/settings/flowDetailsRuntime.ts` | `spec-complete` | `undocumented` |
| Gate | Staleness Check | pre-projection CI step invoking `--check` | `spec-complete` | `undocumented` |
| Docs | This PRD/TAD | `docs/documents/agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.md` | `spec-complete` | `undocumented` |

---

## PRD ↔ TAD Traceability

| Requirement | TAD component | Interface | VCC |
|---|---|---|---|
| `PRD-CODE-01` | `TAD-CODE-EXTRACTOR` | `TAD-CODE-EXTRACTOR-GENERATE` | `VCC-CODE-01` |
| `PRD-CODE-02` | `TAD-CODE-INDEX` | `TAD-CODE-INDEX-LOOKUP` | `VCC-CODE-02` |
| `PRD-CODE-03` | `TAD-CODE-EXTRACTOR` | `TAD-CODE-EXTRACTOR-GENERATE` | `VCC-CODE-03` |
| `PRD-CODE-04` | `TAD-CODE-GATE` | `TAD-CODE-GATE-CHECK` | `VCC-CODE-04` |
| `PRD-CODE-05` | `TAD-CODE-EXTRACTOR` + `TAD-CODE-GATE` | `TAD-CODE-EXTRACTOR-GENERATE` + `TAD-CODE-GATE-CHECK` | `VCC-CODE-05` |
| `PRD-CODE-06` | `TAD-CODE-INDEX` | `TAD-CODE-INDEX-LOOKUP` | `VCC-CODE-06` |
| `PRD-CODE-07` | `TAD-CODE-LOADER` | `TAD-CODE-LOADER-LOAD` | `VCC-CODE-07` |
| `PRD-CODE-08` | `TAD-CODE-EXTRACTOR` | `TAD-CODE-EXTRACTOR-GENERATE` | `VCC-CODE-08` |

## Time-to-Value: Codebase Responsibility Flow Index

| Dimension | Estimate | Target ceiling | Validation method |
|-----------|----------|----------------|-------------------|
| TTV steps | 2 (open file → locate row) | ≤ 2 steps | Walk-through on clean checkout |
| TTV elapsed time | ~30 s | ≤ 1 min | Timed first lookup on clean checkout |
| First-value action | Resolve a named concern to its owning file:line | — | Row observed with Modules + Line Range |
| Persona | Solo maintainer / AI editing agent | — | Defined in PRD Personas |

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-CODEBASE-RESPONSIBILITY-FLOW-PRD-TAD-ADR-MVP-GTM@1.4.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [PRD](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#prd) |
| TAD | [TAD](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#tad) |
| ADR | [Architectural Decisions](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-01.md#architectural-decisions) |
| MVP | [MVP — reference implementation](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-codebase-responsibility-flow-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run check` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`canvas/public/settings-flow.json`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/public/settings-flow.json), [`canvas/src/features/settings/settings-flow.schema.json`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/settings/settings-flow.schema.json), [`canvas/vite.config.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/vite.config.ts). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
