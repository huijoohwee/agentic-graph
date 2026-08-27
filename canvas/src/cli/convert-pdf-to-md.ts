import fs from 'node:fs/promises'
import path from 'node:path'
import { convertPdfToMarkdown } from '@/lib/pdf/server/pdfConvertServer'

function readArgValue(args: string[], key: string): string | null {
  const idx = args.indexOf(key)
  if (idx < 0) return null
  const v = args[idx + 1]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

async function main() {
  const args = process.argv.slice(2)
  const input = readArgValue(args, '--input') || process.env.AGENTICGRAPH_PDF_INPUT || ''
  const output = readArgValue(args, '--output') || process.env.AGENTICGRAPH_PDF_OUTPUT || ''
  if (!input.trim()) throw new Error('Missing --input (or AGENTICGRAPH_PDF_INPUT)')

  const pdfPath = path.resolve(process.cwd(), input)
  const pdfBytes = await fs.readFile(pdfPath)
  const result = await convertPdfToMarkdown({
    body: pdfBytes,
    nameHint: path.basename(pdfPath),
  })
  if (result.ok === false) throw new Error(result.error)

  if (output.trim()) {
    const outPath = path.resolve(process.cwd(), output)
    await fs.mkdir(path.dirname(outPath), { recursive: true })
    await fs.writeFile(outPath, result.markdown, { encoding: 'utf8' })
  } else {
    process.stdout.write(result.markdown)
  }
}

main().catch(e => {
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message || e) : String(e)
  process.stderr.write(`${msg}\n`)
  process.exitCode = 1
})
