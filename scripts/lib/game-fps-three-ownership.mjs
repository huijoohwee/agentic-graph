import ts from 'typescript'

export const THREE_PRESENTATION_PATTERN = /@react-three\/fiber|from\s+['"]three(?:\/|['"])|<(?:Canvas|primitive|group|mesh|ambientLight|directionalLight|hemisphereLight|pointLight|spotLight|Environment|Sky|Stars|[A-Za-z][A-Za-z0-9]*Geometry)\b/
const GAME_AWARE_PATTERN = /\b(?:GameFpsMissionStage|gameFpsActive|gameMode\.active|readGameModeSnapshot|subscribeGameModeSnapshot)\b|from\s+['"][^'"]*(?:features\/game-fps|\/game-fps\/|\.\/game(?:Fps|Mode))/
const ACTOR_FILES = ['GameFpsMissionStage.tsx', 'GameFpsSharedNpcHighlights.tsx']
const XR_HOST = 'canvas/src/features/three/XrNativeControllerDemoStage.tsx'

const assertExact = (actual, expected, label) => {
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label}: received ${actual.join(', ')}`)
  }
}

const jsxTags = (name, source) => {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  if (file.parseDiagnostics.length) throw new Error(`${name} contains invalid TSX`)
  const tags = []
  const visit = node => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) tags.push(node.tagName.getText(file))
    ts.forEachChild(node, visit)
  }
  visit(file)
  return tags
}

const assertInactiveHostProjection = source => {
  const file = ts.createSourceFile(XR_HOST, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const spans = [], bindings = [], mounts = []
  const visit = node => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.text?.includes('/game-fps/')) {
      const clause = node.importClause, named = clause?.namedBindings
      if (node.moduleSpecifier.text !== '@/features/game-fps/GameFpsSharedNpcHighlights'
        || !clause || clause.name || clause.isTypeOnly || !named || !ts.isNamedImports(named)
        || named.elements.length !== 1 || named.elements[0].name.text !== 'GameFpsSharedNpcHighlights'
        || named.elements[0].propertyName || named.elements[0].isTypeOnly) {
        throw new Error('Native XR host may import only the read-only NPC highlight projection')
      }
      bindings.push(named.elements[0].name.text)
      spans.push([node.getStart(file), node.end])
    }
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === 'GameFpsSharedNpcHighlights') {
      mounts.push(node)
      spans.push([node.getStart(file), node.end])
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  assertExact(bindings, ['GameFpsSharedNpcHighlights'],
    'Native XR host may import only the read-only NPC highlight projection')
  if (mounts.length !== 1 || mounts[0].attributes.properties.length !== 0) {
    throw new Error('Native XR host must mount one inactive NPC highlight projection without a gameplay ref')
  }
  let remaining = source
  for (const [start, end] of spans.sort((a, b) => b[0] - a[0])) remaining = remaining.slice(0, start) + remaining.slice(end)
  if (GAME_AWARE_PATTERN.test(remaining)) throw new Error('Native XR host must not gain other Game FPS ownership')
}

export function assertGameFpsThreeOwnership({ featureSources, productionSources }) {
  const actorOwners = featureSources.filter(({ source }) => /@react-three\/fiber|from ['"]three['"]/.test(source))
  assertExact(actorOwners.map(({ name }) => name), ACTOR_FILES, 'Game FPS Three ownership must remain actor-only')
  const gameOwners = productionSources
    .filter(({ source }) => GAME_AWARE_PATTERN.test(source) && THREE_PRESENTATION_PATTERN.test(source))
    .map(({ relPath }) => relPath)
  assertExact(gameOwners, [
    ...ACTOR_FILES.map(name => `canvas/src/features/game-fps/${name}`),
    XR_HOST,
    'canvas/src/lib/three/ThreeGraph.impl.tsx',
  ], 'Game-aware Three ownership must remain the shared renderer and actor presentation')
  assertInactiveHostProjection(productionSources.find(({ relPath }) => relPath === XR_HOST).source)

  const stage = featureSources.find(({ name }) => name === ACTOR_FILES[0]).source
  const highlight = featureSources.find(({ name }) => name === ACTOR_FILES[1]).source
  assertExact(jsxTags(ACTOR_FILES[0], stage), [
    'group', 'mesh', 'capsuleGeometry', 'meshStandardMaterial', 'GameFpsSharedNpcHighlights',
  ], 'Game FPS stage must contain only its actor root, NPC mesh and selection highlight')
  assertExact(jsxTags(ACTOR_FILES[1], highlight), [
    'mesh', 'capsuleGeometry', 'meshBasicMaterial', 'group',
    'NpcHighlightMesh', 'NpcHighlightMesh', 'InactiveNpcHighlight',
  ], 'Game FPS highlight must contain only the selected NPC capsule projection')
  if (/\b(?:advanceGameModeSimulationBy|bindGameFpsSimulationInputQueue|createGameFpsSimulationClock|setInterval|requestAnimationFrame|useThree)\b/.test(highlight)) {
    throw new Error('Game FPS highlight must not own a simulation clock, camera or renderer')
  }
}
