import { LRUCache } from '@/lib/cache/LRUCache'
import { hashSignatureParts } from '@/lib/hash/signature'
import { hashStringToHexCached } from '@/lib/hash/textHashCache'
import { normalizeSemanticHtmlContainers } from '@/lib/html/semanticHtml'
import {
  RICH_MEDIA_TIMELINE_TRANSPORT_BROADCAST_CHANNEL,
  RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_ATTR,
  RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_MESSAGE,
  RICH_MEDIA_TIMELINE_TRANSPORT_PARENT_FRAME_KEY,
  RICH_MEDIA_TIMELINE_TRANSPORT_READY_MESSAGE,
} from '@/lib/render/richMediaTimelineSync'
import { resolveCssVarWithKgFallback } from '@/lib/ui/tokens-ssot'
import { enhanceLegacyWebsiteCrawlTablePanelSrcDoc } from '@/lib/websites/websiteCrawlTablePanel'

export const RICH_MEDIA_PANEL_SRCDOC_ATTR = 'data-kg-rich-media-panel-srcdoc'
export const RICH_MEDIA_PANEL_SRCDOC_STYLE_ID = 'kg-rich-media-panel-srcdoc-reset'
export const RICH_MEDIA_PANEL_SRCDOC_RESIZE_SCRIPT_ID = 'kg-rich-media-panel-srcdoc-resize'
export const RICH_MEDIA_PANEL_SRCDOC_TIMELINE_SCRIPT_ID = 'kg-rich-media-panel-srcdoc-timeline-transport'
export const RICH_MEDIA_PANEL_SRCDOC_THEME_SCRIPT_ID = 'kg-rich-media-panel-srcdoc-theme'
export const RICH_MEDIA_PANEL_SRCDOC_THEME_MESSAGE = 'kg-rich-media-panel-srcdoc-theme'
export const RICH_MEDIA_PANEL_SRCDOC_SIZE_MESSAGE = 'kg-rich-media-panel-srcdoc-size'
export const RICH_MEDIA_PANEL_SRCDOC_SIZE_MODE_ATTR = 'data-kg-rich-media-panel-size'
export const RICH_MEDIA_PANEL_SRCDOC_SIZE_MODE_VIEWPORT = 'viewport'
export const RICH_MEDIA_PANEL_SRCDOC_SCROLL_OWNER_ATTR = 'data-kg-rich-media-panel-scroll-owner'
export const RICH_MEDIA_PANEL_SRCDOC_SCROLL_OWNER_PANEL = 'panel'

const richMediaPanelSrcDocCache = new LRUCache<string, string>(64, 2 * 60_000)
const TIMELINE_AWARE_VIDEO_AGENT_SRCDOC_MARKERS = [
  'data-composition-id="agentic-graph-video-agent-runtime"',
  "data-composition-id='agentic-graph-video-agent-runtime'",
  'data-kg-video-agent-dataset-panel',
  'data-kg-video-agent-frame-analysis',
  'data-kg-video-agent-source-playback',
  'data-kg-video-agent-stream-panel',
  'data-kg-video-agent-transcript-panel',
  'data-kg-website-crawl-table-panel="1"',
] as const

function escapeHtmlText(raw: unknown): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type RichMediaPanelSrcDocScrollOwner = 'media' | 'panel'

function buildRichMediaPanelSrcDocResetStyle(scrollOwner: RichMediaPanelSrcDocScrollOwner): string {
  const text = resolveCssVarWithKgFallback('--kg-text-primary')
  const topLevelFrameSelector = 'body>:is(main,section,article):first-child'
  const nestedRootFrameSelector = 'body>:is(main,section,article):first-child>:is(main,section,article):first-child'
  const flattenFrameStyle = 'display:block!important;width:100%!important;max-width:none!important;min-width:0!important;min-height:100%!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important'
  const mediaOwnedViewportStyle = scrollOwner === 'media'
    ? [
      'html,body{height:100%;min-height:0!important;overflow:hidden!important}',
      `${topLevelFrameSelector}{height:100%!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;scrollbar-gutter:stable}`,
    ].join('')
    : ''
  return [
    `<style id="${RICH_MEDIA_PANEL_SRCDOC_STYLE_ID}">`,
    ':root{color-scheme:light dark}',
    'html{box-sizing:border-box;width:100%;min-height:100%;background:transparent!important}',
    '*,*::before,*::after{box-sizing:inherit}',
    `body{margin:0!important;min-width:0;width:100%;min-height:100%;background:transparent!important;color:${text}}`,
    `${topLevelFrameSelector},${nestedRootFrameSelector}{${flattenFrameStyle}}`,
    mediaOwnedViewportStyle,
    'img,svg,video,canvas{max-width:100%}',
    '[data-kg-rich-media-markdown-srcdoc="1"] img{display:block;width:100%;height:auto;object-fit:contain}',
    '</style>',
  ].join('')
}

function usesViewportRichMediaPanelSrcDocSize(srcDoc: string): boolean {
  return new RegExp(`${RICH_MEDIA_PANEL_SRCDOC_SIZE_MODE_ATTR}=["']${RICH_MEDIA_PANEL_SRCDOC_SIZE_MODE_VIEWPORT}["']`, 'i').test(srcDoc)
    || /data-composition-id=["']agentic-graph-video-agent-runtime["']|data-kg-video-agent-(?:dataset-panel|frame-analysis|source-playback|stream-panel|transcript-panel)\b/i.test(srcDoc)
}

function requestsPanelOwnedRichMediaPanelSrcDocScroll(srcDoc: string): boolean {
  return new RegExp(`${RICH_MEDIA_PANEL_SRCDOC_SCROLL_OWNER_ATTR}=["']${RICH_MEDIA_PANEL_SRCDOC_SCROLL_OWNER_PANEL}["']`, 'i').test(srcDoc)
}

function requestsMediaOwnedRichMediaPanelSrcDocScroll(srcDoc: string): boolean {
  return new RegExp(`${RICH_MEDIA_PANEL_SRCDOC_SCROLL_OWNER_ATTR}=["']media["']`, 'i').test(srcDoc)
}

function buildRichMediaPanelSrcDocResizeScript(args: { preserveDocumentOverflow: boolean }): string {
  const overflowClamp = args.preserveDocumentOverflow
    ? ''
    : [
      'if(document.documentElement)document.documentElement.style.overflow="hidden";',
      'if(document.body)document.body.style.overflow="hidden";',
    ].join('')
  return [
    `<script id="${RICH_MEDIA_PANEL_SRCDOC_RESIZE_SCRIPT_ID}">`,
    '(function(){',
    `var type=${JSON.stringify(RICH_MEDIA_PANEL_SRCDOC_SIZE_MESSAGE)};`,
    'var raf=0,last="";',
    'function readSize(){',
    'var d=document.documentElement,b=document.body;',
    'var w=Math.ceil(Math.max(d?d.scrollWidth:0,b?b.scrollWidth:0,d?d.offsetWidth:0,b?b.offsetWidth:0,d?d.clientWidth:0,b?b.clientWidth:0));',
    'var h=Math.ceil(Math.max(d?d.scrollHeight:0,b?b.scrollHeight:0,d?d.offsetHeight:0,b?b.offsetHeight:0,d?d.clientHeight:0,b?b.clientHeight:0));',
    'return {width:w,height:h};',
    '}',
    'function send(){',
    'raf=0;',
    'try{',
    overflowClamp,
    'var s=readSize();',
    'if(!(s.width>0)||!(s.height>0))return;',
    'var sig=s.width+"x"+s.height;',
    'if(sig===last)return;',
    'last=sig;',
    'parent.postMessage({type:type,width:s.width,height:s.height},"*");',
    '}catch(e){}',
    '}',
    'function schedule(){if(raf)return;raf=requestAnimationFrame(send);}',
    'try{if(window.ResizeObserver){var ro=new ResizeObserver(schedule);if(document.documentElement)ro.observe(document.documentElement);if(document.body)ro.observe(document.body);}}catch(e){}',
    'window.addEventListener("load",schedule,{passive:true});',
    'window.addEventListener("resize",schedule,{passive:true});',
    'if(document.fonts&&document.fonts.ready){try{document.fonts.ready.then(schedule).catch(function(){});}catch(e){}}',
    'schedule();setTimeout(schedule,60);setTimeout(schedule,240);setTimeout(schedule,900);',
    '})();',
    '</script>',
  ].join('')
}

function buildRichMediaPanelSrcDocThemeScript(): string {
  return [
    `<script id="${RICH_MEDIA_PANEL_SRCDOC_THEME_SCRIPT_ID}">`,
    '(function(){',
    `var type=${JSON.stringify(RICH_MEDIA_PANEL_SRCDOC_THEME_MESSAGE)};`,
    'function apply(raw){',
    'var theme=raw==="dark"?"dark":"light";',
    'var root=document.documentElement;if(!root)return;',
    'root.setAttribute("data-theme",theme);',
    'if(theme==="dark")root.classList.add("dark");else root.classList.remove("dark");',
    'try{root.style.colorScheme=theme;}catch(e){}',
    '}',
    'var initial="light";try{initial=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}catch(e){}',
    'apply(initial);',
    'window.addEventListener("message",function(event){var payload=event&&event.data;if(!payload||payload.type!==type)return;apply(payload.theme);});',
    '})();',
    '</script>',
  ].join('')
}

function buildRichMediaPanelSrcDocTimelineTransportScript(): string {
  return [
    `<script id="${RICH_MEDIA_PANEL_SRCDOC_TIMELINE_SCRIPT_ID}">`,
    '(function(){',
    'if(window.__AGENTIC_OS_RICH_MEDIA_TIMELINE_BRIDGE__)return;',
    'window.__AGENTIC_OS_RICH_MEDIA_TIMELINE_BRIDGE__=true;',
    `var messageType=${JSON.stringify(RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_MESSAGE)};`,
    `var readyType=${JSON.stringify(RICH_MEDIA_TIMELINE_TRANSPORT_READY_MESSAGE)};`,
    `var channelName=${JSON.stringify(RICH_MEDIA_TIMELINE_TRANSPORT_BROADCAST_CHANNEL)};`,
    `var frameAttr=${JSON.stringify(RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_ATTR)};`,
    `var parentFrameKey=${JSON.stringify(RICH_MEDIA_TIMELINE_TRANSPORT_PARENT_FRAME_KEY)};`,
    'var raf=0,pending=null,retry=0,nativeLoopActive=false,nativeLoopBaseTimeMs=0,nativeLoopBaseNowMs=0,nativeLoopRate=1;',
    'var lastParentFrameSignature="";',
    'var sourcePlaybackState=typeof WeakMap==="function"?new WeakMap():null;',
    'function cancel(){if(raf){cancelAnimationFrame(raf);raf=0;}nativeLoopActive=false;}',
    'function nowMs(){return performance&&typeof performance.now==="function"?performance.now():Date.now();}',
    'function dispatchFrame(timeMs){',
    'try{window.__AGENTIC_OS_RENDER_TIME_MS__=timeMs;}catch(e){}',
    'try{window.dispatchEvent(new CustomEvent("agentic-graph:render-frame",{detail:{timeMs:timeMs,seconds:timeMs/1000}}));}catch(e){}',
    '}',
    'function sourcePlaybackFrames(){return Array.prototype.slice.call(document.querySelectorAll("[data-kg-video-agent-source-playback] iframe"));}',
    'function isYouTubeFrame(frame){var src=String(frame&&frame.getAttribute("src")||"");return /youtube(?:-nocookie)?\\.com\\/embed\\//i.test(src);}',
    'function postYouTubeCommand(frame,func,args){try{if(frame&&frame.contentWindow)frame.contentWindow.postMessage(JSON.stringify({event:"command",func:func,args:args||[]}),"*");}catch(e){}}',
    'function readSourcePlaybackState(frame){return sourcePlaybackState?sourcePlaybackState.get(frame)||{}:frame.__kgSourcePlaybackState||{};}',
    'function writeSourcePlaybackState(frame,state){if(sourcePlaybackState)sourcePlaybackState.set(frame,state);else frame.__kgSourcePlaybackState=state;}',
    'function shouldSeekSourcePlayback(state,timeMs,playing,rate){',
    'if(!state||!Number.isFinite(Number(state.timeMs)))return true;',
    'if(!playing)return Math.abs((Number(state.timeMs)||0)-timeMs)>120;',
    'if(state.playing!==playing)return Math.abs((Number(state.timeMs)||0)-timeMs)>250;',
    'var projected=(Number(state.timeMs)||0)+Math.max(0,nowMs()-(Number(state.nowMs)||0))*(Number(state.rate)||1);',
    'return Math.abs(projected-timeMs)>750;',
    '}',
    'function syncSourcePlayback(payload,timeMs){',
    'var frames=sourcePlaybackFrames();',
    'if(!frames.length)return;',
    'var playing=payload&&payload.playing===true;',
    'var rate=Number.isFinite(Number(payload&&payload.playbackRate))&&Number(payload.playbackRate)>0?Number(payload.playbackRate):1;',
    'var seconds=Math.max(0,timeMs/1000);',
    'for(var index=0;index<frames.length;index+=1){',
    'var frame=frames[index];',
    'if(!isYouTubeFrame(frame))continue;',
    'var state=readSourcePlaybackState(frame);',
    'var needsSeek=shouldSeekSourcePlayback(state,timeMs,playing,rate);',
    'var commandNow=nowMs();',
    'if(needsSeek)postYouTubeCommand(frame,"seekTo",[seconds,true]);',
    'if(state.rate!==rate)postYouTubeCommand(frame,"setPlaybackRate",[rate]);',
    'if(playing&&(state.commandPlaying!==true||commandNow-(Number(state.lastPlayCommandNowMs)||0)>1000))postYouTubeCommand(frame,"playVideo",[]);',
    'if(!playing&&state.commandPlaying!==false)postYouTubeCommand(frame,"pauseVideo",[]);',
    'writeSourcePlaybackState(frame,{timeMs:needsSeek?timeMs:Number(state.timeMs)||timeMs,nowMs:needsSeek?commandNow:Number(state.nowMs)||commandNow,lastSeekNowMs:needsSeek?commandNow:Number(state.lastSeekNowMs)||0,lastPlayCommandNowMs:playing?commandNow:Number(state.lastPlayCommandNowMs)||0,playing:playing,rate:rate,commandPlaying:playing});',
    '}',
    '}',
    'function render(timeMs){',
    'var fn=window.__agenticGraphRenderFrame;',
    'window.__AGENTIC_OS_RENDER_TIME_MS__=timeMs;',
    'if(typeof fn==="function"){try{fn(timeMs);}catch(e){};return true;}',
    'dispatchFrame(timeMs);',
    'return true;',
    '}',
    'function shouldRestartNativeLoop(timeMs,playbackRate){',
    'var rate=Number.isFinite(Number(playbackRate))&&Number(playbackRate)>0?Number(playbackRate):1;',
    'if(!nativeLoopActive||!raf)return true;',
    'if(rate!==nativeLoopRate)return true;',
    'var projected=nativeLoopBaseTimeMs+Math.max(0,nowMs()-nativeLoopBaseNowMs)*nativeLoopRate;',
    'return Math.abs(projected-timeMs)>250;',
    '}',
    'function applyPending(){',
    'if(window.__AGENTIC_OS_TIMELINE_TRANSPORT_NATIVE_LOOP__)return;',
    'var payload=pending||{timeMs:0,playing:false,playbackRate:1};',
    'var timeMs=Number.isFinite(Number(payload.timeMs))?Number(payload.timeMs):0;',
    'if(!render(timeMs)){',
    'if(retry>=120)return;',
    'retry+=1;',
    'requestAnimationFrame(applyPending);',
    'return;',
    '}',
    'retry=0;',
    'if(payload.sourcePlayback!==false)syncSourcePlayback(payload,timeMs);',
    'if(payload.playing){if(shouldRestartNativeLoop(timeMs,payload.playbackRate))start(timeMs,payload.playbackRate);}else{cancel();}',
    '}',
    'function start(startTimeMs,playbackRate){',
    'cancel();',
    'var baseTimeMs=Number.isFinite(Number(startTimeMs))?Math.max(0,Number(startTimeMs)):0;',
    'var rate=Number.isFinite(Number(playbackRate))&&Number(playbackRate)>0?Number(playbackRate):1;',
    'var nowFn=performance&&typeof performance.now==="function"?function(){return performance.now();}:function(){return Date.now();};',
    'var baseNow=nowFn();',
    'nativeLoopActive=true;nativeLoopBaseTimeMs=baseTimeMs;nativeLoopBaseNowMs=baseNow;nativeLoopRate=rate;',
    'function tick(){',
    'var nextTimeMs=baseTimeMs+Math.max(0,nowFn()-baseNow)*rate;',
    'if(!render(nextTimeMs)){cancel();return;}',
    'raf=requestAnimationFrame(tick);',
    '}',
    'raf=requestAnimationFrame(tick);',
    '}',
    'function receivePayload(payload){',
    'if(!payload||typeof payload!=="object"||payload.type!==messageType)return;',
    'if(window.__AGENTIC_OS_TIMELINE_TRANSPORT_NATIVE_LOOP__)return;',
    'pending=payload;',
    'applyPending();',
    '}',
    'window.addEventListener("message",function(event){',
    'receivePayload(event&&event.data);',
    '});',
    'try{if(typeof BroadcastChannel==="function"){var channel=new BroadcastChannel(channelName);channel.onmessage=function(event){receivePayload(event&&event.data);};}}catch(e){}',
    'function readParentFrame(){',
    'try{var parentWindow=window.parent;if(!parentWindow||parentWindow===window)return;var payload=parentWindow[parentFrameKey];',
    'if(!payload||typeof payload!=="object"||payload.type!==messageType)return;',
    'var signature=[payload.documentKey,payload.timeMs,payload.playing,payload.playbackRate,payload.sourcePlayback].join("|");',
    'if(signature===lastParentFrameSignature)return;lastParentFrameSignature=signature;receivePayload(payload);}catch(e){}',
    '}',
    'try{setInterval(readParentFrame,80);readParentFrame();}catch(e){}',
    'var lastFrameElementSignature="";',
    'function receiveSerializedFrame(raw){',
    'if(!raw)return;try{var payload=JSON.parse(String(raw));if(!payload||typeof payload!=="object"||payload.type!==messageType)return;',
    'var signature=[payload.documentKey,payload.timeMs,payload.playing,payload.playbackRate,payload.sourcePlayback].join("|");',
    'if(signature===lastFrameElementSignature)return;lastFrameElementSignature=signature;receivePayload(payload);}catch(e){}',
    '}',
    'function readFrameElement(){try{var element=window.frameElement;if(element&&element.getAttribute)receiveSerializedFrame(element.getAttribute(frameAttr));}catch(e){}}',
    'try{setInterval(readFrameElement,80);readFrameElement();}catch(e){}',
    'function announceReady(){try{if(window.parent&&window.parent!==window)window.parent.postMessage({type:readyType,title:document.title||""},"*");}catch(e){}}',
    'try{announceReady();setInterval(announceReady,1000);}catch(e){}',
    'window.addEventListener("load",function(){applyPending();},{passive:true});',
    'requestAnimationFrame(applyPending);',
    '})();',
    '</script>',
  ].join('')
}

function markHtmlElement(srcDoc: string): string {
  if (srcDoc.includes(`${RICH_MEDIA_PANEL_SRCDOC_ATTR}=`)) return srcDoc
  if (/<html\b/i.test(srcDoc)) {
    return srcDoc.replace(/<html\b/i, `<html ${RICH_MEDIA_PANEL_SRCDOC_ATTR}="1"`)
  }
  return srcDoc
}

function injectStyleIntoDocument(args: {
  srcDoc: string
  title: string
  style: string
  scrollOwner: RichMediaPanelSrcDocScrollOwner
}): string {
  const markedSrcDoc = markHtmlElement(args.srcDoc)
  const existingResetStylePattern = new RegExp(`<style\\b(?=[^>]*\\bid=["']${RICH_MEDIA_PANEL_SRCDOC_STYLE_ID}["'])[^>]*>[\\s\\S]*?<\\/style>`, 'i')
  const existingResizeScriptPattern = new RegExp(`<script\\b(?=[^>]*\\bid=["']${RICH_MEDIA_PANEL_SRCDOC_RESIZE_SCRIPT_ID}["'])[^>]*>[\\s\\S]*?<\\/script>`, 'i')
  const existingTimelineScriptPattern = new RegExp(`<script\\b(?=[^>]*\\bid=["']${RICH_MEDIA_PANEL_SRCDOC_TIMELINE_SCRIPT_ID}["'])[^>]*>[\\s\\S]*?<\\/script>`, 'i')
  const existingThemeScriptPattern = new RegExp(`<script\\b(?=[^>]*\\bid=["']${RICH_MEDIA_PANEL_SRCDOC_THEME_SCRIPT_ID}["'])[^>]*>[\\s\\S]*?<\\/script>`, 'i')
  const script = `${buildRichMediaPanelSrcDocThemeScript()}${buildRichMediaPanelSrcDocResizeScript({
    preserveDocumentOverflow: args.scrollOwner === 'media',
  })}${buildRichMediaPanelSrcDocTimelineTransportScript()}`
  const srcDoc = markedSrcDoc
    .replace(existingResetStylePattern, '')
    .replace(existingResizeScriptPattern, '')
    .replace(existingTimelineScriptPattern, '')
    .replace(existingThemeScriptPattern, '')
  if (/<\/head\s*>/i.test(srcDoc)) return srcDoc.replace(/<\/head\s*>/i, `${args.style}${script}</head>`)
  if (/<head\b[^>]*>/i.test(srcDoc)) return srcDoc.replace(/<head\b[^>]*>/i, match => `${match}${args.style}${script}`)
  if (/<html\b[^>]*>/i.test(srcDoc)) {
    return srcDoc.replace(/<html\b[^>]*>/i, match => `${match}<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtmlText(args.title)}</title>${args.style}${script}</head>`)
  }
  return [
    '<!doctype html>',
    `<html ${RICH_MEDIA_PANEL_SRCDOC_ATTR}="1">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtmlText(args.title)}</title>`,
    args.style,
    script,
    '</head>',
    '<body>',
    srcDoc,
    '</body>',
    '</html>',
  ].join('')
}

export function normalizeRichMediaPanelInlineSrcDoc(args: {
  srcDoc: unknown
  title?: unknown
  scrollOwner?: RichMediaPanelSrcDocScrollOwner
}): string {
  const srcDoc = typeof args.srcDoc === 'string' ? args.srcDoc.trim() : ''
  if (!srcDoc) return ''
  const title = String(args.title || '').trim() || 'Rich Media Panel'
  const semanticSrcDoc = enhanceLegacyWebsiteCrawlTablePanelSrcDoc(normalizeSemanticHtmlContainers(srcDoc))
  const scrollOwner = args.scrollOwner
    || (requestsPanelOwnedRichMediaPanelSrcDocScroll(semanticSrcDoc)
      ? 'panel'
      : requestsMediaOwnedRichMediaPanelSrcDocScroll(semanticSrcDoc) || usesViewportRichMediaPanelSrcDocSize(semanticSrcDoc)
        ? 'media'
        : 'panel')
  const srcDocHash = hashStringToHexCached('rich-media-panel-srcdoc', semanticSrcDoc)
  const cacheKey = hashSignatureParts(['rich-media-panel-srcdoc', title, scrollOwner, semanticSrcDoc.length, srcDocHash])
  const cached = richMediaPanelSrcDocCache.get(cacheKey)
  if (cached) return cached
  const normalized = injectStyleIntoDocument({
    srcDoc: semanticSrcDoc,
    title,
    style: buildRichMediaPanelSrcDocResetStyle(scrollOwner),
    scrollOwner,
  })
  richMediaPanelSrcDocCache.set(cacheKey, normalized)
  return normalized
}

export function shouldUseViewportRichMediaPanelSrcDocSize(srcDoc: string): boolean {
  return usesViewportRichMediaPanelSrcDocSize(srcDoc)
}

export function shouldUsePanelOwnedRichMediaPanelSrcDocScroll(srcDoc: string): boolean {
  return requestsPanelOwnedRichMediaPanelSrcDocScroll(srcDoc)
}

export function shouldUseMediaOwnedRichMediaPanelSrcDocScroll(srcDoc: string): boolean {
  return requestsMediaOwnedRichMediaPanelSrcDocScroll(srcDoc)
}

export function shouldUseDirectRichMediaPanelSrcDocSandbox(srcDoc: unknown): boolean {
  const text = String(srcDoc || '')
  return TIMELINE_AWARE_VIDEO_AGENT_SRCDOC_MARKERS.some(marker => text.includes(marker))
}
