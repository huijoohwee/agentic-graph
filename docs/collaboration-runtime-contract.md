---
title: "agentic-graph Collaboration Runtime Contract"
doc_type: "Runtime Contract"
status: "active"
contract_version: 39
frontmatter_contract: "required"
ci_command_timeout_ms: 300000
ci_command_timeout_overrides:
  - command: ["npm", "-C", "canvas", "run", "test:smoke:xr-v2:browser"]
    timeout_ms: 900000
  - command: ["npm", "run", "check:agentic-travel-commerce-platform"]
    timeout_ms: 900000
invocation:
  actions: ["/change", "/fix", "/refactor", "/verify", "/release"]
  required_pr_keys: ["action", "scope", "actor", "base_sha"]
  scope_pattern: "^#[a-z0-9]+(?:[.-][a-z0-9]+)*$"
  actor_pattern: "^@[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$"
  base_sha_pattern: "^[0-9a-f]{40}$"
coordination:
  base_branch: "main"
  branch_pattern: "^agent/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"
  unique_active_scope: true
  protected_push_refs: ["refs/heads/main"]
local_development:
  canonical_mode: "canonical"
  task_mode: "task"
  mode_environment_variable: "AG_DEV_SOURCE_MODE"
  worktree_policy:
    mode: "same-device-multi-worktree"
    minimum_registered_per_repository: 1
    session_end:
      completion_state: "completed"
      cleanup_requires: ["clean", "detached", "exact-origin-main", "explicit-target"]
      retain_states: ["canonical", "active", "delivery", "parked"]
      force_remove: false
      delete_branch: false
  canonical_sources:
    - id: "agentic-graph"
      repository_path: "."
      required_path: "."
      canonical_remote: "origin"
      canonical_branch: "main"
      fetch_required: true
      clean_required: true
      task_divergence_allowed: true
    - id: "agentic-canvas-os-docs"
      repository_path: "../agentic-canvas-os"
      required_path: "docs"
      canonical_remote: "origin"
      canonical_branch: "main"
      fetch_required: true
      clean_required: true
      task_divergence_allowed: false
      pinned_ref_allowed: true
      pinned_ref_frontmatter: "docs/runtime-readiness-contract.md"
deployment:
  allowed_workflows: [".github/workflows/release.yml", ".github/workflows/travel-mesh-bootstrap.yml"]
  required_trigger: "workflow_dispatch"
  required_branch: "main"
  promotion_policy: "human-authorized-candidate"
  forbidden_triggers: ["push", "pull_request", "repository_dispatch", "schedule"]
  command_patterns: ["wrangler(?:@[^ ]+)?\\s+pages\\s+deploy(?:\\s|$)", "wrangler(?:@[^ ]+)?\\s+versions\\s+(?:upload|deploy)(?:\\s|$)", "wrangler(?:@[^ ]+)?\\s+d1\\s+migrations\\s+apply(?:\\s|$)", "node\\s+\\./scripts/travel-mesh-release\\.mjs\\s+(?:deploy|rollback)(?:\\s|$)", "node\\s+\\./scripts/travel-mesh-bootstrap\\.mjs\\s+apply(?:\\s|$)", "npm\\s+run\\s+[^\\n]*deploy(?!ed)[^\\s]*(?:\\s|$)"]
ci_scopes:
  dependencies:
    roots: ["package.json", "package-lock.json", "canvas/package.json", "canvas/package-lock.json", "contracts/package.json", "grph-shared/package.json", "gympgrph/package.json", "mcp/package.json", "web/package.json"]
    commands:
      - ["npm", "run", "check"]
      - ["npm", "run", "runtime:check"]
  canvas:
    roots: ["canvas/src/", "canvas/scripts/", "grph-shared/src/", "gympgrph/src/"]
    commands:
      - ["npm", "run", "check"]
  rich_media_preview_timing:
    roots: ["canvas/schemas/rich-media-catalog-preview-timing.v1.schema.json", "canvas/scripts/lib/rich-media-catalog-preview-timing-schema.mjs", "canvas/scripts/validate_rich_media_catalog_preview_timing.mjs", "canvas/scripts/__tests__/rich-media-catalog-preview-timing-schema.test.mjs", "canvas/scripts/run_rich_media_browser_smoke.mjs", "canvas/scripts/verify_rich_media_browser_smoke.py", "canvas/src/features/testing/RichMediaBrowserSmokePage.tsx", "canvas/src/features/testing/richMediaBrowserSmokeFixtures.json", "canvas/src/__tests__/richMediaBrowserSmokeContract.test.ts"]
    commands:
      - ["npm", "--prefix", "canvas", "run", "test:smoke:rich-media:timing-schema"]
      - ["npm", "--prefix", "canvas", "run", "test:ci:unit", "--", "richMedia.browserSmokeContract"]
  xr_v2_video_editor:
    roots: ["canvas/src/features/xr-v2/", "canvas/src/components/timeline/", "canvas/src/features/gitgraph/", "canvas/src/features/testing/XrV2RuntimeSmokePage.tsx", "canvas/src/features/testing/xrV2BrowserObservationSupport.ts", "canvas/scripts/run_xr_v2_browser_smoke.mjs", "canvas/scripts/verify_xr_v2_browser_smoke.mjs", "scripts/xr-v2/", "scripts/video-editor/", "scripts/run-xr-v2-source-smoke.mjs", "scripts/run-video-editor-source-smoke.mjs", "scripts/__tests__/xr-v2-source-smoke.test.mjs", "scripts/__tests__/video-editor-source-smoke.test.mjs", "docs/documents/agentic-graph-ar-vr-xr-prd-tad-adr.md", "docs/documents/agentic-graph-xr-v2-runtime-readiness.md", "docs/documents/agentic-graph-2d-renderer-enhancement-design.md", "docs/TESTING.md", "docs/runtime-api.md"]
    commands:
      - ["npm", "run", "xr-v2:review-ready"]
  surface_policy:
    roots: ["config/surface-registry.json", "config/license-registry.json", "schemas/surface-registry.v1.schema.json", "scripts/surface/", "data/surface/", "docs/discoverability-ip-protection-runtime.md"]
    commands:
      - ["npm", "run", "surface:verify"]
  runtime:
    roots: ["cloudflare/workers/", "contracts/", "ecs/", "mcp/", "web/"]
    commands:
      - ["npm", "run", "runtime:check"]
  travel_commerce:
    roots: ["src/archive/", "src/bundle/", "src/cache/", "src/gate/", "src/ledger/", "src/registry/", "src/runtime/", "src/travel-commerce/", "src/ui/", "cloudflare/d1/migrations/0012_travel_agency.sql", "cloudflare/d1/migrations/0017_marketplace_authoring_fence.sql", "cloudflare/workers/agentic-graph-agentic-travel-commerce/", "cloudflare/workers/agentic-graph-marketplace/", "cloudflare/workers/agentic-graph-mcp/", "cloudflare/workers/agentic-graph-payment/", "cloudflare/workers/agentic-graph-storage/", "cloudflare/workers/agentic-graph-travel-commerce/", "cloudflare/workers/agentic-graph-travel-discovery/", "cloudflare/workers/agentic-graph-travel-experience-discovery/", "cloudflare/workers/agentic-graph-travel-ollama-overflow/", "cloudflare/workers/agentic-graph-travel-operator-gateway/", "cloudflare/workers/agentic-graph-travel-settlement-executor/", "tests/travel-commerce/", "scripts/travel-commerce/", "scripts/travel-mesh-bootstrap-authorization.mjs", "scripts/travel-mesh-bootstrap.mjs", "scripts/travel-mesh-release-inventory.mjs", "scripts/travel-mesh-release.mjs", "scripts/travel-mesh-release-plan.mjs", "scripts/travel-mesh-release-probes.mjs", "scripts/__tests__/travel-mesh-release-provider-proof.test.mjs", "scripts/__tests__/travel-mesh-release.test.mjs", "canvas/src/features/testing/TravelCommerceDemoPage.tsx", "canvas/src/features/panels/views/travelAgencyPaymentApiDocs.ts", "canvas/public/travel-commerce-demo-offline.html", "canvas/public/travel-commerce-demo-sw.js", "docs/documents/agentic-graph-agentic-travel-agencies-prd-tad-adr.md"]
    commands:
      - ["npm", "run", "check:agentic-travel-commerce-platform"]
  xrpl_paid_resource:
    roots: ["package.json", "package-lock.json", "grph-shared/package.json", "grph-shared/src/payments/agenticCommercePaidResourceSsot.ts", "grph-shared/src/payments/xrplClassicAddress.ts", "cloudflare/d1/migrations/0018_agentic_commerce_paid_resources.sql", "cloudflare/pages/agentic-graph-agent-ready", "cloudflare/workers/shared/d1.ts", "cloudflare/workers/agentic-graph-payment/agenticCommercePaidResource", "cloudflare/workers/agentic-graph-payment/agenticCommerceX402Xrpl.ts", "cloudflare/workers/agentic-graph-payment/index.ts", "cloudflare/workers/agentic-graph-payment/travelAgency/boundedJson.ts", "cloudflare/workers/agentic-graph-payment/wrangler.toml", "cloudflare/workers/agentic-graph-payment/tsconfig.xrpl-x402.json", "cloudflare/workers/agentic-graph-payment/vitest.net-settlement.config.mts", "cloudflare/workers/agentic-graph-payment/vitest.strytree-ledger.config.mts", "cloudflare/workers/agentic-graph-payment/__tests__/agentic-commerce-x402-xrpl-", "cloudflare/workers/agentic-graph-payment/__tests__/agenticCommerceXrplRouteTestSupport.ts", "cloudflare/workers/agentic-graph-travel-discovery/", "scripts/configure-xrpl-x402-paid-resource.mjs", "scripts/check-xrpl-x402-paid-resource.mjs", "scripts/check-xrpl-x402-pages-candidate.mjs", "scripts/smoke-xrpl-x402-paid-resource.mjs", "scripts/stripe-payment-script-runtime.mjs", "scripts/pages-mirror-agent-ready.mjs", "scripts/__tests__/xrpl-x402-paid-resource-", "docs/documents/agentic-graph-xrpl-x402-paid-resource-prd-tad-adr.md"]
    commands:
      - ["npm", "run", "payment:x402:xrpl:source-check"]
  documentation:
    roots: ["docs/", "CodeWiki.md", "README.md", "goal.md"]
    commands: []
  collaboration:
    roots: [".github/", ".githooks/", "AGENTS.md", "docs/branch-protection.md", "docs/collaboration-runtime-contract.md", "docs/conflict-resolution.md", "schemas/collaboration-runtime-report.v1.schema.json", "schemas/collaboration-runtime-validation.v1.schema.json", "schemas/immutable-release-manifest.v1.schema.json", "scripts/collaboration-contract.mjs", "scripts/collaboration-runtime-report.mjs", "scripts/immutable-release-manifest.mjs", "scripts/create-immutable-release-manifest.mjs", "scripts/validate-immutable-release-manifest.mjs", "scripts/publish-immutable.mjs", "scripts/production-release-authorization.mjs", "scripts/travel-mesh-bootstrap-authorization.mjs", "scripts/travel-mesh-bootstrap.mjs", "scripts/travel-mesh-release-inventory.mjs", "scripts/travel-mesh-release.mjs", "scripts/travel-mesh-release-plan.mjs", "scripts/travel-mesh-release-probes.mjs", "scripts/run-pre-push-gate.mjs", "scripts/print-collaboration-runtime-report-example.mjs", "scripts/print-collaboration-runtime-report-schema.mjs", "scripts/print-collaboration-runtime-validation-schema.mjs", "scripts/validate-collaboration-runtime-report.mjs", "scripts/validate-collaboration-runtime-validation.mjs", "scripts/runtime-readiness-contract.mjs", "scripts/runtime-docs-workflow-policy.mjs", "scripts/resolve-runtime-docs-dependency.mjs", "scripts/worktree-policy.mjs", "scripts/check-worktree-policy.mjs", "scripts/dev-source-consistency.mjs", "scripts/check-dev-source-consistency.mjs", "scripts/check-collaboration-runtime.mjs", "scripts/check-pre-push-refs.mjs", "scripts/run-affected-ci.mjs", "scripts/__tests__/collaboration-contract.test.mjs", "scripts/__tests__/collaboration-runtime-report.test.mjs", "scripts/__tests__/dev-source-consistency.test.mjs", "scripts/__tests__/immutable-release-manifest.test.mjs", "scripts/__tests__/production-release-authorization.test.mjs", "scripts/__tests__/production-release-contract.test.mjs", "scripts/__tests__/runtime-readiness-contract.test.mjs", "scripts/__tests__/travel-mesh-release-provider-proof.test.mjs", "scripts/__tests__/travel-mesh-release.test.mjs", "scripts/__tests__/worktree-policy.test.mjs"]
    commands:
      - ["npm", "run", "test:collaboration-contract"]
ci_exact_path_scopes:
  travel_commerce:
    entries:
      - path: "cloudflare/workers/agentic-graph-travel-commerce/worker-configuration.d.ts"
        commands:
          - ["npm", "run", "travel-commerce:worker:types:check"]
          - ["npm", "run", "travel-commerce:typecheck"]
      - path: "cloudflare/workers/agentic-graph-mcp/worker-configuration.d.ts"
        commands:
          - ["npm", "run", "travel-commerce:mcp:types:check"]
          - ["npm", "run", "travel-commerce:mcp:typecheck"]
      - path: "cloudflare/workers/agentic-graph-travel-experience-discovery/worker-configuration.d.ts"
        commands:
          - ["npm", "run", "travel-commerce:experience-discovery:types:check"]
          - ["npm", "run", "travel-commerce:experience-discovery:typecheck"]
      - path: "cloudflare/workers/agentic-graph-storage/worker-configuration.d.ts"
        commands:
          - ["npm", "run", "storage:worker:types:check"]
          - ["npm", "run", "travel-commerce:shared-canvas:typecheck"]
      - path: "cloudflare/workers/agentic-graph-travel-settlement-executor/worker-configuration.d.ts"
        commands:
          - ["npm", "run", "travel-commerce:settlement-executor:types:check"]
          - ["npm", "run", "travel-commerce:settlement-executor:typecheck"]
      - path: "cloudflare/workers/agentic-graph-travel-operator-gateway/worker-configuration.d.ts"
        commands:
          - ["npm", "run", "travel-commerce:operator-gateway:types:check"]
          - ["npm", "run", "travel-commerce:operator-gateway:typecheck"]
      - path: "cloudflare/workers/agentic-graph-marketplace/worker-configuration.d.ts"
        commands:
          - ["npm", "run", "marketplace:worker:types:check"]
          - ["npm", "run", "marketplace:typecheck"]
ci_command_expansions:
  - command: ["npm", "run", "xr-v2:review-ready"]
    steps:
      - ["npm", "run", "xr-v2:source-runner:test"]
      - ["npm", "run", "video-editor:source-runner:test"]
      - ["npm", "run", "check"]
      - ["npm", "run", "xr-v2:unit"]
      - ["npm", "run", "video-editor:unit"]
      - ["npm", "run", "video-editor:compatibility"]
      - ["npm", "run", "video-editor:source-ready"]
      - ["npm", "run", "xr-v2:source-ready"]
      - ["npm", "-C", "canvas", "run", "test:smoke:xr-v2:browser"]
fallback_commands:
  - ["npm", "run", "check"]
---

# agentic-graph Collaboration Runtime Contract

## Authority

This opening YAML frontmatter is the machine source of truth for collaboration grammar, local source identity, deployment isolation, and affected-scope CI selection. Runtime scripts parse it directly; workflow files must not duplicate its source registry or path-to-command mapping.

The protected Git guideline and checker under `huijoohwee.github.io/scripts/` are an external advisory projection. This contract and its repository-owned executable checks remain `agentic-graph`'s collaboration source of truth. `agentic-graph` may consume the upstream rule intent and exact protected revision, but it must not copy that guideline, checker implementation, rule catalog, or fixtures into this repository.

An exact-path CI scope may narrow only its own composite command when the complete
normalized change set consists exclusively of declared repository-relative file
paths. Other matching scopes still run normally. Any mixed, unknown, directory,
configuration, or source path falls back to the ordinary affected-scope plan.
Generated Worker binding declarations use this closed mapping to validate only
their repository-owned generator output and matching consumer typecheck. The
runtime scope still runs normally, and `ci:integration` retains its common
prechecks before affected-command selection. The runner uses a complete,
rename-disabled, NUL-delimited committed diff, includes local untracked paths,
and rejects malformed/noncanonical path inventories. Git inventory failure is a
blocking error rather than an empty successful plan. Native pull-request runs
derive that inventory from `GITHUB_BASE_REF`. Protected-refresh
`workflow_dispatch` runs use the workflow-validated
`AGENTIC_OS_PR_BASE_REF` when the native base is empty, and reject differing
nonempty native and canonical bases. This keeps refreshed merge candidates
scoped to the pull request versus its current base rather than the imported
first-parent `main` delta.

## Invocation Grammar

Every non-draft pull request starts with a YAML frontmatter declaration:

```yaml
---
action: /change
scope: "#canvas.render"
actor: "@developer-or-codex-task"
base_sha: "0123456789abcdef0123456789abcdef01234567"
---
```

- `/` declares one operation.
- `#` declares one semantic ownership scope.
- `@` declares one accountable human or Codex task.
- `base_sha` records the exact upstream `origin/main` commit used to start the work.

Draft pull requests may omit the declaration while their scope is being formed. A pull request must contain a valid declaration before it becomes ready for review.

## Ownership And Conflict Prevention

- Each device keeps one canonical main worktree and may add registered task worktrees detached from fetched `origin/main` before claim.
- One task owns each writable task worktree, branch, semantic scope, lease, and draft pull request.
- One semantic scope has one active implementation owner.
- Every task branch uses `agent/<device>/<semantic-scope>` and starts from the declared `origin/main` commit.
- If two active changes claim the same scope, serialize them or explicitly hand over ownership before further edits.
- Resolve conflicts in the highest upstream source owner, then regenerate derived artifacts.
- Do not commit lease files, lock records, or other coordination state that creates repository churn. Pull request metadata carries live task ownership.

## Continuous Integration

- `Integration Gate` is the sole required merge status.
- `Integration Gate` generates `agentic-graph.immutable-release-manifest/v1` from the exact pull-request head, source tree, pinned Agentic Canvas OS commit, and matching catalog revision; it uploads, downloads, and revalidates the exact bytes and digest before the canonical gate. Individually green repository checks do not replace this pair proof.
- The gate validates this contract, runs source/build conflict compliance, and selects additional commands from `ci_scopes` based on changed paths.
- Dev CI never writes a Prod mirror. After protected `main` integration and exact localhost review, the release workflow may create one ephemeral production candidate; it cannot deploy or publish before exact-candidate human authorization.
- Commands are arrays rather than shell strings, preventing shell interpolation and keeping execution provider-neutral.
- Affected CI expands declared composite commands through `ci_command_expansions` before exact-argv deduplication. The manual focused command remains unchanged, while shared prerequisites such as `npm run check` execute once and each expanded component retains the canonical per-command timeout.
- `ci_command_timeout_overrides` carries the rare longer-running commands that need a stricter per-command bound than the global default. XR browser smoke uses a 15-minute cap because first-run Playwright downloads can consume a material slice of CI time on fresh GitHub runners.
- Every affected-scope command has the canonical bounded timeout; non-terminating checks fail closed instead of freezing the gate.
- Unknown changed paths fail safe through `fallback_commands`.
- Superseded runs on the same pull request are cancelled. Merge-group and protected-main runs use their exact `github.sha` as the concurrency identity, so a delayed older push cannot cancel the required check for a newer protected revision.
- `runtime:check` owns the focused runtime/property suite, including the native `ecs/` core and MCP lifecycle, external invocation-dictionary validation, canonical stage topology, deterministic mock replay, and zero-spend proof.
- `npm run collaboration:contract:check` auto-discovers every workflow that references Agentic Canvas OS and requires dependency installation, the contract resolver, and the checkout in order; checkout repository and immutable ref must come from resolver outputs, never copied workflow YAML. The resolver-owned checkout must fetch full Git history so history-derived proof provenance remains network-free and fail-closed.
- `npm run --silent collaboration:contract:check -- --json` validates against `schemas/collaboration-runtime-report.v1.schema.json` before emitting `agentic-graph.collaboration-runtime-report/v1`, including deployment isolation, discovered runtime-docs workflow consumers and checks, pull-request coordination status, and the canonical `sourceRevision`. Integration sets that revision to the pull-request head SHA, or `github.sha` for a push, so a merge-ref checkout cannot obscure which source commit produced the artifact. Local runs derive it from `git rev-parse HEAD`. Integration uploads the report as the seven-day `collaboration-contract-report` artifact, downloads it, and runs `collaboration:report:check -- --json` against the stored file. The resulting machine envelope is uploaded as the separate seven-day `collaboration-validation-result` artifact, downloaded, and revalidated against both its schema and the downloaded report before the canonical gate. The report validator accepts either an artifact path or `-` for UTF-8 JSON from stdin; the optional leading `--json` emits structured success identity on stdout or a structured failure envelope on stderr with a nonzero exit code. Every success envelope carries the report's `sourceRevision` and `reportDigest`, the lowercase SHA-256 of the exact report bytes including whitespace and final newline. Every JSON envelope is validated against `schemas/collaboration-runtime-validation.v1.schema.json` before it is written, so contract drift fails closed.
- `npm run --silent collaboration:report:schema` emits that exact canonical Draft 2020-12 schema through the shared cached loader, so external machine consumers do not need repository-path knowledge or a copied schema.
- `npm run --silent collaboration:report:check-schema` emits the exact canonical Draft 2020-12 validation-envelope schema through the shared cached loader. Both success and failure identify themselves as `agentic-graph.collaboration-runtime-validation/v1`; consumers must use this command or the upstream schema rather than copying the envelope or error taxonomy.
- `npm run --silent collaboration:report:check-result -- <validation.json|-> [--report <report.json>] [--source-revision <40-hex-sha>]` validates a stored success or failure envelope from a file or UTF-8 stdin. `--report` requires a success envelope and compares both `reportDigest` and `sourceRevision` with the exact report. `--source-revision` requires `--report` and additionally binds that pair to the expected CI head SHA, preventing a valid pair from another commit from being replayed. It reports only human confirmation and exit status, avoiding recursive validator envelopes while giving external consumers a path-independent round-trip check.
- `npm run --silent collaboration:report:example` invokes the same validated report generator with pull-request context disabled, emitting a current schema-valid local example whose pull-request coordination status is `not-applicable`; external integration tests must use this command instead of copied fixtures.
- `npm run --silent collaboration:report:example | npm run --silent collaboration:report:check -- -` is the canonical path-independent consumer smoke test.
- `npm run --silent collaboration:report:example | npm run --silent collaboration:report:check -- --json -` is the machine-readable variant; success contains `schema`, `status`, `schemaId`, `schemaVersion`, `sourceRevision`, `reportDigest`, and `input`, while failure contains `schema`, `status`, `input`, and stable `error.code` plus `error.message`. Consumers must parse the appropriate JSON stream rather than human text or Node stack traces.

## Cross-Device Handoff

1. The sending device stops its Codex task, validates, commits, and pushes.
2. The receiving device fetches the remote and verifies the sender's exact commit SHA.
3. Only one device may resume writes to that branch; the sender remains stopped.
4. A non-fast-forward update or duplicate active semantic scope halts both tasks for explicit upstream resolution.
5. GitHub pull-request metadata is the live coordination registry; shared folders and committed lease files are forbidden.

When the canonical checkout remains owned by another semantic scope, an already-created stopped-writer commit may be published with `npm run release:publish:immutable -- --source-sha <sha> --target-ref refs/heads/agent/<device>/<scope> --expected-remote-sha <sha>`. The command compares the expected remote head, proves fast-forward ancestry, validates the source commit and tree without switching or staging, reads the exact pinned docs SHA from that source object, writes the immutable app/docs/catalog manifest only under `.git`, performs the bounded repository-owned object gate, pushes the exact object, and verifies the remote ref. Manual hook bypass, force, raw refspec push, missing manifest, or authored-file mutation is forbidden.

The visible runtime check lives in MainPanel Settings as the `Cross-device Identity Gate` KTV section. `agentic-graph-runtime-identity-runtime`, mounted once at the application root, owns the canonical app-wide identity snapshot; Settings is a read/action projection only. Agentic Canvas OS `/`, `#`, and `@` catalog hydration publishes revision/count, bounded live-provider-proof, and progressive-Agents-readiness facets into that global identity and must never become the identity owner. The docs MCP derives those facets from canonical `LIVE-AGENT-PROVIDER-PROOF.md` and `PROGRESSIVE-AGENTS.md` contracts bound to exact Git revisions; missing, malformed, or revision-mismatched evidence is `unavailable`. MainPanel displays proof usage and ownership plus the source-backed single-agent → tools → specialists progression, unconfigured default Worker, unverified provider execution, and no-external-SDK boundary without issuing or offering a provider call.

Automatic compliance uses the authenticated canvas-room transport with the dedicated global room `runtime-identity:agentic-graph:main`. The storage boundary derives an opaque principal from the persistent client installation id only after authenticating the session; the room issues short-lived challenges and relays attestations without building, changing, selecting, or persisting runtime identity. It rejects document/asset traffic, binds one principal/device/runtime identity to each authenticated socket session, and rejects one session changing principals. The application-root reporter reads the canonical identity store, binds a point-in-time snapshot to the room challenge, runtime instance, timestamps, and SHA-256 digest, then every client verifies the relayed evidence locally. MainPanel Settings projects only the resulting transport and parity state. `Copy diagnostic JSON` copies the current identity and gate snapshots as a troubleshooting fallback and is never required compliance evidence.

The automatic gate passes only with at least two distinct authenticated device principals and sessions, live device labels, and runtime instances, valid authenticated relay metadata, an unexpired matching challenge, fresh hydration within attempts zero through two, exact agentic-graph/docs/catalog SHA equality, catalog/docs equality, exact `/`, `#`, and `@` counts, matching verified proof/source revisions, and identical source-bound progressive readiness. It reports `collecting`, `pass`, `mismatch`, `stale`, or `blocked`; duplicate, replayed, expired, malformed, unavailable-proof/readiness, or mismatched evidence fails closed. Branch names remain informational. Reconnect failures are bounded per outage and reset only after a stable connected window. The Durable Object close handler publishes the authenticated peer departure and relies on the compatibility-date-owned automatic close reply; it must not issue a second close against an already-closed hibernation socket. No client, room, verifier, WebMCP tool, or Settings action may select a majority winner, refresh the catalog implicitly, mutate Git, synchronize source, or repeat the provider proof. The read-only browser tool `agentic-graph.read_local_runtime_identity` exposes the canonical local identity and current automatic gate snapshot without becoming an owner.

## Local Development Source Identity

- Normal `npm run dev` startup fetches every `local_development.canonical_sources` entry before Vite starts.
- `npm run dev:latest` is the explicit canonical-refresh path. It preflights every canonical source before mutation, requires a clean canonical main worktree, rejects divergent history, applies only `git merge --ff-only` updates there, and then delegates to the unchanged `npm run dev` gate.
- `dev:latest` never stashes, resets, pulls, switches branches, or mutates an owned task branch. If any source cannot update safely, all source fast-forwards are withheld and startup fails with the responsible identity.
- Startup accepts one or more registered worktrees per source repository, while rejecting missing, bare, prunable, or duplicate-branch registrations.
- `npm run worktree:check` exposes that registry policy as a standalone preflight without fetching, changing branches, or starting Dev. `ci:integration` runs it first so the installed pre-push hook and remote Integration Gate reject unsafe registrations before expensive validation.
- `npm run status` is an informational current-device projection from the repository-pinned `agentic-os` harness; it is not named or consumed as a lifecycle gate. `npm run reap` performs bounded lifecycle classification and receipt-bound cleanup. Authenticated retirement and target-specific cleanup receipts remain separate, and no cleanup alias is exposed. First adoption remains fail-closed until the committed repository profile is installed from the clean canonical checkout with `npm run agentic-os:setup`; provider policy must then converge `delete_branch_on_merge:false` before `land` is eligible.
- Canonical mode requires every registered repository to be clean and exactly equal to its fetched canonical SHA. The port number never selects application or documentation source code.
- A canonical source that declares `pinned_ref_allowed: true` (never the `task_divergence_allowed` application source) may alternatively be checked out at the consumer-pinned dependency revision: the exact 40-character `docs_dependency.ref` read from the frontmatter of the file named by its `pinned_ref_frontmatter` property, accepted only when that pin is an ancestor of the fetched canonical SHA (`git merge-base --is-ancestor`). The satisfied binding is reported in the source identity as `<id>=pin@<sha12>` instead of `<id>=origin/main@<sha12>`; every other requirement (clean worktree, `main` branch, fetch, worktree registry) is unchanged, and unreadable or non-ancestor pins fail closed.
- The centralized Agentic Canvas OS docs entry resolves beside the registered agentic-graph main worktree, even when the command starts in a linked task worktree, and requires its `docs` root. Stale, ahead, divergent, dirty, or missing sources fail closed with the responsible source identity.
- `npm run dev` and `npm run dev:apex` infer task mode when the application checkout is on a contract-valid `agent/<device>/<semantic-scope>` branch. `AG_DEV_SOURCE_MODE` remains an expert override for an explicit canonical or task check. Task mode permits divergence only for the source whose contract declares `task_divergence_allowed: true`; the shared Agentic Canvas OS docs revision remains clean and canonical.
- Normal Vite startup binds `127.0.0.1` with strict port ownership. It must fail when another runtime already owns the requested port instead of opening a second IPv6 `localhost` listener that can route the same browser URL to stale sources or an unavailable local storage proxy.
- Already-running servers retain the SHA they started with. Restart them after `origin/main` advances so the startup gate can validate the new canonical source.

## Checkout-Free Object Publication

- `release:manifest:create` builds a deterministic schema-valid manifest from one exact source commit and its pinned docs contract; `release:manifest:check` binds downloaded bytes to expected app/docs SHAs and a SHA-256 manifest digest.
- `release:publish:immutable` is the only allowed non-current-HEAD publication path. It performs an expected-remote compare-and-set, fast-forward proof, object and pair validation, Git-metadata-only manifest write, exact object push, and remote read-back without switching or editing the checkout.
- The installed pre-push gate runs ordinary checkout integration only for the active branch and validates non-current object refs from their commit trees. The canonical publisher records `repository-owned-object-gate` and invokes its identical object checks before its bounded hook bypass, so an older occupied checkout cannot run unrelated checkout CI.
- The remote Integration Gate remains authoritative. Publication never merges, marks a PR ready, promotes Prod, or deploys Cloudflare.

## Deployment Boundary

- CI never deploys.
- Only a workflow listed in `deployment.allowed_workflows` may contain deployment commands.
- The allowed workflow must use the trigger declared by `deployment.required_trigger`, restricted to `deployment.required_branch`.
- A protected green merge to `main` proves Dev integration only. `turn:end` must converge canonical localhost `main` to that exact fetched revision and emit an `agentic-local-review-candidate/v1` receipt. Before dispatch, the repository-owned evidence producer emits `agentic-graph-production-release-evidence/v1`, with one preservation inventory entry and retained observation for every preserved frontier lane, or zero only when the clean-frontier materializer proves no registered non-canonical worktree remains. It also binds content digests, the last-known-good Pages deployment, publication-mirror revision, and D1 state contract. Candidate creation accepts it only through the lifecycle CLI's `--release-evidence <path>` input. Missing entries, ownership/fence/byte drift, ambiguous dispositions, or predecessor drift blocks candidate preparation; preservation evidence creates no mutation or Production authority.
- The workflow starts only through explicit candidate preparation on protected `main`, revalidates the exact pre-dispatch evidence bytes and local-review receipt, builds once, and loads the neutral lifecycle contract from the exact pinned Agentic Canvas OS checkout. It persists joined Integration, Runtime Review, and Candidate receipts binding the collaboration tuple, source and dependency closure, execution-policy revision, target, artifact, immutable manifest, and rollback identity before pausing at the protected `production` environment.
- Forward deployment requires exactly one authenticated GitHub `User` approval for the `production` environment and the prepared neutral candidate digest. The controller records and immediately consumes the single-candidate Human Authorization receipt before the first forward mutation; missing, bot, ambiguous, expired, replayed, or candidate-drifted approval fails closed. GitHub workflow concurrency serializes the target, while the neutral controller contract coalesces an identical dispatch and fences a competing candidate.
- Provider bootstrap is a separate protected, upgrade-only `workflow_dispatch` boundary. Its read-only plan binds protected source/tree, controller/workflow/Wrangler digests, an expiring owner-held packet containing exact variable/secret names and value digests but no secret bytes, and two identical complete paginated provider inventories. Apply requires `authorize travel-mesh-provider-bootstrap <planDigest>` and journals pending-before-effect. It creates or exactly adopts the two KV, three R2, and actual `airvio` D1 `633355bf-1a52-4085-bd3c-eba4220ff152`; deploys the route-free marketplace against that same D1; installs an unrouted, secret-free 503 MCP shell; deploys the support Workers, commerce, exact MCP replacement, operator, and storage in that order; and proves the exact Workers AI binding/model variables from the active versions before projecting the seven routes, `storage.airvio.co`, and disabled workers.dev/previews for all ten mesh Workers. Competing named targets, incomplete pagination, inventory drift, or non-exact response-loss readback fails closed while preserving legacy resources. Only exact probes permit persistence/readback of the sealed v3 receipt; `TRAVEL_MESH_RELEASE_ENABLED=true` is the final effect.
- The protected workflow owns the complete Production sequence; no local checkout owns an equivalent path. Travel, provider, Access, and runtime credentials exist only in the exact mesh preflight/deploy/rollback step environments, while the Cloudflare mutation token exists only in those and the exact Pages/D1 provider steps; install, build, lifecycle, artifact, smoke, publication, and rollback-source dependency steps receive none of them. Before any forward mutation, it rejects missing, empty, sentinel, sandbox, disabled, or malformed protected travel variables/secrets; validates the separately authorized bootstrap receipt, the Workers AI Free model policy and remote binding, exact KV/R2/D1 resources, routes, and all ten pre-existing Workers; and captures exactly one 100%-serving baseline version plus the complete binding allowlist for every unit. The bootstrap and live preflight must also prove `workers.dev` and preview URLs disabled for all ten Workers through the exact script-subdomain API. Normal release injects all three Commerce providers' exact protected Git source, source-owned storage compatibility revision, and authorized candidate digest through managed upload variables; bootstrap retains the source placeholders so discovery, checkout, and marketplace fail closed until that protected release succeeds. A local Wrangler dry-run must compile each protected ephemeral config, but neither preflight nor validation may provision a Worker/resource, upload a version, set a secret, deploy, or change a route. Shared MCP/storage bindings, including dashboard-managed variables and provider secrets, are preserved as the exact observed baseline union under `--keep-vars`; provider secret inventory, active-version secret inventory, preserved-name digest, and uploaded candidate inventory must agree, while travel-only Workers reject inherited names outside their managed allowlist. MCP media name/R2 pair and tool-list value remain protected inputs, and candidate verification preserves every unmanaged baseline binding byte-for-byte.
- Checkout and marketplace owner routes require distinct protected `CHECKOUT_PROVIDER_AUTH_SECRET` and `MARKETPLACE_PROVIDER_AUTH_SECRET` values. The owner independently recomputes the evidence binding, then verifies `commerce-provider-auth/v1` HMAC-SHA256 over canonical `{schema,contract,requestDigest,bindingDigest}` before returning capabilities or touching provider state. Marketplace transition request identity includes all 12 authoring-permit headers in the Commerce-defined order, so a forged lease epoch, sequence, claim, fence, expiry, target, or digest invalidates the binding and signature before D1 mutation. Runtime evidence remains secret-free; the private travel-commerce release proof signs checkout and marketplace capability probes, and the public operator readiness envelope accepts only the exact evidence shape with no authentication fields.
- After that closed preflight, the workflow deploys the already-built Pages bytes and emits `agentic-deployment-receipt/v1`. Before invoking mesh mutation it publishes fail-closed `mutation_possible` and `preserve_required` intent; only a digest-verified deploy or compensation receipt may append `receipt_sealed=true`, so process death or missing/partial outputs cannot open a terminal lifecycle carrier. It uploads the non-MCP exact-candidate Worker versions with their secrets atomically through `versions upload --secrets-file`, captures and verifies each returned version and binding inventory while those candidates remain inactive, and applies only pre-screened forward-compatible storage D1 migrations with a pre-apply bookmark and post-apply inventory. Activation is marketplace → settlement executor → isolated net settlement → flight discovery → experience discovery → overflow → travel-commerce → MCP → operator gateway → storage. Travel-commerce intentionally precedes MCP at the compatibility seam: commerce remains compatible with the active MCP baseline, while the MCP candidate binds the named `TravelAgencyGuardrailService` entrypoint that exists only in the commerce candidate. The workflow therefore uploads and verifies MCP only after the commerce candidate is serving, then activates MCP; any failure restores the already activated prefix in reverse order. Both inline failure compensation and explicit rollback are accepted only when every exact prior version is serving before and after the same protected MCP, operator, and storage dependency probes; each response body is read incrementally, cancelled above 65,536 bytes, and must expose the exact identity. An unhealthy restored mesh emits a preserve-required failure receipt. The workflow requires those exact readiness paths and response identities before emitting either travel-mesh receipt. It performs bounded direct docs D1 reconciliation/readback and emits `agentic-state-reconciliation-receipt/v1`, then verifies the immutable deployment origin, stable Pages route, and custom domains as separate transports. Exact identity, probe, browser, service-worker, and readiness-marker-byte parity are required for `agentic-live-verification-receipt/v2`.
- Only validated Live Verification v2 opens mirror publication. The workflow publishes the exact generated mirror, emits `agentic-publication-receipt/v2`, and persists the joined chain in `agentic-collaborative-release-lifecycle/v2` with `completion: production-complete`. Loose receipts, legacy lifecycle v1 observations, successful URLs, or a workflow status cannot replace the closed v2 carrier. Any new `main`, source or runtime tree, dependency closure, policy, target, artifact, manifest, receipt link, candidate digest, transport identity, or rebuild invalidates the frontier.
- Schema-map reconciliation must use the clean protected `agentic-graph` source corpus and the exact captured guideline-mirror revision. Dirty or untracked documents in any local checkout are never implicit publication input.
- Before release, the controller idempotently disables Cloudflare Pages Git-triggered production and preview deployments and verifies convergence. It fails closed if ownership cannot converge; verified Direct Upload from `Production Release` is the sole deployment owner.
- The GitHub `production` environment must require an authenticated human reviewer, disable administrator bypass, and restrict deployment to protected branches; credentials remain environment-scoped and least-privilege.
- Prod repositories and Cloudflare resources remain untouched by pull-request CI, local developer commands, pushes, schedules, and repository dispatches. Direct local Pages deployment, D1 reconciliation, production probing, mirror publication, or rollback is forbidden even when credentials are locally available.
- Before mutation, the workflow binds the exact last-known-good Pages deployment, mirror revision, docs D1 state, every travel-mesh serving version, and all resource/binding evidence. A failed authorized pre-publication release stops subsequent mutation and restores every proven active travel candidate to its captured predecessor in reverse activation order independently of Pages rollback eligibility; inactive uploaded versions remain recorded, and forward-compatible storage migrations remain with their bookmark and explicit disposition. Pages and docs D1 then follow their own rollback eligibility and restoration probes. An upload with no unique candidate proof, partial/unknown migration application, provider drift, incomplete version restoration, or any failed compensation is `preserve-required`, never `rolled-back`. Once mirror publication is attempted, both Pages and mesh state are preserved for explicit reconciliation rather than creating a split published/runtime frontier. Only the joined Deployment v1 → Rollback v1 branch may close the v2 carrier as `rolled-back`; partial restore, ambiguous state, mirror movement, or publication on that branch fails closed.
