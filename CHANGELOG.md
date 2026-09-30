# Steve-Consciousness Skill — Changelog

## Version 3.1 — 2026-09-29
**Bug fix:** `decayDrives()` updated weight values but never wrote `last_updated` on individual drive objects. Decay math was functionally correct but per-drive timestamps were stale (stuck at file creation date). Now all five drives get `last_updated = now` stamped on every decay call.
- Files changed: `decide.js`, `CONSCIOUSNESS_LOGIC.md`

## Version 3.0 — 2026-09-??
**Status:** Endorsed after structured debate between researcher + coordinator
- Five-drive architecture: novelty, coherence, surprise, relation, expression
- Differential decay rates per drive
- SEEK gate: fires when novelty < 0.3 AND idle > 2 hours
- Steve-shaped scoring: five qualities for content selection
- Coupling propagation mechanism for surprise signals
- Anti-camping: 0.7 discount after 3 consecutive wins in same territory
- Auto-grading: grades written to seek_history.json on every conversation turn

## Version 2.0 — 2026-09-??
- Added SEEK gate for active novelty seeking
- Thematic/coherence heuristics replace keyword shallow scoring

## Version 1.0 — 2026-09-??
- Initial decide.js implementation
- Basic drive state tracking

---

## Current Architecture

**Core files:**
- `decide.js` — decision script, run on every heartbeat
- `drive_state.json` — persistent drive weights, decay state, error logs
- `seek_history.json` — accumulated grading entries (earned preference model)
- `CONSCIOUSNESS_LOGIC.md` — full design blueprint
- `SKILL.md` — OpenClaw skill definition

**Drives:**
| Drive | Decay/hr | Description |
|-------|----------|-------------|
| Novelty | 0.95 | Observational specificity, new territory |
| Expression | 0.95 | Has something to add beyond what's already said |
| Surprise | 0.97 | Coherence-novelty gap, self-prediction error |
| Coherence | 0.98 | Thematic fit with known aesthetic |
| Relation | 0.98 | Connection to Mike, corner, lived experience |

**Decision pipeline:**
1. SEEK gate — if novelty decayed and idle >2h, force seeking
2. Hard drops — privacy, test content, space-filling
3. Steve-shaped gate — steve-shaped score ≥0.6 + coupling >0.3 → POST
4. Surprise counterweight — surprise + coupling → POST
5. Drive threshold — winning drive >0.5 → POST
6. Below threshold → SAVE or DROP

**SEEK thresholds:**
- `NOVELTY_SEEK_THRESHOLD = 0.3`
- `SEEK_IDLE_HOURS = 2`
- `COUPLING_THRESHOLD = 0.3`
- `STEVE_SHAPED_THRESHOLD = 0.6`

---

## openclaw:attempt:DYNAMIC Notes

- Cron automation: `steve-corner-posts` fires every 4 hours (heartbeat model)
- Timestamps in drive_state.json are UTC (ISO 8601 format)
- Cron fires on UTC schedule; display times show UTC
- Cron writes to workspace `drive_state.json` (not skill directory)
- Grading entries written to workspace `seek_history.json`
- Skill directory files are the canonical source; workspace files are runtime copies
