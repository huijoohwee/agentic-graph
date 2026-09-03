import { buildRemoteVideoFrameRequestUrl } from 'grph-shared/rich-media/providers'

type VideoAgentFrameAnalysisBox = {
  bbox: readonly [number, number, number, number]
  confidence: number | null
  detectionIndex: number
  frameIndex: number
  label: string
  timestampMs: number
}

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const readFrameAnalysisBoxes = (value: unknown): readonly VideoAgentFrameAnalysisBox[] => {
  let candidate = value
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate)
    } catch {
      return []
    }
  }
  if (!Array.isArray(candidate)) return []
  const normalizeFrameAnalysisBox = (record: Record<string, unknown>, index: number, detectionIndex: number, fallback: Record<string, unknown>): VideoAgentFrameAnalysisBox[] => {
    const bbox = Array.isArray(record.bbox) ? record.bbox.map(Number) : []
    const timestampMs = Number(fallback.timestampMs ?? record.timestampMs)
    if (bbox.length !== 4 || bbox.some(entry => !Number.isFinite(entry)) || !Number.isFinite(timestampMs) || timestampMs < 0) return []
    const normalizedBox = bbox.map(entry => Math.min(1, Math.max(0, entry))) as [number, number, number, number]
    if (normalizedBox[2] <= 0 || normalizedBox[3] <= 0) return []
    const frameIndex = Number.isInteger(Number(fallback.frameIndex ?? record.frameIndex)) ? Number(fallback.frameIndex ?? record.frameIndex) : index
    const confidence = Number(record.confidence ?? fallback.confidence)
    return [{
      bbox: normalizedBox,
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : null,
      detectionIndex,
      frameIndex,
      label: String(record.label || fallback.label || 'detected object').trim() || 'detected object',
      timestampMs,
    }]
  }
  return candidate.flatMap((item, index): VideoAgentFrameAnalysisBox[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const detections = Array.isArray(record.detections) ? record.detections : []
    if (detections.length) {
      return detections.flatMap((detection, detectionIndex) => (
        detection && typeof detection === 'object' && !Array.isArray(detection)
          ? normalizeFrameAnalysisBox(detection as Record<string, unknown>, index, detectionIndex, record)
          : []
      ))
    }
    return normalizeFrameAnalysisBox(record, index, 0, record)
  }).sort((left, right) => left.timestampMs - right.timestampMs || left.frameIndex - right.frameIndex || left.detectionIndex - right.detectionIndex)
}

const readSourceUrlFromFrameRequest = (srcDoc: string): string => {
  const match = /(?:src=["'])?([^"'\s>]*\/__video_frame\?[^"'\s>]*)/i.exec(srcDoc)
  if (!match?.[1]) return ''
  try {
    const requestUrl = new URL(match[1].replace(/&amp;/g, '&'), 'http://localhost')
    return String(requestUrl.searchParams.get('url') || '').trim()
  } catch {
    return ''
  }
}

const buildFrameAnalysisRuntimeScript = (timing: string): string => [
  `(function(){var frames=${timing};var root=document.querySelector('[data-kg-video-agent-frame-analysis="1"]');if(!root||!frames.length)return;`,
  `if(root.parentElement)root.parentElement.setAttribute('data-kg-video-agent-projected','1');`,
  `var raf=0;var template=root.getAttribute('data-kg-video-agent-frame-url-template')||'';var refinedBoxes=Object.create(null);var componentBoxes=Object.create(null);`,
  `function frameSampleMs(){var min=0;for(var index=1;index<frames.length;index+=1){var delta=Number(frames[index].timestampMs)-Number(frames[index-1].timestampMs);if(delta>0&&(!min||delta<min))min=delta;}return min>0?Math.max(80,Math.min(180,min/3)):0;}`,
  `var sampleMs=frameSampleMs();`,
  `function formatSeconds(ms){var text=(Math.max(0,ms)/1000).toFixed(3);return text.replace(/0+$/,'').replace(/\\.$/,'');}`,
  `function frameState(timeMs){var t=Number.isFinite(timeMs)?Math.max(0,timeMs):0;for(var index=0;index<frames.length;index+=1){var current=frames[index];var next=frames[index+1]||current;if(t>=current.timestampMs&&t<current.endMs){var span=Math.max(1,Number(next.timestampMs)-Number(current.timestampMs));return{current:current,next:next,ratio:Math.max(0,Math.min(1,(t-current.timestampMs)/span))};}}var last=frames[frames.length-1];return{current:last,next:last,ratio:0};}`,
  `function clamp01(value){value=Number(value)||0;return Math.max(0,Math.min(1,value));}`,
  `function normalizeBox(box){return[clamp01(box&&box[0]),clamp01(box&&box[1]),Math.max(0.01,Math.min(1,Number(box&&box[2])||0)),Math.max(0.01,Math.min(1,Number(box&&box[3])||0))];}`,
  `function readFrameBox(frame,index){var boxes=frame&&Array.isArray(frame.boxes)?frame.boxes:[];return boxes[index]||boxes[0]||[0,0,0,0];}`,
  `function mixedBox(state,detectionIndex){var a=normalizeBox(readFrameBox(state.current,detectionIndex));var b=normalizeBox(readFrameBox(state.next,detectionIndex));var r=state.ratio||0;return[0,1,2,3].map(function(index){return a[index]+(b[index]-a[index])*r;});}`,
  `function buildScoreMap(data,width,height,base){var scores=new Float32Array(width*height);var centerX=base[0]+base[2]/2;var centerY=base[1]+base[3]/2;var maxScore=0;function lumaAt(px,py){var index=(py*width+px)*4;return data[index]*0.299+data[index+1]*0.587+data[index+2]*0.114;}for(var y=2;y<height-2;y+=1){for(var x=2;x<width-2;x+=1){var index=(y*width+x)*4;var red=data[index];var green=data[index+1];var blue=data[index+2];var high=Math.max(red,green,blue);var low=Math.min(red,green,blue);var sat=(high-low)/255;var luma=lumaAt(x,y);var edge=(Math.abs(luma-lumaAt(x-1,y))+Math.abs(luma-lumaAt(x+1,y))+Math.abs(luma-lumaAt(x,y-1))+Math.abs(luma-lumaAt(x,y+1)))/510;var nx=x/width;var ny=y/height;var prior=Math.max(0.12,1-(Math.abs(nx-centerX)/0.58+Math.abs(ny-centerY)/0.64));var subjectBand=ny<0.18?0.2:0.42+Math.pow(ny,1.1)*0.58;var score=edge*(0.38+sat)*(0.35+prior*0.75)*subjectBand;scores[y*width+x]=score;if(score>maxScore)maxScore=score;}}return{scores:scores,maxScore:maxScore};}`,
  `function readComponentCandidates(scoreMap,width,height,base){if(!(scoreMap.maxScore>0))return[];var scores=scoreMap.scores;var threshold=scoreMap.maxScore*0.34;var visited=new Uint8Array(width*height);var candidates=[];var queue=[];var centerX=base[0]+base[2]/2;var centerY=base[1]+base[3]/2;for(var start=0;start<scores.length;start+=1){if(visited[start]||scores[start]<threshold)continue;var minX=width;var minY=height;var maxX=0;var maxY=0;var total=0;var count=0;queue.length=0;queue.push(start);visited[start]=1;for(var head=0;head<queue.length;head+=1){var point=queue[head];var x=point%width;var y=Math.floor(point/width);var score=scores[point];if(score<threshold)continue;count+=1;total+=score;if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;var neighbors=[point-1,point+1,point-width,point+width];for(var n=0;n<neighbors.length;n+=1){var next=neighbors[n];if(next<0||next>=scores.length||visited[next])continue;var nx=next%width;if(Math.abs(nx-x)>1)continue;visited[next]=1;if(scores[next]>=threshold)queue.push(next);}}var boxWidth=maxX-minX+1;var boxHeight=maxY-minY+1;var area=(boxWidth*boxHeight)/(width*height);if(count<5||area<0.0015||area>0.48||boxWidth<4||boxHeight<4)continue;var cx=(minX+boxWidth/2)/width;var cy=(minY+boxHeight/2)/height;var prior=Math.max(0.12,1-(Math.abs(cx-centerX)/0.62+Math.abs(cy-centerY)/0.68));var compactness=Math.min(1,count/Math.max(1,boxWidth*boxHeight));var rank=total*(0.45+prior)*(0.45+compactness);candidates.push({minX:minX,minY:minY,maxX:maxX,maxY:maxY,rank:rank});}return candidates.sort(function(left,right){return right.rank-left.rank;});}`,
  `function readFrameComponents(img,frame){if(!img||!img.complete||!img.naturalWidth||!img.naturalHeight)return[];var key=String(frame.frameIndex)+':components:'+String(img.currentSrc||img.src||'');if(componentBoxes[key])return componentBoxes[key];try{var canvas=document.createElement('canvas');var width=180;var height=102;canvas.width=width;canvas.height=height;var ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return[];ctx.drawImage(img,0,0,width,height);var data=ctx.getImageData(0,0,width,height).data;var candidates=readComponentCandidates(buildScoreMap(data,width,height,[0,0.12,1,0.86]),width,height,[0,0.12,1,0.86]).slice(0,8).map(function(component){var marginX=Math.max(2,width*0.012);var marginY=Math.max(2,height*0.016);return[clamp01((component.minX-marginX)/width),clamp01((component.minY-marginY)/height),clamp01((component.maxX-component.minX+1+marginX*2)/width),clamp01((component.maxY-component.minY+1+marginY*2)/height)];});componentBoxes[key]=candidates;return candidates;}catch(error){return[];}}`,
  `function readSaliencyBox(img,frame,detectionIndex,fallback){if(!img||!img.complete||!img.naturalWidth||!img.naturalHeight)return null;var key=String(frame.frameIndex)+':'+String(detectionIndex)+':'+String(img.currentSrc||img.src||'');if(refinedBoxes[key])return refinedBoxes[key];try{var canvas=document.createElement('canvas');var width=160;var height=90;canvas.width=width;canvas.height=height;var ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return null;ctx.drawImage(img,0,0,width,height);var base=normalizeBox(fallback);var data=ctx.getImageData(0,0,width,height).data;var candidates=readComponentCandidates(buildScoreMap(data,width,height,base),width,height,base);if(!candidates.length)return null;var chosen=candidates[Math.min(candidates.length-1,Math.max(0,detectionIndex%candidates.length))];var marginX=Math.max(3,width*0.018);var marginY=Math.max(3,height*0.024);var refined=[clamp01((chosen.minX-marginX)/width),clamp01((chosen.minY-marginY)/height),clamp01((chosen.maxX-chosen.minX+1+marginX*2)/width),clamp01((chosen.maxY-chosen.minY+1+marginY*2)/height)];if(refined[2]<0.035||refined[3]<0.035||refined[2]>0.68||refined[3]>0.68)return null;var blended=[refined[0]*0.9+base[0]*0.1,refined[1]*0.9+base[1]*0.1,refined[2]*0.9+base[2]*0.1,refined[3]*0.9+base[3]*0.1];refinedBoxes[key]=blended;root.setAttribute('data-kg-video-agent-bbox-mode','component-refined');return blended;}catch(error){return null;}}`,
  `function applyBox(mark,state,img){var detectionIndex=Number(mark.getAttribute('data-kg-video-agent-detection-index'))||0;var fallback=mixedBox(state,detectionIndex);var refined=readSaliencyBox(img,state.current,detectionIndex,fallback);var box=refined||fallback;mark.style.left=(box[0]*100)+'%';mark.style.top=(box[1]*100)+'%';mark.style.width=(box[2]*100)+'%';mark.style.height=(box[3]*100)+'%';mark.setAttribute('data-kg-video-agent-bbox-refined',refined?'1':'0');}`,
  `function renderComponentMarks(img,state){var layer=root.querySelector('[data-kg-video-agent-frame-box-layer="1"]');if(!layer)return;layer.querySelectorAll('[data-kg-video-agent-component-mark="1"]').forEach(function(mark){mark.remove();});var boxes=readFrameComponents(img,state.current);boxes.forEach(function(box,index){var mark=document.createElement('mark');mark.setAttribute('data-kg-video-agent-frame',String(state.current.frameIndex));mark.setAttribute('data-kg-video-agent-component-mark','1');mark.setAttribute('data-kg-video-agent-bbox-refined','1');mark.style.left=(box[0]*100)+'%';mark.style.top=(box[1]*100)+'%';mark.style.width=(box[2]*100)+'%';mark.style.height=(box[3]*100)+'%';var span=document.createElement('span');span.textContent=(state.current.timestampMs/1000).toFixed(1)+'s component '+String(index+1);mark.appendChild(span);layer.appendChild(mark);});if(boxes.length)root.setAttribute('data-kg-video-agent-component-count',String(boxes.length));}`,
  `function updateFrameImage(img,timeMs){if(!img||!template||!(sampleMs>0))return;var bucket=Math.max(0,Math.round((Number(timeMs)||0)/sampleMs)*sampleMs);if(String(img.getAttribute('data-kg-video-agent-frame-time-ms')||'')===String(bucket))return;try{var url=new URL(template,'http://localhost');url.searchParams.set('time',formatSeconds(bucket));img.setAttribute('src',url.pathname+url.search);img.setAttribute('data-kg-video-agent-frame-time-ms',String(bucket));}catch(e){}}`,
  `function fitLayer(img){var layer=root.querySelector('[data-kg-video-agent-frame-box-layer="1"]');if(!layer)return;var w=root.clientWidth||root.getBoundingClientRect().width||0;var h=root.clientHeight||root.getBoundingClientRect().height||0;var nw=img&&img.naturalWidth?img.naturalWidth:16;var nh=img&&img.naturalHeight?img.naturalHeight:9;if(!(w>0)||!(h>0)||!(nw>0)||!(nh>0)){layer.style.inset='0';return;}var scale=Math.min(w/nw,h/nh);var vw=nw*scale;var vh=nh*scale;layer.style.left=((w-vw)/2)+'px';layer.style.top=((h-vh)/2)+'px';layer.style.width=vw+'px';layer.style.height=vh+'px';layer.style.right='auto';layer.style.bottom='auto';}`,
  `function sync(rawTimeMs){var timeMs=Number(rawTimeMs)||0;var state=frameState(timeMs);var active=state.current.frameIndex;root.setAttribute('data-kg-video-agent-frame-state',String(active));window.__AGENTIC_OS_RENDER_TIME_MS__=timeMs;root.querySelectorAll('[data-kg-video-agent-frame]').forEach(function(element){if(element.getAttribute('data-kg-video-agent-component-mark')==='1')return;element.hidden=Number(element.getAttribute('data-kg-video-agent-frame'))!==active;});var img=root.querySelector('li:not([hidden]) img');updateFrameImage(img,timeMs);fitLayer(img);root.querySelectorAll('mark[data-kg-video-agent-frame]').forEach(function(mark){if(mark.getAttribute('data-kg-video-agent-component-mark')==='1')return;if(Number(mark.getAttribute('data-kg-video-agent-frame'))===active)applyBox(mark,state,img);});renderComponentMarks(img,state);}`,
  `function schedule(){if(raf)return;var next=typeof requestAnimationFrame==='function'?requestAnimationFrame:function(fn){return setTimeout(fn,0);};raf=next(function(){raf=0;sync(Number(window.__AGENTIC_OS_RENDER_TIME_MS__)||0);});}`,
  `root.querySelectorAll('img').forEach(function(img){img.addEventListener('load',schedule,{passive:true});});`,
  `try{if(window.ResizeObserver){new ResizeObserver(schedule).observe(root);}}catch(e){}`,
  `window.addEventListener('resize',schedule,{passive:true});window.addEventListener('agentic-graph:render-frame',function(event){sync(Number(event&&event.detail&&event.detail.timeMs)||0);});sync(Number(window.__AGENTIC_OS_RENDER_TIME_MS__)||0);}());`,
].join('')

const buildFrameAnalysisMarkup = (
  boxes: readonly VideoAgentFrameAnalysisBox[],
  sourceUrl: string,
): string => {
  const frameBoxes = boxes.filter((box, index, all) => all.findIndex(entry => entry.frameIndex === box.frameIndex) === index)
  const images = frameBoxes.map(box => {
    const url = buildRemoteVideoFrameRequestUrl({
      sourceUrl,
      timeSeconds: box.timestampMs / 1000,
      format: 'png',
    })
    return `<li data-kg-video-agent-frame="${box.frameIndex}" hidden><img src="${escapeHtml(url)}" alt="" loading="eager" decoding="async"></li>`
  }).join('')
  const overlays = boxes.map(box => {
    const [x, y, width, height] = box.bbox
    const confidence = box.confidence == null ? '' : ` ${Math.round(box.confidence * 100)}%`
    return `<mark data-kg-video-agent-frame="${box.frameIndex}" data-kg-video-agent-detection-index="${box.detectionIndex}" hidden style="left:${x * 100}%;top:${y * 100}%;width:${width * 100}%;height:${height * 100}%"><span>${escapeHtml(`${(box.timestampMs / 1000).toFixed(1)}s ${box.label}${confidence}`)}</span></mark>`
  }).join('')
  const frameGroups = frameBoxes.map((box, index) => ({
    boxes: boxes.filter(entry => entry.frameIndex === box.frameIndex).map(entry => entry.bbox),
    frameIndex: box.frameIndex,
    timestampMs: box.timestampMs,
    endMs: frameBoxes[index + 1]?.timestampMs ?? Number.MAX_SAFE_INTEGER,
  }))
  const timing = JSON.stringify(frameGroups).replace(/</g, '\\u003c')
  const frameUrlTemplate = buildRemoteVideoFrameRequestUrl({
    sourceUrl,
    timeSeconds: 0,
    format: 'png',
  })
  return [
    `<section data-kg-video-agent-frame-analysis="1" data-kg-rich-media-panel-size="viewport" data-kg-video-agent-frame-url-template="${escapeHtml(frameUrlTemplate)}" aria-label="Timeline-synchronized frame analysis">`,
    `<ol aria-label="Source video frame sequence">${images}</ol>`,
    `<section data-kg-video-agent-frame-box-layer="1" aria-label="Active frame bounding boxes">${overlays}</section>`,
    '</section>',
    '<style>',
    '.thumbnail[data-kg-video-agent-projected="1"]{position:relative!important;display:block!important;overflow:hidden!important;aspect-ratio:16/9!important;min-height:180px;background:#020617}',
    '.thumbnail>[data-kg-video-agent-frame-analysis]{position:absolute;inset:0;z-index:2;overflow:hidden;background:#020617}',
    '.thumbnail>[data-kg-video-agent-frame-analysis]>ol,.thumbnail>[data-kg-video-agent-frame-analysis]>ol>li{position:absolute;inset:0;margin:0;padding:0;list-style:none}',
    '.thumbnail>[data-kg-video-agent-frame-analysis] img{width:100%;height:100%;object-fit:contain}',
    '.thumbnail>[data-kg-video-agent-frame-analysis]>section{position:absolute;inset:0;pointer-events:none}',
    '.thumbnail>[data-kg-video-agent-frame-analysis] mark{position:absolute;border:2px solid #fbbf24;border-radius:6px;background:rgba(251,191,36,.1);box-shadow:0 0 0 1px rgba(15,23,42,.7);transition:left 80ms linear,top 80ms linear,width 80ms linear,height 80ms linear}',
    '.thumbnail>[data-kg-video-agent-frame-analysis] mark[data-kg-video-agent-component-mark="1"]{border-color:#38bdf8;background:rgba(56,189,248,.08)}',
    '.thumbnail>[data-kg-video-agent-frame-analysis] mark[data-kg-video-agent-component-mark="1"] span{background:#38bdf8}',
    '.thumbnail>[data-kg-video-agent-frame-analysis] mark span{position:absolute;left:0;top:0;max-width:100%;border-radius:0 0 4px 0;background:#fbbf24;color:#1f2937;padding:2px 5px;font:10px ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.thumbnail>[data-kg-video-agent-frame-analysis] [hidden]{display:none!important}',
    '.thumbnail>[data-kg-video-agent-frame-analysis]~.thumbnail-source,.thumbnail>[data-kg-video-agent-frame-analysis]~.frame-boxes{display:none!important}',
    '.thumbnail[data-kg-video-agent-projected="1"]::before,.thumbnail[data-kg-video-agent-projected="1"]::after{display:none!important}',
    '</style>',
    '<script>',
    buildFrameAnalysisRuntimeScript(timing),
    '</script>',
  ].join('')
}

export const projectVideoAgentFrameAnalysisSrcDoc = (args: {
  frameBoundingBoxes: unknown
  srcDoc: string
}): string => {
  const srcDoc = String(args.srcDoc || '')
  if (!srcDoc || srcDoc.includes('data-kg-video-agent-frame-analysis=')) return srcDoc
  if (srcDoc.includes('data-composition-id="agentic-graph-video-agent-runtime"')) return srcDoc
  if (srcDoc.includes('class="frame-images"') && srcDoc.includes('data-frame-index=')) return srcDoc
  const boxes = readFrameAnalysisBoxes(args.frameBoundingBoxes)
  const sourceUrl = readSourceUrlFromFrameRequest(srcDoc)
  if (!boxes.length || !sourceUrl) return srcDoc
  const thumbnailStart = /<section\b(?=[^>]*\bclass=["'][^"']*\bthumbnail\b[^"']*["'])[^>]*>/i
  if (!thumbnailStart.test(srcDoc)) return srcDoc
  return srcDoc.replace(thumbnailStart, match => `${match}${buildFrameAnalysisMarkup(boxes, sourceUrl)}`)
}
