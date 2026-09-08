import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { transformWithEsbuild } from 'vite'
import ts from 'typescript'
import {
  buildHtmlViewerRuntimeFactorySource,
  HTML_VIEWER_RUNTIME_INPUTS,
} from '../src/lib/graph/htmlViewer/runtimeTemplateSource.ts'

const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino && a.nlink === b.nlink
const sameVersion = (a, b) => sameIdentity(a, b) && a.mode === b.mode && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs

export async function observeCompiledRuntime(outputUrl) {
  let handle
  try {
    handle = await fs.open(outputUrl, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const before = await handle.stat({ bigint: true })
    if (!before.isFile() || before.nlink !== 1n) throw new Error('Compiled runtime target must be one regular file')
    const bytes = await handle.readFile()
    const after = await handle.stat({ bigint: true })
    const named = await fs.lstat(outputUrl, { bigint: true })
    if (!sameVersion(before, after) || !named.isFile() || !sameVersion(after, named)) throw new Error('Compiled runtime target changed during observation')
    return { stat: after, bytes }
  } catch (error) {
    if (!handle && error.code === 'ENOENT') return null
    throw error
  } finally { await handle?.close() }
}

export async function removeOwnedRuntimeTemporary(temporaryUrl, ownedVersion) {
  const current = await observeCompiledRuntime(temporaryUrl)
  if (!current || !sameVersion(ownedVersion.stat, current.stat) || !ownedVersion.bytes.equals(current.bytes)) return false
  await fs.unlink(temporaryUrl)
  return true
}

async function releaseOwnedFile(handle, url, ownedVersion, originalError, published = false) {
  const errors = []
  try { await handle?.close() } catch (error) { errors.push(error) }
  if (handle && !published) {
    try {
      if (!ownedVersion || !await removeOwnedRuntimeTemporary(url, ownedVersion)) {
        errors.push(new Error(`Retained changed or uncertain runtime file: ${fileURLToPath(url)}`))
      }
    } catch (error) {
      errors.push(new Error(`Retained runtime file after cleanup failure: ${fileURLToPath(url)}`, { cause: error }))
    }
  }
  if (errors.length) throw new AggregateError(originalError ? [originalError, ...errors] : errors,
    [originalError?.message, ...errors.map(error => error.message)].filter(Boolean).join('; '), { cause: originalError })
}

// Serialize cooperating publishers only; unknown/preexisting locks are never stolen.
export async function withRuntimePublicationLock(outputUrl, action) {
  const lockUrl = new URL(`${outputUrl.href}.lock`)
  let handle
  let ownedVersion
  let originalError
  try {
    handle = await fs.open(lockUrl, 'wx+', 0o600)
    ownedVersion = { stat: await handle.stat({ bigint: true }), bytes: Buffer.alloc(0) }
    return await action()
  } catch (error) { originalError = error; throw error }
  finally { await releaseOwnedFile(handle, lockUrl, ownedVersion, originalError) }
}

export async function publishCompiledHtmlRuntime(outputUrl, output, mode = '--check') {
  if (mode !== '--write' && mode !== '--check') throw new Error('Expected --write or --check')
  const expectedBytes = Buffer.from(output, 'utf8')
  const publish = async () => {
    const existing = await observeCompiledRuntime(outputUrl)
    if (existing?.bytes.equals(expectedBytes)) return false
    if (mode === '--check') throw new Error('Compiled HTML runtime is stale; run npm run prepare:html-viewer-runtime')
    const temporaryUrl = new URL(`${outputUrl.href}.${process.pid}.tmp`)
    let handle
    let ownedVersion
    let published = false
    let originalError
    try {
      handle = await fs.open(temporaryUrl, 'wx+', 0o600)
      ownedVersion = { stat: await handle.stat({ bigint: true }), bytes: Buffer.alloc(0) }
      await handle.writeFile(expectedBytes)
      const written = await observeCompiledRuntime(temporaryUrl)
      if (!written || !sameIdentity(ownedVersion.stat, written.stat) || !written.bytes.equals(expectedBytes)) throw new Error('Compiled runtime temporary bytes changed during write')
      // Capture completed owned bytes before sync, so a sync failure can release them.
      ownedVersion = written
      await handle.sync()
      const current = await observeCompiledRuntime(outputUrl)
      if (existing ? !current || !sameVersion(existing.stat, current.stat) || !existing.bytes.equals(current.bytes) : current !== null) throw new Error('Compiled runtime target changed before publication')
      const verified = await observeCompiledRuntime(temporaryUrl)
      if (!verified || !sameVersion(ownedVersion.stat, verified.stat) || !verified.bytes.equals(expectedBytes)) throw new Error('Compiled runtime temporary ownership changed')
      await fs.rename(temporaryUrl, outputUrl)
      published = true
      return true
    } catch (error) { originalError = error; throw error }
    finally { await releaseOwnedFile(handle, temporaryUrl, ownedVersion, originalError, published) }
  }
  return mode === '--write' ? withRuntimePublicationLock(outputUrl, publish) : publish()
}

async function main() {
  const outputUrl = new URL('../src/lib/graph/htmlViewer/runtimeTemplate.compiled.ts', import.meta.url)
  const sourceUrl = new URL('../src/lib/graph/htmlViewer/runtimeTemplateSource.ts', import.meta.url)
  const mode = process.argv[2] || '--check'
  if (mode !== '--write' && mode !== '--check') throw new Error('Expected --write or --check')

  const source = `${buildHtmlViewerRuntimeFactorySource()}\n__AG_HTML_VIEWER_RUNTIME__(__AG_FACTORY_INPUT__);`
  const without3dSource = () => {
    const parsed = ts.createSourceFile('html-viewer-runtime.js', source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
    if (parsed.parseDiagnostics.length) throw new Error('Patched HTML runtime has syntax errors')
    const replacements = []
    const returns = new Map([['install3dCanvasRendererOnce', 'false'], ['install3dSvgAnimatorOnce', '']])
    const visit = node => {
      if (ts.isFunctionDeclaration(node) && node.name && returns.has(node.name.text)) {
        if (!node.body) throw new Error(`Missing installer body: ${node.name.text}`)
        replacements.push({ name: node.name.text, start: node.body.getStart(parsed), end: node.body.end, body: `{return ${returns.get(node.name.text)};}` })
      }
      ts.forEachChild(node, visit)
    }
    visit(parsed)
    if (replacements.length !== 2 || new Set(replacements.map(item => item.name)).size !== 2) {
      throw new Error('Expected exactly one of each 3D runtime installer')
    }
    // Payload-absent exports already return false/undefined from these installers.
    // Keep those call contracts; remove only their unreachable implementation.
    return replacements.sort((a, b) => b.start - a.start).reduce((text, item) => text.slice(0, item.start) + item.body + text.slice(item.end), source)
  }
  const compile = async (include3d) => {
    const result = await transformWithEsbuild(include3d ? source : without3dSource(), fileURLToPath(sourceUrl).replace(/\.ts$/, '.js'), {
      loader: 'js', target: 'es2020', minify: true, treeShaking: true, sourcemap: false,
      legalComments: 'none',
    })
    if (result.warnings.length) throw new Error(`Runtime compiler warnings: ${JSON.stringify(result.warnings)}`)
    if (result.code.split('__AG_FACTORY_INPUT__').length !== 2) throw new Error('Runtime compiler did not preserve its single input boundary')
    new Function(result.code)
    return result.code.trim()
  }
  const [full, without3d] = await Promise.all([compile(true), compile(false)])
  const sourceHash = createHash('sha256').update(source).digest('hex')
  const output = [
    '// Generated by scripts/generate-html-viewer-runtime-template.mjs; do not edit.',
    `// Patched runtime source SHA-256: ${sourceHash}`,
    `export const HTML_VIEWER_RUNTIME_INPUT_NAMES = ${JSON.stringify(Object.values(HTML_VIEWER_RUNTIME_INPUTS))} as const`,
    `export const HTML_VIEWER_RUNTIME_FULL = ${JSON.stringify(full)}`,
    `export const HTML_VIEWER_RUNTIME_WITHOUT_3D_PAYLOAD = ${JSON.stringify(without3d)}`,
    '',
  ].join('\n')
  if (Buffer.byteLength(output, 'utf8') >= 500_000) throw new Error('Compiled runtime module exceeds 500000 bytes')
  const changed = await publishCompiledHtmlRuntime(outputUrl, output, mode)
  process.stdout.write(`HTML runtime ${mode === '--check' ? 'verified' : changed ? 'generated' : 'unchanged'}: full=${Buffer.byteLength(full)} without3d=${Buffer.byteLength(without3d)} module=${Buffer.byteLength(output)} bytes\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) await main()
