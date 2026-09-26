import { build, loadConfigFromFile } from 'vite'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile, rm, mkdir, symlink, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const canvas = fileURLToPath(new URL('../', import.meta.url)), repo = resolve(canvas, '..')
const output = resolve(process.env.GRAPH_CANVAS_OUTPUT || join(canvas, 'dist/learning-canvas'))
const scratch = await mkdtemp(join(tmpdir(), 'graph-learning-canvas-'))
const revision = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
try {
  process.env.NODE_ENV = 'production'
  await symlink(join(repo, 'node_modules'), join(scratch, 'node_modules'), 'dir')
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, join(canvas, 'vite.config.ts'), canvas, undefined, undefined, 'runner')
  if (!loaded) throw new Error('Graph build configuration unavailable')
  const config = loaded.config
  // Retain Graph aliases and JSX compilation; this entry has no app shell or service worker.
  const plugins = (await Promise.all(config.plugins.flat(Infinity))).filter(p => p &&
    ['vite:react-babel', 'vite:react-refresh', '@tailwindcss/vite:scan', '@tailwindcss/vite:generate:build'].includes(p.name))
  await writeFile(join(scratch, 'entry.jsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import LearningCanvasEmbed from '${join(canvas, 'src/features/python-learning/LearningCanvasEmbed.tsx')}';createRoot(document.getElementById('root')).render(<LearningCanvasEmbed/>);`)
  await writeFile(join(scratch, 'index.html'), '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="./entry.jsx"></script></body></html>')
  await build({ ...config, configFile: false, root: scratch, publicDir: false, plugins,
    base: '/gamexr/graph-canvas/', build: { outDir: output, emptyOutDir: true, rollupOptions: { output: { manualChunks(id) {
      if (id.includes('/three/src/renderers/shaders/') && id.endsWith('.glsl.js')) return 'three-shaders'
      if (id.includes('/three/src/math/') || id.endsWith('/three/src/constants.js')) return 'three-math'
      if (id.includes('/node_modules/three/')) return 'three'
      if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) return 'react'
    } } } } })
  for (const file of await readdir(join(output, 'assets'))) {
    if ((await stat(join(output, 'assets', file))).size >= 500000) throw new Error(`Canvas chunk exceeds 500 kB: ${file}`)
  }
  await mkdir(output, { recursive: true })
  await writeFile(join(output, 'graph-canvas-manifest.json'), JSON.stringify({
    schema: 'agentic-graph/learning-canvas-artifact/v1', sourceRevision: revision, sourceDirty: Boolean(execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf8' }).trim()),
    protocol: 'agentic-graph/learning-canvas/v1', entry: 'index.html', base: '/gamexr/graph-canvas/',
  }, null, 2) + '\n')
  console.log(`Graph Canvas artifact: ${output}`)
} finally { await rm(scratch, { recursive: true, force: true }) }
