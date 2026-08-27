import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function source(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')
}

export function testGaussianSplatEditorSurfaceIsWiredAndCleanRoom() {
  const panel = source('features', 'three', 'SpatialAssetToolsPanel.tsx')
  const editor = source('features', 'three', 'GaussianSplatEditorSection.tsx')
  const stage = source('features', 'three', 'SpatialCaptureManifestStage.tsx')
  const geometry = source('features', 'three', 'spatialCaptureGeometryRuntime.ts')
  const material = source('features', 'three', 'spatialCaptureGaussianMaterial.ts')
  const model = source('features', 'three', 'gaussianSplatEditorModel.ts')
  const runtime = source('features', 'three', 'gaussianSplatEditorRuntime.ts')
  const panelModel = source('features', 'three', 'xrPanelModel.ts')

  for (const marker of [
    'GaussianSplatEditorSection',
    "sourceProfile.kind !== 'spatial-capture'",
    'data-kg-media-3d-spatial-tools="1"',
    'aria-label="3D graphics stack"',
    'data-kg-media-3d-capability={item.id}',
  ]) {
    if (!panel.includes(marker)) throw new Error(`expected Media 3D spatial tools to mount Gaussian editor marker ${marker}`)
  }
  for (const marker of [
    'data-kg-xr-gaussian-editor="1"',
    'data-kg-xr-gaussian-inspect="1"',
    'data-kg-xr-gaussian-edit="1"',
    'data-kg-xr-gaussian-optimize="1"',
    'data-kg-xr-gaussian-publish="1"',
    'buildOptimizedGaussianPlyBlob(runtime)',
    'buildGaussianSplatEditManifestBlob(runtime)',
    'uploadGeneratedWorkspaceBlobToAgenticGraphStorage',
    'resetGaussianSplatEditorSettings',
    'const editable = !unsupported',
    'SPZ is recognized but its decoder/editor is not available.',
  ]) {
    if (!editor.includes(marker)) throw new Error(`expected functional Gaussian editor projection marker ${marker}`)
  }
  for (const marker of [
    'hydrateGaussianSplatEditorRuntime',
    'subscribeGaussianSplatEditorRuntime',
    'resolveGaussianSplatVisibleIndices',
    'const gaussianEditorVisibility = React.useMemo',
    'updateGaussianSplatEditorVisibility',
    'resolveGaussianSplatCropBounds',
    'resolveGaussianSplatScaleCeiling',
    'uniforms.editorVisualization.value',
    'uniforms.editorOpacityFloor.value',
    'uniforms.editorScaleCeiling.value',
    'uniforms.editorBrightness.value',
    'uniforms.editorSaturation.value',
  ]) {
    if (!stage.includes(marker)) throw new Error(`expected Gaussian stage/runtime bridge marker ${marker}`)
  }
  for (const marker of [
    'kgGaussianSplatEditorVisibility',
    "geometry.setAttribute('splatEditorVisible'",
    'updateGaussianSplatEditorVisibility',
    "updateReorderedFloatAttribute(geometry, 'splatEditorVisible'",
  ]) {
    if (!geometry.includes(marker)) throw new Error(`expected exact budget-mask geometry marker ${marker}`)
  }
  for (const marker of [
    'editorVisualization',
    'editorOpacityFloor',
    'editorScaleCeiling',
    'editorCropMin',
    'editorCropMax',
    'editorBrightness',
    'editorSaturation',
    'vSplatVisible',
    'length(vSplatCorner)',
  ]) {
    if (!material.includes(marker)) throw new Error(`expected Gaussian shader edit marker ${marker}`)
  }
  for (const marker of [
    "id: 'threejs'",
    "id: 'webgl'",
    "id: 'webgpu'",
    "id: 'webxr'",
    "id: 'gltf'",
    "id: 'glb'",
    "id: 'ply'",
    "id: 'spz'",
    'available, not active',
    'Recognized source · unsupported',
  ]) {
    if (!panelModel.includes(marker)) throw new Error(`expected truthful XR graphics runtime marker ${marker}`)
  }

  const implementationText = [editor, stage, geometry, material, model, runtime, panelModel].join('\n').toLowerCase()
  const dependencyText = [
    readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    readFileSync(resolve(process.cwd(), '..', 'package.json'), 'utf8'),
    readFileSync(resolve(process.cwd(), '..', 'package-lock.json'), 'utf8'),
  ].join('\n').toLowerCase()
  const forbidden = [
    ['play', 'canvas'].join(''),
    ['super', 'splat'].join(''),
    ['superspl', '.at'].join(''),
    ['pc', 'ui'].join(''),
    ['splat', 'Data'].join('').toLowerCase(),
  ]
  for (const token of forbidden) {
    if (implementationText.includes(token)) throw new Error(`expected independently authored Gaussian implementation to omit ${token}`)
    if (dependencyText.includes(token)) throw new Error(`expected Gaussian workflow to add no external dependency marker ${token}`)
  }
}
