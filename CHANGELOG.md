# Changelog

## v1.3.0 (2026-11-25)

### Features

- **Spawn** replaces **Fork with ';'**: one button cycles `Off`, `bg`, and `fg`, and a `[ ; ]` field next to it sets the shortcut character (a saved Fork setting reads as `bg`). With Spawn on, a prompt that starts with the shortcut makes the model ask how the new session starts (**Compact summary + new session** or **New session**), then start it with the new `fork` tool (`mcp__goyangi__fork`). With Spawn `Off` the tool starts nothing and `;` is an ordinary character
- `fg` opens a split pane that attaches to the fork: below this one when the panel is on the right (beside it in the Compact view or with the panel at the bottom), in herdr, tmux or cmux, and a new Terminal window on macOS where none is available. The pane or window closes when the fork is merged or discarded
- Open sessions marks background sessions with `bg`
- A fork's start shows `Starting the fork...` at once, and the same request typed again while it starts is ignored instead of forking twice

### Changes

- Turn flow: the Prev and Next boxes are texts (`<< Prv` over `Prv 6`, `>>` over `Next 6`) and the count rows are clickable without the `p` and `n` keys
- Turn flow: step boxes are 18 cells wide and 4 rows high (cache tokens and cost share a row, the token row has no `·`, the answer box says `t` for total), and the arrows between them take 3 cells, so more steps fit. The shown steps also extend forward to fill the room left beside them

## v1.2.1 (2026-11-23)

### Bug Fixes

- Topic check skips prompts of fewer than three words (`ok`, `yes please`, `네 진행해`) instead of fewer than 20 characters, so a short prompt that changes the topic is checked in English and Korean alike (`what about tomorrow's weather`, `오늘이나 내일 날씨를 예측해봐`). Before, a Korean prompt that says as much as an English one in fewer characters often went unchecked

## v1.2.0 (2026-11-23)

### Features

- Prompt hold: while the context is at the **Fresh session at** point or past it (200k tokens by default), a typed prompt is held before it is sent when sending it would reread the whole context for little reason, and Goyangi asks: **Clear and send** (topic check) runs `/clear` and sends the prompt as typed in the new session, **Hand off and send** (idle hold) writes a handoff note first and the new session reads it before answering the prompt, **Keep and send** sends it here (and turns the topic check off for the rest of the session). Closing the question puts the text back in the box
  - **Idle hold**: the last turn ended at least this many minutes ago (60 by default), so the prompt cache has expired and the next request writes the whole context again. 0 turns it off
  - **Topic check**: Haiku reads the last three prompts (cut to 300 characters, never the transcript) and the new one, and the prompt is held when it reads as unrelated. Prompts under 20 characters and slash commands are not checked. A timeout or an error lets the prompt through. On by default

## v1.1.2 (2026-11-21)

### Bug Fixes

- The cat and dog now look the same in the terminal panel as in the pictures: every pose was redrawn so each terminal cell (2 × 4 pixels) holds at most two colors, which is all an octant character can show. Before, cells with a third color lost it, so the blink, the meow tongue, and the nose came out different
- The meowing cat shuts its eyes and keeps its nose, with a short tongue below it
- The dog's nose is eye-dark, the sleeping dog has no collar, and raised running legs have no paw tip, so they fit their cells
- `docs/images/characters.gif` shows the new art

## v1.1.1 (2026-11-20)

### Bug Fixes

- The walk view character and the header's cat logo no longer come out blank (or as the letters "Go") in herdr versions that leave the outer Ghostty's `TERM_PROGRAM` in place: herdr is now also recognized by `HERDR_ENV`

## v1.1.0 (2026-11-17)

### Features

- Forks: with **Fork with ';'** on, a prompt that starts with `;` runs in a background session (`claude --bg`), in its own git worktree inside a repository. Its permission requests show in the panel with Allow and Deny, and when it reports its tests pass Goyangi commits, rebases, and fast-forwards it onto the branch here. Off by default
- Compact view: `v` now cycles turn flow, walk, and a two-row compact track of the steps
- Fresh session at: a token point (200k by default, 50k steps) decides when to move to a fresh session, the same size in a 200k or 1M window. With `Auto`, the note is written when a turn ends past it, and the next prompt you type is carried into the new session
- Settings numbers can be typed into
- Desktop: the header stays at the top of the scrolled panel, and the settings screen opens over the panel

### Bug Fixes

- The walk view cat's eyes no longer disappear in octant art
- The fresh session Auto hold now catches prompts you type (it checked the wrong prompt origin)

## v1.0.5 (2026-11-17)

### Bug Fixes

- The walk view character no longer comes out blank in VS Code opened from kitty, or in zellij, screen and herdr inside kitty: a kitty variable inherited by those programs no longer makes Goyangi send an image they can't draw
- The character no longer breaks into missing-glyph boxes in VS Code and other terminals started from Ghostty or WezTerm: their inherited variables no longer count as octant support

## v1.0.4 (2026-11-05)

### Bug Fixes

- Open sessions and Browser tabs numbers start from 1 in every new session (and after `/clear`) instead of carrying over numbers from earlier sessions
- Each session keeps its own numbers, so copies of Goyangi running in other sessions can no longer hand out the same number twice

## v1.0.3 (2026-11-05)

### Bug Fixes

- Open sessions and Browser tabs numbers no longer change while the session or tab is open: numbers are read from and saved to the shared store before numbering, so two sessions can no longer hand out the same number or overwrite each other

### Changed

- A closed session or tab frees its number, and a new one takes the lowest free number, so numbers stay small and nothing piles up

## v1.0.2 (2026-11-04)

### Changed

- Renamed the project to Goyangi: npm package `goyangi`, slash command `/goyangi`, plugin `goyangi@goyangi`, repository `netil/goyangi`

### Documentation

- README: Getting started with install steps and usage prompts
- Manual rewritten to be shorter

## v1.0.1 (2026-11-04)

### Chore

- Verify the auto update path on the GitHub install

## v1.0.0 (2026-11-04)

The birth.
