import React from 'react'
import { selectSavedVideoFrame, formatSavedFrameTime } from '@/lib/rich-media/savedVideoFrameSelection'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { buildSourceUrlAtTime, type VideoAgentTranscriptSegment } from './videoAgentTranscriptProjection'

const PAGE_SIZE = 50

export async function readWorkspaceTranscript(fs: WorkspaceFs, documentPath: string) {
  const path = normalizeWorkspacePath(documentPath)
  const folder = path.slice(0, path.lastIndexOf('/') + 1)
  const read = async (name: string) => {
    const text = await fs.readFileText(folder + name)
    if (text === null) throw new Error(`Missing transcript file ${name}`)
    return text
  }
  let parsed = JSON.parse(await read('parse.json'))
  if (parsed?.schemaVersion === 'workspace-text-parts/v1') {
    if (parsed.encoding !== 'utf-8' || !Array.isArray(parsed.parts) || !parsed.parts.length
      || !parsed.parts.every((part: unknown, i: number) => part === `parse.json.part-${i + 1}.txt`)) {
      throw new Error('Invalid transcript part list')
    }
    const parts: string[] = []
    for (const name of parsed.parts) parts.push(await read(name))
    parsed = JSON.parse(parts.join(''))
  }
  const transcript = parsed?.sourceTranscript
  if (!Array.isArray(transcript?.segments) || transcript.segments.length !== transcript.segmentCount
    || !transcript.segments.every((cue: VideoAgentTranscriptSegment) => cue && typeof cue.text === 'string'
      && Number.isFinite(cue.startMs) && Number.isFinite(cue.endMs))) throw new Error('Incomplete transcript')
  const cues = (transcript.segments as VideoAgentTranscriptSegment[]).sort((a, b) => a.startMs - b.startMs || a.index - b.index)
  const sourceUrl = typeof parsed.sourceUrl === 'string' && /^https?:\/\//i.test(parsed.sourceUrl) ? parsed.sourceUrl : ''
  return { cues, sourceUrl }
}

function currentCue(cues: VideoAgentTranscriptSegment[], timeMs: number) {
  let low = 0, high = cues.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (cues[mid].startMs <= timeMs) low = mid + 1
    else high = mid
  }
  return Math.max(0, low - 1)
}

type TranscriptProps = {
  documentPath: string
  timeMs?: number
  onReady?: (ready: boolean) => void
}

export default function WorkspaceSourceTranscript(props: TranscriptProps & { collapsible?: boolean }) {
  const [open, setOpen] = React.useState(false)
  if (!props.collapsible) return <TranscriptPages {...props} />
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Timed transcript cues</summary>
    {open && <TranscriptPages {...props} />}
  </details>
}

function TranscriptPages({ documentPath, timeMs, onReady }: TranscriptProps) {
  const [source, setSource] = React.useState<Awaited<ReturnType<typeof readWorkspaceTranscript>> | null>(null)
  const cues = source?.cues
  const [error, setError] = React.useState('')
  const [page, setPage] = React.useState(0)
  React.useEffect(() => {
    let active = true
    setSource(null)
    setError('')
    setPage(0)
    getWorkspaceFs().then(fs => readWorkspaceTranscript(fs, documentPath)).then(result => {
      if (active) {
        setSource(result)
        onReady?.(true)
      }
    }).catch(reason => {
      if (active) {
        setError(reason instanceof Error ? reason.message : String(reason))
        onReady?.(true)
      }
    })
    return () => { active = false }
  }, [documentPath, onReady])
  const index = cues?.length && timeMs != null ? currentCue(cues, timeMs) : -1
  React.useEffect(() => { if (index >= 0) setPage(Math.floor(index / PAGE_SIZE)) }, [index])
  if (error) return <p role="alert">Could not read the source transcript. {error}</p>
  if (!cues) return <p role="status">Loading transcript…</p>
  if (!cues.length) return <p>No transcript cues available.</p>
  const start = page * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, cues.length)
  const last = Math.ceil(cues.length / PAGE_SIZE) - 1
  return <section aria-label="Complete source transcript" className="space-y-2">
    <nav aria-label="Transcript pages" className="flex flex-wrap items-center gap-2">
      <output>{start + 1}–{end} of {cues.length} cues</output>
      <button type="button" disabled={!page} onClick={() => setPage(0)}>First</button>
      <button type="button" disabled={!page} onClick={() => setPage(page - 1)}>Previous</button>
      <button type="button" disabled={page === last} onClick={() => setPage(page + 1)}>Next</button>
      <button type="button" disabled={page === last} onClick={() => setPage(last)}>Last</button>
    </nav>
    <ol start={start + 1} className="space-y-1">
      {cues.slice(start, end).map((cue, offset) => {
        const seconds = cue.startMs / 1000
        const stamp = <time className="font-mono" dateTime={`PT${seconds}S`}>{formatSavedFrameTime(seconds)}</time>
        return <li key={start + offset} aria-current={index === start + offset || undefined}>
          {source.sourceUrl ? <a href={buildSourceUrlAtTime(source.sourceUrl, seconds)} data-saved-frame-cue="" target="_blank" rel="noreferrer" onClick={event => {
            if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            event.preventDefault()
            void selectSavedVideoFrame({ sourceUrl: source.sourceUrl, seconds, documentPath })
          }}>{stamp}</a> : stamp}
          {' '}{cue.text}
        </li>
      })}
    </ol>
  </section>
}
