import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { clampInt } from '@/lib/websites/server/websiteImportCore'
import { fetchRemoteTextDetailed } from '@/lib/net/fetchRemoteText'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { convertWebpageHtmlToMarkdownArtifactAsync } from '@/lib/websites/webpageHtmlToMarkdownArtifact'

type Args = {
  url: string
  out: string
  includeImages: boolean
  pythonBin: string
}

function parseArgs(argv: string[]): Args {
  const read = (key: string): string => {
    const idx = argv.findIndex(a => a === key)
    if (idx < 0) return ''
    return String(argv[idx + 1] || '').trim()
  }

  const url = read('--url')
  const out = read('--out')
  const pythonBin = read('--python') || String(process.env.AG_PYTHON_BIN || 'python3')
  const includeImages = read('--no-images') ? false : true

  if (!url) throw new Error('Missing --url')
  if (!out) throw new Error('Missing --out')

  return { url, out, includeImages, pythonBin }
}

function resolveWorkspaceRoot(cwd: string): string {
  const maxDepth = 6
  for (let i = 0; i <= maxDepth; i += 1) {
    const candidate = path.resolve(cwd, Array.from({ length: i }).map(() => '..').join(path.sep) || '.')
    const hasAgenticGraph = fsSync.existsSync(path.join(candidate, 'agentic-graph'))
    const hasSandbox = fsSync.existsSync(path.join(candidate, 'sandbox'))
    if (hasAgenticGraph && hasSandbox) return candidate
  }
  return path.resolve(cwd, '../../..')
}

function safeOutPath(monorepoRoot: string, outRaw: string): string {
  const outAbs = path.isAbsolute(outRaw) ? outRaw : path.resolve(process.cwd(), outRaw)
  const root = path.resolve(monorepoRoot)
  const candidate = path.resolve(outAbs)
  if (!candidate.startsWith(root + path.sep) && candidate !== root) {
    throw new Error('Output path must be inside the monorepo root')
  }
  return candidate
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const repoRoot = path.resolve(process.cwd(), '..')
  const workspaceRoot = resolveWorkspaceRoot(process.cwd())
  const outAbs = safeOutPath(workspaceRoot, args.out)

  void repoRoot
  void args.includeImages
  void args.pythonBin

  const { restore } = initJsdomHarness()
  try {
    const fetched = await fetchRemoteTextDetailed(args.url, {
      preflightHead: true,
      preferProxy: true,
      maxBytes: 8 * 1024 * 1024,
      timeoutMs: 20_000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'text/html,*/*;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (fetched.ok !== true) {
      const detail =
        fetched.kind === 'http'
          ? `HTTP ${fetched.status || ''}`.trim() + (fetched.errorText ? `: ${String(fetched.errorText || '').slice(0, 200)}` : '')
          : fetched.kind
      throw new Error(`Fetch failed: ${detail}`)
    }
    const md = await convertWebpageHtmlToMarkdownArtifactAsync({
      html: fetched.text,
      url: args.url,
      includeImages: args.includeImages !== false,
      fidelityLevel: 4,
      mode: 'ssot',
    })
    const outDoc = [
      '---',
      `kgWebpageUrl: ${JSON.stringify(String(args.url || '').trim())}`,
      `kgWebpageView: ${JSON.stringify('markdown')}`,
      '---',
      '',
      String(md || '').trim(),
      '',
    ].join('\n')

    const maxBytes = clampInt(process.env.AG_WEBPAGE_MARKDOWN_OUT_MAX_BYTES, 2_000_000, 50_000, 10_000_000)
    if (Buffer.byteLength(outDoc, 'utf8') > maxBytes) throw new Error('Output exceeds max bytes')

    await fs.mkdir(path.dirname(outAbs), { recursive: true })
    await fs.writeFile(outAbs, outDoc, 'utf8')
  } finally {
    restore()
  }
}

main().catch(err => {
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message || err) : String(err)
  process.stderr.write(`${msg}\n`)
  process.exit(1)
})
