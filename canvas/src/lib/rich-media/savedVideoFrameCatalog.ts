import { REMOTE_VIDEO_FRAME_FORMAT_LABELS, type RemoteVideoFrameFormat } from 'grph-shared/rich-media/providers'
import { readSavedFrameDirectory, VIDEO_FRAME_FILE_RE } from './videoFrameAssets'

export type SavedVideoFrame = { seconds: number; url: string; name: string; format: RemoteVideoFrameFormat }

export function indexSavedVideoFrames(directory: string, names: readonly string[]) {
  const entries = new Map<number, Map<RemoteVideoFrameFormat, SavedVideoFrame>>()
  for (const name of names) {
    const match = VIDEO_FRAME_FILE_RE.exec(name)
    if (!match) continue
    const seconds = Number(match[2].replace('_', '.'))
    const ms = Math.round(seconds * 1000)
    const format = match[3].toLowerCase() as RemoteVideoFrameFormat
    if (!Number.isSafeInteger(ms) || !(format in REMOTE_VIDEO_FRAME_FORMAT_LABELS)) continue
    const atTime = entries.get(ms) || new Map<RemoteVideoFrameFormat, SavedVideoFrame>()
    atTime.set(format, { seconds, format, name, url: directory + '/' + name })
    entries.set(ms, atTime)
  }
  return {
    directory, files: names,
    times: [...entries.keys()].sort((a, b) => a - b).map(ms => ms / 1000),
    at(seconds: number, preferred: RemoteVideoFrameFormat, selectedUrl?: string) {
      const formats = entries.get(Math.round(seconds * 1000))
      if (selectedUrl) return [...(formats?.values() || [])].find(frame => frame.url === selectedUrl)
      return formats?.get(preferred) || formats?.get('png') || formats?.values().next().value
    },
  }
}

export type SavedVideoFrameCatalog = ReturnType<typeof indexSavedVideoFrames>
const catalogs = new Map<string, Promise<SavedVideoFrameCatalog>>()

export function forgetSavedVideoFrames(source: string) { catalogs.delete(source) }

export function loadSavedVideoFrames(source: string) {
  const cached = catalogs.get(source)
  if (cached) return cached
  const result = readSavedFrameDirectory(source).then(({ directory, files }) => indexSavedVideoFrames(directory, files))
  catalogs.set(source, result)
  if (catalogs.size > 4) catalogs.delete(catalogs.keys().next().value!)
  void result.catch(() => { if (catalogs.get(source) === result) catalogs.delete(source) })
  return result
}
