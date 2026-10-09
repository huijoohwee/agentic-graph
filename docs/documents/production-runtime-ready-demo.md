---
title: "Production Runtime Ready Demo"
doc_type: "Demo Guide"
version: "0.3.0"
date: "2026-10-09"
lang: "en-US"
frontmatter_contract: "required"
status: "documentation-only-candidate"
runtime_status: "not-verified"
runtime_claim: "source-grounded-readiness-walkthrough-only"
runtime_claim_scope: "static local documentation; no production availability claim"
local_rung: "spec-complete"
delivered_rung: "undocumented"
deploy_boundary: "closed"
external_dependencies: []
source_authority: "agentic-graph/docs/documents/production-runtime-ready-demo.md"
worktree_id: "device-0232231d4a19--production-runtime-demo"
agent_id: "codex-root"
---

# Production Runtime Ready Demo

> **Status: documentation walkthrough only.** This file does not certify a production runtime, authorize a release, or activate an application seed. It is authored at `docs/documents/production-runtime-ready-demo.md`; its Source Files → Editor Workspace route has not been browser-verified.

## Demo at a glance

- **Audience**: maintainers and evaluators who need to distinguish source checks from deployed proof.
- **Duration**: 90 seconds after the document is integrated and the local app is running.
- **Effect**: read static Markdown only. No agent invocation, model call, network acquisition, source write, payment, or deployment is part of this demo.
- **Reveal**: local checks can pass while cross-repository production readiness remains false or unverified.
- **Success condition**: the viewer can name one bounded fact and one missing proof without calling either production-ready.

## Run it in Source Files → Editor Workspace

The Source Files contract maps Graph product documents to the configured `GitHub/agentic-graph/docs` root and makes them read-only after publication. This candidate is not yet in that published workspace. The Graph dev command was attempted from the admitted worktree but stopped before Vite because the fresh checkout lacks `tsx`; no browser page opened.

1. After the exact document is available in the configured Graph docs workspace, start the repository-owned local application.
2. Open MainPanel **Workflow** → Step 3 **Ingest** → **Source Files**.
3. Select `docs/documents/production-runtime-ready-demo.md` and open it in **Editor Workspace**.
4. Read the evidence register below. For each row, identify its repository revision, named check, result, and limit.
5. Close the editor without editing or syncing anything.

If the path is absent, stop and record that exact UI state. Do not register a new runtime seed or substitute a different source. The steps are a runbook, not evidence that the path is currently visible.

## Evidence register

Repository names in this evidence register are reference-implementation identifiers, not claims of production status.

| Claim | Exact observation | What it establishes | What it does not establish |
|---|---|---|---|
| Agentic OS selector candidate reduces planned suites | Base `f174f70555613885756b69035328edb88248f908`; exact four-path replay compares 77 selected suites before with 37 after the deferred-import contract. | 40 fewer planned suites (52%) while direct route suites remain selected and fingerprint deferred module bytes. | Planned count only; compatible elapsed-time, CPU, token, and cash savings have not been measured. |
| Agentic OS candidate source checks | Commit `502ad04c495e028d787ff359b5c733be0848cc09`, [PR #381](https://github.com/huijoohwee/agentic-os/pull/381); candidate source digest `b35ea4ab595c7b0d6f3d368e4c6f73e1c06a98397052fe9a5117270424e81eb3`. | Evals and focused selector tests passed; the broad changed-tree run planned 247 suites, reused 208 receipts from the same check context, ran 40 suites, and reported 2,174 passing tests in 319.6 seconds. PR #381 test and budget checks passed. | The selector change and staged-file commit fix were integrated through [OS PR #382](https://github.com/huijoohwee/agentic-os/pull/382) at `63f77e8449a47444ee38127eff866f15804cfb24`; its required checks passed (test 3m43s, budgets 7s). A duplicate post-commit local run lost repository-scoped reuse and was stopped after 55.4 seconds with four cancelled suites; it is not counted as a passing run. The suite-count replay has no elapsed-time savings claim. |
| Feature rank has no admissible candidate | Agentic OS `f174f70555613885756b69035328edb88248f908`: `npm run feature:rank` returned `ok:true`, `no-admissible-candidate`, `selected:null` (process exit 2). | Current catalog inputs admit no product candidate under their constraints. | It does not reject this documentation request or prove no user need exists. |
| Cross-repository production composition is not ready | Agentic OS `f174f70555613885756b69035328edb88248f908`: `npm run composition:runtime:check` with exact Agentic OS, Canvas OS, Graph, and Commerce roots returned `ok:false`, `sourceContractMarkersObserved:false`, `sourceCandidateClean:true`, `sourceCandidateReviewReady:false`, and `productionRuntimeReady:false`; candidate code was not executed. | Static compatibility analysis found missing source interfaces, machine-bound owner suite receipts, protected owner evidence, authenticated release authority, operator-owned payee evidence, and deployed runtime evidence. | Does not prove Source Files rendering, deployed runtime, customer demand, or payment. |
| Graph checkout matches fetched canonical source | Agentic Graph `a593e2d59e8db70c64e375099c77f4d128509c6f`: `npm run doctor` returned success and `main` matched `origin/main`. | The inspected canonical ref matched its fetched remote. | Doctor deferred deep tracked-byte identity and reported 257+ retained lane refs; no build, browser walkthrough, or production release passed. |
| Graph Dev-to-Prod docs parity | Graph `a593e2d59e8db70c64e375099c77f4d128509c6f`: contract, package, and lockfile pin Agentic OS `f174f70555613885756b69035328edb88248f908`; `scripts/check-runtime-docs-parity.mjs` runs before install and before activation. Protected [release run 37873261675](https://github.com/huijoohwee/agentic-graph/actions/runs/37873261675) completed, and both public readiness routes were read back. | `/` and `/agentic-graph` report the same verified Graph source `a593e2d59e8db70c64e375099c77f4d128509c6f`, OS/catalog revision `f174f70555613885756b69035328edb88248f908`, artifact digest `24041f546bbdd7f377d648ae4f094351241dd9eb339f230e9844574005a48e8e`, and immutable manifest digest `420d86200e11dc7dd9d623ddb1d4bf47e4aa08c1c0bee11789e6d9a101207309`. | This proves the deployed marker and artifact binding for that Graph build. It does not verify this document's Source Files route, Editor Workspace rendering, mobile/keyboard behavior, or user demand. |
| Graph app walkthrough remains unverified | Same Graph base in the admitted docs lane: `npm run dev` stopped in `predev` with `tsx: command not found`. | The fresh worktree is not ready to launch the app without dependency setup. | No page, mobile viewport, keyboard, or network observation was captured. |
| Existing runtime-demo evidence is scoped | Graph `a593e2d59e8db70c64e375099c77f4d128509c6f`: `/docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md` declares local browser acceptance and no production availability. | The existing seed has a narrower local-demo claim and explicit promotion gaps. | It is not evidence for this document or production runtime availability. |
| Canvas readiness claim is limited to its docs surface | Agentic Canvas OS `45c132b6c9297141dc3b63427427e83ea6df8b34`: `docs/RUNTIME-READINESS.md` marks the docs control surface runtime-ready and keeps Graph, production mirror, and Cloudflare gated. | The documented readiness surface is bounded to Canvas OS documentation. | No Graph deployment or external runtime proof follows. README's reported 988,324-byte MapLibre chunk was not rebuilt here. |
| Commerce/payment ownership is separate | Agentic Commerce OS `29672c3145d191def6189cee45327edaea0d6b77`: `README.md` and `docs/edge-commerce-mvp-handoff.md`. | Commerce retains its offer/payment boundaries; this demo adds no payment route. | No demand, collected payment, or revenue is claimed for this demo. |

The evidence is revision-bound and must be refreshed before a later release decision.

## 90-second presenter script

**Hook — 10 seconds** “A passing local check answers only the question that check covers.”

**Probe — 25 seconds** “Here is the source revision and the command. The OS ranker admitted no catalog candidate, and the Graph docs-control path is still separate from a deployed runtime.”

**Reveal — 35 seconds** “A reviewed lazy-import contract reduced this source plan from 77 suites to 37, while preserving route coverage and binding the deferred module bytes. That is a plan-count result only; elapsed savings are unmeasured. The existing Canvas readiness claim covers its docs surface, and the Graph browser path has not been opened.”

**Close — 20 seconds** “The protected release marker matches the exact Graph source and Agentic OS docs revision shown here. The next proof is to open this document in Source Files and record its browser, mobile, keyboard, and network behavior; those UI checks remain unverified.”

## Read-only boundary checklist

- [ ] Exact document path is visible in Source Files.
- [ ] Editor Workspace renders the authored text.
- [ ] Browser network trace shows no call initiated by this document.
- [ ] No source state, remote workspace, seed registry, or production state changed.
- [ ] 360 × 800 CSS-pixel viewport has no horizontal overflow.
- [ ] Keyboard users can reach, read, and close the document.
- [ ] Reviewer confirms every statement stays within its evidence row.

All boxes are pending until the exact integrated candidate is exercised. A screenshot, browser trace, and source diff should be attached to a later candidate review; they are not present here.

## Stop and recovery

Stop if the source path is missing, the editor changes authored state, the network trace shows an unexpected request, evidence is stale, or anyone interprets this walkthrough as a deployment claim. Preserve the observation and recheck the exact owner. Roll back a later integration by reverting only the two documentation paths; do not change runtime seeds, shared registries, production services, or retained release evidence.
