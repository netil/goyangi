# Changelog

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
