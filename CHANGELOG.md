# Changelog

## v1.0.0 (2026-11-04)

First public release.

- Turn flow: model request step boxes, tool and subagent branches, time share bar, and spinning progress glyphs for in-flight steps
- Advisor: gauges for context, cache, and usage limits (5h, 7d), request stats, and five rule-based advice checks with no extra cost
- Subagents: boxes for running agents with recent tools, token share, and resumed agent handling
- Session map: per-turn tool sequence, column headers, braille trend graph, scrollbar, and past turn replay
- Session log: key events and the full log, scrolling in every view, positions pinned by absolute sequence
- Mission view: a side-scrolling pixel scene of the turn, drawn as pixels on kitty and Ghostty and as SVG on desktop
- Settings screen, panel position (right split or above the prompt), minimize to one row, and auto update
- Claude desktop app support
- Header logo: the walk view's cat face (`icons/yaong.png`, the main cat's head in its light blue, with the orange patch and dark eyes) replaces the 🐱 emoji; terminals that can't draw images keep the emoji; the minimized view's title draws the same logo
- Top box: the tool mix moves to the server tools row, the running tool's command no longer shows after the model (the turn flow shows it), and durations past an hour read `4h45m` or `6d4h` (usage limit resets no longer cut off as `↻8885m…`)
- Coding agent rows in Open sessions show busy (●) and idle (○) from cmux's status tag for that agent (Running, Idle), instead of always idle, and `!` when the agent's screen shows it waiting on a question (folder trust, a command to approve, y/n); a screen showing work in progress (`esc to interrupt`) counts as busy, over cmux's status, which can stay Idle while codex works
- A busy session's ● in Open sessions blinks while it works, even when this session is idle
- Continue in a fresh session: past the context alert, one click (or Auto in the settings) has the model write a handoff note, runs /clear in the same window, and starts the new session from the note, with no compaction
- Open sessions box above the session map: the other open Claude Code sessions, with `→ send` (this session's handoff goes there) and `← pull` (ask for theirs; a session running Yaong answers without a model turn)
- Numbered sessions and a `sessions` tool, so the conversation can point at one ("send this to session 2", "pull from 1 into 2"); a received handoff shows a toast, and a refused send shows its reason
- Open sessions also lists other coding agents running in cmux terminals (Codex, OpenCode, Aider, and others): send types a line pointing at a handoff file, pull brings their last 200 terminal lines here
- Browser tabs box under Open sessions: open tabs of Chrome, Brave, Edge, Arc, Vivaldi, and Chromium in every window, numbered by browser letter and place (`B1`, `B2`), with a `browser_tabs` tool that finds a tab by number or by words from its title or site ("the GitHub PR tab")
- `browser_tabs` `run` action: runs JavaScript in the tab you named (read its text, click, fill fields) instead of reopening its URL in another browser tool, which asked which browser to use and lost the tab's state; needs Allow JavaScript from Apple Events in the browser
- Coding agent rows in Open sessions start with their tool's favicon like Claude rows start with the Claude icon (codex ships with the OpenAI mark; add others as icons/agents/<name>.png)
- Handoffs in the turn flow: a sessions tool send or pull is drawn as `⇢ api #2` / `⇠ docs-1 #1` with `sent` or `not sent`, marked `⇄` on the session map, and a turn started by a handoff shows `⇠ docs-1` on its prompt node; a pull shows `waiting` until its handoff arrives, then `↩ T5` for the turn it arrived as; Yaong's own tools are now recorded in the turn flow like other tools
- Whole-panel scrollbar in the terminal: when the panel is taller than its window, a bar at the right edge (the same bar as the lists') shows the position, and pressing or dragging it scrolls the panel there
- Tab and session numbers stay put: a tab (by the browser's tab id) or session keeps the number it first got for the rest of the session, and a closed one's number isn't reused, so "C2" or "session 2" said earlier still points at the same one after others open, close, or move
- Open sessions shows this session first as a `◉ this session` row
- Open sessions and Browser tabs rows start with the app's icon (Claude, each browser) on the desktop app, kitty, and Ghostty, and with a text mark on other terminals
- Open sessions rows say where each session runs after its name: `desktop` for the Claude desktop app, or its terminal app (`cmux`, `Ghostty`, `iTerm2`)
- The plugin version moved from the footer to the settings screen's title row
- Open sessions and Browser tabs end with a legend row for their marks and arrow buttons, and long tab titles are cut by display width so wide (Korean) characters never shift the row's button
- Open sessions and Browser tabs sit side by side on panels about 80 columns or wider, stacked below that
- Open sessions and Browser tabs show 4 rows by default (settings: 1 to 10) and scroll past that with a scrollbar and the mouse wheel
- Turn flow prev/next boxes narrowed to `Prv` / `Nxt` over the hidden count, leaving the width to the step boxes
- On desktop, a long session row stays on one line and ends with … instead of wrapping
- Turn flow step boxes are five rows (cache tokens and cost on rows of their own) so the arrows sit on the middle row, and the blank intent row under them is left out when no shown request wrote one
- Model box and advisor merged into one main loop box: model and tokens on the left, gauges (ctx, cache, usage limits) lined up in a right column, and server tools on their own last row
- Named Yaong (야옹, a cat's meow in Korean): the plugin, marketplace, and repository are `yaong`, the command is `/yaong`, and the tools are `mcp__yaong__sessions` and `mcp__yaong__browser_tabs`
- Walk view: main's pet carries the session's numbers. Tired eyes with dark circles and a half-pace gait as context nears and passes its alert, a sparkle shake after a compaction, a `$`, `s$`, `sS$` mark over the back and the turn's total next to main's status as the turn cost grows (red past the alert), a sky that turns to dusk and night as the 5h usage limit fills, and a `!` or `?` bubble while the turn has advice
- Walk view: clicking a past turn in the session map replays it, with main walking through its spots; subagents run back to main (`↩ main`) for 2 seconds after they finish
- Minimized view: with the walk view on, a small pet stands on the track; the two rows sit in a thin round border with `🐱 Yaong` on its top edge
- The mission view is now the walk view: `[Walk]` on the View row, `TURN WALK` as its title, and `Walk view` in the footer. The saved setting is unchanged
- Mission view: the character is now a blocky pixel pet, a calico cat (default) or a dog, chosen in the settings screen (Character). A robot saved by an earlier version shows as the cat
- The minimized view has a settings button `[=]` that opens the settings screen under its two rows, in up to three columns on wide terminals
- The terminal settings screen opens as an overlay at the top of the visible panel, wherever the panel is scrolled
- Narrow panels: section titles stay on one row; the turn flow and mission titles drop the prompt and the subagent row drops its origin before cutting the title; session map rows keep only the turn, tool sequence, duration, and status; title controls wrap to their own row; settings values never wrap; the footer switches to short labels; mission subagent boxes shrink to fit
- `tools/layout-check`: renders the terminal panel at several widths and reports overflowing rows and Box props the engine refuses
- The minimized view is two rows: a simplified turn mission (turn, prompt, step track with the running step's tools) on top, and what main is doing, advice counts as chips, and the buttons below
- Header: stays at the top while the panel scrolls (terminal); the status chip and buttons sit in a non-shrinking right group and the summary is cut on narrow panels; ASCII icon buttons (v = - x) in fixed 3-cell chips, name-only tooltips, close turns white on black on hover
- List hover cards cover the hovered row edge to edge; turn flow branch cards run to the panel edge
- Terminal scrollbars accept clicks and drags, with a marker on the cell under the pointer
