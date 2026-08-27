import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const inPath = path.join(repoRoot, 'agenticgraph', 'canvas', 'src', 'lib', 'graph', 'htmlViewer', 'runtimeTemplate.js')
const outPath = path.join(repoRoot, 'agenticgraph', 'canvas', 'src', 'lib', 'graph', 'htmlViewer', 'runtimeTemplate.ts')

const js = fs.readFileSync(inPath, 'utf8')
const chunkSize = 60_000
const chunks = []
for (let i = 0; i < js.length; i += chunkSize) chunks.push(js.slice(i, i + chunkSize))

const out = []
out.push('export const AG_HTML_VIEWER_RUNTIME_TEMPLATE = [')
for (const c of chunks) out.push(`  ${JSON.stringify(c)},`)
out.push(`] as const\n\nexport const getKgHtmlViewerRuntimeTemplate = (): string => AG_HTML_VIEWER_RUNTIME_TEMPLATE.join('')\n`)

fs.writeFileSync(outPath, out.join('\n'), 'utf8')
process.stdout.write(`wrote ${outPath} chunks=${chunks.length} bytes=${js.length}\n`)

