import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

export const isDirectory = (p: string): boolean => {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

export const isFile = (p: string): boolean => {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

export const resolveExternalFixtureRoot = (): string | null => {
  const envRoot = String(process.env.AG_EXTERNAL_FIXTURE_ROOT || '').trim()
  if (!envRoot) return null
  const resolved = path.resolve(envRoot)
  return isDirectory(resolved) ? resolved : null
}

export const resolveExternalFixtureDemoDir = (): string | null => {
  const fixtureRoot = resolveExternalFixtureRoot()
  if (!fixtureRoot) return null
  const demoSubdir = String(process.env.AG_EXTERNAL_FIXTURE_DEMO_SUBDIR || '').trim() || 'demo'
  const demoDir = path.join(fixtureRoot, demoSubdir)
  return isDirectory(demoDir) ? demoDir : null
}

export const resolveExternalFixtureSubdir = (subdir: string): string | null => {
  const fixtureRoot = resolveExternalFixtureRoot()
  if (!fixtureRoot) return null
  const s = String(subdir || '').trim()
  if (!s) return null
  const p = path.join(fixtureRoot, s)
  return isDirectory(p) ? p : null
}

export const pickExternalFixtureMarkdownFile = (args: {
  preferBasename?: string
  predicate?: (text: string) => boolean
  envVarPathKey?: string
  subdirs?: string[]
}): string | null => {
  const envVarKey = String(args.envVarPathKey || '').trim()
  if (envVarKey) {
    const explicit = String(process.env[envVarKey] || '').trim()
    if (explicit && existsSync(explicit) && isFile(explicit)) return explicit
  }

  const subdirs = Array.isArray(args.subdirs) ? args.subdirs : []
  const dirs = subdirs
    .map(s => resolveExternalFixtureSubdir(s))
    .filter((p): p is string => !!p)

  const checkedFiles: string[] = []
  for (const dir of dirs) {
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      entries = []
    }
    for (const name of entries) {
      if (!name.toLowerCase().endsWith('.md')) continue
      const p = path.join(dir, name)
      if (isFile(p)) checkedFiles.push(p)
    }
  }

  const prefer = String(args.preferBasename || '').trim()
  if (prefer) {
    const match = checkedFiles.find(p => path.basename(p) === prefer)
    if (match) return match
  }

  if (typeof args.predicate === 'function') {
    for (const p of checkedFiles) {
      try {
        const text = readFileSync(p, 'utf8')
        if (args.predicate(text)) return p
      } catch {
        void 0
      }
    }
  }

  return checkedFiles[0] || null
}

export const pickExternalDemoMarkdownFile = (args: {
  preferBasename?: string
  predicate?: (text: string) => boolean
  envVarPathKey?: string
}): string | null => {
  const envVarKey = String(args.envVarPathKey || '').trim()
  if (envVarKey) {
    const explicit = String(process.env[envVarKey] || '').trim()
    if (explicit && existsSync(explicit) && isFile(explicit)) return explicit
  }

  const demoDir = resolveExternalFixtureDemoDir()
  if (!demoDir) return null

  let entries: string[] = []
  try {
    entries = readdirSync(demoDir)
  } catch {
    entries = []
  }

  const candidates = entries
    .filter(name => name.toLowerCase().endsWith('.md'))
    .map(name => path.join(demoDir, name))
    .filter(p => isFile(p))

  const prefer = String(args.preferBasename || '').trim()
  if (prefer) {
    const match = candidates.find(p => path.basename(p) === prefer)
    if (match) return match
  }

  if (typeof args.predicate === 'function') {
    for (const p of candidates) {
      try {
        const text = readFileSync(p, 'utf8')
        if (args.predicate(text)) return p
      } catch {
        void 0
      }
    }
  }

  return candidates[0] || null
}

export const readExternalDemoText = (args: {
  preferBasename?: string
  predicate?: (text: string) => boolean
  envVarPathKey?: string
}): { path: string; text: string } | null => {
  const p = pickExternalDemoMarkdownFile(args)
  if (!p) return null
  try {
    return { path: p, text: readFileSync(p, 'utf8') }
  } catch {
    return null
  }
}

export const toDocumentPath = (p: string): string => {
  const normalized = String(p || '').replace(/\\/g, '/').trim()
  if (!normalized) return ''
  if (/^https?:\/\//i.test(normalized)) return normalized

  const fixtureRoot = resolveExternalFixtureRoot()
  if (fixtureRoot) {
    const root = String(fixtureRoot || '').replace(/\\/g, '/').replace(/\/+$/, '')
    const rootName = path.basename(root) || 'external-fixtures'
    if (root && normalized.startsWith(root + '/')) {
      const rel = normalized.slice(root.length + 1).replace(/^\/+/, '').trim()
      if (rel) return `${rootName}/${rel}`
      return rootName
    }
  }

  return path.isAbsolute(normalized) ? path.basename(normalized) : normalized
}
