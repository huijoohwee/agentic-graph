import fs from 'node:fs'

export const readUtf8 = (absolutePath: string): string => {
  return fs.readFileSync(absolutePath, { encoding: 'utf8' })
}
