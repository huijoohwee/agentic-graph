import type { CommandMenuRichMediaItem } from '@/lib/command-menu/commandMenuRichMediaInventory'
import { extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'

export const PREVIEW_NARRATION_LIMIT = 2_000
const SOURCE_SCAN_LIMIT = 64_000

export function scopePreviewItems(items: readonly CommandMenuRichMediaItem[], selectedNodeId: string | null) {
  return items.filter(item => item.source === 'markdown' || !!selectedNodeId && item.nodeId === selectedNodeId)
}

export function buildPreviewNarration(markdown: string): { text: string; truncated: boolean } {
  const bounded = markdown.slice(0, SOURCE_SCAN_LIMIT)
  const body = extractYamlFrontmatterBlock(bounded)?.bodyText ?? (/^---\s*\n/.test(bounded) ? '' : bounded)
  const cleaned = body.replace(/<(script|style)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, '')
  const lines: string[] = []
  let fence = '', fenceLength = 0
  for (const line of cleaned.split(/\r?\n/)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker) {
      if (!fence) { fence = marker[0]; fenceLength = marker.length }
      else if (marker[0] === fence && marker.length >= fenceLength) fence = ''
      continue
    }
    if (fence || line.length > 4096 || /^( {4}|\t)/.test(line)) continue
    lines.push(line.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, ' ')
      .replace(/`[^`]*`/g, '').replace(/https?:\/\/\S+/g, '')
      .replace(/^\s{0,3}(?:#{1,6}|>|[-*+] |\d+\. )\s*/g, '').replace(/[*_~]/g, '').replace(/[ \t]+/g, ' ').trim())
  }
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return { text: text.slice(0, PREVIEW_NARRATION_LIMIT), truncated: markdown.length > SOURCE_SCAN_LIMIT || text.length > PREVIEW_NARRATION_LIMIT }
}

export function localPreviewVoices<T extends { localService: boolean }>(voices: readonly T[]): T[] {
  return voices.filter(voice => voice.localService)
}
