import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (absPath: string): string => fs.readFileSync(absPath, { encoding: 'utf8' })

export const testMarkdownWorkspaceMainDefersHiddenPaneHeavyDerivations = () => {
  const mainPath = path.resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'MarkdownWorkspaceMain.tsx')
  const editorPanePath = path.resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'editor', 'MarkdownEditorPane.tsx')
  const layoutPath = path.resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'layout', 'MarkdownWorkspaceLayout.tsx')
  const initialPaneVisibilityPath = path.resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'useInitialWorkspacePaneVisibility.ts')
  const toolbarPath = path.resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'MarkdownWorkspaceToolbar.tsx')
  const dropdownPath = path.resolve(process.cwd(), 'src', 'components', 'toolbar', 'ToolbarDropdownSelect.tsx')
  const typesPath = path.resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'types.ts')
  const mainText = readUtf8(mainPath)
  const documentStateText = readUtf8(path.resolve(path.dirname(mainPath), 'useWorkspaceDocumentState.ts'))
  if (!mainText.includes("import { useWorkspaceDocumentState } from './useWorkspaceDocumentState'")
    || !mainText.includes('} = useWorkspaceDocumentState({')) {
    throw new Error('expected MarkdownWorkspaceMain to use the shared document-state hook')
  }
  const editorPaneText = readUtf8(editorPanePath)
  const layoutText = readUtf8(layoutPath)
  const initialPaneVisibilityText = readUtf8(initialPaneVisibilityPath)
  const toolbarText = readUtf8(toolbarPath)
  const dropdownText = readUtf8(dropdownPath)
  const typesText = readUtf8(typesPath)
  if (!typesText.includes('DEFAULT_MARKDOWN_WORKSPACE_PANE_VISIBILITY')) {
    throw new Error('Expected workspace pane visibility defaults to live in the shared main types module')
  }
  if (!typesText.includes('resolveMarkdownWorkspacePaneAvailability') || !typesText.includes("modelAssetFormat === 'glb'") || !typesText.includes("modelAssetFormat === 'gltf'")) {
    throw new Error('Expected workspace pane availability to classify GLB as bin and GLTF as JSON from a shared helper')
  }
  if (!typesText.includes('export function resolveMarkdownWorkspacePaneVisibility')) {
    throw new Error('Expected workspace pane visibility rules to live in a shared main types helper')
  }
  if (!typesText.includes('json: false')) {
    throw new Error('Expected JSON pane to be opt-in by default to avoid eager Markdown JSON-LD generation on load')
  }
  if (!typesText.includes('markdown: false')) {
    throw new Error('Expected Markdown editor pane to be opt-in by default in split loading so the viewer can render first')
  }
  if (mainText.includes('markdownDerivedViewerMode') || mainText.includes('markdownDerivedViewerKind')) {
    throw new Error('Expected workspace main loading to ignore persisted derived viewer modes to avoid stale heavy startup render paths')
  }
  if (!mainText.includes("React.useState<MarkdownWorkspaceDerivedViewerKind>('markdown')")) {
    throw new Error('Expected workspace main viewer kind to initialize from the cheap markdown SSOT')
  }
  if (
    !mainText.includes('React.useState<MarkdownWorkspaceDerivedViewerMode>(() => (') ||
    !mainText.includes("documentPanePreset === 'viewer' && (hasJsonSourcePreviewText || isMarkdownWorkspaceDelimitedTextPath(activeDocumentKey))") ||
    !mainText.includes('shouldUseDataViewDocumentPreset\n') ||
    !mainText.includes("? 'multiDimTable'") ||
    !mainText.includes(": 'read'")
  ) {
    throw new Error('Expected workspace main viewer mode to initialize from the cheap read SSOT with attached-JSON or delimited-source table presets')
  }
  if (!documentStateText.includes('const deferredSourceEditorTextRaw = React.useDeferredValue(sourceEditorTextRaw)')) {
    throw new Error('Expected workspace main to defer JSON editor source text before expensive JSON/JSON-LD derivations')
  }
  if (!documentStateText.includes('if (!jsonPaneVisible) return')) {
    throw new Error('Expected JSON editor text derivation to be gated by JSON pane visibility')
  }
  if (mainText.includes('setSplitPaneVisibility({ json: true, markdown: true, viewer: true })')) {
    throw new Error('Expected toolbar Editor Workspace open not to eagerly mount JSON, Markdown, and Viewer panes together')
  }
  if (!mainText.includes('useInitialWorkspacePaneVisibility({') || !initialPaneVisibilityText.includes('resolveMarkdownWorkspaceInitialPaneVisibility({')) {
    throw new Error('Expected workspace pane presets to flow through the shared initial visibility helper')
  }
  if (!mainText.includes('parseGlbAssetDocument(activeText)')) {
    throw new Error('Expected workspace main to derive model-asset pane policy from the parsed active Source File')
  }
  if (!mainText.includes('resolveMarkdownWorkspacePaneAvailability({ modelAssetFormat })')) {
    throw new Error('Expected workspace main to delegate GLTF/GLB pane selection to the shared availability helper')
  }
  if (!mainText.includes('const workspaceEditorOverlayOpen = isWorkspaceEditorOverlayOpen({ workspaceViewMode, workspaceCanvasPaneOpen })')) {
    throw new Error('Expected workspace main open-edge pane normalization to use canonical overlay-open semantics')
  }
  if (!initialPaneVisibilityText.includes('args.webpageView ||') || !initialPaneVisibilityText.includes('args.workspaceEditorOverlayOpen')) {
    throw new Error('Expected workspace main pane normalization to include webpage view and canonical overlay-open semantics')
  }
  if (!mainText.includes('splitPaneVisibility,')
    || !initialPaneVisibilityText.includes('splitPaneVisibility: MarkdownWorkspacePaneVisibility')
    || !initialPaneVisibilityText.includes('areMarkdownWorkspacePaneVisibilitiesEqual(args.splitPaneVisibility, nextVisibility)')
    || !initialPaneVisibilityText.includes('if (!args.splitPaneVisibility.html) return')
    || !initialPaneVisibilityText.includes('if (args.splitPaneVisibility.viewer && args.splitPaneVisibility.html) return')) {
    throw new Error('Expected workspace pane preset normalization to check current visibility before scheduling state updates')
  }
  if (!documentStateText.includes('if (viewerInlineMarkdownDraftText !== null) setViewerInlineMarkdownDraftText(null)')
    || !documentStateText.includes('if (viewerInlineViewerText !== null) setViewerInlineViewerText(null)')
    || !documentStateText.includes('if (jsonDerivedMarkdownDraft !== null) setJsonDerivedMarkdownDraft(null)')
    || !documentStateText.includes('if (jsonDerivedMarkdownDraft !== jsonDerivedMarkdownBase) setJsonDerivedMarkdownDraft(jsonDerivedMarkdownBase)')) {
    throw new Error('Expected workspace draft reset effects to avoid scheduling no-op state updates during workspace open')
  }
  if (dropdownText.includes('flushSync')) {
    throw new Error('Expected toolbar dropdown selection not to force a synchronous close commit before opening Workspace View')
  }
  if (dropdownText.includes("if (!open) {\n      optionButtonRefs.current = []\n      setExpandedOptionId(null)")) {
    throw new Error('Expected closed toolbar dropdown effects not to re-clear expanded state on every parent option churn')
  }
  if (!dropdownText.includes('if (expandedOptionId !== null) setExpandedOptionId(null)')
    || !dropdownText.includes('autoExpandedParentOptionIdRef')
    || !dropdownText.includes('autoExpandedParentOptionIdRef.current !== activeParentOptionId')
    || !dropdownText.includes('setExpandedOptionId(prev => (prev === option.id ? null : option.id))')) {
    throw new Error('Expected toolbar dropdown expanded state writes to allow manual section collapse without closed-menu update loops')
  }
  if (editorPaneText.includes('const lineStarts = React.useMemo')) {
    throw new Error('Expected markdown editor pane not to scan full text for line starts during open render')
  }
  if (!editorPaneText.includes('const getLineStarts = React.useCallback')) {
    throw new Error('Expected markdown editor pane to build line starts lazily after caret events')
  }
  if (!mainText.includes('forceMarkdownEditorInEditorMode') || !mainText.includes('resolveMarkdownWorkspacePaneVisibility({')) {
    throw new Error('Expected workspace main pane visibility to reuse the shared visibility helper SSOT')
  }
  if (!documentStateText.includes('if (!markdownPaneVisible && !viewerPaneVisible) return null')) {
    throw new Error('Expected JSON-to-markdown derivation to be skipped when markdown and viewer panes are hidden')
  }
  if (!layoutText.includes('resolveMarkdownWorkspacePaneVisibility({')) {
    throw new Error('Expected layout to reuse the shared pane visibility helper SSOT')
  }
  if (!layoutText.includes('paneVisibility.json ?')) {
    throw new Error('Expected layout to avoid mounting hidden JSON editor pane')
  }
  if (!toolbarText.includes('DEFAULT_MARKDOWN_WORKSPACE_PANE_VISIBILITY')) {
    throw new Error('Expected toolbar split pane fallback to reuse shared visibility defaults')
  }
  if (!toolbarText.includes('effectivePaneAvailability.bin') || !toolbarText.includes('not applicable for this Source File')) {
    throw new Error('Expected toolbar pane controls to show GLB bin state and grey out non-applicable model-asset panes')
  }
}

export const testMarkdownWorkspaceRuntimeKeepsEffectiveContentInSharedSsot = () => {
  const runtimeText = readUtf8(path.resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'MarkdownWorkspaceRuntime.impl.tsx'))
  const effectiveText = readUtf8(path.resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'useMarkdownWorkspaceEffectiveContent.ts'))
  if (!runtimeText.includes("import { useMarkdownWorkspaceEffectiveContent } from './useMarkdownWorkspaceEffectiveContent'")) {
    throw new Error('Expected markdown workspace runtime to import the effective-content SSOT hook')
  }
  if (!runtimeText.includes('const effectiveContent = useMarkdownWorkspaceEffectiveContent({')) {
    throw new Error('Expected markdown workspace runtime to delegate editor/viewer effective content derivation to the SSOT hook')
  }
  if (runtimeText.includes('const effectiveActiveText =') || runtimeText.includes('const editorLanguage = activePath')) {
    throw new Error('Expected markdown workspace runtime to avoid regrowing inline effective content and editor language derivation')
  }
  if (!effectiveText.includes('languageForPath(activePath)')) {
    throw new Error('Expected effective-content hook to centralize workspace editor language derivation')
  }
  if (!effectiveText.includes('disableEditorMutations')) {
    throw new Error('Expected effective-content hook to centralize editor mutation gating')
  }
  if (!effectiveText.includes('saveEnabled')) {
    throw new Error('Expected effective-content hook to centralize workspace save eligibility')
  }
}
