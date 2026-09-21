import { dump, load } from 'js-yaml'
import { getObjectPath, setObjectPath } from '@/lib/data/objectPath'
import type { MarkdownVariablePreview } from './MarkdownRendererTypes'
import { parseMarkdownVariableTokens } from './markdownVariableReferences'

export type MarkdownVariableChoice = { value: string; label: string; bindings?: Record<string, string> }
export type MarkdownVariableChoiceDefinition = { label: string; options: MarkdownVariableChoice[] }
export type MarkdownVariableChoicePatch = { startLine: number; endLine: number; replacementLines: string[]; frontmatterUpdates: Record<string, unknown> }
const pathPattern = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*$/
const safePath = (key: string) => key.length <= 128 && pathPattern.test(key)
  && !key.split('.').some(part => ['__proto__', 'prototype', 'constructor', 'markdownVariableChoices'].includes(part))
const objectPath = (key: string) => key.replace(/\.(\d+)(?=\.|$)/g, '[$1]')
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

function readHeader(source: string) {
  const lines = source.split(/\r?\n/)
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (lines[0]?.trim() !== '---' || end < 1) return null
  try {
    const meta = record(load(lines.slice(1, end).join('\n')))
    return meta ? { lines, end, meta } : null
  } catch { return null }
}

export function readMarkdownVariableChoices(source: string): Record<string, MarkdownVariableChoiceDefinition> {
  const header = readHeader(source)
  const definitions = record(header?.meta.markdownVariableChoices)
  const result: Record<string, MarkdownVariableChoiceDefinition> = {}
  for (const [key, raw] of Object.entries(definitions || {}).slice(0, 64)) {
    const definition = record(raw)
    if (!safePath(key) || !Array.isArray(definition?.options) || typeof getObjectPath(header?.meta, objectPath(key)) !== 'string') continue
    const options: MarkdownVariableChoice[] = []
    for (const rawOption of definition.options.slice(0, 32)) {
      const option = record(rawOption)
      if (typeof option?.value !== 'string' || typeof option.label !== 'string' || !option.label || option.value.length > 512 || option.label.length > 256) continue
      const bindings = record(option.bindings)
      if (option.bindings != null && (!bindings || Object.entries(bindings).length > 16 || Object.entries(bindings).some(([path, value]) => !safePath(path) || typeof value !== 'string' || value.length > 512 || typeof getObjectPath(header?.meta, objectPath(path)) !== 'string'))) continue
      if (options.some(candidate => candidate.value === option.value)) continue
      options.push({ value: option.value, label: option.label, ...(bindings ? { bindings: bindings as Record<string, string> } : {}) })
    }
    if (options.length) result[key] = { label: typeof definition.label === 'string' ? definition.label.slice(0, 128) : key, options }
  }
  return result
}

/** One source edit updates the selected scalar and its explicitly authored bindings. */
export function buildMarkdownVariableChoicePatch(source: string, key: string, value: string): MarkdownVariableChoicePatch | null {
  const header = readHeader(source)
  const option = readMarkdownVariableChoices(source)[key]?.options.find(candidate => candidate.value === value)
  if (!header || !option) return null
  const updates = { ...option.bindings, [key]: value }
  let meta = header.meta
  for (const [path, next] of Object.entries(updates)) meta = setObjectPath(meta, objectPath(path), next)
  const roots = new Set(Object.keys(updates).map(path => path.split('.')[0]!))
  const edits = [...roots].map(root => {
    const start = header.lines.findIndex((line, index) => index > 0 && index < header.end && line.startsWith(`${root}:`))
    if (start < 1) return null
    let end = start + 1
    while (end < header.end && !/^[^\s#][^:]*:/.test(header.lines[end]!)) end += 1
    return { start, end, lines: dump({ [root]: meta[root] }, { noRefs: true, lineWidth: -1 }).trimEnd().split('\n') }
  })
  if (edits.some(edit => !edit)) return null
  const replacementLines = header.lines.slice(1, header.end)
  for (const edit of edits.filter(edit => edit != null).sort((a, b) => b.start - a.start)) replacementLines.splice(edit.start - 1, edit.end - edit.start, ...edit.lines)
  return { startLine: 2, endLine: header.end, replacementLines, frontmatterUpdates: Object.fromEntries([...roots].map(root => [root, meta[root]])) }
}

/** Captions may reference other frontmatter scalars; cycles stay visible and bounded. */
export function resolveMarkdownVariableText(text: string, previews: Record<string, MarkdownVariablePreview>, visited: string[] = []): string {
  if (visited.length >= 8) return text
  let cursor = 0, result = ''
  for (const token of parseMarkdownVariableTokens(text)) {
    result += text.slice(cursor, token.start)
    const key = token.key.toLowerCase(), preview = previews[key]
    const value = preview?.choices?.options.find(option => option.value === preview.value)?.label ?? preview?.value ?? token.fallback ?? token.declaredValue
    result += value == null || visited.includes(key) ? token.raw : resolveMarkdownVariableText(value, previews, [...visited, key])
    cursor = token.end
  }
  return result + text.slice(cursor)
}
