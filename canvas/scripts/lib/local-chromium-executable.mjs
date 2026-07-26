import { accessSync, constants as fsConstants } from 'node:fs'

export function findLocalChromiumExecutable(explicitExecutable = '') {
  const candidates = [
    String(explicitExecutable || '').trim(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      accessSync(candidate, fsConstants.X_OK)
      return candidate
    } catch {
      // Playwright may still have a compatible bundled browser.
    }
  }
  return null
}
