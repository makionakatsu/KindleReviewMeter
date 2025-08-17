/**
 * Action Handler Management Service (Modularized)
 * 
 * Core Responsibilities:
 * - Coordinate between specialized action services
 * - Handle initialization and cleanup operations
 * - Provide unified API for popup controller operations
 * - Manage high-level operation flow and error handling
 * 
 * Service Delegation:
 * - Amazon operations delegated to AmazonActionHandler
 * - Sharing operations delegated to ShareActionHandler
 * - Data operations delegated to DataActionHandler
 */

import AmazonActionHandler from './actions/AmazonActionHandler.js';
import ShareActionHandler from './actions/ShareActionHandler.js';
import DataActionHandler from './actions/DataActionHandler.js';

export default class ActionHandler {
  constructor(bookModel, uiManager, messageHandler, stateManager) {
    this.bookModel = bookModel;
    this.uiManager = uiManager;
    this.messageHandler = messageHandler;
    this._stateManager = stateManager;
    
    // Initialize specialized action handlers
    this.amazonHandler = new AmazonActionHandler(bookModel, uiManager, messageHandler, stateManager);
    this.shareHandler = new ShareActionHandler(bookModel, uiManager, messageHandler, stateManager);
    this.dataHandler = new DataActionHandler(bookModel, uiManager, stateManager);
  }

  // Setter for stateManager to handle circular dependency
  set stateManager(value) {
    this._stateManager = value;
    // Propagate to child handlers
    if (this.amazonHandler) this.amazonHandler.stateManager = value;
    if (this.shareHandler) this.shareHandler.stateManager = value;
    if (this.dataHandler) this.dataHandler.stateManager = value;
  }

  get stateManager() {
    return this._stateManager;
  }

  // ============================================================================
  // AMAZON OPERATIONS - Delegated to AmazonActionHandler
  // ============================================================================

  async handleAmazonFetch() {
    return this.amazonHandler.handleAmazonFetch();
  }

  async handleAmazonFetchSuccess(data) {
    return this.amazonHandler.handleAmazonFetchSuccess(data);
  }

  handleAmazonFetchError(error) {
    return this.amazonHandler.handleAmazonFetchError(error);
  }

  // ============================================================================
  // DATA OPERATIONS - Delegated to DataActionHandler
  // ============================================================================

  async handleSave(silent = false) {
    return this.dataHandler.handleSave(silent);
  }

  async handleClear() {
    return this.dataHandler.handleClear();
  }

  handleFormChange() {
    return this.dataHandler.handleFormChange();
  }

  validateField(fieldName) {
    return this.dataHandler.validateField(fieldName);
  }

  clearFieldError(fieldName) {
    return this.dataHandler.clearFieldError(fieldName);
  }

  // ============================================================================
  // SHARE OPERATIONS - Delegated to ShareActionHandler
  // ============================================================================

  async handleShareToX() {
    return this.shareHandler.handleShareToX();
  }

  async handleImageExport() {
    return this.shareHandler.handleImageExport();
  }

  validateDataForOperation() {
    return this.shareHandler.validateDataForOperation();
  }


  // ============================================================================
  // PROGRESS AND DISPLAY OPERATIONS
  // ============================================================================

  /**
   * Update progress display based on current data
   */
  updateProgressDisplay() {
    return this.dataHandler.updateProgressDisplay();
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
      await this.dataHandler.loadSavedData();
      
      // Check for pending URL from context menu
      await this.checkPendingUrl();
      
      console.log('ActionHandler: Initialization complete');
      
    } catch (error) {
      console.error('ActionHandler: Initialization failed:', error);
      this.uiManager.showError('アプリケーションの初期化に失敗しました');
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
      this.dataHandler.autoSave();
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
      await this.dataHandler.loadSavedData();
      
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