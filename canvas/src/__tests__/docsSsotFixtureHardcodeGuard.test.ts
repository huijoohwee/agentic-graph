import fs from 'node:fs'
import path from 'node:path'

import { DOCS_SSOT_VALIDATION_FIXTURE_BASENAME, readDocsSsotFixtureText } from '@/tests/lib/docsSsotFixture'

export async function testDocsSsotValidationFixtureForbidsHardcodedEndpointLiterals() {
  const fixtureText = readDocsSsotFixtureText(DOCS_SSOT_VALIDATION_FIXTURE_BASENAME)
  if (!fixtureText.trim()) {
    throw new Error('expected docs validation fixture text')
  }
  const forbiddenLiterals = [
    'http://localhost:8000/api/llm/chat/completions',
    'http://localhost:8001/api/llm/chat/completions',
    'https://abcxyz.trycloudflare.com/api/llm/chat/completions',
  ]
  const matched = forbiddenLiterals.filter((literal) => fixtureText.includes(literal))
  if (matched.length > 0) {
    throw new Error(
      `expected docs fixture to avoid hardcoded DeerFlow endpoint URLs; found: ${matched.join(', ')}`,
    )
  }
}

export async function testDocsSsotFixtureReadsCloudflareD1BackedRouteInsteadOfLocalDocsRoot() {
  const helperPath = path.resolve(process.cwd(), 'src', 'tests', 'lib', 'docsSsotFixture.ts')
  const helperText = fs.readFileSync(helperPath, 'utf8')
  const legacyRootTupleLiteral = `[${["'..'", "'..'", "'huijoohwee'", "'docs'"].join(', ')}]`
  const legacyRootEnvName = ['AG_TEST', 'DOCS_SSOT_ROOT'].join('_')
  const legacyAbsoluteRoot = [
    '',
    'Users',
    'huijoohwee',
    'Documents',
    'GitHub',
    'huijoohwee',
    'docs',
  ].join('/')
  const forbiddenLiterals = [
    legacyRootTupleLiteral,
    legacyRootEnvName,
    legacyAbsoluteRoot,
  ]
  const matched = forbiddenLiterals.filter((literal) => helperText.includes(literal))
  if (matched.length > 0) {
    throw new Error(
      `expected docs SSOT fixture helper to read the Cloudflare D1-backed storage route instead of a local docs root; found: ${matched.join(', ')}`,
    )
  }
  if (!helperText.includes('/api/storage/doc/')) {
    throw new Error('expected docs SSOT fixture helper to fetch from the D1-backed public storage document route')
  }

  const implementationRoots = [
    path.resolve(process.cwd(), 'src', 'components'),
    path.resolve(process.cwd(), 'src', 'features'),
    path.resolve(process.cwd(), 'src', 'hooks'),
    path.resolve(process.cwd(), 'src', 'lib'),
    path.resolve(process.cwd(), 'src', 'pages'),
  ]
  const implementationFiles: string[] = []
  const collectFiles = (dir: string) => {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        collectFiles(fullPath)
        continue
      }
      if (/\.(ts|tsx|js|jsx|json)$/.test(entry.name)) implementationFiles.push(fullPath)
    }
  }
  implementationRoots.forEach(collectFiles)
  const forbiddenPublishedFixtureNames = [
    'agenticgraph-video-demo.md',
    'agenticgraph-token-economics-model-demo.md',
  ]
  const hardcodedMatches = implementationFiles.flatMap((filePath) => {
    const text = fs.readFileSync(filePath, 'utf8')
    return forbiddenPublishedFixtureNames
      .filter(name => text.includes(name))
      .map(name => `${path.relative(process.cwd(), filePath)}:${name}`)
  })
  if (hardcodedMatches.length > 0) {
    throw new Error(
      `expected implementation source to keep published docs as external validation inputs instead of hardcoded runtime cases; found ${hardcodedMatches.join(', ')}`,
    )
  }
}
