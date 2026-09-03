import { strToU8, zipSync } from 'fflate'

import {
  escapeOfficeXml,
  FIXED_OFFICE_TIMESTAMP,
  FIXED_ZIP_DATE,
  MARKDOWN_PRESENTATION_MIME_TYPE,
  parseBoundedMarkdownSlides,
  type ParsedMarkdownSlide,
} from './markdownOfficeModel.js'

export type MarkdownPresentationArtifactInput = {
  markdown: string
  title?: string
}

export type MarkdownPresentationArtifact = {
  bytes: Uint8Array<ArrayBuffer>
  mimeType: typeof MARKDOWN_PRESENTATION_MIME_TYPE
  title: string
  slides: ParsedMarkdownSlide[]
}

const PRESENTATION_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'

const groupShapeXml = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

const titleShapeXml = (title: string, isFirst: boolean): string => {
  const fontSize = isFirst ? 4400 : 3600
  return `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="457200"/><a:ext cx="10820400" cy="1127760"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="l"/><a:r><a:rPr lang="en-US" sz="${fontSize}" b="1" dirty="0"><a:solidFill><a:srgbClr val="17365D"/></a:solidFill><a:latin typeface="Aptos Display"/></a:rPr><a:t>${escapeOfficeXml(title)}</a:t></a:r><a:endParaRPr lang="en-US" sz="${fontSize}"/></a:p></p:txBody></p:sp>`
}

const bodyParagraphXml = (line: string): string => {
  const bullet = line.startsWith('• ')
  const text = bullet ? line.slice(2) : line
  const paragraphProperties = bullet
    ? '<a:pPr marL="342900" indent="-285750"><a:buChar char="•"/></a:pPr>'
    : '<a:pPr marL="0" indent="0"><a:buNone/></a:pPr>'
  return `<a:p>${paragraphProperties}<a:r><a:rPr lang="en-US" sz="1800" dirty="0"><a:solidFill><a:srgbClr val="243447"/></a:solidFill><a:latin typeface="Aptos"/></a:rPr><a:t>${escapeOfficeXml(text)}</a:t></a:r><a:endParaRPr lang="en-US" sz="1800"/></a:p>`
}

const bodyShapeXml = (bodyLines: readonly string[]): string => {
  const paragraphs = bodyLines.length > 0
    ? bodyLines.map(bodyParagraphXml).join('')
    : '<a:p><a:endParaRPr lang="en-US" sz="1800"/></a:p>'
  return `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content 2"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1778000"/><a:ext cx="10820400" cy="4380000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`
}

const buildSlideXml = (slide: ParsedMarkdownSlide, index: number): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${PRESENTATION_NS} showMasterSp="1" showMasterPhAnim="1"><p:cSld name="${escapeOfficeXml(slide.title)}"><p:spTree>${groupShapeXml}${titleShapeXml(slide.title, index === 0)}${bodyShapeXml(slide.bodyLines)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`

const buildContentTypesXml = (slideCount: number): string => {
  const slides = Array.from({ length: slideCount }, (_, index) =>
    `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>${slides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`
}

const buildPresentationXml = (slideCount: number): string => {
  const slideIds = Array.from({ length: slideCount }, (_, index) =>
    `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`,
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${PRESENTATION_NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="Aptos"/></a:defRPr></a:lvl1pPr></p:defaultTextStyle></p:presentation>`
}

const buildPresentationRelationships = (slideCount: number): string => {
  const slideRelationships = Array.from({ length: slideCount }, (_, index) =>
    `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`,
  ).join('')
  const next = slideCount + 2
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slideRelationships}<Relationship Id="rId${next}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/><Relationship Id="rId${next + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/><Relationship Id="rId${next + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/></Relationships>`
}

const slideMasterXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster ${PRESENTATION_NS}><p:cSld name="agentic-graph Master"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F7F9FC"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${groupShapeXml}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="3600" b="1"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr marL="342900" indent="-285750"><a:buChar char="•"/><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:otherStyle></p:txStyles></p:sldMaster>`

const slideLayoutXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout ${PRESENTATION_NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${groupShapeXml}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`

const themeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="agentic-graph"><a:themeElements><a:clrScheme name="agentic-graph"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="17365D"/></a:dk2><a:lt2><a:srgbClr val="F7F9FC"/></a:lt2><a:accent1><a:srgbClr val="2E75B6"/></a:accent1><a:accent2><a:srgbClr val="00A6A6"/></a:accent2><a:accent3><a:srgbClr val="70AD47"/></a:accent3><a:accent4><a:srgbClr val="ED7D31"/></a:accent4><a:accent5><a:srgbClr val="8064A2"/></a:accent5><a:accent6><a:srgbClr val="5B9BD5"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="agentic-graph"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="agentic-graph"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="51000"/><a:satMod val="130000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="1"/></a:gradFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="85000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`

const buildAppPropertiesXml = (slides: readonly ParsedMarkdownSlide[]): string => {
  const titles = slides.map(slide => `<vt:lpstr>${escapeOfficeXml(slide.title)}</vt:lpstr>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>agentic-graph</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>${slides.length}</Slides><Notes>0</Notes><HiddenSlides>0</HiddenSlides><MMClips>0</MMClips><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="4" baseType="variant"><vt:variant><vt:lpstr>Theme</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant><vt:variant><vt:lpstr>Slide Titles</vt:lpstr></vt:variant><vt:variant><vt:i4>${slides.length}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${slides.length + 1}" baseType="lpstr"><vt:lpstr>agentic-graph</vt:lpstr>${titles}</vt:vector></TitlesOfParts><Company></Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>1.0</AppVersion></Properties>`
}

const buildPresentationParts = (
  slides: readonly ParsedMarkdownSlide[],
  title: string,
): Record<string, Uint8Array> => {
  const parts: Record<string, string> = {
    '[Content_Types].xml': buildContentTypesXml(slides.length),
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    'docProps/app.xml': buildAppPropertiesXml(slides),
    'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeOfficeXml(title)}</dc:title><dc:creator>agentic-graph</dc:creator><cp:lastModifiedBy>agentic-graph</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${FIXED_OFFICE_TIMESTAMP}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${FIXED_OFFICE_TIMESTAMP}</dcterms:modified></cp:coreProperties>`,
    'ppt/presentation.xml': buildPresentationXml(slides.length),
    'ppt/_rels/presentation.xml.rels': buildPresentationRelationships(slides.length),
    'ppt/slideMasters/slideMaster1.xml': slideMasterXml,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`,
    'ppt/slideLayouts/slideLayout1.xml': slideLayoutXml,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
    'ppt/theme/theme1.xml': themeXml,
    'ppt/presProps.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentationPr ${PRESENTATION_NS}/>` ,
    'ppt/viewProps.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:viewPr ${PRESENTATION_NS} lastView="sldView"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="72008" cy="72008"/></p:viewPr>`,
    'ppt/tableStyles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`,
  }
  slides.forEach((slide, index) => {
    const slideNumber = index + 1
    parts[`ppt/slides/slide${slideNumber}.xml`] = buildSlideXml(slide, index)
    parts[`ppt/slides/_rels/slide${slideNumber}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`
  })
  return Object.fromEntries(Object.entries(parts).map(([path, xml]) => [path, strToU8(xml)]))
}

/** Build a deterministic native PPTX from bounded Markdown slides. */
export const buildPresentationArtifactFromMarkdown = (
  input: MarkdownPresentationArtifactInput,
): MarkdownPresentationArtifact => {
  const slides = parseBoundedMarkdownSlides(input.markdown)
  if (!slides) throw new Error('Presentation Markdown must contain one or more bounded slides.')
  const title = String(input.title || slides[0]?.title || 'Presentation').trim().slice(0, 240) || 'Presentation'
  const bytes = Uint8Array.from(zipSync(buildPresentationParts(slides, title), {
    level: 6,
    mtime: FIXED_ZIP_DATE,
  }))
  return { bytes, mimeType: MARKDOWN_PRESENTATION_MIME_TYPE, title, slides }
}
