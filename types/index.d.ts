export type Loop = {
  id: string
  type: string
  desc: string
  model: string
  effort?: string | number
  status: 'idle' | 'thinking' | 'tool' | 'done' | 'failed'
  activity: string
  tools: number
  running: number
  steps: number
  inTok: number
  outTok: number
  cacheTok: number
  // When the subagent was first seen and when it ended. Used for the elapsed time in agent boxes.
  startedAt?: number
  endedAt?: number
  // Where this agent was spawned from: a main model request (e.g. 'T5 step 3') or the parent agent's name
  origin?: string
  // Recent tool classes of this loop (same letters as the session map). Drawn as colored blocks in subagent boxes.
  seq?: string
  // Time of this loop's last event. Running without updates for long counts as stalled.
  lastAt?: number
}

export type LogKind = 'prompt' | 'step' | 'tool' | 'agent' | 'answer' | 'server' | 'compact'

export type LogLine = { at: number; who: string; kind: LogKind; text: string; meta: string; ok: boolean; agentId?: string; seq?: number }

export type ServerTool = { calls: number; ms: number; lastAt: number }

export type FlowItem = {
  id: string
  kind: 'prompt' | 'step' | 'tool' | 'agent' | 'answer'
  agentId?: string
  label: string
  // Full, untruncated content (command, path, description). Used for running cards and hover cards.
  full?: string
  // Tokens and cost of a model request step (increase of the session running cost, approximate).
  // tokIn: new input (including cache writes), tokCache: input read from cache, tokOut: output
  tokIn?: number
  tokCache?: number
  tokOut?: number
  cost?: number
  // Handoff between sessions (the sessions tool's send or pull, or a prompt that arrived as a handoff): drawn as ⇢ / ⇠ with the other session's name
  hand?: 'send' | 'pull' | 'from'
  // Failure cause: denied, or the start of the tool error message
  err?: string
  // Which failure of the same call in the same turn this is. 2 or more marks a repeated failure.
  repeat?: number
  // A request whose cache hit rate dropped sharply from the previous model request
  cacheDrop?: boolean
  // Model request: the first line of the response (what it intends to do). Updated as it arrives while running.
  intent?: string
  // Tool: result summary (exit 1, +12/−3, 120 lines, 8 hits)
  res?: string
  // File tool: target path. Read keeps a separate key with offset and limit attached to tell whether the same range was read again.
  path?: string
  readKey?: string
  meta: string
  startedAt: number
  endedAt?: number
  ok: boolean
}

// One session map row. seq holds what happened in the turn, one character each, in order.
// > prompt, | model request, # answer, ! repeated failure, c context compaction (compact), anything else is a tool class (b r e s w m k a o).
export type SessionTurn = { id: string; prompt: string; startedAt: number; endedAt?: number; seq: string; tools: number; agents: number; ok: boolean; cost?: number; edits?: number; fails?: number }

// Flow chart archive of a finished turn. Used to replay a past turn clicked in the session map.
// Values changed in the panel's settings screen. Missing items use the plugin settings (userConfig).
// autoUpdate: check for and fetch a new version when a session starts (on by default).
// position: panel position. right is a split to the right of the conversation (Pane), bottom the area above the prompt (AbovePrompt)
// character: the walk view's character (cat, dog).
// view: what to draw in the turn flow's place. default is the flow chart, avatar the walk where pixel characters run along the steps (the value name is kept to match saved settings)
export type Prefs = { autoOpen?: boolean; ctxAlertPercent?: number; turnCostAlertUsd?: number; stallSeconds?: number; position?: 'right' | 'bottom'; autoUpdate?: boolean; view?: 'default' | 'avatar'; character?: 'cat' | 'dog'; sessionRows?: number; tabRows?: number; freshMode?: 'off' | 'ask' | 'auto'; icon?: 'auto' | 'nerd' | 'unicode' | 'ascii' }
// An open Claude Code session on this machine (from `claude agents --json`), and the list the panel shows with this session's id
// host: the app the session runs in (Claude for the desktop app, cmux, Ghostty, iTerm2, ...), read from its process's ancestors; pid locates it
export type Peer = { sessionId: string; name: string; cwd: string; status: string; kind: string; pid?: number; host?: string; num?: number }
export type Peers = { self: string; list: Peer[] }
// A browser tab, read through AppleScript. id is the browser letter and the tab's place in that browser, counted across its windows (B1, B2, C1).
// win and index place it for focusing; app is the browser's application name.
// An app's icon as a 32px PNG (base64), converted from its .icns once per session; null when the app or its icon isn't there
export type AppIcon = { png: string } | null
// firefox: read from Firefox's session file (up to ~15 seconds old; key is the tab's docshell UUID); it can be focused by keys but not scripted.
// safari: read with Safari's dictionary, whose tabs have no id (key is then the tab's place, so a number can move to the next tab when one closes).
export type Tab = { id: string; key: string; title: string; url: string; active: boolean; app: string; win: number; index: number; safari?: boolean; firefox?: boolean }
export type TurnSnap = { flow: FlowItem[]; files?: { edit: string[]; read: string[] }; prompt: string; startedAt: number; endedAt: number }

export type Turn = { prompt: string; startedAt: number; steps: number; running: boolean }

export type Fold = { all: boolean; side: boolean; map: boolean; flow: boolean; agents: boolean; log: boolean }

export type Tree = {
  main: Loop
  agents: Loop[]
  toolMix: Record<string, number>
  stops: Record<string, number>
  server: Record<string, ServerTool>
  turn: Turn
  flow: FlowItem[]
  turns: SessionTurn[]
  log: LogLine[]
  // Total number of log entries so far. log keeps only recent ones, so scroll positions are absolute numbers based on this.
  logTotal: number
  // Total number of turns started so far. turns keeps only recent ones, so map scrolling is based on this.
  turnTotal: number
  // Total run time per tool and the single longest run
  toolTime: Record<string, { ms: number; max: number }>
  // Failure counts of the current turn. Keys join the loop, tool, and target.
  fails: Record<string, number>
  // Context breakdown (/context entries). Updated when a turn ends and after compact.
  ctxParts?: CtxPart[]
  // Files edited and read this turn (file names). Cleared at turn.start.
  files?: { edit: string[]; read: string[] }
  // Lines added and removed per file path across the whole session (not cleared at turn.start)
  diff?: Record<string, { add: number; del: number }>
  // Flow charts of recently finished turns (by turn id). Oldest removed first.
  archive?: Record<string, TurnSnap>
}

// One advice row. text is the fact (numbers); why is the evidence, likely causes, and what to do.
export type Advice = { id: string; level: 'warn' | 'tip'; text: string; why: string }

export type CtxPart = { name: string; tokens: number; color: string }

// One session's running record. Stacked one row per session in $.store 'history'.
export type SessionRecord = { id: string; startedAt: number; updatedAt: number; cost: number; turns: number; tools: number; tokens: number }

declare module 'claude-code' {
  interface PluginState {
    'goyangi': { tree: Tree; tick: number; fold: Fold; logEnd: number; mapEnd: number; flowPage: number; questPage: number; focus: string; kidsFolded: string; viewTurn: string; replayFrom: number; mapTall: boolean; mapBasis: string; tipsOpen: boolean; logAll: boolean; archive: Record<string, TurnSnap>; prefs: Prefs; settingsOpen: boolean; bottomOpen: boolean; peers: Peers; tabs: Tab[]; peerFrom: number; tabFrom: number; icons: Record<string, AppIcon>; freshStage: string; pulls: { wait: Record<string, string>; back: Record<string, string> }; nums: Record<string, number>; numsOf: string }
  }
}
