import { encodePublishedDocShareToken } from '@/features/canvas/canvasDocShareToken.mjs'
import {
  readPersistedLiveCanvasHeroSourceSelection,
  resolveLiveCanvasHeroSourceSelection,
  selectLiveCanvasHeroSource,
} from '@/features/canvas/liveCanvasHeroSourceSelection'
import { LIVE_CANVAS_HERO_SOURCE_SESSION_KEY } from '@/features/canvas/liveCanvasHeroSourceSelectionContract.mjs'
import {
  CANONICAL_STARTUP_DOCUMENT_PATH,
  resolveCanonicalStartupCanvasEmbedRuntimeUrl,
} from '@/features/canvas/canvasEmbedPresets'
import { XR_PHYSICS_DEMO_REPO_REL_PATH } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const buildPublishedCanvasEmbedUrl = (canonicalPath: string, workspaceId?: string | null): string => (
  `https://airvio.co/agenticgraph/share/${encodePublishedDocShareToken({ canonicalPath, workspaceId })}`
)

export function testLiveCanvasHeroSelectionIdentityCleansStaleCanonicalVariants(): void {
  const { dom, restore } = initJsdomHarness()
  try {
    const conflictingEmbedUrl = buildPublishedCanvasEmbedUrl('docs/conflicting-xr-scene.md')
    dom.window.sessionStorage.setItem(LIVE_CANVAS_HERO_SOURCE_SESSION_KEY, JSON.stringify({
      sourcePath: CANONICAL_STARTUP_DOCUMENT_PATH,
      embedUrl: conflictingEmbedUrl,
    }))
    if (readPersistedLiveCanvasHeroSourceSelection() !== null) {
      throw new Error('expected conflicting persisted Home source identity to fail closed')
    }
    if (dom.window.sessionStorage.getItem(LIVE_CANVAS_HERO_SOURCE_SESSION_KEY) !== null) {
      throw new Error('expected conflicting persisted Home source identity to be removed at its owner')
    }

    const canonicalLocalPath = XR_PHYSICS_DEMO_REPO_REL_PATH
    dom.window.sessionStorage.setItem(LIVE_CANVAS_HERO_SOURCE_SESSION_KEY, JSON.stringify({
      sourcePath: canonicalLocalPath,
      embedUrl: `${dom.window.location.origin}/agenticgraph/?kgDoc=${encodeURIComponent(canonicalLocalPath)}&kgPreview=1&kgLiveHero=1`,
    }))
    const migrated = readPersistedLiveCanvasHeroSourceSelection()
    const expectedCanonicalUrl = resolveCanonicalStartupCanvasEmbedRuntimeUrl(dom.window.location.origin)
    if (migrated?.sourcePath !== CANONICAL_STARTUP_DOCUMENT_PATH || migrated.embedUrl !== expectedCanonicalUrl) {
      throw new Error(`expected canonical local alias to migrate to the published source owner, got ${JSON.stringify(migrated)}`)
    }
    if (dom.window.sessionStorage.getItem(LIVE_CANVAS_HERO_SOURCE_SESSION_KEY) !== JSON.stringify(migrated)) {
      throw new Error('expected canonical migration to rewrite persisted storage instead of suppressing its stale value')
    }

    const canonicalWorkspaceShare = buildPublishedCanvasEmbedUrl(CANONICAL_STARTUP_DOCUMENT_PATH, 'conflicting-workspace')
    if (resolveLiveCanvasHeroSourceSelection({
      sourcePath: CANONICAL_STARTUP_DOCUMENT_PATH,
      embedUrl: canonicalWorkspaceShare,
    })) {
      throw new Error('expected a workspace-scoped canonical path alias to fail closed')
    }
    if (resolveLiveCanvasHeroSourceSelection({
      sourcePath: CANONICAL_STARTUP_DOCUMENT_PATH,
      embedUrl: `${conflictingEmbedUrl}?kgDoc=${encodeURIComponent(CANONICAL_STARTUP_DOCUMENT_PATH)}`,
    })) {
      throw new Error('expected simultaneous local and published source authorities to fail closed')
    }
    if (resolveLiveCanvasHeroSourceSelection({
      sourcePath: '/docs/shared-canvas.md',
      embedUrl: buildPublishedCanvasEmbedUrl('docs/other-canvas.md'),
    })) {
      throw new Error('expected source path and published token mismatch to fail closed')
    }
    if (resolveLiveCanvasHeroSourceSelection({
      sourcePath: '/docs/shared-canvas.md',
      embedUrl: 'https://airvio.co/agenticgraph/share/kg-public-token',
    })) {
      throw new Error('expected malformed first-party share tokens to fail closed')
    }
    const sharedToken = encodePublishedDocShareToken({ canonicalPath: 'docs/shared-canvas.md' })
    const otherToken = encodePublishedDocShareToken({ canonicalPath: 'docs/other-canvas.md' })
    if (resolveLiveCanvasHeroSourceSelection({
      sourcePath: '/docs/shared-canvas.md',
      embedUrl: `https://airvio.co/agenticgraph/share/${sharedToken}?kgShare=${otherToken}`,
    })) {
      throw new Error('expected conflicting path and query share claims to fail closed')
    }
    if (resolveLiveCanvasHeroSourceSelection({
      sourcePath: '/docs/shared-canvas.md',
      embedUrl: 'https://airvio.co/?kgPath=%2Fagenticgraph%2Fshare%2Fkg-public-token',
    })) {
      throw new Error('expected malformed published kgPath claims to fail closed')
    }
    if (resolveLiveCanvasHeroSourceSelection({
      sourcePath: '/docs/shared-canvas.md',
      embedUrl: `https://airvio.co/?kgDoc=docs%2Fshared-canvas.md&kgDoc=docs%2Fother-canvas.md`,
    })) {
      throw new Error('expected duplicate conflicting local document claims to fail closed')
    }
    const storedCanonicalSelection = dom.window.sessionStorage.getItem(LIVE_CANVAS_HERO_SOURCE_SESSION_KEY)
    if (selectLiveCanvasHeroSource({
      sourcePath: '/docs/shared-canvas.md',
      embedUrl: buildPublishedCanvasEmbedUrl('docs/other-canvas.md'),
    })) {
      throw new Error('expected a rejected direct selection to dispatch no source mutation')
    }
    if (dom.window.sessionStorage.getItem(LIVE_CANVAS_HERO_SOURCE_SESSION_KEY) !== storedCanonicalSelection) {
      throw new Error('expected a rejected direct selection to preserve the prior valid source')
    }
    const external = resolveLiveCanvasHeroSourceSelection({
      sourcePath: '/custom/external-canvas',
      embedUrl: 'https://example.com/external-canvas',
    })
    if (external?.sourcePath !== '/custom/external-canvas') {
      throw new Error('expected explicit opaque external embeds to retain their noncanonical identity')
    }
  } finally {
    restore()
  }
}
