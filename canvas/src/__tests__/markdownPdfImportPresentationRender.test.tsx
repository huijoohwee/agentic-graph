import fs from 'node:fs/promises'
import path from 'node:path'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { convertPdfFileToMarkdown } from '@/lib/pdf/native/nativePdfToMarkdownNode'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

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

export async function testMarkdownPresentationRendersPdfAssetImagesFromOptionalFixture() {
  const dir = readOptionalPdfImageFixtureDir()
  if (!dir) return
  const candidates = await listPdfFiles(dir)
  if (candidates.length === 0) return

  const token = 'kg-test-token'
  const assetUrlPrefix = `/__pdf_assets/${token}`
  const chosen = candidates[0]
  const res = await convertPdfFileToMarkdown({
    pdfPath: chosen.filePath,
    title: path.basename(chosen.filePath),
    includeImages: true,
    assetUrlPrefix,
    maxPages: 1,
    maxExtractedImagesPerPage: 10,
    maxEmbeddedImagesPerPage: 0,
  })

  const markdownText = String(res.markdown || '')
  if (!markdownText.includes(assetUrlPrefix)) return

  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)

    const presentationApiRef = { current: null } as React.MutableRefObject<{
      prev: () => void
      next: () => void
    } | null>

    root.render(
      React.createElement(MarkdownPreview, {
        markdownText,
        activeDocumentPath: 'pdf/doc.md',
        highlightedLineRange: null,
        markdownWordWrap: true,
        markdownPresentationMode: true,
        markdownTextHighlight: false,
        uiPanelTextFontClass: 'font-sans text-xs',
        uiPanelMonospaceTextClass: 'font-mono text-xs',
        previewOverlayScope: 'viewport',
        previewOverlayPortalTarget: null,
        previewScrollable: true,
        presentationApiRef,
      } as never),
    )

    await new Promise<void>(resolve => setTimeout(() => resolve(), 0))

    const img = container.querySelector(`img[src^="${assetUrlPrefix}/"]`)
    if (!img) throw new Error('expected at least one PDF asset image in presentation DOM')

    root.unmount()
  } finally {
    restoreDom()
    restoreWindow()
  }
}
