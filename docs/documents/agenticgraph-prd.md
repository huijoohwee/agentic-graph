---
title: "Source-Native Graph Workspace Product Requirements"
doc_type: "Product Requirements Document"
version: "3.1.0"
date: "2026-07-30"
lang: "en-US"
guideline_version: "1.7.0"
owner: "product.contract"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
---

# Source-Native Graph Workspace Product Requirements

## Authority

This document owns the core user-value contract for a workspace in which one readable source
artifact produces an inspectable graph, multiple projections, and bounded automation. Feature
documents may extend this contract but may not redefine source authority, readiness vocabulary,
lane order, or deploy boundaries.

The local rung is `spec-complete` because the VCCs below are stated and no satisfying Evidence
Reference is attached. The delivered rung is `undocumented` because no mirror or delivery result
and no operator instruction are attached.

## Phase 0 — Problem discovery

### Problem and falsifiable hypothesis

Knowledge authors and solo builders lose inspectability, portability, and auditability when prose,
graph structure, canvas layout, tool state, and release state live in unrelated or opaque stores.

**Hypothesis**: if one readable source owns content and graph structure, a first-time operator can
open it and reach a visible, inspectable graph in no more than three manual actions and five elapsed
minutes, without a model call, paid service, or hidden canonical database.

Repository inspection establishes implementation owners, not user-research or delivery evidence.
Observed clean-environment TTV, external user validation, and public-surface proof remain open.

### Preliminary economics and gate

Assumptions: 25 first-value sessions per month, five hours of avoided reconciliation per month,
operator time excluded from cash TCO but tracked separately, and no mandatory model calls.

| Measure | Estimate | Gate | State |
|---|---:|---:|---|
| Impact × monthly reach | 5 × 25 = 125 | ≥80 | estimated pass |
| Core build/maintenance effort | 40 hours | ≤60 hours | estimated pass |
| Incremental infrastructure TCO | $0/month; $0/12 months | $0 for minimum slice | estimated pass |
| Mandatory token TCO | $0/month; $0/12 months | $0 | estimated pass |
| TTV | 3 actions; 5 minutes | ≤3 actions; ≤5 minutes | unverified |
| Phase 0 decision | — | observed problem and TTV evidence | open |

No baseline or implementation-start claim follows from the estimated gate.

## Personas

| Persona | Job to be done | Core constraint |
|---|---|---|
| Solo Builder | Turn one structured document into an inspectable graph quickly | No infrastructure or model required for first value |
| Knowledge Author | Read and edit the same artifact inside or outside the workspace | No hidden canonical database |
| Reviewer | Inspect changes, automation, and proof without paid tools | Evidence and source remain readable |
| Release Operator | Promote an exact reviewed state without ambiguous delivery claims | Human instruction and rollback are explicit |

## Journey: Solo Builder — Reach an inspectable graph

| Stage | Action | Touchpoint | Pain / emotion | Opportunity |
|---|---|---|---|---|
| Trigger | Receives or creates a structured source | Source artifact | Unsure whether it will render | Publish one explicit source contract |
| Discover | Opens or imports the source | Workspace | Fears format-specific setup | Parse deterministically with typed diagnostics |
| Engage | Inspects graph and body content | Canvas | Needs source/projection agreement | Derive every projection from one graph |
| Complete | Sees an inspectable graph | Canvas | Wants proof source was preserved | Surface source identity and zero-spend result |
| Return | Edits and reopens the source | Workspace | Fears stale parallel state | Persist through the same source owner |

## Journey: Reviewer — Inspect a bounded operation

| Stage | Action | Touchpoint | Pain / emotion | Opportunity |
|---|---|---|---|---|
| Trigger | Receives an automation result | Review surface | Unsure what ran | Show typed plan, bounds, and owner |
| Discover | Opens trace and evidence | Evidence view | Fears hidden spend or mutation | Record zero/non-zero cost and side effects |
| Engage | Compares result with source | Workspace | Needs deterministic provenance | Bind artifacts to source revision |
| Complete | Accepts, revises, or rejects | Approval surface | Fears irreversible action | Keep protected actions closed by default |
| Return | Reopens the recorded run | History | Fears missing context | Retain terminal state and evidence reference |

## Journey: Release Operator — Promote an exact state

| Stage | Action | Touchpoint | Pain / emotion | Opportunity |
|---|---|---|---|---|
| Trigger | Receives a reviewed revision | Authoring lane | Fears stale candidate | Bind checks to exact revision |
| Discover | Reviews mirror qualification | Mirror lane | Needs delivery-shape confidence | Build an immutable candidate |
| Engage | Supplies explicit instruction | Deploy boundary | Fears implicit release | Require a referenced human action |
| Complete | Verifies delivery | Delivery lane | Needs rollback confidence | Record result and prior state |
| Return | Audits the receipt | Evidence store | Fears unverifiable history | Retain boundary, instruction, and check |

## User stories, acceptance criteria, and VCCs

| PRD ID / VCC ID | Journey stage | Story | Given / When / Then | VCC: end state; stated check; constraint |
|---|---|---|---|---|
| `PRD-CORE-R1` / `VCC-PRD-R1` | Builder—Discover | As an author, I want one readable artifact to own content and graph structure so that I can inspect and version it. | Given valid source, when opened, then body, nodes, edges, handles, data, and compute fields are parsed deterministically. | End: canonical parser fixtures pass; Check: the canonical source check exits 0 and reports the fixtures; Constraint: source bytes and unrelated fixtures do not change. |
| `PRD-CORE-R2` / `VCC-PRD-R2` | Builder—Engage | As an explorer, I want multiple projections over one graph so that views cannot drift into separate products. | Given one graph, when a supported projection is selected, then it renders shared graph state and reports unsupported modes explicitly. | End: projection and registry tests pass; Check: client contract and projection checks exit 0; Constraint: no renderer creates a second authored graph. |
| `PRD-CORE-R3` / `VCC-PRD-R3` | Builder—Complete | As a solo builder, I want local open, convert, edit, export, and deterministic analysis before configuring shared services. | Given no provider credentials, when a local workflow runs, then it returns an artifact or typed failure without network or paid calls. | End: local client and parser suites pass; Check: both local validation hosts exit 0; Constraint: provider-call count and paid-token count remain zero. |
| `PRD-CORE-R4` / `VCC-PRD-R4` | Reviewer—Discover | As an agent host, I want typed discovery separated by trust boundary so that a descriptor is not mistaken for permission. | Given a host context, when discovery runs, then each transport returns only its owned catalog, schema, annotations, and availability. | End: transport contract suites pass; Check: the runtime contract check exits 0; Constraint: no public read surface exposes spend-bearing execution. |
| `PRD-CORE-R5` / `VCC-PRD-R5` | Reviewer—Engage | As a reviewer, I want every automated operation bounded, observable, cancellable, and approval-gated. | Given an operation request, when policy, budget, or approval is absent, then execution stops before protected mutation or spend. | End: bounded-run tests surface terminal state and cost fields; Check: runtime and bounded-harness checks exit 0 with required assertions; Constraint: blocked paths make zero provider calls and writes. |
| `PRD-CORE-R6` / `VCC-PRD-R6` | Builder—Return | As an author, I want local durability plus optional shared projections so that offline work remains primary and conflicts stay visible. | Given unavailable shared transport, when a local change is saved, then it remains recoverable and pending work is explicit. | End: storage and relay suites pass; Check: the runtime contract check exits 0; Constraint: local source remains canonical and no conflict is silently overwritten. |
| `PRD-CORE-R7` / `VCC-PRD-R7` | Operator—Complete | As a release operator, I want separate Authoring, Mirror, and Delivery lanes so that local proof cannot be presented as production proof. | Given an exact reviewed revision, when promotion is requested, then each adjacent boundary requires evidence and an explicit operator instruction. | End: protected integration/release gates bind the exact revision and rollback target; Check: protected workflows report success; Constraint: no Authoring command mutates Mirror or Delivery. |
| `PRD-CORE-R8` / `VCC-PRD-R8` | All | As a user, I want core controls operable across input modes and constrained devices. | Given keyboard, touch, offline, or declared size limits, when the workspace is used, then controls remain reachable and failures are explicit. | End: focused accessibility/device/offline checks meet declared targets; Check: client and recorded device checks pass; Constraint: no unmeasured universal scale claim is introduced. |

## Time-to-value by user-facing capability

| Capability | Persona | Estimate | Target ceiling | First value | Validation |
|---|---|---:|---:|---|---|
| Open source | Solo Builder | 3 actions / 5 min | ≤3 / ≤5 min | valid source identity and graph | clean-environment timed walk-through |
| Change projection | Solo Builder | 1 action / 2 sec | ≤1 / ≤2 sec | alternate view over same graph | timed canonical fixture |
| Run deterministic local check | Reviewer | 2 actions / 2 min | ≤2 / ≤2 min | typed result with zero cost | clean-environment command run |
| Recover offline edit | Knowledge Author | 3 actions / 5 min | ≤3 / ≤5 min | reopened local revision | airplane-mode save/reopen |
| Review promotion candidate | Release Operator | 4 actions / 10 min | ≤4 / ≤10 min | immutable mirror candidate | protected dry review; no deployment |

All estimates remain unverified and therefore do not promote readiness.

## Success metrics

| Metric | Baseline | Target | Timeline |
|---|---:|---:|---|
| Canonical source parse pass rate | unrecorded | 100% named fixtures | before baseline |
| Source-preserving projection | unrecorded | 100% named fixtures | before baseline |
| First-value TTV | estimated 3 actions / 5 min | ≤3 / ≤5 min | before Phase 3 exit |
| Mandatory-path tokens | estimated 0 | 0 per run and $0/month | every run; monthly audit |
| Optional model budget | unmeasured | ≤4,000 prompt + 1,000 completion, ≥50% cache hit, ≤$0.10/run | before enabling each harness |
| Local minimum-slice TCO | estimated $0/month | $0/month; $0/12 months | monthly |
| Shared/delivery TCO | unmeasured | operator-specific budget recorded before use | before promotion |
| Local readiness | `spec-complete` | evidence-derived only | every revision |
| Delivered readiness | `undocumented` | evidence-derived only | every revision |
| Finding set | not baselined | zero blocker findings | before baseline |

## ROI and MoSCoW

Score formula: `(impact 1–5 × monthly reach) / (build hours + 12-month cash TCO / 100 +
risk 1–5)`. Scores are estimates and must be replaced by observed inputs.

| Tier | Capability | Impact × reach | Build h | 12-month TCO | Risk | ROI score | Rationale |
|---|---|---:|---:|---:|---:|---:|---|
| Must | R1 source authority | 5 × 25 | 40 | $0 | 2 | 2.98 | removes duplicate-state reconciliation |
| Must | R2 shared projections | 4 × 25 | 32 | $0 | 2 | 2.94 | reuses one graph across views |
| Must | R3 local-first workflow | 5 × 20 | 28 | $0 | 2 | 3.33 | shortest zero-infrastructure first value |
| Must | R4 typed transport separation | 4 × 15 | 24 | $0 | 3 | 2.22 | prevents permission/catalog confusion |
| Must | R5 bounded execution | 5 × 10 | 30 | ≤$120 | 4 | 1.42 | limits spend and side effects |
| Must | R7 promotion boundaries | 5 × 8 | 20 | ≤$240 | 3 | 1.57 | prevents false delivery claims |
| Should | R6 shared persistence | 3 × 10 | 36 | ≤$300 | 4 | 0.70 | valuable after local value is proven |
| Should | R8 accessibility/device proof | 4 × 12 | 30 | $0 | 3 | 1.45 | broadens reliable reach |
| Could | Additional adapters | 2 × 8 | 40 | ≤$600 | 4 | 0.32 | add only with observed demand |
| Won't | Autonomous deployment or silent paid calls | 1 × 2 | 80 | unbounded | 5 | <0.02 | violates trust and cost envelope |

## Minimum viable scope

- One readable source with plain YAML metadata and typed graph fields.
- Deterministic parse to one graph and at least one interactive projection.
- One source-backed edit/save/reopen path.
- Typed malformed-input behavior.
- One deterministic local, zero-model check.
- Visible readiness and deploy-boundary state.

## Out of scope

- A database or canvas becoming the hidden authoring authority.
- Mandatory hosted infrastructure, provider account, or model call for first value.
- Silent source repair, auto-approval, unbounded loops, or autonomous deployment.
- Claims that every local, browser, public-read, or control-plane transport has tool parity.
- Real-time collaboration, provider delivery, or scale guarantees without separate evidence.

## Dependencies

| Function | Posture | Constraint |
|---|---|---|
| Markdown/YAML parsing | FOSS | plain authored syntax remains canonical |
| Browser graph/canvas runtime | FOSS | projection never becomes source authority |
| Local persistence | browser-native/FOSS | explicit degraded state and user-controlled retention |
| Versioned source storage | FOSS-compatible | history remains inspectable |
| Optional shared storage | swappable | role, residency, retention, auth, TCO, and rollback declared |
| Optional model/provider | swappable | ADR, approval, token budget, cost log, and fallback required |
| Delivery runtime | swappable | reachable only across two closed deploy boundaries |

## Delivery reach

| Reach | Minimum behavior | Evidence state |
|---|---|---|
| Browser | open, inspect, edit, and project a local source | VCC stated; no Evidence Reference |
| Mobile | no horizontal overflow at 375×812; core controls keyboard/touch reachable | VCC stated; no Evidence Reference |
| Offline | after initial load, local open/edit/project remains usable; network features degrade explicitly | VCC stated; no Evidence Reference |

## PRD ↔ TAD ↔ VCC traceability

The stable PRD identifiers below resolve to the component and interface identifiers in the
companion TAD. Each link names both the PRD VCC embedded in the acceptance row above and the TAD
VCC that implements it; the Evidence Reference column records the current absence rather than
implying proof.

| PRD requirement | Journey and flow | TAD component ↔ interface | PRD VCC ↔ TAD VCC | Evidence Reference |
|---|---|---|---|---|
| `PRD-CORE-R1` | Builder—Discover; W1/DF1/H0 | `TAD-CORE-C03` ↔ `I-PARSE`; `TAD-CORE-C05` ↔ `I-SOURCE` | `VCC-PRD-R1` ↔ `VCC-T3`, `VCC-T5` | not recorded |
| `PRD-CORE-R2` | Builder—Engage; W2/DF2/H0 | `TAD-CORE-C02` ↔ `I-GRAPH`; `TAD-CORE-C04` ↔ `I-PROJECTION` | `VCC-PRD-R2` ↔ `VCC-T2`, `VCC-T4` | not recorded |
| `PRD-CORE-R3` | Builder—Complete; W1/DF1/H0 | `TAD-CORE-C01` ↔ `I-WORKSPACE`; `TAD-CORE-C06` ↔ `I-CLI` | `VCC-PRD-R3` ↔ `VCC-T1`, `VCC-T6` | not recorded |
| `PRD-CORE-R4` | Reviewer—Discover; W0/DF0/H0 | `TAD-CORE-C07` ↔ `I-LOCAL-TOOL`; `TAD-CORE-C08` ↔ `I-REMOTE-TOOL` | `VCC-PRD-R4` ↔ `VCC-T7`, `VCC-T8` | not recorded |
| `PRD-CORE-R5` | Reviewer—Engage; W3/DF3/H1 | `TAD-CORE-C07` ↔ `I-LOCAL-TOOL`; `TAD-CORE-C08` ↔ `I-REMOTE-TOOL` | `VCC-PRD-R5` ↔ `VCC-T7`, `VCC-T8` | not recorded |
| `PRD-CORE-R6` | Builder—Return; W4/DF4/H0 | `TAD-CORE-C09` ↔ `I-WORKING-STORE`; `TAD-CORE-C10` ↔ `I-SHARED-STORE` | `VCC-PRD-R6` ↔ `VCC-T9`, `VCC-T10` | not recorded |
| `PRD-CORE-R7` | Operator—Complete; W5/DF5/H0 | `TAD-CORE-C11` ↔ `I-PROMOTION` | `VCC-PRD-R7` ↔ `VCC-T11` | not recorded |
| `PRD-CORE-R8` | All; W0–W5/DF0–DF5/H0–H1 | `TAD-CORE-C01` ↔ `I-WORKSPACE`; `TAD-CORE-C04` ↔ `I-PROJECTION` | `VCC-PRD-R8` ↔ `VCC-T1`, `VCC-T4` | not recorded |

## Readiness Gap Matrix

Local and delivered rungs are independent. Priority is the highest severity of a linked current
finding; `none` means that the row has an evidence gap but no separately recorded defect.

| Workstream | Local rung | Delivered rung | Gap | Priority | Exit criteria (VCC) |
|---|---|---|---|---|---|
| Source authority and deterministic ingest | `spec-complete` | `undocumented` | no recorded local fixture result or delivery proof | none | `VCC-PRD-R1`, `VCC-PRD-R3` and mapped `VCC-T3`, `VCC-T5`, `VCC-T6` gain satisfying Evidence References |
| Shared projections and device reach | `spec-complete` | `undocumented` | projection, accessibility, device, and offline results are unrecorded | none | `VCC-PRD-R2`, `VCC-PRD-R8` and mapped `VCC-T1`, `VCC-T2`, `VCC-T4` are satisfied |
| Discovery and bounded automation | `spec-complete` | `undocumented` | the current model-backed harness does not yet prove canonical token/cost fields | major | `VCC-PRD-R4`, `VCC-PRD-R5` and mapped `VCC-T7`, `VCC-T8` are satisfied with cost evidence |
| Shared persistence | `spec-complete` | `undocumented` | current structured push/pull/export routes lack authorization enforcement | blocker | `VCC-PRD-R6` and mapped `VCC-T9`, `VCC-T10` prove authenticated failure/success and conflict behavior |
| Exact-state promotion | `spec-complete` | `undocumented` | mirror result, live result, operator instruction, and rollback result are absent | none | `VCC-PRD-R7` and mapped `VCC-T11` carry complete Authoring, Mirror, and Delivery Evidence References |

## VCC and Evidence Reference register

No satisfying Evidence Reference is attached to this revision. The following invocable checks are
the declared hosts for the VCCs; `not recorded` is a recorded absence and does not raise a rung.

| VCC | Named check | Recorded result | Surface | Derived rung |
|---|---|---|---|---|
| `VCC-PRD-R1`, `VCC-PRD-R2`, `VCC-PRD-R3`, `VCC-PRD-R8` | canonical client/source validation host | not recorded for this revision | authoring | `spec-complete` |
| `VCC-PRD-R3` parser | canonical offline parser validation host | not recorded for this revision | authoring | `spec-complete` |
| `VCC-PRD-R4`, `VCC-PRD-R5`, `VCC-PRD-R6` | canonical runtime contract validation host | not recorded for this revision | authoring | `spec-complete` |
| `VCC-PRD-R7` Authoring | protected integration workflow for exact candidate | not recorded for this revision | authoring | `spec-complete` |
| `VCC-PRD-R7` Mirror | protected release qualification for exact candidate | not recorded for this revision | mirror | `undocumented` |
| `VCC-PRD-R7` Delivery | protected live verification for exact candidate | not recorded for this revision | delivery | `undocumented` |

## Deploy Boundary Register

| Boundary | From lane | To lane | Evidence Reference | Operator instruction | Rollback statement and check | State |
|---|---|---|---|---|---|---|
| `SOURCE-TO-MIRROR` | Authoring | Mirror | ER-B1: release verify job; result `not recorded` | `none` | discard candidate, rerun verify job, and compare immutable candidate digest | `closed` |
| `MIRROR-TO-DELIVERY` | Mirror | Delivery | ER-B2: protected deploy/live check; result `not recorded` | `none` | reconstruct prior approved revision, republish through the same boundary, and rerun live verification | `closed` |

## Open questions

- What observed user tasks establish pain severity and monthly reach?
- Does a clean machine meet each TTV ceiling?
- What document/graph size retains the projection latency target?
- Which optional harness receives the first approved token budget?
- What retention, residency, and deletion policy applies to each shared adapter?
- What exact operator instruction and evidence will open each deploy boundary?

## Reference implementation: AgenticGraph repository mapping

The current reference repository maps this neutral contract as follows:

| Function | Repository owner |
|---|---|
| Parser | `canvas/src/lib/parsers/markdownJsonLd.impl.ts` and parser registry |
| Canvas routing | `canvas/src/components/CanvasViewport.tsx` |
| Storyboard projection | `canvas/src/components/StoryboardWidgetCanvas.tsx` |
| Source ownership | `canvas/src/features/source-files/` |
| Local tool transport | `mcp/server.js` |
| Offline CLI/harness | `agenticgraph_parser/` |
| Browser working store | `canvas/src/lib/storage/` plus `canvas/src/features/source-files/` |
| Shared storage projection | `cloudflare/workers/agenticgraph-storage/` |
| Protected integration/release | `.github/workflows/integration.yml` and `.github/workflows/release.yml` |
| Release operator instructions | `docs/agenticgraph-acos-deploy-runbook.md` |

| Neutral validation host | Reference implementation command |
|---|---|
| canonical client/source validation host | `npm run check && npm test` |
| canonical offline parser validation host | `python3 -m unittest discover -s agenticgraph_parser -p '*_test.py'` |
| canonical runtime contract validation host | `npm run runtime:test` plus `npm run superagent:test` where the bounded harness is in scope |

The companion architecture and decision owners are
`docs/documents/agenticgraph-tad.md` and
`docs/documents/agenticgraph-architecture-decisions.md`.
