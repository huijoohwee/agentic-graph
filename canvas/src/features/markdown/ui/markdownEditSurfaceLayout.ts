export const MARKDOWN_NORMAL_TEXT_READ_SURFACE_BASE_CLASS = 'm-0 text-left [text-indent:0]'
export const MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_BASE_CLASS =
  `${MARKDOWN_NORMAL_TEXT_READ_SURFACE_BASE_CLASS} w-full min-w-0 max-w-full outline-none bg-transparent`
export const MARKDOWN_BLOCK_STACK_SPACING_CLASS = 'mt-3 mb-3'
export const MARKDOWN_BLOCKQUOTE_READ_SPACING_CLASS = MARKDOWN_BLOCK_STACK_SPACING_CLASS
export const MARKDOWN_BLOCKQUOTE_READ_TEXT_PADDING_CLASS = 'pl-3'
export const MARKDOWN_BLOCKQUOTE_READ_FRAME_CLASS = `py-2 ${MARKDOWN_BLOCKQUOTE_READ_TEXT_PADDING_CLASS} border-l-4 border-solid rounded-r`
export const MARKDOWN_BLOCKQUOTE_READ_CONTENT_RESET_CLASS = '[&_p]:m-0 [&_p]:leading-normal [&_ul]:m-0 [&_ol]:m-0'
export const MARKDOWN_CODE_BLOCK_READ_SPACING_CLASS = 'my-4'
export const MARKDOWN_QUOTE_LIKE_CONTENT_RESET_CLASS = [
  MARKDOWN_BLOCKQUOTE_READ_CONTENT_RESET_CLASS,
  '[&_blockquote]:m-0',
  '[&_blockquote]:pl-0',
  '[&_blockquote]:py-0',
  '[&_blockquote]:border-l-0',
  '[&_blockquote]:rounded-none',
  '[&_blockquote]:bg-transparent',
].join(' ')
export const MARKDOWN_CODE_FENCE_CONTENT_SURFACE_BASE_CLASS = 'relative overflow-auto p-4'
export const MARKDOWN_CODE_FENCE_PRE_SURFACE_BASE_CLASS = 'm-0 p-0 bg-transparent'
export const MARKDOWN_CODE_FENCE_EDITOR_LAYOUT_CLASS = 'block m-0 whitespace-pre overflow-auto p-4'
export const MARKDOWN_CODE_FENCE_LINE_SPACING_CLASS = 'leading-[1.5em]'
export const MARKDOWN_CODE_FENCE_LINE_ROW_HEIGHT_CLASS = 'h-[1.5em]'
export const MARKDOWN_CODE_FENCE_ASCII_TEXT_COMPACT_CLASS = 'text-xs leading-4'

export const MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_WRAP_CLASS = 'whitespace-pre-wrap break-words'

export const MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS =
  `${MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_BASE_CLASS} ${MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_WRAP_CLASS}`

export const MARKDOWN_TEXT_EDIT_SURFACE_MIN_LINE_HEIGHT_CLASS = 'min-h-[1lh]'
export const MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_MIN_LINE_CLASS =
  `${MARKDOWN_TEXT_EDIT_SURFACE_MIN_LINE_HEIGHT_CLASS} leading-normal`

export const MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_HTML_DESCENDANT_CLASS = [
  '[&_div]:font-inherit',
  '[&_div]:text-inherit',
  '[&_div]:m-0',
  '[&_div]:leading-normal',
  '[&_div]:whitespace-pre-wrap',
  '[&_p]:font-inherit',
  '[&_p]:text-inherit',
  '[&_p]:m-0',
  '[&_p]:leading-normal',
  '[&_p]:whitespace-pre-wrap',
  '[&_ul]:m-0',
  '[&_ol]:m-0',
].join(' ')

export const MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_BLOCKQUOTE_RESET_CLASS = [
  '[&_blockquote]:m-0',
  '[&_blockquote]:pl-0',
  '[&_blockquote]:py-0',
  '[&_blockquote]:border-l-0',
  '[&_blockquote]:rounded-none',
  '[&_blockquote]:bg-transparent',
].join(' ')

export const MARKDOWN_HTML_EDIT_NORMALIZE_CLASS = [
  '[&_p]:m-0',
  '[&_div]:m-0',
  '[&_h1]:m-0',
  '[&_h2]:m-0',
  '[&_h3]:m-0',
  '[&_h4]:m-0',
  '[&_h5]:m-0',
  '[&_h6]:m-0',
  '[&_h1]:text-inherit',
  '[&_h2]:text-inherit',
  '[&_h3]:text-inherit',
  '[&_h4]:text-inherit',
  '[&_h5]:text-inherit',
  '[&_h6]:text-inherit',
  '[&_h1]:font-inherit',
  '[&_h2]:font-inherit',
  '[&_h3]:font-inherit',
  '[&_h4]:font-inherit',
  '[&_h5]:font-inherit',
  '[&_h6]:font-inherit',
  '[&_div]:text-inherit',
  '[&_div]:font-inherit',
  '[&_div]:leading-[inherit]',
  '[&_div]:whitespace-pre-wrap',
  '[&_li]:text-inherit',
  '[&_li]:font-inherit',
  '[&_ul]:m-0',
  '[&_ol]:m-0',
  '[&_blockquote]:m-0',
  '[&_pre]:m-0',
  '[&_hr]:m-0',
  '[&>*:first-child]:mt-0',
  '[&>*:last-child]:mb-0',
  '[&_p:first-child]:mt-0',
  '[&_p:last-child]:mb-0',
  '[&_ul:first-child]:mt-0',
  '[&_ul:last-child]:mb-0',
  '[&_ol:first-child]:mt-0',
  '[&_ol:last-child]:mb-0',
  '[&_blockquote:first-child]:mt-0',
  '[&_blockquote:last-child]:mb-0',
  '[&_a]:break-words',
  '[&_a]:text-blue-600',
  '[&_a]:hover:underline',
  '[&_mark]:px-0.5',
  '[&_mark]:rounded-sm',
  '[&_mark]:text-yellow-700',
  '[&_mark]:bg-yellow-50',
  '[&_mark]:border',
  '[&_mark]:border-yellow-200',
  'dark:[&_mark]:text-yellow-400',
  'dark:[&_mark]:bg-yellow-900/30',
  'dark:[&_mark]:border-yellow-800',
].join(' ')

export const MARKDOWN_HTML_EDIT_BLOCK_FLOW_CLASS = [
  '[&_p]:mt-2',
  '[&_p]:mb-2',
  '[&_ul]:mt-3',
  '[&_ul]:mb-3',
  '[&_ul]:pl-5',
  '[&_ul]:list-disc',
  '[&_ol]:mt-3',
  '[&_ol]:mb-3',
  '[&_ol]:pl-5',
  '[&_ol]:list-decimal',
  '[&_li]:mt-0',
  '[&_li]:mb-0',
  '[&_blockquote]:mt-3',
  '[&_blockquote]:mb-3',
  `[&_blockquote]:${MARKDOWN_BLOCKQUOTE_READ_TEXT_PADDING_CLASS}`,
  '[&_blockquote]:py-2',
  '[&_blockquote]:border-l-4',
  '[&_blockquote]:border-blue-400',
  'dark:[&_blockquote]:border-blue-600',
  '[&_blockquote]:italic',
].join(' ')

export const getMarkdownQuoteLikeEditorClass = (args: {
  baseTextClass?: string
  commonBlockClass?: string
  uiPanelTextFontClass?: string
  stripNestedBlockquoteInset?: boolean
}): string => {
  return [
    MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS,
    MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_MIN_LINE_CLASS,
    args.baseTextClass || '',
    args.commonBlockClass || '',
    args.uiPanelTextFontClass || '',
    MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_HTML_DESCENDANT_CLASS,
    args.stripNestedBlockquoteInset ? MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_BLOCKQUOTE_RESET_CLASS : '',
  ]
    .filter(Boolean)
    .join(' ')
}
