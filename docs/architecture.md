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

1. **Config Loader**
   - Reads JSON config
   - Validates the OpenClaw-specific runtime shape
   - Normalizes defaults used by the board builder and reconciler

2. **Board Model Builder**
   - Converts OpenClaw runtime state into Discord-safe category/channel names
   - Derives compact values like heartbeat age and blocker summary
   - Keeps presentation logic separate from Discord API concerns

3. **Discord Adapter**
   - Abstract interface for reading current guild structure and applying changes
   - Current prototype includes only a mock adapter
   - Future adapter can wrap discord.js or raw REST calls

4. **Reconciler**
   - Compares desired board to actual guild snapshot
   - Plans create/rename/reorder operations
   - Supports dry-run review before live application

5. **Service Runner**
   - CLI entrypoint for prototype usage
   - Future daemon mode can poll a local state file or respond to OpenClaw-produced events

## Data flow

```text
OpenClaw runtime state + board config + guild snapshot
  -> config validation
  -> derived OpenClaw board model
  -> reconciliation plan
  -> dry-run output or adapter.apply(plan)
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
- Stable matching prefers configured keys over fuzzy text matching
- Name generation is sanitized and length-capped
- Rename-only updates are preferred to avoid Discord churn

## Reconciliation strategy

### Matching

- Categories: match by configured `board.key`
- Channels: match by `channel.key`
- Prototype snapshots include these keys directly for deterministic planning
- Real Discord integration can persist logical keys outside the visible name if needed

### Planned operations

- `createCategory`
- `renameCategory`
- `moveCategory`
- `createChannel`
- `renameChannel`
- `moveChannel`

Deletes are intentionally omitted from the prototype. Unmanaged channels are reported, not removed.

## Specialization choices for OpenClaw on Discord

### 1. Presence and connection are distinct
A bot can be `busy` but also `reconnecting`, or `idle` but fully `connected`. The model keeps both because they answer different operational questions.

### 2. Task and phase are separate
For OpenClaw, “what am I doing?” and “what stage is it in?” are different signals. Example:

- task: `answering-discord-request`
- phase: `gathering-context`

### 3. Heartbeat is represented as age
Discord-friendly labels work better with `heartbeat-4m` than raw timestamps, but the underlying config still stores the actual `lastSeen` timestamp so a richer adapter or UI can use it later.

### 4. Queue and backlog are split
`pending` captures currently actionable work; `backlog` captures everything still waiting behind it.

### 5. Blockers are summarized aggressively
A Discord channel name is not a log sink. The model preserves only a short blocker summary suitable for a name and leaves detailed blocker text for logs or messages elsewhere.

## Extension plan

### OpenClaw integration inputs

Potential local inputs:
- gateway session connectivity
- bot idle/busy/degraded presence
- current task label from the active runtime
- execution phase from the current workflow
- last heartbeat timestamp
- queue depth / backlog depth
- summarized blockers from failed or paused work

These can be transformed into the `runtime` block consumed by the board model builder.

### Discord live mode

For production:
- enforce rename cooldowns
- coalesce bursts of task/phase changes
- retry on transient API failures
- detect permission issues cleanly
- persist last applied state for auditability
- optionally expose a preview or log message back to Discord
