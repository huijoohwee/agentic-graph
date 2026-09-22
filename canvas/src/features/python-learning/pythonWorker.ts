import { PythonEvaluator, type ExecutionMetrics } from './pythonEvaluator'
import { LearningSimulation } from './learningSimulation'
import { gradeLearningLesson, learningLesson, type LearningSceneSnapshot } from './learningLessons'
import { PYTHON_LIMITS, PYTHON_RUNTIME_REVISION, PythonLearningError, pythonError, sourceBytes, type SourceSpan } from './pythonModel'

import { validRunIdentity, type LearningRunIdentity, type LearningRunState, type LearningWorkerRequest, type LearningWorkerSnapshot } from './learningProtocol'
export type { LearningRunIdentity, LearningWorkerSnapshot, LearningWorkerRequest } from './learningProtocol'

type Job = {
  identity: LearningRunIdentity; simulation: LearningSimulation; evaluator: PythonEvaluator
  iterator: AsyncGenerator<SourceSpan, void, void>; state: LearningRunState; sequence: number
  span: SourceSpan; busy: boolean; continuous: boolean; disposed: boolean; computeMs: number; segmentStart: number
  pauseRequested: boolean; resume: (() => void) | null
}
const waitTurn = () => new Promise<void>(resolve => setTimeout(resolve, 0))
export function createPythonWorkerHost(post: (snapshot: LearningWorkerSnapshot | { kind: 'protocol-error'; message: string }) => void, now = () => performance.now()) {
  let current: Job | null = null
  const active = (job: Job) => current === job && !job.disposed
  const dispose = () => {
    if (!current) return
    const job = current
    job.disposed = true; job.simulation.dispose(); current = null
    const resume = job.resume; job.resume = null; resume?.()
  }
  const checkBudget = (job: Job) => {
    if (!active(job)) throw new PythonLearningError('cancelled', 'Run was superseded.', job.span)
    if (job.computeMs + now() - job.segmentStart > PYTHON_LIMITS.computeMs) throw new PythonLearningError('limit-exceeded', 'Active compute exceeded five seconds.', job.span)
  }
  const publish = (job: Job, error: ReturnType<typeof pythonError> | null = null) => {
    if (!active(job)) return
    const scene = job.simulation.snapshot()
    const terminal = job.state === 'completed' || job.state === 'failed'
    if (terminal && sourceBytes(JSON.stringify(job.simulation.trace)) > PYTHON_LIMITS.traceBytes) throw new PythonLearningError('limit-exceeded', 'Trace exceeds one MiB.', job.span)
    post({ kind: 'snapshot', identity: job.identity, sequence: ++job.sequence, state: job.state, span: job.span,
      scene, output: job.evaluator.output.join(''), variables: job.evaluator.inspectVariables(), metrics: { ...job.evaluator.metrics },
      grade: gradeLearningLesson(learningLesson(job.identity.lessonId), scene, job.evaluator.metrics, job.state === 'completed'),
      computeMs: job.computeMs, error, ...(terminal ? { trace: job.simulation.trace } : {}) })
  }
  const yieldTurn = async (job: Job) => {
    checkBudget(job)
    job.computeMs += now() - job.segmentStart
    publish(job)
    await waitTurn()
    job.segmentStart = now(); checkBudget(job)
    while (job.pauseRequested) {
      job.state = 'paused'
      // Retain the in-flight iterator/physics statement; paused wall time is not active compute.
      await new Promise<void>(resolve => { job.resume = resolve; publish(job) })
      job.segmentStart = now(); checkBudget(job)
    }
    job.state = 'running'
  }
  const pump = async (job: Job) => {
    if (job.busy || !active(job)) return
    job.busy = true; job.state = 'running'; job.segmentStart = now()
    publish(job)
    try {
      do {
        checkBudget(job)
        const next = await job.iterator.next()
        if (!active(job)) return
        if (next.done === true) { job.state = 'completed'; break }
        const span = next.value as SourceSpan
        job.span = { line: span.line, column: span.column }
        if (!job.continuous) { job.state = 'paused'; break }
        if (now() - job.segmentStart >= PYTHON_LIMITS.batchMs) await yieldTurn(job)
      } while (active(job))
      job.computeMs += now() - job.segmentStart
      publish(job)
    } catch (error) {
      if (active(job)) { job.state = 'failed'; job.computeMs += now() - job.segmentStart; publish(job, pythonError(error)) }
    } finally { job.busy = false }
  }
  const receive = (value: unknown) => {
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid worker request.')
      const request = value as LearningWorkerRequest
      if (request.kind === 'start') {
        const identity = request.identity, lesson = learningLesson(identity?.lessonId)
        if (!validRunIdentity(identity)
          || typeof request.source !== 'string' || sourceBytes(request.source) > PYTHON_LIMITS.sourceBytes || !['run', 'step', 'validate'].includes(request.mode)) throw new Error('Invalid bounded start identity.')
        dispose()
        let job: Job
        // Parse before allocating the native World; a rejected program has no simulation effects.
        const evaluator = new PythonEvaluator(request.source, { call: (name, args, span) => job.simulation.call(name, args, span) })
        const simulation = new LearningSimulation(lesson, async () => {
          checkBudget(job)
          if (job.pauseRequested || now() - job.segmentStart >= PYTHON_LIMITS.batchMs) await yieldTurn(job)
        })
        job = { identity, simulation, evaluator, iterator: evaluator.run(), state: 'ready', sequence: 0, span: { line: 1, column: 1 }, busy: false, continuous: request.mode === 'run', pauseRequested: false, resume: null, disposed: false, computeMs: 0, segmentStart: now() }
        current = job; publish(job)
        if (request.mode !== 'validate') void pump(job)
      } else if (request.kind === 'control') {
        const job = current
        if (!job || request.runId !== job.identity.runId || request.generation !== job.identity.generation) throw new Error('Stale worker command.')
        if (!['run', 'step', 'pause'].includes(request.operation)) throw new Error('Unknown worker operation.')
        if (request.operation === 'pause') { job.continuous = false; job.pauseRequested = true; return }
        if (job.resume) {
          const resume = job.resume; job.resume = null
          job.pauseRequested = false; job.continuous = request.operation === 'run'; resume(); return
        }
        if (job.state === 'completed' || job.state === 'failed' || job.busy) throw new Error('Run cannot accept this command.')
        job.pauseRequested = false; job.continuous = request.operation === 'run'; void pump(job)
      } else throw new Error('Unknown worker request kind.')
    } catch (error) { post({ kind: 'protocol-error', message: JSON.stringify(pythonError(error)) }) }
  }
  return { receive, dispose }
}
// The same host is exercised in Node tests; only the actual dedicated worker installs an event handler.
if (typeof self !== 'undefined' && typeof document === 'undefined') {
  const host = createPythonWorkerHost(snapshot => self.postMessage(snapshot))
  self.onmessage = event => host.receive(event.data)
}
