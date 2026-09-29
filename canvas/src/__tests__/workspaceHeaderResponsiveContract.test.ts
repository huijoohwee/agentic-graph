import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (relativePath: string): string => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

export function testWorkspaceHeaderRowsUseSharedResponsiveOwner() {
  const classText = readUtf8('src/lib/ui/responsiveElementClasses.ts')
  const cssText = readUtf8('src/styles/responsive-toolbar.css')
  const borderCssText = readUtf8('src/styles/shared-borders.css')
  const workspaceHeaderText = readUtf8('src/components/ui/WorkspaceHeader.tsx')
  const markdownExplorerText = readUtf8('src/features/markdown-workspace/MarkdownWorkspaceExplorer.tsx')
  const markdownExplorerSectionText = readUtf8('src/features/markdown-workspace/MarkdownExplorerSection.tsx')
  const markdownExplorerSectionResizeHandleText = readUtf8('src/features/markdown-workspace/MarkdownExplorerSectionResizeHandle.tsx')
  const markdownExplorerSectionResizeText = readUtf8('src/features/markdown-workspace/markdownExplorerSectionResize.ts')
  const markdownFileTreeText = readUtf8('src/features/markdown-workspace/MarkdownFileTree.tsx')
  const markdownSourceFilesListText = readUtf8('src/features/markdown-workspace/MarkdownWorkspaceSourceFilesList.tsx')
  const markdownTocListText = readUtf8('src/features/markdown-workspace/MarkdownWorkspaceTocList.tsx')
  const markdownBacklinksListText = readUtf8('src/features/markdown-workspace/MarkdownWorkspaceBacklinksList.tsx')
  const markdownToolbarText = readUtf8('src/features/markdown-workspace/MarkdownWorkspaceToolbar.tsx')
  const resizeSeparatorText = readUtf8('src/components/ui/VerticalResizeSeparatorHr.tsx')

  if (!classText.includes('UI_RESPONSIVE_WORKSPACE_HEADER_ROW_CLASSNAME')) {
    throw new Error('expected workspace header row class owner to be exported from the shared responsive class registry')
  }
  if (!workspaceHeaderText.includes('UI_RESPONSIVE_WORKSPACE_HEADER_ROW_CLASSNAME') || !markdownExplorerText.includes('WorkspaceHeaderRow')) {
    throw new Error('expected workspace header rows and explorer headers to consume the shared responsive owner')
  }
  if (!cssText.includes('--kg-workspace-header-row-min-height')) {
    throw new Error('expected workspace header row heights to live in shared responsive CSS')
  }
  if (
    !cssText.includes('.kg-markdown-workspace-panel-toolbar-row') ||
    !markdownExplorerText.includes('kg-markdown-workspace-panel-toolbar-row') ||
    !markdownToolbarText.includes('kg-markdown-workspace-panel-toolbar-row') ||
    !markdownToolbarText.includes('kg-markdown-workspace-toolbar-leading') ||
    !markdownToolbarText.includes('kg-markdown-workspace-toolbar-controls') ||
    !cssText.includes('.kg-markdown-workspace-toolbar-row > .kg-markdown-workspace-toolbar-controls') ||
    !cssText.includes('overflow-x: auto !important') ||
    !cssText.includes('overflow: visible !important') ||
    !cssText.includes('width: max-content') ||
    !cssText.includes('--kg-markdown-workspace-toolbar-dock-offset') ||
    !cssText.includes('--kg-markdown-workspace-toolbar-bottom-offset') ||
    !cssText.includes('bottom: calc(var(--kg-safe-bottom) + var(--kg-markdown-workspace-toolbar-bottom-offset))') ||
    !cssText.includes('border-bottom: var(--kg-workspace-divider)') ||
    !cssText.includes('--kg-markdown-workspace-toolbar-editor-clearance') ||
    !cssText.includes('margin-block-end: var(--kg-markdown-workspace-toolbar-editor-clearance) !important') ||
    !cssText.includes('scroll-padding-block-end: var(--kg-markdown-workspace-toolbar-editor-clearance)') ||
    !cssText.includes('touch-action: pan-x')
  ) {
    throw new Error('expected Markdown workspace toolbar row to keep one scroll owner, share the workspace panel footer boundary, and reserve editor clearance in the shared responsive owner')
  }
  if (
    !borderCssText.includes('.kg-markdown-workspace-explorer-resize') ||
    cssText.includes('box-shadow: inset 1px 0 0 var(--kg-divider)') ||
    !borderCssText.includes('inline-size: 100% !important') ||
    !borderCssText.includes('block-size: var(--kg-resize-separator-thickness) !important') ||
    !borderCssText.includes('cursor: row-resize;') ||
    !borderCssText.includes('background-image: linear-gradient(var(--kg-workspace-divider-color), var(--kg-workspace-divider-color))')
  ) {
    throw new Error('expected Explorer to share the thin neutral line while keeping a usable mobile resize target')
  }
  if (
    !classText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_SECTION_CLASSNAME') ||
    !classText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_CONTENT_CLASSNAME') ||
    !classText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_SECTION_SCROLL_PRIMARY_CLASSNAME') ||
    !classText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_SECTION_SCROLL_SECONDARY_CLASSNAME') ||
    !classText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_SECTION_BODY_CLASSNAME') ||
    !classText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_LIST_CLASSNAME') ||
    !classText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_EMPTY_STATE_CLASSNAME') ||
    !cssText.includes('.kg-markdown-workspace-explorer-content') ||
    !cssText.includes('.kg-markdown-workspace-explorer-section-resize') ||
    !cssText.includes('var(--kg-resize-separator-thickness, 0.25rem)') ||
    !cssText.includes('.kg-markdown-workspace-explorer-section--scroll-primary') ||
    !cssText.includes('.kg-markdown-workspace-explorer-section--scroll-secondary') ||
    !cssText.includes('.kg-markdown-workspace-explorer-section-body') ||
    !cssText.includes('.kg-markdown-workspace-explorer-list') ||
    !cssText.includes('.kg-markdown-workspace-explorer-empty-state') ||
    !cssText.includes('overflow-y: auto') ||
    !resizeSeparatorText.includes("RESIZE_SEPARATOR_THICKNESS = 'var(--kg-resize-separator-thickness, 0.25rem)'") ||
    !resizeSeparatorText.includes('HorizontalResizeSeparatorHr') ||
    !resizeSeparatorText.includes('aria-orientation="horizontal"') ||
    !resizeSeparatorText.includes('cursor-row-resize') ||
    !resizeSeparatorText.includes('inlineSize: RESIZE_SEPARATOR_THICKNESS') ||
    !resizeSeparatorText.includes('blockSize: RESIZE_SEPARATOR_THICKNESS') ||
    !markdownExplorerText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_CONTENT_CLASSNAME') ||
    !markdownExplorerText.includes('scrollMode="primary"') ||
    !markdownExplorerText.includes("tocItems.length > 0 || sectionHeightsPx ? 'secondary' : 'auto'") ||
    !markdownExplorerText.includes("backlinks.length > 0 || sectionHeightsPx ? 'secondary' : 'auto'") ||
    !markdownExplorerText.includes('MarkdownExplorerSectionResizeHandle') ||
    !markdownExplorerText.includes('boundary="sourceFiles-toc"') ||
    !markdownExplorerText.includes('boundary="toc-backlinks"') ||
    !markdownExplorerText.includes('readMarkdownExplorerSectionHeightsPx') ||
    !markdownExplorerSectionText.includes('MarkdownExplorerSectionScrollMode') ||
    !markdownExplorerSectionText.includes('sectionRef?: React.Ref<HTMLElement>') ||
    !markdownExplorerSectionText.includes('sectionStyle?: React.CSSProperties') ||
    !markdownExplorerSectionText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_SECTION_SCROLL_PRIMARY_CLASSNAME') ||
    !markdownExplorerSectionText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_SECTION_SCROLL_SECONDARY_CLASSNAME') ||
    !markdownExplorerSectionText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_SECTION_BODY_CLASSNAME') ||
    !markdownExplorerSectionResizeHandleText.includes('HorizontalResizeSeparatorHr') ||
    !markdownExplorerSectionResizeHandleText.includes('bindResizeSeparatorDragRuntime') ||
    !markdownExplorerSectionResizeHandleText.includes('resolveMarkdownExplorerSectionResize') ||
    !markdownExplorerSectionResizeText.includes('resolveMarkdownExplorerSectionResize') ||
    !markdownExplorerSectionResizeText.includes("sourceFiles-toc") ||
    !markdownExplorerSectionResizeText.includes("toc-backlinks") ||
    !markdownFileTreeText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_LIST_CLASSNAME') ||
    !markdownSourceFilesListText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_EMPTY_STATE_CLASSNAME') ||
    !markdownTocListText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_LIST_CLASSNAME') ||
    !markdownTocListText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_EMPTY_STATE_CLASSNAME') ||
    !markdownBacklinksListText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_LIST_CLASSNAME') ||
    !markdownBacklinksListText.includes('UI_RESPONSIVE_MARKDOWN_WORKSPACE_EXPLORER_EMPTY_STATE_CLASSNAME')
  ) {
    throw new Error('expected Source Files, TOC, and Backlinks to share Explorer section body, list, and empty-state responsive owners')
  }
  if (cssText.includes('--kg-markdown-workspace-explorer-section-resize-size')) {
    throw new Error('expected Explorer section resize handles to reuse the shared resize separator thickness token')
  }
  if (
    [markdownExplorerSectionText, markdownFileTreeText, markdownTocListText, markdownBacklinksListText].some(text => text.includes('overflow-auto'))
  ) {
    throw new Error('expected Explorer child sections and lists to stay free of local Tailwind scroll owners')
  }
  if (markdownExplorerText.includes('UI_RESPONSIVE_VIEWPORT_SCROLL_PANEL_CLASSNAME') || markdownExplorerText.includes('kg-responsive-viewport-scroll-panel')) {
    throw new Error('expected Markdown Explorer to use section-level scroll owners instead of one shared viewport scroller')
  }
  if (
    [markdownExplorerText, markdownToolbarText].some(text => text.includes('min-h-[calc(var(--kg-control-height,28px)+0.5rem+2px)]')) ||
    markdownExplorerText.includes('UI_RESPONSIVE_WORKSPACE_HEADER_ROW_CLASSNAME') ||
    markdownExplorerText.includes('uiToolbarRowScrollJustifyBetweenClassName') ||
    markdownToolbarText.includes('kg-markdown-workspace-toolbar-row kg-toolbar')
  ) {
    throw new Error('expected workspace header consumers to stay free of local toolbar height literals and duplicated row-scroll wiring')
  }
}
