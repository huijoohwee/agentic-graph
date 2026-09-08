import { JSDOM } from 'jsdom'
import { LS_KEYS } from '@/lib/config.ls'
import { buildHtmlViewerRuntimeScript, type HtmlViewerRuntimeScriptArgs } from '@/lib/graph/htmlViewer/runtimeScript'
import { HTML_VIEWER_RUNTIME_FULL, HTML_VIEWER_RUNTIME_WITHOUT_3D_PAYLOAD, HTML_VIEWER_RUNTIME_INPUT_NAMES } from '@/lib/graph/htmlViewer/runtimeTemplate.compiled'

const runtimeArgs = (overrides: Partial<HtmlViewerRuntimeScriptArgs> = {}): HtmlViewerRuntimeScriptArgs => ({
  interactionCfgJson: '{}', mediaNodesJson: '[]', markdownBlocksJson: '[]',
  nodeLabelByIdJson: '{}', edgeMetaByIdJson: '{}', frontmatterVisibilityJson: '{"nodeIds":["n1"],"edgeIds":[]}',
  nodePosByIdJson: '{"n1":{"x":100,"y":100}}', groupMembersByIdJson: '{}',
  density: 'default', widthRatioDefault: 0.22, widthRatioCompact: 0.14,
  widthMinDefault: 220, widthMinCompact: 180, widthMaxDefault: 460, widthMaxCompact: 360,
  ...overrides,
})

const runRuntime = (args: HtmlViewerRuntimeScriptArgs) => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <main id="kg-root"><section id="kg-stage"><canvas id="kg-webgl"></canvas>
    <figure id="kg-svgWrap"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><g data-kg-layer="nodes"><circle data-node-id="n1" cx="100" cy="100" r="10" /></g></svg></figure></section>
    <section id="kg-overlay"></section><nav id="kg-hud"><button id="kg-fit">Fit</button><button id="kg-reset">Reset</button></nav>
    <article data-node-id="n2">hidden node</article></main><output id="kg-tooltip"></output>
    </body></html>`, { url: 'https://standalone.test/', runScripts: 'outside-only' })
  const win = dom.window
  const reads: string[] = []
  const requests: string[] = []
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 0
  win.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame }
  win.cancelAnimationFrame = id => { frames.delete(id) }
  const read = win.Storage.prototype.getItem
  win.Storage.prototype.getItem = function (key: string) { reads.push(key); return read.call(this, key) }
  Object.defineProperty(win, 'fetch', { value: async (url: unknown) => {
    requests.push(String(url)); return { ok: false, status: 404, json: async () => null }
  } })
  const root = win.document.getElementById('kg-root')!
  root.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 640, bottom: 480, width: 640, height: 480, toJSON: () => ({}) })
  try {
    win.eval(buildHtmlViewerRuntimeScript(args))
    for (let tick = 0; tick < 3; tick += 1) {
      const pending = [...frames.values()]; frames.clear()
      for (const callback of pending) callback(tick * 16)
    }
  } catch (error) { dom.window.close(); throw error }
  return { dom, reads, requests, close: () => { frames.clear(); dom.window.close() } }
}

export function testHtmlViewerRuntimeScriptReplacesProxyOriginPlaceholder() {
  const media = [{ id: 'n1', title: 'Preview', kind: 'image', url: 'https://media.test/preview.png', interactive: true }]
  const runtime = runRuntime(runtimeArgs({ allowRuntimeNetwork: true, proxyOrigin: 'http://localhost:5173', mediaNodesJson: JSON.stringify(media) }))
  try {
    const sources = [...runtime.dom.window.document.querySelectorAll('img')].map(image => image.getAttribute('src') || '')
    if (!sources.some(source => source.includes('media.test') || source.startsWith('http://localhost:5173/'))) {
      throw new Error(`Expected explicitly enabled media source to remain usable: ${JSON.stringify(sources)}`)
    }
    const script = buildHtmlViewerRuntimeScript(runtimeArgs({ allowRuntimeNetwork: true, proxyOrigin: 'http://localhost:5173' }))
    const input = readRuntimeInput(script, HTML_VIEWER_RUNTIME_FULL)
    if (input.proxyOrigin !== 'http://localhost:5173' || input.allowRuntimeNetwork !== true) throw new Error('Explicit network configuration changed across runtime compilation')
  } finally { runtime.close() }
}

export function testHtmlViewerRuntimeScriptDisablesNetworkByDefault() {
  for (const has3dPayload of [undefined, false]) {
    const runtime = runRuntime(runtimeArgs({ has3dPayload, initialFrontmatterEnabled: true,
      mediaNodesJson: JSON.stringify([{ id: 'n1', title: 'Remote preview', kind: 'image', url: 'https://media.test/preview.png', interactive: true }]),
    }))
    try {
      const remoteSources = [...runtime.dom.window.document.querySelectorAll('[src]')].map(element => element.getAttribute('src') || '').filter(source => /^https?:/i.test(source))
      if (runtime.requests.length || remoteSources.length) throw new Error(`Offline runtime attempted remote media: ${JSON.stringify({ requests: runtime.requests, remoteSources })}`)
      const hidden = runtime.dom.window.document.querySelector<HTMLElement>('[data-node-id="n2"]')
      if (hidden?.style.display !== 'none') throw new Error('Frontmatter filtering must include non-SVG nodes')
    } finally { runtime.close() }
  }
}

function readRuntimeInput(script: string, template: string): Record<string, unknown> {
  const [prefix, suffix] = template.split('__AG_FACTORY_INPUT__')
  if (prefix === undefined || suffix === undefined || !script.startsWith(prefix) || !script.endsWith(suffix)) throw new Error('Compiled runtime input boundary changed')
  const values = JSON.parse(script.slice(prefix.length, suffix.length ? -suffix.length : undefined)) as unknown[]
  return Object.fromEntries(HTML_VIEWER_RUNTIME_INPUT_NAMES.map((name, index) => [name, values[index]]))
}

export function testHtmlViewerRuntimePackagingPreservesDataAndCapability() {
  const text = '</script><script>window.injected=true</script> & > “多设备”\n__AG_FACTORY_INPUT__'
  const graphMetadata = { n1: { label: text, property: { exact: ['a  b', 0, false, null] } } }
  for (const has3dPayload of [undefined, true, false]) {
    const args = runtimeArgs({ has3dPayload, nodeLabelByIdJson: JSON.stringify(graphMetadata), markdownBlocksJson: JSON.stringify([{ id: 'n1', summary: text }]) })
    const output = buildHtmlViewerRuntimeScript(args)
    const template = has3dPayload === false ? HTML_VIEWER_RUNTIME_WITHOUT_3D_PAYLOAD : HTML_VIEWER_RUNTIME_FULL
    const input = readRuntimeInput(output, template)
    if (JSON.stringify(input.nodeLabelByIdJson) !== JSON.stringify(graphMetadata)) throw new Error('Graph metadata lost values during runtime packaging')
    if (JSON.stringify(input.markdownBlocksJson) !== args.markdownBlocksJson) throw new Error('Markdown data changed during runtime packaging')
    if (/<\/script/i.test(output)) throw new Error('Runtime data escaped the containing script')
    new Function(output)
  }
}

export function testHtmlViewerRuntimePackagingReadsCanonicalCacheKey() {
  for (const has3dPayload of [undefined, false]) {
    const runtime = runRuntime(runtimeArgs({ has3dPayload }))
    try {
      if (!runtime.reads.includes(LS_KEYS.renderRichMediaPanelMode)) throw new Error('Runtime did not read the canonical rich-media preference key')
      if (runtime.reads.includes(JSON.stringify(LS_KEYS.renderRichMediaPanelMode))) throw new Error('Runtime read a quoted preference key')
    } finally { runtime.close() }
  }
}

export async function testHtmlViewerRuntimeGeneratorPreservesOwnedBytes() {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const os = await import('node:os')
  const { pathToFileURL } = await import('node:url')
  const { execFileSync } = await import('node:child_process')
  const generator = await import(new URL('../../scripts/generate-html-viewer-runtime-template.mjs', import.meta.url).href)
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'html-runtime-owner-'))
  const target = pathToFileURL(path.join(dir, 'runtime.ts'))
  const temporary = new URL(`${target.href}.${process.pid}.tmp`)
  const rejects = async (action: () => Promise<unknown>) => {
    try { await action() } catch { return }
    throw new Error('Expected runtime publication boundary to reject')
  }
  try {
    if (!await generator.publishCompiledHtmlRuntime(target, 'first', '--write')) throw new Error('Missing first generated publication')
    const original = await fs.stat(target, { bigint: true })
    if (await generator.publishCompiledHtmlRuntime(target, 'first', '--write')) throw new Error('Unchanged generation rewrote the artifact')
    if ((await fs.stat(target, { bigint: true })).mtimeNs !== original.mtimeNs) throw new Error('Unchanged generation modified artifact time')
    await rejects(() => generator.publishCompiledHtmlRuntime(target, 'stale', '--check'))
    if (await fs.readFile(target, 'utf8') !== 'first') throw new Error('Check mode changed generated bytes')
    const lock = new URL(`${target.href}.lock`)
    await generator.withRuntimePublicationLock(target, async () => {
      await rejects(() => generator.publishCompiledHtmlRuntime(target, 'competitor', '--write'))
      if (await generator.publishCompiledHtmlRuntime(target, 'first', '--check')) throw new Error('Read-only verification unexpectedly wrote')
      if (await fs.readFile(target, 'utf8') !== 'first') throw new Error('Competing writer bypassed exclusive publication lock')
    })
    if ((await fs.readdir(dir)).includes('runtime.ts.lock')) throw new Error('Successful publication retained its lock')
    const cause = new Error('original publication failure')
    let rejected: unknown
    try { await generator.withRuntimePublicationLock(target, async () => { throw cause }) } catch (error) { rejected = error }
    if (rejected !== cause || (await fs.readdir(dir)).includes('runtime.ts.lock')) throw new Error('Failure did not preserve cause and release unchanged lock')
    try {
      await generator.withRuntimePublicationLock(target, async () => {
        await fs.writeFile(lock, 'unexpected owner bytes')
        throw cause
      })
    } catch (error) { rejected = error }
    if (!(rejected instanceof AggregateError) || !rejected.errors.includes(cause) || !String(rejected.message).includes('runtime.ts.lock')) throw new Error('Changed-lock diagnostic lost path or original cause')
    if (await fs.readFile(lock, 'utf8') !== 'unexpected owner bytes') throw new Error('Cleanup removed changed lock bytes')
    await fs.unlink(lock)
    await fs.writeFile(temporary, 'another writer', { flag: 'wx' })
    await rejects(() => generator.publishCompiledHtmlRuntime(target, 'next', '--write'))
    if (await fs.readFile(temporary, 'utf8') !== 'another writer' || await fs.readFile(target, 'utf8') !== 'first') throw new Error('Publication disturbed a preexisting temporary owner')
    await fs.unlink(temporary)
    await fs.writeFile(temporary, 'owned', { flag: 'wx', mode: 0o600 })
    let owned = await generator.observeCompiledRuntime(temporary)
    await fs.writeFile(temporary, 'other')
    if (await generator.removeOwnedRuntimeTemporary(temporary, owned)) throw new Error('Cleanup removed in-place modified bytes')
    if (await fs.readFile(temporary, 'utf8') !== 'other') throw new Error('Cleanup lost unexpected temporary bytes')
    owned = await generator.observeCompiledRuntime(temporary)
    await fs.chmod(temporary, 0o644)
    if (await generator.removeOwnedRuntimeTemporary(temporary, owned)) throw new Error('Cleanup removed a changed file mode/version')
    owned = await generator.observeCompiledRuntime(temporary)
    if (!await generator.removeOwnedRuntimeTemporary(temporary, owned)) throw new Error('Cleanup did not release its unchanged owned version')
    await fs.symlink(path.join(dir, 'runtime.ts'), temporary)
    await rejects(() => generator.observeCompiledRuntime(temporary))
    await fs.unlink(temporary)
    if (process.platform !== 'win32') {
      const fifo = path.join(dir, 'runtime-fifo')
      execFileSync('mkfifo', [fifo])
      await rejects(() => generator.observeCompiledRuntime(pathToFileURL(fifo)))
    }
  } finally { await fs.rm(dir, { recursive: true, force: true }) }
}
