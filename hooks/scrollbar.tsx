import type { ClientModule } from 'claude-code'

// Vertical scrollbar for the session map and session log. Pressing or dragging the track or thumb moves the list to that position.
// The terminal draws it with │ (track) and ┃ (thumb) characters (glyphs); desktop paints a one-cell box, since its rows are taller than the glyphs.
// total is the list length, from the first visible row, rows the number of rows visible at once (= scrollbar height).
// While pressed, the thumb is painted in the held color, so you can see right away whether pointer events arrive.
// The cell under the pointer (hover or drag) shows a marker in the held color, so you can see where a click will land.
type Props = { list: string; total: number; from: number; rows: number; on: string; off: string; held: string; glyphs?: boolean }
type State = { held: boolean; at?: number }

const Scrollbar: ClientModule<Props, State> = (p, surface) => {
  const { Box, Text } = surface.elements
  const held = surface.state?.held ?? false
  const at = surface.state?.at
  const mark = (y: number | undefined, h = held) => surface.setState({ held: h, at: y === undefined ? undefined : Math.max(0, Math.min(p.rows - 1, y)) })
  const seek = (y: number) => {
    // Pick the first row so the pressed row lands in the middle of the thumb
    const from = Math.round(((y + 0.5) / p.rows) * p.total - p.rows / 2)
    surface.post({ list: p.list, from: Math.max(0, Math.min(p.total - p.rows, from)) })
  }
  surface.onPointer(ev => {
    if (ev.type === 'down' && ev.button === 'left') { mark(ev.y, true); seek(ev.y) }
    else if (ev.type === 'move' && ev.button === 'left' && held) { mark(ev.y); seek(ev.y) }
    else if (ev.type === 'move' && !ev.button) mark(ev.y)
    else if (ev.type === 'up' && held) mark(ev.y, false)
    else if (ev.type === 'leave' && !held) mark(undefined)
  })
  if (p.total <= p.rows) return <Box width={1} height={p.rows} />
  const len = Math.max(1, Math.round((p.rows / p.total) * p.rows))
  const pos = Math.round((Math.max(0, Math.min(p.from, p.total - p.rows)) / (p.total - p.rows)) * (p.rows - len))
  if (p.glyphs) {
    return (
      <Box width={1} height={p.rows} flexDirection="column">
        {Array.from({ length: p.rows }, (_, i) => {
          const on = i >= pos && i < pos + len
          if (i === at) return <Text key={`g${i}`} bold color={p.held}>◆</Text>
          return <Text key={`g${i}`} color={on ? (held ? p.held : p.on) : p.off}>{on ? '┃' : '│'}</Text>
        })}
      </Box>
    )
  }
  return (
    <Box width={1} height={p.rows} flexDirection="column" backgroundColor={p.off}>
      {pos > 0 && <Box key="gap" height={pos} />}
      <Box key="thumb" height={len} backgroundColor={held ? p.held : p.on} />
      {at !== undefined && <Box key="at" position="absolute" top={at} left={0} width={1} height={1} backgroundColor={p.held} />}
    </Box>
  )
}
export default Scrollbar
