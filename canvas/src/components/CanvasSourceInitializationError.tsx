export function CanvasSourceInitializationError({ error }: { error: string | null }) {
  return (
    <section
      className="absolute inset-0 z-[90] flex items-center justify-center bg-[var(--kg-canvas-bg)] px-4"
      aria-label="Canvas source initialization error"
      data-kg-source-authority-error="1"
    >
      <section className="w-full max-w-md rounded border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] px-4 py-3 text-center shadow-none">
        <p className="text-sm font-medium text-[var(--kg-text-primary)]">Canvas source unavailable</p>
        <p className="mt-1 text-xs text-[var(--kg-text-secondary)]">{error}</p>
      </section>
    </section>
  )
}
