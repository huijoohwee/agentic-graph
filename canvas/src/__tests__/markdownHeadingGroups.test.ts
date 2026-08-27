import { resolveMarkdownSlideDemoPath, readMarkdownSlideDemo } from '@/tests/lib/markdownSlideDemo'
import { parseJsonLd } from '@/lib/graph/jsonld'
import { buildMarkdownJsonLd } from '@/features/parsers/markdownJsonLd'
import { deriveMarkdownHeadingGroups } from '@/components/GraphCanvas/layout/markdownHeadingGroups'

export const testMarkdownHeadingGroupsDerivation = () => {
  const markdown = readMarkdownSlideDemo()
  if (!markdown) return
  const mdPath = resolveMarkdownSlideDemoPath() ?? 'markdown-slide-demo.md'
  const jsonld = buildMarkdownJsonLd(mdPath, markdown)
  const graph = parseJsonLd(jsonld)

  const groups = deriveMarkdownHeadingGroups(graph)
  if (groups.length === 0) {
    throw new Error('expected markdown heading groups to be derived from Section nodes')
  }

  const byLabel = new Map<string, (typeof groups)[number]>()
  for (let i = 0; i < groups.length; i += 1) byLabel.set(groups[i]!.label, groups[i]!)

  const root = byLabel.get('Markdown Slide Styling Guidelines · Markdown 幻灯片样式指南')
  if (!root) throw new Error('expected an H1 group for "Markdown Slide Styling Guidelines · Markdown 幻灯片样式指南"')
  if (root.depth !== 0) throw new Error(`expected H1 to be depth 0, got ${root.depth}`)

  const h2En = byLabel.get('Frontmatter Configuration (fully supported in AgenticGraph viewer)')
  const h2Zh = byLabel.get('Frontmatter 配置（AgenticGraph 视图完全支持）')
  const h2 =
    h2En && h2En.memberNodeIds.length > 0
      ? h2En
      : h2Zh && h2Zh.memberNodeIds.length > 0
        ? h2Zh
        : h2En || h2Zh
  if (!h2) throw new Error('expected an H2 group for the Frontmatter section (en or zh)')
  if (h2.depth <= root.depth) throw new Error('expected H2 group to be nested under H1 group')
  if (h2.memberNodeIds.length === 0) {
    throw new Error('expected H2 group to contain leaf member nodes')
  }

  const nodeById = new Map(graph.nodes.map(n => [String(n.id), n]))
  for (let i = 0; i < groups.length; i += 1) {
    const g = groups[i]!
    for (let j = 0; j < g.memberNodeIds.length; j += 1) {
      const id = g.memberNodeIds[j]!
      const n = nodeById.get(id)
      if (!n) throw new Error(`expected group member node to exist: ${id}`)
      if (String(n.type || '') === 'Section') {
        throw new Error(`expected group members to exclude Section nodes, found Section member: ${id}`)
      }
    }
  }
}
