---
title: "Knowgrph Runtime Readiness Contract"
doc_type: "Runtime Contract"
status: "active"
contract_version: 1
frontmatter_contract: "required"
invocation:
  action: "/runtime-ready.check"
  semantic: "#runtime-ready"
  actor: "@local-harness"
stage_contract:
  module: "mcp/video-remix/stage-contract.js"
  order: ["research", "storyboard", "render", "edit", "publish", "checkout"]
docs_dependency:
  repository: "https://github.com/huijoohwee/agentic-canvas-os.git"
  ref: "c2bb888a1839917e15e613ae142fcdf463f0cfec"
  root_env: "KNOWGRPH_AGENTIC_CANVAS_OS_DOCS_ROOT"
  default_relative_root: "../agentic-canvas-os/docs"
  required_files: ["FACTS.md", "DICTIONARY-COMMAND.md", "DICTIONARY-SEMANTIC.md", "DICTIONARY-BINDING.md", "START-WORKFLOW.md", "RELEASE-WORKFLOW.md", "CANONICAL-LIFECYCLE.md", "RUNTIME-PROOF.md", "REPOSITORY-PACKING.md", "LIVE-AGENT-PROVIDER-PROOF.md", "PROGRESSIVE-AGENTS.md", "PROMPT-PRESETS.md", "AGENT-TOOLKIT.md", "APPLICATION-COMPOSITION.md", "SKILL-EVOLUTION.md", "AGENT-TEAM.md", "VOICE-STUDIO.md", "SKILLS.md", "schemas/production-runtime-readiness.v2.schema.json"]
  proof_tokens: ["/runtime-ready.check", "/session.start", "/release.complete", "/repository.pack", "/knowgrph.probe-tree", "/implementation.run", "/application.compose", "/skill.evolve", "/agent.team", "/voice.studio", "/ecs.session-start", "/ecs.world-tick", "/ecs.decision-persist", "/agent.toolkit", "/camera.select", "/motion.control", "/xr.stage", "/xr.place", "/xr.transform", "/xr.label", "/xr.remove", "/xr.physics", "/xr.present", "#runtime-ready", "#multi-agent-collaboration", "#repository-packing", "#knowgrph.probe-tree", "#managed-implementation-run", "#application-composition", "#skill-evolution", "#role-based-agent-team", "#voice-clone", "#speech-to-text", "#text-to-speech", "#agentic-ecs", "#agent-toolkit", "#pose", "#transform", "#world", "#body", "#impulse", "#controller", "#reticle", "@operator", "@working-directory", "@work-item", "@repository-root", "@implementation-run", "@application-manifest", "@component-catalog", "@integration-profile", "@skill-catalog", "@skill-policy", "@agent-team", "@source.frontmatter", "@runtime-proof", "@knowgrph.probe-tree", "@mcp-gateway", "@ecs-session", "@agent-toolkit-observer", "@scene", "@canvas", "@audio", "@text", "@voice-profile", "@approval-gate", "@cost-log", "/sandbox.policy.validate", "#agent-sandbox-policy", "@sandbox-policy"]
local_proof:
  provider_mode: "mock"
  network_allowed: false
  repository_writes_allowed: false
  paid_call_count: 0
  actual_cost_usd: 0
  deterministic_replays: 2
voice_studio_proof:
  status: "runtime-ready-dev"
  readiness_scope: "injected-adapter Dev runtime only"
  command: "npm run voice-studio:check"
  mcp_tool: "knowgrph.voice.studio"
  operations: ["clone", "dictate", "create"]
  canonical_stdio_provider_status: "unconfigured"
  canonical_stdio_live_owner_count: 0
  canonical_stdio_live_adapters: 0
  browser_profile_persistence: "session-only React state"
  browser_recognition_default: "off; explicit opt-in required"
  provider_backed_cloning_verified: false
  production_ready: false
  cloudflare_ready: false
  deterministic_network_calls: 0
  deterministic_repository_writes: 0
  deterministic_paid_calls: 0
  deterministic_actual_cost_usd: 0
sme_canvas_evidence:
  fixture: "sme-agent/fixtures/pre-seed.md"
  artifact: "sme-agent/demo/sme-care-agent-canvas-evidence.md"
  invocation: "/sme-care-agent"
  schema: "knowgrph-sme-canvas-evidence/v1"
  kgc_schema: "kgc-computing-flow/v1"
  renderer: "storyboard"
deployed_verification:
  script: "scripts/verify-deployed-runtime.mjs"
  explicit_environment_only: true
  required_environment: ["FRONTEND_URL", "MCP_ENDPOINT"]
---

# Knowgrph Runtime Readiness Contract

## Authority

The opening frontmatter is the machine source of truth for the Dev runtime-readiness gate. Agentic Canvas OS `SKILLS.md` governs lightweight agent-variant catalog membership, while Knowgrph's validated registry owns its exact agent IDs and derived `/*-agent` invocations. The external dictionaries remain the shared token grammar SSOT without duplicating each runtime registry. This contract records the only Agentic Canvas OS repository and revision pin; Integration, runtime-verification, and release-verification workflows resolve their checkout inputs from it instead of copying the SHA, and fetch full local history so the network-free gate can prove the live-proof introduction revision.

Motion Control grammar readiness requires the complete canonical `/motion.control @canvas #pose` tuple from that pinned source. Executable browser readiness remains Knowgrph-owned: the camera-free LiteRT smoke starts a fresh exact-revision Vite server, loads the generated same-origin Wasm and digest-checked Google pose model through the same compile owner as capture, runs one deterministic float32 inference, validates finite output tensors and resource release, and asserts zero `getUserMedia` calls. That smoke proves model execution on its reported backend only; it does not prove camera permission, human-pose quality, WebGPU acceleration, multi-source capture, Prod, or Cloudflare.

The pinned `schemas/production-runtime-readiness.v2.schema.json` is the public release-attestation SSOT. A protected Knowgrph release must validate one byte-identical marker for `/`, `/knowgrph`, and the generated mirror; the marker binds the Knowgrph commit and tree, Agentic Canvas OS docs/catalog revision, immutable-manifest digest, and deterministic browser-artifact digest. Knowgrph remains the only `airvio.co` deployment owner. The verify job pins the production mirror's base revision, includes the reviewed hidden readiness files in the artifact, and records every managed deletion. The deploy job checks out that exact base and reconciles the verified additions, replacements, and deletions before Cloudflare deployment; an overlay that retains an older asset namespace or omits the nested marker fails closed. The release proves routes, storage, and reconciled docs through the exact successful `*.joohwee.pages.dev` deployment returned by the Cloudflare API for the protected SHA, while the smoke continues to validate canonical `airvio.co` URLs and metadata in the served responses. It then reads both marker routes and runs the Home/app Chromium proof on that same immutable deployment. The candidate uses the canonical `airvio.co` storage owner and keeps its nested canvas on the same exact deployment, so shared-document hydration, Home, `/knowgrph`, and every JavaScript response remain bound to the release-SHA namespace. Vite's application and worker Rollup outputs share the same revision-scoped filename policy; an unversioned worker bundle fails browser fidelity just like an unversioned application chunk. This transport separation prevents a GitHub-hosted runner's custom-domain challenge from masquerading as application drift without weakening canonical-response assertions, shared-document fidelity, immutable marker acceptance, or automatic rollback. Custom-domain browser acceptance remains a separate operator proof from a non-challenged network.

The apex Home owner ignores non-routing release, trace, canvas-background, and editor-visibility parameters, including `kgReleaseProof`, `kgTrace`, the `kgCanvas*` render selectors, and a shared-document `kgPath`. These parameters may configure or attest Home but cannot silently transfer route ownership to the workspace. A direct `/knowgrph/` alias or a document-preview route remains workspace-owned and suppresses Home.

The pinned `AGENT-TOOLKIT.md` and its `/agent.toolkit #agent-toolkit @agent-toolkit-observer` grammar expose the native Toolkit boundary without copying its implementation. Agentic Canvas OS remains the sole execution, instrumentation, evaluation, and reviewed-learning owner; Knowgrph performs read-only catalog resolution and adds no request-time service or external Toolkit dependency.

The pinned `APPLICATION-COMPOSITION.md` and its `/application.compose #application-composition @application-manifest @component-catalog @integration-profile @runtime-proof` grammar govern provider-neutral composition. Knowgrph implements the independent local catalog, mode-bound immutable planner, and bounded sequencer through `knowgrph.application.catalog`, `knowgrph.application.plan`, and `knowgrph.application.execute`. Catalog and plan make zero model or external calls. Execute replans and digest-fences the exact source, revisions, schemas, capabilities, owners, and adapters before delegating each step. Its closed top-level MCP arguments never accept a caller adapter, provider, transport, approval array, or raw tool result, and built-in component schemas expose no caller command, endpoint, or credential fields. Embedding hosts may admit bounded source-bound JSON component packs only through the private initialization API; extension `node.config` remains governed by the selected closed schema and host review, while MCP cannot register a pack, adapter, resolver, package, URL, or executable. This integration copies no external implementation and adds no request-time Agentic Canvas OS, Symphony, or LangChain dependency.

The pinned `SKILL-EVOLUTION.md` owns `/skill.evolve #skill-evolution @skill-catalog @skill-policy @runtime-proof @operator`. Knowgrph independently implements `knowgrph.skill.evolve` as a Dev local stdio state machine with deterministic epochs, batches, mini-batches, textual learning-rate decay, isolated held-out validation, durable atomic revision claims and replay, source-bound usage envelopes, phase cost accounting, artifact-materialized mutation verification, and review-pending output only. A repository-contained SHA-pinned self-contained module supplies authorization, source-verifier, training-executor, candidate, and held-out roles through fresh per-call bounded-IPC subprocesses; none is an MCP argument. The runtime has no SkillOpt package, service, process, compatibility layer, or request-time dependency. Its orchestrator has no model-weight mutation or skill-apply operation; the configured adapter remains trusted and contractually inference-only.

The pinned `AGENT-TEAM.md` owns `/agent.team #role-based-agent-team @agent-team`, its source contract, revision fences, routing semantics, and hard bounds. Knowgrph independently owns the Dev local stdio `knowgrph.agent_team.plan`, `.start`, `.list`, and `.control` lifecycle, including its durable run ledger, checkpoints, replay fences, cancellation, review state, and sanitized public projection. Planning is read-only and zero-model. The canonical stdio host privately installs exact Agent Definition/workflow/review verification, local control authorization, file-backed review-receipt verification, and a revisioned replay-safe local Ollama adapter with an explicitly zero-spend estimate; MCP input can configure none of those owners. Execution is enabled only when the host selects an exact model with `KNOWGRPH_AGENT_TEAM_MODEL`, defaults to loopback, and never downloads or hard-codes a model. The checked-in collaboration team binds exact generic manager, evidence-scout, and risk-reviewer definitions to a two-branch workflow. Durable execution uses deterministic effect ids and leased claims, writes pending/completed local model-effect receipts, passes the same digest-bound branch projection to estimate and execute, persists each admitted envelope for exact reclaim, folds a durable active-stage clock across winning controls, caps both stage timers to remaining run time, and blocks retry when cost is unreported or an adapter exceeds trust. Live claims are deferred; expired claims that fail continuation fences are cleared atomically with their branch, marked unreported, and receive an exact start snapshot. Per-event content digests and checkpoint links are verified through a maximum of 64 transitions, with a validated single-successor crash window, while exact persisted start/control snapshots preserve original idempotent replay results. Every MCP descriptor has a closed operation-specific output schema; only completed start and exact completed lookup projections may contain the public answer. Raw internal error messages and local paths are suppressed. Roles, goals, and personas grant no authority. Delegate output remains private and requires a source-synthesis receipt; every public output requires guardrail acceptance bound to the exact final-owner Agent Definition revision and output digest. Handoff ownership moves only on successful settlement. Exact run lookup can retrieve a completed public answer without exposing private context. This runtime adds no external model router, tool service, or swarm dependency, and it makes no remote Worker or production readiness claim.

The pinned `VOICE-STUDIO.md` owns one `/voice.studio` command, the exact
`#voice-clone`, `#speech-to-text`, and `#text-to-speech` routes, and their
audio, text, profile, approval, cost, and proof bindings. Knowgrph independently
implements `knowgrph.voice.studio` as a closed local stdio facade for `clone`,
`dictate`, and `create`. Deterministic dry-run performs no network, repository,
or paid-provider work and fabricates no transcript or audio. Executable live
hosting requires separate host-owned exact-request approval, voice-rights,
immutable-source resolution, a zero-spend estimate/execution adapter,
independent settled-cost verification, and output read-back owners. Approval
binds exact USD and call ceilings; an estimated overage blocks before dispatch,
while a settled overage is terminal and reconciliation-required. Exact
concurrent retries share one in-flight effect; a changed request under the same
idempotency key conflicts. Cancellation after external dispatch requires
reconciliation and leaves cost incomplete. The canonical stdio server injects
none of the live owners and is provider-unconfigured, so canonical live calls
fail closed before egress. Successful injected-adapter results require one
digest-bound read-back artifact and expose no credentials, raw audio, speaker
embedding, filesystem path, or private provider response. The browser Media
panel keeps consented profile manifests only in session React state, uses
rights-gated bounded and stoppable microphone capture, leaves browser-managed
recognition off until a separate explicit opt-in, and plays only an explicitly
requested disclosed system-voice preview. This supports only
`runtime-ready-dev` for an injected-adapter Dev host; provider-backed cloning or
quality, durable biometric deletion, remote Worker parity, Prod, and Cloudflare
readiness remain unclaimed.

## Promotion Rule

`runtime-ready` is an executable claim. It requires the focused runtime suite, readable pinned dictionaries, canonical stage topology, deterministic replay, zero paid calls, zero actual cost, proof bound to the current Git source state, and a byte-stable `/sme-care-agent` Canvas evidence artifact that parses through the shared frontmatter-flow path.

The local gate performs no network calls, deployments, remote migrations, or repository writes. Deployed reachability is a separate operator-invoked verification and cannot promote a failing local runtime.

Skill Evolution readiness additionally requires `npm run skill-evolution:check`. The focused suite proves the canonical MCP descriptor and stdio dispatch, full model-free state-machine execution with deterministic adapters, five-role per-call process isolation, self-contained adapter enforcement, split isolation, exact batch scheduling, artifact-materialized textual hunks, registered gates, source-bound usage envelopes, conservative error accounting, deadlines and cancellation, same-host local-filesystem intent/replay/CAS fencing with constant-time definite replay absence, validation promotion and rollback, patience, aggregate and phase meters, and immutable false apply/weight/deploy flags. Provider availability, distributed locking, network-filesystem semantics, hostile-code containment, network isolation, and canonical skill persistence remain outside this claim.

Agent Team readiness additionally requires `npm run agent-team:check`. Its deterministic contract, runtime, clean-room, and local stdio proofs cover exact tuple and source-revision fencing, exact built-in reference admission and drift rejection, per-operation closed public output schemas, completed-answer scope, idempotent plan/start/control with exact persisted replay snapshots, cross-runtime claim ownership, delegate synthesis and handoff ownership, exact-owner guardrail acceptance, private-output suppression and recipient isolation, hard budget/checkpoint preflight, zero-spend bounded adapter estimate and settlement, control-race-proof active-time accounting, safe cumulative counters, sanitized internal failures, unreported-cost retry blocking, deterministic effect ids, durable pending/completed local model receipts, lease reclaim without re-estimation, live-claim recovery deferral, atomic expired-claim failure, next-state invariant validation, content-digest event/checkpoint recovery and crash repair through the 64-checkpoint limit, stale-version rejection, exact authorization and expiring review-receipt fencing, terminal reject/revise outcomes, final-answer retrieval, and cancellation precedence. The canonical stdio proof executes the registered two-specialist team through a loopback fake Ollama endpoint, completes manager-owned synthesis with zero cost, and proves replay makes no additional model request. Real local model availability, remote Worker dispatch, production deployment, hostile-model process containment, and distributed or network-filesystem locking remain outside this claim.

Voice Studio readiness additionally requires `npm run voice-studio:check`.
That focused suite proves exact ordered equality between the shared and browser
routes plus parser rejection of reordered tokens, one closed three-operation
MCP facade, full SHA-256 request and artifact identity, deterministic zero-call
dry-run, atomic same-request concurrency, exact idempotency conflict, separate
approval/rights/source/cost/read-back owners, bounds, revocation and expiry,
zero-spend estimates, exact-cap settlement, pre-dispatch budget blocking,
settled-overage terminal reconciliation, post-dispatch incomplete cost,
sanitized injected-adapter
clone/dictate/create receipts, and canonical stdio provider-unconfigured
failure. Browser source checks cover session-only manifests with no
voice-specific localStorage registry, recording-rights and participant-notice
gates, duration/byte caps, explicit recognition opt-in, visible Stop controls,
and tested teardown of tracks, recognition, timers, speech, object URLs, and
detached late callbacks. The
clean-room gate rejects Voicebox dependencies or runtime imports and confirms
the revision-qualified manual review ledger; it is not a source-similarity
detector. This is injected-adapter Dev readiness only. Provider entitlement,
cloning quality, speaker similarity, transcription accuracy, speech fidelity,
durable deletion, live settlement, remote Worker parity, Prod, and Cloudflare
remain outside the claim.

Repository Packing readiness additionally requires `npm run repository-pack:check`. The focused gate proves the closed `knowgrph.repository.pack` MCP descriptor, deterministic hook-disabled Git inventory, ignored-file handling, private policy exclusions, binary, symlink, and uninitialized-Gitlink omission, strict root containment, bounded reads, revision/index/source revalidation, content-addressed atomic no-replace publication and reuse, metadata-only stdio output, explicit zero model/network/cost meters, and the independent implementation dependency guard. The runtime never accepts an absolute caller root or a destination outside the selected Git worktree. Full shared-token promotion remains revision-fenced by `docs_dependency`; the pin and `proof_tokens` must advance only after the canonical Agentic Canvas OS repository-packing docs commit exists.

The Agentic ECS tokens resolve from the pinned Agentic Canvas OS dictionaries, while executable ownership remains in Knowgrph. Its three local stdio operations are `dev-only`; the canonical server injects no systems, decision executor, model route, network path, or deployment capability. The default lifecycle is KGC hydration, one successful zero-system/no-reasoning tick with a canonical zero Cost_Log, and zero-pending disposal. Reviewed embedding hosts may inject systems and an optional decision executor only through runtime construction, never through MCP arguments.

## Cloudflare-Only Runtime Boundary

The deployed agent runtime requires only the `knowgrph-mcp` Worker, its Agents SDK Durable Objects, the `AI` Workers AI binding, the `KNOWGRPH_AGENT_RUNTIME_BEARER_TOKEN` Worker secret, and an operator-selected `KNOWGRPH_AGENT_MODEL_ID`. The model identifier has no repository default. Agent definitions, schemas, plans, policies, and renderer contracts are bundled from `data/config/agents/agent-definitions.json`; request handling does not read another repository or call an external orchestration service.

The pinned Agentic Canvas OS documentation is a source-time governance dependency checked before promotion. It is not a request-time infrastructure dependency. BytePlus, Exa, StryTree, payment, and media services remain optional adapters for their existing specialized stages and are not required for `/investment-research-agent`, `/sme-care-agent`, or `/video-agent` to compile and dry-run.

Invocation-catalog readiness additionally requires every read-only `/`, `#`, and `@` docs MCP response to carry the same exact source revision, full-catalog counts, and deterministic SHA-256 `catalogDigest`. The browser replaces each sigil slice, rejects provenance, membership, count, or digest drift, recomputes the digest from the assembled source metadata, and only then publishes `fresh`. FloatingPanel Skills & Commands and the canonical runtime identity expose that digest; peer attestation compares it directly, while local executable behavior may enrich but never shadow dictionary-owned metadata.

The reviewed Function Calling proof uses the separate `env.dev` Worker named `knowgrph-mcp-dev`. That environment repeats the MCP and Run Manifest Durable Object bindings, keeps `KNOWGRPH_LIVE_CLIENTS="0"`, serves only a `workers.dev` hostname, and declares no `airvio.co` route. Its Dev-only bearer authenticates both the Agentic service client and the proof manifest read-back. The top-level production routes and deploy command remain a separate gate.

The accepted 2026-07-19 proof is bound to Agentic Canvas OS revision `a7ac73f427c10957b37d016e6a55592b578c381f` and its canonical `LIVE-REVIEWED-FUNCTION-PROOF.md`. One recovered durable continuation completed one logical `gpt-5.6-luna` run in two Responses requests and one signed reviewed call. Knowgrph returned an `applied` native receipt, and authenticated read-back found the exact note at revision 1. Aggregate returned usage was 546 input and 55 output tokens with USD 0.000876 estimated cost. The evidence proves only this route-free Dev lane; no production route, Pages deployment, custom domain, or live stage client changed.

Live execution is fail-closed. `/sme-care-agent` is the single prepared definition: its text and complete/per-run transport requirements pass to the Workers AI resolver, which returns a versioned provider/model/transport packet. The runtime then resolves the packet's exact adapter id from the immutable Running Agents registry. Missing approval, binding, model id, incompatible packet, or adapter blocks before dispatch. The other definitions remain deterministic dry-run only until they declare and prove their own model requirements.

`/sme-care-agent` additionally owns the internal `agent.sme` / `sme.risk.profile` deterministic kernel. Its Cloudflare bundle compiles without an external orchestration service, while its full Dev execution uses the existing local Source Files owner for atomic `sme-agent/profiles/*` and `sme-agent/runs/*` writes. Every successful live run includes `sme-agent/runs/<runId>/canvas-evidence.md`, a `kgc-computing-flow/v1` Storyboard projection of exposures, gaps, unknown risks, protection guidance, rationales, cost, and deployment boundaries. The checked-in pre-seed evidence mirror is regenerated from the same runtime owner and must remain byte-identical. Prod mirror and Cloudflare mutations remain prohibited until separately authorized.

## Commands

```bash
npm run runtime:docs-dependency:resolve
npm run worktree:lifecycle:check
npm run voice-studio:check
npm run runtime:check
```

Pre-deployment secret configuration (operator action):

```bash
npx wrangler secret put KNOWGRPH_AGENT_RUNTIME_BEARER_TOKEN \
  --config cloudflare/workers/knowgrph-mcp/wrangler.toml
npx wrangler secret put KNOWGRPH_AGENT_MODEL_ID \
  --config cloudflare/workers/knowgrph-mcp/wrangler.toml
```

Isolated reviewed-function proof preparation, only after explicit Dev deploy approval:

```bash
npx wrangler secret put KNOWGRPH_AGENT_RUNTIME_BEARER_TOKEN \
  --config cloudflare/workers/knowgrph-mcp/wrangler.toml --env dev
npm --prefix cloudflare/workers/knowgrph-mcp run deploy:dev
```

Post-deploy verification, only after explicit authorization and with explicit URLs:

```bash
FRONTEND_URL=https://example.invalid \
MCP_ENDPOINT=https://example.invalid/mcp \
npm run runtime:verify:deployed
```
