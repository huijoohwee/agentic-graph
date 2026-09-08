import { LS_KEYS } from '../../config.ls'
import {
  HTML_VIEWER_RUNTIME_INPUT_NAMES,
  HTML_VIEWER_RUNTIME_FULL,
  HTML_VIEWER_RUNTIME_WITHOUT_3D_PAYLOAD,
} from './runtimeTemplate.compiled'

export type HtmlViewerRuntimeScriptArgs = {
  interactionCfgJson: string
  mediaNodesJson: string
  markdownBlocksJson: string
  nodeLabelByIdJson: string
  edgeMetaByIdJson: string
  frontmatterVisibilityJson: string
  initialFrontmatterEnabled?: boolean
  nodePosByIdJson: string
  groupMembersByIdJson: string
  density: 'default' | 'compact'
  widthRatioDefault: number
  widthRatioCompact: number
  widthMinDefault: number
  widthMinCompact: number
  widthMaxDefault: number
  widthMaxCompact: number
  proxyOrigin?: string
  allowRuntimeNetwork?: boolean
  /** Omitted or uncertain capability retains the complete runtime. */
  has3dPayload?: boolean
}

export function buildHtmlViewerRuntimeScript(args: HtmlViewerRuntimeScriptArgs): string {
  const safeMarkdownBlocksJson = (() => {
    const s = String(args.markdownBlocksJson || '').trim()
    if (!s) return '[]'
    try {
      const parsed = JSON.parse(s)
      return Array.isArray(parsed) ? s : '[]'
    } catch {
      return '[]'
    }
  })()
  const input: Record<(typeof HTML_VIEWER_RUNTIME_INPUT_NAMES)[number], string> = {
    interactionCfgJson: args.interactionCfgJson,
    mediaNodesJson: args.mediaNodesJson,
    markdownBlocksJson: safeMarkdownBlocksJson,
    nodeLabelByIdJson: args.nodeLabelByIdJson,
    edgeMetaByIdJson: args.edgeMetaByIdJson,
    nodePosByIdJson: args.nodePosByIdJson,
    groupMembersByIdJson: args.groupMembersByIdJson,
    frontmatterVisibilityJson: args.frontmatterVisibilityJson,
    initialFrontmatterEnabled: args.initialFrontmatterEnabled === true ? 'true' : 'false',
    richMediaPanelModeLsKey: JSON.stringify(LS_KEYS.renderRichMediaPanelMode),
    density: JSON.stringify(args.density),
    widthRatioDefault: String(args.widthRatioDefault),
    widthRatioCompact: String(args.widthRatioCompact),
    widthMinDefault: String(args.widthMinDefault),
    widthMinCompact: String(args.widthMinCompact),
    widthMaxDefault: String(args.widthMaxDefault),
    widthMaxCompact: String(args.widthMaxCompact),
    proxyOrigin: JSON.stringify(String(args.proxyOrigin || '')),
    allowRuntimeNetwork: args.allowRuntimeNetwork === true ? 'true' : 'false',
  }
  // Keep data out of the compiler. Escape the HTML raw-script delimiter while
  // retaining the values (including whitespace and Unicode) supplied by owners.
  const packet = `[${HTML_VIEWER_RUNTIME_INPUT_NAMES.map(name => input[name]).join(',')}]`.replace(/</g, '\\u003c')
  const factory = args.has3dPayload === false ? HTML_VIEWER_RUNTIME_WITHOUT_3D_PAYLOAD : HTML_VIEWER_RUNTIME_FULL
  return factory.replace('__AG_FACTORY_INPUT__', () => packet)
}
