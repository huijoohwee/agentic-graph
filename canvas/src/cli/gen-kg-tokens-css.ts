import fs from 'node:fs'
import path from 'node:path'
import { AG_TOKEN_DEFS, buildKgTokensCssText, serializeKgTokens } from '@/lib/ui/tokens-ssot'

const args = process.argv.slice(2)
if (args.some(arg => !/^(?:--check|--format=(?:css|json|typescript)|--output=.+)$/.test(arg))) {
  throw new Error('Expected --check, --format=css|json|typescript and/or --output=<path>')
}
const format = args.find(arg => arg.startsWith('--format='))?.slice(9) as 'css' | 'json' | 'typescript' | undefined
const output = args.find(arg => arg.startsWith('--output='))?.slice(9)
// Complete validation and serialization before opening any output file.
const next = format ? serializeKgTokens(AG_TOKEN_DEFS, format) : [
  buildKgTokensCssText('light', { selector: ':root' }),
  buildKgTokensCssText('dark', { selector: ":root[data-theme='dark']" }),
].join('\n')
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
