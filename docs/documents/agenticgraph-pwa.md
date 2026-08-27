# AgenticGraph Progressive Web App (PWA)

**Context**: Browser-based knowledge graph canvas deployed on Cloudflare Pages at `airvio.co/agenticgraph`.
**Intent**: Enable install-to-homescreen, revision-bound asset caching, deferred install UX, and Web Share API integration.
**Directive**: Use `vite-plugin-pwa` with Workbox generateSW; keep production HTTP as the sole HTML owner; keep manifest, service worker, and runtime in one upstream source; forbid cached navigation fallbacks, duplicate lifecycle listeners, stale SW registrations, and conflicting deploy-time `_headers` ownership.

---

**Version**: 1.1.0
**Date**: 2026-07-23
**Status**: Deployed (manifest, revision refresh, asset cache, install button, share target, release proof)
**Owner**: AgenticGraph canonical docs
**Cross-references**: `agenticgraph-storage-sync-document.md` (deployment topology), `agentic-canvas-os/todo/2026-05.md` (migrated 2026-05-08 planning history)

## Companion Files

| File | Scope |
|---|---|
| `agenticgraph-storage-sync-document.md` | Cloudflare Pages deployment, D1 sync, publish topology |

---

## Architecture

```mermaid
flowchart TB
  subgraph Build["Vite Build (vite-plugin-pwa)"]
    A[index.html] --> B[manifest.webmanifest]
    A --> C[sw.js + workbox-*.js]
    D[apple-touch-icon.png] --> B
    D --> C
    E[assets/*.{js,css,woff,woff2,ttf}] --> C
  end

  subgraph Runtime["Browser Runtime"]
    F[main.tsx] --> G[installPwaRuntime]
    G --> H[registerSW]
    H --> I[Service Worker]
    G --> J[beforeinstallprompt listener]
    J --> K[deferredInstallPrompt]
    G --> L[appinstalled listener]
    G --> M[Display mode observer]
  end

  subgraph UI["Canvas UI"]
    N[Toolbar.tsx] --> O[Install Button]
    O -->|isInstallable| K
    O -->|onClick| P[promptPwaInstall]
    Q[CanvasQueryBootstrapRuntime] --> R[Share Handler]
    R -->|?share=1| S[Toast: shared content]
  end

  subgraph Cloudflare["Cloudflare Pages"]
    T[huijoohwee/_headers] -->|no-cache| C
    T -->|no-cache| B
    T -->|Service-Worker-Allowed: /| C
  end
```

## Component Inventory

| Layer | Component | File / Module | Status |
|-------|-----------|---------------|--------|
| Build config | VitePWA plugin | `canvas/vite.config.ts` | Deployed |
| Manifest | Web app manifest | `manifest.webmanifest` (generated) | Deployed |
| Service worker | Workbox generateSW | `sw.js` + `workbox-*.js` (generated) | Deployed |
| Runtime | PWA boot + install capture | `canvas/src/lib/pwa/runtime.ts` | Deployed |
| Revision owner | Bounded registration/foreground/online update checks | `canvas/src/lib/pwa/serviceWorkerRevisionUpdateOwner.ts` | Deployed |
| UI | Install button | `canvas/src/components/Toolbar.tsx` | Deployed |
| Bootstrap | Share query handler | `canvas/src/features/canvas/CanvasQueryBootstrapRuntime.tsx` | Deployed |
| HTML | Meta tags + icon links | `canvas/index.html` | Deployed |
| Headers source | Preview header template | `canvas/public/_headers` | Deployed |
| Headers authority | Shared Pages header surface | `huijoohwee/_headers` | Deployed |
| Icon | Apple touch icon | `canvas/public/apple-touch-icon.png` | Deployed |
| Labels | UI label constant | `canvas/src/lib/config-copy/uiMeta.ts` | Deployed |
| Query params | Share param constants | `canvas/src/lib/routing/queryParams.ts` | Deployed |
| Tests | Regression assertions | `canvas/src/__tests__/pipelinePwaEnhancementsRegression.test.ts` | Deployed |
| Release proof | Same-profile pre-deploy/post-deploy convergence | `scripts/verify-production-service-worker-upgrade.mjs` | Deployed |

---

## Manifest Configuration

| Field | Value | Rationale |
|-------|-------|-----------|
| `name` | `agenticgraph` | Full app name |
| `short_name` | `agenticgraph` | Home screen label |
| `id` | `/agenticgraph/` (prod) or `/` (dev) | Scope isolation per deployment |
| `start_url` | `.` | Relative to manifest location |
| `scope` | `.` | Same directory scope |
| `display` | `standalone` | Native app feel |
| `display_override` | `window-controls-overlay, standalone, browser` | Desktop PWA window controls |
| `orientation` | `any` | Support all device orientations |
| `background_color` | `#0b1220` | Match app theme |
| `theme_color` | `#0b1220` | Match app theme |
| `categories` | `productivity, utilities, developer` | Store categorization |
| `shortcuts` | Canvas, Editor workspace | Quick-launch entries |
| `icons` | `favicon.svg` (any, maskable), `apple-touch-icon.png` (180x180) | Cross-platform icons |
| `share_target` | `GET ./?share=1` with `title, text, url` params | Web Share API integration |

`canvas/index.html` must reference the manifest through `%BASE_URL%manifest.webmanifest` so a
rewrite from `/` to `/agenticgraph/` cannot bind the page to an apex-root manifest by accident.

---

## Service Worker Strategy

### Precache (Workbox generateSW)

| Pattern | Rationale |
|---------|-----------|
| `manifest.webmanifest` | PWA manifest |
| `favicon.svg` | Brand icon |
| `apple-touch-icon.png` | iOS install icon |
| `assets/*.{js,css,woff,woff2,ttf}` | Hashed production assets |

### Precache Exclusions

| Pattern | Rationale |
|---------|-----------|
| `assets/monaco-*.js` | Oversized editor bundle (>3 MB limit) |
| `assets/mermaid-*.js` | Oversized diagram bundle (>3 MB limit) |

### Runtime Caching

| Destination | Handler | Cache Name | Max Entries | Max Age |
|-------------|---------|------------|-------------|---------|
| `script, style, worker` | StaleWhileRevalidate | `kg-assets` | 160 | 14 days |
| `image, font` | CacheFirst | `kg-static` | 120 | 30 days |
| Same-origin `.json, .jsonld, .webmanifest` | StaleWhileRevalidate | `kg-data` | 80 | 7 days |

HTML documents are neither precached nor runtime-cached. An online navigation always resolves
from production HTTP, so one retired worker cannot project an old HTML shell that references
deleted revision assets. Offline navigation fails honestly instead of constructing a stale
release from conflicting HTML and chunk generations.

The build emits one imported worker authority containing the exact 40-character source
revision. Cache cleanup asks the activated controller for that revision, refuses to mutate
while another worker is installing or waiting, and then deletes cached HTML from
AgenticGraph-owned caches plus every scoped `/agenticgraph` HTML response and every stale
`/agenticgraph/assets/*` entry wherever found. This removes response-typed HTML poison stored
under root asset-shaped paths in `kg-static` while preserving valid HTML owned by sibling
application cache namespaces such as Singabldr. It also removes prior-revision entries
retained by the shared `kg-assets` runtime cache without letting an old document delete its
successor's assets.

Each generated `kg-assets`, `kg-static`, and `kg-data` route also rejects HTML and XHTML on
both cache admission and cache reads. The write policy retains Workbox's HTTP 200 requirement.
This prevents a scoped deep-link rewrite or an old root fallback response from re-entering a
non-navigation runtime cache after cleanup.

The apex Pages Function has no alternate Home or XR renderer. It rewrites only the canonical
published `/agenticgraph/` app shell and fails closed if that shell is unavailable or invalid.
Publish sync also removes the superseded static root shell and installs one top-level
`404.html`. This disables Cloudflare Pages' implicit whole-site SPA fallback, so a missing
image or script returns HTTP 404 instead of a 200 Home document, while the release gate
proves the explicit Singabldr routes still resolve. The sync owner also removes the obsolete
`/` and `/index.html` static-shell rewrites plus standalone Hackamap redirects whose published
target no longer exists; the root Function and canonical `/agenticgraph/` application remain the
only Home owners.

The generated `sw.js` entry and both mutable imports,
`agenticgraph-service-worker-revision.js` and `agenticgraph-chat-stream-sw.js`, use `no-store`
response headers at the content and public routes. Both import URLs also carry the exact
release revision, and the chat runtime exposes a lifecycle-clean schema attestation. This
prevents an existing registration's imported-script cache policy from retaining a removed
authority or legacy lifecycle implementation after the top-level worker advances.

### Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| `maximumFileSizeToCacheInBytes` | 3 MB | Exclude oversized bundles from precache |
| `navigateFallback` | `null` | Explicitly forbid plugin-default service-worker HTML ownership |
| `registerType` | `autoUpdate` | Auto-activate new SW on reload |
| `injectRegister` | `null` | Manual SW registration in runtime |

---

## PWA Runtime

### Module: `canvas/src/lib/pwa/runtime.ts`

**Responsibility**: Bootstrap SW registration, track display mode, capture install prompt, publish state to DOM.

**Exported API**:

| Function | Signature | Purpose |
|----------|-----------|---------|
| `installPwaRuntime` | `() => void` | Boot SW, attach listeners, publish state |
| `getDeferredInstallPrompt` | `() => BeforeInstallPromptEvent \| null` | Check if install prompt is available |
| `promptPwaInstall` | `() => Promise<boolean>` | Trigger install dialog, return accepted |

**DOM State Attributes** (set on `<html>`):

| Attribute | Values | Consumer |
|-----------|--------|----------|
| `data-kg-display-mode` | `browser, standalone, fullscreen, minimal-ui` | CSS overscroll-behavior |
| `data-kg-installed` | `0, 1` | CSS touch-target sizing |
| `data-kg-offline-ready` | `0, 1` | Revision-bound asset-cache indicator |
| `data-kg-installable` | `1` (when set) | Toolbar install button visibility |

**Event Flow**:

```mermaid
sequenceDiagram
  participant Browser
  participant Runtime as PWA Runtime
  participant SW as Service Worker
  participant Store as Graph Store

  Browser->>Runtime: DOMContentLoaded
  Runtime->>Runtime: applyPwaDisplayModeState()
  Runtime->>Browser: Set data-kg-* attributes
  Runtime->>SW: registerSW({ immediate: true })

  Browser->>Runtime: beforeinstallprompt
  Runtime->>Runtime: Store deferredInstallPrompt
  Runtime->>Browser: Set data-kg-installable=1

  Browser->>Runtime: appinstalled
  Runtime->>Store: Toast "App installed"

  SW->>Runtime: onOfflineReady
  Runtime->>Store: Toast "Application assets cached"

  SW->>Runtime: onRegisteredSW
  Runtime->>SW: registration.update()
  Browser->>Runtime: foreground or online after bounded interval
  Runtime->>SW: registration.update()
```

---

## Install Button

### Location: Toolbar (after theme toggle)

**Visibility guard**: `MutationObserver` on `data-kg-installable` attribute → `isInstallable` state.

**Click handler**: Calls `promptPwaInstall()` which triggers the native install dialog.

**Icon**: `Download` from lucide-react.

**Label**: `UI_LABELS.installApp` = `"Install App"`.

---

## Web Share Target

### Manifest Declaration

```json
{
  "share_target": {
    "action": "./?share=1",
    "method": "GET",
    "params": { "title": "title", "text": "text", "url": "url" }
  }
}
```

### Handler: `CanvasQueryBootstrapRuntime`

**Trigger**: URL contains `?share=1` on app launch.

**Behavior**:
1. Read `title`, `text`, `url` query params
2. Show toast with shared content (`pwa:share-received`, 8s TTL)
3. Clean all share params from URL via `history.replaceState`
4. Guard against double-handling with `handledShareRef`

---

## Cloudflare Headers

| Path | Header | Value | Rationale |
|------|--------|-------|-----------|
| `/agenticgraph/sw.js` | `Cache-Control` | `no-cache, no-store, must-revalidate` | Prevent stale AgenticGraph SW |
| `/agenticgraph/agenticgraph-service-worker-revision.js` | `Cache-Control` | `no-cache, no-store, must-revalidate` | Bind the active worker to one exact release revision |
| `/agenticgraph/agenticgraph-chat-stream-sw.js` | `Cache-Control` | `no-cache, no-store, must-revalidate` | Prevent stale imported worker lifecycle code |
| `/agenticgraph/manifest.webmanifest` | `Cache-Control` | `no-cache, no-store, must-revalidate` | Instant manifest updates |
| `/agenticgraph/apple-touch-icon.png` | `Cache-Control` | `public, max-age=86400` | 1-day icon cache |

`canvas/public/_headers` remains a build-time preview artifact, but deployed authority lives in
the shared Pages root `huijoohwee/_headers`. Nested mirrored `_headers` files inside
`content/agenticgraph` are not authoritative and should be excluded from publish sync.

---

## iOS-Specific Support

| Feature | Implementation |
|---------|---------------|
| Home screen icon | `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />` |
| App capable | `<meta name="apple-mobile-web-app-capable" content="yes" />` |
| Status bar | `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />` |
| Title | `<meta name="apple-mobile-web-app-title" content="agenticgraph" />` |
| Icon format | 180x180 PNG (brand palette: `#0A0B0D` bg, `#32F08C` diamond) |

---

## Dev-Mode Safeguard

In development (`!import.meta.env.PROD`), `main.tsx` unregisters all existing service workers on localhost to prevent stale Vite dependency chunks from being served by a cached production SW.

---

## Regression Tests

The static PWA contract remains in `pipelinePwaEnhancementsRegression.test.ts`; the generated
worker activation authority has a direct Node test, and production release carries a persistent browser profile from
the old Pages production worker through the new protected deployment. The profile origin is the stable
Cloudflare Pages production alias derived from `CLOUDFLARE_PAGES_PROJECT`; it stays same-origin
across the deployment and does not depend on custom-domain challenge behavior in hosted CI.

| Test | Assertions |
|------|-----------|
| `testPwaShellPrecachesHashedAssetsAndCachesLocalJson` | Precache glob, no HTML/navigation fallback, exclusions, runtime cache, shortcuts, apple-touch-icon, share_target |
| `testPwaRuntimeTracksStandaloneInstallAndUpdateState` | Display modes, appinstalled, DOM attributes, registration-bound revision update owner, worker-owned activation cleanup, beforeinstallprompt, deferred install exports |
| `serviceWorkerRevisionUpdateOwner.test.ts` | Immediate registration update, bounded online/foreground refresh, prompt online retry after a failed update, active-worker revision attestation, listener disposal |
| `service-worker-import-attestation.test.mjs` | Worker activation removes extensionless/response-typed HTML and prior-revision assets after current-precache admission while preserving current and sibling-app entries; cleanup fails closed when admission is unavailable |
| `verify-production-service-worker-upgrade.mjs` | Same Chrome profile on the configured stable Pages production origin, deliberately seeded stale runtime/extensionless-HTML entries, revision-bound worker imports, active/controller revision plus chat-schema attestations, singular canonical registration, exact revision across all CacheStorage assets, no cached or module-keyed HTML, no installing/waiting legacy worker, upgrade-tab error capture, preserved localStorage/IndexedDB, network-owned HTML |
| `testPwaIndexHtmlIncludesInstallMeta` | apple-touch-icon link, manifest link, base-aware manifest path |
| `testPwaHeadersIncludeSwAndManifestCacheControl` | sw.js headers, Service-Worker-Allowed, manifest headers |
| `testPwaToolbarInstallButtonWiresDeferredPrompt` | Toolbar imports, installable state, UI_LABELS |
| `testPwaShareQueryParamsHandledInBootstrap` | Query param constants, bootstrap import, toast, URL cleanup |

---

## CID Reference Table

| Context | Intent | Directive |
|---------|--------|-----------|
| Assets | Cache hashed production assets | Precache `assets/*.{js,css,woff,woff2,ttf}`; exclude oversized Monaco/Mermaid bundles |
| Headers | Prevent stale SW, imported worker, and manifest | Set `no-store` on `sw.js`, `agenticgraph-chat-stream-sw.js`, and `manifest.webmanifest`; add `Service-Worker-Allowed: /` |
| Icons | Support cross-platform install | Provide SVG favicon (any, maskable) and 180x180 PNG apple-touch-icon |
| Install | Enable deferred install UX | Capture `beforeinstallprompt`, export `promptPwaInstall()`, render toolbar button conditionally |
| Manifest | Declare PWA identity and capabilities | Single manifest with name, icons, shortcuts, display override, share_target |
| Cache | Cache revision-bound assets without an HTML variant | Precache hashed assets; runtime-cache scripts/styles/images/fonts; never cache or fall back to `index.html` |
| Runtime | Track PWA state and refresh the canonical worker | Publish display/install/asset-cache state; call `registration.update()` at registration and bounded online/foreground recovery; let the activating worker prune cached HTML and prior-revision asset namespaces after current-precache admission |
| Share | Receive shared content via Web Share API | Declare `share_target` in manifest; handle `?share=1` params in bootstrap runtime; show toast; clean URL |
| iOS | Support Add to Home Screen | Add apple-touch-icon link, mobile-web-app-capable meta, black-translucent status bar |
| Dev | Prevent stale SW in development | Unregister all SWs on localhost when not in production |
| Tests | Guard PWA and release convergence | Source regression, generated activation-authority test, and same-profile proof bound to one canonical worker plus one exact-revision precache |
