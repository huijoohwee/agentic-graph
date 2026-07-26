import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (absPath: string): string => {
  return fs.readFileSync(absPath, { encoding: 'utf8' })
}

export const testMarkdownWorkspaceAvoidsHardcodedLightThemeClasses = () => {
  const root = process.cwd()
  const toolbarPath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'MarkdownWorkspaceToolbar.tsx')
  const explorerPath = path.resolve(root, 'src', 'features', 'markdown-workspace', 'MarkdownWorkspaceExplorer.tsx')
  const files = [
    toolbarPath,
    explorerPath,
    path.resolve(root, 'src', 'features', 'markdown-workspace', 'MarkdownExplorerSection.tsx'),
    path.resolve(root, 'src', 'features', 'markdown-workspace', 'MarkdownFileTree.tsx'),
    path.resolve(root, 'src', 'features', 'markdown-workspace', 'main', 'layout', 'MarkdownWorkspaceLayout.tsx'),
    path.resolve(root, 'src', 'features', 'markdown-workspace', 'main', 'MarkdownWorkspaceMain.tsx'),
  ]
  const offenders = ['bg-white', 'bg-zinc-', 'border-zinc-', 'text-zinc-']
  for (const f of files) {
    const text = readUtf8(f)
    for (const bad of offenders) {
      if (text.includes(bad)) {
        throw new Error(`Markdown workspace must not hardcode ${bad} in ${path.basename(f)}`)
      }
    }
  }

  const toolbar = readUtf8(toolbarPath)
  const explorer = readUtf8(explorerPath)
  if (!toolbar.includes('UI_THEME_TOKENS.panel')) throw new Error('Expected toolbar to use UI_THEME_TOKENS.panel tokens')
  if (!explorer.includes('UI_THEME_TOKENS.panel')) throw new Error('Expected explorer to use UI_THEME_TOKENS.panel tokens')
}

export const testMarkdownPreviewViewerForcesPrimaryTextColor = () => {
  const root = process.cwd()
  const viewerPath = path.resolve(root, 'src', 'lib', 'markdown-core', 'ui', 'MarkdownPreviewViewer.impl.tsx')
  const layoutPath = path.resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownPanelLayout.tsx')
  const viewer = readUtf8(viewerPath)
  const layout = readUtf8(layoutPath)
  if (!viewer.includes('UI_THEME_TOKENS.text.primary')) {
    throw new Error('Markdown preview should apply UI_THEME_TOKENS.text.primary to prevent invisible text')
  }
  if (!layout.includes('UI_THEME_TOKENS.text.primary')) {
    throw new Error('Markdown panel layout should apply UI_THEME_TOKENS.text.primary at the frame level')
  }
}

export const testMarkdownPanelLayoutLetsPreviewOwnVerticalOverflow = () => {
  const layoutPath = path.resolve(process.cwd(), 'src', 'features', 'markdown', 'ui', 'MarkdownPanelLayout.tsx')
  const layout = readUtf8(layoutPath)
  if (!layout.includes('relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden')) {
    throw new Error('Markdown panel content must be allowed to shrink so its preview can own vertical scrolling')
  }
}

export const testMarkdownWorkspaceToolbarAutoRoutesImageModeWithoutManualSelector = () => {
  const toolbarPath = path.resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'MarkdownWorkspaceToolbar.tsx')
  const toolbar = readUtf8(toolbarPath)
  if (toolbar.includes('Imgs: Auto') || toolbar.includes('Imgs: On') || toolbar.includes('Imgs: Off')) {
    throw new Error('Workspace toolbar should not expose manual image mode selector labels')
  }
  if (!toolbar.includes('Fid: Auto')) {
    throw new Error('Workspace toolbar should keep fidelity auto selector for webpage conversion routing')
  }
}
