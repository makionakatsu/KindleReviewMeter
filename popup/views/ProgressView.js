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

  // Enhanced progress styling for different achievement levels
  const percentage = progressPercentage || 0;
  
  let statusEmoji, statusText, statusColor, progressBarStyle;
  
  if (percentage > 100) {
    // Over 100% - Super achievement with colorful gradient
    statusEmoji = '✨';
    statusText = `目標超過達成！ (${percentage}%)`;
    statusColor = '#ff6b6b';
    progressBarStyle = `
      background: linear-gradient(90deg, 
        #ffeb3b 0%, #ff9800 25%, #e91e63 50%, #9c27b0 75%, #3f51b5 100%);
    `;
  } else if (percentage === 100) {
    // Exactly 100% - Goal achieved
    statusEmoji = '🎉';
    statusText = '目標達成！';
    statusColor = '#27ae60';
    progressBarStyle = `background: ${statusColor};`;
  } else if (percentage >= 0) {
    // Under 100% - Normal progress with blue-green gradient
    statusEmoji = '📈';
    statusText = `あと${remainingReviews}件`;
    statusColor = '#3498db';
    progressBarStyle = `
      background: linear-gradient(90deg, #4fc3f7 0%, #81c784 100%);
    `;
  } else {
    // Fallback for invalid data
    statusEmoji = '📊';
    statusText = 'データを確認中...';
    statusColor = '#95a5a6';
    progressBarStyle = `background: ${statusColor};`;
  }

  // Show accurate percentage in text (can exceed 100%)
  const pctText = (typeof progressPercentage === 'number' && progressPercentage >= 0)
    ? `${progressPercentage}%` : '0%';

  // Cap visual progress bar at 100% but show full percentage in text
  const visualProgress = Math.min(Math.max(percentage, 0), 100);

  progressSection.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <span style="font-weight: 500; color: #2c3e50;">進捗状況</span>
      <span style="color: ${statusColor}; font-weight: 500;">${statusEmoji} ${statusText}</span>
    </div>
    <div style="background: #ecf0f1; border-radius: 10px; height: 10px; overflow: hidden; margin-bottom: 8px;">
      <div style="${progressBarStyle} height: 100%; width: ${visualProgress}%; border-radius: 10px;"></div>
    </div>
    <div style="font-size: 12px; color: #7f8c8d; ${percentage > 100 ? 'font-weight: 500;' : ''}">
      ${currentReviews || 0} / ${targetReviews || 0} レビュー (${pctText})
    </div>
  `;
}
