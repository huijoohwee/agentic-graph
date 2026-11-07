import { deriveDesignRuntimeProfile } from 'grph-shared/ui/fontStacks'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { AG_TOKEN_DEFS, serializeKgTokens } from '@/lib/ui/tokens-ssot'

const args = process.argv.slice(2)
if (args.some(arg => !/^(?:--check|--format=(?:css|json|typescript)|--output=.+)$/.test(arg))) {
  throw new Error('Expected --check, --format=css|json|typescript and/or --output=<path>')
}
const format = args.find(arg => arg.startsWith('--format='))?.slice(9) as 'css' | 'json' | 'typescript' | undefined
const output = args.find(arg => arg.startsWith('--output='))?.slice(9)
// Complete validation and serialization before opening any output file.
const pin = JSON.parse(fs.readFileSync('../grph-shared/src/ui/graph-profile.pin.json', 'utf8'))
const sharedPin = JSON.parse(fs.readFileSync('src/styles/shared-ui-profile.pin.json', 'utf8'))
if (sharedPin.profile.owner !== pin.profile.owner || sharedPin.profile.sourceSha256 !== `sha256:${createHash('sha256').update(fs.readFileSync('../grph-shared/src/ui/shared-ui-profile.json')).digest('hex')}`) {
  throw new Error('Shared typography source differs from its central pin')
}
const runtimePath = '../grph-shared/src/ui/design-runtime-profile.json'
const runtime = JSON.stringify(deriveDesignRuntimeProfile(['graph', 'shared-ui'].map(id =>
  JSON.parse(fs.readFileSync(`../grph-shared/src/ui/${id}-profile.json`, 'utf8'))))) + '\n'
if (fs.readFileSync(runtimePath, 'utf8') !== runtime
  || pin.profile.runtimeSha256 !== `sha256:${createHash('sha256').update(runtime).digest('hex')}`) {
  throw new Error('Generated runtime projection differs from the pinned central profiles')
}
const projection = fs.readFileSync('src/styles/kgTokens.generated.css', 'utf8')
if (pin.profile.owner !== 'github.com/huijoohwee/agentic-design-system'
  || pin.profile.projectionSha256 !== `sha256:${createHash('sha256').update(projection).digest('hex')}`) {
  throw new Error('Central Graph projection differs from its immutable pin')
}
const next = format ? serializeKgTokens(AG_TOKEN_DEFS, format) : projection
const outPath = output ? path.resolve(output) : format ? null : path.resolve('src/styles/kgTokens.generated.css')
if (args.includes('--check')) {
  if (!outPath || fs.readFileSync(outPath, 'utf8') !== next) throw new Error('Generated token output differs from its source')
  process.stdout.write('Token output matches its source.\n')
} else if (!outPath) process.stdout.write(next)
else {
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const temporary = `${outPath}.tmp-${process.pid}`
  let created = false
  try {
    fs.writeFileSync(temporary, next, { encoding: 'utf8', flag: 'wx' }); created = true
    fs.renameSync(temporary, outPath); created = false
  } finally { if (created) fs.unlinkSync(temporary) }
  process.stdout.write(`${outPath}\n`)
}
