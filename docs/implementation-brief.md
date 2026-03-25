# OpenClaw Discord Bot Status Tracker — Implementation Brief

## Goal
Build a small service in `/root/.openclaw/workspace/openclaw-status-tracker` that updates Discord **category names and channel names** to present the live status of an **OpenClaw bot connected to Discord**.

This specialized prototype is aimed at slow-moving operational state, not chat content and not a high-frequency ticker.

## Specialized target state

The board should answer these questions quickly:

- Is the OpenClaw bot connected to Discord?
- Is it idle, busy, degraded, or offline?
- What task is it currently handling?
- What phase is that work in?
- When was the last heartbeat?
- How much queue/backlog is waiting?
- Are there blockers?

## Recommended board design

Prefer one compact category plus 6–8 channels:

- Category: `OPENCLAW · BUSY · CONNECTED`
- Channels:
  - `connection-connected`
  - `activity-discord-ops`
  - `task-answering-discord-request`
  - `phase-gathering-context`
  - `heartbeat-2m`
  - `queue-1-active`
  - `backlog-4`
  - `blockers-none`

Use the category as the stable headline and channels as the detailed lines.

## Product constraints that still matter

### 1) Rename rate limits remain the hard constraint
Even though this version is specialized for OpenClaw, the operational truth is unchanged: Discord renames are expensive.

Implication:
- do not rename on every token/message/event
- do not rename every time internal phase text changes if it churns often
- treat task + phase as **coalesced state**, not raw event stream

Safe assumption:
- budget any individual category/channel for roughly **1 rename per 5–10 minutes** unless live testing proves otherwise

### 2) Best data source shape
Use a local state producer that emits a compact runtime document like:

```json
{
  "bot": {
    "presence": "busy",
    "connection": "connected",
    "activity": "discord-ops"
  },
  "task": {
    "current": "answering-discord-request",
    "phase": "gathering-context"
  },
  "heartbeat": {
    "lastSeen": "2026-03-25T17:20:00Z"
  },
  "queue": {
    "pending": 1,
    "backlog": 4
  },
  "blockers": []
}
```

Best sources, in order:
1. local JSON file written by OpenClaw or a local script
2. local HTTP endpoint bound to localhost
3. local process output transformed into JSON

### 3) State classification matters more than raw detail
If OpenClaw emits verbose or noisy status text, classify it before it reaches the renamer.

Examples:
- internal workflow details -> short task/phase labels
- repeated transient reconnects -> `reconnecting`
- multiple errors -> one summarized blocker label

## What this prototype now models

The current repo already reflects this specialization in its schema and sample data:

- `runtime.bot.presence`
- `runtime.bot.connection`
- `runtime.bot.activity`
- `runtime.task.current`
- `runtime.task.phase`
- `runtime.heartbeat.lastSeen`
- `runtime.queue.pending`
- `runtime.queue.backlog`
- `runtime.blockers[]`

Derived fields used in channel names:
- `heartbeat.age`
- `blockers.summary`

## Recommended reconciler rules for production

1. Load config + local runtime state
2. Fetch current Discord category/channel names by ID
3. Diff desired vs actual
4. Apply only required renames/moves
5. Enforce cooldowns
6. Persist rename history and last applied logical state
7. Back off on 429 / permission failures

Required guardrails:
- **Per-channel cooldown**: default `10 minutes`
- **Category cooldown**: same or stricter than channels
- **Global reconcile interval**: default `60–120 seconds`
- **Debounce** bursty runtime changes: `30–60 seconds`
- **No-op suppression**: never PATCH unchanged names
- **Jitter** between multiple renames in one cycle
- **Single-writer lock** so two workers do not fight each other

## OpenClaw-friendly architecture

Recommended split:
- **OpenClaw bot/runtime**: source of truth for bot state
- **Status tracker**: tiny reconciler that turns that state into Discord-safe names

Why this split works:
- keeps Discord structural mutations out of the main assistant loop
- reduces permission blast radius
- makes rate limiting and cooldowns easier to reason about
- avoids coupling chat response timing to guild-structure update timing

## Deployment notes for the Kali VPS

Recommended runtime:
- Node 22 ESM JS
- systemd service or another already-trusted process supervisor
- stdout logs plus optional local state snapshot/log file

Keep secrets out of git. Use environment variables or OpenClaw-managed local config.

## Remaining implementation gaps

This repo is still a prototype. Before live use, add:

1. **Real Discord adapter**
   - fetch guild channels
   - patch channel/category names
   - handle 429s and permission errors cleanly

2. **Cooldown scheduler**
   - channel/category-specific rename budgets
   - coalescing so noisy phase changes do not thrash

3. **State ingestion layer**
   - read OpenClaw status JSON from disk or localhost
   - validate/sanitize incoming state

4. **Persistence**
   - last applied state
   - rename timestamps
   - lockfile / single instance protection

5. **Ops docs**
   - env vars
   - service unit example
   - failure handling and recovery steps

## Bottom line
This is now shaped around an **OpenClaw Discord bot status board**, not a generic service-health board. The current prototype is good for planning, modeling, and dry-run reconciliation. The next real engineering step is a live Discord adapter plus a conservative cooldown scheduler that respects Discord rename limits.
