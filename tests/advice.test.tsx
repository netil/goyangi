import { test, expect } from 'claude-code/testing'
import { advise, CACHE_TTL_MS } from '../hooks/state'
import type { FlowItem } from '../types'

declare const setTimeout: (fn: () => void, ms: number) => unknown
const PANE = { plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 140, rows: 60 } as never } as const
const tick = (ms = 0) => new Promise<void>(r => setTimeout(r, ms))
const base = { flow: [] as FlowItem[], fails: {}, ctxPercent: 0, limits: [] }
const step = (id: string, s: number, e: number, tokIn: number, tokCache: number): FlowItem => ({ id, kind: 'step', label: id, meta: '', ok: true, startedAt: s, endedAt: e, tokIn, tokCache })
const tool = (id: string, s: number, extra: Partial<FlowItem>): FlowItem => ({ id, kind: 'tool', label: id, meta: '', ok: true, startedAt: s, endedAt: s + 1, ...extra })
const ids = (x: Parameters<typeof advise>[0]) => advise(x).map(a => a.id)

test('rule 1: warn only at 70% context or more', async () => {
  expect(ids({ ...base, ctxPercent: 70 })).toEqual(['ctx'])
  expect(ids({ ...base, ctxPercent: 69 })).toEqual([])
})

test('rule 2: warn only when the same call failed 2 or more times', async () => {
  expect(ids({ ...base, fails: { 'main|Bash|npm test': 2 } })).toEqual(['fail:main|Bash|npm test'])
  expect(ids({ ...base, fails: { 'main|Bash|npm test': 1 } })).toEqual([])
})

test('rule 3: warn about a cache drop only when the gap can\'t be expiry', async () => {
  const hot = step('s1', 0, 1000, 1000, 90_000)
  const coldSoon = step('s2', 11_000, 12_000, 80_000, 1000)
  expect(ids({ ...base, flow: [hot, coldSoon] })).toEqual(['cache:s2'])
  // A request after a pause longer than the expiry is normal expiry, so no advice
  const coldLate = step('s3', 1000 + CACHE_TTL_MS + 1, 1000 + CACHE_TTL_MS + 2000, 80_000, 1000)
  expect(ids({ ...base, flow: [hot, coldLate] })).toEqual([])
  // Small new input (10k tokens or less) gets no advice
  expect(ids({ ...base, flow: [hot, step('s4', 2000, 3000, 5000, 0)] })).toEqual([])
})

test('rule 4: tip only when the same range was read 3 or more times without edits', async () => {
  const r = (id: string, s: number, key: string) => tool(id, s, { readKey: key })
  expect(ids({ ...base, flow: [r('a', 1, '/x/a.ts||'), r('b', 2, '/x/a.ts||'), r('c', 3, '/x/a.ts||')] })).toEqual(['reread:/x/a.ts||'])
  // If the same file was edited in between, reading again is normal
  expect(ids({ ...base, flow: [r('a', 1, '/x/a.ts||'), r('b', 2, '/x/a.ts||'), tool('e', 3, { path: '/x/a.ts' }), r('c', 4, '/x/a.ts||')] })).toEqual([])
  // A different range means different content was read
  expect(ids({ ...base, flow: [r('a', 1, '/x/a.ts|1|50'), r('b', 2, '/x/a.ts|51|50'), r('c', 3, '/x/a.ts|101|50')] })).toEqual([])
})

test('rule 5: warn about usage limits only at 50% or more and when reached within 30 minutes', async () => {
  expect(ids({ ...base, limits: [{ kind: 'five_hour', pct: 60, eta: 20 * 60_000 }] })).toEqual(['limit:five_hour'])
  expect(ids({ ...base, limits: [{ kind: 'five_hour', pct: 40, eta: 10 * 60_000 }] })).toEqual([])
  expect(ids({ ...base, limits: [{ kind: 'five_hour', pct: 60, eta: 40 * 60_000 }] })).toEqual([])
  expect(ids({ ...base, limits: [{ kind: 'five_hour', pct: 60 }] })).toEqual([])
})

test('rule 5: without a forecast, warn that little is left at 90% or more', async () => {
  expect(ids({ ...base, limits: [{ kind: 'five_hour', pct: 96 }] })).toEqual(['limit:five_hour:high'])
  expect(ids({ ...base, limits: [{ kind: 'five_hour', pct: 96, eta: 40 * 60_000 }] })).toEqual(['limit:five_hour:high'])
  // When reached within 30 minutes, only the forecast warning is given
  expect(ids({ ...base, limits: [{ kind: 'five_hour', pct: 96, eta: 10 * 60_000 }] })).toEqual(['limit:five_hour'])
})

test('warnings come before tips', async () => {
  const r = (id: string, s: number) => tool(id, s, { readKey: '/a||' })
  const a = advise({ ...base, ctxPercent: 80, flow: [r('a', 1), r('b', 2), r('c', 3)] })
  expect(a.map(x => x.level)).toEqual(['warn', 'tip'])
})

test('the panel shows all advice expanded; folded, the most important row and +N; cache warnings toast once', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined } as never })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 75 }, rateLimits: [] } as never }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  const usages = [
    { input_tokens: 1000, output_tokens: 10, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 0 },
    { input_tokens: 2000, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 80_000 },
  ]
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: usages[e.index] } as never
  })
  on('turn.complete', () => ({ text: '' }))
  await $.turn.start({ text: 'advice', turnId: 't1' } as never)
  for (let i = 0; i < 2; i++) { for await (const _ of $.turn.step({ turnId: 't1', index: i, model: 'opus', messageCount: 1 } as never)) { /* drain */ } await tick() }
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  await tick(); await tick()
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /^ Context 75% used$/ })).toBeDefined()
  expect(await ui.find({ text: /^ ⚠ Warn $/ })).toBeDefined()
  expect(await ui.find({ text: /^ Cache hit rate \d+% → \d+%/ })).toBeDefined()
  expect(await ui.find({ text: /^less ▴$/ })).toBeDefined()
  await ui.press({ key: 'tips-more' })
  expect(await ui.find({ text: /^\+1 ▾$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Cache hit rate/ })).toBeUndefined()
  expect(toasts.filter(x => /Cache hit rate/.test(x))).toHaveLength(1)
  await ui.unmount()
})

test('the minimized row shows warning and tip counts as chips', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 75 }, rateLimits: [] } as never }))
  on('ui.close', () => ({ value: undefined }) as never)
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'fold-all' })
  await pane.unmount()
  const band = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } as never, viewport: { columns: 140, rows: 50 } as never })
  expect(await band.find({ type: 'Text', text: /^⚠1$/ })).toBeDefined()
  await band.unmount()
})
