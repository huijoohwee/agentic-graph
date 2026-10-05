import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import nativeConfig from './vite.config'
// The config runner is disposed before requests arrive. Native Node owns deferred archive/parser imports.
const { createObservabilityWorkspacePlugin, loadWorkspaceManifest } = createRequire(import.meta.url)('./src/features/observability-workspace/host.mjs')

const canvasRoot = path.dirname(fileURLToPath(import.meta.url)), graphRoot = path.resolve(canvasRoot, '..')
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const git = (args: string[]) => execFileSync('git', args, { cwd: graphRoot, encoding: 'utf8', timeout: 5000, maxBuffer: 1000000 }).trim()

function buildManifest(workspaceManifestDigest: string): Plugin {
  return { name: 'agentic-graph-observability-build', enforce: 'post', generateBundle(_options, bundle) {
    const outputs = Object.entries(bundle).map(([fileName, item]) => {
      const bytes = item.type === 'chunk' ? Buffer.from(item.code) : Buffer.from(item.source)
      return { path: fileName, bytes: bytes.length, sha256: digest(bytes) }
    }).sort((left, right) => left.path.localeCompare(right.path))
    const oversized = outputs.filter(output => output.bytes >= 500000)
    if (oversized.length) throw Error(`Observability chunks exceed 500000 bytes: ${oversized.map(output => `${output.path} (${output.bytes})`).join('; ')}`)
    this.emitFile({ type: 'asset', fileName: 'observability-build.json', source: JSON.stringify({
      schema: 'agentic-graph/observability-build/v1', sourceRevision: git(['rev-parse', 'HEAD']),
      sourceDirty: Boolean(git(['status', '--porcelain', '--untracked-files=normal'])),
      entry: 'observability.html', workspaceManifestDigest, outputs,
    }, null, 2) + '\n' })
  } }
}

export default defineConfig(async environment => {
  const manifestFile = process.env.VITE_OBSERVABILITY_WORKSPACE_MANIFEST || ''
  const workspaceRoot = process.env.AGENTIC_WORKSPACE_ROOT || ''
  const allowMissingRepositories = environment.command === 'build'
  const workspace = loadWorkspaceManifest(manifestFile, workspaceRoot, { allowMissingRepositories })
  // Native resolution, compiler, worker, and styling owners are shared; host mutation/proxy plugins are deliberately not installed.
  const native = typeof nativeConfig === 'function' ? await nativeConfig(environment) : await nativeConfig
  return {
    root: canvasRoot, base: './', publicDir: false,
    resolve: native.resolve, esbuild: native.esbuild, define: native.define, worker: native.worker,
    optimizeDeps: { ...native.optimizeDeps, include: ['react', 'react-dom/client', 'd3', 'dagre'] },
    plugins: [react(), tailwindcss(), createObservabilityWorkspacePlugin({ manifestFile, workspaceRoot, graphRoot, allowMissingRepositories }), buildManifest(workspace.digest)],
    server: { host: '127.0.0.1', strictPort: true, headers: { 'Cache-Control': 'no-store' }, fs: { allow: [graphRoot] } },
    build: { ...native.build, outDir: path.join(canvasRoot, 'dist/observability'), emptyOutDir: true, sourcemap: false,
      rollupOptions: { ...native.build?.rollupOptions, input: path.join(canvasRoot, 'observability.html') } },
  }
})
