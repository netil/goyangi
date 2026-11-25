import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { forkText, bgId, forkBrief, forkDone, askLine } from '../hooks/state'

const PANE = { plugin: 'goyangi', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 120, rows: 50 } as never } as const

// A store both sessions share, held here so the test can play the fork's side
// onSet plays the other session: it sees each write and may answer it in the data.
const sharedStore = (on: On, data: Record<string, unknown>, onSet?: (key: string, value: unknown) => void) => {
  on('store.get', ($, e) => ({ value: data[(e as { key: string }).key] }) as never)
  on('store.set', ($, e) => { const x = e as { key: string; value: unknown }; data[x.key] = x.value; onSet?.(x.key, x.value); return { value: undefined } as never })
}
// The test environment has setTimeout, but the types for hooks modules don't, so it's declared only here.
declare const setTimeout: (fn: () => void, ms: number) => unknown
// Forks run off the hook that started them: wait (up to 2 seconds) for what they leave
const until = async (_: unknown, done: () => unknown) => {
  for (let i = 0; i < 200 && !(await done()); i++) await new Promise<void>(r => setTimeout(r, 10))
}

test('fork helpers: ; marks a fork, the bg id, the brief, the FORK DONE line, and a one-line ask', async () => {
  expect(forkText(';fix the typo')).toBe('fix the typo')
  expect(forkText('; fix it ')).toBe('fix it')
  expect(forkText(';')).toBeUndefined()
  expect(forkText('>fix it', '>')).toBe('fix it')
  expect(forkText(';fix it', '>')).toBeUndefined()
  expect(forkText('fix it; then test')).toBeUndefined()
  expect(bgId('Starting background service…\nbackgrounded · df508702\n  claude agents')).toBe('df508702')
  expect(bgId('Workspace not trusted.')).toBeUndefined()
  expect(forkBrief('fix it', true)).toContain('Do not commit')
  expect(forkBrief('fix it', false)).toContain('same folder')
  expect(forkBrief('fix it', true)).not.toContain('Summary of the session')
  expect(forkBrief('fix it', true, 'Goal: x')).toContain('Goal: x')
  expect(forkDone('done\nFORK DONE: pass')).toEqual({ ok: true, reason: '' })
  expect(forkDone('FORK DONE: fail tests broke')).toEqual({ ok: false, reason: 'tests broke' })
  expect(forkDone('still working')).toBeUndefined()
  expect(askLine('Bash', { command: 'npm   test' })).toBe('Bash: npm test')
  expect(askLine('Write', { file_path: '/a/b.ts' })).toBe('Write: /a/b.ts')
  expect(askLine('Bash', { command: 'x'.repeat(100) }, 20)).toHaveLength(20)
})

test('fork: a ; prompt never reaches the model, starts claude --bg in a worktree, relays an ask, and merges when the fork reports pass', async ($, on) => {
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  const data: Record<string, unknown> = { prefs: { fork: true } }
  sharedStore(on, data)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 10 }, rateLimits: [] } }))
  on('session.id', () => ({ value: 'aaaa1111-0000-0000-0000-000000000000' }) as never)
  on('session.cwd', () => ({ value: '/repo/sub' }) as never)
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.register', () => ({ value: { tool: 'x' } }) as never)
  const toasts: string[] = []
  on('ui.toast', ($, e) => { toasts.push((e as { text: string }).text); return { value: undefined } as never })
  const prompts: string[] = []
  on('prompt.submit', ($, e) => { prompts.push((e as { text: string }).text); return { text: (e as { text: string }).text } as never })
  const runs: string[][] = []
  on('process.run', ($, e) => {
    const argv = (e as { argv: string[] }).argv
    runs.push(argv)
    const a = argv.join(' ')
    const out = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '' } }) as never
    if (a.includes('rev-parse --show-toplevel')) return out('/repo\n')
    if (argv[0] === 'claude' && argv[1] === '--bg') return out('backgrounded · df508702\n')
    if (a.includes('diff --cached --quiet')) return out('', 1)
    if (a.includes('rev-parse --abbrev-ref HEAD')) return out('main\n')
    if (a.includes('rev-list --count')) return out('1\n')
    if (a.includes('diff --name-only')) return out('src/a.ts\n')
    if (a.includes('status --porcelain')) return out(' M src/other.ts\n')
    if (a.includes('rev-parse --short HEAD')) return out('abc1234\n')
    return out('')
  })
  await $.session.start({ cwd: '/repo/sub', source: 'startup' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  // The ; prompt reaches the model as an instruction to ask how the new session starts (AskUserQuestion), then to call the fork tool
  await $.prompt.submit({ text: ';fix the typo in README', origin: { kind: 'composer' } } as never)
  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('AskUserQuestion')
  expect(prompts[0]).toContain('fix the typo in README')
  expect(runs.some(r => r[0] === 'claude' && r[1] === '--bg')).toBe(false)
  // The fork tool runs it in a background session, in a worktree of the repository's top folder, with the summary when the person chose the compact start
  await $.tool.call({ tool: 'mcp__goyangi__fork', request: 'fix the typo in README', summary: 'Goal: docs cleanup' } as never)
  await until($, () => data['fork:df508702'])
  const bg = runs.find(r => r[0] === 'claude' && r[1] === '--bg')!
  expect(bg.slice(0, 3)).toEqual(['claude', '--bg', '-w'])
  expect(bg.at(-1)).toContain('fix the typo in README')
  expect(bg.at(-1)).toContain('Goal: docs cleanup')
  expect(data['fork:df508702']).toMatchObject({ id: 'df508702', top: '/repo', git: true, state: 'running', request: 'fix the typo in README' })
  expect(data['forksOf:aaaa1111-0000-0000-0000-000000000000']).toEqual(['df508702'])
  const branch = `worktree-${(data['fork:df508702'] as { name: string }).name}`
  await until($, () => ui.find({ type: 'Button', key: 'fork-attach-df508702' }))
  expect(await ui.find({ type: 'Text', text: /fix the typo in README/ })).toBeDefined()

  // The fork asks for a permission: a card with Allow and Deny, and Allow writes the answer for that ask
  data['forkAsk:df508702'] = { n: 5, line: 'Bash: npm test', at: 5 }
  await clock.advance(3000)
  await until($, () => ui.find({ type: 'Button', key: 'fork-allow-df508702' }))
  expect(await ui.find({ type: 'Text', text: /Bash: npm test/ })).toBeDefined()
  await ui.press({ key: 'fork-allow-df508702' })
  expect(data['forkAnswer:df508702']).toEqual({ n: 5, allow: true })

  // The fork reports pass: commit in the worktree, rebase onto main, fast-forward, remove the fork, and say so
  delete data['forkAsk:df508702']
  data['forkDone:df508702'] = { ok: true, reason: '' }
  await $.prompt.submit({ text: 'ordinary prompt', origin: { kind: 'composer' } } as never)
  expect(prompts.slice(1)).toEqual(['ordinary prompt'])
  await clock.advance(3000)
  await until($, () => toasts.some(t => t.includes('Merged')))
  const git = runs.filter(r => r[0] === 'git').map(r => r.slice(3).join(' '))
  expect(git).toContain('commit -q -m fix the typo in README')
  expect(git).toContain('rebase -q main')
  expect(git).toContain(`merge -q --ff-only ${branch}`)
  expect(runs.some(r => r[0] === 'claude' && r[1] === 'rm' && r[2] === 'df508702')).toBe(true)
  expect(toasts.some(t => t.includes('Merged (abc1234)'))).toBe(true)
  expect(data['forksOf:aaaa1111-0000-0000-0000-000000000000']).toEqual([])
  await ui.unmount()
})

test('fork: a fork whose files overlap uncommitted changes here waits instead of merging', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  const data: Record<string, unknown> = {
    'forksOf:me': ['df508702'],
    'fork:df508702': { id: 'df508702', name: 'fork-x', request: 'r', top: '/repo', git: true, owner: 'me', at: 0, state: 'running' },
    'forkDone:df508702': { ok: true, reason: '' },
  }
  sharedStore(on, data)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.id', () => ({ value: 'me' }) as never)
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.register', () => ({ value: { tool: 'x' } }) as never)
  const runs: string[] = []
  on('process.run', ($, e) => {
    const a = (e as { argv: string[] }).argv.join(' ')
    runs.push(a)
    const out = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '' } }) as never
    if (a.includes('rev-parse --abbrev-ref HEAD')) return out('main\n')
    if (a.includes('rev-list --count')) return out('1\n')
    if (a.includes('diff --name-only')) return out('hooks/register.tsx\n')
    if (a.includes('status --porcelain')) return out(' M hooks/register.tsx\n')
    return out('')
  })
  await $.session.start({ cwd: '/repo', source: 'startup' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await until($, () => (data['fork:df508702'] as { state: string }).state === 'wait')
  expect(data['fork:df508702']).toMatchObject({ state: 'wait', note: 'hooks/register.tsx' })
  expect(runs.some(a => a.includes('rebase'))).toBe(false)
  await until($, () => ui.find({ type: 'Text', text: /waits: hooks\/register.tsx/ }))
  expect(await ui.find({ type: 'Text', text: /waits: hooks\/register.tsx/ })).toBeDefined()
  await ui.unmount()
})

test("fork's own session: a permission request waits for the forking session's answer, and FORK DONE is reported", async ($, on) => {
  const data: Record<string, unknown> = {
    'fork:df508702': { id: 'df508702', name: 'fork-x', request: 'r', top: '/repo', git: true, owner: 'me', at: 0, state: 'running' },
  }
  // The forking session answers the ask as soon as it appears
  sharedStore(on, data, (key, value) => {
    const n = (value as { n?: number } | null)?.n
    if (key === 'forkAsk:df508702' && n) data['forkAnswer:df508702'] = { n, allow: true }
  })
  on('session.id', () => ({ value: 'df508702-1bb1-4a98-9af4-7e61a8d22b95' }) as never)
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }) as never)
  on('turn.complete', () => ({ text: '' }))
  const r = await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'npm test' } } as never)
  expect((r as { decision?: unknown }).decision).toEqual({ behavior: 'allow' })
  expect(data['forkAsk:df508702']).toBeNull()
  await $.turn.complete({ turnId: 't1', answer: 'changed README\nFORK DONE: pass', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  await until($, () => data['forkDone:df508702'])
  expect(data['forkDone:df508702']).toMatchObject({ ok: true })
})

test("fork's own session: a turn that ends without FORK DONE is reported as a failure, so the fork never stays running", async ($, on) => {
  const data: Record<string, unknown> = { 'fork:df508702': { id: 'df508702', name: 'fork-x', request: 'r', top: '/repo', git: true, owner: 'me', at: 0, state: 'running' } }
  sharedStore(on, data)
  on('session.id', () => ({ value: 'df508702-1bb1-4a98-9af4-7e61a8d22b95' }) as never)
  on('turn.complete', () => ({ text: '' }))
  await $.turn.complete({ turnId: 't1', answer: 'I stopped here.', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  await until($, () => data['forkDone:df508702'])
  expect(data['forkDone:df508702']).toMatchObject({ ok: false, reason: 'ended without FORK DONE (answer)' })
})

test('fork: after /clear the session takes over the forks listed under its old id', async ($, on) => {
  mock.clock(on, { now: 1_700_000_000_000 })
  const data: Record<string, unknown> = {
    'forksOf:old': ['df508702'],
    'fork:df508702': { id: 'df508702', name: 'fork-x', request: 'r', top: '/repo', git: true, owner: 'old', at: 0, state: 'running' },
  }
  sharedStore(on, data)
  let sid = 'old'
  on('session.id', () => ({ value: sid }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('session.end', () => ({ sessionId: sid }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.register', () => ({ value: { tool: 'x' } }) as never)
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }) as never)
  await $.session.end({ reason: 'clear' } as never)
  sid = 'new'
  await $.session.start({ cwd: '/repo', source: 'clear' } as never)
  await until($, () => (data['forksOf:new'] as string[] | undefined)?.length)
  expect(data['forksOf:new']).toEqual(['df508702'])
  expect(data['forksOf:old']).toBeNull()
  expect(data['fork:df508702']).toMatchObject({ owner: 'new' })
})

// Spawn fg: after claude --bg, a split pane attaches to the session. The innermost multiplexer wins (herdr, then tmux, then cmux); with none, it runs in the background and says so.
for (const [name, env, expected] of [
  ['herdr', { HERDR_PANE_ID: 'w1:p4', TMUX_PANE: '%1', CMUX_SURFACE_ID: 'S' }, [['herdr', 'pane', 'split', '--pane', 'w1:p4', '--direction', 'down', '--cwd', '/repo', '--no-focus'], ['herdr', 'pane', 'run', 'w1:p9', 'claude attach df508702']]],
  ['tmux', { TMUX_PANE: '%1', CMUX_SURFACE_ID: 'S' }, [['tmux', 'split-window', '-v', '-d', '-P', '-F', '#{pane_id}', '-t', '%1', '-c', '/repo', 'claude attach df508702']]],
  ['cmux', { CMUX_SURFACE_ID: 'S' }, [['cmux', 'new-split', 'down', '--surface', 'S'], ['cmux', 'send', '--surface', 'surface:8', 'claude attach df508702'], ['cmux', 'send-key', '--surface', 'surface:8', 'enter']]],
  ['cmux-compact', { CMUX_SURFACE_ID: 'S' }, [['cmux', 'new-split', 'right', '--surface', 'S'], ['cmux', 'send', '--surface', 'surface:8', 'claude attach df508702'], ['cmux', 'send-key', '--surface', 'surface:8', 'enter']]],
  ['none', {}, [['osascript', '-e', 'tell application "Terminal"', '-e', 'activate', '-e', 'do script "cd \'/repo\' && claude attach df508702"', '-e', 'end tell']]],
] as const) {
  test(`fork fg: ${name} ${name === 'none' ? 'opens a Terminal window when no split is possible' : 'opens a split pane that attaches to the fork'}`, async ($, on) => {
    mock.clock(on, { now: 1_700_000_000_000 })
    const data: Record<string, unknown> = { prefs: { spawn: 'fg', spawnKey: '>', ...(name === 'cmux-compact' ? { view: 'compact' } : {}) } }
    sharedStore(on, data)
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 10 }, rateLimits: [] } }))
    on('session.id', () => ({ value: 'aaaa1111-0000-0000-0000-000000000000' }) as never)
    on('session.cwd', () => ({ value: '/repo' }) as never)
    on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('tool.register', () => ({ value: { tool: 'x' } }) as never)
    on('env.get', ($, e) => ({ value: (env as Record<string, string>)[(e as { name: string }).name] }) as never)
    on('prompt.submit', (_$, e) => ({ text: (e as { text: string }).text }) as never)
    const toasts: string[] = []
    on('ui.toast', ($, e) => { toasts.push((e as { text: string }).text); return { value: undefined } as never })
    const runs: string[][] = []
    on('process.run', ($, e) => {
      const argv = (e as { argv: string[] }).argv
      runs.push(argv)
      const a = argv.join(' ')
      const out = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '' } }) as never
      if (a.includes('rev-parse --show-toplevel')) return out('/repo\n')
      if (argv[0] === 'claude' && argv[1] === '--bg') return out('backgrounded · df508702\n')
      if (argv[0] === 'herdr' && argv[2] === 'split') return out('{"result":{"pane":{"pane_id":"w1:p9"}}}')
      if (argv[0] === 'uname') return out('Darwin\n')
      if (argv[0] === 'osascript') return out('tab 1 of window id 722\n')
      if (argv[0] === 'tmux' && argv[1] === 'split-window') return out('%7\n')
      if (argv[0] === 'cmux' && argv[1] === 'new-split') return out('OK surface:8 workspace:1\n')
      return out('')
    })
    await $.session.start({ cwd: '/repo', source: 'startup' } as never)
    // ; no longer starts a fork once the shortcut is >
    await $.prompt.submit({ text: ';ignored', origin: { kind: 'composer' } } as never)
    expect(runs.some(r => r[0] === 'claude' && r[1] === '--bg')).toBe(false)
    await $.prompt.submit({ text: '>fix the typo', origin: { kind: 'composer' } } as never)
    await $.tool.call({ tool: 'mcp__goyangi__fork', request: 'fix the typo' } as never)
    await until($, () => data['fork:df508702'])
    await until($, () => toasts.some(t => t.includes('Forked')))
    expect(runs.filter(r => (['herdr', 'tmux', 'cmux'].includes(r[0]!) && r[1] !== 'top') || (r[0] === 'osascript' && r[2] === 'tell application "Terminal"'))).toEqual(expected)
    const rec = data['fork:df508702'] as { pane?: { mux: string; ref: string } }
    expect(rec.pane).toEqual({ herdr: { mux: 'herdr', ref: 'w1:p9' }, tmux: { mux: 'tmux', ref: '%7' }, cmux: { mux: 'cmux', ref: 'surface:8' }, 'cmux-compact': { mux: 'cmux', ref: 'surface:8' }, none: { mux: 'window', ref: '722' } }[name])
    expect(toasts.some(t => t.includes(name === 'none' ? 'a new window' : 'split pane'))).toBe(true)
  })
}

test('fork tool: with Spawn off it starts nothing', async ($, on) => {
  const data: Record<string, unknown> = { prefs: { spawn: 'off' } }
  sharedStore(on, data)
  on('session.id', () => ({ value: 'aaaa1111-0000-0000-0000-000000000000' }) as never)
  on('session.cwd', () => ({ value: '/repo' }) as never)
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.register', () => ({ value: { tool: 'x' } }) as never)
  const runs: string[][] = []
  on('process.run', ($, e) => { runs.push((e as { argv: string[] }).argv); return { value: { exitCode: 0, stdout: '', stderr: '' } } as never })
  await $.session.start({ cwd: '/repo', source: 'startup' } as never)
  const r = await $.tool.call({ tool: 'mcp__goyangi__fork', request: 'x' } as never)
  expect(String(r.result)).toContain('Spawn is off')
  expect(runs.some(a => a[0] === 'claude' && a[1] === '--bg')).toBe(false)
})
