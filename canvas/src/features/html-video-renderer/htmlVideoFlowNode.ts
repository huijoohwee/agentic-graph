import type { WorkspaceFs } from '@/features/workspace-fs/types'
import type { GraphNode } from '@/lib/graph/types'
import type { HtmlVideoEngineRegistry } from './htmlVideoEngineRegistry'
import { runHtmlVideoRenderJob, type HtmlVideoRunResult } from './htmlVideoRenderJob'
import { validateRenderSpec } from './htmlVideoRendererSpec'

const readNodeProperties = (node: GraphNode): Record<string, unknown> => {
  return node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)
    ? node.properties as Record<string, unknown>
    : {}
}

const readInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isInteger(parsed)) return parsed
  }
  return undefined
}

const readDataJson = (value: unknown): Record<string, unknown> | undefined => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

export function buildHtmlVideoRenderSpecCandidateFromNode(node: GraphNode): Record<string, unknown> {
  const properties = readNodeProperties(node)
  const data = readDataJson(properties.data_json)
  const durationMs = readInteger(properties.duration_ms)
  const fps = readInteger(properties.fps)
  const width = readInteger(properties.width)
  const height = readInteger(properties.height)
  return {
    html: typeof properties.html === 'string' ? properties.html : '',
    ...(typeof properties.css === 'string' ? { css: properties.css } : {}),
    ...(data ? { data } : {}),
    ...(durationMs != null ? { durationMs } : {}),
    ...(fps != null ? { fps } : {}),
    ...(width != null ? { width } : {}),
    ...(height != null ? { height } : {}),
    ...(typeof properties.engine_hint === 'string' && properties.engine_hint.trim() ? { engineHint: properties.engine_hint.trim() } : {}),
  }
}

const escapeJsonForScript = (value: unknown): string => JSON.stringify(value ?? {}).replace(/</g, '\\u003c')

export function buildHtmlVideoPreviewSrcDocFromNode(node: GraphNode): string {
  const validation = validateRenderSpec(buildHtmlVideoRenderSpecCandidateFromNode(node))
  if (validation.ok === false) return ''
  const spec = validation.spec
  const previewFrameScript = [
    '<script>',
    '(function(){',
    'var frame=document.querySelector("[data-kg-html-video-preview-frame]");',
    'var stage=document.querySelector("[data-kg-html-video-preview-stage]");',
    'var dataScript=document.getElementById("agenticgraph-html-video-data");',
    `var sourceWidth=${JSON.stringify(spec.width)};`,
    `var sourceHeight=${JSON.stringify(spec.height)};`,
    `var durationMs=${JSON.stringify(spec.durationMs)};`,
    'var raf=0;',
    'function readData(){',
    'try{return dataScript&&dataScript.textContent?JSON.parse(dataScript.textContent):{};}catch(e){return {};}',
    '}',
    'function fit(){',
    'raf=0;',
    'if(!frame||!stage)return;',
    'var host=document.body||document.documentElement;',
    'var bounds=host.getBoundingClientRect();',
    'var width=Math.max(1,bounds.width||host.clientWidth||sourceWidth);',
    'var height=Math.max(1,bounds.height||host.clientHeight||sourceHeight);',
    'var frameWidth=Math.min(width,height*sourceWidth/sourceHeight);',
    'var frameHeight=frameWidth*sourceHeight/sourceWidth;',
    'if(frameHeight>height){frameHeight=height;frameWidth=frameHeight*sourceWidth/sourceHeight;}',
    'var scale=frameWidth/sourceWidth;',
    'frame.style.width=frameWidth+"px";',
    'frame.style.height=frameHeight+"px";',
    'stage.style.setProperty("--kg-html-video-preview-scale",String(scale));',
    'stage.style.setProperty("--kg-html-video-preview-width",sourceWidth+"px");',
    'stage.style.setProperty("--kg-html-video-preview-height",sourceHeight+"px");',
    '}',
    'function schedule(){if(raf)return;raf=requestAnimationFrame(fit);}',
    'function syncCssAnimations(seconds){',
    'if(!stage)return;',
    'var nodes=[stage].concat(Array.prototype.slice.call(stage.querySelectorAll("*")));',
    'for(var i=0;i<nodes.length;i+=1){',
    'var node=nodes[i];',
    'try{',
    'var computed=window.getComputedStyle(node);',
    'if(!computed||computed.animationName==="none")continue;',
    'node.style.animationDelay="-"+Math.max(0,seconds)+"s";',
    'node.style.animationPlayState="paused";',
    '}catch(e){}',
    '}',
    '}',
    'var transportRaf=0;',
    'function cancelTransportPlayback(){if(transportRaf){cancelAnimationFrame(transportRaf);transportRaf=0;}}',
    'function startTransportPlayback(startTimeMs,playbackRate){',
    'cancelTransportPlayback();',
    'var baseTimeMs=Number.isFinite(Number(startTimeMs))?Math.max(0,Number(startTimeMs)):0;',
    'var rate=Number.isFinite(Number(playbackRate))&&Number(playbackRate)>0?Number(playbackRate):1;',
    'var baseNow=performance.now();',
    'function tick(now){',
    'var nextTimeMs=Math.min(durationMs,baseTimeMs+Math.max(0,now-baseNow)*rate);',
    'window.__agenticgraphRenderFrame(nextTimeMs);',
    'if(nextTimeMs>=durationMs){transportRaf=0;return;}',
    'transportRaf=requestAnimationFrame(tick);',
    '}',
    'transportRaf=requestAnimationFrame(tick);',
    '}',
    'window.__AGENTICGRAPH_TIMELINE_TRANSPORT_NATIVE_LOOP__=true;',
    'window.__AGENTICGRAPH_HTML_VIDEO_DATA__=readData();',
    'window.__AGENTICGRAPH_RENDER_TIME_MS__=0;',
    'window.__agenticgraphRenderFrame=async function(timeMs){',
    'var safeTimeMs=Number.isFinite(Number(timeMs))?Math.max(0,Math.min(durationMs,Number(timeMs))):0;',
    'var seconds=safeTimeMs/1000;',
    'window.__AGENTICGRAPH_RENDER_TIME_MS__=safeTimeMs;',
    'document.documentElement.style.setProperty("--kg-render-time-ms",String(safeTimeMs));',
    'document.documentElement.style.setProperty("--kg-render-time-s",String(seconds));',
    'document.documentElement.style.setProperty("--kg-render-progress",String(durationMs>0?safeTimeMs/durationMs:0));',
    'try{if(typeof window.__hyperframesSeek==="function")window.__hyperframesSeek(seconds,{timeMs:safeTimeMs,data:window.__AGENTICGRAPH_HTML_VIDEO_DATA__});}catch(e){}',
    'try{if(Array.isArray(window.__timelines)){window.__timelines.forEach(function(timeline){if(timeline&&typeof timeline.seek==="function")timeline.seek(seconds,false);else if(timeline&&typeof timeline.time==="function")timeline.time(seconds);});}}catch(e){}',
    'syncCssAnimations(seconds);',
    'try{window.dispatchEvent(new CustomEvent("agenticgraph:render-frame",{detail:{timeMs:safeTimeMs,seconds:seconds,data:window.__AGENTICGRAPH_HTML_VIDEO_DATA__}}));}catch(e){}',
    'await new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});',
    '};',
    'window.__agenticgraphRenderFrame(0);',
    'window.addEventListener("message",function(event){',
    'var payload=event&&event.data;',
    'if(!payload||typeof payload!=="object"||payload.type!=="agenticgraph:timeline-transport-frame")return;',
    'var timeMs=Number.isFinite(Number(payload.timeMs))?Number(payload.timeMs):0;',
    'window.__agenticgraphRenderFrame(timeMs);',
    'if(payload.playing){startTransportPlayback(timeMs,payload.playbackRate);}else{cancelTransportPlayback();}',
    '});',
    'try{if(window.ResizeObserver&&frame){var ro=new ResizeObserver(schedule);ro.observe(frame);}}catch(e){}',
    'window.addEventListener("load",schedule,{passive:true});',
    'window.addEventListener("resize",schedule,{passive:true});',
    'schedule();setTimeout(schedule,80);setTimeout(schedule,280);',
    '})();',
    '</script>',
  ].join('')
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<style>',
    'html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;}',
    `body{display:grid;place-items:center;--kg-render-duration-ms:${spec.durationMs};--kg-render-fps:${spec.fps};--kg-html-video-preview-scale:1;--kg-html-video-preview-width:${spec.width}px;--kg-html-video-preview-height:${spec.height}px;}`,
    spec.css || '',
    `figure[data-kg-html-video-preview-frame]{position:relative;display:block;width:100%;height:auto;max-width:100%;max-height:100%;margin:0;overflow:hidden;background:transparent;aspect-ratio:${spec.width}/${spec.height};}`,
    `section[data-kg-html-video-preview-stage]{position:absolute;left:0;top:0;width:${spec.width}px;height:${spec.height}px;overflow:hidden;transform-origin:0 0;transform:scale(var(--kg-html-video-preview-scale,1));}`,
    '</style>',
    '</head>',
    '<body>',
    '<figure data-kg-html-video-preview-frame aria-label="HTML video preview frame">',
    '<section data-kg-html-video-preview-stage>',
    spec.html,
    '</section>',
    '</figure>',
    `<script type="application/json" id="agenticgraph-html-video-data">${escapeJsonForScript(spec.data ?? {})}</script>`,
    previewFrameScript,
    '</body>',
    '</html>',
  ].join('')
}

export async function runHtmlVideoFlowNode(args: {
  node: GraphNode
  registry: HtmlVideoEngineRegistry
  workspacePath?: string | null
  fs?: WorkspaceFs | null
}): Promise<HtmlVideoRunResult> {
  return runHtmlVideoRenderJob({
    spec: buildHtmlVideoRenderSpecCandidateFromNode(args.node),
    node: args.node,
    registry: args.registry,
    workspacePath: args.workspacePath,
    fs: args.fs,
  })
}
