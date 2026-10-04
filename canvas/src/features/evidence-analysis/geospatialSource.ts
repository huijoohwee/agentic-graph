import { useSyncExternalStore } from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { captureEvidenceSource, isEvidenceSourceCurrent, type EvidenceSourceCapture } from './evidenceSource'
import { readEvidenceExamples } from './ui/evidenceInput'
import type { SourceGeospatialSnapshot } from 'grph-shared/geospatial/enhancedLayerContract'

type Scene = any
export type SourceGeospatialTimeline = Readonly<{
  schema: 'source-geospatial-timeline/v1'; documentKey: string; sourceKey: string; title: string
  startUtc: string; endUtc: string; durationSeconds: number
  lanes: readonly Readonly<{
    id: string; label: string; kind: string
    contexts: readonly Readonly<{ id: string; label: string; status: string; statement?: string; sourceId?: string; sourceHash?: string; sourcePointer?: string }>[]
    events: readonly Readonly<{ id: string; label: string; kind: 'observation' | 'missing' | 'gap' | 'effective'; atUtc: string; toUtc?: string; startSeconds: number; endSeconds: number; sourceId: string; sourceHash: string; sourcePointer: string; status: string }>[]
  }>[]
}>
type State = Readonly<{
  snapshot: SourceGeospatialSnapshot | null; sourceKey: string | null; loading: boolean; error: string; status: string
  timeline: SourceGeospatialTimeline | null
  atUtc: string; moments: readonly string[]; title: string; description: string; airspaceQualification: string
  missingPositions: readonly { entityId: string; label: string; sourceId: string; observedAtUtc: string; reason: string }[]
  references: readonly { label: string; url: string; license: string; sha256: string; upstreamUrl?: string }[]
}>
const empty = (): State => Object.freeze({ snapshot: null, timeline: null, sourceKey: null, loading: false, error: '', status: 'No source-authored map context loaded.', atUtc: '', moments: [], title: '', description: '', airspaceQualification: '', missingPositions: [], references: [] })
const sameCapture = (a: EvidenceSourceCapture, b: EvidenceSourceCapture) => a.documentName === b.documentName && a.documentText === b.documentText && a.sourceId === b.sourceId && a.sourceRevision === b.sourceRevision
const configFrom = (capture: EvidenceSourceCapture) => {
  const { meta, warnings } = parseMarkdownFrontmatter(splitMarkdownLines(capture.documentText))
  const config = meta.source_geospatial as any
  if (warnings.length || !config || config.schema !== 'source-geospatial-config/v1' || Object.keys(config).length !== 2
    || typeof config.scenePath !== 'string' || !/^\/evidence-analysis\/fixtures\/[a-zA-Z0-9._-]+\.json$/.test(config.scenePath)) throw new Error('Author a valid local source_geospatial scene path.')
  return config as { schema: string; scenePath: string }
}
const hash = async (text: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, '0')).join('')

/** One bounded scene budget spans the descriptor, provenance and all track assets. */
export function boundedSceneFetcher(fetcher: typeof fetch, signal: AbortSignal): typeof fetch {
  let remaining = 2_000_000
  return (async (url, options) => {
    if (signal.aborted) throw new Error('Source request superseded.')
    const response = await fetcher(url, { ...options, signal })
    if (!response.ok || response.redirected) { await response.body?.cancel(); throw new Error(`Local scene asset unavailable (${response.status}).`) }
    const cap = Math.min(499999, remaining)
    if (Number(response.headers.get('content-length')) > cap) { await response.body?.cancel(); throw new Error('Scene asset exceeds the 499,999-byte or combined 2,000,000-byte bound.') }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Bounded scene streaming is unavailable.')
    let count = 0
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (signal.aborted) throw new Error('Source request superseded.')
          const chunk = await reader.read()
          if (chunk.done) { reader.releaseLock(); controller.close(); return }
          if (chunk.value.byteLength > remaining || count + chunk.value.byteLength > 499999) throw new Error('Scene asset exceeds the 499,999-byte or combined 2,000,000-byte bound.')
          count += chunk.value.byteLength; remaining -= chunk.value.byteLength; controller.enqueue(chunk.value)
        } catch (error) { await reader.cancel().catch(() => {}); reader.releaseLock(); controller.error(error) }
      },
      async cancel() { await reader.cancel().catch(() => {}); reader.releaseLock() },
    })
    return new Response(body, { status: response.status, headers: response.headers })
  }) as typeof fetch
}

type Dependencies = {
  isCurrent: (capture: EvidenceSourceCapture) => boolean
  read: (paths: readonly string[], fetcher: typeof fetch) => Promise<string[]>
  fetcher: typeof fetch
  inspect: (bundle: string, profileId: string) => Promise<any>
}
export function createSourceGeospatialOwner(dependencies: Dependencies) {
  let state = empty(), generation = 0, abort: AbortController | null = null
  let accepted: { capture: EvidenceSourceCapture; scene: Scene; records: any[] } | null = null
  const listeners = new Set<() => void>()
  const publish = (next: State) => { state = Object.freeze(next); listeners.forEach(listener => listener()) }
  const current = (token: number, capture: EvidenceSourceCapture) => token === generation && dependencies.isCurrent(capture)
  const invalidate = () => { generation++; abort?.abort(); abort = null; accepted = null; publish(empty()) }
  const clear = () => { generation++; abort?.abort(); abort = null; accepted = null; publish({ ...state, snapshot: null, timeline: null, loading: false, error: '', atUtc: '', moments: [], missingPositions: [], status: 'Map context removed.' }) }
  async function load(capture: EvidenceSourceCapture) {
    const token = ++generation; abort?.abort(); abort = new AbortController()
    if (!dependencies.isCurrent(capture)) { invalidate(); return }
    if (state.sourceKey !== capture.sourceKey || (accepted && !sameCapture(accepted.capture, capture))) { accepted = null; publish(empty()) }
    publish({ ...state, sourceKey: capture.sourceKey, loading: true, error: '', status: 'Loading source-authored map evidence…' })
    const live = () => current(token, capture)
    try {
      const config = configFrom(capture)
      const core = await import('./geospatialProject.mjs'); if (!live()) return
      const fetcher = boundedSceneFetcher(dependencies.fetcher, abort.signal)
      const [sceneText] = await dependencies.read([config.scenePath], fetcher); if (!live()) return
      const scene = core.validateSourceGeospatialScene(core.parseSourceGeospatialJson(sceneText, 'scene'))
      const paths = [...scene.trackBundlePaths, ...scene.references.map((reference: any) => reference.url)]
      const texts = await dependencies.read(paths, fetcher); if (!live()) return
      const verified = []
      for (let i = 0; i < scene.references.length; i++) {
        const reference = scene.references[i], text = texts[scene.trackBundlePaths.length + i]
        const sha256 = await hash(text); if (!live()) return
        if (sha256 !== reference.sha256) throw new Error('Scene provenance asset SHA-256 does not match its authored reference.')
        verified.push({ sha256, value: core.parseSourceGeospatialJson(text, 'scene.reference') })
      }
      core.verifySurfaceReferences(scene, verified)
      const records = []
      for (const text of texts.slice(0, scene.trackBundlePaths.length)) {
        if (!live()) return
        const result = await dependencies.inspect(text, scene.profileId); if (!live()) return
        if (result?.ok === false) throw new Error(`${result.error.code}: ${result.error.message}`)
        records.push(result)
      }
      const snapshot = core.projectSourceGeospatial(scene, records, capture.sourceKey, scene.defaultAtUtc) as SourceGeospatialSnapshot
      if (!live()) return
      let timeline: SourceGeospatialTimeline | null = null
      if (scene.timeline) {
        const timelineCore = await import('./geospatialTimeline.mjs'); if (!live()) return
        const identity = await hash(JSON.stringify([capture.documentName, capture.sourceId, capture.sourceRevision, capture.documentText, sceneText, ...texts])); if (!live()) return
        timeline = timelineCore.buildSourceGeospatialTimeline(scene, records, capture.sourceKey, `source-geospatial:${identity}`) as SourceGeospatialTimeline
      }
      accepted = { capture, scene, records }
      const missingPositions = core.sourceGeospatialMissingPositions(records, scene, snapshot.atUtc)
      publish({ snapshot, timeline, sourceKey: capture.sourceKey, loading: false, error: '', status: `Observed paths and source-derived surfaces loaded. ${missingPositions.length} current positions unknown.`, atUtc: snapshot.atUtc,
        moments: Object.freeze(core.sourceGeospatialMoments(records, scene)), title: scene.title, description: scene.description,
        airspaceQualification: scene.airspace.statement, missingPositions, references: scene.references })
    } catch (error) {
      if (live()) publish({ ...state, loading: false, error: error instanceof Error ? error.message : String(error), status: 'Map context was not accepted. Any retained view belongs to this same source only.' })
    }
  }
  async function setTime(atUtc: string) {
    const owner = accepted, token = ++generation; abort?.abort(); abort = null
    if (!owner || !dependencies.isCurrent(owner.capture)) { invalidate(); return }
    try {
      const core = await import('./geospatialProject.mjs')
      if (!current(token, owner.capture) || accepted !== owner) return
      const snapshot = core.projectSourceGeospatial(owner.scene, owner.records, owner.capture.sourceKey, atUtc) as SourceGeospatialSnapshot
      const missingPositions = core.sourceGeospatialMissingPositions(owner.records, owner.scene, snapshot.atUtc)
      if (current(token, owner.capture)) publish({ ...state, snapshot, missingPositions, atUtc: snapshot.atUtc, loading: false, error: '', status: `UTC view uses observed samples; gaps remain unconnected. ${missingPositions.length} current positions unknown.` })
    } catch (error) { if (current(token, owner.capture)) publish({ ...state, loading: false, error: error instanceof Error ? error.message : String(error) }) }
  }
  return { read: () => state, readSnapshot: () => state.snapshot, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }, load, setTime, clear, invalidate,
    sourceChanged: () => { if ((accepted && !dependencies.isCurrent(accepted.capture)) || state.loading) invalidate() } }
}
const owner = createSourceGeospatialOwner({ isCurrent: isEvidenceSourceCurrent, read: readEvidenceExamples,
  fetcher: (input, init) => fetch(input, init), inspect: async (bundle, profileId) => (await import('./tools/executeEvidence.mjs')).executeEvidence('aviation.inspect', { bundle, profileId }) })
export const readSourceGeospatialSnapshot = owner.readSnapshot
export const readSourceGeospatialState = owner.read
export const subscribeSourceGeospatial = owner.subscribe
export const loadSourceGeospatial = owner.load
export const setSourceGeospatialTime = owner.setTime
export const clearSourceGeospatial = owner.clear
export const useSourceGeospatialState = () => useSyncExternalStore(owner.subscribe, owner.read, owner.read)
const readTimeline = () => owner.read().timeline
export const useSourceGeospatialTimeline = () => useSyncExternalStore(owner.subscribe, readTimeline, readTimeline)
// Authored context keeps its panel during loading, removal and errors; acceptance only owns playback.
const readContext = () => owner.read().sourceKey !== null
export const useSourceGeospatialContext = () => useSyncExternalStore(owner.subscribe, readContext, readContext)
/** Authored source context owns presentation through panel changes, loading, removal and errors. */
export const isSourceGeospatialReview = (hasContext: boolean) => hasContext
export const useSourceGeospatialReview = useSourceGeospatialContext
/** Accepted geometry supplies framing; playback never turns a study extent into an airspace boundary. */
export function sourceGeospatialReviewBounds(snapshot: SourceGeospatialSnapshot | null): readonly [number, number, number, number] | null {
  if (!snapshot) return null
  const positions: number[][] = []
  const visit = (value: any) => { if (!Array.isArray(value)) return; if (value.length === 2 && value.every(n => typeof n === 'number' && Number.isFinite(n))) positions.push(value); else value.forEach(visit) }
  snapshot.collection.features.forEach(feature => visit(feature.geometry.coordinates))
  if (!positions.length) return null
  return [Math.min(...positions.map(p => p[0])), Math.min(...positions.map(p => p[1])), Math.max(...positions.map(p => p[0])), Math.max(...positions.map(p => p[1]))]
}
let seenSource: EvidenceSourceCapture | null = null
function refreshSource() {
  let capture: EvidenceSourceCapture
  try {
    capture = captureEvidenceSource()
    const { meta } = parseMarkdownFrontmatter(splitMarkdownLines(capture.documentText))
    if (!Object.prototype.hasOwnProperty.call(meta, 'source_geospatial')) throw new Error('No authored map context.')
  }
  catch { if (seenSource !== null || owner.read().snapshot || owner.read().loading) { seenSource = null; owner.invalidate() } return }
  if (seenSource && sameCapture(capture, seenSource)) return
  seenSource = capture; owner.invalidate(); void owner.load(capture)
}
// Active-source opt-in owns automatic loading independently of panel mount state.
useGraphStore.subscribe((state, previous) => {
  if (state.markdownDocumentName !== previous.markdownDocumentName || state.markdownDocumentText !== previous.markdownDocumentText || state.sourceFiles !== previous.sourceFiles) refreshSource()
})
queueMicrotask(refreshSource)
