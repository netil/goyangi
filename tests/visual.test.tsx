import { test, expect, mock } from 'claude-code/testing'
import { spark, isKeyLog, brailleSpark, lineGauge, rowCard } from '../hooks/state'
// The test environment has setTimeout, but the types for hooks modules don't, so it's declared only here.
declare const setTimeout: (fn: () => void, ms: number) => unknown

test('spark: splits heights relative to the max', async () => {
  expect(spark([1, 2, 4])).toMatch(/^.{2}█$/)
  expect(spark([0, 0])).toHaveLength(2)
  expect(spark([])).toBe('')
})

test('isKeyLog: successful tools and plain steps are not key events', async () => {
  expect(isKeyLog({ kind: 'prompt', ok: true, meta: '' })).toBe(true)
  expect(isKeyLog({ kind: 'tool', ok: true, meta: '' } as never)).toBe(false)
  expect(isKeyLog({ kind: 'tool', ok: false, meta: '' } as never)).toBe(true)
  expect(isKeyLog({ kind: 'step', ok: true, meta: '' })).toBe(false)
  expect(isKeyLog({ kind: 'step', ok: true, meta: 'cache ⟳↓' })).toBe(true)
})

test('the session log shows everything, then a toggle keeps only key events; legend row and gauges', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 12 }, rateLimits: [] } }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  await $.tool.call({ tool: 'Bash', command: 'echo quiet' })
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
  expect(await ui.find({ text: /echo quiet/ })).toBeDefined()
  expect(await ui.find({ text: /all 1/ })).toBeDefined()
  expect(await ui.find({ text: /^ctx +$/ })).toBeDefined()
  await ui.press({ key: 'log-all' })
  expect(await ui.find({ text: /key events 0/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /echo quiet/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /■ main/ })).toBeUndefined()
  await ui.unmount()
})

test('subagent boxes show their token share', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  on('tool.call', { tool: 'Read' }, () => ({ result: {} as never }))
  await $.agent.spawn({ prompt: 'x', description: 'find', subagentType: 'Explore' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/a/n.md', agentId: 'a1' } as never)
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
  expect(await ui.find({ text: /1 tools · tok \d+%/ })).toBeDefined()
  await ui.unmount()
})

test('braille sparkline, line gauge', async () => {
  // Two max values fill both columns: one ⣿ cell
  expect(brailleSpark([4, 4])).toBe('⣿')
  // One cell per two values; an odd count pads the front
  expect(brailleSpark([1, 2, 3, 4, 5])).toHaveLength(3)
  expect(brailleSpark([0, 4])).toBe('⢸')
  expect(lineGauge(50, 6)).toEqual(['━━━', '───'])
  expect(lineGauge(120, 4)).toEqual(['━━━━', ''])
})

test('session log scrollbar: with more rows than fit, a position bar appears on the right and clicking it moves the log', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  for (let i = 0; i < 8; i++) await $.tool.call({ tool: 'Bash', command: `echo ${i}` })
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
  // The bar is drawn by the scrollbar surface module: the last rows are in view, so the thumb ┃ sits at the bottom
  const bar = async () => (await ui.findAll({ type: 'Text', in: 'log-sb' })).map(n => n.text).join('')
  expect(await bar()).toMatch(/^│+┃+$/)
  // Hovering shows a ◆ marker on the cell under the pointer, so you can see where a click lands; leaving removes it
  const settle = () => new Promise<void>(r => setTimeout(r, 0))
  await ui.pointer({ type: 'move', x: 0, y: 1, in: 'log-sb' })
  await settle()
  expect((await bar())[1]).toBe('◆')
  await ui.pointer({ type: 'leave', x: 0, y: 1, in: 'log-sb' })
  await settle()
  expect(await bar()).not.toContain('◆')
  // Clicking the top of the bar moves the log to its start (stops following the latest); clicking the bottom follows the latest again
  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'log-sb' })
  await ui.pointer({ type: 'up', x: 0, y: 0, button: 'left', in: 'log-sb' })
  await settle()
  expect(await ui.find({ type: 'Text', text: /⏸ paused/ })).toBeDefined()
  expect((await bar()).replace('◆', '┃')).toMatch(/^┃+│+$/) // the marker stays on the clicked cell
  const h = (await bar()).length
  await ui.pointer({ type: 'down', x: 0, y: h - 1, button: 'left', in: 'log-sb' })
  await ui.pointer({ type: 'up', x: 0, y: h - 1, button: 'left', in: 'log-sb' })
  await settle()
  expect(await ui.find({ type: 'Text', text: /⏸ paused/ })).toBeUndefined()
  // The key events view has 0 entries, so there's no bar
  await ui.press({ key: 'log-all' })
  expect(await bar()).not.toContain('┃')
  await ui.unmount()
})

test('a wide panel has no tabs and draws every section', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
  expect(await ui.find({ type: 'Text', text: /1 advisor/ })).toBeUndefined()
  expect(await ui.find({ text: /no server tools/ })).toBeDefined()
  expect(await ui.find({ text: /no subagents yet/ })).toBeDefined()
  await ui.unmount()
})

test('the key events view also scrolls with ▲ ▼', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('tool.call', { tool: 'Bash' }, () => { throw new Error('boom') })
  for (let i = 0; i < 8; i++) await $.tool.call({ tool: 'Bash', command: `false ${i}` }).catch(() => undefined)
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
  await ui.press({ key: 'log-all' }) // switch to the key events view
  expect(await ui.find({ text: /key events 5–8 \/ 8/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /^▲$/ })).toBeDefined()
  await ui.press({ key: 'log-up' })
  expect(await ui.find({ text: /key events 1–4 \/ 8/ })).toBeDefined()
  expect(await ui.find({ text: /false 0/ })).toBeDefined()
  await ui.press({ key: 'log-down' })
  expect(await ui.find({ text: /key events 5–8 \/ 8/ })).toBeDefined()
  await ui.unmount()
})

test('rowCard: the card covers the hovered row and runs down, shifting up near the bottom of the area', async () => {
  // The top row: the card starts on that row
  expect(rowCard('abcdefgh', 0, 4, 4)).toEqual({ top: 0, lines: ['abcd', 'efgh'] })
  // The bottom row: shifted up to fit inside the area
  expect(rowCard('abcdefgh', 3, 4, 4)).toEqual({ top: 2, lines: ['abcd', 'efgh'] })
  // Longer than the area: fills it and shortens the last line with …
  expect(rowCard('a'.repeat(20), 3, 4, 4)).toEqual({ top: 0, lines: ['aaaa', 'aaaa', 'aaaa', 'aaa…'] })
  // One-line content sits exactly on the row
  expect(rowCard('hi', 2, 4, 10)).toEqual({ top: 2, lines: ['hi'] })
  // A wrapped line never starts with a space
  expect(rowCard('ab cd', 0, 4, 2)).toEqual({ top: 0, lines: ['ab', 'cd'] })
})

test('long row cards in the session log stay within the log list area (4 rows)', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  await $.tool.call({ tool: 'Bash', command: `echo ${'x'.repeat(300)}` })
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
  // Only the session log's cards (the top boxes have 5 rows of their own)
  const cards = (await ui.findAll({ type: 'Box' })).filter(b => String(b.key ?? '').startsWith('ac-log-')).map(b => b.props as { position?: string; top?: number; height?: number })
    .filter(p => p.position === 'absolute' && p.top !== undefined && p.height !== undefined)
  expect(cards.length).toBeGreaterThan(0)
  for (const c of cards) {
    expect(c.top!).toBeGreaterThanOrEqual(0)
    expect(c.top! + c.height!).toBeLessThanOrEqual(4)
  }
  // Cards fill the list column with no side padding: a full card line is as wide as the column (panel body 116 - border and padding 4 - list scrollbar 2)
  const widths = (await ui.findAll({ type: 'Text' })).filter(n => n.props.color === '#e6e9f5' && /^x+$/.test(n.text)).map(n => n.text.length)
  expect(Math.max(...widths)).toBe(110)
  await ui.unmount()
})

test('the session map legend shows in full even at narrow widths', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await $.turn.start({ text: 'p1', turnId: 't1' } as never)
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 100, rows: 40 } as never })
  const legend = (await ui.findAll({ type: 'Text', text: /Bash .*compact/ })).map(n => n.props as { wrap?: string })
  expect(legend.length).toBeGreaterThan(0)
  expect(legend.every(p => p.wrap !== 'truncate')).toBe(true)
  expect(await ui.find({ text: /tools result +time wt +cost/ })).toBeDefined()
  await ui.unmount()
})

test('in-progress steps use Claude Code spinner glyphs and ◆ when done', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  let release = () => {}
  const gate = new Promise<void>(r => { release = r })
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'hi' } as never
    await gate
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' } } as never
  })
  await $.turn.start({ text: 'progress', turnId: 't1' } as never)
  const it = $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)[Symbol.asyncIterator]()
  await it.next()
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
  expect(await ui.find({ text: /^[·✢✳✶✻✽] step 1$/ })).toBeDefined()
  release()
  while (!(await it.next()).done) { /* drain */ }
  await ui.redraw()
  expect(await ui.find({ text: /^◆ step 1$/ })).toBeDefined()
  await ui.unmount()
})

test('footer shortcut hints wrap to the next row at narrow widths instead of being cut', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 100, rows: 40 } as never })
  const nav = (await ui.findAll({ type: 'Text', text: /k\/j scroll session log/ })).map(n => n.props as { wrap?: string })
  expect(nav.length).toBeGreaterThan(0)
  expect(nav.every(p => p.wrap !== 'truncate')).toBe(true)
  // Each row's items wrap inside their own column, and the hints sit on their own row (vertical layout)
  const boxes = (await ui.findAll({ type: 'Box' })).map(b => b.props as { backgroundColor?: string; flexWrap?: string; flexDirection?: string; height?: number })
  const bar = boxes.find(p => p.backgroundColor === 'subtle')
  expect(bar?.flexDirection).toBe('column')
  expect(bar?.height).toBeUndefined()
  expect(boxes.some(p => p.flexWrap === 'wrap')).toBe(true)
  // So wrapped rows get no blank row between them, wrapping boxes use only horizontal spacing, no row gap
  const footRow = (await ui.find({ type: 'Box', key: 'foot-sections' }))!
  const wrapRow = (footRow.children as { props: { flexWrap?: string; gap?: number; rowGap?: number; columnGap?: number } }[]).map(c => c.props).find(p => p.flexWrap === 'wrap')
  expect(wrapRow?.gap).toBeUndefined()
  expect(wrapRow?.rowGap ?? 0).toBe(0)
  expect(wrapRow?.columnGap).toBe(2)
  // Shortcut keys are emphasized in bold theme text color (visible on light backgrounds too)
  const keys = (await ui.findAll({ type: 'Text', text: /^(p\/n|u\/d|k\/j)$/ })).map(n => n.props as { bold?: boolean; color?: string })
  expect(keys.length).toBe(3)
  expect(keys.every(p => p.bold && p.color === 'text')).toBe(true)
  expect(await ui.find({ type: 'Button', text: /Close/ })).toBeDefined()
  await ui.unmount()
})

test('footer: three rows, each starting with a name (Sections, Panel, Keys), with the navigation shortcut hints on the Keys row', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
  expect(await ui.find({ text: /^Sections$/ })).toBeDefined()
  expect(await ui.find({ text: /^Panel$/ })).toBeDefined()
  // The old [shortcuts] title and '|' separators are gone
  expect(await ui.find({ text: /^\[shortcuts\]$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^\|$/ })).toBeUndefined()
  // The close button isn't dimmed (so the engine-drawn 'x:' stays bright)
  const closeBtn = await ui.find({ type: 'Button', text: /Close/ })
  expect((closeBtn?.props as { dimColor?: boolean } | undefined)?.dimColor).toBeFalsy()
  // Hints are separate items (no '·' separators), so wrapping never leaves a separator dangling at a line end
  expect((await ui.find({ type: 'Box', key: 'foot-keys' }))!.text).toBe('Keysp/n move stepu/d scroll session mapk/j scroll session log')
  await ui.unmount()
})

test('running tool cards and branch status also use the spinner glyphs', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [{}], stopReason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' } } as never
  })
  let release = () => {}
  const gate = new Promise<void>(r => { release = r })
  on('tool.call', async () => { await gate; return { result: {} as never } })
  await $.turn.start({ text: 'running tool', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* */ }
  const call = $.tool.call({ tool: 'Read', file_path: '/a/b.ts' } as never)
  await new Promise<void>(r => setTimeout(r, 0))
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
  expect(await ui.find({ text: /^[·✢✳✶✻✽] running · / })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /◐/ })).toBeUndefined()
  release()
  await call
  await ui.unmount()
})

test('the command is registered as /goyangi and running it opens the panel', async ($, on) => {
  const names: string[] = []
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', ($, e) => { names.push((e as { name: string }).name); return { value: undefined } as never })
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  mock.clock(on, { now: 1_700_000_000_000 })
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  expect(names).toEqual(['goyangi'])
  const r = await $.command.run({ command: 'goyangi', args: '' } as never)
  expect((r as { text?: string }).text).toMatch(/Opened the Goyangi panel/)
})

test('opening with /goyangi expands every folded section', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 50 } as never })
  await ui.press({ key: 'fold-log' })
  expect(await ui.find({ text: /^l session log ▸$/ })).toBeDefined()
  await $.command.run({ command: 'goyangi', args: '' } as never)
  expect(await ui.find({ text: /^l session log ▾$/ })).toBeDefined()
  await ui.unmount()
})

test('starting a session opens the panel (autoOpen on by default)', async ($, on) => {
  const opened: string[] = []
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('ui.open', ($, e) => { opened.push((e as { id: string }).id); return { value: { isPlaced: true } } as never })
  mock.clock(on, { now: 1_700_000_000_000 })
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  await new Promise<void>(r => setTimeout(r, 0))
  expect(opened).toEqual(['goyangi'])
})

test('with autoOpen off, starting a session doesn\'t open the panel', { options: { autoOpen: false } }, async ($, on) => {
  const opened: string[] = []
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('ui.open', ($, e) => { opened.push((e as { id: string }).id); return { value: { isPlaced: true } } as never })
  mock.clock(on, { now: 1_700_000_000_000 })
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  await new Promise<void>(r => setTimeout(r, 0))
  expect(opened).toEqual([])
})

test('changing a setting doesn\'t revert a view mode saved by another session', async ($, on) => {
  const kv = new Map<string, unknown>()
  on('store.get', ($, e) => ({ value: kv.get((e as { key: string }).key) }) as never)
  on('store.set', ($, e) => { const { key, value } = e as { key: string; value: unknown }; kv.set(key, value); return { value: undefined } as never })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  mock.clock(on, { now: 1_700_000_000_000 })
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 50 } as never })
  // After this panel opened, another session switched to the walk view and saved it
  kv.set('prefs', { view: 'avatar' })
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'set-autoUpdate' })
  await new Promise<void>(r => setTimeout(r, 0))
  expect(kv.get('prefs')).toEqual({ view: 'avatar', autoUpdate: false })
  await ui.unmount()
})

test('settings screen: opens with ⚙; changing auto open and thresholds is saved and applied to the next session', async ($, on) => {
  const opened: string[] = []
  mock.store(on, {})
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('ui.open', ($, e) => { opened.push((e as { id: string }).id); return { value: { isPlaced: true } } as never })
  mock.clock(on, { now: 1_700_000_000_000 })
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 50 } as never })
  expect(await ui.find({ type: 'Text', text: /^⚙ Settings$/ })).toBeUndefined()
  await ui.press({ key: 'settings' })
  expect(await ui.find({ text: /^⚙ Settings$/ })).toBeDefined()
  expect(await ui.find({ text: /^On$/ })).toBeDefined()
  expect(await ui.find({ text: /^80%$/ })).toBeDefined()
  // Auto update is on by default; pressing turns it off
  expect(await ui.find({ text: /^On$/ })).toBeDefined()
  await ui.press({ key: 'set-autoUpdate' })
  await ui.press({ key: 'set-autoOpen' })
  await ui.press({ key: 'inc-ctxAlertPercent' })
  await ui.press({ key: 'dec-stallSeconds' })
  expect((await ui.findAll({ type: 'Button', text: /^Off$/ })).length).toBe(2)
  expect(await ui.find({ text: /^90%$/ })).toBeDefined()
  expect(await ui.find({ text: /^90s$/ })).toBeDefined()
  await ui.unmount()
  // Next session: reads the saved value (autoOpen off) and doesn't open the panel
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  await new Promise<void>(r => setTimeout(r, 0))
  expect(opened).toEqual([])
  // Resetting to defaults clears the saved values
  const ui2 = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 50 } as never })
  // Reopening shows the saved value (90%) as is (the settings screen stays open)
  expect(await ui2.find({ type: 'Text', text: /^90%$/ })).toBeDefined()
  await ui2.press({ key: 'settings-reset' })
  expect(await ui2.find({ type: 'Text', text: /^80%$/ })).toBeDefined()
  await ui2.unmount()
  // Back to defaults (auto open on), so the next session opens it
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  await new Promise<void>(r => setTimeout(r, 0))
  expect(opened).toEqual(['goyangi'])
})


test('panel position: switching to bottom closes the Pane and draws above the prompt; /goyangi also opens at the bottom, and it can move back right', async ($, on) => {
  const calls: string[] = []
  mock.store(on, {})
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('ui.open', ($, e) => { calls.push(`open:${e.id}`); return { value: { isPlaced: true } } as never })
  on('ui.close', ($, e) => { calls.push(`close:${e.id}`); return { value: undefined } as never })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  // The empty area the engine draws when the plugin doesn't
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => { const { Box } = $.ui.resolve(e); return <Box /> })
  mock.clock(on, { now: 1_700_000_000_000 })
  const bandProps = { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 120 } as never
  const mountBand = () => $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'AbovePrompt', props: bandProps, viewport: { columns: 140, rows: 60 } as never })
  // In the default (right), the panel isn't drawn above the prompt. This area stays mounted while the position changes.
  const band = await mountBand()
  expect(await band.find({ type: 'Text', text: /^ 🐱 Goyangi $/ })).toBeUndefined()
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 50 } as never })
  await ui.press({ key: 'settings' })
  expect(await ui.find({ text: /^Right$/ })).toBeDefined()
  await ui.press({ key: 'set-position' })
  await new Promise<void>(r => setTimeout(r, 0))
  expect(calls).toEqual(['close:goyangi'])
  await ui.unmount()
  expect(await band.find({ type: 'Text', text: /^ 🐱 Goyangi $/ })).toBeDefined()
  expect(await band.find({ text: /^Bottom \(above prompt\)$/ })).toBeDefined()
  // At the bottom, the header's move icon points right (where pressing it sends the panel)
  expect(((await band.find({ type: 'Button', key: 'move' }))!.props as { label?: string }).label).toBe(' > ')
  // Even with a small area height (maxRows), running subagent boxes are drawn
  await $.turn.start({ text: 'agent', turnId: 't1' } as never)
  await $.agent.spawn({ prompt: 'y', description: 'live one', subagentType: 'Plan' } as never)
  await new Promise<void>(r => setTimeout(r, 0))
  expect(await band.find({ type: 'Button', text: /^Plan$/ })).toBeDefined()
  // Closing with [x] removes it from the area
  await band.press({ key: 'close' })
  await new Promise<void>(r => setTimeout(r, 0))
  expect(await band.find({ type: 'Text', text: /^ 🐱 Goyangi $/ })).toBeUndefined()
  // /goyangi doesn't open the Pane; it redraws in the bottom area
  await $.command.run({ command: 'goyangi', args: '' } as never)
  expect(calls).toEqual(['close:goyangi'])
  expect(await band.find({ type: 'Text', text: /^ 🐱 Goyangi $/ })).toBeDefined()
  // Moving back right with the header's ⇵ clears the area and opens the Pane
  await band.press({ key: 'move' })
  await new Promise<void>(r => setTimeout(r, 0))
  expect(calls).toEqual(['close:goyangi', 'open:goyangi'])
  expect(await band.find({ type: 'Text', text: /^ 🐱 Goyangi $/ })).toBeUndefined()
  await band.unmount()
})

test('header button tooltips: each button gets a hidden description card after the sections', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 50 } as never })
  // The test tree doesn't carry hover values, so pairs are checked by key: the tip-box-* box around each button and the hidden card tip-*
  type P = { key?: string; position?: string; display?: string }
  const boxes = (await ui.findAll({ type: 'Box' })).map(b => b.props as P)
  for (const k of ['move', 'settings', 'fold', 'close']) {
    expect(boxes.some(p => p.key === `tip-box-${k}`)).toBe(true)
    const tip = boxes.find(p => p.key === `tip-${k}`)
    expect(tip?.position).toBe('absolute')
    expect(tip?.display).toBe('none')
    // Drawn after the sections so the sections below don't cover them
    expect(boxes.indexOf(tip!)).toBeGreaterThan(boxes.map(p => p.position).lastIndexOf(undefined))
  }
  // Only the button names, no descriptions
  for (const name of ['Move', 'Config', 'Minimize', 'Close']) expect(await ui.find({ type: 'Text', text: ` ${name} ` })).toBeDefined()
  await ui.unmount()
})

test('header: one row even at narrow widths; the status chip and buttons stay on the right and the summary is cut', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: { bodyColumns: 40 } as never, requestId: 'goyangi', viewport: { columns: 42, rows: 40 } as never })
  const boxes = await ui.findAll({ type: 'Box' })
  const header = boxes.find(b => (b.props as { backgroundColor?: string; height?: number }).backgroundColor === 'text' && (b.props as { height?: number }).height === 1)
  expect(header).toBeDefined()
  expect((header!.props as { overflow?: string }).overflow).toBe('hidden')
  // The summary and logo can shrink to nothing (minWidth 0; the terminal layout keeps a text box at its minimum width otherwise), the summary first, so the buttons always stay
  expect((await ui.find({ type: 'Box', key: 'head-summary' }))!.props).toMatchObject({ flexShrink: 1, minWidth: 0, overflow: 'hidden' })
  expect(await ui.find({ type: 'Text', text: ' 🐱 Goyangi ' })).toBeDefined()
  // The status chip sits in the flow, in a non-shrinking right group with the buttons (nothing overlaid), so narrow widths cut the summary instead
  const right = await ui.find({ type: 'Box', key: 'head-right' })
  expect((right!.props as { flexShrink?: number }).flexShrink).toBe(0)
  expect(right!.text).toBe("○ idle v  =  -  x ")
  expect(boxes.some(b => (b.props as { position?: string }).position === 'absolute' && JSON.stringify(b).includes('○ idle'))).toBe(false)
  // The header background (text) and button text color look the same, so the right buttons must sit in chip-colored boxes
  for (const k of ['move', 'settings', 'fold', 'close']) {
    const box = await ui.find({ type: 'Box', key: `tip-box-${k}` })
    expect((box?.props as { backgroundColor?: string } | undefined)?.backgroundColor).toBeTruthy()
  }
  await ui.unmount()
})

test('every button has a hover scope that turns it bold and underlined', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 140, rows: 60 } as never })
  // The engine moves hover from props into the element's hover field and doesn't carry it in find results. Walk the drawn tree directly.
  type Node = { type?: string; hover?: { scope?: string; bold?: boolean; underline?: boolean }; children?: unknown[] }
  const buttons: Node[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    const node = n as Node
    if (node.type === 'Button') buttons.push(node)
    for (const c of node.children ?? []) walk(c)
  }
  walk(await ui.drawn())
  expect(buttons.length).toBeGreaterThan(0)
  for (const b of buttons) {
    const h = (b as { hover?: { scope?: string; bold?: boolean; underline?: boolean; color?: string } }).hover
    expect(h?.scope).toBeTruthy()
    expect(h?.bold && h?.underline).toBe(true)
    // Buttons with a hotkey color the label like the hotkey on hover, so both invert to one background
    if ((b as { props?: { hotkey?: string } }).props?.hotkey) expect(h?.color).toBe('suggestion')
  }
  expect(buttons.some(b => (b as { props?: { hotkey?: string } }).props?.hotkey)).toBe(true)
  await ui.unmount()
})

test('the view button toggles between the walk view and the default view', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  await $.tool.call({ tool: 'Bash', command: 'echo office' })
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
  expect(await ui.find({ text: /TURN FLOW/ })).toBeDefined()
  await ui.press({ key: 'view-office' })
  expect(await ui.find({ text: /TURN WALK/ })).toBeDefined()
  expect(await ui.find({ text: /TURN FLOW/ })).toBeUndefined()
  expect(await ui.find({ text: /^main$/ })).toBeDefined()
  expect(await ui.find({ text: /echo office/ })).toBeDefined()
  await ui.press({ key: 'hint-view' })
  expect(await ui.find({ text: /TURN FLOW/ })).toBeDefined()
  await ui.unmount()
})

test('walk view: subagents work in boxes and show failure when they fail; main\'s running tool shows as a card', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  on('tool.call', { tool: 'Read' }, () => new Promise(() => {}) as never)
  let finish: () => void = () => {}
  on('tool.call', { tool: 'Bash' }, () => new Promise(r => { finish = () => r({ result: { stdout: '', stderr: '', interrupted: false } } as never) }) as never)
  on('turn.complete', () => ({ text: '' }))
  await $.turn.start({ text: 'research', turnId: 't1' } as never)
  await $.agent.spawn({ prompt: 'x', description: 'find docs', subagentType: 'Explore' } as never)
  void $.tool.call({ tool: 'Read', file_path: '/a/n.md', agentId: 'a1' } as never)
  const bash = $.tool.call({ tool: 'Bash', command: 'sleep 5' } as never)
  await new Promise<void>(r => setTimeout(r, 0))
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
  await ui.press({ key: 'view-office' })
  // Subagent box: name, status, current work
  expect(await ui.find({ text: /^Explore$/ })).toBeDefined()
  expect(await ui.find({ text: /Reading/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Read\s+n\.md/ })).toBeDefined()
  // main's running tool shows its full content as a card (whitespace collapsed, split into lines), drawn at the very end of the panel
  expect(await ui.find({ type: 'Text', text: /^⚙ Bash sleep 5$/ })).toBeDefined()
  const order = JSON.stringify(await ui.findAll({ type: 'Text' }))
  expect(order.lastIndexOf('⚙ Bash sleep 5')).toBeGreaterThan(order.lastIndexOf('HI '))
  finish(); await bash
  await $.turn.complete({ turnId: 't1', agentId: 'a1', answer: '', durationMs: 10, isAborted: false, reason: 'error' } as never)
  await new Promise<void>(r => setTimeout(r, 0))
  expect(await ui.find({ text: /^Explore$/ })).toBeDefined()
  expect(await ui.find({ text: /Something went wrong/ })).toBeDefined()
  // The card closes when the tool ends
  expect(await ui.find({ type: 'Text', text: /^⚙ Bash sleep 5$/ })).toBeUndefined()
  await ui.unmount()
})

test('walk view pixels (robot, props, clouds, ground, flags): characters in the terminal, Svg on desktop', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  await $.turn.start({ text: 'research', turnId: 't1' } as never)
  await $.agent.spawn({ prompt: 'x', description: 'find docs', subagentType: 'Explore' } as never)
  await $.tool.call({ tool: 'Bash', command: 'echo office' })
  const block = /[▀▄▔▕\u{1CD00}-\u{1CEBF}]/u
  const lines: Record<string, number> = {}
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'goyangi', surface, component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
    await ui.press({ key: 'view-office' })
    expect(await ui.find({ text: /TURN WALK/ })).toBeDefined()
    // Number of Text nodes using pixel, ground, and pole characters
    lines[surface] = (await ui.findAll({ type: 'Text' })).filter(t => block.test(t.text)).length
    const svgs = await ui.findAll({ type: 'Svg' })
    const src = (s: { props: Record<string, unknown> }) => String(s.props.source)
    if (surface === 'terminal') {
      expect(svgs).toHaveLength(0)
      expect(lines.terminal).toBeGreaterThan(0)
    } else {
      // No block or octant characters remain on desktop
      expect(lines.desktop).toBe(0)
      // Desktop doesn't draw Svg with an empty alt
      for (const s of svgs) expect(String(s.props.alt).trim()).not.toBe('')
      // The sky (clouds) and the ground of subagent boxes are 4-pixel-high bands
      const strips = svgs.filter(s => /viewBox="0 0 \d+ 4"/.test(src(s)))
      expect(strips.length).toBeGreaterThanOrEqual(2)
      for (const s of strips) expect(s.props.height).toBe(16)
      // Subagent robot (16 pixels × 4px)
      const dots = svgs.filter(s => /viewBox="0 0 \d+ 16"/.test(src(s)))
      expect(dots.length).toBeGreaterThanOrEqual(1)
      for (const s of dots) expect(s.props.height).toBe(64)
      // main lane: robot, props, flags, and ground drawn as one image (16 art + 4 ground pixels)
      const lanes = svgs.filter(s => /viewBox="0 0 \d+ 20"/.test(src(s)))
      expect(lanes).toHaveLength(1)
      expect(lanes[0]!.props.height).toBe(80)
      expect(String(lanes[0]!.props.alt)).toMatch(/^main /)
      expect(strips.length + dots.length + lanes.length).toBe(svgs.length)
    }
    await ui.unmount()
  }
})

test('walk view mood: night sky at a 95% 5h limit, an advice bubble, and the sS$ mark and red turn cost once the cost passes its alert', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  let total = 1
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 85 }, rateLimits: [{ kind: 'five_hour', percentUsed: 95, resetsAt: new Date(1_700_003_600_000).toISOString() }], cost: { usd: total } } as never }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    total += 2.5
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' } } as never
  })
  await $.turn.start({ text: 'heavy turn', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  await new Promise<void>(r => setTimeout(r, 0))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'goyangi', surface, component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
    await ui.press({ key: 'view-office' })
    if (surface === 'terminal') {
      // Night sky (dark navy) behind the clouds; the warning bubble (context 85%) over main's head
      expect((await ui.findAll({ type: 'Text' })).some(t => { const p = t.props as { color?: string; backgroundColor?: string }; return p.color === '#121a3a' || p.backgroundColor === '#121a3a' })).toBe(true)
      expect(await ui.find({ type: 'Text', text: /^ ! $/ })).toBeDefined()
      // Cost past the $2 alert: the top mark over the back and the turn total next to main's status, both red
      // (the mark appears one character per frame: s, sS, sS$)
      expect((await ui.findAll({ type: 'Text', text: /^sS?\$?$/ })).some(t => (t.props as { color?: string }).color === '#f28b82')).toBe(true)
      expect(((await ui.find({ type: 'Text', text: /\$2\.50 this turn/ }))?.props as { color?: string } | undefined)?.color).toBe('#f28b82')
    } else {
      const svgs = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.source))
      const lane = svgs.find(s => /viewBox="0 0 \d+ 20"/.test(s))!
      // The cost mark drawn into main's lane image
      expect(lane).toMatch(/>sS?\$?<\/text>/)
      expect(lane).toContain('>!</text>')
      // No sky fill behind the clouds on desktop; the moon and stars still show
      expect(svgs.some(s => s.includes('#1e3a8a33'))).toBe(false)
      expect(svgs.some(s => s.includes('#e5e7eb'))).toBe(true)
    }
    await ui.unmount()
  }
})

test('walk view replay: clicking a past turn in the session map walks main through that turn, and latest ▸ returns', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } as never }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  on('turn.complete', () => ({ text: '' }))
  await $.turn.start({ text: 'first turn', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  await new Promise<void>(r => setTimeout(r, 0))
  await $.turn.start({ text: 'second turn', turnId: 't2' } as never)
  await new Promise<void>(r => setTimeout(r, 0))
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 140, rows: 60 } as never })
  await ui.press({ key: 'view-office' })
  await ui.press({ key: 'map-open-t1' })
  expect(await ui.find({ text: /T1 replay · latest/ })).toBeDefined()
  expect(await ui.find({ text: /first turn/ })).toBeDefined()
  await ui.press({ key: 'walk-live' })
  expect(await ui.find({ text: /replay/ })).toBeUndefined()
  await ui.unmount()
})

test('walk view replay of a long turn starts with the pet on the first spot at any width (nothing folded behind ◂ N)', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } as never }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  on('turn.complete', () => ({ text: '' }))
  await $.turn.start({ text: 'long turn', turnId: 't1' } as never)
  for (let i = 0; i < 9; i++) for await (const _ of $.turn.step({ turnId: 't1', index: i, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  await new Promise<void>(r => setTimeout(r, 0))
  await $.turn.start({ text: 'next', turnId: 't2' } as never)
  await new Promise<void>(r => setTimeout(r, 0))
  for (let columns = 100; columns <= 134; columns += 2) {
    const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns, rows: 60 } as never })
    await ui.press({ key: 'view-office' })
    await ui.press({ key: 'map-open-t1' })
    expect(await ui.find({ text: /T1 replay/ })).toBeDefined()
    expect(await ui.find({ key: 'quest-prev' })).toBeUndefined()
    expect(await ui.find({ key: 'quest-next' })).toBeDefined()
    await ui.press({ key: 'walk-live' })
    await ui.unmount()
  }
})

test('walk view: a subagent that just finished runs back to main (↩ main) before it rests', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  on('turn.complete', () => ({ text: '' }))
  await $.turn.start({ text: 'research', turnId: 't1' } as never)
  await $.agent.spawn({ prompt: 'x', description: 'find docs', subagentType: 'Explore' } as never)
  await $.turn.complete({ turnId: 't1', agentId: 'a1', answer: 'done', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  await new Promise<void>(r => setTimeout(r, 0))
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
  await ui.press({ key: 'view-office' })
  expect(await ui.find({ text: /↩ main/ })).toBeDefined()
  await ui.unmount()
})

test('backgrounds: dark colors on dark terminals, pale colors on light terminals, translucent colors on desktop', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  let theme = 'dark'
  on('config.list', () => ({ value: [{ key: 'theme', value: theme }] }) as never)
  const DARK = ['#2f6f57', '#2a2f45', 'subtle']
  const bgs = async (surface: 'terminal' | 'desktop') => {
    const ui = await $.ui.mount({ plugin: 'goyangi', surface, component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
    const v = (await ui.findAll({ type: 'Box' })).map(b => b.props.backgroundColor).filter((c): c is string => typeof c === 'string')
    await ui.unmount()
    return v
  }
  const dark = await bgs('terminal')
  for (const c of DARK) expect(dark).toContain(c)
  theme = 'light'
  const light = await bgs('terminal')
  for (const c of DARK) expect(light).not.toContain(c)
  expect(light.some(c => /^#[0-9a-f]{6}$/.test(c) && parseInt(c.slice(1, 3), 16) > 200)).toBe(true)
  theme = 'dark'
  const desk = await bgs('desktop')
  for (const c of DARK) expect(desk).not.toContain(c)
  // The header also uses a pale background instead of the inverted one (text)
  expect(dark).toContain('text')
  expect(desk).not.toContain('text')
  expect(desk.some(c => /^#[0-9a-f]{6}33$/.test(c))).toBe(true)
})

test('desktop: the session log is 4 rows, the scrollbar is a painted box instead of characters, and the top boxes use min height', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  for (let i = 0; i < 12; i++) await $.tool.call({ tool: 'Bash', command: `echo ${i}` })
  const logRows = async (surface: 'terminal' | 'desktop', columns = 120) => {
    const ui = await $.ui.mount({ plugin: 'goyangi', surface, component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns, rows: 80 } as never })
    const texts = await ui.findAll({ type: 'Text' })
    const rows = texts.filter(t => /^\d\d:\d\d:\d\d $/.test(t.text)).length
    const glyphs = texts.filter(t => /^[┃│]$/.test(t.text)).length
    const boxes = await ui.findAll({ type: 'Box' })
    // Desktop scrollbar: the surface module (scrollbar.tsx) paints the thumb as a dark (C.main) box
    const thumbs = surface === 'desktop' ? (await ui.findAll({ type: 'Box', in: 'log-sb' })).filter(b => b.props.backgroundColor === '#7dd3a8').length : 0
    // Top box: fixed height in the terminal (7 rows with no usage limits); no height on desktop, fitting the content (no blank row below)
    const top = boxes.filter(b => b.props.minHeight === 7 || b.props.height === 7).map(b => (b.props.height === 7 ? 'h' : 'min'))
    // Line on the right of the view mode row: desktop doesn't use truncate (it appends …)
    const ruleTrunc = texts.some(x => /^─+$/.test(x.text) && x.props.wrap === 'truncate')
    // On desktop every box can be narrower than its content (so narrowing the panel never overflows boxes)
    const shrink = boxes.every(b => b.props.minWidth === 0)
    // Top box: the gauges in their own column on the right when wide
    const pair = boxes.filter(b => b.key === 'stat-cols').length
    await ui.unmount()
    return { rows, glyphs, thumbs, top, shrink, pair, ruleTrunc }
  }
  const term = await logRows('terminal')
  const desk = await logRows('desktop')
  // The terminal gives leftover rows to the session log so all 12 rows show; desktop shows only 4 and draws the thumb as a box
  expect(term.rows).toBe(12)
  expect(desk.rows).toBe(4)
  expect(desk.glyphs).toBe(0)
  expect(desk.thumbs).toBeGreaterThan(0)
  expect(term.top).toEqual(['h'])
  expect(desk.top).toEqual([])
  expect(desk.ruleTrunc).toBe(false)
  expect(term.ruleTrunc).toBe(true)
  expect(desk.shrink).toBe(true)
  // At 64 columns or wider the gauges take a column on the right; narrower, they follow the other rows
  expect(desk.pair).toBe(1)
  expect((await logRows('desktop', 50)).pair).toBe(0)
  expect(term.shrink).toBe(false)
})

test('walk view running card: long commands split into two rows and shorten with …; desktop uses a translucent background fitted to the content height', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', { tool: 'Bash' }, () => new Promise(() => {}) as never)
  await $.turn.start({ text: 'research', turnId: 't1' } as never)
  void $.tool.call({ tool: 'Bash', command: `echo ${'x'.repeat(300)}` } as never)
  await new Promise<void>(r => setTimeout(r, 0))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'goyangi', surface, component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
    await ui.press({ key: 'view-office' })
    const head = await ui.find({ type: 'Text', text: /^⚙ Bash echo x+$/ })
    expect(head).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^x+…$/ })).toBeDefined()
    const card = (await ui.findAll({ type: 'Box' })).find(b => b.props.borderColor === '#f6c177' && b.props.position === 'absolute')!
    expect(card.props.backgroundColor).toBe(surface === 'desktop' ? '#1e2030cc' : '#1e2030')
    expect(card.props.height).toBe(surface === 'desktop' ? undefined : 5)
    await ui.unmount()
  }
})

test('mouse wheel: over the session log and session map it scrolls that list; elsewhere it scrolls the panel', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  // The engine's panel scroll: reaching here means Goyangi didn't move a list
  let engine = 0
  on('ui.scroll', () => { engine++; return {} })
  for (let i = 0; i < 8; i++) {
    await $.turn.start({ text: `turn ${i}`, turnId: `t${i}` } as never)
    for (let k = 0; k < 4; k++) await $.tool.call({ tool: 'Bash', command: `echo ${i}-${k}` })
    await $.turn.complete({ turnId: `t${i}`, answer: '', durationMs: 10, isAborted: false, reason: 'end_turn' } as never)
  }
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
  const wheel = (fromBottom: number, by: number) => $.ui.scroll({
    component: 'Pane', requestId: 'goyangi', offset: 0, by, bodyRows: 40, contentRows: 40, origin: { kind: 'person' }, pointer: { column: 10, row: 40 - 1 - fromBottom },
  } as never)
  const paused = async () => (await ui.findAll({ type: 'Text', text: /⏸/ })).length
  expect(await paused()).toBe(0)
  // Scrolling up on the first row above the footer (inside the session log box) stops the session log
  await wheel(3, -1)
  await new Promise<void>(r => setTimeout(r, 0))
  expect(await paused()).toBe(1)
  // Scrolling back down follows the end (latest) again
  await wheel(3, 5)
  await new Promise<void>(r => setTimeout(r, 0))
  expect(await paused()).toBe(0)
  // Scrolling up inside the session map box stops the session map
  await wheel(2 + 4 + 3 + 2, -1)
  await new Promise<void>(r => setTimeout(r, 0))
  expect(await ui.find({ type: 'Text', text: /⏸ paused/ })).toBeDefined()
  // Over a list it doesn't reach the engine; at the top of the panel it's left to the engine (panel scroll)
  expect(engine).toBe(0)
  await wheel(39, -1)
  expect(engine).toBe(1)
  await ui.unmount()
})

test('header buttons: 3-cell icon buttons side by side in the terminal; on desktop, icon-only app default buttons (close is a ✕ icon too) with the status chip before them', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'goyangi', surface, component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
    const btn = async (key: string) => (await ui.find({ type: 'Button', key }))!.props
    if (surface === 'terminal') {
      expect(await btn('move')).toMatchObject({ plain: true, label: ' v ' })
      expect(await btn('close')).toMatchObject({ plain: true, label: ' x ', role: 'dismiss' })
      // Move, settings, and minimize sit on the header background with inverted text; only close keeps its red chip
      const chipBg = async (key: string) => ((await ui.find({ type: 'Box', key: `tip-box-${key}` }))!.props as { backgroundColor?: string }).backgroundColor
      expect([await chipBg('move'), await chipBg('settings'), await chipBg('fold')]).toEqual(['text', 'text', 'text'])
      expect(await chipBg('close')).toBe('error')
      // Every chip box is a fixed 3 cells, not measured from its text
      for (const k of ['move', 'settings', 'fold', 'close']) expect(((await ui.find({ type: 'Box', key: `tip-box-${k}` }))!.props as { width?: number }).width).toBe(3)
      // Close on hover: given pre-inverted (white on black after the engine's pointer inversion). hover isn't in find results, so walk the drawn tree.
      type Node = { type?: string; text?: string; hover?: object; children?: unknown[] }
      const hovers: object[] = []
      const walk = (n: unknown) => {
        if (!n || typeof n !== 'object') return
        const node = n as Node
        if (node.type === 'Text' && node.hover && (node.children ?? []).join('') === ' x ') hovers.push(node.hover)
        for (const c of node.children ?? []) walk(c)
      }
      walk(await ui.drawn())
      expect(hovers).toContainEqual({ color: '#000000', backgroundColor: '#ffffff' })
      expect(((await ui.find({ type: 'Text', text: ' v ' }))!.props as { color?: string }).color).toBe('inverseText')
    } else {
      // Icons only; names show in hover cards
      expect(await btn('move')).toMatchObject({ variant: 'secondary', label: '⇵' })
      expect(await btn('fold-all')).toMatchObject({ label: '−' })
      expect((await btn('move')).plain).toBeUndefined()
      expect(await btn('close')).toMatchObject({ variant: 'secondary', label: '✕' })
      expect((await btn('close')).role).toBeUndefined()
      // Opening settings turns the settings button into a primary button
      await ui.press({ key: 'settings' })
      expect(await btn('settings')).toMatchObject({ variant: 'primary' })
      // The status chip isn't overlaid (not an absolutely positioned box)
      const chip = (await ui.findAll({ type: 'Box' })).filter(b => b.props.position === 'absolute' && b.props.top === 0)
      expect(chip).toHaveLength(0)
    }
    await ui.unmount()
  }
})

test('desktop scrollbar: dragging moves the session log to that position, and the thumb changes color while pressed', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  for (let i = 0; i < 20; i++) await $.tool.call({ tool: 'Bash', command: `echo ${i}` })
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'desktop', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 60 } as never })
  const settle = () => new Promise<void>(r => setTimeout(r, 0))
  const thumb = async () => (await ui.findAll({ type: 'Box', in: 'log-sb' })).find(b => b.props.backgroundColor === '#7dd3a8' || b.props.backgroundColor === '#f6c177')!
  const logPaused = async () => (await ui.findAll({ type: 'Text', text: /⏸ paused/ })).length
  expect(await logPaused()).toBe(0)
  // Pressing the top moves to the start of the list (stops following the latest), and the thumb is the held color while pressed
  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'log-sb' })
  await settle()
  expect(await logPaused()).toBe(1)
  expect((await thumb()).props.backgroundColor).toBe('#f6c177')
  // Dragging to the bottom follows the latest again
  await ui.pointer({ type: 'move', x: 0, y: 3, button: 'left', in: 'log-sb' })
  await settle()
  expect(await logPaused()).toBe(0)
  await ui.pointer({ type: 'up', x: 0, y: 3, button: 'left', in: 'log-sb' })
  await settle()
  expect((await thumb()).props.backgroundColor).toBe('#7dd3a8')
  await ui.unmount()
})

test('turn flow node boxes: fixed 7 rows in the terminal; on desktop 5 content rows as min height with a pale border-colored background', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  await $.turn.start({ text: 'flow', turnId: 't1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'echo flow' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'goyangi', surface, component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
    const nodes = (await ui.findAll({ type: 'Box' })).filter(b => b.props.borderStyle === 'round' && b.props.justifyContent === 'center')
    expect(nodes.length).toBeGreaterThan(0)
    for (const b of nodes) {
      if (surface === 'terminal') expect(b.props).toMatchObject({ height: 7 })
      else {
        expect(b.props).toMatchObject({ minHeight: 5 })
        expect(String(b.props.backgroundColor)).toMatch(/^#[0-9a-f]{6}1a$/i)
      }
    }
    await ui.unmount()
  }
})

test('walk view pixels: Image (pixels) on kitty and Ghostty terminals, octant characters on WezTerm, quadrant blocks on other terminals', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  let env: Record<string, string> = {}
  on('env.get', ($, e) => ({ value: env[(e as { name: string }).name] }) as never)
  const octant = /[\u{1CD00}-\u{1CEBF}]/u
  const quadrant = /[▘▝▀▖▌▞▛▗▚▐▜▄▙▟█]/u
  for (env of [{ TERM: 'xterm-kitty' }, { TERM: 'xterm-256color' }, { TERM: 'xterm-256color', TERM_PROGRAM: 'WezTerm' }]) {
    await $.session.start({ cwd: '/tmp', source: 'startup' } as never)
    await $.agent.spawn({ prompt: 'x', description: 'find docs', subagentType: 'Explore' } as never)
    const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
    await ui.press({ key: 'view-office' })
    const images = await ui.findAll({ type: 'Image' })
    const texts = await ui.findAll({ type: 'Text' })
    const dotText = texts.filter(t => octant.test(t.text)).length
    const blockText = texts.filter(t => quadrant.test(t.text)).length
    if (env.TERM === 'xterm-kitty') {
      // main robot, spot prop, subagent robot. One cell = 2×4 dots, so a robot (16×16) is 8 cells × 4 rows.
      // Each dot is sent as 8×8 pixels so the terminal doesn't blur it when stretching, making the source 128×128
      expect(images.length).toBeGreaterThanOrEqual(3)
      const robot = images.find(i => (i.props.source as { width: number }).width === 128)!
      expect((robot.props.source as { height: number }).height).toBe(128)
      expect(robot.props).toMatchObject({ columns: 8, rows: 4 })
      expect(String(robot.props.alt).length).toBeGreaterThan(0)
    } else {
      expect(images).toHaveLength(0)
      if (env.TERM_PROGRAM === 'WezTerm') expect(dotText).toBeGreaterThan(0)
      else { expect(dotText).toBe(0); expect(blockText).toBeGreaterThan(0) }
    }
    await ui.unmount()
  }
})

test('top box rows: shortened with … past the width, with a full-content hover card (desktop doesn\'t wrap)', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  for (const surface of ['terminal', 'desktop'] as const) {
    // At 70 columns the left column beside the gauges is narrower than the token row, so it overflows and gets a card holding the full row
    const ui = await $.ui.mount({ plugin: 'goyangi', surface, component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 70, rows: 40 } as never })
    const card = (await ui.findAll({ type: 'Text' })).filter(n => n.props.color === '#e6e9f5').map(n => n.text.trimStart()).join('')
    expect(card).toContain('steps 0 · tools 0 · ↑ 0 · ⟳ 0 · ↓ 0')
    // Cards open within the box. Opened above the row (bottom), they spilled out of the box near its first rows and covered the header.
    const cards = (await ui.findAll({ type: 'Box' })).filter(n => n.props.position === 'absolute' && String(n.props.backgroundColor ?? '').startsWith('#3b4261'))
    expect(cards.length).toBeGreaterThan(0)
    // (the one-word button tooltips are above their buttons on purpose: see tip() in register.tsx)
    expect(cards.filter(n => !String(n.key).startsWith('tipcard-') && (n.props.bottom !== undefined || (n.props.top as number) < 0))).toEqual([])
    const ellipsis = (await ui.findAll({ type: 'Text', text: /^…$/ })).length
    if (surface === 'desktop') expect(ellipsis).toBeGreaterThan(0)
    else expect(ellipsis).toBe(0) // the terminal shortens with Text's truncate
    await ui.unmount()
  }
})

test('the session log title shrinks on narrow panels so the buttons on the right stay inside the box', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: { bodyColumns: 50 } as never, requestId: 'goyangi', viewport: { columns: 60, rows: 60 } as never })
  expect((await ui.find({ type: 'Box', key: 'log-title' }))!.props).toMatchObject({ flexShrink: 1, minWidth: 0, overflow: 'hidden' })
  expect(await ui.find({ type: 'Button', key: 'log-down' })).toBeDefined()
  await ui.unmount()
})

test('the terminal header stays at the top of the window while the panel is scrolled', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const mount = (offset: number) => $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: { placement: 'dock', scroll: { offset, bodyRows: 30 } } as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
  // Not scrolled: the header is in the flow, nothing sticky
  let ui = await mount(0)
  expect(await ui.find({ type: 'Box', key: 'head-sticky' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'close' })).toBeDefined()
  await ui.unmount()
  // Scrolled 12 rows: the header is drawn once, absolutely at the window's top row, and its place in the flow is an empty row
  ui = await mount(12)
  const sticky = await ui.find({ type: 'Box', key: 'head-sticky' })
  // A column box, so the header inside stretches to the full panel width (a row box would shrink it to its content)
  expect(sticky!.props).toMatchObject({ position: 'absolute', top: 12, width: 116, flexDirection: 'column' })
  expect(sticky!.text).toMatch(/Goyangi/)
  expect((await ui.findAll({ type: 'Button', key: 'close' })).length).toBe(1)
  expect(await ui.find({ type: 'Box', key: 'head-space' })).toBeDefined()
  await ui.unmount()
})

test('the header shows no plugin version (it is in the settings screen)', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 50 } as never })
  // The test environment can't read plugin.json, so no version text is drawn here; check that the header holds no version or separator
  const header = (await ui.findAll({ type: 'Box' })).find(b => (b.props as { backgroundColor?: string; height?: number }).backgroundColor === 'text' && (b.props as { height?: number }).height === 1)
  expect(header!.text).toMatch(/^ 🐱 Goyangi +T\d+/)
  expect(header!.text).not.toMatch(/ v\d|\|/)
  await ui.unmount()
})

test('narrow terminal panels drop header parts in steps so the buttons always fit', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const head = async (body: number) => {
    const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: { bodyColumns: body } as never, requestId: 'goyangi', viewport: { columns: body + 2, rows: 60 } as never })
    const h = (await ui.findAll({ type: 'Box' })).find(b => (b.props as { backgroundColor?: string; height?: number }).backgroundColor === 'text' && (b.props as { height?: number }).height === 1)!
    await ui.unmount()
    return { text: h.text, width: (h.props as { width?: number }).width }
  }
  // Header width = body - 2 (scrollbar). Right group = status chip (6) + gap + buttons (12) = 19; with the logo (14) and a margin: 34; with the mark (4): 24
  expect((await head(60)).text).toMatch(/^ 🐱 Goyangi .*○ idle v  =  -  x $/)
  // The left part's width is set outright: header (58) - right group (19) - gap (1) = 38
  {
    const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: { bodyColumns: 60 } as never, requestId: 'goyangi', viewport: { columns: 62, rows: 60 } as never })
    expect(((await ui.find({ type: 'Box', key: 'head-left' }))!.props as { width?: number }).width).toBe(38)
    await ui.unmount()
  }
  // No room for the full logo: only the 🐱 mark stays on the left (needs 1 + 19 + 4 = 24)
  expect(await head(30)).toEqual({ text: ' 🐱 ○ idle v  =  -  x ', width: 28 })
  expect(await head(23)).toEqual({ text: '○ idle v  =  -  x ', width: 21 })
  // Narrower than the rest of the panel's 24-cell minimum: the header keeps the real width, so the close button isn't cut
  expect(await head(16)).toEqual({ text: ' v  =  -  x ', width: 14 })
})

test('narrow panels: section titles stay on one row, settings values never wrap, and the footer uses short labels', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: { bodyColumns: 40 } as never, requestId: 'goyangi', viewport: { columns: 42, rows: 60 } as never })
  // Section titles sit in a one-row box that clips, so they never wrap word by word into a column
  for (const k of ['side', 'flow', 'agents', 'map', 'log']) expect((await ui.find({ type: 'Box', key: `sec-${k}` }))!.props).toMatchObject({ height: 1, overflow: 'hidden', minWidth: 0 })
  // Short forms on narrow panels
  expect((await ui.find({ type: 'Box', key: 'foot-keys' }))!.text).toBe('Keysp/n stepu/d mapk/j log')
  expect(await ui.find({ type: 'Button', key: 'hint-view' })).toMatchObject({ props: { label: 'Walk' } })
  expect(await ui.find({ type: 'Text', text: /^View$/ })).toBeDefined()
  // Settings rows: the name may shrink, the control never does
  await ui.press({ key: 'settings' })
  const row = await ui.find({ type: 'Box', key: 'set-Stall threshold' })
  const [name, control] = row!.children as { props: { flexShrink?: number; minWidth?: number } }[]
  expect(name!.props).toMatchObject({ flexShrink: 1, minWidth: 0 })
  expect(control!.props.flexShrink).toBe(0)
  await ui.unmount()
  // Under 34 columns the View label is left out
  const tiny = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: { bodyColumns: 30 } as never, requestId: 'goyangi', viewport: { columns: 32, rows: 60 } as never })
  expect(await tiny.find({ type: 'Text', text: /^View$/ })).toBeUndefined()
  await tiny.unmount()
})

test('the terminal settings screen is an overlay under the header at the top of the visible window, wherever the panel is scrolled', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const mount = (offset: number) => $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: { placement: 'dock', scroll: { offset, bodyRows: 30 } } as never, requestId: 'goyangi', viewport: { columns: 120, rows: 40 } as never })
  // Scrolled 20 rows: the overlay sits right under the sticky header (row 21), painted so the rows under it don't show through
  let ui = await mount(20)
  await ui.press({ key: 'settings' })
  const overlay = await ui.find({ type: 'Box', key: 'settings-overlay' })
  expect(overlay!.props).toMatchObject({ position: 'absolute', top: 21, left: 0, width: 116 })
  expect((overlay!.props as { backgroundColor?: string }).backgroundColor).toBeTruthy()
  expect(overlay!.text).toMatch(/⚙ Settings/)
  expect((await ui.findAll({ type: 'Text', text: /^⚙ Settings$/ })).length).toBe(1)
  // Closing removes only the overlay
  await ui.press({ key: 'settings' })
  expect(await ui.find({ type: 'Box', key: 'settings-overlay' })).toBeUndefined()
  await ui.unmount()
  // At the top: right under the header (row 1)
  ui = await mount(0)
  await ui.press({ key: 'settings' })
  expect(((await ui.find({ type: 'Box', key: 'settings-overlay' }))!.props as { top?: number }).top).toBe(1)
  await ui.press({ key: 'settings' })
  await ui.unmount()
})

test('settings: Character switches cat and dog, persists, and maps an old saved character to the cat', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const kv = new Map<string, unknown>([['prefs', { character: 'robot' }]])
  on('store.get', ($, e) => ({ value: kv.get((e as { key: string }).key) }) as never)
  on('store.set', ($, e) => { const { key, value } = e as { key: string; value: unknown }; kv.set(key, value); return { value: undefined } as never })
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 50 } as never })
  await ui.press({ key: 'settings' })
  const label = async () => ((await ui.find({ type: 'Button', key: 'set-character' }))!.props as { label?: string }).label
  expect(await label()).toBe('Cat')
  await ui.press({ key: 'set-character' })
  expect(await label()).toBe('Dog')
  await ui.press({ key: 'set-character' })
  expect(await label()).toBe('Cat')
  await new Promise<void>(r => setTimeout(r, 0))
  expect(kv.get('prefs')).toEqual({ character: 'cat' })
  await ui.unmount()
})
