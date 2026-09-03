import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { downloadBlob } from '@/lib/graph/save'
import { PanelField, PanelRangeInput, PanelSelect } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  buildGaussianSplatEditManifestBlob,
  buildOptimizedGaussianPlyBlob,
  gaussianSplatEditManifestFilename,
  optimizedGaussianPlyFilename,
  type GaussianSplatEditSettings,
  type GaussianSplatVisualization,
} from './gaussianSplatEditorModel'
import {
  readGaussianSplatEditorRuntime,
  resetGaussianSplatEditorSettings,
  subscribeGaussianSplatEditorRuntime,
  updateGaussianSplatEditorSettings,
} from './gaussianSplatEditorRuntime'

function countLabel(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('en-US')
}

function byteLabel(value: number): string {
  const bytes = Math.max(0, Number(value) || 0)
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`
}

function numberLabel(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) return value.toExponential(2)
  return value.toFixed(2)
}

function optimizedWorkspacePath(documentName: string): string {
  const normalized = String(documentName || '').trim().replace(/\\/g, '/')
  if (!normalized) return optimizedGaussianPlyFilename()
  return normalized.replace(/\.(?:md|markdown|ply|spz)$/i, '') + '.optimized.ply'
}

function setting<K extends keyof GaussianSplatEditSettings>(key: K, value: GaussianSplatEditSettings[K]): void {
  updateGaussianSplatEditorSettings({ [key]: value } as Pick<GaussianSplatEditSettings, K>)
}

export function GaussianSplatEditorSection({
  documentName,
  sourceFormat,
}: {
  documentName: string
  sourceFormat: string
}) {
  const { pushUiToast } = useGraphStore(useShallow(state => ({ pushUiToast: state.pushUiToast })))
  const runtime = React.useSyncExternalStore(
    subscribeGaussianSplatEditorRuntime,
    readGaussianSplatEditorRuntime,
    readGaussianSplatEditorRuntime,
  )
  const [publishing, setPublishing] = React.useState(false)
  const [publishedUrl, setPublishedUrl] = React.useState('')
  const inspection = runtime.inspection
  const unsupported = sourceFormat === 'spz'
  const editable = !unsupported && runtime.status === 'ready' && inspection?.editable === true && !!runtime.load

  React.useEffect(() => setPublishedUrl(''), [runtime.sceneKey, runtime.settings])

  const downloadOptimized = React.useCallback(() => {
    if (!editable) return
    try {
      const blob = buildOptimizedGaussianPlyBlob(runtime)
      downloadBlob(blob, optimizedGaussianPlyFilename(documentName))
      pushUiToast({
        id: 'xr:gaussian-splat:download',
        kind: 'success',
        message: `Downloaded ${countLabel(runtime.inspection?.visiblePointCount || 0)} optimized Gaussian splats.`,
      })
    } catch (error) {
      pushUiToast({ id: 'xr:gaussian-splat:download-error', kind: 'error', message: error instanceof Error ? error.message : 'Optimized PLY export failed.' })
    }
  }, [documentName, editable, pushUiToast, runtime])

  const exportManifest = React.useCallback(() => {
    if (!editable) return
    try {
      downloadBlob(buildGaussianSplatEditManifestBlob(runtime), gaussianSplatEditManifestFilename(documentName))
      pushUiToast({ id: 'xr:gaussian-splat:manifest', kind: 'success', message: 'Exported the provider-neutral Gaussian edit manifest.' })
    } catch (error) {
      pushUiToast({ id: 'xr:gaussian-splat:manifest-error', kind: 'error', message: error instanceof Error ? error.message : 'Edit manifest export failed.' })
    }
  }, [documentName, editable, pushUiToast, runtime])

  const publishOptimized = React.useCallback(async () => {
    if (!editable || publishing) return
    setPublishing(true)
    try {
      const blob = buildOptimizedGaussianPlyBlob(runtime)
      const { uploadGeneratedWorkspaceBlobToAgenticGraphStorage } = await import('@/features/source-files/sourceFilesBinaryStorage')
      const storage = await uploadGeneratedWorkspaceBlobToAgenticGraphStorage({
        workspacePath: optimizedWorkspacePath(documentName),
        blob,
      })
      if (storage) {
        setPublishedUrl(storage.publicUrl)
        pushUiToast({ id: 'xr:gaussian-splat:publish', kind: 'success', message: 'Published the optimized PLY through configured agentic-graph storage.' })
      } else {
        downloadBlob(blob, optimizedGaussianPlyFilename(documentName))
        pushUiToast({ id: 'xr:gaussian-splat:publish-local', kind: 'neutral', message: 'Storage is not configured; downloaded the publish-ready optimized PLY.' })
      }
    } catch (error) {
      pushUiToast({ id: 'xr:gaussian-splat:publish-error', kind: 'error', message: error instanceof Error ? error.message : 'Gaussian PLY publication failed.' })
    } finally {
      setPublishing(false)
    }
  }, [documentName, editable, publishing, pushUiToast, runtime])

  const statusCopy = unsupported
    ? 'SPZ is recognized but its decoder/editor is not available.'
    : runtime.status === 'loading'
      ? 'Loading source-owned Gaussian attributes…'
      : runtime.status === 'error'
        ? 'The spatial source could not be loaded.'
        : inspection && !inspection.editable
          ? 'This PLY has point positions but no complete Gaussian attributes.'
          : runtime.status === 'empty'
            ? 'Open a Gaussian PLY spatial-capture document to edit splats.'
            : `${countLabel(inspection?.visiblePointCount || 0)} splats in the current optimized view.`

  return (
    <section
      className={cn('space-y-3 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
      aria-label="XR Gaussian splat editor"
      data-kg-xr-gaussian-editor="1"
      data-kg-xr-gaussian-editor-status={unsupported ? 'unsupported' : runtime.status}
      data-kg-xr-gaussian-editor-editable={editable ? '1' : '0'}
      data-kg-xr-gaussian-editor-visualization={runtime.settings.visualization}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <section className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase">Gaussian Splat Studio</h3>
          <p className={cn('text-[11px]', UI_THEME_TOKENS.text.tertiary)}>{statusCopy}</p>
        </section>
        <output className={cn('rounded border px-2 py-1 text-[10px]', UI_THEME_TOKENS.panel.border)}>
          {inspection ? `${inspection.fidelity} · ${inspection.source}` : sourceFormat.toUpperCase()}
        </output>
      </header>

      {inspection ? (
        <section aria-label="Gaussian splat inspection" data-kg-xr-gaussian-inspect="1">
          <h4 className="text-[10px] font-semibold uppercase">Inspect</h4>
          <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
            <dt className={UI_THEME_TOKENS.text.tertiary}>Source / loaded</dt>
            <dd>{countLabel(inspection.sourcePointCount)} / {countLabel(inspection.loadedPointCount)}</dd>
            <dt className={UI_THEME_TOKENS.text.tertiary}>Eligible / visible</dt>
            <dd data-kg-xr-gaussian-visible-count="1">{countLabel(inspection.eligiblePointCount)} / {countLabel(inspection.visiblePointCount)}</dd>
            <dt className={UI_THEME_TOKENS.text.tertiary}>Source / GPU estimate</dt>
            <dd>{byteLabel(inspection.byteLength)} / {byteLabel(inspection.estimatedGpuBytes)}</dd>
            <dt className={UI_THEME_TOKENS.text.tertiary}>Mean opacity / scale</dt>
            <dd>{numberLabel(inspection.meanOpacity)} / {numberLabel(inspection.meanScale)}</dd>
            <dt className={UI_THEME_TOKENS.text.tertiary}>Bounds extent</dt>
            <dd>{numberLabel(inspection.bounds.maxExtent)}</dd>
          </dl>
        </section>
      ) : null}

      <fieldset className="grid gap-2 sm:grid-cols-2" disabled={!editable} aria-label="Gaussian splat edits" data-kg-xr-gaussian-edit="1">
        <legend className="col-span-full text-[10px] font-semibold uppercase">Edit</legend>
        <PanelField label="Visualization">
          <PanelSelect
            value={runtime.settings.visualization}
            aria-label="Gaussian splat visualization"
            onChange={event => setting('visualization', event.target.value as GaussianSplatVisualization)}
          >
            <option value="render">Rendered splats</option>
            <option value="centers">Centers</option>
            <option value="rings">Footprint rings</option>
          </PanelSelect>
        </PanelField>
        <PanelField label={`Opacity floor ${runtime.settings.opacityFloor.toFixed(2)}`}>
          <PanelRangeInput min={0} max={0.95} step={0.01} value={runtime.settings.opacityFloor} aria-label="Gaussian opacity floor" onChange={event => setting('opacityFloor', Number(event.target.value))} />
        </PanelField>
        <PanelField label={`Crop inset ${Math.round(runtime.settings.cropInset * 100)}%`}>
          <PanelRangeInput min={0} max={0.45} step={0.01} value={runtime.settings.cropInset} aria-label="Gaussian crop inset" onChange={event => setting('cropInset', Number(event.target.value))} />
        </PanelField>
        <PanelField label={`Scale ceiling ${Math.round(runtime.settings.scaleCeilingRatio * 100)}%`}>
          <PanelRangeInput min={0.05} max={1} step={0.01} value={runtime.settings.scaleCeilingRatio} aria-label="Gaussian scale ceiling" onChange={event => setting('scaleCeilingRatio', Number(event.target.value))} />
        </PanelField>
        <PanelField label={`Brightness ${runtime.settings.brightness.toFixed(2)}`}>
          <PanelRangeInput min={0.25} max={2} step={0.05} value={runtime.settings.brightness} aria-label="Gaussian brightness" onChange={event => setting('brightness', Number(event.target.value))} />
        </PanelField>
        <PanelField label={`Saturation ${runtime.settings.saturation.toFixed(2)}`}>
          <PanelRangeInput min={0} max={2} step={0.05} value={runtime.settings.saturation} aria-label="Gaussian saturation" onChange={event => setting('saturation', Number(event.target.value))} />
        </PanelField>
      </fieldset>

      <fieldset className="space-y-1" disabled={!editable} aria-label="Gaussian splat optimization" data-kg-xr-gaussian-optimize="1">
        <legend className="text-[10px] font-semibold uppercase">Optimize</legend>
        <PanelField label={`Point budget ${Math.round(runtime.settings.pointBudgetRatio * 100)}% · ${countLabel(inspection?.visiblePointCount || 0)}`}>
          <PanelRangeInput min={0.05} max={1} step={0.01} value={runtime.settings.pointBudgetRatio} aria-label="Gaussian point budget" onChange={event => setting('pointBudgetRatio', Number(event.target.value))} />
        </PanelField>
      </fieldset>

      <section className="space-y-2" aria-label="Gaussian splat publication" data-kg-xr-gaussian-publish="1">
        <h4 className="text-[10px] font-semibold uppercase">Publish</h4>
        <nav className="flex flex-wrap gap-1">
          <button type="button" className="App-toolbar__btn" disabled={!editable} onClick={downloadOptimized} data-kg-xr-gaussian-download="1">Download optimized PLY</button>
          <button type="button" className="App-toolbar__btn" disabled={!editable} onClick={exportManifest} data-kg-xr-gaussian-manifest="1">Export edit manifest</button>
          <button type="button" className="App-toolbar__btn" disabled={!editable || publishing} onClick={() => void publishOptimized()} data-kg-xr-gaussian-publish-action="1">{publishing ? 'Publishing…' : 'Publish optimized PLY'}</button>
          <button type="button" className="App-toolbar__btn" disabled={!editable} onClick={resetGaussianSplatEditorSettings} data-kg-xr-gaussian-reset="1">Reset edits</button>
        </nav>
        {publishedUrl ? <a className="block truncate text-[11px] text-sky-600 underline" href={publishedUrl} target="_blank" rel="noreferrer" data-kg-xr-gaussian-published-url="1">Open published PLY</a> : null}
        <p className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>Publish uses configured agentic-graph storage only; otherwise the publish-ready PLY downloads locally.</p>
      </section>
    </section>
  )
}
