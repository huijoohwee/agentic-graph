import { randomUUID, createHash } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MANIFEST = 'observability-build.json'
const MAX_ASSET_BYTES = 500_000
const MAX_OUTPUTS = 128
const MAX_TOTAL_BYTES = 16_000_000
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = message => { throw new Error(`Observability build manifest: ${message}`) }

function isInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function safeOutputPath(fileName) {
  if (typeof fileName !== 'string' || !fileName || fileName.includes('\\') || path.isAbsolute(fileName)
    || fileName.split('/').some(segment => !segment || segment === '.' || segment === '..'))
    fail(`invalid output path: ${String(fileName)}`)
  return fileName
}

export function createObservabilityBuildManifestPlugin({ sourceRevision, sourceDirty, workspaceManifestDigest }) {
  let outputPaths = []
  return {
    name: 'agentic-graph-observability-build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      outputPaths = Object.keys(bundle).filter(fileName => fileName !== MANIFEST).map(safeOutputPath).sort()
      if (!outputPaths.length || outputPaths.length > MAX_OUTPUTS) fail('output count is outside the supported bound')
    },
    async writeBundle(options) {
      if (typeof options.dir !== 'string' || !options.dir) fail('Vite output directory is unavailable')
      const outputRoot = await realpath(options.dir)
      const outputs = []
      let totalBytes = 0
      for (const fileName of outputPaths) {
        const filePath = path.resolve(outputRoot, fileName)
        if (!isInside(outputRoot, filePath)) fail(`output escapes the build directory: ${fileName}`)
        const link = await lstat(filePath)
        if (link.isSymbolicLink() || !link.isFile()) fail(`output is not a regular file: ${fileName}`)
        const resolvedFile = await realpath(filePath)
        if (!isInside(outputRoot, resolvedFile)) fail(`output resolves outside the build directory: ${fileName}`)
        const metadata = await stat(resolvedFile)
        const bytes = await readFile(resolvedFile)
        if (metadata.size !== bytes.length || bytes.length < 1 || bytes.length >= MAX_ASSET_BYTES)
          fail(`output is empty, changed during read, or exceeds ${MAX_ASSET_BYTES} bytes: ${fileName}`)
        totalBytes += bytes.length
        if (totalBytes > MAX_TOTAL_BYTES) fail(`output exceeds ${MAX_TOTAL_BYTES} total bytes`)
        outputs.push({ path: fileName, bytes: bytes.length, sha256: sha256(bytes) })
      }

      const manifest = {
        schema: 'agentic-graph/observability-build/v1',
        sourceRevision,
        sourceDirty,
        entry: 'observability.html',
        workspaceManifestDigest,
        outputs,
      }
      const temporary = path.join(outputRoot, `${MANIFEST}.${randomUUID()}.tmp`)
      try {
        await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
        await rename(temporary, path.join(outputRoot, MANIFEST))
      } finally {
        await rm(temporary, { force: true })
      }
    },
  }
}
