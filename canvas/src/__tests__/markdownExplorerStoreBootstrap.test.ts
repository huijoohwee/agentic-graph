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
  const { restore } = initJsdomHarness()
  try {
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
    if (readLocalDocDeepLinkPathFromCurrentLocation() !== '/docs/README.md') {
      throw new Error('expected the live local document URL to remain the reload source of truth')
    }

    useMarkdownExplorerStore.getState().setActivePath('/docs/README.md')
    if (readLocalDocDeepLinkPathFromCurrentLocation() !== '/docs/README.md') {
      throw new Error('expected selecting the address-bar document not to clear its reload intent')
    }
    useMarkdownExplorerStore.getState().setActivePath('/docs/other.md')
    if (readLocalDocDeepLinkPathFromCurrentLocation() !== '/docs/README.md') {
      throw new Error('expected the address-bar document to remain authoritative until the URL changes')
    }
    if (window.history.state?.routerKey !== 'preserved') {
      throw new Error('expected local document URL stability to preserve unrelated history state')
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
    useMarkdownExplorerStore.getState().setActivePath(previousActivePath)
    restore()
  }
}
