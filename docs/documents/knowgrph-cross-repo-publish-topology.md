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

The current deployment chain is:

```text
Dev source + docs
  $GITHUB_ROOT/knowgrph
    -> npm run pages:build-sync
    -> npm run pages:functions:build
Prod publish mirror
  $GITHUB_ROOT/huijoohwee/content/knowgrph
  $GITHUB_ROOT/huijoohwee/knowgrph
  $GITHUB_ROOT/huijoohwee/_worker.js
    -> commit and push $GITHUB_ROOT/huijoohwee
Cloudflare Pages
  airvio.co (Knowgrph root launch alias)
    -> airvio.co/knowgrph
```

`npm run pages:build-sync` owns the static SPA build, rejects personal home-directory paths in active source and built text assets, and only then updates the mirror. `npm run pages:build-sync-cloudflare` extends that path with `npm run workers:deploy`, which reuses `npm run storage:deploy` to apply remote D1 migrations, deploy the `knowgrph-storage` Worker from `cloudflare/workers/knowgrph-storage/wrangler.toml`, and reconcile D1 from the release-resolved `agentic-canvas-os/docs` checkout. The release workflow supplies `KNOWGRPH_AGENTIC_CANVAS_OS_DOCS_ROOT`; a local sibling path is only the Dev fallback. Publish sync must preserve the canonical hashed asset URL emitted by Vite for `index.html`; query-versioning the entry script URL is forbidden because it can split browser module identity across the same chunk. The generated `knowgrph` HTML app-shell cache headers must also include `no-transform` so Cloudflare JavaScript Detections do not inject `cdn-cgi/challenge-platform` scripts into the SPA shell.

For the detailed source-backed Markdown discovery contract behind the Live Canvas Hero route, use `docs/documents/markdown-convertible-agent-discovery-document.md`.

Public route ownership remains `airvio.co/api/storage/*`, but server-side reads from Cloudflare Pages should target `https://knowgrph-storage.huijoohwee.workers.dev` so shared-doc Markdown negotiation does not self-fetch through the custom-domain route. Production `airvio.co/knowgrph` chat proxy behavior is owned by the shared publish-repo Pages Functions layer, primarily `huijoohwee/functions/__chat_proxy/[[path]].js` plus `huijoohwee/functions/api/_integrationHub.js`; provider rollouts such as Agnes and MiroMind must land there in addition to the Knowgrph Dev proxy/runtime. The same rule now applies to the Cloudflare AI Gateway draft lane: the Dev proxy and the publish-repo Pages proxy must both understand the internal `x-kg-ai-gateway-*` contract and the `KNOWGRPH_CHAT_PROXY_AI_GATEWAY_{BASE_URL,TOKEN,GATEWAY_ID}` env set, or the draft route will drift between localhost and `airvio.co`.

`huijoohwee/content/knowgrph` is the primary Prod artifact mirror. `huijoohwee/knowgrph` is a generated public-route compatibility surface for managed root files such as `index.html`, `llms.txt`, `manifest.webmanifest`, `settings-flow.json`, `sw.js`, and `assets/**`; it is not the source owner. Cloudflare Pages control files remain authoritative only at the publish repo root: `huijoohwee/_headers` and `huijoohwee/_redirects`. Mirrored nested `_headers` or `_redirects` under `content/knowgrph` are not deploy authority and should not be synced.

The source-revision namespace owns each published `/knowgrph/assets/**` URL. The Pages Function may
pass through an immutable response only after the asset binding returns a successful non-HTML
asset; a transient missing asset or HTML SPA fallback is returned as `503` with `no-store` and a
short retry signal. This keeps partial deployment propagation from mutating a release URL in the
browser cache while preserving immutable caching for verified asset bytes.

### 2026-08-02 Protected Release Record

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
| Release flow | Build and validate in `knowgrph` through `Integration Gate`; a protected merge proves Dev integration only. After `turn:end` converges localhost canonical `main` and emits exact review evidence, an explicit protected-main candidate request starts the sole serialized controller. It loads the neutral contract from the exact pinned Agentic Canvas OS checkout, builds once, and persists joined Integration, Runtime Review, and Candidate receipts binding collaboration identity, source/dependency/policy/target identities, artifact, manifest, and rollback target. The protected `production` environment must yield exactly one authenticated human GitHub `User` approval for that candidate digest; the resulting authorization is consumed before mutation. The same run deploys the already-built bytes, records Live Verification after all live gates, publishes the verified mirror, and closes with Publication. All six receipts remain run-scoped and auditable. Source, dependency, policy, target, artifact, manifest, receipt-link, approval, replay, or rebuild drift fails closed. Cloudflare Git-triggered deployments remain disabled; failed authorized deployment may restore only the captured immutable rollback target. Storage, DNS, and payment deployments remain separate explicitly authorized operations. | `knowgrph/.github/workflows/{integration,release}.yml`, `knowgrph/scripts/production-release-lifecycle.mjs` | `huijoohwee` release artifact | `airvio.co/knowgrph` |
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
| Static + Worker deploy | `npm run pages:build-sync-cloudflare` | Runs static build/sync and then `workers:deploy`; storage deploy applies D1 migrations, deploys the storage Worker, and re-seeds D1 docs. |
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
