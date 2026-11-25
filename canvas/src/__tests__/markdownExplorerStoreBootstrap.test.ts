import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useLocation } from 'react-router-dom'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { DOCS_SSOT_VALIDATION_WORKSPACE_PATH } from '@/tests/lib/docsSsotFixture'
import {
  resolveInitialMarkdownExplorerActivePath,
  useMarkdownExplorerStore,
} from '@/features/markdown-explorer/store'
import {
  consumeDeepLinkParams,
  readLocalDocDeepLinkPathFromCurrentLocation,
} from '@/features/canvas/canvasDocDeepLink'
import {
  WORKSPACE_README_SEED_PATH,
  XR_PHYSICS_WORKSPACE_SEED_PATH,
} from '@/features/workspace-fs/workspaceFs'

export async function testMarkdownExplorerStoreBootstrapDistinguishesDeepLinksFromPersistedPaths() {
  const previousActivePath = useMarkdownExplorerStore.getState().activePath
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const observedSearches: string[] = []
  const LocationProbe = () => {
    const location = useLocation()
    observedSearches.push(location.search)
    return React.createElement('output', null, location.search)
  }
  try {
    window.history.replaceState({ routerKey: 'preserved' }, '', '/?kgReleaseProof=test-proof')
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(LocationProbe)))
    })
    await act(async () => {
      useMarkdownExplorerStore.getState().setActivePath(XR_PHYSICS_WORKSPACE_SEED_PATH)
    })
    const expectedSearch = `?kgReleaseProof=test-proof&kgDoc=${encodeURIComponent(XR_PHYSICS_WORKSPACE_SEED_PATH.replace(/^\/+/, ''))}`
    if (!observedSearches.includes(expectedSearch)) {
      throw new Error(`Expected local document URL synchronization to notify the router, got ${JSON.stringify(observedSearches)}`)
    }
    if (window.location.search !== expectedSearch) {
      throw new Error(`Expected the browser URL to retain the local document intent, got ${window.location.search}`)
    }
    if (window.history.state?.routerKey !== 'preserved') {
      throw new Error('Expected router-visible local document synchronization to preserve unrelated history state')
    }
    await act(async () => {
      useMarkdownExplorerStore.getState().setActivePath(null)
    })
    if (!observedSearches.includes('?kgReleaseProof=test-proof')) {
      throw new Error(`Expected clearing the local document selection to notify the router, got ${JSON.stringify(observedSearches)}`)
    }

    const readNormalizedLocalDocPath = () => resolveInitialMarkdownExplorerActivePath(
      readLocalDocDeepLinkPathFromCurrentLocation(),
      'deep-link',
    )
    const readme = resolveInitialMarkdownExplorerActivePath(WORKSPACE_README_SEED_PATH)
    if (readme !== null) {
      throw new Error(`expected persisted README initialization path to be ignored on cold boot, got ${String(readme)}`)
    }

    const videoDemo = resolveInitialMarkdownExplorerActivePath(DOCS_SSOT_VALIDATION_WORKSPACE_PATH)
    if (videoDemo !== null) {
      throw new Error(`expected persisted video-demo initialization path to be ignored on cold boot, got ${String(videoDemo)}`)
    }

    const persistedXrDemo = resolveInitialMarkdownExplorerActivePath(XR_PHYSICS_WORKSPACE_SEED_PATH)
    if (persistedXrDemo !== null) {
      throw new Error(`expected persisted XR initialization path to be ignored on cold boot, got ${String(persistedXrDemo)}`)
    }

    const linkedDocsReadme = resolveInitialMarkdownExplorerActivePath('/docs/README.md', 'deep-link')
    if (linkedDocsReadme !== '/docs/README.md') {
      throw new Error(`expected explicit docs README deep link to initialize the explorer, got ${String(linkedDocsReadme)}`)
    }

    const linkedXrDemo = resolveInitialMarkdownExplorerActivePath(XR_PHYSICS_WORKSPACE_SEED_PATH, 'deep-link')
    if (linkedXrDemo !== XR_PHYSICS_WORKSPACE_SEED_PATH) {
      throw new Error(`expected explicit XR deep link to initialize the explorer, got ${String(linkedXrDemo)}`)
    }

    const custom = resolveInitialMarkdownExplorerActivePath('/notes/custom.md')
    if (custom !== '/notes/custom.md') {
      throw new Error(`expected custom workspace path to remain restorable, got ${String(custom)}`)
    }

    window.history.replaceState({ routerKey: 'preserved' }, '', '/?kgDoc=%2Fdocs%2FREADME.md&kgPreview=1')
    consumeDeepLinkParams(window.location.search)
    if (window.location.search !== '?kgDoc=%2Fdocs%2FREADME.md&kgPreview=1') {
      throw new Error(`expected local document URLs to remain shareable after bootstrap, got ${window.location.search}`)
    }
    if (window.history.state?.routerKey !== 'preserved') {
      throw new Error('expected stable local document URLs to preserve existing history state')
    }
    if (readNormalizedLocalDocPath() !== '/docs/README.md') {
      throw new Error('expected the live local document URL to remain the reload source of truth')
    }

    useMarkdownExplorerStore.getState().setActivePath('/docs/README.md')
    if (readNormalizedLocalDocPath() !== '/docs/README.md') {
      throw new Error('expected selecting the address-bar document not to clear its reload intent')
    }
    useMarkdownExplorerStore.getState().setActivePath('/docs/other.md')
    if (readNormalizedLocalDocPath() !== '/docs/other.md') {
      throw new Error('expected selecting a different document to update the address-bar URL')
    }
    if (window.history.state?.routerKey !== 'preserved') {
      throw new Error('expected local document URL stability to preserve unrelated history state')
    }
    useMarkdownExplorerStore.getState().setActivePath('/docs/bootstrap-only.md', { syncUrl: false })
    if (readNormalizedLocalDocPath() !== '/docs/other.md') {
      throw new Error('expected syncUrl=false to preserve the previous local document deep link')
    }
    if (useMarkdownExplorerStore.getState().activePath !== '/docs/bootstrap-only.md') {
      throw new Error('expected syncUrl=false to keep the explorer selection itself')
    }

    window.history.replaceState({ routerKey: 'preserved' }, '', '/?kgDoc=%2Fdocs%2Fold-local.md')
    consumeDeepLinkParams(window.location.search)
    window.history.replaceState(window.history.state, '', '/?kgPath=%2Fdoc%2Fworkspace-1%2Fdocs%2Fremote.md')
    if (readLocalDocDeepLinkPathFromCurrentLocation() !== null) {
      throw new Error('expected an explicit remote document link to suppress retained local document intent')
    }
    consumeDeepLinkParams(window.location.search)
    if (readLocalDocDeepLinkPathFromCurrentLocation() !== null) {
      throw new Error('expected remote document consumption to clear stale retained local document intent')
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    useMarkdownExplorerStore.getState().setActivePath(previousActivePath, { syncUrl: false })
    restore()
  }
}
