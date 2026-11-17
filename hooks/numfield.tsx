import type { ClientModule } from 'claude-code'

// A settings number the person can type into, drawn at the size of the value. At rest it is the bold value. A click gives it the focus and the
// value turns into an edit on a pale background (edit) with a cursor, the value shown selected: the first digit replaces it, then digits add and Backspace removes.
// Enter posts { setting, value } (ui.message, register.tsx saves it clamped); Tab or another click drops the edit.
// Escape returns the focus without reaching the module: it posts { editing } as an edit starts and ends, and the plugin raises drop when a later
// ui.focus comes (Escape), which ends an edit started under another drop.
type Props = { setting: string; text: string; value: string; edit: string; cursor: string; drop: number }
type State = { buf?: string; fresh?: boolean; drop?: number }
const MAX_LEN = 5

const NumField: ClientModule<Props, State> = (p, surface) => {
  const { Box, Text } = surface.elements
  const st = surface.state
  const buf = st?.buf !== undefined && st.drop === p.drop ? st.buf : undefined
  const fresh = st?.fresh ?? false
  const stop = () => { surface.setState({}); surface.post({ editing: false }) }
  surface.onPointer(ev => {
    if (ev.type !== 'down' || ev.button !== 'left') return
    if (buf !== undefined) return stop()
    surface.setState({ buf: p.value, fresh: true, drop: p.drop })
    surface.post({ editing: true })
  })
  surface.onKey(ev => {
    if (buf === undefined || ev.ctrl || ev.meta) return
    if (ev.key === 'return') { surface.post({ setting: p.setting, value: buf }); surface.setState({}) }
    else if (ev.key === 'tab') stop()
    else if (ev.key === 'backspace' || ev.key === 'delete') surface.setState({ ...st, buf: fresh ? '' : buf.slice(0, -1), fresh: false })
    else if (/^[0-9.]$/.test(ev.key)) surface.setState({ ...st, buf: ((fresh ? '' : buf) + ev.key).slice(0, MAX_LEN), fresh: false })
  })
  if (buf === undefined) return <Text bold>{p.text}</Text>
  return (
    <Box backgroundColor={p.edit}>
      {/* Right after the click the value is shown selected (white on the accent color), like a text selection: the first digit replaces it */}
      {fresh ? <Text bold color="#ffffff" backgroundColor={p.cursor}>{buf}</Text> : <Text bold>{buf}</Text>}
      <Text color={p.cursor}>▏</Text>
    </Box>
  )
}
export default NumField
