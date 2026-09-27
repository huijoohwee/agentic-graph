/** Metres, Y-up. Shell dimensions are specified; running gear and drone002 are visual assumptions. */
export const CHARGE_TRUCK_DIMENSIONS = Object.freeze({
  shell: [0.22, 0.09, 0.16] as const,
  bay: [0.214, 0.084, 0.154] as const,
  wall: 0.003,
  trackWidth: 0.022,
  trackHeight: 0.045,
  antennaHeight: 0.042,
  closedAssembly: [0.24, 0.132, 0.204] as const,
})
export const DRONE002_DIMENSIONS = Object.freeze({
  size: [0.14, 0.052, 0.14] as const,
  motorOffset: 0.045,
  rotorRadius: 0.025,
  dockedBaseY: 0.004,
  clearanceBaseY: 0.18,
  measured: false,
  cameraFixture: 'planned visual fixture; not verified on the photographed board',
})
export function chargeTruckLidAngle(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(Math.PI / 2, value)) : 0
}
/** Open leaves rise above the specified shell; attached running gear has its own envelope. */
export function chargeTruckAssemblySize(lidAngleRadians = 0): readonly [number, number, number] {
  const angle = chargeTruckLidAngle(lidAngleRadians), { shell, closedAssembly, wall } = CHARGE_TRUCK_DIMENSIONS
  return [closedAssembly[0], Math.max(closedAssembly[1], shell[1] + shell[2] / 2 * Math.sin(angle) + wall / 2), closedAssembly[2]]
}

/** Shared hinge/leaf coordinates are consumed by the rendered model and geometry checks. */
export function chargeTruckLidPose(side: -1 | 1, lidAngleRadians: number) {
  const [length, height, width] = CHARGE_TRUCK_DIMENSIONS.shell, wall = CHARGE_TRUCK_DIMENSIONS.wall
  return { hinge: [0, height, side * width / 2] as const, rotationX: side * chargeTruckLidAngle(lidAngleRadians),
    leafCenter: [0, -wall / 2, -side * width / 4] as const, leafSize: [length, wall, width / 2] as const }
}
