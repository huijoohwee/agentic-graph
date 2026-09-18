import yaml from 'js-yaml'
import { extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'

function replaceTopLevelYamlSectionLines(args: {
  yamlLines: string[]
  sectionKey: string
  sectionLines: string[]
}): string[] {
  const sectionKey = String(args.sectionKey || '').trim()
  if (!sectionKey) return args.yamlLines
  const escapedSectionKey = sectionKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sectionHeaderRe = new RegExp(`^${escapedSectionKey}\\s*:`)
  let start = -1
  let end = args.yamlLines.length
  for (let i = 0; i < args.yamlLines.length; i += 1) {
    const trimmed = String(args.yamlLines[i] || '')
    if (!sectionHeaderRe.test(trimmed)) continue
    start = i
    break
  }
  if (start >= 0) {
    end = args.yamlLines.length
    for (let i = start + 1; i < args.yamlLines.length; i += 1) {
      const rawLine = String(args.yamlLines[i] || '')
      const trimmed = rawLine.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const indent = rawLine.match(/^\s*/)?.[0]?.length || 0
      if (indent === 0 && /^(?:[A-Za-z0-9_.-]+|'(?:[^']|'')*'|"(?:[^"\\]|\\.)*")\s*:/.test(trimmed)) {
        end = i
        break
      }
    }
  }
  return start >= 0
    ? [...args.yamlLines.slice(0, start), ...args.sectionLines, ...args.yamlLines.slice(end)]
    : [...args.yamlLines.filter((line, index, arr) => !(arr.length === 1 && line.trim() === '')), ...args.sectionLines]
}
function buildTopLevelYamlSectionLines(sectionKey: string, sectionValue: unknown): string[] {
  const key = String(sectionKey || '').trim()
  if (!key || typeof sectionValue === 'undefined') return []
  const dumped = String(
    yaml.dump(
      { [key]: sectionValue },
      {
        lineWidth: -1,
        noRefs: true,
        sortKeys: false,
      },
    ) || '',
  ).trimEnd()
  return dumped ? dumped.split('\n') : []
}
export function upsertTopLevelFrontmatterSectionMarkdownText(args: {
  rawText: string
  sectionKey: string
  sectionValue: unknown
}): string {
  const sectionLines = buildTopLevelYamlSectionLines(args.sectionKey, args.sectionValue)
  if (sectionLines.length === 0) return args.rawText
  const block = extractYamlFrontmatterBlock(args.rawText)
  if (!block) {
    const prefix = ['---', ...sectionLines, '---', ''].join('\n')
    return args.rawText ? `${prefix}\n${args.rawText}` : `${prefix}\n`
  }
  const yamlLines = String(block.yamlText || '').split('\n')
  const nextYamlLines = replaceTopLevelYamlSectionLines({
    yamlLines,
    sectionKey: args.sectionKey,
    sectionLines,
  })
  const nextYaml = nextYamlLines.filter((line, index, arr) => !(arr.length > 1 && index === 0 && line === '')).join('\n')
  const suffix = args.rawText.slice(block.rawBlock.length)
  return `---\n${nextYaml}\n---${suffix}`
}
