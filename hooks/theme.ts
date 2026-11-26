import { scopeKey } from './state'
import type { Loop, LogKind } from '../types'

// Panel constants: colors, sizes, glyphs and hover styles shared by the screens.
// Token colors: Claude Code theme colors, so they match other Claude Code screens and follow light/dark themes.
// ↑(new input)=suggestion, ⟳(cache read)=permission, ↓(output)=claude, cost=warning
export const TOK = { input: 'suggestion', cache: 'permission', output: 'claude', cost: 'warning' }
export const C = { main: '#7dd3a8', agent: '#8ab4f8', tool: '#f6c177', server: '#c4a7e7', dim: '#6b7280', fail: '#f28b82' }
// Session metric colors: used both in the header (inverted background) and the folded row (normal background). Only mid-brightness
// colors are picked so they read on both white and black (contrast 3:1 or more on both).
export const M = { turn: '#3b82f6', steps: '#8b5cf6', tools: '#0d9488', cost: '#d97706' }
// Header title color: the main loop green (C.main) lowered to mid brightness
// Session map tool marks: glyph and color per tool class (also used by the minimized track)
export const MARK: Record<string, { g: string; c: string; name?: string }> = {
  '>': { g: '▶', c: C.main }, '|': { g: '│', c: C.dim }, '#': { g: '■', c: C.main },
  b: { g: '■', c: '#f6c177', name: 'Bash' }, r: { g: '■', c: '#9ccfd8', name: 'Read' },
  e: { g: '■', c: '#eb6f92', name: 'Edit' }, s: { g: '■', c: '#c4a7e7', name: 'Search' },
  w: { g: '■', c: '#73daca', name: 'Web' }, m: { g: '■', c: '#e0af68', name: 'MCP' }, h: { g: '⇄', c: C.server, name: 'Handoff' },
  k: { g: '■', c: '#ff9e64', name: 'Skill' }, a: { g: '⑂', c: C.agent, name: 'Agent' }, o: { g: '■', c: '#a9b1d6', name: 'other' },
  '!': { g: '!', c: C.fail, name: 'repeat fail' }, c: { g: '◇', c: C.server, name: 'compact' },
}
export const KEY_HI = 'text' // Shortcut keys in the footer: the theme text color reads darker than dim text on light or dark backgrounds
// ponytail: terminal Image sends each dot as 8 × 8 pixels (one character is 128 × 128, about 87KB). Raise it if cells are larger on Retina.
export const IMG_SCALE = 8
export const FOOT_H = 3 // Footer rows: sections, panel, keys
export const FOOT_LABEL_W = 9 // Width of the leading name (section, panel) on footer rows
export const SETTING_W = 48 // One settings item: the name (22), a gap, and the widest control ('[ Bottom (above prompt) ]', 25)
// Desktop header: rows its spacer takes in the flow (the app's default buttons are taller than a text row, plus a gap), and the opaque base painted
// under positioned layers there (sticky header, settings overlay), since desktop tints are translucent. inverseText is the theme's background-side color.
export const DESK_HEAD_H = 2
export const DESK_BASE = 'inverseText'
// Views drawn in the turn flow's place, in the order v and the settings View row cycle through them
export const VIEW_NEXT = { default: 'avatar', avatar: 'compact', compact: 'default' } as const
export const VIEW_NAME = { default: 'Turn flow', avatar: 'Walk', compact: 'Compact' } as const
export const CARD_MAX = 300 // Max characters carried in a hidden card
export const SAID_MAX = 2000 // Length of the response head collected to extract the intent line
export const CONTINUE = '(continued without input)' // Prompt shown for a turn started without input
export const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'] // In-flight request glyphs: the same characters as Claude Code's spinner, cycled back and forth
export const TITLE = '#1e3a8a' // Logo chip background: deep blue (the mostly white telescope emoji and white text both stay crisp)
export const ICON: Record<Loop['status'], string> = { idle: '○', thinking: '◐', tool: '⚙', done: '✓', failed: '✗' }
export const KIND: Record<LogKind, { icon: string; color: string }> = {
  prompt: { icon: '▶', color: C.main }, step: { icon: '◆', color: C.dim }, tool: { icon: '⚙', color: C.tool },
  agent: { icon: '⑂', color: C.agent }, answer: { icon: '■', color: C.main }, server: { icon: '✦', color: C.server },
  compact: { icon: '◇', color: C.server },
}
export const BOX_ROWS = 6
export const LOG_ROWS = 4 // Minimum session log height
export const MAP_ROWS = 4 // Minimum session map height (height when shrunk with ⇕)
// Rows the turn flow is estimated to take in the vertical split: header 3 + step box 7 + branches 3 + progress 1 + subagent title and return box 4
export const FLOW_H = 18
// Header button chips are a fixed 3 cells each (icon with a space on either side), not measured from their text.
export const HEAD_CHIP_W = 3
// Close button on hover: black background, white text. The engine inverts a button under the pointer on top of its hover style,
// so the style is given pre-inverted (white background, black text).
export const CLOSE_HOVER = { color: '#000000', backgroundColor: '#ffffff' } as const
// Hovering a button turns its text bold and underlined. The terminal decides the pointer shape and mods can't change it, so this marks what's clickable.
// A Button's hover only applies inside a keyed box or with a scope, so each button gets its own scope.
export const hov = (key: string) => ({ scope: scopeKey('btn-', key), bold: true, underline: true }) as const
// Buttons with a hotkey: the engine draws the hotkey in its accent color and inverts the whole button under the pointer, so the hotkey cell
// came out on a different background from the label. Coloring the label with the same theme color on hover makes both invert to one background.
export const HOTKEY_ACCENT = 'suggestion'
export const hovKey = (key: string) => ({ ...hov(key), color: HOTKEY_ACCENT }) as const
export const WIDE = 110 // Width requested when expanded. A width the user dragged to takes precedence.
