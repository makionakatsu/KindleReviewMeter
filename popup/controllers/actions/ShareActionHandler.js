/**
 * ShareActionHandler - Social sharing and export operations
 * Extracted from ActionHandler.js - handles sharing and export business logic
 * 
 * Responsibilities:
 * - X/Twitter sharing with automatic image attachment
 * - Image export and generation coordination
 * - Tweet text generation and URL creation
 * - Background service integration for sharing operations
 */

export default class ShareActionHandler {
  constructor(bookModel, uiManager, messageHandler, stateManager) {
    this.bookModel = bookModel;
    this.uiManager = uiManager;
    this.messageHandler = messageHandler;
    this.stateManager = stateManager;
  }

  /**
   * Handle X/Twitter sharing with automatic image attachment
   */
  async handleShareToX() {
    if (this.stateManager && this.stateManager.isOperationInProgress()) {
      this.uiManager.showInfo('他の操作が実行中です。しばらくお待ちください。');
      return;
    }
    
    try {
      // Validate data first
      if (!this.validateDataForOperation()) {
        return;
      }
      
      if (this.stateManager) this.stateManager.startOperation('shareToX');
      this.uiManager.setButtonLoading('shareToXBtn', true, '🐦 投稿準備中...');
      
      // Generate tweet text
      const tweetText = this.bookModel.generateTweetText();
      console.log('ShareActionHandler: Generated tweet text:', tweetText);
      
      // Open a blank compose and inject text inside the same draft as the image.
      const tweetUrl = this.createXComposeUrl();
      
      // Send message to background script for X share with image
      const response = await this.messageHandler.sendMessageToBackground({
        action: 'shareToXWithImage',
        data: this.bookModel.exportForImageGeneration(),
        tweetUrl: tweetUrl,
        tweetText
      }, 30000, 0); // no retry: avoid duplicate compose tab creation on transient callback issues

      const payload = response?.data || response || {};
      const succeeded = !!response?.success && payload?.success !== false;

      if (succeeded) {
        const shareId = typeof payload?.shareId === 'string' ? payload.shareId : null;
        const policy = payload?.policy === 'strict_affinity' ? 'strict_affinity' : null;
        const suffix = shareId ? ` (shareId: ${shareId})` : '';
        const policyText = policy ? ' [strict]' : '';
        this.uiManager.showSuccess(`X投稿ページを開きました。画像は自動で添付されます。${policyText}${suffix}`);

        // Auto-save after successful share initiation
        await this.autoSaveAfterShare();
      } else {
        const failedReason = payload?.failedReason || response?.failedReason || null;
        const errorMsg = payload?.error || response?.error || 'X投稿の準備に失敗しました';
        const detail = failedReason ? ` (${failedReason})` : '';
        this.uiManager.showError(`自動添付中断（再実行してください）: ${errorMsg}${detail}`);
      }
      
    } catch (error) {
      console.error('ShareActionHandler: Share to X failed:', error);
      this.uiManager.showError('X投稿中にエラーが発生しました');
    } finally {
      if (this.stateManager) this.stateManager.endOperation();
      this.uiManager.setButtonLoading('shareToXBtn', false);
    }
  }

  /**
   * Handle image export and generation operation
   */
  async handleImageExport() {
    if (this.stateManager && this.stateManager.isOperationInProgress()) {
      this.uiManager.showInfo('他の操作が実行中です。しばらくお待ちください。');
      return;
    }
    
    try {
      // Validate data first
      if (!this.validateDataForOperation()) {
        return;
      }
      
      if (this.stateManager) this.stateManager.startOperation('imageExport');
      this.uiManager.setButtonLoading('exportBtn', true, '🖼️ 画像生成中...');
      
      // Send message to background script
      const response = await this.messageHandler.sendMessageToBackground({
        action: 'exportProgressImage',
        data: this.bookModel.exportForImageGeneration()
      });

      // Be tolerant: treat undefined/empty response as success to avoid false negatives
      if (!response || response?.success || response?.data?.success) {
        this.uiManager.showSuccess('画像生成ページを開きました');
      } else {
        const errorMsg = response.error || '画像エクスポートに失敗しました';
        this.uiManager.showError(errorMsg);
      }
      
    } catch (error) {
      console.error('ShareActionHandler: Image export failed:', error);
      this.uiManager.showError('画像エクスポート中にエラーが発生しました');
    } finally {
      if (this.stateManager) this.stateManager.endOperation();
      this.uiManager.setButtonLoading('exportBtn', false);
    }
  }

  /**
   * Validate data completeness for sharing operations
   * @returns {boolean} Whether data is valid for sharing
   */
  validateDataForOperation() {
    if (!this.bookModel.isComplete()) {
      this.uiManager.showError('必要な書籍情報が不足しています（タイトル、著者、レビュー数が必要）');
      return false;
    }
    
    const validationResult = this.bookModel.validateData(this.bookModel.getData());
    if (!validationResult.isValid) {
      this.uiManager.displayValidationErrors(validationResult.errors);
      return false;
    }
    
    return true;
  }

  /**
   * Generate tweet text with current book data
   * @returns {string} Generated tweet text
   */
  generateTweetText() {
    return this.bookModel.generateTweetText();
  }

  /**
   * Create X compose URL.
   * Text is injected after the compose page loads so text and image stay in one draft.
   * @returns {string} X compose URL
   */
  createXComposeUrl() {
    return 'https://x.com/compose/tweet';
  }

  /**
   * Auto-save after successful share initiation
   * @private
   */
  async autoSaveAfterShare() {
    try {
      const result = await this.bookModel.save();
      if (result.success) {
        console.log('ShareActionHandler: Auto-saved after share');
      }
    } catch (error) {
      console.warn('ShareActionHandler: Auto-save failed:', error);
    }
  }

  /**
   * Prepare data for image generation
   * @returns {Object} Image generation data
   */
  prepareImageGenerationData() {
    return this.bookModel.exportForImageGeneration();
  }

  /**
   * Get sharing operation status
   * @returns {Object} Current sharing status
   */
  getSharingStatus() {
    const currentOp = this.stateManager ? this.stateManager.getCurrentOperation() : null;
    return {
      isSharing: currentOp === 'shareToX',
      isExporting: currentOp === 'imageExport',
      canShare: this.stateManager ? !this.stateManager.isOperationInProgress() && this.bookModel.isComplete() : this.bookModel.isComplete(),
      canExport: this.stateManager ? !this.stateManager.isOperationInProgress() && this.bookModel.isComplete() : this.bookModel.isComplete()
    };
  }

  /**
   * Get share-ready summary of current book data
   * @returns {Object} Share summary
   */
  getShareSummary() {
    const data = this.bookModel.getData();
    const summary = this.bookModel.getSummary();
    
    return {
      title: data.title,
      author: data.author,
      currentReviews: data.currentReviews,
      targetReviews: data.targetReviews,
      progressPercentage: this.bookModel.getProgressPercentage(),
      remainingReviews: this.bookModel.getRemainingReviews(),
      isGoalAchieved: this.bookModel.isGoalAchieved(),
      hasImage: !!data.imageUrl,
      shareableUrl: this.bookModel.getShareableUrl(),
      tweetText: this.bookModel.generateTweetText()
    };
  }
}
