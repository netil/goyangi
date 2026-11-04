// Pure functions that update the tree state. Hooks receive events and update state through these functions.
import type { Advice, CtxPart, FlowItem, LogKind, Loop, Peer, SessionRecord, Tab, SessionTurn, Tree, TurnSnap } from '../types'

const LOG_MAX = 80
// Max length of stored strings. The screen trims to fit the width; hover cards show up to this length.
export const FULL_MAX = 600
const AGENT_MAX = 50

export const clean = (s: string, max = 60) => s.replace(/\s+/g, ' ').trim().slice(0, max)

export const newLoop = (id: string, type: string, desc = '', model = ''): Loop => ({
  id, type, desc: clean(desc, FULL_MAX), model, status: 'idle', activity: '',
  tools: 0, running: 0, steps: 0, inTok: 0, outTok: 0, cacheTok: 0,
})

export const emptyTree = (): Tree => ({
  main: newLoop('main', 'main'), agents: [], toolMix: {}, stops: {}, server: {},
  turn: { prompt: '', startedAt: 0, steps: 0, running: false }, flow: [], turns: [], log: [], logTotal: 0, turnTotal: 0,
  toolTime: {}, fails: {},
})

const isEnded = (l: Loop) => l.status === 'done' || l.status === 'failed'

// Over the cap, finished agents are removed first. Running agents are kept.
function capAgents(agents: Loop[]): Loop[] {
  const extra = agents.length - AGENT_MAX
  if (extra <= 0) return agents
  const drop = new Set(agents.filter(isEnded).slice(0, extra).map(a => a.id))
  return agents.filter(a => !drop.has(a.id))
}

// No agentId means the main loop. Unknown ids are registered on first sight:
// an agent's events can arrive before the result of agent.spawn.
export function patchLoop(t: Tree, agentId: string | undefined, f0: (l: Loop) => Loop): Tree {
  // Every event passes through here, so record the last event time here (for stall detection).
  const fn = (l: Loop) => ({ ...f0(l), lastAt: Date.now() })
  if (!agentId) return { ...t, main: fn(t.main) }
  if (!t.agents.some(a => a.id === agentId)) {
    return { ...t, agents: capAgents([...t.agents, fn({ ...newLoop(agentId, 'agent'), status: 'thinking', startedAt: Date.now() })]) }
  }
  return { ...t, agents: t.agents.map(a => (a.id === agentId ? fn(a) : a)) }
}

// Fill in name, description, and model from the agent.spawn result. Keep state and totals already received.
export const describeAgent = (t: Tree, id: string, type: string, desc: string, model: string): Tree =>
  patchLoop(t, id, l => ({ ...l, type, desc: clean(desc, FULL_MAX), model: l.model || model }))

export const who = (t: Tree, agentId?: string) =>
  agentId ? (t.agents.find(a => a.id === agentId)?.type ?? 'agent') : 'main'

export const addLog = (t: Tree, at: number, name: string, kind: LogKind, text: string, meta = '', ok = true, agentId?: string): Tree =>
  ({ ...t, logTotal: t.logTotal + 1, log: [...t.log, { at, who: name, kind, text: clean(text, FULL_MAX), meta, ok, agentId, seq: t.logTotal }].slice(-LOG_MAX) })

export const bump = (m: Record<string, number>, k: string): Record<string, number> => ({ ...m, [k]: (m[k] ?? 0) + 1 })

// Count server-side tools (advisor, web search, etc.) by name.
export function addServer(t: Tree, uses: readonly { name: string; startedAt: number; endedAt?: number }[]): Tree {
  if (uses.length === 0) return t
  const server = { ...t.server }
  for (const u of uses) {
    const prev = server[u.name] ?? { calls: 0, ms: 0, lastAt: 0 }
    server[u.name] = { calls: prev.calls + 1, ms: prev.ms + Math.max(0, (u.endedAt ?? u.startedAt) - u.startedAt), lastAt: u.startedAt }
  }
  return { ...t, server }
}

// 59.95s or more would round to 60.0s, so switch to minutes. Round to seconds before dividing so 1m60s never appears.
export const secs = (ms: number) => {
  if (ms < 1000) return `${ms}ms`
  if (ms < 59_950) return `${(ms / 1000).toFixed(1)}s`
  const s = Math.round(ms / 1000)
  if (s >= 86400) return `${Math.floor(s / 86400)}d${Math.floor((s % 86400) / 3600)}h`
  if (s >= 3600) return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 60)}m${s % 60}s`
}

// A subagent that missed its end event stays in thinking or tool and would keep redrawing while idle.
// So a subagent counts as running only when its last event is within BUSY_STALE_MS.
const BUSY_STALE_MS = 10 * 60_000
export const isBusy = (t: Tree, now = Date.now()) =>
  t.turn.running || t.main.status === 'thinking' || t.main.status === 'tool' ||
  t.agents.some(l => (l.status === 'thinking' || l.status === 'tool') && (l.lastAt === undefined || now - l.lastAt < BUSY_STALE_MS))

export const countTool = (t: Tree, tool: string): Tree => ({ ...t, toolMix: bump(t.toolMix, tool) })

// Tool start and end. Parallel calls in the same loop are counted in running.
export const toolStart = (l: Loop, activity: string): Loop =>
  ({ ...l, tools: l.tools + 1, running: l.running + 1, status: isEnded(l) ? l.status : 'tool', activity })

export const toolEnd = (l: Loop): Loop => {
  const running = Math.max(0, l.running - 1)
  return { ...l, running, status: l.status === 'tool' && running === 0 ? 'idle' : l.status }
}

// A finished subagent resumes (SendMessage). Clear the end time; the next end records a new one.
export const resumed = (l: Loop): Loop => (isEnded(l) ? { ...l, status: 'thinking', endedAt: undefined } : l)

// A subagent finished. failed is never overwritten by done. If the end event arrives twice (SubagentStop, turn.complete), keep the first time.
export const ended = (l: Loop, failed: boolean, at = Date.now()): Loop =>
  ({ ...l, running: 0, status: failed || l.status === 'failed' ? 'failed' : 'done', activity: '', endedAt: l.endedAt ?? at })

// One-line tool call summary: only what it targeted, kept short.
export function summarize(e: Record<string, unknown>, max = 60): string {
  const s = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : '')
  const base = (p: string) => p.split('/').pop() ?? p
  return clean(s('command') || (s('file_path') && base(s('file_path'))) || s('pattern') ||
    s('description') || s('skill') || s('url') || s('query') || '', max)
}

// Usage share of the top n tools.
export function topTools(mix: Record<string, number>, n: number): { tool: string; share: number }[] {
  const total = Object.values(mix).reduce((a, b) => a + b, 0)
  if (total === 0) return []
  return Object.entries(mix).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([tool, c]) => ({ tool, share: c / total }))
}

// Agents to show: running ones first, then recently finished ones.
export function visibleAgents(agents: Loop[], max: number): { shown: Loop[]; hidden: number } {
  const live = agents.filter(a => !isEnded(a))
  const done = agents.filter(isEnded).reverse()
  const shown = [...live, ...done].slice(0, Math.max(0, max))
  return { shown, hidden: agents.length - shown.length }
}

// 999.5k or more would round to 1000k, so switch to M.
export const fmtTok = (n: number) =>
  n >= 999_500 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n)

export const bar = (share: number, width: number) => {
  const full = Math.round(share * width)
  return '█'.repeat(full) + '░'.repeat(Math.max(0, width - full))
}

// Pad to a fixed width, counting full-width characters (CJK etc.) as 2 cells.
export function fit(s: string, width: number): string {
  let out = ''
  let w = 0
  for (const ch of s) {
    const cw = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFF00-\uFF60]/.test(ch) ? 2 : 1
    if (w + cw > width) break
    out += ch
    w += cw
  }
  return out + ' '.repeat(width - w)
}

const FLOW_MAX = 80

// Flow items of the current turn. Added on start; closed on end by finding the same id.
export const flowStart = (t: Tree, item: Omit<FlowItem, 'ok' | 'meta'> & { meta?: string; ok?: boolean }): Tree =>
  ({ ...t, flow: [...t.flow, { meta: '', ok: true, ...item, label: clean(item.label, 60) }].slice(-FLOW_MAX) })

export const flowEnd = (t: Tree, id: string, at: number, patch: Partial<FlowItem> = {}): Tree =>
  ({ ...t, flow: t.flow.map(i => (i.id === id && i.endedAt === undefined ? { ...i, ...patch, endedAt: at } : i)) })


const TURNS_MAX = 40
const SEQ_MAX = 400

// Map a tool name to its session map class letter.
export function toolClass(tool: string): string {
  if (tool === 'Bash' || tool === 'PowerShell') return 'b'
  if (tool === 'Read') return 'r'
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return 'e'
  if (tool === 'Grep' || tool === 'Glob' || tool === 'LSP' || tool === 'ToolSearch') return 's'
  if (tool === 'WebFetch' || tool === 'WebSearch') return 'w'
  if (tool === 'mcp__goyangi__sessions') return 'h'
  if (tool.startsWith('mcp__')) return 'm'
  if (tool === 'Skill') return 'k'
  if (tool === 'Agent' || tool === 'Task' || tool === 'SendMessage') return 'a'
  return 'o'
}

export const turnBegin = (t: Tree, id: string, prompt: string, at: number): Tree =>
  ({ ...t, turnTotal: t.turnTotal + 1, turns: [...t.turns, { id, prompt: clean(prompt, FULL_MAX), startedAt: at, seq: '>', tools: 0, agents: 0, ok: true }].slice(-TURNS_MAX) })

// Append a mark to the last running turn. With no running turn (background agent), append to the last turn.
export function turnMark(t: Tree, ch: string, patch: (s: SessionTurn) => Partial<SessionTurn> = () => ({})): Tree {
  if (t.turns.length === 0) return t
  let idx = t.turns.length - 1
  for (let i = t.turns.length - 1; i >= 0; i--) if (t.turns[i]?.endedAt === undefined) { idx = i; break }
  return { ...t, turns: t.turns.map((s, i) => (i === idx ? { ...s, ...patch(s), seq: (s.seq + ch).slice(-SEQ_MAX) } : s)) }
}

// Split into runs so same-colored characters are drawn as one chunk.
export function runs(seq: string): { ch: string; n: number }[] {
  const out: { ch: string; n: number }[] = []
  for (const ch of seq) {
    const last = out[out.length - 1]
    if (last && last.ch === ch) last.n++
    else out.push({ ch, n: 1 })
  }
  return out
}

// One column of the flow chart: one main loop node (prompt, model request, answer) and the branches under it.
export type FlowColumn = { node: FlowItem; children: { item: FlowItem; depth: number }[] }

// Group flow items into flow chart columns. Tools and subagents hang under the main node started just before them;
// tools inside a subagent hang one level deeper under that subagent.
export function flowColumns(flow: FlowItem[]): FlowColumn[] {
  const cols: FlowColumn[] = []
  const isNode = (i: FlowItem) => i.kind === 'prompt' || i.kind === 'step' || i.kind === 'answer'
  for (const i of flow) {
    if (isNode(i)) { cols.push({ node: i, children: [] }); continue }
    const col = cols[cols.length - 1]
    if (!col) continue
    if (i.kind === 'tool' && i.agentId) {
      // Subagent tool: find that agent's branch and insert right after it (at the end of its group).
      const owner = [...cols].reverse().find(c => c.children.some(ch => ch.item.id === `agent:${i.agentId}`))
      if (owner) {
        const at = owner.children.findIndex(ch => ch.item.id === `agent:${i.agentId}`)
        let end = at + 1
        while (end < owner.children.length && owner.children[end]!.depth === 1) end++
        owner.children.splice(end, 0, { item: i, depth: 1 })
        continue
      }
    }
    col.children.push({ item: i, depth: 0 })
  }
  return cols
}

// Log window: end is the absolute index of the line after the last one shown; -1 follows the latest.
export function logWindow(log: { length: number }, total: number, end: number, rows: number) {
  const first = total - log.length
  const follow = end < 0 || end >= total
  const e = follow ? total : Math.max(Math.min(first + rows, total), Math.min(end, total))
  const s = Math.max(first, e - rows)
  return { start: s, end: e, follow, from: s - first, to: e - first }
}

// Trim to width by display width (CJK = 2 cells) and append …. No padding.
export function ellipsis(s: string, width: number): string {
  const one = s.replace(/\s+/g, ' ').trim()
  if (width <= 0) return ''
  if (displayWidth(one) <= width) return one
  return fit(one, Math.max(0, width - 1)).trimEnd() + '…'
}

export function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFF00-\uFF60]/.test(ch) ? 2 : 1
  return w
}

// Cost display: under one cent, show up to three decimal places.
export const usd = (x: number) => (x < 0.01 ? `$${x.toFixed(3)}` : x < 100 ? `$${x.toFixed(2)}` : `$${Math.round(x)}`)

// Three-line fork. A dot coming down the middle spreads both ways along the horizontal line (big dot ● then small dot •),
// then drops with ▼ at each target (targets, column index). When not active, draw only the lines.
export function branchLines(width: number, targets: number[], tick: number, active: boolean): [string, string, string] {
  const w = Math.max(3, width)
  const ts = (targets.length ? targets : [Math.floor(w / 2)]).map(x => Math.max(0, Math.min(w - 1, x)))
  const lo = Math.min(...ts)
  const hi = Math.max(...ts)
  const mid = Math.floor((lo + hi) / 2)
  const line: string[] = Array.from({ length: w }, (_, i) => (i > lo && i < hi ? '─' : ' '))
  for (const x of ts) line[x] = x === lo && lo !== hi ? '┌' : x === hi && lo !== hi ? '┐' : '┬'
  if (lo !== hi) line[mid] = ts.includes(mid) ? '┼' : '┴'
  if (active && hi > lo) {
    const half = Math.max(1, Math.max(mid - lo, hi - mid))
    const d = tick % half
    const put = (x: number, ch: string) => { if (x > lo && x < hi) line[x] = ch }
    put(mid - d, '●'); put(mid - d + 1, '•')
    put(mid + d, '●'); put(mid + d - 1, '•')
    if (d === 0) line[mid] = '●'
  }
  const top = ' '.repeat(mid) + (active ? (tick % 2 ? '•' : '●') : '│')
  const bottom = Array.from({ length: w }, (_, i) => (ts.includes(i) ? '▼' : ' ')).join('')
  return [top, line.join(''), bottom]
}

// Two-line merge. Dots gather from both ends to the middle and drop with ▼ in the middle.
export function joinLines(width: number, targets: number[], tick: number, active: boolean): [string, string] {
  const w = Math.max(3, width)
  const ts = (targets.length ? targets : [Math.floor(w / 2)]).map(x => Math.max(0, Math.min(w - 1, x)))
  const lo = Math.min(...ts)
  const hi = Math.max(...ts)
  const mid = Math.floor((lo + hi) / 2)
  const line: string[] = Array.from({ length: w }, (_, i) => (i > lo && i < hi ? '─' : ' '))
  for (const x of ts) line[x] = x === lo && lo !== hi ? '└' : x === hi && lo !== hi ? '┘' : '┴'
  if (lo !== hi) line[mid] = ts.includes(mid) ? '┼' : '┬'
  if (active && hi > lo) {
    const half = Math.max(1, Math.max(mid - lo, hi - mid))
    const d = half - (tick % half)
    const put = (x: number, ch: string) => { if (x > lo && x < hi && x !== mid) line[x] = ch }
    put(mid - d, '●'); put(mid - d - 1, '•')
    put(mid + d, '●'); put(mid + d + 1, '•')
  }
  return [line.join(''), ' '.repeat(mid) + '▼']
}

// Arrow into a running node: a dot moves left to right.
export const arrowFrame = (tick: number, active: boolean) =>
  active ? (['●──▶', '─●─▶', '──●▶'][tick % 3] ?? '──▶') : '──▶'

// Why a tool failed. Denials keep the reason; errors keep the start of the message the model read. undefined on success.
export function toolErr(ran: { deny?: string; isError?: true; text?: string; result?: unknown }): string | undefined {
  if (ran.deny !== undefined) return clean(`denied: ${ran.deny}`, 300)
  if (ran.isError) return clean(ran.text ?? (typeof ran.result === 'string' ? ran.result : 'error'), 300)
  return undefined
}

// Bump the failure count of the same call (key) in the current turn and return it. turn.start clears fails.
export function noteFail(t: Tree, key: string): { t: Tree; n: number } {
  const n = (t.fails[key] ?? 0) + 1
  return { t: { ...t, fails: { ...t.fails, [key]: n } }, n }
}

export function addToolTime(t: Tree, tool: string, ms: number): Tree {
  const p = t.toolTime[tool] ?? { ms: 0, max: 0 }
  return { ...t, toolTime: { ...t.toolTime, [tool]: { ms: p.ms + ms, max: Math.max(p.max, ms) } } }
}

// Top n tools by their single longest run (max).
export const slowTools = (tt: Tree['toolTime'], n: number) =>
  Object.entries(tt).sort((a, b) => b[1].max - a[1].max).slice(0, n).map(([tool, v]) => ({ tool, ...v }))

// Context usage color: 80% or more is a warning, 60% or more is caution.
export const ctxLevel = (pct: number): 'warn' | 'caution' | 'ok' => (pct >= 80 ? 'warn' : pct >= 60 ? 'caution' : 'ok')

// Flow items when focusing one agent: keep only main nodes, that agent, and that agent's tools.
export function focusFlow(flow: FlowItem[], agentId: string): FlowItem[] {
  if (!agentId) return flow
  const isNode = (i: FlowItem) => i.kind === 'prompt' || i.kind === 'step' || i.kind === 'answer'
  return flow.filter(i => isNode(i) || i.id === `agent:${agentId}` || i.agentId === agentId)
}

// Model requests in flight at the same time. Session cost is only known as a running total, so the increase
// during a request that overlapped others is not that request's cost alone. Requests that ever overlapped are marked overlapped.
// The only function in this file that mutates (it must mark every in-flight request when a request starts).
export type StepMark = { overlapped: boolean }
export function stepOpen(active: Set<StepMark>): StepMark {
  const me = { overlapped: active.size > 0 }
  for (const a of active) a.overlapped = true
  active.add(me)
  return me
}

// Where a subagent was spawned from: the parent agent's name if any, otherwise the last main request started this turn.
export function spawnOrigin(t: Tree, parentAgentId?: string): string {
  if (parentAgentId) return `⑂ ${who(t, parentAgentId)}`
  const step = [...t.flow].reverse().find(i => i.kind === 'step')
  return `◆ T${t.turnTotal}${step ? ` ${step.label.split(' → ')[0]}` : ''}`
}

// The main node that received the results: the first model request started after the last finished agent, otherwise the turn's answer.
// If neither exists yet, main is waiting for results (undefined).
export function returnTarget(flow: FlowItem[], endedAt: number): FlowItem | undefined {
  return flow.find(i => i.kind === 'step' && i.startedAt >= endedAt) ?? flow.find(i => i.kind === 'answer' && i.startedAt >= endedAt)
}

// Header status chip. Picks in order: running tool > waiting on model > other activity > last turn failed > idle.
export type HeadState = 'tool' | 'thinking' | 'live' | 'failed' | 'idle'
export function headState(t: Tree): HeadState {
  const loops = [t.main, ...t.agents]
  if (loops.some(l => l.status === 'tool')) return 'tool'
  if (loops.some(l => l.status === 'thinking')) return 'thinking'
  if (t.turn.running) return 'live'
  const last = t.turns[t.turns.length - 1]
  return last && last.endedAt !== undefined && !last.ok ? 'failed' : 'idle'
}

// Length of the usage limit window. The reset time and window length give the usage rate so far.
export const WINDOW_MS: Record<string, number> = { five_hour: 5 * 3600_000, seven_day: 7 * 86400_000 }

// Time (ms) until the limit (100%) is reached at the current rate. undefined if it won't be reached before reset or can't be computed.
export function limitEta(pct: number, resetsAt: string | undefined, windowMs: number | undefined, now: number): number | undefined {
  if (!resetsAt || !windowMs || pct <= 0) return undefined
  const reset = Date.parse(resetsAt)
  if (Number.isNaN(reset)) return undefined
  const elapsed = windowMs - (reset - now)
  if (elapsed <= 0) return undefined
  if (pct >= 100) return 0
  const eta = ((100 - pct) / pct) * elapsed
  return eta < reset - now ? eta : undefined
}

// An item running longer than the threshold counts as stalled.
export const isStalled = (since: number | undefined, now: number, stallMs: number) =>
  since !== undefined && stallMs > 0 && now - since > stallMs

// Cache hit rate = input read from cache / total input. If the previous request hit at least half, this one drops below 20%,
// and new input exceeds 10k tokens, treat the cache as broken (CLAUDE.md or tool list changed, etc.).
export function cacheDropped(prev: { tokIn?: number; tokCache?: number } | undefined, cur: { tokIn?: number; tokCache?: number }): boolean {
  const hit = (x: { tokIn?: number; tokCache?: number }) => { const all = (x.tokIn ?? 0) + (x.tokCache ?? 0); return all ? (x.tokCache ?? 0) / all : undefined }
  const p = prev && hit(prev)
  const c = hit(cur)
  return p !== undefined && c !== undefined && p >= 0.5 && c < 0.2 && (cur.tokIn ?? 0) > 10_000
}

// Context breakdown: drop deferred tools and empty entries, largest first.
export const ctxParts = (cats: readonly { name: string; tokens: number; color: string; isDeferred: boolean }[]): CtxPart[] =>
  cats.filter(c => !c.isDeferred && c.tokens > 0).sort((a, b) => b.tokens - a.tokens).map(({ name, tokens, color }) => ({ name, tokens, color }))

const HISTORY_MAX = 200

// Update session records: overwrite the same id, drop the oldest first.
export const upsertRecord = (list: SessionRecord[], r: SessionRecord): SessionRecord[] =>
  [...list.filter(x => x.id !== r.id), r].sort((a, b) => a.startedAt - b.startedAt).slice(-HISTORY_MAX)

// Totals for today (since local midnight) and the last 7 days.
export function historySummary(list: SessionRecord[], now: number) {
  const d = new Date(now); d.setHours(0, 0, 0, 0)
  const sum = (from: number) => {
    const xs = list.filter(x => x.updatedAt >= from)
    return { sessions: xs.length, cost: xs.reduce((a, x) => a + x.cost, 0) }
  }
  return { today: sum(d.getTime()), week: sum(now - 7 * 86400_000) }
}

// Pick flow chart branches: running items first, then fill remaining slots with recently finished ones (original order kept).
// With max or fewer branches, or when expanded, show all. hidden is the number hidden.
export function pickKids<T extends { item: { endedAt?: number } }>(kids: T[], max: number, open: boolean): { shown: T[]; hidden: number } {
  if (open || kids.length <= max) return { shown: kids, hidden: 0 }
  const idx = kids.map((_, i) => i)
  const live = idx.filter(i => kids[i]!.item.endedAt === undefined).slice(-max)
  const room = max - live.length
  const done = room > 0 ? idx.filter(i => kids[i]!.item.endedAt !== undefined).slice(-room) : []
  const pick = new Set([...live, ...done])
  return { shown: kids.filter((_, i) => pick.has(i)), hidden: kids.length - pick.size }
}

// First line of the response text: skip blank lines and strip markdown heading markers.
export function firstLine(text: string, max = 80): string {
  const line = text.split('\n').map(l => l.replace(/^[#>*\-\s]+/, '').trim()).find(l => l) ?? ''
  return clean(line, max)
}

const lineCount = (s: string) => (s ? s.replace(/\n$/, '').split('\n').length : 0)

// One-word summary of a tool result. Empty string if unknown.
export function toolResult(tool: string, input: Record<string, unknown>, ran: { isError?: true; deny?: string; text?: string }): string {
  const text = typeof ran.text === 'string' ? ran.text : ''
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  if (ran.deny !== undefined) return 'denied'
  if (tool === 'Bash' || tool === 'PowerShell') {
    const code = /exit code[:\s]+(\d+)/i.exec(text)?.[1]
    return ran.isError ? `exit ${code ?? '≠0'}` : ''
  }
  if (ran.isError) return ''
  if (tool === 'Edit') return `+${lineCount(str('new_string'))}/−${lineCount(str('old_string'))}`
  if (tool === 'Write') return `+${lineCount(str('content'))}`
  if (tool === 'Read') return text ? `${lineCount(text)} lines` : ''
  if (tool === 'Grep' || tool === 'Glob') return text ? `${text.split('\n').filter(l => l.trim()).length} hits` : ''
  return ''
}

// Add to this turn's file list. Read counts as read; Edit/Write/NotebookEdit as edited.
export function addFile(t: Tree, tool: string, path: string): Tree {
  if (!path) return t
  const name = path.split('/').pop() ?? path
  const f = t.files ?? { edit: [], read: [] }
  if (tool === 'Read') return f.read.includes(name) ? t : { ...t, files: { ...f, read: [...f.read, name] } }
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return f.edit.includes(name) ? t : { ...t, files: { ...f, edit: [...f.edit, name] } }
  return t
}

// Lines an edit adds and removes, from the tool's input. A Write counts every line as added: the old file isn't known here.
const nl = (s: unknown) => (typeof s === 'string' && s ? s.split('\n').length - (s.endsWith('\n') ? 1 : 0) : 0)
export function lineDelta(tool: string, input: Record<string, unknown>): { add: number; del: number } {
  if (tool === 'Edit') return { add: nl(input.new_string), del: nl(input.old_string) }
  if (tool === 'MultiEdit' && Array.isArray(input.edits)) return input.edits.reduce((a: { add: number; del: number }, e: Record<string, unknown>) => ({ add: a.add + nl(e?.new_string), del: a.del + nl(e?.old_string) }), { add: 0, del: 0 })
  if (tool === 'Write') return { add: nl(input.content), del: 0 }
  if (tool === 'NotebookEdit') return { add: nl(input.new_source), del: 0 }
  return { add: 0, del: 0 }
}
// Add an edit's line counts to the session's per-file totals (full path → lines added and removed).
export function addDiff(t: Tree, path: string, d: { add: number; del: number }): Tree {
  if (!path || (!d.add && !d.del)) return t
  const cur = t.diff?.[path] ?? { add: 0, del: 0 }
  return { ...t, diff: { ...t.diff, [path]: { add: cur.add + d.add, del: cur.del + d.del } } }
}

// Time bar: split the turn span [t0, t1] into width cells; each cell gets one letter for what was running then.
// Picks in order: a subagent > t tool > m waiting on model > space (gap).
export function timeStrip(flow: FlowItem[], t0: number, t1: number, width: number, now: number): string {
  if (width <= 0 || t1 <= t0) return ''
  const span = (t1 - t0) / width
  let out = ''
  for (let c = 0; c < width; c++) {
    const a = t0 + c * span
    const b = a + span
    const on = (k: FlowItem['kind']) => flow.some(i => i.kind === k && i.startedAt < b && (i.endedAt ?? now) > a)
    out += on('agent') ? 'a' : on('tool') ? 't' : on('step') ? 'm' : ' '
  }
  return out
}

// Tools whose run time overlapped another branch (parallel calls).
export const overlaps = (i: FlowItem, others: FlowItem[], now: number) =>
  others.some(o => o !== i && o.kind === 'tool' && o.startedAt < (i.endedAt ?? now) && i.startedAt < (o.endedAt ?? now))

const ARCHIVE_MAX = 10

// Archive the flow chart of finished turns. Only the last ARCHIVE_MAX turns are kept.
// The archive lives apart from the tree (register's archive atom). The tree is saved whole on every event, so it doesn't carry past turns.
export function archiveTurn(a: Record<string, TurnSnap>, id: string, snap: TurnSnap): Record<string, TurnSnap> {
  const keep = Object.entries(a).filter(([k]) => k !== id).sort((x, y) => x[1].startedAt - y[1].startedAt).slice(-(ARCHIVE_MAX - 1))
  return Object.fromEntries([...keep, [id, snap]])
}

// Blocks for one session map row: three or more of the same letter in a row collapse to '■×12'.
// If still wider than width, keep both ends and shorten the middle to '…' so the start and end both show.
export type MapToken = { ch: string; n: number }
export function mapTokens(seq: string, width: number, gw: (ch: string) => number = () => 1): MapToken[] {
  const toks = runs(seq)
  const w = (k: MapToken) => (k.ch === '…' ? 1 : k.n >= 3 ? gw(k.ch) + 1 + String(k.n).length : gw(k.ch) * k.n)
  const total = (ks: MapToken[]) => ks.reduce((a, k) => a + w(k), 0)
  if (total(toks) <= width) return toks
  const head: MapToken[] = []
  const tail: MapToken[] = []
  let i = 0
  let j = toks.length - 1
  let room = width - 1
  // Alternate adding from the front and back; stop when there's no room.
  while (i <= j) {
    const k = head.length <= tail.length ? toks[i]! : toks[j]!
    if (w(k) > room) break
    room -= w(k)
    if (head.length <= tail.length) { head.push(k); i++ } else { tail.unshift(k); j-- }
  }
  return i > j ? [...head, ...tail] : [...head, { ch: '…', n: 1 }, ...tail]
}

// Relative weight bar: ratio to the heaviest value, in width cells.
export const weightBar = (v: number, max: number, width = 4) => {
  const full = max > 0 ? Math.max(v > 0 ? 1 : 0, Math.round((v / max) * width)) : 0
  return '▰'.repeat(full) + '▱'.repeat(Math.max(0, width - full))
}

// Turn time by category (ms): m waiting on model, t running tools, a subagents, w waiting (everything else).
// When they overlap, count only one: subagent > tool > model. Approximated by splitting into samples cells.
export function timeShares(flow: FlowItem[], t0: number, t1: number, now: number, samples = 600): { m: number; t: number; a: number; w: number } {
  const strip = timeStrip(flow, t0, t1, samples, now)
  const span = (t1 - t0) / samples
  const n = (ch: string) => [...strip].filter(c => c === ch).length * span
  return { m: n('m'), t: n('t'), a: n('a'), w: n(' ') }
}

// Split values into width cells proportionally (largest remainder). Values above 0 get at least 1 cell.
export function shareWidths(values: number[], width: number): number[] {
  const total = values.reduce((a, b) => a + b, 0)
  if (total <= 0 || width <= 0) return values.map(() => 0)
  const raw = values.map(v => (v / total) * width)
  const out = raw.map((r, i) => (values[i]! > 0 ? Math.max(1, Math.floor(r)) : 0))
  let left = width - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).filter(x => values[x.i]! > 0).sort((a, b) => b.rem - a.rem)
  for (let k = 0; left > 0 && order.length; k++, left--) out[order[k % order.length]!.i]!++
  // Take the overflow caused by the 1-cell minimum from the largest cell.
  while (left < 0) { const i = out.indexOf(Math.max(...out)); out[i]!--; left++ }
  return out
}

// Cache lifetime. A hit rate drop after a pause longer than this is normal expiry, so no advice is given.
// Kept at 5 minutes even where a 1-hour cache is used: judging conservatively avoids false warnings.
export const CACHE_TTL_MS = 5 * 60_000

export type AdviceInput = {
  flow: FlowItem[]
  fails: Record<string, number>
  ctxPercent: number
  limits: { kind: string; pct: number; eta?: number }[]
}

const hitRate = (i: FlowItem) => { const all = (i.tokIn ?? 0) + (i.tokCache ?? 0); return all ? (i.tokCache ?? 0) / all : undefined }
const pctText = (x: number) => `${Math.round(x * 100)}%`
const LIMIT_NAME: Record<string, string> = { five_hour: '5h', seven_day: '7d' }

// Advice for this turn. Only five rules whose data is exact and whose reasoning holds. Warnings (warn) come first.
export function advise(x: AdviceInput): Advice[] {
  const out: Advice[] = []
  // 1. Context usage (as reported by the engine)
  if (x.ctxPercent >= 70) out.push({ id: 'ctx', level: 'warn', text: `Context ${x.ctxPercent}% used`,
    why: `The engine reports ${x.ctxPercent}% context usage. If the topic changed, consider /clear; to keep going on the same work, consider /compact.` })
  // 2. Same call failing repeatedly (same loop, same tool, same target)
  for (const [key, n] of Object.entries(x.fails)) {
    if (n < 2) continue
    const [, tool, ...rest] = key.split('|')
    const target = clean(rest.join('|'), 40)
    out.push({ id: `fail:${key}`, level: 'warn', text: `Same call failed ${n} times: ${tool} ${target}`,
      why: `${tool} ${target} failed ${n} times this turn. Rather than retrying the same approach, ask Claude to find the cause of the failure first.` })
  }
  // 3. Sharp cache hit rate drop (only when the gap can't be explained by expiry)
  const steps = x.flow.filter(i => i.kind === 'step' && i.endedAt !== undefined)
  for (let k = 1; k < steps.length; k++) {
    const prev = steps[k - 1]!
    const cur = steps[k]!
    const gap = cur.startedAt - (prev.endedAt ?? cur.startedAt)
    if (gap >= CACHE_TTL_MS || !cacheDropped(prev, cur)) continue
    const at = new Date(cur.startedAt).toTimeString().slice(0, 5)
    out.push({ id: `cache:${cur.id}`, level: 'warn', text: `Cache hit rate ${pctText(hitRate(prev)!)} → ${pctText(hitRate(cur)!)} (request ${at})`,
      why: `Only ${Math.round(gap / 1000)}s after the previous request, so this is unlikely to be cache expiry (5 min). ${Math.round((cur.tokIn ?? 0) / 1000)}k new input tokens were processed without cache. Likely cause: the start of the prompt (CLAUDE.md, system instructions) or the connected tool list changed during the session.` })
  }
  // 4. Same range read again without edits (same path, offset, limit, and the file wasn't edited in between)
  const tools = x.flow.filter(i => i.kind === 'tool').sort((a, b) => a.startedAt - b.startedAt)
  const reads = new Map<string, number>()
  for (const i of tools) {
    if (i.readKey) reads.set(i.readKey, (reads.get(i.readKey) ?? 0) + 1)
    else if (i.path) for (const k of [...reads.keys()]) if (k.startsWith(`${i.path}|`)) reads.delete(k)
  }
  for (const [k, n] of reads) {
    if (n < 3) continue
    const name = k.split('|')[0]!.split('/').pop()
    out.push({ id: `reread:${k}`, level: 'tip', text: `${name}: same range read ${n} times without edits`,
      why: `${name} had the same range read ${n} times this turn with no edits. Each re-read adds input tokens. Ask Claude to reuse what it already read, or read only the range it needs.` })
  }
  // 5. Usage limit forecast (only at 50% or more and when reached within 30 min, assuming the current rate holds)
  //    Without a forecast, at 90% or more just note that little is left (it can block before the reset comes).
  for (const l of x.limits) {
    const name = LIMIT_NAME[l.kind] ?? l.kind
    if (l.pct >= 90 && (l.eta === undefined || l.eta > 30 * 60_000)) {
      out.push({ id: `limit:${l.kind}:high`, level: 'warn', text: `${name} usage limit ${Math.round(l.pct)}% used`,
        why: `Once the limit is hit, requests are blocked until the window resets. ${Math.max(0, 100 - Math.round(l.pct))}% remains. Push large tasks past the reset, or split them onto a smaller model.` })
      continue
    }
    if (l.pct < 50 || l.eta === undefined || l.eta > 30 * 60_000) continue
    out.push({ id: `limit:${l.kind}`, level: 'warn', text: `${name} usage limit ${Math.round(l.pct)}% · reached in ${secs(Math.round(l.eta))} at this rate`,
      why: `This forecast assumes the average rate since the window started continues. It changes if your pace changes.` })
  }
  return [...out.filter(a => a.level === 'warn'), ...out.filter(a => a.level === 'tip')]
}

// Key session log events: prompts, subagents, answers, compact, server tools, failed tools and requests, cache-drop requests.
// Normal tool calls and requests are already shown by TURN FLOW and SESSION MAP, so the default view leaves them out.
export const isKeyLog = (l: { kind: LogKind; ok: boolean; meta: string }) =>
  l.kind === 'prompt' || l.kind === 'agent' || l.kind === 'answer' || l.kind === 'compact' || l.kind === 'server' ||
  !l.ok || (l.kind === 'step' && l.meta.includes('⟳↓'))

// Sparkline: values in eight steps ▁▂▃▄▅▆▇█. 0 is the lowest cell.
export function spark(values: number[]): string {
  const max = Math.max(0, ...values)
  const G = '▁▂▃▄▅▆▇█'
  return values.map(v => (max > 0 ? G[Math.min(7, Math.round((v / max) * 7))]! : G[0]!)).join('')
}

// Braille sparkline: one braille cell (⣿) holds two values in its left and right columns (0~4 dots high). Twice the block sparkline in the same width.
// With an odd count, pad the front so the last value always lands in the right column of the last cell. Values above 0 get at least 1 dot.
export function brailleSpark(values: number[]): string {
  const max = Math.max(0, ...values)
  const L = [0, 0x40, 0x44, 0x46, 0x47]
  const R = [0, 0x80, 0xa0, 0xb0, 0xb8]
  const lv = (v?: number) => (v === undefined || max <= 0 ? 0 : Math.max(v > 0 ? 1 : 0, Math.round((v / max) * 4)))
  const vs: (number | undefined)[] = values.length % 2 ? [undefined, ...values] : values
  let s = ''
  for (let i = 0; i < vs.length; i += 2) s += String.fromCharCode(0x2800 + L[lv(vs[i])]! + R[lv(vs[i + 1])]!)
  return s
}

// Line gauge (same shape as Ratatui's LineGauge): filled part ━, rest ─. Returned as two pieces so each can be colored.
export function lineGauge(pct: number, w: number): [string, string] {
  const f = Math.round((Math.max(0, Math.min(100, pct)) / 100) * w)
  return ['━'.repeat(f), '─'.repeat(w - f)]
}

// Row card placement: position (row inside the area) and lines (width w) of the full-content card for row i of an area rows tall.
// The card covers the hovered row itself and runs downward; near the bottom it shifts up so it never leaves the area
// (if a card overlaps a section border row, that row's text isn't drawn). Overflow shortens the last line with ….
export function rowCard(full: string, i: number, rows: number, w: number): { top: number; lines: string[] } {
  const all = wrapLines(full, w)
  const k = Math.max(1, Math.min(all.length, rows))
  const lines = all.slice(0, k)
  if (all.length > k) lines[k - 1] = fit(lines[k - 1]!, w - 1).trimEnd() + '…'
  return { top: Math.max(0, Math.min(i, rows - k)), lines }
}

// Line wrap by character width (w). Collapses whitespace. Drawing the card's left bar (▌) on each line needs the line count up front.
export function wrapLines(full: string, w: number): string[] {
  const all: string[] = []
  let cur = ''
  let cw = 0
  for (const ch of full.replace(/\s+/g, ' ').trim()) {
    const c = displayWidth(ch)
    if (cw + c > w) { all.push(cur); cur = ''; cw = 0 }
    if (ch === ' ' && cw === 0) continue // a wrapped line never starts with a space
    cur += ch
    cw += c
  }
  if (cur) all.push(cur)
  return all
}

// hover scope names are limited to 64 chars, so trimming long keys would collide. Keep a prefix and add a hash of the full key.
export function scopeKey(prefix: string, key: string): string {
  let h = 5381
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0
  return `${prefix}${key.slice(0, 40)}~${h.toString(36)}`
}

// Auto-update check interval. session.start fires again on every plugin reload, so don't check again in between.
export const UPDATE_EVERY_MS = 3600_000

// Whether to check for updates: the setting is on, installed from the Goyangi marketplace, and the interval has passed since the last check.
// Installs live at <config dir>/plugins/cache/<marketplace>/<plugin>/<version> ($.plugin.root). Dev copies (other marketplaces, --plugin-dir) are not checked.
export function shouldCheckUpdate(enabled: boolean, root: string, lastAt: unknown, now: number): boolean {
  if (!enabled || !/[/\\]plugins[/\\]cache[/\\]goyangi[/\\]goyangi[/\\]/.test(root)) return false
  return typeof lastAt !== 'number' || now - lastAt >= UPDATE_EVERY_MS
}

// Read from the last JSON line of `claude plugin update --json` whether it moved to a new version. undefined if unchanged or unreadable.
export function updatedVersion(stdout: string): { from: string; to: string } | undefined {
  const line = stdout.trim().split('\n').reverse().find(l => l.startsWith('{'))
  if (!line) return undefined
  try {
    const r = JSON.parse(line) as { updateOutcome?: string; oldVersion?: string; newVersion?: string }
    return r.updateOutcome === 'updated' && r.newVersion ? { from: r.oldVersion ?? '', to: r.newVersion } : undefined
  } catch { return undefined }
}

// Walk view: each loop (main, subagents) gets a pixel character showing what it's doing now on its work path.
// pose is the character's posture, prop the item placed beside it (tool class letter, or think, rest), what the status name.
// run is a model request in flight (running to the next step), think is waiting (chin on hand), work is running a tool.
// sleep is dozing while idle after the turn (deskOf gives think; the renderer turns it into sleep when idle).
export type Pose = 'run' | 'think' | 'work' | 'fail' | 'sleep'
const PROP_NAME: Record<string, string> = {
  b: 'Running a command', r: 'Reading', e: 'Editing code', s: 'Searching', w: 'Browsing the web', m: 'Calling MCP', k: 'Running a skill', a: 'Delegating', o: 'Running a tool',
}
export function deskOf(l: Pick<Loop, 'status' | 'activity'>): { pose: Pose; prop: string; what: string } {
  if (l.status === 'failed') return { pose: 'fail', prop: 'rest', what: 'Something went wrong' }
  if (l.status === 'done') return { pose: 'think', prop: 'rest', what: 'Done' }
  if (l.status === 'thinking') return { pose: 'run', prop: 'think', what: 'Requesting model' }
  if (l.status === 'tool') {
    const prop = toolClass(l.activity.split(' ')[0] ?? '')
    return { pose: 'work', prop, what: PROP_NAME[prop]! }
  }
  return { pose: 'think', prop: 'rest', what: 'Waiting' }
}

// Pixel art: each character cell holds 2 × 4 pixels drawn with octant characters (Unicode 16). Pixels are nearly square.
// grid is a list of pixel rows; each letter uses a color from pal. Letters not in pal ('.') are empty.
// A cell can only paint a foreground and a background color, so keep the two most used in the cell (empty included).
// If empty is one of the two, all other colored pixels take the foreground; otherwise empty pixels take the background.
// OCTANT[m]: the character drawing pixel bits m (1 2 / 3 4 / 5 6 / 7 8 as 1, 2, 4 ... 128). The 26 drawable with existing block characters use those.
const OCTANT = Array.from(" 𜺨𜺫🮂𜴀▘𜴁𜴂𜴃𜴄▝𜴅𜴆𜴇𜴈▀𜴉𜴊𜴋𜴌🯦𜴍𜴎𜴏𜴐𜴑𜴒𜴓𜴔𜴕𜴖𜴗𜴘𜴙𜴚𜴛𜴜𜴝𜴞𜴟🯧𜴠𜴡𜴢𜴣𜴤𜴥𜴦𜴧𜴨𜴩𜴪𜴫𜴬𜴭𜴮𜴯𜴰𜴱𜴲𜴳𜴴𜴵🮅𜺣𜴶𜴷𜴸𜴹𜴺𜴻𜴼𜴽𜴾𜴿𜵀𜵁𜵂𜵃𜵄▖𜵅𜵆𜵇𜵈▌𜵉𜵊𜵋𜵌▞𜵍𜵎𜵏𜵐▛𜵑𜵒𜵓𜵔𜵕𜵖𜵗𜵘𜵙𜵚𜵛𜵜𜵝𜵞𜵟𜵠𜵡𜵢𜵣𜵤𜵥𜵦𜵧𜵨𜵩𜵪𜵫𜵬𜵭𜵮𜵯𜵰𜺠𜵱𜵲𜵳𜵴𜵵𜵶𜵷𜵸𜵹𜵺𜵻𜵼𜵽𜵾𜵿𜶀𜶁𜶂𜶃𜶄𜶅𜶆𜶇𜶈𜶉𜶊𜶋𜶌𜶍𜶎𜶏▗𜶐𜶑𜶒𜶓▚𜶔𜶕𜶖𜶗▐𜶘𜶙𜶚𜶛▜𜶜𜶝𜶞𜶟𜶠𜶡𜶢𜶣𜶤𜶥𜶦𜶧𜶨𜶩𜶪𜶫▂𜶬𜶭𜶮𜶯𜶰𜶱𜶲𜶳𜶴𜶵𜶶𜶷𜶸𜶹𜶺𜶻𜶼𜶽𜶾𜶿𜷀𜷁𜷂𜷃𜷄𜷅𜷆𜷇𜷈𜷉𜷊𜷋𜷌𜷍𜷎𜷏𜷐𜷑𜷒𜷓𜷔𜷕𜷖𜷗𜷘𜷙𜷚▄𜷛𜷜𜷝𜷞▙𜷟𜷠𜷡𜷢▟𜷣▆𜷤𜷥█")
// Terminals whose fonts draw octant characters (Unicode 16): Ghostty, kitty, WezTerm. The variables other than TERM pass through tmux.
// Anywhere else (Obsidian's terminal, iTerm2, Terminal.app, VS Code) the octants come out as missing-glyph boxes or too wide, which breaks the layout.
export function octantTerminal(env: { TERM?: string; TERM_PROGRAM?: string; KITTY_WINDOW_ID?: string; GHOSTTY_RESOURCES_DIR?: string; WEZTERM_EXECUTABLE?: string }): boolean {
  return /kitty|ghostty/i.test(env.TERM ?? '') || /ghostty|wezterm/i.test(env.TERM_PROGRAM ?? '') || !!(env.KITTY_WINDOW_ID || env.GHOSTTY_RESOURCES_DIR || env.WEZTERM_EXECUTABLE)
}
// QUADRANT[m]: the block character drawing quadrant bits m (1 2 / 4 8 as top left, top right, bottom left, bottom right). Block Elements, drawn by every monospace font.
const QUADRANT = Array.from(' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█')
export type DotSeg = { text: string; fg?: string; bg?: string }
// The eyes and the nose of a cat or dog sprite for quadrant drawing: every E (open eyes), and every D inside the head (x 10 to 13, down to row 9: the nose, and closed
// eyes when asleep), which leaves the ears' gray and the back's patch alone. A vertical run of such pixels becomes one quadrant (two pixel rows) at its last row, keyed
// "x,quadrant row", with the letter to draw; skip lists the pixels the quadrants replace, so a two-row eye isn't drawn twice and doesn't spill into the next quadrant.
export type FaceKeep = { quads: Map<string, string>; skip: Set<string>; fill: string }
// layout moves the features to given columns: the two eyes, and the nose between them one row of quadrants below (asleep too: closed eyes, then the nose under
// them), so a head that is wider than the cat's can still read like the cat's face.
export function faceKeep(grid: readonly string[], ref: readonly string[] = grid, layout?: { eyes: [number, number]; nose: number }): FaceKeep {
  const quads = new Map<string, string>(), skip = new Set<string>()
  // Where the eyes sit in the reference pose (the character at work): a pose with several strokes in a column (crossed eyes) draws its eyes in that row of quadrants
  const wanted = new Set<number>()
  ref.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'E' && ref[y + 1]?.[x] !== 'E') wanted.add(y >> 1) }))
  // Only the outer two columns of E count as eyes: the crossed eyes of a failed pet have strokes between them that would run together into one dark block
  const eyeCols = grid.flatMap(r => [...r].flatMap((c, x) => (c === 'E' ? [x] : [])))
  const [left, right] = [Math.min(...eyeCols), Math.max(...eyeCols)]
  grid.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'E' && x !== left && x !== right) skip.add(`${x},${y}`) }))
  const isFace = (x: number, y: number) => { const c = grid[y]?.[x]; return (c === 'E' && (x === left || x === right)) || (c === 'D' && x >= 10 && x <= 13 && y <= 9) ? c : undefined }
  for (const letter of ['E', 'D']) for (let x = 0; x < 16; x++) for (let y = 0; y < grid.length; y++) {
    const c = isFace(x, y)
    if (c !== letter || isFace(x, y - 1) === c) continue
    let end = y
    while (isFace(x, end + 1) === c) end++
    for (let r = y; r <= end; r++) skip.add(`${x},${r}`)
    // a column has one eye: the lower strokes of a crossed eye are dropped, not drawn as a second quadrant
    if (c === 'E') {
      const had = [...quads].find(([k, v]) => v === 'E' && k.startsWith(`${x},`))
      if (had) {
        // keep the run in the reference pose's row of quadrants; otherwise the upper one stays
        if (!wanted.has(end >> 1) || wanted.has(Number(had[0].split(',')[1]))) continue
        quads.delete(had[0])
      }
    }
    // The quadrant holding the run's last pixel row; a nose that would share a row of quadrants with the eyes goes one row down, since a cell has room for two colors only
    let qr = end >> 1
    if (c === 'D' && [...quads].some(([k, v]) => v === 'E' && Number(k.split(',')[1]) === qr)) qr++
    quads.set(`${x},${qr}`, c)
  }
  if (layout) {
    const eyes = [...quads].filter(([, v]) => v === 'E').map(([k]) => Number(k.split(',')[1]))
    const dark = [...quads].filter(([, v]) => v === 'D').map(([k]) => Number(k.split(',')[1]))
    quads.clear()
    if (eyes.length) {
      for (const x of layout.eyes) quads.set(`${x},${eyes[0]}`, 'E')
      if (dark.length) quads.set(`${layout.nose},${Math.min(...dark)}`, 'D')
    } else if (dark.length) {
      // asleep: closed eyes in the first row of dark quadrants, the nose one row below
      const r = Math.min(...dark)
      for (const x of layout.eyes) quads.set(`${x},${r}`, 'D')
      quads.set(`${layout.nose},${r + 1}`, 'D')
    }
  }
  return { quads, skip, fill: 'L' }
}
// blocks: draw with quadrant characters instead of octants. A cell keeps its size; each quadrant takes the color of the upper of its two pixel rows, or the lower one
// when the upper is empty, so the shape stays. keep (faceKeep) fixes the eyes and the nose to one quadrant each, and they win as one of a cell's two colors, so they stay
// whole instead of blurring into the head.
export function dotRows(grid: readonly string[], pal: Record<string, string>, blocks = false, keep?: FaceKeep): DotSeg[][] {
  const out: DotSeg[][] = []
  const w = Math.max(0, ...grid.map(r => r.length))
  for (let y = 0; y < grid.length; y += 4) {
    const segs: DotSeg[] = []
    for (let x = 0; x < w; x += 2) {
      const px: (string | undefined)[] = []
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) px.push(pal[grid[y + dy]?.[x + dx] ?? '.'])
      let keepColor: string | undefined
      const cellPx: (string | undefined)[] = blocks ? [0, 1, 4, 5].map(i => {
        const qx = x + (i & 1), up = y + (i >> 1), qr = up >> 1
        const face = keep?.quads.get(`${qx},${qr}`)
        if (face) { keepColor ??= pal[face]; return pal[face] }
        const upper = keep?.skip.has(`${qx},${up}`) ? pal[keep.fill] : px[i], lower = keep?.skip.has(`${qx},${up + 1}`) ? pal[keep.fill] : px[i + 2]
        return upper ?? lower
      }) : px
      // A cell holds two colors and the empty pixels count as a third: next to a feature, the empty pixels take the head's color so the feature stays and no dark gap opens
      if (keepColor) {
        const others = cellPx.filter((c): c is string => c !== undefined && c !== keepColor)
        const fill = others.sort((x, y) => others.filter(c => c === y).length - others.filter(c => c === x).length)[0]
        if (fill && cellPx.includes(undefined)) for (let i = 0; i < cellPx.length; i++) cellPx[i] ??= fill
      }
      const table = blocks ? QUADRANT : OCTANT
      const count = new Map<string, number>()
      for (const c of cellPx) count.set(c ?? '', (count.get(c ?? '') ?? 0) + 1)
      let [c1, c2] = [...count.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])
      if (keepColor && c1 !== keepColor && c2 !== keepColor) c2 = keepColor
      let cell: DotSeg
      if (c1 === '' && c2 === undefined) cell = { text: ' ' }
      else if (c1 === '' || c2 === '' || c2 === undefined) {
        const fg = c1 === '' ? c2! : c1!
        cell = { text: table[cellPx.reduce((m, c, i) => (c ? m | (1 << i) : m), 0)]!, fg }
      } else cell = { text: table[cellPx.reduce((m, c, i) => (c && c !== c2 ? m | (1 << i) : m), 0)]!, fg: c1, bg: c2 }
      const last = segs[segs.length - 1]
      if (last && last.fg === cell.fg && last.bg === cell.bg) last.text += cell.text
      else segs.push(cell)
    }
    out.push(segs)
  }
  return out
}

// Draw the same pixel art as SVG (desktop). Web fonts lack octant glyphs, so dotRows can't draw it.
// One pixel is one viewBox unit; same-colored runs in a row are merged into one rect.
// If rows is taller than grid, pad the top to align the bottom (when standing a 12-pixel prop next to a 16-pixel robot).
export function dotSvg(grid: readonly string[], pal: Record<string, string>, rows = grid.length): string {
  const w = Math.max(0, ...grid.map(r => r.length))
  const h = Math.max(rows, grid.length)
  return dotScene(w, h, [{ grid, pal, x: 0, y: h - grid.length }])
}

// For terminal Image: the same pixel art as RGBA pixels (base64). An octant cell (2×4 pixels) holds only two colors, so
// small parts like eyes, mouth, and pincers merge colors; drawn as pixels they come out as drawn. Layout matches dotSvg; empty pixels are transparent.
// scale enlarges each dot to scale × scale pixels. Terminals smoothly stretch images to the cell size (Ghostty),
// and sending 16 pixels as is blurs the edges, so send it pre-scaled so the terminal barely stretches it.
export function dotRgba(grid: readonly string[], pal: Record<string, string>, rows = grid.length, scale = 1): { rgba: string; width: number; height: number } {
  const gw = Math.max(1, ...grid.map(r => r.length))
  const top = Math.max(rows, grid.length) - grid.length
  const width = gw * scale
  const height = (top + grid.length) * scale
  const px = new Uint8Array(width * height * 4)
  grid.forEach((r, gy) => {
    for (let gx = 0; gx < r.length; gx++) {
      const c = pal[r[gx]!]
      if (!c || !/^#[0-9a-f]{6}$/i.test(c)) continue
      const rgb = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255]
      for (let y = (gy + top) * scale; y < (gy + top + 1) * scale; y++)
        for (let x = gx * scale; x < (gx + 1) * scale; x++) px.set(rgb, (y * width + x) * 4)
    }
  })
  return { rgba: base64(px), width, height }
}

// Standard base64 (with padding). The mod environment has no Buffer or btoa.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export function base64(b: Uint8Array): string {
  let out = ''
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < b.length ? B64[(n >> 6) & 63]! : '=') + (i + 2 < b.length ? B64[n & 63]! : '=')
  }
  return out
}

// Whether the terminal draws Image as pixels: only kitty and Ghostty, which use the kitty graphics protocol (others leave only dim alt text).
// tmux doesn't pass graphics through. When unsure, return false and keep the current character art.
// The refresh icon, by what the terminal can draw: a Nerd Font symbol (nf-cod-refresh), else the Unicode arrow ↺, else a plain R. A program can't ask a terminal which fonts
// it has, so auto picks the Nerd Font symbol where the terminal ships its own symbol font (Ghostty, kitty, WezTerm; octantTerminal names them), the arrow in any UTF-8
// terminal, and the letter otherwise; the setting overrides it for a terminal whose font has the symbols (or lacks the arrow).
export type IconKind = 'nerd' | 'unicode' | 'ascii'
export const REFRESH_ICON: Record<IconKind, string> = { nerd: '\uEB37', unicode: '↺', ascii: 'R' }
export function iconKind(pref: 'auto' | IconKind, env: { TERM?: string; TERM_PROGRAM?: string; KITTY_WINDOW_ID?: string; GHOSTTY_RESOURCES_DIR?: string; WEZTERM_EXECUTABLE?: string; LC_ALL?: string; LC_CTYPE?: string; LANG?: string }): IconKind {
  if (pref !== 'auto') return pref
  if (octantTerminal(env)) return 'nerd'
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG
  return !locale || /utf-?8/i.test(locale) ? 'unicode' : 'ascii'
}
export function pixelTerminal(env: { TERM?: string; TERM_PROGRAM?: string; KITTY_WINDOW_ID?: string; TMUX?: string }): boolean {
  if (env.TMUX) return false
  return /kitty|ghostty/i.test(env.TERM ?? '') || /ghostty/i.test(env.TERM_PROGRAM ?? '') || !!env.KITTY_WINDOW_ID
}

// Place several pixel art layers on one w × h pixel canvas. Parts outside are clipped.
// extra is SVG not drawn on the pixel grid (flags, text), placed on top.
export type DotLayer = { grid: readonly string[]; pal: Record<string, string>; x: number; y: number }
export function dotScene(w: number, h: number, layers: readonly DotLayer[], extra = ''): string {
  let rects = ''
  for (const { grid, pal, x: lx, y: ly } of layers) {
    grid.forEach((r, gy) => {
      const y = ly + gy
      if (y < 0 || y >= h) return
      for (let x = 0; x < r.length;) {
        const c = pal[r[x]!]
        let e = x + 1
        while (e < r.length && pal[r[e]!] === c) e++
        const x0 = Math.max(0, lx + x)
        const x1 = Math.min(w, lx + e)
        if (c && x1 > x0) rects += `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="1" fill="${c}"/>`
        x = e
      }
    })
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}${extra}</svg>`
}

// Draw the finish flag as SVG (desktop). Same layout as the terminal flag (blank row, pole ▕ + numbered cloth + ▶, pole, pole)
// on a grid of 8 per cell × 16 per row (5 cells × 4 rows). Block characters don't fill cells in web fonts, so the pole breaks.
// mark is the text on the flag (step number, ✓, ✗); with three characters the cloth widens and the end triangle is dropped.
// flagShapes returns only the shapes without an svg tag (to place over other art as dotScene's extra).
export function flagShapes(mark: string, bg: string, pole: string): string {
  const cloth = mark.length < 3 ? 24 : 32
  const tip = mark.length < 3 ? `<polygon points="32,16 40,24 32,32" fill="${bg}"/>` : ''
  const text = mark.replace(/[<>&"]/g, '')
  return `<rect x="6" y="16" width="2" height="48" fill="${pole}"/><rect x="8" y="16" width="${cloth}" height="16" fill="${bg}"/>${tip}`
    + `<text x="${8 + cloth / 2}" y="28.5" text-anchor="middle" font-family="ui-monospace, monospace" font-size="12" font-weight="bold" fill="#0b1020">${text}</text>`
}
export function flagSvg(mark: string, bg: string, pole: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 64">${flagShapes(mark, bg, pole)}</svg>`
}

// Patches and shading: the body color at 62% brightness
const shade = (hex: string) => `#${[1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.62).toString(16).padStart(2, '0')).join('')}`

// Character pixels (16×16 = 8 cells × 4 rows), facing right, picked in the settings (character):
// Blocky pixel pets facing right, with front-facing heads. L body (character color), D darker body (grey patches, nose),
// O orange (patches, dog ears), Y yellow (dog collar), E dark (eyes), B brown (paw tips), N pink (tongue).
// cat: a calico cat with pointed ears, a raised tail, and four legs (default); dog: a dog with long orange ears, a collar, an upright tail, and four legs.
// Each pose alternates its frames: run trots and wags, think blinks, work wags, moves the ears, and sticks the tongue out, fail shows one X over the eyes (the renderer turns the body red),
// sleep lies down on folded legs with eyes closed and the tail tip rising and falling.
// Orange patches (and the dog's ears) on a yellow-to-amber body, like the amber subagent colors, turn deep orange so they still stand out.
export function patchOrange(body: string): string {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(body.slice(i, i + 2), 16))
  const max = Math.max(r!, g!, b!), min = Math.min(r!, g!, b!)
  const hue = max === min ? 0 : max === r ? (60 * (g! - b!)) / (max - min) : max === g ? 120 + (60 * (b! - r!)) / (max - min) : 240 + (60 * (r! - g!)) / (max - min)
  return hue >= 25 && hue <= 55 ? '#c2410c' : '#f97316'
}

// A pet's colors from its body color: shaded patches (D), orange patches (O), and the shared eyes, red, yellow, white, brown paws, pink tongue, and purple dark circles
export const look = (body: string) => ({ L: body, D: shade(body), O: patchOrange(body), E: '#0b1020', R: '#ef4444', Y: '#fde047', W: '#e5e7eb', B: '#8b5a2b', N: '#f472b6', V: '#7e5bab' })
export type Character = 'cat' | 'dog'
export const CHARACTERS: readonly Character[] = ['cat', 'dog']
// A saved character that no longer exists (robot, dino from earlier versions) falls back to the cat.
export const characterOf = (c?: string): Character => (CHARACTERS.includes(c as Character) ? (c as Character) : 'cat')
const ART: Record<Character, Record<Pose, readonly (readonly string[])[]>> = {
  cat: {
    run: [
      ['................', '................', '................', '..O......O.....D', '.L.......OO...DD', '.L.......OOLLLDD', '.L.......OLELELD', '.L.......OLELELD', '.L.......LLLDLLL', '.LLLDDDDLLLLLLLL', '.LLLDDDDLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LL.LL....LL.LL.', '.LL.BB....LL.BB.', '.BB.......BB....'],
      ['................', '................', '................', '.O.......O.....D', 'L........OO...DD', '.L.......OOLLLDD', '.L.......OLELELD', '.L.......OLELELD', '.L.......LLLDLLL', '.LLLDDDDLLLLLLLL', '.LLLDDDDLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LL.LL....LL.LL.', '.BB.LL....BB.LL.', '....BB.......BB.'],
    ],
    think: [
      ['................', '................', '................', '..O......O.....D', '.L.......OO...DD', '.L.......OOLLLDD', '.L.......OLELELD', '.L.......OLELELD', '.L.......LLLDLLL', '.LLLDDDDLLLLLLLL', '.LLLDDDDLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LL.LL....LL.LL.', '.LL.LL....LL.LL.', '.BB.BB....BB.BB.'],
      ['................', '................', '................', '..O......O.....D', '.L.......OO...DD', '.L.......OOLLLDD', '.L.......OLLLLLD', '.L.......OLDLDLD', '.L.......LLLDLLL', '.LLLDDDDLLLLLLLL', '.LLLDDDDLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LL.LL....LL.LL.', '.LL.LL....LL.LL.', '.BB.BB....BB.BB.'],
    ],
    work: [
      ['................', '................', '................', '..O......O.....D', '.L.......OO...DD', '.L.......OOLLLDD', '.L.......OLELELD', '.L.......OLELELD', '.L.......LLLDLLL', '.LLLDDDDLLLLLLLL', '.LLLDDDDLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LL.LL....LL.LL.', '.LL.LL....LL.LL.', '.BB.BB....BB.BB.'],
      ['................', '................', '................', '.O.......O......', 'L........OO....D', '.L.......OOLLLDD', '.L.......OLELELD', '.L.......OLELELD', '.L.......LLLDLLL', '.LLLDDDDLLLLNLLL', '.LLLDDDDLLLLNLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LL.LL....LL.LL.', '.LL.LL....LL.LL.', '.BB.BB....BB.BB.'],
    ],
    fail: [
      ['................', '................', '................', '..O......O.....D', '.L.......OO...DD', '.L.......OOLLLDD', '.L.......OLELELD', '.L.......OLLELLD', '.L.......LLEDELL', '.LLLDDDDLLLLLLLL', '.LLLDDDDLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LL.LL....LL.LL.', '.LL.LL....LL.LL.', '.BB.BB....BB.BB.'],
    ],
    sleep: [
      ['................', '................', '................', '................', '................', '.........O.....D', '.........OO...DD', '.........OOLLLDD', '.........OLLLLLD', '.........OLDLDLD', '.........LLLDLLL', 'OLLLDDDDLLLLLLLL', '.LLLDDDDLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.BBBBB...BBBBBB.'],
      ['................', '................', '................', '................', '................', '.........O.....D', '.........OO...DD', '.........OOLLLDD', '.........OLLLLLD', '.........OLDLDLD', 'O........LLLDLLL', '.LLLDDDDLLLLLLLL', '.LLLDDDDLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.BBBBB...BBBBBB.'],
    ],
  },
  dog: {
    run: [
      ['................', '................', '................', '................', '..........LLLL..', '........OOELLEOO', '........OOELLEOO', '.L......OOLDDLOO', '.L......OOLLLLOO', '.LLLLLLLLOYYYYOL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LL.LL....LL.LL.', '.LL.BB....LL.BB.', '.BB.......BB....'],
      ['................', '................', '................', '................', '..........LLLL..', '........OOELLEOO', '........OOELLEOO', 'L.......OOLDDLOO', '.L......OOLLLLOO', '.LLLLLLLLOYYYYOL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LL.LL....LL.LL.', '.BB.LL....BB.LL.', '....BB.......BB.'],
    ],
    think: [
      ['................', '................', '................', '................', '..........LLLL..', '........OOELLEOO', '........OOELLEOO', '.L......OOLDDLOO', '.L......OOLLLLOO', '.LLLLLLLLOYYYYOL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LL.LL....LL.LL.', '.LL.LL....LL.LL.', '.BB.BB....BB.BB.'],
      ['................', '................', '................', '................', '..........LLLL..', '........OOLLLLOO', '........OOELLEOO', '.L......OOLDDLOO', '.L......OOLLLLOO', '.LLLLLLLLOYYYYOL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LL.LL....LL.LL.', '.LL.LL....LL.LL.', '.BB.BB....BB.BB.'],
    ],
    work: [
      ['................', '................', '................', '................', '..........LLLL..', '........OOELLEOO', '........OOELLEOO', '.L......OOLDDLOO', '.L......OOLLLLOO', '.LLLLLLLLOYYYYOL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LL.LL....LL.LL.', '.LL.LL....LL.LL.', '.BB.BB....BB.BB.'],
      ['................', '................', '................', '................', '........OOLLLLOO', '........OOELLEOO', '........OOELLEOO', 'L.......OOLDDLOO', '.L......OOLNNLOO', '.LLLLLLLLLYNNYLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LL.LL....LL.LL.', '.LL.LL....LL.LL.', '.BB.BB....BB.BB.'],
    ],
    fail: [
      ['................', '................', '................', '................', '..........LLLL..', '........OOELLEOO', '........OOLEELOO', '.L......OOEDDEOO', '.L......OOLLLLOO', '.LLLLLLLLOYYYYOL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LL.LL....LL.LL.', '.LL.LL....LL.LL.', '.BB.BB....BB.BB.'],
    ],
    sleep: [
      ['................', '................', '................', '................', '................', '................', '..........LLLL..', '........OOLLLLOO', '........OODLLDOO', '........OOLDDLOO', '........OOLLLLOO', 'LLLLLLLLLOYYYYOL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.BBBB....BBBBBB.'],
      ['................', '................', '................', '................', '................', '................', '..........LLLL..', '........OOLLLLOO', '........OODLLDOO', '........OOLDDLOO', 'L.......OOLLLLOO', '.LLLLLLLLOYYYYOL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.LLLLLLLLLLLLLLL', '.BBBB....BBBBBB.'],
    ],
  },
}
export const sprite = (pose: Pose, frame: number, character?: string): readonly string[] => {
  const s = ART[characterOf(character)][pose]
  return s[frame % s.length]!
}

// The pet in the minimized view: 8 × 4 pixels, one row of 4 cells. Each octant cell holds two colors, so the cat's ears stay body color and
// only the eye (E) and the dog's ear (D) stand apart. Legs go in a back and a front pair, like the full sprite. Two walking frames; resting uses the first.
const MINI: Record<Character, readonly (readonly string[])[]> = {
  cat: [['.L...L.L', '.L...LEL', '.LLLLLLL', '.LL..LL.'], ['.L...L.L', 'L....LEL', '.LLLLLLL', 'L.L.L..L']],
  dog: [['.....LLL', 'L...DLEL', '.LLLLLLL', '.LL..LL.'], ['.....LLL', '.L..DLEL', '.LLLLLLL', 'L.L.L..L']],
}
export const miniSprite = (frame: number, character?: string): readonly string[] => MINI[characterOf(character)][frame % 2]!

// Walk view metrics carried by the main pet, so the session reads at a glance without numbers:
// tired eyes (narrowed, with dark circles) from 3/4 of the context alert and a half-pace gait (heavy) from the alert itself; a turn cost level
// drawn as a growing mark floating over the back (levels at 15%, 50%, and 100% of the cost alert; without an alert, $0.3 and $1 and never level 3);
// and a sky that turns to dusk from 60% of the 5h usage limit and to night from 90%. An alert of 0 turns its part off.
export type PetMood = { tired: boolean; heavy: boolean; cost: 0 | 1 | 2 | 3; sky: 'day' | 'dusk' | 'night' }
export function petMood(m: { ctxPct: number; ctxAlert: number; cost?: number; costAlert: number; limitPct?: number }): PetMood {
  const c = m.cost ?? 0
  const cost = m.costAlert > 0
    ? c >= m.costAlert ? 3 : c >= m.costAlert * 0.5 ? 2 : c >= m.costAlert * 0.15 ? 1 : 0
    : c >= 1 ? 2 : c >= 0.3 ? 1 : 0
  const l = m.limitPct ?? 0
  return {
    tired: m.ctxAlert > 0 && m.ctxPct >= m.ctxAlert * 0.75,
    heavy: m.ctxAlert > 0 && m.ctxPct >= m.ctxAlert,
    cost,
    sky: l >= 90 ? 'night' : l >= 60 ? 'dusk' : 'day',
  }
}

// Pixels drawn over the pet for its mood, as [x, y, palette letter], all inside the 16 × 16 sprite.
// Tired: the lower half of each open eye turns into a purple dark circle (V), so the eyes narrow and the circles sit apart from the nose.
// Closed or crossed eyes are left alone. shake: right after a compaction the pet shakes it off with sparkles (Y) around it.
export function petPixels(character: string | undefined, pose: Pose, frame: number, mood: PetMood, shake = false): [number, number, string][] {
  const out: [number, number, string][] = []
  const k = frame % 2
  const lying = pose === 'sleep'
  if (mood.tired && !lying) {
    const base = sprite(pose, frame, character)
    for (const [x, y] of characterOf(character) === 'dog' ? [[10, 6], [13, 6]] : [[11, 7], [13, 7]])
      if (base[y!]![x!] === 'E' && base[y! - 1]![x!] === 'E') out.push([x!, y!, 'V'])
  }
  if (shake && !lying) for (const [x, y] of k ? [[0, 6], [15, 1], [5, 7], [12, 1]] : [[1, 2], [14, 2], [4, 6], [10, 1]]) out.push([x!, y!, 'Y'])
  return out
}

// Past turn replay in the walk view: the pet walks one spot every 2 seconds (running the first second, then thinking on a model request,
// working on other spots, or failing), rests on the last spot for 2 seconds, and starts over. ms is the time since the replay opened.
export function replayAt(st: readonly Station[], ms: number): { at: number; pose: Pose } {
  const i = Math.floor(Math.max(0, ms) / 2000) % (st.length + 1)
  if (i === st.length) return { at: st.length - 1, pose: 'sleep' }
  const s = st[i]!
  return { at: i, pose: ms % 2000 < 1000 ? 'run' : s.state === 'fail' ? 'fail' : s.node?.kind === 'step' ? 'think' : 'work' }
}

// The turn cost mark floating over the back, growing by level the way sleep's z grows to Z: $, s$, sS$.
// at is its first cell in the sprite's top row (2 pixels per cell). A single $ shifts a cell on alternate frames;
// longer marks stay put and appear one character per frame (s, sS, sS$), vanish for a frame, then start over.
export function costMark(level: number, frame: number): { at: number; text: string } {
  const full = ['', '$', 's$', 'sS$'][level] ?? ''
  return full.length === 1 ? { at: 2 + (frame % 2), text: full } : { at: 2, text: full.slice(0, (frame + 1) % (full.length + 1)) }
}

// Paint pixels over a sprite. Pixels outside the grid are dropped, so the art keeps its size on every render path.
export function overlay(grid: readonly string[], px: readonly [number, number, string][]): string[] {
  const rows = grid.map(r => Array.from(r))
  for (const [x, y, c] of px) if (rows[y] && x >= 0 && x < rows[y]!.length) rows[y]![x] = c
  return rows.map(r => r.join(''))
}

// Prop pixels (12 pixels wide, all 3 rows high). Props with more than one frame animate screen text, the globe spinning, lights, steam, thought dots.
// Borders and contents (text, lights, books) sit in different cells so each cell (2×4 pixels) holds two colors.
// The monitor is a small 8×10 pixel screen (8×6 with border, 6×4 inside) on a stand. One cell holds two colors, so
// the top border goes in a cell apart from the screen text (bottom of the top row's cells) to draw all four sides. So it's 3 rows high with a mostly empty top row.
// Screen text uses one color per cell.
const MON = (rows: string[]) => ['........', '........', '........', 'MMMMMMMM', ...rows.map(r => `M${r.slice(1, -1)}M`), 'MMMMMMMM', '...MM...', '..MMMM..', '........']
const PROPS: Record<string, readonly (readonly string[])[]> = {
  // Terminal: green text and a blinking cursor
  b: [MON(['MGGGGGGM', 'MGLLGGGM', 'MGLLLLGM', 'MGLGGGGM']), MON(['MGGGGGGM', 'MGLLGGGM', 'MGLLLLGM', 'MGGGGGGM'])],
  // Code editor: code lines grow, one color per cell
  e: [MON(['MGGGGGGM', 'MGYYUUGM', 'MGGYUGGM', 'MGYYGGGM']), MON(['MGGGGGGM', 'MGYYUUGM', 'MGGYUGGM', 'MGYYUUGM'])],
  // Finished monitor: screen off with a green check in the middle (terminal, code editor, skill, and other tools at finished spots)
  done: [MON(['MGGGGGGM', 'MGGGGLGM', 'MGLGLGGM', 'MGGLGGGM'])],
  // Bookshelf: one-colored spines per cell
  r: [['WWWWWWWWWW', 'W12233441W', 'W12233441W', 'W12233441W', 'WWWWWWWWWW', 'W43311224W', 'W43311224W', 'W43311224W', 'WWWWWWWWWW', 'W........W', 'W........W', 'WW......WW']],
  // Magnifier: sweeps left and right
  s: [
    ['..OOOO....', '.O....O...', 'O......O..', 'O......O..', 'O......O..', '.O....O...', '..OOOOO...', '......OO..', '.......OO.', '........OO', '..........', '..........'],
    ['...OOOO...', '..O....O..', '.O......O.', '.O......O.', '.O......O.', '..O....O..', '...OOOOO..', '.......OO.', '........OO', '.........O', '..........', '..........'],
  ],
  // Globe: continents spin
  w: [
    ['...UUUU...', '..UTTUUU..', '.UTTTUUTU.', '.UUTTUTTU.', '.UUUUTTTU.', '.UUUUUTTU.', '..UUUUTU..', '...UUUU...', '....WW....', '....WW....', '..WWWWWW..', '..........'],
    ['...UUUU...', '..UUTTUU..', '.UUUTTTUU.', '.TUUUTTUT.', '.TTUUUUTU.', '.TUUUUUTU.', '..UUUUUU..', '...UUUU...', '....WW....', '....WW....', '..WWWWWW..', '..........'],
  ],
  // Server rack: lights blink
  m: [
    ['MMMMMMMMMM', 'MGGGGGGGGM', 'MGGGGGGGGM', 'MGGGGGGGGM', 'MGLGCGLGGM', 'MGGGGGGGGM', 'MGGGGGGGGM', 'MGLGCGLGGM', 'MMMMMMMMMM', 'M........M', 'M........M', 'MM......MM'],
    ['MMMMMMMMMM', 'MGGGGGGGGM', 'MGGGGGGGGM', 'MGGGGGGGGM', 'MGCGLGCGGM', 'MGGGGGGGGM', 'MGGGGGGGGM', 'MGCGLGCGGM', 'MMMMMMMMMM', 'M........M', 'M........M', 'MM......MM'],
  ],
  // Door: handing work to a subagent (a), or entering at the start of a turn (door)
  a: [['.WWWWWWWW.', '.WDDDDDDW.', '.WDWWWWDW.', '.WDWDDWDW.', '.WDWWWWDW.', '.WDDDDDDW.', '.WDDDDCDW.', '.WDDDDDDW.', '.WDWWWWDW.', '.WDWDDWDW.', '.WDWWWWDW.', '.WDDDDDDW.']],
  // Thought bubble: dots appear one by one
  think: [
    ['..OOOOOO..', '.OOOOOOOO.', '.OOKOOOOO.', '.OOOOOOOO.', '..OOOOOO..', '..........', '.OO.......', '.OO.......', 'O.........', '..........', '..........', '..........'],
    ['..OOOOOO..', '.OOOOOOOO.', '.OOKOKOOO.', '.OOOOOOOO.', '..OOOOOO..', '..........', '.OO.......', '.OO.......', 'O.........', '..........', '..........', '..........'],
    ['..OOOOOO..', '.OOOOOOOO.', '.OOKOKOKO.', '.OOOOOOOO.', '..OOOOOO..', '..........', '.OO.......', '.OO.......', 'O.........', '..........', '..........', '..........'],
  ],
  // Coffee cup: steam rises
  rest: [
    ['...O.O....', '..O.O.....', '..........', '..........', '.CCCCCC...', '.CDDDDCCC.', '.CDDDDC.C.', '.CCCCCCCC.', 'WWWWWWWWWW', 'W........W', 'W........W', 'W........W'],
    ['....O.O...', '...O.O....', '..........', '..........', '.CCCCCC...', '.CDDDDCCC.', '.CDDDDC.C.', '.CCCCCCCC.', 'WWWWWWWWWW', 'W........W', 'W........W', 'W........W'],
  ],
}
PROPS.k = PROPS.e!
PROPS.o = PROPS.e!
PROPS.door = PROPS.a!
// All props are 12 pixels wide. Blank cells are padded on the right, so octant cell boundaries stay and colors don't shift. Heights vary; the renderer puts each on the ground.
export const prop = (key: string, frame: number): readonly string[] => {
  const p = PROPS[key] ?? PROPS.o!
  return p[frame % p.length]!.map(r => r.padEnd(12, '.'))
}

// Walk view work path: this turn of one loop as a list of spots (columns), like the flow chart in the default view. The character stands at the spot being worked.
// main matches the flow chart columns: prompt (door), model requests, answer (coffee cup) are spots; tools and subagents called by a request are that spot's branches (kids).
// A subagent goes: entry door, work spot (its tools as branches), then a coffee cup when done (subagent model requests aren't in the flow chart).
// prop is the item at the spot. A running spot shows the running tool's prop (or a thought bubble); a finished spot shows the last tool's prop.
// state is run if the node or any branch is running. If only delegation (subagent branches) is still running, it counts as finished (main moves on).
// node is the flow chart node of a main spot (used to show the model request's tokens and cost).
export type Station = { id: string; prop: string; label: string; state: 'run' | 'ok' | 'fail'; startedAt: number; kids: FlowItem[]; node?: FlowItem }
const kidProp = (i: FlowItem) => (i.kind === 'agent' ? 'a' : toolClass(i.label.split(' ')[0] ?? ''))
function workProp(kids: readonly FlowItem[], thinking: boolean): string {
  const live = kids.filter(k => k.endedAt === undefined && k.kind === 'tool')
  if (live.length) return kidProp(live[live.length - 1]!)
  if (thinking || kids.length === 0) return 'think'
  return kidProp(kids[kids.length - 1]!)
}
export function stations(flow: FlowItem[], l: Pick<Loop, 'status' | 'startedAt' | 'lastAt'>, agentId?: string): Station[] {
  if (!agentId) {
    const cols = flowColumns(flow.filter(i => !i.agentId))
    if (cols.length === 0) return [{ id: 'idle', prop: 'rest', label: 'Waiting', state: 'ok', startedAt: 0, kids: [] }]
    return cols.map(({ node, children }) => {
      const kids = children.map(c => c.item)
      const nodeRun = node.endedAt === undefined
      const run = nodeRun || kids.some(k => k.endedAt === undefined && k.kind === 'tool')
      const prop = node.kind === 'prompt' ? 'door' : node.kind === 'answer' ? 'rest' : workProp(kids, nodeRun)
      const label = node.kind === 'step' ? node.label.split(' → ')[0]! : node.kind
      return { id: node.id, prop, label, state: run ? 'run' : node.ok && kids.every(k => k.ok) ? 'ok' : 'fail', startedAt: node.startedAt, kids, node }
    })
  }
  const kids = flow.filter(i => i.agentId === agentId && i.kind === 'tool')
  const live = l.status === 'thinking' || l.status === 'tool'
  const at = l.startedAt ?? 0
  const out: Station[] = [
    { id: `in:${agentId}`, prop: 'door', label: 'Enter', state: 'ok', startedAt: at, kids: [] },
    { id: `work:${agentId}`, prop: workProp(kids, l.status === 'thinking'), label: 'Work', state: live ? 'run' : kids.every(k => k.ok) ? 'ok' : 'fail', startedAt: kids[0]?.startedAt ?? at, kids },
  ]
  if (l.status === 'done' || l.status === 'failed') out.push({ id: `end:${agentId}`, prop: 'rest', label: l.status === 'done' ? 'Done' : 'Failed', state: l.status === 'done' ? 'ok' : 'fail', startedAt: l.lastAt ?? at, kids: [] })
  return out
}

// Minimized walk track: main's spots as short tokens joined by ─. Steps show their number; the prompt is ▶ and the answer ■.
// The running spot also lists its tools' class letters (up to 6), drawn as colored blocks by the caller.
// Keeps the latest tokens that fit in w cells; hidden is the number of spots dropped from the front.
export type TrackTok = { text: string; state: Station['state']; kind: 'door' | 'step' | 'rest'; tools: string }
export function miniTrack(st: readonly Station[], w: number): { hidden: number; toks: TrackTok[] } {
  const toks: TrackTok[] = st.filter(s => s.id !== 'idle').map(s => {
    const kind = s.prop === 'door' ? 'door' : s.node?.kind === 'answer' ? 'rest' : 'step'
    const text = kind === 'door' ? '▶' : kind === 'rest' ? '■' : (s.label.match(/\d+/)?.[0] ?? '·')
    const tools = s.state === 'run' ? s.kids.slice(-6).map(k => (k.kind === 'agent' ? 'a' : toolClass(k.label.split(' ')[0] ?? ''))).join('') : ''
    return { text, state: s.state, kind, tools }
  })
  // Token width: separator 1 + text (+1 for the spinner on a running spot) + a space and tool blocks
  const width = (t: TrackTok) => 1 + displayWidth(t.text) + (t.state === 'run' ? 1 : 0) + (t.tools ? 1 + t.tools.length : 0)
  let used = 0
  let from = toks.length
  while (from > 0 && used + width(toks[from - 1]!) <= w - 3) used += width(toks[--from]!) // 3 cells reserved for '◂N'
  return { hidden: from, toks: toks.slice(from) }
}

// Open sessions: the JSON array `claude agents --json` prints (interactive and background sessions). Anything unreadable gives an empty list.
export function parsePeers(json: string): Peer[] {
  try {
    const a: unknown = JSON.parse(json)
    if (!Array.isArray(a)) return []
    // Oldest first, so a session keeps its number while newer ones open (the Sessions box and the sessions tool share it)
    return a.filter((x): x is Record<string, unknown> => !!x && typeof (x as { sessionId?: unknown }).sessionId === 'string')
      .sort((x, y) => Number(x.startedAt ?? 0) - Number(y.startedAt ?? 0)).map(x => ({
      sessionId: String(x.sessionId), name: String(x.name ?? String(x.sessionId).slice(0, 8)), cwd: String(x.cwd ?? ''), status: String(x.status ?? ''), kind: String(x.kind ?? ''), ...(typeof x.pid === 'number' ? { pid: x.pid } : {}),
    }))
  } catch { return [] }
}

// Handoff between sessions. send: this session's note goes to another session, where it arrives as a peer message.
// pull: a request goes to another session; Goyangi there answers it with its own note without a model turn,
// and a session without Goyangi reads the request as plain words and can answer with SendMessage.
export const PULL_MARK = '[goyangi:pull]'
export function handoffNote(x: { name: string; sessionId: string; cwd: string; prompt: string; files: readonly string[]; messages: readonly { role: string; text?: string }[] }): string {
  const clip = (s: string, n: number) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }
  const recent = x.messages.filter(m => (m.role === 'user' || m.role === 'assistant') && (m.text ?? '').trim()).slice(-6).map(m => `- ${m.role}: ${clip(m.text!, 300)}`)
  return [
    `Handoff from Claude Code session "${x.name}" (${x.sessionId}) in ${x.cwd}.`,
    x.prompt ? `Its current request: "${clip(x.prompt, 300)}"` : 'It has no request in progress.',
    x.files.length ? `Files it edited this turn: ${x.files.slice(0, 12).join(', ')}` : '',
    recent.length ? `Recent conversation:\n${recent.join('\n')}` : '',
    `The full conversation opens with: claude --resume ${x.sessionId}`,
  ].filter(Boolean).join('\n')
}
export const pullRequest = (fromId: string, fromName: string): string =>
  `${PULL_MARK} ${fromId}\nSession "${fromName}" asks for a handoff of this session. Reply to session ${fromId} with SendMessage: the current task, the files involved, the decisions so far, and what is left.`
// The id of the session asking, when the text is a pull request
export const pullFrom = (text: string): string | undefined => (text.startsWith(PULL_MARK) ? text.slice(PULL_MARK.length).trim().split(/\s/)[0] || undefined : undefined)
// Other coding agents running in cmux terminals, read from `cmux top --all --processes --flat --format tsv`
// (cpu, mem, count, kind, ref, parent, label). An agent process is matched by name and climbed up to its surface,
// and each surface counts once. The id `cmux:<workspace>:<surface>` addresses it for `cmux send` and `cmux read-screen`.
// ponytail: matched by process name, so an agent that runs as plain `node` (gemini) is missed; read argv if that matters.
export const AGENT_NAMES = ['codex', 'opencode', 'aider', 'gemini', 'cursor-agent', 'amp', 'goose', 'qwen', 'crush']
export function parseAgents(tsv: string): Peer[] {
  const parent = new Map<string, string>()
  const label = new Map<string, string>()
  const procs: { ref: string; name: string }[] = []
  // cmux's status tag per workspace and agent (ref `workspace:<uuid>:tag:codex`, under the workspace, titled Idle, Running, ...)
  const state = new Map<string, string>()
  for (const line of tsv.split('\n')) {
    const [, , , kind, ref, up, name = ''] = line.split('\t')
    if (!ref) continue
    parent.set(ref, up ?? '')
    label.set(ref, name)
    if (kind === 'process' && AGENT_NAMES.includes(name)) procs.push({ ref, name })
    const tag = kind === 'tag' ? /:tag:([\w-]+)$/.exec(ref)?.[1] : undefined
    if (tag && AGENT_NAMES.includes(tag) && name.trim()) state.set(`${up}|${tag}`, /^idle$/i.test(name.trim()) ? 'idle' : 'busy')
  }
  const out = new Map<string, Peer>()
  for (const p of procs) {
    let at = parent.get(p.ref) ?? ''
    for (let i = 0; i < 20 && at && !at.startsWith('surface:'); i++) at = parent.get(at) ?? ''
    if (!at.startsWith('surface:')) continue
    const ws = parent.get(parent.get(at) ?? '') ?? ''
    const id = `cmux:${ws}:${at}`
    if (!out.has(id)) out.set(id, { sessionId: id, name: label.get(at) || at, cwd: `${ws} ${at}`, status: state.get(`${ws}|${p.name}`) ?? '', kind: p.name, host: 'cmux' })
  }
  return [...out.values()]
}
// A coding agent's state from the end of its terminal screen, which wins over cmux's status tag (that can stay Idle while codex works or asks):
// input when it waits on a question (folder trust, a command to approve, y/n), busy while it works ("esc to interrupt").
// ponytail: matched on the prompts codex, opencode and aider print; an agent with other wording stays as cmux says
export function screenState(screen: string): 'busy' | 'input' | undefined {
  const end = screen.split('\n').filter(l => l.trim()).slice(-15).join('\n')
  if (/enter (to )?continue|trust this folder|\(y\/n\)|\[y\/n\]|allow (this|command)|approve|do you want to/i.test(end)) return 'input'
  if (/esc to interrupt/i.test(end)) return 'busy'
  return undefined
}
// The app a session runs in, from its process's ancestors (each `ps` comm, nearest first): the first macOS app bundle, skipping the
// Claude Code binary the desktop app keeps under Application Support. Claude means the desktop app.
export function appOf(chain: readonly string[]): string | undefined {
  for (const c of chain) {
    const m = /\/([^/]+)\.app\/Contents\/MacOS\//.exec(c)
    if (m && !c.includes('/Application Support/')) return m[1]
  }
  return undefined
}
// The short tag a row shows for where a session runs
export const hostTag = (host: string | undefined) => (host === 'Claude' ? 'desktop' : host ?? '')
export const isAgent = (p: Pick<Peer, 'sessionId'>) => p.sessionId.startsWith('cmux:')
export const cmuxTarget = (id: string) => { const m = /^cmux:(workspace:[^:]*):(surface:.+)$/.exec(id); return { ws: m?.[1] ?? '', surface: m?.[2] ?? '' } }
// Open tabs of the running browsers, every window and profile, read through AppleScript.
// Claude in Chrome sees only its own tab group, so this is what lets the conversation point at a tab the person opened ("check tab B3").
// Chromium browsers share Chrome's scripting dictionary (active tab index, tab id), so one script serves all; Safari has its own (current tab, no tab id).
// Which installed apps have such a dictionary is found by reading their .sdef files (register.tsx findBrowsers), so a new browser needs no code.
// Each line: window, tab, true for the window's active tab, the browser's own tab id, title, URL (tab-separated; inside the tell block `tab` means a tab, so the separators are character ids).
// Firefox has no tab scripting, so it can't be read.
export type Browser = { app: string; letter: string; name: string; safari?: boolean; firefox?: boolean }
// Letters and short names kept for the browsers named in the docs; any other browser gets the first free letter of its name.
export const BROWSERS: readonly Browser[] = [
  { app: 'Google Chrome', letter: 'C', name: 'Chrome' },
  { app: 'Brave Browser', letter: 'B', name: 'Brave' },
  { app: 'Microsoft Edge', letter: 'E', name: 'Edge' },
  { app: 'Arc', letter: 'A', name: 'Arc' },
  { app: 'Vivaldi', letter: 'V', name: 'Vivaldi' },
  { app: 'Chromium', letter: 'M', name: 'Chromium' },
  { app: 'ego lite', letter: 'G', name: 'ego lite' },
  { app: 'Safari', letter: 'S', name: 'Safari', safari: true },
  { app: 'Firefox', letter: 'F', name: 'Firefox', firefox: true },
  { app: 'Whale', letter: 'W', name: 'Whale' },
]
// The browsers to read: the known ones that are installed first, then the other found apps in name order, each with a letter no other has.
export function pickBrowsers(found: readonly { app: string; safari: boolean }[]): Browser[] {
  const known = BROWSERS.filter(b => found.some(f => f.app === b.app))
  const used = new Set(BROWSERS.map(b => b.letter))
  const rest = found.filter(f => !BROWSERS.some(b => b.app === f.app)).sort((x, y) => x.app.localeCompare(y.app)).map(f => {
    const letter = [...f.app.toUpperCase(), ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(c => /[A-Z]/.test(c) && !used.has(c)) ?? '?'
    used.add(letter)
    return { app: f.app, letter, name: f.app, safari: f.safari }
  })
  return [...known, ...rest]
}
export const tabsScript = (app: string, safari = false) => safari ? `if application "${app}" is running then
set sep to character id 9
set nl to character id 10
tell application "${app}"
set out to ""
repeat with wi from 1 to count of windows
try
set w to window wi
set a to index of current tab of w
repeat with ti from 1 to count of tabs of w
set t to tab ti of w
set out to out & wi & sep & ti & sep & (ti = a) & sep & (wi & ":" & ti) & sep & (name of t) & sep & (URL of t) & nl
end repeat
end try
end repeat
return out
end tell
end if` : `if application "${app}" is running then
set sep to character id 9
set nl to character id 10
tell application "${app}"
set out to ""
repeat with wi from 1 to count of windows
try
set w to window wi
set a to active tab index of w
repeat with ti from 1 to count of tabs of w
set t to tab ti of w
set out to out & wi & sep & ti & sep & (ti = a) & sep & (id of t) & sep & (title of t) & sep & (URL of t) & nl
end repeat
end try
end repeat
return out
end tell
end if`
// Firefox has no tab scripting, so its tabs come from the session file it rewrites every ~15 seconds (up to that old; closed tabs stay a moment).
// The file is mozlz4 (8-byte magic, 4-byte size, an lz4 block), decoded here with python3 since macOS has no lz4 tool; the tab's key is its docshell UUID.
// Prints nothing when Firefox isn't running, like tabsScript; a missing file exits 1 so the failure is reported.
const FIREFOX_PY = `import json,glob,os,sys
def u(b):
 o=bytearray();i=0
 while i<len(b):
  t=b[i];i+=1;n=t>>4
  if n==15:
   while 1:
    x=b[i];i+=1;n+=x
    if x!=255:break
  o+=b[i:i+n];i+=n
  if i>=len(b):break
  d=b[i]|b[i+1]<<8;i+=2;m=t&15
  if m==15:
   while 1:
    x=b[i];i+=1;m+=x
    if x!=255:break
  for _ in range(m+4):o.append(o[-d])
 return bytes(o)
fs=glob.glob(os.path.expanduser('~/Library/Application Support/Firefox/Profiles/*/sessionstore-backups/recovery.jsonlz4'))
if not fs:sys.exit('no Firefox session file')
j=json.loads(u(open(max(fs,key=os.path.getmtime),'rb').read()[12:]))
for w,win in enumerate(j.get('windows',[]),1):
 for t,tab in enumerate(win.get('tabs',[]),1):
  es=tab.get('entries') or [{}]
  e=es[min(max(tab.get('index',1),1),len(es))-1]
  url=e.get('url','');title=e.get('title') or url
  print(w,t,str(t==win.get('selected',1)).lower(),e.get('docshellUUID') or url,' '.join(title.split()),url,sep=chr(9))`
export const firefoxCmd = ['sh', '-c', 'pgrep -x firefox >/dev/null || exit 0; exec python3 -I -c "$1"', 'sh', FIREFOX_PY]
// Brings a Firefox tab forward by keys (Firefox can't be told which tab): raise the window whose title holds that window's selected tab's title,
// then Cmd+1..8 for the tab's place, and Cmd+Option+Right for the ones past the eighth. Needs Accessibility for the app running osascript.
export const firefoxFocus = `on run argv
set ttl to item 1 of argv
set n to (item 2 of argv) as integer
tell application "Firefox" to activate
delay 0.3
tell application "System Events" to tell process "firefox"
set hit to false
repeat with w in (every window whose name contains ttl)
perform action "AXRaise" of w
set hit to true
exit repeat
end repeat
if not hit and (count of windows) > 1 then error "could not tell which Firefox window holds the tab"
set k to n
if k > 8 then set k to 8
keystroke (k as text) using command down
repeat (n - k) times
key code 124 using {command down, option down}
end repeat
end tell
end run`
// A tab with no title (Whale's new tab page) shows its address instead.
// key is the browser's tab id, which stays with the tab while windows and other tabs come and go; id is the place until stick() numbers it.
export function parseTabs(out: string, letter = 'C', app = 'Google Chrome', safari = false, firefox = false): Tab[] {
  return out.split('\n').map(l => l.split('\t')).filter(f => f.length >= 6 && /^\d+$/.test(f[0]!) && /^\d+$/.test(f[1]!))
    .map(([w, t, a, tid, title, ...url], i) => ({ id: `${letter}${i + 1}`, key: `${letter}:${tid}`, title: title || url.join('\t'), url: url.join('\t'), active: a === 'true', app, win: Number(w), index: Number(t), ...(safari ? { safari } : {}), ...(firefox ? { firefox } : {}) }))
}
// Rows a drawn tree takes in the terminal (the whole-panel scrollbar's length): column boxes add their children, row boxes take the tallest,
// a fixed height wins, borders and vertical padding count, absolute children and display none take none, and text is one row.
// ponytail: wrapped text counts as one row; the panel truncates its text, so the bar is off only where something wraps
type El = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
const flatKids = (xs: unknown): unknown[] => (Array.isArray(xs) ? xs.flatMap(flatKids) : xs === null || xs === undefined || xs === false || xs === true ? [] : [xs])
const numOf = (v: unknown) => (typeof v === 'number' ? v : 0)
export function treeRows(n: unknown): number {
  if (!n || typeof n !== 'object') return typeof n === 'string' || typeof n === 'number' ? 1 : 0
  const el = n as El
  const pr = el.props ?? {}
  if (el.type !== 'Box') return 1
  if (pr.display === 'none') return 0
  if (typeof pr.height === 'number') return pr.height
  const kids = flatKids(el.children ?? pr.children).filter(k => ((k as El).props ?? {}).position !== 'absolute')
  const hs = kids.map(k => { const kp = (k as El).props ?? {}; return { h: treeRows(k), m: (numOf(kp.marginTop) || numOf(kp.marginY)) + (numOf(kp.marginBottom) || numOf(kp.marginY)) } })
  const used = pr.flexDirection === 'column'
    ? hs.reduce((a, x) => a + x.h + x.m, 0) + numOf(pr.gap) * Math.max(0, hs.filter(x => x.h > 0).length - 1)
    : Math.max(0, ...hs.map(x => x.h + x.m))
  const border = pr.borderStyle ? (pr.borderTop === false ? 0 : 1) + (pr.borderBottom === false ? 0 : 1) : 0
  return used + border + (numOf(pr.paddingTop) || numOf(pr.paddingY) || numOf(pr.padding)) + (numOf(pr.paddingBottom) || numOf(pr.paddingY) || numOf(pr.padding))
}
// The turn flow's line for a sessions tool call that hands work to or from another session, by the numbers the Open sessions box shows:
// send → "⇢ api #2", pull → "⇠ docs-1 #1" (with "⇢ api #2" when the handoff goes on to another session). list hands nothing over (undefined).
export function handoffLabel(input: { action?: unknown; to?: unknown; from?: unknown }, others: readonly Pick<Peer, 'name' | 'num'>[]): { hand: 'send' | 'pull'; label: string } | undefined {
  const name = (n: unknown) => { const p = others.find(x => x.num === n); return `${p ? p.name : 'session'} #${String(n)}` }
  if (input.action === 'send') return { hand: 'send', label: `⇢ ${name(input.to)}` }
  if (input.action === 'pull') return { hand: 'pull', label: `⇠ ${name(input.from)}${input.to !== undefined ? ` ⇢ ${name(input.to)}` : ''}` }
  return undefined
}
// Sticky numbers: a key keeps the number it first got for the rest of the session, and a closed one's number is never handed out again,
// so "C2" or "session 2" said earlier still means the same tab or session after others open, close or move.
// Keys are 'group:id'; each group counts on from its own highest number.
// ponytail: the map only grows (one entry per tab or session ever seen); prune when sessions see thousands
export function stick(prev: Readonly<Record<string, number>>, keys: readonly string[]): Record<string, number> {
  // Unchanged when every key already has a number, so the atom isn't rewritten on each refresh
  if (keys.every(k => prev[k] !== undefined)) return prev as Record<string, number>
  const next = { ...prev }
  for (const k of keys) {
    if (next[k] !== undefined) continue
    const g = k.slice(0, k.indexOf(':') + 1)
    next[k] = 1 + Math.max(0, ...Object.entries(next).filter(([x]) => x.startsWith(g)).map(([, n]) => n))
  }
  return next
}
// Finds tabs by a number (B3, case aside) or by words: every word must appear in the title or URL, case aside.
// One match is the tab; several are candidates for the model to choose from or ask about.
export function findTabs(list: readonly Tab[], q: string): Tab[] {
  const s = q.trim()
  const byId = list.filter(x => x.id === s.toUpperCase())
  if (byId.length) return byId
  const words = s.toLowerCase().split(/\s+/).filter(Boolean)
  return words.length ? list.filter(x => words.every(w => `${x.title} ${x.url}`.toLowerCase().includes(w))) : []
}
// The sender's name when a peer's message is a handoff note, so the receiving side can say one arrived
export const handoffFrom = (text: string): string | undefined => /Handoff from Claude Code session "([^"]*)"/.exec(text)?.[1]
// The sender's session id from the same line (handoffNote writes it in parentheses after the name), to match a note to the pull that asked for it
export const handoffSid = (text: string): string | undefined => /Handoff from Claude Code session "[^"]*" \(([^)]+)\)/.exec(text)?.[1]
