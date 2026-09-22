import { PROCEDURAL_ASSET_SCHEMA, parseProceduralAssetRecipe, type AssetPart, type AssetPrimitive, type AssetVector, type ProceduralAssetRecipe } from './proceduralAssetContract'

export const PROCEDURAL_ASSET_TEXT_SUBJECTS = ['robot', 'character', 'tree', 'palm', 'chair', 'table', 'box', 'sphere', 'cylinder'] as const
/** A bounded local recipe selector, not a claim of unrestricted text synthesis. */
export function createProceduralAssetFromText(intent: string, seed = 1): ProceduralAssetRecipe {
  if (typeof intent !== 'string' || intent.length > 2000) throw new Error('Describe an asset in 1–2000 characters')
  const subjects = PROCEDURAL_ASSET_TEXT_SUBJECTS.filter(word => new RegExp(`\\b${word}\\b`, 'i').test(intent))
  if (subjects.length > 1) throw new Error('Local creation accepts one subject; use a typed recipe for assemblies of multiple subjects')
  const subject = subjects[0]
  if (!subject) throw new Error(`Local creation supports ${PROCEDURAL_ASSET_TEXT_SUBJECTS.join(', ')}. A connected agent may supply a validated part recipe.`)
  const colors: Record<string, string> = { red: '#e86666', blue: '#5195d9', green: '#47ad85', yellow: '#eac85f', purple: '#937bc9', white: '#e6ebe8', orange: '#e49a52' }
  const named = Object.keys(colors).find(word => new RegExp(`\\b${word}\\b`, 'i').test(intent))
  const color = /#[a-f0-9]{6}\b/i.exec(intent)?.[0] ?? colors[named ?? ''] ?? ['#53bfa0', '#628fe0', '#c99c64'][seed % 3]
  const accent = '#263e52', parts: AssetPart[] = []
  const add = (id: string, primitive: AssetPrimitive, position: AssetVector, size: AssetVector, parentId: string | null = null, tint = color, pivot: AssetVector = [0, 0, 0]) => {
    parts.push({ id, primitive, position, size, parentId, color: tint, pivot, rotation: [0, 0, 0], visible: true })
  }
  if (subject === 'robot' || subject === 'character') {
    add('body', 'box', [0, 1.4, 0], [0.85, 1, 0.5])
    add('head', 'box', [0, 0.85, 0], [0.68, 0.58, 0.6], 'body')
    add('visor', 'box', [0, 0.04, 0.305], [0.47, 0.16, 0.035], 'head', accent)
    add('arm-left', 'box', [-0.61, 0.35, 0], [0.28, 0.8, 0.32], 'body', color, [0, 0.3, 0])
    add('arm-right', 'box', [0.61, 0.35, 0], [0.28, 0.8, 0.32], 'body', color, [0, 0.3, 0])
    add('leg-left', 'box', [-0.24, -0.5, 0], [0.3, 0.85, 0.38], 'body', accent, [0, 0.425, 0])
    add('leg-right', 'box', [0.24, -0.5, 0], [0.3, 0.85, 0.38], 'body', accent, [0, 0.425, 0])
  } else if (subject === 'palm' || subject === 'tree') {
    add('trunk', 'cylinder', [0, 0.9, 0], [0.25, 1.8, 0.25], null, '#99764e')
    add('canopy', subject === 'tree' ? 'cone' : 'sphere', [0, 1.05, 0], [1.65, subject === 'tree' ? 1.8 : 0.65, 1.65], 'trunk', color)
  } else if (subject === 'chair' || subject === 'table') {
    add('top', 'box', [0, 1, 0], [1.4, 0.16, 1], null, color)
    for (const [id, x, z] of [['front-left', -0.55, 0.35], ['front-right', 0.55, 0.35], ['back-left', -0.55, -0.35], ['back-right', 0.55, -0.35]] as const) add(id, 'box', [x, -0.48, z], [0.14, 0.9, 0.14], 'top', accent)
    if (subject === 'chair') add('back', 'box', [0, 0.55, -0.43], [1.4, 0.95, 0.14], 'top')
  } else add('body', subject, [0, 0.5, 0], [1, 1, 1])
  const main = parts[0], controls: ProceduralAssetRecipe['controls'] = [
    ...(['width', 'height', 'depth'] as const).map((target, index) => ({ id: target, label: `${main.id} ${target}`, partId: main.id, target, type: 'number' as const, min: 0.05, max: 5, step: 0.05, default: main.size[index] })),
    { id: 'color', label: `${main.id} colour`, partId: main.id, target: 'color', type: 'color', default: main.color },
    { id: 'detail', label: 'Detail', partId: main.id, target: 'detail', type: 'enum', options: ['low', 'medium', 'high'], default: 'medium' },
    { id: 'visible', label: `${main.id} visible`, partId: main.id, target: 'visible', type: 'boolean', default: true },
  ]
  if (parts.length > 1) controls.push({ id: 'accent', label: `${parts[1].id} colour`, partId: parts[1].id, target: 'color', type: 'color', default: parts[1].color })
  const clips: ProceduralAssetRecipe['clips'] = subject === 'robot' || subject === 'character' ? [{ id: 'walk', duration: 2, tracks: ['arm-left', 'arm-right', 'leg-left', 'leg-right'].map((partId, i) => ({ partId, keys: [0, 0.5, 1, 1.5, 2].map((time, k) => ({ time, rotation: [[0, 1, 0, -1, 0][k] * (i % 2 ? -0.45 : 0.45), 0, 0] as AssetVector })) })) }] : []
  return parseProceduralAssetRecipe({ schema: PROCEDURAL_ASSET_SCHEMA, intent, seed, parts, controls, values: Object.fromEntries(controls.map(control => [control.id, control.default])), clips })
}
