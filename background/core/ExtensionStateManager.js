/**
 * ExtensionStateManager - Centralized State Management
 * 
 * Responsibilities:
 * - Manage global extension state (pendingXShare, etc.)
 * - Provide thread-safe state operations
 * - Track tab-specific operations and data
 * - Handle state cleanup and memory management
 * - Enable state debugging and monitoring
 */

class ExtensionStateManager {
  constructor() {
    this.state = {
      // X/Twitter sharing operations
      pendingXShares: new Map(), // tabId -> shareData
      
      // Image generation operations  
      pendingImageGenerations: new Map(), // tabId -> generationData
      
      // Amazon data fetch operations
      pendingAmazonFetches: new Map(), // requestId -> fetchData
      
      // Active tabs tracking
      activeTabs: new Set(),
      
      // Extension lifecycle
      extensionStartTime: Date.now(),
      lastActivity: Date.now()
    };

    this.listeners = new Map(); // event -> [callbacks]
    this.cleanupInterval = null;
    this.initialized = false;
  }

  /**
   * Initialize the state manager
   */
  initialize() {
    if (this.initialized) {
      console.warn('ExtensionStateManager already initialized');
      return;
    }

    // Start periodic cleanup
    this.startCleanupTimer();
    
    // Listen for tab events
    this.setupTabListeners();
    
    this.initialized = true;
    console.log('ExtensionStateManager initialized successfully');
  }

  /**
   * Setup Chrome tab event listeners for cleanup
   */
  setupTabListeners() {
    if (chrome.tabs?.onRemoved) {
      chrome.tabs.onRemoved.addListener((tabId) => {
        this.cleanupTabData(tabId);
      });
    }

    if (chrome.tabs?.onUpdated) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === 'loading') {
          // Tab is navigating, cleanup old state
          this.cleanupTabData(tabId);
        }
      });
    }
  }

  // ============================================================================
  // X/TWITTER SHARING STATE
  // ============================================================================

  /**
   * Set pending X share data for a tab
   * @param {number} tweetTabId - The X/Twitter tab ID
   * @param {Object} shareData - The sharing data
   */
  setPendingXShare(tweetTabId, shareData = {}) {
    const data = {
      tweetTabId,
      createdAt: Date.now(),
      imageSent: false,
      ...shareData
    };

    this.state.pendingXShares.set(tweetTabId, data);
    this.updateLastActivity();
    this.emit('xShareCreated', { tweetTabId, data });

    console.log('📝 Set pending X share:', { tweetTabId, dataKeys: Object.keys(data) });
    return data;
  }

  /**
   * Get pending X share data for a tab
   * @param {number} tweetTabId - The X/Twitter tab ID
   * @returns {Object|null} Share data or null
   */
  getPendingXShare(tweetTabId) {
    return this.state.pendingXShares.get(tweetTabId) || null;
  }

  /**
   * Update pending X share data
   * @param {number} tweetTabId - The X/Twitter tab ID  
   * @param {Object} updates - Updates to apply
   */
  updatePendingXShare(tweetTabId, updates) {
    const existing = this.state.pendingXShares.get(tweetTabId);
    if (!existing) {
      console.warn('Cannot update non-existent X share:', tweetTabId);
      return null;
    }

    const updated = { ...existing, ...updates };
    this.state.pendingXShares.set(tweetTabId, updated);
    this.updateLastActivity();
    this.emit('xShareUpdated', { tweetTabId, updates, data: updated });

    console.log('📝 Updated pending X share:', { tweetTabId, updates });
    return updated;
  }

  /**
   * Clear pending X share data
   * @param {number} tweetTabId - The X/Twitter tab ID
   */
  clearPendingXShare(tweetTabId) {
    const existed = this.state.pendingXShares.delete(tweetTabId);
    if (existed) {
      this.emit('xShareCleared', { tweetTabId });
      console.log('🗑️ Cleared pending X share:', tweetTabId);
    }
    return existed;
  }

  /**
   * Get all pending X shares
   * @returns {Map} All pending shares
   */
  getAllPendingXShares() {
    return new Map(this.state.pendingXShares);
  }

  // ============================================================================
  // IMAGE GENERATION STATE
  // ============================================================================

  /**
   * Set pending image generation data
   * @param {number} imageTabId - The image generation tab ID
   * @param {Object} generationData - The generation data
   */
  setPendingImageGeneration(imageTabId, generationData = {}) {
    const data = {
      imageTabId,
      createdAt: Date.now(),
      completed: false,
      ...generationData
    };

    this.state.pendingImageGenerations.set(imageTabId, data);
    this.updateLastActivity();
    this.emit('imageGenerationCreated', { imageTabId, data });

    return data;
  }

  /**
   * Get pending image generation data
   * @param {number} imageTabId - The image generation tab ID
   */
  getPendingImageGeneration(imageTabId) {
    return this.state.pendingImageGenerations.get(imageTabId) || null;
  }

  /**
   * Clear pending image generation data
   * @param {number} imageTabId - The image generation tab ID
   */
  clearPendingImageGeneration(imageTabId) {
    const existed = this.state.pendingImageGenerations.delete(imageTabId);
    if (existed) {
      this.emit('imageGenerationCleared', { imageTabId });
    }
    return existed;
  }

  // ============================================================================
  // AMAZON FETCH STATE
  // ============================================================================

  /**
   * Set pending Amazon fetch data
   * @param {string} requestId - Unique request ID
   * @param {Object} fetchData - The fetch data
   */
  setPendingAmazonFetch(requestId, fetchData = {}) {
    const data = {
      requestId,
      createdAt: Date.now(),
      completed: false,
      ...fetchData
    };

    this.state.pendingAmazonFetches.set(requestId, data);
    this.updateLastActivity();
    return data;
  }

  /**
   * Get pending Amazon fetch data
   * @param {string} requestId - The request ID
   */
  getPendingAmazonFetch(requestId) {
    return this.state.pendingAmazonFetches.get(requestId) || null;
  }

  /**
   * Clear pending Amazon fetch data
   * @param {string} requestId - The request ID
   */
  clearPendingAmazonFetch(requestId) {
    return this.state.pendingAmazonFetches.delete(requestId);
  }

  // ============================================================================
  // TAB MANAGEMENT
  // ============================================================================

  /**
   * Register an active tab
   * @param {number} tabId - Tab ID to register
   */
  registerActiveTab(tabId) {
    this.state.activeTabs.add(tabId);
    this.updateLastActivity();
  }

  /**
   * Unregister an active tab  
   * @param {number} tabId - Tab ID to unregister
   */
  unregisterActiveTab(tabId) {
    this.state.activeTabs.delete(tabId);
  }

  /**
   * Cleanup all data for a specific tab
   * @param {number} tabId - Tab ID to cleanup
   */
  cleanupTabData(tabId) {
    let cleaned = false;

    // Clear X shares
    if (this.state.pendingXShares.delete(tabId)) {
      cleaned = true;
    }

    // Clear image generations
    if (this.state.pendingImageGenerations.delete(tabId)) {
      cleaned = true;
    }

    // Unregister from active tabs
    if (this.state.activeTabs.delete(tabId)) {
      cleaned = true;
    }

    if (cleaned) {
      console.log('🧹 Cleaned up data for tab:', tabId);
      this.emit('tabDataCleaned', { tabId });
    }

    return cleaned;
  }

  // ============================================================================
  // UTILITIES & MAINTENANCE
  // ============================================================================

  /**
   * Update last activity timestamp
   */
  updateLastActivity() {
    this.state.lastActivity = Date.now();
  }

  /**
   * Get current state snapshot for debugging
   * @returns {Object} State snapshot
   */
  getStateSnapshot() {
    return {
      pendingXShares: this.state.pendingXShares.size,
      pendingImageGenerations: this.state.pendingImageGenerations.size,
      pendingAmazonFetches: this.state.pendingAmazonFetches.size,
      activeTabs: this.state.activeTabs.size,
      uptime: Date.now() - this.state.extensionStartTime,
      lastActivity: this.state.lastActivity
    };
  }

  /**
   * Start periodic cleanup of stale data
   */
  startCleanupTimer() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Perform cleanup of stale data
   */
  performCleanup() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    let cleaned = 0;

    // Cleanup stale X shares
    for (const [tabId, data] of this.state.pendingXShares) {
      if (now - data.createdAt > maxAge) {
        this.state.pendingXShares.delete(tabId);
        cleaned++;
      }
    }

    // Cleanup stale image generations
    for (const [tabId, data] of this.state.pendingImageGenerations) {
      if (now - data.createdAt > maxAge) {
        this.state.pendingImageGenerations.delete(tabId);
        cleaned++;
      }
    }

    // Cleanup stale Amazon fetches
    for (const [requestId, data] of this.state.pendingAmazonFetches) {
      if (now - data.createdAt > maxAge) {
        this.state.pendingAmazonFetches.delete(requestId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Periodic cleanup removed ${cleaned} stale entries`);
    }
  }

  // ============================================================================
  // EVENT SYSTEM
  // ============================================================================

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to listeners
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in state event listener:', error);
        }
      });
    }
  }

  /**
   * Destroy the state manager
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.state.pendingXShares.clear();
    this.state.pendingImageGenerations.clear();
    this.state.pendingAmazonFetches.clear();
    this.state.activeTabs.clear();
    this.listeners.clear();

    this.initialized = false;
    console.log('ExtensionStateManager destroyed');
  }
}

// Export singleton instance
const extensionStateManager = new ExtensionStateManager();
export default extensionStateManager;