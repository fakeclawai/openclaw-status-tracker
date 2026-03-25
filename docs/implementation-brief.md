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

## Current implementation status

This repo now covers:

- mock planning and mock apply flow
- environment-based Discord token loading
- a minimal raw REST Discord adapter skeleton
- category/channel fetch from a live guild
- ID-aware diffing for category/channel rename and move planning
- guarded live apply flow with dry-run, create suppression, request spacing, and max-op caps

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

## Guardrails in the current code

Required guardrails already partially implemented:
- **Dry-run default**: on
- **No-op suppression**: unchanged names do not generate PATCH operations
- **Create suppression**: live creates skipped unless `discord.allowCreate=true`
- **Global op cap**: `discord.maxOpsPerRun`
- **Inter-request delay**: `discord.requestDelayMs`
- **Test-server-first flag**: live mode refuses to run unless `discord.testServerOnly=true`
- **429 handling placeholder**: hard fail with Retry-After visibility instead of unsafe blind retry loops

Still missing:
- **Single-writer lock**
- **Persistent audit log**
- **Durable 429 retry queue / scheduler**

Newly added in this phase:
- **Safe local ingestion layer** for JSON snapshots and env overrides
- **Split-source runtime merging** so OpenClaw state can come from workspace/task files, heartbeat metadata, queue/backlog files, and blocker JSON
- **Polling watch loop** for continuous operation instead of one-shot-only runs
- **Persisted cooldown state** for category/channel renames across restarts
- **Debounce / coalescing** so a desired rename must remain stable before it is applied

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

## Remaining implementation gaps before production

1. **Cooldown scheduler and persistence**
   - channel/category-specific rename budgets
   - coalescing so noisy phase changes do not thrash
   - record of last attempted/applied rename timestamps

2. **State ingestion layer**
   - read OpenClaw status JSON from disk or localhost
   - validate/sanitize incoming state separately from board config
   - current prototype now covers disk/env snapshot ingestion; localhost HTTP and watcher loops remain future work

3. **Persistence and safety**
   - last applied state
   - rename timestamps
   - lockfile / single instance protection
   - structured audit log of live Discord mutations

4. **Permission and rollout hardening**
   - clearer handling for missing manage-channel permissions
   - staged rollout docs for promoting from test server to production server
   - capture of created category/channel IDs when create mode is eventually enabled

## Bottom line
This repo has moved beyond mock-only mode: it can now plan against a live Discord guild and run a guarded live apply skeleton. It is still not production-ready until cooldown persistence, durable retry handling, and audit/state storage exist.
