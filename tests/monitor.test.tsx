import { test, expect, mock } from 'claude-code/testing'
import { limitEta, isStalled, cacheDropped, ctxParts, upsertRecord, historySummary, WINDOW_MS, pickKids } from '../hooks/state'

declare const setTimeout: (fn: () => void, ms: number) => unknown
const PANE = { plugin: 'yaong', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'yaong', viewport: { columns: 140, rows: 60 } as never } as const
const tick = (ms = 0) => new Promise<void>(r => setTimeout(r, ms))
const iso = (ms: number) => new Date(ms).toISOString()

test('usage limit forecast: time left if reached before reset at the current rate, else undefined', async () => {
  const now = 1_000_000_000_000
  const H = 3600_000
  // 1 hour into a 5-hour window at 40%: the remaining 60% is reached in 1.5 hours, before the reset (in 4 hours).
  expect(limitEta(40, iso(now + 4 * H), WINDOW_MS.five_hour, now)).toBe(1.5 * H)
  // 4 hours in at 10%: not reached before the reset.
  expect(limitEta(10, iso(now + 1 * H), WINDOW_MS.five_hour, now)).toBeUndefined()
  expect(limitEta(0, iso(now + H), WINDOW_MS.five_hour, now)).toBeUndefined()
  expect(limitEta(50, undefined, WINDOW_MS.five_hour, now)).toBeUndefined()
})

test('stall check, cache hit rate drop, context breakdown, session record totals', async () => {
  expect(isStalled(0, 200_000, 120_000)).toBe(true)
  expect(isStalled(100_000, 200_000, 120_000)).toBe(false)
  expect(isStalled(0, 200_000, 0)).toBe(false)
  expect(cacheDropped({ tokIn: 1000, tokCache: 90_000 }, { tokIn: 80_000, tokCache: 1000 })).toBe(true)
  expect(cacheDropped({ tokIn: 1000, tokCache: 90_000 }, { tokIn: 5000, tokCache: 0 })).toBe(false)
  expect(cacheDropped(undefined, { tokIn: 80_000, tokCache: 0 })).toBe(false)
  expect(ctxParts([
    { name: 'Messages', tokens: 50, color: 'a', isDeferred: false },
    { name: 'Deferred', tokens: 999, color: 'b', isDeferred: true },
    { name: 'System', tokens: 80, color: 'c', isDeferred: false },
  ]).map(p => p.name)).toEqual(['System', 'Messages'])
  const now = Date.now()
  let h = upsertRecord([], { id: 'a', startedAt: now - 9 * 86400_000, updatedAt: now - 9 * 86400_000, cost: 5, turns: 1, tools: 1, tokens: 1 })
  h = upsertRecord(h, { id: 'b', startedAt: now - 1000, updatedAt: now, cost: 1.5, turns: 1, tools: 1, tokens: 1 })
  h = upsertRecord(h, { id: 'b', startedAt: now - 1000, updatedAt: now, cost: 2, turns: 2, tools: 1, tokens: 1 })
  expect(h).toHaveLength(2)
  const s = historySummary(h, now)
  expect(s.today).toEqual({ sessions: 1, cost: 2 })
  expect(s.week.cost).toBe(2)
})

test('usage limit row: shows usage and the forecast', async ($, on) => {
  const now = Date.now()
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 10 }, rateLimits: [
    { kind: 'five_hour', percentUsed: 40, resetsAt: iso(now + 4 * 3600_000) },
    { kind: 'seven_day', percentUsed: 5, resetsAt: iso(now + 86400_000) },
  ] } as never }))
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /^5h +$/ })).toBeDefined()
  expect(await ui.find({ text: /^ → [\d.]+(ms|s|m\d+s|h\d+m|d\d+h)/ })).toBeDefined()
  expect(await ui.find({ text: /^ ↺/ })).toBeDefined()
  await ui.unmount()
})

test('notifies only once when context passes the threshold', { options: { ctxAlertPercent: 50 } }, async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined } as never })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 70 }, rateLimits: [] } as never }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  await $.turn.start({ text: 'x', turnId: 't1' } as never)
  for (let i = 0; i < 2; i++) { for await (const _ of $.turn.step({ turnId: 't1', index: i, model: 'opus', messageCount: 1 } as never)) { /* drain */ } await tick() }
  expect(toasts.filter(x => /Context 70%/.test(x))).toHaveLength(1)
})

test('a tool running past the stall threshold shows ⏳', { options: { stallSeconds: 0.05 } }, async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } as never }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [{}], stopReason: 'tool_use', usage: null } as never
  })
  let release = () => {}
  on('tool.call', () => new Promise(res => { release = () => res({ result: {} as never }) }))
  await $.turn.start({ text: 'stall', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  const call = $.tool.call({ tool: 'Bash', command: 'sleep 999' } as never)
  await tick(120)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /^ ⏳$/ })).toBeDefined()
  release(); await call
  await ui.unmount()
})

test('a request node whose cache hit rate dropped sharply gets ⟳↓', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } as never }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  const usages = [
    { input_tokens: 1000, output_tokens: 10, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 0 },
    { input_tokens: 2000, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 80_000 },
  ]
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: usages[e.index] } as never
  })
  await $.turn.start({ text: 'cache', turnId: 't1' } as never)
  for (let i = 0; i < 2; i++) { for await (const _ of $.turn.step({ turnId: 't1', index: i, model: 'opus', messageCount: 1 } as never)) { /* drain */ } await tick() }
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /⟳↓/ })).toBeDefined()
  await ui.unmount()
})

test('when a turn ends, the context breakdown is read and shown in the model box', async ($, on) => {
  on('session.usage', ($, e) => ({ value: { startedAt: 0, context: { window: 200000, percent: 30, breakdown: (e as { breakdown?: string }).breakdown ? { categories: [
    { name: 'Messages', tokens: 40_000, color: 'promptBorder', isDeferred: false },
    { name: 'System tools', tokens: 15_000, color: 'inactive', isDeferred: false },
  ] } : undefined }, rateLimits: [] } as never }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await $.turn.start({ text: 'ctx', turnId: 't1' } as never)
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  await tick(); await tick()
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /^Messages$/ })).toBeDefined()
  expect(await ui.find({ text: /^System tools$/ })).toBeDefined()
  await ui.unmount()
})

test('session records: today\'s total from stored records and this session\'s cost', async ($, on) => {
  const now = Date.now()
  mock.store(on, { history: [{ id: 'old', startedAt: now - 3600_000, updatedAt: now - 1000, cost: 3, turns: 2, tools: 4, tokens: 100 }] })
  on('session.usage', () => ({ value: { startedAt: now, context: { window: 200000 }, rateLimits: [], cost: { usd: 1.5 } } as never }))
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  mock.clock(on, { now })
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  await tick(); await tick()
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /^today ≈\$4\.50 \(2\) · 7d ≈\$4\.50$/ })).toBeDefined()
  await ui.unmount()
})

test('picking branches: running first, remaining slots go to recently finished, order kept', async () => {
  const k = (id: string, running = false) => ({ id, item: running ? {} : { endedAt: 1 } })
  const kids = [k('a', true), k('b'), k('c'), k('d'), k('e')]
  const r = pickKids(kids, 3, false)
  expect(r.shown.map(x => x.id)).toEqual(['a', 'd', 'e'])
  expect(r.hidden).toBe(2)
  expect(pickKids(kids, 3, true).hidden).toBe(0)
  expect(pickKids(kids.slice(0, 3), 3, false).hidden).toBe(0)
})

test('branches start expanded; past 3, folding keeps the last 3 and +N earlier, and they expand again', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } as never }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [{}], stopReason: 'tool_use', usage: null } as never
  })
  on('tool.call', () => ({ result: {} as never }))
  await $.turn.start({ text: 'many tools', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  for (let i = 1; i <= 5; i++) await $.tool.call({ tool: 'Bash', command: `cmd-${i}` } as never)
  await tick()
  const ui = await $.ui.mount(PANE)
  const shown = async (i: number) => !!(await ui.find({ type: 'Text', text: new RegExp(`^⚙ Bash cmd-${i}$`) }))
  expect([await shown(1), await shown(2), await shown(3), await shown(5)]).toEqual([true, true, true, true])
  const less = (await ui.findAll({ type: 'Button' })).find(b => /^less-/.test(String((b as { key?: string }).key)))
  await ui.press({ key: String((less as { key?: string }).key) })
  expect([await shown(1), await shown(2), await shown(3), await shown(5)]).toEqual([false, false, true, true])
  expect(await ui.find({ text: /\+2 earlier/ })).toBeDefined()
  const more = (await ui.findAll({ type: 'Button' })).find(b => /^more-/.test(String((b as { key?: string }).key)))
  await ui.press({ key: String((more as { key?: string }).key) })
  expect(await shown(1)).toBe(true)
  await ui.unmount()
})
