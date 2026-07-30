import path from 'node:path'

import { convertPdfFileToMarkdown } from '@/lib/pdf/native/nativePdfToMarkdownNode'

function readArg(args: string[], key: string): string {
  const index = args.indexOf(key)
  return index >= 0 ? String(args[index + 1] || '').trim() : ''
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const input = readArg(args, '--input')
  if (!input) throw new Error('Missing --input')
  const maxPagesRaw = Number(readArg(args, '--max-pages') || 0)
  const maxPages = Number.isInteger(maxPagesRaw) && maxPagesRaw > 0
    ? Math.min(maxPagesRaw, 10_000)
    : undefined
  const pdfPath = path.resolve(process.cwd(), input)
  const result = await convertPdfFileToMarkdown({
    pdfPath,
    title: path.basename(pdfPath),
    includeImages: false,
    reconstructTables: true,
    maxPages,
    ocrEnhance: null,
  })
  process.stdout.write(result.markdown)
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
