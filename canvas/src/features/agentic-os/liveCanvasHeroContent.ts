import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'

export const LIVE_CANVAS_HERO_DOC_PATH = 'docs/documents/knowgrph-live-canvas-hero.md'
export const LIVE_CANVAS_HERO_DISCOVERY_ROUTE = '/knowgrph-live-canvas-hero.md'

type LiveCanvasHeroFrontmatter = {
  eyebrow?: unknown
  headline?: unknown
  lede?: unknown
  posture?: unknown
}

export type LiveCanvasHeroContent = Readonly<{
  eyebrow: string
  headline: readonly [string, string, string]
  lede: string
  posture: readonly string[]
  markdown: string
}>

declare const __KNOWGRPH_LIVE_CANVAS_HERO_MARKDOWN__: string | undefined
type LiveCanvasHeroGlobalScope = typeof globalThis & {
  __KNOWGRPH_LIVE_CANVAS_HERO_MARKDOWN__?: string
}

const DEFAULT_LIVE_CANVAS_HERO_CONTENT: LiveCanvasHeroContent = {
  eyebrow: 'airvio · agentic canvas',
  headline: ['Map intent', 'Run agents', 'Get results'],
  lede: 'An agentic canvas that lets `/` route work, `#` set meaning, and `@` bind context.',
  posture: ['0 model calls before Run', 'Frontmatter SSOT', 'Approval-gated'],
  markdown: '',
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeHeadline(value: unknown): [string, string, string] {
  if (!Array.isArray(value)) return [...DEFAULT_LIVE_CANVAS_HERO_CONTENT.headline]
  const entries = value
    .map(entry => normalizeText(entry))
    .filter(Boolean)
    .slice(0, 3)
  if (entries.length !== 3) return [...DEFAULT_LIVE_CANVAS_HERO_CONTENT.headline]
  return [entries[0], entries[1], entries[2]]
}

function normalizePosture(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return DEFAULT_LIVE_CANVAS_HERO_CONTENT.posture
  const entries = value
    .map(entry => normalizeText(entry))
    .filter(Boolean)
  return entries.length > 0 ? entries : DEFAULT_LIVE_CANVAS_HERO_CONTENT.posture
}

function readBundledLiveCanvasHeroMarkdown(): string {
  if (typeof __KNOWGRPH_LIVE_CANVAS_HERO_MARKDOWN__ === 'string' && __KNOWGRPH_LIVE_CANVAS_HERO_MARKDOWN__.trim()) {
    return __KNOWGRPH_LIVE_CANVAS_HERO_MARKDOWN__
  }
  const globalMarkdown = (globalThis as LiveCanvasHeroGlobalScope).__KNOWGRPH_LIVE_CANVAS_HERO_MARKDOWN__
  return typeof globalMarkdown === 'string' ? globalMarkdown : ''
}

export function parseLiveCanvasHeroContent(markdown: string): LiveCanvasHeroContent {
  const normalizedMarkdown = String(markdown || '').trim()
  if (!normalizedMarkdown) return DEFAULT_LIVE_CANVAS_HERO_CONTENT

  const parsed = parseMarkdownFrontmatter(splitMarkdownLines(normalizedMarkdown))
  const frontmatter = parsed.meta as LiveCanvasHeroFrontmatter
  const eyebrow = normalizeText(frontmatter.eyebrow) || DEFAULT_LIVE_CANVAS_HERO_CONTENT.eyebrow
  const headline = normalizeHeadline(frontmatter.headline)
  const lede = normalizeText(frontmatter.lede) || DEFAULT_LIVE_CANVAS_HERO_CONTENT.lede
  const posture = normalizePosture(frontmatter.posture)

  return {
    eyebrow,
    headline,
    lede,
    posture,
    markdown: normalizedMarkdown,
  }
}

export function readLiveCanvasHeroContent(): LiveCanvasHeroContent {
  return parseLiveCanvasHeroContent(readBundledLiveCanvasHeroMarkdown())
}
