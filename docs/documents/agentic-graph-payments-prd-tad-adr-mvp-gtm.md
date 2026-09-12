---
title: "Reference implementation - agentic-graph Payments - PRD-TAD-ADR-MVP-GTM"
doc_type: "PRD-TAD-ADR-MVP-GTM"
doc_id: "KGP-PAYMENTS-001"
version: "1.3.1"
date: "2026-09-12"
authors: ["airvio"]
lang: "en-US"
frontmatter_contract: "required"
owner: "Payments product and architecture"
local_rung: "dev-proven"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
reference_implementation: "Stripe and StraitsX provider bindings, StraitsX card issuing, and XSGD on Avalanche C-Chain behind provider-neutral payment contracts"
tags:
  - "payments"
  - "stripe"
  - "straitsx"
  - "xsgd"
  - "avalanche"
  - "agentic-commerce"
  - "virtual-card"
  - "card-issuing"
  - "paynow"
  - "idempotency"
  - "webhooks"
  - "offline-first"
  - "mcp"
spec_ref: ".kiro/specs/agentic-graph-payments/requirements.md"
spec_version: "0.4.0"
spec_alignment: "reconciled with the normative requirements source; deterministic Dev evidence recorded while every provider, browser, protected, mirror, and deployment gate remains independent"
runtime_readiness_command: "npm run payment:runtime:readiness"
local_vcc_command: "npm run payment:local:vcc"
local_vcc_attestation: "repository-owned execution bound to the inspected source-evidence digest"
guidelines: "huijoohwee.github.io/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
execution_guidelines: "huijoohwee.github.io/guidelines/adlc-guidelines.md"
topology_version: "3"
deployment_authority: "Dev authoring only. Production mirror publication and Cloudflare deployment require a separate explicit operator instruction."
source_checked_at: "2026-07-29"
payment_rails:
  - id: "stripe"
    role: "card and global consumer collection"
    mode: "sandbox only this increment"
    reference: "https://docs.stripe.com/api"
  - id: "straitsx"
    role: "SGD fiat collection; XSGD funding and card issuing remain separately capability-gated"
    mode: "SGD sandbox only; XSGD funding is production-only and separately authorized; card issuing is program-gated"
    reference: "https://docs.straitsx.com/docs/introduction"
agent_platform_readiness:
  agentic_os:
    scope: "in"
    local_rung: "dev-proven"
    delivered_rung: "undocumented"
  ai_agent:
    scope: "in"
    local_rung: "dev-proven"
    delivered_rung: "undocumented"
  mcp_gateway:
    scope: "in"
    local_rung: "dev-proven"
    delivered_rung: "undocumented"
source_references:
  stripe_api: "https://docs.stripe.com/api"
  stripe_mcp: "https://docs.stripe.com/mcp"
  straitsx_guides: "https://docs.straitsx.com/docs/introduction"
  straitsx_say_hello: "https://docs.straitsx.com/reference/say-hello"
  straitsx_cards: "https://docs.straitsx.com/v1-CARDS/docs/introduction"
  straitsx_cards_getting_started: "https://docs.straitsx.com/v1-CARDS/docs/getting-started"
  straitsx_instant_card_issuance: "https://docs.straitsx.com/v1-CARDS/docs/instant-card-issuance"
  avalanche_c_chain: "https://build.avax.network/docs/primary-network/exchange-integration"
  avalanchego: "https://github.com/ava-labs/avalanchego"
ownership_boundaries:
  operator_surface: "docs/documents/agentic-graph-mainpanel-commerce-prd-tad-adr-mvp-gtm.md"
  acp_web3_proof_runtime: "docs/documents/agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.md"
  stripe_mcp_readiness: "docs/documents/agentic-graph-mcp/agentic-graph-stripe-mcp-service.md"
continuity_id: "PLAN-AGENTIC-GRAPH-PAYMENTS-PRD-TAD-ADR-MVP-GTM"
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "1.3.0"
prd_revision: "1.3.1"
tad_revision: "1.3.1"
adr_revision: "1.3.1"
mvp_revision: "1.3.1"
gtm_revision: "1.3.1"
---

# Reference implementation: Reference implementation - agentic-graph Payments - PRD-TAD-ADR-MVP-GTM

This combined planning artifact joins `PLAN-AGENTIC-GRAPH-PAYMENTS-PRD-TAD-ADR-MVP-GTM@1.3.1`. Sections are split solely to keep each authored file below 600 lines. Existing source observations retain their recorded scope and revision. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

<a id="status"></a>
- [Status](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#status)
<a id="authority-and-scope"></a>
- [Authority and Scope](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#authority-and-scope)
<a id="normative-requirements-reconciliation"></a>
- [Normative requirements reconciliation](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#normative-requirements-reconciliation)
<a id="feature-two-rail-payments-capability"></a>
- [Feature: Two-Rail Payments Capability](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#feature-two-rail-payments-capability)
<a id="problem-statement"></a>
- [Problem Statement](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#problem-statement)
<a id="personas"></a>
- [Personas](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#personas)
<a id="journey-jb-buyer_sg---complete-a-purchase-with-an-unreliable-connection"></a>
- [Journey JB: Buyer_SG - complete a purchase with an unreliable connection](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#journey-jb-buyer_sg---complete-a-purchase-with-an-unreliable-connection)
<a id="journey-ja-buying_agent---purchase-on-behalf-of-a-buyer"></a>
- [Journey JA: Buying_Agent - purchase on behalf of a buyer](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#journey-ja-buying_agent---purchase-on-behalf-of-a-buyer)
<a id="journey-jx-buying_agent---complete-an-xsgd-backed-e-commerce-purchase"></a>
- [Journey JX: Buying_Agent - complete an XSGD-backed e-commerce purchase](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#journey-jx-buying_agent---complete-an-xsgd-backed-e-commerce-purchase)
<a id="existing-paywall-lifecycle-crosswalk"></a>
- [Existing Paywall lifecycle crosswalk](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#existing-paywall-lifecycle-crosswalk)
<a id="journey-jo-solo_operator---enable-a-rail-from-zero-state"></a>
- [Journey JO: Solo_Operator - enable a rail from zero state](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#journey-jo-solo_operator---enable-a-rail-from-zero-state)
<a id="user-stories"></a>
- [User Stories](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#user-stories)
<a id="acceptance-criteria"></a>
- [Acceptance Criteria](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#acceptance-criteria)
<a id="r1---server-side-trust-boundary-and-secret-custody"></a>
- [R1 - Server-side trust boundary and secret custody](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r1---server-side-trust-boundary-and-secret-custody)
<a id="r2---rail-selection"></a>
- [R2 - Rail selection](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r2---rail-selection)
<a id="r3---card-rail-intent-creation-and-idempotency"></a>
- [R3 - Card-rail intent creation and idempotency](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r3---card-rail-intent-creation-and-idempotency)
<a id="r4---straitsx-rail-for-sgd-fiat-and-xsgd"></a>
- [R4 - StraitsX rail for SGD fiat and XSGD](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r4---straitsx-rail-for-sgd-fiat-and-xsgd)
<a id="r5---provider-event-authentication-and-replay-safe-settlement"></a>
- [R5 - Provider event authentication and replay-safe settlement](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r5---provider-event-authentication-and-replay-safe-settlement)
<a id="r6---offline-intent-queue-and-reconnect-reconciliation"></a>
- [R6 - Offline intent queue and reconnect reconciliation](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r6---offline-intent-queue-and-reconnect-reconciliation)
<a id="r7---payment-record-serialization-and-receipt-round-trip"></a>
- [R7 - Payment record serialization and receipt round-trip](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r7---payment-record-serialization-and-receipt-round-trip)
<a id="r8---buyer-payment-surface-states"></a>
- [R8 - Buyer payment surface states](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r8---buyer-payment-surface-states)
<a id="r9---agent-payment-discovery-and-approval-gated-tools"></a>
- [R9 - Agent payment discovery and approval-gated tools](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r9---agent-payment-discovery-and-approval-gated-tools)
<a id="r10---typed-failures-and-refunds"></a>
- [R10 - Typed failures and refunds](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r10---typed-failures-and-refunds)
<a id="r11---cost-observability-token-economics-and-readiness-gates"></a>
- [R11 - Cost observability, token economics, and readiness gates](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r11---cost-observability-token-economics-and-readiness-gates)
<a id="r12---data-minimization-compliance-boundary-and-release-boundary"></a>
- [R12 - Data minimization, compliance boundary, and release boundary](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r12---data-minimization-compliance-boundary-and-release-boundary)
<a id="r13---existing-paywall-invocation-and-lifecycle-control"></a>
- [R13 - Existing Paywall invocation and lifecycle control](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r13---existing-paywall-invocation-and-lifecycle-control)
<a id="r14---kyc-bound-xsgd-funding"></a>
- [R14 - KYC-bound XSGD funding](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r14---kyc-bound-xsgd-funding)
<a id="r15---bounded-e-commerce-discovery"></a>
- [R15 - Bounded e-commerce discovery](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r15---bounded-e-commerce-discovery)
<a id="r16---approval-bound-disposable-virtual-card-issuance"></a>
- [R16 - Approval-bound disposable virtual-card issuance](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r16---approval-bound-disposable-virtual-card-issuance)
<a id="r17---agent-checkout-execution-and-terminal-reconciliation"></a>
- [R17 - Agent checkout execution and terminal reconciliation](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#r17---agent-checkout-execution-and-terminal-reconciliation)
<a id="time-to-value"></a>
- [Time-to-Value](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#time-to-value)
<a id="success-metrics"></a>
- [Success Metrics](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-02.md#success-metrics)
<a id="moscow-priority"></a>
- [MoSCoW Priority](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-02.md#moscow-priority)
<a id="min-viable-scope"></a>
- [Min-Viable Scope](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-02.md#min-viable-scope)
<a id="out-of-scope"></a>
- [Out of Scope](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-02.md#out-of-scope)
<a id="dependencies"></a>
- [Dependencies](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-02.md#dependencies)
<a id="open-questions"></a>
- [Open Questions](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-02.md#open-questions)
<a id="architecture-agentic-graph-payments"></a>
- [Architecture: agentic-graph Payments](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-02.md#architecture-agentic-graph-payments)
<a id="overview"></a>
- [Overview](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-02.md#overview)
<a id="journey-to-system-mapping"></a>
- [Journey to System Mapping](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-02.md#journey-to-system-mapping)
<a id="topology"></a>
- [Topology](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-02.md#topology)
<a id="topology-version-3-buyer-side-agentic-purchase-extension"></a>
- [Topology version 3: buyer-side agentic purchase extension](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-02.md#topology-version-3-buyer-side-agentic-purchase-extension)
<a id="workflow-specifications"></a>
- [Workflow Specifications](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#workflow-specifications)
<a id="workflow-w1-rail-selection-and-intent-creation"></a>
- [Workflow W1: Rail selection and intent creation](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#workflow-w1-rail-selection-and-intent-creation)
<a id="workflow-w2-provider-event-ingestion-and-settlement"></a>
- [Workflow W2: Provider event ingestion and settlement](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#workflow-w2-provider-event-ingestion-and-settlement)
<a id="workflow-w3-offline-queue-and-reconnect-reconciliation"></a>
- [Workflow W3: Offline queue and reconnect reconciliation](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#workflow-w3-offline-queue-and-reconnect-reconciliation)
<a id="workflow-w4-receipt-projection"></a>
- [Workflow W4: Receipt projection](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#workflow-w4-receipt-projection)
<a id="workflow-w5-agent-discovery"></a>
- [Workflow W5: Agent discovery](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#workflow-w5-agent-discovery)
<a id="workflow-w6-rail-readiness"></a>
- [Workflow W6: Rail readiness](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#workflow-w6-rail-readiness)
<a id="workflow-w7-typed-failure-and-refund"></a>
- [Workflow W7: Typed failure and refund](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#workflow-w7-typed-failure-and-refund)
<a id="workflow-w8-existing-paywall-lifecycle-coordination"></a>
- [Workflow W8: Existing-Paywall lifecycle coordination](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#workflow-w8-existing-paywall-lifecycle-coordination)
<a id="workflow-w9-kyc-bound-xsgd-funding"></a>
- [Workflow W9: KYC-bound XSGD funding](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#workflow-w9-kyc-bound-xsgd-funding)
<a id="workflow-w10-bounded-commerce-discovery"></a>
- [Workflow W10: Bounded commerce discovery](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#workflow-w10-bounded-commerce-discovery)
<a id="workflow-w11-approval-bound-disposable-card-issuance"></a>
- [Workflow W11: Approval-bound disposable card issuance](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#workflow-w11-approval-bound-disposable-card-issuance)
<a id="workflow-w12-secure-checkout-authorization-reconciliation-and-disposal"></a>
- [Workflow W12: Secure checkout, authorization, reconciliation, and disposal](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#workflow-w12-secure-checkout-authorization-reconciliation-and-disposal)
<a id="data-flows"></a>
- [Data Flows](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#data-flows)
<a id="df1-intent-ingest"></a>
- [DF1: Intent ingest](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#df1-intent-ingest)
<a id="df2-provider-create"></a>
- [DF2: Provider create](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#df2-provider-create)
<a id="df3-event-ingest-and-settlement"></a>
- [DF3: Event ingest and settlement](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#df3-event-ingest-and-settlement)
<a id="df4-queue-persistence"></a>
- [DF4: Queue persistence](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#df4-queue-persistence)
<a id="df5-record-serialization"></a>
- [DF5: Record serialization](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#df5-record-serialization)
<a id="df6-capability-metadata-read"></a>
- [DF6: Capability metadata read](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#df6-capability-metadata-read)
<a id="df7-readiness-snapshot"></a>
- [DF7: Readiness snapshot](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#df7-readiness-snapshot)
<a id="df8-agentic-lifecycle-state"></a>
- [DF8: Agentic lifecycle state](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#df8-agentic-lifecycle-state)
<a id="df9-xsgd-funding"></a>
- [DF9: XSGD funding](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#df9-xsgd-funding)
<a id="df10-commerce-candidate-extraction"></a>
- [DF10: Commerce candidate extraction](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#df10-commerce-candidate-extraction)
<a id="df11-virtual-card-issuance"></a>
- [DF11: Virtual-card issuance](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#df11-virtual-card-issuance)
<a id="df12-checkout-execution-and-authorization"></a>
- [DF12: Checkout execution and authorization](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-03.md#df12-checkout-execution-and-authorization)
<a id="orchestrationharness-flows"></a>
- [Orchestration/Harness Flows](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-04.md#orchestrationharness-flows)
<a id="h0-payment-os-status-surface-read-view"></a>
- [H0: Payment OS Status Surface read view](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-04.md#h0-payment-os-status-surface-read-view)
<a id="h1-optional-payment-adjacent-explanation-harness-disabled-in-this-increment"></a>
- [H1: Optional payment-adjacent explanation harness, disabled in this increment](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-04.md#h1-optional-payment-adjacent-explanation-harness-disabled-in-this-increment)
<a id="h2-bounded-non-financial-commerce-semantic-matching"></a>
- [H2: Bounded non-financial commerce semantic matching](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-04.md#h2-bounded-non-financial-commerce-semantic-matching)
<a id="workflow-and-harness-diagrams"></a>
- [Workflow and Harness Diagrams](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-04.md#workflow-and-harness-diagrams)
<a id="reference-implementation-component-specifications"></a>
- [Reference implementation: Component Specifications](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-05.md#reference-implementation-component-specifications)
<a id="reference-implementation-cross-boundary-integration-contracts"></a>
- [Reference implementation: Cross-Boundary Integration Contracts](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-06.md#reference-implementation-cross-boundary-integration-contracts)
<a id="reference-implementation-provider-integration-contracts"></a>
- [Reference implementation: Provider Integration Contracts](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-06.md#reference-implementation-provider-integration-contracts)
<a id="interface-stripe-rest-api"></a>
- [Interface: Stripe REST API](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-06.md#interface-stripe-rest-api)
<a id="interface-hosted-stripe-mcp-transport"></a>
- [Interface: hosted Stripe MCP transport](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-06.md#interface-hosted-stripe-mcp-transport)
<a id="interface-straitsx-rest-api"></a>
- [Interface: StraitsX REST API](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-06.md#interface-straitsx-rest-api)
<a id="interface-straitsx-xsgd-account-funding-reference-implementation"></a>
- [Interface: StraitsX XSGD account funding, reference implementation](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-06.md#interface-straitsx-xsgd-account-funding-reference-implementation)
<a id="interface-straitsx-card-program-reference-implementation"></a>
- [Interface: StraitsX Card Program, reference implementation](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-06.md#interface-straitsx-card-program-reference-implementation)
<a id="interface-avalanche-c-chain-for-xsgd-reference-implementation"></a>
- [Interface: Avalanche C-Chain for XSGD, reference implementation](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-06.md#interface-avalanche-c-chain-for-xsgd-reference-implementation)
<a id="quality-attribute-summary"></a>
- [Quality Attribute Summary](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-06.md#quality-attribute-summary)
<a id="lane-and-diagram-strategy"></a>
- [Lane and Diagram Strategy](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-06.md#lane-and-diagram-strategy)
<a id="architecture-diagrams"></a>
- [Architecture Diagrams](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-06.md#architecture-diagrams)
<a id="diagram-1-rail-selection-and-settlement-control-flow"></a>
- [Diagram 1: Rail selection and settlement control flow](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-06.md#diagram-1-rail-selection-and-settlement-control-flow)
<a id="diagram-2-offline-capture-to-reconnect-settlement"></a>
- [Diagram 2: Offline capture to reconnect settlement](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-06.md#diagram-2-offline-capture-to-reconnect-settlement)
<a id="diagram-3-agent-discovery-federation"></a>
- [Diagram 3: Agent discovery federation](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-06.md#diagram-3-agent-discovery-federation)
<a id="architectural-decisions"></a>
- [Architectural Decisions](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-07.md#architectural-decisions)
<a id="adr-1-use-a-provider-hosted-checkout-session-for-the-card-rail"></a>
- [ADR-1: Use a provider-hosted checkout session for the card rail](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-07.md#adr-1-use-a-provider-hosted-checkout-session-for-the-card-rail)
<a id="adr-2-add-an-sgd-fiat-rail-and-defer-xsgd-until-its-exact-provider-contract-is-bound"></a>
- [ADR-2: Add an SGD fiat rail and defer XSGD until its exact provider contract is bound](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-07.md#adr-2-add-an-sgd-fiat-rail-and-defer-xsgd-until-its-exact-provider-contract-is-bound)
<a id="adr-3-treat-provider-state-as-authoritative-and-inbound-events-as-hints"></a>
- [ADR-3: Treat provider state as authoritative and inbound events as hints](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-07.md#adr-3-treat-provider-state-as-authoritative-and-inbound-events-as-hints)
<a id="adr-4-federate-the-existing-hosted-mcp-transport-instead-of-building-a-payment-gateway-proxy"></a>
- [ADR-4: Federate the existing hosted MCP transport instead of building a payment gateway proxy](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-07.md#adr-4-federate-the-existing-hosted-mcp-transport-instead-of-building-a-payment-gateway-proxy)
<a id="adr-5-own-the-offline-intent-queue-in-the-client-rather-than-deferring-to-server-side-retry"></a>
- [ADR-5: Own the offline intent queue in the client rather than deferring to server-side retry](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-07.md#adr-5-own-the-offline-intent-queue-in-the-client-rather-than-deferring-to-server-side-retry)
<a id="adr-6-enhance-the-existing-paywall-as-the-single-agentic-purchase-control-surface"></a>
- [ADR-6: Enhance the existing Paywall as the single agentic-purchase control surface](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-07.md#adr-6-enhance-the-existing-paywall-as-the-single-agentic-purchase-control-surface)
<a id="adr-7-gate-xsgd-on-avalanche-funding-on-chain-and-provider-account-authority"></a>
- [ADR-7: Gate XSGD-on-Avalanche funding on chain and provider-account authority](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-07.md#adr-7-gate-xsgd-on-avalanche-funding-on-chain-and-provider-account-authority)
<a id="adr-8-implement-disposable-card-behavior-as-source-bound-authorization-plus-safe-closure"></a>
- [ADR-8: Implement disposable-card behavior as source-bound authorization plus safe closure](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-07.md#adr-8-implement-disposable-card-behavior-as-source-bound-authorization-plus-safe-closure)
<a id="quality-attributes"></a>
- [Quality Attributes](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-07.md#quality-attributes)
<a id="deployment-strategy"></a>
- [Deployment Strategy](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#deployment-strategy)
<a id="functional-lanes"></a>
- [Functional lanes](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#functional-lanes)
<a id="deploy-boundary-register"></a>
- [Deploy Boundary Register](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#deploy-boundary-register)
<a id="reference-implementation-component-inventory"></a>
- [Reference implementation: Component Inventory](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#reference-implementation-component-inventory)
<a id="agentic-os-agentic-graph-payments"></a>
- [Agentic OS: agentic-graph Payments](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#agentic-os-agentic-graph-payments)
<a id="ai-agent-discovery-agentic-graph-payments"></a>
- [AI Agent Discovery: agentic-graph Payments](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#ai-agent-discovery-agentic-graph-payments)
<a id="canonical-invocation-projection"></a>
- [Canonical Invocation Projection](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#canonical-invocation-projection)
<a id="gateway-federation-agentic-graph-payments"></a>
- [Gateway Federation: agentic-graph Payments](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#gateway-federation-agentic-graph-payments)
<a id="execution-order"></a>
- [Execution Order](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#execution-order)
<a id="readiness-gap-matrix"></a>
- [Readiness Gap Matrix](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#readiness-gap-matrix)
<a id="prd--tad--vcc"></a>
- [PRD ↔ TAD ↔ VCC](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#prd--tad--vcc)
<a id="requirement--flow-coverage"></a>
- [Requirement → Flow coverage](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#requirement--flow-coverage)
<a id="reference-source-bindings"></a>
- [Reference source bindings](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#reference-source-bindings)
<a id="pre-implementation"></a>
- [Pre-Implementation](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#pre-implementation)
<a id="post-documentation-review"></a>
- [Post-Documentation Review](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#post-documentation-review)
<a id="evidence-reference-register"></a>
- [Evidence Reference Register](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#evidence-reference-register)
<a id="provisional-alignment-self-audit"></a>
- [Provisional Alignment Self-Audit](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-09.md#provisional-alignment-self-audit)
<a id="blocking-gates"></a>
- [Blocking Gates](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-09.md#blocking-gates)
<a id="planning-revision--reference-implementation"></a>
- [Planning revision — reference implementation](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-09.md#planning-revision--reference-implementation)
<a id="mvp--reference-implementation"></a>
- [MVP — reference implementation](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-09.md#mvp--reference-implementation)
<a id="gtm--reference-implementation"></a>
- [GTM — reference implementation](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-09.md#gtm--reference-implementation)
<a id="planning-gaps--reference-implementation"></a>
- [Planning gaps — reference implementation](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-09.md#planning-gaps--reference-implementation)

<a id="reference-implementation-agentic-graph-payments-prd-tad-adr-mvp-gtm"></a> [Reference implementation: agentic-graph Payments PRD-TAD-ADR-MVP-GTM](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#reference-implementation-agentic-graph-payments-prd-tad-adr-mvp-gtm)
<a id="part-i---prd"></a> [PART I - PRD](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-01.md#part-i---prd)
<a id="part-ii---tad"></a> [PART II - TAD](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-02.md#part-ii---tad)
<a id="part-iii---agent-platform-readiness"></a> [PART III - AGENT-PLATFORM READINESS](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#part-iii---agent-platform-readiness)
<a id="part-iv---traceability"></a> [PART IV - TRACEABILITY](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#part-iv---traceability)
<a id="part-v---validation-status"></a> [PART V - VALIDATION STATUS](agentic-graph-payments-prd-tad-adr-mvp-gtm.part-08.md#part-v---validation-status)
