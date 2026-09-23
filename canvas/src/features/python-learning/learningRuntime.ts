import { PYTHON_LIMITS, PYTHON_RUNTIME_REVISION, pythonError, sourceBytes } from './pythonModel'
import { learningLesson, learningSceneDescriptor } from './learningLessons'
import { sameRun, validLearningError, validLearningSnapshot, type LearningRunIdentity, type LearningWorkerRequest, type LearningWorkerSnapshot } from './learningProtocol'

export interface LearningWorkerPort {
  postMessage(message: LearningWorkerRequest): void
  terminate(): void
  onmessage: ((event: { data: unknown }) => void) | null
  onerror: ((event: { message: string }) => void) | null
}
export type LearningDocument = Readonly<{ workspaceId: string; documentId: string; source: string; lessonId: string; readOnly?: boolean }>
export type LearningRuntimeSnapshot = Readonly<{
  document: LearningDocument | null; state: 'idle' | 'validating' | 'cancelled' | LearningWorkerSnapshot['state']
  result: LearningWorkerSnapshot | null; error: ReturnType<typeof pythonError> | null; stale: boolean; hint: number
}>
export const createLearningWorker = (): LearningWorkerPort => new Worker(new URL('./pythonWorker.ts', import.meta.url), { type: 'module' })
export async function digestLearningSource(source: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Secure local hashing is unavailable in this browser context.')
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}
export class LearningRuntime {
  private snapshot: LearningRuntimeSnapshot = { document: null, state: 'idle', result: null, error: null, stale: false, hint: 0 }
  private readonly listeners = new Set<() => void>()
  private generation = 0
  private worker: LearningWorkerPort | null = null
  private identity: LearningRunIdentity | null = null
  private sequence = 0
  private deadline: ReturnType<typeof setTimeout> | null = null
  private pausedExpiry: ReturnType<typeof setTimeout> | null = null
  private hidden = false
  private pauseBeforeStart = false
  constructor(private readonly workerFactory = createLearningWorker, private readonly digest = digestLearningSource) {}
  read = (): LearningRuntimeSnapshot => this.snapshot
  readIdentity = (): LearningRunIdentity | null => this.identity
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<LearningRuntimeSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(fn => fn()) }
  private clearTimers() {
    if (this.deadline !== null) clearTimeout(this.deadline)
    if (this.pausedExpiry !== null) clearTimeout(this.pausedExpiry)
    this.deadline = null; this.pausedExpiry = null
  }
  private terminate() { this.generation++; this.clearTimers(); this.worker?.terminate(); this.worker = null; this.identity = null; this.pauseBeforeStart = false }
  private pause() {
    if (this.snapshot.state === 'validating') this.pauseBeforeStart = true
    if (this.worker && this.identity) this.worker.postMessage({ kind: 'control', runId: this.identity.runId, generation: this.identity.generation, operation: 'pause' })
  }
  setHidden(hidden: boolean): void { this.hidden = hidden; if (hidden) this.pause() }
  private watchdog() {
    this.clearTimers()
    this.deadline = setTimeout(() => {
      this.terminate(); this.publish({ state: 'failed', error: { code: 'limit-exceeded', message: 'Worker deadline exceeded. Execution stopped.', span: this.snapshot.result?.span || { line: 1, column: 1 } } })
    }, PYTHON_LIMITS.computeMs + 250)
  }
  bind(document: LearningDocument): void {
    if (!document.workspaceId || !document.documentId || document.documentId.length > 1024 || document.workspaceId.length > 1024) throw new Error('Workspace/document identity is required.')
    learningLesson(document.lessonId)
    const previous = this.snapshot.document
    if (previous && ['workspaceId', 'documentId', 'source', 'lessonId', 'readOnly'].every(key => document[key as keyof LearningDocument] === previous[key as keyof LearningDocument])) return
    this.terminate()
    const sameDocument = previous?.documentId === document.documentId && previous.workspaceId === document.workspaceId
    this.publish({ document: Object.freeze({ ...document }), state: 'idle', stale: sameDocument && !!this.snapshot.result, error: null, ...(previous?.lessonId !== document.lessonId ? { hint: 0 } : {}), ...(sameDocument ? {} : { result: null, hint: 0 }) })
  }
  private receive(value: unknown, generation: number): void {
    if (generation !== this.generation || !this.worker) return
    if (!value || typeof value !== 'object') return this.fail(new Error('Invalid worker response.'))
    if ((value as { kind?: string }).kind === 'protocol-error') {
      const message = String((value as { message?: string }).message || '')
      try { const error = JSON.parse(message); if (!validLearningError(error)) throw new Error('Invalid worker error.'); this.terminate(); this.publish({ state: 'failed', error }); return } catch { return this.fail(new Error(message)) }
    }
    if (!validLearningSnapshot(value) || !this.identity || !sameRun(value.identity, this.identity)
      || value.sequence !== this.sequence + 1) return this.fail(new Error('Invalid, duplicate or out-of-order run evidence.'))
    const result = value
    this.sequence = result.sequence
    this.publish({ result, state: result.state, error: result.error, stale: false })
    if (result.state === 'ready' || result.state === 'paused') {
      this.clearTimers()
      this.pausedExpiry = setTimeout(() => this.stop('Paused session expired after 15 minutes.'), PYTHON_LIMITS.pausedMs)
    } else if (result.state === 'completed' || result.state === 'failed') {
      this.clearTimers(); this.worker?.terminate(); this.worker = null
    } else if (!this.deadline) this.watchdog()
  }
  private fail(error: unknown) { this.terminate(); this.publish({ state: 'failed', error: pythonError(error) }) }
  async start(mode: 'run' | 'step' | 'validate', signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new Error('Request was cancelled.')
    if (this.hidden && mode !== 'validate') throw new Error('Execution is paused while this tab is hidden. Return to the tab and choose Run or Step.')
    const document = this.snapshot.document
    if (!document || document.readOnly) throw new Error('An editable Python document must be active.')
    if (sourceBytes(document.source) > PYTHON_LIMITS.sourceBytes) throw new Error('Source exceeds 32 KiB.')
    this.terminate(); const generation = this.generation
    const cancel = () => { if (generation === this.generation) this.stop('Request deadline expired.') }
    signal?.addEventListener('abort', cancel, { once: true })
    this.publish({ state: 'validating', error: null, stale: !!this.snapshot.result })
    this.watchdog()
    try {
      const [sourceDigest, sceneDigest] = await Promise.all([this.digest(document.source), this.digest(learningSceneDescriptor(document.lessonId))])
      if (generation !== this.generation || this.snapshot.document !== document) return
      const lesson = learningLesson(document.lessonId)
      this.identity = { runId: crypto.randomUUID(), generation, workspaceId: document.workspaceId, documentId: document.documentId,
        sourceDigest, sceneDigest, lessonId: lesson.id, lessonRevision: lesson.revision, runtimeRevision: PYTHON_RUNTIME_REVISION, seed: 0 }
      this.sequence = 0; this.worker = this.workerFactory()
      this.worker.onmessage = event => this.receive(event.data, generation)
      this.worker.onerror = event => { if (generation === this.generation) this.fail(new Error(event.message || 'Python worker failed.')) }
      this.worker.postMessage({ kind: 'start', identity: this.identity, source: document.source, mode: this.hidden || this.pauseBeforeStart ? 'validate' : mode })
    } catch (error) { if (generation === this.generation) this.fail(error) }
    finally { signal?.removeEventListener('abort', cancel) }
  }
  async control(operation: 'run' | 'step' | 'validate' | 'pause' | 'stop' | 'reset' | 'hint', options: { signal?: AbortSignal } = {}): Promise<void> {
    if (options.signal?.aborted) throw new Error('Request was cancelled.')
    if (operation === 'stop') { this.stop(); return }
    if (operation === 'reset') { this.terminate(); this.publish({ state: 'idle', result: null, error: null, stale: false }); return }
    if (operation === 'hint') {
      if (!this.snapshot.document) throw new Error('No active lesson.')
      this.publish({ hint: Math.min(this.snapshot.hint + 1, learningLesson(this.snapshot.document.lessonId).hints.length) }); return
    }
    if (operation === 'validate') return this.start('validate', options.signal)
    if (operation === 'pause') { this.pause(); return }
    if (this.hidden) throw new Error('Execution is paused while this tab is hidden. Return to the tab and choose Run or Step.')
    if (this.worker && this.identity && (this.snapshot.state === 'paused' || this.snapshot.state === 'ready') && !this.snapshot.stale) {
      this.watchdog(); this.worker.postMessage({ kind: 'control', runId: this.identity.runId, generation: this.identity.generation, operation }); return
    }
    if (this.snapshot.state === 'running' || this.snapshot.state === 'validating') throw new Error('Stop the current run before starting another.')
    return this.start(operation, options.signal)
  }
  stop(message?: string): void {
    this.terminate(); this.publish({ state: 'cancelled', stale: !!this.snapshot.result, error: message ? { code: 'cancelled', message, span: this.snapshot.result?.span || { line: 1, column: 1 } } : null })
  }
  dispose(): void { this.terminate(); this.hidden = false; this.publish({ document: null, state: 'idle', result: null, stale: false, error: null, hint: 0 }) }
}
export const pythonLearningRuntime = new LearningRuntime()
