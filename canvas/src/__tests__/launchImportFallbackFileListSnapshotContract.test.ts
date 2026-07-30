import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testLaunchImportFallbackSnapshotsFileListBeforeClearingInput() {
  const p = resolve(process.cwd(), 'src', 'lib', 'toolbar', 'LaunchDropdown.impl.tsx')
  const text = readFileSync(p, 'utf8')
  const dispatch = readFileSync(resolve(process.cwd(), 'src', 'lib', 'toolbar', 'launchImportDispatch.ts'), 'utf8')

  if (!text.includes('runLaunchImportLocalFiles({') || !text.includes('fallback: importLocalFilesFallback')) {
    throw new Error('expected Launch import local files to use the shared bridge/fallback dispatcher')
  }
  if (!dispatch.includes('const snapshot = args.files ? Array.from(args.files as ArrayLike<File>) : []')) {
    throw new Error('expected Launch import local files dispatcher to snapshot FileList before clearing input')
  }
  if (
    !text.includes('runLaunchImportLocalFolderPreview({')
    || !text.includes('fallback: importLocalFolderFallback')
    || !dispatch.includes('const snapshot = args.files ? Array.from(args.files as ArrayLike<File>) : []')
  ) {
    throw new Error('expected Launch import folder preview fallback to snapshot FileList before clearing input')
  }
}

export function testLaunchDropdownNewMarkdownUsesSharedDocsCreator() {
  const p = resolve(process.cwd(), 'src', 'lib', 'toolbar', 'LaunchDropdown.impl.tsx')
  const text = readFileSync(p, 'utf8')
  const helper = readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'createNewMarkdownSourceFile.ts'), 'utf8')
  const timestampHelper = readFileSync(resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'workspaceTimestamp.ts'), 'utf8')

  const required = [
    'createNewMarkdownSourceFile()',
    '<FilePlus2 className={menuIconClass} strokeWidth={1.6} />',
    '<span className="truncate">New .md</span>',
    "id: 'launch:new-markdown-file'",
  ]
  const missing = required.filter(snippet => !text.includes(snippet))
  if (missing.length) {
    throw new Error(`expected Launch dropdown New .md to use the shared authored-notes creator: ${missing.join(', ')}`)
  }

  const helperRequired = [
    'WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH',
    'formatWorkspaceUtcSessionTimestamp',
    'ensureWorkspaceFolderTreeIfMissing',
    'setWorkspaceEntrySource',
  ]
  const helperMissing = helperRequired.filter(snippet => !helper.includes(snippet))
  if (helperMissing.length) {
    throw new Error(`expected source-file creator to own authored-notes timestamped markdown creation: ${helperMissing.join(', ')}`)
  }
  if (helper.includes("name: 'note.md'") || helper.includes('WORKSPACE_ROOT_PATH')) {
    throw new Error('expected new markdown source helper to remove the stale root note.md hardcode')
  }
  if (!timestampHelper.includes('formatWorkspaceUtcSessionTimestamp')) {
    throw new Error('expected Launch markdown creation to reuse the shared workspace UTC timestamp helper')
  }
}

export function testLaunchDropdownHomeUsesCanonicalAirvioOrigin() {
  const dropdown = readFileSync(resolve(process.cwd(), 'src', 'lib', 'toolbar', 'LaunchDropdown.impl.tsx'), 'utf8')
  const homeRoute = readFileSync(resolve(process.cwd(), 'src', 'lib', 'routing', 'airvioHome.ts'), 'utf8')
  const required = [
    "import { AIRVIO_HOME_URL } from '@/lib/routing/airvioHome'",
    'href={AIRVIO_HOME_URL}',
    'data-kg-launch-home="true"',
    '<span className="truncate">Home</span>',
  ]
  const missing = required.filter(snippet => !dropdown.includes(snippet))
  if (missing.length) throw new Error(`expected Launch Home action contract: ${missing.join(', ')}`)
  if (!homeRoute.includes("AIRVIO_HOME_URL = 'https://airvio.co/'")) {
    throw new Error('expected Launch Home to use the canonical airvio.co origin')
  }
}
