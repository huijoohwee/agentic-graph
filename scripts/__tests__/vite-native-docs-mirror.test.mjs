import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { resolveAgenticCanvasOsDocsRoot } from '../../mcp/agentic-canvas-os-docs-runtime.js'

test('native docs stay readable after the Vite configuration runner closes', { timeout: 30_000 }, async () => {
  const graphRoot = fileURLToPath(new URL('../../', import.meta.url))
  const docsRoot = resolveAgenticCanvasOsDocsRoot({ rootDir: graphRoot })
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'graph-native-docs-'))
  const configFile = path.join(fixture, 'vite.config.mjs')
  const helper = fileURLToPath(new URL('../../canvas/viteWorkspaceMirrorReadRoots.ts', import.meta.url))
  let server
  try {
    await writeFile(configFile, `
import { readNativeWorkspaceDocs } from ${JSON.stringify(helper)}
export default {
  plugins: [{
    name: 'native-docs-request',
    configureServer(server) {
      server.middlewares.use(async (req, res) => {
        try {
          const files = await readNativeWorkspaceDocs(
            ${JSON.stringify(docsRoot)}, ${JSON.stringify(graphRoot)}, req.url === '/bounded' ? 1 : 500)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            names: files.map(file => file.relPath),
            preset: files.find(file => file.relPath === 'PROMPT-PRESETS.md')?.text,
            timestampsValid: files.every(file => Number.isInteger(file.updatedAtMs) && file.updatedAtMs > 0),
          }))
        } catch (error) {
          res.statusCode = 500
          res.end(String(error.message))
        }
      })
    },
  }],
}
`)
    server = await createServer({
      root: fixture, configFile, configLoader: 'runner', logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, hmr: false },
      optimizeDeps: { noDiscovery: true, include: [] },
    })
    await server.listen()
    const base = `http://127.0.0.1:${server.httpServer.address().port}`
    const response = await fetch(base, { signal: AbortSignal.timeout(10_000) })
    const body = await response.text()
    assert.equal(response.status, 200, body)
    const result = JSON.parse(body)
    assert(result.names.includes('DICTIONARY-COMMAND.md'))
    assert(result.names.includes('PROMPT-PRESETS.md'))
    assert.equal(result.preset, await readFile(path.resolve(docsRoot, '../../runtime/agents/docs/PROMPT-PRESETS.md'), 'utf8'))
    assert.equal(result.timestampsValid, true)
    const bounded = await fetch(`${base}/bounded`, { signal: AbortSignal.timeout(10_000) })
    assert.equal(bounded.status, 500)
    assert.match(await bounded.text(), /exceeds the requested file limit/)
  } finally {
    await server?.close()
    await rm(fixture, { recursive: true, force: true })
  }
})
