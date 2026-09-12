---
title: "Strytree C6-C7"
doc_type: "PRD-TAD-ADR-MVP-GTM"
status: "implementation-contract"
lang: "en-US"
frontmatter_contract: "required"
source_contract: "./agentic-graph-strytree-prd-tad-adr-mvp-gtm.md"
version: "0.2.3"
date: "2026-09-12"
owner: "Product maintainers"
continuity_id: "PLAN-AGENTIC-GRAPH-STRYTREE-PRD-TAD-ADR-MVP-GTM"
local_rung: "undocumented"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "0.2.2"
prd_revision: "0.2.3"
tad_revision: "0.2.3"
adr_revision: "0.2.3"
mvp_revision: "0.2.3"
gtm_revision: "0.2.3"
---

# Reference implementation: Strytree C6-C7

This combined planning artifact joins `PLAN-AGENTIC-GRAPH-STRYTREE-PRD-TAD-ADR-MVP-GTM@0.2.3`. Sections are split solely to keep each authored file below 600 lines. Existing source observations retain their recorded scope and revision. The links below preserve the original section anchors and locate the unchanged requirement/design/decision text plus the current MVP/GTM assessment.

<a id="c6-payment-and-credit-token-workflow"></a>
- [C6. Payment And Credit-Token Workflow](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-01.md#c6-payment-and-credit-token-workflow)
<a id="workflow-buy-credit-tokens"></a>
- [Workflow: Buy Credit Tokens](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-01.md#workflow-buy-credit-tokens)
<a id="workflow-generate-new-branch"></a>
- [Workflow: Generate New Branch](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-01.md#workflow-generate-new-branch)
<a id="workflow-compare-and-merge-candidate-branches"></a>
- [Workflow: Compare And Merge Candidate Branches](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-01.md#workflow-compare-and-merge-candidate-branches)
<a id="workflow-unlock-protected-branch"></a>
- [Workflow: Unlock Protected Branch](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-01.md#workflow-unlock-protected-branch)
<a id="c7-api-contracts"></a>
- [C7. API Contracts](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-01.md#c7-api-contracts)
<a id="get-apistrytreestoriesstoryidtree"></a>
- [GET `/api/strytree/stories/:storyId/tree`](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-01.md#get-apistrytreestoriesstoryidtree)
<a id="post-apistrytreegeneration-jobs"></a>
- [POST `/api/strytree/generation-jobs`](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-01.md#post-apistrytreegeneration-jobs)
<a id="get-apistrytreegeneration-jobsjobid"></a>
- [GET `/api/strytree/generation-jobs/:jobId`](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-01.md#get-apistrytreegeneration-jobsjobid)
<a id="post-apistrytreecandidate-runs"></a>
- [POST `/api/strytree/candidate-runs`](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-01.md#post-apistrytreecandidate-runs)
<a id="get-apistrytreecandidate-runscandidaterunid"></a>
- [GET `/api/strytree/candidate-runs/:candidateRunId`](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-01.md#get-apistrytreecandidate-runscandidaterunid)
<a id="post-apistrytreecandidatescandidateidpublish"></a>
- [POST `/api/strytree/candidates/:candidateId/publish`](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-01.md#post-apistrytreecandidatescandidateidpublish)
<a id="post-apistrytreenodesnodeidunlock"></a>
- [POST `/api/strytree/nodes/:nodeId/unlock`](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-01.md#post-apistrytreenodesnodeidunlock)
<a id="post-apistrytreecheckoutsessions"></a>
- [POST `/api/strytree/checkout/sessions`](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-01.md#post-apistrytreecheckoutsessions)
<a id="post-apistrytreecheckoutsessionssessionidcomplete"></a>
- [POST `/api/strytree/checkout/sessions/:sessionId/complete`](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-02.md#post-apistrytreecheckoutsessionssessionidcomplete)
<a id="post-apistrytreecheckoutwebhook"></a>
- [POST `/api/strytree/checkout/webhook`](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-02.md#post-apistrytreecheckoutwebhook)
<a id="get-apistrytreewallet"></a>
- [GET `/api/strytree/wallet`](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-02.md#get-apistrytreewallet)
<a id="planning-continuity--reference-implementation"></a>
- [Planning continuity — reference implementation](agentic-graph-strytree-prd-tad-adr-mvp-gtm-workflows-api.part-02.md#planning-continuity--reference-implementation)
