/** Local foreground runs in crop pixels; these describe visible shape, never recovered depth. */
export type TwinSilhouette = Readonly<{
  width: number; height: number; runs: readonly (readonly [x: number, y: number, length: number])[]
}>

/** Unite focused foreground masks in the saved entity's crop frame; retain empty pixels and holes. */
export function combineRegionSilhouettes(proposals: readonly { region: { x: number; y: number; width: number; height: number }; silhouette?: TwinSilhouette }[],
  region: { x: number; y: number; width: number; height: number }, width: number, height: number): TwinSilhouette {
  if (![width, height].every(n => Number.isInteger(n) && n >= 3 && n <= 192)
    || ![region.x, region.y, region.width, region.height].every(Number.isFinite)
    || region.width <= 0 || region.height <= 0) throw Error('Invalid contour crop frame.')
  const mask = new Uint8Array(width * height)
  for (const item of proposals) {
    if (!item.silhouette) continue
    const shape = validateTwinSilhouette(item.silhouette)
    for (const [x, y, length] of shape.runs) {
      const left = Math.round(((item.region.x - region.x) + x / shape.width * item.region.width) / region.width * width)
      const right = Math.round(((item.region.x - region.x) + (x + length) / shape.width * item.region.width) / region.width * width)
      const top = Math.round(((item.region.y - region.y) + y / shape.height * item.region.height) / region.height * height)
      const bottom = Math.round(((item.region.y - region.y) + (y + 1) / shape.height * item.region.height) / region.height * height)
      for (let row = Math.max(0, top); row < Math.min(height, bottom); row++)
        for (let col = Math.max(0, left); col < Math.min(width, right); col++) mask[row * width + col] = 1
    }
  }
  const runs: [number, number, number][] = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width;) {
    if (!mask[y * width + x]) { x++; continue }
    const start = x
    while (x < width && mask[y * width + x]) x++
    runs.push([start, y, x - start])
  }
  return validateTwinSilhouette({ width, height, runs })
}

export function validateTwinSilhouette(value: unknown): TwinSilhouette {
  const shape = value as TwinSilhouette
  if (!shape || typeof shape !== 'object' || Object.keys(shape).some(key => !['width', 'height', 'runs'].includes(key))
    || ![shape.width, shape.height].every(n => Number.isInteger(n) && n >= 3 && n <= 192)
    || !Array.isArray(shape.runs) || !shape.runs.length || shape.runs.length > 2048) {
    throw Error('Visible shape needs a bounded local silhouette.')
  }
  let previousEnd = -1
  for (const run of shape.runs) {
    if (!Array.isArray(run) || run.length !== 3 || !run.every(Number.isInteger)) throw Error('Invalid silhouette run.')
    const [x, y, length] = run, start = y * shape.width + x
    if (x < 0 || y < 0 || y >= shape.height || length < 1 || x + length > shape.width || start <= previousEnd) {
      throw Error('Silhouette runs must be ordered, disjoint and inside the crop.')
    }
    previousEnd = start + length - 1
  }
  return shape
}

/** Recreate a small transparent reference for the existing contour reconstruction owner. */
export function silhouettePixels(input: TwinSilhouette, color: string) {
  const shape = validateTwinSilhouette(input)
  if (!/^#[a-f0-9]{6}$/i.test(color)) throw Error('Invalid silhouette colour.')
  // Padding preserves transparent-background isolation even for a completely filled crop.
  const width = shape.width + 2, height = shape.height + 2
  const data = new Uint8ClampedArray(width * height * 4)
  const rgb = [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16))
  for (const [x, y, length] of shape.runs) for (let offset = 0; offset < length; offset++) {
    data.set([...rgb, 255], ((y + 1) * width + x + offset + 1) * 4)
  }
  return { width, height, sourceWidth: width, sourceHeight: height, data }
}
