import { digestLearningSource, pythonLearningRuntime, type LearningRuntime } from './learningRuntime'
import { LEARNING_LESSONS, learningLesson, learningSceneDescriptor } from './learningLessons'
import type { LearningWorkerSnapshot } from './learningProtocol'
import { PYTHON_LIMITS, PYTHON_RUNTIME_REVISION } from './pythonModel'
import { PYTHON_LEARNING_TOOL_IDS, PYTHON_LEARNING_OPERATIONS } from './learningToolContract.mjs'
import type { AgentReadyToolContract, WebMcpTool } from '../agent-ready/webMcpRuntimeTypes'

export function createLearningToolExecutor(runtime: LearningRuntime = pythonLearningRuntime) {
  const requests = new Map<string, { signature: string; result: Promise<unknown> }>()
  const identity = async () => {
    const before = runtime.read(), document = before.document
    if (!document) throw new Error('No active Python document. Open a .py file in Editor Workspace.')
    const [sourceDigest, sceneDigest] = await Promise.all([digestLearningSource(document.source), digestLearningSource(learningSceneDescriptor(document.lessonId))])
    if (runtime.read().document !== document) throw new Error('stale-input: active document changed during inspection.')
    const lesson = learningLesson(document.lessonId)
    return { workspaceId: document.workspaceId, documentId: document.documentId, sourceDigest, sceneDigest, lessonId: lesson.id,
      lessonRevision: lesson.revision, runtimeRevision: PYTHON_RUNTIME_REVISION, seed: 0, expectedRunId: runtime.readIdentity()?.runId || null }
  }
  const inspect = async () => {
    if (!runtime.read().document) return { status: 'unavailable', message: 'Open an editable .py file in Editor Workspace.', limits: PYTHON_LIMITS }
    const binding = await identity(), state = runtime.read()
    const result: Omit<LearningWorkerSnapshot, 'trace'> | null = state.result ? (({ trace, ...value }) => value)(state.result) : null
    return { schema: 'python-learning-inspection/v1', binding, state: state.state, stale: state.stale, error: state.error,
      result: state.result ? result : null, limits: PYTHON_LIMITS, hintStage: state.hint,
      lessons: LEARNING_LESSONS.map(({ id, revision, title, objective }) => ({ id, revision, title, objective })),
      hints: learningLesson(binding.lessonId).hints.slice(0, state.hint), costLog: { model: 'none', prompt_tokens: 0, completion_tokens: 0, cache_hits: 0, estimated_cost_usd: 0 } }
  }
  const execute = async (input: Record<string, unknown>) => {
    if (!input || typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(input.requestId)
      || !PYTHON_LEARNING_OPERATIONS.includes(input.operation as string)) throw new Error('invalid-input: operation/requestId is invalid.')
    const signature = JSON.stringify(input), prior = requests.get(input.requestId)
    if (prior) { if (prior.signature !== signature) throw new Error('stale-input: requestId was reused for different input.'); return prior.result }
    const deadline = new AbortController()
    const operation = async () => {
      const binding = await identity()
      if (deadline.signal.aborted) throw new Error('Request acknowledgement exceeded two seconds.')
      if (Object.keys(input).some(key => ![...Object.keys(binding), 'requestId', 'operation'].includes(key))
        || Object.keys(binding).some(key => input[key] !== binding[key])) throw new Error('stale-input: inspect the current document and run before controlling it.')
      if (input.operation === 'save') {
        const frozen = runtime.read(), controller = deadline
        const unsubscribe = runtime.subscribe(() => { if (runtime.read().document !== frozen.document || runtime.read().result !== frozen.result) controller.abort() })
        try {
          const storage = await import('./learningPersistence')
          const path = await storage.saveLearningDebrief(await storage.captureLearningDebrief(frozen), controller.signal)
          return { status: 'saved', path, binding }
        } finally { unsubscribe() }
      }
      await runtime.control(input.operation as Parameters<typeof runtime.control>[0], { signal: deadline.signal })
      return { status: runtime.read().state, runId: runtime.readIdentity()?.runId || null, requestId: input.requestId }
    }
    if (requests.size >= 128) requests.delete(requests.keys().next().value!)
    let timer: ReturnType<typeof setTimeout>
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { deadline.abort(); reject(new Error('Request acknowledgement exceeded two seconds.')) }, 2000) })
    const result = Promise.race([operation(), timeout]).finally(() => clearTimeout(timer))
    requests.set(input.requestId, { signature, result }); return result
  }
  return { inspect, execute }
}
const executor = createLearningToolExecutor()
export function buildPythonLearningWebMcpToolBuilders(findContract: (name: string) => AgentReadyToolContract): Record<string, () => WebMcpTool> {
  return Object.fromEntries((Object.values(PYTHON_LEARNING_TOOL_IDS) as string[]).map(name => [name, () => {
    const contract = findContract(name)
    return { ...contract, name: contract.webName, execute: name === PYTHON_LEARNING_TOOL_IDS.inspect ? executor.inspect : executor.execute }
  }]))
}
