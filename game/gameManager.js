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
  }

  /**
   * Generate a new StepBlueprint. A blueprint describes which rooms
   * appear on the forward and backward branches, whether there is an
   * anomaly, and which branch is the correct choice. Probabilities are
   * tuned to create variety but can be adjusted.
   *
   * @param {number} stepIndex The index of the step for which to generate a blueprint.
   * @returns {object} A blueprint object.
   */
  generateBlueprint(stepIndex) {
    // Available room types. More types can be added here as long as
    // corresponding GLB definitions exist in environment/rooms.js.
    const roomTypes = ['corridor', 'sroom'];

    // Randomly choose room type for forward and backward branches.
    let forwardRoomType = roomTypes[Math.floor(Math.random() * roomTypes.length)];
    const backwardRoomType = roomTypes[Math.floor(Math.random() * roomTypes.length)];

    // Randomly decide if an anomaly should appear (e.g., 50% chance).
    const hasAnomaly = Math.random() < 0.6;
    let anomalyType = null;
    let anomalyLocation = null;

    if (hasAnomaly) {
      // Distribute anomaly chances:
      // ~17% each for different anomaly types
      const rand = Math.random();

      if (rand < 0.17) {
        // Grass Added anomaly
        anomalyType = 'GRASS_ADDED';
        anomalyLocation = 'forward';
      } else if (rand < 0.34) {
        // The room itself is the anomaly
        forwardRoomType = 'scaryladyroom';
        anomalyType = 'ROOM';
        anomalyLocation = 'forward';
      } else if (rand < 0.51) {
        // The room itself is the anomaly
        forwardRoomType = 'scarygang';
        anomalyType = 'ROOM';
        anomalyLocation = 'forward';
      } else if (rand < 0.68) {
        // The room itself is the anomaly
        forwardRoomType = 'fiendroom';
        anomalyType = 'ROOM';
        anomalyLocation = 'forward';
      } else if (rand < 0.84) {
        // Weeping Angel Anomaly
        forwardRoomType = 'weepingangelroom';
        anomalyType = 'WEEPING_ANGEL';
        anomalyLocation = 'forward';
      } else {
        // Demon anomaly
        anomalyType = 'DEMON';
        anomalyLocation = 'forward';
      }
    }

    // If there is an anomaly, the correct decision is to turn back.
    // If there is no anomaly, the correct decision is to keep going forward.
    const expectedDecision = hasAnomaly ? 'backward' : 'forward';

    return {
      index: stepIndex,
      forwardRoomType,
      backwardRoomType,
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