import { test, expect, mock } from 'claude-code/testing'
import { emptyTree, patchLoop, summarize, topTools, newLoop, bar } from '../hooks/state'

test('state functions', async () => {
  const t = { ...emptyTree(), agents: [newLoop('a1', 'Explore')] }
  expect(patchLoop(t, undefined, l => ({ ...l, tools: 1 })).main.tools).toBe(1)
  expect(patchLoop(t, 'a1', l => ({ ...l, tools: 2 })).agents[0]?.tools).toBe(2)
  expect(patchLoop(t, 'unknown', l => ({ ...l, tools: 9 })).agents).toHaveLength(2)
  expect(summarize({ file_path: '/a/b/c.md' })).toBe('c.md')
  expect(summarize({ command: 'git  status\n -s' })).toBe('git status -s')
  expect(topTools({ Bash: 3, Read: 1 }, 1)).toEqual([{ tool: 'Bash', share: 0.75 }])
  expect(bar(0.5, 4)).toBe('██░░')
})

test('tool calls are drawn in the panel', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 12 }, rateLimits: [], cost: { usd: 0.5 } } }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'goyangi', surface, component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 100, rows: 40 } as never })
    expect(await ui.find({ text: /git status/ })).toBeDefined()
    expect(await ui.find({ text: /tools 1/ })).toBeDefined()
    await ui.unmount()
  }
})

test('handing work to another session shows in the turn flow: the branch names that session (⇢ api #2) and whether it got there', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.id', () => ({ value: 'me' }) as never)
  on('session.messages', () => ({ value: [] }) as never)
  on('session.cwd', () => ({ value: '/x' }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('session.send', () => ({ isDelivered: true }) as never)
  on('process.run', ($, e) => ({ value: { exitCode: 0, stderr: '', stdout: (e as { argv: string[] }).argv.join(' ') === 'claude agents --json'
    ? JSON.stringify([{ sessionId: 'me', name: 'mine', startedAt: 1 }, { sessionId: 'other', name: 'docs-1', startedAt: 2 }, { sessionId: 'third', name: 'api', startedAt: 3 }]) : '' } }) as never)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' } } as never
  })
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 60 } as never })
  await $.turn.start({ text: 'hand this to api', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'm', effort: 'high', messageCount: 1 } as never)) { /* drain */ }
  await $.tool.call({ tool: 'mcp__goyangi__sessions', action: 'list' } as never)
  await $.tool.call({ tool: 'mcp__goyangi__sessions', action: 'send', to: 2 } as never)
  await $.tool.call({ tool: 'mcp__goyangi__sessions', action: 'send', to: 7 } as never)
  // The branch under the step: the other session's name and number, then whether it got there
  expect(await ui.find({ type: 'Text', text: /^⇢ api #2$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ sent$/ })).toBeDefined()
  // A number that isn't open is drawn as a handoff that didn't get there
  expect(await ui.find({ type: 'Text', text: /^⇢ session #7$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ not sent$/ })).toBeDefined()
  // The session log says the same
  expect(await ui.find({ text: /⇢ api #2 · sent/ })).toBeDefined()
  await ui.unmount()
})

test('a turn that starts from another session\'s handoff names the sender on its prompt node (⇠ docs-1)', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 60 } as never })
  await $.turn.start({ text: 'Handoff from Claude Code session "docs-1" (other) in /x.\nIts current request: "fix it"', turnId: 't1' } as never)
  expect(await ui.find({ text: /⇠ docs-1/ })).toBeDefined()
  await ui.unmount()
})

test('a pull waits for its handoff, then points at the turn it arrived as (↩ T2); a pull passed on elsewhere and a send wait for nothing', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.id', () => ({ value: 'me' }) as never)
  on('session.messages', () => ({ value: [] }) as never)
  on('session.cwd', () => ({ value: '/x' }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('session.send', () => ({ isDelivered: true }) as never)
  on('process.run', ($, e) => ({ value: { exitCode: 0, stderr: '', stdout: (e as { argv: string[] }).argv.join(' ') === 'claude agents --json'
    ? JSON.stringify([{ sessionId: 'me', name: 'mine', startedAt: 1 }, { sessionId: 'other', name: 'docs-1', startedAt: 2 }, { sessionId: 'third', name: 'api', startedAt: 3 }]) : '' } }) as never)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' } } as never
  })
  on('turn.complete', () => ({ text: '' }))
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 60 } as never })
  await $.turn.start({ text: 'get the docs handoff', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'm', effort: 'high', messageCount: 1 } as never)) { /* drain */ }
  await $.tool.call({ tool: 'mcp__goyangi__sessions', action: 'pull', from: 1 } as never)
  await $.tool.call({ tool: 'mcp__goyangi__sessions', action: 'pull', from: 1, to: 2 } as never)
  await $.tool.call({ tool: 'mcp__goyangi__sessions', action: 'send', to: 2 } as never)
  // Only the pull whose note comes back here waits
  expect((await ui.findAll({ type: 'Text', text: /^ waiting$/ })).length).toBe(1)
  expect((await ui.findAll({ type: 'Text', text: /^ sent$/ })).length).toBe(2)
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  // docs-1's note arrives as the next turn: the pull's branch (back in turn 1) points at it
  await $.turn.start({ text: 'Handoff from Claude Code session "docs-1" (other) in /d.\nIts current request: "x"', turnId: 't2' } as never)
  await $.turn.complete({ turnId: 't2', answer: '', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  expect(await ui.find({ text: /⇠ docs-1$/ })).toBeDefined()
  // Replaying turn 1 from the session map
  await ui.press({ key: 'map-open-t1' })
  expect(await ui.find({ type: 'Text', text: /^ ↩ T2$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ waiting$/ })).toBeUndefined()
  await ui.unmount()
})

test('subagent boxes and status', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('tool.call', { tool: 'Read' }, () => ({ result: {} as never }))
  await $.agent.spawn({ prompt: 'x', description: 'find files', subagentType: 'Explore' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/a/b/notes.md', agentId: 'a1' } as never)
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 100, rows: 40 } as never })
  expect(await ui.find({ text: /^Explore$/ })).toBeDefined()
  expect(await ui.find({ text: /1 running \/ 1/ })).toBeDefined()
  expect(await ui.find({ text: /notes\.md/ })).toBeDefined()
  await ui.unmount()
})

test('a tool call ending in an exception also restores the state', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('tool.call', { tool: 'Bash' }, () => { throw new Error('boom') })
  await $.tool.call({ tool: 'Bash', command: 'false' }).catch(() => undefined)
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 100, rows: 40 } as never })
  expect(await ui.find({ text: /^○ idle$/ })).toBeDefined()
  await ui.unmount()
})
