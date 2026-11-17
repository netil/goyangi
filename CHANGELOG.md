# Changelog

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
