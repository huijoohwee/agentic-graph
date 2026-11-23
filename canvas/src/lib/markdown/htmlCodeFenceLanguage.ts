import type { HastNode } from './htmlToMarkdownHast'

const children = (node: HastNode): HastNode[] => Array.isArray(node.children) ? node.children : []
const props = (node: HastNode) => (node.properties || {}) as Record<string, unknown>
const classes = (node: HastNode) => [props(node).className || ''].flat().map(String).flatMap(name => name.split(/\s+/))
const languageName = (value: unknown): string => typeof value === 'string' && /^[\w][\w.+#-]{0,79}$/u.test(value.trim()) ? value.trim() : ''
const nodeText = (node: HastNode): string => node.type === 'text' ? String(node.value || '') : children(node).map(nodeText).join('')

function declaredLanguage(node: HastNode) {
  const data = props(node)
  for (const hint of [data.dataLanguage, data.dataLang, ...classes(node).map(name => /^(?:language|lang)-(.+)$/i.exec(name)?.[1])]) {
    const value = languageName(hint)
    if (value) return value
  }
  return ''
}

/** Give the Markdown converter one language hint on the code element it serializes. */
export function normalizeHtmlCodeFences(parent: HastNode) {
  const items = children(parent)
  for (const child of items) if (child.tagName !== 'pre') normalizeHtmlCodeFences(child)
  const examples = items.filter(node => node.tagName === 'pre')
  for (const pre of examples) {
    const inner = children(pre)
    let code = inner.find(node => node.tagName === 'code')
    const labelOwner = examples.length === 1
    const labels = labelOwner ? items.filter(node => ['span', 'label', 'figcaption'].includes(String(node.tagName)) &&
      (classes(node).some(name => /^(?:lang|language|code-language)$/i.test(name)) || node.tagName === 'figcaption') &&
      languageName(nodeText(node))) : []
    const semanticLabels = labels.filter(node => node.tagName !== 'figcaption')
    const semanticLabel = semanticLabels.length === 1 ? semanticLabels[0] : undefined
    const hint = (code && declaredLanguage(code)) || declaredLanguage(pre) || (labelOwner && declaredLanguage(parent)) ||
      (semanticLabel && languageName(nodeText(semanticLabel))) || ''
    if (!hint) continue
    if (!code) {
      code = { type: 'element', tagName: 'code', properties: {}, children: inner }
      pre.children = [code]
    }
    code.properties = { ...props(code), className: ['language-' + hint, ...classes(code).filter(name => name && !/^language-/i.test(name))] }
    // Author prose and unrelated captions remain intact, including captions for other examples.
    const duplicates = new Set(labels.filter(label => languageName(nodeText(label)).toLowerCase() === hint.toLowerCase()))
    if (duplicates.size) parent.children = items.filter(node => !duplicates.has(node))
  }
}
