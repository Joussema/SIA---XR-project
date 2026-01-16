/**
 * GameManager for step-based Exit8-like gameplay.
 *
 * This module encapsulates all logic for generating step blueprints,
 * tracking the player's progress and decisions, and exposing state
 * information to the rest of the game. It is intentionally free of
 * Three.js or scene concerns; those are handled elsewhere. The
 * GameManager simply describes what the world should look like and
 * which choice is correct at any given step.
 */

export class GameManager {
  /**
   * Construct a new GameManager.
   * @param {number} targetExit The number of consecutive correct exits required to win.
   */
  constructor(targetExit = 8) {
    this.targetExit = targetExit;
    this.currentStep = 0;
    this.exitCount = 0;
    this.lastDecision = null;
    this.lastCorrect = null;
    // Map of step index to blueprint. Blueprints are generated on demand.
    this.blueprints = new Map();
    this.eventQueue = [];
  }

  /**
   * Reset the game state. Clears all stored blueprints and sets counters
   * back to their initial values. Call this before starting a new game.
   */
  initGame() {
    this.currentStep = 0;
    this.exitCount = 0;
    this.lastDecision = null;
    this.lastCorrect = null;
    this.blueprints.clear();
    this.generateQueue();
  }

  /**
   * Generates a shuffled queue of 7 room types for the next cycle (streaks 1-7).
   * - 1x Sroom (Mandatory)
   * - Max 1x Runroom (50% chance)
   * - Max 1x each for other anomalies (Random chance)
   * - Remainder filled with Corridors
   */
  generateQueue() {
    const queue = ['sroom', 'runroom']; // Always include sroom AND runroom

    // Other Anomalies
    const potentialAnomalies = ['scaryladyroom', 'scarygang', 'fiendroom', 'weepingangelroom'];
    // Shuffle potential anomalies to pick random ones if we limit count,
    // or just iterate and decide chance for each.
    // Increased chance to 70% per anomaly to reduce repetitiveness
    potentialAnomalies.forEach(type => {
      if (Math.random() < 0.7) {
        queue.push(type);
      }
    });

    // Fill the rest of the 9 slots with 'corridor'
    while (queue.length < 9) {
      queue.push('corridor');
    }

    // If we have too many, truncate to 9
    while (queue.length > 9) {
      queue.pop();
    }

    // Shuffle
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }

    this.eventQueue = queue;
    console.log("Generated Event Queue:", this.eventQueue);
  }

  /**
   * Generate a new StepBlueprint.
   *
   * @param {number} stepIndex The index of the step for which to generate a blueprint.
   * @returns {object} A blueprint object.
   */
  generateBlueprint(stepIndex) {
    // FORCE INITIAL STATE: Step 0 is always Corridor (Forward) and Deadend (Backward)
    // Also happens if we just reset (streak 0)
    if (stepIndex === 0 || this.exitCount === 0) {
      // Note: stepIndex keeps going up, so check exitCount for logical game stage?
      // Actually, stepIndex is monotonic. using exitCount is better for "Stage" logic.
      // But stepIndex is used for blueprint caching.
      // Let's rely on exitCount for logic, but we need to ensure unique steps get blueprinted.
    }

    // However, the prompt implies "reset buffer" on wrong decision.
    // My registerDecision resets exitCount to 0 on wrong.

    // Check for Win Condition (Streak Reached)
    if (this.exitCount >= this.targetExit) {
      console.log(`Generating Blueprint: Target Reached (${this.exitCount}) - Spawning Ending Room`);
      return {
        index: stepIndex, // Fix: return index
        forwardRoomType: 'ending',
        backwardRoomType: 'deadend',
        hasAnomaly: false,
        anomalyType: null,
        anomalyLocation: null,
        expectedDecision: 'forward',
        correctDecision: 'forward'
      };
    }

    // Streak 0 -> Safe Start
    if (this.exitCount === 0) {
      return {
        index: stepIndex,
        forwardRoomType: 'corridor',
        backwardRoomType: 'deadend',
        hasAnomaly: false,
        anomalyType: null,
        anomalyLocation: null,
        expectedDecision: 'forward',
        correctDecision: 'forward'
      };
    }

    // Streak 1-7 -> Use Queue
    // Queue index = (exitCount - 1). 
    // E.g. Streak 1 (just passed safe step) -> Queue[0]
    // Streak 7 -> Queue[6]
    const queueIndex = this.exitCount - 1;
    let forwardRoomType = 'corridor';
    if (this.eventQueue && queueIndex < this.eventQueue.length) {
      forwardRoomType = this.eventQueue[queueIndex];
    } else {
      // Fallback or if logic drifts
      forwardRoomType = 'corridor';
    }

    let hasAnomaly = false;
    let anomalyType = null;
    let anomalyLocation = null;

    if (forwardRoomType !== 'corridor') {
      hasAnomaly = true;
      anomalyType = forwardRoomType === 'weepingangelroom' ? 'WEEPING_ANGEL' : 'ROOM';
      anomalyLocation = 'forward';
    }

    // Logic: 
    // - Sroom & Runroom: Special events, proceed FORWARD to engage
    // - Anomalies: DANGER, go BACKWARD
    // - Corridor: Safe, go FORWARD
    let expectedDecision = 'forward';

    if (forwardRoomType === 'sroom' || forwardRoomType === 'runroom') {
      expectedDecision = 'forward';
    } else if (hasAnomaly) {
      expectedDecision = 'backward';
    } else {
      expectedDecision = 'forward';
    }

    // Backward Room Logic
    // Sroom & Runroom -> Deadend
    // Others -> Bufferzone (Standard)
    const finalBackwardRoomType = (forwardRoomType === 'sroom' || forwardRoomType === 'runroom') ? 'deadend' : 'bufferzone';

    return {
      index: stepIndex,
      forwardRoomType,
      backwardRoomType: finalBackwardRoomType,
      hasAnomaly,
      anomalyType,
      anomalyLocation,
      expectedDecision,
      exitLabel: null,
    };
  }

  /**
   * Retrieve a blueprint for a given step index, generating it if needed.
   * Blueprints are cached so the same step always yields the same layout.
   *
   * @param {number} stepIndex
   * @returns {object} The blueprint for the requested step.
   */
  getBlueprint(stepIndex) {
    if (!this.blueprints.has(stepIndex)) {
      const bp = this.generateBlueprint(stepIndex);
      this.blueprints.set(stepIndex, bp);
    }
    return this.blueprints.get(stepIndex);
  }

  /**
   * Record a player's decision at the current step and update streak and
   * step counters. Returns whether the decision matched the blueprint's
   * expected decision.
   *
   * @param {'forward'|'backward'} decision
   * @returns {boolean} True if the decision was correct, false otherwise.
   */
  registerDecision(decision) {
    const bp = this.getBlueprint(this.currentStep);
    const correct = decision === bp.expectedDecision;
    this.lastDecision = decision;
    this.lastCorrect = correct;
    if (correct) {
      this.exitCount += 1;
    } else {
      // Wrong answers reset the consecutive streak.
      this.exitCount = 0;
      // RE-GENERATE QUEUE on failure to ensure variety next time
      this.generateQueue();
    }
    this.currentStep += 1;
    return correct;
  }

  /**
   * Get a read-only snapshot of the current game state. Useful for
   * updating UI elements without exposing internal fields directly.
   *
   * @returns {object} An object containing state information.
   */
  getState() {
    return {
      currentStep: this.currentStep,
      exitCount: this.exitCount,
      targetExit: this.targetExit,
      lastDecision: this.lastDecision,
      lastCorrect: this.lastCorrect,
    };
  }
}