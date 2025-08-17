/**
 * PopupController - Main Popup Controller (Refactored)
 * 
 * Refactored Responsibilities:
 * - Coordinate specialized managers and services
 * - Initialize and manage application lifecycle
 * - Provide unified interface for popup operations
 * - Delegate operations to appropriate specialized services
 * 
 * Delegation to Specialized Services:
 * - EventHandlerManager: UI event binding and management
 * - MessageHandler: Background script communication
 * - ActionHandler: Business logic for all operations
 * - StateManager: Application state and lifecycle management
 * 
 * Architecture Benefits:
 * - Single Responsibility Principle adherence
 * - Better testability through focused services
 * - Easier maintenance and debugging
 * - Improved code reusability and modularity
 */

import BookDataModel from '../models/BookDataModel.js';
import UIManager from '../views/UIManager.js';
import EventHandlerManager from './EventHandlerManager.js';
import MessageHandler from './MessageHandler.js';
import ActionHandler from './ActionHandler.js';
import StateManager from './StateManager.js';

export default class PopupController {
  constructor(storageService, toastService) {
    this.storageService = storageService;
    this.toastService = toastService;
    
    // Initialize Model and View
    this.bookModel = new BookDataModel(storageService);
    this.uiManager = new UIManager(toastService);
    
    // Initialize specialized services
    this.messageHandler = new MessageHandler(this.uiManager);
    this.actionHandler = new ActionHandler(this.bookModel, this.uiManager, this.messageHandler, null);
    this.stateManager = new StateManager(this.actionHandler);
    this.eventHandlerManager = new EventHandlerManager(this.actionHandler, this.uiManager.elements);
    
    // Link action handler to state manager (circular dependency resolution)
    this.actionHandler.stateManager = this.stateManager;
    
    // Initialize controller
    this.init();
  }
  /**
   * Notes:
   * - Core coordination layer: delegates to specialized managers
   * - Maintains backward compatibility through delegation methods
   * - Single point of initialization for all popup management
   */

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the popup controller and all specialized services
   */
  async init() {
    try {
      console.log('🎮 PopupController initializing...');
      
      // Initialize all specialized services
      this.messageHandler.initialize();
      this.eventHandlerManager.setupEventListeners();
      
      // Handle initialization through state manager
      await this.stateManager.handleInitialization();
      
      console.log('✅ PopupController initialized successfully with specialized services');
      
    } catch (error) {
      console.error('❌ PopupController initialization failed:', error);
      this.uiManager.showError('アプリケーションの初期化に失敗しました');
    }
  }

  // All initialization methods are now handled by specialized services
  // This maintains a clean separation of concerns

  // ============================================================================
  // DELEGATION TO SPECIALIZED HANDLERS
  // ============================================================================

  /**
   * Handle Amazon data fetch (delegated to ActionHandler)
   */
  async handleAmazonFetch() {
    return this.actionHandler.handleAmazonFetch();
  }

  /**
   * Handle save operation (delegated to ActionHandler)
   * @param {boolean} silent - Whether to show user feedback
   */
  async handleSave(silent = false) {
    return this.actionHandler.handleSave(silent);
  }

  /**
   * Handle share to X operation (delegated to ActionHandler)
   */
  async handleShareToX() {
    return this.actionHandler.handleShareToX();
  }

  /**
   * Handle image export operation (delegated to ActionHandler)
   */
  async handleImageExport() {
    return this.actionHandler.handleImageExport();
  }

  /**
   * Handle clear operation (delegated to ActionHandler)
   */
  async handleClear() {
    return this.actionHandler.handleClear();
  }

  /**
   * Handle form changes (delegated to ActionHandler)
   */
  handleFormChange() {
    return this.actionHandler.handleFormChange();
  }

  // ============================================================================
  // UTILITY METHODS (Delegated to ActionHandler)
  // ============================================================================

  /**
   * Update progress display (delegated to ActionHandler)
   */
  updateProgressDisplay() {
    return this.actionHandler.updateProgressDisplay();
  }

  /**
   * Send message to background script (delegated to MessageHandler)
   * @param {Object} message - Message to send
   * @returns {Promise<Object>} Response from background script
   */
  async sendMessageToBackground(message) {
    return this.messageHandler.sendMessageToBackground(message);
  }

  /**
   * Get controller state (delegated to StateManager)
   * @returns {Object} Current controller state
   */
  getState() {
    return this.stateManager.getStateSnapshot();
  }

  // ============================================================================
  // LIFECYCLE METHODS (Delegated to StateManager)
  // ============================================================================

  /**
   * Cleanup before popup closes (delegated to StateManager)
   */
  cleanup() {
    console.log('🧹 PopupController cleanup');
    
    // Cleanup all specialized services
    this.eventHandlerManager.removeAllEventListeners();
    this.messageHandler.cleanup();
    this.stateManager.handleCleanup();
  }

  /**
   * Refresh controller state (delegated to ActionHandler)
   */
  async refresh() {
    console.log('🔄 Refreshing PopupController');
    return this.actionHandler.refresh();
  }
}

// Handle popup window unload
window.addEventListener('beforeunload', () => {
  if (window.popupController) {
    window.popupController.cleanup();
  }
});
