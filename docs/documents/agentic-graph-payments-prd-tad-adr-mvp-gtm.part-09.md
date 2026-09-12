---
title: "Reference implementation: agentic-graph-payments-prd-tad-adr-mvp-gtm section 9"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "1.3.1"
date: "2026-09-12"
lang: "en-US"
owner: "Payments product and architecture"
continuity_id: "PLAN-AGENTIC-GRAPH-PAYMENTS-PRD-TAD-ADR-MVP-GTM"
prd_revision: "1.3.1"
tad_revision: "1.3.1"
adr_revision: "1.3.1"
mvp_revision: "1.3.1"
gtm_revision: "1.3.1"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
parent: "agentic-graph-payments-prd-tad-adr-mvp-gtm.md"
guideline_revision: "2.7.0"
source_section_lines: "3179-3276"
---

[Combined planning owner](agentic-graph-payments-prd-tad-adr-mvp-gtm.md) · `PLAN-AGENTIC-GRAPH-PAYMENTS-PRD-TAD-ADR-MVP-GTM@1.3.1`. This companion preserves the source section; diagrams and frontmatter projections remain owned by the combined artifact.

## Provisional Alignment Self-Audit

This authoring self-audit is not itself an Evidence Reference. A mechanically independent,
source-digest-bound evaluator now supplies the deterministic local Evidence Reference above;
it does not claim provider, browser, protected-integration, mirror, or delivery conformance.
The revision-scoped review covers 22 artifact-bearing authoring rules linked to frontmatter,
requirements, topology, lanes, VCCs, readiness, agent dimensions, source bindings, diagrams,
ADRs, validation, existing-surface ownership, and the Increment 2 lifecycle. Linked-artifact
coverage is **20/22** for that scope: provider-inclusive TCO and canonical external
invocation-owner acceptance remain outstanding. **6 advisory rules** were considered
separately.

Counts are explicit for every authoring Finding Type in guideline version 1.7.0:

| Finding Type | Count | Finding Type | Count |
|---|---:|---|---:|
| `missing-frontmatter-key` | 0 | `malformed-document` | 0 |
| `unknown-status` | 0 | `unproven-claim` | 0 |
| `blended-status` | 0 | `unimplemented-guideline` | 0 |
| `unguided-artifact` | 0 | `unresolvable-reference` | 0 |
| `stale-evidence` | 0 | `missing-companion` | 0 |
| `duplicate-owner` | 0 | `status-conflict` | 0 |
| `gate-order-drift` | 0 | `gate-sequence-violation` | 0 |
| `vendor-coupling` | 0 | `path-derived-claim` | 0 |
| `non-modular-section` | 0 | `missing-economics-metric` | 1 |
| `blended-deployment-tco` | 0 | `missing-foss-comparison` | 0 |
| `unbounded-loop` | 0 | `paid-read-path` | 0 |
| `incomplete-delivery-reach` | 0 | `orphan-route` | 0 |
| `ambiguous-route` | 0 | `unfederated-tool` | 0 |
| `uncatalogued-tool` | 0 | `missing-lane` | 0 |
| `incomplete-lane-transition` | 0 | `deploy-boundary-breach` | 0 |
| `ungated-promotion` | 0 | `incomplete-topology-node` | 0 |

Issues corrected during the review included the stale guideline filename, blended readiness,
missing functional lanes, unsupported runtime claims, missing reference-implementation label,
and stale provider-source interpretations. They are not active findings in the revised
artifact.

One active major authoring finding remains formally blocked from sign-off:

| Finding Type | Severity | Artifact reference | Evidence excerpt | Remediation |
|---|---|---|---|---|
| `missing-economics-metric` | major | Provider-inclusive TCO | Increment 1 collection schedules are unknown under OQ-1; Increment 2 card, PCI, blockchain, dispute, and model schedules are unknown under OQ-22 | Record provider-inclusive monthly TCO at launch load and recompute Increment 2 ROI before any live enablement |

Open product and implementation questions remain in OQ-1 … OQ-25 and do not advance
readiness.

## Blocking Gates

| Gate | Blocked by | Unblocks |
|---|---|---|
| Two-rail paid-sandbox proof | Sandbox credentials, provider product grants, authenticated callbacks, authoritative provider reads, and paid settlement on both rails | Runtime readiness beyond deterministic Dev conformance |
| SGD rail sandbox enablement | OQ-2 (approved integration model), OQ-10 (granted payment method), credentials, callback configuration, and authenticated sandbox settlement evidence | Local SGD rail runtime proof |
| SGD rail enablement beyond sandbox | OQ-1 (pricing), provider production approval, live credentials, complete local evidence, protected integration, and a separate release instruction | Live SGD collection |
| Increment 1 XSGD collection acceptance | OQ-9 (authenticated account grant/response, returned address, provider-credit semantics, settlement contract, and applicability of the documented production-only deposit path to this rail) | Should-tier XSGD collection settlement only |
| Increment 2 XSGD/Avalanche funding admission | OQ-9 and OQ-18; exact KYC account/product/network/token/deposit-address tuple; approved external signer; provider-credit and card-settlement authority; separate authorization for production-only financial proof | R14 provider-backed funding proof |
| Increment 2 commerce discovery admission | OQ-20 and OQ-23; approved browser-control owner, allowlisted merchant fixture, robots/terms permission, immutable-envelope and cancellation contract | R15 deterministic browser proof |
| Increment 2 Card Program admission | OQ-17; authenticated issuer-group, plan, virtual product, funding source, account currency, pool, KYC/cardholder, 3DS, host, and credential grants | R16 sandbox issuance proof |
| Increment 2 secure credential admission | OQ-19; provider-hosted or PCI-scoped broker plus screenshot/telemetry planted-secret proof | R16 secure injection and any R17 merchant checkout |
| Increment 2 authorization/disposal admission | OQ-21; provider-reviewed authorization, hold/capture/reversal/refund/force-post, deadline, duplicate, concurrency, and safe-close contract | R16 disposal and R17 authorization proof |
| Increment 2 provider sandbox | Card Program, secure-broker, funding-bridge, and authorization admissions; deterministic local and spend-safety gates are already source-proven | Authenticated issuance/activation/control/RHA/event/close evidence |
| Increment 2 browser proof | Provider sandbox; approved merchant fixture; H2 bounds/cost logs; price/origin revalidation; buyer-authentication path; 375×812 existing-Paywall proof | Browser rung for R13, R15-R17 |
| Increment 2 provider-backed golden path | Browser proof; OQ-18 bridge closure; explicit financial/provider authority; one reconciled funding credit, card, authorization, order, receipt, and safe disposal | Runtime-ready lifecycle evidence without enabling live/public delivery |
| Increment 2 UI enablement | All R13-R17 Evidence References, readiness report, provider-inclusive TCO under OQ-22, and explicit operator approval | Existing Paywall may advertise the lifecycle as available in the authorized Dev environment |
| Increment 2 external agent invocation | OQ-24; accepted canonical command, semantic tag, binding, and MCP identities in the Agentic Canvas OS owners | Invocation beyond the implemented identity-bound direct-import host seam |
| Increment 2 operator TTV sign-off | OQ-25 measured provider onboarding plus clean-environment steady-state buyer walk-through | Credible demo schedule and TTV metric |
| StraitsX refund | OQ-16 (exact official endpoint, eligibility, idempotency, account grant) | Refund provider call on the SGD rail |
| Any payment-adjacent model call | OQ-13 (R11 vs R12 input tension) | Enabling H1 |
| Agent live orchestration | Must-tier spend-safety VCCs (R9-VCC2, R9-VCC3) | Follow-on operator UI surfacing |
| Mirror publication | Closed boundary `PAYMENTS-AUTHORING-TO-MIRROR` | Mirror change only after qualifying evidence and explicit operator instruction |
| Public delivery | Closed boundary `PAYMENTS-MIRROR-TO-DELIVERY` | Public change only after approved mirror evidence and explicit operator instruction |

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-PAYMENTS-PRD-TAD-ADR-MVP-GTM@1.3.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [PART I - PRD](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#part-i---prd) |
| TAD | [PART II - TAD](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-02.md#part-ii---tad) |
| ADR | [Architectural Decisions](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-07.md#architectural-decisions) |
| MVP | [MVP — reference implementation](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-09.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-09.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run check` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`grph-shared/src/payments/stripePaymentSsot.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/grph-shared/src/payments/stripePaymentSsot.ts), [`canvas/src/features/payments/stripeCheckout.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/payments/stripeCheckout.ts), [`canvas/src/features/payments/providers.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/features/payments/providers.ts). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.
