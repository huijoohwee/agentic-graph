import type { LucideIcon } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'

export function XrCatalogArtwork({ assetId = '', label = '', color, Icon }: {
  assetId?: string; label?: string; color: string; Icon: LucideIcon
}) {
  const key = `${assetId} ${label}`.toLowerCase()
  const pig = /pig/.test(key), wolf = /wolf/.test(key)
  let artwork
  if (/tropical/.test(key)) artwork = <>
    <rect width="96" height="72" fill="#a5e6ed" /><path d="M0 35Q24 31 48 38T96 33V72H0Z" fill="#36b6bd" />
    <ellipse cx="49" cy="49" rx="36" ry="17" fill="#b5ebe0" /><ellipse cx="48" cy="45" rx="29" ry="16" fill="#f4d797" />
    <ellipse cx="48" cy="41" rx="19" ry="10" fill="#9ac66b" /><path d="M65 51L79 60M62 55L77 64" stroke="#a5734e" strokeWidth="3" />
    <path d="M31 43Q35 30 31 21M66 42Q59 27 64 18" fill="none" stroke="#916244" strokeWidth="3" />
    <path d="M31 21Q12 13 16 30Q23 20 31 21Q41 11 48 24Q39 19 31 21M64 18Q48 8 48 25Q56 17 64 18Q75 8 82 22Q72 16 64 18" fill="#338e60" />
  </>
  else if (pig || wolf) artwork = <>
    <ellipse cx="48" cy="62" rx="25" ry="5" fill="#d4e4df" /><path d="M27 64V45Q48 34 69 45V64Z" fill={color} />
    <path d={pig ? 'M29 28L25 9L42 21M55 20L71 9L66 33' : 'M26 31L25 4L42 23M54 22L72 4L70 34'} fill={pig ? '#ef99b2' : '#708398'} />
    <ellipse cx="48" cy="33" rx="25" ry="22" fill={pig ? '#f6b5c6' : '#8fa0af'} />
    <ellipse cx="48" cy="41" rx={pig ? 13 : 17} ry="9" fill={pig ? '#ee8eaa' : '#c3cbd1'} />
    <g fill="#263c4d"><circle cx="37" cy="29" r="3" /><circle cx="59" cy="29" r="3" />
      {pig ? <><circle cx="43" cy="41" r="2" /><circle cx="53" cy="41" r="2" /></> : <ellipse cx="48" cy="39" rx="5" ry="3" />}</g>
  </>
  else if (/straw|stick|brick|house/.test(key)) artwork = <>
    <ellipse cx="49" cy="63" rx="34" ry="5" fill="#d4e4df" /><path d="M20 31H76V61H20Z" fill={color} />
    <path d="M15 33L47 9L81 33Z" fill={/straw/.test(key) ? '#e2b652' : '#90513c'} />
    {/brick/.test(key) ? <path d="M65 23V8H73V29M21 40H75M21 50H75M32 32V40M56 32V40M42 40V50M65 40V50M30 50V61M57 50V61" fill="none" stroke="#f1bd97" strokeWidth="2" /> : <path d="M23 34V60M30 34V60M37 34V60M58 34V60M65 34V60M72 34V60" stroke="#84623e" strokeWidth="2" />}
    <path d="M40 61V42Q48 35 55 42V61Z" fill="#563d36" /><path d="M61 37H70V46H61Z" fill="#c0e7e8" />
  </>
  else if (/sailboat/.test(key)) artwork = <>
    <path d="M0 60Q25 53 49 61T96 58V72H0Z" fill="#9adee0" /><path d="M17 49H80L68 63H29Z" fill={color} />
    <path d="M46 51V7" stroke="#865d3d" strokeWidth="3" /><path d="M49 10L77 45H49Z" fill="#fff4d3" stroke="#dac99e" /><path d="M41 20L22 45H41Z" fill="#e78464" />
  </>
  else if (/pot|soup/.test(key)) artwork = <>
    <path d="M25 36Q25 66 48 66Q71 66 71 36" fill={color} /><ellipse cx="48" cy="36" rx="23" ry="8" fill="#384857" />
    <ellipse cx="48" cy="35" rx="18" ry="5" fill="#efb956" /><path d="M22 40H15V50H26M73 40H81V50H71M35 24Q26 17 36 9M49 22Q40 14 50 6M63 24Q54 17 64 9" fill="none" stroke="#a9bdc4" strokeWidth="3" />
  </>
  else if (/cannonball/.test(key)) artwork = <><ellipse cx="48" cy="61" rx="25" ry="5" fill="#d4e4df" /><circle cx="48" cy="36" r="22" fill="#37464b" /><circle cx="40" cy="28" r="7" fill="#657b80" /></>
  else if (/cannon/.test(key)) artwork = <><path d="M18 48H78V61H18Z" fill="#986c48" /><circle cx="30" cy="55" r="9" fill="#4a3830" /><circle cx="67" cy="55" r="9" fill="#4a3830" /><path d="M26 45L38 22L80 12L85 33L50 47Z" fill="#46555b" /><ellipse cx="79" cy="23" rx="7" ry="11" fill="#233439" /></>
  else if (/chest/.test(key)) artwork = <><path d="M19 31Q19 12 48 12Q77 12 77 31V60H19Z" fill="#a36e42" /><path d="M19 34H77M33 16V60M64 16V60" fill="none" stroke="#e2bb61" strokeWidth="5" /><path d="M42 31H54V45H42Z" fill="#f1d179" /></>
  else if (/key/.test(key)) artwork = <><circle cx="31" cy="29" r="15" fill="none" stroke="#e2ba45" strokeWidth="8" /><path d="M41 40L70 63M58 51L65 42M67 58L76 49" stroke="#e2ba45" strokeWidth="8" /></>
  else if (/barrel/.test(key)) artwork = <><path d="M30 12Q12 36 30 62H67Q84 36 67 12Z" fill="#a67a49" /><ellipse cx="48" cy="13" rx="19" ry="6" fill="#c59b63" /><path d="M23 26H74M23 49H74" stroke="#4c5858" strokeWidth="6" /></>
  else if (/palm/.test(key)) artwork = <><path d="M44 64Q53 36 45 22" fill="none" stroke="#9e7048" strokeWidth="7" /><path d="M45 22Q12 1 14 34Q25 20 45 22Q30 0 58 4Q47 13 45 22Q77 1 86 34Q66 20 45 22" fill="#45936c" /></>
  else if (/rock|grotto/.test(key)) artwork = <><path d="M10 58L17 31L38 12L68 17L87 49L78 62Z" fill="#71838a" /><path d="M17 31L49 27L38 12M49 27L63 60L87 49" fill="#88989c" /></>
  else if (/tree|oak/.test(key)) artwork = <><path d="M43 61V31H52V61Z" fill="#946243" /><circle cx="47" cy="28" r="23" fill={color} /><circle cx="29" cy="35" r="14" fill="#5c9e64" /><circle cx="65" cy="34" r="15" fill="#75ad63" /></>
  else return <Icon className="size-7 max-h-full max-w-full" strokeWidth={1.6} aria-hidden />
  return <svg viewBox="0 0 96 72" className="h-full w-full rounded" role="img" aria-label={`${label || assetId} native illustration`} data-kg-xr-catalog-artwork={assetId || label}>
    <rect width="96" height="72" rx="6" fill="#edf4ed" />{artwork}
  </svg>
}

export function XrCatalogThumb({ Icon, color, assetId, label }: { Icon: LucideIcon; color: string; assetId?: string; label?: string }) {
  return (
    <span
      className={cn('grid size-10 shrink-0 place-items-center rounded border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
      style={{ color }}
      aria-label={`${label || 'Subject'} preview`}
    >
      <XrCatalogArtwork Icon={Icon} color={color} assetId={assetId} label={label} />
    </span>
  )
}
