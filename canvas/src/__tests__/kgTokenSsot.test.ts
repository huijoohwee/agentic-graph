import fs from 'node:fs'
import path from 'node:path'

import { AG_TOKEN_DEFS, extractKgCssVarsFromCssText } from '@/lib/ui/tokens-ssot'

const readUtf8 = (absPath: string): string => {
  return fs.readFileSync(absPath, { encoding: 'utf8' })
}

export const testKgTokenSsotIndexCssDefinesAllVars = () => {
  const root = process.cwd()
  const cssPath = path.resolve(root, 'src', 'index.css')
  const cssText = readUtf8(cssPath)
  const vars = extractKgCssVarsFromCssText(cssText)
  for (let i = 0; i < AG_TOKEN_DEFS.length; i += 1) {
    const cssVar = AG_TOKEN_DEFS[i].cssVar
    if (!vars.has(cssVar)) {
      throw new Error(`Expected index.css to define ${cssVar}`)
    }
  }
}

