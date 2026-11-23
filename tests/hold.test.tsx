import { test, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { idleDue, topicAsk, topicNew, holdMinK } from '../hooks/state'

test('idleDue: past the idle minutes with a large context only', async () => {
  const h = 3600_000
  expect(idleDue(1, 1 + h, 60, 200, 200)).toBe(true)
  expect(idleDue(1, h, 60, 200, 200)).toBe(false)
  expect(idleDue(1, 1 + h, 60, 199, 200)).toBe(false)
  expect(idleDue(1, 1 + h, 0, 500, 200)).toBe(false)
  expect(idleDue(0, 1 + h, 60, 500, 200)).toBe(false)
  expect(holdMinK(300)).toBe(300)
  expect(holdMinK(0)).toBe(200)
})

test('topicAsk cuts long prompts; topicNew reads only a NO', async () => {
  const q = topicAsk(['a'.repeat(400), 'fix the build'], 'write a poem')
  expect(q).toContain(`1. ${'a'.repeat(300)}…`)
  expect(q).toContain('2. fix the build')
  expect(q).toContain('New prompt:\nwrite a poem')
  expect(topicNew('NO')).toBe(true)
  expect(topicNew('No.')).toBe(true)
  expect(topicNew('YES')).toBe(false)
  expect(topicNew('nothing')).toBe(false)
})

// A session with one finished turn and a 250k context (the hold starts at the 200k fresh-session point). choice is what the person picks in
// the question (undefined: dismissed). The turn ends on the real clock (Date.now) and Goyangi reads the time of a prompt from $.clock, so idle
// starts the mocked clock that far ahead.
async function setup($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], answer: string, { idleMin = 0, percent = 25, fillOk = true, choice = undefined as string | undefined } = {}) {
  const clock = mock.clock(on, { now: Date.now() + idleMin * 60_000 })
  mock.store(on, {})
  mock.env(on, { TMPDIR: '/tmp/t/' })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000, percent }, rateLimits: [] } }))
  on('session.id', () => ({ value: 'sid' }) as never)
  on('session.start', ($, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.register', () => ({ value: { tool: 'x' } }) as never)
  on('process.run', () => ({ value: { exitCode: 0, stderr: '', stdout: '' } }) as never)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  const asked: string[] = []
  on('model.complete', ($, e) => { asked.push(String((e as { prompt: unknown }).prompt)); return { value: { isAnswered: true, text: answer, usage: {} } } as never })
  const questions: string[] = []
  // $.ui.ask is a call of the AskUserQuestion tool; the answer comes back keyed by the question
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const q = (e as unknown as { questions: { question: string }[] }).questions[0]!
    questions.push(q.question)
    return (choice ? { result: { questions: [q], answers: { [q.question]: choice } } } : { deny: 'dismissed' }) as never
  })
  const filled: string[] = []
  on('prompt.fill', ($, e) => { filled.push((e as { text: string }).text); return { isFilled: fillOk } as never })
  const sent: string[] = []
  on('prompt.submit', ($, e) => { sent.push((e as { text: string }).text); return { text: (e as { text: string }).text } as never })
  const files: Record<string, string> = {}
  on('fs.write', ($, e) => { const x = e as { path: string; text: string }; files[x.path] = x.text; return { value: undefined } as never })
  on('fs.read', ($, e) => ({ value: files[(e as { path: string }).path] ?? '' }) as never)
  const commands: string[] = []
  on('command.run', ($, e) => { commands.push((e as { command: string }).command); return { text: '' } as never })
  await $.session.start({ cwd: '/x', source: 'startup' } as never)
  await $.turn.start({ text: 'refactor the parser module', turnId: 't1' } as never)
  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  const submit = async (text: string) => { const r = await ($.prompt.submit({ text, origin: { kind: 'composer' } } as never) as Promise<{ drop?: string }>); await clock.advance(1000); return r }
  return { clock, asked, questions, filled, sent, commands, files, submit }
}

test('idle hold: after an hour the person is asked; Keep and send sends the prompt here', async ($, on) => {
  const { asked, questions, sent, submit } = await setup($, on, 'YES', { idleMin: 61, choice: 'Keep and send' })
  expect((await submit('continue with the parser tests')).drop).toBeDefined()
  expect(questions[0]).toContain('prompt cache has expired')
  expect(questions[0]).toContain('250k')
  expect(questions[0]).toMatch(/\?$/)
  expect(asked).toEqual([])
  expect(sent).toEqual(['continue with the parser tests'])
})

test('topic hold: Clear and send runs /clear and the new session gets the prompt as typed', async ($, on) => {
  const { clock, asked, questions, sent, commands, submit } = await setup($, on, 'NO', { choice: 'Clear and send' })
  expect((await submit('write a release note for the website')).drop).toBeDefined()
  expect(questions[0]).toContain('unrelated')
  expect(asked[0]).toContain('1. refactor the parser module')
  expect(commands).toEqual(['clear'])
  await $.session.start({ cwd: '/x', source: 'clear' } as never)
  await clock.advance(1000)
  expect(sent).toEqual(['write a release note for the website'])
})

test('topic hold: after Keep and send the session is not asked about topics again', async ($, on) => {
  const { asked, questions, sent, submit } = await setup($, on, 'NO', { choice: 'Keep and send' })
  expect((await submit('write a release note for the website')).drop).toBeDefined()
  expect((await submit('and a short changelog entry for the site')).drop).toBeUndefined()
  expect(questions).toHaveLength(1)
  expect(asked).toHaveLength(1)
  expect(sent).toEqual(['write a release note for the website', 'and a short changelog entry for the site'])
})

test('a dismissed question puts the text back in the box', async ($, on) => {
  const a = await setup($, on, 'NO')
  await a.submit('write a release note for the website')
  expect(a.filled).toEqual(['write a release note for the website'])
  expect(a.sent).toEqual([])
})

test('a dismissed question with a box that refuses the text sends the prompt', async ($, on) => {
  const { filled, sent, submit } = await setup($, on, 'NO', { fillOk: false })
  await submit('write a release note for the website')
  expect(filled).toHaveLength(1)
  expect(sent).toEqual(['write a release note for the website'])
})

test('no hold: a related prompt, a short one, and a slash command', async ($, on) => {
  const { asked, sent, submit } = await setup($, on, 'YES')
  expect((await submit('now add tests for the parser changes')).drop).toBeUndefined()
  expect((await submit('ok')).drop).toBeUndefined()
  expect((await submit('/compact keep the parser notes')).drop).toBeUndefined()
  expect(asked).toHaveLength(1)
  expect(sent).toHaveLength(3)
})

test('no hold under the fresh-session point, even when idle', async ($, on) => {
  const { asked, submit } = await setup($, on, 'NO', { idleMin: 61, percent: 15 })
  expect((await submit('write a release note for the website')).drop).toBeUndefined()
  expect(asked).toEqual([])
})

test('idle hold: Hand off and send writes the note, clears, and the new session reads it and answers the prompt', async ($, on) => {
  const { clock, questions, sent, commands, files, submit } = await setup($, on, 'YES', { idleMin: 61, choice: 'Hand off and send' })
  await submit('continue with the parser tests')
  expect(questions[0]).toContain('handoff note')
  expect(sent.at(-1)).toContain('Write a handoff note to /tmp/t/goyangi/handoff-sid.md')
  files['/tmp/t/goyangi/handoff-sid.md'] = '# Handoff\nparser refactor'
  await $.turn.complete({ turnId: 't2', answer: 'handoff written', durationMs: 10, isAborted: false, reason: 'answer' } as never)
  await clock.advance(1000)
  expect(commands).toEqual(['clear'])
  await $.session.start({ cwd: '/x', source: 'clear' } as never)
  await clock.advance(1000)
  expect(sent.at(-1)).toContain('Read the handoff note at /tmp/t/goyangi/handoff-sid.md')
  expect(sent.at(-1)).toContain('continue with the parser tests')
})
