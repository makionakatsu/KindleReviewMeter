/**
 * Action Handler Management Service
 * 
 * Extracted from PopupController.js for better separation of concerns
 * 
 * Responsibilities:
 * - Handle all business logic for popup operations
 * - Manage Amazon data fetching, saving, sharing, and export operations
 * - Coordinate between Model, View, and Message services
 * - Handle form validation and state management
 * - Provide progress tracking and user feedback
 * 
 * This service focuses exclusively on business logic operations,
 * making the controller more maintainable and testable.
 */

export class ActionHandler {
  constructor(bookModel, uiManager, messageHandler, stateManager) {
    this.bookModel = bookModel;
    this.uiManager = uiManager;
    this.messageHandler = messageHandler;
    this.stateManager = stateManager;
  }

  // ============================================================================
  // AMAZON OPERATIONS
  // ============================================================================

  /**
   * Handle Amazon data fetch operation
   */
  async handleAmazonFetch() {
    if (this.stateManager.isOperationInProgress()) {
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
      this.stateManager.startOperation('amazonFetch');
      this.uiManager.setButtonLoading('fetchAmazonBtn', true, '🔍 取得中...');
      
      console.log('ActionHandler: Fetching Amazon data for:', amazonUrl);
      
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
      console.error('ActionHandler: Amazon fetch failed:', error);
      this.uiManager.showError('Amazon書籍データの取得中にエラーが発生しました');
    } finally {
      this.stateManager.endOperation();
      this.uiManager.setButtonLoading('fetchAmazonBtn', false);
    }
  }

  /**
   * Handle successful Amazon data fetch
   * @private
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
      await this.handleSave(true);
    } else {
      this.uiManager.displayValidationErrors(updateResult.errors);
    }
  }

  /**
   * Handle Amazon data fetch error
   * @private
   * @param {string} error - Error message
   */
  handleAmazonFetchError(error) {
    const errorMsg = error || 'Amazon書籍データの取得に失敗しました';
    this.uiManager.showError(errorMsg);
  }

  // ============================================================================
  // SAVE OPERATIONS
  // ============================================================================

  /**
   * Handle save operation
   * @param {boolean} silent - Whether to show user feedback
   * @returns {Promise<boolean>} True if save successful
   */
  async handleSave(silent = false) {
    try {
      // Get form data and update model
      const formData = this.uiManager.getFormData();
      const validationResult = this.bookModel.setData(formData, true);
      
      if (!validationResult.isValid) {
        this.uiManager.displayValidationErrors(validationResult.errors);
        return false;
      }
      
      // Save to storage
      const saveResult = await this.bookModel.save();
      
      if (saveResult) {
        this.stateManager.recordSaveTime();
        this.uiManager.setDirty(false);
        
        if (!silent) {
          this.uiManager.showSuccess('データを保存しました');
        }
        
        console.log('ActionHandler: Data saved successfully');
        return true;
      } else {
        if (!silent) {
          this.uiManager.showError('データの保存に失敗しました');
        }
        return false;
      }
      
    } catch (error) {
      console.error('ActionHandler: Save failed:', error);
      if (!silent) {
        this.uiManager.showError('保存中にエラーが発生しました');
      }
      return false;
    }
  }

  // ============================================================================
  // SHARE OPERATIONS
  // ============================================================================

  /**
   * Handle share to X operation
   */
  async handleShareToX() {
    if (this.stateManager.isOperationInProgress()) {
      this.uiManager.showInfo('他の操作が実行中です。しばらくお待ちください。');
      return;
    }
    
    try {
      // Validate data first
      if (!this.validateDataForOperation()) {
        return;
      }
      
      this.stateManager.startOperation('shareToX');
      this.uiManager.setButtonLoading('shareToXBtn', true, '🐦 投稿準備中...');
      
      // Generate tweet text
      const tweetText = this.bookModel.generateTweetText();
      console.log('ActionHandler: Generated tweet text:', tweetText);
      
      // Create X compose URL
      const tweetUrl = `https://x.com/compose/tweet?text=${encodeURIComponent(tweetText)}`;
      
      // Send message to background script for X share with image
      const response = await this.messageHandler.sendMessageToBackground({
        action: 'shareToXWithImage',
        data: this.bookModel.exportForImageGeneration(),
        tweetUrl: tweetUrl
      });
      
      if (response?.success || response?.data?.success) {
        this.uiManager.showSuccess('X投稿ページを開きました。画像は自動で添付されます。');
        
        // Auto-save after successful share initiation
        await this.handleSave(true);
      } else {
        const errorMsg = response.error || 'X投稿の準備に失敗しました';
        this.uiManager.showError(errorMsg);
      }
      
    } catch (error) {
      console.error('ActionHandler: Share to X failed:', error);
      this.uiManager.showError('X投稿中にエラーが発生しました');
    } finally {
      this.stateManager.endOperation();
      this.uiManager.setButtonLoading('shareToXBtn', false);
    }
  }

  // ============================================================================
  // EXPORT OPERATIONS
  // ============================================================================

  /**
   * Handle image export operation
   */
  async handleImageExport() {
    if (this.stateManager.isOperationInProgress()) {
      this.uiManager.showInfo('他の操作が実行中です。しばらくお待ちください。');
      return;
    }
    
    try {
      // Validate data first
      if (!this.validateDataForOperation()) {
        return;
      }
      
      this.stateManager.startOperation('imageExport');
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
      console.error('ActionHandler: Image export failed:', error);
      this.uiManager.showError('画像エクスポート中にエラーが発生しました');
    } finally {
      this.stateManager.endOperation();
      this.uiManager.setButtonLoading('exportBtn', false);
    }
  }

  // ============================================================================
  // CLEAR OPERATIONS
  // ============================================================================

  /**
   * Handle clear operation
   */
  async handleClear() {
    // Confirm if there are unsaved changes
    if (this.uiManager.isDirty()) {
      const confirmed = confirm('未保存の変更があります。本当にクリアしますか？');
      if (!confirmed) {
        return;
      }
    }
    
    try {
      // Clear model data
      await this.bookModel.clear();
      
      // Clear UI form
      this.uiManager.clearForm();
      
      // Update progress display
      this.updateProgressDisplay();
      
      this.uiManager.showSuccess('データをクリアしました');
      console.log('ActionHandler: Data cleared');
      
    } catch (error) {
      console.error('ActionHandler: Clear failed:', error);
      this.uiManager.showError('クリア中にエラーが発生しました');
    }
  }

  // ============================================================================
  // FORM OPERATIONS
  // ============================================================================

  /**
   * Handle form change events
   */
  handleFormChange() {
    // Update model with current form data (without validation)
    const formData = this.uiManager.getFormData();
    this.bookModel.setData(formData, false);
    
    // Mark as dirty
    this.uiManager.setDirty(true);
    
    // Clear validation errors on change
    this.uiManager.clearValidationErrors();
  }

  /**
   * Validate specific field
   * @param {string} fieldName - Field name to validate
   */
  validateField(fieldName) {
    return this.uiManager.validateField(fieldName);
  }

  /**
   * Clear field error
   * @param {string} fieldName - Field name to clear error for
   */
  clearFieldError(fieldName) {
    this.uiManager.clearFieldError(fieldName);
  }

  // ============================================================================
  // PROGRESS AND DISPLAY OPERATIONS
  // ============================================================================

  /**
   * Update progress display based on current data
   */
  updateProgressDisplay() {
    const data = this.bookModel.getData();
    const progressData = {
      currentReviews: data.currentReviews,
      targetReviews: data.targetReviews,
      progressPercentage: this.bookModel.getProgressPercentage(),
      remainingReviews: this.bookModel.getRemainingReviews(),
      isGoalAchieved: this.bookModel.isGoalAchieved()
    };
    
    this.uiManager.updateProgressDisplay(progressData);
  }

  // ============================================================================
  // VALIDATION HELPERS
  // ============================================================================

  /**
   * Validate data for operations that require complete data
   * @private
   * @returns {boolean} True if data is valid for operations
   */
  validateDataForOperation() {
    // Validate data first
    const formData = this.uiManager.getFormData();
    const validationResult = this.bookModel.setData(formData, true);
    
    if (!validationResult.isValid) {
      this.uiManager.displayValidationErrors(validationResult.errors);
      return false;
    }
    
    if (!this.bookModel.isComplete()) {
      this.uiManager.showError('タイトル、著者名、レビュー数は必須です');
      return false;
    }
    
    return true;
  }

  // ============================================================================
  // LIFECYCLE OPERATIONS
  // ============================================================================

  /**
   * Handle popup initialization operations
   */
  async handleInitialization() {
    try {
      console.log('ActionHandler: Handling initialization');
      
      // Load saved data
      await this.loadSavedData();
      
      // Check for pending URL from context menu
      await this.checkPendingUrl();
      
      console.log('ActionHandler: Initialization complete');
      
    } catch (error) {
      console.error('ActionHandler: Initialization failed:', error);
      this.uiManager.showError('アプリケーションの初期化に失敗しました');
    }
  }

  /**
   * Load saved data from storage
   * @private
   */
  async loadSavedData() {
    try {
      const data = await this.bookModel.load();
      this.uiManager.setFormData(data);
      
      // Update progress display if target is set
      if (data.targetReviews) {
        this.updateProgressDisplay();
      }
      
      console.log('ActionHandler: Saved data loaded and UI updated');
    } catch (error) {
      console.error('ActionHandler: Failed to load saved data:', error);
      this.uiManager.showError('保存されたデータの読み込みに失敗しました');
    }
  }

  /**
   * Check for pending URL from context menu
   * @private
   */
  async checkPendingUrl() {
    try {
      const pendingUrl = await this.messageHandler.checkPendingUrl();
      if (pendingUrl) {
        // Set URL and trigger fetch
        document.getElementById('amazonUrl').value = pendingUrl;
        await this.handleAmazonFetch();
      }
    } catch (error) {
      console.warn('ActionHandler: Failed to check pending URL:', error);
    }
  }

  /**
   * Handle popup cleanup operations
   */
  handleCleanup() {
    console.log('ActionHandler: Handling cleanup');
    
    // Auto-save if there are unsaved changes
    if (this.uiManager.isDirty() && this.bookModel.isComplete()) {
      this.handleSave(true);
    }
    
    // Clear any pending operations
    this.stateManager.endOperation();
  }

  /**
   * Refresh controller data
   */
  async refresh() {
    console.log('ActionHandler: Refreshing data');
    
    try {
      // Reload data from storage
      await this.loadSavedData();
      
      // Update progress display
      this.updateProgressDisplay();
      
      // Clear dirty state
      this.uiManager.setDirty(false);
      
      this.uiManager.showInfo('データを再読み込みしました');
    } catch (error) {
      console.error('ActionHandler: Refresh failed:', error);
      this.uiManager.showError('再読み込み中にエラーが発生しました');
    }
  }

  // ============================================================================
  // STATE ACCESS
  // ============================================================================

  /**
   * Get current action handler state
   * @returns {Object} Current state information
   */
  getState() {
    return {
      hasUnsavedChanges: this.uiManager.isDirty(),
      isDataComplete: this.bookModel.isComplete(),
      currentOperation: this.stateManager.getCurrentOperation(),
      lastSaveTime: this.stateManager.getLastSaveTime(),
      bookData: this.bookModel.getSummary()
    };
  }
}