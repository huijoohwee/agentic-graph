---
title: "Agentic Graph Risk Copilot Demo - SME Growth-Stage Risk & Coverage Coach"
graphId: "md:agentic-graph-risk-copilot-demo"
doc_type: "Risk Copilot Demo"
date: "2026-07-14"
lang: "en-SG"
schema: "agentic-os-computing-flow/v1"
demo_schema: "agentic-os-risk-copilot-demo/v1"
implementation_contract: "../../agentic-canvas-os/docs/PRD-TAD-ADR-MVP-GTM.md"
template_policy: "Minimum viable runnable risk-copilot seed for local-first SME risk-exposure ideation, harness definition, Canvas projection, and validation; authored source payload owns graph data; local runtime proof is surfaced in runtime_proof; live outputs remain blank until operator-approved returned evidence exists."
validation_input_forbid_hardcode_in_repo: "true"
deployed_api_claim: "false"
runtime_status: "runtime-ready"
publish_scope: "local-only"
publish_policy: "No Prod mirror, Cloudflare deploy, external publication, real business financials, fabricated insurer/broker IDs, generated policy media, or binding-quote claims."
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "storyboard"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: true
kgDocumentStructureBaselineLock: false
kgWorkflowManagerModeEnabled: true
kgAutoSaveEnabled: true
kgAutoSaveDebounceMs: 1500
kgAutoSaveOn: ["nodeEdit", "runComplete", "approval", "assetReady"]
kgBottomPanelOpen: true
kgBottomPanelTab: "eventModeling"
kgFloatingPanelOpen: true
kgFloatingPanelView: "storyboard"
kgSharedRendererContract: {"version": "shared-renderer-contract/v1", "semanticIdentity": "buildScopedGraphSemanticKey", "cardPreview": "CardMediaPreview + CardMarkdownPreview", "widgetCard": "canvas:widgetCard", "richMediaPanel": "RichMediaPanel", "storyboardDisplay": "2D Renderer: Storyboard Card (default) and Widget variants", "storyboardSurfaces": ["Cards", "Widgets", "Rich Media Panels"], "edgeModel": "active graph edges derive from this frontmatter-owned risk-exposure graph", "rendererPolicy": "frontmatter and source payloads own data; renderers project view state only"}
credential_policy: {"business_data": "Use synthetic or operator-redacted business profiles only; never commit UEN/company-registry numbers, bank/financial account data, credentials, or real policy documents.", "brokers_insurers": "Server-managed environment names only; no browser-stored keys, repo-stored keys, or client-side signing.", "live_generation": "Human approval required before paid, mutating, insurer/broker API, browser-auth, Prod, or Cloudflare action."}
safety_policy: {"advisory_role": "Risk-exposure mapping and coverage-gap explanation aid; not a licensed insurance broker, not underwriting, not a binding quote or recommendation of a specific insurer.", "escalation": "Binding quotes, policy bind/issue, claims disputes, and regulated financial advice route to a MAS/BNM/OJK-licensed broker or insurer, never resolved by the agent.", "source_policy": "Use operator-owned business profile notes, public company-stage signals, and approved paraphrases only.", "data_minimization": "Prefer synthetic SME archetypes, local redaction, and business-tier fields (headcount band, revenue band, sector) over exact financials or registry identifiers."}
runtime_defaults: {"provider": "agentic-graph-local-risk-dry-run", "model": "risk-copilot-local-dry-run-v1", "status": "runtime-ready", "paid_call_count": 0, "prompt_tokens": 0, "completion_tokens": 0, "cache_hits": 0, "estimated_cost_usd": 0, "runtime_proof_path": "", "provider_job_id": "", "live_result_url": ""}
related_runtime_proof: "./agentic-graph-sme-care-agent-runtime-proof.md"
run_ready_demo: {"id": "risk-copilot", "env_selector": "VITE_AGENTIC_OS_RUN_READY_DEMO=risk-copilot", "command": "npm run demo:risk-copilot -- --port <free-port>", "source_root": "agentic-graph/docs", "source_path": "docs/workspace-seeds/agentic-graph-sme-care-agent-demo.md", "validation_seed_path": "/agentic-graph-sme-care-agent-demo.md", "clean_canvas_recommended": true, "source_backed": true}
probe_tree_runtime: {"version": "agentic-graph-probe-tree/v0.1", "status": "runtime-ready", "owner": "agentic-graph/mcp/probe-tree-runtime.js", "contract_owner": "agentic-graph/canvas/src/features/agent-ready/probeTreeContract.mjs", "graph_store_dir": "data/probe-tree", "memory_scope": "agentic-graph-probe-tree", "tools": {"generate": "agentic-graph.probe.generate", "select": "agentic-graph.probe.select", "evolve": "agentic-graph.probe.evolve"}, "local_model_adapter": {"provider": "ollama", "model_env": "AGENTIC_OS_PROBE_TREE_MODEL", "url_env": "AGENTIC_OS_PROBE_TREE_MODEL_URL", "allow_remote_env": "AGENTIC_OS_PROBE_TREE_MODEL_ALLOW_REMOTE", "timeout_env": "AGENTIC_OS_PROBE_TREE_MODEL_TIMEOUT_MS", "stream": false, "structured_output": true, "default_state": "disabled until host-owned model env is configured; heuristic fallback stays local-zero-cost"}, "multilingual_adapter": {"provider": "sea-lion", "coverage": ["en", "ms", "id", "zh"], "markets": ["Singapore (primary)", "Malaysia", "Indonesia", "China (Mandarin-supported)"], "fallback": "en-SG plain-language when a market-specific model is unavailable"}, "risk_copilot_thread": {"thread_root_id": "risk-copilot-demo", "current_node_id": "risk_source", "context_text": "Synthetic or operator-redacted SME growth-stage profile intake; probe for headcount band, lease status, vendor/supply-chain footprint, customer-data handling, and cross-border operations.", "option_count": 3, "token_budget": 1200}, "proof": {"generate_mutates_graph": false, "explicit_zero_recall_verified": true, "select_writes_type_probe_node": true, "select_edge_type": "branches-to", "select_frontmatter_flow_canvas_sync": true, "select_cost_log_verified": true, "evolve_writes_memory_exemplar": true, "evolve_reports_incomplete_parent_path": true, "evolve_cost_log_verified": true, "process_descriptors_non_idempotent": true, "semantic_frontmatter_keys_verified": true, "clean_room_generate_select_evolve_verified": true, "token_budget_ceiling_enforced": true, "native_checkpointer_datastore": false, "paid_call_count": 0}}
starter_inputs: {"sme_context": "Synthetic Singapore-based SME (10-30 headcount) expanding into Malaysia/Indonesia, onboarding first regional logistics vendor and first customer-data-handling SaaS tool.", "source_url": "", "source_title": "Operator-supplied SME growth-stage notes", "source_author": "", "target_brief": "Create a multilingual, low-TCO growth-stage risk copilot that maps exposure as the SME grows, flags coverage gaps against triggered milestones, proactively nudges the owner, and (with approval only) surfaces matching coverage options for a licensed broker to action.", "approval_state": "draft"}
agentic_os_risk_copilot_pipeline: {"version": "agentic-risk-copilot-pipeline/v1", "status": "runtime-ready", "autonomy_mode": "local-dry-run-first", "source_docs": ["../../agentic-canvas-os/docs/MEMORY.md", "../../agentic-canvas-os/docs/AGENTS.md", "../../agentic-canvas-os/docs/DICTIONARY-COMMAND.md", "../../agentic-canvas-os/docs/DICTIONARY-SEMANTIC.md", "../../agentic-canvas-os/docs/DICTIONARY-BINDING.md", "../../agentic-canvas-os/docs/HARNESS-CONTRACTS.md", "../../agentic-canvas-os/docs/RUNTIME-READINESS.md", "../../huijoohwee.github.io/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"], "invocation_routes": {"slash": ["/source.normalize", "/memory.seed", "/prd-tad.create", "/harness.define", "/mcp.capabilities", "/cost.audit", "/canvas.project", "/runtime-ready.check", "/validation.run", "/deploy.guard"], "semantic": ["#frontmatter", "#harness", "#token-economics", "#tco", "#ttv", "#vcc", "#foss", "#canvas", "#runtime-ready", "#approval-gate", "#dev-only", "#no-hardcode", "#no-legacy"], "binding": ["@source.frontmatter", "@source.body", "@operator", "@local-harness", "@cost-log", "@mcp-gateway", "@canvas", "@runtime-proof", "@approval-gate", "@dev-only"]}, "stages": [{"id": "risk-source-normalization", "lane": "Source", "command": "/source.normalize", "bindings": ["@source.frontmatter", "@source.body", "@operator"], "semantics": ["#frontmatter", "#no-hardcode", "#no-legacy"], "output": "redacted SME profile summary, missing-field list, and safety boundary", "paid_call_count": 0}, {"id": "risk-graph-ideation", "lane": "Ideation", "command": "/memory.seed", "bindings": ["@source.frontmatter", "@source.body", "@operator"], "semantics": ["#frontmatter", "#ttv", "#vcc"], "output": "minimum viable Risk Exposure Graph (REG) and gap-coverage value hypothesis", "paid_call_count": 0}, {"id": "risk-probe-branching", "lane": "Probe", "command": "/mcp.capabilities", "bindings": ["@mcp-gateway", "@runtime-proof", "@source.body"], "semantics": ["#mcp", "#runtime-ready", "#ttv"], "output": "probe.generate options over growth-stage signals, user-selected branch path, checkpoint fork metadata, and resolved gap-path exemplar", "paid_call_count": 0}, {"id": "risk-trigger-engine", "lane": "Trigger", "command": "/harness.define", "bindings": ["@local-harness", "@cost-log", "@mcp-gateway"], "semantics": ["#harness", "#token-economics", "#approval-gate"], "output": "growth-stage state machine firing coverage-review triggers against the REG", "paid_call_count": 0}, {"id": "risk-broker-copilot", "lane": "Copilot", "command": "/harness.define", "bindings": ["@local-harness", "@cost-log", "@operator"], "semantics": ["#harness", "#ttv", "#approval-gate"], "output": "Hermes-pattern proactive nudge on new graph deltas (new vendor, new lease, new data store, new market)", "paid_call_count": 0}, {"id": "risk-marketplace-matcher", "lane": "Matcher", "command": "/mcp.capabilities", "bindings": ["@mcp-gateway", "@operator", "@approval-gate"], "semantics": ["#ttv", "#approval-gate", "#dev-only"], "output": "candidate coverage-catalog matches per flagged gap, routed to a licensed-broker handoff packet; no binding action taken", "paid_call_count": 0}, {"id": "risk-canvas-projection", "lane": "Canvas", "command": "/canvas.project", "bindings": ["@canvas", "@runtime-proof", "@approval-gate"], "semantics": ["#canvas", "#runtime-ready", "#dev-only"], "output": "Storyboard cards and Rich Media proof surfaces from source-owned frontmatter", "paid_call_count": 0}, {"id": "risk-validation", "lane": "Validation", "command": "/validation.run", "bindings": ["@runtime-proof", "@dev-only"], "semantics": ["#vcc", "#no-hardcode", "#runtime-ready"], "output": "parse, route, schema, cost, approval, and deploy-boundary proof", "paid_call_count": 0}], "gates": {"binding_quote_or_bind": "blocked; route to licensed broker/insurer", "real_financial_or_registry_data": "blocked until explicit operator-owned redaction and approval", "live_broker_insurer_api_calls": "blocked until @operator approves @approval-gate", "prod_mirror": "blocked by /deploy.guard and @dev-only", "cloudflare": "blocked by /deploy.guard and @dev-only"}}
runtime_proof: {"version": "risk-copilot-runtime-proof/v1", "status": "runtime-ready", "proven_at": "2026-07-14", "proof_scope": "Dev-local Markdown/frontmatter/runtime contract only", "proof_owner": "agentic-graph/canvas focused post-parser test registry", "validation_cwd": "agentic-graph repo root", "focused_checks": ["docs.riskCopilotDemo.runtimeReady", "docs.riskCopilotDemo.runReadyMode", "mcp.probeTree.runtime", "mcp.smeRiskCopilot.runtime", "mcp.smeRiskCopilot.stdioE2e", "probeTree.select.frontmatterFlowCanvasSync", "smeCareAgent.canvasEvidence.runtimeReady"], "validation_commands": ["npm run sme-risk-copilot:check"], "parsed_frontmatter_flow": true, "computed_frontmatter_flow": true, "probe_tree_canvas_sync_verified": true, "probe_tree_token_budget_verified": true, "probe_tree_zero_recall_verified": true, "probe_tree_cost_logs_verified": true, "probe_tree_non_idempotent_descriptors_verified": true, "probe_tree_semantic_frontmatter_keys_verified": true, "probe_tree_clean_room_smoke_verified": true, "dictionary_routes_verified": true, "semantic_html_verified": true, "zero_cost_local_harness_verified": true, "safety_gates_verified": true, "prod_mirror_mutated": false, "cloudflare_deploy_mutated": false, "live_provider_fields_blank": true}
source_provenance: {"repository": "huijoohwee/joohwee", "revision": "59e920337b5591943f10461d45af6b76ea24e1c5", "path": "huijoohwee-docs/knowgrph-sme-care-agent-demo.md", "sha256": "05cf079c5239c2398a4d4c595e2c8afd8d4d9280896bb08369c3c4ad1d2dabba", "restoration": "Source recovery; historical readiness claims require current validation."}
socket_types: {"local_draft_text": {"dataType": "string"}}
flow:
  computed: {"key": "computed", "type": "boolean", "value": true}
  snapToGrid: {"key": "snapToGrid", "type": "boolean", "value": true}
  direction: {"key": "direction", "type": "string", "value": "LR"}
  edgeType: {"key": "edgeType", "type": "string", "value": "smoothstep"}
  nodes:
    - {"id":{"key":"id","type":"string","value":"local_brief_input"},"type":{"key":"type","type":"string","value":"InputWidget"},"label":{"key":"label","type":"string","value":"Local review request"},"position":{"key":"position","type":"object","value":{"x":-720,"y":0}},"request":{"key":"request","type":"string","value":"Describe the intended outcome and acceptance criteria."},"canvas:widgetCard":{"key":"canvas:widgetCard","type":"object","value":{"previewField":"request","actions":[{"id":"edit","label":"Edit request","trigger":"openFieldEditor","targetField":"request"}]}},"flow:widgetFormId":{"key":"flow:widgetFormId","type":"string","value":"fm:local_brief_input"},"handles":{"key":"handles","type":"object","value":{"source":["request"]}},"flow:portTypes":{"key":"flow:portTypes","type":"object","value":{"out":{"request":"local_draft_text"}}}}
    - {"id":{"key":"id","type":"string","value":"local_brief_compute"},"type":{"key":"type","type":"string","value":"ComputeWidget"},"label":{"key":"label","type":"string","value":"Risk register review"},"position":{"key":"position","type":"object","value":{"x":-360,"y":0}},"handles":{"key":"handles","type":"object","value":{"target":["request"],"source":["output","outputSrcDoc"]}},"flow:portTypes":{"key":"flow:portTypes","type":"object","value":{"in":{"request":"local_draft_text"},"out":{"output":"local_draft_text","outputSrcDoc":"local_draft_text"}}},"flow:widgetFormId":{"key":"flow:widgetFormId","type":"string","value":"fm:local_brief_compute"},"canvas:widgetCard":{"key":"canvas:widgetCard","type":"object","value":{"previewField":"output","actions":[{"id":"run","label":"Prepare local review","trigger":"compute"}]}},"canvas:runAction":{"key":"canvas:runAction","type":"object","value":{"fn":"compute","inputs":["request"],"outputs":["output","text_out","outputSrcDoc","run_status"],"updateBody":false}},"output":{"key":"output","type":"string","value":""},"outputSrcDoc":{"key":"outputSrcDoc","type":"string","value":""},"run_status":{"key":"run_status","type":"string","value":"idle"},"compute":{"key":"compute","type":"string","value":"inputs => { const value=inputs.prompt??inputs.request??inputs.input??''; const supplied=Array.isArray(value)?value.map(v=>String(v??'')).join('\\n'):String(value); const output=\"# Risk register review\\n\\nLocal preparation only. Review the supplied facts and source graph. No provider, payment, publication, market research, or external verification has run.\\n\\nOperator input:\\n\"+supplied; const escaped=output.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); return {output,text_out:output,outputSrcDoc:'<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><article><pre style=\"white-space:pre-wrap\">'+escaped+'</pre></article></html>',run_status:'prepared'}; }"}}
  edges:
    - {"id":{"key":"id","type":"string","value":"local-review-request"},"source":{"key":"source","type":"string","value":"local_brief_input"},"sourceHandle":{"key":"sourceHandle","type":"string","value":"request"},"target":{"key":"target","type":"string","value":"local_brief_compute"},"targetHandle":{"key":"targetHandle","type":"string","value":"request"},"type":{"key":"type","type":"string","value":"local_draft_text"}}
local_execution: {"mode": "prepare-only", "paid_calls": 0, "provider_execution": "Separate explicit operator action; generated media and live evidence stay blank."}
---

# Agentic Graph Risk Copilot Demo

This is a `/prd-tad.create` minimum viable risk-copilot seed for SME growth-stage risk exposure and coverage-gap coaching. It uses `/source.normalize`, `/memory.seed`, `/harness.define`, `/cost.audit`, `/canvas.project`, `/runtime-ready.check`, `/validation.run`, and `/deploy.guard` with existing `#` semantic filters and `@` bindings. `/memory.seed #frontmatter #ttv #vcc @source.frontmatter @source.body`

The demo is intentionally neutral and local-first. It builds a Risk Exposure Graph (REG) from a redacted SME profile, fires growth-stage coverage triggers, proactively nudges the owner on graph deltas, and (only with operator approval) surfaces marketplace matches for a licensed broker to action. It does not underwrite, bind, quote, or claim live insurer/broker output. Runtime IDs, provider evidence, Prod mirror status, and Cloudflare deployment fields remain blank until real proof exists and the operator approves the relevant gate.

## Related Runtime Proof

The earlier deterministic `/sme-care-agent` runtime-proof document is preserved as [./agentic-graph-sme-care-agent-runtime-proof.md](./agentic-graph-sme-care-agent-runtime-proof.md). Keep this file as the risk-copilot demo contract and use the companion proof doc for the stricter three-domain SME care runtime evidence.

## Risk Copilot Flow

| Stage | Invocation | Output | Gate |
|---|---|---|---|
| Source | `/source.normalize #frontmatter #no-hardcode @source.frontmatter @source.body` | Redacted SME profile summary and missing-field list | Reject registry IDs, financials, and stale hardcodes |
| Ideation | `/memory.seed /prd-tad.create #ttv #vcc #foss @source.body @operator` | Minimum viable Risk Exposure Graph (REG) | Keep scope small and ROI-positive |
| Probe tree | `agentic-graph.probe.generate` → `agentic-graph.probe.select` → `agentic-graph.probe.evolve` | Candidate growth-stage clarification questions, selected branch node, and gap-path memory exemplar | Markdown graph store stays SSOT; local model adapter is host-owned |
| Trigger engine | `/harness.define #harness @local-harness @mcp-gateway` | Growth-stage state machine firing coverage-review triggers | Fail before spend when schema or approval is missing |
| Broker copilot | `/harness.define #ttv @local-harness @operator` | Proactive plain-language nudge on new graph deltas | Nudge only; no autonomous purchase or bind action |
| Marketplace matcher | `/mcp.capabilities #approval-gate @mcp-gateway @operator` | Candidate coverage matches per gap, routed to licensed-broker handoff | Blocked until `@operator` approves `@approval-gate` |
| Cost | `/cost.audit #token-economics #tco @cost-log @operator` | Token, cache, TCO, and budget ledger | Local dry-run reports exact zero |
| Canvas | `/canvas.project #canvas @canvas @runtime-proof` | Storyboard cards and semantic Rich Media panel | Existing shared Canvas owners only |
| Validation | `/validation.run #vcc #runtime-ready @runtime-proof @dev-only` | Focused proof or spec-complete gap | No prose-only runtime-ready promotion |
| Deploy guard | `/deploy.guard #dev-only #approval-gate @operator @dev-only` | Local-only status | No Prod or Cloudflare mutation |

## MVP Value

| Persona | Job | First value | Time-to-value target |
|---|---|---|---|
| SME owner | Know what's exposed and what's not covered right now | Visual REG with red (uncovered) vs green (covered) edges | Under 3 minutes after redacted profile entry |
| SME owner (growing) | Get nudged before a gap becomes a denied claim | Plain-language milestone alert plus clinician-style "what changed, what to check" note | Immediate on next graph delta |
| Licensed broker (downstream) | Receive a pre-qualified, structured gap brief instead of a cold lead | Ranked gap list with market/sector context, ready for a bindable quote | Same session, post-approval |
| Solo builder | Prove a risk-copilot harness without cloud spend | Local Storyboard and validation packet | Same working session |

## Growth-Stage Trigger Map (Singapore-primary, MY/ID/CN-aware)

| Growth-stage milestone | REG delta detected | Typical coverage trigger | Jurisdiction note |
|---|---|---|---|
| First hire | New employee `@node` added | Work injury / employee compensation cover | Mandatory in Singapore (Work Injury Compensation Act); check MY (SOCSO) / ID (BPJS) equivalents |
| First office/warehouse lease | New premises `@node`, new asset `@edge`s | Public liability, property/fire cover | Landlord-mandated minimums vary by lease terms |
| First customer-data-handling tool | New SaaS/data-store `@node` | Cyber liability, data-breach response cover | PDPA (SG), PDPA (MY draft), UU PDP (ID) all raise breach-notification exposure |
| First cross-border vendor/logistics | New vendor `@node`, supply-chain `@edge` | Marine cargo / trade credit / supply-chain interruption | Cross-border customs and currency risk stack on top of coverage risk |
| First overseas market entry (MY/ID/CN) | New market `@cluster` | Local statutory cover + political/trade risk review | China entry often requires a locally licensed insurer, not a cross-border SG policy |
| Fundraise / key personnel dependency | New investor/board `@edge`, key-person flag | D&O liability, key-man insurance | Often a term-sheet condition, easy to miss until due diligence |

Each row is a candidate `probe.generate` branch: the copilot asks which milestone just happened (or is imminent), then walks the REG delta it implies.

## Harness Contract

```yaml
risk_copilot_local_harness:
  source: "@source.frontmatter + @source.body"
  normalize: "/source.normalize #frontmatter #no-hardcode @source.frontmatter @source.body"
  ideation: "/memory.seed /prd-tad.create #ttv #vcc #foss @source.body @operator"
  probe_generate: "agentic-graph.probe.generate thread_root_id=risk-copilot-demo current_node_id=risk_source k=3 recall_top_k=0 token_budget=1200"
  probe_select: "agentic-graph.probe.select writes a fresh type: probe markdown node, branches-to edge, checkpoint metadata, and local-zero cost_log"
  probe_evolve: "agentic-graph.probe.evolve scores the resolved growth-stage path, reports incomplete parents, writes a scoped memory exemplar, and returns local-zero cost_log"
  probe_mutation_semantics: "probe.select and probe.evolve are non-idempotent process tools; host retry behavior must not duplicate branches or silently rewrite scores"
  trigger_engine: "/harness.define #harness #token-economics @local-harness @mcp-gateway fires on REG @node/@edge deltas against the Growth-Stage Trigger Map"
  broker_copilot: "/harness.define #ttv @local-harness @operator watches trigger_engine output and drafts a plain-language nudge; never auto-sends without @operator approval"
  marketplace_matcher: "/mcp.capabilities #approval-gate @mcp-gateway @operator ranks open/mock coverage-catalog entries against each flagged gap; output is a broker-handoff packet, not a bindable transaction"
  harness: "/harness.define /mcp.capabilities #harness @local-harness @mcp-gateway"
  cost: "/cost.audit #token-economics #tco @cost-log @operator"
  canvas: "/canvas.project #canvas #runtime-ready @canvas @runtime-proof"
  validation: "/validation.run #vcc #no-hardcode @runtime-proof @dev-only"
  deploy_guard: "/deploy.guard #dev-only #approval-gate @operator @dev-only"
  default_result: "local risk-copilot packet; paid_call_count remains 0"
  live_result: "blank until @operator approves @approval-gate and returned evidence exists"
```

## Safety Boundaries

| Risk | Required behavior |
|---|---|
| Binding quote, bind, or issue request | Stop and route to a MAS/BNM/OJK-licensed broker or insurer. |
| Claims dispute or denial interpretation | Explain the gap in plain language and prepare broker/insurer questions; do not adjudicate the claim. |
| Conflicting policy-wording or jurisdiction rules | Preserve the conflict and ask for licensed-broker clarification. |
| Real registry ID, bank/financial account, or credential input | Reject or redact before persistence, model calls, or sharing. |
| Live broker/insurer API, browser-auth, Prod, or Cloudflare action | Require explicit `@operator` approval and `@approval-gate` evidence. |

## Use

1. From a clean local canvas, run `npm run demo:risk-copilot -- --port <free-port>`.
2. Confirm Canvas View reports `2D Renderer: Storyboard`.
3. Replace the synthetic SME profile with operator-redacted business content only (headcount band, sector, lease status, vendor list, data tools, target markets — no registry IDs or financials).
4. Run `/source.normalize #frontmatter #no-hardcode @source.frontmatter @source.body`.
5. Run `agentic-graph.probe.generate` with `thread_root_id=risk-copilot-demo`, `current_node_id=risk_source`, `recall_top_k=0`, `token_budget=1200`, and the redacted profile; optionally configure `KNOWGRPH_PROBE_TREE_MODEL` for Ollama-backed local generation, or the `sea-lion` multilingual adapter for MS/ID/ZH intake.
6. Run `agentic-graph.probe.select` for the user-selected growth-stage option, then run `agentic-graph.probe.evolve` after the branch resolves; keep the parent checkpoint materialized in `data/probe-tree`, require local-zero `cost_log` in both responses, and treat any returned incomplete-path status as a validation blocker.
7. Run `/harness.define /cost.audit #harness #token-economics @local-harness @cost-log` to activate the trigger engine and broker copilot.
8. With explicit `@operator` approval, run the marketplace matcher against the flagged gaps to produce a broker-handoff packet (no live insurer call without further approval).
9. Run `/canvas.project #canvas @canvas @runtime-proof` and review the Storyboard plus Rich Media panel.
10. Run `/validation.run #vcc @runtime-proof @dev-only`.
11. Keep `/deploy.guard #dev-only @dev-only` active unless the operator explicitly authorizes Prod or Cloudflare.

## Acceptance Checklist

- [x] Frontmatter parses from byte zero without repair fallback.
- [x] Clean-canvas demo mode loads this sibling docs source through `VITE_AGENTIC_OS_RUN_READY_DEMO=risk-copilot`.
- [x] Source content is synthetic or operator-redacted; no registry IDs or financials.
- [x] `/`, `#`, and `@` tokens match the Agentic OS dictionaries.
- [x] Probe-tree tools are registered in local MCP and `probe.generate` does not mutate graph state.
- [x] `probe.generate` enforces `token_budget` before local model invocation.
- [x] `probe.generate` honors `recall_top_k=0` against a seeded memory store.
- [x] `probe.select` writes one fresh `type: probe` markdown node with a `branches-to` edge under `data/probe-tree`.
- [x] `probe.select` output parses through frontmatter-flow for existing Canvas/sync projection.
- [x] `probe.select` returns a local-zero `cost_log`.
- [x] `probe.evolve` writes one scoped memory exemplar without adding a second checkpoint datastore.
- [x] `probe.evolve` scores the complete traversed growth-stage path or reports missing parent checkpoints.
- [x] `probe.evolve` returns a local-zero `cost_log`.
- [x] Probe markdown parsing preserves semantic hyphen and dot frontmatter keys.
- [x] `probe.select` and `probe.evolve` are advertised as non-idempotent process tools.
- [x] Trigger engine fires only against declared Growth-Stage Trigger Map rows, no invented triggers.
- [x] Broker copilot drafts nudges but never auto-sends without `@operator` approval.
- [x] Marketplace matcher output is a broker-handoff packet, never a bindable transaction.
- [x] Harness fields include schemas, fallback, max iteration, circuit breaker, and cost log.
- [x] Local dry-run cost fields remain exact zero.
- [x] Storyboard and Rich Media projection use existing shared Canvas owners.
- [x] Rich Media HTML uses semantic elements and no generic container markup.
- [x] Safety gate blocks binding quotes, bind/issue actions, and claims adjudication.
- [x] Runtime-ready status is backed by focused proof.
- [x] Publish scope remains `local-only` unless the operator explicitly authorizes Prod or Cloudflare.

## Guardrails

- Do not hardcode UEN/registry numbers, real financials, provider IDs, credentials, generated policy documents, or runtime proof into repo code or tests.
- Do not add downstream aliases, compatibility remaps, duplicate registries, or renderer forks for risk-copilot routing.
- Do not backfill runtime-ready claims from prose, screenshots, or stale local state.
- Do not deploy this demo to Prod or Cloudflare from this document alone.
- Do not let the marketplace matcher or broker copilot represent its output as a licensed recommendation, quote, or bind — every downstream action requires a licensed broker/insurer and explicit `@operator` approval.
- Keep frontmatter as the source-owned graph and body prose as the human workflow.
