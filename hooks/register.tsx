import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, ElementConstructor, EngineInterface, Register, RenderInput, TextProps } from 'claude-code'
import type { FlowItem, Fold, LogKind, Loop, AppIcon, Peer, Peers, Prefs, Tab, SessionRecord, Tree, TurnSnap } from '../types'
import {
  addLog, addDiff, lineDelta, addServer, arrowFrame, bar, branchLines, bump, displayWidth, ellipsis, joinLines, usd, logWindow, countTool, describeAgent, emptyTree, ended, fit, flowColumns, flowEnd, flowStart, fmtTok, isBusy, runs, toolClass, turnBegin, turnMark,
  patchLoop, secs, summarize, toolEnd, toolStart, topTools, visibleAgents, who,
  toolErr, noteFail, addToolTime, slowTools, ctxLevel, focusFlow, stepOpen, spawnOrigin, returnTarget, headState,
  shouldCheckUpdate, updatedVersion, deskOf, CHARACTERS, characterOf, look as LOOK, dotRows, dotSvg, dotRgba, pixelTerminal, octantTerminal, iconKind, REFRESH_ICON, dotScene, flagShapes, flagSvg, parsePeers, parseAgents, appOf, hostTag, parseTabs, findTabs, stick, treeRows, handoffLabel, handoffSid, tabsScript, firefoxCmd, firefoxFocus, BROWSERS, pickBrowsers, isAgent, cmuxTarget, screenState, handoffNote, pullRequest, pullFrom, handoffFrom, sprite, miniSprite, petMood, petPixels, overlay, faceKeep, replayAt, costMark, prop, stations,
  WINDOW_MS, limitEta, isStalled, cacheDropped, ctxParts, upsertRecord, historySummary, pickKids,
  miniTrack, firstLine, toolResult, addFile, timeStrip, overlaps, archiveTurn, mapTokens, weightBar, timeShares, shareWidths, advise, isKeyLog, brailleSpark, lineGauge, rowCard, wrapLines, resumed, scopeKey,
} from './state'
import type { Browser, DotSeg, Pose, Station, StepMark } from './state'

const PANE = 'goyangi'
const tree = atom({ plugin: 'goyangi', key: 'tree' } as const, emptyTree())
// Values an older version left in session state (no stops, turn) are dropped and we start fresh.
const norm = (t: Tree): Tree => {
  if (!('turn' in t && 'stops' in t && 'server' in t && 'flow' in t && 'turns' in t && 'logTotal' in t)) return emptyTree()
  // Fill values missing from older records with defaults.
  const u = t as Omit<Tree, 'toolTime' | 'fails' | 'turnTotal'> & Partial<Tree>
  // Older versions carried the archive in the tree. It now lives in the archive atom, so drop it from the tree.
  const { archive: _old, ...rest } = u
  return { ...rest, toolTime: u.toolTime ?? {}, fails: u.fails ?? {}, turnTotal: u.turnTotal ?? u.turns.length }
}
const tick = atom({ plugin: 'goyangi', key: 'tick' } as const, 0)
// Fold state. true means folded.
const logEnd = atom({ plugin: 'goyangi', key: 'logEnd' } as const, -1)
const mapEnd = atom({ plugin: 'goyangi', key: 'mapEnd' } as const, -1)
// Last column to show in the flow chart (index of the next column). -1 follows the latest step.
const flowPage = atom({ plugin: 'goyangi', key: 'flowPage' } as const, -1)
// Last spot to show on the walk view main row (index of the next spot). -1 follows the latest spot.
const questPage = atom({ plugin: 'goyangi', key: 'questPage' } as const, -1)
// Agent detail view: keep only this agent id in the flow chart and log. Empty string means all.
const focus = atom({ plugin: 'goyangi', key: 'focus' } as const, '')
// Flow chart columns with folded branches (main node id). Empty string means all columns are expanded.
const kidsFolded = atom({ plugin: 'goyangi', key: 'kidsFolded' } as const, '')
// Past turn being replayed in the flow chart (turn id). Empty string follows the current turn.
const viewTurn = atom({ plugin: 'goyangi', key: 'viewTurn' } as const, '')
// When the past turn replay opened (ms), so the walk view's pet starts its walk from the first spot
const replayFrom = atom({ plugin: 'goyangi', key: 'replayFrom' } as const, 0)
// Session map height (false: 4 rows; true: shares the remaining height with the session log) and weight bar basis (time/cost)
const mapTall = atom({ plugin: 'goyangi', key: 'mapTall' } as const, false)
const mapBasis = atom({ plugin: 'goyangi', key: 'mapBasis' } as const, 'time')
// Whether all advice rows are expanded
const tipsOpen = atom({ plugin: 'goyangi', key: 'tipsOpen' } as const, true)
// Session log: false shows key events only, true shows everything
const logAll = atom({ plugin: 'goyangi', key: 'logAll' } as const, true)
// Flow chart archive of finished turns (replayed from the session map). Written only when a turn ends.
const archive = atom({ plugin: 'goyangi', key: 'archive' } as const, {} as Record<string, TurnSnap>)
// Values changed in the settings screen (kept across sessions as 'prefs' in $.store) and whether the settings screen is open.
const prefs = atom({ plugin: 'goyangi', key: 'prefs' } as const, {} as Prefs)
const settingsOpen = atom({ plugin: 'goyangi', key: 'settingsOpen' } as const, false)
// Whether the panel is drawn above the prompt when position is bottom. When right, the engine's Pane holds the open state.
const bottomOpen = atom({ plugin: 'goyangi', key: 'bottomOpen' } as const, false)
// Open Claude Code sessions on this machine (the Open sessions box above the session map), refreshed every 30 seconds
const peers = atom({ plugin: 'goyangi', key: 'peers' } as const, { self: '', list: [] } as Peers)
const tabs = atom({ plugin: 'goyangi', key: 'tabs' } as const, [] as Tab[])
// Pulls waiting for their handoff (the other session's id → the pull's turn flow branch), and answered ones (branch → the turn the note arrived as, T5).
// Only a pull whose note comes back here is waited on: a send expects no answer, and a pull passed on to another session (`to`) answers there.
const pulls = atom({ plugin: 'goyangi', key: 'pulls' } as const, { wait: {} as Record<string, string>, back: {} as Record<string, string> })
// Sticky numbers (state.ts stick) for tabs and sessions: a number stays while its session or tab is open and is freed when it closes.
// Every session runs its own copy of this plugin, so the numbers also live in $.store, the one place they are shared.
const nums = atom({ plugin: 'goyangi', key: 'nums' } as const, {} as Record<string, number>)
const NUMBERS_NOTE = `Numbered targets (Goyangi): the person names other Claude Code sessions, coding agents and browser tabs by the numbers Goyangi shows, with no other context.
- A browser tab code is a letter and a number: B1, c2, G1 (case aside; B Brave, C Chrome, E Edge, A Arc, V Vivaldi, M Chromium, G ego lite, S Safari, F Firefox, W Whale). "b1에서 작업해줘", "C3 탭 읽어줘" mean that tab. Call mcp__goyangi__browser_tabs (list first if you don't know what B1 is) and work inside that tab with action run (JavaScript), read or focus. Don't open the address again in another browser tool.
- A bare number with 세션/session ("2번 세션에 보내줘", "1번에서 가져와") means that Open sessions entry. Call mcp__goyangi__sessions (list first), then send (this session's handoff to session \`to\`) or pull (session \`from\`'s handoff).
- A bare "3번" with no letter, no 세션/session and no earlier subject: read it as a session number first, and look for a tab only when sessions has no such number (tabs always have a letter). Ask the person only when it still fits more than one target.
- The numbers belong to the machine, not to this conversation: a number stays with its session or tab while it is open, and is freed when it closes, so a later one may reuse it. Never guess a number's target from memory; list again.`
// First shown row of the Open sessions and Browser tabs boxes, moved by the wheel and their scrollbars
// App icons for the Open sessions and Browser tabs rows, keyed by app name ('Claude', 'Brave Browser')
const icons = atom({ plugin: 'goyangi', key: 'icons' } as const, {} as Record<string, AppIcon>)
// Fresh session: '' idle, 'writing' while the model writes the handoff note, 'clearing' until /clear runs
const freshStage = atom({ plugin: 'goyangi', key: 'freshStage' } as const, '')
const peerFrom = atom({ plugin: 'goyangi', key: 'peerFrom' } as const, 0)
const tabFrom = atom({ plugin: 'goyangi', key: 'tabFrom' } as const, 0)
const fold = atom({ plugin: 'goyangi', key: 'fold' } as const, { all: false, side: false, map: false, flow: false, agents: false, log: false })

// Token colors: Claude Code theme colors, so they match other Claude Code screens and follow light/dark themes.
// ↑(new input)=suggestion, ⟳(cache read)=permission, ↓(output)=claude, cost=warning
const TOK = { input: 'suggestion', cache: 'permission', output: 'claude', cost: 'warning' }
const C = { main: '#7dd3a8', agent: '#8ab4f8', tool: '#f6c177', server: '#c4a7e7', dim: '#6b7280', fail: '#f28b82' }
// Session metric colors: used both in the header (inverted background) and the folded row (normal background). Only mid-brightness
// colors are picked so they read on both white and black (contrast 3:1 or more on both).
const M = { turn: '#3b82f6', steps: '#8b5cf6', tools: '#0d9488', cost: '#d97706' }
// Header title color: the main loop green (C.main) lowered to mid brightness
// Session map tool marks: glyph and color per tool class (also used by the minimized track)
const MARK: Record<string, { g: string; c: string; name?: string }> = {
  '>': { g: '▶', c: C.main }, '|': { g: '│', c: C.dim }, '#': { g: '■', c: C.main },
  b: { g: '■', c: '#f6c177', name: 'Bash' }, r: { g: '■', c: '#9ccfd8', name: 'Read' },
  e: { g: '■', c: '#eb6f92', name: 'Edit' }, s: { g: '■', c: '#c4a7e7', name: 'Search' },
  w: { g: '■', c: '#73daca', name: 'Web' }, m: { g: '■', c: '#e0af68', name: 'MCP' }, h: { g: '⇄', c: C.server, name: 'Handoff' },
  k: { g: '■', c: '#ff9e64', name: 'Skill' }, a: { g: '⑂', c: C.agent, name: 'Agent' }, o: { g: '■', c: '#a9b1d6', name: 'other' },
  '!': { g: '!', c: C.fail, name: 'repeat fail' }, c: { g: '◇', c: C.server, name: 'compact' },
}
const KEY_HI = 'text' // Shortcut keys in the footer: the theme text color reads darker than dim text on light or dark backgrounds
// ponytail: terminal Image sends each dot as 8 × 8 pixels (one character is 128 × 128, about 87KB). Raise it if cells are larger on Retina.
const IMG_SCALE = 8
const FOOT_H = 3 // Footer rows: sections, panel, keys
const FOOT_LABEL_W = 9 // Width of the leading name (section, panel) on footer rows
const SETTING_W = 48 // One settings item: the name (22), a gap, and the widest control ('[ Bottom (above prompt) ]', 25)
const SETTINGS_H = 15 // Settings screen height: border 2 + title 1 + items 11 + hint 1
const CARD_MAX = 300 // Max characters carried in a hidden card
const SAID_MAX = 2000 // Length of the response head collected to extract the intent line
const CONTINUE = '(continued without input)' // Prompt shown for a turn started without input
const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'] // In-flight request glyphs: the same characters as Claude Code's spinner, cycled back and forth
const TITLE = '#1e3a8a' // Logo chip background: deep blue (the mostly white telescope emoji and white text both stay crisp)
const ICON: Record<Loop['status'], string> = { idle: '○', thinking: '◐', tool: '⚙', done: '✓', failed: '✗' }
const KIND: Record<LogKind, { icon: string; color: string }> = {
  prompt: { icon: '▶', color: C.main }, step: { icon: '◆', color: C.dim }, tool: { icon: '⚙', color: C.tool },
  agent: { icon: '⑂', color: C.agent }, answer: { icon: '■', color: C.main }, server: { icon: '✦', color: C.server },
  compact: { icon: '◇', color: C.server },
}
const BOX_ROWS = 6
const LOG_ROWS = 4 // Minimum session log height
const MAP_ROWS = 4 // Minimum session map height (height when shrunk with ⇕)
// Rows the turn flow is estimated to take in the vertical split: header 3 + step box 7 + branches 3 + progress 1 + subagent title and return box 4
const FLOW_H = 18
// Header button chips are a fixed 3 cells each (icon with a space on either side), not measured from their text.
const HEAD_CHIP_W = 3
// Close button on hover: black background, white text. The engine inverts a button under the pointer on top of its hover style,
// so the style is given pre-inverted (white background, black text).
const CLOSE_HOVER = { color: '#000000', backgroundColor: '#ffffff' } as const
// Hovering a button turns its text bold and underlined. The terminal decides the pointer shape and mods can't change it, so this marks what's clickable.
// A Button's hover only applies inside a keyed box or with a scope, so each button gets its own scope.
const hov = (key: string) => ({ scope: scopeKey('btn-', key), bold: true, underline: true }) as const
// Buttons with a hotkey: the engine draws the hotkey in its accent color and inverts the whole button under the pointer, so the hotkey cell
// came out on a different background from the label. Coloring the label with the same theme color on hover makes both invert to one background.
const HOTKEY_ACCENT = 'suggestion'
const hovKey = (key: string) => ({ ...hov(key), color: HOTKEY_ACCENT }) as const
const WIDE = 110 // Width requested when expanded. A width the user dragged to takes precedence.

// Depending on the position setting (cur.position), open a right split (Pane) or mark the panel to be drawn above the prompt.
// The engine doesn't let plugins choose the Pane position, so the bottom position draws the same screen in the AbovePrompt area instead.
function openPane($: EngineInterface): Promise<unknown> {
  if (cur.position === 'bottom') return update($, bottomOpen, () => true)
  return $.ui.open({ id: PANE, title: 'Goyangi', columns: WIDE, closeOnEscape: true })
}
function closePane($: EngineInterface): Promise<unknown> {
  return cur.position === 'bottom' ? update($, bottomOpen, () => false) : $.ui.close({ id: PANE })
}

// Observation only: a failed state update never affects tool runs or model requests.
// State updates that need ordering are awaited; extra lookups and notifications are not.
const safe = (p: Promise<unknown>) => p.then(() => {}, () => {})
const quiet = (p: Promise<unknown>) => { void safe(p) }

// Session total cost when the previous model request ended. When the next request ends, the difference is that request's cost.
let lastCost: number | undefined
// Lookups are sent right away to capture the running total; only settlement follows request completion order.
// A late lookup never blocks a model response or the next lookup.
let costQueue: Promise<void> = Promise.resolve()
// Model requests in flight right now (main and subagents).
const activeSteps = new Set<StepMark>()
// version from plugin.json. Read once on first render ($.plugin has no version).
let version: string | undefined
// Whether the terminal draws Image as pixels (kitty, Ghostty). Decided from environment variables at session.start, and again at the first render
// when that never ran (a plugin reload re-reads this file without a new session.start).
let pixelTerm: boolean | undefined
// Whether character art uses quadrant blocks (▘▀▙) instead of octants: on terminals not known to have octant glyphs (Obsidian's terminal and others), octants break the layout.
let blockArt = false
// Whether the terminal shows 24-bit colors (COLORTERM). Without it the engine rounds each color to the 256-color palette, where the dark tints below come out as a light gray.
let trueColor = true
async function decidePixelTerm($: EngineInterface) {
  trueColor = await $.env.get('COLORTERM').then(v => /truecolor|24bit/i.test(v ?? '')).catch(() => true)
  // If environment variables can't be read (permissions, tests), use octant character art
  const env = await Promise.all([$.env.get('TERM'), $.env.get('TERM_PROGRAM'), $.env.get('KITTY_WINDOW_ID'), $.env.get('TMUX'), $.env.get('GHOSTTY_RESOURCES_DIR'), $.env.get('WEZTERM_EXECUTABLE')])
    .then(([TERM, TERM_PROGRAM, KITTY_WINDOW_ID, TMUX, GHOSTTY_RESOURCES_DIR, WEZTERM_EXECUTABLE]) => ({ TERM, TERM_PROGRAM, KITTY_WINDOW_ID, TMUX, GHOSTTY_RESOURCES_DIR, WEZTERM_EXECUTABLE }))
    .catch(() => undefined)
  pixelTerm = env ? pixelTerminal(env) : false
  blockArt = env ? !octantTerminal(env) : false
  const loc = await Promise.all([$.env.get('LC_ALL'), $.env.get('LC_CTYPE'), $.env.get('LANG')]).catch(() => [undefined, undefined, undefined])
  iconEnv = { ...env, LC_ALL: loc[0], LC_CTYPE: loc[1], LANG: loc[2] }
}
// What the terminal can draw, for the refresh icon (state.ts iconKind); empty until decidePixelTerm has read it
let iconEnv: Parameters<typeof iconKind>[1] = {}
// Mouse wheel hit testing: per panel (where drawn), the last drawn window position and a function telling which list a row counted from the bottom belongs to.
// seek moves that list's window to the position the scrollbar was dragged to (the list's first row, from).
type Wheel = { offset: number; areaAt: (fromBottom: number, column: number) => ((by: number) => void) | undefined; seek: (list: string, from: number) => void }
const wheels = new Map<string, Wheel>()
// Offset the whole-panel scrollbar asked for, applied when its ui.scroll comes back from the plugin
const paneSeek = new Map<string, number>()
// Mix a hex color with white (k is the white ratio).
const mixWhite = (hex: string, k: number) => `#${[1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k) + 255 * k).toString(16).padStart(2, '0')).join('')}`
let peersBusy = false // Another session works: the timer keeps ticking so its ● blinks.
let busy = false // Read by the animation timer. A module variable, so it's recomputed on reload.

// Notifications already shown. The same situation never notifies twice (the context warning re-arms once it drops below the threshold).
const alerted = new Set<string>()
// Cross-session records. Read from $.store at session.start; this session's row is updated and saved when each turn ends.
let history: SessionRecord[] = []
let sessionId = ''
// Async lookups started before /clear are not applied to the new session.
let sessionEpoch = 0

function alert($: { ui: { toast: (text: string) => void } }, key: string, text: string) {
  if (alerted.has(key)) return
  alerted.add(key)
  $.ui.toast(`Goyangi · ${text}`)
}

function set($: Parameters<typeof update>[0], fn: (t: Tree) => Tree) {
  return update($, tree, t => { const n = fn(norm(t)); busy = isBusy(n); return n })
}

// Build this session's running record and save it to $.store.
function saveHistory($: Parameters<typeof update>[0] & { store: { set: (k: string, v: unknown) => Promise<void> } }, t: Tree, cost: number | undefined) {
  if (!sessionId) return
  const loops = [t.main, ...t.agents]
  const prev = history.find(x => x.id === sessionId)
  history = upsertRecord(history, {
    id: sessionId, startedAt: prev?.startedAt ?? Number(sessionId), updatedAt: Date.now(), cost: cost ?? prev?.cost ?? 0,
    turns: t.turnTotal, tools: loops.reduce((a, l) => a + l.tools, 0), tokens: loops.reduce((a, l) => a + l.inTok + l.cacheTok + l.outTok, 0),
  })
  quiet($.store.set('history', history))
}

// Re-read the context breakdown. It's a local estimate (summary), so no request is sent.
function refreshCtx($: Parameters<typeof update>[0] & { session: { usage: (a?: { breakdown: 'summary' }) => Promise<{ context: { breakdown?: { categories: readonly { name: string; tokens: number; color: string; isDeferred: boolean }[] } } }> } }) {
  quiet($.session.usage({ breakdown: 'summary' }).then(u => {
    const cats = u.context.breakdown?.categories
    return cats ? set($, t => ({ ...t, ctxParts: ctxParts(cats) })) : undefined
  }))
}

// Pass the engine's response stream through unchanged, calling f on each chunk. Returns the original result at the end.
async function* tap<T, R>(g: AsyncGenerator<T, R>, f: (v: T) => void): AsyncGenerator<T, R> {
  try {
    for (;;) {
      const s = await g.next()
      if (s.done) return s.value
      try { f(s.value) } catch { /* ignore observation failures */ }
      yield s.value
    }
  } finally {
    await g.return?.(undefined as never)
  }
}

// When a finished subagent starts running again, reopen its item in this turn's flow chart (no-op if absent).
const reopenAgent = (t: Tree, id: string): Tree => {
  const a = t.agents.find(x => x.id === id)
  if (!a || (a.status !== 'done' && a.status !== 'failed')) return t
  return { ...t, flow: t.flow.map(i => (i.id === `agent:${id}` ? { ...i, endedAt: undefined } : i)) }
}

// Change one flow item's values without ending it (updating the running intent).
const flowPatch = (t: Tree, id: string, patch: Partial<FlowItem>): Tree =>
  ({ ...t, flow: t.flow.map(i => (i.id === id ? { ...i, ...patch } : i)) })

// Toast advice warnings once each. Context and repeated failures are already notified separately, so only cache and usage limits are shown.
function checkAdvice($: Parameters<typeof update>[0] & { ui: { toast: (text: string) => void }; session: { usage: () => Promise<{ context: { percent?: number }; rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[] }> } }) {
  quiet(Promise.all([read($, tree), $.session.usage()]).then(([t0, u]) => {
    const t = norm(t0)
    const now = Date.now()
    const limits = u.rateLimits.map(l => ({ kind: l.kind, pct: l.percentUsed, eta: limitEta(l.percentUsed, l.resetsAt, WINDOW_MS[l.kind], now) }))
    for (const a of advise({ flow: t.flow, fails: t.fails, ctxPercent: u.context.percent ?? 0, limits })) {
      if (a.level === 'warn' && (a.id.startsWith('cache:') || a.id.startsWith('limit:'))) alert($, a.id, a.text)
    }
  }))
}

// Settings: defaults come from the plugin settings (userConfig), overlaid with values changed in the settings screen (prefs). Changes apply to cur immediately.
let base: Required<Prefs> = { autoOpen: true, ctxAlertPercent: 80, turnCostAlertUsd: 2, stallSeconds: 120, position: 'right', autoUpdate: true, view: 'default', character: 'cat', sessionRows: 4, tabRows: 4, freshMode: 'ask', icon: 'auto' }
let cur: Required<Prefs> = { ...base }
const applyPrefs = (p: Prefs) => { cur = { ...base, ...p } }
// Overlay only the changed items (patch) on the stored values. With several sessions open, each session's values go stale,
// so saving everything would undo a view mode or position changed in another session. reset clears all changed values.
async function savePrefs($: Parameters<typeof update>[0] & { store: { get: (k: string) => Promise<unknown>; set: (k: string, v: unknown) => Promise<void> } }, patch: Prefs, reset = false) {
  const saved = reset ? undefined : await $.store.get('prefs').catch(() => undefined)
  const p: Prefs = { ...(saved && typeof saved === 'object' ? (saved as Prefs) : {}), ...patch }
  applyPrefs(p)
  await update($, prefs, () => p)
  await $.store.set('prefs', p)
}

// Setting values (userConfig). Non-numbers fall back to the default. 0 means off.
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
// Rows a scrolling box (Sessions, Browser tabs) shows at once: 1 to 10, default 4
const rowsOf = (v: unknown) => Math.max(1, Math.min(10, Math.round(num(v, 4))))

// Auto-update: refresh the marketplace and plugin, and notify if a new version arrived. It applies after /reload-plugins or a restart.
// cmux's claude wrapper prepends options that block plugin commands, so CMUX_CLAUDE_HOOKS_DISABLED makes it pass through.
// Run with GIT_TERMINAL_PROMPT=0 so it never hangs asking for git credentials; on failure, move on silently.
// Sessions: read the open sessions from `claude agents --json`. The atom is written only when the list changed, so an unchanged list redraws nothing.
// Where each session runs, by pid: walked up with ps once and kept, since a process never changes its parent app
const hostCache = new Map<number, string>()
async function hostOf($: EngineInterface, pid: number): Promise<string> {
  const known = hostCache.get(pid)
  if (known !== undefined) return known
  const chain: string[] = []
  for (let q = pid, i = 0; q > 1 && i < 12; i++) {
    const m = /^\s*(\d+)\s+(.*)$/.exec((await $.process.run(['ps', '-o', 'ppid=,comm=', '-p', String(q)], { timeoutMs: 5_000 }).catch(() => undefined))?.stdout.trim() ?? '')
    if (!m) break
    chain.push(m[2]!)
    q = Number(m[1])
  }
  const host = appOf(chain) ?? ''
  hostCache.set(pid, host)
  return host
}
// Number from the stored map (the other sessions' view), not this copy's memory, so a number another session handed out is never given to a second key.
// The write is awaited: the next session to refresh reads it.
async function stickNums($: EngineInterface, keys: string[], owns?: (key: string) => boolean): Promise<Record<string, number>> {
  const saved = ((await $.store.get('nums').catch(() => undefined)) as { n?: Record<string, number> } | null | undefined)?.n ?? {}
  const n = stick(saved, keys, owns)
  if (n !== saved) await $.store.set('nums', { n }).catch(() => undefined)
  await update($, nums, () => n)
  return n
}
async function refreshPeers($: EngineInterface) {
  const [r, a] = await Promise.all([
    $.process.run(['claude', 'agents', '--json'], { env: { CMUX_CLAUDE_HOOKS_DISABLED: '1' }, timeoutMs: 20_000 }).catch(() => undefined),
    // Other coding agents in cmux terminals; outside cmux this fails and adds none
    $.process.run(['cmux', 'top', '--all', '--processes', '--flat', '--format', 'tsv'], { timeoutMs: 10_000 }).catch(() => undefined),
  ])
  if (!r) return
  const claudes = await Promise.all(parsePeers(r.stdout).map(async p => (p.pid ? { ...p, host: await hostOf($, p.pid) } : p)))
  const self = await $.session.id()
  // A coding agent's screen says when it waits on a question or works (state.ts screenState). It wins over cmux's status tag, which can stay Idle while codex works
  const agents = await Promise.all((a?.exitCode === 0 ? parseAgents(a.stdout) : []).map(async p => {
    const { ws, surface } = cmuxTarget(p.sessionId)
    const r = await $.process.run(['cmux', 'read-screen', '--workspace', ws, '--surface', surface, '--lines', '40'], { timeoutMs: 10_000 }).catch(() => undefined)
    const s = r?.exitCode === 0 ? screenState(r.stdout) : undefined
    return s ? { ...p, status: s } : p
  }))
  const all = [...claudes, ...agents]
  const n = await stickNums($, all.filter(p => p.sessionId !== self).map(p => `s:${p.sessionId}`), k => k.startsWith('s:'))
  peersBusy = all.some(p => p.sessionId !== self && p.status === 'busy')
  const list = all.map(p => (p.sessionId === self ? p : { ...p, num: n[`s:${p.sessionId}`] })).sort((x, y) => (x.num ?? 0) - (y.num ?? 0))
  await update($, peers, v => (v.self === self && JSON.stringify(v.list) === JSON.stringify(list) ? v : { self, list }))
  quiet(ensureIcons($, ['goyangi']))
  if (list.some(p => !isAgent(p))) quiet(ensureIcons($, ['Claude']))
  if (list.some(isAgent)) quiet(ensureIcons($, list.filter(isAgent).map(p => `agent:${p.kind}`)))
}
// This session's handoff note (state.ts handoffNote): its name in the session list, folder, current request, edited files, and the recent conversation.
async function myHandoff($: EngineInterface): Promise<string> {
  const t = norm(await read($, tree))
  const id = await $.session.id()
  const name = (await read($, peers)).list.find(p => p.sessionId === id)?.name ?? id.slice(0, 8)
  const msgs = await $.session.messages().catch(() => [])
  return handoffNote({ name, sessionId: id, cwd: await $.session.cwd(), prompt: t.turn.prompt, files: t.files?.edit ?? [], messages: Array.isArray(msgs) ? msgs : [] })
}
// Fresh session: before the context fills, carry the work into a new session in this same window, with no compaction.
// 1. The model writes a handoff note to a file (Goyangi's own note instead when the context is too full for that turn).
// 2. After that turn, /clear starts a new session here; the old one stays resumable with claude --resume.
// 3. The new session's first prompt points at the note. The pending note lives in $.store, so it survives anything /clear resets.
const FRESH_FULL = 95 // At or past this context %, Goyangi writes the note itself instead of spending a model turn
let freshFile = ''
async function startFresh($: EngineInterface) {
  if (await read($, freshStage)) return
  const id = await $.session.id()
  freshFile = `${(await $.env.get('TMPDIR').catch(() => undefined)) || '/tmp/'}goyangi/handoff-${id}.md`.replace(/\/\/+/g, '/')
  await $.store.set('fresh', { file: freshFile, prev: id, at: Date.now() })
  if (((await $.session.usage().catch(() => undefined))?.context.percent ?? 0) >= FRESH_FULL) {
    await $.fs.write(freshFile, await myHandoff($))
    return clearToFresh($)
  }
  await update($, freshStage, () => 'writing')
  $.ui.toast('Goyangi · Writing a handoff note, then continuing in a fresh session')
  await $.prompt.submit({ text: `The context is nearly full, so this work continues in a fresh session in this window. Write a handoff note to ${freshFile} for the session that picks it up: the goal, what is done, the decisions made and why, the files involved, what is left and the very next step, and anything that went wrong or is easy to miss. Write only that file, then reply "handoff written".` })
}
// After the note: /clear, outside the turn's hooks (a hook the turn waits on can't run a command)
async function clearToFresh($: EngineInterface) {
  await update($, freshStage, () => 'clearing')
  await $.clock.after(300, () => quiet($.command.run({ command: 'clear' }).catch(() => update($, freshStage, () => ''))))
}
// A refused send (auto mode's review, a recipient gone) toasts the engine's reason, not a false success. Resolves to that same line for the sessions tool.
// Another coding agent (a cmux terminal) gets the text as a file and one typed line pointing at it, since a newline typed into its prompt would submit early.
const sendTo = async ($: EngineInterface, to: string, text: string, ok: string) => {
  let line: string
  if (isAgent({ sessionId: to })) {
    const { ws, surface } = cmuxTarget(to)
    const file = `${(await $.env.get('TMPDIR').catch(() => undefined)) || '/tmp/'}goyangi/handoff-${Date.now()}.md`.replace(/\/\/+/g, '/')
    await $.fs.write(file, text)
    const at = ['--workspace', ws, '--surface', surface]
    const typed = await $.process.run(['cmux', 'send', ...at, `Read the handoff note at ${file} and continue from it.`], { timeoutMs: 10_000 }).catch(() => undefined)
    const sent = typed?.exitCode === 0 && (await $.process.run(['cmux', 'send-key', ...at, 'enter'], { timeoutMs: 10_000 }).catch(() => undefined))?.exitCode === 0
    line = sent ? ok : `Not sent: cmux could not type into ${surface}${typed?.stderr ? ` (${typed.stderr.trim()})` : ''}`
  } else {
    const r = await $.session.send({ to: { sessionId: to }, text })
    line = r.isDelivered ? ok : `Not sent: ${r.reason}`
  }
  $.ui.toast(`Goyangi · ${line}`)
  return line
}
// Another coding agent's handoff: the last 200 lines of its terminal, since it can't answer a pull itself
async function agentScreen($: EngineInterface, from: Peer): Promise<string | undefined> {
  const { ws, surface } = cmuxTarget(from.sessionId)
  const r = await $.process.run(['cmux', 'read-screen', '--workspace', ws, '--surface', surface, '--lines', '200'], { timeoutMs: 10_000 }).catch(() => undefined)
  return r?.exitCode === 0 ? `Handoff from ${from.kind} ("${from.name}", cmux ${surface}): the last 200 lines of its terminal.\n\n${r.stdout.trimEnd()}` : undefined
}
const sendHandoff = ($: EngineInterface, to: string, name: string) =>
  myHandoff($).then(text => sendTo($, to, text, `Sent this session's handoff to ${name}`))
// Asks `to` for its handoff. The answer goes to `reply` (another numbered session), or here when left out.
// A coding agent's handoff is its terminal screen: brought here as a prompt, or passed on to `reply`.
const askHandoff = async ($: EngineInterface, to: Peer, reply?: Peer): Promise<string> => {
  if (isAgent(to)) {
    const text = await agentScreen($, to)
    if (!text) { $.ui.toast(`Goyangi · Could not read ${to.name}'s terminal`); return `Could not read ${to.name}'s terminal` }
    if (reply) return sendTo($, reply.sessionId, text, `Passed ${to.name}'s screen to ${reply.name}`)
    await $.prompt.submit({ text })
    $.ui.toast(`Goyangi · Brought ${to.name}'s screen here`)
    return text
  }
  if (reply && isAgent(reply)) return `A Claude session can only answer to another Claude session. Pull ${to.name} here first, then send to ${reply.name}.`
  const [id, p] = await Promise.all([$.session.id(), read($, peers)])
  const back = reply ?? { sessionId: id, name: p.list.find(x => x.sessionId === id)?.name ?? id.slice(0, 8) }
  return sendTo($, to.sessionId, pullRequest(back.sessionId, back.name), reply ? `Asked ${to.name} to send its handoff to ${reply.name}` : `Asked ${to.name} for its handoff; it arrives here as a message`)
}
// App icons: the app's own .icns (Info.plist CFBundleIconFile) converted with sips to a 32px PNG in the temp folder, read once as base64.
// An app that isn't in /Applications, or a conversion that fails, falls back to a shipped icons/apps/<app>.png, else records null so it isn't tried again this session.
// The icons atom outlives a plugin reload (this file is read again, the engine's atoms are not), so Goyangi's own logo is read once per load of this file
// instead of once per session; otherwise a changed icons/goyangi.png would keep showing the old drawing until a new session.
let logoRead = false
async function ensureIcons($: EngineInterface, apps: string[]) {
  const have = await read($, icons)
  const want = [...new Set(apps)].filter(a => !(a in have) || (a === 'goyangi' && !logoRead))
  if (want.includes('goyangi')) logoRead = true
  if (!want.length) return
  const dir = `${(await $.env.get('TMPDIR').catch(() => undefined)) || '/tmp/'}goyangi/icons`.replace(/\/\/+/g, '/')
  const add: Record<string, AppIcon> = {}
  for (const app of want) {
    // A coding agent (agent:codex) has no app to take an icon from; the plugin ships its site's favicon as icons/agents/<kind>.png
    // Goyangi's own logo (the header) is shipped as icons/goyangi.png
    if (app.startsWith('agent:') || app === 'goyangi') {
      add[app] = await $.fs.read(`${$.plugin.root}/icons/${app === 'goyangi' ? 'goyangi' : `agents/${app.slice(6)}`}.png`, { as: 'bytes' }).then(r => ((r as { base64?: string }).base64 ? { png: (r as { base64: string }).base64 } : null)).catch(() => null)
      continue
    }
    const root = `/Applications/${app}.app/Contents`
    const name = (await $.process.run(['defaults', 'read', `${root}/Info`, 'CFBundleIconFile'], { timeoutMs: 10_000 }).catch(() => undefined))?.stdout.trim()
    const out = `${dir}/${app.replace(/\W+/g, '_')}.png`
    const ok = !!name && (await $.process.run(['mkdir', '-p', dir], { timeoutMs: 10_000 }).catch(() => undefined))?.exitCode === 0
      && (await $.process.run(['sips', '-s', 'format', 'png', '-Z', '32', `${root}/Resources/${name.endsWith('.icns') ? name : `${name}.icns`}`, '--out', out], { timeoutMs: 20_000 }).catch(() => undefined))?.exitCode === 0
    const png = ok ? (await $.fs.read(out, { as: 'bytes' }).catch(() => undefined) as { base64?: string } | undefined)?.base64 : undefined
    // Not installed here, or no readable icon: the plugin ships a few browsers' icons as icons/apps/<app>.png (Whale)
    const shipped = png ? undefined : (await $.fs.read(`${$.plugin.root}/icons/apps/${app}.png`, { as: 'bytes' }).catch(() => undefined) as { base64?: string } | undefined)?.base64
    add[app] = png ? { png } : shipped ? { png: shipped } : null
  }
  await update($, icons, v => ({ ...v, ...add }))
}
// The installed apps that script their tabs: those whose .sdef has Chrome's `active tab index` (Chromium browsers) or Safari's `current tab`, and a tab URL.
// Found by reading the .sdef files, so a browser needs no entry in BROWSERS. If the search fails, the known list is used.
const SDEF_SCAN = `for a in /Applications/*.app "$HOME"/Applications/*.app; do for f in "$a"/Contents/Resources/*.sdef; do [ -f "$f" ] || continue
grep -q 'name="URL"' "$f" || continue
if grep -q 'active tab index' "$f"; then printf '%s\tc\n' "$(basename "$a" .app)"; break
elif grep -q 'name="current tab"' "$f" && grep -q 'class name="tab"' "$f"; then printf '%s\ts\n' "$(basename "$a" .app)"; break; fi
done; done
for a in /Applications/Firefox.app "$HOME"/Applications/Firefox.app; do [ -d "$a" ] && { printf 'Firefox\tf\n'; break; }; done`
let browsers: readonly Browser[] = BROWSERS
let unreadable: string[] = []
// Scanned on every refresh (about 0.1s), so a browser installed or first opened after the session started shows up
const findBrowsers = ($: EngineInterface) => ($.process.run(['sh', '-c', SDEF_SCAN], { timeoutMs: 20_000 }).then(r => {
  const found = r.exitCode === 0 ? r.stdout.split('\n').map(l => l.split('\t')).filter(f => f.length === 2 && f[0]).map(([app, k]) => ({ app: app!, safari: k === 's' })) : []
  return (browsers = found.length ? pickBrowsers(found) : BROWSERS)
}).catch(() => BROWSERS))
// Browser tabs (state.ts tabsScript, one script per browser): read on session start, with the refresh icon, and on each browser_tabs tool call, never on a timer.
// A browser that isn't running prints nothing and adds nothing.
async function refreshTabs($: EngineInterface): Promise<Tab[]> {
  const all = await findBrowsers($)
  const runs = await Promise.all(all.map(b => $.process.run(b.firefox ? firefoxCmd : ['osascript', '-e', tabsScript(b.app, b.safari)], { timeoutMs: 15_000 }).catch(() => undefined)))
  const found = all.flatMap((b, i) => (runs[i]?.exitCode === 0 ? parseTabs(runs[i]!.stdout, b.letter, b.app, b.safari, b.firefox) : []))
  // A browser that isn't running exits 0 with no output, so a non-zero exit is a real failure (Automation permission denied, hung, no tab scripting): say so
  unreadable = all.flatMap((b, i) => (runs[i]?.exitCode === 0 ? [] : [`${b.name}: ${runs[i]?.stderr.trim().split('\n')[0] || 'no answer within 15 seconds'}`]))
  // A browser that failed to answer keeps its numbers: its tabs are unknown, not closed
  const failed = new Set(all.filter((_, i) => runs[i]?.exitCode !== 0).map(b => `${b.letter}:`))
  const n = await stickNums($, found.map(x => x.key), k => !k.startsWith('s:') && !failed.has(k.slice(0, k.indexOf(':') + 1)))
  // Each browser's tabs in number order, so a tab keeps its row as well as its number
  const list = all.flatMap(b => found.filter(x => x.app === b.app).map(x => ({ ...x, id: `${b.letter}${n[x.key]}` })).sort((x, y) => n[x.key]! - n[y.key]!))
  await update($, tabs, v => (JSON.stringify(v) === JSON.stringify(list) ? v : list))
  quiet(ensureIcons($, list.map(x => x.app)))
  return list
}
// Brings a tab to the front of its window and that window to the front, only when the person asks
const focusTab = async ($: EngineInterface, t: Tab) => {
  if (t.firefox) {
    const sel = (await read($, tabs)).find(x => x.app === t.app && x.win === t.win && x.active)
    const r = await $.process.run(['osascript', '-e', firefoxFocus, '--', sel?.title ?? '', String(t.index)], { timeoutMs: 15_000 }).catch(() => undefined)
    const line = r?.exitCode === 0 ? `Brought tab ${t.id} to the front` : `Could not switch to tab ${t.id}: ${r?.stderr.trim().split('\n')[0] || 'no answer'}. Firefox is switched by keys, so the app running osascript needs Accessibility permission (System Settings > Privacy & Security > Accessibility)`
    $.ui.toast(`Goyangi · ${line}`)
    return line
  }
  const pick = t.safari ? `set current tab of window ${t.win} to tab ${t.index} of window ${t.win}` : `set active tab index of window ${t.win} to ${t.index}`
  const r = await $.process.run(['osascript', '-e', `tell application "${t.app}"\n${pick}\nset index of window ${t.win} to 1\nactivate\nend tell`], { timeoutMs: 15_000 }).catch(() => undefined)
  const line = r?.exitCode === 0 ? `Brought tab ${t.id} to the front` : `Could not switch to tab ${t.id}`
  $.ui.toast(`Goyangi · ${line}`)
  return line
}
// Runs JavaScript in that exact tab (no new tab, no browser pick). The JS goes in as an argument so quotes need no escaping.
// Chromium browsers refuse until the person turns on View > Developer > Allow JavaScript from Apple Events; that error goes back as is.
const RUN_MAX = 20_000
const runInTab = async ($: EngineInterface, t: Tab, js: string) => {
  if (t.firefox) return `Tab ${t.id} is in Firefox, which cannot run JavaScript from outside. It can be listed, read (title and URL) and focused only.`
  const r = await $.process.run(['osascript', '-e', 'on run argv', '-e', t.safari ? `tell application "${t.app}" to do JavaScript (item 1 of argv) in tab ${t.index} of window ${t.win}` : `tell application "${t.app}" to execute tab ${t.index} of window ${t.win} javascript (item 1 of argv)`, '-e', 'end run', '--', js], { timeoutMs: 30_000 }).catch(() => undefined)
  if (!r) return `Could not run JavaScript in tab ${t.id}`
  if (r.exitCode !== 0) return `Could not run JavaScript in tab ${t.id}: ${r.stderr.trim()}`
  const out = r.stdout.replace(/\n$/, '')
  return `Tab ${t.id}: ${t.title}\n${out.length > RUN_MAX ? `${out.slice(0, RUN_MAX)}\n… cut at ${RUN_MAX} of ${out.length} characters; narrow the script` : out}`
}
// The browser_tabs tool: the model finds a tab by its number (B3) or by words from its title or site, then reads, focuses or runs JavaScript in it
async function tabsTool($: EngineInterface, input: { action?: string; tab?: string; js?: string }): Promise<string> {
  const list = await refreshTabs($)
  const bad = unreadable.length ? `\nCould not read: ${unreadable.join('; ')}. If it is an Automation permission, allow it in System Settings > Privacy & Security > Automation.` : ''
  if (!list.length) return `No supported browser (${browsers.map(b => b.name).join(', ')}) is running, or none has open tabs.${bad}`
  const line = (x: Tab) => `${x.id}${x.active ? ' (active)' : ''} ${x.title} · ${x.url.replace(/^\w+:\/\/([^/]*).*$/, '$1')}`
  if (input.action === 'read' || input.action === 'focus' || input.action === 'run') {
    const hits = findTabs(list, String(input.tab ?? ''))
    if (hits.length === 0) return `No tab matches "${input.tab ?? ''}". Open tabs:\n${list.map(line).join('\n')}`
    if (hits.length > 1) return `Several tabs match "${input.tab}". Pick one by its number, or ask the person which:\n${hits.map(line).join('\n')}`
    const t = hits[0]!
    if (input.action === 'focus') return focusTab($, t)
    if (input.action === 'run') return input.js ? runInTab($, t, input.js) : 'run needs js: the JavaScript to run in the tab'
    return `Tab ${t.id}: ${t.title}\n${t.url}\nTo look inside it or change it, use action run on this tab (it works in the person's own tab, with their sign-ins). Don't open the URL in a new tab.`
  }
  return list.map(line).join('\n') + bad
}
// The sessions tool: the model sends or pulls by the numbers the Open sessions box shows
async function sessionsTool($: EngineInterface, input: { action?: string; to?: number; from?: number }): Promise<string> {
  await refreshPeers($)
  const p = await read($, peers)
  const others = p.list.filter(x => x.sessionId !== p.self)
  const listing = others.length ? others.map(x => `${x.num}. ${isAgent(x) ? `${x.kind} (coding agent in cmux, ${x.status === 'input' ? 'waiting for input' : x.status || 'unknown'}) ${x.name}` : `${x.name} (Claude session, ${x.status || 'unknown'}) ${x.cwd}`}`).join('\n') : 'No other Claude Code sessions or coding agents are open.'
  const at = (n?: number) => (n !== undefined ? others.find(x => x.num === n) : undefined)
  if (input.action === 'send') {
    const t = at(input.to)
    return t ? sendHandoff($, t.sessionId, t.name) : `No session ${input.to ?? ''}. Open sessions:\n${listing}`
  }
  if (input.action === 'pull') {
    const f = at(input.from)
    if (!f) return `No session ${input.from ?? ''}. Open sessions:\n${listing}`
    if (input.to !== undefined && !at(input.to)) return `No session ${input.to}. Open sessions:\n${listing}`
    // From the tool, an agent's screen comes back as the result instead of a new prompt
    if (isAgent(f) && input.to === undefined) return (await agentScreen($, f)) ?? `Could not read ${f.name}'s terminal`
    return askHandoff($, f, at(input.to))
  }
  return listing
}

async function checkUpdate($: EngineInterface) {
  const now = Date.now()
  if (!shouldCheckUpdate(cur.autoUpdate, $.plugin.root, await $.store.get('updateCheckedAt').catch(() => undefined), now)) return
  await $.store.set('updateCheckedAt', now)
  const init = { env: { GIT_TERMINAL_PROMPT: '0', CMUX_CLAUDE_HOOKS_DISABLED: '1' }, timeoutMs: 180_000 }
  await $.process.run(['claude', 'plugin', 'marketplace', 'update', 'goyangi', '--json'], init)
  const v = updatedVersion((await $.process.run(['claude', 'plugin', 'update', 'goyangi@goyangi', '--json'], init)).stdout)
  if (v) $.ui.toast(`Goyangi · Updated to v${v.to}${v.from ? ` (from v${v.from})` : ''}. Run /reload-plugins to apply`)
}

// Whether the Claude Code theme is a light one (terminal only).
const isLightTerm = async ($: EngineInterface) => /light/.test(String((await $.config.list().catch(() => [])).find(r => r.key === 'theme')?.value ?? ''))
// Background tint: desktop paints translucent colors (the app theme is unknown); the terminal uses a pale tint (hue mixed with white) on light themes, otherwise dark.
const tinter = async ($: EngineInterface, surface: string) => {
  const light = surface !== 'desktop' && (await isLightTerm($))
  if (pixelTerm === undefined) await decidePixelTerm($)
  const indexed = surface !== 'desktop' && !light && !trueColor
  return (dark: string, hue: string) => (surface === 'desktop' ? `${hue}33` : light ? mixWhite(hue, 0.8) : indexed ? indexedTint(dark, hue) : dark)
}
// What the engine's rounding shows for #rrggbb in a 256-color terminal: grays go to the 24-step ramp, other colors to 6 levels per channel.
const LEVELS = [0, 95, 135, 175, 215, 255]
const shown = (r: number, g: number, b: number): number[] => {
  if (r === g && g === b) { const v = r < 8 ? 0 : r > 248 ? 255 : 8 + 10 * Math.round(((r - 8) / 247) * 24); return [v, v, v] }
  return [r, g, b].map(c => LEVELS[Math.round((c / 255) * 5)]!)
}
const SNAP = [...Array.from({ length: 24 }, (_, n) => [8 + 10 * n, 8 + 10 * n, 8 + 10 * n]), ...Array.from({ length: 216 }, (_, i) => [Math.floor(i / 36) * 51, (Math.floor(i / 6) % 6) * 51, (i % 6) * 51])]
const snapped = new Map<string, string>()
// A background hex color as a 256-color terminal would show it, snapped to the input whose shown color is the nearest to the wanted one (e.g. '#3b4261' shows as the
// gray '#5f5f5f' by rounding; '#303030' is the nearest the palette has). Left alone with 24-bit colors, and for tokens such as 'subtle'.
const indexedBg = (c: string): string => {
  if (trueColor || !/^#[0-9a-f]{6}$/i.test(c)) return c
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
const indexedTint = (dark: string, hue: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(dark)) return dark
  const ch = [1, 3, 5].map(i => parseInt(hue.slice(i, i + 2), 16))
  const max = Math.max(...ch)
  const strong = ch.map(c => (max - Math.min(...ch) > 40 && c >= max * 0.7 ? 64 : 0))
  return strong.some(Boolean) ? `#${strong.map(c => c.toString(16).padStart(2, '0')).join('')}` : '#262626'
}

// The side panel (Pane) paints its own dark background, so there the theme's white text is the right default. The area above the prompt (the band, and the panel placed
// there) shows the terminal's own background, which may be light or dark: the terminal's default colors stay, and colors picked for a dark background are darkened
// until they read on a white one too (midColor).
type InkMode = 'pane' | 'band' | 'off'
const inkMode = (e: { surface: string; component: string }): InkMode => (e.surface === 'desktop' ? 'off' : e.component === 'Pane' ? 'pane' : 'band')
// Relative luminance of #rrggbb (0 black to 1 white), and the color darkened toward black until its luminance is at most 0.28: a contrast of 3:1 or more on white,
// and still 6:1 on black. A color already that dark, and anything that isn't #rrggbb (theme tokens), stays.
const luma = (r: number, g: number, b: number) => [r, g, b].map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i]!, 0)
const midColor = (c: string | undefined): string | undefined => {
  if (!c || !/^#[0-9a-f]{6}$/i.test(c)) return c
  const rgb = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
  let f = 1
  while (f > 0.2 && luma(rgb[0]! * f, rgb[1]! * f, rgb[2]! * f) > 0.28) f -= 0.05
  const out = f === 1 ? c : `#${rgb.map(v => Math.round(v * f).toString(16).padStart(2, '0')).join('')}`
  return trueColor ? out : snapDark(out)
}
// In a 256-color terminal the engine rounds each channel to the palette's levels (0, 95, 135, ...), which turns a mid color into a lighter one: '#6b7280' shows as
// (135,135,175). So of the colors the palette can show, take the nearest to the wanted one among those dark enough (luminance 0.30 at most) to read on white.
const snappedDark = new Map<string, string>()
const snapDark = (c: string): string => {
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
// On the side panel in the terminal, text and borders given no color take the terminal's own default foreground. Some terminals (Obsidian's) draw that dark, on the panel's dark
// background, so titles, step boxes and list rows vanish. Give them the theme's text color instead; a color set on the element still wins. Desktop is left as is.
const inkText = (mode: InkMode, T: ElementConstructor<TextProps>): ElementConstructor<TextProps> => (mode === 'off' ? T : mode === 'band' ? p => T({ ...p, ...(p.color ? { color: midColor(p.color) } : p.dimColor ? { color: C.dim, dimColor: false } : {}) }) : p => T({ ...p, color: p.color ?? 'text', ...(p.backgroundColor ? { backgroundColor: indexedBg(p.backgroundColor) } : {}) }))
// A plain Button's label is drawn by the engine in the terminal's default foreground too; passing it as a Text child draws it in the text color (the label still names the control).
const inkButton = (mode: InkMode, B: ElementConstructor<ButtonProps>, T: ElementConstructor<TextProps>): ElementConstructor<ButtonProps> => {
  if (mode !== 'pane') return B
  return p => {
    // An empty children array counts as none; plain string children (▲ ▼) are drawn in the default color too, so they take the same Text
    const kids = [(p as { children?: unknown }).children].flat().filter(c => c !== undefined && c !== null && c !== false && c !== '')
    const text = kids.length === 0 ? p.label : kids.every(c => typeof c === 'string' || typeof c === 'number') ? kids.join('') : undefined
    return text !== undefined && !p.variant ? B({ ...p, children: T({ dimColor: p.dimColor, children: text }) } as ButtonProps) : B(p)
  }
}
const inkBox = (mode: InkMode, B: ElementConstructor<BoxProps>): ElementConstructor<BoxProps> => (mode === 'off' ? B : mode === 'band' ? p => B({ ...p, ...(p.borderColor ? { borderColor: midColor(p.borderColor) } : {}) }) : p => B({ ...p, borderColor: p.borderColor ?? 'text', ...(p.backgroundColor ? { backgroundColor: indexedBg(p.backgroundColor) } : {}) }))

// The panel screen. Both the right split (Pane) and the area above the prompt (AbovePrompt, position bottom) render with this function.
async function drawPanel($: EngineInterface, e: RenderInput<'Pane' | 'AbovePrompt'>) {
  const { Box: RawBox0, Text: RawText, Button: RawButton } = $.ui.resolve(e)
  const RawBox = inkBox(inkMode(e), RawBox0)
  const Text = inkText(inkMode(e), RawText)
  const Button = inkButton(inkMode(e), RawButton, Text)
  // On desktop (CSS flex) a box's default min width is its content width (auto), so narrowing the panel overflows content instead of shrinking boxes,
  // and wrap="truncate" doesn't work. Like the terminal (Yoga), default minWidth to 0 so every box can be narrower than its content.
  const Box: typeof RawBox = e.surface === 'desktop' ? p => RawBox({ minWidth: 0, ...p }) : RawBox
  const desk = e.surface === 'desktop'
  // Background colors. The panel has used dark backgrounds tuned for dark terminals, where default text (black) gets lost on light backgrounds.
  // Desktop can't know the app theme, so it paints translucent colors that keep default text readable on any background;
  // the terminal uses a pale tint (hue mixed with white) for light Claude Code themes, otherwise dark (the original colors).
  const tint = await tinter($, e.surface)
  const lightTerm = e.surface !== 'desktop' && (await isLightTerm($))
  // Text color matched to the background: bright colors only on dark terminals, the default text color (undefined) otherwise.
  const onTint = (light: string) => (e.surface !== 'desktop' && !lightTerm ? light : undefined)
  // Vertical scrollbar, drawn by the surface module (scrollbar.tsx): │ (track) and ┃ (thumb) per row in the terminal; on desktop the row height exceeds the glyph
  // and the line looks broken, so it's a one-cell painted box. Pressing or dragging sends the position via ui.message.
  // Both surfaces draw it with the surface module so pressing or dragging it moves the list (posted back as ui.message, handled by seek).
  const barCol = (list: 'map' | 'log' | 'peers' | 'tabs', total: number, from: number, rows: number) => {
    const ui = $.ui.resolve(e)
    const Client = 'Client' in ui ? ui.Client : undefined
    if (!Client) return null
    const term = e.surface !== 'desktop'
    return <Client key={`${list}-sb`} module="./scrollbar.tsx" props={{ list, total, from, rows, on: C.main, off: term ? C.dim : `${C.dim}33`, held: C.tool, glyphs: term }} width={1} height={rows} />
  }
  // Header: the terminal uses an inverted background (text) with inverted text (inverseText). On desktop the inverted background becomes a black band
  // that swallows dim text, so it uses a pale background with default text. Header buttons are the app's default buttons on desktop.
  const HEAD_BG = e.surface === 'desktop' ? tint('text', C.agent) : 'text'
  const HEAD_FG = e.surface === 'desktop' ? undefined : 'inverseText'
  const t = norm(await read($, tree))
  const n = await read($, tick)
  const f = await read($, fold)
  // If the focused agent was pushed out by the cap, return to the full view.
  const fcRaw = await read($, focus)
  const fa = fcRaw ? t.agents.find(a => a.id === fcRaw) : undefined
  const fc = fa ? fa.id : ''
  // When the view (all, key, detail) changes, reset the log scroll to the latest. Positions refer to a different list in each view.
  const setFocus = (id: string) => () => quiet(update($, focus, v => (v === id ? '' : id)).then(() => update($, logEnd, () => -1)))
  if (version === undefined) {
    version = await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)
      .then(txt => String((JSON.parse(txt as string) as { version?: string }).version ?? ''))
      .catch(() => '')
  }
  // Cards that must be drawn on top. The terminal has no z-index and later elements cover earlier ones, so they're collected and drawn at the very end of the panel.
  const overlays: JSX.Element[] = []
  const toggle = (k: keyof Fold) => () => quiet(update($, fold, v => ({ ...v, [k]: !v[k] })))
  // A docked panel can't be narrowed, so folding closes the panel and moves it to a one-row band above the prompt.
  const collapse = () => quiet(update($, fold, v => ({ ...v, all: true })).then(() => (cur.position === 'bottom' ? undefined : $.ui.close({ id: PANE }))))
  const close = () => quiet(closePane($))
  const arrow = (k: keyof Fold) => (f[k] ? '▸' : '▾')
  // Section title button. In the terminal it sits in a one-row box that clips what doesn't fit, so a long title on a narrow panel loses its end
  // instead of wrapping word by word into a column. Short fixed titles don't shrink (the counts, times, and costs beside them give way);
  // titles that can grow long (shrink) give way themselves.
  const section = (k: keyof Fold, hotkey: string, label: string, color: string, shrink = false) => {
    const btn = <Button key={`fold-${k}`} hover={hovKey(`fold-${k}`)} plain hotkey={hotkey} label={`${arrow(k)} ${label}`} onPress={toggle(k)} />
    return desk ? btn : <Box key={`sec-${k}`} flexShrink={shrink ? 1 : 0} minWidth={0} height={1} overflow="hidden">{btn}</Box>
  }
  const usage = await $.session.usage().catch(() => undefined)
  // Panel body width: prefer bodyColumns from the engine (excluding the border and close mark).
  // When content is taller than the panel a scrollbar appears on the right, and its width isn't subtracted from bodyColumns,
  // so a full-width box's right border gets hidden. Leave SCROLLBAR cells free for it.
  const SCROLLBAR = 2
  const body = (e.props as { bodyColumns?: number }).bodyColumns ?? (e.viewport?.columns ?? 80) - 2
  const cols = Math.max(24, body - SCROLLBAR)
  // The area above the prompt (position bottom) also lays out by terminal height. That area uses at most half the terminal (maxRows) and the engine scrolls past it,
  // but laying out by maxRows leaves zero rows for subagent boxes, hiding running subagents.
  const rows = e.viewport?.rows ?? 30
  // On desktop the turn flow and walk view sit in bordered boxes (the light background hides section edges otherwise), so subtract the border and 4 cells of padding.
  const treeW = e.surface === 'desktop' ? Math.max(1, cols - 4) : cols


  const color = (l: Loop) =>
    l.status === 'failed' ? C.fail : l.status === 'tool' ? C.tool : l.status === 'done' ? C.dim : undefined
  const pulse = busy && n % 2 === 0 ? '●' : '│'

  // Subagent layout
  const perRow = Math.max(1, Math.floor(treeW / 28))
  const fixed = 3 + 6 + 2 + 3 + 2 + 6 + 2 // The final + 2: the footer is 3 rows (section buttons, panel buttons, shortcut hints)
  const boxRows = Math.max(0, Math.floor((rows - fixed - 6) / BOX_ROWS))
  // Finished agents get no box. Only the agent in the detail view stays after it finishes.
  const { shown, hidden } = visibleAgents(t.agents.filter(a => (a.status !== 'done' && a.status !== 'failed') || a.id === fc), boxRows * perRow)
  const agentRows: Loop[][] = []
  for (let i = 0; i < shown.length; i += perRow) agentRows.push(shown.slice(i, i + perRow))
  const live = t.agents.filter(a => a.status !== 'done' && a.status !== 'failed').length
  const back = t.agents.length - live
  const me = await read($, mapEnd)
  const tall = await read($, mapTall)
  // Top box: one box for the main loop. Wide (TWO_COL_W columns or more), the model and token rows on the left and the gauges in a column
  // on the right, one per row with their labels lined up; narrow, the gauges follow two to a row. The last row is the server tools (advisor and others).
  const TWO_COL_W = 64
  const twoCol = cols >= TWO_COL_W
  const gaugeN = 2 + (usage?.rateLimits?.length ?? 0) // ctx, cache, and each usage limit
  // Fresh session row: shown once context passes the alert threshold (unless the setting is Off), and while a hand-over is under way
  const pfTop = { ...base, ...(await read($, prefs)) }
  // The refresh icon for this terminal (state.ts iconKind): a Nerd Font symbol, the arrow ↺, or a letter
  const REFRESH = REFRESH_ICON[iconKind(pfTop.icon, iconEnv)]
  const fStage = await read($, freshStage)
  const ctxNow = usage?.context.percent ?? 0
  const freshRow = !!fStage || (pfTop.freshMode !== 'off' && pfTop.ctxAlertPercent > 0 && ctxNow >= pfTop.ctxAlertPercent)
  const topBody = (twoCol ? Math.max(4, gaugeN) : 4 + Math.ceil(gaugeN / 2)) + 1 + (freshRow ? 1 : 0)
  const TOP_H = 2 + topBody // border 2 rows + body
  // On desktop a fixed height squeezes overflowing rows on top of each other, and a min height leaves a blank row below since the border is thinner than a row.
  // So no height is set and it fits the content (side by side, the row matches the two boxes' heights).
  // Section title row (title + button group). On desktop shortcut chips and buttons are wider than text cells, and if they don't fit on one row
  // they leave the box, so the button group wraps to the right of the next row.
  const headWrap = e.surface === 'desktop' ? { flexWrap: 'wrap', rowGap: 0 } as const : {}
  const topH_ = e.surface === 'desktop' ? {} : { height: TOP_H }
  const topH = TOP_H
  const sOpen = await read($, settingsOpen)
  // Rows the settings screen takes in the flow: on desktop only; the terminal draws it as an overlay over the top of the visible window
  const settingsRows = sOpen && desk ? SETTINGS_H : 0
  // Base height for the vertical split: a docked panel uses the body row count from the engine (scroll.bodyRows). viewport.rows is the whole terminal
  // height and larger than the panel. Above the prompt (inline) grows with content, so bodyRows equals the content length and can't serve as the base.
  const pp = e.props as { placement?: string; scroll?: { bodyRows?: number; offset?: number } }
  // Sticky header (terminal): when the engine has scrolled the panel (scroll.offset > 0), the header is drawn over the top of the visible window
  // and its place in the flow keeps an empty row, so it's drawn once and its buttons keep unique keys. Scrolling redraws with the new offset.
  const stickTop = !desk ? Math.max(0, pp.scroll?.offset ?? 0) : 0
  const paneRows = pp.placement === 'dock' && pp.scroll?.bodyRows ? pp.scroll.bodyRows : rows
  // From the panel height, subtract the header, top row, settings screen, view row, turn flow, subagent boxes, the session map box's margins, border, title, and legend (7 rows),
  // the session log box's border and title (3 rows), and the footer (FOOT_H rows), and use the rest. The session map defaults to 4 rows (⇕ splits it in half) and the session log takes the rest.
  // Open sessions box: border 2 + title 1 + hint 1 + this session's row + up to sessionRows rows (at least one, for the empty message).
  // Past that it scrolls (wheel or scrollbar), like the session map. The Browser tabs box is the same without the hint and own row.
  const pr = await read($, peers)
  const others = pr.list.filter(p => p.sessionId !== pr.self)
  const pfRows = { ...base, ...(await read($, prefs)) }
  const PEER_MAX = rowsOf(pfRows.sessionRows)
  // This session gets its own row, first and unnumbered, marked ◉ in the main color
  const selfPeer = pr.list.find(p => p.sessionId === pr.self)
  const peerTop = Math.max(0, Math.min(others.length - PEER_MAX, await read($, peerFrom)))
  const peerShown = others.slice(peerTop, peerTop + PEER_MAX)
  // Open sessions columns: names and hosts are padded to the widest shown, so the host and the folder start at the same cell in every row.
  const padTo = (t: string, w: number) => t + ' '.repeat(Math.max(0, w - displayWidth(t)))
  const kindLead = (q: Peer) => (isAgent(q) ? q.kind.length + 1 : 0)
  const colRows = [...(selfPeer ? [selfPeer] : []), ...peerShown]
  const nameW = Math.max(0, ...colRows.map(q => kindLead(q) + displayWidth(q.name)))
  const numW = Math.max(1, ...peerShown.map(q => String(q.num ?? '').length))
  const hostW = Math.max(0, ...colRows.map(q => displayWidth(hostTag(q.host))))
  const peerRows = 4 + (selfPeer ? 1 : 0) + Math.max(1, peerShown.length) // the 4 include the legend row
  const tabList = await read($, tabs)
  // In each browser's number order (refreshTabs)
  const tabOrder = tabList
  const TAB_MAX = rowsOf(pfRows.tabRows)
  const tabTop = Math.max(0, Math.min(tabOrder.length - TAB_MAX, await read($, tabFrom)))
  const tabShown = tabOrder.slice(tabTop, tabTop + TAB_MAX)
  const tabRows = 4 + Math.max(1, tabShown.length) // border 2 + title 1 + legend 1
  // Open sessions and Browser tabs sit side by side, half the width each, on panels PAIR_W columns or wider (sharing the taller one's height); stacked below that
  const PAIR_W = 76
  const pairLists = cols >= PAIR_W
  const listsH = pairLists ? Math.max(peerRows, tabRows) : peerRows + tabRows
  const listW = pairLists ? Math.floor((cols - 1) / 2) : cols
  // Side by side the row buttons shrink to arrows (↑ send, ↓ pull, ↗ focus), leaving the half-width rows to the names.
  // Each box of the pair: equal halves, and in the terminal the same fixed height so their borders line up
  const listBox = pairLists ? (desk ? { width: '50%', flexGrow: 1, minWidth: 0 } as const : { width: listW, flexShrink: 1, minWidth: 0, height: listsH }) : {}
  const spare = paneRows - (1 + topH + settingsRows + 1 + FLOW_H + agentRows.length * BOX_ROWS + 7 + 3 + FOOT_H + listsH)
  const mapRows = tall ? Math.max(MAP_ROWS, Math.floor(spare / 2)) : MAP_ROWS
  // On desktop the panel scrolls and row heights and borders differ from the terminal, so leftover rows aren't split. The session log defaults to 4 rows.
  const logRows = e.surface === 'desktop' ? LOG_ROWS : Math.max(LOG_ROWS, spare - mapRows)
  const mwin = logWindow(t.turns, t.turnTotal, me, mapRows)
  const mapTurns = f.map ? [] : t.turns.slice(mwin.from, mwin.to)
  const mapPad = f.map ? 0 : Math.max(0, mapRows - Math.max(mapTurns.length, 1))
  const firstTurn = t.turnTotal - t.turns.length
  const mapUp = () => quiet(update($, mapEnd, () => Math.max(firstTurn + mapRows, mwin.end - mapRows)))
  const mapDown = () => quiet(update($, mapEnd, () => (mwin.end + mapRows >= t.turnTotal ? -1 : mwin.end + mapRows)))
  const le = await read($, logEnd)
  const allLog = await read($, logAll)
  // All three views scroll the same way: detail (focus) = that agent's rows, all = every row, key = key events only.
  // The full view uses logTotal to count rows trimmed off the front; in filtered views the remaining list length is the total.
  const keyLog = t.log.filter(isKeyLog)
  const logSrc = fc ? t.log.filter(l => l.agentId === fc) : allLog ? t.log : keyLog
  // The stop position (logEnd) is saved as the log row's absolute sequence (seq, the number after this row). Saving a position within the list would make
  // it point at a different row once old rows are pushed out by the cap. Older records without seq are numbered by storage order.
  const seqOf = (l: { seq?: number }) => l.seq ?? (t.logTotal - t.log.length + t.log.indexOf(l as (typeof t.log)[number]))
  const endIdx = le < 0 ? -1 : logSrc.filter(l => seqOf(l) < le).length
  const win = logWindow(logSrc, logSrc.length, endIdx, logRows)
  const logLines = logSrc.slice(win.from, win.to)
  const toggleLogAll = () => quiet(update($, logAll, v => !v).then(() => update($, logEnd, () => -1)))
  const endSeq = (idx: number) => seqOf(logSrc[idx - 1]!) + 1
  // Shorter than one screen means nothing to scroll.
  const logUp = () => (logSrc.length <= logRows ? undefined : quiet(update($, logEnd, () => endSeq(Math.max(logRows, win.end - logRows)))))
  const logDown = () => quiet(update($, logEnd, () => (win.end + logRows >= logSrc.length ? -1 : endSeq(win.end + logRows))))
  // Mouse wheel: from the bottom of the panel up, the footer (FOOT_H rows), the session log box (border, title 3 rows + list), and the session map box (border, title, legend 4 rows + list) are stacked.
  // If the wheel lands inside one of the two list boxes, move that list by `by` rows. Counting from the bottom because the upper sections' height depends on view and folding.
  // ponytail: on desktop borders and box gaps don't line up exactly with text rows, so a row or two near an edge may be attributed to the neighbor box. Switch to the engine's element positions if exact positions are needed.
  const logH = f.log ? 0 : logRows + 3
  const mapH = f.map ? 0 : mapRows + 4
  wheels.set(`${e.component}:${e.requestId}`, {
    offset: pp.scroll?.offset ?? 0,
    areaAt: (fromBottom: number, column: number) => {
      if (fromBottom >= FOOT_H && fromBottom < FOOT_H + logH) {
        return logSrc.length <= logRows ? undefined : (by: number) => quiet(update($, logEnd, () => {
          const end = Math.max(logRows, win.end + by)
          return end >= logSrc.length ? -1 : endSeq(end)
        }))
      }
      if (fromBottom >= FOOT_H + logH && fromBottom < FOOT_H + logH + mapH) {
        return t.turns.length <= mapRows ? undefined : (by: number) => quiet(update($, mapEnd, () => {
          const end = mwin.end + by
          return end >= t.turnTotal ? -1 : Math.max(firstTurn + mapRows, end)
        }))
      }
      // Above the map: the Browser tabs box, then the Open sessions box; side by side, the pointer's column tells them apart (sessions on the left)
      const above = FOOT_H + logH + mapH
      const scrollTabs = () => (tabOrder.length <= TAB_MAX ? undefined : (by: number) => quiet(update($, tabFrom, () => Math.max(0, Math.min(tabOrder.length - TAB_MAX, tabTop + by)))))
      const scrollPeers = () => (others.length <= PEER_MAX ? undefined : (by: number) => quiet(update($, peerFrom, () => Math.max(0, Math.min(others.length - PEER_MAX, peerTop + by)))))
      if (pairLists) {
        if (fromBottom >= above && fromBottom < above + listsH) return column < listW ? scrollPeers() : scrollTabs()
      } else {
        if (fromBottom >= above && fromBottom < above + tabRows) return scrollTabs()
        if (fromBottom >= above + tabRows && fromBottom < above + listsH) return scrollPeers()
      }
      return undefined
    },
    seek: (list, from) => {
      if (list === 'log') {
        const end = Math.max(logRows, Math.min(logSrc.length, from + logRows))
        quiet(update($, logEnd, () => (end >= logSrc.length ? -1 : endSeq(end))))
      } else if (list === 'peers') {
        quiet(update($, peerFrom, () => Math.max(0, Math.min(others.length - PEER_MAX, from))))
      } else if (list === 'tabs') {
        quiet(update($, tabFrom, () => Math.max(0, Math.min(tabOrder.length - TAB_MAX, from))))
      } else if (list === 'map') {
        const end = firstTurn + from + mapRows
        quiet(update($, mapEnd, () => (end >= t.turnTotal ? -1 : Math.max(firstTurn + mapRows, end))))
      }
    },
  })
  // The full view header shows session-wide numbers (continuing even when the front is trimmed).
  const absFrom = logLines[0] ? seqOf(logLines[0]) + 1 : 0
  const absTo = logLines.length ? seqOf(logLines[logLines.length - 1]!) + 1 : 0
  const logPad = Math.max(0, logRows - Math.max(logLines.length, 1))
  // Right scrollbar: where the 4 visible rows sit in the current view's list

  const ctxPct = usage?.context.percent ?? 0
  const slow = slowTools(t.toolTime, 2)
  const mainTok = t.main.inTok + t.main.cacheTok
  const cacheHit = mainTok ? Math.round((t.main.cacheTok / mainTok) * 100) : 0
  const stops = topTools(t.stops, 4)
  const mix = topTools(t.toolMix, 4)
  const servers = Object.entries(t.server)

  // Summary band: advisor/server tools, turn status, request stats, and tool mix compressed into two rows.
  const pct = (x: number) => `${Math.round(x * 100)}%`
  // Shared by truncated areas: hovering opens a full-content card right above the row (below would be covered by sections drawn later). No card if full is empty.
  // x is the column where this row starts in the panel. If the card passes the right edge, shrink it; if still too narrow, pull it left.
  // maxW: card width cap. Rows inside side-by-side boxes (flow chart columns, subagent boxes) must stay within their own column width.
  // The terminal draws later elements over earlier ones, so a card spilling into the right neighbor gets covered by that neighbor.
  const scopeOf = (key: string) => scopeKey('rv-', key)
  // Area cards: for row lists inside bordered boxes, like the session log and session map, cards open only within that list area (rowCard).
  // They must be the list column's last children to sit on top of other rows. The row's reveal leaves full empty and only creates the hover scope.
  // One card line: leading spaces + content. The card edge shows as background color; desktop adds a border (cardFrame).
  const CARD_BAR = '#7aa2f7'
  // Dim text inside dark cards (#1e2030). The theme's dim text is dark on light themes and disappears on the card, so the color is fixed.
  const CARD_DIM = '#9ca3af'
  // Dark card background. Desktop paints it at 80% opacity so what's under the card shows through (terminals can't paint translucency).
  const CARD_BG = e.surface === 'desktop' ? '#1e2030cc' : '#1e2030'
  const cardLine = (ln: string, j: number) => (
    <Text key={`cl-${j}`} wrap="truncate"><Text color="#e6e9f5">  {ln}</Text></Text>
  )
  // Desktop card border: in the terminal a border takes a row and covers the row above, so only the background color is used.
  const cardFrame = desk ? { borderStyle: 'round', borderColor: CARD_BAR } as const : {}
  const CARD_TIP_BG = desk ? '#3b4261e6' : '#3b4261'
  // Hidden cards are carried in the tree on every render, even before hover. There are many, so the text is cut at CARD_MAX characters instead of carrying it all.
  const cardText = (full: string) => (full.length > CARD_MAX ? `${full.slice(0, CARD_MAX - 1)}…` : full)
  // A one-word tooltip for a button, on the button's row to its left so it never covers another button. label is the button's text, which sets the box the card hangs from;
  // skip is the width of buttons between this one and the card (the pull button's card clears the send button beside it and lands to its left). A card to the right of the
  // last button is cut off at the box's edge, and a row drawn later paints over a card hanging into it, which is why the card stays on its own row, to the left.
  const tip = (key: string, el: JSX.Element, text: string, label: string, skip = 0) => {
    const scope = scopeOf(`tip-${key}`)
    const w = displayWidth(label)
    const shown = ` ${text} `
    return (
      <Box key={`tipbox-${key}`} flexShrink={0} width={w} hover={{ scope }}>
        {el}
        <Box key={`tipcard-${key}`} position="absolute" top={desk ? -1 : 0} right={w + 1 + skip} width={displayWidth(shown) + (desk ? 2 : 0)} display="none" hover={{ scope, display: 'flex' }} backgroundColor={CARD_TIP_BG} {...cardFrame}>
          <Text color="#e6e9f5">{shown}</Text>
        </Box>
      </Box>
    )
  }
  // List cards fill the row's column edge to edge with no side padding, so each line holds as many characters as the column fits.
  // Content width = card width in the terminal; desktop subtracts its 1-cell border on each side.
  const areaCard = (key: string, full: string, i: number, rows: number, w: number) => {
    const c = rowCard(cardText(full), i, rows, desk ? w - 2 : w)
    return (
      <Box key={`ac-${key}`} position="absolute" top={c.top} left={0} width={w} height={c.lines.length} flexDirection="column"
        display="none" hover={{ scope: scopeOf(key), display: 'flex' }} backgroundColor={CARD_TIP_BG} {...cardFrame}>
        {c.lines.map((ln, j) => <Text key={`al-${j}`} wrap="truncate" color="#e6e9f5">{ln}</Text>)}
      </Box>
    )
  }
  // place: whether the card opens above the row (above, default) or below. The card is inside the row's hover scope, so moving the mouse onto it doesn't close it.
  // So rows with a button right above them (section titles, titles under the view mode row, rows next to buttons) open below to avoid covering the button.
  // A below card inside the row would be covered by the rows drawn after it, so it takes a sink to collect into as the wrapping box's last children, and a vertical position (top) relative to that box.
  type Below = { sink: JSX.Element[]; top: number; left?: number }
  const reveal = (key: string, row: JSX.Element, full: string, x = 0, maxW?: number, place: 'above' | Below = 'above') => {
    const scope = scopeOf(key)
    const width = maxW !== undefined ? Math.max(8, maxW) : Math.min(80, cols, Math.max(30, cols - x))
    const left = maxW !== undefined ? 0 : Math.min(0, cols - x - width)
    // Borderless background-color card: with a border the card took 3 rows upward, covering the section title and border row,
    // and text on a border row got clipped so it looked like an empty box. One-line content covers only the one row above. The edge shows as background color (desktop uses the cardFrame border).
    const card = full !== '' && (
      <Box key={`rv-${key}`} position="absolute" {...(place === 'above' ? { bottom: 1, left } : { top: place.top, left: place.left ?? 0 })} width={width} display="none" hover={{ scope, display: 'flex' }}
        flexDirection="column" backgroundColor={CARD_TIP_BG} paddingRight={1} {...cardFrame}>
        {cardText(full).split('\n').flatMap(p => wrapLines(p, width - 3)).map(cardLine)}
      </Box>
    )
    if (card && place !== 'above') place.sink.push(card)
    return (
      <Box key={key} flexDirection="column" hover={{ scope }}>
        {row}
        {place === 'above' && card}
      </Box>
    )
  }
  // Usage limits (5h, 7d): a usage bar, and the time left until the limit is hit at the current rate. If it won't be hit before the reset, the time until reset.
  const LIMIT_LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: '$' }
  const nowMs = Date.now()
  const limits = (usage?.rateLimits ?? []).map(l => {
    const eta = limitEta(l.percentUsed, l.resetsAt, WINDOW_MS[l.kind], nowMs)
    const reset = l.resetsAt ? Date.parse(l.resetsAt) - nowMs : NaN
    return { key: l.kind, label: LIMIT_LABEL[l.kind] ?? l.kind, pct: l.percentUsed, eta, reset }
  })
  const limitColor = (p: number) => (p >= 80 ? C.fail : p >= 50 ? C.tool : C.main)
  // Context breakdown bar: each entry painted in the same theme color as /context, in cells proportional to the window size.
  const CTX_W = 12
  const ctxWin = usage?.context.window || 1
  const parts = t.ctxParts ?? []
  // One gauge: name + 6-cell line gauge (filled ━ in the risk color, rest ─ dim) + value. The caller picks the color.
  // Inner width (columns) of the top box rows: the border and side padding take 4, and with two columns the gauge column and its gap take GAUGE_W + 2.
  // The gauge column has a fixed width on the right, so it stays put while the left rows change. Used to tell whether a row overflows.
  const GAUGE_W = 26 // '5h    ━━━━━━ 100% → 23h59m' with labels padded to 5
  const fullInner = cols - 4
  const req = (t.main.steps ? t.main.tools / t.main.steps : 0).toFixed(1)
  const leftPlain = {
    model: `${t.main.model || 'main'} · main effort ${t.main.effort ?? '-'}`,
    tok: `steps ${t.main.steps} · tools ${t.main.tools} · ↑ ${fmtTok(t.main.inTok)} · ⟳ ${fmtTok(t.main.cacheTok)} · ↓ ${fmtTok(t.main.outTok)}`,
    parts: parts.length ? `${'▇'.repeat(CTX_W)}${parts.slice(0, 2).map(p => ` ${p.name} ${fmtTok(p.tokens)}`).join('')}` : 'ctx breakdown: shown after the first turn',
    req: `tools/req ${req}  stop${stops.length ? stops.map(x => ` ${x.tool} ${pct(x.share)}`).join('') : ' -'}`,
  }
  const mainInner = twoCol ? fullInner - GAUGE_W - 2 : fullInner
  // One-line display: if the row (by plain) is wider than w, end it with …, and hovering shows the full content (full, or plain) as a card.
  // The terminal shortens it with Text's truncate. On desktop, nested Text ignores truncate and wraps, growing the box,
  // so it's held in a non-shrinking box whose outer box clips the right side, followed by …. Not clipped by height (height 1) because on desktop the row height
  // is lower than the text line height and would cut off the bottom of the glyphs.
  // Opening a card above the row spills out of the box near its first rows and covers the header. So, like the session log, cards are drawn as
  // area cards (areaCard) that cover the hovered row and stay within the box, collected as the box's last children (sink) to sit above other rows. rows is the row count in the box; first is the row index of the first oneLine.
  // Open sessions rows: a folder with ~ for the home folder, and one line that never wraps. Desktop nested Text ignores truncate and wraps,
  // so like the top boxes' rows it sits in a non-shrinking box clipped by its outer box, ended with … when plain is wider than w.
  // Row icon: the app's icon in 2 cells (Svg on desktop, a pixel Image on kitty and Ghostty). Elsewhere, or with no icon, the caller's text mark stands in.
  // Also after a plugin reload, which skips session.start: decide the terminal and load the logo here (both are skipped when already done)
  if (pixelTerm === undefined) await decidePixelTerm($)
  quiet(ensureIcons($, ['goyangi']))
  const iconMap = await read($, icons)
  const RowSvg = desk ? $.ui.resolve(e).Svg : undefined
  const RowImage = e.surface === 'terminal' && pixelTerm ? $.ui.resolve(e).Image : undefined
  // The title counts the tabs. Where rows start with an app icon the icon tells the browser; elsewhere the browser letters (B3) need a key, so the per-browser counts
  // follow the number when they fit whole (never cut off with an ellipsis).
  const tabCount = `BROWSER TABS · ${tabList.length || 'none open'}`
  const tabKey = `BROWSER TABS · ${browsers.filter(b => tabList.some(x => x.app === b.app)).map(b => `${b.letter} ${b.name} ${tabList.filter(x => x.app === b.app).length}`).join(' · ')}`
  const tabTitle = !tabList.length || RowSvg || RowImage || displayWidth(tabKey) > listW - 6 ? tabCount : tabKey
  const rowIcon = (app: string | undefined, key: string) => {
    const ic = app ? iconMap[app] : undefined
    if (!ic || !(RowSvg || RowImage)) return null
    return (
      <Box key={`ic-${key}`} flexShrink={0} width={2} height={1} marginRight={1}>
        {RowSvg
          ? <RowSvg source={`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><image href="data:image/png;base64,${ic.png}" width="32" height="32"/></svg>`} alt={app!.replace(/^agent:/, '')} width={16} height={16} />
          : RowImage && <RowImage source={{ png: ic.png }} columns={2} rows={1} alt={app!.replace(/^agent:/, '')} />}
      </Box>
    )
  }
  // Header logo: the walk view cat face in 2 cells on the blue chip, or null (the 🐱 emoji stands in) until it is loaded or where no image can be drawn.
  const logoIc = iconMap['goyangi']
  const logoSig = logoIc ? `${logoIc.png.length}:${logoIc.png.slice(-12)}` : 'none'
  const logoMark = logoIc && (RowSvg || RowImage)
    ? (
      <Box key={`head-logo-${logoSig}`} flexShrink={0} width={2} height={1} backgroundColor={TITLE}>
        {RowSvg
          ? <RowSvg source={`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><image href="data:image/png;base64,${logoIc.png}" width="32" height="32"/></svg>`} alt="Goyangi" width={16} height={16} />
          : RowImage && <RowImage source={{ png: logoIc.png }} columns={2} rows={1} alt="Goyangi" />}
      </Box>
    )
    : null
  const logoChip = (name: boolean) => (logoMark
    ? <Box flexShrink={0}><Text bold color="#ffffff" backgroundColor={TITLE}> </Text>{logoMark}<Text bold color="#ffffff" backgroundColor={TITLE} wrap="truncate">{name ? ' Goyangi ' : ' '}</Text></Box>
    : <Text bold color="#ffffff" backgroundColor={TITLE} wrap="truncate">{name ? LOGO : ' 🐱 '}</Text>)
  // Text marks when no icon is drawn: Claude's ✳ in its orange, and each browser's letter in its brand color
  const CLAUDE_MARK = '#d97757'
  const BROWSER_HUE: Record<string, string> = { C: '#4285f4', B: '#fb542b', E: '#0c8ce9', A: '#fc5a5a', V: '#ef3939', M: '#5f9ef8', G: '#7c6cf0' }
  const peerCwd = (p: Peer) => p.cwd.replace(/^\/Users\/[^/]+/, '~')
  const peerLine = (el: JSX.Element, plain: string, w: number) => (desk
    ? <Box flexShrink={1} minWidth={0}><Box flexShrink={1} overflow="hidden"><Box flexShrink={0}>{el}</Box></Box>{displayWidth(plain) > w && <Box flexShrink={0}><Text dimColor>…</Text></Box>}</Box>
    : <Box flexShrink={1} minWidth={0}>{el}</Box>)
  const lineBox = (rows: number, first = 0) => {
    const sink: JSX.Element[] = []
    let i = first
    const oneLine = (key: string, el: JSX.Element, plain: string, w: number, full?: string) => {
      const over = displayWidth(plain) > w
      const row = desk
        ? <Box><Box flexShrink={1} overflow="hidden"><Box flexShrink={0}>{el}</Box></Box>{over && <Box flexShrink={0}><Text dimColor>…</Text></Box>}</Box>
        : el
      const card = full ?? (over ? plain : '')
      if (card) sink.push(areaCard(key, card, i, rows, w))
      i++
      return reveal(key, row, '', 0, w)
    }
    return { sink, oneLine }
  }
  const gaugePlain = (label: string, v: number) => `${label} ${lineGauge(v, 6).join('')} ${v}%`
  const gauge = (label: string, v: number, c: string) => {
    const [filled, rest] = lineGauge(v, 6)
    return <Text key={`g-${label}`}><Text dimColor>{label} </Text><Text color={c}>{filled}</Text><Text dimColor>{rest}</Text><Text color={c}> {v}%</Text></Text>
  }
  // Gauges with their labels padded to one width, so the bars line up down the column
  const gaugeRows = [
    { key: 'ctx', label: 'ctx', v: ctxPct, c: ctxPct >= 80 ? C.fail : ctxPct >= 60 ? C.tool : C.main, tail: null as JSX.Element | null, tailPlain: '' },
    { key: 'cache', label: 'cache', v: cacheHit, c: !mainTok ? C.dim : cacheHit < 50 ? C.fail : cacheHit < 80 ? C.tool : C.main, tail: null, tailPlain: '' },
    ...limits.map(l => ({
      key: `lim-${l.key}`, label: l.label, v: Math.round(l.pct), c: limitColor(l.pct),
      tail: l.eta !== undefined ? <Text color={C.fail}> → {secs(Math.round(l.eta))}</Text> : Number.isFinite(l.reset) && l.reset > 0 ? <Text dimColor> {REFRESH}{secs(Math.round(l.reset))}</Text> : null,
      tailPlain: l.eta !== undefined ? ` → ${secs(Math.round(l.eta))}` : Number.isFinite(l.reset) && l.reset > 0 ? ` ${REFRESH}${secs(Math.round(l.reset))}` : '',
    })),
  ]
  const LABEL_W = Math.max(...gaugeRows.map(g => displayWidth(g.label)))
  const gaugeCell = (g: typeof gaugeRows[number]) => {
    const [filled, rest] = lineGauge(g.v, 6)
    return (
      <Text key={`g-${g.key}`} wrap="truncate">
        <Text dimColor>{g.label.padEnd(LABEL_W)} </Text><Text color={g.c}>{filled}</Text><Text dimColor>{rest}</Text><Text color={g.c}> {String(g.v).padStart(3)}%</Text>{g.tail}
      </Text>
    )
  }
  const statRows = lineBox(topBody)
  // Left column (or the first rows when narrow): model, counts and tokens, the context breakdown, and the request summary.
  // The running tool's command isn't shown here: the turn flow already shows it on its node.
  const leftRows = [
    statRows.oneLine('main-model', (
      <Text wrap="truncate">
        <Text bold color={C.main}>{t.main.model || 'main'} · main</Text> <Text dimColor>effort</Text> <Text color={C.main}>{t.main.effort ?? '-'}</Text>
      </Text>
    ), leftPlain.model, mainInner),
    statRows.oneLine('main-tok', (
      <Text wrap="truncate">
        <Text dimColor>steps </Text>{t.main.steps}<Text dimColor> · tools </Text>{t.main.tools}<Text dimColor> · </Text>
        <Text color={TOK.input}>↑ {fmtTok(t.main.inTok)}</Text><Text dimColor> · </Text>
        <Text color={TOK.cache}>⟳ {fmtTok(t.main.cacheTok)}</Text><Text dimColor> · </Text>
        <Text color={TOK.output}>↓ {fmtTok(t.main.outTok)}</Text>
      </Text>
    ), leftPlain.tok, mainInner),
    statRows.oneLine('ctx-parts', (
      <Text wrap="truncate">
        {parts.length === 0 && <Text dimColor>ctx breakdown: shown after the first turn</Text>}
        {parts.map(p => <Text key={`cp-${p.name}`} color={p.color}>{'▇'.repeat(Math.max(0, Math.round((p.tokens / ctxWin) * CTX_W)))}</Text>)}
        {parts.length > 0 && <Text dimColor>{'░'.repeat(Math.max(0, CTX_W - parts.reduce((a, p) => a + Math.round((p.tokens / ctxWin) * CTX_W), 0)))}</Text>}
        {parts.slice(0, 2).map(p => <Text key={`cn-${p.name}`}> <Text color={p.color}>{p.name}</Text> <Text dimColor>{fmtTok(p.tokens)}</Text></Text>)}
      </Text>
    ), leftPlain.parts, mainInner, parts.map(p => `${p.name} ${fmtTok(p.tokens)}`).join(' · ')),
    statRows.oneLine('side-req', (
      <Text wrap="truncate">
        <Text dimColor>tools/req </Text>{req}
        <Text dimColor>  stop</Text>
        {stops.length === 0 && <Text dimColor> -</Text>}
        {stops.map(x => <Text key={`st-${x.tool}`}> {x.tool} <Text dimColor>{pct(x.share)}</Text></Text>)}
      </Text>
    ), leftPlain.req, mainInner,
    `Requests: ${t.main.steps}, ${req} tools each\nStop reasons: ${stops.map(x => `${x.tool} ${pct(x.share)}`).join(', ') || '-'}\nTool mix: ${mix.map(x => `${x.tool} ${pct(x.share)}`).join(', ') || '-'}\nSlowest tools: ${slow.map(x => `${x.tool} ${secs(x.max)}`).join(', ') || '-'}`),
  ]
  // Narrow: the gauges two to a row under the left rows
  const gaugePairs: JSX.Element[] = []
  for (let i = 0; i < gaugeRows.length; i += 2) {
    gaugePairs.push(<Box key={`gp-${i}`} gap={2}>{gaugeCell(gaugeRows[i]!)}{gaugeRows[i + 1] && gaugeCell(gaugeRows[i + 1]!)}</Box>)
  }
  // Server tools (advisor, web search, and the like): always its own last row, since some sessions call many. `a` folds the list.
  // The tool mix follows on the same row: the row spans the full width, so it has room the request row beside the gauges doesn't.
  const serverRow = (
    <Box key="server-row">
      {section('side', 'a', '✦ advisor', C.server)}
      <Text wrap="truncate">
        {' '}
        {f.side ? null : servers.length === 0
          ? <Text dimColor>no server tools</Text>
          : servers.map(([name, sv], i) => (
            <Text key={name}>{i ? <Text dimColor> · </Text> : ''}<Text color={C.server}>{name}</Text> ×{sv.calls} <Text dimColor>avg {secs(Math.round(sv.ms / sv.calls))}</Text></Text>
          ))}
        <Text dimColor>  mix</Text>
        {mix.length === 0 && <Text dimColor> -</Text>}
        {mix.map(x => <Text key={`mx-${x.tool}`}> <Text color={C.tool}>{x.tool}</Text> <Text dimColor>{pct(x.share)}</Text></Text>)}
      </Text>
    </Box>
  )
  const topRow = (
    <Box flexDirection="column" borderStyle="round" borderColor={C.main} paddingX={1} {...topH_}>
      {twoCol
        ? (
          <Box key="stat-cols" gap={2}>
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>{leftRows}</Box>
            <Box flexDirection="column" width={GAUGE_W} flexShrink={0}>{gaugeRows.map(gaugeCell)}</Box>
          </Box>
        )
        : [...leftRows, ...gaugePairs]}
      {freshRow && (
        <Box key="fresh-row">
          {fStage
            ? <Text color={C.tool} wrap="truncate">⟳ {fStage === 'writing' ? 'Writing the handoff note, then a fresh session starts here' : 'Starting a fresh session here'}</Text>
            : <Button key="fresh-go" hover={hov('fresh-go')} plain label={`⟳ ctx ${ctxNow}% · Continue in a fresh session`} onPress={() => quiet(startFresh($))} />}
        </Box>
      )}
      {serverRow}
      {statRows.sink}
    </Box>
  )
  const pf = await read($, prefs)
  // The settings button opens or closes the screen (an overlay in the terminal, so the scroll stays where it is).
  const toggleSettings = () => toggleSettingsOf($)
  const eff: Required<Prefs> = { ...base, ...pf }
  const movePanel = () => movePanelOf($, eff)
  // Name cards for the header's right buttons: just the button's name, shown on the row right below the hovered button, aligned to the panel's right edge.
  const toggleView = () => quiet(savePrefs($, { view: eff.view === 'avatar' ? 'default' : 'avatar' }))
  // Terminal move icon: where pressing it sends the panel (down above the prompt, or back to the right).
  const moveIcon = eff.position === 'bottom' ? ' > ' : ' v '
  const TIPS = [['move', 'Move'], ['settings', 'Config'], ['fold', 'Minimize'], ['close', 'Close']] as const
  const headTips = TIPS.map(([k, text]) => (
    <Box key={`tip-${k}`} position="absolute" top={(desk ? 2 : 1) + stickTop} right={0} height={1} display="none" hover={{ scope: scopeOf(`tip-${k}`), display: 'flex' }}
      backgroundColor={CARD_TIP_BG} {...cardFrame}>
      <Text color="#e6e9f5"> {text} </Text>
    </Box>
  ))
  const settingsBox = await settingsScreen($, e)

  // Past turn replay: draw the flow chart from the archive of the turn picked in the session map. Without an archive, the current turn.
  const vtId = await read($, viewTurn)
  const arch = vtId ? await read($, archive) : {}
  const snap = vtId ? arch[vtId] : undefined
  const viewNo = snap ? firstTurn + t.turns.findIndex(x => x.id === vtId) + 1 : 0
  const ft: Tree = snap ? { ...t, flow: snap.flow, files: snap.files, turn: { prompt: snap.prompt, startedAt: snap.startedAt, steps: snap.flow.filter(x => x.kind === 'step').length, running: false } } : t
  const toLive = () => quiet(update($, viewTurn, () => ''))
  // Current turn's flow chart: main nodes (prompt, model requests, answer) are linked left to right,
  // and the tools and subagents each node called hang below it as branches.
  const now = Date.now()
  const t0 = ft.turn.startedAt || ft.flow[0]?.startedAt || now
  const t1 = ft.turn.running ? now : Math.max(t0 + 1, ...ft.flow.map(i => i.endedAt ?? now))
  const NODE_W = 20
  // The prompt node has only two rows, title and time, so it's drawn narrow to leave room for other columns.
  const PROMPT_W = 12
  const ARROW_W = 4
  // Branches to show per column when folded. Folding keeps only running and recent ones and groups the rest in a '+N earlier' row on top.
  const MAX_KIDS = 3
  const foldedCol = await read($, kidsFolded)
  const toggleKids = (id: string) => () => quiet(update($, kidsFolded, v => (v === id ? '' : id)))
  // While focused, drop model request columns that the agent doesn't hang from.
  const columns = flowColumns(focusFlow(ft.flow, fc)).filter(c => !fc || c.children.length > 0 || c.node.kind !== 'step')
  const colW = (c: { node: FlowItem }) => (c.node.kind === 'prompt' ? PROMPT_W : NODE_W)
  // Range of visible columns. If columns are hidden before or after, put one '◂ N prev' / 'N ▸ next' box in their place.
  // Columns differ in width, so add widths from end backward and include as many as fit.
  const fe = await read($, flowPage)
  const total = columns.length
  const end = fe < 0 ? total : Math.max(1, Math.min(fe, total))
  const laterCols = total - end
  // Prev/next boxes show only the hidden column count and direction, so they're drawn narrow (border 2 + padding 2 + content 5 cells).
  // Prev/next box: border and padding 4 + 'p: ◂ 12' (7 cells). Fits up to two digits on one row.
  // Prev/next boxes stay narrow so the step boxes get the width: 'Prv' or 'Nxt' over the hidden count ('p: 14' in the terminal, where the hotkey shows)
  const PAGER_W = 7
  const pager = PAGER_W + ARROW_W
  let budget = treeW + ARROW_W - (laterCols > 0 ? pager : 0)
  let start = end
  while (start > 0 && budget >= colW(columns[start - 1]!) + ARROW_W) { budget -= colW(columns[start - 1]!) + ARROW_W; start-- }
  // If columns remain hidden in front, make room for the earlier box. At least one column stays visible.
  while (start > 0 && budget < pager && start < end - 1) { budget += colW(columns[start]!) + ARROW_W; start++ }
  if (start === end && end > 0) start = end - 1
  const vis = end - start
  const hiddenCols = start
  // Prev/next boxes only when there's room beside the shown columns; on very narrow panels they're left out (p and n still move).
  const showPrev = hiddenCols > 0 && budget >= pager
  const showNext = laterCols > 0 && treeW >= colW(columns[end - 1]!) + pager
  const shownCols = columns.slice(start, end)
  // Whether any shown node has an intent line; without one the blank intent row under the boxes is left out
  const anyIntent = shownCols.some(c => !!c.node.intent)
  const flowPrev = () => quiet(update($, flowPage, () => Math.max(1, start)))
  const flowNext = () => quiet(update($, flowPage, () => (end + Math.max(1, vis) >= total ? -1 : end + Math.max(1, vis))))
  // Running items past the stall threshold are marked with ⏳.
  // Running branches, cards, and step box progress spin with the same glyphs as the step title (SPIN) to show work in progress.
  const spin = SPIN[n % SPIN.length]
  const stateOf = (i: FlowItem) => (i.endedAt === undefined ? (isStalled(i.startedAt, now, cur.stallSeconds * 1000) ? '⏳' : spin) : i.ok ? '✓' : '✗')
  const colorOf = (i: FlowItem) => (!i.ok ? C.fail : i.endedAt === undefined ? C.tool : i.hand ? C.server : undefined)
  // A pull's branch: waiting until its handoff arrives, then the turn it arrived as (↩ T5)
  const pl = await read($, pulls)
  const waiting = new Set(Object.values(pl.wait))
  const resOf = (i: FlowItem) => (pl.back[i.id] ? `↩ ${pl.back[i.id]}` : waiting.has(i.id) ? 'waiting' : i.res)
  // Turn total tokens and cost: sum over model request steps
  const steps = ft.flow.filter(i => i.kind === 'step')
  const turnIn = steps.reduce((a, i) => a + (i.tokIn ?? 0), 0)
  const turnCache = steps.reduce((a, i) => a + (i.tokCache ?? 0), 0)
  const turnOut = steps.reduce((a, i) => a + (i.tokOut ?? 0), 0)
  // Turn total: sum of session cost increases, including requests overlapping subagent requests. The flow chart holds only main requests, so the node sum falls short.
  const turnCost = (snap ? t.turns.find(x => x.id === vtId) : t.turns[t.turns.length - 1])?.cost
  // Node box content, 5 rows: title, time and status, tokens (↑input ↓output), cache tokens, cost.
  // An odd row count lets the arrows between boxes sit on the exact middle row.
  const NODE_H = 7
  // Node box height. The terminal fixes it at border 2 + content 5 rows. On desktop borders take no row, so 5 content rows is the min height.
  const nodeH = desk ? { minHeight: NODE_H - 2 } as const : { height: NODE_H } as const
  // Node box background: desktop lays a pale border color under it to separate boxes from each other and from the branch rows below. The terminal paints no background.
  const nodeHue = (col: { node: FlowItem }) => colorOf(col.node) ?? (col.node.id === heavy ? C.tool : col.node.kind === 'step' ? C.dim : C.main)
  const nodeBg = (hue: string) => (desk && /^#[0-9a-f]{6}$/i.test(hue) ? `${hue}1a` : undefined)
  const nodeText = (i: FlowItem): [string, string, string, string] => {
    const dur = secs((i.endedAt ?? now) - i.startedAt)
    if (i.kind === 'prompt') return [i.hand ? `⇠ ${i.label}` : '▶ prompt', new Date(i.startedAt).toTimeString().slice(0, 8), '', '']
    if (i.kind === 'answer') return [i.ok ? '■ answer' : '■ ended', `${secs(t1 - t0)} ${i.ok ? '✓' : '✗'}`,
      'turn', turnCost !== undefined ? `≈${usd(turnCost)} total` : '']
    const [title, rest] = i.label.split(' → ')
    // This request's share of the turn time. The stop reason is appended only when it isn't tool_use (mostly tool_use, so little information).
    const share = `${Math.round((((i.endedAt ?? now) - i.startedAt) / Math.max(1, t1 - t0)) * 100)}%`
    const stop = (rest ?? '').split(' ')[0] ?? ''
    // In-flight requests spin through · ✢ ✳ ✶ ✻ ✽ like Claude Code's spinner (tick rises every 0.5s). ◆ when done.
    return [`${i.endedAt === undefined ? SPIN[n % SPIN.length] : '◆'} ${title}`, i.endedAt === undefined ? `${SPIN[n % SPIN.length]} ${dur} ${share}` : `${dur} ${share}${stop && stop !== 'tool_use' ? ` ${stop}` : ''}`,
      i.endedAt === undefined ? '' : 'step',
      `${i.cost !== undefined ? `≈${usd(i.cost)}` : ''}${i.cacheDrop ? ' ⟳↓' : ''}`.trim()]
  }
  // Slowest request: with 2 or more requests, its border is highlighted orange.
  const stepDur = (i: FlowItem) => (i.endedAt ?? now) - i.startedAt
  const heavy = steps.length > 1 ? steps.reduce((a, b) => (stepDur(b) > stepDur(a) ? b : a)).id : ''
  // ∥: a parallel call whose run time overlapped another tool in the same column
  const kidName = (i: FlowItem, par = false) => `${par ? '∥ ' : ''}${i.repeat ? `⚠×${i.repeat} ` : ''}${i.kind === 'agent' ? `⑂ ${i.label.split(' ')[0]}` : i.hand ? i.label : `⚙ ${i.label}`}`
  // Files touched this turn and the time bar. One row each above the flow chart.
  const files = ft.files ?? { edit: [], read: [] }
  const filesLine = files.edit.length > 0 || files.read.length > 0
  // Time share bar: where this turn's time went, grouped by category and painted proportionally (the flow chart below shows the order).
  // Row 1: total time + bar (name and share inside each segment), row 2: time taken per category.
  const SHARE: { k: 'm' | 't' | 'a' | 'w'; c: string; name: string }[] = [
    { k: 'm', c: C.main, name: 'model' }, { k: 't', c: C.tool, name: 'tool' }, { k: 'a', c: C.agent, name: 'subagent' }, { k: 'w', c: '#9ca3af', name: 'wait' },
  ]
  const shares = ft.flow.length ? timeShares(ft.flow, t0, t1, now) : { m: 0, t: 0, a: 0, w: 0 }
  const turnMs = t1 - t0
  const barLabel = `time ${secs(Math.round(turnMs))} `
  const BAR_W = Math.max(10, treeW - displayWidth(barLabel) - 1)
  const widths = shareWidths(SHARE.map(x => shares[x.k]), BAR_W)
  const pctOf = (ms: number) => `${Math.round((ms / Math.max(1, turnMs)) * 100)}%`
  const segLabel = (name: string, ms: number, n: number) => {
    const full = ` ${name} ${pctOf(ms)} ${secs(Math.round(ms))}`
    const mid = ` ${name} ${pctOf(ms)}`
    const text = displayWidth(full) <= n ? full : displayWidth(mid) <= n ? mid : displayWidth(` ${name}`) <= n ? ` ${name}` : ''
    return fit(text, n)
  }
  const hasShares = ft.flow.length > 0 && turnMs > 0
  // Advice: computed from this turn's data (or the replayed past turn's). Past turns have no failure counts, so the repeated failure rule is skipped.
  const tips = advise({ flow: ft.flow, fails: snap ? {} : t.fails, ctxPercent: snap ? 0 : ctxPct, limits: snap ? [] : limits.map(l => ({ kind: l.key, pct: l.pct, eta: l.eta })) })
  const tipsAll = await read($, tipsOpen)
  const tipLines = tips.length === 0 ? 0 : tipsAll ? tips.length : 1
  const toggleTips = () => quiet(update($, tipsOpen, v => !v))
  const headLines = (!f.flow && filesLine ? 1 : 0) + (!f.flow && hasShares ? 2 : 0) + (!f.flow ? tipLines : 0)
  const flowMeta = `${ft.flow.length ? secs(t1 - t0) : ''}${turnCost !== undefined ? ` · ≈${usd(turnCost)}` : ''} ${ft.turn.running ? '●' : ''}`
  // Room for the prompt in the turn flow title: total - 'f: ▾ TURN FLOW  ""' (19 cells) - time/cost on the right - padding. Under 8 cells it's left out.
  const flowPromptW = treeW - 19 - displayWidth(flowMeta) - 2
  // Row in the panel where the view box (turn flow, walk) title sits: header 1 + top row or tab row + view row 1 + settings screen
  const viewTop = (1 + topH + 1) + settingsRows
  // Below-cards for the flow chart header rows (title, advice, files, share band) are drawn in the panel-end overlays, on top of lower rows and running cards.
  // Desktop can't place them from the panel top: its borders are thin lines, its top boxes fit their content and its gaps aren't rows, so the panel-relative
  // row count lands several rows low. There they go in flowCards (walkCards for the walk view), drawn as the view box's last children, with tops counted
  // from the view box (viewOrigin 0). A positioned Box paints over every row that isn't positioned, so the cards still sit over the rows below them.
  const viewOrigin = desk ? 0 : viewTop
  const flowCards: JSX.Element[] = []
  const walkCards: JSX.Element[] = []
  const flowBelow = (top: number) => ({ sink: desk ? flowCards : overlays, top: viewOrigin + top })
  // Advice rows: the turn flow and walk view use the same rows right below the title. below is where the evidence card of row j goes.
  const tipRows = (below: (j: number) => Below) => (tipsAll ? tips : tips.slice(0, 1)).map((a, j) => reveal(`tip-${a.id}`, (
        // Advice row: a pale background + 'Warn'/'Tip' chip sets it apart from other flow chart rows. Height stays one row.
        <Box key={`tipln-${a.id}`} justifyContent="space-between" backgroundColor={a.level === 'warn' ? tint('#3a2f1a', C.tool) : tint('#1c2a3d', C.agent)}>
          <Text wrap="truncate">
            <Text bold color="#1e2030" backgroundColor={a.level === 'warn' ? C.tool : '#8ab4f8'}>{a.level === 'warn' ? ' ⚠ Warn ' : ' 💡 Tip '}</Text>
            <Text color={onTint(a.level === 'warn' ? '#f6d9a8' : '#c6dbff')}> {a.text}</Text>
          </Text>
          {j === 0 && tips.length > 1 && (
            <Box flexShrink={0} marginLeft={1}>
              <Button key="tips-more" hover={hov('tips-more')} plain dimColor label={tipsAll ? 'less ▴' : `+${tips.length - 1} ▾`} onPress={toggleTips} />
            </Box>
          )}
        </Box>
      ), a.why, 0, undefined, below(j)))
  const flowView = (
    <Box flexDirection="column">
      {reveal('flow-title', (
      <Box justifyContent="space-between">
        {section('flow', 'f', `TURN FLOW${ft.turn.prompt && flowPromptW >= 8 ? `  "${ellipsis(ft.turn.prompt, flowPromptW)}"` : ''}`, C.main)}
        <Box flexShrink={1} minWidth={0} marginLeft={1} gap={1}>
          {snap && <Button key="flow-live" hover={hov('flow-live')} variant="primary" label={`T${viewNo} past turn · latest ▸`} onPress={toLive} />}
          <Text dimColor wrap="truncate">{flowMeta}</Text>
        </Box>
      </Box>
      ), ft.turn.prompt, 0, undefined, flowBelow(1))}
      {/* Advice: normally the single most important row; +N expands all. Hovering shows the evidence and what to do. */}
      {!f.flow && tipRows(j => flowBelow(j + 2))}
      {!f.flow && filesLine && reveal('flow-files', (
        <Text wrap="truncate">
          {files.edit.length > 0 && <Text><Text color="#eb6f92">✎ </Text>{files.edit.join(' ')}</Text>}
          {files.edit.length > 0 && files.read.length > 0 && <Text dimColor> · </Text>}
          {files.read.length > 0 && <Text dimColor>read {files.read.length}</Text>}
        </Text>
      ), `Edited: ${files.edit.join(', ') || '-'}\nRead: ${files.read.join(', ') || '-'}`, 0, undefined, flowBelow(1 + tipLines + 1))}
      {!f.flow && hasShares && reveal('flow-strip', (
        <Box flexDirection="column">
          {/* Desktop fonts vary in glyph width, so a bar padded with spaces draws shorter than its cell count. Each segment is painted in a box of its cell width. */}
          {desk ? (
            <Box>
              <Box width={displayWidth(barLabel)} flexShrink={0}><Text dimColor>{barLabel}</Text></Box>
              {SHARE.map((x, j) => (widths[j]! > 0
                ? <Box key={`sh-${x.k}`} width={widths[j]!} overflow="hidden" backgroundColor={x.c}><Text color="#1e2030">{segLabel(x.name, shares[x.k], widths[j]!).trimEnd()}</Text></Box>
                : null))}
            </Box>
          ) : (
          <Text wrap="truncate">
            <Text dimColor>{barLabel}</Text>
            {SHARE.map((x, j) => (widths[j]! > 0
              ? <Text key={`sh-${x.k}`} color="#1e2030" backgroundColor={x.c}>{segLabel(x.name, shares[x.k], widths[j]!)}</Text>
              : null))}
          </Text>
          )}
          <Box paddingLeft={desk ? displayWidth(barLabel) : 0}>
            <Text wrap="truncate">
              {SHARE.filter(x => shares[x.k] > 0).map((x, j) => (
                <Text key={`sl-${x.k}`}>{j ? <Text dimColor> · </Text> : desk ? null : <Text dimColor>{' '.repeat(displayWidth(barLabel))}</Text>}<Text color={x.c}>■</Text><Text dimColor> {x.name} {secs(Math.round(shares[x.k]))}</Text></Text>
              ))}
            </Text>
          </Box>
        </Box>
      ), 'Where this turn\'s time went, grouped by category. model: waiting for responses, tool: running tools, subagent: running subagents, wait: time when no model request, tool, or subagent was running. When they overlap, only one counts: subagent > tool > model. The flow chart below shows the order.', 0, undefined, flowBelow(1 + tipLines + (filesLine ? 1 : 0) + 2))}
      {!f.flow && columns.length === 0 && <Text dimColor>The flow chart starts with the next prompt.</Text>}
      {!f.flow && columns.length > 0 && (
        <Box>
          {shownCols.map((col, ci) => {
            const [title, sub, tok, cost] = nodeText(col.node)
            const running = col.node.endedAt === undefined && col.node.kind === 'step'
            const isOpen = foldedCol !== col.node.id
            const { shown: kids, hidden: more } = pickKids(col.children, MAX_KIDS, isOpen)
            const canFold = isOpen && col.children.length > MAX_KIDS
            const lastTop = kids.map(k => k.depth).lastIndexOf(0)
            const liveKid = kids.map(k => k.item.endedAt === undefined).lastIndexOf(true)
            const nextNode = shownCols[ci + 1]?.node
            const arrowLive = nextNode !== undefined && nextNode.endedAt === undefined && nextNode.kind === 'step'
            // Node boxes, prev/next boxes, and arrows sit in one row. Prev/next boxes stretch to match the node box height,
            // and arrows sit in the middle of that row. Matching with fixed heights or margins drifts on desktop, where cell and text line heights differ.
            const lastCol = ci === shownCols.length - 1
            return (
              <Box key={col.node.id} flexDirection="column">
                <Box>
                  {ci === 0 && showPrev && [
                    <Box key="flow-prev-box" flexShrink={0} flexDirection="column" borderStyle="round" {...(desk ? { borderColor: C.dim } : { borderDimColor: true })} width={PAGER_W} justifyContent="center" alignItems="center" hover={{ borderColor: C.main }}>
                      <Text dimColor>Prv</Text>
                      <Button key="flow-prev" hover={hovKey('flow-prev')} plain hotkey="p" label={`${hiddenCols}`} onPress={flowPrev} />
                    </Box>,
                    <Box key="flow-prev-arrow" alignSelf="center" width={ARROW_W} flexShrink={0}><Text dimColor>──▶</Text></Box>,
                  ]}
                  <Box flexDirection="column" width={colW(col)} flexShrink={0} borderStyle="round" borderColor={nodeHue(col)} backgroundColor={nodeBg(nodeHue(col))} paddingX={1} {...nodeH} justifyContent="center">
                    <Text bold color={running ? C.tool : C.main} wrap="truncate">{title}</Text>
                    <Text dimColor wrap="truncate">{sub}</Text>
                    {(() => {
                      // Row 3: ↑(new input) · ↓(output), row 4: ⟳(input read from cache), row 5: cost. Each in its own color.
                      if (tok === '') return [<Text key="t3"> </Text>, <Text key="t4"> </Text>, <Text key="t5" color={TOK.cost} wrap="truncate">{cost || ' '}</Text>]
                      const [ti, tc, to] = tok === 'turn' ? [turnIn, turnCache, turnOut] : [col.node.tokIn ?? 0, col.node.tokCache ?? 0, col.node.tokOut ?? 0]
                      return [
                        <Text key="t3" wrap="truncate">
                          <Text color={TOK.input}>↑ {fmtTok(ti)}</Text><Text dimColor> · </Text><Text color={TOK.output}>↓ {fmtTok(to)}</Text>
                        </Text>,
                        <Text key="t4" color={TOK.cache} wrap="truncate">⟳ {fmtTok(tc)}</Text>,
                        <Text key="t5" color={TOK.cost} wrap="truncate">{cost || ' '}</Text>,
                      ]
                    })()}
                  </Box>
                  {!lastCol && (
                    <Box alignSelf="center" width={ARROW_W} flexShrink={0}>
                      <Text color={arrowLive ? C.tool : C.dim}>{arrowFrame(n, arrowLive && busy)}</Text>
                    </Box>
                  )}
                  {lastCol && showNext && [
                    <Box key="flow-next-arrow" alignSelf="center" width={ARROW_W} flexShrink={0}><Text dimColor>──▶</Text></Box>,
                    <Box key="flow-next-box" flexShrink={0} flexDirection="column" borderStyle="round" {...(desk ? { borderColor: C.dim } : { borderDimColor: true })} width={PAGER_W} justifyContent="center" alignItems="center" hover={{ borderColor: C.main }}>
                      <Text dimColor>Nxt</Text>
                      <Button key="flow-next" hover={hovKey('flow-next')} plain hotkey="n" label={`${laterCols}`} onPress={flowNext} />
                    </Box>,
                  ]}
                </Box>
                <Box flexDirection="column" width={colW(col)} marginLeft={ci === 0 && showPrev ? pager : 0}>
                  {/* Intent row: the first line the model wrote in this request. When another shown node has one, a node without it keeps a blank row
                      so the branch rows line up across columns; when no shown node has one, the row is left out. */}
                  {anyIntent && reveal(`intent-${col.node.id}`, (
                    <Text dimColor italic wrap="truncate">{col.node.intent ? ` "${col.node.intent}"` : ' '}</Text>
                  ), col.node.intent ?? '', 0, colW(col))}
                  {more > 0 && (
                    <Button key={`more-${col.node.id}`} hover={hov(`more-${col.node.id}`)} plain dimColor label={`┌ +${more} earlier ▾`} onPress={toggleKids(col.node.id)} />
                  )}
                  {kids.map((k, ki) => {
                    const top = k.depth === 0
                    const isLastTop = ki === lastTop
                    const nextK = kids[ki + 1]
                    const lastNested = !nextK || nextK.depth === 0
                    const parentLast = ki > lastTop
                    const prefix = top ? (isLastTop && !canFold ? ' └ ' : ' ├ ') : `${parentLast ? '   ' : ' │ '}${lastNested ? '└ ' : '├ '}`
                    // Hovering shows the full-content card with the same scope.
                    return (
                      <Box key={k.item.id} {...(desk ? { overflow: 'hidden' } as const : {})} hover={{ scope: scopeKey('kid-', k.item.id), backgroundColor: tint('#2a2f45', C.agent) }}>
                        {/* Desktop nested Text ignores truncate and wraps, so it's held in a non-shrinking box whose outer box clips the right (the full content is in the hover card). */}
                        <Box flexShrink={desk ? 0 : 1}>
                        <Text wrap="truncate">
                          <Text dimColor>{prefix}</Text>
                          <Text color={colorOf(k.item) ?? (k.item.kind === 'agent' || k.depth ? C.agent : C.tool)}>{kidName(k.item, k.depth === 0 && k.item.kind === 'tool' && overlaps(k.item, col.children.filter(x => x.depth === 0).map(x => x.item), now))}</Text>
                          <Text color={colorOf(k.item) ?? C.dim}> {stateOf(k.item)}</Text>
                          {resOf(k.item) ? <Text color={k.item.ok ? (pl.back[k.item.id] ? C.server : C.dim) : C.fail}> {resOf(k.item)}</Text> : null}
                        </Text>
                        </Box>
                      </Box>
                    )
                  })}
                  {kids.map((k, ki) => {
                    // Full-content card: shown right below that branch row on hover.
                    // The last running branch is always shown, but at the bottom of the branch list. Opening it between branch rows
                    // covers other branch rows in the same column, and with several running in parallel the cards shift a row apart and overlap.
                    const running = k.item.endedAt === undefined
                    const pinned = running && ki === liveKid
                    const rowAt = pinned ? kids.length + (canFold ? 1 : 0) : ki
                    const colLeft = (showPrev ? pager : 0) + shownCols.slice(0, ci).reduce((a, c) => a + colW(c) + ARROW_W, 0)
                    // The card starts at its column and runs to the panel's right edge with no side padding, so each line holds as many characters as fit.
                    // A column near the right edge still gets at least 30 cells, shifted left.
                    // Desktop measures against the flow chart width (treeW) since the card is placed inside it.
                    const spanW = desk ? treeW : cols
                    const cardW = Math.min(spanW, Math.max(30, spanW - colLeft))
                    const cardLeft = Math.max(0, Math.min(colLeft, spanW - cardW))
                    // Vertical position in the panel: title row, top row, margin, TURN FLOW title, node box (4 rows), branch order
                    // When the settings screen is open, shift down by its height (SETTINGS_H).
                    // Desktop rows above the branch list aren't whole rows (thin borders, fitted boxes, gaps), so the panel-relative count lands low there.
                    // It draws the card as a child of this column's branch list box instead, placed from that box's top (intent row, +N row, then the
                    // branch rows) and its left edge. Positioned, it paints over the branch rows of the columns to its right and the rows below the flow chart.
                    const flowTop = (1 + topH + 2) + settingsRows
                    const inList = (anyIntent ? 1 : 0) + rowAt + 1 + (more > 0 ? 1 : 0)
                    const card = (
                      <Box
                        key={`card-${k.item.id}`}
                        position="absolute"
                        top={desk ? inList : flowTop + headLines + NODE_H + inList}
                        left={desk ? cardLeft - colLeft : cardLeft}
                        width={cardW}
                        display={pinned ? 'flex' : 'none'}
                        hover={pinned ? undefined : { scope: scopeKey('kid-', k.item.id), display: 'flex' }}
                        flexDirection="column"
                        borderStyle="round"
                        borderColor={pinned ? C.tool : C.dim}
                        backgroundColor={CARD_BG}
                      >
                        <Text color={colorOf(k.item) ?? C.tool} wrap="wrap">{k.item.kind === 'agent' ? '⑂ ' : '⚙ '}{cardText(k.item.full ?? k.item.label)}</Text>
                        <Text color={CARD_DIM} wrap="truncate">{running ? `${spin} running` : k.item.ok ? '✓ done' : '✗ failed'} · {secs((k.item.endedAt ?? now) - k.item.startedAt)}{k.item.repeat ? ` · failure #${k.item.repeat} this turn` : ''}</Text>
                        {k.item.err && <Text color={C.fail} wrap="wrap">{k.item.err}</Text>}
                      </Box>
                    )
                    if (desk) return card
                    overlays.push(card)
                    return null
                  })}
                  {canFold && (
                    <Button key={`less-${col.node.id}`} hover={hov(`less-${col.node.id}`)} plain dimColor label="└ less ▴" onPress={toggleKids(col.node.id)} />
                  )}
                </Box>
              </Box>
            )
          })}
        </Box>
      )}
      {desk && flowCards}
    </Box>
  )

  // Session map (bird's-eye view): one row per turn, with what happened in that turn stamped in order as colored blocks.
  // Cross-session totals: computed from stored records with this session's current cost overwritten.
  const hist = historySummary(sessionId ? upsertRecord(history, { ...(history.find(x => x.id === sessionId) ?? { id: sessionId, startedAt: Number(sessionId), turns: 0, tools: 0, tokens: 0 }), updatedAt: now, cost: usage?.cost?.usd ?? 0 }) : history, now)
  const labelW = Math.min(34, Math.max(18, Math.floor(cols * 0.28)))
  // Actual width of the right metric columns: padding 1 + tools 16 + 1 + result 7 + time 6 + 1 + bar 4 + 1 + cost 7 + 1 + status 1 = 46.
  // The left side uses 6 more cells: number and time cells, prompt cell padding, and the 1-cell progress mark.
  const metaW = 48
  // Narrow panels (no room for the prompt and the metric columns beside a 10-cell tool sequence): rows keep only the turn number and time,
  // the tool sequence, the duration, and the status mark, and the column headers are left out.
  const mapCompact = !desk && cols - labelW - metaW - 4 < 10
  const seqW = mapCompact ? Math.max(4, cols - 10 - 9 - 6) : Math.max(10, cols - labelW - metaW - 4) // includes the 2-cell right scrollbar
  // Turn weight bar: relative to the heaviest turn left in the session. Basis is time or cost (switched in the header).
  const basis = await read($, mapBasis)
  const weightOf = (x: { startedAt: number; endedAt?: number; cost?: number }) => (basis === 'cost' ? x.cost ?? 0 : (x.endedAt ?? now) - x.startedAt)
  const maxWeight = Math.max(0, ...t.turns.map(weightOf))
  // Turns without an archive (pushed out as old) don't open. Archives are read only when clicked.
  const openTurn = (id: string) => () => quiet(read($, archive).then(a => Promise.all([update($, viewTurn, v => (v === id || !a[id] ? '' : id)), update($, replayFrom, () => Date.now())])))
  const toggleTall = () => quiet(update($, mapTall, v => !v))
  const toggleBasis = () => quiet(update($, mapBasis, v => (v === 'cost' ? 'time' : 'cost')))
  const diffFiles = Object.entries(t.diff ?? {})
  const diffAdd = diffFiles.reduce((s, [, d]) => s + d.add, 0)
  const diffDel = diffFiles.reduce((s, [, d]) => s + d.del, 0)
  const mapView = (
    <Box flexDirection="column" borderStyle="round" borderColor={C.dim} paddingX={1}>
      {/* When the panel is too narrow for the title and the controls on one row, the controls wrap to the next row as a whole (on every surface),
          instead of squeezing the title until its words stack one per row. */}
      <Box key="map-title-row" justifyContent="space-between" flexWrap="wrap" rowGap={0}>
        {/* The left side (title + trend) is the one that shrinks. The title doesn't shrink; the trend is cut to one row in the remaining width so it never stacks vertically by wrapping.
            Not clipped with overflow because that would also clip the trend's hover card (absolute). The today/7d totals on the right show only at width 120 or more. */}
        <Box flexGrow={1} flexShrink={1}>
          <Box flexShrink={1} minWidth={0}>{section('map', 'm', `SESSION MAP · ${t.turnTotal ? `T${mwin.start + 1}–T${mwin.end} / ${t.turnTotal}` : '0 turns'}`, C.main, true)}</Box>
          {/* Trend of recent turns' weight (same value as the ⚖ basis). One braille cell holds two turns, so 16 cells hold 32 turns. The rightmost dot is the latest turn. */}
          {/* Lines added and removed this session. Pressing the button opens the engine's /diff screen (it takes no file, so it shows all changes). */}
          {diffFiles.length > 0 && <Box flexShrink={0} marginLeft={1}>
            <Button key="map-diff-open" hover={hov('map-diff-open')} plain onPress={() => quiet($.command.run({ command: 'diff' }))}><Text color={C.main} backgroundColor="#1f3a2a"> +{diffAdd} </Text><Text color={C.fail} backgroundColor="#3a1f24"> -{diffDel} </Text><Text dimColor> ↗ diff</Text></Button>
          </Box>}
          {t.turns.length > 1 && <Box flexShrink={1}>{reveal('map-spark', <Text color={M.cost} wrap="truncate">  {brailleSpark(t.turns.slice(-32).map(weightOf))}</Text>,
            `${basis === 'cost' ? 'Cost' : 'Time'} trend over the last ${Math.min(32, t.turns.length)} turns. One braille cell holds two turns (left column, right column); the rightmost dot is the latest turn.`, 0, 44)}</Box>}
        </Box>
        <Box flexShrink={1} minWidth={0} marginLeft={1} flexWrap="wrap" columnGap={2} rowGap={0}>
          {hist.today.sessions > 0 && cols >= 120 && <Text dimColor>today <Text color={M.cost}>≈{usd(hist.today.cost)}</Text> ({hist.today.sessions}) · 7d <Text color={M.cost}>≈{usd(hist.week.cost)}</Text></Text>}
          <Button key="map-basis" hover={hov('map-basis')} plain dimColor label={`⚖ ${basis === 'cost' ? 'cost' : 'time'}`} onPress={toggleBasis} />
          <Button key="map-tall" hover={hov('map-tall')} plain dimColor label={`⇕ ${mapRows} rows`} onPress={toggleTall} />
          <Text color={mwin.follow ? C.main : C.tool}>{mwin.follow ? '● live' : '⏸ paused'}</Text>
          {/* A pair of up/down scroll buttons. Desktop default buttons have inner padding, so no gap is added. */}
          <Box gap={desk ? 0 : 1} flexShrink={0}>
            <Button key="map-up" hover={hovKey('map-up')} plain hotkey="u" dimColor={mwin.start <= firstTurn} onPress={mapUp}>▲</Button>
            <Button key="map-down" hover={hovKey('map-down')} plain hotkey="d" dimColor={mwin.follow} onPress={mapDown}>▼</Button>
          </Box>
        </Box>
      </Box>
      {/* The legend always shows in full (never shortened; wraps to the next row if longer than the panel). Column headers match the width of the fixed right columns in the turn rows below,
          and the last 4 cells are the space before the status mark (✓), its cell, and the 2-cell scrollbar. If there's no room for headers beside the legend, they drop to the right of the next row. */}
      {!f.map && (() => {
        const legend = Object.values(MARK).filter(m => m.name)
        const legendW = legend.reduce((a, m) => a + displayWidth(`${m.g} ${m.name} `), 0)
        const head = `${'tools'.padStart(16)} ${'result'.padEnd(7)}${'time'.padStart(6)} ${'wt'.padEnd(4)} ${'cost'.padStart(7)}    `
        const legendText = (
          <Text wrap="wrap">
            {legend.map(m => <Text key={m.name} color={m.c}>{m.g} <Text dimColor>{m.name} </Text></Text>)}
          </Text>
        )
        const headText = <Text dimColor>{head}</Text>
        if (t.turns.length === 0 || mapCompact) return legendText
        // Inner width of the map box = panel width - border 2 - padding 2, with 1 cell between legend and headers
        if (legendW + 1 + displayWidth(head) <= cols - 4) {
          return (
            <Box justifyContent="space-between">
              {legendText}
              <Box flexShrink={0} marginLeft={1}>{headText}</Box>
            </Box>
          )
        }
        return (
          <Box flexDirection="column">
            {legendText}
            <Box justifyContent="flex-end">{headText}</Box>
          </Box>
        )
      })()}
      {!f.map && t.turns.length === 0 && <Text dimColor>Starting with the next prompt, each turn is recorded as one row.</Text>}
      {mapTurns.length > 0 && (
      <Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
      {mapTurns.map((tr, i) => {
        const no = mwin.start + i + 1
        const running = tr.endedAt === undefined
        // Runs of the same tool collapse to ■×12; if still too long, the middle shortens to … keeping the start and end.
        const toks = mapTokens(tr.seq, seqW - 2)
        const dur = secs((tr.endedAt ?? now) - tr.startedAt)
        const viewing = vtId === tr.id
        const bad = (tr.fails ?? 0) > 0 || (!running && !tr.ok)
        const result = `${tr.edits ? `✎${tr.edits}` : ''}${tr.edits && tr.fails ? ' ' : ''}${tr.fails ? `✗${tr.fails}` : ''}`
        return reveal(`map-${tr.id}`, (
          <Box justifyContent="space-between" backgroundColor={viewing ? tint('#2a2f45', C.agent) : bad ? tint('#3a1f24', C.fail) : undefined}>
            <Box flexGrow={1} flexShrink={1}>
            {/* Clicking a turn number switches the flow chart above to that turn's archive. Clicking again returns to the current turn. */}
            {/* Number and prompt cells sit in fixed-width boxes. Desktop fonts vary in glyph width, so space padding would misalign the block columns row to row. */}
            <Box width={10} flexShrink={0}>
              <Button key={`map-open-${tr.id}`} hover={hov(`map-open-${tr.id}`)} plain dimColor={!viewing} label={fit(`T${no} ${new Date(tr.startedAt).toTimeString().slice(0, 5)}`, 10)} onPress={openTurn(tr.id)} />
            </Box>
            {!mapCompact && <Box width={labelW - 9} flexShrink={0} overflow="hidden">
              <Text wrap="truncate">{`"${ellipsis(tr.prompt, labelW - 12)}"`}</Text>
            </Box>}
            <Text wrap="truncate">
              {toks.map((k, j) => (k.ch === '…'
                ? <Text key={`r${j}`} dimColor>…</Text>
                : <Text key={`r${j}`} color={MARK[k.ch]?.c ?? C.dim}>{k.n >= 3 ? `${MARK[k.ch]?.g ?? '·'}×${k.n}` : (MARK[k.ch]?.g ?? '·').repeat(k.n)}</Text>))}
              {running && <Text color={C.tool}>{n % 2 ? '▓' : '▒'}</Text>}
            </Text>
            </Box>
            <Box flexShrink={0} marginLeft={1}>
            {mapCompact ? (
              <Text><Text dimColor>{dur.padStart(6)} </Text><Text color={running ? C.tool : tr.ok ? C.main : C.fail}>{running ? '●' : tr.ok ? '✓' : '✗'}</Text></Text>
            ) : (
            <Text>
              <Text dimColor>{`${tr.tools} tools${tr.agents ? ` · ${tr.agents} agent${tr.agents > 1 ? 's' : ''}` : ''}`.padStart(16)} </Text>
              <Text color={tr.fails ? C.fail : '#eb6f92'}>{result.padEnd(7)}</Text>
              <Text dimColor>{dur.padStart(6)} </Text>
              <Text color={C.tool}>{weightBar(weightOf(tr), maxWeight)} </Text>
              {/* Turns without a cost record (pre-v0.12 records, or sessions without cost info) show '-'. */}
              <Text color={tr.cost !== undefined ? C.tool : C.dim}>{(tr.cost !== undefined ? `≈${usd(tr.cost)}` : '-').padStart(7)} </Text>
              <Text color={running ? C.tool : tr.ok ? C.main : C.fail}>{running ? '●' : tr.ok ? '✓' : '✗'}</Text>
            </Text>
            )}
            </Box>
          </Box>
        ), '', 2)
      })}
      {Array.from({ length: mapPad }, (_, i) => <Text key={`mpad-${i}`}> </Text>)}
      {/* Full prompt card: opens only within the map row list area. List width = panel width - border and padding 4 - scrollbar 2 */}
      {mapTurns.map((tr, i) => areaCard(`map-${tr.id}`, tr.prompt, i, mapRows, cols - 6))}
      </Box>
      {/* Right scrollbar: the visible span among the remaining turns */}
      <Box flexDirection="column" flexShrink={0} marginLeft={1}>
        {barCol('map', t.turns.length, mwin.from, mapRows)}
      </Box>
      </Box>
      )}
      {mapTurns.length === 0 && Array.from({ length: mapPad }, (_, i) => <Text key={`mpad0-${i}`}> </Text>)}
    </Box>
  )

  // Subagent fork lines: target the middle cell of each first-row box (box width boxW-1, gap 1).
  const boxW = Math.floor(treeW / perRow)
  // Session-wide tokens (main + all subagents). Used for each subagent box's share.
  const allTok = [t.main, ...t.agents].reduce((a, l) => a + l.inTok + l.cacheTok + l.outTok, 0)
  const targets = (agentRows[0] ?? []).map((_, i) => i * boxW + Math.floor((boxW - 1) / 2))
  const branch = branchLines(treeW, targets, n, busy && live > 0)
  const join = joinLines(treeW, targets, n, busy && live > 0)

  // Spawned from: the origin of agents shown as boxes. If several were spawned from the same place, it's written once.
  const origins = [...new Set(shown.map(a => a.origin).filter((o): o is string => !!o))]
  // Returned to: the main node that received the last finished agent's result
  const lastBack = Math.max(0, ...t.agents.filter(a => a.status === 'done' || a.status === 'failed').map(a => a.endedAt ?? 0))
  // Results that came back in a previous turn have no receiving node in the current flow chart, so no arrow is drawn.
  const backInTurn = lastBack > 0 && lastBack >= t.turn.startedAt
  const backTarget = returnTarget(t.flow, lastBack)
  const backLive = backTarget !== undefined && backTarget.endedAt === undefined
  const backLabel = !backTarget ? (t.turn.running ? '◐ main' : '○ main') : backTarget.kind === 'answer' ? '■ answer' : `◆ ${backTarget.label.split(' → ')[0]}`
  const treeView = (
    <Box flexDirection="column" width={treeW}>
      {flowView}
      <Text color={busy ? C.main : C.dim}>{'   '}{pulse}</Text>
      {/* Even without subagents, the title (shortcut s) is drawn so folding and expanding always work. */}
      {t.agents.length === 0 ? (
        <Box flexDirection="column">
          <Box>
            <Text color={C.dim}>{'   ├─ '}</Text>
            {section('agents', 's', 'subagents · 0', C.agent)}
          </Box>
          {!f.agents && <Text dimColor>{'   └ '}no subagents yet</Text>}
        </Box>
      ) : (
        <Box flexDirection="column">
          {/* Spawned from ──▶ spawn: the main request or parent agent that spawned the running agents (shown as boxes) */}
          <Box>
            <Box flexShrink={0}><Text color={C.agent}>{'   ├─ '}</Text></Box>
            {/* Narrow panels (under 40 cells) leave out the origin and arrow so the title fits */}
            {origins.length > 0 && treeW >= 40 && <Box flexShrink={1} minWidth={0}><Text color={C.main} wrap="truncate">{origins.join(', ')} </Text></Box>}
            {origins.length > 0 && treeW >= 40 && <Box flexShrink={0}><Text color={live ? C.agent : C.dim}>{arrowFrame(n, busy && live > 0)} </Text></Box>}
            {/* Narrow panels get the short form (running/total), which doesn't shrink; the origin on the left is cut instead */}
            {section('agents', 's', treeW < 50 ? `subagents ${live}/${t.agents.length}` : `subagents · ${live} running / ${t.agents.length}${hidden ? ` · +${hidden} more` : ''}`, C.agent, treeW >= 50)}
            {fa && <Button key="focus-clear" hover={hov('focus-clear')} plain label={`◉ focus ${fa.type} ✕`} onPress={setFocus(fa.id)} />}
          </Box>
          {!f.agents && shown.length > 0 && branch.map((l, i) => <Text key={`br-${i}`} color={live ? C.agent : C.dim} wrap="truncate">{l}</Text>)}
          {!f.agents && agentRows.map(row => (
            <Box key={row.map(a => a.id).join()} gap={1}>
              {row.map((a, ai) => { const boxBelow: JSX.Element[] = []; return (
                <Box key={a.id} flexDirection="column" borderStyle="round" borderColor={a.status === 'done' ? C.dim : a.status === 'failed' ? C.fail : C.agent} paddingX={1} width={Math.floor(treeW / perRow) - 1}>
                  <Button key={`focus-${a.id}`} hover={hov(`focus-${a.id}`)} plain dimColor={a.id !== fc && a.status === 'done'} label={`${a.id === fc ? '◉ ' : ''}${a.type}`} onPress={setFocus(a.id)} />
                  {reveal(`ag-desc-${a.id}`, <Text dimColor wrap="truncate">{a.desc || '-'}</Text>, a.desc, 0, Math.floor(treeW / perRow) - 5, { sink: boxBelow, top: 2 })}
                  {/* Recent tools as colored blocks like the session map, then tool count, share of session-wide tokens, and elapsed time */}
                  {reveal(`ag-meta-${a.id}`, (
                    <Text wrap="truncate">
                      {runs((a.seq ?? '').slice(-8)).map((rr, j) => <Text key={`as-${j}`} color={MARK[rr.ch]?.c ?? C.dim}>{(MARK[rr.ch]?.g ?? '·').repeat(rr.n)}</Text>)}
                      <Text dimColor>{a.seq ? ' ' : ''}{a.tools} tools · tok {Math.round(((a.inTok + a.cacheTok + a.outTok) / Math.max(1, allTok)) * 100)}%{a.startedAt ? ` · ${secs((a.endedAt ?? now) - a.startedAt)}` : ''}</Text>
                    </Text>
                  ), `${a.model || '-'}${a.effort ? ` · ${a.effort}` : ''} · tokens ${fmtTok(a.inTok + a.cacheTok + a.outTok)} (${Math.round(((a.inTok + a.cacheTok + a.outTok) / Math.max(1, allTok)) * 100)}% of the session)`, 0, Math.floor(treeW / perRow) - 5, { sink: boxBelow, top: 3 })}
                  {(() => {
                    // Stalled: running but no event within the threshold.
                    const stalled = a.status === 'idle' && isStalled(a.lastAt, now, cur.stallSeconds * 1000)
                    const label = stalled ? `⏳ stalled ${secs(now - (a.lastAt ?? now))}` : `${ICON[a.status]} ${a.status === 'tool' ? a.activity : a.status}`
                    return reveal(`ag-act-${a.id}`, <Text color={stalled ? C.fail : color(a)} wrap="truncate">{label}</Text>, a.status === 'tool' ? a.activity : '', 0, Math.floor(treeW / perRow) - 5)
                  })()}
                  {boxBelow}
                </Box>
              )})}
            </Box>
          ))}
          {!f.agents && shown.length > 0 && join.map((l, i) => <Text key={`jn-${i}`} color={back ? C.main : C.dim} wrap="truncate">{l}</Text>)}
          {/* back to main ──▶ the main node that received the results */}
          <Box>
            <Box borderStyle="round" borderColor={C.main} paddingX={1} flexShrink={1}>
              <Text color={C.main} wrap="truncate">▼ back to main · {back} returned{live ? ` · ${live} still running` : ''}</Text>
            </Box>
            {/* Centered on the bordered box beside it: its middle row in the terminal; on desktop, where the border is a thin line and a margin step
                is half a row, a top margin would sit it half a row low. */}
            {backInTurn && (
              <Box alignSelf="center" flexShrink={0}>
                <Text color={backLive ? C.tool : C.main}> {arrowFrame(n, backLive && busy)} </Text>
              </Box>
            )}
            {backInTurn && (
              <Box borderStyle="round" borderColor={backTarget ? C.main : C.dim} paddingX={1} flexShrink={0}>
                <Text bold color={backLive ? C.tool : C.main}>{backLabel}</Text>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  )

  // Walk view: draws a side-scrolling game scene in place of the turn flow. main and each subagent get one row (work path),
  // and a pixel character walks right through the spots it passed this turn (model requests, tools, delegation) while working. Frames advance with tick (paused while idle).
  const DOT: Record<string, string> = {
    S: '#f2c9a0', E: '#1e2030', P: '#334155', K: '#1f2937', M: '#64748b', G: '#0f172a', L: '#7dd3a8', C: '#f6c177',
    Y: '#e0af68', U: '#8ab4f8', T: '#7dd3a8', W: '#a0703c', D: '#5b3a1e', O: '#e5e7eb',
    '1': '#eb6f92', '2': '#8ab4f8', '3': '#f6c177', '4': '#9ccfd8',
  }
  const CREW = ['#8ab4f8', '#c4a7e7', '#f6c177', '#eb6f92', '#9ccfd8', '#e0af68']
  // Character colors: the body follows the name color (main is sky blue); patches are a darker body color. Orange, yellow, and eyes are shared.
  // Finish flags: below the path of each finished spot stands a pole (▕) with a small flag showing the step number. Failed spots get a red flag.
  // Model request spots show the step number (step 3 → 3); other spots show ✓ or ✗. Pole 1 + cloth 3, so numbers up to three digits are written as is (three digits drop the end ▶),
  // and from four digits only the last three are written.
  const POLE = '#9ca3af'
  const smallFlag = (st: Station) => {
    const ok = st.state === 'ok'
    const mark = /^step (\d+)/.exec(st.label)?.[1] ?? (ok ? '✓' : '✗')
    const bg = ok ? '#22c55e' : C.fail
    const shown = mark.padStart(2).slice(-3)
    // On desktop block-character poles break between rows, so it's drawn as Svg (pinned to the bottom of a 4-row box)
    if (Svg) return <Box flexDirection="column" height={4} justifyContent="flex-end"><Svg source={flagSvg(shown.trim(), bg, POLE)} alt={st.label} width={5 * 8} height={4 * 16} /></Box>
    return [
      <Text key="fl0"> </Text>,
      <Text key="fl1"><Text color={POLE}>▕</Text><Text bold color="#0b1020" backgroundColor={bg}>{shown}</Text>{mark.length < 3 ? <Text color={bg}>▶</Text> : null}</Text>,
      <Text key="fl2" color={POLE}>▕</Text>,
      <Text key="fl3" color={POLE}>▕</Text>,
    ]
  }
  const dotLine = (segs: DotSeg[], j: number) => (
    <Text key={`dl-${j}`}>{segs.map((g, k) => <Text key={`ds-${k}`} color={g.fg} backgroundColor={g.bg}>{g.text}</Text>)}</Text>
  )
  // One pixel art image. Desktop renders with web fonts lacking octant glyphs, so it draws Svg (DOT_PX CSS px per pixel).
  // rows is the Svg height (pixels). The terminal draws at the art's height; bottom alignment is up to the caller via marginTop.
  // Desktop pins the Svg to the bottom of a 4-row box to match the height of flags (4 Text rows) or empty path and ground rows.
  const Svg = e.surface === 'desktop' ? $.ui.resolve(e).Svg : undefined
  // Terminals that draw pixels (kitty, Ghostty) use Image. One cell is 2 × 4 pixels, the same size as an octant character.
  const Image = e.surface === 'terminal' && pixelTerm ? $.ui.resolve(e).Image : undefined
  const DOT_PX = 4
  // face: a cat or dog sprite, whose eyes and nose the block drawing keeps whole
  const dots = (grid: readonly string[], pal: Record<string, string>, alt: string, rows = grid.length, face = false) =>
    Svg
      ? <Box flexDirection="column" height={4} justifyContent="flex-end"><Svg source={dotSvg(grid, pal, rows)} alt={alt} width={(grid[0]?.length ?? 0) * DOT_PX} height={rows * DOT_PX} /></Box>
      : Image
        ? <Image source={dotRgba(grid, pal, rows, IMG_SCALE)} columns={Math.ceil((grid[0]?.length ?? 0) / 2)} rows={Math.ceil(Math.max(rows, grid.length) / 4)} alt={alt} />
        : dotRows(grid, pal, blockArt, face && blockArt ? faceKeep(grid, sprite('work', 0, eff.character), eff.character === 'dog' ? { eyes: [11, 13], nose: 12 } : undefined) : undefined).map(dotLine)
  // One spot: a 9-cell path where the character stands (bobbing one cell while moving) + 6-cell prop + 2-cell gap (so the token row below doesn't touch the next step). Dots are octant characters, 2×4 pixels per cell. Only the recent spots that fit are shown; earlier ones are grouped behind a '◂ N' button.
  const SLOT_W = 17
  const MORE_W = 8 // Prev/next button cell: 'p: ◂ 12' fits on one row
  // The work path row is main alone; subagents sit side by side below it in small boxes, like the turn flow's subagent boxes.
  // Running subagents come first, then subagents that finished this turn, with boxes on up to two rows.
  const AGENT_W = 30
  const agentW = Math.min(AGENT_W, treeW) // narrower panels shrink the subagent boxes to fit
  const agentPer = Math.max(1, Math.floor((treeW + 1) / (AGENT_W + 1)))
  const crewAgents = visibleAgents(t.agents.filter(a => (a.status !== 'done' && a.status !== 'failed') || (a.endedAt ?? 0) >= t.turn.startedAt), agentPer * 2)
  const liveStep = [...t.flow].reverse().find(i => i.kind === 'step' && i.endedAt === undefined)
  // A past turn picked in the session map is replayed on main's row from its archive (archives keep no subagent records, so no subagent boxes).
  const crew = snap ? [
    { l: { ...t.main, status: 'idle' as const }, key: 'main', name: 'main', body: C.main, look: LOOK('#93c5fd'), say: snap.prompt,
      path: stations(snap.flow, { status: 'idle', startedAt: snap.startedAt, lastAt: undefined }) },
  ] : [
    // main returns to idle when the turn ends, so if the previous turn failed, draw the failure pose.
    { l: headState(t) === 'failed' ? { ...t.main, status: 'failed' as const } : t.main, key: 'main', name: 'main', body: C.main, look: LOOK('#93c5fd'),
      say: t.main.status === 'thinking' ? liveStep?.intent ?? '' : t.main.status === 'tool' ? t.main.activity : t.turn.running ? '' : 'Waiting for the next request',
      path: stations(t.flow, t.main) },
    ...crewAgents.shown.map((a, i) => ({ l: a, key: a.id, name: a.type, body: CREW[i % CREW.length]!, look: LOOK(CREW[i % CREW.length]!),
      say: a.status === 'tool' ? a.activity : a.desc, path: stations(t.flow, a, a.id) })),
  ]
  const rpFrom = snap ? await read($, replayFrom) : 0
  // main's mood (state.ts petMood): context and the 5h limit belong to the live session, so a replay keeps only that turn's cost (the $ marks).
  const mood = petMood({ ctxPct: snap ? 0 : ctxPct, ctxAlert: eff.ctxAlertPercent, cost: turnCost, costAlert: eff.turnCostAlertUsd, limitPct: snap ? undefined : limits.find(l => l.key === 'five_hour')?.pct })
  const lastCompact = [...t.log].reverse().find(l => l.kind === 'compact' && !l.agentId)
  const shake = !snap && !!lastCompact && now - lastCompact.at < 3000
  // Advice bubble over main's head, on every other frame (the frames in between keep the z's, dots, and calls): ! for a warning, ? for a tip
  const bubble = snap || tips.length === 0 ? undefined : tips.some(a => a.level === 'warn') ? { g: '!', c: C.tool } : { g: '?', c: '#8ab4f8' }
  // Turn cost: the mark over the back (cost color, red and bold past the alert) and the turn's total next to main's status
  const costOver = mood.cost === 3
  const costText = (turnCost ?? 0) < 0.005 ? '' : `$${turnCost!.toFixed(2)} this turn`
  const working = crew.filter(c => c.l.status === 'thinking' || c.l.status === 'tool').length
  const STATE_C = { run: C.tool, ok: C.dim, fail: C.fail }
  // Monitor props (terminal, code editor, skill, other tools) blur screen and text when painted gray, so finished ones show a green check on a dark screen.
  const MONITOR = new Set(['b', 'e', 'k', 'o'])
  // Finished spots paint their prop gray to set them apart from the spot being worked (keeping only brightness, darker).
  const GREY: Record<string, string> = Object.fromEntries(Object.entries(DOT).map(([k, v]) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16))
    const y = Math.round((0.3 * r! + 0.59 * g! + 0.11 * b!) * 0.45 + 30).toString(16).padStart(2, '0')
    return [k, `#${y}${y}${y}`]
  }))
  // Like a side-scrolling game (Chrome's dino game), ground lies under the character, and while the row works its bumps flow left to feel like running.
  // x0 is the cell where this piece starts within the row, so the pattern continues even when each spot is drawn separately.
  const GROUND = '#6b7280'
  const ground = (x0: number, w: number, off: number) =>
    Array.from({ length: w }, (_, i) => { const x = x0 + i + off; return x % 17 === 0 ? '▀' : x % 11 === 5 ? '▄' : '▔' }).join('')
  // One row of ground. On desktop block characters don't fill cells, so the same pattern is converted to 2 × 4 pixels per cell (▔ top row, ▀ top half, ▄ bottom half) and drawn as Svg.
  const groundLine = (x0: number, w: number, off: number) => {
    const s = ground(x0, w, off)
    if (!Svg) return <Text color={GROUND}>{s}</Text>
    const grid = [0, 1, 2, 3].map(y => Array.from(s, ch => ((ch === '▄' ? y >= 2 : ch === '▀' ? y < 2 : y === 0) ? 'OO' : '..')).join(''))
    return <Box width={w} height={1} flexShrink={0} overflow="hidden"><Svg source={dotSvg(grid, { O: GROUND })} alt="ground" width={w * 2 * DOT_PX} height={4 * DOT_PX} /></Box>
  }
  // Spot token row: ↑new input ↓output cost (spots are narrow, so written short like $.18). Cache reads are left out for space (see the turn flow and session map). Model request spots show that request's values,
  // the answer spot this turn's total, and a subagent work spot that agent's running total. Spots without values keep a blank row to match heights.
  const liveSteps = t.flow.filter(i => i.kind === 'step')
  const sum = (k: 'tokIn' | 'tokCache' | 'tokOut') => liveSteps.reduce((a, i) => a + (i[k] ?? 0), 0)
  const liveTurnCost = t.turns[t.turns.length - 1]?.cost
  const tokOf = (st: Station, l: Loop): { i: number; c: number; o: number; cost?: number } | undefined => {
    if (st.node?.kind === 'step') return st.node.tokIn === undefined && st.node.tokOut === undefined ? undefined : { i: st.node.tokIn ?? 0, c: st.node.tokCache ?? 0, o: st.node.tokOut ?? 0, cost: st.node.cost }
    if (st.node?.kind === 'answer') return { i: sum('tokIn'), c: sum('tokCache'), o: sum('tokOut'), cost: liveTurnCost }
    if (st.id.startsWith('work:')) return { i: l.inTok, c: l.cacheTok, o: l.outTok }
    return undefined
  }
  const tokLine = (st: Station, l: Loop) => {
    const v = tokOf(st, l)
    if (!v) return <Text key="tk"> </Text>
    return (
      <Text key="tk" wrap="truncate"><Text color={TOK.input}>↑{fmtTok(v.i)}</Text> <Text color={TOK.output}>↓{fmtTok(v.o)}</Text>{v.cost !== undefined ? <Text color={TOK.cost}> {v.cost < 0.01 ? '<$.01' : v.cost < 1 ? `$${v.cost.toFixed(2).slice(1)}` : `$${v.cost.toFixed(1)}`}</Text> : null}</Text>
    )
  }
  // Group the branches under a spot by tool name (in order of first appearance). Subagent calls are grouped by type name.
  const kidGroups = (kids: readonly FlowItem[]) => {
    const groups: { key: string; cls: string; text: string; n: number; state: 'run' | 'ok' | 'fail' }[] = []
    for (const k of kids) {
      const name = k.label.split(' ')[0] ?? ''
      const cls = k.kind === 'agent' ? 'a' : toolClass(name)
      const key = `${k.kind}:${name}`
      let g = groups.find(x => x.key === key)
      if (!g) { g = { key, cls, text: name, n: 0, state: 'ok' }; groups.push(g) }
      g.n++
      if (k.endedAt === undefined) g.state = 'run'
      else if (!k.ok && g.state !== 'run') g.state = 'fail'
    }
    return groups.map(g => ({ ...g, text: g.n > 1 ? `${g.text}×${g.n}` : g.text }))
  }
  // Row layout: the recent spots that fit in the width, and the spot where the character stands (the last running spot, else the last spot).
  // Spots hidden before or after are grouped behind '◂ N' and 'N ▸' buttons; clicking moves to those spots (same as the turn flow's p, n navigation).
  // While viewing past spots (paged), the character is hidden (here -1) and every spot gets a flag.
  const qe = await read($, questPage)
  const laneGeo = (c: (typeof crew)[number], at?: number) => {
    const total = c.path.length
    // A replay keeps the spot the pet is on in view: the spots that fit, extended to it
    // (room for both page buttons, so the pet's spot is never folded behind '◂ N')
    const end = at !== undefined ? Math.min(total, Math.max(at + 1, Math.floor((treeW - 2 * MORE_W) / SLOT_W))) : qe < 0 ? total : Math.max(1, Math.min(qe, total))
    const laterSt = total - end
    const room = Math.max(1, Math.floor((treeW - MORE_W - (laterSt > 0 ? MORE_W : 0)) / SLOT_W))
    const hiddenSt = Math.max(0, end - room)
    const shownSt = c.path.slice(hiddenSt, end)
    const busyAt = shownSt.map(st => st.state === 'run').lastIndexOf(true)
    const here = at !== undefined ? at - hiddenSt : laterSt > 0 ? -1 : busyAt >= 0 ? busyAt : shownSt.length - 1
    return { hiddenSt, laterSt, shownSt, here, prev: () => quiet(update($, questPage, () => Math.max(1, hiddenSt))), next: () => quiet(update($, questPage, () => (end + room >= total ? -1 : end + room))) }
  }
  // While idle after the turn (not busy), the waiting pose is drawn dozing, with z's floating above the head on the right in turn.
  // A short wait within the turn (between steps) stays in the thinking pose.
  const doze = (p: Pose): Pose => (p === 'think' && !busy ? 'sleep' : p)
  const zzz = (frame: number) => (
    <Box position="absolute" top={0} left={7}><Text color={C.dim}>{frame % 2 ? ' Z' : 'z '}</Text></Box>
  )
  // Thinking: dots grow . .. ... to the right of the head, past the ears. max keeps them off the subagent box's name column.
  const ponder = (frame: number, max = 3) => (
    <Box position="absolute" top={0} left={8}><Text color={C.dim}>{'.'.repeat((frame % max) + 1)}</Text></Box>
  )
  // Working: the pet calls out in the same place on the frame where its tongue is out. Left out of subagent boxes, where the name column starts right there.
  const sound = { cat: 'meow', dog: 'woof' }[characterOf(eff.character)]
  const call = (frame: number) => frame % 2 === 1 && (
    <Box position="absolute" top={0} left={8}><Text color={C.tool}>{sound}</Text></Box>
  )
  const lane = (c: (typeof crew)[number]) => {
    const d = deskOf(c.l)
    // Frames always advance with tick so thinking motion shows even while waiting (it rises once a second while idle).
    const frame = n
    const rp = snap ? replayAt(c.path, now - rpFrom) : undefined
    const tone = d.pose === 'fail' ? C.fail : d.pose === 'work' ? C.tool : d.pose === 'run' ? C.main : C.dim
    const { hiddenSt, laterSt, shownSt, here, prev, next } = laneGeo(c, rp?.at)
    // If it just moved to the next spot (within 1s), draw the walking pose.
    const walking = c.path.length > 1 && busy && here >= 0 && now - shownSt[here]!.startedAt < 1000
    const moving = rp ? rp.pose === 'run' : walking || d.pose === 'run'
    const pose: Pose = rp ? rp.pose : shake && d.pose !== 'sleep' ? 'think' : moving ? 'run' : doze(d.pose)
    const pal = { ...DOT, ...c.look, ...(pose === 'fail' ? LOOK(C.fail) : {}) }
    // Heavy (context past its alert): every motion runs at half pace. One step value drives the sprite, its bob, and the ground so they stay in step.
    const gait = mood.heavy && !rp ? Math.floor(frame / 2) : frame
    const art = overlay(sprite(pose, gait, eff.character), petPixels(eff.character, pose, gait, mood, shake))
    const fig = dots(art, pal, d.what, undefined, true)
    // In a replay, the spots ahead of the pet are not reached yet: no flag, prop in color
    const isPast = (j: number, st: Station) => j !== here && st.state !== 'run' && !(rp && j > here)
    // The ground flows while working (or walking in a replay) and stops when idle.
    const off = (rp ? moving : busy && (c.l.status === 'thinking' || c.l.status === 'tool')) ? gait : 0
    const lead = hiddenSt > 0 ? MORE_W : 0
    const trail = laterSt > 0 ? MORE_W : 0
    const roadW = Math.max(0, treeW - lead - trail - shownSt.length * SLOT_W)
    const pageBtn = (key: string, hotkey: string, label: string, onPress: () => void, extra: object = {}) => (
      <Box width={MORE_W} flexShrink={0} {...extra}><Button key={key} hover={hovKey(key)} plain dimColor hotkey={hotkey} label={label} onPress={onPress} /></Box>
    )
    const sayBelow: JSX.Element[] = []
    const propOf = (st: Station, past: boolean) => ({
      grid: prop(past && MONITOR.has(st.prop) ? 'done' : st.prop, st.state === 'run' && busy ? frame : 0),
      pal: past && !MONITOR.has(st.prop) ? GREY : { ...DOT, L: '#4ade80' },
    })
    // Desktop: the spots' art (character or flag, prop) and ground are drawn as one SVG. Drawn separately, cells and rows are sized by text
    // and the images' heights and bottoms misalign. One cell = 2 pixels wide, one row = 4 pixels tall (DOT_PX per pixel); art is 16 pixels + 4 pixels of ground.
    const strip = (() => {
      if (!Svg) return null
      const cells = treeW - lead - trail
      const layers: { grid: readonly string[]; pal: Record<string, string>; x: number; y: number }[] = []
      let extra = ''
      shownSt.forEach((st, j) => {
        const x0 = j * SLOT_W * 2
        const past = isPast(j, st)
        if (j === here) {
          const fx = x0 + (moving ? (gait % 2) * 2 : 0)
          layers.push({ grid: art, pal, x: fx, y: 0 })
          const cm = mood.cost > 0 ? costMark(mood.cost, frame) : undefined
          if (cm?.text) {
            extra += `<text x="${fx + cm.at * 2}" y="3" font-family="ui-monospace, monospace" font-size="3" font-weight="${costOver ? 'bold' : 'normal'}" fill="${costOver ? C.fail : C.tool}" letter-spacing="0.2">${cm.text}</text>`
          }
          if (bubble && frame % 2 === 0) extra += `<rect x="${fx + 16}" y="0" width="4" height="4" rx="1" fill="${bubble.c}"/><text x="${fx + 18}" y="3.2" text-anchor="middle" font-family="ui-monospace, monospace" font-size="3.4" font-weight="bold" fill="#0b1020">${bubble.g}</text>`
          else {
          if (pose === 'sleep') extra += `<text x="${fx + 14 + (frame % 2) * 2}" y="3" font-family="ui-monospace, monospace" font-size="3" fill="${C.dim}">${frame % 2 ? 'Z' : 'z'}</text>`
          if (pose === 'think') extra += `<text x="${fx + 16}" y="3" font-family="ui-monospace, monospace" font-size="3" fill="${C.dim}">${'.'.repeat((frame % 3) + 1)}</text>`
          if (pose === 'work' && frame % 2 === 1) extra += `<text x="${fx + 16}" y="3" font-family="ui-monospace, monospace" font-size="3" fill="${C.tool}">${sound}</text>`
          }
        } else if (past) {
          const ok = st.state === 'ok'
          const mark = (/^step (\d+)/.exec(st.label)?.[1] ?? (ok ? '✓' : '✗')).slice(-3)
          extra += `<g transform="translate(${x0} 0) scale(0.25)">${flagShapes(mark, ok ? '#22c55e' : C.fail, POLE)}</g>`
        }
        const pp = propOf(st, past)
        layers.push({ grid: pp.grid, pal: pp.pal, x: x0 + 18, y: 16 - pp.grid.length })
      })
      const g = ground(lead, cells, off)
      layers.push({ grid: [0, 1, 2, 3].map(y => Array.from(g, ch => ((ch === '▄' ? y >= 2 : ch === '▀' ? y < 2 : y === 0) ? 'OO' : '..')).join('')), pal: { O: GROUND }, x: 0, y: 16 })
      return (
        <Box width={cells} height={5} flexShrink={0} flexDirection="column" justifyContent="flex-end" overflow="hidden">
          <Svg source={dotScene(cells * 2, 20, layers, extra)} alt={`${c.name} ${d.what}`} width={cells * 2 * DOT_PX} height={20 * DOT_PX} />
        </Box>
      )
    })()
    return (
      <Box key={`lane-${c.key}`} flexDirection="column">
        <Box>
          <Box flexShrink={0}><Text bold color={c.body}>{c.name}</Text><Text color={tone}> {c.l.status === 'thinking' || c.l.status === 'tool' ? `${spin} ` : ''}{d.what}</Text></Box>
          {/* The cost gives way only after the quote (tiny shrink factor, like the header logo) */}
          {costText && <Box flexShrink={0.001} minWidth={0} overflow="hidden" marginLeft={2}><Text wrap="truncate" bold={costOver} color={costOver ? C.fail : TOK.cost}>{costText}</Text></Box>}
          <Box flexShrink={1} marginLeft={1}>{reveal(`lane-say-${c.key}`, <Text wrap="truncate" dimColor>{c.say ? `“${c.say}”` : ' '}</Text>, c.say, 0, treeW, { sink: sayBelow, top: 1 })}</Box>
        </Box>
        {strip && (
          <Box>
            {hiddenSt > 0 && pageBtn('quest-prev', 'p', `◂ ${hiddenSt}`, prev, { height: 5, flexDirection: 'column', justifyContent: 'center' })}
            {strip}
            {laterSt > 0 && pageBtn('quest-next', 'n', `${laterSt} ▸`, next, { height: 5, flexDirection: 'column', justifyContent: 'center' })}
          </Box>
        )}
        <Box>
          {hiddenSt > 0 && (strip ? <Box width={MORE_W} flexShrink={0} /> : pageBtn('quest-prev', 'p', `◂ ${hiddenSt}`, prev, { marginTop: 1 }))}
          {shownSt.map((st, j) => {
            const past = isPast(j, st)
            return (
              <Box key={`st-${st.id}`} flexDirection="column" width={SLOT_W} flexShrink={0}>
                {!strip && <Box>
                  {/* Path: the character stands at the current spot; finished spots get a finish flag (an X flag on failure). */}
                  <Box flexDirection="column" width={9} flexShrink={0}>
                    {j === here ? <Box flexDirection="column" marginLeft={moving ? gait % 2 : 0}>{fig}</Box> : past ? smallFlag(st) : null}
                  </Box>
                  {(() => {
                    // Props differ in height (monitor 2 rows, others 3), so they're pinned to the bottom of the scene (right above the ground).
                    const { grid, pal: ppal } = propOf(st, past)
                    return <Box flexDirection="column" width={6} flexShrink={0} marginTop={Image ? 0 : 4 - Math.ceil(grid.length / 4)}>{dots(grid, ppal, st.label, 16)}</Box>
                  })()}
                </Box>}
                {/* z's, thinking dots, and calls sit on the spot (17 cells) rather than the 9-cell path, which would clip them right of the character */}
                {!strip && j === here && (bubble && frame % 2 === 0
                  ? <Box position="absolute" top={0} left={8}><Text bold color="#0b1020" backgroundColor={bubble.c}> {bubble.g} </Text></Box>
                  : pose === 'sleep' ? zzz(frame) : pose === 'think' ? ponder(frame) : pose === 'work' && call(frame))}
                {!strip && j === here && mood.cost > 0 && (() => {
                  const m = costMark(mood.cost, frame)
                  return m.text && <Box position="absolute" top={0} left={m.at + (moving ? gait % 2 : 0)}><Text bold={costOver} color={costOver ? C.fail : TOK.cost}>{m.text}</Text></Box>
                })()}
                {!strip && groundLine(lead + j * SLOT_W, SLOT_W, off)}
                {/* Spot name row: like the turn flow, an arrow pointing to the next spot is appended. If the next spot is in progress, a dot flows along it. */}
                <Box>
                  <Box flexGrow={1} flexShrink={1} overflow="hidden">
                    <Text wrap="truncate" bold={j === here} dimColor={past && st.state === 'ok'} color={j === here && st.state !== 'fail' ? c.body : STATE_C[st.state]}>
                      {st.state === 'run' ? spin : st.state === 'ok' ? '✓' : '✗'} {st.label}
                    </Text>
                  </Box>
                  {j < shownSt.length - 1 && (
                    <Box flexShrink={0} marginLeft={1}>
                      <Text color={shownSt[j + 1]!.state === 'run' ? C.tool : C.dim}>{arrowFrame(n, shownSt[j + 1]!.state === 'run' && busy)}</Text>
                    </Box>
                  )}
                </Box>
                {/* Token rows and branches are drawn 3 cells narrower than the spot, leaving the space under the name row's arrow empty as a border with the next step. */}
                <Box width={SLOT_W - 3} flexDirection="column" overflow="hidden">
                {tokLine(st, c.l)}
                {/* Branches: same tools are grouped into one or two rows like '■ Bash×2 ⑂ Explore'. Glyphs and colors follow the session map's tool classes,
                    running groups show the progress glyph, and groups with a failure are red. */}
                {st.kids.length > 0 && (
                  <Box height={Math.min(2, Math.ceil(kidGroups(st.kids).reduce((w, g) => w + displayWidth(g.text) + 3, 1) / (SLOT_W - 3)))} overflow="hidden">
                    <Text wrap="wrap">
                      <Text dimColor>└</Text>
                      {kidGroups(st.kids).map((g, gi) => (
                        <Text key={`kg-${gi}`} dimColor={past && g.state === 'ok'} color={g.state === 'fail' ? C.fail : g.state === 'run' ? C.tool : undefined}>
                          {gi ? ' ' : ''}{g.state === 'run' ? spin : ''}<Text color={g.state === 'fail' ? C.fail : MARK[g.cls]?.c}>{MARK[g.cls]?.g ?? '■'}</Text> {g.text}
                        </Text>
                      ))}
                    </Text>
                  </Box>
                )}
                </Box>
              </Box>
            )
          })}
          {roadW > 0 && !strip && (
            <Box key="road" flexDirection="column" width={roadW} flexShrink={0}>
              <Box height={4} />
              {groundLine(lead + shownSt.length * SLOT_W, roadW, off)}
            </Box>
          )}
          {laterSt > 0 && !strip && pageBtn('quest-next', 'n', `${laterSt} ▸`, next, { marginTop: 1 })}
        </Box>
        {sayBelow}
      </Box>
    )
  }
  // Subagent box: one character and 4 status rows (name and status, current work, tool count and tokens, recent tools). Ground lies under its feet.
  // While moving (model request) it alternates pincers and feet, bobbing one cell; while running tools it moves its pincers; when done it stands and rests.
  const agentBox = (c: (typeof crew)[number]) => {
    const d = deskOf(c.l)
    const pal = { ...DOT, ...c.look, ...(d.pose === 'fail' ? LOOK(C.fail) : {}) }
    // For 2 seconds after it finishes, the subagent runs back to main (run pose, '↩ main') before it rests.
    const back = c.l.status === 'done' && now - (c.l.endedAt ?? 0) < 2000
    const moving = back || d.pose === 'run'
    const live = c.l.status === 'thinking' || c.l.status === 'tool'
    const tone = d.pose === 'fail' ? C.fail : d.pose === 'work' ? C.tool : moving ? C.main : C.dim
    const tools = t.flow.filter(i => i.agentId === c.key && i.kind === 'tool')
    const recent = tools.slice(-3).map(i => i.label.split(' ')[0]).join(' › ')
    const off = busy && live ? n : 0
    return (
      <Box key={`agent-${c.key}`} flexDirection="column" width={agentW} flexShrink={0}>
        <Box>
          <Box flexDirection="column" width={9} flexShrink={0}>
            <Box flexDirection="column" marginLeft={moving ? n % 2 : 0}>{dots(sprite(back ? 'run' : doze(d.pose), n, eff.character), pal, d.what, undefined, true)}</Box>
          </Box>
          {!back && doze(d.pose) === 'sleep' && zzz(n)}{doze(d.pose) === 'think' && ponder(n, 2)}
          <Box flexDirection="column" width={Math.max(1, agentW - 10)} flexShrink={0} marginLeft={1}>
            <Text wrap="truncate"><Text bold color={c.body}>{c.name}</Text><Text color={tone}> {live ? `${spin} ` : ''}{back ? '↩ main' : d.what}</Text></Text>
            {reveal(`agent-say-${c.key}`, <Text wrap="truncate" dimColor>{c.say || ' '}</Text>, c.say, 0, Math.max(1, agentW - 10))}
            <Text wrap="truncate" dimColor>{c.l.tools} tools · <Text color={TOK.input}>↑{fmtTok(c.l.inTok)}</Text> <Text color={TOK.output}>↓{fmtTok(c.l.outTok)}</Text></Text>
            <Text wrap="truncate" dimColor>{recent || ' '}</Text>
          </Box>
        </Box>
        {groundLine(0, agentW, off)}
      </Box>
    )
  }
  const questAgentRows: (typeof crew)[] = []
  for (let i = 1; i < crew.length; i += agentPer) questAgentRows.push(crew.slice(i, i + agentPer))
  // Sky: pixel clouds flow left while working, with a scoreboard on the right edge like the dino game.
  // HI is the session-wide tool call count; next to it is this turn's tool call count.
  const pad5 = (v: number) => String(Math.min(99999, v)).padStart(5, '0')
  const score = `HI ${pad5(t.main.tools + t.agents.reduce((a, b) => a + b.tools, 0))} ${pad5(t.flow.filter(i => i.kind === 'tool').length)}`
  const skyW = Math.max(0, treeW - score.length - 1)
  // Each cloud picks one of 5 kinds of different size and shape, with a different gap per cloud. The pick is derived from the cloud number,
  // so redraws don't change shapes (the same cloud keeps the same shape while flowing).
  const CLOUDS = [
    ['..OOOO....', '.OOOOOOO..', 'OOOOOOOOOO', '..........'],
    ['...OO...', '.OOOOOO.', 'OOOOOOOO', '........'],
    ['....OOO.....', '.OOOOOOOOO..', 'OOOOOOOOOOOO', '.OOOOOOOO...'],
    ['.OO...', 'OOOOO.', 'OOOOOO', '......'],
    ['..OO...OOO....', '.OOOOOOOOOOO..', 'OOOOOOOOOOOOOO', '..............'],
  ]
  // The sky is pixel art of skyW cells (2 pixels each) × 4 pixels. Clouds sit on cell boundaries (even pixels), so the terminal gets the same characters as before.
  const skyPx = Array.from({ length: 4 }, () => Array.from({ length: skyW * 2 }, () => '.'))
  const drift = Math.floor(n / 2)
  const span = skyW + 16
  for (let i = 0, base = 4; base < span; i++, base += 18 + ((i * 37) % 13)) {
    const cloud = CLOUDS[(i * 7 + 3) % CLOUDS.length]!
    const x = (((base - drift) % span) + span) % span - 8
    cloud.forEach((r, y) => Array.from(r).forEach((ch, k) => { const px = x * 2 + k; if (px >= 0 && px < skyW * 2) skyPx[y]![px] = ch }))
  }
  // The 5h usage limit colors the sky (state.ts petMood): from 60% a dusk with a setting sun, from 90% a night with a moon and stars.
  // The terminal fills empty pixels with the sky color, which reads as a dark sky on a dark terminal. Desktop leaves them empty: its translucent fill
  // showed as a pale block behind the clouds. The sun or moon sits left of the scoreboard.
  if (mood.sky !== 'day' && skyW >= 6) {
    if (!desk) for (const r of skyPx) for (let x = 0; x < r.length; x++) if (r[x] === '.') r[x] = 'K'
    const orb = mood.sky === 'dusk' ? ['.QQ.', 'QQQQ', 'QQQQ', '.QQ.'] : ['.MM.', 'MM..', 'MM..', '.MM.']
    const ox = skyW * 2 - 6
    orb.forEach((r, y) => Array.from(r).forEach((ch, k) => { if (ch !== '.') skyPx[y]![ox + k] = ch }))
    if (mood.sky === 'night') for (const [fx, y] of [[0.15, 0], [0.4, 2], [0.65, 1], [0.85, 3]] as const) { const x = Math.floor(skyW * 2 * fx); if (skyPx[y]![x] === 'K' || skyPx[y]![x] === '.') skyPx[y]![x] = 'M' }
  }
  const skyGrid = skyPx.map(r => r.join(''))
  const SKY = { O: '#4b5563', K: mood.sky === 'night' ? tint('#121a3a', '#1e3a8a') : tint('#4a2c2a', '#f97316'), Q: '#f97316', M: '#e5e7eb' }
  // Desktop draws it as Svg like the characters (DOT_PX per pixel; what passes the cell width is clipped to keep the scoreboard's place)
  const sky = Svg
    ? <Box width={skyW} height={1} flexShrink={0} overflow="hidden"><Svg source={dotSvg(skyGrid, SKY)} alt="sky" width={skyW * 2 * DOT_PX} height={4 * DOT_PX} /></Box>
    : skyW ? dotLine(dotRows(skyGrid, SKY, blockArt)[0]!, 0) : <Text />
  const lastLog = t.log[t.log.length - 1]
  // View switch row: placed above the turn flow (flow chart) and walk view. It takes the old 1-row gap between sections, so sections below keep their positions.
  // A 'View' label on the left (left out under 34 columns), then a two-segment pill toggle: the selected side has a dark green background, the other a pale background with dim text. A dim line on the right doubles as the section edge.
  // The line is drawn longer than the remaining width and clipped. Desktop Text's truncate appends …, so it's held in a non-shrinking box clipped by the outer box.
  // Button takes no color, so the wrapping box is painted (same approach as the header buttons).
  const avatarOn = eff.view === 'avatar'
  const VIEW_ON = tint('#2f6f57', C.main)
  const VIEW_OFF = tint('#2a2f45', C.dim)
  const viewBar = (
    <Box key="view-bar">
      {cols >= 34 && <Box flexShrink={0} marginRight={1}><Text dimColor>View</Text></Box>}
      <Box flexShrink={0} backgroundColor={avatarOn ? VIEW_OFF : VIEW_ON}>
        <Button key="view-flow" hover={hov('view-flow')} plain dimColor={avatarOn} label={` ${avatarOn ? '○' : '●'} Turn flow `} onPress={avatarOn ? toggleView : () => {}} />
      </Box>
      <Box flexShrink={0} backgroundColor={avatarOn ? VIEW_ON : VIEW_OFF}>
        <Button key="view-office" hover={hov('view-office')} plain dimColor={!avatarOn} label={` ${avatarOn ? '●' : '○'} Walk `} onPress={avatarOn ? () => {} : toggleView} />
      </Box>
      <Box flexGrow={1} flexShrink={1} marginLeft={1} overflow="hidden">
        {desk ? <Box flexShrink={0}><Text color="#3b4261">{'─'.repeat(treeW)}</Text></Box> : <Text color="#3b4261" wrap="truncate">{'─'.repeat(treeW)}</Text>}
      </Box>
    </Box>
  )
  // Running card: like the turn flow, the full content (command, path) of the running tool shows in a bordered card that closes when the tool ends.
  // Each row draws its last running tool at the character's spot, overlaid right below the row. The terminal draws later elements on top, so
  // like the turn flow cards it's drawn at the very end of the panel, above the sections below (session map, session log). Vertical position is panel-relative:
  // walk box start (header 1 + top row or tab row + view row 1 + settings screen), then title and 2 sky rows inside it, then main row name 1, then the scene. Subagent box tools are shown as box text, with no card.
  const officeCards: JSX.Element[] = []
  // On desktop these go in walkCards (drawn as the walk box's last children), counted from the walk box top.
  const laneTop = viewOrigin + 2 + (f.flow ? 0 : tipLines)
  crew.slice(0, 1).forEach(c => {
    const g = laneGeo(c)
    const live = g.here < 0 ? undefined : g.shownSt[g.here]?.kids.filter(k => k.endedAt === undefined && k.kind === 'tool').at(-1)
    if (!live || f.flow) return
    // The card stays within the main row's scene (4 rows) and ground (1 row) so it doesn't cover the branches and subagent boxes below.
    // If the empty path right of the character is wide, it opens there; otherwise over the spots already passed on the left.
    const lead = g.hiddenSt > 0 ? MORE_W : 0
    const rightX = lead + (g.here + 1) * SLOT_W
    const rightW = treeW - rightX
    const leftW = lead + g.here * SLOT_W
    const [left, w] = rightW >= leftW ? [rightX, Math.min(72, rightW)] : [Math.max(0, leftW - Math.min(72, leftW)), Math.min(72, leftW)]
    if (w < 16) return
    // The command is split by line into up to two rows; overflow shortens the end of the second row with …. Clipping by box height would cut text mid-row
    // on desktop where row heights differ. Desktop fits the box height to the content.
    const cmd = wrapLines(`⚙ ${cardText(live.full ?? live.label)}`, w - 4)
    const shown = cmd.length > 2 ? [cmd[0]!, ellipsis(`${cmd[1]!}${cmd[2]!}`, w - 4)] : [...cmd, ...(cmd.length < 2 ? [' '] : [])]
    const sink = desk ? walkCards : officeCards
    sink.push(
      <Box key={`ocard-${live.id}`} position="absolute" top={laneTop + 1} left={left} width={w} {...(Svg ? {} : { height: 5, overflow: 'hidden' } as const)} flexDirection="column"
        borderStyle="round" borderColor={C.tool} backgroundColor={CARD_BG} paddingX={1}>
        {shown.map((ln, i) => <Text key={`oc-${i}`} color={C.tool} wrap="truncate">{ln}</Text>)}
        <Text color={CARD_DIM} wrap="truncate">{spin} running · {secs(now - live.startedAt)}</Text>
      </Box>,
    )
  })

  // Not built in the default view (redrawn every 0.5s while busy).
  const officeView = eff.view === 'avatar' && (
    <Box flexDirection="column" width={treeW}>
      {reveal('office-title', (
        <Box justifyContent="space-between">
          {/* Like the turn flow title: the prompt is left out when under 8 cells fit, and the working count on the right gives way before the title */}
          {section('flow', 'f', `TURN WALK${t.turn.prompt && treeW - 24 - 14 >= 8 ? `  "${ellipsis(t.turn.prompt, treeW - 24 - 14)}"` : ''}`, C.main)}
          {snap
            ? <Box flexShrink={1} minWidth={0} marginLeft={1}><Button key="walk-live" hover={hov('walk-live')} variant="primary" label={`T${viewNo} replay · latest ▸`} onPress={toLive} /></Box>
            : <Box flexShrink={1} minWidth={0} marginLeft={1}><Text color={working ? C.tool : C.dim} wrap="truncate">{working ? `${working} working` : 'all resting'}</Text></Box>}
        </Box>
      ), t.turn.prompt, 0, undefined, { sink: desk ? walkCards : officeCards, top: viewOrigin + 1 })}
      {!f.flow && tipRows(j => ({ sink: desk ? walkCards : officeCards, top: viewOrigin + j + 2 }))}
      {!f.flow && (
        <Box flexDirection="column">
          {Svg ? <Box>{sky}<Text dimColor> {score}</Text></Box> : <Text wrap="truncate">{sky} <Text dimColor>{score}</Text></Text>}
          {lane(crew[0]!)}
          {/* Divider between the main row and subagent boxes. On desktop glyphs are wider than cells and the line overflows, so the outer box clips it to one row. */}
          {questAgentRows.length > 0 && <Box overflow="hidden"><Box flexShrink={0}><Text color="#334155">{'┄'.repeat(treeW)}</Text></Box></Box>}
          {questAgentRows.map((r, i) => <Box key={`agentrow-${i}`} gap={1}>{r.map(agentBox)}</Box>)}
          {crewAgents.hidden > 0 && <Text dimColor>+{crewAgents.hidden} more working</Text>}
          {lastLog && reveal('office-last', (
            <Text wrap="truncate"><Text dimColor>just now </Text><Text color={lastLog.who === 'main' || lastLog.who === 'user' ? C.main : C.agent}>{lastLog.who}</Text><Text color={lastLog.ok ? KIND[lastLog.kind].color : C.fail}> {KIND[lastLog.kind].icon} </Text>{lastLog.text}</Text>
          ), lastLog.text)}
        </Box>
      )}
      {desk && walkCards}
    </Box>
  )

  const footNarrow = cols < 60
  // One footer row: a fixed-width dim name, then the items, wrapping one by one inside their own column. An item longer than the column is cut
  // to one row rather than wrapping inside itself. Narrow panels (footNarrow) use the short forms of the labels.
  const footRow = (key: string, label: string, items: JSX.Element[]) => (
    <Box key={key}>
      <Box width={FOOT_LABEL_W} flexShrink={0}><Text dimColor>{label}</Text></Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0} flexWrap="wrap" columnGap={2} rowGap={0}>
        {items.map(it => <Box key={(it as { key?: string | null }).key ?? undefined} flexShrink={1} minWidth={0} height={1} overflow="hidden">{it}</Box>)}
      </Box>
    </Box>
  )
  // Narrow terminal panels drop parts of the header in steps so the buttons always fit: the logo and summary (cut from the end), then only the 🐱 mark,
  // then the status chip and buttons right-aligned, then the buttons alone. The header is laid out at the panel's real width (headW): the rest of the panel uses at least
  // 24 cells, and a header that wide was cut at the right edge on narrower panels, hiding the close button.
  const hs = headState(t)
  const stateW = hs === 'idle' ? displayWidth('○ idle') : displayWidth(STATE_CHIP[hs][1]) + 2
  const rightW = stateW + 1 + HEAD_CHIP_W * 4
  const LOGO = ' 🐱 Goyangi '
  const LOGO_W = 9 // the emoji takes two cells
  const MARK_W = 4 // ' 🐱 '
  const headW = desk ? cols : Math.max(1, body - SCROLLBAR)
  const headMode = desk || headW >= 1 + rightW + LOGO_W ? 'full' : headW >= 1 + rightW + MARK_W ? 'mark' : headW >= rightW ? 'state' : 'buttons'
  const headLeft = headMode === 'full' || headMode === 'mark'
  const header = (
  <Box justifyContent={headLeft ? 'space-between' : 'flex-end'} backgroundColor={HEAD_BG} paddingX={desk ? 1 : 0} {...(desk ? { alignItems: 'center', marginBottom: 'sm' } as const : { width: headW, height: 1, overflow: 'hidden' } as const)}>
    {/* The left part's width is set outright in the terminal (header width less the right group and a 1-cell gap), not left to flex shrinking,
        so the status chip and buttons always land inside the header. */}
    {headMode === 'mark' && <Box key="head-mark" flexShrink={0}>{logoChip(false)}</Box>}
    {headMode === 'full' && <Box key="head-left" flexShrink={1} minWidth={0} overflow="hidden" {...(desk ? {} : { width: Math.max(0, headW - rightW - 1) })}>
      {/* Logo and title (LOGO): 🐱 + Goyangi, white text on a fixed blue chip whatever the theme.
          The logo shrinks too (cut at the edge), so on narrow panels the summary goes first, then the logo, and the status chip and buttons always stay. */}
      {/* Terminal layout won't shrink a box below its text's minimum width unless minWidth is 0, so both the logo and the summary set it.
          The logo's shrink factor is tiny, so the summary gives up its width first and the logo is cut only after the summary is gone. */}
      <Box flexShrink={desk ? 0 : 0.001} minWidth={0} overflow="hidden">{logoChip(true)}</Box>
      {/* Session summary: turns · model requests · tool calls (including subagents) · session total cost. Numbers bold, units dim. The version is in the settings screen. */}
      {/* Desktop nested Text ignores truncate and wraps per character when narrowed, so it's held in a non-shrinking box whose outer box (overflow hidden) clips the right. */}
      <Box key="head-summary" flexShrink={desk ? 0 : 1} {...(desk ? {} : { minWidth: 0, overflow: 'hidden' } as const)}>
      <Text wrap="truncate" color={HEAD_FG}>
        {' '}<Text bold color={M.turn}>T{t.turnTotal}</Text>
        <Text color={HEAD_FG} dimColor> · </Text><Text bold color={M.steps}>{t.main.steps + t.agents.reduce((a, b) => a + b.steps, 0)} steps</Text><Text color={HEAD_FG} dimColor> · </Text>
        <Text bold color={M.tools}>{t.main.tools + t.agents.reduce((a, b) => a + b.tools, 0)} tools</Text>
        {usage?.cost ? <Text><Text color={HEAD_FG} dimColor> · </Text><Text bold color={M.cost}>≈{usd(usage.cost.usd)}</Text></Text> : null}
        {ctxLevel(ctxPct) === 'warn' ? <Text> <Text bold color="inverseText" backgroundColor="error"> ⚠ ctx {ctxPct}% </Text></Text> : null}
      </Text>
      </Box>
    </Box>}
    {desk ? (
      // Desktop: the app's default buttons show icons only; names appear in hover cards (headTips). The status chip isn't overlaid
      // but placed before the buttons. Positioning by cell count like the terminal would overlap, since default button widths differ. Close is the same ✕ button (role dismiss makes the app draw the name 'Close' as text, changing its look).
      <Box flexShrink={0} marginLeft={2} gap="xs" alignItems="center">
        {stateChip(Text, headState(t), HEAD_FG)}
        <Box key="tip-box-move" hover={{ scope: scopeOf('tip-move') }}><Button key="move" hover={hov('move')} variant="secondary" label="⇵" onPress={movePanel} /></Box>
        <Box key="tip-box-settings" hover={{ scope: scopeOf('tip-settings') }}><Button key="settings" hover={hov('settings')} variant={sOpen ? 'primary' : 'secondary'} label="⚙" onPress={toggleSettings} /></Box>
        <Box key="tip-box-fold" hover={{ scope: scopeOf('tip-fold') }}><Button key="fold-all" hover={hov('fold-all')} variant="secondary" label="−" onPress={collapse} /></Box>
        <Box key="tip-box-close" hover={{ scope: scopeOf('tip-close') }}><Button key="close" hover={hov('close')} variant="secondary" label="✕" onPress={close} /></Box>
      </Box>
    ) : (
    /* Right group: the status chip and the buttons in the flow, never shrinking; the logo and session summary on the left take what's left and are cut first.
        Nothing is overlaid or positioned by computed cells, so the header adapts to any width. */
    <Box key="head-right" flexShrink={0} marginLeft={headLeft ? 1 : 0} gap={1}>
      {headMode !== 'buttons' && <Box key="head-state" flexShrink={0}>
      {stateChip(Text, hs, HEAD_FG)}
      </Box>}
    <Box flexShrink={0}>
      {/* Buttons are 3 cells each (icon with a space on either side) and sit side by side: the spaces are inside the button so the hover and click area is wider.
          The terminal icons are ASCII, which every monospace font centers in the cell and every layout counts as one cell: v / > (move down or right,
          where the panel will go), =, the hyphen -, and x. The minus sign − came from fallback fonts, and ✕ was counted two cells wide by the layout
          while the terminal drew one, so the red close chip spread one cell over the minimize button.
          Symbol glyphs (⇵ ⚙ ↕ ≡ −) come from fallback fonts and sat off-center. */}
      <Box>
        {/* The header background (text) matches the button's default text color, so the box around each button is painted a chip color to make the text visible (Button takes no color). */}
        {/* Each button gets a hover scope (tip-*), and the name cards (headTips) are drawn after the sections, since later elements cover earlier ones. */}
        {/* Position button: same action as the panel position in settings (toggles between the right split and above the prompt). */}
        <Box key="tip-box-move" width={HEAD_CHIP_W} flexShrink={0} hover={{ scope: scopeOf('tip-move') }} backgroundColor={HEAD_BG}><Button key="move" hover={hov('move')} plain label={moveIcon} onPress={movePanel}><Text color="inverseText">{moveIcon}</Text></Button></Box>
        {/* Move, settings, and minimize sit on the header background with inverted text (black on white in dark themes); a plain Button is drawn inverted under the pointer.
            Only close keeps its red chip. Settings turns blue while the settings screen is open. */}
        <Box key="tip-box-settings" width={HEAD_CHIP_W} flexShrink={0} hover={{ scope: scopeOf('tip-settings') }} backgroundColor={sOpen ? C.agent : HEAD_BG}><Button key="settings" hover={hov('settings')} plain label=" = " onPress={toggleSettings}><Text color="inverseText"> = </Text></Button></Box>
        <Box key="tip-box-fold" width={HEAD_CHIP_W} flexShrink={0} hover={{ scope: scopeOf('tip-fold') }} backgroundColor={HEAD_BG}><Button key="fold-all" hover={hov('fold-all')} plain label=" - " onPress={collapse}><Text color="inverseText"> - </Text></Button></Box>
        <Box key="tip-box-close" width={HEAD_CHIP_W} flexShrink={0} hover={{ scope: scopeOf('tip-close') }} backgroundColor="error"><Button key="close" hover={hov('close')} plain role="dismiss" label=" x " onPress={close}><Text hover={CLOSE_HOVER}> x </Text></Button></Box>
      </Box>
    </Box>
    </Box>
    )}
  </Box>
  )
  /* Open sessions: the other open sessions, with send (this session's handoff goes there) and pull (ask for theirs) */
  const peersBox = (
      <Box key="peers-box" flexDirection="column" borderStyle="round" borderColor={C.dim} paddingX={1} {...listBox}>
        <Box key="peer-title" justifyContent="space-between">
          <Box flexShrink={1} minWidth={0}><Text bold color={C.agent} wrap="truncate">OPEN SESSIONS · {others.length + (selfPeer ? 1 : 0)}</Text></Box>
          {tip('peer-refresh', <Button key="peer-refresh" hover={hov('peer-refresh')} plain dimColor label={REFRESH} onPress={() => quiet(refreshPeers($))} />, 'refresh', REFRESH)}
        </Box>
        {selfPeer && (
          <Box key="peer-self" justifyContent="space-between" gap={1}>
            <Box flexShrink={1} minWidth={0}>
              {rowIcon('Claude', 'self')}
              {peerLine(
                <Text wrap="truncate">{rowIcon('Claude', 'self') ? '' : <Text color={CLAUDE_MARK}>✳ </Text>}<Text color={C.main}>◉</Text><Text>{' '.repeat(numW + 2)}</Text><Text bold color={C.main}>{padTo(selfPeer.name, nameW)}</Text>{hostW > 0 && <Text color={C.server}> {padTo(hostTag(selfPeer.host), hostW)}</Text>} <Text dimColor>{peerCwd(selfPeer)}</Text></Text>,
                `✳ ◉ ${selfPeer.name} ${hostTag(selfPeer.host)} ${peerCwd(selfPeer)}`, listW - 4 - 13,
              )}
            </Box>
            <Box flexShrink={0}><Text color={C.main}>this session</Text></Box>
          </Box>
        )}
        {others.length === 0 && <Text dimColor wrap="truncate">No other Claude Code sessions or coding agents are open</Text>}
        {peerShown.length > 0 && (
          <Box key="peer-list">
            <Box flexDirection="column" flexGrow={1} minWidth={0}>
              {peerShown.map(p => (
                <Box key={`peer-${p.sessionId}`} justifyContent="space-between" gap={1}>
                  <Box flexShrink={1} minWidth={0}>
                    {isAgent(p) ? rowIcon(`agent:${p.kind}`, p.sessionId) : rowIcon('Claude', p.sessionId)}
                    <Text wrap="truncate">{!isAgent(p) && !rowIcon('Claude', p.sessionId) && <Text color={CLAUDE_MARK}>✳ </Text>}<Text dimColor>{String(p.num ?? '').padEnd(numW)} </Text><Text color={p.status === 'busy' ? (n % 2 ? C.dim : C.tool) : p.status === 'input' ? C.fail : C.dim}>{p.status === 'busy' ? '●' : p.status === 'input' ? '!' : '○'}</Text> {isAgent(p) && <Text color={C.agent}>{p.kind} </Text>}<Text bold>{padTo(p.name, nameW - kindLead(p))}</Text>{hostW > 0 && <Text color={C.server}> {padTo(hostTag(p.host), hostW)}</Text>} <Text dimColor>{isAgent(p) ? '' : p.cwd.replace(/^\/Users\/[^/]+/, '~')}</Text></Text>
                  </Box>
                  <Box flexShrink={0} gap={1}>
                    {tip(`peer-send-${p.sessionId}`, <Button key={`peer-send-${p.sessionId}`} hover={hov(`peer-send-${p.sessionId}`)} plain label={pairLists ? '↑' : '→ send'} onPress={() => quiet(sendHandoff($, p.sessionId, p.name))} />, 'send', pairLists ? '↑' : '→ send')}
                    {tip(`peer-pull-${p.sessionId}`, <Button key={`peer-pull-${p.sessionId}`} hover={hov(`peer-pull-${p.sessionId}`)} plain label={pairLists ? '↓' : '← pull'} onPress={() => quiet(askHandoff($, p))} />, 'pull', pairLists ? '↓' : '← pull', displayWidth(pairLists ? '↑' : '→ send') + 1)}
                  </Box>
                </Box>
              ))}
            </Box>
            {/* Past sessionRows, a scrollbar like the session map's (the wheel scrolls it too) */}
            {others.length > PEER_MAX && <Box flexShrink={0} marginLeft={1}>{barCol('peers', others.length, peerTop, peerShown.length)}</Box>}
          </Box>
        )}
        {/* Legend: what the marks and (side by side, arrow-only) buttons mean. The spacer keeps it on the box's last row
            when the box is taller than its rows (side by side, both boxes take the taller one's height). */}
        <Box key="peer-gap" flexGrow={1} />
        <Text dimColor wrap="truncate">{pairLists ? '↑ send · ↓ pull · ' : ''}● busy · ! waits for input · ○ idle · ◉ this session</Text>
      </Box>
  )
  /* Browser tabs: open tabs of the running browsers, numbered B1, C2 so the conversation can point at one */
  const tabsBox = (
      <Box key="tabs-box" flexDirection="column" borderStyle="round" borderColor={C.dim} paddingX={1} {...listBox}>
        <Box key="tab-title" justifyContent="space-between">
          <Box flexShrink={1} minWidth={0}><Text bold color={C.agent} wrap="truncate">{tabTitle}</Text></Box>
          {tip('tab-refresh', <Button key="tab-refresh" hover={hov('tab-refresh')} plain dimColor label={REFRESH} onPress={() => quiet(refreshTabs($))} />, 'refresh', REFRESH)}
        </Box>
        {tabShown.length === 0 && <Text dimColor wrap="truncate">No browser is running, or {REFRESH} hasn't read it yet</Text>}
        {tabShown.length > 0 && (
          <Box key="tab-list">
            <Box flexDirection="column" flexGrow={1} minWidth={0}>
              {tabShown.map((x, xi) => {
                // The title is cut here by display width: left to the terminal, a wide (Korean, CJK) character cut in half shifted the row's button by a cell.
                // Room = box inner width - scrollbar - icon - the 'B3 ● ' prefix (6) - gap - button; the site follows only when it fits whole.
                const site = x.url.replace(/^\w+:\/\/([^/]*).*$/, '$1')
                const room = listW - 4 - (tabOrder.length > TAB_MAX ? 2 : 0) - (rowIcon(x.app, x.id) ? 3 : 0) - 6 - 1 - (pairLists ? 1 : 7)
                const title = ellipsis(x.title, room)
                // Titles are padded to the widest shown, so the sites line up in a column
                const titleW = Math.max(...tabShown.map(y => displayWidth(ellipsis(y.title, room))))
                const showSite = titleW + 1 + displayWidth(site) <= room
                return (
                <Box key={`tab-${x.id}`} justifyContent="space-between" gap={1}>
                  <Box flexShrink={1} minWidth={0}>
                    {rowIcon(x.app, x.id)}
                    <Text wrap="truncate"><Text color={BROWSER_HUE[x.id[0]!] ?? C.dim}>{x.id[0]}</Text><Text dimColor>{x.id.slice(1).padEnd(2)}</Text> <Text color={x.active ? C.main : C.dim}>{x.active ? '●' : '○'}</Text> {showSite ? padTo(title, titleW) : title}{showSite && <Text dimColor> {site}</Text>}</Text>
                  </Box>
                  {tip(`tab-focus-${x.id}`, <Button key={`tab-focus-${x.id}`} hover={hov(`tab-focus-${x.id}`)} plain label={pairLists ? '⬈' : '⬈ focus'} onPress={() => quiet(focusTab($, x))} />, 'focus', pairLists ? '⬈' : '⬈ focus')}
                </Box>
                )
              })}
            </Box>
            {tabOrder.length > TAB_MAX && <Box flexShrink={0} marginLeft={1}>{barCol('tabs', tabOrder.length, tabTop, tabShown.length)}</Box>}
          </Box>
        )}
        <Box key="tab-gap" flexGrow={1} />
        <Text dimColor wrap="truncate">{pairLists ? '⬈ focus · ' : ''}● active tab · ○ other tab</Text>
      </Box>
  )
  const panel = (
    <Box flexDirection="column" width={cols}>
      {/* Header: background is the theme text color (text), text is the inverse color (inverseText). On a dark theme that's black text on white.
          Things told apart by color (live, warnings, buttons) are painted as background chips instead of text color. Theme colors are tuned for normal backgrounds,
          so as text color on the inverted header they have low contrast. inverseText on a chip background reads on both themes. */}
      {/* The header is fixed to one row. If width runs short, it doesn't wrap; the end of the session summary is cut. */}
      {/* On desktop the default buttons are taller than a row, so the height isn't fixed; it centers vertically and keeps a gap from the first box below. */}
      {stickTop > 0 ? <Box key="head-space" height={1} /> : header}
      {/* On desktop box borders are thin and boxes look stuck together, so a gap is added between boxes (instead of the session map's marginTop). */}
      <Box flexDirection="column" gap={e.surface === 'desktop' ? 'sm' : 0}>

      {sOpen && desk && settingsBox}
      {topRow}
      {viewBar}
      {e.surface === 'desktop'
        ? <Box flexDirection="column" borderStyle="round" borderColor={C.main} paddingX={1}>{eff.view === 'avatar' ? officeView : treeView}</Box>
        : eff.view === 'avatar' ? officeView : treeView}
      {/* Open sessions and Browser tabs: side by side on wide panels, stacked on narrow ones.
          The pair takes over the session map's top margin, so the row between the turn flow and these boxes stays and the map sits right under it. */}
      <Box key="lists" marginTop={desk ? 0 : 1} {...(pairLists ? { gap: 1 } : { flexDirection: 'column', ...(desk ? { gap: 'sm' } : {}) } as const)}>
      {peersBox}
      {tabsBox}
      </Box>
      {mapView}

      <Box flexDirection="column" borderStyle="single" borderColor={C.dim} paddingX={1}>
        <Box key="log-title-row" justifyContent="space-between" flexWrap="wrap" rowGap={0}>
          {/* On narrow panels the controls wrap to the next row as a whole, like the session map's.
              The title is the side that shrinks (cut at the box edge); the view toggle, live state, and scroll buttons on the right always stay inside the box. */}
          <Box key="log-title" flexShrink={1} minWidth={0} overflow="hidden">
          {section('log', 'l', fa ? `session log · focus ${fa.type}` : allLog ? `session log · all ${t.logTotal ? `${absFrom}–${absTo} / ${t.logTotal}` : 0}` : `session log · key events ${keyLog.length ? `${win.start + 1}–${win.end} / ` : ''}${keyLog.length}`, C.dim)}
          </Box>
          <Box flexShrink={1} minWidth={0} flexWrap="wrap" columnGap={2} rowGap={0}>
            <Button key="log-all" hover={hov('log-all')} plain dimColor label={allLog ? '◉ all · ○ key' : '○ all · ◉ key'} onPress={toggleLogAll} />
            <Text color={win.follow ? C.main : C.tool}>{win.follow ? '● live' : '⏸ paused'}</Text>
            <Box gap={desk ? 0 : 1} flexShrink={0}>
              <Button key="log-up" hover={hovKey('log-up')} plain hotkey="k" dimColor={win.start <= 0} onPress={logUp}>▲</Button>
              <Button key="log-down" hover={hovKey('log-down')} plain hotkey="j" dimColor={win.follow} onPress={logDown}>▼</Button>
            </Box>
          </Box>
        </Box>
        {!f.log && (
        <Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {logLines.length === 0 && <Text dimColor>{t.log.length ? 'No key events yet. Press ○ all to see the full log.' : 'Nothing recorded yet. Recording starts with the next prompt.'}</Text>}
        {logLines.map((l, i) => reveal(`log-${l.at}-${i}`, (
          <Box justifyContent="space-between">
            <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate">
              <Text dimColor>{new Date(l.at).toTimeString().slice(0, 8)} </Text>
              <Text color={l.who === 'main' || l.who === 'user' ? C.main : C.agent}>{fit(l.who, 10)}</Text>
              <Text color={l.ok ? KIND[l.kind].color : C.fail}> {KIND[l.kind].icon} </Text>
              {l.text}
            </Text>
            </Box>
            <Box flexShrink={1} minWidth={0} marginLeft={1}><Text dimColor wrap="truncate">{l.meta}</Text></Box>
          </Box>
        ), '', 2))}
        {Array.from({ length: logPad }, (_, i) => <Text key={`pad-${i}`}> </Text>)}
        {/* Cards are attached only when a row is cut. Text cells = list width (panel width - border and padding 4 - scrollbar 2) - time, name, icon 22 - right meta */}
        {logLines.map((l, i) => (displayWidth(l.text) > cols - 6 - 22 - 1 - displayWidth(l.meta)
          ? areaCard(`log-${l.at}-${i}`, l.text, i, logRows, cols - 6) : null))}
        </Box>
        <Box flexDirection="column" flexShrink={0} marginLeft={1}>
          {barCol('log', logSrc.length, win.from, logRows)}
        </Box>
        </Box>
        )}
      </Box>
      {/* Three footer rows, each a dim name column (Sections, Panel, Keys) and a content column. Content wraps item by item inside its own column,
          so wrapped items line up after the names instead of under them. Row 1: section fold/expand buttons. Row 2: panel buttons (minimize, switch view, close).
          Row 3: navigation shortcut hints with nothing to click (the keys are bound to buttons inside each section), each its own item. The plugin version is in the settings screen.
          Shortcut keys are bold in the theme text color (KEY_HI), visible on light and dark backgrounds. The 'c:', 'x:' before buttons are drawn by the engine.
          Gaps are horizontal only: a row gap would leave a blank row between wrapped lines. */}
      <Box flexDirection="column" backgroundColor={tint('subtle', C.dim)} paddingX={1}>
        {footRow('foot-sections', 'Sections', ([['side', 'a', 'advisor'], ['flow', 'f', 'turn flow'], ['agents', 's', 'subagents'], ['map', 'm', 'session map'], ['log', 'l', 'session log']] as const).map(([k, key, name]) => (
          <Button key={`hint-${k}`} hover={hov(`hint-${k}`)} plain dimColor={f[k]} label={`${key} ${name} ${f[k] ? '▸' : '▾'}`} onPress={toggle(k)} />
        )))}
        {footRow('foot-panel', 'Panel', [
          <Button key="hint-all" hover={hovKey('hint-all')} plain hotkey="c" label="Minimize" onPress={collapse} />,
          <Button key="hint-view" hover={hovKey('hint-view')} plain hotkey="v" label={eff.view === 'avatar' ? (footNarrow ? 'Turn flow' : 'Turn flow view') : (footNarrow ? 'Walk' : 'Walk view')} onPress={toggleView} />,
          // Dimming the whole button (dimColor) would also dim the engine-drawn 'x:', so it isn't dimmed.
          <Button key="hint-close" hover={hovKey('hint-close')} plain hotkey="x" label="Close" onPress={close} />,
        ])}
        {footRow('foot-keys', 'Keys', [
          ...(footNarrow ? [['p/n', 'step'], ['u/d', 'map'], ['k/j', 'log']] as const : [['p/n', 'move step'], ['u/d', 'scroll session map'], ['k/j', 'scroll session log']] as const).map(([keys, what]) => (
            <Text key={`nav-${keys}`}><Text bold color={KEY_HI}>{keys}</Text><Text dimColor> {what}</Text></Text>
          )),
        ])}
      </Box>
      </Box>
      {stickTop > 0 && <Box key="head-sticky" position="absolute" top={stickTop} left={0} width={cols} flexDirection="column">{header}</Box>}
      {/* Terminal settings screen: an overlay right under the header at the top of the visible window, wherever the panel is scrolled.
          It's painted with a background so the rows under it don't show through, and nothing below moves when it opens or closes. */}
      {sOpen && !desk && <Box key="settings-overlay" position="absolute" top={stickTop + 1} left={0} width={cols} flexDirection="column" backgroundColor={tint('#1e2030', C.server)}>{settingsBox}</Box>}
      {headTips}
      {eff.view === 'avatar' ? officeCards : overlays}
    </Box>
  )
  // Terminal: when the panel is taller than its window, a whole-panel scrollbar (scrollbar.tsx, the lists' bar) stays at the right edge in the
  // SCROLLBAR cells left free. Pressing or dragging it moves the panel there (ui.message 'pane', then ui.scroll). Desktop draws its own.
  const ui = $.ui.resolve(e)
  const Client = 'Client' in ui ? ui.Client : undefined
  const bodyRows = pp.scroll?.bodyRows ?? 0
  const paneTotal = !desk && e.component === 'Pane' && Client && bodyRows > 0 ? treeRows(panel) : 0
  if (!Client || paneTotal <= bodyRows) return panel
  const at = Math.max(0, pp.scroll?.offset ?? 0)
  return (
    <Box key="pane-wrap" width={cols + SCROLLBAR} flexDirection="column">
      {panel}
      <Box key="pane-sb-box" position="absolute" top={at} left={cols + SCROLLBAR - 1} width={1} height={bodyRows}>
        <Client key="pane-sb" module="./scrollbar.tsx" props={{ list: 'pane', total: paneTotal, from: at, rows: bodyRows, on: C.main, off: C.dim, held: C.tool, glyphs: true }} width={1} height={bodyRows} />
      </Box>
    </Box>
  )
}

// Settings actions shared by the panel and the minimized view. Changes apply immediately and persist to the next session (prefs).
const toggleSettingsOf = ($: EngineInterface) => quiet(update($, settingsOpen, v => !v))
// Changing the position closes the panel here and opens it there. Since a person pressed it, the engine draws the Pane regardless of width.
const movePanelOf = ($: EngineInterface, eff: Required<Prefs>) => quiet(closePane($).then(() => savePrefs($, { position: eff.position === 'bottom' ? 'right' : 'bottom' })).then(() => openPane($)))

// The settings screen, opened with = in the panel header (⚙ on desktop) or [=] in the minimized view.
// columns: how many columns the settings rows are laid out in (the minimized view uses more on wide terminals, to keep the screen short).
async function settingsScreen($: EngineInterface, e: RenderInput<'Pane' | 'AbovePrompt'>, columns = 1): Promise<JSX.Element> {
  const { Box, Text: RawText, Button: RawButton } = $.ui.resolve(e)
  const Text = inkText(inkMode(e), RawText)
  const Button = inkButton(inkMode(e), RawButton, Text)
  const eff: Required<Prefs> = { ...base, ...(await read($, prefs)) }
  const ch = characterOf(eff.character)
  const toggleSettings = () => toggleSettingsOf($)
  const setPref = (patch: Prefs) => () => quiet(savePrefs($, patch))
  const movePanel = () => movePanelOf($, eff)
  // The default position is right. If it was at the bottom, move it right.
  const resetPrefs = () => quiet(eff.position === base.position ? savePrefs($, {}, true) : closePane($).then(() => savePrefs($, {}, true)).then(() => openPane($)))
  const stepper = (key: 'ctxAlertPercent' | 'turnCostAlertUsd' | 'stallSeconds', step: number, max: number, show: (v: number) => string) => (
    <Box gap={1}>
      <Button key={`dec-${key}`} hover={hov(`dec-${key}`)} plain label="−" onPress={setPref({ [key]: Math.max(0, eff[key] - step) })} />
      <Text bold>{eff[key] === 0 ? 'off' : show(eff[key])}</Text>
      <Button key={`inc-${key}`} hover={hov(`inc-${key}`)} plain label="+" onPress={setPref({ [key]: Math.min(max, eff[key] + step) })} />
    </Box>
  )
  // Rows for a scrolling box: 1 to 10, no 'off'
  const rowStepper = (key: 'sessionRows' | 'tabRows') => (
    <Box gap={1}>
      <Button key={`dec-${key}`} hover={hov(`dec-${key}`)} plain label="−" onPress={setPref({ [key]: rowsOf(eff[key] - 1) })} />
      <Text bold>{rowsOf(eff[key])}</Text>
      <Button key={`inc-${key}`} hover={hov(`inc-${key}`)} plain label="+" onPress={setPref({ [key]: rowsOf(eff[key] + 1) })} />
    </Box>
  )
  // One settings row: the name gets up to 22 cells and is cut on narrow panels; the control beside it never shrinks, so its value stays on one row.
  const row = (label: string, control: JSX.Element) => (
    <Box key={`set-${label}`} gap={1}><Box width={22} flexShrink={1} minWidth={0}><Text wrap="truncate">{label}</Text></Box><Box flexShrink={0}>{control}</Box></Box>
  )
  const items = [
    row('Open on session start', (
        <Button key="set-autoOpen" hover={hov('set-autoOpen')} variant={eff.autoOpen ? 'primary' : undefined} label={eff.autoOpen ? 'On' : 'Off'} onPress={setPref({ autoOpen: !eff.autoOpen })} />
      )),
    row('Auto update', (
        <Button key="set-autoUpdate" hover={hov('set-autoUpdate')} variant={eff.autoUpdate ? 'primary' : undefined} label={eff.autoUpdate ? 'On' : 'Off'} onPress={setPref({ autoUpdate: !eff.autoUpdate })} />
      )),
    row('Character', (
      <Button key="set-character" hover={hov('set-character')} variant="primary" label={ch[0]!.toUpperCase() + ch.slice(1)} onPress={setPref({ character: CHARACTERS[(CHARACTERS.indexOf(ch) + 1) % CHARACTERS.length] })} />
    )),
    row('Fresh session', (
      <Button key="set-freshMode" hover={hov('set-freshMode')} variant={eff.freshMode === 'off' ? undefined : 'primary'} label={{ off: 'Off', ask: 'Ask (one click)', auto: 'Auto' }[eff.freshMode]} onPress={setPref({ freshMode: ({ off: 'ask', ask: 'auto', auto: 'off' } as const)[eff.freshMode] })} />
    )),
    row('Refresh icon', (
      <Button key="set-icon" hover={hov('set-icon')} variant={eff.icon === 'auto' ? undefined : 'primary'} label={{ auto: 'Auto', nerd: 'Nerd Font', unicode: `Unicode ${REFRESH_ICON.unicode}`, ascii: `ASCII ${REFRESH_ICON.ascii}` }[eff.icon]} onPress={setPref({ icon: ({ auto: 'nerd', nerd: 'unicode', unicode: 'ascii', ascii: 'auto' } as const)[eff.icon] })} />
    )),
    row('Panel position', (
        <Button key="set-position" hover={hov('set-position')} variant="primary" label={eff.position === 'bottom' ? 'Bottom (above prompt)' : 'Right'} onPress={movePanel} />
      )),
    row('Context alert', stepper('ctxAlertPercent', 10, 100, v => `${v}%`)),
    row('Turn cost alert', stepper('turnCostAlertUsd', 1, 50, v => `$${v}`)),
    row('Stall threshold', stepper('stallSeconds', 30, 600, v => `${v}s`)),
    row('Open sessions rows', rowStepper('sessionRows')),
    row('Browser tabs rows', rowStepper('tabRows')),
  ]
  // Rows go down each column in turn, columns side by side with equal widths (the site's width less the border and padding, and 3-cell gaps)
  const per = Math.ceil(items.length / columns)
  const colW = Math.floor((((e.props as { bodyColumns?: number }).bodyColumns ?? 80) - 4 - 3 * (columns - 1)) / columns)
  const grid = columns <= 1 ? items : (
    <Box key="settings-grid" columnGap={3}>
      {Array.from({ length: columns }, (_, c) => (
        <Box key={`settings-col-${c}`} flexDirection="column" width={colW} flexShrink={0}>{items.slice(c * per, (c + 1) * per)}</Box>
      ))}
    </Box>
  )
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={C.server} paddingX={1}>
      <Box justifyContent="space-between">
        {/* The plugin version sits beside the title (it used to take the end of the footer's Keys row) */}
        <Text bold color={C.server} wrap="truncate">⚙ Settings{version ? <Text dimColor bold={false}>  Goyangi v{version}</Text> : null}</Text>
        <Button key="settings-close" hover={hov('settings-close')} plain dimColor label="Close ▴" onPress={toggleSettings} />
      </Box>
      {grid}
      <Box justifyContent="space-between">
        <Text dimColor wrap="truncate">Changes apply immediately and persist to the next session. 0 means off</Text>
        <Box flexShrink={0} marginLeft={1}>
          <Button key="settings-reset" hover={hov('settings-reset')} plain dimColor label="Reset to defaults" onPress={resetPrefs} />
        </Box>
      </Box>
    </Box>
  )

}

// Status chip shared by the panel header and the minimized view: idle is dim text with no chip; the rest are bold on a background color per status.
// Text is the surface's element (from $.ui.resolve); idleColor is the idle text color where the background needs one (the header's inverted band).
const STATE_CHIP = { tool: ['claude', '⚙ tool'], thinking: ['suggestion', '◐ thinking'], live: ['success', '● live'], failed: ['error', '✗ idle'] } as const
const stateChip = (Text: ElementConstructor<TextProps>, hs: ReturnType<typeof headState>, idleColor?: string) => {
  if (hs === 'idle') return <Text color={idleColor} dimColor wrap="truncate">○ idle</Text>
  const [bg, label] = STATE_CHIP[hs]
  return <Text bold color="inverseText" backgroundColor={bg} wrap="truncate"> {label} </Text>
}

export const register: Register = (on, options) => {
  base = {
    autoOpen: options.autoOpen !== false,
    ctxAlertPercent: num(options.ctxAlertPercent, 80),
    turnCostAlertUsd: num(options.turnCostAlertUsd, 2),
    stallSeconds: num(options.stallSeconds, 120),
    position: 'right',
    autoUpdate: true,
    view: 'default',
    character: 'cat',
    sessionRows: rowsOf(options.sessionRows),
    tabRows: rowsOf(options.tabRows),
    freshMode: 'ask',
    icon: 'auto',
  }
  cur = { ...base }

  on('session.start', async ($, e, next) => {
    await decidePixelTerm($)
    await $.command.register({ name: 'goyangi', description: 'Open the Goyangi panel' })
    // A fresh session started by Goyangi: its first prompt points at the handoff note (a pending note older than 10 minutes is dropped)
    const pending = (e as { source?: string }).source === 'clear' ? await $.store.get('fresh').catch(() => undefined) as { file?: string; prev?: string; at?: number } | null | undefined : undefined
    if (pending) {
      await $.store.set('fresh', null)
      await update($, freshStage, () => '')
      if (pending.file && Date.now() - (pending.at ?? 0) < 600_000) {
        const text = `Continue the work from the previous session. Read the handoff note at ${pending.file} first, then carry on from its next step. The previous session is ${pending.prev} (claude --resume ${pending.prev} to look back at it).`
        await $.clock.after(300, () => quiet($.prompt.submit({ text })))
      }
    }
    await $.tool.register({
      name: 'browser_tabs',
      description: 'Open tabs of the running browsers (Chrome, Brave, Edge, Arc, Vivaldi, Chromium, ego lite, Safari, Firefox, and any other installed browser that scripts its tabs) in every window and profile, as the Goyangi Browser tabs box shows them. Each is numbered by its browser letter and a number it keeps for the rest of this session, while other tabs open, close or move: B1, B2 for Brave, C1 for Chrome (E Edge, A Arc, V Vivaldi, M Chromium, G ego lite, S Safari, F Firefox, W Whale; other browsers get the first free letter of their name). A tab named earlier keeps meaning that tab; a closed tab\'s number is not reused. Use it whenever the person mentions a browser tab, by number ("B3") or by what it is ("the GitHub PR tab", "깃헙 PR 탭 내용 알려줘"). For words, pass the words as they would appear in the tab\'s title or site (translate them: "깃헙" is "github"). action list: every tab with its title and site. read: the title and URL of the tab `tab` names. run: runs `js` in that same tab and returns the value of its last expression as text (document.body.innerText to read it, element.click() or setting values to change it); work in the person\'s tab this way instead of opening the URL in another browser tool. The result is synchronous: a Promise comes back empty, so start async work, then check with another run call. Results over 20,000 characters are cut, so select what you need. If the browser says JavaScript from Apple Events is off, tell the person to turn on View > Developer > Allow JavaScript from Apple Events in that browser (Safari: Develop > Developer Settings > Allow JavaScript from Apple Events). focus: bring it to the front in the person\'s browser, only when they ask for that. Firefox (F) tabs come from its session file, up to 15 seconds old: they can be listed, read and focused (by keys, needs Accessibility), but not run. Several matches come back as candidates: pick by number, or ask.',
      inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'read', 'focus', 'run'] }, tab: { type: 'string', description: 'A tab number like "B3", or words from its title or site like "github pull 12"' }, js: { type: 'string', description: 'For run: JavaScript to run in the tab; the last expression is returned as text' } }, required: ['action'] },
      isDeferred: false,
    }).catch(() => undefined)
    await $.tool.register({
      name: 'sessions',
      description: 'The other open Claude Code sessions and coding agents (Codex, OpenCode, Aider and others running in cmux terminals), numbered as the Goyangi Open sessions box shows them; a session keeps its number for the rest of this session while others open or close, and a closed one\'s number is not reused. Use it when the person points at a session by number ("send this to session 2", "pull from 1", "1번 세션에서 2번으로"). action list: the numbered sessions. send: this session\'s handoff note goes to session `to`. pull: session `from` is asked for its handoff, which comes here, or to session `to` when given. A coding agent gets the note as a file it is told to read, and its handoff is the last 200 lines of its terminal.',
      inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'send', 'pull'] }, to: { type: 'integer', minimum: 1 }, from: { type: 'integer', minimum: 1 } }, required: ['action'] },
      isDeferred: false,
    }).catch(() => undefined)
    // Move the dots only while running. Nothing is redrawn while idle.
    // Every 5 seconds, find stalled tools and subagents and notify once each.
    let ticks = 0
    let peerTicks = 0
    quiet(Promise.all([refreshPeers($), refreshTabs($)]))
    void $.clock.every(500, async () => {
      if (++peerTicks % 60 === 0) quiet(refreshPeers($))
      busy = isBusy(norm(await read($, tree)))
      // No redraws while idle. But the walk view shows the character thinking, and another session's busy ● blinks, so it advances once a second.
      if (!busy) { if ((cur.view === 'avatar' || peersBusy) && ++ticks % 2 === 0) quiet(update($, tick, n => n + 1)); return }
      quiet(update($, tick, n => n + 1))
      if (++ticks % 10) return
      checkAdvice($)
      if (cur.stallSeconds <= 0) return
      quiet(read($, tree).then(t0 => {
        const t = norm(t0)
        const now = Date.now()
        for (const i of t.flow) if (i.kind === 'tool' && i.endedAt === undefined && isStalled(i.startedAt, now, cur.stallSeconds * 1000)) alert($, `stall:${i.id}`, `Possibly stalled: ${i.label} (running ${secs(now - i.startedAt)})`)
        // Subagent stalls are only checked when events stop between requests and tools (idle). During a request (thinking) it may be receiving a long response,
        // and during a tool run (tool) the tool stall alert above handles it.
        for (const a of t.agents) if (a.status === 'idle' && isStalled(a.lastAt, now, cur.stallSeconds * 1000)) alert($, `stall:agent:${a.id}`, `Possibly stalled: subagent ${a.type} (no events for ${secs(now - (a.lastAt ?? now))})`)
      }))
    })
    quiet($.session.usage().then(u => { lastCost = u.cost?.usd; sessionId = String(u.startedAt) }))
    quiet($.store.get('history').then(v => { if (Array.isArray(v)) history = v as SessionRecord[] }))
    const started = await next(e)
    // Open the panel when a session starts (setting autoOpen, on by default). If it was minimized, leave only one row above the prompt.
    // Since no person opened it, the engine draws it only when the terminal is 110 columns or wider (144 on first use) and otherwise waits until it widens.
    // Load the values saved in the settings screen. Without them, use the plugin settings.
    const saved = await $.store.get('prefs').catch(() => undefined)
    const p = saved && typeof saved === 'object' ? (saved as Prefs) : {}
    applyPrefs(p)
    quiet(update($, prefs, () => p))
    if (cur.autoOpen) quiet(read($, fold).then(f => (f.all ? undefined : openPane($))))
    quiet(checkUpdate($))
    return started
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      sessionEpoch++
      costQueue = Promise.resolve()
      // /clear continues under a new session id and session.start doesn't fire again. Drop the cost baseline and session id and pick them up again from the next usage.
      lastCost = undefined
      sessionId = ''
      activeSteps.clear()
      quiet(set($, () => emptyTree())); quiet(update($, focus, () => '')); quiet(update($, viewTurn, () => '')); quiet(update($, archive, () => ({})))
      quiet($.session.usage().then(u => { lastCost = u.cost?.usd; sessionId = String(u.startedAt) }))
    }
    return next(e)
  })

  // /goyangi opens the panel fresh: it lifts minimize and all section folds so every section is expanded.
  // A pull request from another session's Goyangi (state.ts pullRequest) is answered here with this session's handoff, and dropped before it reaches the model
  on('prompt.submit', async ($, e, next) => {
    const peer = e.origin.kind === 'peer' || e.origin.kind === 'peer-send-message'
    const sender = peer ? handoffFrom(e.text) : undefined
    if (sender !== undefined) $.ui.toast(`Goyangi · Received a handoff from ${sender || 'another session'}`)
    const from = peer ? pullFrom(e.text) : undefined
    if (!from) return next(e)
    quiet(sendHandoff($, from, 'the session that asked'))
    return { drop: 'Goyangi answered a handoff request' }
  })

  // A bare number or tab code ("2번 세션", "b1에서 작업해줘") means the numbers the Open sessions and Browser tabs boxes show.
  // Fixed text, so the prompt cache stays valid; the live list comes from the two tools.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    return { sections: [...r.sections, { id: 'goyangi:numbers', scope: 'session' as const, text: NUMBERS_NOTE }] }
  })

  on('command.run', { command: 'goyangi' }, async $ => {
    await safe(update($, fold, () => ({ all: false, side: false, map: false, flow: false, agents: false, log: false })))
    await openPane($)
    return { text: 'Opened the Goyangi panel.' }
  })

  // Turns started without input (continuing, handling notifications, etc.) also open as new turns. Otherwise that turn's turn.complete overwrites the previous turn's record.
  // Subagent turns also arrive as turn.start (the input type has no agentId, but the subagent prompt actually arrives as text).
  // So with an agentId, or while a main turn is already running, no new turn is opened.
  // ponytail: a turn of a background subagent started after the main turn ended can't be told apart without an agentId.
  on('turn.start', async ($, e, next) => {
    const now = Date.now()
    const prompt = e.text || CONTINUE
    if ((e as { agentId?: string }).agentId) return next(e)
    if (norm(await read($, tree)).turn.running) return next(e)
    quiet(update($, flowPage, () => -1))
    quiet(update($, questPage, () => -1))
    await safe(set($, t => t.turn.running ? t : addLog(
      flowStart({ ...turnBegin(t, e.turnId, prompt, now), flow: [], fails: {}, files: { edit: [], read: [] }, turn: { prompt, startedAt: now, steps: 0, running: true }, main: { ...t.main, status: 'thinking', activity: 'thinking' } },
        // A prompt that is another session's handoff names the sender on the prompt node (⇠ docs-1)
        { id: `prompt:${e.turnId}`, kind: 'prompt', label: handoffFrom(prompt) ?? 'prompt', ...(handoffFrom(prompt) ? { hand: 'from' as const } : {}), startedAt: now, endedAt: now }),
      now, e.text ? 'user' : 'system', 'prompt', prompt)))
    // The handoff a pull was waiting for: the pull's branch now points at this turn (↩ T5)
    const sid = handoffSid(prompt)
    if (sid && (await read($, pulls)).wait[sid]) {
      const turnNo = norm(await read($, tree)).turnTotal
      await safe(update($, pulls, v => { const { [sid]: branch, ...wait } = v.wait; return branch ? { wait, back: { ...v.back, [branch]: `T${turnNo}` } } : v }))
    }
    return next(e)
  })

  // One model request. Even if it fails, finally clears thinking and records it.
  on('turn.step', async function* ($, e, next) {
    const started = Date.now()
    const epoch = sessionEpoch
    // Subagent requests are also attributed to the main turn current when they started.
    const ownerId = e.agentId ? norm(await read($, tree)).turns.at(-1)?.id : e.turnId
    const stepId = `step:${e.agentId ?? 'main'}:${e.turnId}:${e.index}`
    // Without a cost baseline yet (right after a reload), use the running cost just before this request as the baseline.
    if (lastCost === undefined) lastCost = (await $.session.usage().catch(() => undefined))?.cost?.usd
    const mark = stepOpen(activeSteps)
    await safe(set($, t => patchLoop(e.agentId ? reopenAgent(t, e.agentId) : flowStart(turnMark(t, '|'), { id: stepId, kind: 'step', label: `step ${e.index + 1}`, startedAt: started }), e.agentId, l0 => {
      const l = e.agentId ? resumed(l0) : l0
      return {
      ...l, status: l.running > 0 ? l.status : 'thinking', activity: l.running > 0 ? l.activity : 'thinking',
      model: e.model, effort: e.effort ?? l.effort,
    } })))
    let r: { answer?: string; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number } | null; stopReason: string | null; toolUses: readonly unknown[]; serverToolUses?: readonly { name: string; startedAt: number; endedAt?: number }[] } | undefined
    // Collect the text the model writes as it arrives and update the main request node's intent line (once every 0.3s).
    let said = ''
    let shownAt = 0
    let shown = ''
    try {
      const res = yield* tap(next(e), ev => {
        const c = ev as { kind?: string; text?: string }
        if (e.agentId || c.kind !== 'text' || typeof c.text !== 'string') return
        // The intent line is decided by the start of the response. Collect only the first SAID_MAX characters rather than gathering and scanning long responses each time.
        if (said.length < SAID_MAX) said += c.text
        if (Date.now() - shownAt < 300) return
        shownAt = Date.now()
        const intent = firstLine(said)
        // Skip writing when the value is unchanged. Every write redraws the whole panel.
        if (intent && intent !== shown) { shown = intent; quiet(set($, t => flowPatch(t, stepId, { intent }))) }
      })
      r = res
      return res
    } finally {
      activeSteps.delete(mark)
      const u = r?.usage
      const stop = r?.stopReason ?? (r ? 'none' : 'error')
      const tokIn = (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0)
      const tokCache = u?.cache_read_input_tokens ?? 0
      const tokOut = u?.output_tokens ?? 0
      const finished = Date.now()
      let drop = false
      let stepLogSeq: number | undefined
      const meta0 = `${secs(finished - started)} · out ${fmtTok(tokOut)}`
      // Settle the completion state before the next turn and archive. The cost lookup runs separately.
      await safe(set($, t0 => {
        if (epoch !== sessionEpoch) return t0
        // Cache hit rate drop: compare main requests with each other (the flow chart has only main requests).
        if (!e.agentId) drop = cacheDropped([...t0.flow].reverse().find(i => i.kind === 'step' && i.id !== stepId && i.endedAt !== undefined), { tokIn, tokCache })
        const meta = drop ? `${meta0} · ⟳↓ cache` : meta0
        let t = patchLoop(t0, e.agentId, l => ({
          ...l, steps: l.steps + 1,
          status: l.status === 'thinking' ? 'idle' : l.status,
          inTok: l.inTok + (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0),
          cacheTok: l.cacheTok + (u?.cache_read_input_tokens ?? 0),
          outTok: l.outTok + (u?.output_tokens ?? 0),
        }))
        if (!e.agentId) t = { ...t, stops: bump(t.stops, stop), turn: t.turns.at(-1)?.id === ownerId ? { ...t.turn, steps: t.turn.steps + 1 } : t.turn }
        t = addServer(t, r?.serverToolUses ?? [])
        for (const s of r?.serverToolUses ?? []) t = addLog(t, s.startedAt, who(t, e.agentId), 'server', s.name, s.endedAt ? secs(s.endedAt - s.startedAt) : '', true, e.agentId)
        const calls = r?.toolUses.length ?? 0
        t = flowEnd(t, stepId, finished, { label: `step ${e.index + 1} → ${stop}${calls ? ` · ${calls} tool${calls > 1 ? 's' : ''}` : ''}`, meta: `out ${fmtTok(tokOut)}`, ok: !!r, tokIn, tokCache, tokOut, cacheDrop: drop || undefined, intent: firstLine(r?.answer || said) || undefined })
        stepLogSeq = t.logTotal
        return addLog(t, finished, who(t, e.agentId), 'step',
          `step ${e.index + 1} → ${stop}${calls ? ` · ${calls} tool call${calls > 1 ? 's' : ''}` : ''}`, meta, !!r, e.agentId)
      }))
      if (epoch === sessionEpoch) {
        const usage = $.session.usage().catch(() => undefined)
        costQueue = safe(costQueue.then(() => usage).then(async us => {
          if (epoch !== sessionEpoch) return
          const now = us?.cost?.usd
          const delta = now !== undefined && lastCost !== undefined ? Math.max(0, now - lastCost) : undefined
          const cost = mark.overlapped ? undefined : delta
          // Settle running cost differences in completion order. The baseline never decreases.
          if (now !== undefined) lastCost = Math.max(lastCost ?? now, now)
          const ctxPct = us?.context.percent ?? 0
          if (cur.ctxAlertPercent > 0 && ctxPct >= cur.ctxAlertPercent) alert($, 'ctx', `Context ${ctxPct}% used (threshold ${cur.ctxAlertPercent}%)`)
          else alerted.delete('ctx')
          if (delta === undefined) return
          await set($, t => {
            if (epoch !== sessionEpoch) return t
            const turns = t.turns.map(s => s.id === ownerId ? { ...s, cost: (s.cost ?? 0) + delta } : s)
            const owner = turns.find(s => s.id === ownerId)
            if (cur.turnCostAlertUsd > 0 && owner && (owner.cost ?? 0) > cur.turnCostAlertUsd) alert($, `cost:${owner.id}`, `This turn cost ≈${usd(owner.cost ?? 0)} (threshold $${cur.turnCostAlertUsd})`)
            return { ...flowPatch(t, stepId, { cost }), turns,
              log: cost === undefined || stepLogSeq === undefined ? t.log : t.log.map(l => l.seq === stepLogSeq ? { ...l, meta: `${l.meta} · ≈${usd(cost)}` } : l),
            }
          })
          await update($, archive, a => {
            if (epoch !== sessionEpoch || !ownerId || !a[ownerId]) return a
            const snap = a[ownerId]!
            return { ...a, [ownerId]: { ...snap, flow: snap.flow.map(i => i.id === stepId ? { ...i, cost } : i) } }
          })
        }))
      }
    }
  })

  on('tool.call', async ($, e, next) => {
    const what = summarize(e as unknown as Record<string, unknown>)
    const whole = summarize(e as unknown as Record<string, unknown>, 600)
    const started = Date.now()
    const flowId = `tool:${e.tool_use_id}`
    const input = e as unknown as Record<string, unknown>
    // File tool target. Read includes offset and limit in the key to tell whether the same range was read again.
    const fpath = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
    const fileTag = !fpath ? {} : e.tool === 'Read' ? { readKey: `${fpath}|${String(input.offset ?? '')}|${String(input.limit ?? '')}` } : { path: fpath }
    // Handing work to or from another session: the branch names that session (⇢ api #2) instead of the tool name
    // The sessions tool refreshes the list as it runs, so the names are worked out again once it has (the first call may find the list empty)
    const isSessions = e.tool === 'mcp__goyangi__sessions'
    let pr = isSessions ? await read($, peers) : undefined
    let others = pr ? pr.list.filter(x => x.sessionId !== pr!.self) : []
    let hand = pr ? handoffLabel(input, others) : undefined
    await safe(set($, t => patchLoop(flowStart(turnMark(countTool(addDiff(addFile(t, e.tool, fpath), fpath, lineDelta(e.tool, input)), e.tool), toolClass(e.tool), s => ({ tools: s.tools + 1 })), { id: flowId, kind: 'tool', agentId: e.agentId, label: hand?.label ?? `${e.tool}  ${what}`, full: hand ? `${hand.label}  (${e.tool} ${hand.hand})` : `${e.tool}  ${whole}`, startedAt: started, ...fileTag, ...(hand ? { hand: hand.hand } : {}) }),
      e.agentId, l => ({ ...toolStart(l, `${e.tool} ${whole}`.trim()), seq: ((l.seq ?? '') + toolClass(e.tool)).slice(-24) }))))
    // If it ends without a result (exception), leave the cause empty and record only a failure.
    let err: string | undefined = 'error'
    let res = ''
    try {
      const ran = await next(e)
      err = toolErr(ran)
      res = toolResult(e.tool, input, ran)
      // A handoff's result says whether it reached the other session (sendTo: "Sent …" / "Asked …", or "Not sent: why")
      if (isSessions) { pr = await read($, peers); others = pr.list.filter(x => x.sessionId !== pr!.self); hand = handoffLabel(input, others) }
      if (hand && err === undefined) { const r = ran as { result?: unknown; text?: unknown }; const txt = String(r.result ?? r.text ?? ''); res = /^Not sent|^No session|^Could not|can only answer/.test(txt) ? 'not sent' : 'sent'
        // A pull from a Claude session whose note comes back here: wait for it (a coding agent's screen comes back as this result)
        const src = others.find(x => x.num === input.from)
        if (hand.hand === 'pull' && res === 'sent' && input.to === undefined && src && !isAgent(src)) await safe(update($, pulls, v => ({ ...v, wait: { ...v.wait, [src.sessionId]: flowId } })))
      }
      return ran
    } finally {
      const ms = Date.now() - started
      quiet(set($, t0 => {
        let t = addToolTime(patchLoop(t0, e.agentId, toolEnd), e.tool, ms)
        let repeat: number | undefined
        if (err !== undefined) {
          const f = noteFail(t, `${e.agentId ?? 'main'}|${e.tool}|${whole}`)
          t = f.t
          // When the same call fails a second time in the same turn, stamp ! on the map.
          if (f.n >= 2) { repeat = f.n; t = turnMark(t, '!'); alert($, `repeat:${t.turnTotal}|${e.agentId ?? 'main'}|${e.tool}|${whole}`, `Same call failed again: ${e.tool} ${what}`) }
        }
        const ok = err === undefined
        if (!ok) t = turnMark(t, '', s => ({ fails: (s.fails ?? 0) + 1 }))
        t = flowEnd(t, flowId, Date.now(), { ok, err, repeat, res: res || undefined, ...(hand ? { label: hand.label, full: `${hand.label}  (${e.tool} ${hand.hand})` } : {}) })
        return addLog(t, Date.now(), who(t, e.agentId), 'tool', `${repeat ? `⚠ ×${repeat} ` : ''}${hand ? `${hand.label} · ${res}` : `${e.tool}  ${whole}`}${err ? ` · ${err}` : ''}`,
          `${secs(ms)} ${ok ? '✓' : '✗'}`, ok, e.agentId)
      }))
    }
  }).catch(($, e, next) => next(e))

  // Goyangi's own tools answer after the recorder above, so their calls are drawn in the turn flow like any other tool (handlers run in registration order)
  on('tool.call', { tool: 'mcp__goyangi__browser_tabs' }, async ($, e) => ({ result: await tabsTool($, e as never) }) as never)
  on('tool.call', { tool: 'mcp__goyangi__sessions' }, async ($, e) => {
    // The tool's arguments sit on the event beside `tool`
    return { result: await sessionsTool($, e as never) } as never
  })

  on('agent.spawn', async ($, e, next) => {
    const started = Date.now()
    const r = await next(e)
    const id = r.agentId
    if (id) {
      quiet(set($, t => {
        const described = patchLoop(describeAgent(turnMark(t, '', s => ({ agents: s.agents + 1 })), id, e.subagentType, e.description, r.model ?? ''), id,
          l => ({ ...l, origin: l.origin ?? spawnOrigin(t, e.parentAgentId) }))
        const agent = described.agents.find(a => a.id === id)!
        return addLog(flowStart(described,
          { id: `agent:${id}`, kind: 'agent', label: `${e.subagentType}  ${e.description}`, full: `${e.subagentType}: ${e.description}`, meta: r.model ?? '', startedAt: started, endedAt: agent.endedAt, ok: agent.status !== 'failed' }),
          Date.now(), e.subagentType, 'agent', `spawned: ${e.description}`, r.model ?? '', true, id)
      }))
    }
    return r
  }).catch(($, e, next) => next(e))

  on('classic.SubagentStop', async ($, e, next) => {
    quiet(set($, t => {
      const t2 = flowEnd(patchLoop(t, e.agent_id, l => ended(l, false)), `agent:${e.agent_id}`, Date.now())
      const a = t2.agents.find(x => x.id === e.agent_id)
      return addLog(t2, Date.now(), who(t2, e.agent_id), 'agent', 'returned to main', a ? `${a.tools} tools · ${fmtTok(a.inTok + a.cacheTok + a.outTok)} tok` : '', true, e.agent_id)
    }))
    return next(e)
  }).catch(($, e, next) => next(e))

  // Context compaction finished. Observation only, so it doesn't take part in the compaction.
  on('classic.PostCompact', async ($, e, next) => {
    quiet(set($, t => addLog(turnMark(t, 'c'), Date.now(), who(t, e.agent_id), 'compact', `context compacted (${e.trigger})`, '', true, e.agent_id)))
    if (!e.agent_id) refreshCtx($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const failed = e.reason !== 'answer'
    let snap: TurnSnap | undefined
    quiet(set($, t => {
      if (e.agentId) return flowEnd(patchLoop(t, e.agentId, l => ended(l, failed)), `agent:${e.agentId}`, Date.now(), { ok: !failed })
      const now = Date.now()
      const t1 = flowStart({ ...turnMark(t, '#', () => ({ endedAt: now, ok: !failed })), turn: { ...t.turn, running: false }, main: { ...t.main, running: 0, status: 'idle' as const, activity: '' } },
        { id: `answer:${e.turnId}`, kind: 'answer', label: failed ? `turn ended: ${e.reason}` : 'answer', startedAt: now, endedAt: now })
      const t2a = { ...t1, flow: t1.flow.map(i => (i.id === `answer:${e.turnId}` ? { ...i, ok: !failed } : i)) }
      // Record this turn's edited file count on the map and archive the flow chart so it can be replayed from the map (the archive is written to the archive atom separately).
      const t2 = turnMark(t2a, '', () => ({ edits: t2a.files?.edit.length ?? 0 }))
      snap = { flow: t2a.flow, files: t2a.files, prompt: t.turn.prompt, startedAt: t.turn.startedAt, endedAt: now }
      return addLog(t2, Date.now(), 'main', 'answer', failed ? `turn ended: ${e.reason}` : 'answered',
        `${secs(e.durationMs)} · ${t.turn.steps} steps`, !failed)
    }).then(() => (snap ? update($, archive, a => archiveTurn(a, e.turnId, snap!)) : undefined)))
    if (!e.agentId) {
      quiet(read($, freshStage).then(async stage => {
        if (stage === 'writing') {
          // The note the model wrote, or Goyangi's own when it didn't
          const wrote = await $.fs.read(freshFile).then(t => typeof t === 'string' && t.trim().length > 0, () => false)
          if (!wrote) await $.fs.write(freshFile, await myHandoff($))
          return clearToFresh($)
        }
        if (stage || cur.freshMode !== 'auto' || cur.ctxAlertPercent <= 0) return
        const pct = (await $.session.usage().catch(() => undefined))?.context.percent ?? 0
        if (pct >= cur.ctxAlertPercent) await $.clock.after(300, () => quiet(startFresh($)))
      }))
      refreshCtx($)
      checkAdvice($)
      quiet(Promise.all([read($, tree), $.session.usage()]).then(([t, u]) => saveHistory($, norm(t), u.cost?.usd)))
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => drawPanel($, e))

  // Move the session map or session log window to where the scrollbar (scrollbar.tsx) was dragged.
  // The whole-panel bar ('pane') asks the engine to scroll, and the ui.scroll that comes back from the plugin carries the dragged offset.
  on('ui.message', ($, e) => {
    const d = e.data as { list?: unknown; from?: unknown }
    if (d?.list === 'pane' && typeof d.from === 'number') {
      paneSeek.set(`${e.component}:${e.requestId}`, d.from)
      quiet($.ui.scroll({ to: 'start', in: e.requestId }))
      return {}
    }
    if (typeof d?.list === 'string' && typeof d.from === 'number') wheels.get(`${e.component}:${e.requestId}`)?.seek(d.list, d.from)
    return {}
  })

  // When the mouse wheel is over the session map or session log, scroll that list instead of the panel. Anything else (no pointer, keys, plugin moves) is left to the engine.
  on('ui.scroll', ($, e, next) => {
    const seek = paneSeek.get(`${e.component}:${e.requestId}`)
    if (seek !== undefined && e.origin.kind === 'plugin') {
      paneSeek.delete(`${e.component}:${e.requestId}`)
      return next({ ...e, offset: seek })
    }
    const w = wheels.get(`${e.component}:${e.requestId}`)
    if (!w || !e.pointer || e.origin.kind !== 'person') return next(e)
    const move = w.areaAt(e.contentRows - 1 - (w.offset + e.pointer.row), e.pointer.column)
    if (!move) return next(e)
    move(e.by)
    return {}
  })

  // Folded state: two pill-shaped rows above the prompt, a simplified turn walk and the key status. The conversation uses the full width.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const f = await read($, fold)
    // Position and open state are read from state every time. Only state read during rendering triggers redraws,
    // so deciding by the module variable cur wouldn't refresh an already drawn area when the position changes or saved settings load late.
    const pos = { ...base, ...(await read($, prefs)) }.position
    const open = await read($, bottomOpen)
    if (e.props.hasSurvey) return next(e)
    if (!f.all) return pos === 'bottom' && open ? drawPanel($, e) : next(e)
    const { Box, Text: RawText, Button: RawButton } = $.ui.resolve(e)
    const Text = inkText(inkMode(e), RawText)
    const Button = inkButton(inkMode(e), RawButton, Text)
    const t = norm(await read($, tree))
    const n = await read($, tick)
    const bandUsage = await $.session.usage().catch(() => undefined)
    const live = t.agents.filter(a => a.status !== 'done' && a.status !== 'failed').length
    const expand = () => quiet(update($, fold, v => ({ ...v, all: false })).then(() => openPane($)))
    // Close the minimized row. In the bottom position, also close the panel so it isn't redrawn in the same area.
    // Close the panel first, then unfold. In the reverse order the whole panel is drawn once in between.
    const off = () => quiet((cur.position === 'bottom' ? closePane($) : Promise.resolve()).then(() => update($, fold, v => ({ ...v, all: false }))))
    // Two rows in a thin round border, like the prompt box: row 1 is the simplified turn walk (turn, prompt, step track) with the expand and close buttons on the right;
    // row 2 is what main is doing on the left and the key numbers as chips on the right.
    const cols = e.props.bodyColumns
    const spin = SPIN[n % SPIN.length]!
    const tint = await tinter($, e.surface)
    const lim = (bandUsage?.rateLimits ?? []).map(l => ({ kind: l.kind, pct: l.percentUsed, eta: limitEta(l.percentUsed, l.resetsAt, WINDOW_MS[l.kind], Date.now()) }))
    const ad = advise({ flow: t.flow, fails: t.fails, ctxPercent: bandUsage?.context.percent ?? 0, limits: lim })
    const warns = ad.filter(a => a.level === 'warn').length
    const tips = ad.length - warns
    const agents = `⑂ ${live}/${t.agents.length}`
    // Row 1 has the full width less the border and padding (4) and the settings, expand, and close buttons on its right (12): the prompt takes up to a quarter, the track the rest.
    const inner = cols - 4 - 12
    // The settings screen opens under the two rows (the same screen as the panel's); the band grows to hold it.
    const bandSettings = await read($, settingsOpen)
    const promptText = t.turn.prompt ? ` "${ellipsis(t.turn.prompt, Math.max(8, Math.min(40, Math.floor(inner / 4))))}"` : ''
    const head = `T${t.turnTotal}${promptText} `
    const agentText = live ? ` ⑂ ${live} running` : ''
    // With the walk view on, the pet is in the minimized view too: walking while main works, red after a failure, asleep while idle.
    // Where real pixels can be drawn (kitty and Ghostty as Image, desktop as Svg) it is the walk view's own 16 × 16 sprite shrunk into 2 cells at the start of row 1,
    // so the cat and dog stay recognizable. Other terminals get the 8 × 4 octant version (state.ts miniSprite), standing before the latest spot.
    // Only with the walk view on, since that view already needs a terminal that draws octant characters.
    const bandPrefs = { ...base, ...(await read($, prefs)) }
    const petOn = bandPrefs.view === 'avatar'
    const petBusy = t.main.status === 'thinking' || t.main.status === 'tool'
    const petFailed = headState(t) === 'failed'
    const petPal = LOOK(petFailed ? C.fail : '#93c5fd')
    if (pixelTerm === undefined) await decidePixelTerm($)
    quiet(ensureIcons($, ['goyangi']))
    const BandSvg = e.surface === 'desktop' ? $.ui.resolve(e).Svg : undefined
    const BandImage = e.surface === 'terminal' && pixelTerm ? $.ui.resolve(e).Image : undefined
    const petArt = sprite(petBusy ? 'run' : petFailed ? 'fail' : 'sleep', n, bandPrefs.character)
    const petEl = !petOn ? null
      : BandSvg ? <Box key="band-pet" flexShrink={0} width={2} height={1} marginRight={1}><BandSvg source={dotSvg(petArt, petPal)} alt="pet" width={16} height={16} /></Box>
      : BandImage ? <Box key="band-pet" flexShrink={0} width={2} height={1} marginRight={1}><BandImage source={dotRgba(petArt, petPal, 16, IMG_SCALE)} columns={2} rows={1} alt="pet" /></Box>
      // 4 cells of quadrant blocks are too few to tell a cat from a blob, so terminals without the octant glyphs show the animal's emoji (2 cells each: the animal, then its state)
      : blockArt ? <Text key="band-pet">{(bandPrefs.character === 'dog' ? '🐶' : '🐱') + (petBusy ? '💨' : petFailed ? '❗' : '💤')} </Text>
      : <Text key="band-pet">{dotRows(miniSprite(petBusy ? n : 0, bandPrefs.character), petPal, blockArt)[0]!.map((g, k) => <Text key={`bp-${k}`} color={g.fg} backgroundColor={g.bg}>{g.text}</Text>)} </Text>
    // The title's logo: the same cat face as the header's, on the blue chip; null (the 🐱 emoji) until it is loaded or where no image can be drawn
    const bandLogoPng = (await read($, icons))['goyangi']?.png
    const bandLogo = !bandLogoPng ? null
      : BandSvg ? <BandSvg source={`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><image href="data:image/png;base64,${bandLogoPng}" width="32" height="32"/></svg>`} alt="Goyangi" width={16} height={16} />
      : BandImage ? <BandImage source={{ png: bandLogoPng }} columns={2} rows={1} alt="Goyangi" />
      : null
    const petLead = !!(BandSvg || BandImage) || blockArt // drawn at the start of the row, outside the track's Text (the emoji pet too, so the steps run on unbroken)
    const track = miniTrack(stations(t.flow, t.main), Math.max(6, inner - displayWidth(head) - displayWidth(agentText) - (!petOn ? 0 : petLead && !blockArt ? 3 : 5)))
    const tokColor = (st: string) => (st === 'run' ? C.tool : st === 'fail' ? C.fail : C.main)
    const chip = (key: string, bg: string, el: JSX.Element) => <Box key={key} flexShrink={0} backgroundColor={bg} paddingX={1}>{el}</Box>
    // One row: the parts are placed in it directly (a fragment would be drawn as a column box and push the right part onto its own row).
    const pill = (key: string, ...parts: JSX.Element[]) => <Box key={key} justifyContent="space-between" gap={1}>{parts}</Box>
    return (
      <Box flexDirection="column" width={cols}>
        <Box flexDirection="column" borderStyle="round" borderColor={C.dim} paddingX={1} {...(e.surface === 'desktop' ? { marginTop: 1 } : {})}>
        {pill('band-mission',
          <Box key="band-track" flexShrink={1} minWidth={0}>
            {petLead && petEl}
            <Text wrap="truncate">
              <Text bold color={C.main}>T{t.turnTotal}</Text><Text dimColor>{promptText} </Text>
              {track.hidden > 0 && <Text dimColor>◂{track.hidden}</Text>}
              {track.toks.length === 0 && <Text dimColor>waiting for the next prompt</Text>}
              {track.toks.length === 0 && !petLead && petEl}
              {track.toks.map((k, i) => (
                <Text key={`mt-${i}`}>
                  <Text dimColor>{i || track.hidden ? '─' : ' '}</Text>
                  {i === track.toks.length - 1 && !petLead && petEl}
                  <Text bold={k.state === 'run'} color={k.kind === 'step' || k.state !== 'ok' ? tokColor(k.state) : C.dim}>{k.state === 'run' ? spin : ''}{k.text}</Text>
                  {k.tools && <Text> {[...k.tools].map((c, j) => <Text key={`mtt-${j}`} color={MARK[c]?.c ?? C.dim}>{MARK[c]?.g ?? '■'}</Text>)}</Text>}
                </Text>
              ))}
              {agentText && <Text color={C.agent}>{agentText}</Text>}
            </Text>
          </Box>,
          <Box key="band-buttons" flexShrink={0} gap={1}>
            {/* Settings: opens the settings screen under the two rows; bright while it's open */}
            <Button key="band-settings" hover={hov('band-settings')} plain dimColor={!bandSettings} label="[=]" onPress={() => toggleSettingsOf($)} />
            {/* The expand button is a small chip: a painted box around a plain [□]. The chip is a fixed light green whatever the theme, so the text is a fixed dark color
                (the button's default text, white on dark themes, was hard to read on it). Desktop draws the same chip, so it matches [=] and [x] beside it. */}
            <Box key="expand-chip" backgroundColor={C.main}><Button key="expand" hover={hov('expand')} plain label="[□]" onPress={expand}><Text bold color="#1e2030">[□]</Text></Button></Box>
            <Button key="band-off" hover={hov('band-off')} plain dimColor onPress={off}>[x]</Button>
          </Box>,
        )}
        {pill('band-status',
          <Box key="band-doing" flexShrink={1} minWidth={0} gap={1}>
            {/* The same status chip as the panel header, then the running tool's command */}
            <Box key="band-state" flexShrink={0}>{stateChip(Text, headState(t))}</Box>
            {t.main.status === 'tool' && <Text wrap="truncate" color={C.tool}>{t.main.activity}</Text>}
          </Box>,
          <Box key="band-stats" flexShrink={0} gap={1}>
            {/* Advice counts as tinted chips, like the advice rows in the panel */}
            {warns > 0 && chip('band-warn', tint('#3a2f1a', C.tool), <Text color={C.tool}>⚠{warns}</Text>)}
            {tips > 0 && chip('band-tip', tint('#24324a', '#8ab4f8'), <Text color="#8ab4f8">💡{tips}</Text>)}
            <Text><Text bold color={M.steps}>step {t.main.steps}</Text><Text dimColor> · </Text><Text bold color={M.tools}>tool {t.main.tools}</Text></Text>
            <Text bold color={live ? C.agent : C.dim}>{agents}</Text>
          </Box>,
        )}
        </Box>
        {/* The 🐱 Goyangi title sits on the top border near its left corner, like a title on the prompt box's frame. The terminal's border is row 0.
            On desktop the border is a thin line and a vertical margin step is half a row, so the box moves down half a row (marginTop 1) to put its border
            through the middle of the title row, and the title is painted in the base surface color (clawd_background) to hide the line behind it. */}
        <Box position="absolute" top={0} left={2} {...(e.surface === 'desktop' ? { backgroundColor: 'clawd_background' } : {})}>
          {bandLogo
            ? <Box key="band-logo"><Text backgroundColor={TITLE}> </Text><Box flexShrink={0} width={2} height={1} backgroundColor={TITLE}>{bandLogo}</Box><Text backgroundColor={TITLE}> </Text><Text bold> Goyangi </Text></Box>
            : <Text bold> 🐱 Goyangi </Text>}
        </Box>
        {/* Wide terminals lay the settings rows out in up to 3 columns (an item takes about SETTING_W cells), so the screen stays short */}
        {bandSettings && await settingsScreen($, e, Math.max(1, Math.min(3, Math.floor((cols - 4 + 3) / (SETTING_W + 3)))))}
      </Box>
    )
  })
}
