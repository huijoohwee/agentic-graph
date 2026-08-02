---
title: "Reference implementation: Knowgrph Protected Release Runbook"
id: "md:knowgrph-acos-deploy-runbook"
doc_type: "Release Runbook"
version: "2.0.2"
date: "2026-08-02"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.release.runbook"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "delivery"
universal_scope: false
doc_path: "docs/knowgrph-acos-deploy-runbook.md"
---

# Reference implementation: Knowgrph Protected Release Runbook

## Authority and scope

The only canonical production path is `.github/workflows/release.yml`. It is manually
dispatched for an exact reviewed `main` revision and matching
`agentic-local-review-candidate/v1` JSON. After candidate verification, an authenticated
operator must run the interactive `npm run production:authorize` challenge for the exact
workflow run while its `production` deployment is pending. That command submits the
protected-environment approval with digest-bound terminal evidence; there is no second
browser-approval step, and a browser-only approval is invalid.

This runbook does not authorize a release. It replaces the obsolete AWS Agent API,
AgentCore, and Vercel instructions formerly at this path; those source trees and commands do
not exist in the current product topology.

The protected production workflow currently:

1. verifies the exact protected `main` revision and localhost-review candidate;
2. resolves and pins the Agentic Canvas OS documentation dependency;
3. builds and verifies an immutable Pages/mirror candidate;
4. waits at the protected environment for the candidate-digest-bound interactive terminal
   command to submit its approval evidence;
5. deploys that verified Pages candidate;
6. reconciles canonical documentation into D1;
7. runs live, browser-fidelity, and returning-user service-worker checks;
8. records release receipts;
9. publishes the verified mirror only after live checks pass.

It deploys no Worker and publishes no DNS. Storage, payment, MCP, research, fetch-proxy,
and DNS operations are separate operator capabilities with separate evidence and rollback
requirements.

## Lane model

| Lane | Owner | Permitted action | Promotion evidence |
|---|---|---|---|
| Authoring | scoped task branch and protected integration | edit/test/review source | exact candidate SHA, checks, manifest |
| Mirror | release verify job | build a digest-bound non-public candidate | immutable candidate/digest and parity checks |
| Delivery | protected release job | deploy, verify, publish receipt/mirror | terminal-evidenced environment approval, live checks, rollback target |

| Boundary | From → To | Evidence Reference | Operator instruction reference | Rollback path and check | State |
|---|---|---|---|---|---|
| `KNOWGRPH-AUTHORING-TO-MIRROR` | Authoring → Mirror | `ER-REL-B1`; result not recorded | `OI-REL-B1`: Production dispatch with exact `source_sha` and `local_review_candidate` | discard the candidate; rerun the verify job; compare candidate, manifest, and lifecycle digests | closed |
| `KNOWGRPH-MIRROR-TO-DELIVERY` | Mirror → Delivery | `ER-REL-B2`; result not recorded | `OI-REL-B2`: while the exact run is pending, use the interactive terminal command to submit the protected `production` approval and evidence | follow **Rollback**; rerun live smoke, revision, document-seed, and browser-fidelity checks | closed |

No command from a developer checkout, pull request, or ordinary `main` push opens either
boundary.

### Boundary Evidence References

| Reference | Named check | Recorded result | Surface | Meaning |
|---|---|---|---|---|
| `ER-REL-B1` | `.github/workflows/release.yml` verify job for exact `source_sha` `7f097dbabb7285cf4a18a66a0e37170158b5a610` | run `30738439105` `Verify Release Candidate` passed; local review candidate digest `30b9287241822362c5a591bb35d575ce04529751e324e6c0d9e55f8e8214f9eb`, immutable manifest digest `77f01de7f8235b10f7611e69c8e957c7d27dedc6d8b7a4f5f4a433ce81627ba0`, production candidate digest `a78cbb84bdf56e6cd722b9647f2e623b020ea05725fd73188133e4d8a12ad8cf` | Mirror | this run qualified one immutable candidate for the protected source and docs pair |
| `ER-REL-B2` | `.github/workflows/release.yml` protected deploy and live-verification jobs | run `30738439105` `Human-Authorized Deploy, Verify, And Publish Mirror` passed after terminal authorization; deployed candidate origin `https://b1a0cc37.joohwee.pages.dev`, deployment id `b1a0cc37-01f9-4ff2-aeb6-ce2dc57a7899`, published mirror commit `154fb68b1bab81401f277ece6083200714f6f23f` | Delivery | this run proved one public delivery and publication for the exact authorized candidate |

`OI-REL-B1` and `OI-REL-B2` still describe the only valid operator instructions. For the
latest recorded 2026-08-02 release, those instructions were satisfied only for workflow run
`30738439105`; outside that exact run and candidate pair, both boundaries remain closed.

## Preconditions

Before dispatch:

- the change is integrated into protected `main`;
- `source_sha` is the exact 40-character protected `main` revision reviewed locally;
- `local_review_candidate` is the exact `agentic-local-review-candidate/v1` JSON emitted by
  the collaboration workflow handoff;
- protected integration is green for that revision;
- required repository variables/secrets and production environment reviewers are configured;
- the operator has an authenticated GitHub CLI session;
- the canonical Knowgrph and Agentic Canvas OS checkouts are both clean on `main`, with
  `HEAD` and the already-fetched `origin/main` equal to their candidate-bound revisions;
  the authorization command does not fetch or repair either checkout;
- an operator has reviewed scope, cost, data migration, and rollback impact;
- any separately deployed Worker change has its own operator-approved runbook/evidence.

Do not substitute a branch name, pull-request SHA, mutable tag, or remembered URL for the
exact inputs.

After the verify job publishes its candidate receipts, the workflow summary names the
interactive command:

```bash
npm run production:authorize -- --repository huijoohwee/knowgrph --run-id <workflow-run-id>
```

The command independently downloads and verifies the candidate artifacts, rejects either
canonical checkout unless it is clean `main` at the exact fetched candidate revision,
rechecks canonical runtime state, displays the exact challenge, and accepts only the
generated candidate-bound reply. It then submits the protected-environment approval with the
terminal evidence comment. It cannot run non-interactively. An example reply, a browser-only
approval, or a remembered candidate digest is not authorization for a later run.

## Authoring verification

Use the checks appropriate to the changed owners. The protected integration workflow is the
authority; useful local equivalents include:

```bash
npm run ci:integration
npm run runtime:check
npm run check
npm test
```

Notes:

- `npm run docs:qa` begins with the mutating `docs:update`; inspect its diff before accepting
  generated changes.
- `npm run pages:build-sync` mutates the sibling mirror and is not an ordinary read-only
  verification command.
- direct Pages/Worker deployment commands are not Authoring-lane checks.

## Optional non-deploying runtime gate

`.github/workflows/runtime-gate.yml` is manual and non-deploying.

- It always runs the deterministic `npm run runtime:check`.
- It runs deployed reachability only when both `FRONTEND_URL` and `MCP_ENDPOINT` are supplied
  as workflow inputs or repository variables.
- An optional `STORAGE_WORKER_URL` may be supplied.
- A skipped deployed probe is not positive runtime or delivery evidence.

Record the workflow URL, exact revision, configured endpoints, and result when using it as an
Evidence Reference.

## Production dispatch

In the GitHub Actions UI, open **Production Release** and supply:

| Input | Required value |
|---|---|
| `source_sha` | exact protected `main` commit reviewed on localhost |
| `local_review_candidate` | exact JSON handoff for that same revision |

Review the verify job and wait until the production deployment is pending. Then run the
interactive terminal command above; it is the only valid way to submit this workflow's
protected-environment approval. Do not click a separate browser approval. The authorization
is specific to the candidate and does not authorize later revisions, Workers, or DNS changes.

## Expected protected workflow sequence

### Verify job

Confirm:

- checkout and remote `main` both equal `source_sha`; the workflow repeats the remote-main
  authority check before each mutation and fails if `main` advances;
- external schema/docs/mirror revisions are resolved and recorded;
- the localhost-review candidate validates against the exact source tree;
- build, tests, source checks, mirror parity, and immutable candidate checks pass;
- candidate, lifecycle, manifest, mirror, and docs revision digests are emitted.

Failure here leaves Delivery unchanged.

### Protected deploy job

After the terminal command records the evidence-bearing environment approval, confirm:

- the candidate authorization is revalidated immediately before mutation;
- the exact candidate is deployed to Pages;
- canonical documentation seeding completes;
- live smoke, exact marker/browser fidelity, and returning-user service-worker convergence
  pass;
- live and publication receipts are uploaded;
- the persistent mirror is pushed only after live verification.

## Rollback

The workflow captures the previous Pages deployment identity before mutation. Rollback is
eligible only after the Pages deploy step completes successfully. It does not pre-capture a
separate documentation snapshot. If a later check fails, the rollback path checks out the
prior source revision, resolves that revision's documentation dependency, redeploys the prior
Pages candidate, reseeds documentation from the prior source, and verifies the restored
surface.

Rollback does not revert the persistent `huijoohwee` mirror. If mirror publication succeeds
and a later publication-receipt or artifact-persistence step fails, Pages and D1 may be
restored while mirror `main` still contains the newer revision. That divergence requires
explicit manual reconciliation before another delivery claim.

An operator must verify:

- rollback job result and workflow URL;
- restored deployment revision/URL;
- restored document count/revision;
- post-rollback live smoke result;
- persistent-mirror revision and any required manual reconciliation;
- whether any separately operated Worker or external provider action needs its own rollback.

Never describe a Pages rollback as rolling back storage, payment, MCP Workers, external
models, or financial/provider state.

## Release receipt

Retain:

- `source_sha` and source tree;
- pinned Agentic Canvas OS docs revision;
- immutable manifest/candidate/lifecycle digests;
- protected workflow run and environment approval;
- previous and new deployment identities;
- live verification evidence;
- mirror publication revision;
- rollback result when applicable.

Only this revision-bound evidence may advance the delivered rung.

### 2026-08-02 Recorded Receipt

- Workflow run: `30735517980` (`Production Release`)
- Source revision: `af26f37477cb92e1a8306931262bb25dd4944f00`
- Source tree: `3e7c65dfd91e537008c354f19cc31a9e123abe2b`
- Agentic Canvas OS docs revision: `ba45470e036599d0f42add7236bac1f4a5b03cab`
- Local review candidate digest: `bafe95d8d0bde9ff908acda5e14167faec379445d7cebd9024ea0ef7dab6f5b3`
- Immutable manifest digest: `fcde567a80d33411d27ba440482050a635be978b3d0ef7c549b291671d7e336a`
- Production candidate digest: `14302fd17936483e523a52b472c88b30009bc605c5eb5522a792f916c0a877b6`
- Lifecycle candidate digest: `ce37e17ac99b0f6e116792a2b47b034af6bbedcf0fe460ce9ae172a0b457f512`
- Human authorization decision ref: `https://github.com/huijoohwee/knowgrph/actions/runs/30735517980#environment-production`
- Authorization interaction evidence digest: `6ca1074057d6c3523af9a8a773881fea56af4ea23cea3753219e8978b20ae948`
- Candidate deployment origin: `https://9cd7a7fc.joohwee.pages.dev`
- Candidate deployment id: `9cd7a7fc-869f-4e07-a7d3-fd0616557eb2`
- Published mirror revision: `41043c2ff3bb8b49d0f54850dd2c83f4778cd44f`
- Rollback result: not invoked

## Separate Worker and DNS boundaries

Source includes named deploy scripts for storage, payment, and MCP Workers and a DNS
publication script. Research and fetch-proxy have Worker source/configuration but no named
repository deploy script. Every one of these boundaries remains closed unless an operator
separately supplies:

- exact candidate and environment;
- migration/data-backup plan;
- secret/binding readiness;
- deterministic and deployed VCCs;
- live verification and cost impact;
- rollback command and post-rollback check.

Do not infer any Worker deployment or DNS publication from the static production release.
