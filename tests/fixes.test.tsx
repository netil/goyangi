// Regression tests for issues found in a full review (correctness, performance). They pin behavior that failed before the fixes.
import { test, expect, mock } from 'claude-code/testing'
import { secs, fmtTok, scopeKey, resumed, ended, newLoop, isBusy, emptyTree } from '../hooks/state'
// The test environment has setTimeout, but the types for hooks modules don't, so it's declared only here.
declare const setTimeout: (fn: () => void, ms: number) => unknown

const PANE = { plugin: 'yaong', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'yaong', viewport: { columns: 140, rows: 60 } as never } as const
const STEP = { answer: '', toolUses: [], stopReason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' } }

test('rounding edges: never shows 1m60s, 60.0s, or 1000k', async () => {
  expect(secs(119_700)).toBe('2m0s')
  expect(secs(59_960)).toBe('1m0s')
  expect(secs(59_940)).toBe('59.9s')
  expect(secs(61_000)).toBe('1m1s')
  expect(secs(17_131_000)).toBe('4h45m')
  expect(secs(533_112_000)).toBe('6d4h')
  expect(fmtTok(999_600)).toBe('1.0M')
  expect(fmtTok(999_400)).toBe('999k')
})

test('hover scope names: long keys sharing a prefix stay distinct and within 64 characters', async () => {
  const head = 'tip-fail:main|Bash|cd "/Users/me/Library/Mobile Documents/x" && '
  const a = scopeKey('rv-', `${head}npm test`)
  const b = scopeKey('rv-', `${head}npm run lint`)
  expect(a).not.toBe(b)
  expect(a.length).toBeLessThanOrEqual(64)
  expect(scopeKey('rv-', 'same')).toBe(scopeKey('rv-', 'same'))
})

test('a resumed subagent clears its end time and records a new one when it ends again', async () => {
  const done = ended(newLoop('a', 'x'), false, 100)
  const again = resumed(done)
  expect(again.status).toBe('thinking')
  expect(again.endedAt).toBeUndefined()
  expect(ended(again, false, 300).endedAt).toBe(300)
  // Running agents stay as they are
  expect(resumed({ ...newLoop('b', 'x'), status: 'tool' }).status).toBe('tool')
})

test('a subagent that missed its end event stops counting as running after 10 minutes', async () => {
  const now = 1_700_000_000_000
  const stuck = { ...newLoop('a', 'x'), status: 'thinking' as const, lastAt: now - 11 * 60_000 }
  const live = { ...stuck, lastAt: now - 60_000 }
  expect(isBusy({ ...emptyTree(), agents: [stuck] }, now)).toBe(false)
  expect(isBusy({ ...emptyTree(), agents: [live] }, now)).toBe(true)
})

test('a turn continued without input is recorded as a new turn and doesn\'t overwrite the previous turn', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) { return { turnId: e.turnId, index: e.index, ...STEP } as never })
  on('turn.complete', () => ({ text: '' }))
  await $.turn.start({ text: 'first question', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* */ }
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  await $.turn.start({ text: '', turnId: 't2' } as never)
  for await (const _ of $.turn.step({ turnId: 't2', index: 0, model: 'opus', messageCount: 1 } as never)) { /* */ }
  await $.turn.complete({ turnId: 't2', answer: '', durationMs: 10, isAborted: false, reason: 'error' } as never)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /T1–T2 \/ 2/ })).toBeDefined()
  expect(await ui.find({ text: /^"first question"/ })).toBeDefined()
  expect(await ui.find({ text: /continued without input/ })).toBeDefined()
  // The flow chart holds only this turn's (t2) end node
  expect((await ui.findAll({ type: 'Text', text: /^■ (answer|ended)$/ })).length).toBe(1)
  await ui.unmount()
})

test('after /clear the map and archive are emptied', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', () => ({ sessionId: 'new' }) as never)
  await $.turn.start({ text: 'q', turnId: 't1' } as never)
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  await $.session.end({ reason: 'clear' } as never)
  await new Promise<void>(r => setTimeout(r, 0))
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /SESSION MAP · 0 turns/ })).toBeDefined()
  await ui.unmount()
})

test('with several tools running in parallel, there is one always-on card per column, below the branch list', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) { return { turnId: e.turnId, index: e.index, ...STEP, stopReason: 'tool_use', toolUses: [{}, {}, {}] } as never })
  let release = () => {}
  const gate = new Promise<void>(r => { release = r })
  on('tool.call', async () => { await gate; return { result: {} as never } })
  await $.turn.start({ text: 'parallel', turnId: 't1' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 } as never)) { /* */ }
  const calls = [1, 2, 3].map(i => $.tool.call({ tool: 'Read', file_path: `/a/f${i}.ts` } as never))
  await new Promise<void>(r => setTimeout(r, 0))
  const ui = await $.ui.mount(PANE)
  const shown = (await ui.findAll({ type: 'Box' })).map(b => b.props as { position?: string; display?: string; top?: number })
    .filter(p => p.position === 'absolute' && p.display === 'flex')
  expect(shown.length).toBe(1)
  const hidden = (await ui.findAll({ type: 'Box' })).map(b => b.props as { position?: string; display?: string; top?: number; borderStyle?: string })
    .filter(p => p.position === 'absolute' && p.display === 'none' && p.borderStyle === 'round')
  // The always-on card sits below the branch row cards (at the end of the branch list)
  expect(Math.max(...hidden.map(p => p.top ?? 0))).toBeLessThan(shown[0]!.top!)
  release()
  await Promise.all(calls)
  await ui.unmount()
})

test('in the key events view, the stop position points at the same row even after old rows are pushed out', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('tool.call', { tool: 'Bash' }, () => { throw new Error('boom') })
  const fail = (i: number) => $.tool.call({ tool: 'Bash', command: `false k${i}` }).catch(() => undefined)
  for (let i = 0; i < 80; i++) await fail(i)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'log-up' })
  const visible = async () => (await ui.findAll({ type: 'Text', text: /false k\d+/ })).map(n => /false (k\d+)/.exec(String((n as { text?: string }).text ?? ''))?.[1]).filter(Boolean)
  const before = await visible()
  expect(before.length).toBeGreaterThan(0)
  for (let i = 80; i < 85; i++) await fail(i)
  expect(await visible()).toEqual(before)
  expect(await ui.find({ text: /⏸ paused/ })).toBeDefined()
  await ui.unmount()
})

test('hidden cards carry long text only up to 300 characters', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  await $.tool.call({ tool: 'Bash', command: `echo ${'y'.repeat(590)}` })
  const ui = await $.ui.mount(PANE)
  const ys = (await ui.findAll({ type: 'Text', text: /^\s*\S/ })).filter(n => n.props.color === '#e6e9f5') /* only the card line content Text (the wrapping Text has the same characters) */.map(n => String((n as { text?: string }).text ?? '')).join('')
  const count = (ys.match(/y/g) ?? []).length
  expect(count).toBeGreaterThan(0)
  expect(count).toBeLessThanOrEqual(300)
  await ui.unmount()
})

test('a subagent\'s turn.start during a main turn doesn\'t open a new turn', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await $.turn.start({ text: 'main question', turnId: 't1' } as never)
  // The subagent starts a turn with its own prompt
  await $.turn.start({ text: 'Quick demo task', turnId: 'sub1' } as never)
  await $.turn.complete({ turnId: 'sub1', agentId: 'a1', answer: '', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /T1–T1 \/ 1/ })).toBeDefined()
  expect(await ui.find({ text: /TURN FLOW.*main question/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Quick demo task/ })).toBeUndefined()
  await ui.unmount()
})
