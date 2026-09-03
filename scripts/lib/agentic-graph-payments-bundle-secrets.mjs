import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs'
import path from 'node:path'

export const PAYMENT_SECRET_VALUE_PATTERNS = [
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  /\bwhsec_[A-Za-z0-9]{16,}\b/g,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
]

const uniqueSorted = values => [...new Set(values)].sort()

const listTextFiles = directory => {
  if (!existsSync(directory)) return []
  const files = []
  const visit = currentDirectory => {
    for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
      const absolutePath = path.join(currentDirectory, entry.name)
      if (entry.isDirectory()) visit(absolutePath)
      else if (entry.isFile() && /\.(?:css|html|js|json|map|mjs|txt)$/i.test(entry.name)) {
        files.push(absolutePath)
      }
    }
  }
  visit(directory)
  return files.sort()
}

const addCheck = (checks, id, status, detail, evidence = []) => {
  checks.push({ id, status, detail, evidence })
}

export const inspectAgenticGraphPaymentsClientBundleSecrets = (
  checks,
  root,
  checkId = 'client-bundle-secret-values',
) => {
  const bundleFiles = listTextFiles(path.join(root, 'canvas/dist'))
  if (bundleFiles.length === 0) {
    addCheck(
      checks,
      checkId,
      'fail',
      'canvas/dist is absent; the local VCC preparation must build it before leakage inspection.',
    )
    return
  }
  const leaks = []
  for (const bundleFile of bundleFiles) {
    const source = readFileSync(bundleFile, 'utf8')
    for (const pattern of PAYMENT_SECRET_VALUE_PATTERNS) {
      pattern.lastIndex = 0
      if (pattern.test(source)) leaks.push(path.relative(root, bundleFile))
    }
  }
  addCheck(
    checks,
    checkId,
    leaks.length === 0 ? 'pass' : 'fail',
    leaks.length === 0
      ? `Scanned ${bundleFiles.length} built client files with no payment secret value pattern present.`
      : `Payment secret value patterns appear in the built client: ${uniqueSorted(leaks).join(', ')}`,
    leaks.length === 0 ? ['canvas/dist'] : uniqueSorted(leaks),
  )
}
