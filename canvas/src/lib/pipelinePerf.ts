export type PipelinePerfWindow = Window & { __AG_PIPELINE_PERF_ENABLED__?: boolean }

export type PipelinePerfDetail = {
  name: string
  stage: string
  durationMs: number
  ts: number
  detail?: Record<string, unknown>
}

export function setPipelinePerfEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  const anyWindow = window as PipelinePerfWindow
  anyWindow.__AG_PIPELINE_PERF_ENABLED__ = enabled
}

export function pipelinePerfStart(): number | null {
  if (typeof window === 'undefined') return null
  const anyWindow = window as PipelinePerfWindow
  if (!anyWindow.__AG_PIPELINE_PERF_ENABLED__) return null
  return performance.now()
}

export const pipelinePerfNow = pipelinePerfStart
export const pipelinePerfMark = pipelinePerfStart

export function pipelinePerfEnd(args: {
  name: string
  stage: string
  t0: number | null
  detail?: Record<string, unknown>
}): void {
  if (args.t0 == null) return
  if (typeof window === 'undefined') return
  const anyWindow = window as PipelinePerfWindow
  if (!anyWindow.__AG_PIPELINE_PERF_ENABLED__) return
  try {
    const durationMs = performance.now() - args.t0
    const event = new CustomEvent<PipelinePerfDetail>('kg-pipeline-perf', {
      detail: {
        name: args.name,
        stage: args.stage,
        durationMs,
        ts: performance.now(),
        detail: args.detail,
      },
    })
    window.dispatchEvent(event)
  } catch {
    void 0
  }
}

export async function pipelinePerfMeasureAsync<T>(args: {
  name: string
  stage: string
  detail?: Record<string, unknown>
  run: () => Promise<T>
}): Promise<T> {
  const t0 = pipelinePerfStart()
  try {
    const out = await args.run()
    pipelinePerfEnd({ name: args.name, stage: args.stage, t0, detail: args.detail })
    return out
  } catch (err) {
    pipelinePerfEnd({ name: args.name, stage: `${args.stage}:error`, t0, detail: args.detail })
    throw err
  }
}

export function pipelinePerfMeasureSync<T>(args: {
  name: string
  stage: string
  detail?: Record<string, unknown>
  run: () => T
}): T {
  const t0 = pipelinePerfStart()
  try {
    const out = args.run()
    pipelinePerfEnd({ name: args.name, stage: args.stage, t0, detail: args.detail })
    return out
  } catch (err) {
    pipelinePerfEnd({ name: args.name, stage: `${args.stage}:error`, t0, detail: args.detail })
    throw err
  }
}
