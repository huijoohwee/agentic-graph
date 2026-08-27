import { buildCanvasEmbedIframeMarkup } from '@/features/canvas/canvasEmbedIframeMarkup'
import { buildMarkdownFileTreeContextMenuItems } from '@/features/markdown-workspace/markdownFileTreeContextMenuItems'
import { WORKSPACE_README_SEED_PATH } from '@/features/workspace-fs/workspaceFs'

export async function testMarkdownFileTreeContextMenuItemsReuseSharedDefinitions() {
  const calls: string[] = []
  const copied: string[] = []
  const items = buildMarkdownFileTreeContextMenuItems({
    entry: {
      path: '/docs/note.md',
      parentPath: '/docs',
      kind: 'file',
      name: 'note.md',
      updatedAtMs: 0,
    },
    copyToClipboard: async text => {
      copied.push(text)
      return true
    },
    onCreateNewFile: () => calls.push('new-file'),
    onRevealInFinder: path => calls.push(`reveal:${path}`),
    onClearFile: path => calls.push(`clear:${path}`),
    onRenameEntry: (path, nextName) => calls.push(`rename:${path}:${nextName}`),
    onDeleteEntry: path => calls.push(`delete:${path}`),
    closeContextMenu: () => calls.push('close'),
    promptRename: currentName => {
      calls.push(`prompt:${currentName}`)
      return 'renamed.md'
    },
    confirmDelete: entryPath => {
      calls.push(`confirm:${entryPath}`)
      return true
    },
  })

  const labels = items.map(item => item.label).join(',')
  if (labels !== 'Share URL,Share canvas embed,Reveal in Finder,Copy Path,Copy Relative Path,New file,Clear,Rename,Delete') {
    throw new Error(`expected shared file-tree context-menu labels, got ${labels}`)
  }
  if (items[8]?.tone !== 'danger') {
    throw new Error(`expected delete menu item to be danger tone, got ${String(items[8]?.tone || '')}`)
  }

  items[0]?.onSelect()
  items[1]?.onSelect()
  items[2]?.onSelect()
  await items[3]?.onSelect()
  await items[4]?.onSelect()
  items[5]?.onSelect()
  items[6]?.onSelect()
  items[7]?.onSelect()
  items[8]?.onSelect()

  const callLog = calls.join(',')
  if (!callLog.includes('new-file,close')) {
    throw new Error(`expected New file item to create and close, got ${callLog}`)
  }
  if (!callLog.includes('clear:/docs/note.md,close')) {
    throw new Error(`expected Clear item to clear file and close, got ${callLog}`)
  }
  if (!callLog.includes('reveal:/docs/note.md,close')) {
    throw new Error(`expected reveal item to reveal and close, got ${callLog}`)
  }
  if (!callLog.includes('prompt:note.md,rename:/docs/note.md:renamed.md,close')) {
    throw new Error(`expected rename item to prompt, rename, and close, got ${callLog}`)
  }
  if (!callLog.includes('confirm:/docs/note.md,delete:/docs/note.md,close')) {
    throw new Error(`expected delete item to confirm, delete, and close, got ${callLog}`)
  }
  if (copied.join(',') !== '/docs/note.md,docs/note.md') {
    throw new Error(`expected copy actions to reuse absolute and relative path logic, got ${copied.join(',')}`)
  }
}

export async function testMarkdownFileTreeContextMenuItemsHideMutationsForInitializationFiles() {
  const items = buildMarkdownFileTreeContextMenuItems({
    entry: {
      path: WORKSPACE_README_SEED_PATH,
      parentPath: '/',
      kind: 'file',
      name: 'workspace-readme.md',
      updatedAtMs: 0,
    },
    copyToClipboard: async () => true,
    onCreateNewFile: () => void 0,
    onClearFile: () => void 0,
    closeContextMenu: () => void 0,
  })

  const labels = items.map(item => item.label).join(',')
  if (labels !== 'Share URL,Share canvas embed,Reveal in Finder,Copy Path,Copy Relative Path,New file,Clear') {
    throw new Error(`expected initialization-file menu to hide rename and delete, got ${labels}`)
  }
}

export async function testMarkdownFileTreeShareUrlAwaitsAsyncPublishedUrlBeforeCopy() {
  const calls: string[] = []
  const copied: string[] = []
  const items = buildMarkdownFileTreeContextMenuItems({
    entry: {
      path: '/docs/public.md',
      parentPath: '/docs',
      kind: 'file',
      name: 'public.md',
      updatedAtMs: 0,
    },
    buildShareUrl: async () => 'https://airvio.co/agenticgraph/share/kg-public-token',
    copyToClipboard: async text => {
      copied.push(text)
      return true
    },
    closeContextMenu: () => calls.push('close'),
  })

  await items[0]?.onSelect()
  await new Promise(resolve => setTimeout(resolve, 0))
  if (calls.join(',') !== 'close') {
    throw new Error(`expected Share URL to close the context menu immediately, got ${calls.join(',')}`)
  }
  if (copied.join(',') !== 'https://airvio.co/agenticgraph/share/kg-public-token') {
    throw new Error(`expected async published Share URL to be copied, got ${copied.join(',')}`)
  }
}

export async function testMarkdownFileTreeShareActionsReuseCodePanelContract() {
  const panels: Array<{ sourceName: string; title: string; language: string; code: string }> = []
  const copied: string[] = []
  const items = buildMarkdownFileTreeContextMenuItems({
    entry: {
      path: '/docs/public.md',
      parentPath: '/docs',
      kind: 'file',
      name: 'public.md',
      updatedAtMs: 0,
    },
    buildShareUrl: async () => 'https://airvio.co/agenticgraph/share/kg-public-token',
    copyToClipboard: async text => {
      copied.push(text)
      return true
    },
    onShareCodeReady: detail => panels.push(detail),
    closeContextMenu: () => void 0,
  })

  await items[0]?.onSelect()
  await new Promise(resolve => setTimeout(resolve, 0))
  await items[3]?.onSelect()
  await items[4]?.onSelect()

  const panelSummary = panels.map(panel => `${panel.title}:${panel.language}:${panel.code}`).join('|')
  if (panelSummary !== 'Share URL:plaintext:https://airvio.co/agenticgraph/share/kg-public-token|Copy Path:plaintext:/docs/public.md|Copy Relative Path:plaintext:docs/public.md') {
    throw new Error(`expected URL and path actions to use the shared code-panel contract, got ${panelSummary}`)
  }
  if (copied.join(',') !== 'https://airvio.co/agenticgraph/share/kg-public-token,/docs/public.md,docs/public.md') {
    throw new Error(`expected share and copy actions to preserve their clipboard values, got ${copied.join(',')}`)
  }
}

export async function testMarkdownFileTreeShareCanvasEmbedAwaitsAsyncPublishedUrlBeforeCopy() {
  const calls: string[] = []
  const copied: string[] = []
  const selected: string[] = []
  const items = buildMarkdownFileTreeContextMenuItems({
    entry: {
      path: '/docs/public.md',
      parentPath: '/docs',
      kind: 'file',
      name: 'public.md',
      updatedAtMs: 0,
    },
    buildCanvasEmbedUrl: async () => 'https://airvio.co/agenticgraph/share/kg-public-token?kgPreview=1',
    copyToClipboard: async text => {
      copied.push(text)
      return true
    },
    onCanvasEmbedStart: entry => calls.push(`start:${entry.path}`),
    onCanvasEmbedReady: (entry, url) => selected.push(`${entry.path}:${url}`),
    closeContextMenu: () => calls.push('close'),
  })

  await items[1]?.onSelect()
  await new Promise(resolve => setTimeout(resolve, 0))
  if (calls.join(',') !== 'start:/docs/public.md,close') {
    throw new Error(`expected Share canvas embed to close the context menu immediately, got ${calls.join(',')}`)
  }
  const expectedIframe = buildCanvasEmbedIframeMarkup('https://airvio.co/agenticgraph/share/kg-public-token?kgPreview=1')
  if (copied.join(',') !== expectedIframe) {
    throw new Error(`expected async published canvas iframe markup to be copied, got ${copied.join(',')}`)
  }
  if (selected.join(',') !== '/docs/public.md:https://airvio.co/agenticgraph/share/kg-public-token?kgPreview=1') {
    throw new Error(`expected the published canvas embed to select the same source for the Live Canvas Hero, got ${selected.join(',')}`)
  }
}

export async function testMarkdownFileTreeShareUrlPromptsWhenClipboardUnavailable() {
  const prompted: string[] = []
  const items = buildMarkdownFileTreeContextMenuItems({
    entry: {
      path: '/docs/public.md',
      parentPath: '/docs',
      kind: 'file',
      name: 'public.md',
      updatedAtMs: 0,
    },
    buildShareUrl: () => 'https://airvio.co/agenticgraph/share/kg-public-token',
    copyToClipboard: async () => false,
    promptShareUrl: url => prompted.push(url),
    closeContextMenu: () => void 0,
  })

  await items[0]?.onSelect()
  await new Promise(resolve => setTimeout(resolve, 0))
  if (prompted.join(',') !== 'https://airvio.co/agenticgraph/share/kg-public-token') {
    throw new Error(`expected Share URL fallback prompt when clipboard write is unavailable, got ${prompted.join(',')}`)
  }
}

export async function testMarkdownFileTreeShareCanvasEmbedSurfacesUnavailablePublishResult() {
  const errors: string[] = []
  const copied: string[] = []
  const selected: string[] = []
  const items = buildMarkdownFileTreeContextMenuItems({
    entry: {
      path: '/docs/public.md',
      parentPath: '/docs',
      kind: 'file',
      name: 'public.md',
      updatedAtMs: 0,
    },
    buildCanvasEmbedUrl: async () => null,
    copyToClipboard: async text => {
      copied.push(text)
      return true
    },
    onShareUrlError: message => errors.push(message),
    onCanvasEmbedReady: (entry, url) => selected.push(`${entry.path}:${url}`),
    closeContextMenu: () => void 0,
  })

  await items[1]?.onSelect()
  await new Promise(resolve => setTimeout(resolve, 0))
  if (copied.length !== 0) {
    throw new Error(`expected unavailable canvas embed URL to avoid copying unpublished URLs, got ${copied.join(',')}`)
  }
  if (!errors.join(',').includes('Canvas embed URL is unavailable')) {
    throw new Error(`expected unavailable canvas embed URL to surface a publish message, got ${errors.join(',')}`)
  }
  if (selected.length !== 0) {
    throw new Error(`expected unavailable canvas embed URL not to swap the Live Canvas Hero, got ${selected.join(',')}`)
  }
}

export async function testMarkdownFileTreeShareUrlSurfacesPublishFailure() {
  const calls: string[] = []
  const errors: string[] = []
  const copied: string[] = []
  const items = buildMarkdownFileTreeContextMenuItems({
    entry: {
      path: '/docs/public.md',
      parentPath: '/docs',
      kind: 'file',
      name: 'public.md',
      updatedAtMs: 0,
    },
    buildShareUrl: async () => {
      throw new Error('publish failed')
    },
    copyToClipboard: async text => {
      copied.push(text)
      return true
    },
    onShareUrlError: message => errors.push(message),
    closeContextMenu: () => calls.push('close'),
  })

  await items[0]?.onSelect()
  await new Promise(resolve => setTimeout(resolve, 0))
  if (calls.join(',') !== 'close') {
    throw new Error(`expected Share URL failure to close the context menu immediately, got ${calls.join(',')}`)
  }
  if (copied.length !== 0) {
    throw new Error(`expected Share URL failure to avoid copying unpublished URLs, got ${copied.join(',')}`)
  }
  if (errors.join(',') !== 'publish failed') {
    throw new Error(`expected Share URL publish failure to surface the error, got ${errors.join(',')}`)
  }
}

export async function testMarkdownFileTreeShareUrlSurfacesUnavailablePublishResult() {
  const errors: string[] = []
  const copied: string[] = []
  const items = buildMarkdownFileTreeContextMenuItems({
    entry: {
      path: '/docs/public.md',
      parentPath: '/docs',
      kind: 'file',
      name: 'public.md',
      updatedAtMs: 0,
    },
    buildShareUrl: async () => null,
    copyToClipboard: async text => {
      copied.push(text)
      return true
    },
    onShareUrlError: message => errors.push(message),
    closeContextMenu: () => void 0,
  })

  await items[0]?.onSelect()
  await new Promise(resolve => setTimeout(resolve, 0))
  if (copied.length !== 0) {
    throw new Error(`expected unavailable Share URL to avoid copying unpublished URLs, got ${copied.join(',')}`)
  }
  if (!errors.join(',').includes('could not be published')) {
    throw new Error(`expected unavailable Share URL to surface a publish message, got ${errors.join(',')}`)
  }
}
