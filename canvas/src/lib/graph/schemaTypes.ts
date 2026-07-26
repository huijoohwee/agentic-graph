import type { JSONValue } from './types';
import type { SnapGridTuple } from '@/lib/canvas/snapGridSize'

export interface GraphBehavior {
  allowEdgeCreation: boolean;
  allowNodeDrag: boolean;
  nodeShapeMode?: 'circle' | 'rect' | 'diamond' | 'hex';
  dragConstraint?: 'free' | 'axis-x' | 'axis-y' | 'none';
  snapGrid?: { enabled: boolean; size: number | SnapGridTuple };
  canvasGrid?: {
    enabled: boolean
    variant?: 'lines' | 'dots'
    majorEvery?: number
    dotRadiusPx?: number
    minorAlpha?: number
    majorAlpha?: number
    minorWidthPx?: number
    majorWidthPx?: number
    minorStroke?: string
    majorStroke?: string
  }
  preventDuplicatesGlobal?: boolean;
  preventSelfLoopsGlobal?: boolean;
  selectMode?: 'single' | 'multi' | 'lasso';
  createMode?: 'shift-drag' | 'click-source-target' | 'panel-only';
  portHandles?: {
    enabled?: boolean;
    placement?: 'cardinal';
    size?: number;
    offset?: number;
    strokeWidth?: number;
    showAllInputs?: boolean;
  };
  hover?: {
    enabled?: boolean;
    intensity?: number;
    debounceMs?: number;
    content?: {
      showProps?: boolean;
      showType?: boolean;
      showId?: boolean;
    };
  };
  expansion?: {
    enabled?: boolean;
    highlightNeighbors?: boolean;
    zoomOnSelection?: boolean;
    zoomOnDoubleClick?: boolean;
  };
  defaultNodeType?: string;
}

export interface PropertySpec {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  uniqueness?: boolean;
  pattern?: string;
  range?: { min?: number; max?: number };
  enum?: string[];
  default?: JSONValue;
  description?: string;
}

export type CompactPropertyBadge = { badge: string; label: string };

export type EdgeMarkerShape = 'none' | 'arrow' | 'arrow-open' | 'circle' | 'diamond' | 'bar';
export type EdgeMarkerSize = 'small' | 'medium' | 'large';
export type EdgeStyle = {
  color?: string;
  width?: number;
  arrow?: boolean;
  markerStart?: EdgeMarkerShape;
  markerEnd?: EdgeMarkerShape;
  markerSize?: EdgeMarkerSize;
};

export interface GraphSchema {
  nodeStyles: Record<string, { color?: string }>;
  edgeStyles: Record<string, EdgeStyle>;
  metadata?: Record<string, JSONValue>;
  nodeSizes?: Record<string, { radius?: number }>;
  nodeStroke?: Record<string, { color?: string; width?: number }>;
  labelStyles?: {
    fontSize?: number;
    color?: string;
    offset?: { dx?: number; dy?: number };
    halo?: { color?: string; width?: number };
  };
  nodeShapes?: Record<string, 'circle' | 'rect' | 'diamond' | 'hex' | 'image'>;
  edgeRouting?: { mode?: 'straight' | 'quadratic' | 'bundled'; curvatureByLabel?: Record<string, number> };
  rules: Array<{ target: 'node' | 'edge'; type?: string; required?: string[]; severity?: 'error' | 'warn' }>;
  validation?: {
    node?: Record<string, {
      required?: string[];
      types?: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'>;
      patterns?: Record<string, string>;
      ranges?: Record<string, { min?: number; max?: number }>;
      uniqueness?: string[];
      severity?: 'error' | 'warn';
    }>;
    edge?: Record<string, {
      required?: string[];
      types?: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'>;
      patterns?: Record<string, string>;
      ranges?: Record<string, { min?: number; max?: number }>;
      uniqueness?: string[];
      severity?: 'error' | 'warn';
    }>;
  };
  layout?: {
    mode?: 'force' | 'radial' | 'block' | 'mermaid';
    edges?: {
      type?: 'bezier' | 'straight' | 'step' | 'smoothstep'
      color?: string
      strokeWidthPx?: number
      animated?: boolean
      opacity?: number
      opacityUnderGroups?: number
    }
    flow?: {
      engine?: 'auto' | 'elk' | 'dagre' | 'grid'
      rankdir?: 'TB' | 'LR'
      elkLayout?: 'elk' | 'elk.layered' | 'elk.stress' | 'elk.force' | 'elk.mrtree'
      pack?: {
        paddingPxDocument?: number
        paddingPxKeyword?: number
      }
      collisionCaps?: {
        nodePaddingXMax?: number
        nodePaddingYMax?: number
        groupPaddingXMax?: number
        groupPaddingYMax?: number
        groupExtraGapPxMax?: number
        maxShiftPx?: number
      }
      overlay?: {
        collisionGapPx?: number
      }
      edges?: {
        routing?: {
          enabled?: boolean
          mode?: 'bezier' | 'ortho'
          obstacleAvoidance?: boolean
          marginPx?: number
          laneStepPx?: number
          maxLanes?: number
        }
        underlay?: {
          enabled?: boolean
          groupFadeAlpha?: number
        }
      }
    }
    forces?: {
      linkDistanceByLabel?: Record<string, number>;
      charge?: number;
      collisionByType?: Record<string, number>;
      centerStrength?: number;
      alphaDecay?: number;
      boxForce?: boolean;
      boxForceStrength?: number;
      boxForceAlphaMin?: number;
      disjointComponents?: boolean;
      disjointStrength?: number;
      antiLineForce?: boolean;
      antiLineStrength?: number;
      antiLineAlphaMin?: number;
      antiLineTickInterval?: number;
      bboxCollide?: boolean;
      bboxCollideStrength?: number;
      bboxCollidePadding?: number;
      bboxCollidePaddingX?: number;
      bboxCollidePaddingY?: number;
      bboxCollidePaddingZ?: number;
      bboxCollideBorderGapPx?: number;
      bboxCollideTouchEpsilonPx?: number;
      bboxCollideTouchEpsilonXPx?: number;
      bboxCollideTouchEpsilonYPx?: number;
      bboxCollideTouchEpsilonZPx?: number;
      bboxCollideZEnabled?: boolean;
      bboxCollideIterations?: number;
      groupBboxCollide?: boolean;
      groupBboxCollideStrength?: number;
      groupBboxCollidePadding?: number;
      groupBboxCollidePaddingX?: number;
      groupBboxCollidePaddingY?: number;
      groupBboxCollidePaddingZ?: number;
      groupBboxCollideBorderGapPx?: number;
      groupBboxCollideExtraGapPx?: number;
      groupBboxCollideExtraGapZPx?: number;
      groupBboxCollideTouchEpsilonPx?: number;
      groupBboxCollideTouchEpsilonXPx?: number;
      groupBboxCollideTouchEpsilonYPx?: number;
      groupBboxCollideTouchEpsilonZPx?: number;
      groupBboxCollideNestedTouchEpsilonPx?: number;
      groupBboxCollideNestedTouchEpsilonXPx?: number;
      groupBboxCollideNestedTouchEpsilonYPx?: number;
      groupBboxCollideNestedTouchEpsilonZPx?: number;
      groupBboxCollideZEnabled?: boolean;
      groupBboxCollideIterations?: number;
      structuredRelaxSteps?: number;
      postFitForce?: boolean;
      postFitStrength?: number;
      postFitAlphaMax?: number;

      physics2dChargeScale?: number;
      physics2dCollideStrengthScale?: number;
      physics2dBboxStrengthScale?: number;
      physics2dVelocityDecayBias?: number;
      physics2dMaxSpeedScale?: number;
      physics2dStrictOverlapScale?: number;
      physics2dLabelNudgeScale?: number;
      physics2dDragChargeScale?: number;
      physics2dDragDistanceMaxPx?: number;
      radarSpokeDistancePx?: number;
      radarFlowDistancePx?: number;
      radarFlowCurveBend?: number;
      radarFlowOrbitShift?: number;
      radarFlowArrowLengthPx?: number;
      radarFlowArrowHalfWidthPx?: number;
      radarNodeCharge?: number;
      radarHubCharge?: number;
      radarSpokeStrengthScale?: number;
      radarFlowStrengthScale?: number;
      radialOrbitEnabled?: boolean;
      radialOrbitSpeedDeg?: number;
      radialOrbitSize?: number;
      radialOrbitRingGapPx?: number;
      radialOrbitDepthSpeedScale?: number;
      radialOrbitMode?: 'flat' | 'solar' | 'atomic';
    };
    fitPadding?: number;
    fitDetectClusters?: boolean;
    fitTargetAspectRatio?: number;
    fitEnforceAspectRatio?: boolean;
    rectNodes?: {
      maxZoomMinimapWidthRatio?: number;
      maxZoomMinimapHeightRatio?: number;
    };
    groups?: {
      enabled?: boolean;
      shape?: 'rect' | 'geo';
      padding?: number;
      nestedPaddingStep?: number;
      cornerRadius?: number;
      labelPadding?: number;
      strokeWidth?: number;
      fillOpacity?: number;
      depthStyle?: {
        enabled?: boolean
        outerMaxBoostSteps?: number
        outerStrokeWidthStepPx?: number
        outerFillOpacityStep?: number
      }
    };
    mermaid?: {
      renderOrder?: Record<string, number>
    }
  };
  endpointMatrix?: Record<string, { sources: string[]; targets: string[] }>;
  cardinality?: {
    nodeType?: Record<string, { minEdges?: number; maxEdges?: number }>;
    edgeLabel?: Record<string, { maxPerNode?: number }>;
  };
  templates?: {
    node?: Record<string, Record<string, JSONValue>>;
    edge?: Record<string, Record<string, JSONValue>>;
  };
  performance?: {
    lod?: {
      hideLabelsBelowScale?: number;
    };
    zoom?: {
      minScale?: number
      maxScale?: number
      wheelBehavior?: 'pan' | 'zoom'
      panSpeed?: number
      zoomSpeed?: number
      steps?: number[]
    }
    caps?: { maxNodes?: number; maxEdges?: number };
    labelRelax?: {
      maxNodeLabels?: number
      maxNodesForRelax?: number
    }
  };
  accessibility?: { highContrast?: boolean };
  legend?: { showLegend?: boolean };
  behavior: GraphBehavior;
  serialization?: {
    predicatesByLabel?: Record<string, string>;
    typesByNode?: Record<string, string>;
    context?: Record<string, JSONValue>;
    version?: string;
  };
  catalog?: { nodeTypes: string[]; edgeLabels: string[] };
  propertySchemas?: {
    node?: Record<string, Record<string, PropertySpec>>;
    edge?: Record<string, Record<string, PropertySpec>>;
  };
  three?: {
    voxelAnimationEnabled?: boolean;
    linkDirectionalArrowLength?: number;
    linkOpacity?: number;
    edgeOpacityByLabel?: Record<string, number>;
    layerOpacityByLayer?: Record<string, number>;
    linkCurvature?: number;
    linkCurveRotation?: number;
    linkDirectionalArrowRelPos?: number;
    linkDirectionalParticles?: number;
    linkDirectionalParticleSpeed?: number;
    sphereRadius?: number;
    seed?: number;
    minSpacing?: number;
    voxelSeedScaleFactor?: number;
    voxelGridScaleFactor?: number;
    voxelLayerSpacing?: number;
    voxelLayerPlatesEnabled?: boolean;
    voxelLayerPlateOpacity?: number;
    voxelLayerPlateRiseDurationMs?: number;
    voxelLayerPlateRiseStaggerMs?: number;
    voxelClusterPulseEnabled?: boolean;
    voxelClusterPulseStrength?: number;
    voxelEdgeHoverOpacity?: number;
    voxelGapRingThreshold?: number;
    voxelIntroEnabled?: boolean;
    voxelIntroDelayMs?: number;
    voxelIntroDurationMs?: number;
    voxelDefaultYawDeg?: number;
    voxelDefaultTiltDeg?: number;
    voxelDefaultDistanceFactor?: number;
    voxelDefaultTargetLift?: number;
    voxelGhostOpacity?: number;
    voxelTopCapEmissiveIntensity?: number;
    voxelHubPulseStrength?: number;
    voxelConceptFloatStrength?: number;
    voxelClusterLightIntensity?: number;
    voxelDistrictsEnabled?: boolean;
    voxelDistrictPaddingCells?: number;
    voxelDistrictOpacity?: number;
    voxelDistrictHeight?: number;
    voxelBridgeTubeRadius?: number;
    voxelBridgeTubeOpacity?: number;
    voxelBridgeTubePulseStrength?: number;
    voxelBridgeArchHeightFactor?: number;
    voxelBridgeMaxTubes?: number;
    voxelBridgeParticlesEnabled?: boolean;
    voxelBridgeParticleDensity?: number;
    voxelBridgeParticleSpeed?: number;
    voxelBridgeParticleSize?: number;
    voxelBridgeParticlesMaxTotal?: number;
    voxelBridgeAmbientFieldEnabled?: boolean;
    voxelBridgeAmbientFieldParticlesPerDistrict?: number;
    voxelIdleAutoRotateDelayMs?: number;
    voxelIdleAutoRotateSpeed?: number;
    voxelLabelsEnabled?: boolean;
    voxelLabelOpacity?: number;
    voxelLabelFontSizePx?: number;
    voxelLabelMaxChars?: number;
    voxelLabelShowOnHoverOnly?: boolean;
    voxelLabelLift?: number;
    nodeMotionIntensity?: number;
    minimapOpacity?: number;
    starfieldEnabled?: boolean;
    starfieldCount?: number;
    starfieldRadius?: number;
    starfieldOpacity?: number;
    starfieldColor?: string;
    backgroundColor?: string;
    fogColor?: string;
    fogNear?: number;
    fogFar?: number;
    cameraDampingFactor?: number;
    cameraRotateSpeed?: number;
    cameraZoomSpeed?: number;
    cameraPanSpeed?: number;
    cameraAutoRotate?: boolean;
    cameraAutoRotateSpeed?: number;
    nodeSizingFormula?: 'schema' | 'importance';
    nodeImportanceSources?: string[];
    edgeWidthFormula?: 'schema' | 'weight';
    keywordNodeSizeScale?: number;
    keywordEdgeWidthScale?: number;
    globeEffectsEnabled?: boolean;
    globeParticleCount?: number;
    globeParticleSize?: number;
    globeParticleWaveSpeed?: number;
    globeParticleWaveAmplitude?: number;
    globeAtmosphereOpacity?: number;
    globeGridDensity?: number;
    globeOrbitRingCount?: number;
    globeToolNodeCount?: number;
    globeArcCount?: number;
    globeArcTravelerCount?: number;
    globeCorePulseStrength?: number;
    globeRippleStrength?: number;
    globeHubOrbitEnabled?: boolean;
    globeHubOrbitStrength?: number;
    globeHubOrbitSpeed?: number;
    globeHubOrbitRadiusFactor?: number;
    globeSphereEllipsoidX?: number;
    globeSphereEllipsoidY?: number;
    globeSphereEllipsoidZ?: number;
    globeLabelDepthFade?: boolean;
    globeLabelBackfaceCulling?: boolean;
    selection?: {
      selectedNodeGlowIntensity?: number;
      dimmedNodeOpacity?: number;
      dimmedEdgeOpacity?: number;
      selectedEdgeWidth?: number;
      selectedEdgeColor?: string;
    };
  };
}

export type ThreeConfig = Partial<NonNullable<GraphSchema['three']>>;

export type ThreeSelectionConfig = {
  selectedNodeGlowIntensity: number;
  dimmedNodeOpacity: number;
  dimmedEdgeOpacity: number;
  selectedEdgeWidth: number;
  selectedEdgeColor: string;
};

export type RendererPalette = {
  nodes: Record<string, string>;
  edges: Record<string, string>;
};
