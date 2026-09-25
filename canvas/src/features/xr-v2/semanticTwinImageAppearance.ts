import * as THREE from 'three'
import type { SpaceDocument, SpaceObservation, SpaceRegion } from './semanticSpaceRuntime'
import type { TwinBinding } from './semanticTwinRuntime'

export const TWIN_TEXTURE_PIXELS = 4_194_304
/** Fit source pixels inside the authored face without stretching or inventing hidden pixels. */
export function planTwinImageCrop(region: SpaceRegion, image: { width: number; height: number },
  size: readonly number[], count: number) {
  const source = { x: region.x * image.width, y: region.y * image.height,
    width: region.width * image.width, height: region.height * image.height }
  if (![source.x, source.y, source.width, source.height, ...size].every(Number.isFinite)
    || source.x < 0 || source.y < 0 || source.width <= 0 || source.height <= 0
    || source.x + source.width > image.width + 1e-6 || source.y + source.height > image.height + 1e-6
    || size[0] <= 0 || size[1] <= 0 || !Number.isInteger(count) || count < 1 || count > 20) {
    throw Error('Image face has invalid evidence bounds.')
  }
  const limit = Math.min(1024, Math.floor(Math.sqrt(TWIN_TEXTURE_PIXELS / count)) - 8)
  const ratio = size[0] / size[1]
  // A larger atlas cannot create detail absent from the crop. Keep native texel density.
  const sourceLimit = Math.min(limit, Math.max(source.width / Math.min(1, ratio), source.height * Math.max(1, ratio)))
  const width = Math.max(1, Math.ceil(sourceLimit * Math.min(1, ratio)))
  const height = Math.max(1, Math.ceil(sourceLimit / Math.max(1, ratio)))
  const scale = Math.min(width / source.width, height / source.height)
  const destination = { x: Math.max(0, (width - source.width * scale) / 2), y: Math.max(0, (height - source.height * scale) / 2),
    width: source.width * scale, height: source.height * scale }
  return { source, destination, width, height, atlasHeight: height + 8 }
}

/** BoxGeometry's +Z face receives the photo. Other faces sample authored colour swatches. */
export function mapTwinImageFace(geometry: THREE.BufferGeometry, height: number, atlasHeight: number) {
  const uv = geometry.getAttribute('uv')
  if (uv.count !== 24 || geometry.groups.length !== 6) throw Error('Photo appearance requires the native six-face box.')
  for (let face = 0; face < 6; face++) for (let vertex = 0; vertex < 4; vertex++) {
    const index = face * 4 + vertex
    if (face === 4) uv.setXY(index, uv.getX(index), (8 + uv.getY(index) * height) / atlasHeight)
    else uv.setXY(index, (face + 0.5) / 6, 4 / atlasHeight)
  }
  uv.needsUpdate = true
}

/** Project the evidence onto front cap vertices; side/back triangles retain authored swatches. */
export function mapTwinContourFace(geometry: THREE.BufferGeometry, worldWidth: number, worldHeight: number,
  silhouette: { width: number; height: number }, height: number, atlasHeight: number) {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv')
  if (!position || !normal || !uv || ![worldWidth, worldHeight, silhouette.width, silhouette.height].every(n => Number.isFinite(n) && n > 0)) {
    throw Error('Contour appearance needs its validated projection frame.')
  }
  for (let index = 0; index < position.count; index++) {
    if (normal.getZ(index) > 0.999) {
      const u = position.getX(index) / worldWidth + 0.5 + 0.5 / silhouette.width
      const v = position.getY(index) / worldHeight + 0.5 - 0.5 / silhouette.height
      uv.setXY(index, Math.max(0, Math.min(1, u)), (8 + Math.max(0, Math.min(1, v)) * height) / atlasHeight)
    } else uv.setXY(index, normal.getZ(index) < -0.5 ? 0.25 : 0.08, 4 / atlasHeight)
  }
  uv.needsUpdate = true
}

async function loadEvidenceImage(observation: SpaceObservation, signal: AbortSignal) {
  signal.throwIfAborted()
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(observation.imageDataUrl)) throw Error('Photo faces require saved local evidence.')
  const image = new Image(); image.decoding = 'async'
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer); signal.removeEventListener('abort', abort); image.onload = null; image.onerror = null
      if (error) { image.src = ''; reject(error) } else resolve()
    }
    const abort = () => finish(Error('Photo face preparation cancelled.'))
    const timer = setTimeout(() => finish(Error('Saved image did not decode within five seconds.')), 5000)
    signal.addEventListener('abort', abort, { once: true })
    image.onload = () => finish(); image.onerror = () => finish(Error('Saved image could not be decoded.'))
    image.src = observation.imageDataUrl
  })
  signal.throwIfAborted()
  if (image.naturalWidth !== observation.width || image.naturalHeight !== observation.height) {
    image.src = ''; throw Error('Saved image dimensions do not match their evidence.')
  }
  return image
}

type ImageObject = { binding: TwinBinding; source: THREE.Group }
/** Reuses saved, verified evidence; no URLs, models, capture or external generation. */
export async function applyTwinImageAppearance(objects: readonly ImageObject[], document: SpaceDocument,
  signal: AbortSignal, textures: Set<THREE.Texture>, photoOverlay = false) {
  const candidates = objects.flatMap(object => {
    const entity = document.entities.find(item => item.id === object.binding.entityId)
    const observation = document.observations.find(item => item.id === object.binding.observationId)
    if (!entity || (!photoOverlay && (!['local-foreground-components-v1', 'user-selected-region-v1'].includes(entity.proposalMethod || '') || !['box', 'contour', 'relief'].includes(object.binding.template)))) return []
    if (!observation || observation.sha256 !== object.binding.evidenceSha256) throw Error('Photo face evidence is missing.')
    return [{ ...object, entity, observation }]
  })
  const deadline = performance.now() + 10_000
  for (const hash of new Set(candidates.map(item => item.observation.sha256))) {
    signal.throwIfAborted()
    if (performance.now() > deadline) throw Error('Photo appearance exceeded its ten-second budget.')
    const group = candidates.filter(item => item.observation.sha256 === hash)
    const image = await loadEvidenceImage(group[0].observation, signal)
    try {
      for (const { source, binding, entity, observation } of group) {
        signal.throwIfAborted()
        const meshes: THREE.Mesh[] = []
        source.traverse(item => { if ((item as THREE.Mesh).isMesh) meshes.push(item as THREE.Mesh) })
        const contour = binding.template === 'contour', relief = binding.template === 'relief'
        if (!meshes.length || (!photoOverlay && !contour && !relief && (meshes.length !== 1 || meshes[0].userData.primitive !== 'box'))) continue
        const plan = planTwinImageCrop(entity.region, observation, contour || relief || photoOverlay
          ? [entity.region.width * observation.width, entity.region.height * observation.height] : binding.size, candidates.length)
        const canvas = globalThis.document.createElement('canvas')
        canvas.width = plan.width; canvas.height = plan.atlasHeight
        const context = canvas.getContext('2d')
        if (!context) throw Error('Photo face preparation needs the local image canvas.')
        const previous = meshes[0].material as THREE.MeshStandardMaterial
        context.fillStyle = previous.color.getStyle(); context.fillRect(0, 0, canvas.width, canvas.height)
        const s = plan.source, d = plan.destination
        context.drawImage(image, s.x, s.y, s.width, s.height, d.x, d.y, d.width, d.height)
        for (let face = 0; face < 6; face++) {
          context.fillStyle = previous.color.clone().multiplyScalar([0.7, 0.55, 1, 0.45, 1, 0.6][face]).getStyle()
          context.fillRect(face * canvas.width / 6, plan.height, canvas.width / 6 + 1, 8)
        }
        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = false
        texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter
        textures.add(texture)
        const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
        const replaced = new Set<THREE.Material>()
        for (const mesh of meshes) {
          if (relief) {
            const uv = mesh.geometry.getAttribute('uv')
            for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), i < mesh.geometry.userData.reliefFrontVertices ? (8 + uv.getY(i) * plan.height) / plan.atlasHeight : 4 / plan.atlasHeight)
            uv.needsUpdate = true
          } else if (contour) {
            const frame = source.userData.contourRebuildPlan
            mapTwinContourFace(mesh.geometry, frame.worldWidth, frame.worldHeight, binding.silhouette!, plan.height, plan.atlasHeight)
          } else if (!photoOverlay) mapTwinImageFace(mesh.geometry, plan.height, plan.atlasHeight)
          replaced.add(mesh.material as THREE.Material); mesh.material = material
          mesh.userData.imageAppearance = { kind: 'source-photo-front', evidenceSha256: observation.sha256,
            region: { ...entity.region }, hiddenSurfaces: 'authored-colour', scale: 'unknown' }
        }
        replaced.forEach(item => item.dispose())
      }
    } finally { image.src = '' }
  }
}
