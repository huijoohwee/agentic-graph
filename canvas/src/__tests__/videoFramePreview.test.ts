import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import fs from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createVideoFrameWorkerPool, terminateVideoFrameWorkerTree, type VideoFrameWorkerRequest } from '@/lib/rich-media/server/videoFrameWorker'
import { createRemoteVideoFrameHandler } from '@/lib/rich-media/server/videoFrameServer'
import {
  buildRemoteVideoFrameFileName,
  buildYouTubeTimestampFramePreviewDescriptor,
} from 'grph-shared/rich-media/providers'
import { getOrCreateVideoThumbnail } from 'grph-shared/rich-media/videoThumbnail'
import { buildRemoteVideoFrameDefaultCacheRoot, buildRemoteVideoFrameDefaultPublicPrefix, readRemoteVideoFrameOutputFolderName } from '@/lib/rich-media/server/videoFrameServer'

export async function testYouTubeTimestampFramePreviewUsesSharedVideoFrameEndpoint() {
  const url = 'https://www.youtube.com/watch?v=aBcD123xYz9&t=421'
  const preview = buildYouTubeTimestampFramePreviewDescriptor(url)
  if (!preview) throw new Error('expected timestamp frame preview descriptor')
  if (preview.kind !== 'timestamp-frame') throw new Error(`expected timestamp-frame kind, got ${preview.kind}`)
  if (preview.provider !== 'youtube') throw new Error(`expected youtube provider, got ${preview.provider}`)
  if (preview.startSeconds !== 421) throw new Error(`expected startSeconds 421, got ${preview.startSeconds}`)
  if (preview.timestampLabel !== '7:01') throw new Error(`expected timestamp label 7:01, got ${preview.timestampLabel}`)
  if (!String(preview.thumbnailUrl || '').startsWith('/__video_frame?')) {
    throw new Error(`expected video-frame endpoint thumbnail, got ${preview.thumbnailUrl || ''}`)
  }
  const requestUrl = new URL(String(preview.thumbnailUrl || ''), 'https://example.test')
  if (requestUrl.searchParams.get('time') !== '421') throw new Error('expected frame request to carry timestamp seconds')
  if (requestUrl.searchParams.get('format') !== 'png') throw new Error('expected PNG frame request')
  if (requestUrl.searchParams.get('url') !== url) throw new Error('expected frame request to preserve source URL')
  await testVideoFrameSourceWorkerResourceInvariants()
  await testVideoFrameSourceWorkerFailureAndCancellation()
  await testVideoFrameSourceWorkerCleanupFailureRetainsBudget()
  await testVideoFrameWindowsTreeCancellationAdapter()
  await testVideoFrameHandlerDiskAndInflightReuse()
  await testVideoFrameHandlerDeadlineEndsConnectedResponse()
  await testVideoFrameRealPythonWorkerProtocol()
}

export async function testVideoThumbnailPrefersTimestampFrameBeforeGenericYouTubeThumbnail() {
  const url = 'https://youtu.be/aBcD123xYz9?t=421'
  const thumb = await getOrCreateVideoThumbnail(url)
  if (!thumb || !thumb.startsWith('/__video_frame?')) {
    throw new Error(`expected timestamped YouTube thumbnail to use frame endpoint, got ${thumb || ''}`)
  }
}

export async function testRemoteVideoFrameFileNameIsStableAndNeutral() {
  const first = buildRemoteVideoFrameFileName({
    sourceUrl: 'https://www.youtube.com/watch?v=aBcD123xYz9&t=421',
    timeSeconds: 421,
    format: 'png',
  })
  const second = buildRemoteVideoFrameFileName({
    sourceUrl: 'https://www.youtube.com/watch?v=aBcD123xYz9&t=421',
    timeSeconds: 421,
    format: 'png',
  })
  if (first !== second) throw new Error('expected stable frame filename')
  if (!/^frame-[a-f0-9]+-t421\.png$/.test(first)) {
    throw new Error(`expected neutral generated frame filename, got ${first}`)
  }
  const fractional = buildRemoteVideoFrameFileName({
    sourceUrl: 'https://www.youtube.com/watch?v=aBcD123xYz9&t=421',
    timeSeconds: 2.8,
    format: 'png',
  })
  if (!/^frame-[a-f0-9]+-t2_8\.png$/.test(fractional)) {
    throw new Error(`expected fractional frame filename to stay filesystem-safe, got ${fractional}`)
  }
}

export function testRemoteVideoFrameCacheRootUsesTimestampedSiblingImageFolder() {
  const workspaceRoot = '/workspace'
  const folderName = readRemoteVideoFrameOutputFolderName()
  const cacheRoot = buildRemoteVideoFrameDefaultCacheRoot(workspaceRoot)
  const publicPrefix = buildRemoteVideoFrameDefaultPublicPrefix()
  if (!/^\d{8}T\d{6}Z$/.test(folderName)) throw new Error(`expected docs_-style timestamp folder, got ${folderName}`)
  if (cacheRoot !== `${workspaceRoot}/huijoohwee/image/video-frame/${folderName}`) {
    throw new Error(`expected sibling image/video-frame timestamp root, got ${cacheRoot}`)
  }
  if (cacheRoot.split('/image/video-frame/').length !== 2) throw new Error(`expected one sibling image/video-frame root segment, got ${cacheRoot}`)
  if (publicPrefix !== `/image/video-frame/${folderName}`) throw new Error(`expected timestamped public prefix, got ${publicPrefix}`)
}


const assertFrame = (value: unknown, message: string) => { if (!value) throw new Error(message) }
const pauseFrame = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const waitFrame = async (condition: () => boolean, message: string) => {
  const end = Date.now() + 3000
  while (!condition()) { if (Date.now() > end) throw new Error(message); await pauseFrame(10) }
}
const fixtureWorkerCode = String.raw`
const fs = require('node:fs'); const readline = require('node:readline'); const cp = require('node:child_process');
const mode = process.env.FRAME_FIXTURE_MODE || 'normal'; const queue = []; let active = 0;
if (process.env.AG_VIDEO_FRAME_YTDLP_COOKIES && process.env.FRAME_COOKIE_LOG) {
 fs.appendFileSync(process.env.FRAME_COOKIE_LOG, JSON.stringify({path:process.env.AG_VIDEO_FRAME_YTDLP_COOKIES,bytes:fs.readFileSync(process.env.AG_VIDEO_FRAME_YTDLP_COOKIES,'utf8')})+'\n');
}
if (mode === 'hang') {
 const descendant = cp.spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {stdio:'ignore'});
 fs.writeFileSync(process.env.FRAME_FIXTURE_DESCENDANT, String(descendant.pid));
}
function pump() {
 while (active < 2 && queue.length) {
  const job = queue.shift(); active++;
  if (mode === 'hang') continue;
  if (mode === 'stdout') { process.stdout.write('x'.repeat(17000)); continue; }
  if (mode === 'stderr') { process.stderr.write('x'.repeat(17000)); continue; }
  setTimeout(() => {
   if (job.timeSeconds === 99) process.stdout.write(JSON.stringify({id:job.id,ok:false,error:'fixture source failure'})+'\n');
   else {
    fs.writeFileSync(job.outputPath, 'frame-'+job.timeSeconds);
    process.stdout.write(JSON.stringify({id:job.id,ok:true,path:mode==='invalid'?'/wrong':job.outputPath,
     timeSeconds:job.timeSeconds,format:job.format,bytes:fs.statSync(job.outputPath).size,cached:false})+'\n');
   }
   active--; pump();
  }, job.timeSeconds === 1 || job.timeSeconds === 101 ? 100 : 20);
 }
}
readline.createInterface({input:process.stdin}).on('line', line => {queue.push(JSON.parse(line)); pump()});
`

const createFrameFixture = async (deadlineMs = 2000, mode = 'normal', terminateWorker?: Parameters<typeof createVideoFrameWorkerPool>[0]['terminateWorker'], removeInputs?: Parameters<typeof createVideoFrameWorkerPool>[0]['removeInputs']) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-frame-pool-test-'))
  const outputRoot = path.join(root, 'output')
  await fs.mkdir(outputRoot)
  const fixture = path.join(root, 'worker.cjs')
  await fs.writeFile(fixture, fixtureWorkerCode)
  const children: ReturnType<typeof spawn>[] = []
  const inputRoots: string[] = []
  const contexts: string[] = []
  let beforeSpawn: (() => void) | undefined
  const pool = createVideoFrameWorkerPool({ deadlineMs, idleMs: 500, terminateWorker, removeInputs, spawnWorker: (_command, args, opts) => {
    beforeSpawn?.()
    inputRoots.push(args[args.indexOf('--input-root') + 1]!)
    contexts.push(String(opts.env?.FRAME_AUTH || ''))
    const child = spawn(process.execPath, [fixture], opts)
    children.push(child)
    return child
  } })
  const request = (timeSeconds: number, contextKey = 'source-a'): VideoFrameWorkerRequest => ({
    contextKey, sourceUrl: 'https://www.youtube.com/watch?v=fixture', pythonBin: process.execPath,
    repoRoot: root, outputRoot, privateRoot: path.join(root, 'private'),
    outputPath: path.join(outputRoot, `frame-a-t${timeSeconds}.png`), timeSeconds, format: 'png',
    env: { ...process.env, FRAME_AUTH: contextKey, FRAME_FIXTURE_MODE: mode, FRAME_FIXTURE_DESCENDANT: path.join(root, 'descendant') },
  })
  const cleanup = async () => { await pool.close(); await fs.rm(root, { recursive: true, force: true }) }
  return { root, outputRoot, pool, request, children, inputRoots, contexts, cleanup, setBeforeSpawn: (callback?: () => void) => { beforeSpawn = callback } }
}

export async function testVideoFrameSourceWorkerResourceInvariants() {
  const f = await createFrameFixture()
  try {
    const order: number[] = []
    const slow = f.pool.request(f.request(1)).then(result => { order.push(1); return result })
    const first = await f.pool.request(f.request(2)).then(result => { order.push(2); return result })
    assertFrame(first.ok && order[0] === 2, 'first completed frame must stream before a slower frame')
    assertFrame((await slow).ok, 'slow cohort frame should complete')
    const later = await f.pool.request(f.request(3))
    assertFrame(later.ok && f.children.length === 1, 'later HTTP cohorts must reuse the living source worker')
    const duplicate = f.request(4)
    const duplicates = await Promise.all([f.pool.request(duplicate), f.pool.request(duplicate)])
    assertFrame(duplicates.every(result => result.ok) && f.children.length === 1, 'exact duplicate output must not spawn/extract twice')
    const pending = Array.from({ length: 16 }, (_, index) => f.pool.request(f.request(10 + index)))
    const overflow = await f.pool.request(f.request(30))
    assertFrame(overflow.ok !== true && overflow.error.includes('pending limit'), 'source pending count must be capped at16')
    assertFrame((await Promise.all(pending)).every(result => result.ok), 'accepted16 frames should complete')
    const providerFailure = await f.pool.request(f.request(99))
    assertFrame(providerFailure.ok !== true && providerFailure.error.includes('fixture source failure'), 'provider errors must fail loudly')
    assertFrame((await f.pool.request(f.request(100))).ok && f.children.length === 1, 'individual frame failure must preserve the healthy sourceworker')
    const auth = await f.pool.request(f.request(40, 'source-b'))
    assertFrame(auth.ok && f.children.length === 2 && f.contexts.join(',') === 'source-a,source-b', 'different auth snapshots must use separate processes')
    const next = await f.pool.request(f.request(41, 'source-c'))
    assertFrame(next.ok && f.children.length === 3 && f.pool.inspect().workers <= 2, 'idle eviction must retain the2-worker cap')
    await f.pool.close()
    for (const inputRoot of f.inputRoots) assertFrame(!(await fs.stat(inputRoot).catch(() => null)), 'closed worker must remove only its owned private source directory')
  } finally { await f.cleanup() }
  const bounded = await createFrameFixture(500, 'hang')
  try {
    const requests = [bounded.pool.request(bounded.request(1)), bounded.pool.request(bounded.request(2, 'b'))]
    for (let index = 0; index < 16; index++) requests.push(bounded.pool.request(bounded.request(10 + index, 'queue-' + index)))
    const rejected = await bounded.pool.request(bounded.request(50, 'queue-overflow'))
    assertFrame(rejected.ok !== true && rejected.error.includes('queued source limit'), 'queued source count must be bounded at16')
    assertFrame(bounded.pool.inspect().workers === 2, 'queued sources must not spawn beyond2 workers')
    await bounded.pool.close()
    await Promise.all(requests)
  } finally { await bounded.cleanup() }
}

export async function testVideoFrameSourceWorkerFailureAndCancellation() {
  for (const mode of ['invalid', 'stdout', 'stderr', 'hang']) {
    const f = await createFrameFixture(250, mode)
    try {
      const result = await f.pool.request(f.request(1))
      assertFrame(!result.ok, mode + ' must fail loudly')
      await waitFrame(() => f.pool.inspect().workers === 0, mode + ' must release worker only afterclose')
      assertFrame(f.children[0]?.exitCode !== null || f.children[0]?.signalCode !== null, 'failed worker child must have closed')
      for (const inputRoot of f.inputRoots) assertFrame(!(await fs.stat(inputRoot).catch(() => null)), 'failed worker inputs must be cleaned afterclose')
    } finally { await f.cleanup() }
  }
  const f = await createFrameFixture(2000, 'hang')
  try {
    const a = new AbortController(), b = new AbortController()
    const first = f.pool.request({ ...f.request(1), signal: a.signal })
    const duplicate = f.pool.request({ ...f.request(1), signal: b.signal })
    await waitFrame(() => f.children.length === 1, 'cancel fixture must spawn')
    await waitFrame(() => f.inputRoots.length === 1, 'cancel fixture must own input')
    a.abort()
    await pauseFrame(30)
    assertFrame(f.pool.inspect().workers === 1, 'one disconnected duplicate must not cancel another subscriber')
    b.abort()
    assertFrame(!(await first).ok && !(await duplicate).ok, 'all disconnected subscribers must cancel the owned tree')
    await waitFrame(() => f.pool.inspect().workers === 0, 'cancelled child close must release worker')
    const pid = Number(await fs.readFile(path.join(f.root, 'descendant'), 'utf8').catch(() => '0'))
    if (pid && process.platform !== 'win32') {
      await waitFrame(() => { try { process.kill(pid, 0); return false } catch { return true } }, 'owned descendant must be terminated with the worker')
    }
  } finally { await f.cleanup() }
  const failedKill = await createFrameFixture(2000, 'hang', async () => { throw new Error('fixture tree kill rejected') })
  try {
    const controller = new AbortController()
    const pending = failedKill.pool.request({ ...failedKill.request(1), signal: controller.signal })
    await waitFrame(() => failedKill.children.length === 1, 'failed kill fixture must spawn')
    controller.abort()
    await waitFrame(() => failedKill.pool.inspect().lastError.includes('fixture tree kill rejected'), 'failed cancellation must be reported')
    assertFrame(failedKill.pool.inspect().workers === 1, 'failed tree cancellation must retain worker budget untilactualclose')
    const error = await failedKill.pool.close().then(() => '', failure => String(failure))
    assertFrame(error.includes('fixture tree kill rejected'), 'pool close must report cancellation failure without hanging')
    const child = failedKill.children[0]!
    if (process.platform === 'win32') child.kill()
    else process.kill(-child.pid!, 'SIGKILL')
    await pending
    await waitFrame(() => failedKill.pool.inspect().workers === 0, 'late child close must finish cleanup')
  } finally { await fs.rm(failedKill.root, { recursive: true, force: true }) }
}

const closeFrameServer = (server: Server) => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
export async function testVideoFrameHandlerDiskAndInflightReuse() {
  const f = await createFrameFixture()
  const opts = { repoRoot: f.root, workspaceRoot: f.root, cacheRoot: f.outputRoot,
    getPythonBin: async () => process.execPath, withRepoPythonPath: (env: NodeJS.ProcessEnv) => ({ ...env, FRAME_FIXTURE_MODE: 'normal' }), workerPool: f.pool }
  const handler = createRemoteVideoFrameHandler(opts)
  let aliasHandler: ReturnType<typeof createRemoteVideoFrameHandler> | undefined
  const server = createServer((req, res) => (req.url?.startsWith('/alias/') && aliasHandler ? aliasHandler : handler)(req, res, error => { res.statusCode = 500; res.end(String(error)) }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const sourceUrl = 'https://www.youtube.com/watch?v=framefixture'
  const url = (time: number) => `http://127.0.0.1:${address.port}/__video_frame?url=${encodeURIComponent(sourceUrl)}&time=${time}&emit=json`
  try {
    const warmName = buildRemoteVideoFrameFileName({ sourceUrl, timeSeconds: 5, format: 'png' })
    await fs.writeFile(path.join(f.outputRoot, warmName), 'offline-frame')
    opts.getPythonBin = async () => { throw new Error('warm frame must not resolve Python') }
    const warm = await (await fetch(url(5))).json() as { ok: boolean; cached: boolean }
    assertFrame(warm.ok && warm.cached && f.children.length === 0, 'durable disk frame must be served offline with0spawns')
    opts.getPythonBin = async () => process.execPath
    const results = await Promise.all([fetch(url(1)).then(r => r.json()), fetch(url(1)).then(r => r.json()), fetch(url(2)).then(r => r.json())])
    assertFrame(results.every(result => result.ok) && f.children.length === 1, 'handler duplicateoutputs andsourceframes must use1worker')
    const later = await (await fetch(url(3))).json() as { ok: boolean }
    assertFrame(later.ok && f.children.length === 1, 'handler latercohort must join source lease')
    const cookieFile = path.join(f.root, 'cookies.txt')
    await fs.writeFile(cookieFile, 'first-cookie-snapshot')
    opts.withRepoPythonPath = env => ({ ...env, AG_VIDEO_FRAME_YTDLP_COOKIES: cookieFile, FRAME_FIXTURE_MODE: 'normal' })
    assertFrame((await (await fetch(url(6))).json() as { ok: boolean }).ok, 'first cookie file context should work')
    await fs.writeFile(cookieFile, 'changed-cookie-snapshot')
    assertFrame((await (await fetch(url(7))).json() as { ok: boolean }).ok, 'changed cookie file context should work')
    assertFrame(f.children.length === 3, 'cookie file content change must invalidate private source reuse')
    const durable = await (await fetch(url(6))).json() as { ok: boolean; cached: boolean }
    assertFrame(durable.ok && durable.cached && f.children.length === 3, 'auth change must preserve immutable decodedframes')
    const aliasRoot = path.join(f.root, 'alias-output')
    await fs.symlink(f.outputRoot, aliasRoot, process.platform === 'win32' ? 'junction' : 'dir')
    opts.withRepoPythonPath = env => ({ ...env, FRAME_AUTH: 'physical-auth', FRAME_FIXTURE_MODE: 'normal' })
    aliasHandler = createRemoteVideoFrameHandler({ ...opts, cacheRoot: aliasRoot,
      withRepoPythonPath: env => ({ ...env, FRAME_AUTH: 'alias-auth', FRAME_FIXTURE_MODE: 'normal' }) })
    const physical = fetch(url(101)).then(response => response.json())
    await waitFrame(() => f.children.length === 4, 'physical output owner must start')
    const alias = fetch(url(101).replace('/__video_frame?', '/alias/__video_frame?')).then(response => response.json())
    const pair = await Promise.all([physical, alias])
    assertFrame(pair.every(result => result.ok) && pair[1].cached && f.children.length === 4,
      'distinctauth cachealiases must wait for one physical output owner without racing overwrite')
    await fs.writeFile(cookieFile, 'admitted-cookie-bytes')
    const cookieLog = path.join(f.root, 'cookie-observations')
    opts.withRepoPythonPath = env => ({ ...env, AG_VIDEO_FRAME_YTDLP_COOKIES: cookieFile, FRAME_COOKIE_LOG: cookieLog, FRAME_FIXTURE_MODE: 'normal' })
    f.setBeforeSpawn(() => writeFileSync(cookieFile, 'mutated-after-context-hash'))
    assertFrame((await (await fetch(url(8))).json() as { ok: boolean }).ok, 'immutable cookie snapshot fixture must render')
    f.setBeforeSpawn()
    const observation = JSON.parse((await fs.readFile(cookieLog, 'utf8')).trim()) as { bytes: string; path: string }
    assertFrame(observation.bytes === 'admitted-cookie-bytes' && observation.path !== cookieFile,
      'child credentials must use the immutable bytes bound to context despiteoriginalfile mutation')
    if (process.platform !== 'win32') assertFrame(((await fs.stat(observation.path)).mode & 0o077) === 0, 'cookie snapshot must remainprivate mode0600')
    const spawns = f.children.length
    await fs.writeFile(cookieFile, Buffer.alloc(256 * 1024 + 1))
    const oversized = await fetch(url(9))
    const error = await oversized.json() as { ok: boolean; error: string }
    assertFrame(oversized.status === 502 && !error.ok && error.error.includes('256KiB') && f.children.length === spawns,
      'oversized cookie snapshots must fail beforechildspawn')

  } finally { await closeFrameServer(server); await f.cleanup() }
}

export async function testVideoFrameRealPythonWorkerProtocol() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'video-frame-python-test-'))
  await fs.mkdir(path.join(root, 'output'))
  const outputRoot = await fs.realpath(path.join(root, 'output'))
  const sourceUrl = 'https://www.youtube.com/watch?v=protocolfixture'
  const outputPath = path.join(outputRoot, buildRemoteVideoFrameFileName({ sourceUrl, timeSeconds: 2.8, format: 'png' }))
  await fs.writeFile(outputPath, 'existing-decoded-frame')
  const pool = createVideoFrameWorkerPool({ deadlineMs: 5000 })
  try {
    const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
    const env = { ...process.env, PYTHONPATH: repoRoot + (process.env.PYTHONPATH ? path.delimiter + process.env.PYTHONPATH : '') }
    const result = await pool.request({ contextKey: 'real-python-protocol', sourceUrl, outputRoot, outputPath,
      privateRoot: path.join(root, 'private'), repoRoot, pythonBin: process.env.PYTHON || 'python3', env, timeSeconds: 2.8, format: 'png' })
    assertFrame(result.ok && result.cached && result.timeSeconds === 2.8, 'real Python worker must accept separate private inputs andfractional protocol fields: ' + JSON.stringify(result))
    const linkedRoot = path.join(root, 'linked-output')
    await fs.symlink(outputRoot, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir')
    const symlinkName = buildRemoteVideoFrameFileName({ sourceUrl, timeSeconds: 5, format: 'png' })
    const handler = createRemoteVideoFrameHandler({ repoRoot, workspaceRoot: root, cacheRoot: linkedRoot, workerPool: pool,
      getPythonBin: async () => { await fs.writeFile(path.join(outputRoot, symlinkName), 'prepared-frame'); return process.env.PYTHON || 'python3' },
      withRepoPythonPath: () => env })
    const server = createServer((req, res) => handler(req, res, error => { res.statusCode = 500; res.end(String(error)) }))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address() as { port: number }
      const response = await fetch(`http://127.0.0.1:${address.port}/__video_frame?url=${encodeURIComponent(sourceUrl)}&time=5&emit=json`)
      const body = await response.json() as { ok: boolean; cached: boolean }
      assertFrame(response.status === 200 && body.ok && body.cached, 'real Python result must support configured symlink cache roots')
    } finally { await closeFrameServer(server) }
  } finally { await pool.close(); await fs.rm(root, { recursive: true, force: true }) }
}

export async function testVideoFrameHandlerDeadlineEndsConnectedResponse() {
  const f = await createFrameFixture()
  const handler = createRemoteVideoFrameHandler({ repoRoot: f.root, workspaceRoot: f.root, cacheRoot: f.outputRoot,
    workerPool: f.pool, requestTimeoutMs: 30, getPythonBin: async () => { await pauseFrame(150); return process.execPath }, withRepoPythonPath: env => env })
  const server = createServer((req, res) => handler(req, res, error => { res.statusCode = 500; res.end(String(error)) }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address() as { port: number }
    const response = await fetch(`http://127.0.0.1:${address.port}/__video_frame?url=${encodeURIComponent('https://www.youtube.com/watch?v=deadlinefixture')}&time=1&emit=json`)
    const body = await response.json() as { ok: boolean; error: string }
    assertFrame(response.status === 504 && !body.ok && body.error.includes('deadline exceeded'), 'server deadline must end connected HTTP response with bounded error')
    await pauseFrame(170)
    assertFrame(f.children.length === 0, 'late startup resolution afterdeadline must not spawn a worker')
  } finally { await closeFrameServer(server); await f.cleanup() }
}

export async function testVideoFrameWindowsTreeCancellationAdapter() {
  for (const mode of ['success', 'failure', 'timeout']) {
    let command = '', argumentsSeen: string[] = [], killed = false
    const killer = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: () => { killed = true; return true } })
    const result = terminateVideoFrameWorkerTree({ pid: 42 } as ChildProcessWithoutNullStreams, 'win32', {
      systemRoot: 'C:\\Windows', timeoutMs: 20, spawnKiller: (executable, args) => {
        command = executable; argumentsSeen = args
        if (mode !== 'timeout') setTimeout(() => { killer.stderr.write('fixture native tree rejection'); killer.emit('close', mode === 'success' ? 0 : 1) }, 1)
        return killer as unknown as ChildProcessWithoutNullStreams
      },
    }).then(() => '', error => String(error))
    const error = await result
    assertFrame(command === path.win32.join('C:\\Windows', 'System32', 'taskkill.exe') && argumentsSeen.join(' ') === '/PID 42 /T /F', 'Windows tree adapter must target the ownedPID through absolute native taskkill')
    assertFrame(mode === 'success' ? !error : error.includes(mode === 'timeout' ? 'timed out' : 'native tree rejection'), 'Windows cancellation must report nativefailure andboundedtimeout')
    assertFrame(mode !== 'timeout' || killed, 'timed out native adapter must be stopped')
  }
}

export async function testVideoFrameSourceWorkerCleanupFailureRetainsBudget() {
  const f = await createFrameFixture(2000, 'normal', undefined, async () => { throw new Error('fixture cleanup denied') })
  try {
    assertFrame((await f.pool.request(f.request(2))).ok, 'cleanupfixture image should complete')
    await fs.writeFile(path.join(f.inputRoots[0]!, 'source.bin'), 'owned-source-input')
    await waitFrame(() => f.pool.inspect().lastError.includes('fixture cleanup denied'), 'idle cleanup failure must be reported')
    assertFrame(f.pool.inspect().workers === 1, 'cleanupfailure must retain sourcebudget')
    assertFrame(!!(await fs.stat(f.inputRoots[0]!).catch(() => null)), 'failedcleanup must retain exactowned inputs')
    const next = await f.pool.request(f.request(3, 'another-source'))
    assertFrame(next.ok !== true && next.error.includes('cleanup failed') && f.children.length === 1, 'pool must not create replacement workers aftercleanupfailure')
    const error = await f.pool.close().then(() => '', failure => String(failure))
    assertFrame(error.includes('fixture cleanup denied'), 'cleanupfailure must reject close without hanging')
    assertFrame(f.children[0]?.exitCode !== null || f.children[0]?.signalCode !== null, 'cleanup failure must follow actual childclose')
  } finally { await fs.rm(f.root, { recursive: true, force: true }) }
}
