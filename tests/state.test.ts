import { test, expect } from 'claude-code/testing'
import { iconKind, REFRESH_ICON, faceKeep, octantTerminal, pickBrowsers, lineDelta, addDiff, patchOrange, emptyTree, patchLoop, describeAgent, toolStart, toolEnd, ended, visibleAgents, fit, newLoop, flowColumns, ellipsis, branchLines, joinLines, arrowFrame, shouldCheckUpdate, updatedVersion, UPDATE_EVERY_MS, deskOf, dotRows, dotSvg, dotScene, flagSvg, dotRgba, base64, pixelTerminal, sprite, prop, stations, miniTrack, petMood, petPixels, overlay, replayAt, costMark, parsePeers, parseAgents, cmuxTarget, parseTabs, findTabs, stick, handoffLabel, appOf, hostTag, handoffNote, pullRequest, pullFrom, screenState } from '../hooks/state'

test('parallel tools: stays tool while others still run after one ends', async () => {
  let l = toolStart(toolStart(newLoop('m', 'main'), 'Bash a'), 'Bash b')
  l = toolEnd(l)
  expect(l.status).toBe('tool')
  l = toolEnd(l)
  expect(l.status).toBe('idle')
  expect(toolEnd(l).running).toBe(0)
})

test('totals and end state survive events arriving before the spawn result', async () => {
  let t = patchLoop(emptyTree(), 'a1', l => toolStart(l, 'Read x'))
  t = patchLoop(t, 'a1', l => ended(toolEnd(l), false))
  t = describeAgent(t, 'a1', 'Explore', 'find\nfiles', 'haiku')
  expect(t.agents).toHaveLength(1)
  expect(t.agents[0]).toMatchObject({ type: 'Explore', desc: 'find files', status: 'done', tools: 1 })
})

test('failed is not overwritten by a later SubagentStop done', async () => {
  expect(ended(ended(newLoop('a', 'x'), true), false).status).toBe('failed')
})

test('running agents are shown before finished ones', async () => {
  const a = [ended(newLoop('1', 'x'), false), newLoop('2', 'y'), ended(newLoop('3', 'z'), false)]
  const v = visibleAgents(a, 2)
  expect(v.shown.map(s => s.id)).toEqual(['2', '3'])
  expect(v.hidden).toBe(1)
})

test('full-width padding', async () => {
  expect(fit('漢字ab', 5)).toBe('漢字a')
  expect(fit('ab', 4)).toBe('ab  ')
})

test('flow chart columns: tools go under the previous node, subagent tools under the agent', async () => {
  const it = (id: string, kind: 'prompt' | 'step' | 'tool' | 'agent' | 'answer', agentId?: string) =>
    ({ id, kind, agentId, label: id, meta: '', startedAt: 0, endedAt: 1, ok: true })
  const cols = flowColumns([
    it('p', 'prompt'), it('s1', 'step'), it('t1', 'tool'), it('agent:A', 'agent'), it('t2', 'tool'),
    it('ta', 'tool', 'A'), it('s2', 'step'), it('tb', 'tool', 'A'), it('ans', 'answer'),
  ])
  expect(cols.map(c => c.node.id)).toEqual(['p', 's1', 's2', 'ans'])
  expect(cols[1]!.children.map(c => `${c.item.id}:${c.depth}`)).toEqual(['t1:0', 'agent:A:0', 'ta:1', 'tb:1', 't2:0'])
})

test('ellipsis: cut by display width and append …', async () => {
  const el = ellipsis
  expect(el('short', 10)).toBe('short')
  expect(el('abcdefghij', 6)).toBe('abcde…')
  expect(el('漢字仮 名交文 長長長', 9)).toBe('漢字仮…')
  expect(el('a  b\nc', 10)).toBe('a b c')
})

test('fork lines: ▼ at both ends and the middle target; while running, dots spread from the middle', async () => {
  const { branchLines: b, joinLines: j, arrowFrame: a } = await Promise.resolve({ branchLines, joinLines, arrowFrame })
  const [top, line, bottom] = b(21, [0, 10, 20], 3, true)
  expect(bottom).toBe('▼' + ' '.repeat(9) + '▼' + ' '.repeat(9) + '▼')
  expect(line[0]).toBe('┌')
  expect(line[20]).toBe('┐')
  expect(line[7]).toBe('●')
  expect(line[8]).toBe('•')
  expect(line[13]).toBe('●')
  expect(top.trimEnd().length).toBe(11)
  const [still] = [b(21, [0, 10, 20], 3, false)[1]]
  expect(still.includes('●')).toBe(false)
  const [jl, jb] = j(21, [0, 10, 20], 0, false)
  expect(jl[0]).toBe('└')
  expect(jb).toBe(' '.repeat(10) + '▼')
  expect(a(1, true)).toBe('─●─▶')
  expect(a(1, false)).toBe('──▶')
})

test('auto-update check: only when on, installed from the Yaong marketplace, and the interval has passed', () => {
  const now = 10 * UPDATE_EVERY_MS
  const installed = '/Users/u/.claude/plugins/cache/yaong/yaong/0.34.0'
  expect(shouldCheckUpdate(true, installed, undefined, now)).toBe(true)
  expect(shouldCheckUpdate(true, installed, now - UPDATE_EVERY_MS, now)).toBe(true)
  expect(shouldCheckUpdate(true, installed, now - 1000, now)).toBe(false)
  expect(shouldCheckUpdate(false, installed, undefined, now)).toBe(false)
  // Dev copies (other marketplaces, --plugin-dir) are not checked
  expect(shouldCheckUpdate(true, '/Users/u/.claude/plugins/cache/other-market/yaong/0.28.4', undefined, now)).toBe(false)
  expect(shouldCheckUpdate(true, '/Users/u/dev/dari', undefined, now)).toBe(false)
})

test('updatedVersion: reads only a move to a new version from plugin update --json output', () => {
  const updated = '{"command":"update","outcome":"ok","updateOutcome":"updated","oldVersion":"0.33.0","newVersion":"0.34.0"}'
  const same = '{"command":"update","outcome":"ok","updateOutcome":"up_to_date","oldVersion":"0.34.0","newVersion":"0.34.0"}'
  expect(updatedVersion(updated)).toEqual({ from: '0.33.0', to: '0.34.0' })
  expect(updatedVersion(`notice text\n${updated}\n`)).toEqual({ from: '0.33.0', to: '0.34.0' })
  expect(updatedVersion(same)).toBeUndefined()
  expect(updatedVersion('{"outcome":"failed","failureCode":"not_found"}')).toBeUndefined()
  expect(updatedVersion('')).toBeUndefined()
  expect(updatedVersion('{broken json')).toBeUndefined()
})

test('deskOf: picks pose and prop from loop status and the running tool', async () => {
  const l = newLoop('m', 'main')
  expect(deskOf({ ...l, status: 'thinking' })).toMatchObject({ pose: 'run', prop: 'think' })
  expect(deskOf(toolStart(l, 'Bash ls -al'))).toMatchObject({ pose: 'work', prop: 'b', what: 'Running a command' })
  expect(deskOf(toolStart(l, 'Edit a.ts'))).toMatchObject({ pose: 'work', prop: 'e' })
  expect(deskOf(ended(l, true))).toMatchObject({ pose: 'fail' })
  expect(deskOf(ended(l, false))).toMatchObject({ pose: 'think', what: 'Done' })
  expect(deskOf(l)).toMatchObject({ pose: 'think', what: 'Waiting' })
})

test('dotRows: 2×4 pixels as one octant character, each cell painted with its two most used colors', async () => {
  const pal = { A: '#a', B: '#b', C: '#c' }
  expect(dotRows(['..', '..', '..', '..'], pal)).toEqual([[{ text: ' ' }]])
  // Shapes drawable with existing block characters use those characters
  expect(dotRows(['AA', 'AA', '..', '..'], pal)[0]).toEqual([{ text: '▀', fg: '#a' }])
  expect(dotRows(['A.', 'A.', 'A.', 'A.'], pal)[0]).toEqual([{ text: '▌', fg: '#a' }])
  expect(dotRows(['AA', 'AA', 'AA', 'AA', 'AA', 'AA', 'AA', 'AA'], pal).map(r => r[0]!.text)).toEqual(['█', '█'])
  // A single top-left pixel is an octant character
  expect(dotRows(['A.', '..', '..', '..'], pal)[0]![0]!.text).toBe('\u{1CEA8}')
  // Two colors: the more common one is the foreground, the other the background
  expect(dotRows(['AA', 'AA', 'AA', 'BB'], pal)[0]).toEqual([{ text: '\u{1FB85}', fg: '#a', bg: '#b' }])
  // With three colors, the least used merges into the foreground
  expect(dotRows(['AA', 'AA', 'AC', 'BB'], pal)[0]).toEqual([{ text: '\u{1FB85}', fg: '#a', bg: '#b' }])
  // Same-colored cells are grouped into one segment
  expect(dotRows(['AAAA', 'AAAA', '....', '....'], pal)[0]).toEqual([{ text: '▀▀', fg: '#a' }])
})

test('dotSvg: same-colored runs merge into one rect, and rows pads the top', async () => {
  const pal = { A: '#a', B: '#b' }
  expect(dotSvg(['AAB.', '.A..'], pal)).toBe(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 2" shape-rendering="crispEdges">'
    + '<rect x="0" y="0" width="2" height="1" fill="#a"/><rect x="2" y="0" width="1" height="1" fill="#b"/>'
    + '<rect x="1" y="1" width="1" height="1" fill="#a"/></svg>')
  // Different palette letters with the same color are merged
  expect(dotSvg(['AC'], { A: '#a', C: '#a' })).toContain('<rect x="0" y="0" width="2" height="1" fill="#a"/>')
  // A prop (12 rows) at 16 rows high: the top 4 rows are empty
  const s = dotSvg(['A'], pal, 4)
  expect(s).toContain('viewBox="0 0 1 4"')
  expect(s).toContain('<rect x="0" y="3"')
})

test('dotScene: each image has its own palette and position, and pixels outside are clipped', async () => {
  const svg = dotScene(4, 2, [{ grid: ['AA'], pal: { A: '#a' }, x: 3, y: 0 }, { grid: ['B'], pal: { B: '#b' }, x: 0, y: 1 }], '<g/>')
  expect(svg).toContain('viewBox="0 0 4 2"')
  expect(svg).toContain('<rect x="3" y="0" width="1" height="1" fill="#a"/>')
  expect(svg).toContain('<rect x="0" y="1" width="1" height="1" fill="#b"/>')
  expect(svg).toMatch(/<g\/><\/svg>$/)
})

test('base64: standard base64 (with padding)', async () => {
  expect(base64(new Uint8Array([]))).toBe('')
  expect(base64(new Uint8Array([102]))).toBe('Zg==')
  expect(base64(new Uint8Array([102, 111]))).toBe('Zm8=')
  expect(base64(new Uint8Array([102, 111, 111, 98, 97, 114]))).toBe('Zm9vYmFy')
})

test('dotRgba: palette colors are opaque pixels, empty is transparent, taller rows pad the top', async () => {
  const r = dotRgba(['A.'], { A: '#102030' }, 2)
  expect([r.width, r.height]).toEqual([2, 2])
  // 2×2 pixels = 16 bytes: top row transparent, only the first bottom pixel #102030
  expect(r.rgba).toBe(base64(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0x10, 0x20, 0x30, 255, 0, 0, 0, 0])))

  // scale 2: each dot becomes 2×2 pixels
  const s2 = dotRgba(['A.'], { A: '#102030' }, 2, 2)
  expect([s2.width, s2.height]).toEqual([4, 4])
  const on = [0x10, 0x20, 0x30, 255], off = [0, 0, 0, 0]
  expect(s2.rgba).toBe(base64(new Uint8Array([...off, ...off, ...off, ...off, ...off, ...off, ...off, ...off, ...on, ...on, ...off, ...off, ...on, ...on, ...off, ...off])))
})

test('pixelTerminal: only kitty and Ghostty draw pixels, and inside tmux character art is used', async () => {
  expect(pixelTerminal({ TERM: 'xterm-kitty' })).toBe(true)
  expect(pixelTerminal({ TERM: 'xterm-ghostty' })).toBe(true)
  expect(pixelTerminal({ TERM_PROGRAM: 'ghostty' })).toBe(true)
  expect(pixelTerminal({ KITTY_WINDOW_ID: '1' })).toBe(true)
  expect(pixelTerminal({ TERM: 'xterm-kitty', TMUX: '/tmp/tmux' })).toBe(false)
  expect(pixelTerminal({ TERM: 'xterm-256color', TERM_PROGRAM: 'iTerm.app' })).toBe(false)
  expect(pixelTerminal({})).toBe(false)
})

test('flagSvg: pole and numbered cloth, with an end triangle for two characters or fewer', async () => {
  const two = flagSvg('12', '#0f0', '#999')
  expect(two).toContain('viewBox="0 0 40 64"')
  expect(two).toContain('<rect x="6" y="16" width="2" height="48" fill="#999"/>')
  expect(two).toContain('<polygon')
  expect(two).toContain('>12</text>')
  const three = flagSvg('123', '#0f0', '#999')
  expect(three).not.toContain('<polygon')
  expect(three).toContain('width="32"')
  expect(flagSvg('<a>', '#0f0', '#999')).toContain('>a</text>')
})

test('pixel art is 16×16 for every character and 12×12 for props', async () => {
  for (const ch of ['cat', 'dog'] as const) {
    for (const pose of ['run', 'think', 'work', 'fail', 'sleep'] as const) {
      for (const f of [0, 1]) {
        const g = sprite(pose, f, ch)
        expect(g).toHaveLength(16)
        for (const r of g) expect(r).toHaveLength(16)
      }
    }
  }
  // Each character runs with two different frames
  for (const ch of ['cat', 'dog'] as const) expect(sprite('run', 0, ch)).not.toEqual(sprite('run', 1, ch))
  // A character saved by an earlier version draws the cat
  expect(sprite('run', 0, 'robot')).toEqual(sprite('run', 0, 'cat'))
  for (const k of ['b', 'r', 'e', 's', 'w', 'm', 'k', 'a', 'o', 'door', 'think', 'rest', 'done', 'zz']) {
    for (const f of [0, 1, 2]) {
      const g = prop(k, f)
      expect(g).toHaveLength(12)
      for (const r of g) expect(r).toHaveLength(12)
    }
  }
})

test('stations: main makes spots like flow chart columns with tools as branches; subagents get door, work, and rest spots', async () => {
  const flow = [
    { id: 'p', kind: 'prompt', label: 'prompt', meta: '', startedAt: 1, endedAt: 1, ok: true },
    { id: 's1', kind: 'step', label: 'step 1 → tool_use', meta: '', startedAt: 2, endedAt: 3, ok: true },
    { id: 't1', kind: 'tool', label: 'Bash  ls', meta: '', startedAt: 3, endedAt: 4, ok: false },
    { id: 'g', kind: 'agent', label: 'Explore  find', meta: '', startedAt: 4, ok: true },
    { id: 't2', kind: 'tool', agentId: 'a1', label: 'Read  x', meta: '', startedAt: 5, endedAt: 6, ok: true },
    { id: 's2', kind: 'step', label: 'step 2', meta: '', startedAt: 6, ok: true },
  ] as never
  const main = stations(flow, newLoop('main', 'main'))
  expect(main.map(x => `${x.prop}:${x.label}:${x.state}:${x.kids.length}`)).toEqual(['door:prompt:ok:0', 'a:step 1:fail:2', 'think:step 2:run:0'])
  // While a tool runs, that spot is in progress and its prop is that tool
  const live = stations([...(flow as unknown[]).slice(0, 2), { id: 't3', kind: 'tool', label: 'WebFetch  u', meta: '', startedAt: 3, ok: true }] as never, newLoop('main', 'main'))
  expect(live[1]).toMatchObject({ prop: 'w', state: 'run' })
  const a = { ...newLoop('a1', 'Explore'), status: 'thinking' as const, startedAt: 4 }
  expect(stations(flow, a, 'a1').map(x => `${x.prop}:${x.state}:${x.kids.length}`)).toEqual(['door:ok:0', 'think:run:1', ])
  expect(stations(flow, ended(a, false), 'a1').map(x => `${x.prop}:${x.state}`)).toEqual(['door:ok', 'r:ok', 'rest:ok'])
  expect(stations([], newLoop('main', 'main'))).toHaveLength(1)
})

test('miniTrack: prompt ▶, step numbers, answer ■; the running spot lists its tools; keeps the latest tokens that fit', async () => {
  const flow = [
    { id: 'p', kind: 'prompt', label: 'prompt', meta: '', startedAt: 1, endedAt: 1, ok: true },
    { id: 's1', kind: 'step', label: 'step 1 → tool_use', meta: '', startedAt: 2, endedAt: 3, ok: true },
    { id: 't1', kind: 'tool', label: 'Bash  ls', meta: '', startedAt: 3, endedAt: 4, ok: false },
    { id: 's2', kind: 'step', label: 'step 2', meta: '', startedAt: 6, endedAt: 7, ok: true },
    { id: 't2', kind: 'tool', label: 'Read  x', meta: '', startedAt: 7, ok: true },
    { id: 'g', kind: 'agent', label: 'Explore  find', meta: '', startedAt: 7, ok: true },
  ] as never
  const all = miniTrack(stations(flow, newLoop('main', 'main')), 80)
  expect(all.hidden).toBe(0)
  expect(all.toks.map(k => `${k.text}:${k.state}:${k.tools}`)).toEqual(['▶:ok:', '1:fail:', '2:run:ra'])
  // Width 10: '─2' with spinner and ' ra' takes 6 cells, '─1' 2 more; 3 cells are kept for '◂N'
  const cut = miniTrack(stations(flow, newLoop('main', 'main')), 10)
  expect(cut.hidden).toBe(2)
  expect(cut.toks.map(k => k.text)).toEqual(['2'])
  expect(miniTrack(stations([], newLoop('main', 'main')), 80).toks).toEqual([])
})


test('orange patches turn deep orange only on yellow-to-amber bodies', () => {
  expect(patchOrange('#f6c177')).toBe('#c2410c') // amber subagent
  expect(patchOrange('#e0af68')).toBe('#c2410c')
  for (const body of ['#93c5fd', '#8ab4f8', '#c4a7e7', '#eb6f92', '#9ccfd8', '#ef4444']) expect(patchOrange(body)).toBe('#f97316')
})

test('petMood: tired from 3/4 of the context alert, heavy from the alert, cost levels by turn cost, sky by the 5h limit; 0 turns a part off', async () => {
  const base = { ctxPct: 0, ctxAlert: 80, costAlert: 2 }
  expect(petMood({ ...base, ctxPct: 59 })).toEqual({ tired: false, heavy: false, cost: 0, sky: 'day' })
  expect(petMood({ ...base, ctxPct: 60 }).tired).toBe(true)
  expect(petMood({ ...base, ctxPct: 79 }).heavy).toBe(false)
  expect(petMood({ ...base, ctxPct: 80 }).heavy).toBe(true)
  expect(petMood({ ...base, ctxPct: 100, ctxAlert: 0 })).toMatchObject({ tired: false, heavy: false })
  expect([0.2, 0.3, 1, 2].map(cost => petMood({ ...base, cost }).cost)).toEqual([0, 1, 2, 3])
  // Without a cost alert: $0.3 and $1, never the top level
  expect([0.2, 0.3, 1, 50].map(cost => petMood({ ...base, costAlert: 0, cost }).cost)).toEqual([0, 1, 2, 2])
  // No rate limits (API key sessions): always day
  expect(petMood({ ...base, limitPct: undefined }).sky).toBe('day')
  expect([59, 60, 89, 90].map(limitPct => petMood({ ...base, limitPct }).sky)).toEqual(['day', 'dusk', 'dusk', 'night'])
})

test('petPixels stay inside the 16 × 16 sprite; only dark circles land on the eyes, on the lower half of an open eye', async () => {
  const full = { tired: true, heavy: true, cost: 3 as const, sky: 'night' as const }
  for (const ch of ['cat', 'dog'])
    for (const pose of ['run', 'think', 'work', 'fail', 'sleep'] as const)
      for (const frame of [0, 1])
        for (const shake of [false, true]) {
          const base = sprite(pose, frame, ch)
          const px = petPixels(ch, pose, frame, full, shake)
          for (const [x, y, c] of px) {
            expect(x >= 0 && x < 16 && y >= 0 && y < 16).toBe(true)
            if (c === 'V') expect(`${base[y]![x]}${base[y - 1]![x]}`).toBe('EE')
            else expect(base[y]![x]).not.toBe('E')
          }
          const art = overlay(base, px)
          expect(art).toHaveLength(16)
          for (const r of art) expect(r).toHaveLength(16)
        }
  // Both open eyes get circles; none while lying down or with the X eyes of a failure
  for (const ch of ['cat', 'dog']) expect(petPixels(ch, 'run', 0, full).filter(p => p[2] === 'V')).toHaveLength(2)
  expect(petPixels('cat', 'sleep', 0, full).some(p => p[2] === 'V')).toBe(false)
  expect(petPixels('cat', 'fail', 0, full).some(p => p[2] === 'V')).toBe(false)
  // overlay drops pixels outside the grid
  expect(overlay(['..', '..'], [[1, 0, 'X'], [5, 0, 'X'], [0, 9, 'X']])).toEqual(['.X', '..'])
})

test('replayAt: one spot every 2s (running the first second), the pose by spot kind, a 2s rest at the end, then it starts over', async () => {
  const st = [
    { id: 'p', prop: 'door', label: 'prompt', state: 'ok', startedAt: 0, kids: [] },
    { id: 's', prop: 'think', label: 'step 1', state: 'ok', startedAt: 0, kids: [], node: { kind: 'step' } },
    { id: 'b', prop: 'b', label: 'step 2', state: 'fail', startedAt: 0, kids: [], node: { kind: 'step' } },
  ] as never as Parameters<typeof replayAt>[0]
  expect(replayAt(st, 0)).toEqual({ at: 0, pose: 'run' })
  expect(replayAt(st, 1500)).toEqual({ at: 0, pose: 'work' })
  expect(replayAt(st, 3500)).toEqual({ at: 1, pose: 'think' })
  expect(replayAt(st, 5500)).toEqual({ at: 2, pose: 'fail' })
  expect(replayAt(st, 6500)).toEqual({ at: 2, pose: 'sleep' })
  expect(replayAt(st, 8000)).toEqual({ at: 0, pose: 'run' })
})

test('costMark grows like sleep\'s z: a single $ shifts a cell; s$ and sS$ stay put, appear one character per frame, and vanish for a frame', async () => {
  expect([0, 1].map(f => costMark(1, f))).toEqual([{ at: 2, text: '$' }, { at: 3, text: '$' }])
  expect([0, 1, 2, 3].map(f => costMark(2, f).text)).toEqual(['s', 's$', '', 's'])
  expect([0, 1, 2, 3, 4].map(f => costMark(3, f).text)).toEqual(['s', 'sS', 'sS$', '', 's'])
  expect(costMark(3, 1).at).toBe(2)
  expect(costMark(0, 5).text).toBe('')
})

test('sessions: parsePeers reads `claude agents --json` and ignores anything else; handoff notes and pull requests', async () => {
  const list = parsePeers(JSON.stringify([{ pid: 1, cwd: '/a', kind: 'interactive', sessionId: 's1', name: 'one', status: 'busy' }, { sessionId: 's2' }, { nope: 1 }]))
  expect(list).toEqual([{ sessionId: 's1', name: 'one', cwd: '/a', status: 'busy', kind: 'interactive', pid: 1 }, { sessionId: 's2', name: 's2', cwd: '', status: '', kind: '' }])
  expect(parsePeers('not json')).toEqual([])
  // cmux: an agent process under a shell under a surface counts once for that surface; claude and shells are not agents
  const tsv = ['x\tx\tx\tpane\tpane:1\tworkspace:3\t', 'x\tx\tx\tsurface\tsurface:7\tpane:1\tdocs', 'x\tx\tx\tprocess\t10\tsurface:7\tzsh', 'x\tx\tx\tprocess\t11\t10\topencode', 'x\tx\tx\tprocess\t12\t10\topencode', 'x\tx\tx\tprocess\t13\tsurface:7\tclaude'].join('\n')
  expect(parseAgents(tsv)).toEqual([{ sessionId: 'cmux:workspace:3:surface:7', name: 'docs', cwd: 'workspace:3 surface:7', status: '', kind: 'opencode', host: 'cmux' }])
  expect(cmuxTarget('cmux:workspace:3:surface:7')).toEqual({ ws: 'workspace:3', surface: 'surface:7' })
  expect(parseAgents('garbage')).toEqual([])
  // cmux's status tag for that workspace and agent gives its state: Idle is idle, anything else (Running) busy
  const tagged = (title: string) => parseAgents([tsv, `x\tx\tx\ttag\tworkspace:U1:tag:opencode\tworkspace:3\t${title}`, 'x\tx\tx\ttag\tworkspace:U1:tag:opencode.abc\tworkspace:3\t'].join('\n'))[0]!.status
  expect([tagged('Running'), tagged('Idle'), tagged('')]).toEqual(['busy', 'idle', ''])
  // The end of an agent's screen: a question it waits on, work in progress, or nothing to tell
  expect(screenState('Trust this folder? Codex can read, edit...\n› 1. Trust and continue\n  2. Quit\n  enter continue · esc quit\n\n')).toBe('input')
  expect(screenState('• Working (12s • esc to interrupt)\n› \n')).toBe('busy')
  expect(screenState('Worked for 3m 46s\n› Ask Codex to do anything\n')).toBeUndefined()
  // Where a session runs: the first app bundle up its process's ancestors, skipping the desktop app's Claude Code binary
  expect(appOf(['/Users/u/Library/Application Support/Claude/claude-code/2.1/x/claude.app/Contents/MacOS/claude', '/Applications/Claude.app/Contents/Helpers/disclaimer', '/Applications/Claude.app/Contents/MacOS/Claude'])).toBe('Claude')
  expect(appOf(['/opt/homebrew/bin/claude', '-/bin/zsh', '/usr/bin/login', '/Applications/cmux.app/Contents/MacOS/cmux'])).toBe('cmux')
  expect(appOf(['/opt/homebrew/bin/claude', '-/bin/zsh'])).toBeUndefined()
  expect([hostTag('Claude'), hostTag('Ghostty'), hostTag(undefined)]).toEqual(['desktop', 'Ghostty', ''])
  // Chrome tabs: a URL keeps any tab characters in it, and lines that aren't tabs are skipped
  const tl = parseTabs('1\t1\tfalse\t501\tInbox\thttps://mail.example.com/\nnoise\n2\t3\ttrue\t77\tPR #12 Fix parser\thttps://github.com/o/r/pull/12?a=1\tb\n', 'B', 'Brave Browser')
  // Keyed by the browser's tab id; window and tab kept for focusing and running
  expect(tl).toEqual([
    { id: 'B1', key: 'B:501', title: 'Inbox', url: 'https://mail.example.com/', active: false, app: 'Brave Browser', win: 1, index: 1 },
    { id: 'B2', key: 'B:77', title: 'PR #12 Fix parser', url: 'https://github.com/o/r/pull/12?a=1\tb', active: true, app: 'Brave Browser', win: 2, index: 3 },
  ])
  // Sticky numbers: a key keeps its number, a new key counts on in its own group, and a gone key's number is not reused
  const n1 = stick({}, ['C:9', 'C:4', 'B:1', 's:x'])
  expect(n1).toEqual({ 'C:9': 1, 'C:4': 2, 'B:1': 1, 's:x': 1 })
  expect(stick(n1, ['C:5', 'C:4'])).toEqual({ ...n1, 'C:5': 3 })
  expect(stick(n1, ['C:4'])).toBe(n1)
  // Handoff lines in the turn flow name the other session by its number
  const ps = [{ name: 'docs-1', num: 1 }, { name: 'api', num: 2 }]
  expect(handoffLabel({ action: 'send', to: 2 }, ps)).toEqual({ hand: 'send', label: '⇢ api #2' })
  expect(handoffLabel({ action: 'pull', from: 1 }, ps)).toEqual({ hand: 'pull', label: '⇠ docs-1 #1' })
  expect(handoffLabel({ action: 'pull', from: 1, to: 2 }, ps)).toEqual({ hand: 'pull', label: '⇠ docs-1 #1 ⇢ api #2' })
  expect(handoffLabel({ action: 'send', to: 9 }, ps)?.label).toBe('⇢ session #9')
  expect(handoffLabel({ action: 'list' }, ps)).toBeUndefined()
  // Found by number (case aside) or by words that all appear in the title or URL
  expect(findTabs(tl, 'b2').map(x => x.id)).toEqual(['B2'])
  expect(findTabs(tl, 'GitHub pull').map(x => x.id)).toEqual(['B2'])
  expect(findTabs(tl, 'example').map(x => x.id)).toEqual(['B1'])
  expect(findTabs(tl, 'https').map(x => x.id)).toEqual(['B1', 'B2'])
  expect(findTabs(tl, 'nothing here')).toEqual([])
  expect(parsePeers('{}')).toEqual([])
  const note = handoffNote({ name: 'one', sessionId: 's1', cwd: '/a', prompt: 'fix the build', files: ['a.ts'], messages: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: '' }, { role: 'assistant', text: 'done   now' }] })
  expect(note).toContain('"one" (s1) in /a')
  expect(note).toContain('"fix the build"')
  expect(note).toContain('a.ts')
  expect(note).toContain('- user: hi\n- assistant: done now')
  expect(note).toContain('claude --resume s1')
  expect(pullFrom(pullRequest('s9', 'nine'))).toBe('s9')
  expect(pullFrom('hello')).toBeUndefined()
})

test('lineDelta counts lines per tool, addDiff sums them per file path', async () => {
  expect(lineDelta('Edit', { old_string: 'a\nb', new_string: 'a\nb\nc\n' })).toEqual({ add: 3, del: 2 })
  expect(lineDelta('MultiEdit', { edits: [{ old_string: 'x', new_string: 'y\nz' }, { old_string: 'q', new_string: '' }] })).toEqual({ add: 2, del: 2 })
  expect(lineDelta('Write', { content: 'one\ntwo\n' })).toEqual({ add: 2, del: 0 })
  expect(lineDelta('Read', {})).toEqual({ add: 0, del: 0 })
  let t = addDiff(emptyTree(), '/a/x.ts', { add: 3, del: 1 })
  t = addDiff(addDiff(t, '/b/x.ts', { add: 2, del: 0 }), '/a/y.ts', { add: 0, del: 0 })
  expect(t.diff).toEqual({ '/a/x.ts': { add: 3, del: 1 }, '/b/x.ts': { add: 2, del: 0 } })
})

test('pickBrowsers keeps known letters, gives other browsers the first free letter of their name, and Safari reads its own way', async () => {
  const b = pickBrowsers([{ app: 'Opera', safari: false }, { app: 'Google Chrome', safari: false }, { app: 'Orion', safari: true }, { app: 'Safari', safari: true }])
  expect(b.map(x => `${x.letter}:${x.app}`)).toEqual(['C:Google Chrome', 'S:Safari', 'O:Opera', 'R:Orion'])
  expect(b[1]!.safari).toBe(true)
  expect(parseTabs('1\t2\ttrue\t1:2\tTitle\thttps://a.example/\n', 'S', 'Safari', true)[0]).toMatchObject({ app: 'Safari', safari: true, index: 2, active: true })
})

test('dotRows draws quadrant blocks for terminals without octant glyphs, and octantTerminal tells which', async () => {
  const pal = { R: '#f00' }
  const grid = ['R.', 'R.', '.R', '.R'] // left column on top, right column below
  expect(dotRows(grid, pal, true)[0]).toEqual([{ text: '▚', fg: '#f00' }])
  expect(dotRows(['RR', 'RR', '..', '..'], pal, true)[0]).toEqual([{ text: '▀', fg: '#f00' }])
  expect(octantTerminal({ TERM: 'xterm-256color' })).toBe(false)
  expect(octantTerminal({ TERM: 'xterm-ghostty' })).toBe(true)
  expect(octantTerminal({ TERM: 'tmux-256color', GHOSTTY_RESOURCES_DIR: '/x' })).toBe(true)
  expect(octantTerminal({ TERM_PROGRAM: 'WezTerm' })).toBe(true)
})

test('faceKeep: each eye and the nose are one quadrant, the nose below the eyes, and a crossed eye keeps the stroke in the working pose\'s row', async () => {
  const cat = faceKeep(sprite('work', 0, 'cat'))
  expect([...cat.quads].sort()).toEqual([['11,3', 'E'], ['12,4', 'D'], ['13,3', 'E']])
  const dog = faceKeep(sprite('work', 0, 'dog'))
  expect([...dog.quads].sort()).toEqual([['10,3', 'E'], ['11,4', 'D'], ['12,4', 'D'], ['13,3', 'E']])
  // a failed dog's eyes are crossed (strokes in rows 5 and 7): they still land in row 3 of quadrants, like at work
  expect([...faceKeep(sprite('fail', 0, 'dog'), sprite('work', 0, 'dog')).quads].filter(([, v]) => v === 'E').map(([k]) => k).sort()).toEqual(['10,3', '13,3'])
})

test('faceKeep layout: a dog\'s eyes and nose move to the cat\'s columns, awake and asleep', async () => {
  const layout = { eyes: [11, 13] as [number, number], nose: 12 }
  expect([...faceKeep(sprite('work', 0, 'dog'), sprite('work', 0, 'dog'), layout).quads].sort()).toEqual([['11,3', 'E'], ['12,4', 'D'], ['13,3', 'E']])
  expect([...faceKeep(sprite('sleep', 0, 'dog'), sprite('work', 0, 'dog'), layout).quads].map(([k]) => k).sort()).toEqual(['11,4', '12,5', '13,4'])
})

test('iconKind: a Nerd Font symbol where the terminal ships its own symbols, the arrow in a UTF-8 terminal, a letter otherwise, and the setting overrides', async () => {
  expect(iconKind('auto', { TERM: 'xterm-ghostty' })).toBe('nerd')
  expect(iconKind('auto', { TERM: 'xterm-256color', LANG: 'ko_KR.UTF-8' })).toBe('unicode')
  expect(iconKind('auto', { TERM: 'xterm-256color' })).toBe('unicode')
  expect(iconKind('auto', { TERM: 'linux', LANG: 'C' })).toBe('ascii')
  expect(iconKind('ascii', { TERM: 'xterm-ghostty' })).toBe('ascii')
  expect(REFRESH_ICON).toEqual({ nerd: '\uEB37', unicode: '↺', ascii: 'R' })
})
