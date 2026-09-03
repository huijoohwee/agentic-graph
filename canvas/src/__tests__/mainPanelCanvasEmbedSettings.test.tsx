import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import {
  CANVAS_EMBED_SETTINGS_ROW_COUNT,
  CanvasEmbedSettingsRows,
  matchesCanvasEmbedQuery,
} from '@/features/panels/views/CanvasEmbedSettingsRows'
import {
  CANONICAL_STARTUP_CANVAS_EMBED_URL,
  readCanvasEmbedIframeSrc,
} from '@/features/canvas/canvasEmbedImportContract'
import {
  CANONICAL_STARTUP_DOCUMENT_PATH,
  normalizeLiveCanvasHeroCanvasEmbedUrl,
  resolveCanonicalStartupCanvasEmbedRuntimeUrl,
} from '@/features/canvas/canvasEmbedPresets'
import { buildDefaultDocViewUrl } from '@/features/canvas/canvasDocDeepLink'
import { decodePublishedDocShareToken } from '@/features/canvas/canvasDocShareToken.mjs'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForFrames } from '@/tests/lib/reactRootHarness'
import { readLiveCanvasHeroSourceSelection, LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT } from '@/features/canvas/liveCanvasHeroSourceSelection'

export async function testMainPanelCanvasEmbedSettingsReuseSharedImportPanel(): Promise<void> {
  if (CANVAS_EMBED_SETTINGS_ROW_COUNT !== 1) throw new Error('expected one Canvas Embed settings row')
  if (!CANONICAL_STARTUP_CANVAS_EMBED_URL.startsWith('https://airvio.co/agentic-graph/share/')) {
    throw new Error('expected the canonical startup share URL to remain source-backed')
  }
  const canonicalUrl = new URL(CANONICAL_STARTUP_CANVAS_EMBED_URL)
  for (const rendererParam of ['kgCanvasSurfaceMode', 'kgCanvasRenderMode', 'kgCanvas2dRenderer', 'openEditorWorkspace']) {
    if (canonicalUrl.searchParams.has(rendererParam)) {
      throw new Error(`expected the startup document frontmatter to own ${rendererParam}`)
    }
  }
  const identity = decodePublishedDocShareToken(canonicalUrl.pathname.split('/').pop())
  if (identity?.canonicalPath !== CANONICAL_STARTUP_DOCUMENT_PATH || identity.workspaceId !== null) {
    throw new Error(`expected the canonical embed token to resolve the Physics Playground, got ${JSON.stringify(identity)}`)
  }
  const migratedLegacySelection = normalizeLiveCanvasHeroCanvasEmbedUrl(
    `${CANONICAL_STARTUP_CANVAS_EMBED_URL}?kgPreview=1&kgLiveHero=1&kgCanvasSurfaceMode=2d&kgCanvasRenderMode=2d&kgCanvas2dRenderer=storyboard&openEditorWorkspace=1`,
  )
  const migratedCanonicalUrl = new URL(migratedLegacySelection)
  if (migratedCanonicalUrl.searchParams.get('kgPreview') !== '1') {
    throw new Error('expected the canonical Physics Playground frame to remain isolated from persisted workspace chrome')
  }
  for (const staleParam of ['kgLiveHero', 'kgCanvasSurfaceMode', 'kgCanvasRenderMode', 'kgCanvas2dRenderer', 'openEditorWorkspace']) {
    if (migratedCanonicalUrl.searchParams.has(staleParam)) {
      throw new Error(`expected the Physics Playground frontmatter to replace stale ${staleParam} overrides`)
    }
  }
  const localRuntimeEmbed = resolveCanonicalStartupCanvasEmbedRuntimeUrl('http://localhost:5174')
  if (!localRuntimeEmbed.startsWith('http://localhost:5174/agentic-graph/share/') || new URL(localRuntimeEmbed).searchParams.get('kgPreview') !== '1') {
    throw new Error(`expected Dev to mirror the canonical share token through its same-origin runtime, got ${localRuntimeEmbed}`)
  }
  const candidateRuntimeEmbed = resolveCanonicalStartupCanvasEmbedRuntimeUrl('https://1234abcd.joohwee.pages.dev')
  if (!candidateRuntimeEmbed.startsWith('https://1234abcd.joohwee.pages.dev/agentic-graph/share/') || new URL(candidateRuntimeEmbed).searchParams.get('kgPreview') !== '1') {
    throw new Error(`expected an exact Pages deployment to retain its same-deployment canvas, got ${candidateRuntimeEmbed}`)
  }
  const previousStorageBaseUrl = process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = 'https://airvio.co'
  try {
    const productionDocUrl = buildDefaultDocViewUrl(CANONICAL_STARTUP_DOCUMENT_PATH)
    if (!productionDocUrl.startsWith('https://airvio.co/api/storage/doc-default/')) {
      throw new Error(`expected candidate document hydration to use the canonical storage owner, got ${productionDocUrl}`)
    }
  } finally {
    if (typeof previousStorageBaseUrl === 'string') process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = previousStorageBaseUrl
    else delete process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  }
  if (readCanvasEmbedIframeSrc(`<iframe src="${CANONICAL_STARTUP_CANVAS_EMBED_URL}"></iframe>`) !== CANONICAL_STARTUP_CANVAS_EMBED_URL) {
    throw new Error('expected the canonical Physics Playground URL to use the shared iframe parser')
  }
  if (!matchesCanvasEmbedQuery('iframe postmessage') || !matchesCanvasEmbedQuery('physics xr') || matchesCanvasEmbedQuery('unrelated-provider')) {
    throw new Error('expected Canvas Embed settings search to stay scoped to the embed contract')
  }

  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  let selectedEmbedUrl = ''
  const selectionListener = (event: Event) => {
    selectedEmbedUrl = readLiveCanvasHeroSourceSelection(event)?.embedUrl || ''
  }
  dom.window.addEventListener(LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, selectionListener)
  try {
    await mountReactRoot(root, <CanvasEmbedSettingsRows />, { window: dom.window as unknown as Window, frames: 1 })
    const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]
    const importButton = buttons.find(button => button.textContent?.trim() === 'Import canvas embed')
    if (!importButton) throw new Error('expected MainPanel Settings to expose Import canvas embed')
    const presetButton = buttons.find(button => button.textContent?.trim() === 'Use Physics Playground background')
    if (!presetButton) throw new Error('expected MainPanel Settings to expose the Physics Playground startup preset')
    await act(async () => {
      presetButton.click()
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    const selectedUrl = new URL(selectedEmbedUrl)
    if (!selectedUrl.pathname.startsWith('/agentic-graph/share/')
      || selectedUrl.searchParams.get('kgPreview') !== '1'
      || selectedUrl.searchParams.has('kgCanvas2dRenderer')
      || selectedUrl.searchParams.has('openEditorWorkspace')) {
      throw new Error(`expected the preset to preserve the canonical frontmatter-owned Physics Playground identity, got ${selectedEmbedUrl}`)
    }
    await act(async () => {
      importButton.click()
      await waitForFrames(dom.window as unknown as Window, 1)
    })
    const panel = container.querySelector('[aria-label="Import canvas embed panel"]')
    if (!panel || !panel.textContent?.includes('iframe + postMessage')) {
      throw new Error('expected MainPanel Settings to reuse the shared iframe and postMessage import panel')
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    dom.window.removeEventListener(LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, selectionListener)
    container.remove()
    restore()
  }
}
