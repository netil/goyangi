<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-dark.png">
    <img src="docs/images/logo-light.png" alt="Yaong" height="56">
  </picture>
</h1>

Yaong is a panel that sits next to your [Claude Code](https://claude.com/claude-code) conversation and shows, turn by turn, where the time and money went: every model request, tool call, and subagent, with tokens and cost, as it happens. Open it with `/yaong`. It opens on its own when a session starts.

<p align="center">
  <img src="docs/images/characters.gif" alt="The walk view's cat and dog: running, thinking, working, failing, and sleeping">
</p>

## The name

Yaong (야옹) is the sound a cat makes in Korean, a meow. A cat that lives beside your conversation and keeps an eye on every turn: that is the idea.

## Why Yaong

- **Turn by turn, not just agent by agent.** Each turn is split into its model request steps, and every step carries its tokens, cost, and share of the turn's time. The session map lines the turns up so you can compare them and replay any one
- **Nothing to run beside it.** No server, database, or browser tab: it is one plugin, drawn inside Claude Code next to the conversation. Minimize it to two rows above the prompt when you need the width back
- **It tells you what to do next.** Gauges forecast when the 5h and 7d usage limits will run out at the current pace, and rule-based advice flags repeated failures, cache hit drops, and files read again for nothing. Alerts fire on stalled tools and costly turns. All of it is computed locally and costs no tokens
- **Terminal and desktop app.** The same panel runs in the terminal and in the Claude Code desktop app, where it is drawn as SVG
- **A walk view you read at a glance.** Press `v` and a pixel cat or dog walks through the turn's steps. Its eyes grow tired as context fills, a `$` mark over its back grows to `s$` and `sS$` as the turn costs more, it walks into dusk and night as the 5h limit nears, and raises a `!` when there is advice. Pick a past turn in the session map to watch it replayed

## What's in the panel

- **Turn flow**: model request steps and the tool calls and subagents between them, in order, with a time share bar
- **Advisor**: gauges for context, cache hit rate, and usage limits (5h, 7d), plus the advice above
- **Session map**: one row per turn with its tool sequence, time, and cost. Click a turn to replay its flow
- **Open sessions**: the other Claude Code sessions open on this machine, and coding agents such as Codex or OpenCode running in cmux. Send this session's handoff to one, or pull its handoff here, by button or by number in the conversation
- **Browser tabs**: open tabs of Chrome, Brave, Edge, Arc, Vivaldi, Chromium, ego lite, Safari, Firefox, Whale, and any other installed browser that scripts its tabs, numbered so you can say "the GitHub PR tab" or "B3" and the model knows which one you mean
- **Session log**: switch between key events and the full event log
- **Walk view**: the turn flow as a side-scrolling scene with a pixel cat or dog whose mood carries the session's numbers

<p align="center">
  <img src="docs/images/panel.gif" alt="The whole panel while a subagent is spawned: the turn flow, then the walk view with the cat, then with the dog, and around again" width="560">
</p>

The whole panel while a subagent is spawned: the turn flow, then the walk view with the cat and with the dog, in turn. Minimized, it shrinks to two rows above the prompt:

<p align="center">
  <img src="docs/images/panel-minimized.gif" alt="The minimized panel: two rows above the prompt with the turn's steps and the running tool" width="700">
</p>

See the [manual](docs/MANUAL.md) for the layout, shortcuts, and advice rules.

## Install

```bash
claude plugin marketplace add netil/yaong
claude plugin install yaong@yaong --scope user
```

Run `/reload-plugins` in a session, then open the panel with `/yaong`. New versions install automatically when a session starts (turn this off in the settings screen). Settings are in the panel's settings screen (`=` in the header); see the [manual](docs/MANUAL.md#settings).

## Requirements

- Claude Code with mod (function hooks) support
- The walk view's pixel art uses octant characters (Unicode 16) in Ghostty, kitty, and WezTerm. Other terminals (Obsidian's terminal, iTerm2, Terminal.app, VS Code) get a coarser version drawn with quadrant blocks, so the layout holds

## Development

```bash
claude plugin validate .
claude plugin test .
```

Without `claude plugin test`, run the event-order regression test with Node.js 24 or later. It uses an in-memory adapter and doesn't replace the engine and UI integration tests.

```bash
node --test tests/lifecycle.test.mjs
```

To try local changes, load the folder directly with `claude --plugin-dir .` and run `/reload-plugins` after edits.

The test kit doesn't paint the panel, so layout breaks at narrow widths are checked separately. `tools/layout-check` renders the terminal panel with Ink (an approximation of the engine's renderer) at widths from 26 to 120 columns and reports rows wider than the panel and Box props the engine refuses. It exits 1 when it finds any.

```bash
cd tools/layout-check && npm install
node check.mjs              # default view; or pass widths: node check.mjs 26 40 60
VIEW=avatar node check.mjs  # walk view (also SETTINGS=1, MODE=band for the minimized view)
FRAMES=1 node check.mjs 30  # print the frames, to spot titles wrapping into columns
```

## License

[MIT](LICENSE)
