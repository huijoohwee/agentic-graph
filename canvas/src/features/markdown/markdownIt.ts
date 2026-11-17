import MarkdownIt from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItMark from 'markdown-it-mark'
import markdownItSub from 'markdown-it-sub'
import { createMarkdownParser } from 'agentic-design-system/markdown/parser'
import { slugify } from 'grph-shared/markdown/slugify'
export { ALLOWLISTED_DATA_IMAGE_RE } from 'agentic-design-system/markdown/parser'
let cached:MarkdownIt|null=null,fast:MarkdownIt|null=null,fastHtml:MarkdownIt|null=null
export function getMarkdownIt():MarkdownIt {
  return cached ??= createMarkdownParser(MarkdownIt,{extensions:{anchor:markdownItAnchor,footnote:markdownItFootnote,mark:markdownItMark,subscript:markdownItSub,slugify}})
}
export function getMarkdownItFast():MarkdownIt {return fast ??= createMarkdownParser(MarkdownIt,{mode:'fast'})}
export function getMarkdownItFastHtml():MarkdownIt {return fastHtml ??= createMarkdownParser(MarkdownIt,{mode:'fastHtml'})}
