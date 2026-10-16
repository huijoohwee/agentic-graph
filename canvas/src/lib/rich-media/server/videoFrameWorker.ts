import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

export type VideoFrameWorkerResult =
  | { ok: true; path: string; timeSeconds: number; format: 'png' | 'jpg'; bytes: number; cached: boolean }
  | { ok: false; error: string }
export type VideoFrameWorkerRequest = {
  contextKey: string; sourceUrl: string; pythonBin: string; repoRoot: string
  env: NodeJS.ProcessEnv; outputRoot: string; outputPath: string; privateRoot: string
  timeSeconds: number; format: 'png' | 'jpg'; signal?: AbortSignal
  cookieSnapshot?: Buffer
}
type SpawnWorker = (command: string, args: string[], options: SpawnOptionsWithoutStdio & { stdio: 'pipe' }) => ChildProcessWithoutNullStreams
type PoolOptions = {
  deadlineMs?: number; idleMs?: number; platform?: NodeJS.Platform
  spawnWorker?: SpawnWorker
  terminateWorker?: (child: ChildProcessWithoutNullStreams) => Promise<void>
  removeInputs?: (inputRoot: string) => Promise<void>
}
type Subscriber = { resolve: (result: VideoFrameWorkerResult) => void; signal?: AbortSignal; abort: () => void; cancelled?: string }
type Job = { id: string; key: string; request: VideoFrameWorkerRequest; subscribers: Set<Subscriber>; timer: ReturnType<typeof setTimeout>; worker?: Worker }
type Worker = {
  key: string; request: VideoFrameWorkerRequest; jobs: Map<string, Job>; child?: ChildProcessWithoutNullStreams
  inputRoot: string; ready: boolean; closing: boolean; closed: boolean; killDone: boolean; cleaning: boolean
  closePromise: Promise<void>; resolveClose: () => void; rejectClose: (error: Error) => void; timer: ReturnType<typeof setTimeout>
  idleTimer?: ReturnType<typeof setTimeout>; buffer: string; stdoutBytes: number; stderr: string; reason: string
}

const MAX_WORKERS = 2
const MAX_PENDING_PER_WORKER = 16
const MAX_QUEUED_SOURCES = 16
const MAX_LINE_BYTES = 16 * 1024
const MAX_STDOUT_BYTES = 256 * 1024
const MAX_STDERR_BYTES = 16 * 1024
const fail = (error: unknown): VideoFrameWorkerResult => ({ ok: false, error: String(error || 'Video frame worker failed').slice(0, 2000) })

/** Kill only the owned process tree. Budget and inputs remain held until close. */
export async function terminateVideoFrameWorkerTree(child: ChildProcessWithoutNullStreams, platform: NodeJS.Platform = process.platform,
  adapter: { systemRoot?: string; spawnKiller?: SpawnWorker; timeoutMs?: number } = {}): Promise<void> {
  if (!child.pid) return
  if (platform !== 'win32') {
    try { process.kill(-child.pid, 'SIGKILL') } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
    return
  }
  const systemRoot = adapter.systemRoot || process.env.SystemRoot || process.env.SYSTEMROOT
  if (!systemRoot) throw new Error('Windows process-tree cancellation requires SystemRoot')
  const executable = path.win32.join(systemRoot, 'System32', 'taskkill.exe')
  await new Promise<void>((resolve, reject) => {
    const killer = (adapter.spawnKiller || spawn)(executable, ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'pipe' })
    let stderr = ''
    const timer = setTimeout(() => { killer.kill(); reject(new Error('Windows process-tree cancellation timed out')) }, Math.max(1, Math.min(5000, adapter.timeoutMs ?? 5000)))
    killer.stdout.resume()
    killer.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(0, 2000) })
    killer.on('error', error => { clearTimeout(timer); reject(error) })
    killer.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error('Windows process-tree cancellation failed: ' + (stderr || String(code))))
    })
  })
}

export function createVideoFrameWorkerPool(options: PoolOptions = {}) {
  const deadlineMs = Math.max(1, Math.min(75_000, options.deadlineMs ?? 75_000))
  const idleMs = Math.max(1, Math.min(30_000, options.idleMs ?? 30_000))
  const platform = options.platform || process.platform
  const spawnWorker = options.spawnWorker || ((command, args, opts) => spawn(command, args, opts))
  const terminate = options.terminateWorker || (child => terminateVideoFrameWorkerTree(child, platform))
  const removeInputs = options.removeInputs || (inputRoot => fs.rm(inputRoot, { recursive: true, force: true }))
  const workers = new Set<Worker>()
  const jobsByKey = new Map<string, Job>()
  const queuedByContext = new Map<string, Job[]>()
  let sequence = 0
  let disposed = false
  let lastError = ''
  let fatalError = ''

  const removeQueued = (job: Job) => {
    const queued = queuedByContext.get(job.request.contextKey)
    if (!queued) return
    const remaining = queued.filter(item => item !== job)
    if (remaining.length) queuedByContext.set(job.request.contextKey, remaining)
    else queuedByContext.delete(job.request.contextKey)
  }
  const settle = (job: Job, result: VideoFrameWorkerResult) => {
    clearTimeout(job.timer)
    if (jobsByKey.get(job.key) === job) jobsByKey.delete(job.key)
    removeQueued(job)
    job.worker?.jobs.delete(job.id)
    for (const subscriber of job.subscribers) {
      subscriber.signal?.removeEventListener('abort', subscriber.abort)
      subscriber.resolve(subscriber.cancelled ? fail(subscriber.cancelled) : result)
    }
    job.subscribers.clear()
  }
  const releaseClosed = async (worker: Worker) => {
    if (!worker.closed || !worker.killDone || worker.cleaning || !workers.has(worker)) return
    worker.cleaning = true
    for (const job of [...worker.jobs.values()]) settle(job, fail(worker.reason))
    // Remove only this worker's private source directory after its exact child closes.
    try { if (worker.inputRoot) await removeInputs(worker.inputRoot) }
    catch (error) {
      fatalError = lastError = 'Private video source cleanup failed: ' + String(error).slice(0, 1800)
      for (const queued of [...queuedByContext.values()]) for (const job of [...queued]) settle(job, fail(fatalError))
      // Retain this closed worker's resource slot and owned inputs. Replacing it
      // would permit unbounded retained source files after repeated failures.
      worker.rejectClose(new Error(fatalError))
      return
    }
    workers.delete(worker)
    worker.resolveClose()
    drain()
  }
  const stop = (worker: Worker, reason: string) => {
    if (worker.closing) return worker.closePromise
    worker.closing = true
    worker.reason = reason
    clearTimeout(worker.timer)
    if (worker.idleTimer) clearTimeout(worker.idleTimer)
    const kill = Promise.resolve().then(() => worker.child ? terminate(worker.child) : undefined)
    void kill.catch(error => {
      reason += '; process-tree cancellation failed: ' + String(error).slice(0, 1000)
      lastError = reason
      worker.reason = reason
      worker.rejectClose(new Error(reason))
    }).then(() => {
      worker.killDone = true
      void releaseClosed(worker)
    })
    return worker.closePromise
  }
  const armIdle = (worker: Worker) => {
    if (worker.closing || worker.jobs.size) return
    if (worker.idleTimer) clearTimeout(worker.idleTimer)
    worker.idleTimer = setTimeout(() => { void stop(worker, 'Video frame source worker idle lease ended') }, idleMs)
    worker.idleTimer.unref?.()
  }
  const onLine = (worker: Worker, line: string) => {
    if (worker.closing) return
    try {
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) throw new Error('Video frame worker result line exceeds 16KiB')
      const result = JSON.parse(line) as Record<string, unknown>
      const job = typeof result.id === 'string' ? worker.jobs.get(result.id) : undefined
      if (!job) throw new Error('Video frame worker returned an unknown result ID')
      if (result.ok === false && typeof result.error === 'string') settle(job, fail(result.error))
      else if (result.ok === true && result.path === job.request.outputPath && result.timeSeconds === job.request.timeSeconds
        && result.format === job.request.format && typeof result.bytes === 'number' && Number.isSafeInteger(result.bytes) && result.bytes > 0) {
        settle(job, { ok: true, path: job.request.outputPath, timeSeconds: job.request.timeSeconds, format: job.request.format, bytes: result.bytes, cached: result.cached === true })
      } else throw new Error('Video frame worker returned an invalid result')
      armIdle(worker)
      drain()
    } catch (error) { void stop(worker, String(error)) }
  }
  const send = (worker: Worker, job: Job) => {
    if (!worker.ready || worker.closing) return
    worker.child!.stdin.write(JSON.stringify({
      id: job.id, timeSeconds: job.request.timeSeconds, format: job.request.format, outputPath: job.request.outputPath,
    }) + '\n', error => { if (error) void stop(worker, 'Video frame worker input failed: ' + error.message) })
  }
  const assign = (worker: Worker, job: Job) => {
    if (worker.idleTimer) { clearTimeout(worker.idleTimer); worker.idleTimer = undefined }
    removeQueued(job)
    job.worker = worker
    worker.jobs.set(job.id, job)
    send(worker, job)
  }
  const start = async (worker: Worker) => {
    try {
      const privateRoot = worker.request.privateRoot
      await fs.mkdir(privateRoot, { recursive: true, mode: 0o700 })
      worker.inputRoot = await fs.mkdtemp(path.join(privateRoot, 'source-'))
      if (worker.closing) {
        worker.closed = true
        void releaseClosed(worker)
        return
      }
      const request = worker.request
      const env = { ...request.env }
      if (request.cookieSnapshot) {
        const cookiePath = path.join(worker.inputRoot, 'cookies.txt')
        await fs.writeFile(cookiePath, request.cookieSnapshot, { mode: 0o600, flag: 'wx' })
        env.AG_VIDEO_FRAME_YTDLP_COOKIES = cookiePath
      }
      if (worker.closing) { worker.closed = true; void releaseClosed(worker); return }
      const child = spawnWorker(request.pythonBin, [
        '-m', 'agentic_graph_parser.video_frame_worker', '--url', request.sourceUrl,
        '--output-root', request.outputRoot, '--input-root', worker.inputRoot,
        '--timeout-s', String(Math.max(1, Math.ceil(deadlineMs / 1000))),
      ], { cwd: request.repoRoot, env, detached: platform !== 'win32', windowsHide: true, stdio: 'pipe' })
      worker.child = child
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        worker.stdoutBytes += Buffer.byteLength(chunk)
        if (worker.stdoutBytes > MAX_STDOUT_BYTES) { void stop(worker, 'Video frame worker stdout exceeds 256KiB'); return }
        worker.buffer += chunk
        let newline = worker.buffer.indexOf('\n')
        while (newline >= 0 && !worker.closing) {
          const line = worker.buffer.slice(0, newline).trim()
          worker.buffer = worker.buffer.slice(newline + 1)
          if (line) onLine(worker, line)
          newline = worker.buffer.indexOf('\n')
        }
        if (Buffer.byteLength(worker.buffer) > MAX_LINE_BYTES) void stop(worker, 'Video frame worker result line exceeds 16KiB')
      })
      child.stderr.on('data', (chunk: string) => {
        worker.stderr += chunk
        if (Buffer.byteLength(worker.stderr) > MAX_STDERR_BYTES) {
          worker.stderr = worker.stderr.slice(0, 2000)
          void stop(worker, 'Video frame worker stderr exceeds 16KiB')
        }
      })
      child.stdin.on('error', error => { void stop(worker, 'Video frame worker input failed: ' + error.message) })
      child.on('error', error => { void stop(worker, 'Video frame worker process failed: ' + error.message) })
      child.on('close', code => {
        worker.closed = true
        if (!worker.closing) void stop(worker, worker.stderr.trim() || 'Video frame worker closed unexpectedly (exit ' + String(code) + ')')
        void releaseClosed(worker)
      })
      worker.ready = true
      for (const job of worker.jobs.values()) send(worker, job)
    } catch (error) {
      worker.closed = !worker.child
      void stop(worker, 'Video frame worker startup failed: ' + String(error))
      void releaseClosed(worker)
    }
  }
  function drain() {
    if (disposed || fatalError) return
    for (const [contextKey, queued] of [...queuedByContext]) {
      if (!queued.length) continue
      let worker = [...workers].find(item => item.key === contextKey && !item.closing)
      if (!worker && workers.size >= MAX_WORKERS) {
        const idle = [...workers].find(item => !item.closing && item.ready && !item.jobs.size)
        if (idle) void stop(idle, 'Idle video source worker evicted for queued source')
        continue
      }
      if (!worker) {
        let resolveClose!: () => void, rejectClose!: (error: Error) => void
        const closePromise = new Promise<void>((resolve, reject) => { resolveClose = resolve; rejectClose = reject })
        void closePromise.catch(() => {})
        worker = {
          key: contextKey, request: queued[0]!.request, jobs: new Map(), inputRoot: '',
          ready: false, closing: false, closed: false, killDone: false, cleaning: false, closePromise, resolveClose, rejectClose,
          timer: undefined!, buffer: '', stdoutBytes: 0, stderr: '', reason: '',
        }
        const ownedWorker = worker
        worker.timer = setTimeout(() => { void stop(ownedWorker, 'Video frame source worker absolute deadline exceeded') }, deadlineMs)
        worker.timer.unref?.()
        workers.add(worker)
        for (const job of [...queued].slice(0, MAX_PENDING_PER_WORKER)) assign(worker, job)
        void start(worker)
      } else {
        for (const job of [...queued].slice(0, MAX_PENDING_PER_WORKER - worker.jobs.size)) assign(worker, job)
      }
    }
  }
  const unsubscribe = (job: Job, subscriber: Subscriber, error: string) => {
    if (!job.subscribers.has(subscriber) || subscriber.cancelled) return
    subscriber.cancelled = error
    subscriber.signal?.removeEventListener('abort', subscriber.abort)
    if (!job.worker) {
      job.subscribers.delete(subscriber)
      subscriber.resolve(fail(error))
      if (!job.subscribers.size) settle(job, fail(error))
    }
    if (job.worker && ![...job.worker.jobs.values()].some(item => [...item.subscribers].some(sub => !sub.cancelled))) void stop(job.worker, error)
    drain()
  }
  return {
    request(request: VideoFrameWorkerRequest): Promise<VideoFrameWorkerResult> {
      if (disposed) return Promise.resolve(fail('Video frame worker pool is closed'))
      if (fatalError) return Promise.resolve(fail(fatalError))
      if (request.signal?.aborted) return Promise.resolve(fail('Video frame request cancelled'))
      const key = request.contextKey + '\0' + request.outputPath
      let job = jobsByKey.get(key)
      if (job?.worker?.closing) return Promise.resolve(fail('Video frame source worker is closing'))
      if (!job) {
        const worker = [...workers].find(item => item.key === request.contextKey && !item.closing)
        const queued = queuedByContext.get(request.contextKey) || []
        if ((worker?.jobs.size || 0) + queued.length >= MAX_PENDING_PER_WORKER) return Promise.resolve(fail('Video frame source pending limit exceeded (16)'))
        if (!worker && !queued.length && queuedByContext.size >= MAX_QUEUED_SOURCES) return Promise.resolve(fail('Video frame queued source limit exceeded (16)'))
        job = { id: String(++sequence), key, request, subscribers: new Set(), timer: undefined! }
        const ownedJob = job
        job.timer = setTimeout(() => {
          for (const subscriber of [...ownedJob.subscribers]) unsubscribe(ownedJob, subscriber, 'Video frame request absolute deadline exceeded')
        }, deadlineMs)
        jobsByKey.set(key, job)
        queuedByContext.set(request.contextKey, [...queued, job])
      }
      const ownedJob = job
      const promise = new Promise<VideoFrameWorkerResult>(resolve => {
        const subscriber: Subscriber = { resolve, signal: request.signal, abort: () => unsubscribe(ownedJob, subscriber, 'Video frame request cancelled') }
        ownedJob.subscribers.add(subscriber)
        request.signal?.addEventListener('abort', subscriber.abort, { once: true })
      })
      drain()
      return promise
    },
    inspect() {
      return { workers: workers.size, queuedSources: queuedByContext.size, pending: jobsByKey.size, lastError }
    },
    async close() {
      disposed = true
      for (const queued of [...queuedByContext.values()]) for (const job of [...queued]) settle(job, fail('Video frame worker pool closed'))
      await Promise.all([...workers].map(worker => stop(worker, 'Video frame worker pool closed')))
    },
  }
}

export const videoFrameWorkerPool = createVideoFrameWorkerPool()
export type VideoFrameWorkerPool = ReturnType<typeof createVideoFrameWorkerPool>
