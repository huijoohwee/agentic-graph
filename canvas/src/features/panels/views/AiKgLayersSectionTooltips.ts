import { buildDefaultTooltip, buildNumericTooltip } from 'agentic-design-system/hover/text'
import {
  COLLISION_RADIUS_DEFAULT,
  COLLISION_RADIUS_INTERVAL,
  COLLISION_RADIUS_MAX,
  COLLISION_RADIUS_MIN,
} from '@/features/panels/utils/orchestratorTraversal'

export const COLLISION_RADIUS_TOOLTIP = buildNumericTooltip({
  defaultValue: COLLISION_RADIUS_DEFAULT,
  min: COLLISION_RADIUS_MIN,
  max: COLLISION_RADIUS_MAX,
  interval: COLLISION_RADIUS_INTERVAL,
  impact:
    'Higher spreads nodes; lower keeps clusters tight near traversal paths.',
})

export const LAYER1_OPACITY_TOOLTIP = buildNumericTooltip({
  defaultValue: 1,
  min: 0.2,
  max: 1,
  interval: 0.05,
  impact:
    'Higher increases foreground opacity; lower fades top layer behind traversal overlays.',
})

export const LAYER2_OPACITY_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.9,
  min: 0.2,
  max: 1,
  interval: 0.05,
  impact:
    'Higher increases mid-layer opacity; lower fades context behind traversal highlights.',
})

export const LAYER3_OPACITY_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.8,
  min: 0.2,
  max: 1,
  interval: 0.05,
  impact:
    'Higher increases background opacity; lower makes traversal overlays stand out.',
})

export const CHARGE_STRENGTH_DEFAULT = 520
export const CHARGE_STRENGTH_MIN = 200
export const CHARGE_STRENGTH_MAX = 900
export const CHARGE_STRENGTH_INTERVAL = 20

export const CHARGE_STRENGTH_TOOLTIP = buildNumericTooltip({
  defaultValue: CHARGE_STRENGTH_DEFAULT,
  min: CHARGE_STRENGTH_MIN,
  max: CHARGE_STRENGTH_MAX,
  interval: CHARGE_STRENGTH_INTERVAL,
  impact:
    'Higher spreads clusters; lower keeps nodes denser around focus.',
})

export const SEMANTIC_TOPK_EDGES_TOOLTIP = buildNumericTooltip({
  defaultValue: 3,
  min: 0,
  max: 32,
  interval: 1,
  impact:
    'Higher values favor recall (more neighbors); lower values favor precision (sparser graph).',
})

export const SEMANTIC_MIN_SIMILARITY_TOOLTIP = buildNumericTooltip({
  defaultValue: 'metric-specific default (≈0.2 cosine, ≈0.15 pmi)',
  min: 0,
  max: 1,
  interval: 0.01,
  impact: 'Higher values favor precision (drop weak links); lower values favor recall.',
})

export const BOX_FORCE_ENABLED_VALUE_TOOLTIP = buildDefaultTooltip({
  defaultValue: true,
  impact: 'Enable to keep nodes on-screen; disable for unconstrained layouts.',
})

export const BOX_FORCE_STRENGTH_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.05,
  min: 0.01,
  max: 0.2,
  interval: 0.01,
  impact: 'Higher constrains nodes more; may distort natural force layouts.',
})
