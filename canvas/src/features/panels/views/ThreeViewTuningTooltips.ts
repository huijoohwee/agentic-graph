import { buildNumericTooltip } from 'agentic-design-system/hover/text'

export const ARROW_LENGTH_TOOLTIP = buildNumericTooltip({
  defaultValue: 8,
  min: 2,
  max: 24,
  interval: 1,
  impact: 'Longer arrows make edge direction clearer; shorter arrows reduce clutter in dense graphs.',
})

export const LINK_OPACITY_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.6,
  min: 0,
  max: 1,
  interval: 0.05,
  impact: 'Higher opacity makes edges stand out; lower values keep background structure subtle.',
})

export const LINK_CURVATURE_TOOLTIP = buildNumericTooltip({
  defaultValue: 0,
  min: 0,
  max: 1.5,
  interval: 0.05,
  impact: 'Higher curvature separates overlapping edges; lower curvature keeps links straighter.',
})

export const CURVE_ROTATION_TOOLTIP = buildNumericTooltip({
  defaultValue: 0,
  min: -Math.PI,
  max: Math.PI,
  interval: 0.05,
  impact: 'Adjusts which side curves bow toward; extreme values can feel visually heavy or distracting.',
})

export const DIRECTIONAL_PARTICLES_TOOLTIP = buildNumericTooltip({
  defaultValue: 0,
  min: 0,
  max: 32,
  interval: 1,
  impact: 'More particles emphasize flow direction; zero hides animated edge particles entirely.',
})

export const ARROW_POSITION_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.85,
  min: 0.2,
  max: 1,
  interval: 0.05,
  impact: 'Higher values move arrows toward targets; lower values keep them nearer sources.',
})

export const PARTICLE_SPEED_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.6,
  min: 0.1,
  max: 2,
  interval: 0.05,
  impact: 'Higher speeds make flow animation faster; lower speeds favor calm, readable motion.',
})

export const SELECTED_EDGE_WIDTH_TOOLTIP = buildNumericTooltip({
  defaultValue: 3,
  min: 1,
  max: 6,
  interval: 0.25,
  impact: 'Thicker selected edges highlight focus paths; thinner edges reduce visual dominance.',
})

export const NODE_MOTION_TOOLTIP = buildNumericTooltip({
  defaultValue: 1,
  min: 0,
  max: 2,
  interval: 0.1,
  impact: 'Higher motion keeps nodes gently moving; zero disables idle motion entirely.',
})

export const MINIMAP_OPACITY_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.7,
  min: 0.2,
  max: 1,
  interval: 0.05,
  impact: 'Higher opacity makes minimap more visible; lower values keep the main canvas dominant.',
})

export const SPHERE_RADIUS_TOOLTIP = buildNumericTooltip({
  defaultValue: 120,
  min: 60,
  max: 260,
  interval: 5,
  impact: 'Larger radius spreads nodes outward; smaller radius packs the graph closer together.',
})

export const MIN_SPACING_TOOLTIP = buildNumericTooltip({
  defaultValue: 0,
  min: 0,
  max: 80,
  interval: 2,
  impact: 'Higher spacing separates nodes more; lower spacing allows tighter, denser layouts.',
})

export const LAYOUT_SEED_TOOLTIP = buildNumericTooltip({
  defaultValue: 1,
  impact: 'Changing seed tweaks layout randomness while keeping overall graph structure stable.',
})

export const VOXEL_SEED_SCALE_TOOLTIP = buildNumericTooltip({
  defaultValue: 1,
  min: 0.3,
  max: 3,
  interval: 0.05,
  impact: 'Scales how strongly voxel seed indexing follows 2D renderer buckets; higher values spread seed buckets farther apart.',
})

export const VOXEL_GRID_SCALE_TOOLTIP = buildNumericTooltip({
  defaultValue: 1,
  min: 0.3,
  max: 3,
  interval: 0.05,
  impact: 'Scales voxel grid step size in seeded and runtime snapping; higher values produce coarser block spacing.',
})

export const VOXEL_LAYER_SPACING_TOOLTIP = buildNumericTooltip({
  defaultValue: 84,
  min: 20,
  max: 800,
  interval: 4,
  impact: 'Controls vertical spacing between voxel layers; higher values separate plates more clearly.',
})

export const VOXEL_LAYER_PLATE_OPACITY_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.06,
  min: 0,
  max: 0.45,
  interval: 0.01,
  impact: 'Controls how visible layer plates are; lower values keep plates subtle behind nodes.',
})

export const VOXEL_LAYER_PLATE_RISE_DURATION_TOOLTIP = buildNumericTooltip({
  defaultValue: 900,
  min: 80,
  max: 6000,
  interval: 50,
  impact: 'Controls how long layer plates take to rise into place when voxel mode loads.',
})

export const VOXEL_LAYER_PLATE_RISE_STAGGER_TOOLTIP = buildNumericTooltip({
  defaultValue: 160,
  min: 0,
  max: 2000,
  interval: 20,
  impact: 'Controls per-layer delay for the rising sequence; higher values create a more staggered cascade.',
})

export const VOXEL_CLUSTER_PULSE_STRENGTH_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.22,
  min: 0,
  max: 1.2,
  interval: 0.02,
  impact: 'Controls breathing intensity of pulsing cluster rings in voxel mode.',
})

export const VOXEL_EDGE_HOVER_OPACITY_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.65,
  min: 0,
  max: 1,
  interval: 0.05,
  impact: 'Controls edge highlight opacity when hovering links in voxel mode.',
})

export const VOXEL_GAP_RING_THRESHOLD_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.85,
  min: 0,
  max: 1,
  interval: 0.01,
  impact: 'Controls which nodes show the gap ring based on gapScore (values at or above the threshold).',
})

export const VOXEL_INTRO_DELAY_TOOLTIP = buildNumericTooltip({
  defaultValue: 320,
  min: 0,
  max: 8000,
  interval: 50,
  impact: 'Delays voxel camera intro after entering voxel mode; useful for syncing with layer rise timing.',
})

export const VOXEL_INTRO_DURATION_TOOLTIP = buildNumericTooltip({
  defaultValue: 1100,
  min: 80,
  max: 8000,
  interval: 50,
  impact: 'Controls voxel camera intro transition duration toward the default pose.',
})

export const VOXEL_DEFAULT_YAW_TOOLTIP = buildNumericTooltip({
  defaultValue: -36,
  min: -180,
  max: 180,
  interval: 1,
  impact: 'Sets horizontal orbit angle of voxel default pose around the graph center.',
})

export const VOXEL_DEFAULT_TILT_TOOLTIP = buildNumericTooltip({
  defaultValue: 32,
  min: 5,
  max: 80,
  interval: 1,
  impact: 'Sets vertical tilt of voxel default pose; higher values look more top-down.',
})

export const VOXEL_DEFAULT_DISTANCE_FACTOR_TOOLTIP = buildNumericTooltip({
  defaultValue: 2.2,
  min: 0.8,
  max: 6,
  interval: 0.05,
  impact: 'Scales camera distance from voxel graph bounds for the default intro endpoint.',
})

export const VOXEL_DEFAULT_TARGET_LIFT_TOOLTIP = buildNumericTooltip({
  defaultValue: 8,
  min: -200,
  max: 200,
  interval: 1,
  impact: 'Offsets voxel camera target vertically to bias framing above or below layer center.',
})

export const VOXEL_GHOST_OPACITY_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.32,
  min: 0.05,
  max: 0.9,
  interval: 0.05,
  impact: 'Controls rollover ghost cube visibility; higher values increase hover emphasis.',
})

export const VOXEL_TOP_CAP_EMISSIVE_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.9,
  min: 0.2,
  max: 2.2,
  interval: 0.1,
  impact: 'Controls top accent cap glow intensity for voxel highlights.',
})

export const VOXEL_CLUSTER_LIGHT_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.7,
  min: 0,
  max: 2,
  interval: 0.1,
  impact: 'Controls neon point-light strength per cluster group in voxel mode.',
})

export const VOXEL_HUB_PULSE_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.07,
  min: 0,
  max: 0.5,
  interval: 0.01,
  impact: 'Controls breathing pulse amplitude for hub cubes in voxel mode.',
})

export const VOXEL_CONCEPT_FLOAT_TOOLTIP = buildNumericTooltip({
  defaultValue: 1,
  min: 0,
  max: 4,
  interval: 0.1,
  impact: 'Controls rotation-and-bob float strength for concept and grouped voxels.',
})

export const VOXEL_IDLE_ROTATE_DELAY_TOOLTIP = buildNumericTooltip({
  defaultValue: 900,
  min: 0,
  max: 6000,
  interval: 100,
  impact: 'Sets idle delay before orbit auto-rotation resumes after interaction.',
})

export const VOXEL_IDLE_ROTATE_SPEED_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.12,
  min: 0,
  max: 1.5,
  interval: 0.05,
  impact: 'Sets voxel idle auto-rotation speed while orbit controls are inactive.',
})

export const POLYGON_ELEVATION_TOOLTIP = buildNumericTooltip({
  defaultValue: -0.1,
  min: -5,
  max: 5,
  interval: 0.1,
  impact: 'Negative values sink cluster layers slightly under nodes; positive values lift them above.',
})

export const POLYGON_OPACITY_MULTIPLIER_TOOLTIP = buildNumericTooltip({
  defaultValue: 1,
  min: 0,
  max: 2,
  interval: 0.05,
  impact: 'Higher values make 3D cluster layer surfaces denser; lower values keep them faint and subtle.',
})

export const FOG_NEAR_TOOLTIP = buildNumericTooltip({
  defaultValue: 180,
  min: 50,
  max: 400,
  interval: 5,
  impact: 'Higher values start fog farther from the camera; lower values fade foreground sooner.',
})

export const FOG_FAR_TOOLTIP = buildNumericTooltip({
  defaultValue: 360,
  min: 80,
  max: 600,
  interval: 5,
  impact: 'Higher values push the fog horizon outward; lower values tighten the visible depth range.',
})

export const STAR_COUNT_TOOLTIP = buildNumericTooltip({
  defaultValue: 0,
  min: 0,
  max: 4000,
  interval: 100,
  impact: 'More stars create a denser background; fewer stars keep focus on the main graph.',
})

export const STARFIELD_RADIUS_TOOLTIP = buildNumericTooltip({
  defaultValue: 650,
  min: 60,
  max: 800,
  interval: 10,
  impact: 'Larger radius pushes stars farther out; smaller radius pulls them closer to the camera.',
})

export const STARFIELD_BRIGHTNESS_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.9,
  min: 0,
  max: 1,
  interval: 0.05,
  impact: 'Higher brightness makes stars pop; lower values keep the starfield subtle and soft.',
})

export const CAMERA_DAMPING_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.08,
  min: 0,
  max: 0.3,
  interval: 0.01,
  impact: 'Higher damping slows camera easing; lower damping feels snappier but less smooth.',
})

export const ROTATE_SPEED_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.6,
  min: 0.1,
  max: 2,
  interval: 0.05,
  impact: 'Higher rotate speed spins the scene faster; lower speed favors slow inspection.',
})

export const ZOOM_SPEED_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.8,
  min: 0.2,
  max: 2,
  interval: 0.05,
  impact: 'Higher zoom speed changes distance quickly; lower speed improves fine control.',
})

export const PAN_SPEED_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.5,
  min: 0.1,
  max: 2,
  interval: 0.05,
  impact: 'Higher pan speed moves the camera faster; lower speed helps precise positioning.',
})

export const SELECTED_NODE_GLOW_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.8,
  min: 0,
  max: 3,
  interval: 0.1,
  impact: 'Higher glow intensities make selected nodes brighter; lower values reduce halo strength.',
})

export const DIMMED_NODE_OPACITY_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.2,
  min: 0,
  max: 1,
  interval: 0.05,
  impact: 'Lower opacity fades unselected nodes more; higher values keep context visible.',
})

export const DIMMED_EDGE_OPACITY_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.2,
  min: 0,
  max: 1,
  interval: 0.05,
  impact: 'Lower opacity fades unselected edges; higher values keep surrounding connections clearer.',
})

export const GLOBE_PARTICLE_COUNT_TOOLTIP = buildNumericTooltip({
  defaultValue: 720,
  min: 0,
  max: 4000,
  interval: 20,
  impact: 'Higher values add denser Fibonacci surface particles; lower values reduce visual load.',
})

export const GLOBE_ATMOSPHERE_OPACITY_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.22,
  min: 0,
  max: 0.8,
  interval: 0.02,
  impact: 'Higher values increase atmospheric halo strength; lower values keep the globe edge cleaner.',
})

export const GLOBE_GRID_DENSITY_TOOLTIP = buildNumericTooltip({
  defaultValue: 12,
  min: 4,
  max: 36,
  interval: 1,
  impact: 'Higher density adds more latitude/longitude guides; lower density keeps the grid minimal.',
})

export const GLOBE_ORBIT_RING_COUNT_TOOLTIP = buildNumericTooltip({
  defaultValue: 4,
  min: 0,
  max: 10,
  interval: 1,
  impact: 'More rings increase orbital context and tool-node lanes; fewer rings simplify the scene.',
})

export const GLOBE_ARC_COUNT_TOOLTIP = buildNumericTooltip({
  defaultValue: 12,
  min: 0,
  max: 36,
  interval: 1,
  impact: 'Higher values draw more data-flow great-circle arcs; lower values reduce motion complexity.',
})

export const GLOBE_HUB_ORBIT_STRENGTH_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.22,
  min: 0,
  max: 1.8,
  interval: 0.02,
  impact: 'Higher strength keeps member nodes tighter around super-cluster hub orbit bands.',
})

export const GLOBE_HUB_ORBIT_SPEED_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.24,
  min: 0,
  max: 2.2,
  interval: 0.02,
  impact: 'Higher speed increases tangential orbit drift around hub anchors.',
})

export const GLOBE_HUB_ORBIT_RADIUS_TOOLTIP = buildNumericTooltip({
  defaultValue: 0.2,
  min: 0.05,
  max: 0.8,
  interval: 0.01,
  impact: 'Larger radius factor spreads member nodes further from hub anchor; smaller keeps compact hubs.',
})

export const GLOBE_ELLIPSOID_AXIS_TOOLTIP = buildNumericTooltip({
  defaultValue: 1,
  min: 0.5,
  max: 1.8,
  interval: 0.02,
  impact: 'Controls sphere-to-ellipsoid axis scaling for 3D node shell distribution.',
})
