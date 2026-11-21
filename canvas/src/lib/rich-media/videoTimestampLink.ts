import { createContext } from 'react'
import { getYouTubeId, parseYouTubeStartSeconds } from 'grph-shared/rich-media/providers'

/** The import owner can differ from the timestamp link's playback hostname. */
export function timestampLinkSeconds(href: string, sourceUrl: string): number | null {
  try {
    const source = new URL(sourceUrl)
    const link = new URL(href, source)
    const time = link.searchParams.get('t') ?? link.searchParams.get('start') ?? new URLSearchParams(link.hash.slice(1)).get('t')
    if (!time) return null
    const numeric = /^(\d+(?:\.\d+)?)s?$/.exec(time)
    const seconds = numeric ? Number(numeric[1]) : parseYouTubeStartSeconds(link.href)
    if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null
    const id = getYouTubeId(sourceUrl)
    if (id && getYouTubeId(link.href) === id) return seconds
    for (const url of [source, link]) {
      url.searchParams.delete('t')
      url.searchParams.delete('start')
      url.hash = ''
    }
    return link.href === source.href ? seconds : null
  } catch { return null }
}

export const TranscriptFrameSourceContext = createContext('')
