/**
 * State Management Service
 * 
 * Extracted from PopupController.js for better separation of concerns
 * 
 * Responsibilities:
 * - Manage controller state and lifecycle
 * - Handle operation state tracking and coordination
 * - Provide auto-save functionality and timing management
 * - Manage initialization and cleanup processes
 * - Track application state changes and persistence
 * 
 * This service focuses exclusively on state management operations,
 * making state handling more reliable and easier to test.
 */

export default class StateManager {
  constructor(actionHandler) {
    this.actionHandler = actionHandler;
    
    // Controller state
    this.state = {
      isInitialized: false,
      currentOperation: null,
      lastSaveTime: null,
      autoSaveInterval: null,
      startTime: Date.now()
    };
  }

  /**
   * Initialize state manager and setup auto-save
   */
  initialize() {
    this.setupAutoSave();
    this.state.isInitialized = true;
    
    console.log('StateManager: Initialized successfully');
  }

  // ============================================================================
  // OPERATION STATE MANAGEMENT
  // ============================================================================

  /**
   * Start an operation and set current operation state
   * @param {string} operationType - Type of operation (amazonFetch, save, shareToX, etc.)
   */
  startOperation(operationType) {
    if (this.state.currentOperation) {
      console.warn(`StateManager: Starting new operation '${operationType}' while '${this.state.currentOperation}' is in progress`);
    }
    
    this.state.currentOperation = operationType;
    console.log(`StateManager: Started operation: ${operationType}`);
  }

  /**
   * End current operation
   */
  endOperation() {
    const previousOperation = this.state.currentOperation;
    this.state.currentOperation = null;
    
    if (previousOperation) {
      console.log(`StateManager: Ended operation: ${previousOperation}`);
    }
  }

  /**
   * Check if any operation is currently in progress
   * @returns {boolean} True if operation is in progress
   */
  isOperationInProgress() {
    return this.state.currentOperation !== null;
  }

  /**
   * Get current operation type
   * @returns {string|null} Current operation type or null
   */
  getCurrentOperation() {
    return this.state.currentOperation;
  }

  /**
   * Force end operation (emergency stop)
   * @param {string} reason - Reason for force ending
   */
  forceEndOperation(reason = 'Unknown') {
    const previousOperation = this.state.currentOperation;
    this.state.currentOperation = null;
    
    console.warn(`StateManager: Force ended operation '${previousOperation}' - Reason: ${reason}`);
  }

  // ============================================================================
  // AUTO-SAVE MANAGEMENT
  // ============================================================================

  /**
   * Setup auto-save functionality
   * @private
   */
  setupAutoSave() {
    // Clear existing interval if any
    if (this.state.autoSaveInterval) {
      clearInterval(this.state.autoSaveInterval);
    }
    
    // Auto-save every 30 seconds if there are unsaved changes
    this.state.autoSaveInterval = setInterval(() => {
      this.performAutoSave();
    }, 30000);
    
    console.log('StateManager: Auto-save setup complete (30 second interval)');
  }

  /**
   * Perform auto-save if conditions are met
   * @private
   */
  async performAutoSave() {
    try {
      // Get current states from action handler
      const actionState = this.actionHandler.getState();
      
      if (actionState.hasUnsavedChanges && 
          actionState.isDataComplete && 
          !this.isOperationInProgress()) {
        
        console.log('StateManager: Auto-saving data...');
        await this.actionHandler.handleSave(true); // Silent save
      }
    } catch (error) {
      console.error('StateManager: Auto-save failed:', error);
    }
  }

  /**
   * Record successful save time
   */
  recordSaveTime() {
    this.state.lastSaveTime = Date.now();
    console.log('StateManager: Save time recorded');
  }

  /**
   * Get last save time
   * @returns {number|null} Last save timestamp or null
   */
  getLastSaveTime() {
    return this.state.lastSaveTime;
  }

  /**
   * Get time since last save in minutes
   * @returns {number} Minutes since last save
   */
  getTimeSinceLastSave() {
    if (!this.state.lastSaveTime) {
      return Infinity;
    }
    
    return Math.floor((Date.now() - this.state.lastSaveTime) / 1000 / 60);
  }

  /**
   * Disable auto-save
   */
  disableAutoSave() {
    if (this.state.autoSaveInterval) {
      clearInterval(this.state.autoSaveInterval);
      this.state.autoSaveInterval = null;
      console.log('StateManager: Auto-save disabled');
    }
  }

  /**
   * Enable auto-save with custom interval
   * @param {number} intervalMs - Auto-save interval in milliseconds
   */
  enableAutoSave(intervalMs = 30000) {
    this.disableAutoSave(); // Clear existing interval
    
    this.state.autoSaveInterval = setInterval(() => {
      this.performAutoSave();
    }, intervalMs);
    
    console.log(`StateManager: Auto-save enabled with ${intervalMs}ms interval`);
  }

  // ============================================================================
  // LIFECYCLE MANAGEMENT
  // ============================================================================

  /**
   * Handle application initialization
   */
  async handleInitialization() {
    try {
      console.log('StateManager: Handling initialization');
      
      // Initialize auto-save
      this.initialize();
      
      // Delegate actual initialization work to action handler
      await this.actionHandler.handleInitialization();
      
      this.state.isInitialized = true;
      console.log('StateManager: Application initialized successfully');
      
    } catch (error) {
      console.error('StateManager: Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Handle application cleanup
   */
  handleCleanup() {
    console.log('StateManager: Handling cleanup');
    
    try {
      // Disable auto-save
      this.disableAutoSave();
      
      // End any current operation
      this.endOperation();
      
      // Delegate cleanup to action handler
      this.actionHandler.handleCleanup();
      
      console.log('StateManager: Cleanup completed');
    } catch (error) {
      console.error('StateManager: Cleanup failed:', error);
    }
  }

  /**
   * Check if application is initialized
   * @returns {boolean} True if initialized
   */
  isInitialized() {
    return this.state.isInitialized;
  }

  /**
   * Get application uptime in seconds
   * @returns {number} Uptime in seconds
   */
  getUptime() {
    return Math.floor((Date.now() - this.state.startTime) / 1000);
  }

  // ============================================================================
  // STATE PERSISTENCE
  // ============================================================================

  /**
   * Get current state snapshot
   * @returns {Object} Complete state information
   */
  getStateSnapshot() {
    return {
      controller: {
        isInitialized: this.state.isInitialized,
        currentOperation: this.state.currentOperation,
        lastSaveTime: this.state.lastSaveTime,
        uptime: this.getUptime(),
        timeSinceLastSave: this.getTimeSinceLastSave(),
        autoSaveEnabled: this.state.autoSaveInterval !== null
      },
      action: this.actionHandler.getState(),
      timestamp: Date.now()
    };
  }

  /**
   * Validate state consistency
   * @returns {Object} Validation result with issues
   */
  validateState() {
    const issues = [];
    
    // Check for stale operations (longer than 5 minutes)
    if (this.state.currentOperation) {
      const operationDuration = Date.now() - (this.state.operationStartTime || Date.now());
      if (operationDuration > 5 * 60 * 1000) {
        issues.push(`Operation '${this.state.currentOperation}' has been running for over 5 minutes`);
      }
    }
    
    // Check auto-save functionality
    if (!this.state.autoSaveInterval) {
      issues.push('Auto-save is disabled');
    }
    
    // Check initialization state
    if (!this.state.isInitialized) {
      issues.push('Application is not properly initialized');
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }

  // ============================================================================
  // DEBUG AND MONITORING
  // ============================================================================

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    return {
      uptime: this.getUptime(),
      timeSinceLastSave: this.getTimeSinceLastSave(),
      currentOperation: this.state.currentOperation,
      autoSaveInterval: this.state.autoSaveInterval ? 30 : 0,
      memoryUsage: this.getMemoryUsage(),
      stateValidation: this.validateState()
    };
  }

  /**
   * Get approximate memory usage
   * @private
   * @returns {Object} Memory usage information
   */
  getMemoryUsage() {
    if (performance.memory) {
      return {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
      };
    }
    
    return { available: false };
  }

  /**
   * Log current state for debugging
   */
  logState() {
    console.group('StateManager State');
    console.log('State:', this.state);
    console.log('Performance:', this.getPerformanceMetrics());
    console.log('Snapshot:', this.getStateSnapshot());
    console.groupEnd();
  }

  /**
   * Reset state to initial values
   */
  reset() {
    console.log('StateManager: Resetting state');
    
    // Cleanup first
    this.handleCleanup();
    
    // Reset state
    this.state = {
      isInitialized: false,
      currentOperation: null,
      lastSaveTime: null,
      autoSaveInterval: null,
      startTime: Date.now()
    };
    
    console.log('StateManager: State reset completed');
  }

  // ============================================================================
  // EVENT HANDLING
  // ============================================================================

  /**
   * Handle visibility change (tab focus/blur)
   * @param {boolean} isVisible - Whether tab is visible
   */
  handleVisibilityChange(isVisible) {
    if (isVisible) {
      console.log('StateManager: Tab became visible');
      
      // Resume auto-save if it was paused
      if (!this.state.autoSaveInterval) {
        this.setupAutoSave();
      }
    } else {
      console.log('StateManager: Tab became hidden');
      
      // Optionally pause auto-save when hidden
      // this.disableAutoSave();
    }
  }

  /**
   * Handle page unload
   */
  handlePageUnload() {
    console.log('StateManager: Page unloading');
    this.handleCleanup();
  }

  /**
   * Handle error states
   * @param {Error} error - Error that occurred
   * @param {string} context - Context where error occurred
   */
  handleError(error, context = 'Unknown') {
    console.error(`StateManager: Error in ${context}:`, error);
    
    // End current operation if error is severe
    if (this.state.currentOperation) {
      this.forceEndOperation(`Error in ${context}: ${error.message}`);
    }
    
    // Log state for debugging
    this.logState();
  }
}