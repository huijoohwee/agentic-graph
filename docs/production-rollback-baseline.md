---
title: "Recover an expired production rollback receipt"
doc_type: "Process Guide"
status: "active"
lang: "en-US"
frontmatter_contract: "required"
---

# Recover an expired production rollback receipt

Use the existing successful-release recapture when its terminal carrier remains available. When GitHub has expired that artifact, the source-owned command below can capture a **new observed rollback baseline**. It does not reconstruct the lost lifecycle carrier or attest past human presence. The protected release still rechecks Pages, D1, and mirror identities and requires candidate-specific human authorization before mutation.

Run from clean, integrated canonical `agentic-graph` main with the pinned dependencies installed. Use the existing authenticated `gh` and Wrangler sessions. The Pages read adapter requires `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_PAGES_PROJECT`; obtain their values from protected configuration without printing tokens. Set the pinned docs root through `AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT` if it is not a sibling checkout. The mirror checkout must be clean and exact at its remote main.

```sh
node scripts/production-rollback-baseline.mjs \
  --run-id <successful-protected-release-run> \
  --mirror-root /absolute/path/to/huijoohwee \
  --output-dir /absolute/path/to/new-evidence-directory
```

The command performs read-only API, Git, and direct D1 queries. It checks the exact expired terminal artifact metadata, successful protected workflow and deployment attribution, and two strictly ordered, matching Pages/D1/mirror rounds within ten minutes. A historical repository name in immutable deployment metadata must resolve through GitHub to the current repository's numeric ID. An available artifact, failed release, identity drift, incomplete inventory, stale observation, or concurrent source change fails capture. Existing evidence directories are never overwritten.

After completing the implementation lane, materialize the clean release frontier with `rollback-recapture.json` and pass `--source-evidence-ref observed-rollback-baseline=/absolute/path/to/provenance.json`. Retain the entire capture directory with the resulting release evidence. If registered lanes remain, use the existing current-frontier materializer and its preservation inputs. Refresh capture if provider state changes before promotion.

This recovery adds no infrastructure, subscription, paid execution host, or deployment authority. Commerce execution remains on the authenticated local Podman host and is available only while the device and connector run. Reusing this baseline for a free-only release does not establish that every existing account subscription is free; that is a separate account observation. Deployment and live commerce/provider verification remain separate evidence.

Validation: `node --test scripts/__tests__/production-rollback-baseline.test.mjs` exercises successful recovery and rejects failed or unprotected releases, available/missing artifacts, provider drift, chronology errors, malformed identities, and invalid D1 state. Keep the standard integration checks and production release approval unchanged.

## Retained carrier with a maintenance-only mirror successor

When the successful terminal carrier remains available, a direct protected squash commit may have advanced the mirror without changing published artifacts. Use `recapture-successful-release` with its existing two ordered Pages/D1/mirror observation rounds and these additional options:

```sh
--mirror-maintenance repository-metadata-only \
--previous-rollback-recapture /absolute/path/to/previous-recapture.json \
--mirror-repository-root /absolute/path/to/huijoohwee \
--mirror-remote-ref refs/remotes/origin/main \
--mirror-protected-pr /absolute/path/to/merged-pr.json
```

Fetch the mirror's origin first. Obtain the PR facts through authenticated `gh pr view --json number,url,state,baseRefName,headRefName,headRefOid,mergeCommit,mergedAt,statusCheckRollup`. The mirror must be clean and exact at fetched `origin/main`. Its sole parent must equal the retained rollback revision, its tree must equal the reviewed PR head, and the PR must have a successful `Runtime Readiness Gate` before merge.

The native proof admits at most 64 regular-file changes under repository `docs/*.md` and `scripts/*.mjs`, or the root package manifests, validation configuration, and runtime-readiness workflow. Published and retired artifact paths remain excluded. Every other tracked entry, including other applications and unknown paths, must retain its exact mode, object type, and blob identity. Inventory is bounded to 50,000 entries and 16 MiB; evidence includes both tree IDs and an unchanged-tree digest. This mode cannot combine with the historical GameXR exception.

The previous rollback identity must still originate from the terminal publication receipt. Pages and D1 must match that carrier across both fresh rounds; prior recapture and merge chronology remain enforced. This proves a maintenance-only mirror transition, not a new deployment or production approval. The command emits the generated proof in its JSON result; retain that result and the PR observation with release evidence. Focused validation: `node --test scripts/__tests__/production-mirror-maintenance-proof.test.mjs`.

## Removed artifact metadata: exact protected execution evidence

GitHub may delete the terminal artifact metadata as well as its bytes. When the
authenticated run inventory is completely empty, the same capture command can
use the exact successful deployment job from that run and attempt. It requires
the historical release workflow to be byte-identical to the clean integrated
controller, its protected production environment, and ordered successful
publication, terminal seal/validation, rollback capture/validation and pinned
artifact upload steps. The upload must fail on missing files. Truncated,
ambiguous, skipped, failed, changed-source or changed-attempt evidence is rejected.
Both artifact and execution inventories are reobserved after the live rounds.

The output uses `agentic-graph-observed-rollback-baseline/v2`, records the retained
job ID and workflow digest, and labels the artifact `removed`. It invents no
artifact ID, historical receipt or past authorization. Retain
`terminal-persistence-inputs.json` with all capture files. Fresh ordered Pages,
authoritative D1 and exact mirror observations, source stability, source review,
protected release verification and exact human production authorization still
apply. A nonempty inventory uses the original expired-artifact path.

### Implementation join: PRD / TAD / ADR / MVP / GTM

- PRD: unblock an observed rollback baseline after GitHub's one-day retention
  removes both terminal files and metadata, without claiming historical completion.
- TAD: extend the existing capture owner with an I/O-free exact execution verifier;
  preserve two provider rounds and bind retained raw records into provenance.
- ADR: require successful protected execution plus unchanged reviewed workflow
  bytes as evidence of terminal persistence; do not infer it from a run badge alone.
- MVP: focused tests reject drift, truncation, wrong run/attempt/source, failed or
  skipped terminal steps, optional uploads and missing validation. Existing
  expired-artifact and live-state rejection tests remain unchanged.
- GTM: no new service, dependency, paid resource or product-readiness claim. This
  is release recovery plumbing; production delivery remains a separate receipt.

Repair budget: six owner files including CI selection, 20 KiB authored delta, no added dependencies.
Review this authority-controlling source separately before production capture.
