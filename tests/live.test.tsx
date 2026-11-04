import { test, expect } from 'claude-code/testing'

test('tool calls arriving after the panel is opened are redrawn too', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  const ui = await $.ui.mount({ plugin: 'goyangi', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'goyangi', viewport: { columns: 100, rows: 40 } as never })
  expect(await ui.find({ text: /tools 0/ })).toBeDefined()
  await $.tool.call({ tool: 'Bash', command: 'echo live' })
  expect(await ui.find({ text: /echo live/ })).toBeDefined()
  expect(await ui.find({ text: /tools 1/ })).toBeDefined()
  await ui.unmount()
})
