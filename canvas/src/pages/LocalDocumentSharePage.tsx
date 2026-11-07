import React from 'react'
import { parseLocalDocumentShareHash } from '@/features/canvas/localDocumentShare'

const MarkdownPreview = React.lazy(() => import('@/features/markdown/ui/MarkdownPreview'))

export function LocalDocumentSharePage() {
  const share = React.useMemo(() => parseLocalDocumentShareHash(
    typeof window === 'undefined' ? '' : window.location.hash,
  ), [])

  if (!share || share.status === 'invalid') {
    return <main className="min-h-svh bg-white p-6 text-slate-900" aria-labelledby="share-error-title">
      <h1 id="share-error-title" className="text-xl font-semibold">This share link is invalid</h1>
      <p className="mt-2 max-w-prose text-sm text-slate-600">Ask the sender to create a new link. Local share links support Markdown documents up to 4 KiB.</p>
    </main>
  }

  const { title, markdown } = share.document
  return <main className="flex min-h-svh flex-col bg-white text-slate-900" aria-labelledby="local-share-title" data-kg-local-document-share="1">
    <header className="border-b border-slate-200 px-4 py-4 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Read-only document</p>
      <h1 id="local-share-title" className="mt-1 break-words text-xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-prose text-sm leading-5 text-slate-600">
        This self-contained URL includes a copy of the document in its fragment. It was not uploaded. Anyone with this URL can read it; keep sensitive content out of shared links.
      </p>
    </header>
    <section className="min-h-0 flex-1 overflow-auto p-4 sm:px-8" aria-label="Shared document content">
      <React.Suspense fallback={<p role="status" className="text-sm text-slate-500">Opening document…</p>}>
        <MarkdownPreview
          markdownText={markdown}
          activeDocumentPath={`shared/${encodeURIComponent(title)}`}
          highlightedLineRange={null}
          markdownWordWrap
          markdownPresentationMode={false}
          markdownTextHighlight={false}
          uiPanelTextFontClass="font-sans"
          uiPanelMonospaceTextClass="font-mono"
          previewOverlayScope="container"
          markdownTokenStoreSync={false}
          markdownViewerMediaMode="chip"
        />
      </React.Suspense>
    </section>
  </main>
}

export default LocalDocumentSharePage
