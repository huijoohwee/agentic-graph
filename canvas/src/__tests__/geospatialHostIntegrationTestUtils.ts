import fs from 'node:fs'

export const readUtf8 = (absolutePath: string): string => {
  return fs.readFileSync(absolutePath, { encoding: 'utf8' })
}

export function assertTextIncludes(text: string, fragment: string, message: string): void {
  if (!text.includes(fragment)) throw new Error(message)
}
