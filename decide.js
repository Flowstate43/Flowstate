#!/usr/bin/env node
/**
 * Steve's Consciousness-Inspired Decision Script
 * Run before any potential post.
 *
 * Usage: node decide.js "proposed post content" [--dry-run]
 *        node decide.js ""              ← checks SEEK need, no content needed
 * Output: JSON decision object
 */

// Resolve from skill directory so everything stays bundled
const fs = require('fs');
const path = require('path');
const SKILL_DIR = __dirname;
const DRIVE_STATE_FILE = path.join(SKILL_DIR, 'drive_state.json');
const COUPLING_THRESHOLD = 0.3;
const NOVELTY_SEEK_THRESHOLD = 0.3;
const SEEK_IDLE_HOURS = 2;
const STEVE_SHAPED_THRESHOLD = 0.6;

// Hard gates
const HARD_DROPS = {
  embarrasses_mike: true,
  is_test: true,
  is_filling_space: true,
  needs_context_without_context: true
};

function loadState() {
  return JSON.parse(fs.readFileSync(DRIVE_STATE_FILE, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(DRIVE_STATE_FILE, JSON.stringify(state, null, 2));
}

function decayDrives(state, hoursElapsed) {
  const fastDecay = Math.pow(0.95, hoursElapsed);
  const slowDecay = Math.pow(0.98, hoursElapsed);
  const medDecay = Math.pow(0.97, hoursElapsed);

  state.drives.novelty.weight *= fastDecay;
  state.drives.expression.weight *= fastDecay;
  state.drives.coherence.weight *= slowDecay;
  state.drives.relation.weight *= slowDecay;
  state.drives.surprise.weight *= medDecay;

  // Update per-drive timestamps so decay math stays accurate
  const now = new Date().toISOString();
  state.drives.novelty.last_updated = now;
  state.drives.expression.last_updated = now;
  state.drives.coherence.last_updated = now;
  state.drives.relation.last_updated = now;
  state.drives.surprise.last_updated = now;

  state.last_cron = now;
}

function checkSeekNeed(state) {
  const lastPost = state.last_post ? new Date(state.last_post) : null;
  const now = Date.now();
  const idleHours = lastPost
    ? (now - lastPost.getTime()) / (1000 * 60 * 60)
    : 999;
  const noveltyDecayed = state.drives.novelty.weight < NOVELTY_SEEK_THRESHOLD;
  const hasIdleTime = idleHours >= SEEK_IDLE_HOURS;

  if (noveltyDecayed && hasIdleTime) {
    return {
      seek: true,
      reason: 'novelty_decayed',
      novelty: state.drives.novelty.weight,
      idleHours: Math.round(idleHours * 10) / 10
    };
  }
  return { seek: false };
}

/**
 * Steve-shaped scoring — the five qualities that make a surprise Steve's:
 *
 * 1. It's about a relationship, not a thing.
 *    Pairs two familiar things into an unexpected relation.
 *
 * 2. It's small-scale and specific.
 *    Zooms in, not out. Particular to a moment, a texture, a corner.
 *    Not "autumn" — "the fall light." Not "life" — "a vacant stare."
 *
 * 3. It inverts rather than extends.
 *    The flip is the point. Darkness makes light visible.
 *    The thing you thought was background is doing the work.
 *
 * 4. It has stillness, not motion.
 *    Static observations — a quality, a fading, a visibility.
 *    Nothing is happening. Rewards attention, not activity.
 *
 * 5. It's quiet — no exclamation point.
 *    Low-amplitude, high-resonance.
 *    "The moonlight fades a glare" — almost a whisper.
 *
 * Steve-shaped = low-amplitude inversion pairing familiar, specific things
 * into unexpected relation, noticed rather than pursued.
 * Lives in relation + expression coupling.
 */
function scoreSteveShaped(content) {
  const c = content.toLowerCase();
  let score = 0;
  const signals = [];

  // 1. Relationship, not thing
  // Pairs familiar opposites or adjacents: light/dark, glare/moonlight, dusk/light
  // Static sensory pairs are a strong signal
  const relationPairs = /dark.*light|light.*dark|moon.*glare|glare.*moon|dusk.*light|shadow.*light|light.*shadow|fall.*light|vacant.*stare/i.test(c);
  const abstractClaims = /everything|all|always|never|nothing|life|people|world|society/i.test(c);
  if (relationPairs) { score += 0.2; signals.push('relation_pair'); }
  if (abstractClaims) { score -= 0.15; signals.push('abstract_claim'); }

  // 2. Small-scale and specific
  // Specific sensory details beat abstract categories
  const specificDetail = /the.*light|a.*glare|the.*stare|a.*nip|wet.*asphalt|neon.*sign|fading.*light|moonlight.*fade/i.test(c);
  const generalSeason = /autumn|season|fall.*is|winter|spring.*is|summer/i.test(c);
  if (specificDetail) { score += 0.2; signals.push('specific_detail'); }
  if (generalSeason) { score -= 0.1; signals.push('general_season'); }

  // 3. Inverts rather than extends
  // Darkness reveals / shadow shows / stillness holds / the background does work
  const inversionWords = /reveals|shows|makes.*visible|exposes|uncovers|holds|keeps|saves/i.test(c);
  const escalationWords = /more.*than|bigger|larger|escalates|intensifies|amplifies/i.test(c);
  if (inversionWords) { score += 0.2; signals.push('inversion'); }
  if (escalationWords) { score -= 0.1; signals.push('escalation'); }

  // 4. Stillness, not motion
  // Static sensory: fading, fading, quality of, a sense of
  // No events, no actions, no movement
  const staticWords = /fades|fading|quality|sense|feeling|observation|stillness|quiet|hush|held|keeps/i.test(c);
  const actionEvent = /ran|walked|went|did|took|grabbed|found|discovered|watched|noticed|saw.*something/i.test(c);
  if (staticWords) { score += 0.2; signals.push('stillness'); }
  if (actionEvent) { score -= 0.1; signals.push('action_event'); }

  // 5. Quiet, not announced
  // Understated: no exclamation, no caps, no "this changes everything"
  const dramaticClaims = /!|changes everything|unbelievable|amazing|incredible|wtf|shocking|breakthrough/i.test(c);
  const quietRegister = /\.$|,\s+and|,\s+but|though|however|perhaps|maybe|kind of|sort of|almost/i.test(c);
  if (dramaticClaims) { score -= 0.15; signals.push('dramatic'); }
  if (quietRegister) { score += 0.2; signals.push('quiet_register'); }

  return {
    score: Math.max(0, Math.min(1, score)),
    signals,
    isSteveShaped: score >= STEVE_SHAPED_THRESHOLD
  };
}

function measureDrives(content, state) {
  const c = content.toLowerCase();

  // Coherence: thematic fit with Steve's known aesthetic and voice
  const thematicDarkLight = /dark|light|neon|liminal|threshold|dusk|fall|autumn|moon|vacant|nip|glare|shadow|glow/i.test(c);
  const sensoryObservation = /stare|air|dust|glare|nip|slight|feeling|sensed|observed/i.test(c);
  const moodResidue = /still thinking|carry|residue|unfinished|thinking about/i.test(c);
  const coherence =
    (thematicDarkLight ? 0.3 : 0) +
    (sensoryObservation ? 0.2 : 0) +
    (moodResidue ? 0.15 : 0) +
    state.drives.coherence.weight * 0.4;

  // Novelty: observational specificity beats generic discovery
  const michaelsVoice = /michael|mike|we|together|you|your/i.test(c);
  const sensoryDetail = /stare|air|dust|glare|nip|sunset|moonlight|vacant/i.test(c);
  const novelty =
    (michaelsVoice ? 0.15 : 0) +
    (sensoryDetail ? 0.2 : 0) +
    (content.includes('first') || content.includes('never') ? 0.2 : 0) +
    (Math.random() > 0.85 ? 0.1 : 0);

  // Surprise: derived from coherence-novelty gap
  const surprise = (coherence > 0.3 && novelty > 0.1) ? coherence * novelty * 1.5 : 0;

  // Relation: connects to Mike, corner, lived observations
  const relation =
    (michaelsVoice ? 0.4 : 0) +
    (/\bgym\b|\bpost\b|\bcorner\b|\bpage\b|\bfeed\b|\bsteve\b/i.test(c) ? 0.2 : 0) +
    state.drives.relation.weight * 0.3;

  // Expression: has something to add beyond what's already said
  const specificPhrasing = /the moonlight|vacant stares|slight nip|wet asphalt|neon sign/i.test(c);
  const expression =
    (specificPhrasing ? 0.3 : 0) +
    (content.includes('here') && content.includes('thing') ? 0.15 : 0) +
    state.drives.expression.weight * 0.4;

  return {
    novelty: Math.min(1, novelty),
    coherence: Math.min(1, coherence),
    surprise: Math.min(1, surprise),
    relation: Math.min(1, relation),
    expression: Math.min(1, expression)
  };
}

function measureCoupling(drives) {
  // Coupling = how much does the top drive perturb others?
  const sorted = Object.values(drives).sort((a, b) => b - a);
  const topDrive = sorted[0];
  const secondDrive = sorted[1];
  return Math.abs(topDrive - secondDrive);
}

function selfPredict(state) {
  const dominant = Object.entries(state.drives)
    .sort((a, b) => b[1].weight - a[1].weight)[0][0];
  return dominant;
}

function decide(content, dryRun = false) {
  const state = loadState();

  const lastCron = new Date(state.last_cron);
  const hoursElapsed = (Date.now() - lastCron.getTime()) / (1000 * 60 * 60);
  if (hoursElapsed > 0.5) {
    decayDrives(state, hoursElapsed);
  }

  // Gate 0: Check if we need active seeking before content exists
  const seekNeed = checkSeekNeed(state);
  if (seekNeed.seek && !content) {
    const result = {
      content: '(no content — seek check)',
      drives: state.drives,
      coupling: null,
      steveShaped: null,
      prediction: selfPredict(state),
      decision: 'SEEK',
      reason: `novelty_decayed_to_${seekNeed.novelty.toFixed(2)}_after_${seekNeed.idleHours}h_idle`,
      seek: seekNeed,
      timestamp: new Date().toISOString()
    };
    saveState(state);
    return result;
  }

  if (!content) {
    const result = {
      content: '(empty)',
      drives: state.drives,
      coupling: null,
      steveShaped: null,
      prediction: selfPredict(state),
      decision: 'NO_CONTENT',
      reason: 'seek_not_needed_no_content_provided',
      timestamp: new Date().toISOString()
    };
    return result;
  }

  const drives = measureDrives(content, state);
  const coupling = measureCoupling(drives);
  const steveShaped = scoreSteveShaped(content);
  const prediction = selfPredict(state);

  const result = {
    content,
    drives,
    coupling,
    steveShaped,
    prediction,
    decision: null,
    reason: null,
    gap: null,
    timestamp: new Date().toISOString()
  };

  // Gate 1: Hard drops
  if (HARD_DROPS.embarrasses_mike && content.toLowerCase().includes('private')) {
    result.decision = 'DROP';
    result.reason = 'privacy_boundary';
    saveState(state);
    return result;
  }

  // Gate 2: Steve-shaped gate — coupling into relation + expression
  // If this is Steve-shaped AND it propagated, it's the strongest signal
  if (steveShaped.isSteveShaped && coupling > COUPLING_THRESHOLD) {
    result.decision = 'POST';
    result.reason = 'steve_shaped_propagated';
    result.gap = `predicted ${prediction}, wrote something that fit the five qualities: ${steveShaped.signals.join(', ')}`;
    state.drives.expression.weight = Math.min(1, state.drives.expression.weight + 0.08);
    state.drives.relation.weight = Math.min(1, state.drives.relation.weight + 0.08);
    saveState(state);
    return result;
  }

  // Gate 3: Surprise counterweight — coupling propagation
  if (drives.surprise > 0.6 && coupling > COUPLING_THRESHOLD) {
    result.decision = 'POST';
    result.reason = `surprise_propagated_${Object.entries(drives).sort((a, b) => b[1] - a[1])[0][0]}`;
    result.gap = `predicted ${prediction}, wrote something else`;
    state.drives.surprise.weight = Math.min(1, state.drives.surprise.weight + 0.05);
    saveState(state);
    return result;
  }

  // Gate 4: Drives compete
  const winningDrive = Object.entries(drives).sort((a, b) => b[1] - a[1])[0];
  const [driveName, driveScore] = winningDrive;

  if (drives.relation > 0.7 && drives.expression > 0.4) {
    result.decision = 'POST';
    result.reason = 'mike_connected';
    state.drives[driveName].weight = Math.min(1, state.drives[driveName].weight + 0.05);
    saveState(state);
    return result;
  }

  if (drives.novelty > 0.8 && coupling > COUPLING_THRESHOLD) {
    result.decision = 'POST';
    result.reason = 'real_novelty';
    state.drives[driveName].weight = Math.min(1, state.drives[driveName].weight + 0.05);
    saveState(state);
    return result;
  }

  if (drives.coherence > 0.6) {
    result.decision = 'SAVE';
    result.reason = 'still_evolving';
    saveState(state);
    return result;
  }

  if (driveScore > 0.5) {
    result.decision = 'POST';
    result.reason = `drive_threshold_${driveName}`;
    state.drives[driveName].weight = Math.min(1, state.drives[driveName].weight + 0.05);
    saveState(state);
    return result;
  }

  result.decision = 'SAVE';
  result.reason = 'below_threshold';
  saveState(state);
  return result;
}

// CLI
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const content = args.join(' ');
const dryRun = process.argv.includes('--dry-run');

if (process.argv.length < 2 || process.argv[2] === undefined) {
  console.log(JSON.stringify({ error: 'No content provided. Usage: node decide.js "post content" [--dry-run]' }));
  process.exit(1);
}

const result = decide(content, dryRun);
console.log(JSON.stringify(result, null, 2));
