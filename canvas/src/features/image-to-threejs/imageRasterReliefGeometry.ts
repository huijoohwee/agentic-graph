import * as THREE from 'three'
import { readImageReferencePixels, type RasterImageSource } from './imageReferencePixels'

import { validateRasterRelief, luminance, type RasterRelief } from './imageRasterReliefField'

export function buildRasterReliefGeometry(args: {
  image?: RasterImageSource
  height: number
  width: number
  field?: RasterRelief
}) {
  const field = args.field ? validateRasterRelief(args.field) : null
  const segments = 28
  const geometry = new THREE.PlaneGeometry(args.width, args.height, field ? field.width - 1 : segments, field ? field.height - 1 : segments)
  const positions = geometry.getAttribute('position')
  let pixels: Uint8ClampedArray | null = null
  let pixelWidth = 0
  let pixelHeight = 0

  try {
    if (args.image) {
      const reference = readImageReferencePixels({ image: args.image, maxDimension: 96 })
      pixels = reference.data
      pixelWidth = reference.width
      pixelHeight = reference.height
    }
  } catch {
    // A remote source can legitimately taint its canvas. Keep a deterministic
    // native relief instead of dropping to the raw-image fallback surface.
  }

  for (let index = 0; index < positions.count; index += 1) {
    const u = (positions.getX(index) / args.width) + 0.5
    const v = 0.5 - (positions.getY(index) / args.height)
    let depth = Math.sin(u * Math.PI * 4) * Math.sin(v * Math.PI * 3) * 0.012
    if (field) depth = 0.1 + field.samples[index] / 255 * 0.9
    else if (pixels && pixelWidth > 0 && pixelHeight > 0) {
      const x = Math.min(pixelWidth - 1, Math.max(0, Math.round(u * (pixelWidth - 1))))
      const y = Math.min(pixelHeight - 1, Math.max(0, Math.round(v * (pixelHeight - 1))))
      const pixelIndex = (y * pixelWidth + x) * 4
      depth = (luminance(pixels, pixelIndex) - 0.5) * 0.09
    }
    positions.setZ(index, depth)
  }
  positions.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

/** Close the shared relief with a flat back and side walls, retaining the front's pixel UVs. */
export function buildSolidRasterRelief(field: RasterRelief, width: number, height: number) {
  const front = buildRasterReliefGeometry({ field, width, height })
  const p = front.getAttribute('position'), uv = front.getAttribute('uv')
  const positions = Array.from(p.array), uvs = Array.from(uv.array), indices = Array.from(front.index!.array)
  const count = p.count
  for (let i = 0; i < count; i++) { positions.push(p.getX(i), p.getY(i), 0); uvs.push(0.08, 0) }
  for (let i = 0; i < front.index!.count; i += 3) indices.push(count + front.index!.getX(i + 2), count + front.index!.getX(i + 1), count + front.index!.getX(i))
  const edge: number[] = []
  for (let x = 0; x < field.width; x++) edge.push(x)
  for (let y = 1; y < field.height; y++) edge.push(y * field.width + field.width - 1)
  for (let x = field.width - 2; x >= 0; x--) edge.push((field.height - 1) * field.width + x)
  for (let y = field.height - 2; y > 0; y--) edge.push(y * field.width)
  for (let i = 0; i < edge.length; i++) { const a = edge[i], b = edge[(i + 1) % edge.length]; indices.push(a, b, a + count, b, b + count, a + count) }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.userData.reliefFrontVertices = count
  front.dispose(); return geometry
}
