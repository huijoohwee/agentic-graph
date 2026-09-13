---
title: "Launch Copilot — grounded PRD-TAD-ADR-MVP-GTM"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.3.3"
date: "2026-09-13"
lang: "en-US"
frontmatter_contract: "required"
owner: "Launch Copilot product owner in agentic-graph"
continuity_id: "launch-copilot"
prd_revision: "0.3.3"
tad_revision: "0.3.3"
adr_revision: "0.3.3"
mvp_revision: "0.3.3"
gtm_revision: "0.3.3"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
load_policy: "on-demand"
runtime_readiness_policy: "fail-closed"
worktree_id: "device-cba000d3779d--launch-copilot-plan-owner"
agent_id: "codex-01a09985"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "3cc9123bd24d0da49da9ceb66d700e5d2bc83aa4"
supersedes: "launch-copilot@0.3.2"
source_draft_sha256: "b7862a35f3423834a9ec1a656cab8c62add25f1ed6ec95804f2561fb4b72d8a3"
verification_scope: "source-plan ownership migration; historical runtime evidence retains its exact subject and surface"
---

# Launch Copilot — reference implementation

This is the current product plan for `launch-copilot@0.3.3`. All five roles below consume this exact
revision. Graph owns the plan, executable capability and [operational runbook](../launch-copilot.md).
`81rv10` identifies the offer and consumes that runbook; it has no independent application runtime.
The [production entry](../81rv10-production-entry.md) remains a generated Graph release projection.
Shared authoring rules, [planning roles][roles] and [continuity][continuity] retain their existing owners.

This reviewed successor replaces the private `joohwee/undocumented-draft/20260912T140000Z-launch-copilot-lc01.md`
authority. The exact 90,744-byte predecessor is retained by that private owner with the SHA-256 above,
alongside its committed history at `2090c6c74317dcaec553515f4024edfe68aebcb1`. It includes uncommitted
observations; the commit alone is not that snapshot. Earlier digests and detailed audit/diagram history
remain in the preserved bytes. Private evidence stays at its owner and is not part of public publication.
Migration changes ownership, resolves stale current-state prose and adds A5; it preserves LC-01–LC-07,
T1–T5, R1–R8 and A1–A4. It neither changes the Canvas proposal serialization nor accepts new product scope.

## PRD

**Problem and buyer.** A solo founder can pay for discovery twice: once for a proposal, then again when
implementation uncovers missing checkout, permissions, fulfillment or deployment capabilities. The
buyer hypothesis is a founder with one agent-commerce request and permitted repository access. No
customer interview, measured rework cost, accepted price or collected revenue establishes that pain yet.
The implementer is a secondary reader. Missing payer evidence blocks commercial claims, not scoped
engineering work already authorized by the operator.

**Intent and DIR-LC-01.** Turn one business ask into a bounded, source-grounded proposal inside the
existing Graph workspace. Reuse source owners, distinguish existing capability from proposed work,
and execute subsequent transitions only with accepted exact revisions and applicable authority.
Role/Subject: product maintainer. Action/Verb: specify. Outcome/Object: one joined proposal capability
with named acceptance checks. These fields consume CID/RAO/SVO; they introduce no alternate grammar.

**Story.** As a founder, I want to import permitted source, inspect relevant nodes/edges or a cluster,
and review a proposed change alongside its evidence before funding implementation.

| Criterion / priority | Given → when → then; completion check | Design / task / decision |
|---|---|---|
| LC-01 / Must | Given a requirement and native repository/folder import or source selection, when grounding runs, then reuse acquisition, parse, query and explain with exact source/commit/parser/snapshot identity. Check membership, completeness, freshness, cancellation, unsupported/empty/truncated inputs and unchanged inspected source. A file import is not a structural graph. | T1 / R1 / A1 |
| LC-02 / Must | Given that evidence, when composition completes, then exactly five PRD/TAD/ADR/MVP/GTM roles share scope and revision. Check source-bound structured claims, reject invented IDs, label proposed work NEW and require human entailment review. | T2 / R2 / A2 |
| LC-03 / Must | Given source selection at `/81rv10/`, when proposal and Probe-Tree appear, then the same native canvas distinguishes evidence, decisions and NEW work. Check five panels, evidence links, separate overlay, source identity, source-bound questions/answers, reload and preview-failure restoration. | T3 / R3 / A2 |
| LC-04 / Must | Given reviewed exact bytes and permitted handoff, when publication succeeds, then five exact paths/hashes appear in one protected PR. Check stale/cancelled approval refusal, duplicate/partial-effect recovery and provider plus content proof before reporting integration. | T4 / R4–R5 / A3 |
| LC-05 / Must | Given phone or disconnected review, when the user edits/reopens/exports, then local work survives and unavailable actions are visible. Check review controls at 390 px, offline retention, abort/budgets and refreshed authority/source on reconnect; no offline remote write or payment. | T1–T4 / R1–R4 / A4 |
| LC-06 / Must for launch | Given a separately authorized product slice, when released, then entry → offer → confirmation → fulfillment → receipt → readback completes. Check full owner suites at exact deployment identity, decline/cancel/lost response, duplicate/reordered events, replay and rollback. | T5 / R6–R7 / A4 |
| LC-07 / Must for commercial claim | Given a permissioned prospect and priced offer, when delivery is accepted, then actual revenue and cost are observable. Check priced acceptance, collected payment reference, accepted outcome, delivery/support cost and separately recorded repeat use. | T5 / R8 / A4 |

LC-01–LC-05 define the proposal MVP; LC-06 and LC-07 require separate runtime and commercial evidence.
All Must pain assumptions remain unvalidated. The full technical win condition is business ask →
source-grounded five-document proposal integrated through a protected PR, using the single public
product surface. Export, source implementation and an implementation PR do not satisfy that transition.

**Should:** reuse native persistence/cache, resumable handoff, current authorized Chat connection and
readable phone review. **Could:** compare contested slices after buyer evidence. **Won't:** add an LC
server/UI, importer/parser, graph store, renderer, provider proxy, tool registry, payment ledger,
background poller, copied external implementation or new dependency. GameXR is outside this MVP.

| Measure | Baseline / target and stop condition |
|---|---|
| Useful evidence | End-to-end baseline unmeasured; target warm snapshot → useful evidence under 30 seconds. Measure acquisition, parse and projection separately. |
| Proposal time | Full UI/model/PR flow unverified; target cluster → five roles under 90 seconds and machine time under 3 minutes, excluding human review/provider queues. |
| Human effort | Unmeasured; ask → inspect/revise → approve. Payment and deployment keep their own authority. |
| Model use | Outline makes zero model calls. Current drafting has one attempt, no repair/fallback; prompt ≤8,000 UTF-8 bytes, output ≤6,000 tokens and ≤24,000 structured bytes. Live use remains deferred. |
| Cost / ROI | Hardware, power, operator time, token cost, support and demand unmeasured. Zero new paid infrastructure; no inferred zero TCO or quantified savings. |
| Priced offer | S$200 per fixed-scope proposal with one correction round is a hypothesis. Seek five permissioned conversations and two paid pilots before SaaS packaging; price build/launch separately. |

Priority follows dependency closure and existing source reuse, not a computed commercial ranking.

## TAD

TAD consumes PRD `0.3.3`. Current source bindings for this review are Graph
`3cc9123bd24d0da49da9ceb66d700e5d2bc83aa4`, its accepted Canvas dependency
`b7039fbc3e84d2fb54ef8bc115087ea09e0b373e` in `docs/runtime-readiness-contract.md`, and installed OS
`13c3839aba7fc64bf94f93aa29b1239ab929840d` in `package.json`. They are separate dependency identities;
none shares the plan's revision. Guideline revision/source are pinned in frontmatter. Refresh affected
joins when the consuming pins change; a newer sibling checkout does not silently upgrade this runtime.

| Design | Existing responsibility and boundary | Remaining proof |
|---|---|---|
| T1 / evidence | Graph native Import URL/folder, repository acquisition, parser/runtime and selection; Canvas ingest/parse and query/explain validation. Retain repository URL, commit, parser/snapshot and reference/owned provenance; ≤12 nodes, ≤20 explained edges, depth one. | Relevant sample selection and full public/browser freshness/error paths. File-search degradation carries hashes and no inferred edges. |
| T2 / composition | Canvas owns the five-role prompt/validator; Graph reuses its selected Chat connection and one bounded drafting attempt. Claims cite owned evidence or name NEW owner/dependency/check; reference-only source cannot establish owned implementation. | Live drafting and semantic entailment. Membership checks do not prove arbitrary prose. |
| T3 / presentation | Graph owns selection, layout, renderer, RichMediaPanels, workspace/document versions and source-bound Probe-Tree. Canonical graph stays read-only; separate `lc:` overlay retains decisions and proposed relations. | Complete paired public/phone/offline walkthrough at a release identity. |
| T4 / handoff | Graph host binds review to five file hashes, evidence digest, source/contract identity, target and base. OS owns scoped admission, protected `land` and integration proof. | Actual human-approved proposal PR and exact integrated files. Inspect retained operation state before recovery. |
| T5 / launch | Graph/Commerce own accepted implementation, release, checkout and readback; OS retains lifecycle governance. Generated mirror follows protected release. | LC-06 deployed loop and LC-07 real payer/cost evidence. |

Public pairing reuses Graph's existing host and the shared MCP broker; the operational runbook owns
setup, credentials, expiry, cancellation and transport limits. Importing external source grants no
permission to execute/install/vendor it or copy its code, prompts or assets. Source text is evidence,
not authority. No new protocol, runtime or transport is created by this plan migration.

| RAO step | Role / atomic action | Outcome and named check | Prerequisite |
|---|---|---|---|
| R1 | Grounder retrieves source evidence | Resolvable selection or explicit degraded/empty result; LC-01 | T1/A1 and admitted source |
| R2 | Composer drafts proposal roles | Five joined roles with checked references; LC-02 | R1, T2/A2 |
| R3 | Projector renders proposal view | Existing/NEW distinction and usable retained review; LC-03/05 | R2, T3/A2 |
| R4 | Handoff adapter publishes reviewed proposal | Exact five-file protected PR; LC-04 | R3, exact approval, profile, T4/A3 |
| R5 | Lifecycle observer verifies integration | Provider observation and content proof; LC-04 | R4, OS owner |
| R6 | Implementer builds accepted slice | Candidate with full owner checks; LC-06 | Separate implementation scope, T5/A4 |
| R7 | Release owner verifies deployed loop | Delivery identity and recovery proof; LC-06 | R6 and release authority |
| R8 | Operator validates paid acceptance | Accepted outcome, payment and cost evidence; LC-07 | Permissioned prospect and supported rail |

Coverage: 7/7 criteria map to design, 5/5 design rows map back to criteria, and 8/8 RAO rows derive
from DIR-LC-01 and the named criteria. These are specification joins, not passed acceptance results.
The predecessor retains the detailed historical diagrams/inventories. The current five flow roles are:

| Flow role | Current joined sequence / branch |
|---|---|
| Journey | Ask → inspect source → review proposal → approved handoff; later commissioned build/launch/payment stays separately authorized. |
| User workflow | Native import/selection → outline or authorized draft → five panels → edit/reopen/export → review/approve/status. Unavailable drafting retains labelled outline. |
| Data | Requirement + exact source snapshot → bounded evidence → five documents + separate sidecar/overlay → reviewed hashes → PR/content evidence. Decisions never become source evidence. |
| Harness | Graph/Canvas validation → exact Graph host approval → OS lane/check/land → provider integration observation. Timeout retains effects for status/recovery. |
| Timeline | Source implementation → candidate verification → authorized release → public acceptance → commercial validation; each stage retains its own evidence. |

| Deployment boundary | Gate and recovery |
|---|---|
| Reviewed proposal → PR | Exact-content approval, fresh source/contract/base, unused paths and OS admission; retained lane/status prevents duplicate publication. |
| Dev source → delivery | Protected Graph candidate, explicit candidate-specific human production authorization, full release checks/live identity/rollback. |
| Delivery → generated mirror | Owner release verifies then publishes projections; never patch the mirror to fix source. |
| Offer → real payment | Separately selected rail, buyer confirmation, amount/currency/limits and provider proof; reconcile lost responses before retry. |

## ADR

ADR consumes PRD/TAD `0.3.3`. Product-owner decisions A1–A4 retain their intent; A5 records this migration.

| Decision | Selected option / alternatives | Consequence and reopen condition |
|---|---|---|
| A1 / native grounding | Reuse Graph acquisition/parse/query/explain with Canvas validation; use labelled file evidence when needed. A second engine or external package duplicates owners. | Preserve source identity and provenance; reopen at the source owner if an admitted input cannot be represented. |
| A2 / native composition | One Canvas contract, existing Chat transport, renderer and five panels. Separate UI/server or five dependent model calls add cost without quality evidence. | One attempt, no automatic repair; human review checks entailment. Reopen on measured quality/interface failure. |
| A3 / protected handoff | Native exact-file review followed by existing OS lifecycle. Direct canonical writes or a copied publication controller bypass established boundaries. | Graph is the enrolled output owner; inspect actual effects before retry. Real proposal publication remains unverified. |
| A4 / service validation | Test the fixed-scope paid proposal before platform expansion. No new paid infrastructure or invented demand. | Price/pilot counts are experiment choices; actual payer, cost and runtime evidence decide continuation. |
| A5 / source-plan migration | Keep one reviewed product plan in Graph and route private draft/reference/public entry through the runbook. Alternatives: leave mutable private-only authority, or copy a plan into every repository. | Exact predecessor bytes/history remain private; current public plan contains no private evidence bodies. Registry activates only after the artifact exists; recover with a joined successor or reviewed revert. |

Existing local FOSS tools and approved free hosting remain the implementation basis. Hosting is not
itself FOSS. Hardware, model, maintenance and 12-month TCO are unmeasured; no paid plan, installation,
price recommendation or scope expansion follows from this review.

## MVP

Consume LC-01–LC-05 and R1–R5 before claiming the proposal outcome. The historical three-hour experiment
covered evidence, five-role review and attempted handoff; its full win condition remains unverified.
The original 900-line experiment reached 899 lines. The authorized public-flow extension added 749,
for 1,648 implementation/test lines and six product modules overall, with no new dependency. Detailed
measurements stay in the [runbook](../launch-copilot.md#verification-and-budget). The original zero
always-loaded-byte requirement remains an open discrepancy; this migration does not waive it.
This increment adds documentation only, below 600 lines/file and 500 kB/file, with zero runtime modules.

### Evidence and release handover

Historical evidence is reused only for its recorded candidate, dependencies and surface:

| Criterion / source | Observed result / locator | Limitation |
|---|---|---|
| LC-01 / acquisition retention | [Graph PR 971](https://github.com/huijoohwee/agentic-graph/pull/971), merge `bb9040b85cf13ceef40b494e75d2e64d7058d9e2`; [Integration Gate](https://github.com/huijoohwee/agentic-graph/actions/runs/34689521375) | Source integration, not full public acceptance. |
| LC-04 / native handoff implementation | [Graph PR 974](https://github.com/huijoohwee/agentic-graph/pull/974), merge `c0ec2dfa02d2338af3ad5202ad6ca882a6de5e06`; [Integration Gate](https://github.com/huijoohwee/agentic-graph/actions/runs/34702179007) | Read-only review and changed-byte refusal; no actual proposal PR. |
| LC-03/05 / public pairing and Probe-Tree | [Graph PR 975](https://github.com/huijoohwee/agentic-graph/pull/975), candidate `733de70fc8e6f227e57670c65e2eed0044f682cf`, merge `d003fc2663a5d842c9865a1e6fdceb5063e2368c`; [Integration Gate](https://github.com/huijoohwee/agentic-graph/actions/runs/34732276515) | Local broker/native provider fixtures and protected Dev integration; no live OpenAI or current deployment claim. |
| LC-01–05 / component and browser observations | [Pinned native runbook](https://github.com/huijoohwee/agentic-graph/blob/3cc9123bd24d0da49da9ceb66d700e5d2bc83aa4/docs/launch-copilot.md#verification-and-budget) | Runbook separates real source/browser observations, Node/JSDOM and provider stubs. Private raw evidence remains at its owner. |

Provider CI is the evaluator of the cited integration checks; local observations were produced by the
prior implementing agent and are not independent product acceptance. No historical success is rebound
to this new plan revision. Production preparation failures/waits remain in private history; observe the
actual release owner before making any current deployment claim. A prepared candidate is not deployment.

For this successor, changed joins are plan ownership/A5 and current LC/T/R/A references. Check parsed
frontmatter/five-role identity, predecessor digest/history, links, one current owner, Fleet registration,
Graph `npm run check` and `npm run ci:integration`, plus private routing and workspace owner checks.
Record actual candidate SHA/tree and check results in the PR after commit; after protected merge append
the merge receipt there. Run native `finish` and report retained/archive/retired state separately.
These named checks are a validation plan until observed; no future result is asserted in these bytes.

Remaining findings: full paired public journey, relevant sample/browser edge selection, live drafting
(deferred), actual exact-approved proposal PR/integration, zero always-loaded-byte discrepancy, deployed
LC-06 and commercial LC-07. Each needs its named owner's evidence. Next bounded intent: review one exact
five-file sample through Graph's native review/status path; publication depends on explicit review of
those exact bytes. The private workspace successor carries source/merge refs, owner and completion check.

## GTM

Consume LC-07, T5, A4 and R8. Test the message: import permitted source and inspect real capability,
missing work and a bounded proposal together before funding the build. After outreach authorization,
conduct the five conversations, record the workaround/frequency/cost/decision-maker and offer the
S$200 scope. Record acceptance, decline and objections; deliver against the prospect's criterion.
Collect through a separately authorized supported rail and record amount/currency/reference, actual
delivery/support cost and repeat use. No outreach, invoice, charge or live model call is authorized here.

For a commissioned build, use the existing Commerce/Graph plan: validate offer → approve proposal →
build one vertical slice → prove deployed runtime → deliver/collect → repeat or stop. The predecessor's
provisional 40-hour/10-working-day engineering estimate needs refreshing after grounding; prospect,
provider and approval waits have recheck conditions rather than promised completion times.

Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration,
and Usefulness & Agentic Experience remain **unassessed** for this successor. Readiness, experience,
payment mechanism, demand and revenue are separate. Feed measured outcomes, cost and missed decisions
into a new immutable Context at the existing private workspace owner; never rewrite historical records
or infer savings from structural checks.

[roles]: https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-planning-record.md
[continuity]: https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/adlc-artifact-continuity.md
