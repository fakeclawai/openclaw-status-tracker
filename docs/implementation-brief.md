# OpenClaw-Friendly Discord Status Tracker — Implementation Brief

## Goal
Build a small service in `/root/.openclaw/workspace/openclaw-status-tracker` that updates Discord **category names and/or channel names** to act as a live status board, while staying friendly to:
- Discord API limits
- OpenClaw’s Discord runtime model
- a Kali VPS deployment

## Key Findings

### 1) Best integration shape
Use a **separate Discord bot/service** for status-board renames, not the OpenClaw agent session itself.

Why:
- OpenClaw’s Discord channel is optimized for conversations, not high-frequency structural guild edits.
- Guild channels in OpenClaw map to isolated sessions; renaming them externally does not break the session key because Discord channel IDs stay stable.
- Separating the tracker from the main assistant reduces blast radius, permissions, and debugging confusion.

Recommended pattern:
- **Tracker service** runs as a local Node process on the VPS.
- It reads state from local files / local HTTP / OpenClaw-produced JSON.
- It talks directly to Discord Bot API for channel/category rename operations.
- OpenClaw can optionally write the input state file or trigger manual refreshes, but should not be the tight rename loop.

### 2) Discord permissions required
Minimum practical bot permissions:
- **View Channels**
- **Manage Channels** ← required for renaming categories/channels

Usually also useful:
- **Read Message History** and **Send Messages** only if the tracker posts logs or health messages into Discord

Not needed for pure renaming:
- Administrator
- Manage Roles
- Message Content intent

Important:
- Bot role must sit **high enough in role hierarchy** to manage the target channels.
- Channel/category-level permission overwrites can still block edits even if guild role looks correct.

### 3) Naming constraints that matter
From Discord docs / observed behavior:
- Channel `name` field: **1–100 characters**.
- Category names also use the channel name field, so treat them as **1–100 chars** too.
- Text channel display conventions are stricter than voice/category display; safest approach is:
  - categories: short human-readable labels
  - text channels: lowercase, hyphen-safe, ASCII-ish where possible
- Keep names short even if 100 chars is allowed; Discord UI truncates aggressively.

Practical recommendation:
- Hard cap generated names to **<= 60 chars**.
- Normalize dynamic text to a safe slug for text channels.
- Prefer emojis/prefixes only if tested in the target server and they remain readable.

### 4) The real blocker: rename rate limits
This is the main product constraint.

Discord docs say:
- per-route and global limits exist
- bots should rely on returned rate-limit headers and `retry_after`
- global limit is roughly **50 requests/sec**

But channel renames have a widely observed **special limit of ~2 renames per 10 minutes per channel/resource path**, documented in Discord API discussions/issues but not clearly surfaced in normal headers.

Implication:
- You **cannot** build a “real-time every few seconds” status board by renaming the same few channels repeatedly.
- A rename-driven board must be **slow-moving**, event-coalesced, and selective.

Safe product assumption:
- Budget each board line for **at most 1 rename per 5–10 minutes** unless proven otherwise in live testing.
- Treat every rename as expensive.

### 5) Category/channel count constraints
Observed/commonly cited Discord limits:
- **Up to 50 channels per category**
- Server-wide channel/category limits also exist, so avoid overbuilding the board structure

Implication:
- Prefer a compact board, e.g. 1 category + 3–8 channels, not dozens.

## What to build

### Recommended board design
Prefer this structure:
- Category: `status-board` or `🟢 system-status`
- Channels:
  - `overall-green`
  - `gateway-online`
  - `jobs-3-running`
  - `last-sync-1652-utc`
  - `alerts-0`

Best practice:
- Use **multiple channels with infrequent changes**, not a single channel that churns constantly.
- Only rename a line when its semantic state changes materially.

### Data model
Have the tracker compute a desired board state like:

```json
{
  "categoryName": "status-board",
  "channels": {
    "overall": "overall-green",
    "gateway": "gateway-online",
    "jobs": "jobs-3-running",
    "sync": "last-sync-1652-utc",
    "alerts": "alerts-0"
  }
}
```

Then reconcile against current Discord state.

### Reconciler rules
Implement a reconciler that:
1. Loads config + desired state
2. Fetches current channel/category names by ID
3. Diffs desired vs actual
4. Applies only necessary renames
5. Enforces cooldowns and backoff
6. Persists rename history locally

Required guardrails:
- **Per-channel cooldown**: default `10 minutes`
- **Global reconcile interval**: default `60–120 seconds`
- **Debounce** bursty input: `30–60 seconds`
- **No-op suppression**: never PATCH if name is unchanged
- **Retry-after handling** on 429
- **Jitter** between multiple renames in one cycle

## Recommended configuration

Use a local config file like `config/status-tracker.json`:

```json
{
  "discordTokenEnv": "DISCORD_STATUS_BOT_TOKEN",
  "guildId": "...",
  "board": {
    "categoryId": "...",
    "channels": {
      "overall": "...",
      "gateway": "...",
      "jobs": "...",
      "sync": "...",
      "alerts": "..."
    }
  },
  "timing": {
    "reconcileIntervalMs": 60000,
    "debounceMs": 30000,
    "perChannelCooldownMs": 600000,
    "interRenameDelayMs": 2000
  }
}
```

Do **not** store the token in git. Use env or OpenClaw secret/config references.

## OpenClaw-specific considerations

### Friendly path with OpenClaw
Use OpenClaw for one or more of these:
- producing local status JSON
- triggering manual refresh / admin commands
- exposing health from gateway/workflows into a file the tracker reads

Avoid using OpenClaw as the high-frequency rename executor.

### Why this is safe with OpenClaw’s Discord model
- OpenClaw routes guild sessions by **channel ID**, not channel name.
- Renaming a channel should not change the underlying session key.
- Still, avoid renaming channels that humans actively use for normal conversation if name churn would be confusing.

### Best operational split
- `openclaw-status-tracker`: infrastructure/status presenter
- OpenClaw agent: human interaction + control plane

## Deployment on the Kali VPS

### Recommended runtime
- Node.js service managed by **systemd user/system service** or a simple process manager already trusted on the box
- Logs to stdout + local file if needed
- Config in workspace, secret in env

### Suggested files to add
- `package.json`
- `src/main.ts` or `src/main.js`
- `src/config/loadConfig.ts`
- `src/adapters/discord.ts`
- `src/reconciler/reconcileBoard.ts`
- `src/runtime/stateStore.ts`
- `examples/status.example.json`
- `docs/ops.md`

### Input sources for board state
Safest options first:
1. **Local JSON file** written by OpenClaw/scripts
2. **Local HTTP endpoint** bound to localhost only
3. Polling trusted local commands

Do not execute internet-sourced code or random webhooks on this VPS.

## Risks / failure modes

### Product risks
- Rename rate limits make “live” updates much slower than users expect.
- If state changes too often, board will lag or skip transitions by design.
- Renaming active discussion channels may annoy users.

### Technical risks
- Missing `Manage Channels` permission => repeated 403s
- Wrong channel IDs => invalid requests / unnecessary API churn
- Startup burst can hit invalid-request or route limits if reconcile logic is sloppy
- Multiple workers running at once can fight each other

### Operational risks
- Token leakage if stored in repo/plaintext
- Restart loops if bot crashes on 429/403 without backoff
- Confusion if board names are too long or too cute to parse quickly

## Practical implementation choices

### Library choice
On this VPS, safest practical choice is:
- **Node + discord.js** if already accepted for the project
- or minimal direct REST calls if you want the smallest surface area

For a rename-only service, direct REST is viable because feature scope is tiny:
- GET guild channels
- PATCH channel by ID

But discord.js is still reasonable if the main agent wants easier maintenance.

### My recommendation
For fastest shipping:
- Use **Node 22 + TypeScript or modern ESM JS**
- Use **discord.js** only for auth/cache convenience if desired
- Keep the logic mostly REST-like and stateless

## Recommended next steps

1. **Lock product scope**
   - Decide board size: 1 category + 4 or 5 channels
   - Decide update cadence: “eventual” not instant

2. **Create the Discord assets manually once**
   - Make the category and channels in Discord
   - Copy IDs in Developer Mode
   - Grant bot only `View Channels` + `Manage Channels`

3. **Implement a local desired-state file**
   - Example: `runtime/status.json`
   - Let OpenClaw or scripts update this file

4. **Build the reconciler first**
   - Name normalization
   - diff/no-op suppression
   - per-channel cooldown tracking
   - 429 handling

5. **Test with one disposable channel**
   - Verify actual cooldown behavior in this server
   - Confirm whether category renames behave similarly to channel renames

6. **Only then expand to full board**
   - Start with 2–3 lines, not 10+

7. **Add ops safety**
   - lockfile/single-instance protection
   - structured logs
   - dry-run mode
   - `--once` reconcile command for testing

## Bottom line
This is shippable, but only if treated as a **slow, reconciled status board**, not a high-frequency live ticker. The main engineering requirement is a careful rename scheduler with cooldowns, diffing, and strong no-op suppression. The cleanest OpenClaw-friendly architecture is a separate local Discord bot/service that consumes local state and performs minimal, rate-aware renames.