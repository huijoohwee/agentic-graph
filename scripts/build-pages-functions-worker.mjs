import { mkdtemp, copyFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const knowgrphRoot = path.resolve(scriptDir, '..')
const publishRoot = path.resolve(
  process.env.KNOWGRPH_PUBLISH_REPOSITORY_ROOT || path.resolve(knowgrphRoot, '..', 'huijoohwee'),
)
const outDir = await mkdtemp(path.join(os.tmpdir(), 'knowgrph-pages-functions-'))

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: publishRoot,
    stdio: 'inherit',
    shell: false,
    ...options,
  })
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

try {
  await rm(path.join(publishRoot, '_worker.js'), { force: true })
  await rm(path.join(publishRoot, '_routes.json'), { force: true })

  run('npx', [
    '--yes',
    'wrangler',
    'pages',
    'functions',
    'build',
    'functions',
    '--project-directory',
    '.',
    '--build-output-directory',
    '.',
    '--outdir',
    outDir,
    '--output-routes-path',
    path.join(outDir, '_routes.json'),
    '--minify',
  ])

  const outputFiles = await readdir(outDir)
  const workerFile = outputFiles.find(fileName => fileName === 'index.js')
    || outputFiles.find(fileName => fileName.endsWith('.js'))
  if (!workerFile) {
    throw new Error('Wrangler did not emit a Pages Functions worker script')
  }

  await copyFile(path.join(outDir, workerFile), path.join(publishRoot, '_worker.js'))
  await copyFile(path.join(outDir, '_routes.json'), path.join(publishRoot, '_routes.json'))
  console.log('[knowgrph] generated Cloudflare Pages Functions bundle in huijoohwee/_worker.js')
} finally {
  await rm(outDir, { recursive: true, force: true })
}
