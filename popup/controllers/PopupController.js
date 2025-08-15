/**
 * PopupController - Main Popup Controller
 * 
 * Responsibilities:
 * - Coordinate between Model (BookDataModel) and View (UIManager)
 * - Handle user interactions and business logic
 * - Manage communication with background script
 * - Control application flow and state transitions
 * - Handle error cases and user feedback
 * 
 * Architecture:
 * - MVC pattern implementation for popup
 * - Event-driven architecture
 * - Separation of concerns between data, UI, and business logic
 * - Centralized error handling and user feedback
 */

import BookDataModel from '../models/BookDataModel.js';
import UIManager from '../views/UIManager.js';

export default class PopupController {
  constructor(storageService, toastService) {
    this.storageService = storageService;
    this.toastService = toastService;
    
    // Initialize Model and View
    this.bookModel = new BookDataModel(storageService);
    this.uiManager = new UIManager(toastService);
    
    // Controller state
    this.state = {
      isInitialized: false,
      currentOperation: null,
      lastSaveTime: null
    };
    
    // Initialize controller
    this.init();
  }
  /**
   * Notes:
   * - Controller wires Model and View; it coordinates background messaging.
   * - Avoid embedding parsing or drawing logic; delegate to services.
   */

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the popup controller
   */
  async init() {
    try {
      console.log('🎮 PopupController initializing...');
      
      // Load saved data
      await this.loadSavedData();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Check for pending URL from context menu
      await this.checkPendingUrl();
      
      // Auto-save setup
      this.setupAutoSave();
      
      this.state.isInitialized = true;
      console.log('✅ PopupController initialized successfully');
      
    } catch (error) {
      console.error('❌ PopupController initialization failed:', error);
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
      
      console.log('📚 Saved data loaded and UI updated');
    } catch (error) {
      console.error('Failed to load saved data:', error);
      this.uiManager.showError('保存されたデータの読み込みに失敗しました');
    }
  }

  /**
   * Setup event listeners for UI interactions
   * @private
   */
  setupEventListeners() {
    // Button event listeners
    this.setupButtonListeners();
    
    // Form change listeners
    this.setupFormChangeListeners();
    
    // Background script message listeners
    this.setupMessageListeners();
    
    console.log('👂 Event listeners setup complete');
  }

  /**
   * Setup button event listeners
   * @private
   */
  setupButtonListeners() {
    // Amazon fetch button
    const fetchBtn = document.getElementById('fetchAmazonBtn');
    if (fetchBtn) {
      fetchBtn.addEventListener('click', () => this.handleAmazonFetch());
    }
    
    // Save button
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.handleSave());
    }
    
    // Share to X button
    const shareBtn = document.getElementById('shareToXBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => this.handleShareToX());
    }
    
    // Export image button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.handleImageExport());
    }
    
    // Clear button
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.handleClear());
    }
  }

  /**
   * Setup form change listeners
   * @private
   */
  setupFormChangeListeners() {
    const formElements = [
      'amazonUrl', 'title', 'author', 'imageUrl',
      'reviewCount', 'targetReviews', 'associateTag', 'associateEnabled'
    ];
    
    formElements.forEach(elementName => {
      const element = document.getElementById(elementName);
      if (element) {
        element.addEventListener('input', () => this.handleFormChange());
        element.addEventListener('change', () => this.handleFormChange());
      }
    });
    
    // Special handling for target reviews to update progress
    const targetReviewsElement = document.getElementById('targetReviews');
    if (targetReviewsElement) {
      targetReviewsElement.addEventListener('input', () => this.updateProgressDisplay());
    }
    
    const reviewCountElement = document.getElementById('reviewCount');
    if (reviewCountElement) {
      reviewCountElement.addEventListener('input', () => this.updateProgressDisplay());
    }
  }

  /**
   * Setup message listeners for background script communication
   * @private
   */
  setupMessageListeners() {
    // Listen for messages from background script
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleBackgroundMessage(message, sender, sendResponse);
      });
    }
  }

  /**
   * Check for pending URL from context menu
   * @private
   */
  async checkPendingUrl() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get('pendingUrl');
        if (result.pendingUrl) {
          // Set URL and trigger fetch
          document.getElementById('amazonUrl').value = result.pendingUrl;
          await this.handleAmazonFetch();
          
          // Clear pending URL
          await chrome.storage.local.remove('pendingUrl');
        }
      }
    } catch (error) {
      console.warn('Failed to check pending URL:', error);
    }
  }

  /**
   * Setup auto-save functionality
   * @private
   */
  setupAutoSave() {
    // Auto-save every 30 seconds if there are unsaved changes
    setInterval(() => {
      if (this.uiManager.isDirty() && this.bookModel.isComplete()) {
        console.log('💾 Auto-saving data...');
        this.handleSave(true); // Silent save
      }
    }, 30000);
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Handle Amazon data fetch
   */
  async handleAmazonFetch() {
    if (this.state.currentOperation) {
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
      this.state.currentOperation = 'amazonFetch';
      this.uiManager.setButtonLoading('fetchAmazonBtn', true, '🔍 取得中...');
      
      console.log('🌐 Fetching Amazon data for:', amazonUrl);
      
      // Send message to background script
      const response = await this.sendMessageToBackground({
        action: 'fetchAmazonData',
        url: amazonUrl
      });
      
      if (response.success && response.data) {
        // Update model with fetched data
        const updateResult = this.bookModel.updateFromAmazonData(response.data);
        
        if (updateResult.isValid) {
          // Update UI with new data
          this.uiManager.setFormData(this.bookModel.getData());
          this.updateProgressDisplay();
          
          this.uiManager.showSuccess('Amazon書籍データを取得しました');

          // Warn if review count could not be detected
          if (response.data.extraction && response.data.extraction.reviewCountSource === 'none') {
            this.uiManager.showWarning('レビュー数を検出できませんでした。ページ構造の変更の可能性があります。');
          }
          
          // Auto-save after successful fetch
          await this.handleSave(true);
        } else {
          this.uiManager.displayValidationErrors(updateResult.errors);
        }
      } else {
        const errorMsg = response.error || 'Amazon書籍データの取得に失敗しました';
        this.uiManager.showError(errorMsg);
      }
      
    } catch (error) {
      console.error('Amazon fetch failed:', error);
      this.uiManager.showError('Amazon書籍データの取得中にエラーが発生しました');
    } finally {
      this.state.currentOperation = null;
      this.uiManager.setButtonLoading('fetchAmazonBtn', false);
    }
  }

  /**
   * Handle save operation
   * @param {boolean} silent - Whether to show user feedback
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
        this.state.lastSaveTime = Date.now();
        this.uiManager.setDirty(false);
        
        if (!silent) {
          this.uiManager.showSuccess('データを保存しました');
        }
        
        console.log('💾 Data saved successfully');
        return true;
      } else {
        if (!silent) {
          this.uiManager.showError('データの保存に失敗しました');
        }
        return false;
      }
      
    } catch (error) {
      console.error('Save failed:', error);
      if (!silent) {
        this.uiManager.showError('保存中にエラーが発生しました');
      }
      return false;
    }
  }

  /**
   * Handle share to X operation
   */
  async handleShareToX() {
    if (this.state.currentOperation) {
      this.uiManager.showInfo('他の操作が実行中です。しばらくお待ちください。');
      return;
    }
    
    try {
      // Validate data first
      const formData = this.uiManager.getFormData();
      const validationResult = this.bookModel.setData(formData, true);
      
      if (!validationResult.isValid) {
        this.uiManager.displayValidationErrors(validationResult.errors);
        return;
      }
      
      if (!this.bookModel.isComplete()) {
        this.uiManager.showError('タイトル、著者名、レビュー数は必須です');
        return;
      }
      
      this.state.currentOperation = 'shareToX';
      this.uiManager.setButtonLoading('shareToXBtn', true, '🐦 投稿準備中...');
      
      // Generate tweet text
      const tweetText = this.bookModel.generateTweetText();
      console.log('🐦 Generated tweet text:', tweetText);
      
      // Create X compose URL
      // Use compose endpoint for better media attach support (origin/main behavior)
      const tweetUrl = `https://x.com/compose/tweet?text=${encodeURIComponent(tweetText)}`;
      
      // Send message to background script for X share with image
      const response = await this.sendMessageToBackground({
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
      console.error('Share to X failed:', error);
      this.uiManager.showError('X投稿中にエラーが発生しました');
    } finally {
      this.state.currentOperation = null;
      this.uiManager.setButtonLoading('shareToXBtn', false);
    }
  }

  /**
   * Handle image export operation
   */
  async handleImageExport() {
    if (this.state.currentOperation) {
      this.uiManager.showInfo('他の操作が実行中です。しばらくお待ちください。');
      return;
    }
    
    try {
      // Validate data first
      const formData = this.uiManager.getFormData();
      const validationResult = this.bookModel.setData(formData, true);
      
      if (!validationResult.isValid) {
        this.uiManager.displayValidationErrors(validationResult.errors);
        return;
      }
      
      if (!this.bookModel.isComplete()) {
        this.uiManager.showError('タイトル、著者名、レビュー数は必須です');
        return;
      }
      
      this.state.currentOperation = 'imageExport';
      this.uiManager.setButtonLoading('exportBtn', true, '🖼️ 画像生成中...');
      
      // Send message to background script
      const response = await this.sendMessageToBackground({
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
      console.error('Image export failed:', error);
      this.uiManager.showError('画像エクスポート中にエラーが発生しました');
    } finally {
      this.state.currentOperation = null;
      this.uiManager.setButtonLoading('exportBtn', false);
    }
  }

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
      console.log('🧹 Data cleared');
      
    } catch (error) {
      console.error('Clear failed:', error);
      this.uiManager.showError('クリア中にエラーが発生しました');
    }
  }

  /**
   * Handle form changes
   * @private
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
   * Handle messages from background script
   * @private
   * @param {Object} message - Message object
   * @param {Object} sender - Sender information
   * @param {Function} sendResponse - Response callback
   */
  handleBackgroundMessage(message, sender, sendResponse) {
    console.log('📨 Received message from background:', message);
    
    switch (message.action) {
      case 'imageGenerated':
        // Popup also receives broadcast from image-generator without success flag.
        // Only handle messages that explicitly carry a success boolean from background.
        if (typeof message.success === 'boolean') {
          this.handleImageGeneratedMessage(message);
        } else {
          // Ignore raw image data notifications intended for background
          sendResponse?.({ received: true, ignored: true });
          return;
        }
        break;
      case 'shareCompleted':
        this.handleShareCompletedMessage(message);
        break;
      case 'error':
        this.uiManager.showError(message.error || 'エラーが発生しました');
        break;
      default:
        // Silently ignore messages not intended for popup (e.g., CS pings)
        const ignoreActions = new Set(['xTweetPageReady', 'krmPing', 'attachImageDataUrl']);
        if (ignoreActions.has(message?.action)) {
          sendResponse?.({ received: true, ignored: true });
          return;
        }
        console.debug('Ignoring unrelated message action:', message?.action);
    }
    
    sendResponse({ received: true });
  }

  /**
   * Handle image generated message
   * @private
   * @param {Object} message - Message with image data
   */
  handleImageGeneratedMessage(message) {
    if (message.success) {
      this.uiManager.showSuccess('画像を生成しました');
    } else {
      this.uiManager.showError(message.error || '画像生成に失敗しました');
    }
  }

  /**
   * Handle share completed message
   * @private
   * @param {Object} message - Message with share result
   */
  handleShareCompletedMessage(message) {
    if (message.success) {
      this.uiManager.showSuccess('投稿が完了しました');
    } else {
      this.uiManager.showError(message.error || '投稿に失敗しました');
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Update progress display
   * @private
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

  /**
   * Send message to background script
   * @private
   * @param {Object} message - Message to send
   * @returns {Promise<Object>} Response from background script
   */
  async sendMessageToBackground(message) {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        reject(new Error('Chrome runtime not available'));
        return;
      }
      
      const timeout = setTimeout(() => {
        reject(new Error('Background script communication timeout'));
      }, 30000); // 30 second timeout
      
      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        resolve(response || {});
      });
    });
  }

  /**
   * Get controller state
   * @returns {Object} Current controller state
   */
  getState() {
    return {
      ...this.state,
      bookData: this.bookModel.getSummary(),
      uiState: this.uiManager.getState()
    };
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

  /**
   * Cleanup before popup closes
   */
  cleanup() {
    console.log('🧹 PopupController cleanup');
    
    // Auto-save if there are unsaved changes
    if (this.uiManager.isDirty() && this.bookModel.isComplete()) {
      this.handleSave(true);
    }
    
    // Clear any pending operations
    this.state.currentOperation = null;
  }

  /**
   * Refresh controller state
   */
  async refresh() {
    console.log('🔄 Refreshing PopupController');
    
    try {
      // Reload data from storage
      await this.loadSavedData();
      
      // Update progress display
      this.updateProgressDisplay();
      
      // Clear dirty state
      this.uiManager.setDirty(false);
      
      this.uiManager.showInfo('データを再読み込みしました');
    } catch (error) {
      console.error('Refresh failed:', error);
      this.uiManager.showError('再読み込み中にエラーが発生しました');
    }
  }
}

// Handle popup window unload
window.addEventListener('beforeunload', () => {
  if (window.popupController) {
    window.popupController.cleanup();
  }
});
