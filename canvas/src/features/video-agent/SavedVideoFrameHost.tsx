import React from 'react'
import { closeSavedFramePreview, formatSavedFrameTime, readSavedFrameSelection, subscribeSavedFrameSelection } from '@/lib/rich-media/savedVideoFrameSelection'

const Lightbox = React.lazy(() => import('@/lib/ui/MediaLightbox').then(module => ({ default: module.MediaLightbox })))

export default function SavedVideoFrameHost() {
  const selection = React.useSyncExternalStore(subscribeSavedFrameSelection, readSavedFrameSelection, () => null)
  if (!selection?.open) return null
  const title = 'Saved frame at ' + formatSavedFrameTime(selection.seconds)
  if (selection.image) return <React.Suspense fallback={null}>
    <Lightbox open src={selection.image.url} kind="image" title={title} alt={title} onClose={closeSavedFramePreview}
      descriptionLabel="Timeline" description={selection.error} />
  </React.Suspense>
  return <aside className="fixed bottom-4 right-4 z-[9999] rounded bg-[var(--kg-panel-bg)] p-3 shadow-lg" aria-label={title}>
    <span role={selection.error ? 'alert' : 'status'}>{selection.error || 'Opening saved frame…'}</span>
    <button className="ml-2" onClick={closeSavedFramePreview} type="button">Close</button>
  </aside>
}
