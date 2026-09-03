const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

export const buildFrameAnalysisPanelBaseSrcDoc = (frameBoundingBoxes: ReadonlyArray<{ frameImageUrl?: unknown }>): string => {
  const firstFrameImageUrl = String(frameBoundingBoxes.find(box => String(box.frameImageUrl || '').trim())?.frameImageUrl || '').trim()
  return [
    '<main aria-label="Video agent frame analysis">',
    '<section class="thumbnail" aria-label="Timeline-synchronized frame-by-frame annotation">',
    `<img class="thumbnail-source" src="${escapeHtml(firstFrameImageUrl)}" alt="">`,
    '<section class="frame-boxes" aria-label="Frame-by-frame bounding boxes"></section>',
    '</section>',
    '</main>',
  ].join('')
}

export const buildVideoAgentStreamPanelSrcDoc = (args: {
  frameCount: number
  sourceUrl: string
  transcriptSegmentCount: number
}): string => [
  '<main data-kg-video-agent-stream-panel="1" aria-label="Video agent stream output">',
  '<section aria-label="Video agent stream contract">',
  '<h2>Stream output</h2>',
  `<p data-kg-video-agent-source-url="${escapeHtml(args.sourceUrl)}">Stream output stays separate from source playback and frame analysis while sharing the same timeline transport clock.</p>`,
  `<p><strong>${Math.max(0, args.frameCount)}</strong> frame samples, <strong>${Math.max(0, args.transcriptSegmentCount)}</strong> transcript windows.</p>`,
  '</section>',
  '<script>(function(){var root=document.querySelector("[data-kg-video-agent-stream-panel]");window.addEventListener("agentic-graph:render-frame",function(event){var timeMs=Number(event&&event.detail&&event.detail.timeMs)||0;if(root)root.setAttribute("data-kg-video-agent-render-time-ms",String(timeMs));});}());</script>',
  '</main>',
].join('')

export const buildVideoAgentSourcePlaybackPanelSrcDoc = (args: { sourcePlaybackUrl: string; sourceUrl: string }): string => [
  '<main data-kg-video-agent-source-playback-panel="1" data-kg-rich-media-panel-size="viewport" aria-label="Video agent source playback">',
  '<section data-kg-video-agent-source-playback="1" aria-label="Audio-capable source playback">',
  `<iframe title="Audio-capable source video playback" src="${escapeHtml(args.sourcePlaybackUrl || args.sourceUrl)}" allow="fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe>`,
  '</section>',
  '<footer data-kg-video-agent-source-playback-fallback="1" aria-label="Source playback fallback">',
  `<a href="${escapeHtml(args.sourceUrl)}" target="_blank" rel="noreferrer">Open source video</a>`,
  `<p data-kg-video-agent-source-url="${escapeHtml(args.sourceUrl)}">Fallback source link remains available if the upstream player blocks embedding.</p>`,
  '</footer>',
  '<style>main{box-sizing:border-box;display:grid;grid-template-rows:minmax(160px,1fr) auto;gap:8px;width:100%;min-height:100%;padding:10px;background:#07111f;color:#f8fafc;font-family:Inter,system-ui,sans-serif}section{min-height:0;border:1px solid #334155;border-radius:7px;overflow:hidden;background:#020617}iframe{display:block;width:100%;height:100%;border:0}footer{display:flex;align-items:center;gap:8px;min-width:0;border:1px solid #334155;border-radius:7px;background:#0f172a;padding:7px}footer a{color:#5eead4;font-size:12px;font-weight:800;text-decoration:none;white-space:nowrap}footer p{margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#cbd5e1;font-size:11px;line-height:1.35}</style>',
  '<script>(function(){var root=document.querySelector("[data-kg-video-agent-source-playback-panel]");window.addEventListener("agentic-graph:render-frame",function(event){var timeMs=Number(event&&event.detail&&event.detail.timeMs)||0;if(root)root.setAttribute("data-kg-video-agent-render-time-ms",String(timeMs));});}());</script>',
  '</main>',
].join('')
