import { pickExternalDemoMarkdownFile, readExternalDemoText, toDocumentPath } from '@/tests/lib/externalFixtures'

const looksLikeFrontmatterMermaidMarkdown = (text: string): boolean => {
  const raw = String(text || '')
  if (!raw.startsWith('---\n')) return false
  const end = raw.indexOf('\n---')
  if (end < 0) return false
  const fm = raw.slice(0, Math.min(end + 4, 8000))
  return /\nmermaid\s*:\s*(\||>|\S)/.test(fm)
}

export const resolveMarkdownSlideDemoPath = (): string | null => {
  return pickExternalDemoMarkdownFile({
    preferBasename: 'markdown-slide-demo.md',
    predicate: looksLikeFrontmatterMermaidMarkdown,
    envVarPathKey: 'AG_MARKDOWN_SLIDE_DEMO_PATH',
  })
}

export const resolveMarkdownSlideDemoDocumentPath = (): string | null => {
  const p = resolveMarkdownSlideDemoPath()
  if (!p) return null
  const docPath = toDocumentPath(p)
  return docPath || null
}

export const readMarkdownSlideDemo = (): string | null => {
  const res = readExternalDemoText({
    preferBasename: 'markdown-slide-demo.md',
    predicate: looksLikeFrontmatterMermaidMarkdown,
    envVarPathKey: 'AG_MARKDOWN_SLIDE_DEMO_PATH',
  })
  return res?.text ?? null
}
