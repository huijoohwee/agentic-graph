import { shouldAutosaveWorkspaceFile } from '@/features/markdown-workspace/workspaceAutosave'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MarkdownWorkspaceMain } from '@/features/markdown-workspace/main/MarkdownWorkspaceMain'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export const testWorkspaceAutosaveGuardsAgainstPathSwitchOverwrite = () => {
  const path = '/a.md'
  const otherPath = '/b.md'

  if (shouldAutosaveWorkspaceFile({ enabled: true, path, lastLoaded: null, activeText: 'x', debouncedText: 'x' })) {
    throw new Error('expected false when no lastLoaded')
  }

  if (
    shouldAutosaveWorkspaceFile({
      enabled: true,
      path,
      lastLoaded: { path: otherPath, text: 'prev' },
      activeText: 'x',
      debouncedText: 'x',
    })
  ) {
    throw new Error('expected false when lastLoaded.path differs')
  }

  if (
    shouldAutosaveWorkspaceFile({
      enabled: true,
      path,
      lastLoaded: { path, text: 'same' },
      activeText: 'same',
      debouncedText: 'same',
    })
  ) {
    throw new Error('expected false when no edits')
  }

  if (
    shouldAutosaveWorkspaceFile({
      enabled: true,
      path,
      lastLoaded: { path, text: 'loaded' },
      activeText: 'editing',
      debouncedText: 'still-typing',
    })
  ) {
    throw new Error('expected false while still typing')
  }

  if (
    !shouldAutosaveWorkspaceFile({
      enabled: true,
      path,
      lastLoaded: { path, text: 'loaded' },
      activeText: 'final',
      debouncedText: 'final',
    })
  ) {
    throw new Error('expected true when debounced matches edited text')
  }

  if (
    shouldAutosaveWorkspaceFile({
      enabled: false,
      path,
      lastLoaded: { path, text: 'loaded' },
      activeText: 'final',
      debouncedText: 'final',
    })
  ) {
    throw new Error('expected false when the app-level autosave policy is disabled')
  }
}

export const testWorkspaceAutosavePolicyIsDefaultVisibleAndObservable = () => {
  const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
  const initialStateSource = source('src/hooks/store/uiSliceInitialState.ts')
  const settingsSource = source('src/features/settings/registry-ui.ui.ts')
  const launchSource = source('src/lib/toolbar/LaunchDropdown.impl.tsx')
  const editorWorkspaceSelectSource = source('src/components/toolbar/EditorWorkspaceSelect.tsx')
  const saveRuntimeSource = source('src/lib/markdown-workspace-runtime/useMarkdownWorkspaceSave.ts')
  const collaborationRuntimeSource = source('src/features/source-files/useSourceFilesPocketBaseYjsCollaborationRuntime.ts')

  if (!initialStateSource.includes('workspaceAutosaveEnabled: lsBool(LS_KEYS.workspaceAutosaveEnabled, true)')) {
    throw new Error('expected workspace autosave to default on through the persisted root setting')
  }
  if (!settingsSource.includes("key: 'workspaceAutosaveEnabled'") || !settingsSource.includes('default: () => true')) {
    throw new Error('expected MainPanel Settings to expose the default-on autosave policy')
  }

  if (launchSource.includes('<span className="truncate">Autosave</span>')) {
    throw new Error('expected Autosave to move out of the Launch root menu')
  }
  const autosaveMenuIndex = editorWorkspaceSelectSource.indexOf('<span className="truncate">Autosave</span>')
  const storageSyncMenuIndex = editorWorkspaceSelectSource.indexOf('<span className="truncate">{UI_LABELS.storageSync}</span>')
  if (autosaveMenuIndex < 0 || storageSyncMenuIndex < 0 || autosaveMenuIndex > storageSyncMenuIndex) {
    throw new Error('expected Autosave to appear immediately above Storage Sync in the Editor Workspace menu')
  }
  if (!editorWorkspaceSelectSource.includes('uiSelectableRowClassName(workspaceAutosaveEnabled)')
    || !editorWorkspaceSelectSource.includes('uiSelectableRowClassName(storageSyncEnabled)')) {
    throw new Error('expected Autosave and Storage Sync to reuse the canonical active menu-row styling')
  }
  if (!editorWorkspaceSelectSource.includes('uiSelectableRowClassName(workspaceSyncAutomatic)')
    || !editorWorkspaceSelectSource.includes('uiAutomaticRowValue(workspaceSyncAutomatic)')) {
    throw new Error('expected Workspace Sync Mode to reuse selected-row styling for Auto and remain neutral for Manual')
  }
  if (editorWorkspaceSelectSource.includes('toggleIndicatorClassName')) {
    throw new Error('expected Autosave and Storage Sync to avoid custom blue indicator pills')
  }
  if ((editorWorkspaceSelectSource.match(/<SelectableRowValue/g) || []).length !== 3
    || editorWorkspaceSelectSource.includes('<span className="ml-auto shrink-0 text-xs">')) {
    throw new Error('expected Auto/Manual and On/Off values to reuse the semantic row-value affordance')
  }
  if (!saveRuntimeSource.includes("applySaveSuccessStatus('Autosaved'")) {
    throw new Error('expected successful autosaves to publish an observable toast status')
  }
  if (!saveRuntimeSource.includes('Autosave failed')) {
    throw new Error('expected autosave failures to publish an explicit failure toast')
  }
  if (!saveRuntimeSource.includes('The source changed before autosave could commit the current editor text.')) {
    throw new Error('expected rejected autosave writes to become visible failures')
  }
  if (!saveRuntimeSource.includes('The source changed before Save could commit the current editor text.')) {
    throw new Error('expected rejected explicit saves to become visible failures')
  }
  if (!collaborationRuntimeSource.includes('if (!readKnowgrphCollaborationSaveSessionToken()) return')) {
    throw new Error('expected optional collaboration snapshots to skip before save when no authenticated session exists')
  }
}

export async function testMarkdownWorkspaceSplitPreviewFlushesOnDocKeyChange() {
  const { restore: restoreWindow } = initWindowHarness({ storage: null })
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)

    const presentationApiRef = { current: null } as React.MutableRefObject<unknown>
    const editorRef = { current: null } as React.MutableRefObject<unknown>

    const root = createRoot(container as unknown as HTMLElement)
    await act(async () => {
      root.render(
        React.createElement(MarkdownWorkspaceMain, {
          themeMode: 'light',
        uiPanelTextFontClass: 'font-sans text-xs',
        uiPanelMonospaceTextClass: 'font-mono text-xs',
        layoutMode: 'split',
        setLayoutMode: () => {},
        markdownWordWrap: true,
        setMarkdownWordWrap: () => {},
        markdownTextHighlight: false,
        setMarkdownTextHighlight: () => {},
        onToggleFullscreen: () => {},
        presentationApiRef,
        isMarkdown: true,
        activeText: '# Hello',
        setActiveText: () => {},
        outlineText: '',
        activeDocumentKey: 'docs/hello.md',
        highlightedLineRange: null,
        revealLineInEditor: () => {},
        showInViewer: () => {},
        showInPresentation: () => {},
        showInGallery: () => {},
        editorUri: 'inmemory://workspace/docs%2Fhello.md',
        editorLanguage: 'markdown',
        editorRef,
        setHighlightLine: () => {},
      } as never),
      )
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0))
    })

    const rootEl =
      (doc.querySelector('[data-testid="markdown-preview-root"]') as HTMLElement | null) ||
      (doc.querySelector('[data-testid="markdown-preview"]') as HTMLElement | null) ||
      (doc.body as unknown as HTMLElement)
    const text = String(rootEl.textContent || '').replace(/\s+/g, ' ').trim()
    if (!text.includes('Hello')) {
      throw new Error('expected split preview to render active text immediately after doc switch')
    }

    root.unmount()
  } finally {
    restoreDom()
    restoreWindow()
  }
}
