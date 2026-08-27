---
title: "AgenticGraph Conflict Resolution"
doc_type: "Process Guide"
status: "active"
lang: "en-US"
frontmatter_contract: "required"
---

# AgenticGraph Conflict Resolution

## Authoring Contract

- The opening YAML frontmatter block remains the first-block machine SSOT for this process guide's metadata, status, and scope.
- This document is a canonical authored operational guide, not a generated registry surface or typed validation fixture.
- Frontmatter stays in plain YAML so the file demonstrates the default authoring path for governance, merge rules, and process contracts.
- If typed `{key, type, value}` envelopes are needed for ingest -> parse -> render validation, that coverage should live in a dedicated fixture doc rather than replacing canonical process prose.
- Conflict-resolution guidance and ownership rules must be derived from parsed frontmatter and document content only, never from file path assumptions or downstream mirrors.

## Overview

- This guide defines how to resolve multiple concurrent updates in `agenticgraph` without creating source-of-truth drift.
- The repository contains four conflict-prone surfaces: runtime source, canonical docs, generated outputs, and cross-repo publish mirrors.
- The default rule is simple: merge at the highest upstream owner, regenerate downstream artifacts, and delete stale parallel paths.
- `docs/collaboration-runtime-contract.md` is the machine SSOT for `/`, `#`, `@` task declarations, affected-scope CI commands, and the manual-only deployment boundary.

## External Advisory Projections

- Apply external Git guidance source-first: `huijoohwee.github.io/scripts/` owns its protected guideline and checker, while AgenticGraph owns this collaboration contract and its executable runtime checks.
- Never copy the external guideline, checker implementation, rule catalog, or fixtures into AgenticGraph.
- When the external guidance and AgenticGraph behavior diverge, fix or clarify the responsible upstream owner and consume the resulting protected revision. Do not add a downstream patch, alias remapping, compatibility shim, or duplicate rule path to hide the disagreement.

---

## Context-Intent-Directive (CID) Framework

### Definition

- **Context**: focus domain of concern
- **Intent**: desired principle or guiding goal
- **Directive**: explicit prohibition or required safeguard

### Sorting

Each mantra and table row stays alphabetized so merge decisions remain easy to scan and reuse.

---

## Three-Beat Mantra Form

- Artifacts; preserve sync fidelity; forbid manual edits in generated publish surfaces
- Authority; resolve from the root; forbid downstream-first conflict fixes
- Contracts; keep one canonical contract; forbid duplicate authority across repos
- Docs; update canonical files first; forbid mirror-first changes
- Generators; fix emission logic once; forbid repeated patching of emitted outputs
- Ownership; assign one path per concern; forbid overlapping edit authority
- Publish; sync from source; forbid hand-maintained deploy mirrors
- Redirects; derive routes from sync logic; forbid direct copied-route edits
- Scope; merge one concern at a time; forbid mixed conflict batches
- Validation; verify focused diffs; forbid untested merge resolutions

---

## Context-Intent-Directive Table

| Context | Intent | Directive |
|---|---|---|
| Artifacts | Preserve sync fidelity | - [ ] Rebuild synced artifacts after upstream merges; preserve sync fidelity; forbid manual edits in generated publish surfaces |
| Authority | Resolve from the root | - [ ] Merge conflicts in the highest upstream owner; resolve from the root; forbid downstream-first conflict fixes |
| Contracts | Keep one canonical contract | - [ ] Update the canonical contract before mirrors; preserve one authority; forbid duplicate contract ownership across repos |
| Docs | Update canonical files first | - [ ] Edit `agenticgraph/docs/**` before schema mirrors unless a directive states otherwise; keep docs canonical; forbid mirror-first changes |
| Generators | Fix emission logic once | - [ ] Patch generators or source inputs once and rerun them; remove duplicate edits; forbid repeated patching of emitted outputs |
| Ownership | Assign one path per concern | - [ ] Declare one owner for runtime, docs, schema, and publish surfaces; maintain accountability; forbid overlapping edit authority |
| Publish | Sync from source | - [ ] Treat publish mirrors as outputs from source workflows; preserve deploy integrity; forbid hand-maintained deploy mirrors |
| Redirects | Derive routes from sync logic | - [ ] Update redirects through sync code and rerun the sync workflow; preserve determinism; forbid direct copied-route edits |
| Scope | Merge one concern at a time | - [ ] Keep one directive or tightly related concern per merge; maintain MECE scope; forbid mixed conflict batches |
| Validation | Verify focused diffs | - [ ] Run focused build, sync, lint, or test commands after conflict resolution; confirm correctness; forbid untested merge resolutions |

---

## Ownership Matrix

| Surface | Owner | Typical Files | Conflict Rule |
|---|---|---|---|
| Runtime source | Upstream application code | `agenticgraph/canvas/src/**` | Merge source logic first, then validate runtime behavior |
| Canonical docs | Upstream documentation | `agentic-canvas-os/docs/TODO.md`, `agentic-canvas-os/todo/**`, `agenticgraph/docs/**`, `agenticgraph/README.md` | Merge canonical wording first, append the planning row, then update any mirrors or generated derivatives |
| Generators and sync logic | Upstream automation | `agenticgraph/scripts/**`, `agenticgraph/canvas/src/cli/**`, generator inputs | Fix the generator or its input, then rerun the workflow |
| Schema mirrors | Downstream documentation mirror | `huijoohwee.github.io/schema/AgenticRAG/**` | Update only after the canonical owner is aligned |
| Publish mirrors | Downstream deploy surface | `huijoohwee/content/agenticgraph/**`, managed route files in `huijoohwee/knowgrph/**` | Never hand-merge; rebuild and resync from `agenticgraph` |

---

## Merge Order

1. Fetch `origin`, preserve one clean registered `main` runtime worktree, and create each `agent/<device>/<semantic-scope>` from `origin/main` in its own detached registered task worktree.
2. Declare one action, semantic scope, actor, and exact `origin/main` base SHA in pull-request frontmatter.
3. Classify each conflicting file as `runtime-source`, `canonical-doc`, `generator`, `schema-mirror`, or `publish-mirror`.
4. Stop parallel implementation when another active change owns the same semantic scope; serialize or explicitly hand over ownership.
5. Merge the upstream owner first and decide the intended behavior there.
6. Remove stale duplicate paths, legacy routes, or parallel copy instead of preserving both sides.
7. Regenerate emitted docs, redirects, or publish assets from the merged upstream state.
8. Run the affected checks selected from the collaboration runtime contract.
9. Review downstream mirrors for parity and confirm no manual hotfixes remain.

---

## Path Rules

### Runtime Source

- Resolve runtime behavior conflicts in `agenticgraph/canvas/src/**`.
- Keep one implementation path for each concern.
- Remove stale helpers, remaps, aliases, and duplicate UI branches introduced by parallel work.

### Canonical Docs

- Resolve planning conflicts in `agentic-canvas-os/docs/TODO.md` and the active `agentic-canvas-os/todo/YYYY-MM.md` shard; resolve AgenticGraph documentation conflicts in `agenticgraph/docs/**` or other explicitly named canonical files.
- Treat downstream schema and publish copies as mirrors unless a directive row explicitly assigns ownership elsewhere.
- Preserve one canonical statement of a contract, then propagate it.

### Generators And Sync Logic

- Resolve conflicts in generator inputs or scripts before touching their outputs.
- For published `agenticgraph` assets, use `scripts/sync-pages-agenticgraph.mjs` as the route and artifact authority.
- Do not repair generated routes or copied assets directly if the sync workflow can reproduce them.

### Schema Mirrors

- Update `huijoohwee.github.io/schema/AgenticRAG/**` only after the canonical source is merged.
- Keep mirror wording aligned with the canonical contract.
- Remove duplicate schema wording if the same rule is defined upstream.

### Publish Mirrors

- Treat `huijoohwee/content/agenticgraph/**` as the primary Prod artifact mirror and managed `huijoohwee/knowgrph/**` route files as generated deploy artifacts.
- Rebuild and resync them from `agenticgraph` after upstream changes.
- Reject manual conflict resolutions inside copied assets unless the sync workflow itself is broken.

---

## Command Checklist

### End-To-End Compliance

```bash
npm run conflict:check
npm run conflict:source
```

GitHub Actions runs `npm run ci:integration` through the single `Integration Gate` status on pull requests and pushes to `main`.
Local Git enforcement routes active-branch pushes through checkout integration and non-current refs through the immutable object gate in `.githooks/pre-push`. The hook installs automatically during `npm install` via `npm run hooks:install`. Manual `--no-verify` is forbidden; when another task owns the checkout, use `npm run release:publish:immutable -- ...`, which records its bounded repository-owned object gate and leaves the worktree untouched.
For server-side merge gating, see `docs/branch-protection.md`.

### Collaboration Runtime

```bash
npm run worktree:check
npm run worktree:lifecycle:check
npm run collaboration:contract:check
npm run ci:affected
npm run ci:integration
npm run release:manifest:create -- --source-sha <sha> --target-ref refs/heads/agent/<device>/<scope> --output <path>
npm run release:manifest:check -- <path> --source-sha <sha> --docs-sha <sha>
```

- `worktree:check` validates the contract's canonical source registry without fetching or starting Dev; `ci:integration` runs it first and the pre-push hook inherits the same fast failure.
- `collaboration:contract:check` parses canonical frontmatter, validates branch/base/scope ownership in CI, rejects deployment commands outside the manual release workflow, and auto-discovers Agentic Canvas OS workflow consumers to enforce contract-derived checkout inputs.
- `npm run --silent collaboration:contract:check -- --json` validates against the canonical v1 JSON Schema before emitting the report; the report binds itself to a lowercase 40-hex `sourceRevision`, using the explicit pull-request head SHA in CI and repository `HEAD` locally. Integration uploads and downloads `collaboration-contract-report`, captures its machine validation as the separate `collaboration-validation-result` artifact, then downloads and revalidates that envelope against the exact report and expected CI revision before the canonical gate. The report validator accepts an artifact path or `-` for UTF-8 JSON from stdin, plus an optional leading `--json` for structured success on stdout and structured failure on stderr. Every success result carries the report's `sourceRevision` and the lowercase SHA-256 `reportDigest` of its exact bytes; every JSON result is validated against the canonical validation-envelope schema before emission and fails closed on contract drift.
- `npm run --silent collaboration:report:schema` emits the canonical schema through the same loader used by report validation; consumers must use the command or upstream file and must not maintain copied schema definitions.
- `npm run --silent collaboration:report:check-schema` emits the canonical Draft 2020-12 success/failure envelope schema through the same shared loader; consumers must not copy its envelope or stable error-code taxonomy.
- `npm run --silent collaboration:report:check-result -- <validation.json|-> [--report <report.json>] [--source-revision <40-hex-sha>]` validates a stored success or failure envelope from a path or stdin; `--report` proves exact-byte digest and source-revision pairing for success results, while `--source-revision` requires that report and prevents cross-commit replay by comparing the pair with the expected CI head SHA. The command returns human confirmation plus exit status without creating a recursive JSON envelope.
- `npm run --silent collaboration:report:example` emits a current schema-valid local report through the canonical checker with pull-request context disabled; consumers must use it instead of maintaining copied example fixtures.
- `npm run --silent collaboration:report:example | npm run --silent collaboration:report:check -- -` is the canonical external-consumer smoke path and must remain shell-agnostic on either side of the pipe.
- `npm run --silent collaboration:report:example | npm run --silent collaboration:report:check -- --json -` emits machine-readable `agenticgraph.collaboration-runtime-validation/v1` identity; failures retain a nonzero exit code and emit stable error codes instead of a Node stack trace. Automation must use this mode instead of parsing human output.
- `ci:affected` derives focused commands from the canonical `ci_scopes` map rather than duplicating path rules in workflow YAML.
- `ci:integration` composes contract, source/build conflict, and affected-scope validation behind one stable merge status without mutating or requiring Prod.
- `conflict:check` remains the end-to-end source-plus-mirror parity check used after release sync.

### Pages And Publish

```bash
npm run pages:check-sync
```

To rebuild and then sync:

```bash
npm run pages:build-sync
```

Building and syncing is not deployment authorization. Remote migration and deployment commands must run only through an explicitly authorized release operation.

### Docs And Schema

```bash
npm run docs:update
```

Or, when broader validation is needed:

```bash
npm run docs:qa
```

### Runtime Validation

```bash
npm run lint
npm run check
npm test
```

Use focused tests when only one subsystem changed.

`npm run conflict:check` bundles changed-file hygiene budgets, semantic-key helper enforcement, Pages chunk budgets, the publish sync drift check, merge-marker scan, and the sibling `AgenticRAG` schema map check when that repo is available.

Use `npm run hygiene:audit` before broad refactors to list all current source-budget debt. New source files must stay under 600 lines and 500 KiB; existing over-budget files must not grow while they are being split. Generated archives, dependency output, and published preview data stay outside the day-to-day gate.

---

## Conflict Patterns

### Pattern: Source vs Generated Output

- Keep the source-side change.
- Regenerate the output.
- Remove hand edits from generated files.

### Pattern: Canonical Doc vs Schema Mirror

- Keep the canonical doc as the first merge point.
- Update the schema mirror after the canonical language settles.
- Delete duplicate or contradictory wording in the mirror.

### Pattern: Parallel Runtime Refactors

- Keep the path that preserves SSOT, simpler ownership, and fewer branches.
- Inline or remove duplicate logic rather than maintaining both implementations.
- Reject alias remaps that only hide unresolved duplication.

### Pattern: Publish Mirror Drift

- Keep the upstream `agenticgraph` source.
- Rerun the publish sync workflow.
- Treat any remaining diff in the publish repo as a signal that sync logic or inputs still need correction.

---

## Validation Checklist

- [ ] Every conflicting file has an identified owner surface
- [ ] Pull-request frontmatter declares one `/` action, `#` semantic scope, `@` actor, and exact base SHA
- [ ] The task branch identifies one device and matches the declared semantic scope
- [ ] Each source repository has one canonical main worktree and only registered branch-exclusive task worktrees
- [ ] Completed task worktrees are lifecycle-cleaned without force while active, delivery, and parked lanes are retained
- [ ] No other active change owns the same semantic scope
- [ ] A cross-device handoff stopped the sender before the receiver resumed the exact pushed commit
- [ ] No generated or publish mirror file was hand-merged without fixing the upstream source
- [ ] No stale duplicate path, alias, or compatibility branch remains
- [ ] The correct sync or validation command was run for the affected surface
- [ ] Downstream mirrors match the regenerated upstream state
- [ ] Unrelated local worktree changes were preserved
- [ ] No deployment, remote migration, or Prod mutation occurred during CI or conflict resolution

---

## Role-Action-Outcome

- **Role: Maintainer**  
-> Action: classifies conflicts by ownership and merge surface  
-> Outcome: keeps every resolution anchored to one authoritative path

- **Role: Developer**  
-> Action: merges upstream behavior, removes stale paths, and reruns generators or sync workflows  
-> Outcome: delivers one coherent implementation without downstream drift

- **Role: Documentation Owner**  
-> Action: resolves canonical doc conflicts before schema mirror updates  
-> Outcome: preserves one contract source across repos

- **Role: Validator**  
-> Action: runs focused checks and confirms publish or schema parity after regeneration  
-> Outcome: verifies that the merged state is correct, reproducible, and drift-free

---

## Mantra Application

**"CID frames agenticgraph merge rules, SRP isolates path ownership, RAO aligns resolution steps, SVO clarifies validation."**

- **CID frames**: identifies the merge surface, the intended governance rule, and the forbidden shortcut.
- **SRP isolates**: keeps one owner per concern so fixes happen once in the correct upstream path.
- **RAO aligns**: maps maintainers, developers, documentation owners, and validators to explicit actions.
- **SVO clarifies**: makes every resolution step direct, testable, and reviewable.
