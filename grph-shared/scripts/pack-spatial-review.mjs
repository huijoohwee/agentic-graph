/** Build a narrow consumer artifact from the same source used by grph-shared/spatial-review. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const destination = process.argv[2]
if (!destination) throw new Error('Pass an explicit archive output directory.')
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
if (git(['status', '--porcelain', '--untracked-files=normal'])) throw new Error('Package projection requires a clean committed source.')
const revision = git(['rev-parse', 'HEAD'])
const source = readFileSync(resolve(root, 'grph-shared/src/spatial-review/index.ts'))
execFileSync('npm', ['--prefix', 'grph-shared', 'run', 'build'], { cwd: root, stdio: 'inherit' })
const staging = mkdtempSync(resolve(tmpdir(), 'agentic-graph-spatial-review-'))
for (const file of ['index.js', 'index.d.ts']) copyFileSync(resolve(root, 'grph-shared/dist/spatial-review', file), resolve(staging, file))
writeFileSync(resolve(staging, 'package.json'), JSON.stringify({
  name: '@agentic-graph/spatial-review', version: '0.1.0', private: true, type: 'module',
  description: 'Internal projection of the Graph-owned pure spatial review policy.',
  exports: { '.': { types: './index.d.ts', import: './index.js', default: './index.js' } },
  files: ['index.js', 'index.d.ts'],
  source: { repository: 'github.com/huijoohwee/agentic-graph', revision,
    path: 'grph-shared/src/spatial-review/index.ts', sha256: createHash('sha256').update(source).digest('hex') },
}, null, 2) + '\n')
mkdirSync(resolve(destination), { recursive: true })
execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', resolve(destination)], { cwd: staging, stdio: 'inherit' })
