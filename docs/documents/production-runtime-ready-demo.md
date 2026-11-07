---
title: "Production Runtime Readiness Demo"
doc_type: "Demo Guide"
version: "0.4.0"
date: "2026-10-09"
lang: "en-US"
frontmatter_contract: "required"
status: "runtime-demo-candidate"
runtime_status: "local-desktop-browser-verified"
runtime_claim: "static-local-evidence-demo"
runtime_claim_scope: "local catalog demo; no dynamic readiness or production availability claim"
local_rung: "implementation-candidate"
delivered_rung: "undocumented"
deploy_boundary: "closed"
external_dependencies: []
source_authority: "agentic-graph/docs/documents/production-runtime-ready-demo.md"
worktree_id: "device-0232231d4a19--production-runtime-demo"
agent_id: "codex-root"
---

# Production Runtime Ready Demo

> **Status: implementation candidate; local desktop walkthrough verified.** The Graph-owned Demo-only option creates and opens a local snapshot in Source Files → Editor Workspace. This snapshot does not query current release state, certify cross-repository production readiness, or authorize a release.

## Demo at a glance

- **Audience**: maintainers and evaluators who need to distinguish source checks from deployed proof.
- **Duration**: 90 seconds after the local app is running.
- **Effect**: generate and open one local `demo.md` from the existing catalog. The Demo action makes no model call, repository acquisition, remote write, payment, or deployment.
- **Reveal**: local checks can pass while cross-repository production readiness remains false or unverified.
- **Success condition**: the viewer can name one bounded fact and one missing proof without calling either production-ready.

## Run it in Source Files → Editor Workspace

The existing `/81rv10/` catalog Demo flow creates `docs/demos/<preset>/<session>/demo.md` and selects it in Source Files and Editor Workspace. Use the targeted local launcher below for this text-only walkthrough; it skips optional motion and depth model preparation while retaining the normal linked-package, source, editor, and settings preparation.

1. From the exact Graph candidate, run `npm run demo:runtime-readiness -- --host 127.0.0.1 --port 5185`.
2. Open `http://127.0.0.1:5185/81rv10/` and choose **Production Runtime Readiness · Demo only** from the catalog.
3. Click **Demo** (or use Ctrl/Command+Enter). Confirm the generated `docs/demos/production-runtime-readiness/<session>/demo.md` is selected in Source Files and rendered in Editor Workspace.
4. Follow its source link to `docs/documents/production-runtime-ready-demo.md`; identify one verified fact and one unresolved boundary.
5. Close the editor without editing or syncing anything.

If the preset or generated file is absent, stop and record that exact UI state. The preset is a static snapshot, not a live status check. Do not treat the verified Graph deployment marker as the result of the separate cross-repository composition check.

## Evidence register

Repository names in this evidence register are reference-implementation identifiers, not claims of production status.

| Claim | Exact observation | What it establishes | What it does not establish |
|---|---|---|---|
| Agentic OS selector candidate reduces planned suites | Base `f174f70555613885756b69035328edb88248f908`; exact four-path replay compares 77 selected suites before with 37 after the deferred-import contract. | 40 fewer planned suites (52%) while direct route suites remain selected and fingerprint deferred module bytes. | Planned count only; compatible elapsed-time, CPU, token, and cash savings have not been measured. |
| Agentic OS candidate source checks | Commit `502ad04c495e028d787ff359b5c733be0848cc09`, [PR #381](https://github.com/huijoohwee/agentic-os/pull/381); candidate source digest `b35ea4ab595c7b0d6f3d368e4c6f73e1c06a98397052fe9a5117270424e81eb3`. | Evals and focused selector tests passed; the broad changed-tree run planned 247 suites, reused 208 receipts from the same check context, ran 40 suites, and reported 2,174 passing tests in 319.6 seconds. PR #381 test and budget checks passed. | The selector change and staged-file commit fix were integrated through [OS PR #382](https://github.com/huijoohwee/agentic-os/pull/382) at `63f77e8449a47444ee38127eff866f15804cfb24`; its required checks passed (test 3m43s, budgets 7s). A duplicate post-commit local run lost repository-scoped reuse and was stopped after 55.4 seconds with four cancelled suites; it is not counted as a passing run. The suite-count replay has no elapsed-time savings claim. |
| Feature rank has no admissible candidate | Agentic OS `f174f70555613885756b69035328edb88248f908`: `npm run feature:rank` returned `ok:true`, `no-admissible-candidate`, `selected:null` (process exit 2). | Current catalog inputs admit no product candidate under their constraints. | It does not reject this documentation request or prove no user need exists. |
| Cross-repository production composition is not ready | Agentic OS `f174f70555613885756b69035328edb88248f908`: `npm run composition:runtime:check` with exact Agentic OS, Canvas OS, Graph, and Commerce roots returned `ok:false`, `sourceContractMarkersObserved:false`, `sourceCandidateClean:true`, `sourceCandidateReviewReady:false`, and `productionRuntimeReady:false`; candidate code was not executed. | Static compatibility analysis found missing source interfaces, machine-bound owner suite receipts, protected owner evidence, authenticated release authority, operator-owned payee evidence, and deployed runtime evidence. | Does not prove Source Files rendering, deployed runtime, customer demand, or payment. |
| Graph checkout matches fetched canonical source | Agentic Graph `a593e2d59e8db70c64e375099c77f4d128509c6f`: `npm run doctor` returned success and `main` matched `origin/main`. | The inspected canonical ref matched its fetched remote. | Doctor deferred deep tracked-byte identity and reported 257+ retained lane refs; no build, browser walkthrough, or production release passed. |
| Graph Dev-to-Prod docs parity | Graph `a593e2d59e8db70c64e375099c77f4d128509c6f`: contract, package, and lockfile pin Agentic OS `f174f70555613885756b69035328edb88248f908`; `scripts/check-runtime-docs-parity.mjs` runs before install and before activation. Protected [release run 37873261675](https://github.com/huijoohwee/agentic-graph/actions/runs/37873261675) completed, and both public readiness routes were read back. | `/` and `/agentic-graph` report the same verified Graph source `a593e2d59e8db70c64e375099c77f4d128509c6f`, OS/catalog revision `f174f70555613885756b69035328edb88248f908`, artifact digest `24041f546bbdd7f377d648ae4f094351241dd9eb339f230e9844574005a48e8e`, and immutable manifest digest `420d86200e11dc7dd9d623ddb1d4bf47e4aa08c1c0bee11789e6d9a101207309`. | This protected release evidence is independent of the local Source Files route, Editor Workspace rendering, mobile/keyboard behavior, or user demand. |
| Local Graph demo document | Task worktree parent `af107543b349f31255e30778d6a66b31517da8c4` plus its working-tree implementation; `npm run demo:runtime-readiness -- --host 127.0.0.1 --port 5185`; selected **Production Runtime Readiness · Demo only**; local browser displayed `docs/demos/production-runtime-readiness/<session>/demo.md` in Source Files and rendered it in Editor Workspace. Chat opened with the two authored example messages. | Confirms the UI path and authored snapshot render in this local browser session. | Working tree was not yet committed during the observation. This does not prove protected integration, production behavior, mobile or keyboard access, or a captured network trace. |
| Existing runtime-demo evidence is scoped | Graph `a593e2d59e8db70c64e375099c77f4d128509c6f`: `/docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md` declares local browser acceptance and no production availability. | The existing seed has a narrower local-demo claim and explicit promotion gaps. | It is not evidence for this document or production runtime availability. |
| Canvas readiness claim is limited to its docs surface | Agentic Canvas OS `45c132b6c9297141dc3b63427427e83ea6df8b34`: `docs/RUNTIME-READINESS.md` marks the docs control surface runtime-ready and keeps Graph, production mirror, and Cloudflare gated. | The documented readiness surface is bounded to Canvas OS documentation. | No Graph deployment or external runtime proof follows. README's reported 988,324-byte MapLibre chunk was not rebuilt here. |
| Commerce/payment ownership is separate | Agentic Commerce OS `29672c3145d191def6189cee45327edaea0d6b77`: `README.md` and `docs/edge-commerce-mvp-handoff.md`. | Commerce retains its offer/payment boundaries; this demo adds no payment route. | No demand, collected payment, or revenue is claimed for this demo. |

The evidence is revision-bound and must be refreshed before a later release decision.

## 90-second presenter script

**Hook — 10 seconds** “A passing local check answers only the question that check covers.”

**Probe — 25 seconds** “Here is the source revision and the command. The OS ranker admitted no catalog candidate, and the Graph docs-control path is still separate from a deployed runtime.”

**Reveal — 35 seconds** “A reviewed lazy-import contract reduced this source plan from 77 suites to 37, while preserving route coverage and binding the deferred module bytes. That is a plan-count result only; elapsed savings are unmeasured. The Graph local desktop authoring path now opens this snapshot in Source Files; mobile, keyboard and network observations remain pending.”

**Close — 20 seconds** “The protected release marker matches the exact Graph source and Agentic OS docs revision shown here. The next proof is protected integration, then mobile, keyboard and network review; the local desktop walkthrough does not authorize release.”

## Read-only boundary checklist

- [x] Exact document path is visible in Source Files in the local desktop walkthrough.
- [x] Editor Workspace renders the authored text in the local desktop walkthrough.
- [ ] Browser network trace shows no call initiated by this document.
- [ ] No source state, remote workspace, seed registry, or production state changed.
- [ ] 360 × 800 CSS-pixel viewport has no horizontal overflow.
- [ ] Keyboard users can reach, read, and close the document.
- [ ] Reviewer confirms every statement stays within its evidence row.

The checked desktop items were observed in the task browser. The remaining items are pending until the exact integrated candidate is reviewed. A browser trace and source diff should accompany a later review; neither is attached to this guide.

## Stop and recovery

Stop if the source path is missing, the editor changes authored state, the network trace shows an unexpected request, evidence is stale, or anyone interprets this walkthrough as a deployment claim. Preserve the observation and recheck the exact owner. Roll back a later integration by reverting only the two documentation paths; do not change runtime seeds, shared registries, production services, or retained release evidence.
