import { MeshStandardMaterial } from 'three'

import {
  compileMeshStandardMaterialGraph,
  type MaterialGraph,
  type MaterialGraphCompileResult,
  type MeshStandardMaterialParameterDescriptor,
} from './materialGraph'

type MaterialGraphCompileFailureReason = Extract<
  MaterialGraphCompileResult,
  { status: 'invalid' }
>['reason']

export type MeshStandardMaterialRenderState = Readonly<{
  target: 'MeshStandardMaterial'
  uuid: string
  version: number
  bindingDisposed: boolean
  color: string
  emissive: string
  roughness: number
  metalness: number
  opacity: number
  emissiveIntensity: number
  transparent: boolean
  wireframe: boolean
  depthWrite: boolean
}>

export type MaterialGraphApplyResult =
  | Readonly<{
      status: 'ready'
      descriptor: MeshStandardMaterialParameterDescriptor
      state: MeshStandardMaterialRenderState
    }>
  | Readonly<{
      status: 'invalid'
      reason: MaterialGraphCompileFailureReason | 'binding-disposed'
      state: MeshStandardMaterialRenderState
    }>

export type MeshStandardMaterialGraphBinding = Readonly<{
  material: MeshStandardMaterial
  apply(graph: MaterialGraph): MaterialGraphApplyResult
  snapshot(): MeshStandardMaterialRenderState
  dispose(): MeshStandardMaterialRenderState
}>

export type MeshStandardMaterialGraphBindingResult =
  | Readonly<{ status: 'ready'; binding: MeshStandardMaterialGraphBinding }>
  | Readonly<{ status: 'invalid'; reason: 'invalid-material' }>

function colorHex(materialColor: MeshStandardMaterial['color']): string {
  return `#${materialColor.getHexString()}`
}

/**
 * Binds the closed graph compiler to an existing Three.js material. The
 * canonical renderer continues to own meshes, scenes, cameras, and frames.
 */
export function bindMaterialGraphToMeshStandardMaterial(
  candidate: unknown,
): MeshStandardMaterialGraphBindingResult {
  if (!(candidate instanceof MeshStandardMaterial)) {
    return { status: 'invalid', reason: 'invalid-material' }
  }

  const material = candidate
  let bindingDisposed = false
  const onDispose = () => {
    bindingDisposed = true
  }
  material.addEventListener('dispose', onDispose)

  const snapshot = (): MeshStandardMaterialRenderState => Object.freeze({
    target: 'MeshStandardMaterial',
    uuid: material.uuid,
    version: material.version,
    bindingDisposed,
    color: colorHex(material.color),
    emissive: colorHex(material.emissive),
    roughness: material.roughness,
    metalness: material.metalness,
    opacity: material.opacity,
    emissiveIntensity: material.emissiveIntensity,
    transparent: material.transparent,
    wireframe: material.wireframe,
    depthWrite: material.depthWrite,
  })

  const apply = (graph: MaterialGraph): MaterialGraphApplyResult => {
    if (bindingDisposed) {
      return Object.freeze({ status: 'invalid', reason: 'binding-disposed', state: snapshot() })
    }

    const compiled = compileMeshStandardMaterialGraph(graph)
    if (compiled.status === 'invalid') {
      return Object.freeze({ ...compiled, state: snapshot() })
    }

    const parameters = compiled.descriptor.parameters
    if (parameters.color !== undefined) material.color.set(parameters.color as string)
    if (parameters.emissive !== undefined) material.emissive.set(parameters.emissive as string)
    if (parameters.roughness !== undefined) material.roughness = parameters.roughness as number
    if (parameters.metalness !== undefined) material.metalness = parameters.metalness as number
    if (parameters.opacity !== undefined) material.opacity = parameters.opacity as number
    if (parameters.emissiveIntensity !== undefined) {
      material.emissiveIntensity = parameters.emissiveIntensity as number
    }
    if (parameters.transparent !== undefined) material.transparent = parameters.transparent as boolean
    if (parameters.wireframe !== undefined) material.wireframe = parameters.wireframe as boolean
    if (parameters.depthWrite !== undefined) material.depthWrite = parameters.depthWrite as boolean
    material.needsUpdate = true

    return Object.freeze({
      status: 'ready',
      descriptor: compiled.descriptor,
      state: snapshot(),
    })
  }

  const dispose = (): MeshStandardMaterialRenderState => {
    // Dispose only this binding. The caller supplied the material and retains
    // sole authority over its renderer/GPU lifecycle.
    bindingDisposed = true
    material.removeEventListener('dispose', onDispose)
    return snapshot()
  }

  return Object.freeze({
    status: 'ready',
    binding: Object.freeze({ material, apply, snapshot, dispose }),
  })
}
