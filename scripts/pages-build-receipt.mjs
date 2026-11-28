import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { lstat, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

async function outputDigest(directory) {
  if (!(await lstat(directory)).isDirectory()) throw new Error('Missing Pages output directory')
  if (!(await lstat(join(directory, 'index.html'))).isFile()) throw new Error('Missing Pages entry point')
  const hash = createHash('sha256')
  async function visit(parent) {
    const entries = await readdir(join(directory, parent), { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const path = join(parent, entry.name)
      if (entry.isDirectory()) {
        await visit(path)
      } else {
        if (!entry.isFile()) throw new Error('Unexpected Pages output type: ' + path)
        const file = createHash('sha256')
        for await (const bytes of createReadStream(join(directory, path))) file.update(bytes)
        hash.update(JSON.stringify([path, file.digest('hex')]) + '\n')
      }
    }
  }
  await visit('')
  return hash.digest('hex')
}

function buildContext(root, env) {
  if (env.GITHUB_ACTIONS !== 'true' || !env.RUNNER_TEMP || !env.AGENTIC_OS_CI_SOURCE_EVIDENCE_DIR ||
      !env.GITHUB_JOB || !/^\d+$/.test(env.GITHUB_RUN_ID ?? '') || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? '')) return null
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const [revision, tree] = git('rev-parse', 'HEAD', 'HEAD^{tree}').split('\n')
  if (revision !== env.GITHUB_SHA || git('status', '--porcelain')) return null
  return {
    path: join(env.RUNNER_TEMP, 'graph-pages-build-receipt.json'),
    output: join(root, 'canvas', 'dist'),
    identity: JSON.stringify([root, revision, tree, env.AGENTIC_OS_SOURCE_REVISION, env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT, env.GITHUB_JOB]),
  }
}

// Called only after both the application and observability builds have succeeded.
export async function recordPagesBuild(root, env = process.env) {
  const context = buildContext(root, env)
  if (!context) return
  const digest = await outputDigest(context.output)
  const temporary = context.path + '.' + randomUUID()
  await writeFile(temporary, JSON.stringify({ identity: context.identity, digest }), { flag: 'wx', mode: 0o600 })
  await rename(temporary, context.path)
}

export async function matchesPagesBuild(root, env = process.env) {
  const context = buildContext(root, env)
  if (!context) return false
  try {
    const receipt = JSON.parse(await readFile(context.path, 'utf8'))
    return receipt.identity === context.identity && receipt.digest === await outputDigest(context.output)
  } catch {
    return false
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await recordPagesBuild(process.cwd())
}
