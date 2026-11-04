import { test, expect } from 'claude-code/testing'
import { mapTokens, weightBar, archiveTurn } from '../hooks/state'

declare const setTimeout: (fn: () => void, ms: number) => unknown
const PANE = { plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 160, rows: 70 } as never } as const
const tick = (ms = 0) => new Promise<void>(r => setTimeout(r, ms))

test('block compression: runs of 3 or more merge, and overflow keeps both ends', async () => {
  expect(mapTokens('>|bbbbb|r#', 40)).toEqual([{ ch: '>', n: 1 }, { ch: '|', n: 1 }, { ch: 'b', n: 5 }, { ch: '|', n: 1 }, { ch: 'r', n: 1 }, { ch: '#', n: 1 }])
  const long = '>' + '|br'.repeat(30) + '#'
  const toks = mapTokens(long, 12)
  expect(toks[0]).toEqual({ ch: '>', n: 1 })
  expect(toks[toks.length - 1]).toEqual({ ch: '#', n: 1 })
  expect(toks.some(k => k.ch === '…')).toBe(true)
  expect(weightBar(5, 10)).toBe('▰▰▱▱')
  expect(weightBar(0.1, 10)).toBe('▰▱▱▱')
  expect(weightBar(0, 10)).toBe('▱▱▱▱')
  // The archive is a record kept apart from the tree. Only the last 10 turns remain.
  let a: ReturnType<typeof archiveTurn> = {}
  for (let i = 0; i < 12; i++) a = archiveTurn(a, `t${i}`, { flow: [], prompt: '', startedAt: i, endedAt: i + 1 })
  expect(Object.keys(a)).toHaveLength(10)
  expect(a.t0).toBeUndefined()
  expect(a.t11).toBeDefined()
})

test('clicking a past turn in the map switches the flow chart to it; result summary, weight bar, row count, and basis can be changed', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } as never }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [{}], stopReason: 'tool_use', usage: null } as never
  })
  on('tool.call', { tool: 'Edit' }, () => ({ result: {} as never }))
  on('tool.call', { tool: 'Bash' }, () => ({ isError: true, result: 'x', text: 'Exit code 1' } as never))
  on('turn.complete', () => ({ text: '' }))
  await $.turn.start({ text: 'first turn', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  await $.tool.call({ tool: 'Edit', file_path: '/a/one.ts', old_string: 'a', new_string: 'b' } as never)
  await $.tool.call({ tool: 'Bash', command: 'old-command' } as never)
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  await tick()
  await $.turn.start({ text: 'second turn', turnId: 't2' } as never)
  await tick()
  const ui = await $.ui.mount(PANE)
  // Result summary: 1 edited file, 1 failure
  expect(await ui.find({ text: /^✎1 ✗1/ })).toBeDefined()
  expect(await ui.find({ text: /^[▰▱]{4} $/ })).toBeDefined()
  // The current turn (t2) has no old-command
  expect(await ui.find({ type: 'Text', text: /^⚙ Bash old-command$/ })).toBeUndefined()
  await ui.press({ key: 'map-open-t1' })
  expect(await ui.find({ text: /T1 past turn · latest/ })).toBeDefined()
  expect(await ui.find({ text: /^⚙ Bash old-command$/ })).toBeDefined()
  await ui.press({ key: 'flow-live' })
  expect(await ui.find({ type: 'Text', text: /past turn/ })).toBeUndefined()
  expect(await ui.find({ text: /^⇕ 4 rows$/ })).toBeDefined()
  await ui.press({ key: 'map-tall' })
  expect(await ui.find({ text: /^⇕ 12 rows$/ })).toBeDefined() // 70-row panel: expanding takes half the remaining height (the 7-row top box, 7-row turn flow boxes, 3-row footer, and the 5-row Open sessions and Browser tabs pair leave 25)
  await ui.press({ key: 'map-basis' })
  expect(await ui.find({ text: /^⚖ cost$/ })).toBeDefined()
  await ui.unmount()
})
