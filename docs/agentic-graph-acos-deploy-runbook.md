---
title: "Reference implementation: agentic-graph Protected Release Runbook"
id: "md:agentic-graph-acos-deploy-runbook"
doc_type: "Release Runbook"
version: "2.2.0"
date: "2026-08-29"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.release.runbook"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "delivery"
universal_scope: false
doc_path: "docs/agentic-graph-acos-deploy-runbook.md"
---

# Reference implementation: agentic-graph Protected Release Runbook

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

If protected `main` advances after a verify job seals a candidate but before the protected
`production` approval is submitted or consumed, that waiting run is stale. Retire it, refresh
the clean canonical `main` checkouts to the new exact fetched revision, reseal a fresh
localhost-review candidate, and dispatch a new verify job. Do not authorize, resume, or deploy
the older run after the newer protected revision exists.

The protected production workflow currently:

1. verifies a pre-dispatch, content-addressed release-evidence bundle covering every preserved
   frontier lane and the exact last-known-good Pages deployment, publication-mirror revision, and D1 state
   contract;
2. verifies the exact protected `main` revision and localhost-review candidate;
3. resolves and pins the Agentic Canvas OS documentation dependency;
4. builds and verifies an immutable Pages/mirror candidate;
5. waits at the protected environment for the candidate-digest-bound interactive terminal
   command to submit its approval evidence;
6. owns the complete ordered Production mutation: Pages Direct Upload, direct D1 reconciliation,
   immutable/stable/custom transport probes, and mirror publication;
7. emits Deployment v1, State Reconciliation v1, Live Verification v2, and Publication v2
   receipts in that order; and
8. closes `agentic-collaborative-release-lifecycle/v2` as the only authoritative terminal carrier.

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
| `AGENTIC-GRAPH-AUTHORING-TO-MIRROR` | Authoring → Mirror | `ER-REL-B1`; result not recorded | `OI-REL-B1`: Production dispatch with exact `source_sha` and `local_review_candidate` | discard the candidate; rerun the verify job; compare candidate, manifest, and lifecycle digests | closed |
| `AGENTIC-GRAPH-MIRROR-TO-DELIVERY` | Mirror → Delivery | `ER-REL-B2`; result not recorded | `OI-REL-B2`: while the exact run is pending, use the interactive terminal command to submit the protected `production` approval and evidence | follow **Rollback**; rerun live smoke, revision, document-seed, and browser-fidelity checks | closed |

No command from a developer checkout, pull request, or ordinary `main` push opens either
boundary.

### Boundary Evidence References

| Reference | Named check | Recorded result | Surface | Meaning |
|---|---|---|---|---|
| `ER-REL-B1` | `.github/workflows/release.yml` verify job for exact `source_sha` `0ecd4deb5ee0ad92e561c4143c03995e4d867a8a` | run `31795886758` `Verify Release Candidate` passed; local review candidate digest `c79a7914c081af8a71788775016b10a80dbb30647597dad6f0e4eeb21ce3236f`, immutable manifest digest `5abe443adec86ed395d0910597928b85371fd7e2d4a68a7a96bd9cb0f79f9ff3`, production candidate digest `a045cbc4a0d80db175a20470f74e7c9ee5db45f84f8700768c9f2e5b510de4ee` | Mirror | this run qualified one immutable candidate for the protected source revision `0ecd4deb5ee0ad92e561c4143c03995e4d867a8a` and Agentic Canvas OS docs revision `db8c6bc86ff2261916129c0d9bffe11b3384b715` |
| `ER-REL-B2` | `.github/workflows/release.yml` protected deploy and live-verification jobs | run `31795886758` `Human-Authorized Deploy, Verify, And Publish Mirror` passed after terminal authorization; deployed candidate origin `https://20a0deac.joohwee.pages.dev`, published mirror revision `b764edc1ba7bae6663695d84a0e5185fee293dbf`, public route `https://airvio.co/agentic-graph/` passed, and the canonical rollback and release receipts were promoted to `.release-receipts/2026-08-14/current-production-rollback-recapture.json` and `.release-receipts/2026-08-14/production-release-evidence-0ecd4deb5ee0ad92e561c4143c03995e4d867a8a.json` | Delivery | this run proved one public delivery, D1 reconciliation, live verification, and mirror publication for the exact authorized candidate |

`OI-REL-B1` and `OI-REL-B2` still describe the only valid operator instructions. For the
latest recorded 2026-08-14 release, those instructions were satisfied only for workflow run
`31795886758`; outside that exact run and candidate pair, both boundaries remain closed.

The canonical local receipt set for that release is:

- `.release-receipts/2026-08-14/current-production-rollback-identity-digest.txt`
- `.release-receipts/2026-08-14/current-production-rollback-recapture.json`
- `.release-receipts/2026-08-14/production-release-evidence-0ecd4deb5ee0ad92e561c4143c03995e4d867a8a.json`

## Preconditions

Before dispatch:

- the change is integrated into protected `main`;
- `source_sha` is the exact 40-character protected `main` revision reviewed locally;
- `local_review_candidate` is the exact `agentic-local-review-candidate/v1` JSON emitted by
  the collaboration workflow handoff;
- protected integration is green for that revision;
- required repository variables/secrets and production environment reviewers are configured;
- the operator has an authenticated GitHub CLI session;
- the canonical agentic-graph and Agentic Canvas OS checkouts are both clean on `main`, with
  `HEAD` and the already-fetched `origin/main` equal to their candidate-bound revisions;
  the authorization command does not fetch or repair either checkout;
- an operator has reviewed scope, cost, data migration, and rollback impact;
- any separately deployed Worker change has its own operator-approved runbook/evidence.
- a repository-owned pre-dispatch evidence producer has content-addressed every preserved lane in
  the exact frontier and captured the exact last-known-good Pages deployment identity, publication
  mirror revision, and D1 state contract; the protected workflow must receive and revalidate those
  exact bytes rather than rediscovering or accepting a verbal summary.

Use `release:lifecycle:receipts -- materialize-clean-frontier-evidence` only when canonical
`main` is the sole registered worktree. When one or more separately owned, attributed lanes must
remain registered, use `materialize-current-frontier-evidence` with the clean remote-exact Agentic
Canvas OS controller root. The current-frontier adapter double-reads lane and lease state, binds
each retained lane's exact revision, tree, work set, task identity, and recovery handle, and rejects
canonical drift, ambiguous ownership, invalid lanes, or any state movement during capture. It
preserves those lanes; it grants no authoring, integration, cleanup, or deployment authority to
the release operator.

Do not substitute a branch name, pull-request SHA, mutable tag, or remembered URL for the
exact inputs.

After the verify job publishes its candidate receipts, the workflow summary names the
interactive command:

```bash
npm run production:authorize -- --repository huijoohwee/agentic-graph --run-id <workflow-run-id>
```

The command independently downloads and verifies the candidate artifacts, rejects either
canonical checkout unless it is clean `main` at the exact fetched candidate revision,
rechecks canonical runtime state, displays the exact challenge, and accepts only the
generated candidate-bound reply. From prompt preparation through reply acceptance, the
agentic-graph canonical release-owner checkout must remain the same clean `main` checkout at that
exact reviewed revision; a local branch flip, repurposed root checkout, or local-ref drift
fails closed and requires a fresh revalidation. Terminal automation must also follow the
repository-owned sequential handshake: capture the printed exact `authorize ...` reply,
wait for the live `>` prompt, and only then submit that exact captured reply. It then
submits the protected-environment approval with the terminal evidence comment. It cannot run
non-interactively. An example reply, a browser-only approval, or a remembered candidate
digest is not authorization for a later run.

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
| `release_evidence` | exact `agentic-graph-production-release-evidence/v1` JSON for that revision and preserved frontier |

Review the verify job and wait until the production deployment is pending. Then run the
interactive terminal command above; it is the only valid way to submit this workflow's
protected-environment approval. Do not click a separate browser approval. The authorization
is specific to the candidate and does not authorize later revisions, Workers, or DNS changes.
If a newer protected `main` revision or newer candidate run appears while this run is waiting,
stop and retire the waiting run instead of authorizing it.

## Expected protected workflow sequence

### Pre-dispatch release evidence

Before `workflow_dispatch`, create one immutable `agentic-graph-production-release-evidence/v1` object
from read-only observations. Its inventory has one entry for every preserved lane in the exact
frontier, including zero entries only when the canonical clean-frontier materializer proves no
registered non-canonical worktree remains. Each preserved lane is bound to its worktree/branch,
owner and disposition, fence or head, cleanliness, content digest, and recovery handle. The same object binds the exact
last-known-good Pages deployment identifier and immutable origin, the last published mirror
revision, and the direct D1 state contract needed to prove or disposition restoration. Hash the
canonical bytes and dispatch that content address with the protected-main inputs.

Candidate creation consumes that file through the repository-owned lifecycle CLI, including
`npm run release:lifecycle:receipts -- create --release-evidence <path> ...`; do not translate it
into flags or copy selected fields. The normalized receipt retains the inventory, observations,
capture adapter/times, source evidence references, and the inventory, protected-tip,
convergence-base, and successor-write-set digests.

The evidence object is preservation and rollback input only. It grants no source-write, merge,
Production, Cloudflare, D1, mirror, or cleanup authority. A missing lane, changed byte, changed
head/fence, ambiguous disposition, unresolved last-known-good identity, or digest mismatch stops
before candidate preparation. Never recreate the object after dispatch to make a changed workspace
fit a waiting run; produce a new object and candidate instead.

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
- no newer protected `main` revision or replacement candidate has superseded the waiting run;
- the exact candidate is deployed to Pages and produces
  `agentic-deployment-receipt/v1`;
- canonical documentation is reconciled through direct D1 operations and authoritative readback,
  producing `agentic-state-reconciliation-receipt/v1`;
- immutable candidate-origin probes run first, the stable `joohwee.pages.dev` route runs as a
  distinct Pages transport, and `airvio.co` plus `airvio.co/agentic-graph` run as custom-domain
  transports; readiness-marker bytes, identities, browser fidelity, and returning-user
  service-worker convergence must agree before `agentic-live-verification-receipt/v2` exists;
- the persistent mirror is pushed only after live v2 validation and produces
  `agentic-publication-receipt/v2`; and
- the workflow validates and persists the closed
  `agentic-collaborative-release-lifecycle/v2` carrier with terminal state
  `production-complete`.

Immutable, stable, and custom transports are not aliases. The immutable deployment origin binds
the uploaded artifact; the stable Pages route tests platform routing to that release; the custom
domains test public DNS, routing, policy, caching, and application ownership. Success on one cannot
substitute for another, and CI must never silently retarget an immutable-origin assertion to a
stable or custom URL.

### Successful-release rollback recapture

A `production-complete` terminal carrier proves the completed release but does not by itself make
that release the next rollback target. After publication, a protected evidence environment must
capture two ordered, substantively identical read-only observation rounds for the current Pages
deployment, direct-authoritative D1 state, and publication mirror. Then assemble the existing
`agentic-graph-production-rollback-identity/v1` and
`agentic-graph-production-rollback-recapture/v1` artifacts with:

```bash
ASSEMBLED_AT="$(node -e 'process.stdout.write(new Date().toISOString())')"
npm run --silent release:lifecycle:receipts -- recapture-successful-release \
  --docs-root "$ACOS/docs" \
  --docs-sha "$(git -C "$ACOS" rev-parse HEAD)" \
  --carrier "$CARRIER" \
  --first-pages-observation "$ROUND_ONE/pages.json" \
  --first-state-evidence "$ROUND_ONE/state.json" \
  --first-mirror-observation "$ROUND_ONE/mirror.json" \
  --second-pages-observation "$ROUND_TWO/pages.json" \
  --second-state-evidence "$ROUND_TWO/state.json" \
  --second-mirror-observation "$ROUND_TWO/mirror.json" \
  --assembled-at "$ASSEMBLED_AT" \
  --output "$RECEIPTS/current-production-rollback-recapture.json" \
  --digest-output "$RECEIPTS/current-production-rollback-identity-digest.txt"
```

The Pages and D1 observations remain credential-scoped protected evidence operations; developer
checkouts must not use this step to query or mutate Production. The mirror observation is a
read-only exact-head comparison and can be captured without GitHub Actions output. Capture each
round in Pages -> D1 -> mirror order:

```bash
mkdir -p "$ROUND_ONE"
node scripts/verify-production-release-transports.mjs pages \
  --mode current \
  --evidence-dir "$ROUND_ONE" \
  --output "$ROUND_ONE/pages.json"
npm run --silent storage:d1:seed:docs -- \
  --capture-state \
  --evidence-output "$ROUND_ONE/state.json"
node scripts/verify-production-release-transports.mjs mirror \
  --repository-root "$MIRROR" \
  --repository huijoohwee/huijoohwee \
  --output "$ROUND_ONE/mirror.json"
```

Repeat the same ordered observation sequence into `$ROUND_TWO`, then derive `ASSEMBLED_AT` only
after the second mirror observation. The assembler rejects a rolled-back or
incomplete carrier, observation drift, out-of-order capture times, or any Pages, D1, mirror,
publication, or integrated-source join mismatch. Output creation is replay-safe: identical bytes
may be replayed, while an existing different output fails closed. Add `--github-output` only in a
GitHub Actions step that needs `rollback_recapture_path` and `rollback_target_digest`; local use
does not require `GITHUB_OUTPUT`.

This command is evidence-only. It grants no deployment, D1 write, publication, source, or cleanup
authority. The resulting recapture bytes and identity digest must be content-bound into the next
`agentic-graph-production-release-evidence/v1`; never reuse the predecessor release-evidence object
as the successful release's rollback identity.

If the last successful agentic-graph publication is still current in Pages and D1 but the shared
publication mirror has advanced through a disjoint, protected whole-artifact GameXR merge, use the
closed canonical-descendant branch of the same command. All six additional arguments are required
together:

```bash
gh pr view 54 --repo huijoohwee/huijoohwee \
  --json number,state,mergedAt,mergeCommit,headRefOid,baseRefName,headRefName,url \
  > "$RECEIPTS/mirror-protected-pr.json"

npm run --silent release:lifecycle:receipts -- recapture-successful-release \
  --docs-root "$ACOS/docs" \
  --docs-sha "$(git -C "$ACOS" rev-parse HEAD)" \
  --carrier "$CARRIER" \
  --first-pages-observation "$ROUND_ONE/pages.json" \
  --first-state-evidence "$ROUND_ONE/state.json" \
  --first-mirror-observation "$ROUND_ONE/mirror.json" \
  --second-pages-observation "$ROUND_TWO/pages.json" \
  --second-state-evidence "$ROUND_TWO/state.json" \
  --second-mirror-observation "$ROUND_TWO/mirror.json" \
  --assembled-at "$ASSEMBLED_AT" \
  --output "$RECEIPTS/current-production-rollback-recapture.json" \
  --digest-output "$RECEIPTS/current-production-rollback-identity-digest.txt" \
  --previous-rollback-recapture "$PREVIOUS_ROLLBACK_RECAPTURE" \
  --mirror-repository-root "$MIRROR" \
  --mirror-remote-ref refs/remotes/origin/main \
  --mirror-protected-pr "$RECEIPTS/mirror-protected-pr.json" \
  --gamexr-source-sha 718298dec9928f30bd24e349a7527aba2c85bfb1 \
  --gamexr-artifact-digest aa11a21680b1b16951912cc6b2e544127fc7d4a1e4738228686357657bd1e62e
```

This branch does not relax normal exact-publication recapture. It first proves that the previous
recapture is the terminal carrier's exact Pages/D1/publication identity. It then requires a clean
mirror checkout whose `HEAD` equals the named remote ref; verifies the previous mirror revision is
the direct parent of the current protected-squash merge; matches the reviewed PR head tree to that
merge tree; inventories the revision delta with NUL-delimited
`git diff --no-renames --name-only -z`; rejects every agentic-graph-managed, deletion-contract, or
non-GameXR path; and recomputes every byte, file digest, and aggregate digest in the whole
`content/gamexr` release manifest. The two fresh Pages -> D1 -> mirror rounds remain mandatory and
must agree substantively. For the protected PR 54 transition from
`12884a1fc526e3366f6b858240fda1892b7c4fa3` to
`1e184aed1f638c07ed7fdaa67e610c23e5eb09b6`, the resulting substantive rollback identity digest is
`2e714eca595277273f6516729946d95b9dba63321325b83aa005b6bfc61dd87a`.

## Rollback

The pre-dispatch evidence binds the exact last-known-good Pages deployment, mirror revision, and D1
state contract before any Production mutation. Rollback is eligible only after this controller proves
the exact Pages mutation, including a deploy process that exits nonzero after the provider commits it.
If a later stage fails, stop forward mutation; restore only the bound last-known-good Pages target,
make the D1 state disposition explicit, rerun the required restoration probes, and emit
`agentic-rollback-receipt/v1`. A terminal D1 restore requires the same substantive direct-readback
identity and zero graph snapshots; its monotonic document revision counter is intentionally excluded
because an exact content replay advances it. A Pages rollback does not imply that D1 reverted.

Rollback must leave the last-known-good `huijoohwee` mirror revision unchanged. Publication cannot
begin before Live Verification v2, and a forward run is not complete until Publication v2 is joined
into the terminal carrier. A partial restore, changed mirror, ambiguous D1 disposition, failed
restoration probe, or malformed predecessor chain is non-terminal and fails closed; it cannot be
reported as either `production-complete` or `rolled-back`.

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

The authoritative terminal artifact is `collaborative-release-lifecycle-v2.json`, whose schema is
`agentic-collaborative-release-lifecycle/v2`. A loose receipt file, workflow success badge, Pages
URL, D1 count, mirror commit, or legacy lifecycle v1 observation is not a terminal release claim.
Production completion requires the exact Deployment v1 → State Reconciliation v1 → Live
Verification v2 → Publication v2 chain; recovery requires the exact Deployment v1 → Rollback v1
branch and forbids publication.

The protected run retains `previous-pages-project-api.json`,
`previous-pages-deployment-api.json`, `previous-pages-runtime-readiness.json`, and
`previous-d1-state-evidence.json` before mutation; `candidate-pages-deployment.json`,
`d1-reconciliation-evidence.json`, and transport/probe evidence during delivery; then
`deployment-receipt.json`, `state-reconciliation-receipt.json`,
`live-verification-receipt-v2.json`, `publication-receipt-v2.json`, and the terminal carrier.

## Prohibited local production paths

Do not run `wrangler pages deploy`, `pages:deploy-cloudflare`,
`pages:build-sync-cloudflare`, `workers:deploy`, `storage:deploy`, direct D1 mutation, or a mirror
push from a developer or canonical checkout as a substitute for this workflow. Local commands may
build or validate within their documented non-mutating mode, but only the protected
`.github/workflows/release.yml` controller owns Pages, release-scoped D1 reconciliation, production
probes, mirror publication, rollback, and terminal-carrier persistence.

### 2026-08-02 Latest Recorded Receipt

- Earlier recovery dispatch: run `30771075357` for source revision `32d2cfca34f7d5bf484b4a8f449083954a476bd8` failed closed because the dispatch passed the full runtime-readiness envelope instead of the exact nested `agentic-local-review-candidate/v1` JSON required by the protected verify job.
- Earlier recovery dispatch: run `30771147307` for source revision `32d2cfca34f7d5bf484b4a8f449083954a476bd8` failed closed at source-to-mirror parity because `huijoohwee.github.io/schema/AgenticRAG/agentic-graph-documents-map.graph.jsonld` was missing the relocated XR document node.
- Workflow run: `30771408324` (`Production Release`)
- Source revision: `32d2cfca34f7d5bf484b4a8f449083954a476bd8`
- Source tree: `ad66dc3d12f7207a8c1573a9d51f8febc0a7976a`
- Agentic Canvas OS docs revision: `e3c1cfbbd0182d7a91379576b8502be12562407b`
- Local review candidate digest: `17053ac576ff09d05dd368611d09dc27062c7cc442bca80db4437d2830f39d54`
- Immutable manifest digest: `d81c47b5978bf28a89360df1520391d8b63c7dc304d703aecb7eb798ae2ac715`
- Production candidate digest: `6b27c7e8e5ed48297b81e17a731f25dcfd07744e31df33ed7fd3f7654fdc0f9e`
- Lifecycle candidate digest: `588ec101fa2273a918f09594a24c5af05a60761c4d26d9a32736330cbcf6f883`
- Human authorization decision ref: `https://github.com/huijoohwee/agentic-graph/actions/runs/30771408324#environment-production`
- Authorization interaction evidence digest: `995bde94e2b651f6986530edf5ea79c62ccf69db09ec4a94c39a610a378c39e7`
- Previous rollback target: `40cc85aa-e472-406c-b2c4-f76abdd23a18`
- Candidate deployment origin: `https://fbd0fd41.joohwee.pages.dev`
- Candidate deployment id: `fbd0fd41-6cc9-4373-a9b1-f8560fda58e0`
- Published mirror revision: `5f9eff39339e1f1f0ea86ddaa11e48e49f1811cc`
- Rollback result: not invoked

### 2026-08-02 Prior Recorded Receipt

- Earlier stale dispatch: run `30749177437` for source revision `86496f495dede69256053d308cc222ddf5ae6daa` failed closed because protected `refs/heads/main` had already advanced to `d9578e8810e94565028386b19ac5e95668e91207`
- Workflow run: `30750323434` (`Production Release`)
- Source revision: `d9578e8810e94565028386b19ac5e95668e91207`
- Source tree: `ca06e5b31887302cf941ecc72fa3f3d8475378ad`
- Agentic Canvas OS docs revision: `0ba0d131c6df4a41666bd4f8b4eb6f7c549c42c2`
- Local review candidate digest: `cbec1294bfecb670431fad6f794655d6b8366ea41a27edc797b67a9ad7445395`
- Immutable manifest digest: `8131b985777b94e7f2f5426f7f6fedd3a99d31672f0f0f2216b78d3befbf0d78`
- Production candidate digest: `b3466a2b799826f497595ddb505e1cd4d8f4fe61f84f387f3abbe501528324bc`
- Lifecycle candidate digest: `680255babe4f08f6c2bdcaa16cba00f24af6aa31c0f957f80ff6b1440b44c3d1`
- Human authorization decision ref: `https://github.com/huijoohwee/agentic-graph/actions/runs/30750323434#environment-production`
- Authorization interaction evidence digest: `ce15de59cc32a661274973f68d633e1f8eb9d9d05c40b8fff9659a6145bf7b2b`
- Candidate deployment origin: `https://40cc85aa.joohwee.pages.dev`
- Candidate deployment id: `40cc85aa-e472-406c-b2c4-f76abdd23a18`
- Published mirror revision: `8ed1e4ad6fbf1f5127c179b577824ca61c9afbb7`
- Rollback result: not invoked

### 2026-08-02 Earlier Recorded Receipt

- Workflow run: `30747479760` (`Production Release`)
- Source revision: `027cd892b57e4247c1e8edb4c144b216c398379c`
- Source tree: `de0875017e2c270803dec577203d112010ed1ba1`
- Agentic Canvas OS docs revision: `abeb1ae8bfb6fb89d7c4449bd1c7c1a9a8790175`
- Local review candidate digest: `c536eb898e11337c64032751645d6c417fb64f88264e8ff0822d51a946c65a90`
- Immutable manifest digest: `41ad94826111728a42e370e841c3fe7dc3bd8423372a9f5b09f674fa43cc0f76`
- Production candidate digest: `db9bd64ab301dfffe0ab2c61a73e7053b0f1ee8b747ca78830735ff0baff01c2`
- Lifecycle candidate digest: `b00f3a1a029079a108b9858bd25b443aa6c0f793c477a25e4978168c432b3673`
- Human authorization decision ref: `https://github.com/huijoohwee/agentic-graph/actions/runs/30747479760#environment-production`
- Authorization interaction evidence digest: `3ecd199fd9a39f1dd19fb721ac8f6c4ae6da0123d530b1d3f72163a2149d3d10`
- Candidate deployment origin: `https://1fa1b6dd.joohwee.pages.dev`
- Candidate deployment id: `1fa1b6dd-dad2-40d0-a81f-9d5b8fecd454`
- Published mirror revision: `dec0a405fed5bdbaf00e7168c928498f71a18b41`
- Rollback result: not invoked

### 2026-08-02 Even Earlier Recorded Receipt

- Workflow run: `30735517980` (`Production Release`)
- Source revision: `af26f37477cb92e1a8306931262bb25dd4944f00`
- Source tree: `3e7c65dfd91e537008c354f19cc31a9e123abe2b`
- Agentic Canvas OS docs revision: `ba45470e036599d0f42add7236bac1f4a5b03cab`
- Local review candidate digest: `bafe95d8d0bde9ff908acda5e14167faec379445d7cebd9024ea0ef7dab6f5b3`
- Immutable manifest digest: `fcde567a80d33411d27ba440482050a635be978b3d0ef7c549b291671d7e336a`
- Production candidate digest: `14302fd17936483e523a52b472c88b30009bc605c5eb5522a792f916c0a877b6`
- Lifecycle candidate digest: `ce37e17ac99b0f6e116792a2b47b034af6bbedcf0fe460ce9ae172a0b457f512`
- Human authorization decision ref: `https://github.com/huijoohwee/agentic-graph/actions/runs/30735517980#environment-production`
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
