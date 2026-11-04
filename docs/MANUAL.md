# Yaong manual

## Install

```bash
claude plugin marketplace add netil/yaong
claude plugin install yaong@yaong --scope user
```

Run `/reload-plugins` in a session, then open the panel with `/yaong`. New versions arrive through [auto update](#auto-update).

### Auto update

Yaong checks for a new version when a session starts and installs it if there is one. It is on by default.
When it installs a new version it shows a toast (`Yaong · Updated to v1.1.0 (from v1.0.0). Run /reload-plugins to apply`). The new version applies after `/reload-plugins` or a Claude Code restart.

- It checks at most once an hour: when a session starts, and when `/reload-plugins` loads Yaong anew (a reload that leaves the files unchanged doesn't check)
- It checks only when installed from the `yaong` marketplace. Local copies loaded with `--plugin-dir` or another marketplace are never checked
- Without network access it moves on silently

To turn it off, open the settings screen (`=` in the header) and set **Auto update** to `Off`. After that, update by hand with `claude plugin update yaong@yaong`.

## Opening and closing

| Action | How |
|---|---|
| Open the panel | Type `/yaong` (opens with every folded section expanded) |
| Open on session start | On by default. Toggle it in the settings screen |
| Settings screen | `=` in the header (`⚙` on desktop) |
| Switch view | `[Turn flow]` / `[Walk]` on the `View` row above the turn flow, or `v` |
| Move the panel | `v` (or `>` when at the bottom) in the header (`⇵` on desktop). Toggles between the right split and above the prompt |
| Minimize | `-` in the header (`−` on desktop), or `c`. Closes the panel and leaves a [two-row view](#minimized-view) above the prompt |
| Expand again | `[□]` in the minimized view |
| Close | `x` in the header (`✕` on desktop), or `x` |

Shortcuts work only while the panel has focus. Click the panel once to move focus to it.

In the terminal, when the panel is taller than its window, a scrollbar stays at the panel's right edge for the whole panel. The thumb shows where you are; press or drag the bar to jump there. The mouse wheel over the session map, session log, Open sessions, or Browser tabs scrolls that box, and anywhere else scrolls the panel. The desktop app draws its own scrollbar.

### Minimized view

Minimizing keeps two rows in a thin round border above the prompt, so the conversation uses the full terminal width.

```text
╭─ 🐱 Yaong ───────────────────────────────────────────────────────────────────────╮
│ T5 "fix the build" ▶─1─2─✻3 ■■⑂ ⑂ 1 running                         [=] [□] [x] │
│ ⚙ Bash npm run build                                 ⚠1  step 3 · tool 7  ⑂ 1/2 │
╰─────────────────────────────────────────────────────────────────────────────────╯
```

- Row 1 is a simplified walk: the turn number, the start of the prompt, and main's spots as a track. `▶` is the prompt, numbers are model request steps, and `■` is the answer. Steps are green when done and red on failure. The running step spins and lists its tools as colored blocks (same colors as the session map). Earlier spots that don't fit fold into `◂N`. Running subagents show as `⑂ N running`. The settings `[=]`, expand `[□]`, and close `[x]` buttons sit at the right end of this row; `[=]` opens the same settings screen as the panel's under the two rows, its items laid out in up to three columns on wide terminals to keep it short
- Row 2 shows what main is doing now on the left, and advice counts as tinted chips, steps and tools, and subagents (`⑂ running/total`) on the right
- With the walk view on, the pet joins the minimized view: walking while main works, red after a failure, asleep while idle. kitty, Ghostty, and the desktop app draw the walk view's own sprite in 2 cells at the start of row 1. Other terminals draw a smaller one-row version before the latest spot
- Both rows sit in one thin round border, like the prompt box, with `🐱 Yaong` on its top edge. The border stops 5 cells short of the right edge, where Claude Code draws its own `[-]`

## Layout

### 1. Header

- In the terminal, the header stays at the top of the panel while you scroll it
- The `🐱 Yaong` logo, then a session summary: turns, model requests (steps), tool calls (including subagents), and session cost. On narrow panels the header drops parts in steps so the buttons always fit: the summary is cut first, then the logo shrinks to just `🐱`, then only the status chip and buttons stay (right-aligned), and on the narrowest panels only the buttons
- Status chip (just left of the buttons): `○ idle`, `◐ thinking` (waiting on the model), `⚙ tool` (running a tool), `● live` (a subagent is running), `✗ idle` (the last turn failed)
- Buttons on the right, 3 cells each (icon with a space on either side), side by side: move `v` / `>` (where the panel will go), settings `=`, minimize `-`, close `x` (desktop: `⇵` `⚙` `−` `✕`). Hovering inverts that button's 3 cells; close is red and turns white on black
- Hover a button to see its name (`Move`, `Config`, `Minimize`, `Close`) on the row below

### 2. Main loop

One box for the main conversation loop. On panels 64 columns or wider it has two columns.

The left column has four rows:

- The model and effort, followed by the running tool's command while one runs (hover a long command for the whole of it). Thinking and waiting show only in the header's status chip
- Request count (steps), tool call count, input tokens (↑), cache tokens (⟳), and output tokens (↓)
- The context breakdown bar
- The request summary: tools per request, the share of request stop reasons (`stop`), and of tool kinds (`mix`). Hover it for the full text, which also lists the slowest tools

The right column lines the gauges up, one per row, with their labels padded to one width:

- `ctx`: context usage. Orange from 60%, red from 80%
- `cache`: cache hit rate (input read from cache / total input). Red under 50%
- `5h`, `7d`: usage limits. `→ 12m` is the time left until the limit at the current rate; `↻ 2h` is the time until the limit resets

On narrower panels the gauges follow the left rows, two to a row. Rows too long for the box end with `…`; hover them for the full text.

#### Continue in a fresh session

When context passes the alert threshold (Context alert in the settings, 80% by default), a row appears above the server tools: `⟳ ctx 85% · Continue in a fresh session`. One click carries the work into a new session in this same window, with no compaction:

1. The model writes a handoff note to a file in the temp folder: the goal, what is done, decisions and why, the files involved, what is left and the next step. At 95% or more, Yaong writes the note itself instead of spending a model turn
2. When that turn ends, `/clear` starts a new session here. The old session stays as it was; `claude --resume <id>` opens it again
3. The new session's first prompt points at the note and the old session, and the work carries on

The Fresh session setting picks how it starts: `Ask (one click)` shows the row (the default), `Auto` starts it by itself at the end of the turn that passes the threshold, and `Off` turns it off.

### 3. Server tools

The main loop box's last row lists the server tools called this session (advisor, web search, and others), each with its call count and average time, or `no server tools`. It keeps its own row whatever the session, since some sessions call many. Shortcut `a` folds the list.

### 4. Turn flow

How this turn unfolded, in order (shortcut `f`).

- `View` row: switches between the turn flow and the [walk view](#walk-view) (`v`)
- Top row: the start of the prompt, turn time, and turn cost
- Advice rows: shown only when there is a `⚠ Warn` or `💡 Tip`. All are expanded by default; `less ▴` keeps only the first. Hover to see the evidence
- Edited files (✎) and the number of files read
- Time share bar: how the turn's time split between model, tool, subagent, and wait
- Step boxes: one box per model request, five rows: title, time and share, new input (↑) and output (↓) tokens, cache tokens (⟳), and cost. The arrows between boxes sit on the middle row. An in-flight request spins with the same glyphs as Claude Code's spinner (`✻ step 5`) and turns into `◆` when done. Branches below a box are the tools and subagents that request called. Above them, the first line the model wrote in that request; when no shown request wrote one, that row is left out
- Branches start expanded. Columns with more than 3 branches can fold with `└ less ▴` to keep only running and recent ones; `+N earlier ▾` expands them again
- Branch marks: `◐` running, `⏳` possibly stalled, `✓` success, `✗` failure, `∥` ran in parallel, `⚠×2` the same call failed repeatedly
- With many steps, earlier ones fold into a narrow `Prv` box showing how many are hidden (`p: 4` in the terminal), and later ones into `Nxt`. `p` and `n` move back and forth

### Walk view

Press `[Walk]` on the `View` row, or `v`, to replace the turn flow and subagent area with a side-scrolling game scene. `[Turn flow]` switches back. The chosen view persists to the next session.

- **Path**: main and subagents (up to 3; the rest show as `+N more working`) each get a work path. Spots match the turn flow's steps (prompt, model requests, answer), and the tools a step called hang below its spot. A subagent's path goes door, work spot, coffee cup
- **Character**: a blocky pixel pet: a calico cat (default) or a dog, picked under Character in the settings screen. It faces right with its head turned to the front. main is sky blue; subagents use their name color. It runs right to the next spot during a model request (legs trotting, tail wagging), works in place while a tool runs, and lies down to sleep with floating `z`s when the turn ends, its tail tip rising and falling. On failure it turns red and an X covers its eyes
- **Spots**: finished spots get a flag with the step number (red on failure) and their prop turns gray. The row under a spot name shows new input (`↑`), output (`↓`), and cost
- **Scoreboard**: `HI 00042 00007` at the top right is the tool call count for the session and for this turn
- **Card and `just now` row**: while a tool runs, a card shows the full command and elapsed time, like the turn flow. The `just now` row below the walk is the latest session log event
- **Subagents coming back**: for 2 seconds after a subagent finishes, its box shows it running with `↩ main`, then it rests
- **Replay**: click a past turn in the session map and main walks through that turn again, one spot every 2 seconds (running, then thinking, working, or failing as the turn did), rests at the end, and starts over. Spots ahead of it have no flag yet. Subagent boxes are hidden, since past turns keep no subagent records. `T5 replay · latest ▸` at the right of the title returns to the live turn

#### The pet's mood

main's pet carries the session's numbers, so you can read them at a glance without looking at the gauges. The thresholds follow the alert settings; an alert set to 0 turns its part off.

| Number | Pet | When |
|---|---|---|
| Context usage | Tired eyes: narrowed, with purple dark circles | From 3/4 of the context alert (60% at the default 80%) |
| | Every motion at half pace | From the context alert |
| | Shakes it off with sparkles | For 3 seconds after a compaction |
| Turn cost | A mark floating over the back that grows like sleep's `z` to `Z`: `$`, `s$`, `sS$`. A single `$` shifts a cell every frame; the longer marks appear one character at a time (`s`, `sS`, `sS$`), vanish for a moment, and start over. The turn's total (`$1.10 this turn`) shows next to main's status | 15%, 50%, and 100% of the turn cost alert ($0.30, $1, $2 at the default $2). Past the alert the mark and the total turn red and bold. With the alert off, `$` and `s$` at $0.30 and $1 |
| 5h usage limit | The sky row turns to dusk with a setting sun, then to night with a moon and stars | Dusk from 60%, night from 90%. Without rate limits (API key sessions) it stays day |
| Advice | A `!` (warning) or `?` (tip) bubble right of the head, every other frame | While the turn has advice |

A replay keeps only the cost mark and total, from that turn's cost.

Each spot's prop shows what kind of work happened there.

| Status | Prop |
|---|---|
| Thinking (model request) | Thought bubble |
| Running a command (Bash) | Terminal |
| Editing code (Edit, Write), skills, other tools | Code editor |
| Reading (Read) | Bookshelf |
| Searching (Grep, Glob) | Magnifier |
| Browsing the web (WebFetch, WebSearch) | Globe |
| Calling MCP | Server rack |
| Delegating (Agent), prompt (entry) | Door |
| Answer, waiting, done, something went wrong | Coffee cup |

The pixels are drawn with octant characters (Unicode 16) in Ghostty, kitty, and WezTerm. Other terminals (Obsidian's terminal, iTerm2, Terminal.app, VS Code) don't have those glyphs, which breaks the layout, so Yaong draws the same art with quadrant blocks there (▘▀▙). A quadrant covers two pixel rows, so one-pixel details such as the eyes blur. Yaong decides from the terminal's environment variables (`TERM`, `TERM_PROGRAM`, `KITTY_WINDOW_ID`, `GHOSTTY_RESOURCES_DIR`, `WEZTERM_EXECUTABLE`) when a session starts. kitty and Ghostty draw real pixel images.

The desktop app draws the whole scene (characters, props, ground, flags, and the calls, thinking dots, and z's) as one SVG. Subagents take their name color for the body and patches; orange, yellow, eyes, paws, and tongue stay the same.

![The walk view in the desktop app: working, thinking, and sleeping for the cat and dog, and subagents in their name colors](images/desktop-walk.png)

### 5. Subagents

One box per running subagent (shortcut `s`). Each box shows the type, status, recent tools as colored blocks, tool count, its share of session tokens (`tok N%`), and elapsed time. Click a name to filter the turn flow and session log to that agent. Finished agents leave the boxes and are counted in `back to main · N returned`.

### 6. Open sessions

On panels about 80 columns or wider, Open sessions and [Browser tabs](#7-browser-tabs) sit side by side, half the width each and at the same height, and the row buttons shrink to arrows: `↑` send (this session's handoff goes up to that one), `↓` pull (theirs comes down here), `↗` focus. Each box ends with a legend row for its marks and, side by side, its arrows (`↑ send · ↓ pull · ● busy · ○ idle · ◉ this session`). A busy session's ● blinks while it works. Narrower, Browser tabs goes below and the buttons are spelled out.

The other Claude Code sessions open on this machine, terminal and background alike (what `claude agents --json` lists), refreshed every 30 seconds and with the refresh icon (see [Refresh icon](#refresh-icon)). Each row tells which AI tool it is and where it runs. A Claude session row starts with the Claude app's icon on the desktop app and on terminals that draw pixels (kitty, Ghostty), and with an orange `✳` on other terminals; a coding agent's row starts with its tool's favicon on the same terminals (Codex: the OpenAI mark, shipped as `icons/agents/codex.png`; another agent gets one when its `icons/agents/<name>.png` is added) and names the agent (`codex`). After the name comes where it runs: `desktop` for the Claude desktop app, or the terminal or editor app it was started from (`cmux`, `Ghostty`, `iTerm2`, `Code`), found by walking up the session's processes once. This session comes first, unnumbered, marked `◉` and `this session` in the main color. Each other row shows its number, state (`●` busy, `○` idle), name, and folder, with two buttons. A coding agent's state comes from cmux's status tag for it (`Running` is busy, `Idle` idle); when its screen ends on a question it waits on (trusting a folder, approving a command, y/n) the row shows a red `!`, and a screen showing work in progress (`esc to interrupt`) counts as busy. The screen wins over cmux's status, which can stay `Idle` while codex works. A session gets a number the first time this session sees it and keeps it until this session ends (or `/clear`), while others open and close; a closed session's number is not handed out again. So "session 2" said earlier still means the same session.

- `→ send` passes this session's handoff to that session, where it arrives as a message from a peer session. The note holds this session's name and id, its folder, the current request, the files edited this turn, the last six user and assistant messages, and the `claude --resume <id>` command that opens the whole conversation
- `← pull` asks that session for its handoff, which arrives here as a message. A session running Yaong answers by itself, without a model turn; any other session reads the request as plain words and can answer with SendMessage

When a handoff arrives, a session running Yaong shows a toast naming the sender (`Yaong · Received a handoff from docs-1`). If a send is refused, for example by auto mode's review, the toast gives the reason (`Yaong · Not sent: ...`) instead of claiming success. To get past the review, add `SendMessage` to `permissions.allow` in settings.json, or send from the default permission mode, where each send asks for approval.

In the conversation, point at a session by its number: "send this to session 2", "pull from 1", "1번 세션의 핸드오프를 2번으로 보내줘". Yaong gives the model a `sessions` tool (`mcp__yaong__sessions`) that works by the same numbers. `send` passes this session's handoff to `to`, `pull` asks `from` for its handoff, which comes here or, with `to`, goes to that session, and `list` prints the numbered list. In the turn flow such a call is drawn as a handoff branch instead of a tool: `⇢ api #2` for a send, `⇠ docs-1 #1` for a pull (`⇠ docs-1 #1 ⇢ api #2` when it goes on to another session), in purple, followed by `sent` or `not sent`. A pull whose handoff comes back here shows `waiting` until the note arrives, then `↩ T5`, the turn it arrived as (the note names the session it came from, which is how the two are matched); a send expects no answer and a pull passed on with `to` answers elsewhere, so neither waits; the session log shows the same line and the session map marks it `⇄`. A turn that starts from another session's handoff shows `⇠ docs-1` on its prompt node. Sends from the `→ send` and `← pull` buttons happen outside a turn, so they show only as a toast.

Other coding agents are listed too, after the Claude sessions, when they run in a cmux terminal: Codex, OpenCode, Aider, Gemini, cursor-agent, Amp, Goose, Qwen, and Crush, found by process name (`cmux top`). Their rows show the agent's name and the terminal's title. They can't take a message the way a Claude session does, so the two buttons work through the terminal.

- `→ send` writes the handoff note to a file in the temp folder and types one line into the agent's prompt, `Read the handoff note at <file> and continue from it.`, followed by Enter
- `← pull` reads the last 200 lines of the agent's terminal (`cmux read-screen`) and submits them here as a prompt. Through the `sessions` tool they come back as the tool's result. With a Claude session as `to`, the screen is passed on to that session

An agent running as plain `node` (some Gemini installs) is not recognized. A pull from a Claude session can't be answered into a coding agent; pull it here first, then send.

Four sessions are shown at a time (Open sessions rows in the settings, 1 to 10). Past that a scrollbar appears on the right; scroll with the mouse wheel over the box or press and drag the scrollbar, as in the session map. To move this session itself into the Claude desktop app, type `/desktop` (Claude Code's own command).

### 7. Browser tabs

Open tabs of the running browsers, every window and profile: Chrome, Brave, Edge, Arc, Vivaldi, Chromium, ego lite, Safari, Firefox, and Whale, plus any other installed browser whose scripting dictionary has tabs (Yaong finds them by reading the apps' `.sdef` files, so a new browser needs no change). Firefox has no tab scripting, so its tabs come from the session file it rewrites about every 15 seconds: they can be listed and read, and brought to the front by keys, but JavaScript can't run in them. The others are read through AppleScript when the session starts and with the refresh icon (see [Refresh icon](#refresh-icon)), never on a timer, and a browser that isn't running is never started. The title counts the open tabs (`BROWSER TABS · 10`). Where rows start with the browser's app icon, that tells the browser; on a terminal that can't draw images the title also lists the count per browser (`BROWSER TABS · C Chrome 1 · B Brave 9`) when that fits whole, and the colored letter of each row is the only cue otherwise.

Each row starts with its browser's app icon (desktop app, kitty, Ghostty), converted once per session from the app's own icon file; on other terminals the browser letter in its brand color marks it. Then the tab's number: the browser letter (`C` Chrome, `B` Brave, `E` Edge, `A` Arc, `V` Vivaldi, `M` Chromium, `G` ego lite, `S` Safari, `F` Firefox, `W` Whale; any other browser takes the first free letter of its name) and a number (`B1`, `B2`, ...). A tab gets its number the first time Yaong reads it, in the browser's window and tab order, and keeps it until this session ends (or `/clear`), while tabs open, close, or move between windows; a closed tab's number is not reused. So "C2 작업해줘" keeps meaning that tab for the rest of the conversation. Then `●` for a window's active tab, the title, and the site. Four rows are shown at a time (Browser tabs rows in the settings, 1 to 10), and past that the box scrolls like Open sessions. `↗ focus` brings that tab to the front of its browser.

Claude in Chrome works only in its own tab group, so it can't see the tabs you opened. This box fills that gap. Say what the tab is, "깃헙 PR 탭 내용 알려줘" or "summarize the docs tab", or its number, "B3 작업해줘". The model uses the `browser_tabs` tool (`mcp__yaong__browser_tabs`), which finds a tab by its number or by words from its title or site; when several match, the model picks one or asks you. `list` prints every tab, `read` gives the title and URL, `run` runs JavaScript in that very tab (reading its text, clicking, filling fields) with your sign-ins and without opening another tab, and `focus` switches your browser to that tab, used only when you ask for it. The first read may ask macOS to let the terminal control each browser. `run` needs View > Developer > Allow JavaScript from Apple Events turned on in that browser; until then the browser refuses and the model asks you to turn it on. Its result is the script's last value, synchronous only, cut at 20,000 characters. Safari is not read; its scripting works differently.

### 8. Session map

One row per turn (shortcut `m`).

- Braille graph next to the title: the time or cost trend over the last 32 turns. Each braille cell holds two turns; the rightmost is the latest
- Legend: colors per tool kind. Bash, Read, Edit, Search, Web, MCP, Skill, Agent, other, repeat fail, compact
- Each row: turn number and time, the start of the prompt, the tool sequence (runs of the same tool collapse to `■×12`), tool count, result (✎ edits, ✗ failures), time, weight bar, cost, and outcome
- `⚖ time` / `⚖ cost` switches the weight bar basis. The default height is 4 rows; `⇕ 4 rows` splits the panel's leftover rows with the session log
- Click a turn number to replay that turn's archive in the turn flow. The last 10 turns can be replayed
- On narrow panels each row keeps only the turn number and time, the tool sequence, the duration, and the status mark, without column headers; the title row's controls wrap to the next row
- `u` and `d` scroll. The `┃` bar on the right shows the current position; click or drag the bar to jump there. Hovering the bar marks the cell under the pointer with an orange `◆`

### 9. Session log

One row per event (shortcut `l`).

- Shows every event by default. It takes the panel's leftover rows, at least 4
- `◉ all · ○ key` switches to key events only: prompts, subagents, answers, compaction, server tools, failures, and cache drops
- `k` and `j` scroll; scrolling shows `⏸ paused`. Click or drag the `┃` bar on the right to jump to a position. Scroll or click to the end to return to `● live` and follow new events
- Hover a cut row to see its full text

### 10. Footer

Three rows, each with a name on the left: `Sections` has the fold and expand buttons for each section, `Panel` has minimize, switch view, and close buttons, and `Keys` has the navigation shortcut hints. The plugin version is beside the settings screen's title (for example `⚙ Settings  Yaong v1.0.0`). When a row is too long, its items wrap one by one and line up after the name.

## Shortcuts

| Key | Action |
|---|---|
| `a` `f` `s` `m` `l` | Fold and expand advisor, turn flow, subagents, session map, session log |
| `p` `n` | Previous and next step in the turn flow and walk view |
| `u` `d` | Scroll the session map |
| `k` `j` | Scroll the session log |
| `v` | Switch view (turn flow, walk) |
| `c` | Minimize the panel |
| `x` | Close the panel |

## Narrow screens

Under 64 columns, the main loop box puts its gauges below its other rows instead of in a column on the right. Every other section still shows; fold sections from their titles to shorten a long panel.

## Advice and alerts

Advice is computed only from this turn's records. It never calls a model, so it costs nothing.

### In the panel

Advice shows on the row right below the turn flow or walk view title.

- `⚠ Warn` is a problem to check now; `💡 Tip` is waste worth cutting. Warnings come first
- Normally only the most important row shows, followed by the count of the rest (`+1 ▾`). Click it to expand all (`less ▴` folds them back)
- Hover an advice row to see the evidence and what to do
- At 80% context or more, a red `⚠ ctx 82%` chip appears after the header summary
- When the panel is minimized, only the counts remain in the minimized view, for example `⚠1 💡1`

### Advice rules

| Advice | Condition | Example |
|---|---|---|
| Context warning | Context usage 70% or more | `⚠ Warn Context 72% used` |
| Repeated failure | The same call failed 2 or more times in a turn | `⚠ Warn Same call failed 2 times: Bash ls /missing-dir` |
| Cache hit rate drop | The hit rate dropped sharply although the previous request was within the cache lifetime (5 min) | `⚠ Warn Cache hit rate 96% → 12% (request 14:05)` |
| Usage limit approaching | 50% or more used, and the limit is reached within 30 minutes at the current rate | `⚠ Warn 5h usage limit 72% · reached in 18m0s at this rate` |
| Usage limit 90% or more | 90% or more used, even with no forecast or more than 30 minutes left | `⚠ Warn 5h usage limit 96% used` |
| Same range read again | The same range of the same file was read 3 or more times with no edits in between | `💡 Tip state.ts: same range read 3 times without edits` |

Hovering shows evidence like this:

```text
Context warning
  The engine reports 72% context usage. If the topic changed, consider /clear; to keep going on the same work, consider /compact.

Repeated failure
  Bash ls /missing-dir failed 2 times this turn. Rather than retrying the same approach, ask Claude to find the cause of the failure first.

Cache hit rate drop
  Only 40s after the previous request, so this is unlikely to be cache expiry (5 min). 85k new input tokens were processed without cache.
  Likely cause: the start of the prompt (CLAUDE.md, system instructions) or the connected tool list changed during the session.

Usage limit approaching
  This forecast assumes the average rate since the window started continues. It changes if your pace changes.

Same range read again
  state.ts had the same range read 3 times this turn with no edits. Each re-read adds input tokens.
  Ask Claude to reuse what it already read, or read only the range it needs.
```

Numbers and names are examples; real values come from the turn's records.

### Toast alerts

In these situations Yaong shows a toast in Claude Code. Each situation alerts only once; the context alert re-arms once usage drops below the threshold. Change thresholds in [settings](#settings).

| Situation | Example |
|---|---|
| Context passes the alert threshold (default 80%) | `Yaong · Context 82% used (threshold 80%)` |
| A turn costs more than the threshold (default $2) | `Yaong · This turn cost ≈$2.40 (threshold $2)` |
| A tool runs longer than the stall threshold (default 120s) | `Yaong · Possibly stalled: Bash npm test (running 2m5s)` |
| A subagent has no events for the stall threshold | `Yaong · Possibly stalled: subagent general-purpose (no events for 2m10s)` |
| The same call keeps failing | `Yaong · Same call failed again: Bash ls /missing-dir` |
| Cache hit rate drop | `Yaong · Cache hit rate 96% → 12% (request 14:05)` |
| Usage limit approaching | `Yaong · 5h usage limit 72% · reached in 18m0s at this rate` |
| Usage limit 90% or more | `Yaong · 5h usage limit 96% used` |

## Settings

Press `=` in the header (`⚙` on desktop) to open the settings screen right under the header; press it again to close. In the terminal it opens as an overlay at the top of the visible panel, so it shows wherever the panel is scrolled and nothing under it moves.
Changes apply immediately and persist to the next session. `Reset to defaults` clears your changes and returns to the plugin settings.

| Item | How to change | Default |
|---|---|---|
| Open on session start | Click `On` / `Off` | On |
| Auto update | Click `On` / `Off`. See [auto update](#auto-update) | On |
| Panel position | Click to toggle `Right` / `Bottom (above prompt)` | Right |
| Context alert | `−` / `+` in steps of 10% | 80% |
| Turn cost alert | `−` / `+` in steps of $1 | $2 |
| Stall threshold | `−` / `+` in steps of 30s | 120s |
| Fresh session | Click to cycle `Ask (one click)` / `Auto` / `Off` | Ask |
| Refresh icon | Click to cycle `Auto` / `Nerd Font` / `Unicode ↺` / `ASCII R` | Auto |
| Open sessions rows | `−` / `+`, 1 to 10 | 4 |
| Browser tabs rows | `−` / `+`, 1 to 10 | 4 |

0 turns that alert off. Since an auto-opened panel isn't opened by a person, Claude Code waits until the terminal is at least 110 columns wide before drawing it.
Initial values come from the plugin settings (`/plugin configure yaong@yaong`). Values changed in the settings screen take precedence.

### Plugin options

The initial values of some settings come from the plugin's own options, set with `/plugin configure yaong@yaong`. A value changed in the settings screen takes precedence. 0 turns an alert off.

| Option | Default | Description |
|---|---|---|
| `autoOpen` | on | Open the panel when a session starts |
| `ctxAlertPercent` | 80 | Context usage alert threshold (%) |
| `turnCostAlertUsd` | 2 | Per-turn cost alert threshold ($) |
| `stallSeconds` | 120 | Seconds without events before a tool or subagent counts as stalled |
| `sessionRows` | 4 | Rows the Open sessions box shows before it scrolls (1 to 10) |
| `tabRows` | 4 | Rows the Browser tabs box shows before it scrolls (1 to 10) |

Auto update, panel position, character, fresh session, and refresh icon are only in the settings screen.

### Refresh icon

The refresh buttons of Open sessions and Browser tabs, and the reset time on the usage gauges, use one icon, chosen by what the terminal can draw. A program can't ask a terminal which fonts it has, so `Auto` decides by the terminal: a Nerd Font symbol in Ghostty, kitty, and WezTerm (they ship their own symbol font), the arrow `↺` in any other UTF-8 terminal, and the letter `R` where the locale isn't UTF-8. Set `Nerd Font`, `Unicode ↺`, or `ASCII R` yourself when a terminal's font disagrees, for instance Obsidian's terminal with a Nerd Font installed, or a font that draws `↺` oversized.

### Panel position

`v` / `>` in the header (`⇵` on desktop), or the panel position row in settings, toggles between right and bottom. The chosen position persists to the next session.
At the bottom, Yaong closes the right split (Pane) and draws the same screen in the area above the prompt.
Claude Code doesn't let plugins choose the Pane position, and with several Panes open it shows one and keeps the rest as tabs.
The bottom position doesn't use a Pane, so Yaong stays visible while another mod's panel is open on the right.
This area uses at most half the terminal height and scrolls past that. Shortcuts work while the area is selected (click it, or `ctrl+x tab`).

## Good to know

- Cost is the increase in the session's running cost between requests. A request that overlapped other requests leaves its step cost empty and adds only to the turn total
- The panel shows this session's records. Only the session map's today and 7-day totals combine records across sessions
- Subagent stalls are judged only when events stop between requests and tools. Receiving a long response doesn't count as a stall
- Records are capped: 80 session log rows, 40 session map turns, 10 archived turn flows
