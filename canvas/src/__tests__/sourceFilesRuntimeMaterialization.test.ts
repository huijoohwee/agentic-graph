import {
  buildActiveWorkspaceRuntimeSourceFilesSnapshot,
  buildMaterializedWorkspaceActivePathKey,
  reapplyActiveWorkspaceMarkdownDocument,
  shouldProactivelyReapplyActiveWorkspaceMarkdownDocument,
} from '@/features/source-files/sourceFilesRuntimeMaterialization'
import { resolveWorkspaceSourcePathKey } from '@/features/workspace-fs/syncToSourceFiles'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import type { WorkspaceFs } from '@/features/workspace-fs/types'

const createMinimalFs = (textByPath: Record<string, string>): WorkspaceFs => ({
  ensureSeed: async () => false,
  listEntries: async () => [],
  readFileText: async path => textByPath[String(path || '').trim()] ?? null,
  writeFileText: async () => void 0,
  createFile: async () => '/docs/tmp.md',
  createFolder: async () => '/docs',
  deleteEntry: async () => void 0,
})

export function testShouldProactivelyReapplyClosedPaneActiveMarkdownDocumentWhenCanvasOwnsClosedPane() {
  const shouldReapply = shouldProactivelyReapplyActiveWorkspaceMarkdownDocument({
    activePath: '/docs/workspace-readme.md' as never,
    markdownDocumentName: null,
    markdownDocumentText: '',
  })
  if (shouldReapply !== true) {
    throw new Error(`expected Source Files active-path materialization to reapply the active markdown document, got ${String(shouldReapply)}`)
  }
}

export function testShouldProactivelyReapplyActiveWorkspaceMarkdownDocumentWhenEditorWorkspaceOpen() {
  const shouldReapply = shouldProactivelyReapplyActiveWorkspaceMarkdownDocument({
    activePath: '/docs/workspace-readme.md' as never,
    markdownDocumentName: null,
    markdownDocumentText: '',
  })
  if (shouldReapply !== true) {
    throw new Error(`expected Editor Workspace Source Files switching to reapply selected file content/frontmatter to Canvas, got ${String(shouldReapply)}`)
  }
}

export function testShouldProactivelyReapplyClosedPaneActiveMarkdownDocumentDefersMatchingDocumentSuppressionUntilResolvedText() {
  const shouldReapply = shouldProactivelyReapplyActiveWorkspaceMarkdownDocument({
    activePath: '/docs/workspace-readme.md' as never,
    markdownDocumentName: '/docs/workspace-readme.md',
    markdownDocumentText: '# Maps Readme',
  })
  if (shouldReapply !== true) {
    throw new Error(`expected matching active markdown document to defer reapply suppression until resolved text is known, got ${String(shouldReapply)}`)
  }
}

export function testShouldProactivelyReapplyClosedPaneActiveMarkdownDocumentWhenMatchingDocumentSuppressedViewPreset() {
  const shouldReapply = shouldProactivelyReapplyActiveWorkspaceMarkdownDocument({
    activePath: '/docs/runtime-surface-demo.md' as never,
    markdownDocumentName: '/docs/runtime-surface-demo.md',
    markdownDocumentText: '---\nkgCanvasSurfaceMode: "xr"\n---\n# XR Demo',
    markdownDocumentApplyViewPreset: false,
  })
  if (shouldReapply !== true) {
    throw new Error(`expected matching active markdown document with suppressed view preset to replay YAML canvas preset, got ${String(shouldReapply)}`)
  }
}

export function testMaterializedWorkspaceActivePathKeyTracksSelectedContentAndActiveDocumentOnly() {
  const activePath = '/docs/agentic-graph-design-demo.md' as never
  const text = [
    '---',
    'kgCanvas2dRenderer: "design"',
    '---',
    '# Design',
  ].join('\n')
  const base = buildMaterializedWorkspaceActivePathKey({
    activePathOverride: activePath,
    workspaceEntriesSnapshot: [{
      path: activePath,
      parentPath: '/docs' as never,
      kind: 'file',
      name: 'agentic-graph-design-demo.md',
      text,
      updatedAtMs: 1,
    }],
    markdownDocumentName: 'docs/agentic-graph-video-demo.md',
    markdownDocumentText: '# Video',
    markdownDocumentApplyViewPreset: true,
  })
  const applied = buildMaterializedWorkspaceActivePathKey({
    activePathOverride: activePath,
    workspaceEntriesSnapshot: [{
      path: activePath,
      parentPath: '/docs' as never,
      kind: 'file',
      name: 'agentic-graph-design-demo.md',
      text,
      updatedAtMs: 1,
    }],
    markdownDocumentName: 'docs/agentic-graph-design-demo.md',
    markdownDocumentText: text,
    markdownDocumentApplyViewPreset: true,
  })
  const graphSourceOnlyChanged = buildMaterializedWorkspaceActivePathKey({
    activePathOverride: activePath,
    workspaceEntriesSnapshot: [{
      path: activePath,
      parentPath: '/docs' as never,
      kind: 'file',
      name: 'agentic-graph-design-demo.md',
      text,
      updatedAtMs: 1,
    }],
    markdownDocumentName: 'docs/agentic-graph-design-demo.md',
    markdownDocumentText: text,
    markdownDocumentApplyViewPreset: true,
  })
  if (!base || !applied || base === applied) {
    throw new Error('expected active-path materialization key to include selected content and active markdown document ownership')
  }
  if (graphSourceOnlyChanged !== applied) {
    throw new Error('expected active-path materialization key to ignore graph-source churn caused by applying the selected document')
  }
}

export async function testActiveWorkspaceMarkdownReapplyReplaysYamlWhenEditorWorkspaceOpen() {
  const { restore } = initJsdomHarness()
  try {
    const activePath = '/docs/runtime-surface-demo.md'
    const text = [
      '---',
      'kgCanvasSurfaceMode: "xr"',
      'kgCanvas3dMode: "xr"',
      '---',
      '# Runtime Surface Demo',
      '',
      'Canvas state must come from YAML, not file identity.',
    ].join('\n')
    const store = useGraphStore.getState()
    store.resetAll()
    store.setWorkspaceViewMode('editor')
    store.setWorkspaceCanvasPaneOpen(true)
    store.setCanvasRenderMode('2d')
    store.setCanvas3dMode('3d')
    store.setMarkdownDocument(activePath, text, {
      autoEnableFrontmatter: false,
      applyViewPreset: false,
    })
    useMarkdownExplorerStore.getState().setActivePath(activePath as never)

    await reapplyActiveWorkspaceMarkdownDocument({
      activePathOverride: activePath as never,
      fs: createMinimalFs({ [activePath]: text }),
      activeWorkspaceEntriesSnapshot: [{
        path: activePath as never,
        parentPath: '/docs' as never,
        kind: 'file',
        name: 'runtime-surface-demo.md',
        text,
        updatedAtMs: 1,
      }],
    })

    const next = useGraphStore.getState()
    if (next.markdownDocumentName !== 'docs/runtime-surface-demo.md') {
      throw new Error(`expected active Source Files reapply to use the canonical workspace document key, got ${String(next.markdownDocumentName || '')}`)
    }
    if (next.markdownDocumentApplyViewPreset !== true) {
      throw new Error('expected active Source Files reapply to restore YAML view-preset ownership')
    }
    if (next.canvasRenderMode !== '3d' || next.canvas3dMode !== 'xr') {
      throw new Error(`expected active Source Files YAML to select XR canvas mode, got ${next.canvasRenderMode}/${next.canvas3dMode}`)
    }
  } finally {
    useMarkdownExplorerStore.getState().setActivePath(null)
    useGraphStore.getState().resetAll()
    restore()
  }
}

export function testBuildActiveWorkspaceRuntimeSourceFilesSnapshotIncludesFreshEmptyActiveWorkspaceFile() {
  const activePath = '/chat-log/agenticOs_20260527193000.md'
  const existingTracePath = '/chat-log/20260527T193000Z/agentic-os-trace_20260527T193000Z.md'
  const snapshot = buildActiveWorkspaceRuntimeSourceFilesSnapshot({
    activePath: activePath as never,
    existingSourceFiles: [
      {
        id: 'old-doc',
        name: 'agentic-graph-animatic-demo.md',
        text: '# old',
        enabled: true,
        source: { kind: 'local', path: resolveWorkspaceSourcePathKey('/docs/agentic-graph-animatic-demo.md') },
        status: 'idle',
      },
      {
        id: 'existing-trace',
        name: 'agentic-os-trace_20260527T193000Z.md',
        text: '# AGENTIC_OS Trace',
        enabled: false,
        source: { kind: 'local', path: resolveWorkspaceSourcePathKey(existingTracePath) },
        status: 'idle',
      },
    ],
    workspaceEntries: [{
      path: activePath as never,
      parentPath: '/chat-log' as never,
      kind: 'file',
      name: 'agenticOs_20260527193000.md',
      text: '',
      updatedAtMs: 1,
    }],
    sourcesByPath: {},
    workspaceDocsOnly: false,
  })
  const activeSourcePath = resolveWorkspaceSourcePathKey(activePath)
  const activeFile = snapshot.runtimeSourceFiles.find(file => String(file?.source?.path || '') === activeSourcePath) || null
  if (!activeFile) {
    throw new Error('expected runtime source-file snapshot to include a fresh empty active workspace file')
  }
  if (activeFile.enabled !== true) {
    throw new Error(`expected fresh empty active workspace file to be enabled, got ${String(activeFile.enabled)}`)
  }
  const preservedSidecar = snapshot.runtimeSourceFiles.find(file => String(file?.source?.path || '') === resolveWorkspaceSourcePathKey(existingTracePath)) || null
  if (!preservedSidecar) {
    throw new Error('expected runtime source-file snapshot to preserve existing canonical chat sidecar files')
  }
  if (preservedSidecar.enabled !== false) {
    throw new Error(`expected preserved canonical chat sidecar file to remain disabled, got ${String(preservedSidecar.enabled)}`)
  }
}
