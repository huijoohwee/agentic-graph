export function buildMarkdownSidebarTitleClassName({
  uiPanelTextFontClass,
  uiPanelMicroLabelTextSizeClass,
  uiPanelKeyValueTextSizeClass,
  fallbackSizeClass = 'text-xs',
  textColorClassName,
}: {
  uiPanelTextFontClass: string
  uiPanelMicroLabelTextSizeClass?: string
  uiPanelKeyValueTextSizeClass?: string
  fallbackSizeClass?: string
  textColorClassName: string
}) {
  return [
    uiPanelTextFontClass,
    uiPanelMicroLabelTextSizeClass || uiPanelKeyValueTextSizeClass || fallbackSizeClass,
    'font-semibold uppercase tracking-normal truncate',
    textColorClassName,
  ].join(' ')
}
