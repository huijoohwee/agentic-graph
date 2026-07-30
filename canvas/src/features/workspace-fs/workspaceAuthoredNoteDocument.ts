import {
  extractYamlFrontmatterBlock,
  parseCanvasWorkspaceFrontmatterPreset,
  type CanvasWorkspaceFrontmatterPreset,
} from '@/lib/markdown/frontmatter'
import { normalizeWorkspacePath, workspaceBasename } from './path'
import { WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH } from './workspaceSourceRoots'

const NOTE_CANVAS_FRONTMATTER_LINES = [
  'kgCanvasSurfaceMode: "2d"',
  'kgCanvasRenderMode: "2d"',
] as const

export function isWorkspaceAuthoredMarkdownNotePath(path: string): boolean {
  const normalized = normalizeWorkspacePath(path)
  return normalized.startsWith(`${WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH}/`)
}

function resolveAuthoredMarkdownNoteTitle(documentName: string, rawText = ''): string {
  const heading = String(rawText || '').match(/^#\s+(.+?)\s*$/m)?.[1]?.trim()
  if (heading) return heading
  const basename = workspaceBasename(normalizeWorkspacePath(documentName))
  return basename.replace(/\.[^.]+$/, '') || 'Note'
}

function buildAuthoredMarkdownNoteDefaultLines(documentName: string, rawText = ''): string[] {
  return [
    `title: ${JSON.stringify(resolveAuthoredMarkdownNoteTitle(documentName, rawText))}`,
    ...NOTE_CANVAS_FRONTMATTER_LINES,
  ]
}

export function buildAuthoredMarkdownNoteInitialText(documentName: string): string {
  if (!isWorkspaceAuthoredMarkdownNotePath(documentName)) return ''
  return [
    '---',
    ...buildAuthoredMarkdownNoteDefaultLines(documentName),
    '---',
    '',
  ].join('\n')
}

export function isAuthoredMarkdownNoteInitialDocument(args: {
  documentName: string
  rawText: string
}): boolean {
  const expected = buildAuthoredMarkdownNoteInitialText(args.documentName)
  if (!expected) return false
  const normalize = (value: string): string => String(value || '').replace(/\r\n?/g, '\n').trimEnd()
  return normalize(args.rawText) === normalize(expected)
}

export function resolveWorkspaceDocumentCanvasPreset(args: {
  documentName: string
  rawText: string
}): CanvasWorkspaceFrontmatterPreset | null {
  const authoredPreset = parseCanvasWorkspaceFrontmatterPreset(args.rawText)
  if (!isWorkspaceAuthoredMarkdownNotePath(args.documentName)) return authoredPreset
  if (authoredPreset?.canvasSurfaceMode || authoredPreset?.canvasRenderMode) return authoredPreset
  return {
    ...(authoredPreset || {}),
    canvasSurfaceMode: '2d',
    canvasRenderMode: '2d',
  }
}

export function ensureAuthoredMarkdownNoteFrontmatterDefaults(args: {
  documentName: string
  rawText: string
}): string {
  const documentName = String(args.documentName || '').trim()
  const rawText = String(args.rawText || '')
  if (!isWorkspaceAuthoredMarkdownNotePath(documentName)) return rawText

  const defaults = buildAuthoredMarkdownNoteDefaultLines(documentName, rawText)
  const block = extractYamlFrontmatterBlock(rawText)
  if (!block) {
    return `${['---', ...defaults, '---', ''].join('\n')}${rawText ? `\n${rawText}` : ''}`
  }

  const yamlLines = String(block.yamlText || '').split('\n')
  const hasTopLevelKey = (key: string) => yamlLines.some(line => (
    !/^\s/.test(line) && new RegExp(`^${key}\\s*:`).test(line)
  ))
  const missingDefaults = defaults.filter(line => {
    const key = line.slice(0, line.indexOf(':'))
    return !hasTopLevelKey(key)
  })
  if (missingDefaults.length === 0) return rawText

  const suffix = rawText.slice(block.rawBlock.length)
  return `---\n${[...missingDefaults, ...yamlLines].join('\n')}\n---${suffix}`
}
