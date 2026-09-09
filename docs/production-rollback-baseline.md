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
