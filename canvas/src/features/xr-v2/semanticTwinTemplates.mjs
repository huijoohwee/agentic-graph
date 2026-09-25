/** Shared by browser review/editor and the headless MCP contract. No renderer dependency. */
export const SEMANTIC_TWIN_PROCEDURAL_TEMPLATES = Object.freeze(/** @type {const} */ ([
  'chair', 'table', 'box', 'sphere', 'cylinder', 'building', 'tree',
  'sea', 'river', 'sky', 'cloud', 'moon', 'sun', 'landscape',
  'aircraft', 'ship', 'car',
]))

/** Presentation labels do not change saved template identities or headless invocations. */
export function semanticTwinTemplateLabel(template) {
  return ({ landscape: 'Land / terrain', sea: 'Sea / lake', river: 'River',
    aircraft: 'Aircraft', ship: 'Vessel / ship', car: 'Car',
    box: 'Box object', contour: 'Visible outline → 3D volume', relief: 'Whole-image surface relief',
  })[template] || template
}
