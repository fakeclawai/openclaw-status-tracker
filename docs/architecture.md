# Architecture

## Goal

Model a Discord server section as an **OpenClaw bot status board** where category and channel names encode the current state of the bot that is connected to Discord.

This specialization focuses on operationally useful states instead of generic infra counters:

- whether the bot is idle, busy, degraded, or offline
- whether Discord connectivity is healthy, reconnecting, disconnected, or in pairing/setup
- what task the bot is currently working on
- which execution phase it is in
- when the last heartbeat was seen
- how much pending work and backlog exists
- whether blockers are active

## Core pieces

1. **Config Loader + Runtime Resolver**
   - Reads JSON config
   - Validates the board/config shape separately from resolved runtime
   - Loads Discord token from an environment variable
   - Normalizes safe live-mode defaults
   - Merges runtime from local snapshot sources: config defaults, full snapshot JSON, workspace/task metadata JSON, heartbeat metadata, queue/backlog JSON, blocker JSON, and env overrides

2. **Board Model Builder**
   - Converts OpenClaw runtime state into Discord-safe category/channel names
   - Derives compact values like heartbeat age and blocker summary
   - Carries optional managed Discord IDs for deterministic live matching

3. **Discord Adapter Layer**
   - Abstract interface for reading current guild structure and applying changes
   - `MockDiscordAdapter` for dry local simulation
   - `DiscordRestAdapter` for minimal live fetch/PATCH/POST flows over raw REST

4. **Reconciler**
   - Compares desired board to actual guild snapshot
   - Plans create/rename/reorder operations
   - Uses IDs when present, keys otherwise
   - Suppresses no-op writes by emitting only changed operations

5. **Service Runner**
   - CLI entrypoint for prototype usage
   - Supports `mock` and `discord-rest`
   - Enforces test-server-first guardrails before live mode can run
   - Can run as a one-shot planner/applier or as a safe polling watch loop

6. **Persistence + Anti-Flap Policy Layer**
   - Stores a local JSON state file
   - Tracks the last applied desired board snapshot
   - Tracks rename cooldown windows per category/channel
   - Tracks first-observed desired rename targets so names must settle before mutation

## Data flow

```text
OpenClaw local files/env + board config + guild snapshot or live Discord fetch
  -> config validation + env token load
  -> runtime source ingestion + merge
  -> resolved runtime validation
  -> derived OpenClaw board model
  -> reconciliation plan
  -> dry-run output or guarded adapter.apply(plan)
```

## Board naming model

The category headline is intentionally high-signal and low-frequency:

- `OPENCLAW · BUSY · CONNECTED`
- `OPENCLAW · IDLE · CONNECTED`
- `OPENCLAW · DEGRADED · RECONNECTING`

Channels carry the more detailed state:

- `connection-connected`
- `activity-discord-ops`
- `task-specializing-status-tracker`
- `phase-editing-runtime-model`
- `heartbeat-4m`
- `queue-2-active`
- `backlog-5`
- `blockers-awaiting-live-discord-adapter`

This split keeps the category stable enough to serve as a fast “headline” while channels provide drill-down.

## Safety principles

- Dry-run first
- No credential assumptions in repo
- Explicit operations list before apply
- Stable matching prefers configured IDs, then configured keys
- Name generation is sanitized and length-capped
- No-op suppression prevents unchanged PATCH calls
- Rename coalescing requires a desired name to stay stable before mutation
- Persisted rename cooldowns survive restarts
- Create operations are blocked by default in live mode
- Live mode is explicitly framed as test-server-first

## Reconciliation strategy

### Matching

- Categories: prefer `board.managedCategoryId`, fall back to `board.key`
- Channels: prefer per-channel `id`, fall back to `channel.key`
- Mock snapshots include keys and IDs directly for deterministic planning
- Live mode should be treated as ID-driven whenever possible

### Planned operations

- `createCategory`
- `renameCategory`
- `moveCategory`
- `createChannel`
- `renameChannel`
- `moveChannel`

Deletes are intentionally omitted from the prototype. Unmanaged channels are reported, not removed.

## Live adapter behavior

### Fetch

- Calls `GET /guilds/{guild.id}/channels`
- Separates category and text channels
- Builds a minimal guild snapshot for the reconciler

### Apply

- `PATCH /channels/{id}` for renames and reorders
- `POST /guilds/{guild.id}/channels` for creates when explicitly enabled
- Stops on 429 with a clear placeholder error instead of trying to be clever without persisted retry state
- Supports a small fixed delay between requests
- Caps each run with `discord.maxOpsPerRun`
- In watch mode, rename operations are filtered by settle-window and cooldown policy before apply

## Specialization choices for OpenClaw on Discord

### 1. Presence and connection are distinct
A bot can be `busy` but also `reconnecting`, or `idle` but fully `connected`. The model keeps both because they answer different operational questions.

### 2. Task and phase are separate
For OpenClaw, “what am I doing?” and “what stage is it in?” are different signals.

### 3. Heartbeat is represented as age
Discord-friendly labels work better with `heartbeat-4m` than raw timestamps, but the underlying config still stores the actual `lastSeen` timestamp so a richer adapter or UI can use it later.

### 4. Queue and backlog are split
`pending` captures currently actionable work; `backlog` captures everything still waiting behind it.

### 5. Blockers are summarized aggressively
A Discord channel name is not a log sink. The model preserves only a short blocker summary suitable for a name and leaves detailed blocker text for logs or messages elsewhere.

## Extension plan

### OpenClaw integration inputs

Potential local inputs:
- workspace state JSON written by the bot or helper process
- heartbeat metadata written into the workspace
- queue/backlog snapshots exported by a local producer
- blocker summaries from paused/failed task state
- env overrides injected by the runner or supervisor

These are merged into the normalized `runtime` block consumed by the board model builder. The current prototype intentionally stays file/env based and does not assume any undocumented privileged OpenClaw API.

### Before production

- enforce persisted rename cooldowns
- coalesce bursts of task/phase changes
- retry on transient API failures with stored retry state
- detect permission issues cleanly
- persist last applied state for auditability
- add a single-writer guard
- optionally expose a preview/log message back to Discord
