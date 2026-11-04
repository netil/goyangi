import { test, expect } from 'claude-code/testing'

const PANE = { plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 50 } as never } as const

test('a turn that only answers without tools still leaves a flow', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 10 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: { input_tokens: 10, output_tokens: 1200, cache_read_input_tokens: 90, cache_creation_input_tokens: 0, model: 'm' } } as never
  })
  on('turn.complete', () => ({ text: '' }))
  const ui = await $.ui.mount(PANE)
  await $.turn.start({ text: 'reopen the panel', turnId: 't1' } as never)
  const g = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1 } as never)
  for await (const _ of g) { /* drain */ }
  await $.turn.complete({ turnId: 't1', answer: 'hi', durationMs: 2300, isAborted: false, reason: 'answer' } as never)
  expect(await ui.find({ text: /reopen the panel/ })).toBeDefined()
  expect(await ui.find({ text: /step 1 → end_turn/ })).toBeDefined()
  expect(await ui.find({ text: /answered/ })).toBeDefined()
  expect(await ui.find({ text: /^cache $/ })).toBeDefined()
  await ui.unmount()
})

test('on narrow screens sections stack vertically and all are drawn', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface, viewport: { columns: 50, rows: 60 } as never })
    expect(await ui.find({ text: /no subagents yet/ })).toBeDefined()
    expect(await ui.find({ text: /no server tools/ })).toBeDefined()
    expect(await ui.find({ text: /session log/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /^advisor$/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('the top box holds the main loop: model and tokens on the left, gauges lined up in a right column, server tools on the last row', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ ...PANE, viewport: { columns: 140, rows: 60 } as never })
  // One box, 7 rows: 4 body rows (ctx and cache in the right column), the server tools row, and the border
  const boxes = (await ui.findAll({ type: 'Box' })).filter(b => (b.props as { height?: number }).height === 7)
  expect(boxes.length).toBe(1)
  expect(await ui.find({ type: 'Box', key: 'stat-cols' })).toBeDefined()
  expect(await ui.find({ text: /· main$/ })).toBeDefined()
  expect(await ui.find({ text: /^cache $/ })).toBeDefined()
  expect(await ui.find({ text: /^ctx   $/ })).toBeDefined()
  expect(await ui.find({ text: /no server tools/ })).toBeDefined()
  await ui.unmount()
})
