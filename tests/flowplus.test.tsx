import { test, expect } from 'claude-code/testing'
import { firstLine, toolResult, addFile, timeStrip, overlaps, emptyTree, timeShares, shareWidths } from '../hooks/state'
import type { FlowItem } from '../types'

declare const setTimeout: (fn: () => void, ms: number) => unknown
const PANE = { plugin: 'yaong', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'yaong', viewport: { columns: 140, rows: 60 } as never } as const
const tick = (ms = 0) => new Promise<void>(r => setTimeout(r, ms))
const usage = () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } as never })
const item = (id: string, kind: FlowItem['kind'], startedAt: number, endedAt?: number): FlowItem => ({ id, kind, label: id, meta: '', ok: true, startedAt, endedAt })

test('intent first line, tool result summary, file list, time bar, parallel check', async () => {
  expect(firstLine('\n## Check the failure\nmore...')).toBe('Check the failure')
  expect(firstLine('')).toBe('')
  expect(toolResult('Edit', { old_string: 'a', new_string: 'a\nb' }, {})).toBe('+2/−1')
  expect(toolResult('Write', { content: 'x\ny\nz\n' }, {})).toBe('+3')
  expect(toolResult('Read', {}, { text: '1 a\n2 b\n' })).toBe('2 lines')
  expect(toolResult('Grep', {}, { text: 'a.ts\n\nb.ts\n' })).toBe('2 hits')
  expect(toolResult('Bash', {}, { isError: true, text: 'boom\nExit code 2' })).toBe('exit 2')
  expect(toolResult('Bash', {}, { text: 'ok' })).toBe('')
  expect(toolResult('Read', {}, { deny: 'no' })).toBe('denied')
  let t = addFile(addFile(addFile(emptyTree(), 'Read', '/a/x.ts'), 'Edit', '/a/y.ts'), 'Read', '/b/x.ts')
  t = addFile(t, 'Bash', '/z')
  expect(t.files).toEqual({ edit: ['y.ts'], read: ['x.ts'] })
  const flow = [item('s', 'step', 0, 40), item('t', 'tool', 40, 80), item('s2', 'step', 80, 100)]
  expect(timeStrip(flow, 0, 100, 10, 100)).toBe('mmmmttttmm')
  const a = item('a', 'tool', 0, 50), b = item('b', 'tool', 20, 60), c = item('c', 'tool', 60, 70)
  expect(overlaps(a, [a, b, c], 100)).toBe(true)
  expect(overlaps(c, [a, b, c], 100)).toBe(false)
})

test('text the model writes shows as the intent line while running and settles to the first line when done', async ($, on) => {
  on('session.usage', usage)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  let release = () => {}
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'Fix the ' } as never
    yield { kind: 'text', index: 0, text: 'bug\nnext line' } as never
    await new Promise<void>(r => { release = r })
    return { turnId: e.turnId, index: e.index, answer: 'Fix the bug\nnext line', toolUses: [{}], stopReason: 'tool_use', usage: null } as never
  })
  await $.turn.start({ text: 'intent', turnId: 't1' } as never)
  const run = (async () => { for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* drain */ } })()
  await tick(20)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /^ "Fix the/ })).toBeDefined()
  release(); await run; await tick()
  expect(await ui.find({ text: /^ "Fix the bug"$/ })).toBeDefined()
  await ui.unmount()
})

test('tool result summary, files this turn, time bar, parallel mark, slowest request highlight', async ($, on) => {
  on('session.usage', usage)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    if (e.index === 1) await tick(40)
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [{}, {}], stopReason: 'tool_use', usage: null } as never
  })
  on('tool.call', { tool: 'Edit' }, async () => { await tick(30); return { result: {} as never } })
  on('tool.call', { tool: 'Bash' }, async () => { await tick(30); return { isError: true, result: 'x', text: 'boom\nExit code 1' } as never })
  await $.turn.start({ text: 'many tools', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  await Promise.all([
    $.tool.call({ tool: 'Edit', file_path: '/a/state.ts', old_string: 'a', new_string: 'a\nb\nc' } as never),
    $.tool.call({ tool: 'Bash', command: 'npm test' } as never),
  ])
  for await (const _ of $.turn.step({ turnId: 't1', index: 1, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  await tick()
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /^ \+3\/−1$/ })).toBeDefined()
  expect(await ui.find({ text: /^ exit 1$/ })).toBeDefined()
  expect(await ui.find({ text: /^∥ ⚙ Bash npm test$/ })).toBeDefined()
  expect(await ui.find({ text: /^✎ $/ })).toBeDefined()
  expect(await ui.find({ text: /state\.ts/ })).toBeDefined()
  // Time bar: the tool segment has a 'tool' label on an orange background
  expect((await ui.findAll({ type: 'Text', text: /tool/ })).some(x => (x.props as { backgroundColor?: string }).backgroundColor === '#f6c177')).toBe(true)
  // step 2 took longer, so its border is orange
  expect((await ui.findAll({ type: 'Box' })).some(b => (b.props as { borderColor?: string }).borderColor === '#f6c177')).toBe(true)
  await ui.unmount()
})

test('the time bar paints segments in category colors with names and times on top', async ($, on) => {
  on('session.usage', usage)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    // Hold the request briefly so the model segment takes most of the bar.
    await tick(60)
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  await $.turn.start({ text: 'bar', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  await tick()
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /^time / })).toBeDefined()
  // Segment widths depend on run time, so only check that the name sits on the background, not the time.
  const seg = await ui.find({ type: 'Text', text: /^ model( |$)/ })
  expect(seg).toBeDefined()
  expect((seg!.props as { backgroundColor?: string }).backgroundColor).toBe('#7dd3a8')
  await ui.unmount()
})

test('time shares: per-category totals and cell split', async () => {
  const flow = [item('s', 'step', 0, 40), item('t', 'tool', 40, 80), item('s2', 'step', 90, 100)]
  const sh = timeShares(flow, 0, 100, 100, 100)
  expect(sh).toEqual({ m: 50, t: 40, a: 0, w: 10 })
  expect(shareWidths([50, 40, 0, 10], 20)).toEqual([10, 8, 0, 2])
  expect(shareWidths([99, 1], 10)).toEqual([9, 1])
  expect(shareWidths([0, 0], 10)).toEqual([0, 0])
  expect(shareWidths([1, 1, 1], 10).reduce((a, b) => a + b, 0)).toBe(10)
})

test('the time bar shows total time and per-category shares, with per-category times on the row below', async ($, on) => {
  on('session.usage', usage)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    await tick(60)
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  await $.turn.start({ text: 'shares', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  await tick()
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /^time [\d.]+(ms|s) $/ })).toBeDefined()
  expect(await ui.find({ text: /^ model \d+%/ })).toBeDefined()
  expect(await ui.find({ text: /^ model [\d.]+(ms|s)$/ })).toBeDefined()
  await ui.unmount()
})

test('hover cards inside flow chart columns and subagent boxes stay within their own column width', async ($, on) => {
  on('session.usage', usage)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: 'A very long intent sentence keeps going. This long text must not spill into the next column at all', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  await $.turn.start({ text: 'card', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  await $.agent.spawn({ prompt: 'x', description: 'A subagent description so long that it runs past the width of its box', subagentType: 'Explore' } as never)
  await tick()
  const ui = await $.ui.mount(PANE)
  const cards = (await ui.findAll({ type: 'Box' })).map(b => b.props as { position?: string; bottom?: number; top?: number; width?: number }).filter(p => p.position === 'absolute' && (p.bottom === 1 || [1, 2, 3].includes(p.top ?? 0)))
  // The intent row card is within the node width (20); the subagent box card within the box's inner width
  const widths = cards.map(c => c.width ?? 0)
  expect(widths).toContain(20)
  expect(widths.some(w => w > 20 && w < 30)).toBe(true)
  await ui.unmount()
})
