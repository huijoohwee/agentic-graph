import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testMonacoEditorUsesStableTextareaInputOwner() {
  const source = readFileSync(
    resolve(process.cwd(), 'src', 'lib', 'monaco', 'MonacoTextEditor.impl.tsx'),
    'utf8',
  )
  if (!source.includes('editContext: false')) {
    throw new Error('expected Monaco to keep the stable textarea input owner instead of the experimental native EditContext')
  }
}
