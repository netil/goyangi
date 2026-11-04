// Layout check: renders the terminal panel with Ink at several widths and reports rows wider than the panel and Box props the engine refuses.
// The engine draws with its own Ink-based renderer, so this approximates it (colors and emoji widths aside); the test kit can't paint.
// Usage (from this folder, after npm install): node check.mjs [widths...]   e.g. node check.mjs 26 40 60
//   VIEW=avatar for the walk view, SETTINGS=1 with the settings screen open, MODE=band for the minimized view, FRAMES=1 to print every frame.
import * as esbuild from 'esbuild'
import React from 'react'
import { Box as IBox, Text as IText } from 'ink'
import { render } from 'ink-testing-library'
import { eastAsianWidth } from 'get-east-asian-width'
import os from 'node:os'
import path from 'node:path'

// Display width as terminals count it: wide and full-width characters take two cells, everything else (ambiguous symbols like ▶ included) one.
const cells = s => [...s].reduce((n, ch) => n + (/\p{Mark}/u.test(ch) ? 0 : eastAsianWidth(ch.codePointAt(0))), 0)
const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE, '../..')
const OUT = path.join(os.tmpdir(), 'yaong-layout-check.mjs')
const args = process.argv.slice(2).map(Number)
const widths = args.length ? args : [26, 32, 40, 50, 60, 80, 100, 120]

await esbuild.build({ entryPoints: [`${ROOT}/hooks/register.tsx`], bundle: true, format: 'esm', platform: 'node', outfile: OUT,
  jsxFactory: 'h', jsxFragment: 'Fragment', alias: { 'claude-code': `${HERE}/stub.js` }, logLevel: 'error' })
globalThis.h = React.createElement
globalThis.Fragment = React.Fragment
const mod = await import(`${OUT}?${Date.now()}`)

// Hooks keyed by event name plus matcher, so the Pane and AbovePrompt renders don't overwrite each other.
const hooks = {}
const on = (name, ...args) => { hooks[name + (args.length > 1 ? JSON.stringify(args[0]) : '')] = args.at(-1); return { catch() {} } }
mod.register(on, {})

const noop = async () => undefined
const now = Date.now()
const $ = {
  values: new Map(),
  session: { usage: async () => ({ startedAt: 1, cost: { usd: 1.23 }, context: { percent: 58, window: 200000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 52, resetsAt: now + 3600e3 }, { kind: 'seven_day', percentUsed: 15, resetsAt: now + 86400e3 }] }) },
  ui: { toast() {}, open: noop, close: noop, invalidate() {} }, store: { set: noop, get: noop }, command: { register: noop }, tool: { register: noop },
  env: { get: noop }, process: { run: async () => ({ stdout: '' }) }, clock: { every: () => {} }, config: { list: async () => [] },
  fs: { read: async () => JSON.stringify({ version: '1.0.0' }) }, plugin: { root: ROOT },
}

// The engine's elements as Ink components. Absolute and hidden boxes (hover cards, tooltips) are left out.
const ALLOWED = new Set(('key hover position top left right bottom flexDirection flexGrow flexShrink flexWrap alignItems alignSelf justifyContent gap columnGap rowGap '
  + 'width height minWidth minHeight margin marginX marginY marginTop marginBottom marginLeft marginRight padding paddingX paddingY paddingTop paddingBottom '
  + 'paddingLeft paddingRight borderStyle borderColor borderDimColor backgroundColor overflow display children').split(' '))
const refused = new Set()
const hex = c => (typeof c === 'string' && c.startsWith('#') ? c : undefined)
const Box = p => {
  for (const k of Object.keys(p)) if (!ALLOWED.has(k)) refused.add(k)
  if (p.display === 'none' || p.position === 'absolute') return null
  const { hover, display, backgroundColor, ...q } = p
  return React.createElement(IBox, q)
}
const Text = ({ hover, color, backgroundColor, ...q }) => React.createElement(IText, { ...q, color: hex(color), backgroundColor: hex(backgroundColor) })
const Button = p => React.createElement(IText, { dimColor: p.dimColor }, p.hotkey ? `${p.hotkey}: ` : '', p.children ?? p.label)
const Client = p => React.createElement(IBox, { width: p.width ?? 1, height: p.height ?? 1, flexDirection: 'column' },
  ...Array.from({ length: p.height ?? 1 }, (_, i) => React.createElement(IText, { key: i }, '│')))
$.ui.resolve = () => ({ Box, Text, Button, Client })

// A session with a few turns, steps, tools, and a running subagent.
const call = (n, e, next = async () => ({})) => hooks[n]($, e, next)
await call('session.start', {})
for (let k = 1; k <= 3; k++) {
  await call('turn.start', { turnId: `t${k}`, text: `prompt number ${k} asks for a fairly long change to the layout code` })
  for (let i = 0; i < 2; i++) {
    await hooks['turn.step']($, { turnId: `t${k}`, index: i, model: 'opus' }, async function* () {
      return { answer: 'Checking the build output and fixing the failing test', usage: { input_tokens: 1200, output_tokens: 300 }, stopReason: 'tool_use', toolUses: [{}] }
    }).next()
    await call('tool.call', { tool: 'Bash', input: { command: `npm run build -- --project packages/app-${i} --verbose` } }, async () => ({ result: { stdout: 'a\nb' } }))
    await call('tool.call', { tool: 'Read', input: { file_path: `/repo/src/components/Header${i}.tsx` } }, async () => ({ result: { text: '1\n2' } }))
  }
  if (k < 3) await call('turn.complete', { turnId: `t${k}`, reason: 'answer', durationMs: 10 })
}
await call('agent.spawn', { subagentType: 'Explore', description: 'Find every place that lays out the header' }, async () => ({ agentId: 'a1', model: 'haiku' }))

const MODE = process.env.MODE ?? 'pane'
if (process.env.VIEW) $.values.set('prefs', { view: process.env.VIEW })
if (process.env.SETTINGS) $.values.set('settingsOpen', true)
if (MODE === 'band') $.values.set('fold', { all: true, side: false, map: false, flow: false, agents: false, log: false })
const site = Object.keys(hooks).find(k => k.startsWith('ui.render') && k.includes(MODE === 'band' ? 'AbovePrompt' : 'Pane'))

let problems = 0
for (const w of widths) {
  const e = MODE === 'band'
    ? { surface: 'terminal', component: 'AbovePrompt', requestId: 'b', props: { bodyColumns: w, hasSurvey: false, isWorking: true, maxRows: 10, scroll: { offset: 0, bodyRows: 10 } }, viewport: { columns: w + 5, rows: 40 } }
    : { surface: 'terminal', component: 'Pane', requestId: 'r', props: { bodyColumns: w, placement: 'dock', scroll: { offset: 0, bodyRows: 70 } }, viewport: { columns: w + 2, rows: 80 } }
  const tree = await hooks[site]($, e, async () => null)
  const { lastFrame, unmount } = render(React.createElement(IBox, { width: w, flexDirection: 'column' }, tree))
  const rows = lastFrame().split('\n').map(l => l.replace(/\x1b\[[0-9;]*m/g, ''))
  unmount()
  if (process.env.FRAMES) console.log(`===== width ${w} =====\n${rows.map(l => `${l}|`).join('\n')}`)
  for (const l of rows.filter(l => cells(l) > w)) { console.log(`OVER ${w} (${cells(l)}): ${l}`); problems++ }
}
if (refused.size) { console.log(`Box props the engine refuses: ${[...refused].join(', ')}`); problems++ }
console.log(problems ? `${problems} problem(s)` : `ok: ${widths.join(', ')}`)
process.exit(problems ? 1 : 0)
