import type { ElementConstructor, TextProps } from 'claude-code'
import type { Tree } from '../types'
import { headState, miniTrack } from './state'
import { C, M, MARK } from './theme'

// Status chip shared by the panel header and the minimized view: idle is dim text with no chip; the rest are bold on a background color per status.
// Text is the surface's element (from $.ui.resolve); idleColor is the idle text color where the background needs one (the header's inverted band).
export const STATE_CHIP = { tool: ['claude', '⚙ tool'], thinking: ['suggestion', '◐ thinking'], live: ['success', '● live'], failed: ['error', '✗ idle'] } as const
export const stateChip = (Text: ElementConstructor<TextProps>, hs: ReturnType<typeof headState>, idleColor?: string) => {
  if (hs === 'idle') return <Text color={idleColor} dimColor wrap="truncate">○ idle</Text>
  const [bg, label] = STATE_CHIP[hs]
  return <Text bold color="inverseText" backgroundColor={bg} wrap="truncate"> {label} </Text>
}

// Step track shared by the minimized view's row 1 and the compact view: ◂N for the spots dropped from the front, then the tokens joined by ─,
// the running one with the spinner and its tools' marks. pet is drawn right before the latest token (the minimized view's octant pet).
export const trackParts = (Text: ElementConstructor<TextProps>, track: ReturnType<typeof miniTrack>, spin: string, pet: JSX.Element | null = null) => {
  const tokColor = (st: string) => (st === 'run' ? C.tool : st === 'fail' ? C.fail : C.main)
  return [
    ...(track.hidden > 0 ? [<Text key="mt-hidden" dimColor>◂{track.hidden}</Text>] : []),
    ...track.toks.map((k, i) => (
      <Text key={`mt-${i}`}>
        <Text dimColor>{i || track.hidden ? '─' : ' '}</Text>
        {i === track.toks.length - 1 && pet}
        <Text bold={k.state === 'run'} color={k.kind === 'step' || k.state !== 'ok' ? tokColor(k.state) : C.dim}>{k.state === 'run' ? spin : ''}{k.text}</Text>
        {k.tools && <Text> {[...k.tools].map((c, j) => <Text key={`mtt-${j}`} color={MARK[c]?.c ?? C.dim}>{MARK[c]?.g ?? '■'}</Text>)}</Text>}
      </Text>
    )),
  ]
}
// Counts shared by the minimized view's row 2 and the compact view: main's steps and tools, then running / total subagents.
export const loopCounts = (Text: ElementConstructor<TextProps>, t: Tree, live: number) => [
  <Text key="lc-steps"><Text bold color={M.steps}>step {t.main.steps}</Text><Text dimColor> · </Text><Text bold color={M.tools}>tool {t.main.tools}</Text></Text>,
  <Text key="lc-agents" bold color={live ? C.agent : C.dim}>⑂ {live}/{t.agents.length}</Text>,
]
