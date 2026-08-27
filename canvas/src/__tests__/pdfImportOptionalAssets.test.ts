import fs from 'node:fs/promises'
import path from 'node:path'
import { convertPdfFileToMarkdown } from '@/lib/pdf/native/nativePdfToMarkdownNode'

function readOptionalPdfImageFixtureDir(): string {
  return String(process.env.AG_TEST_PDF_IMAGE_FIXTURE_DIR || '').trim()
}

async function listPdfFiles(dir: string): Promise<{ filePath: string; size: number }[]> {
  try {
    const entries = await fs.readdir(dir)
    const pdfs: { filePath: string; size: number }[] = []
    for (const name of entries) {
      if (!String(name || '').toLowerCase().endsWith('.pdf')) continue
      const filePath = path.join(dir, name)
      try {
        const st = await fs.stat(filePath)
        if (!st.isFile() || st.size <= 0) continue
        pdfs.push({ filePath, size: st.size })
      } catch {
        void 0
      }
    }
    return pdfs.sort((a, b) => a.size - b.size)
  } catch {
    return []
  }
}

export async function testPdfImportOptionalFixtureEmitsAssetLinksWhenImagesPresent() {
  const dir = readOptionalPdfImageFixtureDir()
  if (!dir) return
  const candidates = await listPdfFiles(dir)
  if (candidates.length === 0) return

  const token = 'kg-test-token'
  const assetUrlPrefix = `/__pdf_assets/${token}`

  for (const c of candidates) {
    const res = await convertPdfFileToMarkdown({
      pdfPath: c.filePath,
      title: path.basename(c.filePath),
      includeImages: true,
      assetUrlPrefix,
      maxPages: 1,
      maxExtractedImagesPerPage: 20,
      maxEmbeddedImagesPerPage: 20,
    })
    const md = String(res.markdown || '')
    if (!Array.isArray(res.assets) || res.assets.length === 0) continue
    if (!md.includes(`(${assetUrlPrefix}/`)) {
      throw new Error(`Expected markdown to reference extracted assets for ${path.basename(c.filePath)}`)
    }
    return
  }
}
