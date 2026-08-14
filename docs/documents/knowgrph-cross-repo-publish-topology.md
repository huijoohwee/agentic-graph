# Knowgrph Cross-Repo Publish Topology

Canonical companion for the clean end-state topology shared with `singabldr`.

For current remote MCP onboarding, start with
`docs/documents/knowgrph-mcp-onboarding-index.md`, then use
`docs/documents/knowgrph-mcp-install-contract.md` for the canonical
public-discovery vs control-plane endpoint boundary.
Map intent on `https://airvio.co/knowgrph/mcp`, orchestrate agents on
`https://airvio.co/knowgrph/control-plane/mcp` only for session-capable hosts,
and prove outcomes first with the source-side `README.md` or
`docs/documents/knowgrph-superagent-harness.md` offline path.

## Scope

- Dev SSOT repo: `$GITHUB_ROOT/knowgrph`
- Shared publish repo: `$GITHUB_ROOT/huijoohwee`
- Prod artifact mirror: `$GITHUB_ROOT/huijoohwee/content/knowgrph`
- Public route managed files: `$GITHUB_ROOT/huijoohwee/knowgrph`
- Public route: `airvio.co/knowgrph`
- Storage Worker routes: `airvio.co/api/storage/*`
- Storage Worker server-side fetch origin: `https://knowgrph-storage.huijoohwee.workers.dev`
- Payment Worker routes: `airvio.co/api/payments/*`
- Sibling app route: `airvio.co/singabldr`

## Current Release Context

The ACOS RELEASE-WORKFLOW v4 production chain is:

```text
Protected Dev main + exact localhost review
  -> knowgrph-production-release-evidence/v1
       19 content-addressed preserved lanes
       exact last-known-good Pages + mirror + D1
  -> protected .github/workflows/release.yml
       build one immutable candidate
       exact-candidate terminal authorization
       Pages Direct Upload -> Deployment v1
       direct D1 reconcile/readback -> State Reconciliation v1
       immutable + stable + custom probes -> Live Verification v2
       publish exact huijoohwee mirror -> Publication v2
  -> agentic-collaborative-release-lifecycle/v2 terminal carrier
```

Before dispatch, the repository-owned producer creates strict
`knowgrph-production-release-evidence/v1` bytes. Its 19 inventory entries and 19 retained
observations bind preservation identities/digests; the same object binds the protected tip,
convergence base, successor write set, and exact last-known-good Pages deployment, publication
mirror revision, and D1 state. The protected workflow receives the content address and revalidates
the exact bytes through the lifecycle CLI's `--release-evidence <path>` input. Preservation
evidence does not authorize mutation, cleanup, or Production.

`npm run pages:build-sync` remains the source-owned candidate builder: it rejects personal
home-directory paths and preserves Vite's canonical hashed asset URL and `no-transform` app-shell
headers. It is not a production publisher. `pages:build-sync-cloudflare`, `workers:deploy`,
`storage:deploy`, raw Wrangler commands, direct D1 writes, and local mirror pushes are not valid
Knowgrph release paths. Only the protected release workflow may reconcile the verified candidate
into the mirror workspace, Direct Upload it to Pages, reconcile/read back release-scoped D1 state,
run production probes, and publish the mirror.

The immutable deployment origin is the artifact identity transport. The stable
`joohwee.pages.dev` URL is a separate Pages routing transport. `airvio.co` and
`airvio.co/knowgrph` are custom-domain transports with their own DNS, policy, cache, and route
ownership. All are required; none may substitute for another. Exact readiness-marker bytes and
release identities must agree before Live Verification v2.

The protected run persists `deployment-receipt.json`, `state-reconciliation-receipt.json`,
`live-verification-receipt-v2.json`, and `publication-receipt-v2.json`, then validates them into
`collaborative-release-lifecycle-v2.json`. Forward order is Deployment → State → Live v2 →
Publication v2. The recovery branch is Deployment → Rollback, requires restored probes and an
explicit D1 disposition, forbids publication, and leaves the bound last-known-good mirror revision
unchanged.

For the detailed source-backed Markdown discovery contract behind the Live Canvas Hero route, use `docs/documents/markdown-convertible-agent-discovery-document.md`.

Public route ownership remains `airvio.co/api/storage/*`, but server-side reads from Cloudflare Pages should target `https://knowgrph-storage.huijoohwee.workers.dev` so shared-doc Markdown negotiation does not self-fetch through the custom-domain route. Production `airvio.co/knowgrph` chat proxy behavior is owned by the shared publish-repo Pages Functions layer, primarily `huijoohwee/functions/__chat_proxy/[[path]].js` plus `huijoohwee/functions/api/_integrationHub.js`; provider rollouts such as Agnes and MiroMind must land there in addition to the Knowgrph Dev proxy/runtime. The same rule now applies to the Cloudflare AI Gateway draft lane: the Dev proxy and the publish-repo Pages proxy must both understand the internal `x-kg-ai-gateway-*` contract and the `KNOWGRPH_CHAT_PROXY_AI_GATEWAY_{BASE_URL,TOKEN,GATEWAY_ID}` env set, or the draft route will drift between localhost and `airvio.co`.

`huijoohwee/content/knowgrph` is the primary Prod artifact mirror. `huijoohwee/knowgrph` is a generated public-route compatibility surface for managed root files such as `index.html`, `llms.txt`, `manifest.webmanifest`, `settings-flow.json`, `sw.js`, and `assets/**`; it is not the source owner. Cloudflare Pages control files remain authoritative only at the publish repo root: `huijoohwee/_headers` and `huijoohwee/_redirects`. Mirrored nested `_headers` or `_redirects` under `content/knowgrph` are not deploy authority and should not be synced.

The source-revision namespace owns each published `/knowgrph/assets/**` URL. The Pages Function may
pass through an immutable response only after the asset binding returns a successful non-HTML
asset; a transient missing asset or HTML SPA fallback is returned as `503` with `no-store` and a
short retry signal. This keeps partial deployment propagation from mutating a release URL in the
browser cache while preserving immutable caching for verified asset bytes.

### 2026-08-04 Canonical Main Advance Release Record

- Source repo `knowgrph` shipped commit `467e88cdc1be7c56ac07a4d19db6e3f82eda600d` (`update runtime docs pin to current ACOS main`).
- The protected `Production Release` workflow run `30871807035` verified the exact reviewed localhost candidate for `467e88cdc1be7c56ac07a4d19db6e3f82eda600d` and the pinned Agentic Canvas OS docs revision `bebda7bfdf3c9b8b2d8f98a2784a57487520abd6`.
- Interactive terminal authorization approved the exact production candidate digest `6b84ac23e2b0c520f5a2ac0ad72c084fc2c8fe5cd821a8d3f44a69807acdf4c6` before mutation, then consumed the lifecycle candidate digest `e720857e8275dbdd4c5eafd4ff55a34dd1df8fc80ad4dc36bbcbd50829aaf4b1` for delivery.
- Cloudflare Pages deployed the exact candidate to `https://50ba5ab2.joohwee.pages.dev`, captured deployment id `50ba5ab2-ea3b-4275-afbb-b9e379374636`, preserved rollback target `b6a090e7-2ea6-4426-90f5-45e39d934199`, re-proved browser fidelity and deployment markers for the same source revision, and completed returning-user service-worker convergence as a `revision-upgrade` from `af6a18aea23646115f9db3fd8435f10f1d8c7e35` before publication.
- Publish repo `huijoohwee` shipped commit `7ddee18a8e6af3254e0efbf3a50420d604a486d6` (`chore(release): promote knowgrph 467e88cdc1be`).
- Post-release operator follow-up re-proved the public custom domain at `https://airvio.co/knowgrph/` with `RELEASE_SHA=467e88cdc1be7c56ac07a4d19db6e3f82eda600d PRODUCTION_IMMUTABLE_MANIFEST_DIGEST=eb89fd1a9ef231b7d2a1d4dff3a19954eae5e8f634a5f5a9950fd8cf6f5176f5 npm run production:fidelity:check`, and reran the returning-user service-worker proof as `same-revision-recovery` from the already-published SHA on `https://airvio.co`.

### 2026-08-02 Canonical Main Advance Release Record

- Source repo `knowgrph` shipped commit `32d2cfca34f7d5bf484b4a8f449083954a476bd8` (`chore(release): promote Agentic Canvas OS docs pin (#647)`).
- An earlier protected `Production Release` dispatch for the same source revision failed closed as run `30771075357` because the dispatch passed the full runtime-readiness envelope instead of the exact nested `agentic-local-review-candidate/v1` JSON required by the verify job; the malformed candidate was retired instead of authorized.
- A second protected `Production Release` dispatch for the same source revision failed closed as run `30771147307` because source-to-mirror parity still lacked the relocated XR document node in `huijoohwee.github.io/schema/AgenticRAG/knowgrph-documents-map.graph.jsonld`; that candidate was retired, the schema mirror was ported forward, and the release was resealed.
- The protected `Production Release` workflow run `30771408324` then verified the exact reviewed localhost candidate for `32d2cfca34f7d5bf484b4a8f449083954a476bd8` and the pinned Agentic Canvas OS docs revision `e3c1cfbbd0182d7a91379576b8502be12562407b`.
- Interactive terminal authorization approved the exact production candidate digest `6b27c7e8e5ed48297b81e17a731f25dcfd07744e31df33ed7fd3f7654fdc0f9e` before mutation, then consumed the lifecycle candidate digest `588ec101fa2273a918f09594a24c5af05a60761c4d26d9a32736330cbcf6f883` for delivery.
- Cloudflare Pages deployed the exact candidate to `https://fbd0fd41.joohwee.pages.dev`, captured deployment id `fbd0fd41-6cc9-4373-a9b1-f8560fda58e0`, preserved rollback target `40cc85aa-e472-406c-b2c4-f76abdd23a18`, re-proved browser-fidelity and deployment markers for the same source revision, and completed returning-user service-worker convergence before publication.
- Publish repo `huijoohwee` shipped commit `5f9eff39339e1f1f0ea86ddaa11e48e49f1811cc` (`chore(release): promote knowgrph 32d2cfca34f7`).
- The protected release completed without rollback and re-proved the public route at `https://airvio.co/knowgrph/` through the verified deployment path.

### 2026-08-02 Earlier Canonical Main Advance Release Record

- Source repo `knowgrph` shipped commit `027cd892b57e4247c1e8edb4c144b216c398379c` (`chore(release): promote Agentic Canvas OS runtime pin (#637)`).
- An earlier protected `Production Release` dispatch for `4be31c4879d1ada8e8060ba2ce51e68987d6107f` failed closed as run `30747314671` because protected `main` advanced before verify could prove the exact requested commit; the stale candidate was retired instead of reused.
- The protected `Production Release` workflow run `30747479760` then verified the exact reviewed localhost candidate for `027cd892b57e4247c1e8edb4c144b216c398379c` and the pinned Agentic Canvas OS docs revision `abeb1ae8bfb6fb89d7c4449bd1c7c1a9a8790175`.
- Cloudflare Pages deployed the exact candidate to `https://1fa1b6dd.joohwee.pages.dev`, re-proved browser-fidelity and deployment markers for the same source revision, and completed returning-user service-worker convergence before publication.
- Publish repo `huijoohwee` shipped commit `dec0a40bb6718d70b6bdfd6d3196ec5bc6342df4` (`chore(release): promote knowgrph 027cd892b57e`).
- A duplicate waiting release run `30747485249` for the same `main` candidate was cancelled after the successful publication so no second authorization or publish path remained open for that SHA.
- The protected release completed without rollback and re-proved the public route at `https://airvio.co/knowgrph/` through the verified deployment path.

### 2026-08-02 Earlier Protected Release Record

- Source repo `knowgrph` shipped commit `7f097dbabb7285cf4a18a66a0e37170158b5a610` (`Promote Agentic Canvas OS runtime pin (#625)`).
- The protected `Production Release` workflow run `30738439105` verified the exact reviewed localhost candidate for that source revision and the pinned Agentic Canvas OS docs revision `2752f2e90dc3bf590cf3aec683d324ec0c66024f`.
- Interactive terminal authorization approved the exact production candidate digest `a78cbb84bdf56e6cd722b9647f2e623b020ea05725fd73188133e4d8a12ad8cf` before mutation.
- Cloudflare Pages deployed the exact candidate to `https://b1a0cc37.joohwee.pages.dev`, captured deployment id `b1a0cc37-01f9-4ff2-aeb6-ce2dc57a7899`, reconciled canonical docs into D1, and completed live runtime, browser-fidelity, and returning-user service-worker verification before publication.
- Publish repo `huijoohwee` shipped commit `154fb68b1bab81401f277ece6083200714f6f23f` (`chore(release): promote knowgrph 7f097dbabb72`).
- The protected release completed without rollback and re-proved the public route at `https://airvio.co/knowgrph/` through the verified deployment path.

### 2026-08-02 Even Earlier Protected Release Record

- Source repo `knowgrph` shipped commit `af26f37477cb92e1a8306931262bb25dd4944f00` (`Promote Agentic Canvas OS ba45470e0365 (#622)`).
- The protected `Production Release` workflow run `30735517980` verified the exact reviewed localhost candidate for that source revision and the pinned Agentic Canvas OS docs revision `ba45470e036599d0f42add7236bac1f4a5b03cab`.
- Interactive terminal authorization approved the exact production candidate digest `14302fd17936483e523a52b472c88b30009bc605c5eb5522a792f916c0a877b6` before mutation.
- Cloudflare Pages deployed the exact candidate to `https://9cd7a7fc.joohwee.pages.dev`, captured deployment id `9cd7a7fc-869f-4e07-a7d3-fd0616557eb2`, reconciled canonical docs into D1, and completed live runtime, browser-fidelity, and returning-user service-worker verification before publication.
- Publish repo `huijoohwee` shipped commit `41043c2ff3bb8b49d0f54850dd2c83f4778cd44f` (`chore(release): promote knowgrph af26f37477cb`).
- The protected release completed without rollback and re-proved the public route at `https://airvio.co/knowgrph/` through the verified deployment path.

### 2026-07-11 Root Live Canvas Hero Release Record

- Source repo `knowgrph` shipped `a86bdbc9` (`restore source-backed apex FlowCanvas hero`) and `ada81a16` (`isolate apex hero from unloaded persisted source text`).
- Publish repo `huijoohwee` shipped `88aa31070` (`deploy persisted-state resilient apex FlowCanvas hero`).
- Cloudflare Pages deployed the exact publish commit to `https://1b9d700b.joohwee.pages.dev`; the custom domain served the release at `https://airvio.co/` and `https://airvio.co/knowgrph/`.
- The root route uses the published React app shell with `x-knowgrph-root-alias=/knowgrph/`; it is not a separately maintained launch page. The normal root path renders the interactive `workspace-readme.md` FlowCanvas and the same React Live Canvas Hero as Dev.
- Dev/Prod browser proof matched: the canvas region, hero headline, `/`, `#`, and `@` invocation controls, one `Enter Knowgrph` link to `/knowgrph/`, and no static launch-overlay marker. Route checks returned `200` for both root and app paths.

### 2026-06-29 Release Record

- Source repo `knowgrph` shipped commit `530462d6` (`Stabilize storyboard runtime and sync docs`).
- Publish repo `huijoohwee` finalized the deployed state at commit `ec4dfa47` (`release: rebuild pages worker`) after publish sync and generated Pages metadata commits.
- Cloudflare Pages deploy ran through `npm run pages:deploy-cloudflare` from `knowgrph` and completed with preview URL `https://0d3c18ba.joohwee.pages.dev`.
- Post-deploy route proof passed with `https://airvio.co/` -> `200`, `https://airvio.co/knowgrph/` -> `200`, and `https://0d3c18ba.joohwee.pages.dev/knowgrph/` -> `200`.
- The deploy also completed `storage:d1:seed:docs` with `applied=41`, `conflict=0`, and `rejected=0`.

### 2026-06-26 Release Record

- Source repo `knowgrph` shipped commits `66926a74` (`feat: improve timeline preview animation runtime`) and `e97df37c` (`chore: refresh settings flow metadata`).
- Publish repo `huijoohwee` shipped commit `0e4ab538` (`chore: sync knowgrph release surface`).
- Cloudflare Pages deploy ran through `npm run pages:deploy-cloudflare` from `knowgrph` and completed with preview URL `https://bdc25ab1.joohwee.pages.dev`.
- Post-deploy route proof passed with `https://bdc25ab1.joohwee.pages.dev/knowgrph/` -> `200` and `https://airvio.co/knowgrph/` -> `200`.
- The deploy also completed `storage:d1:seed:docs` with `applied=39`, `conflict=0`, and `rejected=0`.

### 2026-06-15 Release Record

- Source repo `knowgrph` shipped commit `fcd0ea5f` (`feat: modularize chat skill prompt handling`).
- Publish repo `huijoohwee` shipped commit `f0422135` (`chore: sync knowgrph production publish`).
- Cloudflare Pages deploy ran through `npm run pages:deploy-cloudflare` from `knowgrph` and completed with preview URL `https://84f45986.joohwee.pages.dev`.
- Post-deploy route proof passed with `https://airvio.co/knowgrph` -> `308` and `https://airvio.co/knowgrph/` -> `200`.
- The deploy also completed `storage:d1:seed:docs` with `applied=37`, `conflict=0`, and `rejected=0`.

## Directives

| Surface | Directive | SSOT | Publish Target | Public Route |
| --- | --- | --- | --- | --- |
| App source | Keep all Knowgrph source, build config, and release logic in `knowgrph`; forbid source copies inside `huijoohwee`. | `knowgrph` | `huijoohwee/content/knowgrph`, `huijoohwee/knowgrph` | `airvio.co/knowgrph` |
| Publish boundary | Treat `huijoohwee` as artifact-only for Knowgrph; allow deploy config, headers, redirects, and shared Functions there. | `knowgrph` | `huijoohwee` | `airvio.co/knowgrph` |
| Route ownership | Keep `/knowgrph` assets, redirects, manifests, and shell logic isolated from Singabldr route assumptions. | `knowgrph` | `huijoohwee/_redirects`, `huijoohwee/content/knowgrph` | `airvio.co/knowgrph` |
| Root launch alias | Keep `airvio.co/` on the published Knowgrph React app shell. The generated root handler injects `x-knowgrph-root-alias=/knowgrph/`; `CanvasPage` and `useKnowgrphLiveCanvasHero` consume that marker synchronously so Home owns first paint and resolves the canonical Physics Playground **Share canvas embed** runtime from `XR_PHYSICS_DEMO_PUBLISHED_CANONICAL_PATH` before outer Source Files hydration. The seed frontmatter owns XR/3D mode; no Home query may override its renderer. Inside that same-origin embed, `CanvasDocDeepLinkRuntime` keeps `kgShare` unconsumed until the embedded Source Files bootstrap readiness signal fires, then applies the shared document as the final authoritative selection so origin-scoped persisted documents cannot replace the apex background. The full `/knowgrph/` workspace canvas must never flash or mount underneath Home. Explorer → Source Files → **Share canvas embed** selects and session-persists another source's same-origin interactive runtime, replaces the canonical background, and copies sandboxed iframe HTML for external websites. The async published URL remains the internal selection value while the external clipboard contract is owned by `canvasEmbedIframeMarkup.ts`. | `knowgrph/cloudflare/pages/root-agent-ready-index.mjs`, `knowgrph/canvas/src/pages/Canvas.tsx`, `knowgrph/canvas/src/features/canvas/{CanvasDocDeepLinkRuntime.tsx,canvasEmbedIframeMarkup.ts,useKnowgrphLiveCanvasHero.ts,liveCanvasHeroSourceSelection.ts,canvasDocDeepLink.ts}` | `huijoohwee/_worker.js`, `huijoohwee/knowgrph/**` | `airvio.co` → `airvio.co/knowgrph/` |
| Embed selection route boundary | A persisted embed selection is Home background source state only. Its `sourcePath` and decoded share/local URL must resolve one document atomically. Conflicts and malformed first-party share routes are deleted from session state; a local Physics alias is rewritten to the canonical published share. The selection cannot make `/knowgrph/` render the Live Canvas Hero; the workspace route always owns the interactive editor/canvas. | `knowgrph/canvas/src/features/canvas/{liveCanvasHeroSourceSelection.ts,liveCanvasHeroSourceSelectionContract.mjs,useKnowgrphLiveCanvasHero.ts}` | `huijoohwee/knowgrph/**` | `airvio.co/knowgrph/` |
| Shared Pages Functions | Keep production chat-proxy and integration host policy in publish-repo shared Functions; validate provider onboarding there so Cloudflare Pages behavior matches Dev, including the optional Cloudflare AI Gateway draft route. | `huijoohwee/functions/{__chat_proxy,api/_integrationHub.js}` | `huijoohwee/functions/**` | `airvio.co/__chat_proxy/*`, `airvio.co/knowgrph` |
| Release flow | Build and validate through `Integration Gate`; protected merge proves Dev only. Before dispatch, create content-addressed `knowgrph-production-release-evidence/v1` for all 19 preserved lanes and exact last-known-good Pages/mirror/D1. `turn:end` seals exact review evidence; the protected workflow revalidates both, builds once, and waits for exact-candidate terminal authorization. That workflow alone deploys Pages (Deployment v1), reconciles direct D1 state (State Reconciliation v1), separately proves immutable/stable/custom transports (Live Verification v2), and only then publishes the exact mirror (Publication v2). It validates the chain into `agentic-collaborative-release-lifecycle/v2`; only `production-complete` or verified `rolled-back` is terminal. Any predecessor, authority, artifact, transport, state, marker, or mirror drift fails closed. A failure restores only the bound last-known-good Pages target, records D1 disposition separately, requires restoration probes, and keeps the previous mirror unchanged. Direct local deploy/D1/probe/mirror/rollback commands are forbidden. Storage Worker, DNS, and payment deployments remain separately authorized operations. | `knowgrph/.github/workflows/{integration,release}.yml`, `knowgrph/scripts/{production-release-lifecycle,production-terminal-authorization}.mjs` | `huijoohwee` release artifact | immutable `pages.dev`, stable Pages, `airvio.co`, `airvio.co/knowgrph` |
| Generated artifact storage | Keep FloatingPanel Chat KGC sessions under `/chat-log/{session}/`; write Markdown/text artifacts to the configured GitHub repository path `chat-log/{session}/{file}` first, then mirror searchable Markdown/manifests to D1 and generated image/video/binary bytes to R2 when runtime storage is enabled. A generated artifact is Cloudflare-persisted only when both the D1 manifest route and R2 blob route are readable. | `knowgrph/canvas/src/features/{chat,source-files}`, `knowgrph/cloudflare/pages/knowgrph-agent-ready.mjs`, `knowgrph/cloudflare/workers/knowgrph-storage` | GitHub repository `chat-log/**` files; secondary Cloudflare Worker D1 rows + R2 `knowgrph-storage-blobs` | `airvio.co/knowgrph/api/workspace/github/write`, root alias `airvio.co/api/workspace/github/write`, `airvio.co/api/storage/{doc,blob}/*` |
| Drift control | Fix stale paths, route leakage, and runtime drift at the Knowgrph source or shared publish config root; never patch generated outputs downstream. | `knowgrph` | `huijoohwee` | `airvio.co/knowgrph` |
| Goal hygiene | Keep goal-driven refactors lean, source-owned, sub-600-line, sub-500-KiB, and free of downstream alias/remap shims before publishing. | `knowgrph/goal` | `huijoohwee/content/knowgrph` | `airvio.co/knowgrph` |
| Responsive parity | Own mobile-first responsive behavior in Dev source and generated workspace metadata; treat responsive proof as a release blocker and publish only synced artifacts after mobile/tablet/desktop/wide proof passes. | `knowgrph/goal`, `knowgrph/docs/**`, `knowgrph/canvas/**` | `huijoohwee/content/knowgrph` | `airvio.co/knowgrph` |
| Mobile workflow evidence | Keep the route-and-action matrix source-owned in Dev and treat its immediate/deferred/fallback-safe decisions as the publish contract for heavy phone workflows. | `knowgrph/docs/documents/knowgrph-feature-map.md` | `huijoohwee/content/knowgrph` | `airvio.co/knowgrph` |
| Storage Worker | Keep D1 schema, Worker routes, and route contracts in Dev; deploy with `storage:deploy`; verify `airvio.co/api/storage/*` separately from the static Pages route while keeping Pages server-side reads pinned to the Worker `workers.dev` origin. | `knowgrph/cloudflare/**`, `knowgrph/canvas/src/lib/storage/**` | Cloudflare Worker `knowgrph-storage` | `airvio.co/api/storage/*` |

## Validation Commands

| Check | Command | Purpose |
| --- | --- | --- |
| Static mirror drift | `npm run pages:check-sync` | Confirms `canvas/dist`, `huijoohwee/content/knowgrph`, managed `huijoohwee/knowgrph` files, and generated root `_headers` / `_redirects` agree while excluding mirrored nested control files. |
| Agnes readiness gate | `npm run agnes:readiness:check` | Chains `npm --prefix canvas run test:smoke:agnes:source`, publish sync drift validation, and the production Pages `__chat_proxy` smoke into one reusable readiness command. |
| AI Gateway draft-route readiness gate | `npm run ai-gateway:readiness:check` | Runs the focused OpenAI draft-route source proofs, publish sync drift validation, publish-repo `__chat_proxy` smoke, Cloudflare Pages project-config verification for `KNOWGRPH_CHAT_PROXY_AI_GATEWAY_BASE_URL`, Pages secret-list verification, and a bounded live Cloudflare-hosted transport smoke so the draft lane can be activated without guesswork. `-- --skip-live` skips only the live transport smoke; the Pages config and secret gates still fail closed until the `joohwee` project exposes the AI Gateway base URL plus an accepted AI Gateway secret. |
| MiroMind Pages readiness gate | `npm run miromind:readiness:check` | Runs `npm --prefix canvas run test:smoke:miromind:source`, confirms `MIROMIND_API_KEY` exists on the `joohwee` Pages project, and verifies the live Pages proxy sees the runtime binding without BYOK. |
| GitHub write readiness | `npm run pages:github-write:configure -- --json`; add `--write-smoke` only for a real commit | Checks production Pages GitHub-write bindings and live route status without printing or applying token values; the write smoke created `chat-log/codex-prod-write-smoke-20260606T004928Z/kgc_codex-prod-write-smoke-20260606T004928Z.md` on `main`. |
| GitHub canonical storage E2E | `npm run e2e:github-canonical-storage:dev`; `npm run e2e:github-canonical-storage:prod -- --json` | Confirms generated-chat promotion writes GitHub first, skips Cloudflare cache on GitHub failure, reads canonical content back through GitHub Contents, and uses Cloudflare only for doc/pull/share cache reads. |
| Storyboard readiness gate | `npm run storyboard:readiness:check` | Required before `pages:deploy-cloudflare` when storyboard drag, rich-media drop, overlay/layout placement, or mobile quick-bar behavior changes land; runs `npm --prefix canvas run test:smoke:storyboard-rich-media-drop:source`, the real `2D Renderer: Storyboard` browser smoke for drop/no-shift behavior, the mobile viewport-shrink quick-bar smoke, and `pages:check-sync` together so authored placement, mobile keyboard reachability, smoke seam drift, and publish drift stay blocked upstream. When debugging live-route SSOT restoration after Rich Media panel creation, also run `npm --prefix canvas run test:live:storyboard-media-panel-retention:browser` to prove transient image/video panels and created edges disappear on markdown reapply, and keep the verifier selectors exact-or-suffix for workspace-prefixed node ids. |
| Collaboration release gate | `npm run collaboration:release:check` | Required before `pages:deploy-cloudflare` when a change affects authenticated canvas-room transport, collaboration room auth/relay, collaboration docs/runtime contracts, or guest-to-owner document propagation. Runs the canonical collaboration readiness gate and then `pages:check-sync` so collaboration proof and publish drift fail upstream together. Use `npm run collaboration:release:check -- --skip-sync` only for local iteration while the publish mirror is intentionally dirty; release approval still requires the full gate. |
| Responsive parity release gate | `npm --prefix canvas run test:smoke:mobile-keyboard:browser`; `npm run pages:check-sync`; review `docs/documents/knowgrph-feature-map.md` | Required before `pages:deploy-cloudflare` when a change affects mobile grammar reachability, heavy-runtime intent policy, or touch-first responsive behavior. Blocks release until the mobile keyboard proof, the route-and-action matrix, and the publish mirror all agree. |
| Mobile route-and-action evidence audit | Review `docs/documents/knowgrph-feature-map.md` together with the focused mobile browser smoke before publish when a change alters phone workflow activation, fallback behavior, or heavy-runtime intent gates. | Confirms the documented immediate/deferred/fallback-safe matrix still matches the shipped mobile topology and proof path. |
| Static build + sync | `npm run pages:build-sync` | Rebuilds with `VITE_BASE_PATH=/knowgrph/`, blocks personal home-directory paths in active source and built text assets, then syncs the Prod mirror. |
| Pages Functions build | `npm run pages:functions:build` | Generates the publish-repo `_worker.js`, including the root Knowgrph app-shell alias handler. |
| Direct multi-unit deploy (not a release path) | `npm run pages:build-sync-cloudflare` | Mutates Pages/Workers/D1 outside the protected receipt chain and therefore must not be used for Knowgrph production release. Separate unit runbooks may name bounded operator uses under separate authority. |
| Conflict gate | `npm run conflict:check` | Runs changed-file hygiene, static build, chunk budgets, conflict compliance, and publish sync drift checks. |
| Shared Pages proxy smoke | `node huijoohwee/scripts/smoke-test-integrations.mjs` | Confirms the publish-repo `__chat_proxy` owner still recognizes shared providers such as OpenAI, BytePlus, MiroMind, Agnes, and the Cloudflare AI Gateway draft route with the expected missing-key behavior. |
| Root + app route proof | `curl -I https://airvio.co/`; `curl -I https://airvio.co/knowgrph/`; inspect the served root module asset | Confirms Cloudflare Pages is serving the pushed Prod mirror and root requests resolve through the published Knowgrph app shell. |
| Live Canvas Hero parity | Open Dev and `https://airvio.co/` in parallel; verify the `Knowgrph Live Canvas Hero` and interactive canvas regions, confirm `data-kg-live-canvas-hero-source` equals the path resolved by `XR_PHYSICS_DEMO_PUBLISHED_CANONICAL_PATH`, and verify the iframe `src` matches the canonical direct opaque share path without editor or renderer query overrides. Pre-seed a valid noncanonical share URL paired with the canonical Physics source path in a fresh browser context: Home must remove that conflict, recover the canonical token, and first-mount exactly one `native-controller` XR root/Canvas with no motion-reference, empty-world, or Game fallback owner. Open the canonical `src` and verify the source-derived XR/physics surface. In MainPanel Settings → Canvas Embed, confirm **Use Physics Playground background** resolves the same canonical share path. On a clean `/knowgrph/` initialization, confirm the same physics seed opens after bootstrap; explicit share/deep-link targets must still win. | Confirms the public root, stale-session recovery, full workspace cold start, and Settings preset resolve one source-backed physics default without downstream mutation or renderer conflict. |
| Live storage proof | `curl -i https://airvio.co/api/storage/export/kgws%3Acanonical-docs` | Confirms the storage Worker and D1 route are live. |
| Generated chat storage proof | Run `npm run pages:github-write:configure -- --json --write-smoke`, submit one FloatingPanel Chat -> New Chat turn, verify the GitHub repository contains `chat-log/{session}/kgc_{session}.md`, then `curl -i https://airvio.co/api/storage/doc/{workspaceId}/chat-log%2F{session}%2Fkgc_{session}.md` when runtime storage mirroring is enabled. | Confirms promoted New Chat KGC Markdown writes to GitHub first and is publicly readable from D1 only as a secondary mirror. |
| Generated image/video storage proof | Run the local harness `npm -C canvas run test:ci:unit -- chat.responseContract.storage.kgcBinaryOutputPublishesR2Manifest sourceFiles.storageSync.r2BlobRoute.storesBinaryObject`; for live Cloudflare proof, check `GET /api/storage/doc/{workspaceId}/{manifestPath}` and `GET|HEAD /api/storage/blob/{workspaceId}/{artifactPath}` for the same generated artifact. | Confirms generated media bytes use R2 and the readable manifest uses D1; local paths, provider URLs, object URLs, and embedded previews alone are not Cloudflare persistence proof. |
| Direct storage-worker proof | `curl -i https://knowgrph-storage.huijoohwee.workers.dev/api/storage/doc/kgws%3Acanonical-docs/huijoohwee%2Fdocs%2Fknowgrph-design-demo.md` | Confirms the server-side storage fetch origin is live for Pages/MCP reads. |

## Companion

- Canonical storage & sync index: `knowgrph-storage-sync-document.md`
- Storage schema appendix: `knowgrph-storage-schemas-document.md`
- Markdown discovery companion: `markdown-convertible-agent-discovery-document.md`
- Shared sibling doc: `singabldr/docs/documents/singabldr-cross-repo-publish-topology.md`
- Shared schema note: `huijoohwee.github.io/schema/AgenticRAG/README.md`
