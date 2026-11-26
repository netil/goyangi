import { test, expect } from 'claude-code/testing'
import { termArt, topTurns, sessionSummary, type TermEnv } from '../hooks/state'

// One row per terminal setup: what the character art and the header logo are drawn with.
const CASES: [string, TermEnv, 'image' | 'octant' | 'quadrant'][] = [
  ['Ghostty', { TERM: 'xterm-ghostty', TERM_PROGRAM: 'ghostty' }, 'image'],
  ['kitty', { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1' }, 'image'],
  ['WezTerm', { TERM_PROGRAM: 'WezTerm', WEZTERM_EXECUTABLE: '/x' }, 'octant'],
  ['herdr (TERM_PROGRAM set)', { TERM_PROGRAM: 'herdr', HERDR_ENV: '1', KITTY_WINDOW_ID: '1' }, 'octant'],
  ['herdr (outer ghostty shows through)', { TERM_PROGRAM: 'ghostty', HERDR_ENV: '1', GHOSTTY_RESOURCES_DIR: '/x' }, 'octant'],
  ['tmux in Ghostty', { TERM_PROGRAM: 'tmux', TMUX: '/t', GHOSTTY_RESOURCES_DIR: '/x' }, 'octant'],
  ['zellij in kitty', { ZELLIJ: '0', KITTY_WINDOW_ID: '1' }, 'octant'],
  ['VS Code opened from a kitty shell', { TERM_PROGRAM: 'vscode', KITTY_WINDOW_ID: '1' }, 'quadrant'],
  ['iTerm2', { TERM_PROGRAM: 'iTerm.app' }, 'quadrant'],
  ['Terminal.app', { TERM_PROGRAM: 'Apple_Terminal' }, 'quadrant'],
  ['Obsidian terminal', { TERM: 'xterm-256color' }, 'quadrant'],
]

for (const [name, env, art] of CASES) test(`terminal art: ${name} draws ${art}`, () => expect(termArt(env)).toBe(art))

test('topTurns: the heaviest turns first, numbered from the first kept turn; zero weights are left out', () => {
  const turns = [{ c: 1 }, { c: 5 }, { c: 0 }, { c: 3 }]
  expect(topTurns(turns, 10, t => t.c, 2)).toEqual([{ no: 12, w: 5 }, { no: 14, w: 3 }])
  expect(topTurns(turns, 0, t => t.c, 9).map(x => x.no)).toEqual([2, 4, 1])
})

test('sessionSummary: totals and one row per kept turn, pipes in prompts escaped', () => {
  const md = sessionSummary({ id: 's1', total: 5, first: 3, cost: 1.5, now: 9000, turns: [
    { id: 'a', prompt: 'fix | this', startedAt: 0, endedAt: 2000, seq: '', tools: 4, agents: 1, ok: true, cost: 0.5 },
    { id: 'b', prompt: 'next', startedAt: 3000, seq: '', tools: 0, agents: 0, ok: false },
  ] })
  expect(md).toContain('- Turns: 5 (the last 2 are listed)')
  expect(md).toContain('| T4 | fix / this |')
  expect(md).toContain('| T5 | next |')
  expect(md).toContain('failed')
})
