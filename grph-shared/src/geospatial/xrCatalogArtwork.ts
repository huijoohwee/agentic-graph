/** Shared self-contained artwork for Media catalog cards and Geo+XR map sprites. */
export function xrCatalogArtworkSvg(
  assetId: string,
  label: string,
  rawColor: string,
): string {
  const key = `${assetId} ${label}`.toLowerCase()
  const color = /^#[\da-f]{3,8}$/i.test(rawColor) ? rawColor : '#38bdf8'
  const background = /tropical|singapore/.test(key) ? '#a5e6ed' : '#edf4ed'
  let art: string

  if (/tropical|singapore/.test(key)) art = `
    <path d="M0 35Q24 31 48 38T96 33V72H0Z" fill="#36b6bd"/>
    <ellipse cx="49" cy="49" rx="36" ry="17" fill="#b5ebe0"/><ellipse cx="48" cy="45" rx="29" ry="16" fill="#f4d797"/><ellipse cx="48" cy="41" rx="19" ry="10" fill="#9ac66b"/>
    <path d="M31 43Q35 30 31 21M66 42Q59 27 64 18" fill="none" stroke="#916244" stroke-width="3"/><path d="M31 21Q12 13 16 30Q23 20 31 21Q41 11 48 24Q39 19 31 21M64 18Q48 8 48 25Q56 17 64 18Q75 8 82 22Q72 16 64 18" fill="#338e60"/>`
  else if (/wolf|pig|monkey|character|person|adult|child|performer/.test(key)) {
    const pig = /pig/.test(key)
    const wolf = /wolf/.test(key)
    const dog = /dog|cat|animal/.test(key)
    art = dog
      ? `<ellipse cx="48" cy="47" rx="25" ry="15" fill="${color}"/><circle cx="68" cy="35" r="12" fill="${color}"/><path d="M60 26L62 13L70 25M72 26L82 17L79 32M32 55V66M58 55V66" stroke="#40515a" stroke-width="5" stroke-linecap="round"/><circle cx="73" cy="34" r="2" fill="#17212b"/>`
      : `<ellipse cx="48" cy="62" rx="25" ry="5" fill="#d4e4df"/><path d="M27 64V45Q48 34 69 45V64Z" fill="${color}"/><path d="${pig ? 'M29 28L25 9L42 21M55 20L71 9L66 33' : 'M26 31L25 4L42 23M54 22L72 4L70 34'}" fill="${pig ? '#ef99b2' : '#708398'}"/><ellipse cx="48" cy="33" rx="25" ry="22" fill="${pig ? '#f6b5c6' : '#8fa0af'}"/><ellipse cx="48" cy="41" rx="${pig ? 13 : 17}" ry="9" fill="${pig ? '#ee8eaa' : '#c3cbd1'}"/><circle cx="37" cy="29" r="3" fill="#263c4d"/><circle cx="59" cy="29" r="3" fill="#263c4d"/>${wolf ? '<path d="M37 44L48 51L59 44" fill="none" stroke="#263c4d" stroke-width="2"/>' : ''}`
  } else if (/straw|stick|brick|house/.test(key)) art = `
    <ellipse cx="49" cy="63" rx="34" ry="5" fill="#d4e4df"/><path d="M20 31H76V61H20Z" fill="${color}"/><path d="M15 33L47 9L81 33Z" fill="${/straw/.test(key) ? '#e2b652' : '#90513c'}"/><path d="M23 34V60M30 34V60M37 34V60M58 34V60M65 34V60M72 34V60" stroke="#84623e" stroke-width="2"/><path d="M40 61V42Q48 35 55 42V61Z" fill="#563d36"/>`
  else if (/sailboat|boat/.test(key)) art = `
    <path d="M0 60Q25 53 49 61T96 58V72H0Z" fill="#9adee0"/><path d="M17 49H80L68 63H29Z" fill="${color}"/><path d="M46 51V7" stroke="#865d3d" stroke-width="3"/><path d="M49 10L77 45H49Z" fill="#fff4d3" stroke="#dac99e"/><path d="M41 20L22 45H41Z" fill="#e78464"/>`
  else if (/pot|soup/.test(key)) art = `
    <path d="M25 36Q25 66 48 66Q71 66 71 36" fill="${color}"/><ellipse cx="48" cy="36" rx="23" ry="8" fill="#384857"/><ellipse cx="48" cy="35" rx="18" ry="5" fill="#efb956"/><path d="M22 40H15V50H26M73 40H81V50H71M35 24Q26 17 36 9M49 22Q40 14 50 6M63 24Q54 17 64 9" fill="none" stroke="#a9bdc4" stroke-width="3"/>`
  else if (/tree|oak/.test(key)) art = `<path d="M43 64V35H52V64Z" fill="#946243"/><circle cx="47" cy="29" r="23" fill="${color}"/><circle cx="29" cy="36" r="14" fill="#5c9e64"/><circle cx="65" cy="35" r="15" fill="#75ad63"/>`
  else if (/ball|sphere/.test(key)) art = `<ellipse cx="48" cy="62" rx="25" ry="5" fill="#d4e4df"/><circle cx="48" cy="36" r="25" fill="${color}"/><path d="M27 25Q48 39 69 25M28 49Q48 34 68 49" fill="none" stroke="#f8fafc" stroke-width="4"/>`
  else if (/chair/.test(key)) art = `<path d="M27 31H67V43H27ZM30 43H64V63H30ZM33 61V69M61 61V69" fill="${color}" stroke="#4c5964" stroke-width="4" stroke-linejoin="round"/>`
  else if (/table|desk/.test(key)) art = `<path d="M13 27H83V38H13ZM21 38V65M75 38V65" fill="${color}" stroke="#4c5964" stroke-width="4"/>`
  else if (/sofa|couch/.test(key)) art = `<path d="M19 38Q19 28 29 28H67Q77 28 77 38V61H19ZM12 43H23V64H12ZM73 43H84V64H73Z" fill="${color}" stroke="#4c5964" stroke-width="3"/>`
  else if (/car|sedan|van/.test(key)) art = `<path d="M14 46L23 31Q26 26 33 26H64Q71 26 75 34L83 46V60H14Z" fill="${color}"/><path d="M30 31H62L70 44H24Z" fill="#d9f2f5"/><circle cx="29" cy="60" r="8" fill="#334155"/><circle cx="68" cy="60" r="8" fill="#334155"/>`
  else if (/helicopter/.test(key)) art = `<ellipse cx="49" cy="43" rx="24" ry="13" fill="${color}"/><path d="M67 43H88M49 30V15M25 15H74M39 56L34 65M60 56L65 65" stroke="#3f4b55" stroke-width="4" stroke-linecap="round"/><path d="M78 38L88 43L78 48Z" fill="#ef4444"/>`
  else if (/bicycle|bike|cycle/.test(key)) art = `<circle cx="27" cy="52" r="16" fill="none" stroke="#273748" stroke-width="4"/><circle cx="69" cy="52" r="16" fill="none" stroke="#273748" stroke-width="4"/><path d="M27 52L43 31L53 52H27L43 31L69 52L58 31H69" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round"/>`
  else if (/cannonball/.test(key)) art = `<ellipse cx="48" cy="61" rx="25" ry="5" fill="#d4e4df"/><circle cx="48" cy="36" r="22" fill="#37464b"/><circle cx="40" cy="28" r="7" fill="#657b80"/>`
  else if (/cannon/.test(key)) art = `<path d="M18 48H78V61H18Z" fill="#986c48"/><circle cx="30" cy="55" r="9" fill="#4a3830"/><circle cx="67" cy="55" r="9" fill="#4a3830"/><path d="M26 45L38 22L80 12L85 33L50 47Z" fill="#46555b"/><ellipse cx="79" cy="23" rx="7" ry="11" fill="#233439"/>`
  else if (/chest/.test(key)) art = `<path d="M19 31Q19 12 48 12Q77 12 77 31V60H19Z" fill="#a36e42"/><path d="M19 34H77M33 16V60M64 16V60" fill="none" stroke="#e2bb61" stroke-width="5"/><path d="M42 31H54V45H42Z" fill="#f1d179"/>`
  else if (/key/.test(key)) art = `<circle cx="31" cy="29" r="15" fill="none" stroke="#e2ba45" stroke-width="8"/><path d="M41 40L70 63M58 51L65 42M67 58L76 49" stroke="#e2ba45" stroke-width="8"/>`
  else if (/barrel/.test(key)) art = `<path d="M30 12Q12 36 30 62H67Q84 36 67 12Z" fill="#a67a49"/><ellipse cx="48" cy="13" rx="19" ry="6" fill="#c59b63"/><path d="M23 26H74M23 49H74" stroke="#4c5858" stroke-width="6"/>`
  else if (/palm/.test(key)) art = `<path d="M44 64Q53 36 45 22" fill="none" stroke="#9e7048" stroke-width="7"/><path d="M45 22Q12 1 14 34Q25 20 45 22Q30 0 58 4Q47 13 45 22Q77 1 86 34Q66 20 45 22" fill="#45936c"/>`
  else if (/rock|grotto/.test(key)) art = `<path d="M10 58L17 31L38 12L68 17L87 49L78 62Z" fill="#71838a"/><path d="M17 31L49 27L38 12M49 27L63 60L87 49" fill="#88989c"/>`
  else if (/shopping-cart|cart|trolley/.test(key)) art = `<path d="M17 18H28L36 52H72L82 30H33" fill="none" stroke="#40515a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M38 36H77M42 43H74" stroke="${color}" stroke-width="7"/><circle cx="43" cy="63" r="6" fill="#334155"/><circle cx="68" cy="63" r="6" fill="#334155"/>`
  else if (/umbrella/.test(key)) art = `<path d="M48 12Q20 13 12 42Q28 32 48 42Q68 32 84 42Q76 13 48 12Z" fill="${color}"/><path d="M48 14V59Q48 69 58 66" fill="none" stroke="#805b3f" stroke-width="4" stroke-linecap="round"/>`
  else if (/streetlight|lamp/.test(key)) art = `<path d="M45 66V19Q45 12 53 12H68V24H54" fill="none" stroke="#40515a" stroke-width="6" stroke-linecap="round"/><path d="M61 21H78L73 31H61Z" fill="#f6d46b"/><circle cx="71" cy="36" r="9" fill="#ffeaa4" opacity=".7"/>`
  else if (/debris/.test(key)) art = `<path d="M15 58L24 35L42 42L36 64ZM38 42L55 14L70 34L61 55ZM61 61L72 42L86 55L81 67Z" fill="${color}" stroke="#596774" stroke-width="3" stroke-linejoin="round"/>`
  else if (/crate|box|barrel|cart|debris|umbrella|streetlight|lamp|cannon|rock|grotto|chest|key/.test(key)) art = `<path d="M20 28L48 12L77 28V59L48 71L20 58Z" fill="${color}" stroke="#40515a" stroke-width="4" stroke-linejoin="round"/><path d="M20 28L48 43L77 28M48 43V71" fill="none" stroke="#f8fafc" stroke-width="3"/>`
  else art = `<path d="M20 28L48 12L77 28V59L48 71L20 58Z" fill="${color}" stroke="#40515a" stroke-width="4" stroke-linejoin="round"/><path d="M20 28L48 43L77 28M48 43V71" fill="none" stroke="#f8fafc" stroke-width="3"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="72" viewBox="0 0 96 72"><rect width="96" height="72" rx="8" fill="${background}"/>${art}</svg>`
}

export function xrCatalogArtworkDataUri(assetId: string, label: string, color: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xrCatalogArtworkSvg(assetId, label, color))}`
}
