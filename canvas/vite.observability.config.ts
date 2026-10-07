import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import nativeConfig from './vite.config'
import { createObservabilityBuildManifestPlugin } from './src/features/observability-workspace/buildManifest.mjs'
// The config runner is disposed before requests arrive. Native Node owns deferred archive/parser imports.
const { createObservabilityWorkspacePlugin, loadWorkspaceManifest } = createRequire(import.meta.url)('./src/features/observability-workspace/host.mjs')

const canvasRoot = path.dirname(fileURLToPath(import.meta.url)), graphRoot = path.resolve(canvasRoot, '..')
const git = (args: string[]) => execFileSync('git', args, { cwd: graphRoot, encoding: 'utf8', timeout: 5000, maxBuffer: 1000000 }).trim()

export default defineConfig(async environment => {
  const manifestFile = process.env.VITE_OBSERVABILITY_WORKSPACE_MANIFEST || ''
  const workspaceRoot = process.env.AGENTIC_WORKSPACE_ROOT || ''
  const allowMissingRepositories = environment.command === 'build'
  const workspace = loadWorkspaceManifest(manifestFile, workspaceRoot, { allowMissingRepositories })
  // Native resolution, compiler, worker, and styling owners are shared; host mutation/proxy plugins are deliberately not installed.
  const native = typeof nativeConfig === 'function' ? await nativeConfig(environment) : await nativeConfig
  const nativeAliases = Array.isArray(native.resolve.alias) ? native.resolve.alias : native.resolve.alias ?? []
  const nativeOutput = native.build?.rollupOptions?.output
  return {
    root: canvasRoot, base: './', publicDir: false,
    resolve: { ...native.resolve, alias: [
      { find: /^@\/hooks\/useGraphStore$/, replacement: path.join(canvasRoot, 'src/features/observability-workspace/readOnlyGraphCanvasStore.ts') },
      ...nativeAliases,
    ] }, esbuild: native.esbuild, define: native.define, worker: native.worker,
    optimizeDeps: { ...native.optimizeDeps, include: ['react', 'react-dom/client', 'd3', 'dagre'] },
    plugins: [react(), tailwindcss(), createObservabilityWorkspacePlugin({ manifestFile, workspaceRoot, graphRoot, allowMissingRepositories }),
      createObservabilityBuildManifestPlugin({ sourceRevision: git(['rev-parse', 'HEAD']),
        sourceDirty: Boolean(git(['status', '--porcelain', '--untracked-files=normal'])), workspaceManifestDigest: workspace.digest })],
    server: { host: '127.0.0.1', strictPort: true, headers: { 'Cache-Control': 'no-store' }, fs: { allow: [graphRoot] } },
    build: { ...native.build, outDir: path.join(canvasRoot, 'dist/observability'), emptyOutDir: true, sourcemap: false,
      rollupOptions: { ...native.build?.rollupOptions, input: path.join(canvasRoot, 'observability.html'), output: {
        ...(Array.isArray(nativeOutput) ? {} : nativeOutput ?? {}),
        manualChunks: (id, _meta) => {
          const moduleId = id.replace(/\\/g, '/')
          if (moduleId.endsWith('/canvas/src/lib/chatEndpoint.ts') || moduleId.endsWith('/canvas/src/lib/config.storyboard-widget.ts')) return 'graph-canvas-shared'
          if (moduleId.includes('/canvas/src/components/GraphCanvas/layout/')) return 'graph-canvas-layout'
          if (moduleId.includes('/canvas/src/components/GraphCanvas/layers/')) return 'graph-canvas-layers'
          if (moduleId.includes('/canvas/src/features/integrations/')) return 'graph-renderer-integrations'
          return undefined
        },
      } } },
  }
})
