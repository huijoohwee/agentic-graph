/** Read-only consumer of GameXR's exported bench log; no control or transport handle. */
export const DRONE_BENCH_LOG_BYTES = 500_000
export type DroneBenchLogSummary = Readonly<{
  records: number; controlRequests: number; receiverReports: number; inhibitions: number
  lastSetpoint: Readonly<{ roll: number; pitch: number; yaw: number; throttle: number }> | null
}>

export function inspectDroneBenchLog(text: string): DroneBenchLogSummary {
  const reject = (): never => { throw new Error('Invalid GameXR simulated bench log (maximum 500 kB / 1,000 events).') }
  if (new TextEncoder().encode(text).byteLength > DRONE_BENCH_LOG_BYTES) reject()
  let log: any
  try { log = JSON.parse(text) } catch { reject() }
  const object = (value: any) => value && typeof value === 'object' && !Array.isArray(value)
  const profile = 'esp-drone-rpyt-bench/v1'
  if (!object(log) || log.schema !== 'gamexr-drone-bench-log/v1' || log.profile !== profile
    || log.physicalAircraft !== false || !Array.isArray(log.records) || log.records.length > 1000) reject()
  const axes = (value: any): NonNullable<DroneBenchLogSummary['lastSetpoint']> => {
    if (!object(value) || Object.keys(value).sort().join(',') !== 'pitch,roll,throttle,yaw') reject()
    for (const key of ['roll', 'pitch', 'yaw', 'throttle']) {
      if (typeof value[key] !== 'number' || !Number.isFinite(value[key])
        || value[key] < (key === 'throttle' ? 0 : -1) || value[key] > 1) reject()
    }
    return { roll: value.roll, pitch: value.pitch, yaw: value.yaw, throttle: value.throttle }
  }
  let controlRequests = 0, receiverReports = 0, inhibitions = 0
  let lastSetpoint: DroneBenchLogSummary['lastSetpoint'] = null
  for (const record of log.records) {
    if (!object(record) || typeof record.at !== 'string' || !Number.isFinite(Date.parse(record.at))) reject()
    const value = record.value
    if (record.event === 'inhibited') {
      if (typeof value !== 'string') reject()
      inhibitions++
    } else if (record.event === 'sent') {
      if (!object(value)) reject()
      if (value.kind === 'controls') {
        if (value.profile !== profile || !Number.isSafeInteger(value.sequence) || value.sequence < 1) reject()
        axes(value.axes); controlRequests++
      } else if (!['enable', 'disable'].includes(value.kind)) reject()
    } else if (record.event === 'status') {
      if (!object(value) || value.kind !== 'status' || value.backend !== 'simulated'
        || !['connected', 'owned', 'enabled'].every(key => typeof value[key] === 'boolean')) reject()
      if (value.telemetry !== null) {
        const telemetry = value.telemetry
        if (!object(telemetry) || telemetry.source !== 'simulated' || telemetry.profile !== profile
          || telemetry.motorOutputs !== false || telemetry.attitudeDegrees !== null || telemetry.batteryVolts !== null) reject()
        lastSetpoint = axes(telemetry.setpoint); receiverReports++
      }
    } else reject()
  }
  return Object.freeze({ records: log.records.length, controlRequests, receiverReports, inhibitions,
    lastSetpoint: lastSetpoint && Object.freeze(lastSetpoint) })
}
