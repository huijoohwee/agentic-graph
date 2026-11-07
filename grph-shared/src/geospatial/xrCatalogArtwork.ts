/** Shared self-contained artwork for Media catalog cards and Geo+XR map sprites. */
export function xrCatalogArtworkSvg(
  assetId: string,
  label: string,
  rawColor: string,
): string {
  const key = `${assetId} ${label}`.toLowerCase()
  const color = /^#[\da-f]{3,8}$/i.test(rawColor) ? rawColor : '#38bdf8'
  const isIsland = /(^|\s|[-_])tropical-playground\b/.test(key)
  const background = isIsland ? '#a5e6ed' : '#eef3f7'
  let art: string

  if (/^singapore$/.test(assetId.toLowerCase()) || /^(singapore|singapore city)$/.test(label.trim().toLowerCase())) art = `
    <defs><linearGradient id="city-sky" x2="0" y2="1"><stop stop-color="#a9d9f2"/><stop offset="1" stop-color="#e8f2f2"/></linearGradient></defs>
    <rect width="96" height="48" fill="url(#city-sky)"/><path d="M0 46H96V72H0Z" fill="#4d9aa8"/>
    <path d="M0 52Q24 47 48 54T96 51V58Q70 62 48 57T0 61Z" fill="#d1edf0" opacity=".85"/>
    <path d="M9 43V22H20V43M23 43V14H34V43M37 43V27H47V43M50 43V18H63V43M67 43V24H76V43M79 43V12H87V43" fill="#54788b"/>
    <path d="M24 14L28 7L32 14M52 18V12H61V18M81 12L83 5L86 12" fill="#718fa0"/>
    <path d="M18 43V29H34V43M53 43V26H63V43M81 43V20H87V43" fill="#a9c6ca"/>
    <path d="M0 46H96M6 64H39M52 65H90" stroke="#f4f0df" stroke-width="2" opacity=".8"/>
    <path d="M9 50V59M15 50V59M21 50V59M27 50V59M68 50V59M74 50V59M80 50V59M86 50V59" stroke="#d4dfd4" stroke-width="2"/>`
  else if (isIsland) art = `
    <defs><linearGradient id="lagoon" x2="0" y2="1"><stop stop-color="#53c4cc"/><stop offset="1" stop-color="#268da7"/></linearGradient></defs>
    <path d="M0 35Q24 31 48 38T96 33V72H0Z" fill="url(#lagoon)"/>
    <ellipse cx="49" cy="50" rx="38" ry="16" fill="#91dcd6"/><ellipse cx="48" cy="46" rx="31" ry="15" fill="#f0d293"/><ellipse cx="48" cy="42" rx="21" ry="9" fill="#7eaa64"/>
    <path d="M31 43Q35 30 31 21M66 42Q59 27 64 18" fill="none" stroke="#916244" stroke-width="3"/><path d="M31 21Q12 13 16 30Q23 20 31 21Q41 11 48 24Q39 19 31 21M64 18Q48 8 48 25Q56 17 64 18Q75 8 82 22Q72 16 64 18" fill="#338e60"/>
    <path d="M3 40Q18 35 29 39M69 46Q81 42 94 45" fill="none" stroke="#e7fbf5" stroke-width="2" opacity=".8"/>`
  else if (/^poi-detail-/.test(assetId.toLowerCase())) {
    if (/marina-bay-cruise/.test(assetId)) art = `
      <path d="M0 48Q25 43 50 49T96 47V72H0Z" fill="#83c9d4"/><path d="M13 47H84L71 60H28Z" fill="#364e68"/>
      <path d="M25 45V34H69V45M32 34V27H62V34M39 27V22H56V27" fill="#f7f8f5" stroke="#bac7ce" stroke-width="1.5"/>
      <path d="M17 49H80" stroke="#ebeff0" stroke-width="2"/><circle cx="30" cy="63" r="2" fill="#eaf7f5"/><circle cx="68" cy="65" r="2" fill="#eaf7f5"/>`
    else if (/merlion/.test(assetId)) art = `
      <path d="M0 53Q20 47 40 52T96 51V72H0Z" fill="#75bdc2"/><path d="M10 52Q22 35 36 47Q48 29 62 48Q75 33 88 51Z" fill="#55986b"/>
      <path d="M39 50V35L47 30L55 35V50Z" fill="#e7ece7"/><path d="M42 38H52M43 43H51" stroke="#8d9da0" stroke-width="2"/>
      <path d="M48 31Q53 24 61 29Q55 34 49 34" fill="#e8f5f4"/><path d="M42 50V57M50 50V57" stroke="#d5e7df" stroke-width="2"/>`
    else if (/marina-barrage/.test(assetId)) art = `
      <path d="M0 40Q48 34 96 41V72H0Z" fill="#79c3d1"/><path d="M8 34H88V51H8Z" fill="#e6ece9"/>
      <path d="M14 33V52M31 33V52M48 33V52M65 33V52M82 33V52" stroke="#8499a4" stroke-width="2"/>
      <path d="M8 53Q24 48 40 54T72 53T96 54V72H0Z" fill="#438fa9"/><path d="M13 28H83" stroke="#526a78" stroke-width="3"/>`
    else if (/national-gallery/.test(assetId)) art = `
      <path d="M10 56H86V65H10Z" fill="#cfdbdc"/><path d="M18 33H78V56H18Z" fill="#e7e9e4" stroke="#b6c4c5"/>
      <path d="M15 32L48 18L81 32Z" fill="#c7d2d2"/><path d="M23 34V53M33 34V53M43 34V53M53 34V53M63 34V53M73 34V53" stroke="#80959a" stroke-width="2"/>
      <path d="M12 59H84" stroke="#8ca1a4" stroke-width="2"/><path d="M27 56V63M67 56V63" stroke="#a7b5b6" stroke-width="2"/>`
    else if (/suntec|shoppes/.test(assetId)) art = `
      <path d="M8 59H89V66H8Z" fill="#d4dddd"/><path d="M13 39L27 26L40 39V59H13ZM41 32L59 18L77 32V59H41ZM62 41L73 32L87 41V59H62Z" fill="#d8e6e8" stroke="#7795a5" stroke-width="1.5"/>
      <path d="M19 43H34M48 38H70M68 47H81" stroke="#68a3b8" stroke-width="3"/><path d="M19 49H34M48 47H70M68 53H81" stroke="#ffffff" stroke-width="2"/>`
    else art = `<path d="M16 57V31L48 13L80 31V57Z" fill="${color}"/><path d="M10 33L48 8L86 33M25 36V57M40 36V57M56 36V57M71 36V57" fill="none" stroke="#516b7a" stroke-width="3"/><path d="M9 61H87" stroke="#9bb1b6" stroke-width="3"/>`
  }
  else if (/neutral-volume/.test(assetId)) art = `
    <path d="M11 16H84V56H11Z" fill="#d8e0e4"/><path d="M11 16H84V22H11Z" fill="#96a8b5"/>
    <path d="M17 56L31 38H67L80 56Z" fill="#f7f8f6" stroke="#c7d1d5"/><path d="M35 47H62V56H35Z" fill="#8cb8ca"/>
    <path d="M18 57H78V63H18Z" fill="#708391"/><path d="M5 65H91" stroke="#aab8be" stroke-width="2"/>`
  else if (/street-grid/.test(assetId)) art = `
    <path d="M0 29H96V51H0ZM39 0H58V72H39Z" fill="#697b86"/><path d="M0 26H96V30H0ZM0 51H96V55H0ZM36 0H40V72H36ZM58 0H62V72H58Z" fill="#d4dadd"/>
    <path d="M47 3V20M47 58V69M7 40H29M68 40H89" stroke="#f5d476" stroke-width="2" stroke-dasharray="4 4"/>
    <path d="M5 33H32M5 38H32M65 33H92M65 38H92" stroke="#f5f7f7" stroke-width="1.5"/>`
  else if (/loading-bay/.test(assetId)) art = `
    <path d="M7 22L48 8L89 22V62H7Z" fill="#d8e1e5" stroke="#8599a4" stroke-width="2"/><path d="M7 22L48 8L89 22" fill="none" stroke="#597486" stroke-width="4"/>
    <path d="M17 34H37V57H17ZM42 30H64V57H42ZM68 37H82V57H68Z" fill="#7a8e9a"/><path d="M21 40H33M46 36H60M72 43H79" stroke="#dce6e8" stroke-width="2"/>
    <path d="M11 62H87" stroke="#607987" stroke-width="3"/><path d="M23 63V67M70 63V67" stroke="#51636d" stroke-width="2"/>`
  else if (/downtown/.test(assetId)) art = `
    <path d="M0 58H96V72H0Z" fill="#637985"/><path d="M9 58V26H28V58M31 58V14H49V58M53 58V31H68V58M72 58V19H89V58" fill="#718b9a"/>
    <path d="M12 31H25M12 38H25M12 45H25M35 20H45M35 28H45M35 36H45M57 37H64M57 44H64M76 25H85M76 33H85M76 41H85" stroke="#cde5e8" stroke-width="2"/>
    <path d="M4 64H92" stroke="#e7dba7" stroke-width="2"/>`
  else if (/residential-street/.test(assetId)) art = `
    <path d="M0 47H96V72H0Z" fill="#71858b"/><path d="M7 48V23L22 13L37 23V48M59 48V21L74 10L89 21V48" fill="#e8e5dc" stroke="#94a4a7" stroke-width="2"/>
    <path d="M13 29H20V37H13M28 29H34V37H28M66 27H73V35H66M80 27H86V35H80" fill="#80aabd"/><path d="M17 48V38H28V48M69 48V38H80V48" fill="#9caaad"/>
    <path d="M46 49V68M50 49V68" stroke="#e8d47d" stroke-width="2" stroke-dasharray="4 3"/>`
  else if (/supermarket/.test(assetId)) art = `
    <path d="M8 22L48 8L88 22V63H8Z" fill="#e5ecee" stroke="#80939e" stroke-width="2"/><path d="M8 22L48 8L88 22V28H8Z" fill="#5d7482"/>
    <path d="M18 33L34 28V54L18 59ZM39 29L53 32V58L39 55ZM59 31L74 27V53L59 58Z" fill="#9aadb4" stroke="#f6f8f7" stroke-width="2"/>
    <path d="M21 37H31M21 43H31M42 37H50M42 44H50M62 36H71M62 43H71" stroke="#e7b45f" stroke-width="3"/>
    <path d="M72 55V43H82V62H68" fill="#315be8"/><path d="M11 64H86" stroke="#758995" stroke-width="3"/>`
  else if (/movie-theater/.test(assetId)) art = `
    <path d="M8 18L48 6L88 18V65H8Z" fill="#37485b" stroke="#25384b" stroke-width="2"/><path d="M22 19H74V38H22Z" fill="#c8e5ed" stroke="#f5f6ef" stroke-width="2"/>
    <path d="M15 47L42 41V49L15 55ZM51 41L81 47V55L51 49Z" fill="#8a5268"/><path d="M20 48V57M29 46V55M38 44V53M57 44V53M67 46V55M76 48V57" stroke="#e4bbc2" stroke-width="2"/>
    <path d="M43 43V61M48 43V61" stroke="#e9c66d" stroke-width="2"/><path d="M11 65H85" stroke="#71808b" stroke-width="3"/>`
  else if (/train-car/.test(assetId)) art = `
    <path d="M20 10L75 20V63L20 53Z" fill="#dce8ea" stroke="#647b89" stroke-width="2"/><path d="M20 10L75 20V27L20 18Z" fill="#315be8"/>
    <path d="M28 23L39 25V35L28 33ZM46 26L57 28V38L46 36ZM64 29L71 30V40L64 39Z" fill="#6f9db0" stroke="#f4f6f4"/>
    <path d="M23 41L34 43V49L23 47ZM42 44L53 46V52L42 50ZM61 47L70 49V55L61 53Z" fill="#8798a0"/><path d="M16 59L79 69M27 59L25 64M67 66L65 71" stroke="#485b67" stroke-width="3"/>`
  else if (/backyard-pool/.test(assetId)) art = `
    <path d="M6 19L48 6L90 19V64H6Z" fill="#dfe9e5" stroke="#8ea19a" stroke-width="2"/><path d="M6 19L48 6L90 19V25H6Z" fill="#708a7c"/>
    <path d="M14 31L39 24V56L14 62Z" fill="#d0d8cf"/><path d="M46 37L79 30V51L46 59Z" fill="#42b9d0" stroke="#f4f8f4" stroke-width="3"/>
    <path d="M50 42L74 37M50 48L74 43" stroke="#d8f5ef" stroke-width="2"/><path d="M11 65H85" stroke="#7c927e" stroke-width="3"/>`
  else if (/aerial-sky/.test(assetId)) art = `
    <defs><linearGradient id="aerial-sky" x2="0" y2="1"><stop stop-color="#5ca9dc"/><stop offset="1" stop-color="#e7f4f7"/></linearGradient></defs>
    <rect width="96" height="72" fill="url(#aerial-sky)"/>
    <path d="M8 15Q9 10 16 11Q20 5 27 10Q33 9 35 15H8ZM61 12Q62 6 70 7Q75 0 82 7Q90 7 91 13H61Z" fill="#fff" stroke="#d9e9ef" stroke-width="1.2"/>
    <path d="M6 56L29 45L49 51L31 62L6 68Z" fill="#738792"/><path d="M6 56L29 45L49 51L31 62Z" fill="#879da5" stroke="#e0e9e7" stroke-width="1"/><path d="M31 62L49 51V60L31 69Z" fill="#5b707b"/>
    <path d="M55 50L75 39L94 45L74 56Z" fill="#81969e" stroke="#e1e9e6" stroke-width="1"/><path d="M74 56L94 45V59L74 70Z" fill="#5b707b"/><path d="M55 50L74 56V70L55 64Z" fill="#6f828a"/>
    <path d="M43 21L53 17L57 54L47 60Z" fill="#d8eaf0" opacity=".42" stroke="#ecf7f9" stroke-width="1.2"/><path d="M50 21L50 56" stroke="#1478a5" stroke-width="2" stroke-dasharray="3 3"/>
    <path d="M44 28L50 24L56 28M44 41L50 37L56 41M44 52L50 48L56 52" fill="none" stroke="#fff" stroke-width="1.5" opacity=".9"/>
    <path d="M12 58L26 51M12 63L25 56M80 54L90 48" stroke="#d8e3e5" stroke-width="1.2"/>`
  else if (/tropical/.test(key)) art = `
    <defs><linearGradient id="playground-sea" x2="0" y2="1"><stop stop-color="#56c5d0"/><stop offset="1" stop-color="#237e99"/></linearGradient></defs>
    <rect width="96" height="72" fill="url(#playground-sea)"/>
    <path d="M2 16Q15 12 27 16M68 12Q80 9 94 14M2 62Q13 58 23 62M74 66Q84 61 95 64" fill="none" stroke="#d8f4ef" stroke-width="1.5" opacity=".75"/>
    <ellipse cx="49" cy="40" rx="42" ry="26" fill="#6ce0d5" opacity=".8"/><path d="M10 39Q14 24 31 18L52 15L76 20L88 35L83 53L67 63L39 64L17 55Z" fill="#d8bd82" stroke="#f4dfac" stroke-width="2"/>
    <path d="M17 37Q21 26 35 23L53 22L70 27L80 38L74 50L58 57L36 57L21 49Z" fill="#7eaa64"/><path d="M18 39Q33 32 46 37T73 37" fill="none" stroke="#a5cf73" stroke-width="2"/>
    <path d="M24 23L32 18L39 24L37 31L31 34L24 31Z" fill="#7b8580"/><path d="M27 25Q31 22 36 25L35 29Q31 32 27 29Z" fill="#172522"/><circle cx="29" cy="26" r="1" fill="#f1e8ce"/><circle cx="34" cy="26" r="1" fill="#f1e8ce"/>
    <path d="M49 49H65V57H49Z" fill="#8b4d31" stroke="#5b3b2e"/><path d="M48 48Q57 43 66 48V51H48Z" fill="#b77840"/><path d="M54 48V57M61 48V57" stroke="#e7ba62" stroke-width="1.5"/>
    <path d="M69 43L75 35L83 38L81 44L76 48Z" fill="#505a5d"/><circle cx="72" cy="47" r="2.5" fill="#654833"/><circle cx="81" cy="44" r="2.5" fill="#654833"/>
    <path d="M40 27L41 17M40 18Q30 11 28 20Q34 17 40 18Q45 10 51 17Q46 15 40 18M60 29L62 18M62 19Q54 12 52 20Q58 17 62 19Q69 11 74 19Q68 16 62 19" fill="none" stroke="#805b3f" stroke-width="2.4" stroke-linecap="round"/><path d="M40 18Q30 11 28 20Q34 17 40 18Q45 10 51 17Q46 15 40 18M62 19Q54 12 52 20Q58 17 62 19Q69 11 74 19Q68 16 62 19" fill="#3c945b"/>
    <path d="M18 27L18 22M24 24L24 20M30 23L30 19M36 22L36 19M42 22L42 19M48 22L48 19M54 22L54 19" stroke="#8d543b" stroke-width="1.5"/><path d="M16 27H54" stroke="#704832" stroke-width="1.3"/>
    <path d="M38 59L33 65M43 60L40 67M49 61L48 67M55 61L57 67" stroke="#fff4d5" stroke-width="2" opacity=".75"/>`
  else if (/monkey/.test(key)) art = `
    <ellipse cx="49" cy="63" rx="23" ry="4" fill="#cad8dc"/><path d="M32 57Q25 48 31 39L38 34H59L67 42L64 59Z" fill="${color}" stroke="#465968" stroke-width="2"/>
    <circle cx="48" cy="25" r="18" fill="#9b6542" stroke="#465968" stroke-width="2"/><circle cx="30" cy="27" r="7" fill="#9b6542" stroke="#465968" stroke-width="2"/><circle cx="66" cy="27" r="7" fill="#9b6542" stroke="#465968" stroke-width="2"/>
    <ellipse cx="49" cy="31" rx="11" ry="8" fill="#dfb58e"/><circle cx="42" cy="23" r="2" fill="#202d38"/><circle cx="55" cy="23" r="2" fill="#202d38"/><path d="M44 34Q49 38 55 34M61 52Q79 53 75 65Q72 70 67 65" fill="none" stroke="#70452f" stroke-width="3" stroke-linecap="round"/>
    <path d="M37 57L34 68M58 57L61 68M36 41L27 51M61 41L70 49" stroke="#465968" stroke-width="4" stroke-linecap="round"/>`
  else if (/wolf|pig|character|person|adult|child|performer/.test(key)) {
    const pig = /pig/.test(key)
    const wolf = /wolf/.test(key)
    const dog = /dog|cat|animal/.test(key)
    art = dog
      ? `<ellipse cx="45" cy="46" rx="24" ry="14" fill="${color}"/><ellipse cx="67" cy="36" rx="13" ry="11" fill="${color}"/><path d="M61 28Q58 15 69 23L72 29M73 28Q85 18 81 34M23 43Q10 31 17 24Q27 27 31 38M30 55L28 66M51 56L52 66M66 51L69 64" fill="none" stroke="#40515a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M74 37L84 41L75 45Z" fill="#c89983"/><circle cx="70" cy="34" r="1.8" fill="#17212b"/>`
      : pig || wolf
        ? `<ellipse cx="49" cy="66" rx="24" ry="4" fill="#cad8dc"/>
          <path d="M33 57Q22 58 20 50Q18 43 25 40" fill="none" stroke="${pig ? '#f1a9bd' : '#71859a'}" stroke-width="3.5" stroke-linecap="round"/>
          ${pig ? '<path d="M37 57V67M60 57V67" stroke="#465968" stroke-width="5" stroke-linecap="round"/><path d="M31 39Q32 34 39 33H59Q68 36 68 45V59H31Z" fill="#eb8c43" stroke="#465968" stroke-width="2"/><path d="M39 38L40 56M59 38L58 56" stroke="#f7c76f" stroke-width="3"/><path d="M42 43H56V58H42Z" fill="#d57938"/><circle cx="43" cy="42" r="1.8" fill="#ffe1a2"/><circle cx="55" cy="42" r="1.8" fill="#ffe1a2"/>' : '<path d="M37 59L35 67M59 59L62 67" stroke="#465968" stroke-width="5" stroke-linecap="round"/><path d="M30 58L29 45Q30 37 38 34H59Q68 38 68 48L66 60Z" fill="#43556d" stroke="#344554" stroke-width="2"/><path d="M39 36L45 54M57 36L51 54" stroke="#c6a96d" stroke-width="2.8"/><path d="M44 47L49 53L54 47" fill="none" stroke="#e2d3ab" stroke-width="2"/><path d="M62 51Q78 47 79 58Q78 64 71 63" fill="none" stroke="#71859a" stroke-width="3" stroke-linecap="round"/>'}
          <ellipse cx="49" cy="26" rx="18" ry="17" fill="${pig ? '#f6b5c6' : '#8fa0af'}" stroke="#465968" stroke-width="2"/>
          <path d="${pig ? 'M36 17Q30 4 42 13L45 18M54 18Q68 4 63 21' : 'M34 17L31 3L45 15M53 15L68 3L64 21'}" fill="${pig ? '#ee99ac' : '#708398'}" stroke="#465968" stroke-width="2" stroke-linejoin="round"/>
          <path d="${pig ? 'M36 16L42 17M58 17L63 15' : 'M36 12L39 16M61 14L65 10'}" stroke="${pig ? '#f8c5d1' : '#bac7d0'}" stroke-width="1.5"/>
          <ellipse cx="49" cy="34" rx="${pig ? 11 : 13}" ry="${pig ? 7 : 8}" fill="${pig ? '#ed91ab' : '#c3cbd1'}" stroke="${pig ? '#df7b97' : '#758694'}" stroke-width="1.2"/>
          <circle cx="42" cy="25" r="3.2" fill="#fffaf2"/><circle cx="56" cy="25" r="3.2" fill="#fffaf2"/><circle cx="42.8" cy="25.4" r="1.7" fill="#243746"/><circle cx="55.2" cy="25.4" r="1.7" fill="#243746"/>
          ${pig ? '<ellipse cx="46" cy="34" rx="1.5" ry="2.2" fill="#674f58"/><ellipse cx="52" cy="34" rx="1.5" ry="2.2" fill="#674f58"/><path d="M44 40Q49 43 54 40" fill="none" stroke="#a95c73" stroke-width="1.8"/>' : '<path d="M43 36L49 39L56 36M47 42L51 42" fill="none" stroke="#344754" stroke-width="2" stroke-linecap="round"/><path d="M41 41L44 46M48 42V47M55 41L53 46" stroke="#f2eee4" stroke-width="1.7"/>'}`
        : `<ellipse cx="48" cy="64" rx="17" ry="4" fill="#cad8dc"/><path d="M39 31Q48 26 57 31L62 55L57 61H39L34 55Z" fill="${color}" stroke="#465968" stroke-width="2"/><circle cx="48" cy="20" r="10" fill="#e2b99d"/><path d="M39 18Q40 7 49 9Q58 9 58 18Z" fill="#425466"/><path d="M40 40L30 52M56 40L66 52M42 59L39 68M54 59L58 68" stroke="#465968" stroke-width="4" stroke-linecap="round"/>`
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
  else if (/van/.test(key)) art = `<path d="M12 34Q12 28 20 28H62L81 41V60H12Z" fill="${color}" stroke="#40515a" stroke-width="2"/><path d="M21 33H58V47H21ZM63 34H69L77 43H63Z" fill="#d9f2f5" stroke="#8ba3ac" stroke-width="2"/><path d="M17 49H58V56H17Z" fill="#ffffff" opacity=".75"/><circle cx="29" cy="60" r="8" fill="#334155"/><circle cx="68" cy="60" r="8" fill="#334155"/>`
  else if (/car|sedan/.test(key)) art = `<path d="M12 46L22 34Q25 28 34 28H62Q70 28 75 37L84 46V58H12Z" fill="${color}" stroke="#40515a" stroke-width="2"/><path d="M30 32H60L69 44H24Z" fill="#d9f2f5" stroke="#91a7b0"/><path d="M17 49H79" stroke="#f7fafc" stroke-width="2"/><circle cx="29" cy="59" r="8" fill="#334155"/><circle cx="68" cy="59" r="8" fill="#334155"/>`
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
