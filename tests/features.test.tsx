import { test, expect } from 'claude-code/testing'
import { emptyTree, toolErr, noteFail, addToolTime, slowTools, ctxLevel, focusFlow, ended, newLoop, headState } from '../hooks/state'
import type { FlowItem } from '../types'
declare const setTimeout: (fn: () => void, ms: number) => unknown

const PANE = { plugin: 'yaong', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'yaong', viewport: { columns: 140, rows: 60 } as never } as const
const usage = (percent = 10) => () => ({ value: { startedAt: 0, context: { window: 200000, percent }, rateLimits: [] } as never })

test('failure cause: tells denials from errors and clears on success', async () => {
  expect(toolErr({ deny: 'no permission' })).toBe('denied: no permission')
  expect(toolErr({ isError: true, text: 'exit 1\nboom' })).toBe('exit 1 boom')
  expect(toolErr({ isError: true, result: undefined })).toBe('error')
  expect(toolErr({ result: {} })).toBeUndefined()
})

test('counts failures of the same call and sorts tools by max time', async () => {
  let t = emptyTree()
  t = noteFail(t, 'k').t
  expect(noteFail(t, 'k').n).toBe(2)
  expect(noteFail(t, 'other').n).toBe(1)
  t = addToolTime(addToolTime(addToolTime(t, 'Read', 10), 'Bash', 900), 'Read', 50)
  expect(slowTools(t.toolTime, 2)).toEqual([{ tool: 'Bash', ms: 900, max: 900 }, { tool: 'Read', ms: 60, max: 50 }])
  expect([ctxLevel(85), ctxLevel(60), ctxLevel(10)]).toEqual(['warn', 'caution', 'ok'])
})

test('end time is recorded only once, at the first end', async () => {
  const l = ended(ended(newLoop('a', 'x'), false, 100), false, 200)
  expect(l.endedAt).toBe(100)
})

test('focus view: keeps only main nodes and that agent\'s items', async () => {
  const i = (id: string, kind: FlowItem['kind'], agentId?: string): FlowItem => ({ id, kind, agentId, label: id, meta: '', startedAt: 0, ok: true })
  const flow = [i('p', 'prompt'), i('s', 'step'), i('tool:m', 'tool'), i('agent:a1', 'agent'), i('tool:x', 'tool', 'a1'), i('tool:y', 'tool', 'a2')]
  expect(focusFlow(flow, 'a1').map(x => x.id)).toEqual(['p', 's', 'agent:a1', 'tool:x'])
  expect(focusFlow(flow, '')).toHaveLength(6)
})

test('when the same call fails twice in a turn, ⚠ and the cause show', async ($, on) => {
  on('session.usage', usage())
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ isError: true, result: 'boom', text: 'command not found: foo' } as never))
  await $.turn.start({ text: 'repeated failure', turnId: 't1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'foo' } as never)
  await $.tool.call({ tool: 'Bash', command: 'foo' } as never)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /\d\d:\d\d:\d\d .*⚠ ×2 Bash foo · command not found: foo$/ })).toBeDefined()
  expect(await ui.find({ text: /^⚠×2 ⚙ Bash foo$/ })).toBeDefined()
  expect(await ui.find({ text: /failure #2/ })).toBeDefined()
  // The session map legend has the repeated failure mark
  expect(await ui.find({ text: /^repeat fail $/ })).toBeDefined()
  await ui.unmount()
})

test('the header shows a warning at 80% context or more', async ($, on) => {
  on('session.usage', usage(85))
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /⚠ ctx 85%/ })).toBeDefined()
  await ui.unmount()
})

test('compact is recorded in the log', async ($, on) => {
  on('session.usage', usage())
  on('classic.PostCompact', () => ({}) as never)
  await $.classic.PostCompact({ trigger: 'manual', compact_summary: 's' } as never)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /context compacted/ })).toBeDefined()
  await ui.unmount()
})

test('clicking an agent name shows only its log, and clicking again returns to all', async ($, on) => {
  on('session.usage', usage())
  on('tool.call', () => ({ result: {} as never }))
  await $.tool.call({ tool: 'Bash', command: 'main-only' } as never)
  await $.tool.call({ tool: 'Bash', command: 'agent-only', agentId: 'a1' } as never)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /\d\d:\d\d:\d\d .*Bash main-only$/ })).toBeDefined()
  await ui.press({ key: 'focus-a1' })
  expect(await ui.find({ text: /focus agent ✕/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\d\d:\d\d:\d\d .*Bash main-only$/ })).toBeUndefined()
  expect(await ui.find({ text: /\d\d:\d\d:\d\d .*Bash agent-only$/ })).toBeDefined()
  await ui.press({ key: 'focus-clear' })
  expect(await ui.find({ text: /\d\d:\d\d:\d\d .*Bash main-only$/ })).toBeDefined()
  await ui.unmount()
})

test('requests overlapping others leave the step cost empty but all add to the turn total', async ($, on) => {
  let total = 1.0
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [], cost: { usd: total } } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  const gates: Record<string, () => void> = {}
  on('turn.step', async function* ($, e) {
    await new Promise<void>(res => { gates[e.agentId ?? 'main'] = res })
    total += e.agentId ? 0.5 : 0.25
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  const drain = async (agentId?: string) => { for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1, agentId } as never)) { /* drain */ } }
  const tick = () => new Promise<void>(r => setTimeout(r, 0))
  await $.turn.start({ text: 'overlapping requests', turnId: 't1' } as never)
  const main = drain()
  const agent = drain('a1')
  await tick(); await tick()
  gates.a1!(); await agent; await tick()
  gates.main!(); await main; await tick()

  const ui = await $.ui.mount(PANE)
  // The main request node has no cost (it overlapped a subagent request).
  expect(await ui.find({ type: 'Text', text: /^≈\$0\.25$/ })).toBeUndefined()
  // The turn total holds the cost of both requests.
  expect(await ui.find({ text: /≈\$0\.75/ })).toBeDefined()
  await ui.unmount()
})

test('finished agents leave the boxes, and arrows link the spawning request and the request that received results', async ($, on) => {
  on('session.usage', usage())
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [{}], stopReason: 'tool_use', usage: null } as never
  })
  let n = 0
  on('agent.spawn', () => ({ model: 'haiku', agentId: `a${++n}` }))
  on('classic.SubagentStop', () => ({}) as never)
  const tick = () => new Promise<void>(r => setTimeout(r, 0))
  const step = async (index: number) => { for await (const _ of $.turn.step({ turnId: 't1', index, model: 'opus', messageCount: 1 } as never)) { /* drain */ } await tick() }

  await $.turn.start({ text: 'two agents', turnId: 't1' } as never)
  await step(0)
  await $.agent.spawn({ prompt: 'x', description: 'done one', subagentType: 'Explore' } as never)
  await $.agent.spawn({ prompt: 'y', description: 'live one', subagentType: 'Plan' } as never)
  await tick()
  await $.classic.SubagentStop({ agent_id: 'a1' } as never)
  await tick()
  await step(1)

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /^Plan$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Explore$/ })).toBeUndefined()
  expect(await ui.find({ text: /^◆ T1 step 1 $/ })).toBeDefined()
  expect(await ui.find({ text: /back to main · 1 returned · 1 still running/ })).toBeDefined()
  // The receiving node: step 2, started after a1 ended
  // One flow chart node title and one box to the right of back to main
  expect((await ui.findAll({ type: 'Text', text: /^◆ step 2$/ })).length).toBe(2)
  await ui.unmount()
})

test('header status: tool > waiting on response > in progress > last turn failed > idle', async () => {
  const t = emptyTree()
  expect(headState(t)).toBe('idle')
  expect(headState({ ...t, turn: { ...t.turn, running: true } })).toBe('live')
  expect(headState({ ...t, main: { ...t.main, status: 'thinking' } })).toBe('thinking')
  expect(headState({ ...t, main: { ...t.main, status: 'thinking' }, agents: [{ ...newLoop('a', 'x'), status: 'tool' }] })).toBe('tool')
  const turn = { id: 't', prompt: '', startedAt: 0, endedAt: 1, seq: '', tools: 0, agents: 0, ok: false }
  expect(headState({ ...t, turns: [turn] })).toBe('failed')
  expect(headState({ ...t, turns: [{ ...turn, ok: true }] })).toBe('idle')
})

test('the prompt node is drawn narrow, so one more model request column fits in the same width', async ($, on) => {
  on('session.usage', usage())
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: null } as never
  })
  await $.turn.start({ text: 'column width', turnId: 't1' } as never)
  for (let i = 0; i < 5; i++) for await (const _ of $.turn.step({ turnId: 't1', index: i, model: 'opus', messageCount: 1 } as never)) { /* drain */ }
  // Body 136 cells: prompt (12) + 5 requests (20) + 5 arrows (4) = 132. With the old fixed width (20) the first column hides in a '◂ N' box.
  const ui = await $.ui.mount({ ...PANE, props: { bodyColumns: 138 } as never })
  expect(await ui.find({ type: 'Text', text: /^◂ \d+$/ })).toBeUndefined()
  expect(await ui.find({ text: /^▶ prompt$/ })).toBeDefined()
  expect(await ui.find({ text: /^◆ step 5$/ })).toBeDefined()
  const widths = (await ui.findAll({ type: 'Box' })).map(b => (b.props as { width?: number }).width)
  expect(widths).toContain(12)
  await ui.unmount()
})
