import fs from 'node:fs'
import path from 'node:path'
const readUtf8 = (absPath: string): string => fs.readFileSync(absPath, { encoding: 'utf8' })
const staleContentStartUtility = (prefix: 'left' | 'pl'): string => `${prefix}-[44px]`
const staleMarkdownGutterContentStartAlias = (): string => ['MARKDOWN_BLOCK_GUTTER_CONTENT_START', 'LEFT_CLASS'].join('_')
export const testMarkdownViewerReadableColumnAlignsBodyWithFrontmatterRows = () => {
  const root = process.cwd()
  const sectionUtilsPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'markdownSectionUtils.ts')
  const sectionUtilsText = readUtf8(sectionUtilsPath)
  const gutterPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownBlockGutter.tsx')
  const gutterText = readUtf8(gutterPath)
  const dataViewTablePath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownDataViewTableView.tsx')
  const dataViewTableText = readUtf8(dataViewTablePath)
  const frontmatterPreviewPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownFrontmatterPreviewBlocks.tsx')
  const frontmatterPreviewText = readUtf8(frontmatterPreviewPath)
  if (
    !sectionUtilsText.includes('MARKDOWN_VIEWER_CONTENT_START_OFFSET_CLASS') ||
    !sectionUtilsText.includes('[--kg-content-start-offset-left:20px]') ||
    !sectionUtilsText.includes('${MARKDOWN_VIEWER_CONTENT_START_OFFSET_CLASS}')
  ) {
    throw new Error('expected Markdown Viewer width wrapper to own the readable content-start offset so body text aligns with frontmatter table rows')
  }
  if (
    !gutterText.includes('MARKDOWN_BLOCK_GUTTER_CONTROLS_INLINE_START_CLASS') ||
    !gutterText.includes('left-[calc(var(--kg-content-start-offset-left,44px)-36px)]')
  ) {
    throw new Error('expected Markdown block gutter controls to derive hover rail placement from the shared content-start offset without overlapping Viewer text')
  }
  if (
    !dataViewTableText.includes("tableFit?: 'content' | 'container'") ||
    !dataViewTableText.includes("tableFit === 'container' ? 'min-w-full w-full' : 'min-w-max w-max'") ||
    !dataViewTableText.includes("tableFit === 'container'") ||
    !dataViewTableText.includes("width: '100%'")
  ) {
    throw new Error('expected Markdown data-view tables to expose an explicit container-fit mode that aligns the right edge with the readable Viewer column')
  }
  if (!frontmatterPreviewText.includes('tableFit="container"')) {
    throw new Error('expected Markdown frontmatter properties preview to fill the readable Viewer column instead of rendering as a narrow content-sized table')
  }
}
export const testMarkdownViewerInlineEditConfigSupportsImagesTasksHrTable = () => {
  const root = process.cwd()
  const blockPath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'MarkdownBlockContainerCore.impl.tsx')
  const blockCorePath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'MarkdownBlockContainerCore.impl.core.tsx')
  const blockViewPath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'MarkdownBlockContainerCore.impl.view.tsx')
  const blockRuntimePath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'MarkdownBlockContainerCore.impl.runtime.tsx')
  const blockEnginePath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'MarkdownBlockContainerCore.impl.engine.tsx')
  const blockEngineRuntimePath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'MarkdownBlockContainerCore.impl.engine.runtime.tsx')
  const blockEditSurfacePath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownBlockContainerCore.editSurfaceView.tsx')
  const blockEdgeTrimPath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownBlockContainerCore.edgeTrim.ts')
  const blockEditOpenCaretProbePath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownBlockContainerCore.editOpenCaretProbe.ts')
  const blockDraftCommitPath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownBlockContainerCore.draftCommit.ts')
  const blockEditInitializationPath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownBlockContainerCore.editInitialization.ts')
  const blockEditorEventsPath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownBlockContainerCore.editorEvents.ts')
  const blockParityProbePath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownEditParityProbe.ts')
  const blockSelectionToolbarSyncPath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownBlockContainerCore.selectionToolbarSync.ts')
  const blockMarkdownFormattingPath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownBlockContainerCore.markdownFormatting.ts')
  const blockHtmlFormattingPath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownBlockContainerCore.htmlFormatting.ts')
  const blockInlineSelectionToolbarPath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'MarkdownInlineSelectionToolbar.tsx')
  const blockInlineMenusOverlayPath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownBlockContainerCore.inlineMenusOverlay.tsx')
  const blockCommandMenuPath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownBlockContainerCore.commandMenu.tsx')
  const blockCommitPath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownBlockContainerCore.commit.ts')
  const blockSelectionPath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownBlockContainerCore.selection.ts')
  const blockToolbarPath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'markdownBlockContainerCore.toolbar.ts')
  const blockText = [
    readUtf8(blockPath),
    fs.existsSync(blockCorePath) ? readUtf8(blockCorePath) : '',
    fs.existsSync(blockViewPath) ? readUtf8(blockViewPath) : '',
    fs.existsSync(blockRuntimePath) ? readUtf8(blockRuntimePath) : '',
    fs.existsSync(blockEnginePath) ? readUtf8(blockEnginePath) : '',
    fs.existsSync(blockEngineRuntimePath) ? readUtf8(blockEngineRuntimePath) : '',
    fs.existsSync(blockEditSurfacePath) ? readUtf8(blockEditSurfacePath) : '',
    fs.existsSync(blockEdgeTrimPath) ? readUtf8(blockEdgeTrimPath) : '',
    fs.existsSync(blockEditOpenCaretProbePath) ? readUtf8(blockEditOpenCaretProbePath) : '',
    fs.existsSync(blockDraftCommitPath) ? readUtf8(blockDraftCommitPath) : '',
    fs.existsSync(blockEditInitializationPath) ? readUtf8(blockEditInitializationPath) : '',
    fs.existsSync(blockEditorEventsPath) ? readUtf8(blockEditorEventsPath) : '',
    fs.existsSync(blockParityProbePath) ? readUtf8(blockParityProbePath) : '',
    fs.existsSync(blockSelectionToolbarSyncPath) ? readUtf8(blockSelectionToolbarSyncPath) : '',
    fs.existsSync(blockMarkdownFormattingPath) ? readUtf8(blockMarkdownFormattingPath) : '',
    fs.existsSync(blockHtmlFormattingPath) ? readUtf8(blockHtmlFormattingPath) : '',
    fs.existsSync(blockInlineSelectionToolbarPath) ? readUtf8(blockInlineSelectionToolbarPath) : '',
    fs.existsSync(blockInlineMenusOverlayPath) ? readUtf8(blockInlineMenusOverlayPath) : '',
    fs.existsSync(blockCommandMenuPath) ? readUtf8(blockCommandMenuPath) : '',
    fs.existsSync(blockCommitPath) ? readUtf8(blockCommitPath) : '',
    fs.existsSync(blockSelectionPath) ? readUtf8(blockSelectionPath) : '',
    fs.existsSync(blockToolbarPath) ? readUtf8(blockToolbarPath) : '',
  ].join('\n')
  if (!blockText.includes('includeImages: true')) {
    throw new Error('expected html→md conversion to include images (includeImages: true)')
  }
  if (!blockText.includes('taskPrefixMatch')) {
    throw new Error('expected task list prefix preservation logic in buildReplacementLinesFromDraft')
  }
  if (!blockText.includes('hasAnyList')) {
    throw new Error('expected html list edit normalization to handle multi-root list sequences')
  }
  if (!blockText.includes("querySelectorAll('ol, ul')")) {
    throw new Error('expected html list edit normalization to enforce list spacing parity across ordered/unordered roots')
  }
  if (!blockText.includes('unwrapSingleListWrappers')) {
    throw new Error('expected html list edit normalization to unwrap list wrappers before sibling-gap cleanup')
  }
  if (
    !blockText.includes('className={effectiveInlineFlow') ||
    !blockText.includes('hostParagraphFlow') ||
    !blockText.includes("'relative block w-full min-w-0'") ||
    !blockText.includes("'relative inline-block w-full min-w-0 align-baseline'")
  ) {
    throw new Error('expected block container to keep paragraph edit wrapper block-level while preserving inline-flow host wrapping for list marker baseline parity')
  }
  if (!blockText.includes('const hostNormalTextFlow = hostParagraphFlow || hostHeadingFlow')) {
    throw new Error('expected block container to treat heading hosts as normal-text flow for read/edit left-baseline parity')
  }
  if (!blockText.includes("hostHeadingFlow ? 'block w-full min-w-0'")) {
    throw new Error('expected heading edit wrapper to avoid relative wrapper so chrome aligns with visual-mode padding/gutter')
  }
  if (!blockText.includes('normalizeListAncestorSpacing')) {
    throw new Error('expected html list edit normalization to reset wrapper ancestor spacing around list roots')
  }
  if (blockText.includes('if (editListMode) return')) {
    throw new Error('expected list edit mode to participate in edge trim burst scheduling (no special-case disable)')
  }
  if (!blockText.includes('MARKDOWN_INLINE_CODE_EDIT_DESCENDANT_CLASSES')) {
    throw new Error('expected html edit surfaces to reuse shared inline-code parity SSOT classes')
  }
  if (blockText.includes("'[_&code]:border'")) {
    throw new Error('expected html edit surfaces to avoid inline-code border styling that mutates layout')
  }
  if (blockText.includes('[&_code]:border-[color:var(--kg-code-border)]')) {
    throw new Error('expected html edit surfaces to avoid inline-code border styling that mutates layout')
  }
  if (!blockText.includes('MARKDOWN_INLINE_CODE_EDIT_DESCENDANT_CLASSES')) {
    throw new Error('expected inline code edit-surface spacing contract to be centralized in shared parity SSOT')
  }
  if (!blockText.includes('editTypographySnapshotRef') || !blockText.includes('window.getComputedStyle')) {
    throw new Error('expected markdown block editor to snapshot read-surface computed typography for strict view/edit font parity')
  }
  if (!blockText.includes('MARKDOWN_EDIT_TYPOGRAPHY_SOURCE_SELECTOR') || !blockText.includes('h1,h2,h3,h4,h5,h6')) {
    throw new Error('expected typography source selector to include heading tags for strict heading view/edit parity')
  }
  if (!blockText.includes("lastPointerSelectionModeRef") || !blockText.includes("event.detail >= 2 ? 'word' : 'caret'")) {
    throw new Error('expected click-open selection mode to support double-click word-selection while entering inline edit')
  }
  if (!blockText.includes('buildApproximateRangeInRoot') || !blockText.includes('buildLocalFallbackRange() || buildApproximateRangeInRoot()')) {
    throw new Error('expected click-open caret placement to use in-root approximate fallback when point-range APIs fail or resolve outside editor')
  }
  if (!blockText.includes('MarkdownContentEditableCore')) {
    throw new Error('expected markdown block editor to reuse the canonical contenteditable core')
  }
  if (
    (!blockText.includes('[&_div]:font-inherit') || !blockText.includes('[&_div]:whitespace-pre-wrap'))
    && !blockText.includes('MARKDOWN_HTML_EDIT_NORMALIZE_CLASS')
  ) {
    throw new Error('expected html edit normalization to preserve div-based line wrappers with read-surface typography and line-break parity')
  }
  if (!blockText.includes('editSpacingSnapshotRef') || !blockText.includes('editCaptureLayoutSpacing') || !blockText.includes('__KG_EDIT_PARITY_PROBE__')) {
    throw new Error('expected markdown block editor to provide gated spacing parity capture and runtime parity probe switch')
  }
  if (!blockText.includes('editCaptureLayoutSpacing = false')) {
    throw new Error('expected generic inline edit surfaces to default layout-spacing capture off to avoid rightward indent drift')
  }
  if (!blockText.includes('if (spacingSnapshot && editStripLinePrefix && args.editStripLinePrefixSpacingSanitize)')) {
    throw new Error('expected quote/callout edit surfaces to sanitize horizontal spacing replay only when explicitly enabled for prefix-stripped edit surfaces')
  }
  if (!blockText.includes('preserveQuoteOnlyBlankLineStructure')) {
    throw new Error('expected quote/callout edit surfaces to preserve blank `>` line-by-line structure when trim-edge-newlines is enabled')
  }
  if (!blockText.includes("'<section><br/></section>'")) {
    throw new Error('expected blank quote-only edit surfaces to use explicit per-line block wrappers for first/last vertical spacing parity')
  }
  if (!blockText.includes('spacingSnapshot.borderLeftWidth = undefined') || !blockText.includes('spacingSnapshot.borderLeftStyle = undefined')) {
    throw new Error('expected quote/callout edit surfaces to keep quote rail visible by avoiding inline border overrides in edit spacing snapshot')
  }
  if (!blockText.includes('__KG_EDIT_PARITY_LAST_PAYLOAD__') || !blockText.includes('kg-edit-parity-probe-json')) {
    throw new Error('expected runtime parity probe to expose visible payload via window global and json console line')
  }
  if (!blockText.includes('reportMarkdownEditParityProbe(payload)')) {
    throw new Error('expected markdown block editor to delegate runtime parity probe reporting to the shared helper')
  }
  if (!blockText.includes('buildMarkdownSigil') || !blockText.includes('parseMarkdownSigil')) {
    throw new Error('expected inline highlight/text color actions to reuse markdown sigil SSOT helpers')
  }
  if (!blockText.includes('readSelectionOffsetsForFormatting')) {
    throw new Error('expected inline highlight/text color actions to use selection fallback when toolbar interaction collapses native selection')
  }
  if (!blockText.includes('lastNonCollapsedSelectionOffsetsRef')) {
    throw new Error('expected markdown block editor to retain last non-collapsed selection while using floating color/highlight menus')
  }
  if (!blockText.includes('lastNonCollapsedDomRangeRef')) {
    throw new Error('expected html editing path to retain a non-collapsed DOM Range for toolbar actions')
  }
  if (!blockText.includes('sel.removeAllRanges()') || !blockText.includes('sel.addRange(last)')) {
    throw new Error('expected html highlight/text color actions to rehydrate selection from cached DOM Range when native selection collapses')
  }
  if (!blockText.includes('data-kg-sigil') || !blockText.includes('rewriteSigilSpansToInlineCodeHtml')) {
    throw new Error('expected html inline editor to render sigil highlights as spans and rewrite them to inline code on commit')
  }
  if (!blockText.includes('rewriteInlineCodeSigilsToStyledSpansHtml')) {
    throw new Error('expected html inline editor to convert sigil inline-code tokens into styled normal text on edit-open')
  }
  if (!blockText.includes('captureInlineSelectionForToolbarAction')) {
    throw new Error('expected inline selection toolbar to reuse shared interaction capture SSOT helper')
  }
  const inlineSelectionToolbarText = readUtf8(path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'MarkdownInlineSelectionToolbar.tsx'))
  if (!inlineSelectionToolbarText.includes("title: 'Highlight'") || !inlineSelectionToolbarText.includes('preventDefaultPointerDown(event)')) {
    throw new Error('expected highlight menu summary to preserve editor focus/selection on pointer down')
  }
  if (!inlineSelectionToolbarText.includes("title: 'Text color'") || !inlineSelectionToolbarText.includes('preventDefaultPointerDown(event)')) {
    throw new Error('expected text color menu summary to preserve editor focus/selection on pointer down')
  }
  if (!inlineSelectionToolbarText.includes('title="Slash commands"') || !inlineSelectionToolbarText.includes('title="Variable commands"')) {
    throw new Error('expected inline selection toolbar to expose / and @ command menu triggers')
  }
  const inlineMenusText = readUtf8(blockInlineMenusOverlayPath)
  const commandMenuText = `${readUtf8(blockCommandMenuPath)}\n${readUtf8(path.resolve(root, 'src', 'lib', 'command-menu', 'InlineMediaCommandThumbnail.tsx'))}`
  if (
    !inlineMenusText.includes('MarkdownBlockContainerCommandMenu')
    || !inlineMenusText.includes("'Type a command'")
    || !inlineMenusText.includes('placeholder="Find variable or action"')
  ) {
    throw new Error('expected inline / and @ menus to reuse the shared command-menu owner with searchable action lists')
  }
  if (!commandMenuText.includes('filterMarkdownInlineCommandItems') || !commandMenuText.includes("event.key === 'ArrowDown'") || !commandMenuText.includes("event.key === 'Enter'")) {
    throw new Error('expected markdown inline command menu to own filtered items and keyboard selection')
  }
  if (
    !commandMenuText.includes('InlineMediaCommandThumbnail') || !commandMenuText.includes('data-kg-inline-command-thumbnail')
    || !commandMenuText.includes('rounded-full')
    || !commandMenuText.includes('UI_THEME_TOKENS.panel.border')
    || !commandMenuText.includes('UI_THEME_TOKENS.input.bg')
    || !commandMenuText.includes('shadow-sm')
  ) {
    throw new Error('expected markdown inline @ media thumbnails to render through the shared tokenized mention-style pill owner')
  }
  if (!blockText.includes('slashMenuRef') || !blockText.includes('active && slashNode && slashNode.contains(active)')) {
    throw new Error('expected slash command menu focus to participate in the upstream inline-edit blur guard')
  }
  if (blockText.includes('<span style="color:')) {
    throw new Error('expected text color action to avoid html span style insertion and emit markdown sigil instead')
  }
  if (blockText.includes('<mark style="background-color:')) {
    throw new Error('expected highlight action to avoid html mark style insertion and emit markdown sigil instead')
  }
  if (blockText.includes('[&_code]:py-0.5')) {
    throw new Error('expected html edit surfaces to avoid inline-code vertical padding that mutates spacing')
  }
  if (blockText.includes('[&_code]:text-sm')) {
    throw new Error('expected html edit surfaces to avoid hardcoded inline-code text size mutation')
  }
  const rendererPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownTokenRenderer.tsx')
  const rendererText = readUtf8(rendererPath)
  if (!rendererText.includes("case 'hr':") || !rendererText.includes('editPresentation="html"')) {
    throw new Error('expected hr blocks to be editable via MarkdownBlockContainer html presentation')
  }
  if (!rendererText.includes('MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS') || !rendererText.includes('editorClassName={MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS}')) {
    throw new Error('expected hr edit surface to reuse centralized normal-text edit surface layout contract')
  }
  const htmlBlockPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownHtmlBlock.tsx')
  const htmlBlockText = readUtf8(htmlBlockPath)
  if (!htmlBlockText.includes('editPresentation="html"') || !htmlBlockText.includes('editHtmlRender="block"') || !htmlBlockText.includes('editHtmlDisableDefaultBlockFlow')) {
    throw new Error('expected html blocks to use html-block in-place editing parity instead of markdown text-mode surface mutation')
  }
  if (!htmlBlockText.includes('MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS')) {
    throw new Error('expected html edit surface to reuse centralized normal-text edit surface layout contract')
  }
  if (!htmlBlockText.includes('const htmlWrapperClassName = [')) {
    throw new Error('expected html block wrapper class composition to be centralized and reused across safe/raw render branches')
  }
  const inlinePath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'MarkdownInlineRenderer.impl.tsx')
  const inlineText = readUtf8(inlinePath)
  if (!inlineText.includes('MARKDOWN_INLINE_CODE_VIEW_CLASS')) {
    throw new Error('expected read inline code to reuse centralized view/edit parity SSOT class')
  }
  const inlineCodeRenderText = inlineText.slice(Math.max(0, inlineText.indexOf('const inlineCodeClassName = MARKDOWN_INLINE_CODE_VIEW_CLASS')), Math.max(0, inlineText.indexOf("if (tt.type === 'math')")))
  if (inlineCodeRenderText.includes('py-0.5') || inlineCodeRenderText.includes('text-sm')) {
    throw new Error('expected read inline code to avoid hardcoded spacing/size that would break parity')
  }
  const sigilText = readUtf8(path.resolve(root, 'src', 'lib', 'markdown', 'markdownSigil.ts'))
  if (!inlineText.includes('parseMarkdownSigil') || !inlineText.includes('readMarkdownSigilInlineStyle(sigil)') || !sigilText.includes('backgroundColor: sigil.background')) {
    throw new Error('expected sigil rendering to map bg# annotations into read-surface background color')
  }
  const codeParityPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'markdownInlineCodeParity.ts')
  const codeParityText = readUtf8(codeParityPath)
  if (!codeParityText.includes('MARKDOWN_INLINE_CODE_VIEW_CLASS') || !codeParityText.includes('MARKDOWN_INLINE_CODE_EDIT_DESCENDANT_CLASSES')) {
    throw new Error('expected inline-code view/edit parity classes to be centralized in markdownInlineCodeParity SSOT')
  }
  if (!codeParityText.includes('ring-1 ring-inset ring-[color:var(--kg-code-border)]') || !codeParityText.includes('[&_code]:ring-[color:var(--kg-code-border)]')) {
    throw new Error('expected inline-code ring parity contracts to be centralized for both read and edit surfaces')
  }
  const tablePath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownTableBlock.tsx')
  const tableText = readUtf8(tablePath)
  if (!tableText.includes('inlineEditable={false}')) {
    throw new Error('expected table/data-view blocks to forbid inline text-edit surface entry')
  }
  if (tableText.includes('inlineEditable={blockControlsAllowed && !!opts.onReplaceLineRange}')) {
    throw new Error('expected table/data-view blocks to avoid toggling into generic contentEditable surface')
  }
  if (!tableText.includes('MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS')) {
    throw new Error('expected table/data-view editor class root to reuse centralized normal-text edit surface layout contract')
  }
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
  if (
    !codeText.includes('MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS')
    && !codeText.includes('MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_BASE_CLASS')
  ) {
    throw new Error('expected code block inline editor root to reuse centralized normal-text edit surface baseline contract')
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
  if (!codeText.includes('MARKDOWN_CODE_FENCE_ASCII_TEXT_COMPACT_CLASS')) {
    throw new Error('expected ascii code-fence read/edit typography parity to reuse centralized compact typography SSOT class')
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
  if (!codeText.includes('CODE_FENCE_LANGUAGE_OPTIONS') || !codeText.includes('Code fence language')) {
    throw new Error('expected code-fence header language control to expose selectable language options for read-viewer fence mutation')
  }
  if (!codeText.includes('handleLanguageSelectChange') || !codeText.includes('replacementOpenLine')) {
    throw new Error('expected code-fence language selector to rewrite the opening fence line while preserving trailing info metadata')
  }
  if (!codeText.includes('onMouseDown={event => event.stopPropagation()}') || !codeText.includes('onDoubleClick={event => event.stopPropagation()}')) {
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
  const listPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownListBlock.tsx')
  const listText = readUtf8(listPath)
  if (!listText.includes('getMarkdownListSurfaceClass(!!list.ordered)')) {
    throw new Error('expected list renderer to keep ordered/unordered marker semantics through shared surface class builder')
  }
  if (!listText.includes('const listItemRowRanges = React.useMemo(() =>')) {
    throw new Error('expected list inline editor to compute separate row token line ranges')
  }
  if (!listText.includes('data-kg-list-item-start-line={resolvedRowRange.startLine}') || !listText.includes('data-kg-list-item-end-line={resolvedRowRange.endLine}')) {
    throw new Error('expected list inline renderer to expose per-row token line metadata')
  }
  if (!listText.includes('const editRange = rowRange || undefined')) {
    throw new Error('expected list row inline editor to isolate edit mode to source-mapped row ranges only')
  }
  if (!listText.includes('editLineRange={editRange}')) {
    throw new Error('expected list row inline editor to edit one row token range at a time')
  }
  if (!listText.includes('const resolvedRowRange = rowRange || {')) {
    throw new Error('expected list row inline editor to resolve fallback row range per item token without mutating SSOT')
  }
  if (!listText.includes('inlineEditable={rowEditingEnabled && !!editRange && useHtmlInlineRow}')) {
    throw new Error('expected paragraph-only list rows to own their source-mapped inline editor while composite rows delegate to nested blocks')
  }
  if (!listText.includes('rowControlsEnabled={gutterEnabled}') || !listText.includes('const rowCanInsert = rowControlsEnabled && !!opts.onInsertLineAfter')) {
    throw new Error('expected each list row token to own insert control eligibility')
  }
  if (!listText.includes('const rowCanReorder = rowControlsEnabled && !!opts.onReorderLineBlock')) {
    throw new Error('expected each list row token to own reorder control eligibility')
  }
  if (!listText.includes('onInsertLine={() => opts.onInsertLineAfter?.(rowEndLine)}')) {
    throw new Error('expected row insert action to target current row end line')
  }
  if (!listText.includes('rowControlsEnabled ? MARKDOWN_LIST_ROW_GUTTER_GROUP_CLASS : \'\'')) {
    throw new Error('expected list row controls to use shared row gutter group class SSOT')
  }
  if (!listText.includes('containerClassName={MARKDOWN_BLOCK_GUTTER_CONTROLS_LIST_ROW_ALIGNMENT_CLASS}')) {
    throw new Error('expected list row controls to reuse shared gutter alignment constant for headings/normal text parity')
  }
  if (!listText.includes('revealClassName="group-hover/list-row:opacity-100"')) {
    throw new Error('expected list row controls to reveal only for hovered row scope (no cross-row control reveal)')
  }
  const gutterPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownBlockGutter.tsx')
  const gutterText = readUtf8(gutterPath)
  if (
    !gutterText.includes('UI_RESPONSIVE_CONTENT_START_PADDING_CLASSNAME') ||
    gutterText.includes(staleContentStartUtility('pl')) ||
    gutterText.includes(staleContentStartUtility('left')) ||
    gutterText.includes(staleMarkdownGutterContentStartAlias())
  ) {
    throw new Error('expected Markdown block gutter content-start spacing to reuse the shared responsive owner without local 44px literals')
  }
  if (!gutterText.includes("MARKDOWN_BLOCK_GUTTER_CONTROLS_LIST_ROW_ALIGNMENT_CLASS = ''")) {
    throw new Error('expected list row controls to fully reuse shared heading/paragraph gutter X alignment (no extra row-only offset)')
  }
  if (!listText.includes('rowControlsEnabled ? MARKDOWN_LIST_ROW_GUTTER_PADDING_CLASS : \'\'')) {
    throw new Error('expected list rows to reuse shared gutter padding SSOT used by headings and normal text')
  }
  if (!listText.includes('inlineEditable={false}')) {
    throw new Error('expected outer list container to stay view-surface while row editor is active')
  }
  if (!listText.includes('editStripLinePrefix={stripListLinePrefix}')) {
    throw new Error('expected list row inline editor to strip/reapply list prefixes for row editing parity')
  }
  if (!listText.includes('renderInlineTokens(onlyParagraph')) {
    throw new Error('expected list row view renderer to inline-render paragraph-only items to keep marker/first-character baseline alignment')
  }
  if (!listText.includes('as="span"') || !listText.includes('className={MARKDOWN_LIST_ROW_VIEW_INLINE_CLASS}')) {
    throw new Error('expected list row container to stay inline-level in view mode to avoid first-character dropping below marker baseline')
  }
  if (!listText.includes('editInlineFlow')) {
    throw new Error('expected list row inline editor to force inline edit flow to avoid first-character dropping below list marker baseline')
  }
  if (!listText.includes('const useHtmlInlineRow = !!onlyParagraph')) {
    throw new Error('expected list row inline editor to enable html-inline mode for paragraph-only rows so existing inline semantics stay rendered during edit')
  }
  if (!listText.includes('editPresentation="html"') || !listText.includes('editHtmlRender="inline"')) {
    throw new Error('expected list row inline editor to preserve rendered html-inline semantics')
  }
  if (
    !listText.includes('const nestedBlockEditingEnabled = rowEditingEnabled && !useHtmlInlineRow')
    || !listText.includes('viewerBlockEditingEnabled={nestedBlockEditingEnabled}')
    || !listText.includes('onReplaceLineRange={nestedBlockEditingEnabled ? opts.onReplaceLineRange : undefined}')
  ) {
    throw new Error('expected composite list rows to keep their rendered children mounted and delegate editing to the selected nested block')
  }
  if (!listText.includes('const readListMarkerIndent = (line: string): number | null =>')) {
    throw new Error('expected list row source ranges to distinguish outer row markers from indented nested markers')
  }
  if (!listText.includes('const rowDefaultLinePrefix = React.useMemo(() =>') || !listText.includes("return ' '.repeat((marker[1] || '').length)")) {
    throw new Error('expected row editor to preserve list indentation width instead of mutating marker indentation')
  }
  if (!listText.includes('const isContinuationLine = (line: string): boolean =>')) {
    throw new Error('expected list inline editor range expansion to include continuation-line semantics')
  }
  if (!listText.includes('const isBlank = (line: string): boolean =>')) {
    throw new Error('expected list inline editor range expansion to bridge blank separators in contiguous list sequences')
  }
  if (!listText.includes('MARKDOWN_LIST_ROW_EDITOR_CLASS')) {
    throw new Error('expected list row inline editor root to follow normal text edit-surface behavior')
  }
  if (!listText.includes('getMarkdownListSurfaceClass(!!list.ordered)')) {
    throw new Error('expected list read/view surface to use centralized marker/indent SSOT class builder')
  }
  if (!listText.includes('MARKDOWN_NORMAL_TEXT_READ_SURFACE_BASE_CLASS')) {
    throw new Error('expected list read/view surface to reuse centralized normal-text read baseline alignment and margin reset contract')
  }
  if (!listText.includes('className={MARKDOWN_LIST_TASK_CHECKBOX_CLASS}')) {
    throw new Error('expected checklist inline editor to use centralized checkbox spacing/alignment SSOT class')
  }
  const listLayoutPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'markdownListLayout.ts')
  const listLayoutText = readUtf8(listLayoutPath)
  if (!listLayoutText.includes('MARKDOWN_LIST_ROW_EDITOR_CLASS = MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS')) {
    throw new Error('expected list row editor baseline class contract to be centralized in markdownListLayout SSOT')
  }
  if (!listLayoutText.includes("MARKDOWN_LIST_ROW_GUTTER_GROUP_CLASS = 'relative group/list-row'")) {
    throw new Error('expected list row hover grouping scope to be centralized and row-local in markdownListLayout SSOT')
  }
  if (!listLayoutText.includes("MARKDOWN_LIST_MARKER_FIRST_CHARACTER_ALIGN_CLASS = 'list-inside pl-0'")) {
    throw new Error('expected list marker/first-character alignment class to be centralized in markdownListLayout SSOT')
  }
  if (!listLayoutText.includes('export const getMarkdownListSurfaceClass = (ordered: boolean): string =>')) {
    throw new Error('expected list read/view surface class composition to be centralized in markdownListLayout SSOT')
  }
  if (listText.includes('editHtmlRender="block"')) {
    throw new Error('expected list row inline editor to avoid block-level html list edit mode')
  }
  const blockquotePath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownBlockquoteBlock.tsx')
  const blockquoteText = readUtf8(blockquotePath)
  const calloutPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownCalloutBlock.tsx')
  const calloutText = readUtf8(calloutPath)
  const footnotePath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownFootnoteBlock.tsx')
  const footnoteText = readUtf8(footnotePath)
  const editSurfaceLayoutPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'markdownEditSurfaceLayout.ts')
  const editSurfaceLayoutText = readUtf8(editSurfaceLayoutPath)
  const headingPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownHeadingBlock.tsx')
  const headingText = readUtf8(headingPath)
  testMarkdownViewerReadableColumnAlignsBodyWithFrontmatterRows()
  if (!editSurfaceLayoutText.includes('MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_BASE_CLASS')) {
    throw new Error('expected normal-text edit surface layout contract to be centralized in markdownEditSurfaceLayout SSOT')
  }
  if (!editSurfaceLayoutText.includes('MARKDOWN_NORMAL_TEXT_READ_SURFACE_BASE_CLASS')) {
    throw new Error('expected normal-text read-surface baseline contract to remain centralized in markdownEditSurfaceLayout SSOT')
  }
  if (!editSurfaceLayoutText.includes('${MARKDOWN_NORMAL_TEXT_READ_SURFACE_BASE_CLASS}')) {
    throw new Error('expected normal-text edit surface baseline to reuse read-surface SSOT class composition and avoid dual-mode drift')
  }
  if (!editSurfaceLayoutText.includes('MARKDOWN_BLOCK_STACK_SPACING_CLASS')) {
    throw new Error('expected markdown block stack spacing rhythm contract to be centralized in markdownEditSurfaceLayout SSOT')
  }
  if (!listText.includes('MARKDOWN_BLOCK_STACK_SPACING_CLASS')) {
    throw new Error('expected markdown list block wrapper spacing to reuse centralized markdown block stack spacing contract')
  }
  if (
    !editSurfaceLayoutText.includes("MARKDOWN_NORMAL_TEXT_READ_SURFACE_BASE_CLASS = 'm-0 text-left [text-indent:0]'") ||
    !editSurfaceLayoutText.includes('MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_WRAP_CLASS')
  ) {
    throw new Error('expected normal-text edit surface layout contract to enforce zero margin, left alignment, and wrapping parity without canceling content-start padding')
  }
  if (!editSurfaceLayoutText.includes('getMarkdownQuoteLikeEditorClass')) {
    throw new Error('expected quote/callout html-block edit-surface class contract to be centralized in markdownEditSurfaceLayout SSOT')
  }
  if (!editSurfaceLayoutText.includes('MARKDOWN_HTML_EDIT_NORMALIZE_CLASS') || !editSurfaceLayoutText.includes('MARKDOWN_HTML_EDIT_BLOCK_FLOW_CLASS')) {
    throw new Error('expected html edit normalization and block-flow contracts to be centralized in markdownEditSurfaceLayout SSOT')
  }
  if (blockquoteText.includes('editLeftRailClassName=')) {
    throw new Error('expected blockquote inline editor to avoid duplicate absolute left rail overlay that breaks view/edit parity')
  }
  if (!blockquoteText.includes('getMarkdownQuoteLikeEditorClass')) {
    throw new Error('expected blockquote inline editor root to reuse centralized quote-like edit-surface class builder')
  }
  if (!blockquoteText.includes('MARKDOWN_BLOCKQUOTE_READ_FRAME_CLASS') || !blockquoteText.includes('MARKDOWN_BLOCKQUOTE_READ_SPACING_CLASS')) {
    throw new Error('expected blockquote read wrapper/frame spacing contracts to reuse centralized normal-text SSOT constants')
  }
  if (!blockquoteText.includes('MARKDOWN_BLOCKQUOTE_READ_TEXT_PADDING_CLASS')) {
    throw new Error('expected blockquote text indentation to reuse centralized quote text-padding SSOT contract for list-aligned content')
  }
  if (!editSurfaceLayoutText.includes("MARKDOWN_BLOCKQUOTE_READ_TEXT_PADDING_CLASS = 'pl-3'")) {
    throw new Error('expected blockquote text indentation rhythm to be tuned via centralized SSOT contract to align with list step cadence')
  }
  if (!editSurfaceLayoutText.includes('[&_blockquote]:${MARKDOWN_BLOCKQUOTE_READ_TEXT_PADDING_CLASS}')) {
    throw new Error('expected html-block blockquote indentation to reuse centralized quote text-padding SSOT contract')
  }
  if (blockquoteText.includes('py-2 pl-4 rounded-r')) {
    throw new Error('expected blockquote gutter shell to avoid hardcoded pl-4 indentation literal and reuse centralized quote text-padding contract')
  }
  if (blockquoteText.includes('`py-2 ${MARKDOWN_BLOCKQUOTE_READ_TEXT_PADDING_CLASS} rounded-r`')) {
    throw new Error('expected blockquote gutter shell to avoid stacking quote text padding with gutter left padding on the same wrapper')
  }
  if (!blockquoteText.includes("<blockquote className={[MARKDOWN_BLOCKQUOTE_READ_TEXT_PADDING_CLASS, MARKDOWN_BLOCKQUOTE_READ_CONTENT_RESET_CLASS].filter(Boolean).join(' ')}>")) {
    throw new Error('expected gutter blockquote inner node to own centralized quote text-padding plus content reset for list-aligned content-start')
  }
  if (!blockquoteText.includes('UI_RESPONSIVE_CONTENT_START_OFFSET_BEFORE_CLASSNAME') || !blockquoteText.includes('before:border-l-4')) {
    throw new Error('expected gutter blockquote border rail to anchor at gutter-content start so border stays right of plus/reorder controls')
  }
  if (!blockquoteText.includes('editTrimEmptyBlockEdges')) {
    throw new Error('expected blockquote inline editor to trim empty editable edges to avoid multi-line trailing extra-row drift')
  }
  if (!blockquoteText.includes('editorQuoteClassNameNoInset') || !blockquoteText.includes('editorClassName={editorQuoteClassNameNoInset}')) {
    throw new Error('expected blockquote inline editor to avoid duplicate inset padding/margin layering')
  }
  const noInsetEditorClassMatches = blockquoteText.match(/editorQuoteClassNameNoInset/g) || []
  if (noInsetEditorClassMatches.length < 2) {
    throw new Error('expected blockquote inline editor to define and reuse no-inset quote editor class SSOT across paths')
  }
  if (!blockquoteText.includes('editorQuoteClassNameNoInsetWithPadding')) {
    throw new Error('expected gutter blockquote inline editor to define a padded no-inset editor class to preserve content-start parity')
  }
  if (!blockquoteText.includes('MARKDOWN_BLOCKQUOTE_READ_TEXT_PADDING_CLASS')) {
    throw new Error('expected gutter blockquote inline editor to reuse centralized quote text-padding SSOT contract for edit parity')
  }
  if (!blockquoteText.includes('editCaptureLayoutSpacing')) {
    throw new Error('expected blockquote inline editor to explicitly enable layout spacing capture parity')
  }
  const paragraphPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownParagraphBlock.tsx')
  const paragraphText = readUtf8(paragraphPath)
  if (!paragraphText.includes('MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS')) {
    throw new Error('expected paragraph inline editor to reuse centralized normal-text edit surface contract')
  }
  if (!calloutText.includes('getMarkdownQuoteLikeEditorClass')) {
    throw new Error('expected callout inline editor body to reuse centralized quote-like edit-surface class builder')
  }
  if (calloutText.includes('editorClassName="w-full whitespace-pre-wrap break-words outline-none bg-transparent"')) {
    throw new Error('expected callout container editor class to reuse centralized normal-text edit surface contract (no duplicated literal class path)')
  }
  if (!calloutText.includes('calloutContainerEditorClassName = MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS')) {
    throw new Error('expected callout non-editable containers to use centralized normal-text edit-surface baseline class alias')
  }
  if (!footnoteText.includes('MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS')) {
    throw new Error('expected footnote inline editor to reuse centralized normal-text edit surface contract')
  }
  if (!blockquoteText.includes('editPresentation="html"') || !blockquoteText.includes('editHtmlRender="block"')) {
    throw new Error('expected blockquote inline editor to use html-block editing for quote line spacing parity without exposing sigil code tokens')
  }
  if (!blockquoteText.includes('editHtmlDisableDefaultBlockFlow')) {
    throw new Error('expected blockquote inline editor to disable default html block flow spacing and preserve quote line-by-line vertical parity')
  }
  if (!blockquoteText.includes('editSigilRenderMode="plain"')) {
    throw new Error('expected blockquote inline editor to render highlight/text-color sigils as plain text during edit (no styled span and no code token)')
  }
  if (headingText.includes('editStripLinePrefixSpacingSanitize={false}')) {
    throw new Error('expected heading inline editor not to disable prefix-spacing sanitize, to avoid duplicated left indentation when `#` prefix is stripped')
  }
  if (!headingText.includes('MARKDOWN_NORMAL_TEXT_READ_SURFACE_BASE_CLASS')) {
    throw new Error('expected heading read wrapper to reuse centralized normal-text read-surface baseline contract')
  }
  if (!headingText.includes('headingRightRailClassName') || !headingText.includes('headingControlVisibilityClassName')) {
    throw new Error('expected heading right-rail controls to reuse centralized local class contracts and avoid duplicated drift paths')
  }
  if (
    !headingText.includes('headingLinkClassName') ||
    !headingText.includes('p-0.5 rounded') ||
    !headingText.includes('flex items-center justify-center shrink-0')
  ) {
    throw new Error('expected heading permalink link to use the same centered icon-button box contract as the collapse chevron')
  }
  if (!headingText.includes('overflow-x-auto whitespace-nowrap')) {
    throw new Error('expected heading inline editor to allow horizontal scroll reveal during edit')
  }
  if (headingText.includes('overflow-hidden text-ellipsis') || headingText.includes('focus:overflow-x-auto') || headingText.includes('focus:[text-overflow:clip]')) {
    throw new Error('expected heading inline editor to avoid ellipsis clipping and focus-overflow overrides')
  }
  if (!blockquoteText.includes('editTrimEdgeNewlines')) {
    throw new Error('expected blockquote inline editor to trim edge newlines to avoid extra-row mutations')
  }
  if (!blockquoteText.includes('editPreserveBlockHeight={false}')) {
    throw new Error('expected blockquote inline editor to avoid min-height preservation that can double-apply inset spacing and cause jump drift')
  }
  if (!blockquoteText.includes('resolveEditLineRangeOnOpen={resolveQuoteEditLineRange}') || !blockquoteText.includes('const resolveQuoteEditLineRange = React.useCallback')) {
    throw new Error('expected blockquote inline editor to clamp edit ranges to contiguous quote lines and avoid extra-row mutation')
  }
  const editParitySsotPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'markdownEditParitySsot.ts')
  const editParitySsotText = readUtf8(editParitySsotPath)
  if (!editParitySsotText.includes('normalizeQuotePrefixSpacingForNoop')) {
    throw new Error('expected quote replacement no-op detection to normalize quote-prefix spacing and avoid synthetic mutation churn')
  }
  if (!editSurfaceLayoutText.includes('[&_p]:whitespace-pre-wrap')) {
    throw new Error('expected quote-like inline editor to preserve per-line paragraph wrapping parity')
  }
  if (!editSurfaceLayoutText.includes('[&_div]:whitespace-pre-wrap')) {
    throw new Error('expected quote-like inline editor to preserve explicit blank rows without collapsing line-by-line spacing')
  }
  if (!editSurfaceLayoutText.includes('[&_div]:font-inherit') || !editSurfaceLayoutText.includes('[&_div]:text-inherit')) {
    throw new Error('expected quote-like inline editor div rows to inherit read-surface typography without mutation')
  }
  if (!editSurfaceLayoutText.includes("MARKDOWN_TEXT_EDIT_SURFACE_MIN_LINE_HEIGHT_CLASS = 'min-h-[1lh]'") || !editSurfaceLayoutText.includes('`${MARKDOWN_TEXT_EDIT_SURFACE_MIN_LINE_HEIGHT_CLASS} leading-normal`')) {
    throw new Error('expected inline editor min-line height to stay centralized while preserving first-line/last-line vertical parity')
  }
  if (!editSurfaceLayoutText.includes('leading-normal')) {
    throw new Error('expected quote-like inline editor root to enforce leading-normal for blank-line vertical spacing parity')
  }
  if (!editSurfaceLayoutText.includes('[&_p]:font-inherit') || !editSurfaceLayoutText.includes('[&_p]:text-inherit')) {
    throw new Error('expected quote-like inline editor paragraphs to inherit read-surface typography without font mutation')
  }
  if (!blockquoteText.includes('opts.uiPanelTextFontClass')) {
    throw new Error('expected blockquote inline editor to keep shared ui panel font class for typography parity')
  }
  if (!blockquoteText.includes('editPreserveWhitespace')) {
    throw new Error('expected blockquote inline editor to preserve raw line breaks during inline edit')
  }
  if (!calloutText.includes("line.match(/^(\\s*(?:>\\s*)+)?([\\s\\S]*)$/)")) {
    throw new Error('expected callout body prefix stripping to preserve multi-level quote marker prefixes')
  }
  if (!calloutText.includes("editHtmlRender=\"block\"")) {
    throw new Error('expected callout body inline editor to use block html render for per-line paragraph parity')
  }
  if (!calloutText.includes('editHtmlDisableDefaultBlockFlow')) {
    throw new Error('expected callout body inline editor to disable default block flow spacing mutations')
  }
  if (!calloutText.includes('editPreserveWhitespace')) {
    throw new Error('expected callout body inline editor to preserve raw line breaks during edit')
  }
  if (!calloutText.includes('getMarkdownQuoteLikeEditorClass')) {
    throw new Error('expected callout body inline editor to reuse centralized quote-like edit-surface class builder')
  }
  if (!calloutText.includes('MARKDOWN_QUOTE_LIKE_CONTENT_RESET_CLASS')) {
    throw new Error('expected callout body content reset to reuse centralized quote-like reset SSOT contract')
  }
  if (!calloutText.includes('MARKDOWN_BLOCKQUOTE_READ_FRAME_CLASS') || !calloutText.includes('MARKDOWN_BLOCKQUOTE_READ_SPACING_CLASS')) {
    throw new Error('expected callout wrapper frame/spacing to reuse centralized blockquote read-surface SSOT contracts')
  }
  if (!calloutText.includes('resolveEditLineRangeOnOpen={resolveCalloutBodyEditLineRange}') || !calloutText.includes('const resolveCalloutBodyEditLineRange = React.useCallback')) {
    throw new Error('expected callout body inline editor to clamp edit ranges to contiguous quote lines and avoid extra-row mutation')
  }
  const dataViewPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownDataViewBlock.tsx')
  const dataViewText = readUtf8(dataViewPath)
  if (!dataViewText.includes('if (!canMutate) return')) {
    throw new Error('expected markdown data-view handlers to guard read-only mutation paths')
  }
  const dataViewSettingsPropsPath = path.resolve(
    root,
    'src',
    'features',
    'markdown-workspace',
    'main',
    'viewer',
    'WorkspaceDataViewSettingsPropertiesSection.tsx',
  )
  const dataViewSettingsPropsText = readUtf8(dataViewSettingsPropsPath)
  if (!dataViewSettingsPropsText.includes('UI_TEXT_TRUNCATE')) {
    throw new Error('expected data-view property name view surfaces to reuse shared truncation SSOT class')
  }
  if (
    !dataViewSettingsPropsText.includes('overflow-x-auto whitespace-nowrap [text-overflow:clip]') ||
    !dataViewSettingsPropsText.includes('COLUMN_NAME_EDIT_INPUT_CLASS')
  ) {
    throw new Error('expected data-view property name edit surface to reveal full text on focus while keeping truncated rest-state contract')
  }
  const kanbanPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'kanban', 'KanbanCard.tsx')
  const kanbanText = readUtf8(kanbanPath)
  if (!kanbanText.includes('disabled={!props.canMutate}')) {
    throw new Error('expected kanban card action menu trigger to be disabled in read-only mode')
  }
}
