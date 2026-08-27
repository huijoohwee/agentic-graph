import type { VideoAgentDatasetRuntime } from './videoAgentDatasetRuntime'

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const formatCounts = (counts: Record<string, number>, labels: ReadonlyMap<string, string>): string =>
  Object.entries(counts)
    .map(([zoneId, count]) => `${labels.get(zoneId) || zoneId}: ${count}`)
    .join(' | ')

export function buildVideoAgentDatasetPanelSrcDoc(datasetRuntime: VideoAgentDatasetRuntime): string {
  const { datasetOperationSummary, datasetSplitSummary, mergedVisualDataset, zoneCounting } = datasetRuntime
  const zoneLabels = new Map(zoneCounting.zones.map(zone => [zone.zoneId, zone.label]))
  const sampleById = new Map(mergedVisualDataset.samples.map(sample => [sample.sampleId, sample]))
  const operationItems = [
    ['Load', datasetOperationSummary.loadedSamples],
    ['Split', datasetSplitSummary.total],
    ['Merge', datasetOperationSummary.mergedSamples],
    ['Save', datasetOperationSummary.savedSamples],
  ].map(([label, value]) => `<li><span>${label}</span><strong>${value}</strong></li>`).join('')
  const splitItems = (['train', 'validation', 'test'] as const)
    .map(name => `<li><span>${name}</span><strong>${datasetSplitSummary[name]}</strong></li>`)
    .join('')
  const frameItems = zoneCounting.frames.map((frame, index) => {
    const sample = sampleById.get(frame.sampleId)
    const labels = sample?.annotations.map(annotation => annotation.label).join(', ') || 'No annotations'
    return [
      `<li data-kg-video-agent-dataset-frame="${frame.frameIndex}"${index === 0 ? '' : ' hidden'}>`,
      `<header><strong>Frame ${frame.frameIndex}</strong><time>${((frame.timestampMs || 0) / 1000).toFixed(1)}s</time></header>`,
      `<p>${escapeHtml(labels)}</p>`,
      `<output>${escapeHtml(formatCounts(frame.counts, zoneLabels))}</output>`,
      `<small>Cumulative: ${escapeHtml(formatCounts(frame.cumulativeCounts, zoneLabels))}</small>`,
      '</li>',
    ].join('')
  }).join('')
  const timing = JSON.stringify(zoneCounting.frames.map(frame => ({
    frameIndex: frame.frameIndex,
    timestampMs: frame.timestampMs || 0,
  }))).replace(/</g, '\\u003c')

  return [
    '<main data-kg-video-agent-dataset-panel="1" data-kg-rich-media-panel-size="viewport">',
    '<header><p>Native visual annotation runtime</p><h1>Dataset and zone counting</h1></header>',
    `<section aria-label="Dataset operations"><h2>Load, split, merge, save</h2><ol>${operationItems}</ol></section>`,
    `<section aria-label="Dataset splits"><h2>Deterministic splits</h2><ol>${splitItems}</ol></section>`,
    `<section aria-label="Real-time zone counting"><h2>Current frame</h2><ol>${frameItems}</ol></section>`,
    '</main>',
    '<style>',
    'main{box-sizing:border-box;display:grid;gap:12px;width:100%;min-height:100%;padding:16px;background:#07111f;color:#f8fafc;font-family:Inter,system-ui,sans-serif}',
    'header p,h1,h2,p{margin:0}header p{color:#5eead4;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}h1{font-size:24px}h2{font-size:13px;color:#cbd5e1}',
    'section{display:grid;gap:8px;border:1px solid #334155;border-radius:8px;background:#0f172a;padding:10px}ol{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:7px;margin:0;padding:0}li{list-style:none;display:grid;gap:4px;border:1px solid #334155;border-radius:7px;background:#111827;padding:8px}li span,li p,li small,time{color:#cbd5e1;font-size:11px}li strong{font-size:16px}li header{display:flex;justify-content:space-between;gap:8px}output{color:#fbbf24;font:11px ui-monospace,SFMono-Regular,Menlo,monospace}[hidden]{display:none!important}',
    '</style>',
    '<script>',
    `(function(){var frames=${timing};var root=document.querySelector('[data-kg-video-agent-dataset-panel="1"]');if(!root||!frames.length)return;function sync(rawTimeMs){var timeMs=Math.max(0,Number(rawTimeMs)||0);var active=frames[0];for(var index=0;index<frames.length;index+=1){if(frames[index].timestampMs<=timeMs)active=frames[index];else break;}root.querySelectorAll('[data-kg-video-agent-dataset-frame]').forEach(function(element){element.hidden=Number(element.getAttribute('data-kg-video-agent-dataset-frame'))!==active.frameIndex;});root.setAttribute('data-kg-video-agent-active-frame',String(active.frameIndex));}window.addEventListener('agenticgraph:render-frame',function(event){sync(event&&event.detail&&event.detail.timeMs);});sync(Number(window.__AGENTICGRAPH_RENDER_TIME_MS__)||0);}());`,
    '</script>',
  ].join('')
}
