import type { SketchMark } from '@/lib/graph/canvasSketch'

const ink = '#243548', light = '#f7f3e6', copper = '#efaa69', glass = '#b8e4da'
const mark = (d: string, fill = 'none', stroke = ink, width = 2.8): SketchMark => ({ d, fill, stroke, width })

// Each figure is authored in a 120 × 100 local coordinate space. The bottom
// strip is reserved for the editable node label.
const figures = {
  human: (accent: string) => [
    mark('M24 81 Q21 57 36 53 L54 48 Q67 51 73 69 L87 69 L90 78 L67 81 Z', accent),
    mark('M39 52 L40 43 L54 41 L54 52 Q49 60 39 52 Z', copper),
    mark('M32 28 Q31 12 48 11 Q64 9 67 26 L65 32 L70 37 L64 39 Q64 51 53 50 Q39 48 33 40 Z', '#f4c499'),
    mark('M31 36 Q19 27 29 15 Q26 9 38 8 Q43 0 54 7 Q66 4 70 17 L61 22 Q55 16 51 25 L43 23 L40 37 Z', ink),
    mark('M50 28 L60 27 L62 33 L52 34 Z M61 28 L65 27', 'none', ink, 1.9),
    mark('M56 42 Q60 44 63 41 M40 63 L50 74 L75 69', 'none', ink, 3),
    mark('M75 69 Q80 62 85 63 L84 67 L91 67 Q97 69 91 73 L78 76 Z', '#f4c499', ink, 1.7),
  ],
  robot: (accent: string) => [
    mark('M59 22 L63 11 L76 9 M75 9 L78 6', 'none', ink, 3),
    mark('M76 6 A4 4 0 1 0 84 6 A4 4 0 1 0 76 6 Z', copper),
    mark('M32 59 Q32 52 40 52 L73 52 Q80 54 80 62 L84 80 L31 80 Z', accent),
    mark('M43 55 L68 55 L65 65 L45 65 Z', '#d3e6ea'),
    mark('M27 25 Q27 18 35 18 L77 18 Q87 18 87 28 L85 43 Q84 49 75 50 L37 50 Q28 50 27 43 Z', '#cfdee0'),
    mark('M34 27 Q34 23 40 23 L75 23 Q81 23 80 29 L78 40 Q77 43 70 43 L40 43 Q34 43 34 37 Z', ink),
    mark('M42 31 L46 31 M63 31 L67 31 M51 36 Q55 39 60 35', 'none', '#91e3cb', 3),
    mark('M30 62 L21 67 L11 61 M13 62 L11 55 M12 62 L6 59 M81 58 L91 66 L94 60', 'none', '#617e8c', 4),
    mark('M37 79 L38 83 L46 83 L47 79 M68 79 L69 83 L77 83 L77 79', ink),
  ],
  workstation: (accent: string) => [
    mark('M17 18 L101 17 Q104 17 104 22 L101 62 Q101 66 97 66 L17 66 Q13 66 14 61 L14 23 Q14 19 17 18 Z', accent),
    mark('M21 24 L97 23 L95 57 L20 58 Z', '#203340'),
    mark('M33 33 L27 38 L33 42 M49 32 L42 45 M55 34 L61 38 L55 42', 'none', '#9de7bc', 2.5),
    mark('M69 34 L87 34 M69 40 L81 40 M28 49 L63 49', 'none', '#e7bc85', 2),
    mark('M52 67 L65 67 L67 75 L51 75 Z', '#687e90'),
    mark('M42 76 L76 76 M26 81 L91 81 L86 76 L79 76', 'none', ink, 3),
  ],
  circle: (c: string) => [mark('M60 10 A35 35 0 1 0 60 80 A35 35 0 1 0 60 10 Z', c)],
  ellipse: (c: string) => [mark('M14 46 A46 30 0 1 0 106 46 A46 30 0 1 0 14 46 Z', c)],
  rectangle: (c: string) => [mark('M16 17 L104 17 L104 75 L16 75 Z', c)],
  square: (c: string) => [mark('M28 13 L92 13 L92 77 L28 77 Z', c)],
  triangle: (c: string) => [mark('M60 10 L104 78 L16 78 Z', c)],
  diamond: (c: string) => [mark('M60 9 L107 45 L60 81 L13 45 Z', c)],
  star: (c: string) => [mark('M60 8 L71 34 L101 36 L78 54 L86 80 L60 65 L34 80 L42 53 L19 36 L49 34 Z', c)],
  cloud: (c: string) => [mark('M27 70 C6 68 6 44 27 39 C28 14 60 7 71 28 C87 18 105 34 100 49 C119 59 102 75 90 71 Z', c)],
  tree: (c: string) => [mark('M58 58 L66 58 L70 80 L54 80 Z', copper), mark('M59 7 L31 42 L42 42 L22 63 L98 63 L77 41 L86 41 Z', c)],
  house: (c: string) => [mark('M28 40 L94 40 L94 79 L28 79 Z', light), mark('M16 43 L58 9 L105 43 Z', c), mark('M53 79 L53 53 L71 53 L71 79 Z', copper)],
  sun: (c: string) => [mark('M41 45 A19 19 0 1 0 79 45 A19 19 0 1 0 41 45 Z', c), mark('M60 9 L60 17 M60 73 L60 81 M23 45 L31 45 M89 45 L97 45 M33 18 L39 24 M81 65 L88 72 M33 72 L39 66 M81 25 L88 18', 'none', c, 4)],
}
export type FigureKind = keyof typeof figures
export const sketchColors: Record<string, string> = {
  red: '#e88378', orange: '#eca35f', yellow: '#edc864', green: '#87c79b', blue: '#74a7d3',
  purple: '#ad94d2', pink: '#e5a1bb', teal: '#67b7b2', white: '#f1efe6', black: '#384552',
}
export function figureMarks(kind: FigureKind, color?: string) {
  return figures[kind](color || (kind === 'robot' ? glass : kind === 'sun' ? sketchColors.yellow : kind === 'tree' ? sketchColors.green : sketchColors.blue))
}
