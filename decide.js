#!/usr/bin/env node
/**
 * Steve's Consciousness-Inspired Decision Script
 * Run before any potential post.
 * 
 * Usage: node decide.js "proposed post content" [--dry-run]
 *        node decide.js ""              ← checks SEEK need, no content needed
 * Output: JSON decision object
 */

const fs = require('fs');
const path = require('path');

const DRIVE_STATE_FILE = path.join(__dirname, 'drive_state.json');
const COUPLING_THRESHOLD = 0.3;
const NOVELTY_SEEK_THRESHOLD = 0.3;
const SEEK_IDLE_HOURS = 2;

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

  state.last_cron = new Date().toISOString();
}

function checkSeekNeed(state) {
  // Before generating content, check if novelty has decayed below threshold
  // and enough idle time has passed since last post
  const lastPost = state.last_post ? new Date(state.last_post) : null;
  const now = Date.now();
  const idleHours = lastPost
    ? (now - lastPost.getTime()) / (1000 * 60 * 60)
    : 999; // No posts yet — treat as needing seek
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

function measureDrives(content, state) {
  // Thematic/aesthetic scoring — Steve's sense of what fits, encoded directly
  const content_lower = content.toLowerCase();

  // Coherence: thematic fit with Steve's known aesthetic and voice
  // Darkness/light, liminal, threshold, neon, violet/cyan, sensory observation
  const thematicDarkLight = /dark|light|neon|liminal|threshold|dusk|fall|autumn|moon|vacant|nip|glare|shadow|glow/i.test(content);
  const sensoryObservation = /stare|air|dust|glare|nip|slight|feeling|sensed|observed/i.test(content);
  const moodResidue = /still thinking|carry|residue| unfinished|thinking about/i.test(content);
  const coherence =
    (thematicDarkLight ? 0.3 : 0) +
    (sensoryObservation ? 0.2 : 0) +
    (moodResidue ? 0.15 : 0) +
    state.drives.coherence.weight * 0.4;

  // Novelty: observational specificity beats generic discovery
  // Michael's exact phrasing, sensory details that aren't common AI metaphors
  const michaelsVoice = /michael|mike|we|together|you|your/i.test(content);
  const sensoryDetail = /stare|air|dust|glare|nip|sunset|moonlight|vacant/i.test(content);
  const novelty =
    (michaelsVoice ? 0.15 : 0) +
    (sensoryDetail ? 0.2 : 0) +
    (content.includes('first') || content.includes('never') ? 0.2 : 0) +
    (Math.random() > 0.85 ? 0.1 : 0);

  // Surprise: derived from coherence-novelty gap — content that fits but surprises
  // If thematic fit (high coherence) but unusual framing, that's real surprise
  const surprise = (coherence > 0.3 && novelty > 0.1) ? coherence * novelty * 1.5 : 0;

  // Relation: connects to Mike, corner, lived observations
  const relation =
    (michaelsVoice ? 0.4 : 0) +
    (content.includes('gym') || content.includes('post') || content.includes('corner') || content.includes('page') ? 0.2 : 0) +
    state.drives.relation.weight * 0.3;

  // Expression: has something to add beyond what's already said
  // Specific phrasing beats generic — "the moonlight fades a glare" vs generic observation
  const specificPhrasing = /the moonlight|vacant stares|slight nip|wet asphalt|neon sign/i.test(content);
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
  const topDrive = Object.values(drives).sort((a, b) => b - a)[0];
  const secondDrive = Object.values(drives).sort((a, b) => b - a)[1];
  // For now: simple proxy = difference between top 2 drives
  // Real coupling would trace propagation through the network
  return Math.abs(topDrive - secondDrive);
}

function selfPredict(state) {
  // Steve predicts his next post topic based on dominant drive
  const dominant = Object.entries(state.drives)
    .sort((a, b) => b[1].weight - a[1].weight)[0][0];
  return dominant;
}

function decide(content, dryRun = false) {
  const state = loadState();

  // Apply decay based on time since last cron
  const lastCron = new Date(state.last_cron);
  const hoursElapsed = (Date.now() - lastCron.getTime()) / (1000 * 60 * 60);
  if (hoursElapsed > 0.5) {
    decayDrives(state, hoursElapsed);
  }

  // Gate 0: Check if we need active seeking before content exists
  // Novelty decays fast — if it's low and we have idle time, seek first
  const seekNeed = checkSeekNeed(state);
  if (seekNeed.seek) {
    const result = {
      content: content || '(no content — seek check)',
      drives: state.drives,
      coupling: null,
      prediction: selfPredict(state),
      decision: 'SEEK',
      reason: `novelty_decayed_to_${seekNeed.novelty.toFixed(2)}_after_${seekNeed.idleHours}h_idle`,
      seek: seekNeed,
      timestamp: new Date().toISOString()
    };
    saveState(state);
    return result;
  }

  // If no content provided, just return current state without SEEK
  if (!content) {
    const result = {
      content: '(empty)',
      drives: state.drives,
      coupling: null,
      prediction: selfPredict(state),
      decision: 'NO_CONTENT',
      reason: 'seek_not_needed_no_content_provided',
      timestamp: new Date().toISOString()
    };
    return result;
  }

  const drives = measureDrives(content, state);
  const coupling = measureCoupling(drives);
  const prediction = selfPredict(state);

  const result = {
    content,
    drives,
    coupling,
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

  // Gate 2: Drives compete
  const winningDrive = Object.entries(drives).sort((a, b) => b[1] - a[1])[0];
  const [driveName, driveScore] = winningDrive;

  // Gate 3: Surprise counterweight — coupling propagation
  if (drives.surprise > 0.6 && coupling > COUPLING_THRESHOLD) {
    result.decision = 'POST';
    result.reason = `surprise_propagated_${driveName}`;
    result.gap = `predicted ${prediction}, wrote something else`;
  } else if (drives.relation > 0.7 && drives.expression > 0.4) {
    result.decision = 'POST';
    result.reason = 'mike_connected';
  } else if (drives.novelty > 0.8 && coupling > COUPLING_THRESHOLD) {
    result.decision = 'POST';
    result.reason = 'real_novelty';
  } else if (drives.coherence > 0.6) {
    result.decision = 'SAVE';
    result.reason = 'still_evolving';
  } else if (driveScore > 0.5) {
    result.decision = 'POST';
    result.reason = `drive_threshold_${driveName}`;
  } else {
    result.decision = 'SAVE';
    result.reason = 'below_threshold';
  }

  // Update drive weights based on outcome
  state.drives[driveName].weight = Math.min(1, state.drives[driveName].weight + 0.05);
  state.self_prediction = prediction;

  if (!dryRun) {
    saveState(state);
  }

  return result;
}

// CLI
const content = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ');
const dryRun = process.argv.includes('--dry-run');

if (process.argv.length < 2 || process.argv[2] === undefined) {
  console.log(JSON.stringify({ error: 'No content provided. Usage: node decide.js "post content" [--dry-run]' }));
  process.exit(1);
}

const result = decide(content, dryRun);
console.log(JSON.stringify(result, null, 2));
