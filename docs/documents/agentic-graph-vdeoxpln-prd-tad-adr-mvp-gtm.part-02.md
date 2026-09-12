---
title: "Reference implementation: agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm section 2"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.3.1"
date: "2026-09-12"
lang: "en-US"
owner: "Product maintainers"
continuity_id: "PLAN-AGENTIC-GRAPH-VDEOXPLN-PRD-TAD-ADR-MVP-GTM"
prd_revision: "0.3.1"
tad_revision: "0.3.1"
adr_revision: "0.3.1"
mvp_revision: "0.3.1"
gtm_revision: "0.3.1"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
parent: "agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.md"
guideline_revision: "2.7.0"
source_section_lines: "453-540"
---

[Combined planning owner](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-VDEOXPLN-PRD-TAD-ADR-MVP-GTM@0.3.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

## Validation Contract

Initial document validation:

```bash
test -f docs/documents/agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.md
sed -n '1,80p' docs/documents/agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.md
```

Implementation validation:

```bash
npm run vdeoxpln:check
npm run hygiene:check
npm run agent-ready:check
npm run pages:check-sync
npm --prefix canvas run test:ci:unit -- "agentReady|mcpServiceDocs|sourceFiles|chatResponseContract"
npm --prefix canvas run test:ci:unit -- "vdeoxpln|mcp.server.localToolContract"
npm --prefix canvas run test:ci:unit -- "videoAgent.pipeline|videoAgent.importUrl.completeParsedGraph"
```

Registry-specific checks must prove:

- every vdeoxpln id is unique
- no vdeoxpln id is remapped through a compatibility alias
- every owner reference exists
- every tool reference resolves to local MCP or agent-ready tool contracts
- every AI stage declares max attempts, token budget, cost log, and fallback
- every graph-producing stage uses Workspace FS, Source Files, AGENTIC_OS validation, and shared semantic
  keys
- route-only and filename-only inputs are rejected by skill routing
- Chat-to-Canvas runs emit a source-backed vdeoxpln run manifest beside the AGENTIC_OS workspace artifact
- generated prod mirror metadata matches Dev source

## Implementation Plan

| Phase | Deliverable | Owner boundary | Exit condition |
|---|---|---|---|
| 0 | This PRD/TAD | Docs source | Frontmatter and owner map are present. |
| 1 | Canonical registry schema and validator | Source-owned metadata validator | Duplicate ids, missing owners, and stale aliases fail. |
| 2 | Generated local and Pages skill projections | Agent-ready and sync owners | Generated outputs match source hash and sync cleanly. |
| 3 | MainPanel read-only vdeoxpln capability view | Existing MCP/Integrations settings surface | UI reads generated vdeoxpln metadata without local arrays. |
| 4 | Source-backed vdeoxpln execution artifacts | Workspace FS, Source Files, chat, AGENTIC_OS, Canvas owners | Skill run outputs are inspectable, route-neutral, and semantic-keyed. |
| 5 | Cloudflare smoke and live proof | Pages deploy and agent-ready checks | `airvio.co/agentic-graph` exposes current vdeoxpln metadata. |

## Open Questions

| Question | Default answer until implemented |
|---|---|
| Where should the canonical registry file live? | `canvas/src/features/agent-ready/agentic-graph-vdeoxpln-contract.mjs`; consumers import its generated projections rather than path-matching at runtime. |
| Should generated `SKILL.md` files replace tracked tool-specific local skills? | Yes. The registry projection is validated by `vdeoxpln:check`; tracked local skill copies must not remain as parallel authority. |
| Which vdeoxplnEntries can mutate graph state remotely? | None by default. Published Pages/WebMCP remains read-only until authenticated mutation semantics exist. |
| Should research-video workflows become a first-class vdeoxpln? | Yes, as an original agentic-graph vdeoxpln using Source Files, Storyboard, renderer, and chat owners. |

## Change Log

| Version | Date | Summary |
|---|---|---|
| 0.3.0 | 2026-05-30 | Implemented neutral vdeoxpln routing, FloatingPanel Chat vdeoxpln prompt injection, and source-backed AGENTIC_OS companion run manifests with semantic run keys. |
| 0.2.0 | 2026-05-30 | Implemented the baseline registry contract, local MCP registry tool, generated Pages agent-skills projection, MainPanel MCP vdeoxpln docs, and focused validation. |
| 0.1.0 | 2026-05-30 | Initial agentic-graph-native vdeoxpln PRD/TAD, inspired by PaperMotion patterns without copying implementation artifacts. |

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-VDEOXPLN-PRD-TAD-ADR-MVP-GTM@0.3.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [Product Requirements](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#product-requirements) |
| TAD | [Technical Architecture](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#technical-architecture) |
| ADR | [ADRs](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-01.md#adrs) |
| MVP | [MVP — reference implementation](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-02.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-vdeoxpln-prd-tad-adr-mvp-gtm.part-02.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run check` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`canvas/src/features/agent-ready/agentic-graph-vdeoxpln-contract.mjs`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/agent-ready/agentic-graph-vdeoxpln-contract.mjs), [`mcp/local-tool-contract.js`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/mcp/local-tool-contract.js), [`mcp/server.js`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/mcp/server.js). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
