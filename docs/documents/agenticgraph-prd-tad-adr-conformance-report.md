---
title: "Reference implementation: PRD/TAD/ADR Conformance Report"
doc_type: "Conformance Report"
version: "1.1.0"
date: "2026-07-31"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.conformance.audit"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
---

# Reference implementation: PRD/TAD/ADR Conformance Report

## Reference implementation: Authority, verdict, and scope

This report owns the reproducible conformance record for the 2026-07-30
documentation consolidation. It does not own product requirements, architecture,
delivery, or runtime readiness.

The independent pre-repair evaluation found 35 deduplicated findings: two
blockers, 26 majors, and seven minors. The documented remediations reduce the
current finding set to zero. Artifact linkage for the canonical core is
18/18, or 100%; four advisory rules were counted separately and did not inflate
that ratio.

| Included | Boundary |
|---|---|
| Canonical core | `agenticgraph-prd.md`, `agenticgraph-tad.md`, and `agenticgraph-architecture-decisions.md` |
| Supporting docs change set | 51 additional active changed Markdown artifacts under `docs/`, including this report and the generated settings companion |
| Root index projection | One active changed `README.md`, outside the `docs/` count |
| Cleanup | Six deleted legacy, duplicate, or superseded active-path artifacts |
| Source truth | Repository source, tests, scripts, workflows, and configuration at lease base `07c2194dbdff00f8faf5c63c4e50d8bd7b5678e1` plus the reconciled branch |
| Excluded claims | Unchanged corpus-wide conformance, public delivery, external availability, and production verification |

The coverage denominator is the canonical-core artifact-bearing rule set below.
Cross-cutting readiness, neutrality, route, lane, topology, and finding-contract
rules were also applied to every active changed document; they are not added to
the 18-rule denominator a second time.

## Reference implementation: Guideline identity, evaluator independence, and load economics

| Measure | Recorded value |
|---|---|
| Guideline | `prd-tad-adr-guidelines.md` v1.7.0 |
| SHA-256 | `f45d8eb27b7aa9166a4f3e89a66d8cf96720acc06e025655256307e6b2d9c816` |
| Size | 122,302 bytes; 1,570 lines |
| Initial load | One full canonical-file load because the task crossed discovery, PRD, TAD, ADR, cleanup, and alignment phases |
| Load-cost line item | At most 30,576 input-token equivalents using the conservative `bytes / 4` estimate |
| Subsequent loads | Focused rule, readiness, finding, and validation sections only; no second full-file load |
| Implementers | Primary authoring mechanism plus bounded provider-doc and game-doc repair mechanisms |
| Evaluator | A distinct read-only guideline-conformance mechanism; it authored no remediation |

The full initial load was more expensive than phase-only loading. Recording it
here makes the cost explicit; later passes used phase-scoped excerpts.

## Reference implementation: Artifact-bearing rule coverage

Rule IDs use checkbox ordinals within the guideline's
`validation-checklist` section.

| Rule ID | Required artifact | Linked artifact |
|---|---|---|
| `validation-checklist#1` | Frontmatter | Core PRD, TAD, and ADR frontmatter |
| `validation-checklist#2` | Journey | PRD journey and stages |
| `validation-checklist#3` | Workflows | TAD W0–W5, including triggers, alternatives, errors, and postconditions |
| `validation-checklist#4` | Typed data flows | TAD DF0–DF5 |
| `validation-checklist#5` | SVO stories | PRD requirement stories |
| `validation-checklist#6` | Given/When/Then criteria | PRD acceptance register |
| `validation-checklist#7` | VCC translation | PRD acceptance register |
| `validation-checklist#8` | MoSCoW, ROI, rationale | PRD priority register |
| `validation-checklist#9` | Minimum viable scope | PRD minimum and deferred scope |
| `validation-checklist#14` | TTV steps, elapsed time, metric | PRD success and TTV registers |
| `validation-checklist#15` | Harness flows | TAD orchestration and harness flows |
| `validation-checklist#17` | Topology | TAD versioned three-lane topology |
| `validation-checklist#18` | Components and interfaces | TAD component specifications |
| `validation-checklist#21` | ADR, TCO, and FOSS alternatives | Core ADR set |
| `validation-checklist#24` | PRD-to-TAD traceability | PRD and TAD bidirectional trace registers |
| `validation-checklist#25` | Component-to-VCC traceability | TAD component and VCC registers |
| `validation-checklist#42` | Readiness-gap matrices | Core PRD, TAD, and ADR matrices |
| `validation-checklist#57` | Three lanes and named boundaries | Core PRD, TAD, and ADR boundary registers |

Coverage is **18 linked artifact-bearing rules / 18 artifact-bearing rules =
100%**. Advisory count is **4**.

## Reference implementation: 2026-07-31 split conformance

This addendum covers the Geo+XR contract, the rewritten City contract with its
VCC companion, and the ADM0 regional companion. It is a selected structural
profile, not a full guideline-set alignment claim. A distinct read-only
evaluator reported the findings below across two passes. The authoring
mechanism repaired the source artifacts; runtime and delivery evidence remain
outside this structural inventory.

| Rule ID | Geo+XR artifact | City artifact family | Regional companion artifact |
|---|---|---|---|
| `validation-checklist#1` | frontmatter | frontmatter | frontmatter |
| `validation-checklist#2` | §3 journey | §3 journey | §3.3 journey |
| `validation-checklist#3` | §§6–8 workflows | §§6–8 workflows | §§5.2–5.3 workflows |
| `validation-checklist#4` | §7 typed data flow | §7 typed data flow | §5.2 typed data flow |
| `validation-checklist#5` | §4 stories | §4 stories | §3.4 stories |
| `validation-checklist#6` | §4 Given/When/Then | §4 Given/When/Then | §3.7 Given/When/Then |
| `validation-checklist#7` | §§4, 12 VCC mapping | §4 plus VCC companion §13 | §7 VCC register |
| `validation-checklist#8` | §5 priority and ROI | §5 priority and ROI | §§3.5–3.6 priority and ROI |
| `validation-checklist#9` | §5 minimum scope | §5 minimum scope | §3.5 minimum scope |
| `validation-checklist#14` | §5 TTV | §5 TTV | §3.6 TTV |
| `validation-checklist#15` | §8 harness | §8 harness | §5.3 harness |
| `validation-checklist#17` | §9 topology | §9 topology | §5.4 versioned topology |
| `validation-checklist#18` | §10 component readiness | §10 component readiness | §5.5 component readiness |
| `validation-checklist#21` | §§14–17 ADR/FOSS/TCO | §§12–16 ADR/FOSS/TCO | §6 ADR/FOSS/TCO |
| `validation-checklist#23` | §10 component inventory | §10 component inventory | §5.5 component inventory |
| `validation-checklist#24` | §12 PRD-to-TAD trace | VCC companion §14 | §9 PRD-to-TAD trace |
| `validation-checklist#25` | §§10, 12 component-to-VCC trace | §10 plus VCC companion §14 | §§5.5, 9 component-to-VCC trace |
| `validation-checklist#42` | §12 readiness gaps | §17 plus VCC companion §15 | §8 readiness gaps |
| `validation-checklist#57` | §13 lanes and boundaries | §9 plus VCC companion §16 | §5.4 lanes and boundaries |

Coverage for this selected profile is **19 linked artifact-bearing rules / 19
selected artifact-bearing rules = 100%**. Advisory count inside the selected
profile is **0**. This ratio does not claim full-guideline coverage.

| Finding Type | Severity | Rule anchor | Artifact reference | Evidence excerpt | Remediation |
|---|---|---|---|---|---|
| `unimplemented-guideline` | major | `validation-checklist#48` | split conformance addendum | `18 linked guideline rules out of 18` without a current inventory | Documentation change: add and qualify the selected Rule-ID inventory. |
| `unresolvable-reference` | major | `validation-checklist#24` | City VCC companion §14 predecessor-ID row | `source ownership and honest evidence` | Documentation change: remap the companion to current requirement and component IDs. |
| `unimplemented-guideline` | major | `validation-checklist#18` | all three component inventories | `Component ID | Responsibility | Dependencies | Configuration | VCCs` | Specification change: add separate local and delivered rung fields. |
| `missing-economics-metric` | major | `validation-checklist#34` | regional companion §3.6 | `Measure | Target` | Documentation change: add baseline and timeline to every measure. |
| `incomplete-topology-node` | major | `validation-checklist#38` | regional companion §5.4 | `Topology and lane boundaries` without a version note | Documentation change: add the explicit v1.0 topology note. |
| `status-conflict` | major | `validation-checklist#51` | City parent §10 and VCC companion §15 | `spec-complete` and `dev-proven` for the same current capability | Specification change: derive current v2 component rungs only from current evidence. |
| `vendor-coupling` | major | `validation-checklist#53` | generic and regional coverage citations | `./agenticgraph-prd-tad-adr-conformance-report.md` outside a labelled block | Documentation change: move each citation into a labelled reference-implementation block and remove regional frontmatter paths. |

The distinct read-only evaluator's final pass recorded zero remaining blocker,
major, or minor findings in this selected profile. The prior canonical-core
18-rule denominator above remains historical and is not reused here.

## Reference implementation: Initial six-field finding register

This immutable baseline records the evaluator's pre-repair result. Evidence
excerpts are bounded. Each remediation is one allowed documentation or
specification change. Artifact references follow the current document lineage
after a source rename. Original line numbers identify the predecessor snapshot,
not the rewritten document; the finding content and evidence excerpts remain
unchanged.

| Finding Type | Severity | Rule anchor | Artifact reference | Evidence excerpt | Remediation |
|---|---|---|---|---|---|
| `missing-lane` | blocker | `validation-checklist#57` | City Simulation predecessor, original line 9 | `lane: "authoring"` with no Mirror or Delivery register | Documentation change: add three lanes and two complete named closed boundaries. |
| `missing-lane` | blocker | `validation-checklist#57` | `agenticgraph-game-mmorpg-prd-tad.md:350` | `## Release Boundary` without lane topology | Documentation change: add three lanes and two complete named closed boundaries. |
| `incomplete-lane-transition` | major | `validation-checklist#57` | `agenticgraph-codebase-responsibility-flow-prd-tad.md:553` | `requires separate owner authority` | Documentation change: add stable boundary names, evidence, instruction, rollback, and state. |
| `incomplete-lane-transition` | major | `validation-checklist#57` | `agenticgraph-exa-mcp-prd-tad.md:244` | `authorizes no publication` without a complete register | Documentation change: add both complete named closed boundaries. |
| `incomplete-lane-transition` | major | `validation-checklist#57` | `agenticgraph-feishu-base-mcp-prd-tad.md:247` | `closed` without all boundary fields | Documentation change: add both complete named closed boundaries. |
| `incomplete-lane-transition` | major | `validation-checklist#57` | `agenticgraph-lark-app-mcp-prd-tad.md:245` | `closed` without all boundary fields | Documentation change: add both complete named closed boundaries. |
| `incomplete-lane-transition` | major | `validation-checklist#57` | `agenticgraph-sensenova-api-prd-tad.md:251` | `closed` without evidence and rollback | Documentation change: add both complete named closed boundaries. |
| `incomplete-lane-transition` | major | `validation-checklist#57` | `agenticgraph-stripe-mcp-service.md:267` | `closed` without provider evidence and rollback | Documentation change: add both complete named closed boundaries. |
| `incomplete-lane-transition` | major | `validation-checklist#57` | `agenticgraph-videodb-mcp-prd-tad.md:248` | `closed` without provider evidence and rollback | Documentation change: add both complete named closed boundaries. |
| `vendor-coupling` | major | `validation-checklist#53` | `agenticgraph-agent-ready-prd-tad.runtime.md:47` | `MCP/WebMCP-capable client` before the labelled block | Documentation change: replace early concrete protocol names with functional terms. |
| `vendor-coupling` | major | `validation-checklist#53` | `agenticgraph-game-mmorpg-prd-tad.md:2` | `Reference design` | Documentation change: use the exact reference-implementation label. |
| `orphan-route` | major | `validation-checklist#60` | City Simulation predecessor, original line 89 | `/game.city @canvas #civic` | Documentation change: add a sole Invocation Register with schema, trust, and cost. |
| `orphan-route` | major | `validation-checklist#60` | `agenticgraph-game-mmorpg-prd-tad.md:76` | `/mmorpg @canvas #world` | Documentation change: add a planned Invocation Register and absence disposition. |
| `unfederated-tool` | major | `validation-checklist#56` | City Simulation predecessor, original line 275 | `agenticgraph.inspect_local_city_sim` | Specification change: record both embedded tools in the federation disposition. |
| `unfederated-tool` | major | `validation-checklist#56` | `agenticgraph-game-mmorpg-prd-tad.md:348` | planned tools are not registered | Specification change: keep identities explicitly planned and non-federated until implemented. |
| `uncatalogued-tool` | major | `validation-checklist#56` | `agenticgraph-game-mmorpg-prd-tad.md:348` | planned tools are not registered | Specification change: record non-catalogued disposition and promotion VCC. |
| `unimplemented-guideline` | major | `validation-checklist#24` | City Simulation predecessor, original line 362 | numeric requirements mapped only to a design owner | Documentation change: add stable requirement-to-component/interface trace rows. |
| `unimplemented-guideline` | major | `validation-checklist#25` | City Simulation predecessor, original line 341 | VCCs lacked component mapping | Documentation change: bind each VCC to a component and interface. |
| `unimplemented-guideline` | major | `validation-checklist#24` | `agenticgraph-game-mmorpg-prd-tad.md:129` | criteria and ownership lacked a trace register | Documentation change: add bidirectional requirement-to-component/interface trace rows. |
| `unimplemented-guideline` | major | `validation-checklist#25` | `agenticgraph-game-mmorpg-prd-tad.md:210` | components lacked VCC mappings | Documentation change: bind component specifications to VCCs. |
| `unimplemented-guideline` | major | `validation-checklist#42` | City Simulation predecessor, original line 9 | readiness below runtime-ready without a gap matrix | Documentation change: add separate-rung gaps, priorities, and exit VCCs. |
| `unimplemented-guideline` | major | `validation-checklist#42` | `agenticgraph-game-mmorpg-prd-tad.md:342` | readiness dimensions lacked a gap matrix | Documentation change: add separate-rung gaps, priorities, and exit VCCs. |
| `incomplete-topology-node` | major | `validation-checklist#17` | City Simulation predecessor, original line 240 | topology lacked boundary and residency fields | Documentation change: add versioned lane subgraphs, connections, roles, and residency. |
| `incomplete-topology-node` | major | `validation-checklist#17` | `agenticgraph-game-mmorpg-prd-tad.md:227` | topology lacked boundary and residency fields | Documentation change: add versioned lane subgraphs, connections, roles, and residency. |
| `missing-economics-metric` | major | `validation-checklist#54` | City Simulation predecessor, original line 105 | no quantified ROI or twelve-month TCO | Documentation change: add ROI, TTV, and deployment-model TCO. |
| `missing-economics-metric` | major | `validation-checklist#54` | `agenticgraph-game-mmorpg-prd-tad.md:184` | TCO-zero was narrative only | Documentation change: add ROI, TTV, and deployment-model TCO. |
| `missing-foss-comparison` | major | `validation-checklist#21` | City Simulation predecessor, original line 284 | ADRs had decision and reason only | Documentation change: add per-decision FOSS alternatives and TCO. |
| `missing-foss-comparison` | major | `validation-checklist#21` | `agenticgraph-game-mmorpg-prd-tad.md:287` | ADRs lacked FOSS and TCO comparison | Documentation change: add per-decision FOSS alternatives and TCO. |
| `unknown-status` | minor | `validation-checklist#44` | `agenticgraph-game-mmorpg-prd-tad.md:21` | `pending`; `not authorized` | Documentation change: remove the redundant non-ladder readiness block. |
| `unknown-status` | minor | `validation-checklist#44` | `agenticgraph-pipeline-document.md:508` | `Status` values were `unverified` | Documentation change: rename them as non-readiness evidence results. |
| `blended-status` | minor | `validation-checklist#45` | `agenticgraph-agent-ready-prd-tad.md:262` | `local_rung: spec-complete`; `delivered_rung: undocumented` | Documentation change: split local and delivered columns and prose. |
| `blended-status` | minor | `validation-checklist#45` | `agenticgraph-artifact-media-storage-architecture.md:35` | `local_rung: spec-complete`; `delivered_rung: undocumented` | Documentation change: split local and delivered columns and prose. |
| `blended-status` | minor | `validation-checklist#45` | `agenticgraph-cloudflare-document.md:115` | evidence, local, and delivered values shared one cell | Documentation change: split evidence and both readiness fields. |
| `blended-status` | minor | `validation-checklist#45` | `agenticgraph-mcp-service-prd-tad.md:278` | `local_rung: spec-complete`; `delivered_rung: undocumented` | Documentation change: split local and delivered columns. |
| `blended-status` | minor | `validation-checklist#45` | `agenticgraph-storage-sync-document.md:73` | `local_rung: spec-complete`; `delivered_rung: undocumented` | Documentation change: split local and delivered metric rows. |

Six provider specifications were conservatively upgraded with explicit
requirement-to-component/interface-to-VCC closure even though their declared
supporting document type kept those twelve potential traceability findings out
of the 35-finding baseline.

## Reference implementation: Finding-type counts

The current count is zero for every authoring-domain type. This table preserves
the initial distribution and makes all zero types explicit.

| Finding Type | Initial | Current |
|---|---:|---:|
| `missing-frontmatter-key` | 0 | 0 |
| `malformed-document` | 0 | 0 |
| `unknown-status` | 2 | 0 |
| `unproven-claim` | 0 | 0 |
| `blended-status` | 5 | 0 |
| `unimplemented-guideline` | 6 | 0 |
| `unguided-artifact` | 0 | 0 |
| `unresolvable-reference` | 0 | 0 |
| `stale-evidence` | 0 | 0 |
| `missing-companion` | 0 | 0 |
| `duplicate-owner` | 0 | 0 |
| `status-conflict` | 0 | 0 |
| `gate-order-drift` | 0 | 0 |
| `gate-sequence-violation` | 0 | 0 |
| `vendor-coupling` | 2 | 0 |
| `path-derived-claim` | 0 | 0 |
| `non-modular-section` | 0 | 0 |
| `missing-economics-metric` | 2 | 0 |
| `blended-deployment-tco` | 0 | 0 |
| `missing-foss-comparison` | 2 | 0 |
| `unbounded-loop` | 0 | 0 |
| `paid-read-path` | 0 | 0 |
| `incomplete-delivery-reach` | 0 | 0 |
| `orphan-route` | 2 | 0 |
| `ambiguous-route` | 0 | 0 |
| `unfederated-tool` | 2 | 0 |
| `uncatalogued-tool` | 1 | 0 |
| `missing-lane` | 2 | 0 |
| `incomplete-lane-transition` | 7 | 0 |
| `deploy-boundary-breach` | 0 | 0 |
| `ungated-promotion` | 0 | 0 |
| `incomplete-topology-node` | 2 | 0 |

The initial total is 35. The current total is zero blockers, zero majors, and
zero minors.

## Reference implementation: Verification evidence and known repository-wide gate state

| Check | Recorded result | Scope and interpretation |
|---|---|---|
| Independent guideline audit | pre-repair 35; post-repair 0 | Changed documentation scope; evaluator distinct from implementers |
| Documentation lint and generated-section parity | pass | Generated architecture, workflow, design, and provider sections current |
| Documentation sanity | pass | Frontmatter and maintainability; every active changed Markdown file at most 600 lines |
| Storage documentation runtime check | pass | Eight documents, 18 invocation tokens, and 11 tool identities |
| Focused documentation tests | pass | Core, provider, MCP, agent-ready, storage, game, status, and generated settings contracts |
| Runtime suite | 2,077 + 30 pass; 0 fail | Runtime and storage-relay suites |
| Release contract | 21 pass; 0 fail | Protected release source contract |
| Type/build check | pass | Repository `npm run check` |
| Broad UI/unit suite | non-green | Reached its 600-second project timeout amid unrelated runtime/UI failures |
| Lint | non-green | Three errors in unchanged flight/game test files; warnings pre-exist outside this docs scope |
| Parser unit suite | 29 pass; 2 fail | Two unchanged registry/export expectation failures |

Non-green repository-wide gates are recorded rather than converted into
documentation readiness evidence. The report remains `spec-complete` until a
report VCC has an exact invocable named check, a recorded result, and an
explicit `authoring` surface.

## Reference implementation: Deploy Boundary Register

This report declares no invocation route or tool identity.

| Boundary | From lane | To lane | Evidence Reference | Operator instruction | Rollback statement/check | State |
|---|---|---|---|---|---|---|
| `CONFORMANCE-AUTHORING-TO-MIRROR` | Authoring | Mirror | none recorded | none | discard the candidate report; retain the prior mirror revision | closed |
| `CONFORMANCE-MIRROR-TO-DELIVERY` | Mirror | Delivery | none recorded | none | retain the prior delivered docs and repeat their prior check | closed |

No Authoring-to-Delivery mutation or production action is authorized by this
report.
