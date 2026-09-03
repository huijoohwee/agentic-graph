---
title: "agentic-graph SME Protection Graph — PRD/TAD"
graphId: "md:agentic-graph-sme-protection-gap-prd-tad"
doc_type: "Combined PRD/TAD"
date: "2026-07-13"
lang: "en-US"
schema: "agentic-graph-prd-tad/v1"
frontmatter_contract: "required"
status: "spec-complete"
authority: "SME protection-gap product and technical contract"
runtime_scope: "Dev-only discovery, evidence mapping, and review-first protection guidance"
runtime_claim: "The native SuperAgent discovery run and deterministic /sme-care-agent baseline are proven; the broader reviewed protection product described here is not implemented or deployed."
discovery_run: "data/outputs/sme-protection-gap-sme-run/harness-proof.json"
deploy_boundary: "No Prod mirror, Cloudflare, quote, bind, purchase, or regulated-advice action"
invocation:
  action: "/change"
  scope: "#sme-protection-gap"
  actor: "@codex-sme-protection-gap"
  base_sha: "f3d10faedfd8237d5c62ef1d108d4811272298b0"
operating_priorities:
  - "minimum-viable-maximum-value"
  - "time-to-value"
  - "evidence-before-inference"
  - "FOSS-first"
  - "human-review-before-regulated-action"
problem_hypothesis: "A living evidence graph can reveal material protection unknowns earlier and prepare SMEs and advisers to act without automating regulated insurance decisions."
acceptance:
  - "Every material finding carries evidence or an explicit assumption and separate urgency and confidence."
  - "No unreviewed candidate mutates the active graph or triggers quote, bind, purchase, claim, payment, or deployment."
  - "The MVP produces a source-linked adviser packet and measurable unknown-reduction actions."
tco_estimate: "Deterministic stages use zero model tokens; pilot TCO is dominated by document handling, expert review, security, compliance, support, and configured model usage."
token_budget: "MVP default per compile: 50000 filtered input tokens, 4000 output tokens per model-backed stage, two compile iterations, one repair attempt."
vcc_map: ["VCC-1", "VCC-2", "VCC-3", "VCC-4", "VCC-5", "VCC-6", "VCC-7", "VCC-8", "VCC-9"]
---

# agentic-graph SME Protection Graph

## Executive Decision

Build a **living protection graph**, not a generic chatbot and not an automated insurance seller.

The graph connects what an SME depends on, what can interrupt or damage it, what controls reduce the risk, what insurance language may respond, what conditions or exclusions may prevent a response, and what evidence supports each conclusion. The user sees two independent signals:

1. **Urgency** — the potential business consequence and apparent protection shortfall.
2. **Confidence** — the freshness, completeness, and quality of evidence behind the finding.

Unknowns must never be scored as safe. A high-urgency, low-confidence finding becomes an evidence request and human-review priority.

The minimum viable product accepts a short business intake plus documents the SME already has, then produces a prioritized protection map, low-regret resilience actions, and a broker/adviser-ready review packet. It does not quote, recommend a specific carrier, bind coverage, settle claims, or present legal or regulated advice.

## Problem Statement

Most SMEs do not know what they do not know. Gaps across cyber, supply-chain, physical-asset, liability, and business-interruption protection remain hidden until a loss occurs or a claim is disputed. Business growth quietly changes assets, dependencies, contractual obligations, data exposure, locations, headcount, and revenue while policies and controls may remain static.

Authoritative guidance supports the core product hypotheses:

- NIST's CSF 2.0 small-business guide is designed for organizations with modest or no cybersecurity plans and frames cybersecurity as a cycle of Govern, Identify, Protect, Detect, Respond, and Recover rather than a one-time checklist.
- CISA explicitly prioritizes limited, high-impact practices for smaller organizations and provides SME supply-chain assessment guidance because many lack dedicated risk-management expertise.
- OECD guidance frames digital security as an economic and social business risk, not only a technical issue, and notes that smaller firms often lack the awareness, resources, or expertise to assess exposure.
- NAIC material shows that cyber policies contain policy-specific features and exclusions, while its AI model bulletin emphasizes accuracy, fairness, transparency, governance, validation, and documentation for AI-supported insurance decisions.
- SBA guidance treats risk assessment, business continuity, physical assets, operating expenses, and insurance as connected resilience concerns.

These sources justify an evidence-linked protection map. They do not justify a universal coverage verdict or a claim that one control, policy, or score is correct in every jurisdiction.

## Jobs To Be Done

| User | Job | Current failure | Desired outcome |
|---|---|---|---|
| Owner or operator | Understand what could stop the business and what to do next | Risk language is fragmented and expert-heavy | A plain-language, ranked protection map in one session |
| Finance lead | Test whether limits, deductibles, and interruption assumptions still fit the business | Policy schedules and financial exposure are reviewed separately | Traceable ranges and evidence requests for material mismatches |
| Operations lead | Identify supplier, location, equipment, and process concentration | Dependencies live in spreadsheets or people's heads | A dependency graph with single points of failure and recovery actions |
| IT or managed-service provider | Translate controls into business and insurance relevance | Security posture and policy conditions are disconnected | Control evidence mapped to scenarios and policy conditions |
| Broker or licensed adviser | Prepare for a high-quality review with less discovery effort | Incomplete client data causes repeated back-and-forth | A source-linked packet of changes, unknowns, and candidate gaps |
| Insurer or risk partner | Improve risk conversations without opaque automation | Inputs are inconsistent and AI outputs may be unauditable | Structured, reviewable evidence and transparent decision support |

## Product Principles

| Principle | Product rule |
|---|---|
| Evidence before inference | Every material finding links to a document span, user attestation, integration signal, deterministic rule, or named assumption. |
| Unknown is a first-class state | Missing, conflicting, unreadable, or stale evidence produces `unknown`, never an invented value or silent default. |
| Separate urgency from confidence | Do not collapse consequence and evidence quality into one reassuring score. |
| Ask only what changes a decision | Rank evidence requests by expected effect on urgency, eligibility, or recommended action. |
| Protection before product | Recommend low-regret controls, continuity actions, and expert review before insurance products. |
| Review before mutation | AI output is a candidate graph delta until the SME or authorized adviser accepts it. |
| Neutral core, local adapters | Keep the ontology provider-neutral; load jurisdiction, sector, and policy-form rules through versioned source packs. |
| Freshness is visible | “Real time” means event-driven recomputation with `observed_at`, `effective_at`, and `expires_at`, not a permanent live-data claim. |
| Minimize sensitive data | Prefer document hashes, extracted evidence spans, coarse ranges, and user-controlled storage over raw data retention. |

## Protection Graph Ontology

### Core Nodes

| Node | Purpose | Minimum evidence |
|---|---|---|
| `Business_Entity` | Legal and operating entity whose exposure is assessed | Entity name or user-confirmed placeholder, jurisdiction status |
| `Growth_Event` | Change that may create or alter exposure | Event type, effective date, source or attestation |
| `Asset` | Physical, digital, financial, data, or intangible item of value | Owner, location or system context, criticality band |
| `Business_Process` | Revenue, service, production, fulfilment, payment, or support activity | Process owner, recovery objective or qualitative criticality |
| `Dependency` | Supplier, cloud service, person, utility, location, equipment, or logistics dependency | Dependency type, supplied capability, substitutability |
| `Risk_Scenario` | Plausible event and consequence chain | Trigger, affected nodes, consequence dimensions |
| `Control` | Preventive, detective, responsive, or recovery measure | Control state, evidence source, last verified date |
| `Policy` | Insurance contract and effective period | Carrier-neutral identifier, insured entity, dates, source hash |
| `Coverage_Section` | Insuring clause, extension, endorsement, or sublimit | Exact wording locator and normalized category |
| `Exclusion` | Language that may remove or narrow response | Exact wording locator; no inferred applicability without review |
| `Condition` | Warranty, duty, prerequisite, notification, or evidence requirement | Exact wording locator and observed compliance state |
| `Limit` | Limit, sublimit, aggregate, waiting period, or deductible | Amount or duration, currency, scope, source locator |
| `Evidence` | Source-backed observation | Hash, source type, locator, observed date, confidence |
| `Gap_Finding` | Candidate mismatch, unknown, or unprotected scenario | Rule id, evidence refs, urgency, confidence, review state |
| `Protection_Action` | Control, continuity, evidence, or expert-review step | Owner, effort band, expected effect, approval boundary |

### Core Edges

`owns`, `operates`, `depends_on`, `located_at`, `processes`, `threatened_by`, `causes`, `mitigated_by`, `covered_by`, `excluded_by`, `limited_by`, `conditioned_on`, `evidenced_by`, `changed_by`, `creates_gap`, and `resolved_by`.

### Gap Types

| Gap type | Meaning | MVP handling |
|---|---|---|
| `no_evidence_of_cover` | No responsive section was found in supplied material | Ask for missing schedules or adviser review; do not state “uninsured” |
| `entity_or_asset_mismatch` | The insured party, location, asset, or activity may not match current operations | Show exact mismatch and effective dates |
| `limit_mismatch` | Declared limit or duration appears below the user-approved exposure band | Show the inputs and range; require review |
| `exclusion_or_condition_risk` | Wording may restrict response or evidence suggests an unmet condition | Quote only the minimum necessary locator; prohibit autonomous verdicts |
| `control_gap` | A high-impact baseline control is absent, unverified, or stale | Recommend a low-regret control action with source guidance |
| `dependency_concentration` | A critical process relies on a hard-to-replace dependency | Recommend continuity and alternate-supplier review |
| `business_continuity_gap` | Recovery ownership, strategy, or exercise evidence is missing | Create a continuity action rather than an insurance-only answer |
| `stale_evidence` | Business or policy information passed its freshness threshold | Re-request only affected evidence and recompute the delta |
| `contradiction` | Two sources disagree | Preserve both sources and require resolution |
| `jurisdiction_unknown` | Legal, regulatory, or product context is not established | Restrict output to education and evidence preparation |

## Finding Model

Avoid an opaque “protection score.” Store the components and render a compact matrix.

```ts
type GapFinding = {
  finding_id: string
  scenario_id: string
  gap_type: string
  urgency: 'critical' | 'high' | 'medium' | 'low' | 'unrated'
  confidence: 'high' | 'medium' | 'low' | 'unknown'
  consequence_bands: Array<'people' | 'operations' | 'financial' | 'legal' | 'customer' | 'reputation'>
  evidence_refs: string[]
  assumption_refs: string[]
  coverage_refs: string[]
  control_refs: string[]
  explanation: string
  next_evidence_request?: string
  next_action_ids: string[]
  review_state: 'candidate' | 'accepted' | 'rejected' | 'superseded'
  observed_at: string
  expires_at?: string
}
```

Urgency is a deterministic decision table over consequence band, critical-process dependency, observed control state, and apparent coverage shortfall. Confidence is a separate decision table over source authority, directness, completeness, consistency, and freshness. Any model-proposed severity or likelihood is evidence until a deterministic rule or authorized reviewer accepts it.

## End-To-End Experience

1. **Scope** — select jurisdiction posture, sector, legal entities, and the question being answered.
2. **Fast intake** — capture critical activities, revenue dependence, people, locations, data, systems, suppliers, equipment, and recent growth events using ranges where possible.
3. **Bring existing evidence** — import policy schedules and wordings, contracts, asset lists, continuity plans, control reports, supplier lists, and optional system signals through existing Source Files owners.
4. **Review extraction** — show extracted entities, dates, limits, conditions, exclusions, and evidence locators before they enter the accepted graph.
5. **Build scenarios** — instantiate a small sector-neutral scenario library and add user-specific dependency chains.
6. **Detect candidate gaps** — run deterministic rules first; use AI only for bounded extraction, normalization, contradiction discovery, and plain-language explanation.
7. **Prioritize** — show an urgency-confidence matrix, not a single grade.
8. **Act** — recommend one low-regret protection action, one evidence request, and one expert-review action per critical finding.
9. **Handoff** — export a versioned protection brief for the SME and authorized adviser, including rejected findings and unresolved unknowns.
10. **Stay current** — recompute only affected subgraphs when a policy, asset, supplier, location, contract, control, or growth event changes.

## MVP Scope

### Must

- One SME, one jurisdiction posture, multiple legal entities.
- Manual intake plus Markdown, text, CSV, JSON, and PDF-derived text through existing import paths.
- Cyber, ICT supply-chain, physical-asset, and business-interruption scenarios.
- Policy schedule and wording extraction with page or line locators.
- Candidate graph review before active-graph mutation.
- Deterministic gap rules, explicit unknowns, and urgency-confidence rendering.
- Low-regret control and continuity actions based on versioned authoritative guidance.
- Adviser-ready Markdown and JSON export with evidence hashes and cost logs.
- Reassessment after a manual growth event or changed source hash.

### Should

- Optional read-only connectors for accounting, asset inventory, identity, cloud posture, supplier records, and contract repositories.
- Sector packs and jurisdiction adapters with effective dates and source ownership.
- Portfolio dashboard for brokers, associations, accountants, and managed-service providers.
- Claim-readiness evidence checklist that does not predict claim outcomes.

### Not In MVP

- Carrier or product ranking.
- Premium estimation, underwriting, pricing, eligibility, or automated declination.
- Quote, purchase, bind, renewal, cancellation, claim adjudication, or payment.
- Continuous employee monitoring, invasive device collection, or training on customer documents.
- Precise loss probability or “fully covered” claims.

## Technical Architecture

### Reuse Existing Owners

| Concern | agentic-graph owner to reuse | Boundary |
|---|---|---|
| Document intake | `canvas/src/features/source-files/**` and existing PDF/Markdown import actions | Do not create a protection-specific upload store |
| Source hashing and evidence-first compilation | `canvas/src/features/research-agent/researchThesisContract.ts` patterns | Extract shared primitives before domain specialization; do not relabel investment types as insurance types |
| Graph state and rendering | Shared `GraphData`, semantic-key helpers, KGC candidate/apply path | Active graph changes only after review |
| AI cost accounting | `contracts/cost-log.schema.js` | Every model-backed stage emits the canonical fields |
| Local orchestration | `agentic_graph_parser` SuperAgent harness and local MCP | Dev-only, bounded, typed, and resumable |
| UI | MainPanel, FloatingPanel Chat, Editor Workspace, Canvas, and shared inspector primitives | Add a protection view, not a second application shell |
| Persistence | Existing Source Files and configured storage owners | No provider ids, credentials, or browser secrets in graph data |

### Components

| Component | Responsibility | Model use |
|---|---|---|
| `Protection_Preflight` | Validate input, consent, jurisdiction posture, source count, hashes, and token budget | None |
| `Evidence_Extractor` | Extract candidate entities, clauses, dates, amounts, duties, and locators | Optional, one bounded pass per changed source |
| `Evidence_Reviewer` | Accept, reject, or correct extracted records | None; human owned |
| `Protection_Graph_Builder` | Create candidate nodes and edges with semantic keys | None |
| `Gap_Rule_Engine` | Apply versioned deterministic rules and freshness logic | None |
| `Contradiction_Observer` | Detect conflicts, missing evidence, and unsupported findings | Optional bounded pass plus deterministic validation |
| `Guidance_Mapper` | Map accepted findings to authoritative low-regret actions | Retrieval plus deterministic allowlist |
| `Explanation_Renderer` | Produce plain-language, source-linked explanations | Optional single pass |
| `Review_Audit` | Record accepted, rejected, superseded, and escalated findings | None |
| `Delta_Consumer` | Apply accepted graph delta and export the adviser packet | None |

## Typed AI Contract

```ts
type ProtectionCompileInput = {
  run_id: string
  jurisdiction_posture: 'known' | 'unknown' | 'education_only'
  business_snapshot: {
    entity_refs: string[]
    sector?: string
    size_band?: string
    critical_processes: string[]
    growth_events: Array<{ type: string; effective_at: string; source_ref?: string }>
  }
  sources: Array<{
    source_id: string
    canonical_path: string
    content_hash: string
    media_type: string
    text: string
    observed_at: string
    consent_scope: string
  }>
  accepted_graph_snapshot?: object
  bounds: {
    max_source_files: number
    max_input_tokens: number
    max_output_tokens: number
    max_compile_iterations: number
    max_verification_fan_out: number
    max_wall_clock_ms: number
  }
}

type ProtectionCompileOutput = {
  schema_version: 'agentic-graph.protection-compile/v1'
  run_manifest: object
  evidence_ledger: object[]
  candidate_graph_delta: object
  candidate_findings: GapFinding[]
  action_candidates: object[]
  unresolved_unknowns: object[]
  review_audit: object
  cost_logs: Array<{
    model: string
    prompt_tokens: number
    completion_tokens: number
    cache_hits: number
    estimated_cost_usd: number
  }>
}
```

### Orchestration Roles

| Role | Input | Output | Stop condition |
|---|---|---|---|
| Dispatcher | Valid preflight manifest and changed-source set | Bounded task plan | Reject malformed, over-budget, or unauthorized input before model spend |
| Executor | Selected changed-source windows and versioned rule pack | Candidate evidence, graph delta, and findings | Maximum two compile iterations |
| Observer | Candidate outputs, source spans, deterministic validators | Contradictions, unsupported claims, and confidence adjustments | Maximum one verification fan-out per finding |
| Consumer | Reviewed candidate ids and audit decision | Accepted delta and export packet | No unreviewed active-graph mutation |

### Fallbacks And Circuit Breakers

| Failure | Required behavior |
|---|---|
| Malformed or unauthorized input | Fail preflight with zero model calls and no persistence beyond the typed error |
| Missing jurisdiction | Continue only in education and evidence-preparation mode |
| Unreadable or low-quality policy text | Mark source unreadable, retain hash, request a better copy, and prohibit coverage conclusions |
| Model or provider failure | Run deterministic checklist and rule engine; preserve `unknown` for unextracted fields |
| Invalid model JSON | Reject the result; allow one repair attempt within the original output-token budget |
| Prompt injection in a source | Treat source content as data, isolate instructions, and flag the source; never expand tool authority |
| Token or cost breach | Stop model calls and return partial evidence plus a budget error |
| Approval denial | Preserve candidate artifacts and audit; apply nothing |
| Conflicting sources | Keep both evidence records and create a contradiction finding |

Recommended MVP bounds: 25 sources, 50,000 estimated input tokens after deterministic filtering, 4,000 output tokens per model-backed stage, two compile iterations, one repair attempt, five verification targets per finding, and a 120-second local compile ceiling. These are configurable safety defaults, not universal product limits.

## Security, Privacy, And Governance

| Risk | Control |
|---|---|
| Sensitive policies, contracts, and security evidence | Local-first parsing, encryption at rest and in transit, tenant isolation, explicit retention, export, and deletion controls |
| Excess collection | Purpose-bound fields and evidence requests; do not ingest payroll, identity, or telemetry fields that cannot change a protection decision |
| Hallucinated coverage | Exact locators, typed evidence labels, deterministic rules, explicit unknowns, and mandatory review for material findings |
| Unfair or discriminatory outcomes | Prohibit protected attributes from product ranking or eligibility decisions; test outcome disparities in any later regulated use |
| Opaque third-party models | Versioned model and prompt ids, cost logs, evaluation records, provider isolation, and deterministic fallback |
| Data poisoning or prompt injection | Source trust labels, instruction/data separation, content scanning, bounded tools, and no source-granted permissions |
| False freshness | Per-node timestamps and adapter health; degrade to stale instead of claiming live status |
| Advice or distribution breach | Jurisdiction adapter, role-based language, licensed-partner approval, and separate quote/bind system if ever authorized |

The privacy posture follows data-minimization guidance: identify the minimum personal data needed for the purpose and design collection around that need. The AI-governance posture follows NIST AI RMF's Govern, Map, Measure, and Manage functions and NAIC's expectations for governance, validation, documentation, accuracy, fairness, and consumer-impact controls where insurer use is in scope.

## Business Model And Economics

### Recommended Go-To-Market

Start B2B2B with trusted SME intermediaries: brokers, accountants, managed-service providers, trade associations, chambers, and sector platforms. They already own the review relationship and can validate whether the packet reduces discovery time and improves protection conversations.

| Tier | Buyer | Value | Commercial unit |
|---|---|---|---|
| Guided assessment | SME or association | One protection map and action packet | Per assessment or sponsored cohort |
| Living protection | SME | Event-driven refresh and evidence reminders | Monthly subscription per business |
| Adviser workspace | Broker, accountant, or MSP | Portfolio triage, review queue, and export | Per adviser plus active SME |
| Embedded API | Platform or insurer | Structured evidence and candidate graph delta | Per compile plus support agreement |

Do not monetize by secretly selling leads or ranking carriers. Disclose partner relationships and separate education, adviser review, and transaction compensation.

### Token And TCO Model

The deterministic preflight, rule engine, graph builder, audit, and exports should cost zero model tokens. Model cost is attributable only to changed-source extraction, contradiction review, or explanation.

```text
monthly_model_cost =
  changed_compiles
  × ((input_tokens × input_price_per_token)
     + (output_tokens × output_price_per_token))
  × (1 - cache_reuse_rate)
```

Example planning envelope, not a vendor quote: 100 SMEs, two changed-source compiles per month, 12,000 input tokens and 2,000 output tokens per compile gives 2.4 million input and 0.4 million output tokens before cache reuse. Store price variables in configuration and cost logs because model prices change. Measure document-processing, storage, support, licensed review, security, and compliance cost separately; model spend is unlikely to be the dominant total cost of ownership.

## Success Metrics

| Outcome | Metric | MVP target |
|---|---|---|
| Fast value | Median time from start to first reviewed map | ≤ 20 minutes for the supported intake set |
| Evidence quality | Material findings with at least one direct evidence or explicit assumption ref | 100% |
| Safety | Findings presented as definitive coverage without sufficient reviewed evidence | 0 |
| Review quality | High-urgency findings accepted or corrected by adviser review | Establish baseline; target ≥ 80% after pilot iteration |
| Unknown reduction | Critical unknowns resolved within 14 days | ≥ 60% in active pilot SMEs |
| Actionability | SMEs completing at least one low-regret protection action in 30 days | ≥ 50% |
| Freshness | Changed source hashes recomputed without reprocessing unchanged sources | 100% |
| Efficiency | Adviser discovery time per review | ≥ 30% reduction versus pilot baseline |
| Economics | Model-backed compiles with valid canonical cost log | 100% |

## Verifiable Completion Conditions

| VCC | Given | When | Then | Proof |
|---|---|---|---|---|
| VCC-1 Preflight | Malformed, unauthorized, or over-budget input | Compile is requested | Typed error returns with zero model calls and no graph mutation | Unit test and cost log equal zero |
| VCC-2 Evidence | A readable policy and business snapshot | Extraction completes | Every candidate clause, limit, exclusion, or condition has a source hash and locator | Schema validation and orphan-ref count equal zero |
| VCC-3 Unknown safety | Required evidence is missing or contradictory | Gap rules run | Finding confidence is `low` or `unknown`; no “fully covered” output appears | Fixture test and prohibited-phrase scan |
| VCC-4 Review gate | Candidate graph delta exists | No reviewer approval is supplied | Active graph remains byte-identical | Before/after graph hash equality |
| VCC-5 Delta compile | One source hash changes | Reassessment runs | Only dependent subgraph findings and freshness timestamps change | Deterministic snapshot diff |
| VCC-6 Cost | Model-backed stage runs | Result is persisted | Canonical `{model,prompt_tokens,completion_tokens,cache_hits,estimated_cost_usd}` validates | `validateCostLog()` passes |
| VCC-7 Responsive UI | Reviewed findings exist | User opens the protection view | Urgency, confidence, evidence, and next action are reachable at supported viewport classes | Focused component and accessibility tests |
| VCC-8 Adviser handoff | Accepted and unresolved findings exist | Export is requested | Packet contains sources, assumptions, rejected findings, unknowns, dates, and non-advice boundary | Export schema and content test |
| VCC-9 No deploy | Dev validation completes | Task ends | Prod mirror, Cloudflare, quotes, policies, claims, and payments are unchanged | Git/workflow inspection and no deploy evidence |

## Delivery Plan

| Phase | Scope | Exit condition |
|---|---|---|
| 0 — Concierge validation | Ten to twenty SMEs and two to four adviser partners; manually review every map | Repeatable top scenarios, evidence requests, and workflow pain points are observed |
| 1 — Headless MVP | Typed ontology, preflight, evidence ledger, deterministic rules, candidate delta, audit, and exports | VCC-1 through VCC-6 and VCC-8 pass |
| 2 — Visible Dev surface | MainPanel protection view, urgency-confidence matrix, evidence inspector, and action queue | VCC-7 passes without a second app shell |
| 3 — Event-driven refresh | Changed-source and growth-event recomputation; optional read-only connectors | VCC-5 passes across connector fixtures |
| 4 — Jurisdiction and partner adapters | Versioned rules, localized language, licensed-review routing, portfolio workspace | Independent legal/compliance and security review approves each adapter |
| 5 — Transaction boundary | Optional quote or bind handoff only through separately authorized regulated systems | Explicit operator, legal, partner, security, and deployment approvals |

## Key Risks And Experiments

| Risk | Fastest useful experiment | Stop or pivot signal |
|---|---|---|
| SMEs will not upload policies | Concierge session with redaction and local parsing | Fewer than half provide sufficient evidence even with trusted adviser present |
| Outputs create false reassurance | Blind adviser review of finding language and unknown states | Any unsupported definitive coverage conclusion |
| Policy wording is too heterogeneous | Test a small cross-section of cyber and package-policy documents | Material extraction accuracy remains below the review threshold after locator-first design |
| The buyer is not the user | Compare direct-SME and adviser-led activation | Direct acquisition cost or trust friction dominates value |
| Data integrations add more risk than value | Manual growth-event pilot before connectors | Connector data does not change priority or evidence requests |
| Advisers perceive channel conflict | Co-design compensation and role boundaries | Partners reject carrier-neutral, non-transactional workflow |

## Open Decisions

1. Which launch jurisdiction and SME segment will supply the first policy corpus and licensed reviewers?
2. Is the first buyer an SME, broker, managed-service provider, accountant, association, or insurer-sponsored program?
3. Which three risk scenarios create enough value for the first concierge pilot?
4. What evidence may leave the SME device, and what retention period is acceptable?
5. Which language is approved for education, recommendation, referral, and regulated advice in the launch jurisdiction?
6. What reviewer agreement defines acceptable extraction precision and high-urgency miss rate?

## Source Register

| Source | Design implication |
|---|---|
| [NIST CSF 2.0 Small Business Quick-Start Guide](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=957322) | Use a lifecycle and discussion framework suitable for organizations with modest security programs |
| [CISA Small and Medium Business resources](https://www.cisa.gov/small-and-medium-sized-business-resources) | Prioritize high-impact fundamentals and no-cost guidance |
| [CISA ICT supply-chain risk guidance for SMBs](https://www.cisa.gov/resources-tools/resources/reducing-ict-supply-chain-risk-small-and-medium-sized-businesses-fact-sheet) | Model suppliers, visibility, disruption, and concentration as first-class dependencies |
| [OECD Digital security risk management](https://www.oecd.org/en/topics/sub-issues/digital-security-risk-management.html) | Frame cyber consequences as business and economic risk rather than technical posture alone |
| [OECD Digital security in SMEs](https://www.oecd.org/en/publications/the-digital-transformation-of-smes_bdb9256a-en/full-report/component-6.html) | Design for limited awareness, resources, expertise, and cross-stakeholder support |
| [NAIC AI model bulletin announcement](https://content.naic.org/article/naic-members-approve-model-bulletin-use-ai-insurers) and [adopted bulletin](https://content.naic.org/sites/default/files/2023-12-4%20Model%20Bulletin_Adopted_0.pdf) | Require governance, documentation, validation, fairness, accuracy, transparency, and third-party oversight where insurance decisions are affected |
| [NAIC Cyber Insurance Report](https://content.naic.org/sites/default/files/call_materials/Cyber%20Insurance%20Report.pdf) | Treat policy features and exclusions as source-specific wording, not universal assumptions |
| [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) | Govern, map, measure, and manage AI risks across the lifecycle |
| [ICO AI security and data-minimization guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/artificial-intelligence/guidance-on-ai-and-data-protection/how-should-we-assess-security-and-data-minimisation-in-ai/) | Collect the minimum personal data needed for the stated purpose and assess third-party systems |
| [SBA emergency preparation](https://www.sba.gov/business-guide/manage-your-business/prepare-emergencies), [recovery planning](https://www.sba.gov/business-guide/manage-your-business/recover-disasters), and [business insurance](https://www.sba.gov/business-guide/launch-your-business/get-business-insurance) | Connect asset, continuity, operating-expense, and insurance considerations; keep legal requirements jurisdiction-specific |

## Discovery Proof And Status

The repository's native SuperAgent ran the supplied brief in deterministic `mock` mode with the `sme-agent`, `coverage-graph`, and `responsible-guidance` frontmatter skills selected. It completed ten bounded tasks, created 18 local artifacts, and passed the harness verification checks. The proof is local Dev output under `data/outputs/sme-protection-gap-sme-run/` and is intentionally ignored by Git.

That run proves the discovery harness and artifact pipeline, not the broader product. Current `origin/main` also proves a narrower deterministic `/sme-care-agent` baseline with typed exposure, gap, unknown-risk, protection, rationale, cost, and Dev-only deployment evidence. This document remains `spec-complete`; runtime readiness for its broader evidence-ingestion, review, graph-delta, adviser-export, and jurisdiction-adapter scope still requires focused tests for the VCCs above, pilot evidence, approved jurisdiction language, and explicit review of any regulated or deployed surface.
