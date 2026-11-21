import { formatMediaTimestampSeconds } from 'grph-shared/rich-media/providers'
import type { SavedVideoFrame } from './savedVideoFrameCatalog'

export function formatSavedFrameTime(seconds: number) {
  const ms = Math.round(seconds * 1000)
  const fraction = String(ms % 1000).padStart(3, '0').replace(/0+$/, '')
  return formatMediaTimestampSeconds(Math.floor(ms / 1000)) + (fraction ? '.' + fraction : '')
}

export type SavedFrameRequest = { sourceUrl: string; seconds: number; documentPath?: string; savedUrl?: string }
type Selection = SavedFrameRequest & { image?: SavedVideoFrame; error?: string; open: boolean }
let selection: Selection | null = null
let generation = 0
const subscribers = new Set<() => void>()
export const readSavedFrameSelection = () => selection
export function subscribeSavedFrameSelection(listener: () => void) {
  subscribers.add(listener)
  return () => { subscribers.delete(listener) }
}
function publish(value: Selection | null) {
  selection = value
  for (const notify of subscribers) notify()
}
export function closeSavedFramePreview() {
  if (!selection?.image) generation++
  if (selection) publish({ ...selection, open: false })
}
export async function selectSavedVideoFrame(request: SavedFrameRequest) {
  if (!request.sourceUrl || !Number.isFinite(request.seconds) || request.seconds < 0) return
  const id = ++generation
  const current = () => id === generation
  publish({ ...request, open: true })
  try {
    const [{ loadSavedVideoFrames, forgetSavedVideoFrames }, { readWorkspaceFrameFormat }] = await Promise.all([
      import('./savedVideoFrameCatalog'), import('./videoFrameSettings'),
    ])
    const lookup = async () => (await loadSavedVideoFrames(request.sourceUrl)).at(request.seconds, readWorkspaceFrameFormat(), request.savedUrl)
    let image = await lookup()
    if (!current()) return
    if (!image) {
      forgetSavedVideoFrames(request.sourceUrl)
      image = await lookup()
    }
    if (!current()) return
    if (!image) throw new Error('No saved frame exists at this timestamp.')
    publish({ ...request, image, open: true })
    const { seekSavedVideoFrame } = await import('@/features/video-agent/savedVideoFrameTransport')
    if (current()) await seekSavedVideoFrame(request, image.url, current)
  } catch (error) {
    if (current()) publish({ ...selection!, error: error instanceof Error ? error.message : String(error) })
  }
}
