import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphSchema } from '@/lib/graph/schema'
import { getThreeSelectionConfig } from '@/lib/graph/schema'
import type { SettingMeta } from './types'

const s = () => useGraphStore.getState()

export const threeSettingsRegistryPart3: SettingMeta[] = [
  {
    key: 'three.layout.voxelLabelShowOnHoverOnly',
    type: 'boolean',
    source: 'store',
    read: () => {
      const schema = s().schema
      return schema.three?.voxelLabelShowOnHoverOnly === true
    },
    write: (v) => s().setThreeConfig({ voxelLabelShowOnHoverOnly: Boolean(v) }),
    docKey: 'three.layout.voxelLabelShowOnHoverOnly',
    default: () => false,
  },
  {
    key: 'three.layout.voxelLabelLift',
    type: 'number',
    source: 'store',
    read: () => {
      const schema = s().schema
      return typeof schema.three?.voxelLabelLift === 'number' ? schema.three.voxelLabelLift : 4
    },
    write: (v) => s().setThreeConfig({ voxelLabelLift: Number(v) }),
    docKey: 'three.layout.voxelLabelLift',
    default: () => 4,
  },
  {
    key: 'three.globe.effectsEnabled',
    type: 'boolean',
    source: 'store',
    read: () => {
      const schema = s().schema
      return schema.three?.globeEffectsEnabled !== false
    },
    write: (v) => s().setThreeConfig({ globeEffectsEnabled: Boolean(v) }),
    docKey: 'three.globe.effectsEnabled',
    default: () => true,
  },
  {
    key: 'three.globe.particleCount',
    type: 'number',
    source: 'store',
    read: () => {
      const schema = s().schema
      return typeof schema.three?.globeParticleCount === 'number' ? schema.three.globeParticleCount : 720
    },
    write: (v) => s().setThreeConfig({ globeParticleCount: Number(v) }),
    docKey: 'three.globe.particleCount',
    default: () => 720,
  },
  {
    key: 'three.globe.atmosphereOpacity',
    type: 'number',
    source: 'store',
    read: () => {
      const schema = s().schema
      return typeof schema.three?.globeAtmosphereOpacity === 'number' ? schema.three.globeAtmosphereOpacity : 0.22
    },
    write: (v) => s().setThreeConfig({ globeAtmosphereOpacity: Number(v) }),
    docKey: 'three.globe.atmosphereOpacity',
    default: () => 0.22,
  },
  {
    key: 'three.globe.gridDensity',
    type: 'number',
    source: 'store',
    read: () => {
      const schema = s().schema
      return typeof schema.three?.globeGridDensity === 'number' ? schema.three.globeGridDensity : 12
    },
    write: (v) => s().setThreeConfig({ globeGridDensity: Number(v) }),
    docKey: 'three.globe.gridDensity',
    default: () => 12,
  },
  {
    key: 'three.globe.orbitRingCount',
    type: 'number',
    source: 'store',
    read: () => {
      const schema = s().schema
      return typeof schema.three?.globeOrbitRingCount === 'number' ? schema.three.globeOrbitRingCount : 4
    },
    write: (v) => s().setThreeConfig({ globeOrbitRingCount: Number(v) }),
    docKey: 'three.globe.orbitRingCount',
    default: () => 4,
  },
  {
    key: 'three.globe.toolNodeCount',
    type: 'number',
    source: 'store',
    read: () => {
      const schema = s().schema
      return typeof schema.three?.globeToolNodeCount === 'number' ? schema.three.globeToolNodeCount : 24
    },
    write: (v) => s().setThreeConfig({ globeToolNodeCount: Number(v) }),
    docKey: 'three.globe.toolNodeCount',
    default: () => 24,
  },
  {
    key: 'three.globe.arcCount',
    type: 'number',
    source: 'store',
    read: () => {
      const schema = s().schema
      return typeof schema.three?.globeArcCount === 'number' ? schema.three.globeArcCount : 12
    },
    write: (v) => s().setThreeConfig({ globeArcCount: Number(v) }),
    docKey: 'three.globe.arcCount',
    default: () => 12,
  },
  {
    key: 'three.globe.arcTravelerCount',
    type: 'number',
    source: 'store',
    read: () => {
      const schema = s().schema
      return typeof schema.three?.globeArcTravelerCount === 'number' ? schema.three.globeArcTravelerCount : 1
    },
    write: (v) => s().setThreeConfig({ globeArcTravelerCount: Number(v) }),
    docKey: 'three.globe.arcTravelerCount',
    default: () => 1,
  },
  {
    key: 'three.globe.hubOrbitEnabled',
    type: 'boolean',
    source: 'store',
    read: () => {
      const schema = s().schema
      return schema.three?.globeHubOrbitEnabled !== false
    },
    write: (v) => s().setThreeConfig({ globeHubOrbitEnabled: Boolean(v) }),
    docKey: 'three.globe.hubOrbitEnabled',
    default: () => true,
  },
  {
    key: 'three.globe.hubOrbitStrength',
    type: 'number',
    source: 'store',
    read: () => {
      const schema = s().schema
      return typeof schema.three?.globeHubOrbitStrength === 'number' ? schema.three.globeHubOrbitStrength : 0.22
    },
    write: (v) => s().setThreeConfig({ globeHubOrbitStrength: Number(v) }),
    docKey: 'three.globe.hubOrbitStrength',
    default: () => 0.22,
  },
  {
    key: 'three.globe.hubOrbitSpeed',
    type: 'number',
    source: 'store',
    read: () => {
      const schema = s().schema
      return typeof schema.three?.globeHubOrbitSpeed === 'number' ? schema.three.globeHubOrbitSpeed : 0.24
    },
    write: (v) => s().setThreeConfig({ globeHubOrbitSpeed: Number(v) }),
    docKey: 'three.globe.hubOrbitSpeed',
    default: () => 0.24,
  },
  {
    key: 'three.globe.hubOrbitRadiusFactor',
    type: 'number',
    source: 'store',
    read: () => {
      const schema = s().schema
      return typeof schema.three?.globeHubOrbitRadiusFactor === 'number' ? schema.three.globeHubOrbitRadiusFactor : 0.2
    },
    write: (v) => s().setThreeConfig({ globeHubOrbitRadiusFactor: Number(v) }),
    docKey: 'three.globe.hubOrbitRadiusFactor',
    default: () => 0.2,
  },
  {
    key: 'three.globe.sphereEllipsoidX',
    type: 'number',
    source: 'store',
    read: () => {
      const schema = s().schema
      return typeof schema.three?.globeSphereEllipsoidX === 'number' ? schema.three.globeSphereEllipsoidX : 1.08
    },
    write: (v) => s().setThreeConfig({ globeSphereEllipsoidX: Number(v) }),
    docKey: 'three.globe.sphereEllipsoidX',
    default: () => 1.08,
  },
  {
    key: 'three.globe.sphereEllipsoidY',
    type: 'number',
    source: 'store',
    read: () => {
      const schema = s().schema
      return typeof schema.three?.globeSphereEllipsoidY === 'number' ? schema.three.globeSphereEllipsoidY : 0.88
    },
    write: (v) => s().setThreeConfig({ globeSphereEllipsoidY: Number(v) }),
    docKey: 'three.globe.sphereEllipsoidY',
    default: () => 0.88,
  },
  {
    key: 'three.globe.sphereEllipsoidZ',
    type: 'number',
    source: 'store',
    read: () => {
      const schema = s().schema
      return typeof schema.three?.globeSphereEllipsoidZ === 'number' ? schema.three.globeSphereEllipsoidZ : 1
    },
    write: (v) => s().setThreeConfig({ globeSphereEllipsoidZ: Number(v) }),
    docKey: 'three.globe.sphereEllipsoidZ',
    default: () => 1,
  },
  {
    key: 'three.globe.labelDepthFade',
    type: 'boolean',
    source: 'store',
    read: () => {
      const schema = s().schema
      return schema.three?.globeLabelDepthFade !== false
    },
    write: (v) => s().setThreeConfig({ globeLabelDepthFade: Boolean(v) }),
    docKey: 'three.globe.labelDepthFade',
    default: () => true,
  },
  {
    key: 'three.globe.labelBackfaceCulling',
    type: 'boolean',
    source: 'store',
    read: () => {
      const schema = s().schema
      return schema.three?.globeLabelBackfaceCulling !== false
    },
    write: (v) => s().setThreeConfig({ globeLabelBackfaceCulling: Boolean(v) }),
    docKey: 'three.globe.labelBackfaceCulling',
    default: () => true,
  },
  {
    key: 'three.media.iframeOverlay.poolMax',
    type: 'number',
    source: 'store',
    read: () => s().threeIframeOverlayPoolMax,
    write: (v) => s().setThreeIframeOverlayPoolMax(Number(v)),
    docKey: 'three.media.iframeOverlay.poolMax',
    default: () => 24,
  },
  {
    key: 'three.media.iframeOverlay.maxVisibleDefault',
    type: 'number',
    source: 'store',
    read: () => s().threeIframeOverlayMaxVisibleDefault,
    write: (v) => s().setThreeIframeOverlayMaxVisibleDefault(Number(v)),
    docKey: 'three.media.iframeOverlay.maxVisibleDefault',
    default: () => 8,
  },
  {
    key: 'three.media.iframeOverlay.maxVisibleCompact',
    type: 'number',
    source: 'store',
    read: () => s().threeIframeOverlayMaxVisibleCompact,
    write: (v) => s().setThreeIframeOverlayMaxVisibleCompact(Number(v)),
    docKey: 'three.media.iframeOverlay.maxVisibleCompact',
    default: () => 6,
  },
  {
    key: 'three.media.iframeOverlay.baseWidthRatioDefault',
    type: 'number',
    source: 'store',
    read: () => s().threeIframeOverlayBaseWidthRatioDefault,
    write: (v) => s().setThreeIframeOverlayBaseWidthRatioDefault(Number(v)),
    docKey: 'three.media.iframeOverlay.baseWidthRatioDefault',
    default: () => 0.2,
  },
  {
    key: 'three.media.iframeOverlay.baseWidthRatioCompact',
    type: 'number',
    source: 'store',
    read: () => s().threeIframeOverlayBaseWidthRatioCompact,
    write: (v) => s().setThreeIframeOverlayBaseWidthRatioCompact(Number(v)),
    docKey: 'three.media.iframeOverlay.baseWidthRatioCompact',
    default: () => 0.16,
  },
  {
    key: 'three.media.iframeOverlay.baseWidthMinPxDefault',
    type: 'number',
    source: 'store',
    read: () => s().threeIframeOverlayBaseWidthMinPxDefault,
    write: (v) => s().setThreeIframeOverlayBaseWidthMinPxDefault(Number(v)),
    docKey: 'three.media.iframeOverlay.baseWidthMinPxDefault',
    default: () => 210,
  },
  {
    key: 'three.media.iframeOverlay.baseWidthMinPxCompact',
    type: 'number',
    source: 'store',
    read: () => s().threeIframeOverlayBaseWidthMinPxCompact,
    write: (v) => s().setThreeIframeOverlayBaseWidthMinPxCompact(Number(v)),
    docKey: 'three.media.iframeOverlay.baseWidthMinPxCompact',
    default: () => 180,
  },
  {
    key: 'three.media.iframeOverlay.baseWidthMaxPxDefault',
    type: 'number',
    source: 'store',
    read: () => s().threeIframeOverlayBaseWidthMaxPxDefault,
    write: (v) => s().setThreeIframeOverlayBaseWidthMaxPxDefault(Number(v)),
    docKey: 'three.media.iframeOverlay.baseWidthMaxPxDefault',
    default: () => 360,
  },
  {
    key: 'three.media.iframeOverlay.baseWidthMaxPxCompact',
    type: 'number',
    source: 'store',
    read: () => s().threeIframeOverlayBaseWidthMaxPxCompact,
    write: (v) => s().setThreeIframeOverlayBaseWidthMaxPxCompact(Number(v)),
    docKey: 'three.media.iframeOverlay.baseWidthMaxPxCompact',
    default: () => 300,
  },
]
