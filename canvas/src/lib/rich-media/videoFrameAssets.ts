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
