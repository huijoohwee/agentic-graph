import path from 'node:path'
import os from 'node:os'
import fsPromises from 'node:fs/promises'
import {
  readWorkspaceSelectionEntryTextForActivePath,
  readWorkspaceSelectionResolvedTextForActivePath,
  shouldAcceptWorkspaceDocumentSelectionText,
  shouldHydrateStableWorkspaceSelectionText,
} from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceSelection'
import { resolveStableWorkspaceSelectionSyncDecision } from '@/lib/markdown-workspace-runtime/markdownWorkspaceDocumentSwitchApply'
import {
  readCachedWorkspaceSelectionResolvedTextForActivePath,
  type MarkdownWorkspaceSelectionResolvedTextCache,
} from '@/lib/markdown-workspace-runtime/markdownWorkspaceSelectionResolvedText'
import { resolveAuthoritativeWorkspaceText, writeWorkspaceFileAndSync } from '@/lib/markdown-workspace-runtime/markdownWorkspaceRuntime.io'
import { resolveMarkdownWorkspaceApplyText } from '@/lib/markdown-workspace-runtime/markdownWorkspaceApply'
import { preferCanonicalYamlFrontmatterFencedText } from '@/lib/markdown/frontmatter'
import { buildActiveMarkdownDocumentPayload } from '@/features/markdown/activeMarkdownDocument'
import { useGraphStore } from '@/hooks/useGraphStore'
import { shouldCommitResolvedActiveMarkdownText } from '@/features/source-files/sourceFilesRuntimeMaterialization'
import { upsertWorkspaceDocsMirrorText } from '@/features/workspace-fs/workspaceSeedProvider'
import type { WorkspaceEntry, WorkspaceFs } from '@/features/workspace-fs/types'

const FENCED_FRONTMATTER_MARKDOWN = [
  '---',
  'title: Demo',
  'flow:',
  '  nodes:',
  '    - id: root',
  '      label: Root',
  '---',
  '',
  '# Demo',
].join('\n')

const UNFENCED_FRONTMATTER_MARKDOWN = [
  'title: Demo',
  'flow:',
  '  nodes:',
  '    - id: root',
  '      label: Root',
  '',
  '# Demo',
].join('\n')

export function testWorkspaceDocumentSelectionAcceptsEmptyRealFileText() {
  const accepted = shouldAcceptWorkspaceDocumentSelectionText({
    activePath: '/chat-log/kgc_20260527193000.md' as never,
    activeEntryKind: 'file',
    activeDocumentKey: '/chat-log/kgc_20260527193000.md',
    text: '',
  })
  if (accepted !== true) {
    throw new Error(`expected empty real workspace file text to remain eligible for document-switch apply, got ${String(accepted)}`)
  }
}

export function testWorkspaceDocumentSelectionAcceptsEmptyPendingWorkspaceFileText() {
  const accepted = shouldAcceptWorkspaceDocumentSelectionText({
    activePath: '/chat-log/kgc_20260527193000.md' as never,
    activeEntryKind: '' as never,
    activeDocumentKey: '/chat-log/kgc_20260527193000.md',
    text: '',
  })
  if (accepted !== true) {
    throw new Error(`expected empty pending workspace file text to remain eligible for document-switch apply, got ${String(accepted)}`)
  }
}

export function testWorkspaceDocumentSelectionRejectsEmptyNonFileText() {
  const accepted = shouldAcceptWorkspaceDocumentSelectionText({
    activePath: '/chat-log/kgc_20260527193000.md' as never,
    activeEntryKind: 'folder',
    activeDocumentKey: '/chat-log/kgc_20260527193000.md',
    text: '',
  })
  if (accepted !== false) {
    throw new Error(`expected non-file workspace selection not to apply empty document text, got ${String(accepted)}`)
  }
}

export function testClosedPaneReapplyCommitsEmptyKnownWorkspaceFile() {
  const accepted = shouldCommitResolvedActiveMarkdownText({
    activePath: '/chat-log/kgc_20260527193000.md' as never,
    resolvedText: '',
    activeWorkspaceEntriesSnapshot: [{
      path: '/chat-log/kgc_20260527193000.md' as never,
      parentPath: '/chat-log' as never,
      kind: 'file',
      name: 'kgc_20260527193000.md',
      text: '',
      updatedAtMs: 1,
    }],
  })
  if (accepted !== true) {
    throw new Error(`expected closed-pane reapply to commit an empty known workspace file, got ${String(accepted)}`)
  }
}

export function testWorkspaceSelectionHydratesStableActivePathAfterRefresh() {
  const accepted = shouldHydrateStableWorkspaceSelectionText({
    activePath: '/chat-log/20260527T193000Z/kgc-trace_20260527T193000Z.md' as never,
    activeEntryKind: 'file',
    activeDocumentKey: '/chat-log/20260527T193000Z/kgc-trace_20260527T193000Z.md',
    currentText: '',
    nextText: '# restored after refresh',
    lastLoadedPath: null,
    userEditedActiveText: false,
  })
  if (accepted !== true) {
    throw new Error(`expected stable active workspace path hydration to restore visible text after refresh, got ${String(accepted)}`)
  }
}

export function testWorkspaceSelectionHydrationYieldsToUnsavedUserDraft() {
  const accepted = shouldHydrateStableWorkspaceSelectionText({
    activePath: '/chat-log/20260527T193000Z/kgc-trace_20260527T193000Z.md' as never,
    activeEntryKind: 'file',
    activeDocumentKey: '/chat-log/20260527T193000Z/kgc-trace_20260527T193000Z.md',
    currentText: 'my local draft',
    nextText: '# streamed text',
    lastLoadedPath: '/chat-log/20260527T193000Z/kgc-trace_20260527T193000Z.md' as never,
    userEditedActiveText: true,
  })
  if (accepted !== false) {
    throw new Error(`expected stable active workspace hydration to yield to an unsaved user draft, got ${String(accepted)}`)
  }
}

export function testStableWorkspaceSelectionSyncYieldsEditorAndCanvasToAuthoredText() {
  const decision = resolveStableWorkspaceSelectionSyncDecision({
    activePath: '/docs/demo.md' as never,
    activeEntryKind: 'file',
    activeDocumentKey: 'docs/demo.md',
    currentText: '# Demo\n\nremote collaboration marker',
    nextText: '# Demo',
    lastLoadedPath: '/docs/demo.md' as never,
    userEditedActiveText: true,
    markdownDocumentName: 'docs/demo.md',
    markdownDocumentText: '# Demo\n\nremote collaboration marker',
    graphDataSource: 'markdown:docs/demo.md',
  })
  if (decision.hydrateText || decision.applyToCanvas) {
    throw new Error(`expected authored editor text to fence stale stable-selection sync, got ${JSON.stringify(decision)}`)
  }
}

export function testWorkspaceSelectionRejectsUnownedInlineTextDuringFileSwitch() {
  const tokenEntry: WorkspaceEntry = {
    path: '/docs/knowgrph-token-economics-model-demo.md',
    parentPath: '/docs',
    kind: 'file',
    name: 'knowgrph-token-economics-model-demo.md',
    text: '# Knowgrph Token Economics Model Demo',
    updatedAtMs: 1,
  }
  const selectedVideoPath = '/docs/knowgrph-video-demo.md'
  const resolved = readWorkspaceSelectionEntryTextForActivePath({
    activePath: selectedVideoPath,
    activeEntry: tokenEntry,
  })
  if (resolved !== '') {
    throw new Error(`expected token demo text not to hydrate the selected video demo path, got ${JSON.stringify(resolved.slice(0, 80))}`)
  }
}

export function testWorkspaceSelectionAcceptsOwnedInlineTextDuringFileSwitch() {
  const videoEntry: WorkspaceEntry = {
    path: '/docs/knowgrph-video-demo.md',
    parentPath: '/docs',
    kind: 'file',
    name: 'knowgrph-video-demo.md',
    text: '# Knowgrph Video Demo',
    updatedAtMs: 1,
  }
  const resolved = readWorkspaceSelectionEntryTextForActivePath({
    activePath: '/Users/example/project/docs/knowgrph-video-demo.md' as never,
    activeEntry: videoEntry,
  })
  if (resolved !== '# Knowgrph Video Demo') {
    throw new Error(`expected selected video demo path to hydrate from its own inline text, got ${JSON.stringify(resolved)}`)
  }
}

export async function testWorkspaceSelectionSwitchPrefersPathResolvedTextOverPollutedInlineText() {
  const pollutedVideoEntry: WorkspaceEntry = {
    path: '/docs/knowgrph-video-demo.md',
    parentPath: '/docs',
    kind: 'file',
    name: 'knowgrph-video-demo.md',
    text: '# Knowgrph Token Economics Model Demo',
    updatedAtMs: 1,
  }
  const resolved = await readWorkspaceSelectionResolvedTextForActivePath({
    activePath: '/docs/knowgrph-video-demo.md',
    activeEntry: pollutedVideoEntry,
    preferPathResolvedText: true,
    fs: {
      ensureSeed: async () => true,
      listEntries: async () => [],
      readFileText: async path => String(path || '') === '/docs/knowgrph-video-demo.md'
        ? '# Knowgrph Video Demo'
        : null,
      writeFileText: async () => {},
      createFile: async () => '/docs/new.md',
      createFolder: async () => '/docs/new-folder',
      deleteEntry: async () => {},
    },
  })
  if (resolved !== '# Knowgrph Video Demo') {
    throw new Error(`expected selected video demo path to prefer workspace storage text over polluted inline text, got ${JSON.stringify(resolved)}`)
  }
}

export async function testWorkspaceSelectionResolvedTextCacheCoalescesConcurrentSwitchReads() {
  const activePath = '/docs/knowgrph-video-demo.md'
  let readCalls = 0
  const fs: WorkspaceFs = {
    ensureSeed: async () => true,
    listEntries: async () => [],
    readFileText: async path => {
      readCalls += 1
      await new Promise(resolve => setTimeout(resolve, 0))
      return String(path || '') === activePath ? '# Knowgrph Video Demo' : null
    },
    writeFileText: async () => {},
    createFile: async () => '/docs/new.md',
    createFolder: async () => '/docs/new-folder',
    deleteEntry: async () => {},
  }
  const cacheRef: { current: MarkdownWorkspaceSelectionResolvedTextCache | null } = { current: null }
  const first = readCachedWorkspaceSelectionResolvedTextForActivePath({
    activePath,
    activeEntry: {
      path: activePath,
      parentPath: '/docs',
      kind: 'file',
      name: 'knowgrph-video-demo.md',
      text: '',
      updatedAtMs: 1,
    },
    fs,
    cacheRef,
  })
  const second = readCachedWorkspaceSelectionResolvedTextForActivePath({
    activePath,
    activeEntry: {
      path: activePath,
      parentPath: '/docs',
      kind: 'file',
      name: 'knowgrph-video-demo.md',
      text: '',
      updatedAtMs: 1,
    },
    fs,
    cacheRef,
  })
  const [firstText, secondText] = await Promise.all([first, second])
  if (firstText !== '# Knowgrph Video Demo' || secondText !== '# Knowgrph Video Demo') {
    throw new Error(`expected coalesced switch hydration to resolve active text, got ${JSON.stringify([firstText, secondText])}`)
  }
  if (readCalls !== 1) {
    throw new Error(`expected same-path switch hydration to read backing workspace once, got ${readCalls}`)
  }
  const retained = await readCachedWorkspaceSelectionResolvedTextForActivePath({
    activePath,
    activeEntry: {
      path: activePath,
      parentPath: '/docs',
      kind: 'file',
      name: 'knowgrph-video-demo.md',
      text: '',
      updatedAtMs: 1,
    },
    fs,
    cacheRef,
  })
  if (retained !== '# Knowgrph Video Demo' || readCalls !== 1) {
    throw new Error(`expected retained switch hydration result without another read, got text=${JSON.stringify(retained)} calls=${readCalls}`)
  }
}

export async function testWorkspaceSelectionSwitchPrefersCanonicalMirrorTextOverPollutedWorkspaceFs() {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'workspace-switch-docs-mirror-'))
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousStorageBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tempRoot
  delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  try {
    await fsPromises.writeFile(path.join(tempRoot, 'knowgrph-video-demo.md'), '# Knowgrph Video Demo')
    const pollutedVideoEntry: WorkspaceEntry = {
      path: '/docs/knowgrph-video-demo.md',
      parentPath: '/docs',
      kind: 'file',
      name: 'knowgrph-video-demo.md',
      text: '# Knowgrph Token Economics Model Demo',
      updatedAtMs: 1,
    }
    const resolved = await readWorkspaceSelectionResolvedTextForActivePath({
      activePath: '/docs/knowgrph-video-demo.md',
      activeEntry: pollutedVideoEntry,
      preferPathResolvedText: true,
      storageFallbackByPath: new Map<string, string>(),
      fs: {
        ensureSeed: async () => true,
        listEntries: async () => [],
        readFileText: async path => String(path || '') === '/docs/knowgrph-video-demo.md'
          ? '# Knowgrph Token Economics Model Demo'
          : null,
        writeFileText: async () => {},
        createFile: async () => '/docs/new.md',
        createFolder: async () => '/docs/new-folder',
        deleteEntry: async () => {},
      },
    })
    if (resolved !== '# Knowgrph Video Demo') {
      throw new Error(`expected selected video demo path to prefer canonical mirror text over polluted workspace fs text, got ${JSON.stringify(resolved)}`)
    }
  } finally {
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousStorageBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousStorageBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    await fsPromises.rm(tempRoot, { recursive: true, force: true })
  }
}

export async function testWorkspaceSelectionCanonicalMirrorRefreshesAfterExternalFileChange() {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'workspace-switch-docs-mirror-refresh-'))
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousStorageBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tempRoot
  delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  try {
    const mirrorFile = path.join(tempRoot, 'knowgrph-video-demo.md')
    const fallbackByPath = new Map<string, string>()
    const pollutedVideoEntry: WorkspaceEntry = {
      path: '/docs/knowgrph-video-demo.md',
      parentPath: '/docs',
      kind: 'file',
      name: 'knowgrph-video-demo.md',
      text: '# Knowgrph Token Economics Model Demo',
      updatedAtMs: 1,
    }
    const fs = {
      ensureSeed: async () => true,
      listEntries: async () => [],
      readFileText: async () => '# Knowgrph Token Economics Model Demo',
      writeFileText: async () => {},
      createFile: async () => '/docs/new.md',
      createFolder: async () => '/docs/new-folder',
      deleteEntry: async () => {},
    }
    await fsPromises.writeFile(mirrorFile, '# Knowgrph Token Economics Model Demo')
    const staleResolved = await readWorkspaceSelectionResolvedTextForActivePath({
      activePath: '/docs/knowgrph-video-demo.md',
      activeEntry: pollutedVideoEntry,
      preferPathResolvedText: true,
      storageFallbackByPath: fallbackByPath,
      fs,
    })
    if (staleResolved !== '# Knowgrph Token Economics Model Demo') {
      throw new Error(`expected first canonical mirror read to use current mirror text, got ${JSON.stringify(staleResolved)}`)
    }

    await fsPromises.writeFile(mirrorFile, '# Knowgrph Video Demo')
    const refreshedResolved = await readWorkspaceSelectionResolvedTextForActivePath({
      activePath: '/docs/knowgrph-video-demo.md',
      activeEntry: pollutedVideoEntry,
      preferPathResolvedText: true,
      storageFallbackByPath: fallbackByPath,
      fs,
    })
    if (refreshedResolved !== '# Knowgrph Video Demo') {
      throw new Error(`expected canonical mirror reads to refresh after external file changes, got ${JSON.stringify(refreshedResolved)}`)
    }
  } finally {
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousStorageBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousStorageBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    await fsPromises.rm(tempRoot, { recursive: true, force: true })
  }
}

export async function testWorkspaceExplicitSavePrefersSelectedPathTextOverStaleEditorText() {
  const selectedPath = '/docs/knowgrph-token-economics-model-demo.md'
  const staleEditorText = '# Video Demo'
  const selectedFileText = '# Token Economics Demo'
  const resolved = await resolveAuthoritativeWorkspaceText({
    path: selectedPath as never,
    getFs: async () => ({
      ensureSeed: async () => true,
      listEntries: async () => [],
      readFileText: async path => String(path || '') === selectedPath ? selectedFileText : null,
      writeFileText: async () => {},
      createFile: async () => '/docs/new.md',
      createFolder: async () => '/docs/new-folder',
      deleteEntry: async () => {},
    }),
    lastLoadedRef: {
      current: {
        path: '/docs/knowgrph-video-demo.md' as never,
        text: staleEditorText,
      },
    },
    activeTextRef: { current: staleEditorText },
    userEditedActiveTextRef: { current: false },
  })
  if (resolved !== selectedFileText) {
    throw new Error(`expected explicit save to use selected path text instead of stale editor text, got ${JSON.stringify(resolved)}`)
  }
}

export async function testWorkspaceExplicitSavePreservesIntentionalBlankDraft() {
  const selectedPath = '/docs/knowgrph-token-economics-model-demo.md'
  const resolved = await resolveAuthoritativeWorkspaceText({
    path: selectedPath as never,
    getFs: async () => ({
      ensureSeed: async () => true,
      listEntries: async () => [],
      readFileText: async () => '# Token Economics Demo',
      writeFileText: async () => {},
      createFile: async () => '/docs/new.md',
      createFolder: async () => '/docs/new-folder',
      deleteEntry: async () => {},
    }),
    lastLoadedRef: {
      current: {
        path: selectedPath as never,
        text: '# Token Economics Demo',
      },
    },
    activeTextRef: { current: '' },
    userEditedActiveTextRef: { current: true },
  })
  if (resolved !== '') {
    throw new Error(`expected explicit save to preserve an intentional blank draft for the selected path, got ${JSON.stringify(resolved)}`)
  }
}

export function testMarkdownFrontmatterFenceHelperPrefersCanonicalWhenOnlyFenceLinesAreMissing() {
  const resolved = preferCanonicalYamlFrontmatterFencedText({
    candidateText: UNFENCED_FRONTMATTER_MARKDOWN,
    canonicalText: FENCED_FRONTMATTER_MARKDOWN,
  })
  if (resolved !== FENCED_FRONTMATTER_MARKDOWN) {
    throw new Error('expected matching frontmatter text without fences to resolve back to canonical fenced markdown')
  }

  const edited = UNFENCED_FRONTMATTER_MARKDOWN.replace('# Demo', '# Edited Demo')
  const editedResolved = preferCanonicalYamlFrontmatterFencedText({
    candidateText: edited,
    canonicalText: FENCED_FRONTMATTER_MARKDOWN,
  })
  if (editedResolved !== edited) {
    throw new Error('expected edited unfenced markdown to remain authoritative instead of being replaced by canonical text')
  }
}

export function testMarkdownWorkspaceApplyPreservesYamlFrontmatterFencesFromCanonicalDocument() {
  const resolved = resolveMarkdownWorkspaceApplyText({
    activeText: UNFENCED_FRONTMATTER_MARKDOWN,
    contentMode: 'document',
    widgetEditorText: '',
    markdownDocumentName: 'docs/demo.md',
    activeDocumentKey: 'docs/demo.md',
    markdownDocumentText: FENCED_FRONTMATTER_MARKDOWN,
  })
  if (resolved !== FENCED_FRONTMATTER_MARKDOWN) {
    throw new Error('expected markdown workspace apply to preserve canonical YAML frontmatter fences')
  }
}

export function testActiveMarkdownDocumentPayloadPreservesYamlFrontmatterFencesFromCanonicalText() {
  const payload = buildActiveMarkdownDocumentPayload({
    name: 'docs/demo.md',
    text: UNFENCED_FRONTMATTER_MARKDOWN,
    canonicalMarkdownText: FENCED_FRONTMATTER_MARKDOWN,
    normalizeWebpageFrontmatterToMarkdown: false,
  })
  if (payload.text !== FENCED_FRONTMATTER_MARKDOWN) {
    throw new Error('expected active markdown document payload to preserve canonical YAML frontmatter fences')
  }
}

export async function testSetActiveMarkdownDocumentPreservesYamlFrontmatterFencesFromCanonicalText() {
  const store = useGraphStore.getState()
  const previousName = store.markdownDocumentName
  const previousText = store.markdownDocumentText
  const previousApplyPreset = store.markdownDocumentApplyViewPreset
  try {
    store.setMarkdownDocument('docs/demo.md', FENCED_FRONTMATTER_MARKDOWN, {
      autoEnableFrontmatter: false,
      applyViewPreset: false,
    })
    await useGraphStore.getState().setActiveMarkdownDocument({
      name: 'docs/demo.md',
      text: UNFENCED_FRONTMATTER_MARKDOWN,
      canonicalMarkdownText: FENCED_FRONTMATTER_MARKDOWN,
      normalizeMermaidMmd: false,
      autoEnableFrontmatter: false,
      applyViewPreset: false,
      applyToGraph: false,
    })
    const after = useGraphStore.getState()
    if (after.markdownDocumentText !== FENCED_FRONTMATTER_MARKDOWN) {
      throw new Error('expected setActiveMarkdownDocument to reject same-document frontmatter fence loss')
    }
  } finally {
    useGraphStore.getState().setMarkdownDocument(previousName, previousText, {
      autoEnableFrontmatter: false,
      applyViewPreset: previousApplyPreset,
    })
  }
}

export async function testWorkspaceExplicitSavePreservesYamlFrontmatterFencesFromCanonicalLoadedText() {
  const resolved = await resolveAuthoritativeWorkspaceText({
    path: '/docs/demo.md' as never,
    getFs: async () => ({
      ensureSeed: async () => true,
      listEntries: async () => [],
      readFileText: async () => UNFENCED_FRONTMATTER_MARKDOWN,
      writeFileText: async () => {},
      createFile: async () => '/docs/new.md',
      createFolder: async () => '/docs/new-folder',
      deleteEntry: async () => {},
    }),
    lastLoadedRef: {
      current: {
        path: '/docs/demo.md' as never,
        text: FENCED_FRONTMATTER_MARKDOWN,
      },
    },
    activeTextRef: { current: UNFENCED_FRONTMATTER_MARKDOWN },
    userEditedActiveTextRef: { current: true },
  })
  if (resolved !== FENCED_FRONTMATTER_MARKDOWN) {
    throw new Error('expected explicit save to restore canonical YAML frontmatter fences when only fence lines are missing')
  }
}

export async function testWorkspaceWriteFileAndSyncPreservesYamlFrontmatterFencesBeforePersisting() {
  const writes: string[] = []
  let inlineText = ''
  const lastLoadedRef = {
    current: {
      path: '/docs/demo.md' as never,
      text: FENCED_FRONTMATTER_MARKDOWN,
    },
  }

  await writeWorkspaceFileAndSync({
    path: '/docs/demo.md' as never,
    text: UNFENCED_FRONTMATTER_MARKDOWN,
    getFs: async () => ({
      ensureSeed: async () => true,
      listEntries: async () => [],
      readFileText: async () => UNFENCED_FRONTMATTER_MARKDOWN,
      writeFileText: async (_path, text) => {
        writes.push(String(text || ''))
      },
      createFile: async () => '/docs/new.md',
      createFolder: async () => '/docs/new-folder',
      deleteEntry: async () => {},
    }),
    lastLoadedRef,
    patchWorkspaceEntryInlineText: (_path, text) => {
      inlineText = text
    },
    resetParsedState: false,
  })

  if (writes.length !== 1 || writes[0] !== FENCED_FRONTMATTER_MARKDOWN) {
    throw new Error(`expected workspace write to persist fenced frontmatter text, got ${JSON.stringify(writes)}`)
  }
  if (lastLoadedRef.current?.text !== FENCED_FRONTMATTER_MARKDOWN || inlineText !== FENCED_FRONTMATTER_MARKDOWN) {
    throw new Error('expected workspace writeback state to preserve canonical YAML frontmatter fences')
  }
}

export async function testWorkspaceIndexingResolvesCanonicalMirrorBeforeCachedInlineText() {
  const sourcePath = path.resolve(process.cwd(), 'src/lib/markdown-workspace-runtime/useMarkdownWorkspaceIndexing.tsx')
  const source = await fsPromises.readFile(sourcePath, 'utf8')
  const resolverImport = "import { readWorkspaceActiveDocumentResolvedText } from '@/features/source-files/sourceFilesRuntimeActive'"
  if (!source.includes(resolverImport)) {
    throw new Error('expected workspace indexing to import the shared active-document resolver')
  }
  const cacheBranchIndex = source.indexOf('if (canUseCachedText) {')
  const canonicalResolverIndex = source.indexOf('preferCanonicalPathText: true')
  if (cacheBranchIndex < 0 || canonicalResolverIndex < cacheBranchIndex) {
    throw new Error('expected workspace indexing cached-text branch to prefer canonical path text before trusting inline cache')
  }
  if (!source.includes('if (!canUseCachedText || nextText !== cachedText)')) {
    throw new Error('expected workspace indexing to refresh polluted inline cache when canonical text differs')
  }
}

export async function testWorkspaceDocsMirrorWriteRejectsBlankOverwriteOfNonEmptyFile() {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'workspace-docs-mirror-blank-guard-'))
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tempRoot
  try {
    const mirrorFile = path.join(tempRoot, 'knowgrph-video-demo.md')
    await fsPromises.writeFile(mirrorFile, '# Knowgrph Video Demo')
    const wrote = await upsertWorkspaceDocsMirrorText({
      workspacePath: '/docs/knowgrph-video-demo.md',
      text: '',
    })
    const current = await fsPromises.readFile(mirrorFile, 'utf8')
    if (wrote !== false) {
      throw new Error(`expected blank overwrite guard to reject the mirror write, got ${String(wrote)}`)
    }
    if (current !== '# Knowgrph Video Demo') {
      throw new Error(`expected non-empty mirror file to remain unchanged, got ${JSON.stringify(current)}`)
    }
  } finally {
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    await fsPromises.rm(tempRoot, { recursive: true, force: true })
  }
}

export async function testWorkspaceDocsMirrorWriteSkipsTerminalNewlineChurn() {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'workspace-docs-mirror-noop-guard-'))
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tempRoot
  try {
    const videoText = '# Knowgrph Video Demo'
    const videoFile = path.join(tempRoot, 'knowgrph-video-demo.md')
    await fsPromises.writeFile(videoFile, videoText)
    const wrote = await upsertWorkspaceDocsMirrorText({
      workspacePath: '/docs/knowgrph-video-demo.md',
      text: `${videoText}\n`,
    })
    const current = await fsPromises.readFile(videoFile, 'utf8')
    if (wrote !== false) {
      throw new Error(`expected equivalent terminal-newline write to be skipped, got ${String(wrote)}`)
    }
    if (current !== videoText) {
      throw new Error(`expected terminal-newline churn to leave mirror file unchanged, got ${JSON.stringify(current)}`)
    }
  } finally {
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    await fsPromises.rm(tempRoot, { recursive: true, force: true })
  }
}

export async function testWorkspaceDocsMirrorWriteRejectsDuplicateOtherDocumentText() {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'workspace-docs-mirror-duplicate-guard-'))
  const previousAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tempRoot
  try {
    const tokenText = '# Knowgrph Token Economics Model Demo'
    const videoText = '# Knowgrph Video Demo'
    const tokenFile = path.join(tempRoot, 'knowgrph-token-economics-model-demo.md')
    const videoFile = path.join(tempRoot, 'knowgrph-video-demo.md')
    await fsPromises.writeFile(tokenFile, tokenText)
    await fsPromises.writeFile(videoFile, videoText)
    const wrote = await upsertWorkspaceDocsMirrorText({
      workspacePath: '/docs/knowgrph-video-demo.md',
      text: tokenText,
    })
    const current = await fsPromises.readFile(videoFile, 'utf8')
    if (wrote !== false) {
      throw new Error(`expected duplicate-document overwrite guard to reject the mirror write, got ${String(wrote)}`)
    }
    if (current !== videoText) {
      throw new Error(`expected video mirror file to remain unchanged, got ${JSON.stringify(current)}`)
    }
  } finally {
    if (typeof previousAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    await fsPromises.rm(tempRoot, { recursive: true, force: true })
  }
}
