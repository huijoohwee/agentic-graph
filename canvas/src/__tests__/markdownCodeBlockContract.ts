import path from 'node:path'

export function assertWorkspaceCodeBlockContract(root: string, readUtf8: (file: string) => string) {
  const derivedViewerPath = path.resolve(
    root,
    'src',
    'features',
    'markdown-workspace',
    'main',
    'viewer',
    'MarkdownWorkspaceDerivedViewer.tsx',
  )
  const derivedViewerText = readUtf8(derivedViewerPath)
  if (!derivedViewerText.includes('onInsertLineAfter={canMutate ? props.onInsertLineAfter : undefined}')) {
    throw new Error('expected derived markdown read viewer to expose insert-line controls when mutations are allowed')
  }
  if (!derivedViewerText.includes('onReorderLineBlock={canMutate ? props.onReorderLineBlock : undefined}')) {
    throw new Error('expected derived markdown read viewer to expose reorder-line controls when mutations are allowed')
  }
  if (!derivedViewerText.includes('onReplaceLineRange={canMutate ? props.onReplaceLineRange : undefined}')) {
    throw new Error('expected derived markdown read viewer to gate line-range replacement through the shared canMutate policy')
  }
  if (
    !derivedViewerText.includes('onInlineEditStateChange={canMutate ? props.onInlineEditStateChange : undefined}') ||
    !derivedViewerText.includes('onInlineDraftTextChange={canMutate ? props.onInlineDraftTextChange : undefined}')
  ) {
    throw new Error('expected derived markdown read viewer to reuse the shared visible inline-edit draft SSOT')
  }
  if (!derivedViewerText.includes('forbidCopy={false}')) {
    throw new Error('expected derived markdown read viewer code-fence copy action to stay enabled in read mode')
  }
  const workspaceMainPath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'main', 'MarkdownWorkspaceMain.tsx')
  const workspaceMainText = readUtf8(workspaceMainPath)
  if (!workspaceMainText.includes('onInsertLineAfter={disableDerivedMarkdownMutations ? undefined : onInsertLineAfter}')) {
    throw new Error('expected markdown workspace read viewer to keep insert-line controls enabled unless mutations are disabled')
  }
  if (!workspaceMainText.includes('onReorderLineBlock={disableDerivedMarkdownMutations ? undefined : onReorderLineBlock}')) {
    throw new Error('expected markdown workspace read viewer to keep reorder-line controls enabled unless mutations are disabled')
  }
  const sharedViewerPath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'main', 'viewer', 'MarkdownWorkspaceViewerSurface.tsx')
  const sharedViewerText = readUtf8(sharedViewerPath)
  if (!sharedViewerText.includes('forbidCopy={false}')) {
    throw new Error('expected the shared workspace/rich-media Viewer code-fence copy action to stay enabled in read mode')
  }
  const codePath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownCodeBlock.tsx')
  const codeText = readUtf8(codePath)
  if (!codeText.includes('editDisableRichUi')) {
    throw new Error('expected code blocks to disable rich inline-edit UI')
  }
  if (!codeText.includes('editLineRange')) {
    throw new Error('expected code blocks to compute an inner editLineRange for fenced code')
  }
  if (!codeText.includes('editStaticChildren')) {
    throw new Error('expected code blocks to preserve header layout during inline edit (editStaticChildren)')
  }
  if (!codeText.includes('editTypographyMode="none"')) {
    throw new Error('expected code blocks to opt out of inherited typography to preserve monospace')
  }
  if (!codeText.includes('editPreserveWhitespace')) {
    throw new Error('expected code blocks to preserve indentation whitespace during inline edit')
  }
  if (!codeText.includes('MARKDOWN_CODE_FENCE_EDITOR_LAYOUT_CLASS') && !codeText.includes("'p-4'")) {
    throw new Error('expected code block inline editor to reuse centralized p-4 spacing contract for edit-as-is surface parity')
  }
  if (codeText.includes('min-h-[96px]')) {
    throw new Error('expected code block inline editor to avoid hardcoded min height that changes layout')
  }
  if (!codeText.includes('MARKDOWN_CODE_BLOCK_READ_SPACING_CLASS')) {
    throw new Error('expected code block read/gutter wrappers to reuse centralized read-surface spacing SSOT contract')
  }
  if (!codeText.includes('MARKDOWN_CODE_FENCE_EDITOR_LAYOUT_CLASS') && !codeText.includes('whitespace-pre overflow-auto')) {
    throw new Error('expected code block inline editor root to preserve edit-as-is preformatted overflow behavior')
  }
  if (!codeText.includes('MARKDOWN_CODE_FENCE_CONTENT_SURFACE_BASE_CLASS')) {
    throw new Error('expected code block render surfaces to reuse centralized code-fence content wrapper SSOT class')
  }
  if (!codeText.includes('<CodeBlockText>') || !codeText.includes('agentic-code-editor')) {
    throw new Error('expected ascii code-fence read/edit typography parity to reuse design-system code typography')
  }
  if (!codeText.includes('MARKDOWN_CODE_FENCE_LINE_SPACING_CLASS')) {
    throw new Error('expected code-fence line-by-line read/edit typography spacing parity to reuse centralized line-spacing SSOT class')
  }
  if (!codeText.includes('WrapText') || !codeText.includes('markdownWorkspaceWordWrapToggleTitle')) {
    throw new Error('expected code-fence header to reuse existing word-wrap toggle copy and icon contract')
  }
  if (!codeText.includes('effectiveWrapClass') || !codeText.includes('setLocalWordWrapEnabled')) {
    throw new Error('expected code-fence word-wrap toggle to drive shared read/edit wrap class through local state without mutating layout contracts')
  }
  if (!codeText.includes('editPreserveBlockHeight={false}')) {
    throw new Error('expected code-fence inline edit to disable host min-height preservation and avoid synthetic bottom-gap drift near block border')
  }
  if (!codeText.includes('codeFenceLanguageOptions(lang)') || !codeText.includes('<CodeBlockHeader language={lang}')) {
    throw new Error('expected code-fence header language control to expose selectable language options for read-viewer fence mutation')
  }
  if (!codeText.includes('handleLanguageSelectChange') || !codeText.includes('replacementOpenLine')) {
    throw new Error('expected code-fence language selector to rewrite the opening fence line while preserving trailing info metadata')
  }
  const sharedHeader = readUtf8(path.resolve(root, '..', 'node_modules', 'agentic-design-system', 'packages', 'react-viewer', 'src', 'document-blocks.tsx'))
  if (!sharedHeader.includes('onMouseDown={event => event.stopPropagation()}') || !sharedHeader.includes('onDoubleClick={event => event.stopPropagation()}')) {
    throw new Error('expected code-fence language selector interactions to avoid triggering inline contenteditable open')
  }
  if (codeText.includes('p-3 bg-transparent whitespace-pre')) {
    throw new Error('expected ascii code-fence read surface to avoid local p-3 spacing literal and reuse centralized code-fence spacing SSOT')
  }
  const highlightedCodePath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'codeblock', 'HighlightedCode.tsx')
  const highlightedCodeText = readUtf8(highlightedCodePath)
  if (!highlightedCodeText.includes('MARKDOWN_CODE_FENCE_LINE_SPACING_CLASS') || !highlightedCodeText.includes('MARKDOWN_CODE_FENCE_LINE_ROW_HEIGHT_CLASS')) {
    throw new Error('expected highlighted code render rows and line-height to reuse centralized code-fence line-spacing SSOT constants')
  }
  if (highlightedCodeText.includes('leading-[1.5em]') || highlightedCodeText.includes('h-[1.5em]')) {
    throw new Error('expected highlighted code to avoid local hardcoded line-spacing literals and rely on centralized SSOT constants')
  }
}
