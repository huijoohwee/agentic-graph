import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { convertPdfFileToMarkdown } from '@/lib/pdf/native/nativePdfToMarkdownNode'
import { normalizePdfExtractedMarkdown } from '@/lib/pdf/normalizePdfExtractedMarkdown'

function escapePdfText(text: string): string {
  return String(text || '').replace(/[()\\]/g, match => `\\${match}`)
}

function makeMinimalPdfWithPages(pages: string[]): Buffer {
  const pageTexts = pages.length > 0 ? pages : ['']
  const fontObjectId = 3 + pageTexts.length * 2
  const kids = pageTexts.map((_, index) => `${3 + index * 2} 0 R`).join(' ')
  const objects: Array<{ id: number; body: string }> = [
    { id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
    { id: 2, body: `<< /Type /Pages /Kids [${kids}] /Count ${pageTexts.length} >>` },
  ]

  for (let index = 0; index < pageTexts.length; index += 1) {
    const pageId = 3 + index * 2
    const contentId = pageId + 1
    const stream = `BT /F1 24 Tf 72 720 Td (${escapePdfText(pageTexts[index])}) Tj ET`
    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    })
    objects.push({
      id: contentId,
      body: `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    })
  }

  objects.push({ id: fontObjectId, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' })

  const chunks = ['%PDF-1.4\n']
  const offsets = new Map<number, number>()
  for (const obj of objects) {
    offsets.set(obj.id, Buffer.byteLength(chunks.join(''), 'latin1'))
    chunks.push(`${obj.id} 0 obj\n${obj.body}\nendobj\n`)
  }

  const xrefOffset = Buffer.byteLength(chunks.join(''), 'latin1')
  const size = Math.max(...objects.map(obj => obj.id)) + 1
  chunks.push(`xref\n0 ${size}\n`)
  chunks.push('0000000000 65535 f \n')
  for (let id = 1; id < size; id += 1) {
    const offset = offsets.get(id) || 0
    chunks.push(`${String(offset).padStart(10, '0')} 00000 n \n`)
  }
  chunks.push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)

  return Buffer.from(chunks.join(''), 'latin1')
}

function makeMinimalPdfWithText(text: string): Buffer {
  return makeMinimalPdfWithPages([text])
}

export async function testPdfNativeConversionExtractsBasicText() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kg-pdf-native-'))
  const pdfPath = path.join(tmpDir, 'simple.pdf')
  try {
    await fs.writeFile(pdfPath, makeMinimalPdfWithText('Hello PDF World'))
    const res = await convertPdfFileToMarkdown({ pdfPath, title: 'simple.pdf' })
    const md = normalizePdfExtractedMarkdown(res.markdown)
    if (!md.includes('# simple.pdf')) throw new Error('expected markdown title')
    if (!md.includes('## Page 1')) throw new Error('expected page heading')
    if (!md.includes('Hello PDF World')) throw new Error('expected extracted text')
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

export async function testPdfNativeConversionAvoidsSpacedLetterArtifactsOnSyntheticPdf() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kg-pdf-native-'))
  const pdfPath = path.join(tmpDir, 'normal-text.pdf')
  const text = [
    'agentic-graph converts native PDF text into markdown without inserting artificial spaces between letters.',
    'The extraction path should preserve normal words, sentence structure, headings, and operational details.',
    'This synthetic document keeps the regression deterministic without relying on external fixture folders.',
  ].join(' ')
  try {
    await fs.writeFile(pdfPath, makeMinimalPdfWithText(text))
    const res = await convertPdfFileToMarkdown({ pdfPath, title: path.basename(pdfPath) })
    const md = normalizePdfExtractedMarkdown(res.markdown)
    if (!md.includes('## Page 1')) throw new Error('expected page 1')
    const spacedRun = /(?:^|[^A-Za-z0-9])[A-Za-z](?:\s+[A-Za-z]){4,}(?:$|[^A-Za-z0-9])/m
    if (spacedRun.test(md)) throw new Error('expected no spaced-letter artifacts in normalized markdown')
    if (md.length < 200) throw new Error('expected non-trivial markdown output')
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

export async function testPdfNativeConversionHonorsMaxPagesOnSyntheticPdf() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kg-pdf-native-'))
  const pdfPath = path.join(tmpDir, 'three-pages.pdf')
  try {
    await fs.writeFile(pdfPath, makeMinimalPdfWithPages([
      'First page max pages sentinel',
      'Second page max pages sentinel',
      'Third page should not appear',
    ]))
    const res = await convertPdfFileToMarkdown({ pdfPath, title: path.basename(pdfPath), maxPages: 2 })
    const md = normalizePdfExtractedMarkdown(res.markdown)
    if (!md.includes('## Page 1')) throw new Error('expected page 1')
    if (!md.includes('## Page 2')) throw new Error('expected page 2')
    if (md.includes('## Page 3')) throw new Error('expected maxPages to cap page sections')
    if (md.includes('Third page should not appear')) throw new Error('expected maxPages to omit third page text')
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}
