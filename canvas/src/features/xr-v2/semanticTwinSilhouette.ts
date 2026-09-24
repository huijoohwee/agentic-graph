/** Local foreground runs in crop pixels; these describe visible shape, never recovered depth. */
export type TwinSilhouette = Readonly<{
  width: number; height: number; runs: readonly (readonly [x: number, y: number, length: number])[]
}>

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
