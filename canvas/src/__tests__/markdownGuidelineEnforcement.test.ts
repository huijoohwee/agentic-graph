import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const FEATURE_DIR = resolve(process.cwd(), 'src/features/markdown')
const SIZE_LIMIT = 600
const NEUTRALITY_BANNED_PATTERNS: RegExp[] = [
  /\/Users\//, // no absolute user paths
  /\baie-?book\b/i,
  /\bmlflow\b/i,
  // allow 'agentic-graph' in repo context generally, but disallow hardcoded project branding in feature code
  /\bagentic-graph\b/i,
]
const NEUTRALITY_ALLOWED_HOSTS: RegExp[] = [
  /https:\/\/www\.youtube-nocookie\.com\/embed\//i,
  /https:\/\/player\.vimeo\.com\/video\//i,
]

function listFilesRecursively(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const out: string[] = []
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...listFilesRecursively(p))
    } else {
      out.push(p)
    }
  }
  return out
}

export function testMarkdownFeaturesSizeLimit() {
  const files = listFilesRecursively(FEATURE_DIR).filter(f => /\.(tsx?|json|ts)$/.test(f))
  const violations: Array<{ file: string; lines: number }> = []
  for (const f of files) {
    const st = statSync(f)
    if (!st.isFile()) continue
    const text = readFileSync(f, 'utf8')
    const lines = text.split('\n').length
    if (lines > SIZE_LIMIT) {
      violations.push({ file: f, lines })
    }
  }
  if (violations.length) {
    const msg = violations
      .map(v => `${v.file} has ${v.lines} lines (limit ${SIZE_LIMIT})`)
      .join('\n')
    throw new Error(`Maintainability size limit exceeded:\n${msg}`)
  }
}

export function testMarkdownFeaturesNeutrality() {
  const files = listFilesRecursively(FEATURE_DIR).filter(f => /\.(tsx?|json|ts)$/.test(f))
  const violations: Array<{ file: string; pattern: string }> = []
  for (const f of files) {
    const st = statSync(f)
    if (!st.isFile()) continue
    const text = readFileSync(f, 'utf8')
    // allow certain hosts used for generic media embedding
    let scrubbed = text
    for (const allow of NEUTRALITY_ALLOWED_HOSTS) {
      scrubbed = scrubbed.replace(allow, '')
    }
    for (const re of NEUTRALITY_BANNED_PATTERNS) {
      if (re.test(scrubbed)) {
        violations.push({ file: f, pattern: String(re) })
      }
    }
  }
  if (violations.length) {
    const msg = violations
      .map(v => `${v.file} matches banned pattern ${v.pattern}`)
      .join('\n')
    throw new Error(`Neutrality violations detected in markdown features:\n${msg}`)
  }
}
