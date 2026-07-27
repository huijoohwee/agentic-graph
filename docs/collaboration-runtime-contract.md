---
title: "Knowgrph Collaboration Runtime Contract"
doc_type: "Runtime Contract"
status: "active"
contract_version: 25
frontmatter_contract: "required"
ci_command_timeout_ms: 300000
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
  mode_environment_variable: "KG_DEV_SOURCE_MODE"
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
    - id: "knowgrph"
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
deployment:
  allowed_workflows: [".github/workflows/release.yml"]
  required_trigger: "push"
  required_branch: "main"
  promotion_policy: "protected-green-main"
  forbidden_triggers: ["pull_request", "workflow_dispatch", "repository_dispatch", "schedule"]
  command_patterns: ["wrangler(?:@[^ ]+)?\\s+pages\\s+deploy(?:\\s|$)", "npm\\s+run\\s+[^\\n]*deploy(?!ed)[^\\s]*(?:\\s|$)"]
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
  surface_policy:
    roots: ["config/surface-registry.json", "config/license-registry.json", "schemas/surface-registry.v1.schema.json", "scripts/surface/", "data/surface/", "docs/discoverability-ip-protection-runtime.md"]
    commands:
      - ["npm", "run", "surface:verify"]
  runtime:
    roots: ["cloudflare/workers/", "contracts/", "ecs/", "mcp/", "web/"]
    commands:
      - ["npm", "run", "runtime:check"]
  documentation:
    roots: ["docs/", "CodeWiki.md", "README.md", "goal.md"]
    commands: []
  collaboration:
    roots: [".github/", ".githooks/", "AGENTS.md", "docs/branch-protection.md", "docs/collaboration-runtime-contract.md", "docs/conflict-resolution.md", "schemas/collaboration-runtime-report.v1.schema.json", "schemas/collaboration-runtime-validation.v1.schema.json", "schemas/immutable-release-manifest.v1.schema.json", "scripts/collaboration-contract.mjs", "scripts/collaboration-runtime-report.mjs", "scripts/immutable-release-manifest.mjs", "scripts/create-immutable-release-manifest.mjs", "scripts/validate-immutable-release-manifest.mjs", "scripts/publish-immutable.mjs", "scripts/run-pre-push-gate.mjs", "scripts/print-collaboration-runtime-report-example.mjs", "scripts/print-collaboration-runtime-report-schema.mjs", "scripts/print-collaboration-runtime-validation-schema.mjs", "scripts/validate-collaboration-runtime-report.mjs", "scripts/validate-collaboration-runtime-validation.mjs", "scripts/runtime-readiness-contract.mjs", "scripts/runtime-docs-workflow-policy.mjs", "scripts/resolve-runtime-docs-dependency.mjs", "scripts/worktree-policy.mjs", "scripts/check-worktree-policy.mjs", "scripts/dev-source-consistency.mjs", "scripts/check-dev-source-consistency.mjs", "scripts/check-collaboration-runtime.mjs", "scripts/check-pre-push-refs.mjs", "scripts/run-affected-ci.mjs", "scripts/__tests__/collaboration-contract.test.mjs", "scripts/__tests__/collaboration-runtime-report.test.mjs", "scripts/__tests__/dev-source-consistency.test.mjs", "scripts/__tests__/immutable-release-manifest.test.mjs", "scripts/__tests__/runtime-readiness-contract.test.mjs", "scripts/__tests__/worktree-policy.test.mjs"]
    commands:
      - ["npm", "run", "test:collaboration-contract"]
fallback_commands:
  - ["npm", "run", "check"]
---

# Knowgrph Collaboration Runtime Contract

## Authority

This opening YAML frontmatter is the machine source of truth for collaboration grammar, local source identity, deployment isolation, and affected-scope CI selection. Runtime scripts parse it directly; workflow files must not duplicate its source registry or path-to-command mapping.

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
- `Integration Gate` generates `knowgrph.immutable-release-manifest/v1` from the exact pull-request head, source tree, pinned Agentic Canvas OS commit, and matching catalog revision; it uploads, downloads, and revalidates the exact bytes and digest before the canonical gate. Individually green repository checks do not replace this pair proof.
- The gate validates this contract, runs source/build conflict compliance, and selects additional commands from `ci_scopes` based on changed paths.
- Dev CI never writes a Prod mirror. Source-to-mirror parity runs after protected `main` integration when the automatic release workflow creates its ephemeral production artifact.
- Commands are arrays rather than shell strings, preventing shell interpolation and keeping execution provider-neutral.
- Every affected-scope command has the canonical bounded timeout; non-terminating checks fail closed instead of freezing the gate.
- Unknown changed paths fail safe through `fallback_commands`.
- Superseded runs on the same pull request are cancelled. Merge-group and protected-main runs use their exact `github.sha` as the concurrency identity, so a delayed older push cannot cancel the required check for a newer protected revision.
- `runtime:check` owns the focused runtime/property suite, including the native `ecs/` core and MCP lifecycle, external invocation-dictionary validation, canonical stage topology, deterministic mock replay, and zero-spend proof.
- `npm run collaboration:contract:check` auto-discovers every workflow that references Agentic Canvas OS and requires dependency installation, the contract resolver, and the checkout in order; checkout repository and immutable ref must come from resolver outputs, never copied workflow YAML. The resolver-owned checkout must fetch full Git history so history-derived proof provenance remains network-free and fail-closed.
- `npm run --silent collaboration:contract:check -- --json` validates against `schemas/collaboration-runtime-report.v1.schema.json` before emitting `knowgrph.collaboration-runtime-report/v1`, including deployment isolation, discovered runtime-docs workflow consumers and checks, pull-request coordination status, and the canonical `sourceRevision`. Integration sets that revision to the pull-request head SHA, or `github.sha` for a push, so a merge-ref checkout cannot obscure which source commit produced the artifact. Local runs derive it from `git rev-parse HEAD`. Integration uploads the report as the seven-day `collaboration-contract-report` artifact, downloads it, and runs `collaboration:report:check -- --json` against the stored file. The resulting machine envelope is uploaded as the separate seven-day `collaboration-validation-result` artifact, downloaded, and revalidated against both its schema and the downloaded report before the canonical gate. The report validator accepts either an artifact path or `-` for UTF-8 JSON from stdin; the optional leading `--json` emits structured success identity on stdout or a structured failure envelope on stderr with a nonzero exit code. Every success envelope carries the report's `sourceRevision` and `reportDigest`, the lowercase SHA-256 of the exact report bytes including whitespace and final newline. Every JSON envelope is validated against `schemas/collaboration-runtime-validation.v1.schema.json` before it is written, so contract drift fails closed.
- `npm run --silent collaboration:report:schema` emits that exact canonical Draft 2020-12 schema through the shared cached loader, so external machine consumers do not need repository-path knowledge or a copied schema.
- `npm run --silent collaboration:report:check-schema` emits the exact canonical Draft 2020-12 validation-envelope schema through the shared cached loader. Both success and failure identify themselves as `knowgrph.collaboration-runtime-validation/v1`; consumers must use this command or the upstream schema rather than copying the envelope or error taxonomy.
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

The visible runtime check lives in MainPanel Settings as the `Cross-device Identity Gate` KTV section. `KnowgrphRuntimeIdentityRuntime`, mounted once at the application root, owns the canonical app-wide identity snapshot; Settings is a read/action projection only. Agentic Canvas OS `/`, `#`, and `@` catalog hydration publishes revision/count, bounded live-provider-proof, and progressive-Agents-readiness facets into that global identity and must never become the identity owner. The docs MCP derives those facets from canonical `LIVE-AGENT-PROVIDER-PROOF.md` and `PROGRESSIVE-AGENTS.md` contracts bound to exact Git revisions; missing, malformed, or revision-mismatched evidence is `unavailable`. MainPanel displays proof usage and ownership plus the source-backed single-agent → tools → specialists progression, unconfigured default Worker, unverified provider execution, and no-external-SDK boundary without issuing or offering a provider call.

Automatic compliance uses the authenticated canvas-room transport with the dedicated global room `runtime-identity:knowgrph:main`. The storage boundary derives an opaque principal from the persistent client installation id only after authenticating the session; the room issues short-lived challenges and relays attestations without building, changing, selecting, or persisting runtime identity. It rejects document/asset traffic, binds one principal/device/runtime identity to each authenticated socket session, and rejects one session changing principals. The application-root reporter reads the canonical identity store, binds a point-in-time snapshot to the room challenge, runtime instance, timestamps, and SHA-256 digest, then every client verifies the relayed evidence locally. MainPanel Settings projects only the resulting transport and parity state. `Copy diagnostic JSON` copies the current identity and gate snapshots as a troubleshooting fallback and is never required compliance evidence.

The automatic gate passes only with at least two distinct authenticated device principals and sessions, live device labels, and runtime instances, valid authenticated relay metadata, an unexpired matching challenge, fresh hydration within attempts zero through two, exact Knowgrph/docs/catalog SHA equality, catalog/docs equality, exact `/`, `#`, and `@` counts, matching verified proof/source revisions, and identical source-bound progressive readiness. It reports `collecting`, `pass`, `mismatch`, `stale`, or `blocked`; duplicate, replayed, expired, malformed, unavailable-proof/readiness, or mismatched evidence fails closed. Branch names remain informational. Reconnect failures are bounded per outage and reset only after a stable connected window. The Durable Object close handler publishes the authenticated peer departure and relies on the compatibility-date-owned automatic close reply; it must not issue a second close against an already-closed hibernation socket. No client, room, verifier, WebMCP tool, or Settings action may select a majority winner, refresh the catalog implicitly, mutate Git, synchronize source, or repeat the provider proof. The read-only browser tool `knowgrph.read_local_runtime_identity` exposes the canonical local identity and current automatic gate snapshot without becoming an owner.

## Local Development Source Identity

- Normal `npm run dev` startup fetches every `local_development.canonical_sources` entry before Vite starts.
- `npm run dev:latest` is the explicit canonical-refresh path. It preflights every canonical source before mutation, requires a clean canonical main worktree, rejects divergent history, applies only `git merge --ff-only` updates there, and then delegates to the unchanged `npm run dev` gate.
- `dev:latest` never stashes, resets, pulls, switches branches, or mutates an owned task branch. If any source cannot update safely, all source fast-forwards are withheld and startup fails with the responsible identity.
- Startup accepts one or more registered worktrees per source repository, while rejecting missing, bare, prunable, or duplicate-branch registrations.
- `npm run worktree:check` exposes that registry policy as a standalone preflight without fetching, changing branches, or starting Dev. `ci:integration` runs it first so the installed pre-push hook and remote Integration Gate reject unsafe registrations before expensive validation.
- `npm run worktree:lifecycle:check` audits session-end state through the pinned Agentic Canvas OS lifecycle owner. It accepts canonical, active, delivery, and parked lanes, while dirty, ambiguous, invalid, or completed residual lanes require attention. `worktree:lifecycle:cleanup -- --worktree=<path>` removes only one clean detached exact-main lane recorded as completed, uses no force, and preserves its branch and commits.
- Canonical mode requires every registered repository to be clean and exactly equal to its fetched canonical SHA. The port number never selects application or documentation source code.
- The centralized Agentic Canvas OS docs entry resolves beside the registered Knowgrph main worktree, even when the command starts in a linked task worktree, and requires its `docs` root. Stale, ahead, divergent, dirty, or missing sources fail closed with the responsible source identity.
- `npm run dev` and `npm run dev:apex` infer task mode when the application checkout is on a contract-valid `agent/<device>/<semantic-scope>` branch. `KG_DEV_SOURCE_MODE` remains an expert override for an explicit canonical or task check. Task mode permits divergence only for the source whose contract declares `task_divergence_allowed: true`; the shared Agentic Canvas OS docs revision remains clean and canonical.
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
- A protected green merge to `main` is standing release authorization. The workflow binds build, deploy, smoke, rollback target, and mirror publication to that exact SHA without a per-run confirmation. Serialized delayed events must still match the current remote `refs/heads/main` immediately before Direct Upload, immediately after deployment, and before mirror publication; stale candidates fail before mutation or trigger the existing exact rollback path.
- Before release, the controller idempotently disables Cloudflare Pages Git-triggered production and preview deployments and verifies convergence. It fails closed if ownership cannot converge; verified Direct Upload from `Production Release` is the sole deployment owner.
- The GitHub `production` environment must have no required human reviewers; credentials remain environment-scoped and least-privilege.
- Prod repositories and Cloudflare resources remain untouched by pull-request CI, local developer commands, schedules, and repository dispatches.
