import { websiteSourceBundlePath } from '../websites/websitePathUtils'

/** Local frame service mount. Explorer reads only saved assets through this route. */
export const REMOTE_VIDEO_FRAME_PUBLIC_PREFIX = '/image/video-frame'
export const VIDEO_FRAME_FILE_RE = /^frame-([a-f0-9]+)-t(\d+(?:_\d+)?)\.(png|jpg)$/i

export const SAVED_FRAME_PAGE_SIZE = 256

export function savedFrameRelativeDirectory(source: string): string {
  return websiteSourceBundlePath(source).slice('/websites/'.length) + '/frames'
}

export function savedFrameListUrl(source: string, after = ''): string {
  const query = new URLSearchParams({ source })
  if (after) query.set('after', after)
  return REMOTE_VIDEO_FRAME_PUBLIC_PREFIX + '/?' + query
}

/** Bound requests so an import never queues an entire transcript on a device. */
export const TRANSCRIPT_FRAME_BATCH_SIZE = 16
export const SAVED_FRAMES_CHANGED_EVENT = 'workspace:saved-video-frames'

export async function readSavedFrameDirectory(source: string, signal?: AbortSignal, fetchPage: typeof fetch = fetch) {
  let after = ''
  let directory = ''
  const files: string[] = []
  const nested = REMOTE_VIDEO_FRAME_PUBLIC_PREFIX + '/' + savedFrameRelativeDirectory(source)
  do {
    const response = await fetchPage(savedFrameListUrl(source, after), { signal, cache: 'no-store' })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('Saved frame files are unavailable from this workspace host.')
    }
    const page = await response.json()
    const names = page.files
    if ((page.directory !== REMOTE_VIDEO_FRAME_PUBLIC_PREFIX && page.directory !== nested) ||
      (directory && directory !== page.directory) || !Array.isArray(names) || names.length > SAVED_FRAME_PAGE_SIZE ||
      !names.every((name, index) => typeof name === 'string' && VIDEO_FRAME_FILE_RE.test(name) && name > (index ? names[index - 1] : after)) ||
      (page.next !== null && (!names.length || page.next !== names[names.length - 1]))) throw new Error('Invalid saved frame listing.')
    directory = page.directory
    files.push(...names)
    after = page.next
  } while (after)
  return { directory, files }
}
