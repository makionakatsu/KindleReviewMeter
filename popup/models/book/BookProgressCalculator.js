/**
 * BookProgressCalculator - Progress calculation logic for book review goals
 * Extracted from BookDataModel.js - handles progress metrics and goal tracking
 * 
 * Responsibilities:
 * - Calculate progress percentage based on current vs target reviews
 * - Determine remaining reviews needed to reach goal
 * - Check goal achievement status
 * - Provide progress-related metrics for UI display
 */

export default class BookProgressCalculator {
  constructor() {
    // No instance variables needed - operates on provided data
  }

  /**
   * Calculate progress percentage based on current and target reviews
   * @param {number} currentReviews - Current number of reviews
   * @param {number|null} targetReviews - Target number of reviews
   * @returns {number|null} Progress percentage (0-100) or null if no target
   */
  getProgressPercentage(currentReviews, targetReviews) {
    if (!targetReviews || targetReviews <= 0) {
      return null;
    }
    
    const progress = (currentReviews / targetReviews) * 100;
    return Math.min(100, Math.max(0, Math.round(progress)));
  }

  /**
   * Get remaining reviews needed to reach the target
   * @param {number} currentReviews - Current number of reviews
   * @param {number|null} targetReviews - Target number of reviews
   * @returns {number|null} Remaining reviews or null if no target
   */
  getRemainingReviews(currentReviews, targetReviews) {
    if (!targetReviews || targetReviews <= 0) {
      return null;
    }
    
    return Math.max(0, targetReviews - currentReviews);
  }

  /**
   * Check if the review goal has been achieved
   * @param {number} currentReviews - Current number of reviews
   * @param {number|null} targetReviews - Target number of reviews
   * @returns {boolean} Whether goal is achieved
   */
  isGoalAchieved(currentReviews, targetReviews) {
    const remaining = this.getRemainingReviews(currentReviews, targetReviews);
    return remaining !== null && remaining === 0;
  }

  /**
   * Get comprehensive progress summary
   * @param {number} currentReviews - Current number of reviews
   * @param {number|null} targetReviews - Target number of reviews
   * @returns {Object} Progress summary object
   */
  getProgressSummary(currentReviews, targetReviews) {
    const hasTarget = targetReviews && targetReviews > 0;
    
    return {
      hasTarget,
      currentReviews,
      targetReviews: hasTarget ? targetReviews : null,
      percentage: hasTarget ? this.getProgressPercentage(currentReviews, targetReviews) : null,
      remaining: hasTarget ? this.getRemainingReviews(currentReviews, targetReviews) : null,
      achieved: hasTarget ? this.isGoalAchieved(currentReviews, targetReviews) : false,
      progressText: hasTarget 
        ? `${currentReviews}/${targetReviews} (${this.getProgressPercentage(currentReviews, targetReviews)}%)`
        : `${currentReviews} reviews`
    };
  }

  /**
   * Calculate progress display data for various UI components
   * @param {number} currentReviews - Current number of reviews
   * @param {number|null} targetReviews - Target number of reviews
   * @returns {Object} Display-ready progress data
   */
  getDisplayData(currentReviews, targetReviews) {
    const summary = this.getProgressSummary(currentReviews, targetReviews);
    
    return {
      ...summary,
      // Additional display properties
      progressBarWidth: summary.percentage || 0,
      statusText: summary.achieved 
        ? '🎉 目標達成！' 
        : summary.hasTarget 
          ? `あと${summary.remaining}レビュー` 
          : 'レビューを蓄積中',
      statusClass: summary.achieved 
        ? 'achieved' 
        : summary.hasTarget 
          ? 'in-progress' 
          : 'no-target'
    };
  }
}