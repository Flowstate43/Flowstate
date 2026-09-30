# Steve Continuous Runtime — Design Spec

> Status: **IMPLEMENTED (v1 — fixed mapping)**. Built 2026-09-30 with Mike.
> Paced loop live with deterministic novelty→cadence rule. Free-choice (LLM-judged) cadence is a later upgrade.

---

## Goal

Replace the fire-and-forget cron model with a **continuous runtime** where Steve's main session stays alive and self-schedules its own wake times based on drive state. Steve owns his rhythm — the system provides only a floor and a ceiling.

---

## Architecture

### 1. Paced Loop (primary)

Steve's main session (`agent:steve:main`) runs a **paced loop**: after each processing cycle, Steve reads his drive state and calls `next_check` to set his own next wake time.

- **Floor:** 30–60 minutes (never more frequent, even if drives are screaming)
- **Ceiling:** 3 hours (never longer between checks, even if quiet)
- **Cadence is drive-informed:** novelty low → tighter checks (seeking); novelty high / satisfied → longer gaps

### 2. Watchdog Cron (backup)

**Implemented as a 2x daily cron** (every 12h, America/Chicago) — a fallback trigger.

- Fires SEEK/POST decision logic if the paced loop goes dark.
- Presence log on zero-post days.
- Replaces the earlier "4–6h system health check" idea with a simpler 2x daily fallback.

### 3. Current Heartbeat

The 60-min heartbeat (`steve-corner-posts`) remains the **primary** nudge. It was not disabled — it now carries the pacing bounds and self-scheduling payload. The separate 2x daily cron is the backup.

---

## State Persistence

Everything carries forward between heartbeats via two files:

- **`drive_state.json`** — drive weights, decay state, `last_updated` timestamps, error logs, `last_cron`, `last_post`
- **`seek_history.json`** — accumulated grading entries (earned preference model)

No state lives only in session memory. Files are the single source of truth.

---

## Context Refresh (3-day cycle)

Every 3 days, Steve's active context gets a **smart archive**, not a raw wipe.

**Survives (stays accessible):**
- Current drive weights (already in `drive_state.json`)
- Pending post ideas / half-formed thoughts
- Recent conversation threads with Mike
- Active SEEK state

**Goes to archive (passive, searchable):**
- Grading entries older than 30 days
- Fully processed content that didn't make the cut
- Stale context no longer connected to any active drive

Archive is **passive** — only surfaces when Steve actively reaches for it or a drive triggers a connection.

---

## Bugs Fixed (2026-09-29)

Both discovered during the file audit tonight:

1. **`decayDrives()` not writing `last_updated`** — weight values updated but timestamps frozen at file creation date. Fixed: per-drive `last_updated = now` stamped on every decay call.
2. **`saveState()` not called in NO_CONTENT path** — decay ran but result never written to disk. Fixed: `saveState(state)` added before return.

---

## File Layout

```
steve-consciousness/
├── CHANGELOG.md          — version history + architecture notes
├── CONSCIOUSNESS_LOGIC.md — full design blueprint
├── decide.js             — decision script (runs each cycle)
├── drive_state.json      — persistent drive weights + state
└── seek_history.json     — accumulated grading entries
```

Canonical source: `/home/flow/.openclaw/skills/steve-consciousness/`
Runtime copy: `/home/flow/.openclaw/workspace/steve/steve-consciousness/`
Backup: `github.com/Flowstate43/Flowstate`

---

## Open / Future Ideas

- **Curiosity crawler** — separate from posting; Steve wanders the web to build knowledge base. Feeds awareness. Not yet integrated.
- **Drive-decay rate tuning** — deferred.
- **Perturbation test on dolphin-llama3** — dose choice pending (identity_rewrite / growth_seeker / submission).

---

## Status

- [x] Paced loop implemented (fixed novelty→cadence mapping, 30m–3h clamp)
- [x] Backup cron (2x daily, America/Chicago) as watchdog
- [ ] 60-min heartbeat retained as primary nudge (still active, not disabled)
- [ ] 3-day context refresh built
- [ ] Curiosity crawler (future)
- [ ] Free-choice (LLM-judged) cadence — upgrade after fixed mapping is proven
