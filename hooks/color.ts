// Terminal color helpers: 256-color rounding, tinting, and darkening for light backgrounds. No plugin state besides colorMode.
// Whether the terminal shows 24-bit colors (COLORTERM), set by decidePixelTerm in register.tsx. Without it the engine rounds each color to the 256-color palette.
export const colorMode = { trueColor: true }
// Mix a hex color with white (k is the white ratio).
export const mixWhite = (hex: string, k: number) => `#${[1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k) + 255 * k).toString(16).padStart(2, '0')).join('')}`
// What the engine's rounding shows for #rrggbb in a 256-color terminal: grays go to the 24-step ramp, other colors to 6 levels per channel.
const LEVELS = [0, 95, 135, 175, 215, 255]
export const shown = (r: number, g: number, b: number): number[] => {
  if (r === g && g === b) { const v = r < 8 ? 0 : r > 248 ? 255 : 8 + 10 * Math.round(((r - 8) / 247) * 24); return [v, v, v] }
  return [r, g, b].map(c => LEVELS[Math.round((c / 255) * 5)]!)
}
const SNAP = [...Array.from({ length: 24 }, (_, n) => [8 + 10 * n, 8 + 10 * n, 8 + 10 * n]), ...Array.from({ length: 216 }, (_, i) => [Math.floor(i / 36) * 51, (Math.floor(i / 6) % 6) * 51, (i % 6) * 51])]
const snapped = new Map<string, string>()
// A background hex color as a 256-color terminal would show it, snapped to the input whose shown color is the nearest to the wanted one (e.g. '#3b4261' shows as the
// gray '#5f5f5f' by rounding; '#303030' is the nearest the palette has). Left alone with 24-bit colors, and for tokens such as 'subtle'.
export const indexedBg = (c: string): string => {
  if (colorMode.trueColor || !/^#[0-9a-f]{6}$/i.test(c)) return c
  const hit = snapped.get(c)
  if (hit) return hit
  const want = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
  let best = SNAP[0]!, bestD = Infinity
  for (const cand of SNAP) {
    const sh = shown(cand[0]!, cand[1]!, cand[2]!)
    const d = sh.reduce((a, v, i) => a + (v - want[i]!) ** 2, 0)
    if (d < bestD) { bestD = d; best = cand }
  }
  const out = `#${best.map(v => v.toString(16).padStart(2, '0')).join('')}`
  snapped.set(c, out)
  return out
}
// A dark tint for a 256-color terminal. The engine rounds a color to the palette by rounding each channel to one of 6 levels (0, 95, 135, 175, 215, 255), so
// '#3a1f24' becomes '#5f5f5f', far lighter than meant. A tint of the hue's strongest channels at 64 lands on level 95 of just those channels (dark red, dark teal),
// and a hue with no strong channel (gray) gets the dark gray of the grayscale ramp. A token such as 'subtle' passes through.
export const indexedTint = (dark: string, hue: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(dark)) return dark
  const ch = [1, 3, 5].map(i => parseInt(hue.slice(i, i + 2), 16))
  const max = Math.max(...ch)
  const strong = ch.map(c => (max - Math.min(...ch) > 40 && c >= max * 0.7 ? 64 : 0))
  return strong.some(Boolean) ? `#${strong.map(c => c.toString(16).padStart(2, '0')).join('')}` : '#262626'
}

// Relative luminance of #rrggbb (0 black to 1 white), and the color darkened toward black until its luminance is at most 0.28: a contrast of 3:1 or more on white,
// and still 6:1 on black. A color already that dark, and anything that isn't #rrggbb (theme tokens), stays.
export const luma = (r: number, g: number, b: number) => [r, g, b].map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i]!, 0)
export const midColor = (c: string | undefined): string | undefined => {
  if (!c || !/^#[0-9a-f]{6}$/i.test(c)) return c
  const rgb = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
  let f = 1
  while (f > 0.2 && luma(rgb[0]! * f, rgb[1]! * f, rgb[2]! * f) > 0.28) f -= 0.05
  const out = f === 1 ? c : `#${rgb.map(v => Math.round(v * f).toString(16).padStart(2, '0')).join('')}`
  return colorMode.trueColor ? out : snapDark(out)
}
// In a 256-color terminal the engine rounds each channel to the palette's levels (0, 95, 135, ...), which turns a mid color into a lighter one: '#6b7280' shows as
// (135,135,175). So of the colors the palette can show, take the nearest to the wanted one among those dark enough (luminance 0.30 at most) to read on white.
const snappedDark = new Map<string, string>()
export const snapDark = (c: string): string => {
  const hit = snappedDark.get(c)
  if (hit) return hit
  const want = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
  let best = SNAP[0]!, bestD = Infinity
  for (const cand of SNAP) {
    const sh = shown(cand[0]!, cand[1]!, cand[2]!)
    if (luma(sh[0]!, sh[1]!, sh[2]!) > 0.3) continue
    const d = sh.reduce((a, v, i) => a + (v - want[i]!) ** 2, 0)
    if (d < bestD) { bestD = d; best = cand }
  }
  const out = `#${best.map(v => v.toString(16).padStart(2, '0')).join('')}`
  snappedDark.set(c, out)
  return out
}
