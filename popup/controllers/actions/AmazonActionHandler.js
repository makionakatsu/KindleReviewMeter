/**
 * AmazonActionHandler - Amazon data fetching and processing operations
 * Extracted from ActionHandler.js - handles Amazon-specific business logic
 * 
 * Responsibilities:
 * - Amazon book data fetching orchestration
 * - Success and error handling for Amazon operations
 * - Data validation and UI updates after fetch
 * - Integration with background Amazon scraping service
 */

export default class AmazonActionHandler {
  constructor(bookModel, uiManager, messageHandler, stateManager) {
    this.bookModel = bookModel;
    this.uiManager = uiManager;
    this.messageHandler = messageHandler;
    this.stateManager = stateManager;
  }

  /**
   * Handle Amazon book data fetch operation
   * Main entry point for Amazon data fetching workflow
   */
  async handleAmazonFetch() {
    if (this.stateManager && this.stateManager.isOperationInProgress()) {
      this.uiManager.showInfo('他の操作が実行中です。しばらくお待ちください。');
      return;
    }
    
    const amazonUrl = document.getElementById('amazonUrl').value.trim();
    if (!amazonUrl) {
      this.uiManager.showError('Amazon URLを入力してください');
      this.uiManager.focusField('amazonUrl');
      return;
    }
    
    try {
      if (this.stateManager) this.stateManager.startOperation('amazonFetch');
      this.uiManager.setButtonLoading('fetchAmazonBtn', true, '🔍 取得中...');
      
      console.log('AmazonActionHandler: Fetching Amazon data for:', amazonUrl);
      
      // Send message to background script
      const response = await this.messageHandler.sendMessageToBackground({
        action: 'fetchAmazonData',
        url: amazonUrl
      });
      
      if (response.success && response.data) {
        await this.handleAmazonFetchSuccess(response.data);
      } else {
        this.handleAmazonFetchError(response.error);
      }
      
    } catch (error) {
      console.error('AmazonActionHandler: Amazon fetch failed:', error);
      this.uiManager.showError('Amazon書籍データの取得中にエラーが発生しました');
    } finally {
      if (this.stateManager) this.stateManager.endOperation();
      this.uiManager.setButtonLoading('fetchAmazonBtn', false);
    }
  }

  /**
   * Handle successful Amazon data fetch
   * @param {Object} data - Fetched Amazon data
   */
  async handleAmazonFetchSuccess(data) {
    // Update model with fetched data
    const updateResult = this.bookModel.updateFromAmazonData(data);
    
    if (updateResult.isValid) {
      // Update UI with new data
      this.uiManager.setFormData(this.bookModel.getData());
      this.updateProgressDisplay();
      
      this.uiManager.showSuccess('Amazon書籍データを取得しました');

      // Warn if review count could not be detected
      if (data.extraction && data.extraction.reviewCountSource === 'none') {
        this.uiManager.showWarning('レビュー数を検出できませんでした。ページ構造の変更の可能性があります。');
      }
      
      // Auto-save after successful fetch
      await this.autoSaveAfterFetch();
    } else {
      this.uiManager.displayValidationErrors(updateResult.errors);
    }
  }

  /**
   * Handle Amazon data fetch error
   * @param {string} error - Error message
   */
  handleAmazonFetchError(error) {
    const errorMsg = error || 'Amazon書籍データの取得に失敗しました';
    this.uiManager.showError(errorMsg);
  }

  /**
   * Update progress display after Amazon data fetch
   * @private
   */
  updateProgressDisplay() {
    // This method should be provided by the main ActionHandler
    // or delegated to a progress display service
    const progressData = this.bookModel.getProgressPercentage();
    const remainingData = this.bookModel.getRemainingReviews();
    
    if (this.uiManager.updateProgressDisplay) {
      this.uiManager.updateProgressDisplay({
        percentage: progressData,
        remaining: remainingData,
        achieved: this.bookModel.isGoalAchieved()
      });
    }
  }

  /**
   * Auto-save after successful Amazon fetch
   * @private
   */
  async autoSaveAfterFetch() {
    try {
      const result = await this.bookModel.save();
      if (result.success) {
        console.log('AmazonActionHandler: Auto-saved after Amazon fetch');
      }
    } catch (error) {
      console.warn('AmazonActionHandler: Auto-save failed:', error);
    }
  }

  /**
   * Validate Amazon URL format
   * @param {string} url - URL to validate
   * @returns {boolean} Whether URL is valid Amazon format
   */
  isValidAmazonUrl(url) {
    const amazonUrlPattern = /^https?:\/\/(?:www\.)?amazon\.co\.jp\/(?:dp\/|gp\/product\/)([A-Z0-9]{10})(?:\/|$|\?)/i;
    return amazonUrlPattern.test(url);
  }

  /**
   * Extract ASIN from Amazon URL
   * @param {string} url - Amazon URL
   * @returns {string|null} ASIN or null if not found
   */
  extractAsinFromUrl(url) {
    const match = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    return match ? match[1] : null;
  }

  /**
   * Get operation status for UI feedback
   * @returns {Object} Current operation status
   */
  getOperationStatus() {
    return {
      isInProgress: this.stateManager ? this.stateManager.isOperationInProgress() : false,
      currentOperation: this.stateManager ? this.stateManager.getCurrentOperation() : null,
      canFetch: this.stateManager ? !this.stateManager.isOperationInProgress() : true
    };
  }
}