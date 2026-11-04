import { test, expect, mock } from 'claude-code/testing'
// The test environment has setTimeout, but the types for hooks modules don't, so it's declared only here.
declare const setTimeout: (fn: () => void, ms: number) => unknown

const PANE = { plugin: 'goyangi', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 50 } as never } as const
const BAND = { plugin: 'goyangi', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 } as never, viewport: { columns: 120, rows: 50 } as never } as const

test('section fold and close buttons', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const closed: string[] = []
  on('ui.close', ($, e) => { closed.push(e.id); return { value: undefined } as never })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /Nothing recorded yet/ })).toBeDefined()
    await ui.press({ key: 'fold-log' })
    expect(await ui.find({ type: 'Text', text: /Nothing recorded yet/ })).toBeUndefined()
    await ui.press({ key: 'fold-log' })
    expect(await ui.find({ text: /Nothing recorded yet/ })).toBeDefined()
    await ui.press({ key: 'close' })
    await ui.unmount()
  }
  expect(closed).toEqual(['goyangi', 'goyangi'])
})

test('folding closes the panel into two rows above the prompt, and [□] reopens it', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const calls: string[] = []
  on('ui.close', ($, e) => { calls.push(`close:${e.id}`); return { value: undefined } as never })
  on('ui.open', ($, e) => { calls.push(`open:${e.id}:${e.columns}`); return { value: { isPlaced: true } } as never })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => { const { Box } = $.ui.resolve(e); return <Box /> })

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'fold-all' })
  await pane.unmount()
  expect(calls).toEqual(['close:goyangi'])

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /step 0 · tool 0/ })).toBeDefined()
  expect(await band.find({ text: /^\[□\]$/ })).toBeDefined()
  // Dark text on the light green chip so it reads on any theme
  expect(((await band.find({ type: 'Text', text: '[□]' }))!.props as { color?: string }).color).toBe('#1e2030')
  // Desktop draws the same [□] chip, matching [=] and [x] beside it
  const deskBand = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(((await deskBand.find({ type: 'Text', text: '[□]' }))!.props as { color?: string }).color).toBe('#1e2030')
  await deskBand.unmount()
  // The two rows sit in a thin round border, like the prompt box, set apart from the conversation
  expect((await band.findAll({ type: 'Box' })).some(b => { const p = b.props as { borderStyle?: string; borderColor?: string }; return p.borderStyle === 'round' && p.borderColor === '#6b7280' })).toBe(true)
  // Two rows: the walk on top, the status and buttons below
  expect(await band.find({ type: 'Box', key: 'band-mission' })).toBeDefined()
  expect(await band.find({ type: 'Box', key: 'band-status' })).toBeDefined()
  // The expand and close buttons sit on row 1, at its right end
  expect(await band.find({ type: 'Box', key: 'band-mission', text: /\[□\] *\[x\]$/ })).toBeDefined()
  expect(await band.find({ type: 'Box', key: 'band-status', text: /\[□\]/ })).toBeUndefined()
  // Row 2 is one row: what main is doing and the stats sit side by side in it (no column box between them)
  const statusRow = await band.find({ type: 'Box', key: 'band-status' })
  const inner = statusRow as unknown as { props: { flexDirection?: string }; children?: { key?: string; props?: { key?: string } }[] }
  expect(inner.props.flexDirection).toBeUndefined()
  expect(inner.children!.map(c => c.key ?? c.props?.key)).toEqual(['band-doing', 'band-stats'])
  // Row 1 is the simplified walk: with no turn yet it waits for the next prompt
  expect(await band.find({ text: /waiting for the next prompt/ })).toBeDefined()
  await band.press({ key: 'expand' })
  expect(calls).toEqual(['close:goyangi', 'open:goyangi:110'])
  expect(await band.find({ type: 'Text', text: /step 0 · tool 0/ })).toBeUndefined()
  await band.unmount()
})

test('[x] in the band turns off the one-row display', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => { const { Box } = $.ui.resolve(e); return <Box /> })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'fold-all' })
  await pane.unmount()
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await band.press({ key: 'band-off' })
  expect(await band.find({ type: 'Text', text: /step 0/ })).toBeUndefined()
  await band.unmount()
})

// With a 46-row panel, 7 rows remain after the upper sections and the 3-row footer, so the session map and session log each get the minimum (4 rows).
const SHORT = { ...PANE, viewport: { columns: 120, rows: 46 } as never }

test('with little height left, the session log shows only the minimum 4 rows', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('tool.call', () => ({ result: {} as never }))
  for (let i = 1; i <= 6; i++) await $.tool.call({ tool: 'Bash', command: `echo log${i}` } as never)
  const ui = await $.ui.mount({ ...SHORT, surface: 'terminal' })
  await ui.press({ key: 'fold-flow' }) // The same call also shows in the flow section, so fold it and look only at the log
  expect(await ui.find({ type: 'Text', text: /echo log2$/ })).toBeUndefined()
  for (const k of [3, 4, 5, 6]) expect(await ui.find({ text: new RegExp(`echo log${k}$`) })).toBeDefined()
  await ui.unmount()
})

test('on a tall panel the session map stays at 4 rows and the session log takes the remaining height', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('tool.call', () => ({ result: {} as never }))
  for (let i = 1; i <= 12; i++) await $.tool.call({ tool: 'Bash', command: `echo tall${i}` } as never)
  // 70 rows: of the remaining 31, 4 for the session map and 27 for the session log
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 120, rows: 70 } as never })
  await ui.press({ key: 'fold-flow' })
  for (const k of [1, 6, 12]) expect(await ui.find({ text: new RegExp(`echo tall${k}$`) })).toBeDefined()
  expect(await ui.find({ text: /^⇕ 4 rows$/ })).toBeDefined()
  await ui.unmount()
})

test('a docked panel splits by the panel body height (scroll.bodyRows), not the terminal height', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  // The terminal is 100 rows but the panel body is 46: 7 rows remain, so the session map gets the minimum 4
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { placement: 'dock', scroll: { bodyRows: 46 } } as never, viewport: { columns: 120, rows: 100 } as never })
  expect(await ui.find({ text: /^⇕ 4 rows$/ })).toBeDefined()
  await ui.unmount()
})

test('log scroll: ▲ goes back 4 rows, position holds when new entries arrive, ▼ returns to latest', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('tool.call', () => ({ result: {} as never }))
  for (let i = 1; i <= 10; i++) await $.tool.call({ tool: 'Bash', command: `echo L${i}` } as never)
  const ui = await $.ui.mount({ ...SHORT, surface: 'terminal' })
  await ui.press({ key: 'fold-flow' })
  const has = async (k: number) => !!(await ui.find({ type: 'Text', text: new RegExp(`echo L${k}$`) }))
  expect(await has(10)).toBe(true)
  expect(await ui.find({ text: /7–10 \/ 10/ })).toBeDefined()

  await ui.press({ key: 'log-up' })
  expect(await has(3)).toBe(true)
  expect(await has(6)).toBe(true)
  expect(await has(10)).toBe(false)
  expect(await ui.find({ text: /paused/ })).toBeDefined()

  await $.tool.call({ tool: 'Bash', command: 'echo L11' } as never)
  expect(await has(6)).toBe(true) // position holds
  expect(await has(11)).toBe(false)

  await ui.press({ key: 'log-down' })
  await ui.press({ key: 'log-down' })
  expect(await has(11)).toBe(true)
  expect(await ui.find({ text: /● live/ })).toBeDefined()
  await ui.unmount()
})

test('the footer shows each section\'s fold state and toggles it on press', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^Minimize$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /to one row/ })).toBeUndefined()
  expect(await ui.find({ text: /^l session log ▾$/ })).toBeDefined()
  await ui.press({ key: 'hint-log' })
  expect(await ui.find({ text: /^l session log ▸$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Nothing recorded yet/ })).toBeUndefined()
  await ui.press({ key: 'fold-log' })
  expect(await ui.find({ text: /^l session log ▾$/ })).toBeDefined()
  await ui.unmount()
})

test('narrow width: right metrics and buttons sit in non-shrinking boxes, and the legend gets its own row', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('tool.call', () => ({ result: {} as never }))
  await $.tool.call({ tool: 'Bash', command: 'M="$HOME/projects/my-plugin"; sed -i "" "s/0.11.0/0.11.1/" plugin.json' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { bodyColumns: 70 } as never, viewport: { columns: 72, rows: 50 } as never })
  const fixed = (await ui.findAll({ type: 'Box' })).filter(b => (b.props as { flexShrink?: number }).flexShrink === 0)
  expect(fixed.length).toBeGreaterThan(2)
  expect((await ui.find({ type: 'Box', key: 'foot-keys' }))!.text).toMatch(/^Keysp\/n move step/)
  // Top right end: - and x
  expect(await ui.find({ text: /^ - $/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /^ x $/ })).toBeDefined()
  await ui.unmount()
})

test('the full panel width is the body width minus the scrollbar space', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { bodyColumns: 110 } as never })
  const widths = (await ui.findAll({ type: 'Box' })).map(b => (b.props as { width?: number }).width ?? 0)
  expect(Math.max(...widths)).toBe(108)
  await ui.unmount()
})

test('footer shortcut names use the same words as the section titles', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (const name of ['advisor', 'turn flow', 'subagents', 'session map', 'session log']) {
    expect(await ui.find({ text: new RegExp(`^[a-z] ${name} [▾▸]$`) })).toBeDefined()
  }
  expect(await ui.find({ text: /^▾ ✦ advisor$/ })).toBeDefined()
  await ui.unmount()
})

test('the agent area folds and expands with s even without subagents', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ text: /^▾ subagents · 0$/ })).toBeDefined()
  expect(await ui.find({ text: /no subagents yet/ })).toBeDefined()
  await ui.press({ key: 'fold-agents' })
  expect(await ui.find({ text: /^▸ subagents · 0$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /no subagents yet/ })).toBeUndefined()
  expect(await ui.find({ text: /^s subagents ▸$/ })).toBeDefined()
  await ui.unmount()
})

test('the minimized view shows the simplified walk: turn, prompt, and the running step with its tools', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [{}], stopReason: 'tool_use', usage: null } as never
  })
  let release = () => {}
  on('tool.call', () => new Promise(res => { release = () => res({ result: {} as never }) }))
  await $.turn.start({ text: 'fix the build', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  const call = $.tool.call({ tool: 'Bash', command: 'npm run build' } as never)
  await new Promise<void>(r => setTimeout(r, 0))

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'fold-all' })
  await pane.unmount()
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ text: /^ "fix the build" $/ })).toBeDefined()
  expect(await band.find({ text: /^▶$/ })).toBeDefined()
  // The running step spins and lists its tool as a colored block (Bash is orange, darkened by midColor so it reads on a white terminal too)
  expect(await band.find({ text: /^\S1$/ })).toBeDefined()
  expect((await band.findAll({ type: 'Text', text: /^■$/ })).some(x => (x.props as { color?: string }).color === '#ac8753')).toBe(true)
  // Row 2 starts with the same status chip as the panel header: a running tool is ' ⚙ tool ' on the claude color, then the command
  expect(((await band.find({ type: 'Text', text: ' ⚙ tool ' }))!.props as { backgroundColor?: string }).backgroundColor).toBe('claude')
  // Row 2 shows what main is doing
  expect(await band.find({ type: 'Text', text: /Bash/ })).toBeDefined()
  release()
  await call
  await band.unmount()
})

test('the minimized view has a settings button that opens the same settings screen under the two rows', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('ui.close', () => ({ value: undefined }) as never)
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'fold-all' })
  await pane.unmount()
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  // [=] sits on row 1 with the expand and close buttons
  expect(await band.find({ type: 'Box', key: 'band-mission', text: /\[=\] *\[□\] *\[x\]$/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /^⚙ Settings$/ })).toBeUndefined()
  await band.press({ key: 'band-settings' })
  expect(await band.find({ type: 'Text', text: /^⚙ Settings$/ })).toBeDefined()
  // Settings are live here too: + raises the context alert threshold
  await band.press({ key: 'inc-ctxAlertPercent' })
  expect(await band.find({ type: 'Text', text: /^90%$/ })).toBeDefined()
  await band.press({ key: 'band-settings' })
  expect(await band.find({ type: 'Text', text: /^⚙ Settings$/ })).toBeUndefined()
  await band.unmount()
})

test('the minimized view lays the settings rows out in columns to fit its width (1 to 3)', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('ui.close', () => ({ value: undefined }) as never)
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'fold-all' })
  await pane.unmount()
  const cols = async (body: number) => {
    const band = await $.ui.mount({ ...BAND, surface: 'terminal', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: body } as never })
    if (!(await band.find({ type: 'Text', text: /^⚙ Settings$/ }))) await band.press({ key: 'band-settings' })
    const grid = await band.find({ type: 'Box', key: 'settings-grid' })
    await band.unmount()
    return grid ? (grid.children as unknown[]).length : 1
  }
  // An item takes 48 cells, columns are 3 cells apart, inside a border and padding of 4
  expect(await cols(60)).toBe(1)
  expect(await cols(105)).toBe(2)
  expect(await cols(195)).toBe(3)
})

test('with the walk view on, the minimized view puts a small pet on the track (octant characters in the terminal, Svg on desktop)', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('ui.close', () => ({ value: undefined }) as never)
  const octant = /[\u{1CD00}-\u{1CEBF}▀▄▌▐█▘▝▖▗]/u
  // Walk view off: no pet
  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ ...PANE, surface })
    await pane.press({ key: 'fold-all' })
    await pane.unmount()
    const band = await $.ui.mount({ ...BAND, surface })
    expect(await band.find(surface === 'terminal' ? { type: 'Text', text: octant } : { type: 'Svg', alt: 'pet' } as never)).toBeUndefined()
    await band.unmount()
  }
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'view-office' })
  await pane.unmount()
  const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await term.find({ type: 'Text', text: octant })).toBeDefined()
  // The pet sits on row 1 and the buttons still end it
  expect(await term.find({ type: 'Box', key: 'band-mission', text: /\[=\] *\[□\] *\[x\]$/ })).toBeDefined()
  await term.unmount()
  const desk = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desk.find({ type: 'Svg', alt: 'pet' } as never)).toBeDefined()
  await desk.unmount()
})

test('in kitty or Ghostty the minimized pet is the walk view\'s own sprite as a pixel image, at the start of row 1', async ($, on) => {
  mock.env(on, { TERM_PROGRAM: 'ghostty' })
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'view-office' })
  await pane.press({ key: 'fold-all' })
  await pane.unmount()
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const img = await band.find({ type: 'Image' })
  expect(img).toBeDefined()
  expect((img!.props as { columns: number; rows: number }).columns).toBe(2)
  expect((img!.props as { columns: number; rows: number }).rows).toBe(1)
  // No octant fallback beside it
  expect(await band.find({ type: 'Text', text: /[\u{1CD00}-\u{1CEBF}]/u })).toBeUndefined()
  await band.unmount()
})

test('sessions box: lists the other open sessions; send passes this session\'s handoff, pull asks for theirs, and a pull from a peer is answered without a model turn', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.id', () => ({ value: 'me' }) as never)
  on('prompt.submit', ($, e) => ({ text: (e as { text: string }).text }) as never)
  on('session.cwd', () => ({ value: '/Users/u/dev/app' }) as never)
  on('session.messages', () => ({ value: [{ role: 'user', text: 'make it faster' }] }) as never)
  let agents = [{ sessionId: 'third', name: 'api', cwd: '/Users/u/dev/api', status: 'busy', kind: 'interactive', startedAt: 30 }, { sessionId: 'me', name: 'mine', cwd: '/Users/u/dev/app', status: 'busy', kind: 'interactive', startedAt: 10 }, { sessionId: 'other', name: 'docs-1', cwd: '/Users/u/dev/docs', status: 'idle', kind: 'interactive', startedAt: 20 }]
  on('process.run', ($, e) => ({ value: { exitCode: 0, stderr: '', stdout: (e as { argv: string[] }).argv.join(' ') === 'claude agents --json'
    ? JSON.stringify(agents)
    : '' } }) as never)
  const sent: { to: unknown; text: string }[] = []
  let refuse = ''
  on('session.send', ($, e) => { sent.push(e as never); return (refuse ? { isDelivered: false, reason: refuse } : { isDelivered: true }) as never })
  const toasts: string[] = []
  on('ui.toast', ($, e) => { toasts.push(String((e as { text?: string }).text ?? e)); return { value: undefined } as never })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'peer-refresh' })
  await new Promise<void>(r => setTimeout(r, 0))
  expect(await ui.find({ type: 'Text', text: /^OPEN SESSIONS · 3$/ })).toBeDefined()
  // Numbered oldest first: docs-1 (started 20) is 1, api (started 30) is 2
  expect(await ui.find({ type: 'Text', text: /^✳ 1 ○ docs-1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^✳ 2 ● api/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /docs-1/ })).toBeDefined()
  // Each button has a one-word tooltip card, hidden until the pointer is on it
  expect((await ui.findAll({ type: 'Text', text: /^ send $/ })).length).toBeGreaterThan(0)
  expect((await ui.findAll({ type: 'Text', text: /^ pull $/ })).length).toBeGreaterThan(0)
  // This session is not one of the numbered others: it has its own ◉ row first, marked "this session"
  expect(await ui.find({ type: 'Text', text: /○ mine|● mine/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^✳ ◉ +mine/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^this session$/ })).toBeDefined()
  await ui.press({ key: 'peer-send-other' })
  await new Promise<void>(r => setTimeout(r, 0))
  // (the engine hands the event the session id as the address)
  expect(sent.at(-1)!.to).toBe('other')
  expect(sent.at(-1)!.text).toContain('Handoff from Claude Code session "mine" (me)')
  expect(sent.at(-1)!.text).toContain('make it faster')
  await ui.press({ key: 'peer-pull-other' })
  await new Promise<void>(r => setTimeout(r, 0))
  expect(sent.at(-1)!.text.startsWith('[goyangi:pull] me')).toBe(true)
  expect(toasts.some(t => /Sent this session's handoff to docs-1/.test(t))).toBe(true)
  // A refused send says why instead of claiming success
  refuse = 'denied by auto mode'
  await ui.press({ key: 'peer-send-other' })
  await new Promise<void>(r => setTimeout(r, 0))
  expect(toasts.at(-1)).toBe('Goyangi · Not sent: denied by auto mode')
  refuse = ''
  // The sessions tool works by those numbers: send to 2, pull 1's handoff over to 2, and a missing number lists the sessions
  expect(String((await $.tool.call({ tool: 'mcp__goyangi__sessions', action: 'send', to: 2 } as never)).result)).toBe("Sent this session's handoff to api")
  expect(sent.at(-1)!.to).toBe('third')
  expect(String((await $.tool.call({ tool: 'mcp__goyangi__sessions', action: 'pull', from: 1, to: 2 } as never)).result)).toBe('Asked docs-1 to send its handoff to api')
  expect(sent.at(-1)!.to).toBe('other')
  expect(sent.at(-1)!.text.startsWith('[goyangi:pull] third')).toBe(true)
  expect(String((await $.tool.call({ tool: 'mcp__goyangi__sessions', action: 'send', to: 5 } as never)).result)).toContain('1. docs-1')
  // Numbers stay: docs-1 closes and an older-started session appears, yet api is still 2, the newcomer is 3, and 1 is not reused
  agents = [agents[0]!, agents[1]!, { sessionId: 'late', name: 'web', cwd: '/Users/u/dev/web', status: 'idle', kind: 'interactive', startedAt: 5 }]
  expect(String((await $.tool.call({ tool: 'mcp__goyangi__sessions', action: 'list' } as never)).result).split('\n').map(l => l.split(' ').slice(0, 2).join(' '))).toEqual(['2. api', '3. web'])
  expect(String((await $.tool.call({ tool: 'mcp__goyangi__sessions', action: 'send', to: 2 } as never)).result)).toBe("Sent this session's handoff to api")
  expect(String((await $.tool.call({ tool: 'mcp__goyangi__sessions', action: 'send', to: 1 } as never)).result)).toMatch(/^No session 1/)
  agents = [agents[0]!, agents[1]!, { sessionId: 'other', name: 'docs-1', cwd: '/Users/u/dev/docs', status: 'idle', kind: 'interactive', startedAt: 20 }]
  await ui.unmount()
  // A pull request arriving from a peer: answered with this session's note, and the prompt never enters
  const r = await $.prompt.submit({ text: '[goyangi:pull] asker\nplease', origin: { kind: 'peer' }, wait: false } as never)
  await new Promise<void>(r => setTimeout(r, 0))
  expect((r as { drop?: string }).drop).toBeDefined()
  expect(sent.at(-1)!.to).toBe('asker')
  expect(sent.at(-1)!.text).toContain('Handoff from Claude Code session')
  // A handoff arriving from a peer: a toast names the sender, and the note still reaches the model
  const h = await $.prompt.submit({ text: 'Handoff from Claude Code session "docs-1" (other) in /x.', origin: { kind: 'peer' }, wait: false } as never)
  expect((h as { text?: string }).text).toContain('Handoff from')
  expect(toasts.at(-1)).toBe('Goyangi · Received a handoff from docs-1')
})

test('sessions box: coding agents in cmux terminals are listed after the Claude sessions; send types a line pointing at a note file, pull brings their screen here', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.id', () => ({ value: 'me' }) as never)
  on('session.cwd', () => ({ value: '/Users/u/dev/app' }) as never)
  on('session.messages', () => ({ value: [{ role: 'user', text: 'make it faster' }] }) as never)
  mock.env(on, { TMPDIR: '/tmp/t/' })
  const files: Record<string, string> = {}
  on('fs.write', ($, e) => { const x = e as { path: string; text: string }; files[x.path] = x.text; return { value: undefined } as never })
  const prompts: string[] = []
  on('prompt.submit', ($, e) => { prompts.push((e as { text: string }).text); return { text: (e as { text: string }).text } as never })
  on('ui.toast', () => ({ value: undefined }) as never)
  const runs: string[][] = []
  const TOP = ['1\t1\t1\tpane\tpane:2\tworkspace:2\t', '1\t1\t1\tsurface\tsurface:5\tpane:2\tfix the parser', '1\t1\t1\tprocess\t900\tsurface:5\tzsh', '1\t1\t1\tprocess\t901\t900\tcodex'].join('\n')
  on('process.run', ($, e) => {
    const argv = (e as { argv: string[] }).argv
    runs.push(argv)
    const stdout = argv.join(' ') === 'claude agents --json' ? JSON.stringify([{ sessionId: 'me', name: 'mine', cwd: '/a', status: 'busy', kind: 'interactive' }])
      : argv[1] === 'top' ? TOP : argv[1] === 'read-screen' ? 'codex> parser fixed, tests left\n' : ''
    return { value: { exitCode: 0, stderr: '', stdout } } as never
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'peer-refresh' })
  await new Promise<void>(r => setTimeout(r, 0))
  expect(await ui.find({ type: 'Text', text: /^1 ○ codex fix the parser/ })).toBeDefined()
  await ui.press({ key: 'peer-send-cmux:workspace:2:surface:5' })
  await new Promise<void>(r => setTimeout(r, 0))
  const file = Object.keys(files)[0]!
  expect(file).toMatch(/^\/tmp\/t\/goyangi\/handoff-\d+\.md$/)
  expect(files[file]).toContain('make it faster')
  expect(runs.find(a => a[1] === 'send')).toEqual(['cmux', 'send', '--workspace', 'workspace:2', '--surface', 'surface:5', `Read the handoff note at ${file} and continue from it.`])
  expect(runs.find(a => a[1] === 'send-key')!.at(-1)).toBe('enter')
  await ui.press({ key: 'peer-pull-cmux:workspace:2:surface:5' })
  await new Promise<void>(r => setTimeout(r, 0))
  expect(prompts.at(-1)).toContain('parser fixed, tests left')
  // The tool returns the screen instead of starting a prompt
  expect(String((await $.tool.call({ tool: 'mcp__goyangi__sessions', action: 'pull', from: 1 } as never)).result)).toContain('Handoff from codex')
  await ui.unmount()
})

test('browser tabs box: tabs numbered by browser letter (B1, B2), each keeping its number while others close, open or move; the tool finds one by number or by words, and focuses only when asked', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('ui.toast', () => ({ value: undefined }) as never)
  const runs: string[][] = []
  let brave = '1\t1\tfalse\t11\tDocs home\thttps://docs.example.com/a\n1\t2\ttrue\t12\tPR #12\thttps://github.com/o/r/pull/12\n2\t1\ttrue\t13\tMail\thttps://mail.example.com/\n'
  on('process.run', ($, e) => {
    const argv = (e as { argv: string[] }).argv
    runs.push(argv)
    const stdout = argv[0] === 'osascript' && argv[2]!.includes('repeat with wi') && argv[2]!.includes('"Brave Browser"') ? brave : ''
    return { value: { exitCode: 0, stderr: '', stdout } } as never
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-refresh' })
  await new Promise<void>(r => setTimeout(r, 0))
  expect(await ui.find({ type: 'Text', text: /BROWSER TABS · B Brave 3/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^B2  ● PR #12 +github.com$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^B1  ○ Docs home +docs.example.com$/ })).toBeDefined()
  const read = String((await $.tool.call({ tool: 'mcp__goyangi__browser_tabs', action: 'read', tab: 'b2' } as never)).result)
  expect(read).toContain('https://github.com/o/r/pull/12')
  // Reading switches nothing in Chrome
  expect(runs.some(a => a[2]?.includes('set active tab index'))).toBe(false)
  expect(String((await $.tool.call({ tool: 'mcp__goyangi__browser_tabs', action: 'focus', tab: 'mail' } as never)).result)).toBe('Brought tab B3 to the front')
  expect(runs.at(-1)![2]).toContain('tell application "Brave Browser"')
  expect(runs.at(-1)![2]).toContain('set active tab index of window 2 to 1')
  expect(String((await $.tool.call({ tool: 'mcp__goyangi__browser_tabs', action: 'read', tab: 'B9' } as never)).result)).toContain('B1 Docs home')
  // Words: one match reads it, several come back as candidates
  expect(String((await $.tool.call({ tool: 'mcp__goyangi__browser_tabs', action: 'read', tab: 'github pull' } as never)).result)).toContain('Tab B2: PR #12')
  expect(String((await $.tool.call({ tool: 'mcp__goyangi__browser_tabs', action: 'read', tab: 'example' } as never)).result)).toMatch(/^Several tabs match/)
  // run: JavaScript goes to that exact tab as an argument, so quotes reach the browser untouched
  const js = `document.querySelector("h1").innerText + 'x'`
  expect(String((await $.tool.call({ tool: 'mcp__goyangi__browser_tabs', action: 'run', tab: 'mail', js } as never)).result)).toMatch(/^Tab B3: Mail/)
  expect(runs.at(-1)).toContain(js)
  expect(runs.at(-1)!.join(' ')).toContain('tell application "Brave Browser" to execute tab 1 of window 2 javascript (item 1 of argv)')
  expect(String((await $.tool.call({ tool: 'mcp__goyangi__browser_tabs', action: 'run', tab: 'mail' } as never)).result)).toMatch(/^run needs js/)
  // Numbers stay with their tabs: Docs home closes, a new tab opens before PR #12, Mail moves to window 1.
  // B2 is still PR #12 (now at window 1 tab 2), B3 still Mail, the new tab is B4, and B1 is gone, not reused
  brave = '1\t1\tfalse\t20\tNew\thttps://new.example.com/\n1\t2\ttrue\t12\tPR #12\thttps://github.com/o/r/pull/12\n1\t3\tfalse\t13\tMail\thttps://mail.example.com/\n'
  expect(String((await $.tool.call({ tool: 'mcp__goyangi__browser_tabs', action: 'list' } as never)).result).split('\n').map(l => l.split(' ')[0])).toEqual(['B2', 'B3', 'B4'])
  await $.tool.call({ tool: 'mcp__goyangi__browser_tabs', action: 'run', tab: 'B3', js: '1' } as never)
  expect(runs.at(-1)!.join(' ')).toContain('execute tab 3 of window 1 javascript')
  expect(String((await $.tool.call({ tool: 'mcp__goyangi__browser_tabs', action: 'read', tab: 'B1' } as never)).result)).toMatch(/^No tab matches "B1"/)
  await ui.unmount()
})

test('sessions box on desktop: a long session row stays on one line, clipped on the right and ended with …', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.id', () => ({ value: 'me' }) as never)
  let cwd = '/Users/u/dev/app'
  on('process.run', ($, e) => ({ value: { exitCode: 0, stderr: '', stdout: (e as { argv: string[] }).argv.join(' ') === 'claude agents --json'
    ? JSON.stringify([{ sessionId: 'me', name: 'mine', cwd, status: 'busy', kind: 'interactive', startedAt: 10 }])
    : '' } }) as never)
  const ellipses = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop', viewport: { columns: 60, rows: 50 } as never })
    await ui.press({ key: 'peer-refresh' })
    await new Promise<void>(r => setTimeout(r, 0))
    const row = await ui.find({ type: 'Text', text: /^✳ ◉ +mine/ })
    expect(row).toBeDefined()
    const n = (await ui.findAll({ type: 'Text', text: /^…$/ })).length
    await ui.unmount()
    return n
  }
  const short = await ellipses()
  cwd = `/Users/u/Library/Application Support/Claude/scratch-workspaces/${'x'.repeat(60)}`
  expect(await ellipses()).toBe(short + 1)
})

test('browser tabs past their row setting scroll: a scrollbar appears and the wheel over the box moves the shown rows', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('ui.scroll', () => ({}))
  const many = Array.from({ length: 7 }, (_, i) => `1\t${i + 1}\t${i === 0}\t${i + 100}\tPage ${i + 1}\thttps://p${i + 1}.example.com/`).join('\n')
  on('process.run', ($, e) => ({ value: { exitCode: 0, stderr: '', stdout: (e as { argv: string[] }).argv[0] === 'osascript' && (e as { argv: string[] }).argv[2]!.includes('"Brave Browser"') ? many : '' } }) as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 120, rows: 70 } as never })
  await ui.press({ key: 'tab-refresh' })
  await new Promise<void>(r => setTimeout(r, 0))
  const first = async () => (await ui.findAll({ type: 'Text', text: /^B\d +([●○]) Page/ }))[0]?.text.split(' ')[0]
  // 4 rows by default, with a scrollbar for the other 3
  expect((await ui.findAll({ type: 'Text', text: /^B\d +([●○]) Page/ })).length).toBe(4)
  expect(await ui.find({ type: 'Client', key: 'tabs-sb' })).toBeDefined()
  expect(await first()).toBe('B1')
  // The wheel over the box moves it down a row, and back up from the same spot
  const wheel = (fromBottom: number, by: number) => $.ui.scroll({ component: 'Pane', requestId: 'goyangi', offset: 0, by, bodyRows: 70, contentRows: 70, origin: { kind: 'person' }, pointer: { column: 100, row: 70 - 1 - fromBottom } } as never) // the right half: side by side, Browser tabs is the right box
  let at = -1
  for (let fromBottom = 0; fromBottom < 70 && at < 0; fromBottom++) {
    await wheel(fromBottom, 1)
    await new Promise<void>(r => setTimeout(r, 0))
    if ((await first()) === 'B2') at = fromBottom
  }
  expect(at).toBeGreaterThan(0)
  await wheel(at, 5)
  await new Promise<void>(r => setTimeout(r, 0))
  expect(await first()).toBe('B4') // stops at the last full window
  await wheel(at, -1)
  await new Promise<void>(r => setTimeout(r, 0))
  const moved = (await first()) === 'B3'
  expect(moved).toBe(true)
  await ui.unmount()
})

test('row icons: on Ghostty a browser tab row starts with its browser\'s app icon as a pixel image, converted once from the app\'s .icns', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  mock.env(on, { TERM_PROGRAM: 'ghostty', TMPDIR: '/tmp/t/' })
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.register', () => ({ value: { tool: 'x' } }) as never)
  on('fs.read', () => ({ value: { base64: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGP4z8DwH4QZYAwAR8oH+WdZbrcAAAAASUVORK5CYII=' } }) as never)
  const runs: string[][] = []
  on('process.run', ($, e) => {
    const argv = (e as { argv: string[] }).argv
    runs.push(argv)
    const stdout = argv[0] === 'osascript' && argv[2]!.includes('"Brave Browser"') ? '1\t1\ttrue\t5\tHome\thttps://a.example.com/\n' : argv[0] === 'defaults' ? 'app\n' : ''
    return { value: { exitCode: 0, stderr: '', stdout } } as never
  })
  await $.session.start({ cwd: '/x', source: 'startup' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-refresh' })
  for (let i = 0; i < 5; i++) await new Promise<void>(r => setTimeout(r, 0))
  expect(runs.some(a => a[0] === 'sips' && a.includes('/Applications/Brave Browser.app/Contents/Resources/app.icns'))).toBe(true)
  expect(await ui.find({ type: 'Image', alt: 'Brave Browser' } as never)).toBeDefined()
  await ui.unmount()
})

test('header logo: the cat drawing the plugin ships in icons/goyangi.png replaces the 🐱 emoji where an image can be drawn', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.id', () => ({ value: 'me' }) as never)
  mock.env(on, { TERM_PROGRAM: 'ghostty', TMPDIR: '/tmp/t/' })
  const reads: string[] = []
  on('fs.read', ($, e) => { reads.push(String((e as { path?: string }).path ?? '')); return { value: { base64: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGP4z8DwH4QZYAwAR8oH+WdZbrcAAAAASUVORK5CYII=' } } as never })
  on('process.run', () => ({ value: { exitCode: 0, stderr: '', stdout: '' } }) as never)
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.register', () => ({ value: { tool: 'x' } }) as never)
  await $.session.start({ cwd: '/x', source: 'startup' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 100, rows: 40 } as never })
  await ui.press({ key: 'peer-refresh' })
  for (let i = 0; i < 5; i++) await new Promise<void>(r => setTimeout(r, 0))
  expect(reads.some(p => p.endsWith('/icons/goyangi.png'))).toBe(true)
  expect(await ui.find({ type: 'Image', alt: 'Goyangi' } as never)).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' 🐱 Goyangi ' })).toBeUndefined()
  await ui.unmount()
})

test('row icons: a coding agent row (codex) starts with the favicon the plugin ships in icons/agents, like a Claude row starts with the Claude icon', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.id', () => ({ value: 'me' }) as never)
  mock.env(on, { TERM_PROGRAM: 'ghostty', TMPDIR: '/tmp/t/' })
  const reads: string[] = []
  on('fs.read', ($, e) => { reads.push(String((e as { path?: string }).path ?? '')); return { value: { base64: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGP4z8DwH4QZYAwAR8oH+WdZbrcAAAAASUVORK5CYII=' } } as never })
  const tsv = ['x\tx\tx\tpane\tpane:1\tworkspace:3\t', 'x\tx\tx\tsurface\tsurface:7\tpane:1\tdev', 'x\tx\tx\tprocess\t10\tsurface:7\tzsh', 'x\tx\tx\tprocess\t11\t10\tcodex'].join('\n')
  on('process.run', ($, e) => {
    const argv = (e as { argv: string[] }).argv
    return { value: { exitCode: 0, stderr: '', stdout: argv[0] === 'cmux' && argv[1] === 'top' ? tsv : argv.join(' ') === 'claude agents --json' ? '[]' : '' } } as never
  })
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.register', () => ({ value: { tool: 'x' } }) as never)
  await $.session.start({ cwd: '/x', source: 'startup' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'peer-refresh' })
  for (let i = 0; i < 5; i++) await new Promise<void>(r => setTimeout(r, 0))
  expect(reads.some(p => p.endsWith('/icons/agents/codex.png'))).toBe(true)
  expect(await ui.find({ type: 'Image', alt: 'codex' } as never)).toBeDefined()
  await ui.unmount()
})

test('open sessions and browser tabs sit side by side at the same height on wide panels, and stack on narrow ones', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const lists = async (columns: number) => {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { bodyColumns: columns } as never, viewport: { columns: columns + 2, rows: 70 } as never })
    const p = (await ui.find({ type: 'Box', key: 'lists' }))!.props
    // The pair's boxes: half-width round boxes with a fixed height
    const heights = (await ui.findAll({ type: 'Box' })).filter(b => b.props.borderStyle === 'round' && typeof b.props.width === 'number' && b.props.flexShrink === 1 && b.props.minWidth === 0 && b.props.height !== undefined).map(b => b.props.height)
    await ui.unmount()
    return { column: p.flexDirection === 'column', heights }
  }
  const wide = await lists(140)
  expect(wide.column).toBe(false)
  expect(wide.heights.length).toBe(2)
  expect(new Set(wide.heights).size).toBe(1)
  expect(wide.heights[0]).toBeGreaterThan(0)
  expect((await lists(70)).column).toBe(true)
})

test('fresh session: past the context alert a one-click row appears; it asks the model for a handoff note, then /clear, and the new session starts from the note', async ($, on) => {
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  mock.store(on)
  mock.env(on, { TMPDIR: '/tmp/t/' })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 85 }, rateLimits: [] } }))
  on('session.id', () => ({ value: 'old-id' }) as never)
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.register', () => ({ value: { tool: 'x' } }) as never)
  on('process.run', () => ({ value: { exitCode: 0, stderr: '', stdout: '' } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  const prompts: string[] = []
  on('prompt.submit', ($, e) => { prompts.push((e as { text: string }).text); return { text: (e as { text: string }).text } as never })
  const files: Record<string, string> = {}
  on('fs.write', ($, e) => { const x = e as { path: string; text: string }; files[x.path] = x.text; return { value: undefined } as never })
  on('fs.read', ($, e) => ({ value: files[(e as { path: string }).path] ?? '' }) as never)
  const commands: string[] = []
  on('command.run', ($, e) => { commands.push((e as { command: string }).command); return { text: '' } as never })
  on('turn.complete', () => ({ text: '' }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // 85% is past the 80% alert: the row offers one click
  expect(await ui.find({ type: 'Button', key: 'fresh-go' })).toBeDefined()
  await ui.press({ key: 'fresh-go' })
  await clock.advance(10)
  expect(prompts.at(-1)).toContain('Write a handoff note to /tmp/t/goyangi/handoff-old-id.md')
  expect(await ui.find({ type: 'Text', text: /Writing the handoff note/ })).toBeDefined()
  // The model writes the note and the turn ends: /clear runs after it
  files['/tmp/t/goyangi/handoff-old-id.md'] = '# Handoff\nnext: add tests'
  await $.turn.complete({ turnId: 't1', answer: 'handoff written', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  await clock.advance(1000)
  expect(commands).toEqual(['clear'])
  // The new session's first prompt points at the note and the old session
  await $.session.start({ cwd: '/x', source: 'clear' } as never)
  await clock.advance(1000)
  expect(prompts.at(-1)).toContain('Read the handoff note at /tmp/t/goyangi/handoff-old-id.md')
  expect(prompts.at(-1)).toContain('claude --resume old-id')
  await ui.unmount()
})

test('whole-panel scrollbar: a terminal panel taller than its window gets a bar at the right edge, and dragging it scrolls the panel there', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  const scrolls: { offset?: number; to?: string }[] = []
  on('ui.scroll', ($, e) => { scrolls.push(e as never); return {} })
  const tall = await $.ui.mount({ ...PANE, surface: 'terminal', props: { placement: 'dock', scroll: { bodyRows: 12, offset: 5 } } as never })
  const bar = await tall.find({ type: 'Client', key: 'pane-sb' })
  expect(bar).toBeDefined()
  expect((bar as unknown as { props: { props: { list: string; from: number; rows: number; total: number } } }).props.props).toMatchObject({ list: 'pane', from: 5, rows: 12 })
  expect((bar as unknown as { props: { props: { total: number } } }).props.props.total).toBeGreaterThan(12)
  expect((await tall.find({ type: 'Box', key: 'pane-sb-box' }))?.props).toMatchObject({ position: 'absolute', top: 5, left: 118 - 1, height: 12 }) // the last body column (viewport 120 - 2)
  expect((await tall.findAll({ type: 'Text', in: 'pane-sb' })).map(n => n.text).join('')).toMatch(/^[│┃]{12}$/)
  // Pressing the bottom of the bar moves the panel toward its end. The real engine sends the plugin's $.ui.scroll back as a plugin-origin
  // ui.scroll; the test engine has no panel to scroll, so that step is played here
  await tall.pointer({ type: 'down', x: 0, y: 11, button: 'left', in: 'pane-sb' } as never)
  await tall.pointer({ type: 'up', x: 0, y: 11, button: 'left', in: 'pane-sb' } as never)
  for (let i = 0; i < 20; i++) await tall.find({ key: 'pane-wrap' })
  await $.ui.scroll({ component: 'Pane', requestId: 'goyangi', offset: 0, by: 0, bodyRows: 12, contentRows: 200, origin: { kind: 'plugin', name: 'goyangi' } } as never)
  expect(scrolls.at(-1)!.offset).toBeGreaterThan(5)
  await tall.unmount()
  // Content that fits its window: no bar
  const roomy = await $.ui.mount({ ...PANE, surface: 'terminal', props: { placement: 'dock', scroll: { bodyRows: 500 } } as never })
  expect(await roomy.find({ type: 'Client', key: 'pane-sb' })).toBeUndefined()
  await roomy.unmount()
})
