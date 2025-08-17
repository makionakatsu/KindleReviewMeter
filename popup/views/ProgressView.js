/**
 * ProgressView - Render progress section for target reviews
 * Behavior is ported from UIStateManager.updateProgressDisplay to keep UI identical.
 */
export function updateProgressDisplay(elements, progressData) {
  const {
    currentReviews,
    targetReviews,
    progressPercentage,
    remainingReviews,
    isGoalAchieved
  } = progressData || {};

  // Create or update progress section
  let progressSection = document.getElementById('progress-section');
  if (!progressSection && targetReviews) {
    progressSection = createProgressSection(elements);
  }

  if (progressSection && targetReviews) {
    updateProgressContent(progressSection, {
      currentReviews,
      targetReviews,
      progressPercentage,
      remainingReviews,
      isGoalAchieved
    });
  } else if (progressSection && !targetReviews) {
    // Remove progress section if no target set
    progressSection.remove();
  }
}

function createProgressSection(elements) {
  const progressSection = document.createElement('div');
  progressSection.id = 'progress-section';
  progressSection.className = 'progress-section';
  progressSection.style.cssText = `
    margin: 16px 0;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 6px;
    border-left: 4px solid #3498db;
  `;

  // Insert after target reviews field
  const targetField = elements.targetReviews?.parentNode;
  if (targetField && targetField.parentNode) {
    targetField.parentNode.insertBefore(progressSection, targetField.nextSibling);
  }

  return progressSection;
}

function updateProgressContent(progressSection, data) {
  const {
    currentReviews,
    targetReviews,
    progressPercentage,
    remainingReviews,
    isGoalAchieved
  } = data;

  const statusEmoji = isGoalAchieved ? '🎉' : '📈';
  const statusText = isGoalAchieved ? '目標達成！' : `あと${remainingReviews}件`;
  const statusColor = isGoalAchieved ? '#27ae60' : '#3498db';

  const pctText = (typeof progressPercentage === 'number')
    ? `${progressPercentage.toFixed(1)}%` : '0%';

  progressSection.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <span style="font-weight: 500; color: #2c3e50;">進捗状況</span>
      <span style="color: ${statusColor}; font-weight: 500;">${statusEmoji} ${statusText}</span>
    </div>
    <div style="background: #ecf0f1; border-radius: 10px; height: 8px; overflow: hidden; margin-bottom: 8px;">
      <div style="background: ${statusColor}; height: 100%; width: ${progressPercentage || 0}%; transition: width 0.3s ease;"></div>
    </div>
    <div style="font-size: 12px; color: #7f8c8d;">
      ${currentReviews || 0} / ${targetReviews || 0} レビュー (${pctText})
    </div>
  `;
}
