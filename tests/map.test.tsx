import { test, expect } from 'claude-code/testing'

declare const setTimeout: (fn: () => void, ms: number) => unknown
const PANE = { plugin: 'yaong', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'yaong', viewport: { columns: 140, rows: 60 } as never } as const

test('tool calls are drawn in order in the session map and turn flow', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [{}, {}], stopReason: 'tool_use', usage: { input_tokens: 1, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' } } as never
  })
  on('tool.call', () => ({ result: {} as never }))
  on('turn.complete', () => ({ text: '' }))

  await $.turn.start({ text: 'show me a bird\'s-eye view', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  await $.tool.call({ tool: 'Bash', command: 'ls mods' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/a/register.tsx' } as never)
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 4000, isAborted: false, reason: 'answer' } as never)

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /SESSION MAP · T1–T1 \/ 1/ })).toBeDefined()
  expect(await ui.find({ text: /"show me a bird's-eye view"/ })).toBeDefined()
  expect(await ui.find({ text: /2 tools\s+[\d.]+(ms|s)/ })).toBeDefined()
  expect(await ui.find({ text: /TURN FLOW/ })).toBeDefined()
  // Flow chart: prompt → step 1 → answer nodes and the tool branch under step 1
  expect(await ui.find({ text: /^▶ prompt$/ })).toBeDefined()
  expect(await ui.find({ text: /^◆ step 1$/ })).toBeDefined()
  // Request node row 2: duration and share of turn time (stop reason omitted when tool_use)
  expect(await ui.find({ text: /^[\d.]+(ms|s) \d+%$/ })).toBeDefined()
  expect(await ui.find({ text: /^■ answer$/ })).toBeDefined()
  expect(await ui.find({ text: /^⚙ Bash ls mods$/ })).toBeDefined()
  expect(await ui.find({ text: /^⚙ Read register\.tsx$/ })).toBeDefined()
  expect(await ui.find({ text: /──▶/ })).toBeDefined()

  await ui.press({ key: 'fold-map' })
  expect(await ui.find({ type: 'Text', text: /2 tools\s+[\d.]+(ms|s)/ })).toBeUndefined()
  await ui.unmount()
})

test('session map: with the default 4 rows, the last 4 turns; ▲ goes to earlier turns, position holds when new turns arrive, ▼ returns to latest', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  const turn = async (k: number) => {
    await $.turn.start({ text: `prompt-${k}`, turnId: `t${k}` } as never)
    await $.turn.complete({ turnId: `t${k}`, answer: '', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  }
  for (let k = 1; k <= 10; k++) await turn(k)
  const ui = await $.ui.mount({ ...PANE, viewport: { columns: 140, rows: 60 } as never })
  const has = async (k: number) => !!(await ui.find({ type: 'Text', text: new RegExp(`^"prompt-${k}"`) }))
  expect(await ui.find({ text: /T7–T10 \/ 10/ })).toBeDefined()
  expect(await has(10)).toBe(true)
  expect(await has(6)).toBe(false)
  // Column headers, braille trend (10 turns in 5 cells), scrollbar (last 4 of 10 turns: the bottom 2 cells are the bar)
  expect(await ui.find({ text: /tools result +time wt +cost/ })).toBeDefined()
  expect(await ui.find({ text: /^ {2}[\u2800-\u28ff]{5}$/ })).toBeDefined()
  expect((await ui.findAll({ type: 'Text', in: 'map-sb' })).map(n => n.text).join('')).toBe('││┃┃')

  await ui.press({ key: 'map-up' })
  expect(await has(3)).toBe(true)
  expect(await has(6)).toBe(true)
  expect(await has(7)).toBe(false)

  await turn(11)
  expect(await has(6)).toBe(true) // position holds
  expect(await has(11)).toBe(false)

  await ui.press({ key: 'map-down' })
  await ui.press({ key: 'map-down' })
  expect(await has(11)).toBe(true)
  await ui.unmount()
})

test('per-step tokens and cost (increase of the session running cost) show in the flow chart, log, and map', async ($, on) => {
  let total = 1.0
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [], cost: { usd: total } } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    total += 0.25 // this request cost 0.25 dollars
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0, model: 'm' } } as never
  })
  on('turn.complete', () => ({ text: '' }))
  await $.turn.start({ text: 'check cost', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  await new Promise<void>(r => setTimeout(r, 0))
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 1000, isAborted: false, reason: 'answer' } as never)

  const ui = await $.ui.mount({ ...PANE, viewport: { columns: 140, rows: 60 } as never })
  // New input 1k, cache read 9k, and output 2k each show separately.
  expect(await ui.find({ text: /^↑ 1k$/ })).toBeDefined()
  expect(await ui.find({ text: /^⟳ 9k$/ })).toBeDefined()
  expect(await ui.find({ text: /^↓ 2k$/ })).toBeDefined()
  expect(await ui.find({ text: /^≈\$0\.25$/ })).toBeDefined()
  expect(await ui.find({ text: /≈\$0\.25 total/ })).toBeDefined()
  await ui.unmount()
})

test('walk view navigation: ◂ N goes to earlier spots, and pressing N ▸ to the end returns to the latest spot', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: null } as never
  })
  await $.turn.start({ text: 'many steps', turnId: 't1' } as never)
  for (let i = 0; i < 12; i++) for await (const _ of $.turn.step({ turnId: 't1', index: i, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  const ui = await $.ui.mount({ ...PANE, props: { bodyColumns: 102 } as never, viewport: { columns: 140, rows: 60 } as never })
  await ui.press({ key: 'view-office' })
  const has = async (k: number) => !!(await ui.find({ type: 'Text', text: new RegExp(`step ${k}$`) }))
  expect(await has(12)).toBe(true)
  expect(await ui.find({ type: 'Button', key: 'quest-prev' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'quest-next' })).toBeUndefined()
  await ui.press({ key: 'quest-prev' })
  expect(await has(12)).toBe(false)
  expect(await ui.find({ type: 'Button', key: 'quest-next' })).toBeDefined()
  for (let i = 0; i < 5 && (await ui.find({ type: 'Button', key: 'quest-next' })); i++) await ui.press({ key: 'quest-next' })
  expect(await has(12)).toBe(true)
  expect(await ui.find({ type: 'Button', key: 'quest-next' })).toBeUndefined()
  await ui.unmount()
})

test('flow chart navigation: earlier goes to previous steps, later to next steps, and the end follows the latest', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: null } as never
  })
  await $.turn.start({ text: 'many steps', turnId: 't1' } as never)
  for (let i = 0; i < 12; i++) for await (const _ of $.turn.step({ turnId: 't1', index: i, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  // Only recent steps fit the body width; earlier ones fold into a 'Prv / N' box
  const ui = await $.ui.mount({ ...PANE, props: { bodyColumns: 102 } as never, viewport: { columns: 140, rows: 60 } as never })
  const has = async (k: number) => !!(await ui.find({ type: 'Text', text: new RegExp(`^◆ step ${k}$`) }))
  expect(await has(12)).toBe(true)
  expect(await has(8)).toBe(false)
  expect(await ui.find({ type: 'Button', key: 'flow-prev', text: /^\d+$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Prv$/ })).toBeDefined()
  // Prev/next boxes are 7 cells wide ('p: 12' in the terminal) so the step boxes keep the width.
  expect((await ui.findAll({ type: 'Box' })).some(b => (b.props as { width?: number }).width === 7)).toBe(true)

  await ui.press({ key: 'flow-prev' })
  expect(await has(12)).toBe(false)
  expect(await ui.find({ type: 'Button', key: 'flow-next' })).toBeDefined()

  // Pressing later to the end removes the button and shows the latest steps again.
  for (let i = 0; i < 5 && (await ui.find({ type: 'Button', key: 'flow-next' })); i++) await ui.press({ key: 'flow-next' })
  expect(await has(12)).toBe(true)
  expect(await ui.find({ type: 'Button', key: 'flow-next' })).toBeUndefined()
  await ui.unmount()
})

test('on a narrow panel the session map controls wrap to their own row instead of squeezing the title', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ ...PANE, props: { bodyColumns: 50 } as never, viewport: { columns: 52, rows: 60 } as never })
  expect((await ui.find({ type: 'Box', key: 'map-title-row' }))!.props).toMatchObject({ flexWrap: 'wrap', rowGap: 0 })
  await ui.unmount()
})

test('on a narrow panel session map rows keep only the turn, tool sequence, duration, and status', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await $.turn.start({ text: 'narrow map', turnId: 't1' } as never)
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  const narrow = await $.ui.mount({ ...PANE, props: { bodyColumns: 34 } as never, viewport: { columns: 36, rows: 60 } as never })
  expect(await narrow.find({ type: 'Text', text: /"narrow map"/ })).toBeUndefined()
  expect(await narrow.find({ type: 'Text', text: /tools result/ })).toBeUndefined()
  // (the map row's tool count is dim; the header summary's bold count is a different element)
  const mapTools = async (ui: typeof narrow) => (await ui.findAll({ type: 'Text', text: /^ *\d+ tools/ })).some(t => (t.props as { dimColor?: boolean }).dimColor)
  expect(await mapTools(narrow)).toBe(false)
  expect(await narrow.find({ type: 'Box', key: 'log-title-row' })).toBeDefined()
  await narrow.unmount()
  const wide = await $.ui.mount({ ...PANE, props: { bodyColumns: 140 } as never, viewport: { columns: 142, rows: 60 } as never })
  expect(await wide.find({ type: 'Text', text: /"narrow map"/ })).toBeDefined()
  expect(await wide.find({ type: 'Text', text: /tools result/ })).toBeDefined()
  expect(await mapTools(wide)).toBe(true)
  await wide.unmount()
})
