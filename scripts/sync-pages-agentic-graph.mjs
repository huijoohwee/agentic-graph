import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { runPagesMirrorSync } from './pages-mirror-sync.mjs'

export { runPagesMirrorSync } from './pages-mirror-sync.mjs'

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runPagesMirrorSync({ checkMode: process.argv.includes('--check') })
}
