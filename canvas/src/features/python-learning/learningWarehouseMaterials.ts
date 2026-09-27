import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three'

const SIDE = 128
/** Two local RGBA maps: 128 KiB base data, approximately 171 KiB with generated mipmaps. */
export function createWarehouseConcreteMaps() {
  const albedo = new Uint8Array(SIDE * SIDE * 4), roughness = new Uint8Array(albedo.length)
  for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) {
    const offset = (y * SIDE + x) * 4
    // Fixed integer grain plus periodic trowel variation makes the repeat deterministic and seamless.
    let hash = Math.imul(x + y * SIDE + 1, 0x45d9f3b)
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
    const grain = ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff
    const trowel = Math.sin(x * Math.PI * 8 / SIDE) * Math.cos(y * Math.PI * 6 / SIDE)
    const tone = Math.round(239 + (grain - 0.5) * 13 + trowel * 3)
    albedo.set([tone, tone, Math.min(255, tone + 1), 255], offset)
    const matte = Math.round(226 + grain * 23)
    roughness.set([matte, matte, matte, 255], offset)
  }
  const colorMap = new DataTexture(albedo, SIDE, SIDE), roughnessMap = new DataTexture(roughness, SIDE, SIDE)
  colorMap.colorSpace = SRGBColorSpace
  for (const texture of [colorMap, roughnessMap]) {
    texture.wrapS = texture.wrapT = RepeatWrapping
    texture.repeat.set(30, 20)
    texture.magFilter = LinearFilter
    texture.minFilter = LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.needsUpdate = true
  }
  return { colorMap, roughnessMap, dispose() { colorMap.dispose(); roughnessMap.dispose() } }
}
