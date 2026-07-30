export function FlightSimWebglUnsupportedState() {
  return (
    <p
      className="absolute inset-0 grid place-items-center bg-sky-950 px-6 text-center text-sm font-semibold text-rose-100"
      data-kg-flight-sim-error="webgl-unsupported"
      role="alert"
    >
      Flight Sim requires WebGL, but this browser could not create a local WebGL context.
    </p>
  )
}
