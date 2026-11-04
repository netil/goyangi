import { test, expect } from 'claude-code/testing'

// The test environment has setTimeout, but the types for hooks modules don't, so it's declared only here.
declare const setTimeout: (fn: () => void, ms: number) => unknown

const PANE = { plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 140, rows: 60 } as never } as const
const LONG = 'npx -y -p typescript@5.6.3 tsc -p /very/long/path/to/some/project/tsconfig.json --noEmit --pretty false'

test('a running tool shows a full command card, hidden when done and shown only on hover', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [{}], stopReason: 'tool_use', usage: null } as never
  })
  let release = () => {}
  on('tool.call', () => new Promise(res => { release = () => res({ result: {} as never }) }))

  await $.turn.start({ text: 'run a long command', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  const call = $.tool.call({ tool: 'Bash', command: LONG } as never)
  await new Promise<void>(r => setTimeout(r, 0))

  const ui = await $.ui.mount(PANE)
  const cards = async () => (await ui.findAll({ type: 'Box' })).filter(b => (b.props as { position?: string }).position === 'absolute')
  const all = await cards()
  const shown = all.filter(b => (b.props as { display?: string }).display === 'flex')
  expect(shown.length).toBe(1)
  // The running card must be drawn last in the panel so the session map and log don't cover it.
  expect(all[all.length - 1]).toBe(shown[0])
  expect(await ui.find({ text: /tsconfig\.json --noEmit --pretty false$/ })).toBeDefined()

  release()
  await call
  // When done, every card is hidden (display none) and shows only on hover (hover scope).
  const after = await cards()
  expect(after.length).toBeGreaterThan(0)
  expect(after.filter(b => (b.props as { display?: string }).display === 'flex').length).toBe(0)
  await ui.unmount()
})

test('every truncated area gets a hidden hover card', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('tool.call', () => ({ result: {} as never }))
  await $.tool.call({ tool: 'Bash', command: LONG } as never)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'fold-flow' }) // Drop the flow chart cards and look only at the log cards
  const hidden = (await ui.findAll({ type: 'Box' })).filter(b => {
    const p = b.props as { position?: string; display?: string }
    return p.position === 'absolute' && p.display === 'none'
  })
  expect(hidden.length).toBeGreaterThan(0)
  // The log row card holds the full, untruncated command.
  // List cards fill the column with no side padding: the first and last card lines hold the whole command.
  const lines = (await ui.findAll({ type: 'Text' })).filter(n => n.props.color === '#e6e9f5').map(n => n.text)
  expect(lines.some(l => /^Bash npx -y /.test(l))).toBe(true)
  expect(lines.some(l => /--pretty false$/.test(l))).toBe(true)
  await ui.unmount()
})

test('cards in the rightmost column stay within the panel body width', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [{}], stopReason: 'tool_use', usage: null } as never
  })
  let release = () => {}
  on('tool.call', () => new Promise(res => { release = () => res({ result: {} as never }) }))
  await $.turn.start({ text: 'right edge', turnId: 't1' } as never)
  for (let i = 0; i < 3; i++) for await (const _ of $.turn.step({ turnId: 't1', index: i, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  const call = $.tool.call({ tool: 'Bash', command: LONG } as never)
  await new Promise<void>(r => setTimeout(r, 0))

  const BODY = 60
  const ui = await $.ui.mount({ ...PANE, props: { bodyColumns: BODY } as never, viewport: { columns: 140, rows: 60 } as never })
  const card = (await ui.findAll({ type: 'Box' })).find(b => {
    const p = b.props as { position?: string; display?: string }
    return p.position === 'absolute' && p.display === 'flex'
  })
  const p = card!.props as { left: number; width: number; paddingX?: number }
  expect(p.left + p.width).toBeLessThanOrEqual(BODY)
  // The branch card runs to the panel's right edge with no side padding, to fit as many characters as possible
  expect(p.left + p.width).toBe(BODY - 2) // body less the panel scrollbar space
  expect(p.paddingX).toBeUndefined()
  release()
  await call
  await ui.unmount()
})
